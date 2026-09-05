# Distribution — installeur Windows (`VidalyseSetup.exe`)

Objectif : un `.exe` que quelqu'un de non technique double-clique. Ça installe
Vidalyse, ça crée un raccourci, et au lancement le serveur démarre en local et
le navigateur par défaut s'ouvre sur `http://localhost:3477`. Zéro prérequis
(Node est embarqué). Mises à jour automatiques via GitHub Releases.

Décisions arrêtées :

| Sujet | Choix |
|---|---|
| Plateformes | **Windows uniquement** pour l'instant (macOS/Linux plus tard si besoin) |
| Emballage | **Electron + electron-builder** (cible NSIS) |
| Fenêtre | **Pas de fenêtre Electron** — icône dans la zone de notification (tray) + ouverture du navigateur système |
| Port | **Fixe : 3477** (contrainte OAuth, voir plus bas) |
| Données | `%APPDATA%\Vidalyse` (DB SQLite + uploads + tmp + modèles) |
| Mise à jour | **Auto** via GitHub Releases (`electron-updater`), vérifiée au démarrage, appliquée au redémarrage |
| Signature de code | **Non signé** pour l'instant → l'utilisateur passe l'écran SmartScreen une fois. Certificat à ajouter plus tard. |
| Modèles locaux (Ollama) | inchangé : l'app propose déjà l'installation d'Ollama + du modèle depuis l'UI |

---

## Architecture au lancement

```
VidalyseSetup.exe  (NSIS, install par-utilisateur sous %LOCALAPPDATA%\Programs\Vidalyse, sans admin)
      │
      ▼
Vidalyse.exe (Electron, main process)
      ├─ définit les variables d'env :
      │     VIDALYSE_DATA_DIR = %APPDATA%\Vidalyse
      │     DATABASE_URL       = file:%APPDATA%\Vidalyse\vidalyse.db
      │     AUTH_URL           = http://localhost:3477
      │     AUTH_TRUST_HOST    = true
      │     PORT               = 3477
      │     (+ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / AUTH_SECRET, voir « Secrets »)
      ├─ 1er lancement : `prisma migrate deploy` (ou `db push`) sur la DB neuve
      ├─ démarre le serveur Next.js standalone : `node .next/standalone/server.js`
      ├─ attend que le port réponde, puis `shell.openExternal('http://localhost:3477')`
      ├─ icône tray : « Ouvrir Vidalyse », « Vérifier les mises à jour », « Quitter »
      └─ à la fermeture : arrête le serveur Node
```

---

## Changements dans le code de l'app

- [x] `src/lib/media/paths.ts` — `STORAGE_ROOT` respecte `VIDALYSE_DATA_DIR`
      (fallback `<cwd>/storage` en dev).
- [x] `src/lib/features.ts` — `SOCIAL_ENABLED` off par défaut (communauté +
      messagerie masquées ; elles ont besoin d'un serveur central).
- [x] `next.config.ts` — `output: "standalone"` + `outputFileTracingIncludes`
      pour `ffmpeg-static` / `ffprobe-static` / binaire yt-dlp / `@img` (sharp).
- [ ] **À vérifier au 1er build** : le tracing embarque bien `onnxruntime-node`
      (.node) et `better-sqlite3` (.node) dans `.next/standalone`.
- [ ] `src/lib/prisma.ts` — lu tel quel depuis l'env ; le main process fournit
      un `DATABASE_URL` absolu → OK, rien à changer a priori.

## Fichiers d'emballage ajoutés

- [x] `electron/main.js` — superviseur : env, migrations, `fork` du serveur
      standalone, attente du port, ouverture navigateur, tray, `electron-updater`.
- [x] `electron/scripts/assemble-standalone.mjs` — copie `.next/static` +
      `public/` dans le standalone, écrit `electron/oauth-credentials.json`.
- [x] `electron-builder.yml` — cible NSIS x64, per-user, `extraResources` (standalone
      + prisma + prisma CLI), `asarUnpack` des `.node`, publish GitHub `danielb2012/Vidalyse`.
- [x] `.github/workflows/release.yml` — build sur tag `v*`, secrets `GOOGLE_CLIENT_ID/SECRET`.
- [x] `package.json` — deps `electron` / `electron-builder` / `electron-updater`,
      scripts `dist` (local) et `release` (CI), `"main": "electron/main.js"`.
- [x] `.gitignore` — `/dist/`, `electron/oauth-credentials.json`.
- [x] `Site/index.html` — bouton « Télécharger pour Windows » → release `latest`.

---

## Le port fixe et Google OAuth

L'app se connecte via Google OAuth (`src/auth.config.ts`, scopes YouTube). Les
URI de redirection Google sont **exactes** — pas de joker de port. Donc :

1. Port figé à **3477** (peu probable d'être pris ; si c'est le cas au
   lancement, le main process affiche une erreur claire).
2. Dans Google Cloud Console → créer un client OAuth **type « Desktop app »** →
   URI de redirection : `http://localhost:3477/api/auth/callback/google`.
3. Écran de consentement en mode **Test** : 100 utilisateurs max (emails ajoutés
   à la main), reconsentement tous les 7 jours. Passer « En production »
   déclenche la vérification Google (scopes YouTube sensibles) — à faire quand
   on ouvre large.

Alternative (plus tard) : rendre la connexion YouTube optionnelle (compte local
sans Google) — supprime la limite des 100 et l'écran OAuth au 1er lancement.

---

## Secrets embarqués

Le `.env` de prod est généré/fourni par le main process au lancement :

| Variable | Source |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | client « Desktop app » — embarqués dans le build (pour un client Desktop, Google ne traite pas le secret comme confidentiel + PKCE) |
| `AUTH_SECRET` | généré au 1er lancement (`crypto.randomBytes(32).toString('base64')`), stocké dans `%APPDATA%\Vidalyse\.env` |
| `GEMINI_API_KEY` | **non** embarqué — chaque utilisateur colle sa clé gratuite dans Paramètres |
| `DISCORD_*` | optionnels, laissés vides |

Ne jamais committer le `.env` réel. Les identifiants Google du build peuvent
vivre dans les **secrets GitHub Actions** et être injectés à la compilation.

---

## Build & release (GitHub Actions)

Workflow `.github/workflows/release.yml`, déclenché sur tag `v*` :

1. runner `windows-latest`
2. `npm ci`
3. `npx prisma generate`
4. `npm run build` (Next standalone)
5. `npx electron-builder --win --publish always`
   - injecte `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` depuis les secrets du repo
   - publie `VidalyseSetup.exe` + `latest.yml` (feed `electron-updater`) sur la Release du tag

Couper une version = `git tag v0.1.0 && git push --tags`.

Le site (`Site/index.html`) : bouton « Commencer » →
`https://github.com/<OWNER>/vidalyse/releases/latest/download/VidalyseSetup.exe`

---

## À faire côté projet (hors code)

1. **Créer le repo GitHub distant** et y pousser le code (actuellement : aucun
   remote, un seul commit). Repo **public** ou releases publiques (obligatoire
   pour que `electron-updater` lise le feed sans token).
2. **Créer le client Google OAuth « Desktop app »** (redirect `http://localhost:3477/...`).
3. Ajouter `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` dans les secrets Actions du repo.
4. Remplir les pages légales `/legal/*` (requis avant d'ouvrir large / vérif Google).
5. (plus tard) Acheter un certificat de signature de code pour supprimer l'écran SmartScreen.

## Étapes d'implémentation restantes

- [ ] `output: "standalone"` + test de tracing des binaires natifs
- [ ] `electron/` : main process (env, lifecycle serveur, tray, ouverture navigateur)
- [ ] `electron/` : intégration `electron-updater`
- [ ] `electron-builder.yml` (cible nsis, `%APPDATA%` pour les données, icône)
- [ ] Migrations Prisma au 1er lancement / après mise à jour
- [ ] `.github/workflows/release.yml`
- [ ] Section « Installer Vidalyse » dans `Site/index.html` + lien release
- [ ] Test bout-en-bout sur une machine Windows vierge (SmartScreen, 1er run, update)
