// electron-builder afterPack hook. Restores .next/_ext_modules (renamed by
// assemble-standalone.mjs so the packager would copy it) back to
// .next/node_modules, where the Next standalone server resolves the
// serverExternalPackages.

const fs = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const appDir = path.join(context.appOutDir, "resources", "app");
  const from = path.join(appDir, ".next", "_ext_modules");
  const to = path.join(appDir, ".next", "node_modules");
  if (fs.existsSync(from)) {
    fs.rmSync(to, { recursive: true, force: true });
    fs.renameSync(from, to);
    console.log("  • afterPack: restored .next/node_modules");
  }
};
