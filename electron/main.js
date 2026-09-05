// Vidalyse — Electron supervisor for the Windows installer build.
//
// It does NOT show a window. It starts the Next.js standalone server on a
// fixed local port, opens the user's default browser at it, and lives in the
// system tray. See docs/PACKAGING-WINDOWS.md.

"use strict";

const { app, Tray, Menu, shell, dialog, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const http = require("node:http");
const { fork, spawnSync } = require("node:child_process");

const PORT = 3477;
const ORIGIN = `http://localhost:${PORT}`;

// --- paths -----------------------------------------------------------------

const isPackaged = app.isPackaged;
// Two roots when packaged:
//  - __dirname          -> resources/app.asar/electron  (this file + siblings, from `files`)
//  - resourcesRoot/app  -> resources/app                (the standalone server + prisma, from `extraResources`)
// In dev both collapse to the repo.
const resourcesRoot = isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
const standaloneDir = path.join(resourcesRoot, ".next", "standalone");
const serverEntry = path.join(standaloneDir, "server.js");

// All writable data: %APPDATA%\Vidalyse (survives app updates).
const dataDir = path.join(app.getPath("appData"), "Vidalyse");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "vidalyse.db");
const envPath = path.join(dataDir, ".env");

// --- secrets -------------------------------------------------------------

// OAuth client ("Desktop app" type) — baked in at build time by
// electron/scripts/assemble-standalone.mjs from GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET (GitHub Actions secrets). Never committed.
function loadOAuth() {
  // Written by electron/scripts/assemble-standalone.mjs, shipped inside the
  // asar alongside this file.
  const p = path.join(__dirname, "oauth-credentials.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { clientId: "", clientSecret: "" };
  }
}

// AUTH_SECRET: generated once, persisted in %APPDATA%\Vidalyse\.env.
function getOrCreateAuthSecret() {
  try {
    const existing = fs.readFileSync(envPath, "utf8");
    const m = existing.match(/^AUTH_SECRET=(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    /* no file yet */
  }
  const secret = crypto.randomBytes(32).toString("base64");
  fs.appendFileSync(envPath, `AUTH_SECRET=${secret}\n`);
  return secret;
}

// --- child server --------------------------------------------------------

let serverProc = null;
let tray = null;

function childEnv() {
  const oauth = loadOAuth();
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
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

// prisma migrate deploy against the user's DB, using the bundled prisma CLI.
// First launch: creates vidalyse.db from the migration history. After an app
// update with schema changes: applies the new migrations.
function runMigrations(env) {
  const prismaCli = path.join(resourcesRoot, "node_modules", "prisma", "build", "index.js");
  if (!fs.existsSync(prismaCli)) return; // dev / not bundled — skip
  const res = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: resourcesRoot,
    env: { ...env, PRISMA_SCHEMA_PATH: path.join(resourcesRoot, "prisma", "schema.prisma") },
    stdio: "inherit",
  });
  if (res.status !== 0) {
    dialog.showErrorBox(
      "Vidalyse",
      "La préparation de la base de données a échoué. Réessaie, ou signale le problème."
    );
  }
}

function startServer() {
  const env = childEnv();
  runMigrations(env);
  serverProc = fork(serverEntry, [], { cwd: standaloneDir, env, stdio: "inherit" });
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

// --- updates ------------------------------------------------------------

function setupAutoUpdate() {
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return null; // updater not bundled (e.g. `npm run dist`)
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

// --- tray -------------------------------------------------------------

function buildTray(autoUpdater) {
  const iconPath = path.join(__dirname, "tray.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(icon);
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

// --- lifecycle ------------------------------------------------------------

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

  app.on("window-all-closed", (e) => e.preventDefault()); // tray app, no windows
  app.on("before-quit", () => {
    app.isQuitting = true;
    if (serverProc) serverProc.kill();
  });
}
