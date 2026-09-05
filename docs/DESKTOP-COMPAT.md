# Compatibilité future application desktop (§14)

Objectif : ne pas créer de dépendance inutile au navigateur pour les fonctions
qui devront tourner localement dans une future version desktop (Electron/Tauri
ou équivalent).

## État actuel — ces couches sont déjà « desktop-ready »

Tout le traitement lourd est dans des modules Node purs, sans `window` /
`document` / DOM :

| Fonction | Module | Dépendances |
|---|---|---|
| Sonde / extraction / DSP / découpe | `src/lib/media/ffmpeg.ts` | binaires `ffmpeg-static` / `ffprobe-static` embarqués |
| Téléchargement YouTube | `src/lib/youtube/download.ts` | `youtube-dl-exec` (binaire embarqué) |
| Transcription locale | `src/lib/ai/local/whisper-client.ts` | `@huggingface/transformers` (ONNX), cache disque sous `storage/` |
| Embeddings locaux | `src/lib/analysis/semantic.ts` | idem, modèle sur disque |
| Modèles Ollama | `src/lib/ai/local/ollama-client.ts` | HTTP `localhost:11434` |
| Pipeline + analyses | `src/lib/pipeline/*`, `src/lib/analysis/*` | Node + Prisma |
| Base de données | Prisma + SQLite (`dev.db`) | fichier local |
| Fichiers utilisateur | `src/lib/media/paths.ts` → `storage/` sous `process.cwd()` | système de fichiers |

Aucun de ces modules n'importe quoi que ce soit de spécifique au navigateur.
Le `STORAGE_ROOT` est un chemin disque, pas un bucket cloud.

## Ce qui est spécifique au web (à réimplémenter côté desktop)

- Les **formulaires d'upload** (`VideoUploadForm`, `PrePublishUploadForm`) utilisent
  `XMLHttpRequest` + `FormData` — c'est la couche transport HTTP du client web.
  Un client desktop lirait le fichier directement depuis le disque et appellerait
  la même logique serveur (ou l'exécuterait en local).
- Les **routes API Next.js** (`src/app/api/**`) sont le point d'entrée HTTP. La
  logique métier qu'elles appellent (`startAnalysisJob`, `runEnrichedAnalysis`,
  `proposeShorts`, `computeComparisonWithPerf`, `estimatePerformance`, …) est
  découplée et réutilisable telle quelle dans un process local.
- L'**auth** est Google OAuth via NextAuth (web). Un desktop garderait OAuth mais
  avec un flux natif (loopback redirect).
- La **lecture vidéo / ouverture des Shorts** passe par des routes de streaming
  authentifiées ; en desktop on ouvrirait le fichier local directement.

## Règle à conserver

Toute nouvelle fonction « lourde » (traitement média, IA, fichiers) doit vivre
dans `src/lib/**` en module Node pur et être appelée par une route fine. Ne pas
mettre de logique média/IA dans un composant client.
