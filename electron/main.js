// Vidalyse — Electron supervisor for the Windows installer build.
//
// No window. It starts the Next.js standalone server (on a bundled node.exe)
// at a fixed local port, opens the user's default browser at it, and lives in
// the system tray. See docs/PACKAGING-WINDOWS.md.

"use strict";

const { app, Tray, Menu, shell, dialog, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");

const PORT = 3477;
const ORIGIN = `http://localhost:${PORT}`;

// --- paths ---------------------------------------------------------------

const isPackaged = app.isPackaged;
// Packaged: resources/app is the `dist-app` folder (server.js at its root,
// node.exe, node_modules/, electron/, template.db). Dev: the repo, where the
// server lives under .next/standalone.
const appRoot = isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
const serverDir = isPackaged ? appRoot : path.join(appRoot, ".next", "standalone");
const serverEntry = path.join(serverDir, "server.js");
const nodeExe = isPackaged ? path.join(appRoot, "node.exe") : process.execPath;

const dataDir = path.join(app.getPath("appData"), "Vidalyse");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "vidalyse.db");
const envPath = path.join(dataDir, ".env");

// --- secrets -----------------------------------------------------------

function loadOAuth() {
  for (const p of [
    path.join(appRoot, "electron", "oauth-credentials.json"),
    path.join(__dirname, "oauth-credentials.json"),
  ]) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      /* try next */
    }
  }
  return { clientId: "", clientSecret: "" };
}

function getOrCreateAuthSecret() {
  try {
    const m = fs.readFileSync(envPath, "utf8").match(/^AUTH_SECRET=(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    /* no file yet */
  }
  const secret = crypto.randomBytes(32).toString("base64");
  fs.appendFileSync(envPath, `AUTH_SECRET=${secret}\n`);
  return secret;
}

// --- database --------------------------------------------------------

// First launch: drop in the template DB (full schema, built from schema.prisma
// at package time — see electron/scripts/assemble-standalone.mjs).
function ensureDatabase() {
  if (fs.existsSync(dbPath)) return;
  const tpl = path.join(appRoot, "template.db");
  if (!fs.existsSync(tpl)) {
    dialog.showErrorBox("Vidalyse", "Base de données modèle introuvable dans l'installation.");
    return;
  }
  fs.copyFileSync(tpl, dbPath);
}

// Every launch: fold new tables / columns from a shipped schema upgrade into the
// user's existing DB (additive only — see electron/scripts/db-sync.cjs). Runs on
// the bundled node.exe: the Node-ABI better-sqlite3 build won't load under
// Electron. No-op in dev (schema.sql is only emitted into the package).
function syncDatabaseSchema() {
  const script = path.join(appRoot, "electron", "scripts", "db-sync.cjs");
  const schemaSql = path.join(appRoot, "schema.sql");
  if (!fs.existsSync(dbPath) || !fs.existsSync(script) || !fs.existsSync(schemaSql)) return;
  try {
    const r = spawnSync(nodeExe, [script, dbPath, schemaSql], { cwd: appRoot, stdio: "inherit" });
    if (r.status !== 0) console.error(`[vidalyse] db-sync exited with code ${r.status}`);
  } catch (e) {
    console.error(`[vidalyse] db-sync failed: ${e && e.message}`);
  }
}

// --- server ---------------------------------------------------------

let serverProc = null;
let tray = null;

function childEnv() {
  const oauth = loadOAuth();
  return {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
    VIDALYSE_DATA_DIR: dataDir,
    DATABASE_URL: `file:${dbPath}`,
    AUTH_URL: ORIGIN,
    AUTH_TRUST_HOST: "true",
    AUTH_SECRET: getOrCreateAuthSecret(),
    GOOGLE_CLIENT_ID: oauth.clientId,
    GOOGLE_CLIENT_SECRET: oauth.clientSecret,
  };
}

function startServer() {
  ensureDatabase();
  syncDatabaseSchema();
  serverProc = spawn(nodeExe, [serverEntry], { cwd: serverDir, env: childEnv(), stdio: "inherit" });
  serverProc.on("exit", (code) => {
    if (code && !app.isQuitting) {
      dialog.showErrorBox("Vidalyse", `Le serveur local s'est arrêté (code ${code}).`);
      app.quit();
    }
  });
}

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    const tick = (left) => {
      const req = http.get(`${ORIGIN}/login`, (r) => {
        r.resume();
        resolve();
      });
      req.on("error", () => {
        if (left <= 0) return reject(new Error("timeout"));
        setTimeout(() => tick(left - 1), 500);
      });
    };
    tick(retries);
  });
}

// --- updates ------------------------------------------------------

function setupAutoUpdate() {
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return null;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.on("update-downloaded", () => {
    const res = dialog.showMessageBoxSync({
      type: "info",
      buttons: ["Redémarrer maintenant", "Plus tard"],
      defaultId: 0,
      message: "Une mise à jour de Vidalyse est prête.",
    });
    if (res === 0) {
      app.isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });
  autoUpdater.checkForUpdates().catch(() => {});
  return autoUpdater;
}

// --- tray -------------------------------------------------------

function buildTray(autoUpdater) {
  const iconPath = path.join(__dirname, "tray.png");
  tray = new Tray(
    fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  );
  tray.setToolTip("Vidalyse");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Ouvrir Vidalyse", click: () => shell.openExternal(ORIGIN) },
      {
        label: "Vérifier les mises à jour",
        enabled: Boolean(autoUpdater),
        click: () => autoUpdater && autoUpdater.checkForUpdates().catch(() => {}),
      },
      { type: "separator" },
      {
        label: "Quitter",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => shell.openExternal(ORIGIN));
}

// --- lifecycle --------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => shell.openExternal(ORIGIN));

  app.whenReady().then(async () => {
    startServer();
    const autoUpdater = setupAutoUpdate();
    buildTray(autoUpdater);
    try {
      await waitForServer();
      await shell.openExternal(ORIGIN);
    } catch {
      dialog.showErrorBox("Vidalyse", "Le serveur local n'a pas démarré à temps.");
      app.quit();
    }
  });

  app.on("window-all-closed", (e) => e.preventDefault());
  app.on("before-quit", () => {
    app.isQuitting = true;
    if (serverProc) serverProc.kill();
  });
}
