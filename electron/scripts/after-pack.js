// electron-builder afterPack hook. Restores .next/_ext_modules (renamed by
// assemble-standalone.mjs so the packager would copy it) back to
// .next/node_modules, where the Next standalone server resolves the
// serverExternalPackages.

const fs = require("node:fs");
const path = require("node:path");

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

module.exports = async function afterPack(context) {
  const appDir = path.join(context.appOutDir, "resources", "app");
  const from = path.join(appDir, ".next", "_ext_modules");
  const to = path.join(appDir, ".next", "node_modules");
  if (!fs.existsSync(from)) return;
  fs.rmSync(to, { recursive: true, force: true });
  for (let i = 0; i < 20; i++) {
    try {
      fs.renameSync(from, to);
      console.log("  • afterPack: restored .next/node_modules");
      return;
    } catch (e) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      sleep(500); // Windows AV / indexer holding a transient handle
    }
  }
  // last resort
  fs.cpSync(from, to, { recursive: true });
  fs.rmSync(from, { recursive: true, force: true });
  console.log("  • afterPack: restored .next/node_modules (via copy)");
};
