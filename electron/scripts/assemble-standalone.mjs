// Runs after `next build`. Next's standalone output ships server.js + a traced
// node_modules, but NOT .next/static or public/ — copy those in. Also writes
// the OAuth credentials file that electron/main.js reads at runtime.
//
// Env used (set by GitHub Actions secrets in CI; empty locally is fine for
// `npm run dist` smoke tests):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(standalone)) {
  console.error("[assemble] .next/standalone missing — run `next build` first (output: 'standalone').");
  process.exit(1);
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true });
  console.log(`[assemble] ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copyDir(path.join(root, "public"), path.join(standalone, "public"));

// OAuth credentials — consumed by electron/main.js (loadOAuth()).
const oauthFile = path.join(root, "electron", "oauth-credentials.json");
fs.writeFileSync(
  oauthFile,
  JSON.stringify(
    {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    null,
    2
  )
);
console.log(
  `[assemble] wrote electron/oauth-credentials.json (clientId ${process.env.GOOGLE_CLIENT_ID ? "set" : "EMPTY"})`
);
