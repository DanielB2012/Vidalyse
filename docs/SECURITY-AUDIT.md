# Audit sécurité — Priority 3.5

Portée : upload de fichiers, noms de fichiers, chemins, accès aux vidéos / jobs /
Shorts, routes API, données YouTube, sessions, permissions.

Date : 2026-08-31. Fait à la lecture du code (pas de pentest dynamique).

## Résultat global

Aucune faille d'accès inter-utilisateur trouvée. Toutes les routes qui touchent
une ressource identifiée par un ID vérifient :
1. `auth()` → 401 si pas de session ;
2. que la ressource appartient à `session.user.id` → 404 sinon (pas 403, pour ne
   pas confirmer l'existence).

## Détail par surface

### Sessions / auth
- NextAuth (Auth.js) JWT, provider Google/YouTube uniquement. `middleware`/`proxy.ts`
  protège les routes `(app)`. Scopes OAuth : `youtube.readonly`, `yt-analytics.readonly`,
  `openid email profile` — lecture seule.
- `session.user.id` propagé via le callback `jwt`/`session`. Toutes les routes API
  lisent `session.user.id`, jamais un `userId` fourni par le client.

### Accès aux vidéos (IDOR)
- `GET /api/videos`, `/api/videos/[videoId]`, `/stream`, `/thumbnail` : `findUnique`
  puis `video.userId !== session.user.id` → 404. ✔
- `/stream` et `/thumbnail` lisent `video.storagePath` / `video.thumbnailPath`
  (chemins générés par le serveur, jamais par le client). Support HTTP Range. ✔
- `loadLatestResult(userId, videoId)` (partagé par Shorts / comparaison / pre-publish)
  refait le check d'appartenance → `not_found`. ✔

### Accès aux jobs
- `GET /api/jobs/[jobId]` : `job.userId !== session.user.id` → 404. ✔

### Shorts
- `POST /shorts`, `/shorts/export`, `/shorts/clips`, `DELETE /shorts/clips/[clipId]` :
  vérifient l'appartenance de la vidéo **et** (pour delete) du clip
  (`clip.userId === user && clip.videoId === videoId`). ✔
- `GET /shorts/file?name=` : durci en P3.5 —
  - `path.basename(name) === name` (rejette tout séparateur `/` `\`),
  - regex stricte `^<videoId>_<digits>-<digits>(_v)?\.mp4$`,
  - fichier servi depuis `userUploadDir(session.user.id)/shorts/` uniquement.
  Le nom est **calculé côté serveur** à l'export (`${video.id}_${startMs}-${endMs}...`),
  aucune chaîne utilisateur n'entre dans le chemin. ✔
- `cutClip` reçoit des bornes numériques validées (`Number.isFinite`, `end > start`,
  durée ≤ 3 min). Filtre `subtitles=` référencé par nom nu avec `cwd` = dossier de
  sortie (pas d'échappement de chemin Windows, pas d'injection de filtre : le nom
  est `<base>.srt` généré serveur). ✔

### Upload
- Auth + `session.user.id`. Limites : `MAX_UPLOAD_BYTES` = 1 Go, extension dans
  `ALLOWED_VIDEO_EXTENSIONS`, **validation réelle par `ffprobe`** (un fichier non
  décodable est supprimé, la ligne DB aussi). ✔
- `plannedTitle` / `plannedDescription` tronqués (300 / 5000 caractères).
- Chemin de stockage : `userUploadDir(userId)/<cuid><ext>` — `cuid` généré, `ext`
  dérivé de `path.extname` puis re-checké contre l'allow-list. Pas de traversal.
- ⚠️ **Amélioration possible (non bloquante)** : pas de sniff des magic bytes en
  plus de l'extension. `ffprobe` couvre le cas « fichier non vidéo », mais un
  contrôle `file-type` en amont éviterait d'écrire le fichier avant de le rejeter.

### Modèles locaux
- `/api/local-models/install|uninstall|embeddings` : auth. `install`/`uninstall`
  valident `providerId` contre le catalogue (`getModel`), n'acceptent que
  `mode === "LOCAL"` avec un `runtime` connu. La cible de téléchargement
  (`runtimeModelId`) vient **du catalogue**, jamais du client → pas de
  téléchargement arbitraire. ✔
- Embeddings : id de modèle constant (`Xenova/all-MiniLM-L6-v2`). ✔

### Données YouTube
- Récupérées via l'API officielle avec le token OAuth de l'utilisateur
  (`getAuthorizedYoutubeClient(userId)`). `VideoStatsCache` est clé par
  `userId + youtubeVideoId` ; la comparaison ne récupère les stats que pour les
  vidéos **du corpus de l'utilisateur** (`loadChannelPriors(userId, …)`). ✔
- `report-error` : n'envoie jamais l'email du compte à Discord — identifie par le
  handle YouTube. ✔

### Diagnostics (§1)
- `GET /api/diagnostics` : auth. Le payload ne contient **aucune clé** — seulement
  des statuts (`ok` / `not_configured` / …) et des numéros de version d'outils. ✔

### Fuites d'erreurs
- Les routes renvoient des messages FR lisibles ; les `500` incluent parfois
  `err.message` (première ligne) pour le debug. Pas de stack trace renvoyée au
  client. Acceptable pour un prototype ; à filtrer davantage en production.

## Recommandations (non bloquantes)

1. Sniff `file-type` (magic bytes) avant l'écriture disque à l'upload.
2. Rate-limiting sur `upload`, `analyze`, `shorts/export` (coût CPU/disque).
3. Quotas de stockage par utilisateur (Shorts exportés + uploads s'accumulent ;
   `Video` n'est jamais supprimé automatiquement par choix — §99).
4. En production : ne jamais renvoyer `err.message` brut dans les `500`.
