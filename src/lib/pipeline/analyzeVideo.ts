import { prisma } from "@/lib/prisma";
import { resolveModelFor } from "@/lib/ai/providers/registry";
import { isProviderExhausted, decrementProviderBalance } from "@/lib/ai/credits";
import type { ModelTier } from "@/lib/ai/providers/types";
import {
  probeVideo,
  extractAudio,
  extractFrames,
  analyzeAudioDsp,
  planFrameExtraction,
  generateThumbnail,
} from "@/lib/media/ffmpeg";
import { jobTmpDir, removeDirIfExists, userUploadDir, ensureDir } from "@/lib/media/paths";
import { downloadYoutubeVideo } from "@/lib/youtube/download";
import { fetchSingleVideoStats } from "@/lib/youtube/analytics";
import fs from "node:fs/promises";
import { runVision, isVisionRuntimeConfigured } from "@/lib/ai/vision/dispatch";
import { runText, isTextRuntimeConfigured } from "@/lib/ai/text/dispatch";
import { isWhisperModelInstalled, transcribeLocal } from "@/lib/ai/local/whisper-client";
import { resolveAuthoredTranscript, transcriptFromOnScreenText } from "./resolveTranscript";
import { runEnrichedAnalysis } from "@/lib/analysis";
import { crossAnalysisToMarkdown } from "@/lib/analysis/crossAnalysis";
import { loadChannelPriors } from "@/lib/analysis/priors";
import type { MergedAnalysis } from "./types";
import path from "node:path";

// What the public YouTube APIs genuinely never expose — surfaced to the
// cross-analysis so it can't claim to know these (§9).
const YOUTUBE_MISSING = [
  "CTR / taux de clic de la vignette",
  "impressions de la vignette",
  "courbe de rétention seconde par seconde",
];

const MAX_FRAMES_BY_TIER: Record<ModelTier, number> = { LIGHT: 6, MEDIUM: 12, PRO: 24 };

type Stage =
  | "IMPORTED"
  | "TECHNICAL_ANALYSIS"
  | "AUDIO_EXTRACTION"
  | "FRAME_EXTRACTION"
  | "TRANSCRIPTION"
  | "VISION_ANALYSIS"
  | "MERGE"
  | "TEXT_SYNTHESIS"
  | "DONE";

const STAGE_PROGRESS: Record<Stage, number> = {
  IMPORTED: 5,
  TECHNICAL_ANALYSIS: 15,
  AUDIO_EXTRACTION: 25,
  FRAME_EXTRACTION: 40,
  TRANSCRIPTION: 55,
  VISION_ANALYSIS: 75,
  MERGE: 85,
  TEXT_SYNTHESIS: 95,
  DONE: 100,
};

async function setStage(jobId: string, stage: Stage, ref: { current: Stage }) {
  ref.current = stage;
  await prisma.analysisJob.update({
    where: { id: jobId },
    data: { currentStage: stage, progress: STAGE_PROGRESS[stage], status: "RUNNING" },
  });
}

async function log(jobId: string, stage: Stage, status: string, message?: string) {
  await prisma.analysisStageLog.create({ data: { jobId, stage, status, message } });
}

// Runs entirely in-process (no external queue) — this is the honest
// prototype tradeoff: it works as long as the Node process that accepted the
// request stays alive (self-hosted `next start` / `next dev`), and would
// need a real job queue (BullMQ, etc.) for a serverless deployment.
export async function runAnalysisPipeline(jobId: string): Promise<void> {
  const job = await prisma.analysisJob.findUnique({ include: { video: true }, where: { id: jobId } });
  if (!job) return;

  const { video, userId } = job;
  const tmpDir = jobTmpDir(jobId);
  const stageRef: { current: Stage } = { current: "IMPORTED" };
  const merged: MergedAnalysis = {
    video: { durationSec: 0, width: null, height: null, fps: null },
    audioDsp: null,
    transcript: null,
    visionEvents: null,
    youtubeStats: null,
    textSynthesis: null,
    summary: null,
    enriched: null,
  };

  try {
    await setStage(jobId, "IMPORTED", stageRef);

    // ---------- Import: pull the file from YouTube if we don't have it yet ----------
    if (!video.storagePath && video.source === "YOUTUBE_URL" && video.youtubeVideoId) {
      await log(jobId, "IMPORTED", "started", "Téléchargement de la vidéo depuis YouTube…");
      const dir = userUploadDir(userId);
      await ensureDir(dir);
      const dlPath = path.join(dir, `${video.id}.mp4`);
      await downloadYoutubeVideo(video.youtubeVideoId, dlPath);
      video.storagePath = dlPath;

      let thumbnailPath: string | null = null;
      let sizeBytes: number | null = null;
      try {
        sizeBytes = (await fs.stat(dlPath)).size;
        const probe = await probeVideo(dlPath);
        const thumbPath = path.join(dir, `${video.id}-thumb.jpg`);
        await generateThumbnail(dlPath, thumbPath, Math.min(1, probe.durationSec / 2));
        thumbnailPath = thumbPath;
      } catch {
        // thumbnail / size are nice-to-haves — never fail the import over them
      }
      await prisma.video.update({
        where: { id: video.id },
        data: { storagePath: dlPath, thumbnailPath, sizeBytes },
      });
    }

    await log(jobId, "IMPORTED", "done");

    // ---------- Technical analysis (must succeed — everything else depends on it) ----------
    await setStage(jobId, "TECHNICAL_ANALYSIS", stageRef);
    await log(jobId, "TECHNICAL_ANALYSIS", "started");
    if (!video.storagePath) throw new Error("Vidéo sans fichier source.");

    const info = await probeVideo(video.storagePath);
    merged.video = { durationSec: info.durationSec, width: info.width, height: info.height, fps: info.fps };
    await prisma.video.update({
      where: { id: video.id },
      data: {
        durationSec: info.durationSec,
        width: info.width,
        height: info.height,
        fps: info.fps,
      },
    });
    await log(jobId, "TECHNICAL_ANALYSIS", "done", `${info.durationSec.toFixed(1)}s, ${info.width}x${info.height}`);

    // ---------- Audio extraction + DSP (free, local, no credit) ----------
    await setStage(jobId, "AUDIO_EXTRACTION", stageRef);
    await log(jobId, "AUDIO_EXTRACTION", "started");
    let audioPath: string | null = null;
    if (!info.hasAudio) {
      await log(jobId, "AUDIO_EXTRACTION", "skipped", "La vidéo ne contient pas de piste audio.");
    } else {
      try {
        audioPath = await extractAudio(video.storagePath, tmpDir);
        merged.audioDsp = await analyzeAudioDsp(audioPath);
        await log(jobId, "AUDIO_EXTRACTION", "done");
      } catch (err) {
        await log(jobId, "AUDIO_EXTRACTION", "error", String(err instanceof Error ? err.message : err));
      }
    }

    // ---------- Frame extraction ----------
    await setStage(jobId, "FRAME_EXTRACTION", stageRef);
    await log(jobId, "FRAME_EXTRACTION", "started");
    let frames: { path: string; timestampMs: number }[] = [];
    const visionPref = await prisma.modelPreference.findUnique({
      where: { userId_category: { userId, category: "VISION" } },
    });
    const visionModel = resolveModelFor("VISION", visionPref?.providerId);
    const visionProviderId = visionModel.id;
    const visionTier = visionModel.tier;

    try {
      const plan = planFrameExtraction(info.durationSec, MAX_FRAMES_BY_TIER[visionTier]);
      frames = await extractFrames(video.storagePath, path.join(tmpDir, "frames"), plan);
      await log(jobId, "FRAME_EXTRACTION", "done", `${frames.length} frames à ${plan.fps.toFixed(2)} fps`);
    } catch (err) {
      await log(jobId, "FRAME_EXTRACTION", "error", String(err instanceof Error ? err.message : err));
    }

    // ---------- Transcription ----------
    // Priority: the creator's OWN captions (embedded track, or a sidecar .srt
    // fetched from YouTube) — far more reliable than local ASR. Whisper is the
    // fallback only when no authored subtitles exist.
    await setStage(jobId, "TRANSCRIPTION", stageRef);
    await log(jobId, "TRANSCRIPTION", "started");

    const authored = await resolveAuthoredTranscript({
      videoPath: video.storagePath,
      tmpDir,
      isYoutubeDownload: video.source === "YOUTUBE_URL",
    }).catch(() => null);

    if (authored) {
      merged.transcript = authored.segments;
      merged.transcriptSource = authored.source;
      await log(
        jobId,
        "TRANSCRIPTION",
        "done",
        `${authored.segments.length} segments — sous-titres de l'auteur (${
          authored.source === "author_subtitles_embedded" ? "piste intégrée" : "fichier .srt YouTube"
        }), source fiable.`
      );
    } else {
      const transcriptionPref = await prisma.modelPreference.findUnique({
        where: { userId_category: { userId, category: "TRANSCRIPTION" } },
      });
      const transcriptionModel = resolveModelFor("TRANSCRIPTION", transcriptionPref?.providerId);
      if (!audioPath) {
        await log(jobId, "TRANSCRIPTION", "skipped", "Aucun sous-titre d'auteur et pas d'audio extrait.");
      } else if (transcriptionModel.runtime !== "whisper-local" || !transcriptionModel.runtimeModelId) {
        await log(
          jobId,
          "TRANSCRIPTION",
          "skipped",
          "Aucun sous-titre d'auteur trouvé, et aucun moteur de transcription local sélectionné — installe le pack local (il inclut Whisper)."
        );
      } else if (!isWhisperModelInstalled(transcriptionModel.runtimeModelId)) {
        await log(
          jobId,
          "TRANSCRIPTION",
          "skipped",
          `Aucun sous-titre d'auteur, et ${transcriptionModel.label} n'est pas installé — installe le pack local.`
        );
      } else {
        try {
          merged.transcript = await transcribeLocal(audioPath, transcriptionModel.runtimeModelId);
          merged.transcriptSource = "whisper_local";
          await log(
            jobId,
            "TRANSCRIPTION",
            "done",
            `${merged.transcript.length} segments — transcription automatique (${transcriptionModel.label}, local). Fiabilité limitée : aucun sous-titre d'auteur disponible.`
          );
        } catch (err) {
          await log(jobId, "TRANSCRIPTION", "error", String(err instanceof Error ? err.message : err));
        }
      }
    }

    // ---------- Vision ----------
    await setStage(jobId, "VISION_ANALYSIS", stageRef);
    await log(jobId, "VISION_ANALYSIS", "started");
    if (frames.length === 0) {
      await log(
        jobId,
        "VISION_ANALYSIS",
        "skipped",
        "Aucune frame extraite — l'analyse Vision est ignorée. Le reste de l'analyse (audio, parole, structure) continue."
      );
    } else if (!(await isVisionRuntimeConfigured(visionProviderId))) {
      await log(
        jobId,
        "VISION_ANALYSIS",
        "skipped",
        visionModel.mode === "LOCAL"
          ? `Modèle Vision local « ${visionModel.label} » non installé ou Ollama non lancé. Installe-le dans Paramètres → Modèles IA. Vidalyse ne bascule pas sur un autre modèle : l'analyse Vision est ignorée, le reste de l'analyse continue.`
          : `Modèle Vision « ${visionModel.label} » non configuré (clé API Gemini absente). Ajoute ta clé dans Paramètres → IA & Lyra (onglet Simple), ou choisis un modèle Vision local. L'analyse Vision est ignorée, le reste de l'analyse continue.`
      );
    } else if (await isProviderExhausted(userId, visionProviderId)) {
      await log(
        jobId,
        "VISION_ANALYSIS",
        "skipped",
        `Solde ${visionModel.label} épuisé (voir Paramètres → Modèles IA). L'analyse Vision est ignorée, le reste de l'analyse continue.`
      );
    } else {
      try {
        merged.visionEvents = await runVision(visionProviderId, frames);
        await decrementProviderBalance(userId, visionProviderId);
        await log(jobId, "VISION_ANALYSIS", "done", `${merged.visionEvents.length} événements`);
      } catch (err) {
        await log(jobId, "VISION_ANALYSIS", "error", String(err instanceof Error ? err.message : err));
      }
    }

    // No authored subtitles and no Whisper output — try to reconstruct a
    // partial transcript from on-screen text the Vision model read (§ user ask).
    if (!merged.transcript?.length) {
      const ocr = transcriptFromOnScreenText(merged.visionEvents, Math.round(info.durationSec * 1000));
      if (ocr) {
        merged.transcript = ocr;
        merged.transcriptSource = "vision_ocr";
        await log(
          jobId,
          "VISION_ANALYSIS",
          "done",
          `Transcription partielle reconstruite depuis le texte à l'écran (${ocr.length} segments) — incomplète par nature.`
        );
      }
    }

    // ---------- YouTube data (§9 — real API values only) ----------
    if (video.youtubeVideoId) {
      try {
        const yt = await fetchSingleVideoStats(userId, video.youtubeVideoId);
        if (yt) {
          merged.youtubeStats = {
            "Vues (total)": yt.viewCount,
            "Likes": yt.likeCount,
            "Commentaires": yt.commentCount,
            "Minutes visionnées (est.)": yt.estimatedMinutesWatched,
            "Durée moyenne vue (s)": yt.averageViewDurationSec,
            "% moyen visionné": yt.averageViewPercentage,
            "Abonnés gagnés": yt.subscribersGained,
          };
          await log(jobId, "MERGE", "done", "Données YouTube récupérées (API).");
        }
      } catch (err) {
        await log(jobId, "MERGE", "skipped", `Stats YouTube non récupérées : ${err instanceof Error ? err.message : err}`);
      }
    }

    // ---------- Resolve the Text model once (used by enriched analysis + synthesis) ----------
    const textPref = await prisma.modelPreference.findUnique({
      where: { userId_category: { userId, category: "TEXT" } },
    });
    const textModel = resolveModelFor("TEXT", textPref?.providerId);
    const textProviderId = textModel.id;
    const textRuntimeOk = await isTextRuntimeConfigured(textProviderId);
    const textExhausted = textRuntimeOk ? await isProviderExhausted(userId, textProviderId) : false;
    const canRunText = textRuntimeOk && !textExhausted;
    const textRun = canRunText
      ? async (system: string, user: string, maxTokens: number) => {
          const reply = await runText({
            providerId: textProviderId,
            systemPrompt: system,
            userMessage: user,
            maxTokens,
          });
          await decrementProviderBalance(userId, textProviderId);
          return reply;
        }
      : null;

    // ---------- Merge + enriched analysis (Priority 3) ----------
    await setStage(jobId, "MERGE", stageRef);
    const priors = await loadChannelPriors(userId, video.id).catch(() => []);
    merged.enriched = await runEnrichedAnalysis({
      merged,
      framePaths: frames,
      title: video.title ?? video.originalFilename ?? null,
      youtubeMissing: YOUTUBE_MISSING,
      priors,
      textRun,
      log: (step, status, message) => log(jobId, "MERGE", status, `[${step}] ${message ?? ""}`.trim()),
    });
    await prisma.analysisJob.update({ where: { id: jobId }, data: { result: merged as object } });
    await log(jobId, "MERGE", "done");

    // ---------- Text synthesis ----------
    await setStage(jobId, "TEXT_SYNTHESIS", stageRef);
    await log(jobId, "TEXT_SYNTHESIS", "started");

    if (!textRuntimeOk) {
      await log(
        jobId,
        "TEXT_SYNTHESIS",
        "skipped",
        textModel.mode === "LOCAL"
          ? `Modèle Texte local « ${textModel.label} » non installé ou Ollama non lancé. Installe-le dans Paramètres. La synthèse IA, le résumé, l'analyse du hook et le croisement sont ignorés ; la timeline, les moments forts, la structure et l'audio (calculés sans IA) restent disponibles.`
          : `Modèle Texte « ${textModel.label} » non configuré (clé Gemini absente). La synthèse IA et le croisement sont ignorés ; timeline, moments forts, structure, hook (mesures) et audio restent disponibles.`
      );
    } else if (textExhausted) {
      await log(
        jobId,
        "TEXT_SYNTHESIS",
        "skipped",
        `Solde ${textModel.label} épuisé (voir Paramètres). Les analyses sans IA (timeline, moments forts, structure, audio) restent disponibles.`
      );
    } else {
      try {
        // The cross-analysis (run during MERGE) already produced a structured
        // synthesis — reuse it for the `textSynthesis` field instead of a
        // second full call. Fall back to the classic synthesis when it failed.
        if (merged.enriched?.cross) {
          merged.textSynthesis = crossAnalysisToMarkdown(merged.enriched.cross);
          await log(jobId, "TEXT_SYNTHESIS", "done", "Synthèse issue de l'analyse croisée.");
        } else {
          merged.textSynthesis = await runText({
            providerId: textProviderId,
            systemPrompt: buildSynthesisSystemPrompt(),
            userMessage: buildSynthesisUserMessage(merged),
            maxTokens: 4096,
          });
          await decrementProviderBalance(userId, textProviderId);
          await log(jobId, "TEXT_SYNTHESIS", "done", "Synthèse classique (analyse croisée indisponible).");
        }

        // Natural-language recap shown under the video title — best-effort,
        // never fails the stage. Fed the detailed synthesis so it has real
        // substance to explain, not just raw metadata.
        try {
          const raw = await runText({
            providerId: textProviderId,
            systemPrompt: buildRecapSystemPrompt(),
            userMessage: buildRecapUserMessage(merged),
            maxTokens: 700,
          });
          merged.summary = cleanRecap(raw);
          await decrementProviderBalance(userId, textProviderId);
        } catch (err) {
          await log(jobId, "TEXT_SYNTHESIS", "skipped", `Résumé court non généré : ${err instanceof Error ? err.message : err}`);
        }
      } catch (err) {
        await log(jobId, "TEXT_SYNTHESIS", "error", String(err instanceof Error ? err.message : err));
      }
    }

    await prisma.analysisJob.update({ where: { id: jobId }, data: { result: merged as object } });

    await setStage(jobId, "DONE", stageRef);
    await prisma.analysisJob.update({ where: { id: jobId }, data: { status: "COMPLETED" } });
    await log(jobId, "DONE", "done");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.analysisJob.update({ where: { id: jobId }, data: { status: "FAILED", error: message } });
    await log(jobId, stageRef.current, "error", message);
  } finally {
    await removeDirIfExists(tmpDir);
  }
}

function buildRecapSystemPrompt(): string {
  return `Tu expliques le contenu d'une vidéo à quelqu'un qui ne l'a pas vue, à partir de son analyse.

Objectif : en 5 à 8 phrases, la personne doit comprendre DE QUOI PARLE la vidéo, les points, faits
ou arguments principaux qui y sont développés, ce qui s'y passe, et l'idée à retenir. Explique
vraiment le fond — développe les idées, ne te contente pas de "la vidéo parle de X". Si la vidéo
raconte une histoire ou explique un sujet, restitue-en l'essentiel comme si tu le racontais.

Style : prose fluide en français, une ou deux petits paragraphes, ton d'une personne calée sur le
sujet qui te débriefe. Commence directement par le contenu.

INTERDIT : listes, puces, markdown (pas de **, pas de #, pas de titres), phrases du type "Voici le
résumé", et TOUTE donnée technique (résolution, décibels, silences, durée chiffrée, nombre
d'événements) — ça n'a aucun intérêt ici.

Si l'analyse ne contient ni transcription ni élément visuel exploitable, réponds UNIQUEMENT :
"Le contenu de la vidéo n'a pas pu être résumé (transcription et analyse visuelle indisponibles)."
N'invente jamais rien qui ne soit pas dans l'analyse fournie.`;
}

function buildRecapUserMessage(merged: MergedAnalysis): string {
  const parts: string[] = [];

  if (merged.transcript?.length) {
    parts.push("Transcription (ce qui est dit dans la vidéo) :\n" + merged.transcript.map((t) => t.text).join(" "));
  } else {
    parts.push("Transcription : indisponible.");
  }

  if (merged.visionEvents?.length) {
    parts.push("Éléments visuels repérés :\n" + merged.visionEvents.map((e) => `- ${e.description}`).join("\n"));
  } else {
    parts.push("Analyse visuelle : indisponible.");
  }

  parts.push("Rédige maintenant l'explication de la vidéo selon les consignes.");
  return parts.join("\n\n");
}

// Stat-dump lines a weak model sometimes emits despite the instructions —
// "Résolution : 608x972", "Volume moyen : -12.2 dB", "Silences détectés : 0"…
const STAT_LINE_RE =
  /^\s*[-*•]?\s*(résolution|durée|volume|silences?|décibels?|fps|dimensions?|bitrate)\b.*[:=].*$/i;

// Small local models sometimes ignore the "no markdown / no preamble" rule —
// strip the most common artefacts so the recap reads as plain prose.
function cleanRecap(raw: string): string {
  const withoutStats = raw
    .split("\n")
    .filter((line) => !STAT_LINE_RE.test(line))
    .join("\n");
  return withoutStats
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*(voici\s+(le\s+)?résumé|résumé)\s*:?\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSynthesisSystemPrompt(): string {
  return `Tu es le module IA Texte de Vidalyse. Tu reçois des données structurées issues de l'analyse
réelle d'une vidéo (vision, audio, transcription) — jamais de données inventées.
Structure ta réponse en français avec ces sections :
1. Faits observés — uniquement ce qui est présent dans les données fournies, avec timestamps.
2. Données statistiques — chiffres bruts fournis (durée, volume, nombre d'événements).
3. Interprétation — ce que ces faits suggèrent, formulé avec prudence ("semble", "pourrait").
4. Hypothèses à vérifier — pistes explicites, jamais présentées comme certaines.
Ne mentionne jamais une corrélation comme une causalité certaine. Si une source manque (pas de
transcription, pas d'analyse vision), dis-le clairement plutôt que de l'ignorer silencieusement.`;
}

function buildSynthesisUserMessage(merged: MergedAnalysis): string {
  const parts: string[] = [
    `Vidéo : durée ${merged.video.durationSec.toFixed(1)}s, résolution ${merged.video.width ?? "?"}x${merged.video.height ?? "?"}.`,
  ];

  if (merged.audioDsp) {
    parts.push(
      `Audio (mesures DSP réelles) : volume moyen ${merged.audioDsp.meanVolumeDb ?? "donnée indisponible"} dB, ` +
        `volume max ${merged.audioDsp.maxVolumeDb ?? "donnée indisponible"} dB, ` +
        `${merged.audioDsp.silences.length} silence(s) détecté(s)` +
        (merged.audioDsp.silences.length
          ? ": " + merged.audioDsp.silences.map((s) => `${s.startSec.toFixed(1)}s→${s.endSec?.toFixed(1) ?? "?"}s`).join(", ")
          : ".")
    );
  } else {
    parts.push("Audio : donnée indisponible.");
  }

  if (merged.transcript?.length) {
    parts.push(
      "Transcription (timestamps en ms) :\n" +
        merged.transcript.map((t) => `[${t.timestampMs}ms] ${t.text}`).join("\n")
    );
  } else {
    parts.push("Transcription : donnée indisponible.");
  }

  if (merged.visionEvents?.length) {
    parts.push(
      "Événements Vision (timestamps en ms) :\n" +
        merged.visionEvents.map((e) => `[${e.timestampMs}ms] (${e.type}) ${e.description}`).join("\n")
    );
  } else {
    parts.push("Analyse Vision : donnée indisponible.");
  }

  parts.push("Donne une synthèse structurée de cette vidéo selon les 4 sections demandées.");
  return parts.join("\n\n");
}
