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

## État : build local fonctionnel ✅

`npm run dist` produit `dist/VidalyseSetup.exe` (~320 Mo). Testé : Electron
démarre → lance le serveur Next → `/login` répond, auth + Prisma (base
`template.db`) OK. Reste : release CI, réduction de taille, icône.

## Architecture au lancement

```
VidalyseSetup.exe  (NSIS, install par-utilisateur, sans admin)
      │
      ▼
Vidalyse.exe (Electron, main process — pas de fenêtre, icône tray)
      ├─ variables d'env pour le serveur :
      │     VIDALYSE_DATA_DIR = %APPDATA%\Vidalyse
      │     DATABASE_URL       = file:%APPDATA%\Vidalyse\vidalyse.db
      │     AUTH_URL / AUTH_TRUST_HOST / PORT=3477
      │     AUTH_SECRET (généré au 1er lancement, persisté dans %APPDATA%\Vidalyse\.env)
      │     GOOGLE_CLIENT_ID / SECRET (depuis electron/oauth-credentials.json, baké au build CI)
      ├─ 1er lancement : copie template.db → %APPDATA%\Vidalyse\vidalyse.db
      │     (base déjà migrée à la compilation ; PAS de Prisma CLI au runtime)
      ├─ spawn du serveur : <resources>/app/node.exe <resources>/app/server.js
      │     (node.exe embarqué = Node réel, natifs déjà à la bonne ABI)
      ├─ attend le port, puis shell.openExternal('http://localhost:3477')
      ├─ tray : Ouvrir / Vérifier les mises à jour / Quitter
      └─ before-quit : tue le process serveur
```

## Assemblage (`electron/scripts/assemble-standalone.mjs`)

Construit `dist-app/` = tout le runtime, que electron-builder empaquète via
`directories.app`. Étapes clés :

- copie `.next/standalone` verbatim, **supprime** ce que le tracer de Next a
  aspiré depuis la racine (`dist/`, `storage/`, `src/`, `dev.db`, `.env`…) ;
- ajoute `.next/static` + `public/` ;
- **`.next/node_modules` → `.next/_ext_modules`** : electron-builder jette tout
  dossier nommé `node_modules` qu'il ne relie pas à une dépendance ;
  `electron/scripts/after-pack.js` le renomme à l'envers dans le paquet ;
- `template.db` : rejoue les `prisma/migrations/*/migration.sql` (SQLite pur) ;
- copie `node.exe` (= `process.execPath` du build) ;
- copie `electron-updater` + tout `@prisma/*` (hors moteurs natifs) — requires
  dynamiques que le tracer rate ;
- `package.json` généré : `main: electron/main.js` + `dependencies` = tout ce
  qui est physiquement présent (sinon electron-builder élague `node_modules`).

## Fichiers

- [x] `electron/main.js` — superviseur (spawn node.exe, port, tray, updater).
- [x] `electron/scripts/assemble-standalone.mjs` — voir ci-dessus.
- [x] `electron/scripts/after-pack.js` — restaure `.next/node_modules`.
- [x] `electron-builder.yml` — `directories.app: dist-app`, `asar: false`,
      `npmRebuild: false`, cible NSIS x64 per-user, `artifactName: VidalyseSetup.exe`,
      publish GitHub `danielb2012/Vidalyse`.
- [x] `.github/workflows/release.yml` — `workflow_dispatch` (build + artefact,
      test sans tag) ou tag `v*` (build + publish Release). Secrets
      `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- [x] `package.json` — deps electron*, scripts `dist` / `release`.
- [x] `index.html` (racine, ex-`Site/`) — bouton → `releases/latest/download/VidalyseSetup.exe`.
- [x] `src/lib/media/paths.ts` — `STORAGE_ROOT` = `VIDALYSE_DATA_DIR`.
- [x] `src/lib/features.ts` — `SOCIAL_ENABLED` off.
- [x] `src/auth.config.ts` — `LOGIN_SCOPES` (identité seule) au sign-in ;
      `YOUTUBE_SCOPES` réservé au flux « connecter une chaîne ».

## Reste à faire

- [ ] Lancer le workflow (`workflow_dispatch`) pour valider le build CI.
- [ ] Tag `v0.1.0` → 1ʳᵉ release publique.
- [ ] Réduire la taille : doublons ffmpeg/ffprobe/better-sqlite3/@prisma entre
      `node_modules/` et `.next/_ext_modules/` (~250 Mo potentiels).
- [ ] `build/icon.ico` (256×256) — icône app/installeur.
- [ ] Migrations sur mise à jour (aujourd'hui : template.db copié au 1er lancement
      seulement ; rejouer les nouveaux `migration.sql` via better-sqlite3).
- [ ] Test sur machine Windows vierge (SmartScreen, 1er run, auto-update).

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
