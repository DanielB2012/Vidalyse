// Runs after `next build`. Assembles a clean `dist-app/` folder that is the
// entire runtime shipped inside the installer (electron-builder copies it
// verbatim via `extraResources`, no glob filter — so node_modules and .next
// survive). Also:
//   - builds template.db by replaying the Prisma migration SQL (plain SQLite),
//     so the packaged app needs no Prisma CLI / engines at runtime
//   - bundles the current node.exe so the Next server runs on real Node with
//     the native modules already built for this ABI (no @electron/rebuild)
//
// Env (GitHub Actions secrets in CI; empty locally is fine for smoke tests):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const std = path.join(root, ".next", "standalone");
const out = path.join(root, "dist-app");

if (!fs.existsSync(path.join(std, "server.js"))) {
  console.error("[assemble] .next/standalone/server.js missing — run `next build` first.");
  process.exit(1);
}

const cp = (from, to) =>
  fs.existsSync(from) && fs.cpSync(from, to, { recursive: true, dereference: true });
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
// blocking sleep (Windows AV holds transient handles on fresh .node/.exe files)
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const mv = (from, to) => {
  for (let i = 0; i < 20; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      if (e.code !== "EPERM" && e.code !== "EBUSY" && e.code !== "EACCES") throw e;
      sleep(500);
    }
  }
  // last resort: copy + remove
  fs.cpSync(from, to, { recursive: true });
  rm(from);
};

// 1. clean slate + the standalone bundle verbatim (server.js, .next/, node_modules/)
rm(out);
fs.cpSync(std, out, { recursive: true });

// 1a. Next puts serverExternalPackages under .next/node_modules/<pkg>-<hash>/.
//     electron-builder silently drops any dir named `node_modules` it can't map
//     to a dependency — rename it now (before AV settles on the fresh .node
//     files) so `files` copies it; after-pack.js renames it back in the package.
const nmHidden = path.join(out, ".next", "node_modules");
if (fs.existsSync(nmHidden)) {
  mv(nmHidden, path.join(out, ".next", "_ext_modules"));
  console.log("[assemble] .next/node_modules -> .next/_ext_modules");
}

// 1b. drop anything Next's tracer swept in from the repo root (do this first so
//     a later failure can't leave a bloated dist-app behind)
for (const j of [
  "dist", "dist-app", "storage", "src", "docs", "Logos", "Site", ".github", ".git",
  "dev.db", "dev.db-journal", ".env", ".env.example", ".env.local", ".gitignore",
  "README.md", "index.html", "logo.png", "favicon.png",
  "next.config.ts", "postcss.config.mjs", "eslint.config.mjs", "electron-builder.yml",
  "tsconfig.json", "tsconfig.tsbuildinfo", "prisma7.config.ts", "package-lock.json",
  ".next/cache",
]) {
  rm(path.join(out, j));
}

// 2. Next omits these from standalone
cp(path.join(root, ".next", "static"), path.join(out, ".next", "static"));
cp(path.join(root, "public"), path.join(out, "public"));

// 3. electron entry + OAuth creds (Desktop-app client, baked at build time)
fs.mkdirSync(path.join(out, "electron"), { recursive: true });
fs.copyFileSync(path.join(root, "electron", "main.js"), path.join(out, "electron", "main.js"));
fs.writeFileSync(
  path.join(out, "electron", "oauth-credentials.json"),
  JSON.stringify(
    { clientId: process.env.GOOGLE_CLIENT_ID ?? "", clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "" },
    null,
    2
  )
);

// 4. prisma schema + migration history (kept for future in-app upgrades)
fs.mkdirSync(path.join(out, "prisma"), { recursive: true });
fs.copyFileSync(path.join(root, "prisma", "schema.prisma"), path.join(out, "prisma", "schema.prisma"));
cp(path.join(root, "prisma", "migrations"), path.join(out, "prisma", "migrations"));

// 5. template.db — replay every migration.sql in order (plain SQLite DDL)
const Database = require("better-sqlite3");
const tpl = path.join(out, "template.db");
rm(tpl);
rm(`${tpl}-journal`);
const db = new Database(tpl);
const migDirs = fs
  .readdirSync(path.join(root, "prisma", "migrations"))
  .filter((d) => /^\d/.test(d))
  .sort();
db.exec(
  `CREATE TABLE "_prisma_migrations" (
     "id" TEXT PRIMARY KEY NOT NULL,
     "checksum" TEXT NOT NULL,
     "finished_at" DATETIME,
     "migration_name" TEXT NOT NULL,
     "logs" TEXT,
     "rolled_back_at" DATETIME,
     "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
     "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
   )`
);
for (const d of migDirs) {
  const sql = fs.readFileSync(path.join(root, "prisma", "migrations", d, "migration.sql"), "utf8");
  db.exec(sql);
  db.prepare(
    `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
     VALUES (?, '', ?, current_timestamp, 1)`
  ).run(d, d);
}
db.close();
console.log(`[assemble] template.db built (${migDirs.length} migrations)`);

// 6. real node.exe → the Next server runs on it (native modules already match)
fs.copyFileSync(process.execPath, path.join(out, "node.exe"));

// 6b. electron-updater is required by the supervisor but isn't traced into the
//     Next bundle — copy it + its dep tree from the (flat) root node_modules.
const rootNm = path.join(root, "node_modules");
const outNm = path.join(out, "node_modules");
const copiedDeps = new Set();
const copyPkgTree = (name) => {
  if (copiedDeps.has(name)) return;
  copiedDeps.add(name);
  const src = path.join(rootNm, name);
  if (!fs.existsSync(src)) return;
  cp(src, path.join(outNm, name));
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8"));
    for (const dep of Object.keys(pj.dependencies ?? {})) copyPkgTree(dep);
  } catch {
    /* ignore */
  }
};
copyPkgTree("electron-updater");

// 6c. Next externalizes these and its static tracer misses their dynamic
//     requires — the packaged server then 500s with "Cannot find module".
//     Copy them + their trees from the (flat) root node_modules.
//     (`next-auth` proved: /api/auth/* → 500; `@prisma/*`: client runtime.)
for (const p of ["next-auth", "@auth/core", "@auth/prisma-adapter", "googleapis"]) copyPkgTree(p);
const rootPrisma = path.join(rootNm, "@prisma");
if (fs.existsSync(rootPrisma)) {
  for (const p of fs.readdirSync(rootPrisma)) {
    if (!["engines", "fetch-engine"].includes(p)) copyPkgTree(`@prisma/${p}`);
  }
}
for (const p of ["engines", "fetch-engine"]) rm(path.join(outNm, "@prisma", p));

// 7. size trim — keep win x64 only. serverExternalPackages land in
//    .next/_ext_modules/<pkg>-<hash>/ (renamed in step 1a), so resolve by prefix.
const extNm = path.join(out, ".next", "_ext_modules");
const extPkg = (prefix) => {
  if (!fs.existsSync(extNm)) return null;
  const d = fs.readdirSync(extNm).find((x) => x.startsWith(prefix));
  return d ? path.join(extNm, d) : null;
};
for (const base of [path.join(out, "node_modules"), extNm]) {
  const ffprobe =
    base === extNm ? extPkg("ffprobe-static-") : path.join(base, "ffprobe-static");
  if (ffprobe && fs.existsSync(ffprobe)) {
    rm(path.join(ffprobe, "bin", "win32", "ia32"));
    rm(path.join(ffprobe, "bin", "linux"));
    rm(path.join(ffprobe, "bin", "darwin"));
  }
  const img = path.join(base, "@img");
  if (fs.existsSync(img)) {
    for (const d of fs.readdirSync(img)) if (!/win32-x64/.test(d)) rm(path.join(img, d));
  }
}
// better-sqlite3 ships prebuilds for every platform; the .node it actually
// loads is under build/Release.
for (const bsq of [path.join(out, "node_modules", "better-sqlite3"), extPkg("better-sqlite3-")]) {
  if (bsq && fs.existsSync(bsq)) {
    rm(path.join(bsq, "prebuilds"));
    rm(path.join(bsq, "deps"));
    rm(path.join(bsq, "src"));
  }
}

// 8. package.json electron-builder reads: point `main` at the supervisor and
//    list everything physically present as a prod dep (with its real version
//    range — electron-builder validates some, e.g. electron-updater) so the
//    packager keeps node_modules.
const outPkgPath = path.join(out, "package.json");
const outPkg = fs.existsSync(outPkgPath) ? JSON.parse(fs.readFileSync(outPkgPath, "utf8")) : {};
const nmDir = path.join(out, "node_modules");
const verOf = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(nmDir, name, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
};
const deps = {};
if (fs.existsSync(nmDir)) {
  for (const d of fs.readdirSync(nmDir)) {
    if (d === ".bin" || d === ".package-lock.json") continue;
    const names = d.startsWith("@")
      ? fs.readdirSync(path.join(nmDir, d)).map((s) => `${d}/${s}`)
      : [d];
    for (const name of names) {
      const v = verOf(name);
      deps[name] = v ? `^${v}` : "*";
    }
  }
}
fs.writeFileSync(
  outPkgPath,
  JSON.stringify(
    {
      ...outPkg,
      name: "vidalyse",
      version: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version,
      description: "Analyse IA de vidéos YouTube",
      author: "Vidalyse",
      private: true,
      main: "electron/main.js",
      dependencies: deps,
      devDependencies: {},
    },
    null,
    2
  )
);

const sizeMB = (p) => {
  let bytes = 0;
  const walk = (x) => {
    const s = fs.statSync(x);
    if (s.isDirectory()) for (const e of fs.readdirSync(x)) walk(path.join(x, e));
    else bytes += s.size;
  };
  walk(p);
  return Math.round(bytes / 1024 / 1024);
};
console.log(
  `[assemble] dist-app ready: ${sizeMB(out)} MB, OAuth clientId ${process.env.GOOGLE_CLIENT_ID ? "set" : "EMPTY"}`
);
