"use strict";

// Additive schema sync for the packaged app's SQLite database.
//
// The installer ships `schema.sql` (the FULL schema, rendered from
// prisma/schema.prisma at build time) and `template.db` (an empty DB with that
// schema). On FIRST launch electron/main.js copies template.db to
// %APPDATA%\Vidalyse\vidalyse.db. On EVERY launch after that — including the
// launch right after an auto-update that carries a newer schema — main.js runs
// this script against the user's DB.
//
// It is run by the bundled node.exe (not the Electron main process): the
// Node-ABI better-sqlite3 build in node_modules only loads there.
//
// It only ADDS — missing tables, missing indexes, missing columns. It never
// drops, renames or rewrites, so user data is untouched. That covers every
// schema change in this project's history (new feature tables, new nullable /
// DEFAULTed columns). A change that needs a rewrite (drop/retype a column,
// backfill) would need a real migration runner; this is not that.
//
//   node db-sync.cjs <db-path> <schema.sql-path>

const fs = require("node:fs");
const Database = require("better-sqlite3");

const [dbPath, schemaPath] = process.argv.slice(2);
if (!dbPath || !fs.existsSync(dbPath) || !schemaPath || !fs.existsSync(schemaPath)) {
  process.exit(0); // nothing to reconcile (first launch just copied the template)
}

// The build renders schema.sql with `prisma migrate diff --script`: one DDL
// statement per block, each terminated by ";" at end of line, blocks prefixed
// with a "-- CreateTable" / "-- CreateIndex" comment line.
const statements = fs
  .readFileSync(schemaPath, "utf8")
  .split(/;[ \t]*\r?\n/)
  .map((block) =>
    block
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim()
  )
  .filter(Boolean);

// Split a CREATE TABLE body into top-level `"col" <type/constraints>` entries,
// honouring nested parens and skipping table-level CONSTRAINT/FOREIGN KEY lines
// (those don't match the `"name" rest` shape).
function columnDefs(body) {
  const parts = [];
  let depth = 0;
  let buf = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts
    .map((p) => p.trim().match(/^"([^"]+)"\s+([\s\S]+)$/))
    .filter(Boolean)
    .map((m) => ({ name: m[1], def: m[2].replace(/\s+/g, " ").trim() }));
}

let db;
try {
  db = new Database(dbPath);
  db.prepare("SELECT 1 FROM sqlite_master LIMIT 1").get();
} catch (e) {
  // Not a usable SQLite file — main.js's ensureDatabase() is responsible for
  // replacing it; nothing to reconcile here. Exit clean, don't dump a trace.
  console.error(`[db-sync] cannot open DB (${e && e.code}); skipped`);
  process.exit(0);
}
const exists = (type, name) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?").get(type, name);
const columnsOf = (table) =>
  new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name));

let applied = 0;
const run = (sql) => {
  try {
    db.exec(sql);
    applied++;
  } catch (e) {
    // One bad statement (e.g. a NOT NULL column with no default added to a
    // populated table) shouldn't abort the rest — log and move on.
    console.error(`[db-sync] skipped: ${e.message}`);
  }
};

db.pragma("foreign_keys = OFF");
for (const stmt of statements) {
  const table = stmt.match(/^CREATE TABLE "([^"]+)"\s*\(([\s\S]+)\)$/);
  const index = stmt.match(/^CREATE (?:UNIQUE )?INDEX "([^"]+)"/);
  if (table) {
    const [, name, body] = table;
    if (!exists("table", name)) {
      run(`${stmt};`);
      continue;
    }
    const present = columnsOf(name);
    for (const { name: col, def } of columnDefs(body)) {
      if (!present.has(col)) run(`ALTER TABLE "${name}" ADD COLUMN "${col}" ${def};`);
    }
  } else if (index && !exists("index", index[1])) {
    run(`${stmt};`);
  }
}
db.pragma("foreign_keys = ON");

if (applied) console.log(`[db-sync] ${applied} additive schema change(s) applied`);
db.close();
