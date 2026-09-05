import { prisma } from "@/lib/prisma";
import { getModel, getModelCatalog } from "@/lib/ai/providers/registry";
import { isGeminiKeyConfigured } from "@/lib/ai/gemini-key";
import { listInstalledOllamaModels, isOllamaModelInstalled } from "@/lib/ai/local/ollama-client";
import { isWhisperModelInstalled } from "@/lib/ai/local/whisper-client";

const MAX_PROJECTS = 10;
const MAX_VIDEOS = 8;

const CAT_FR: Record<string, string> = {
  TEXT: "Texte",
  VISION: "Vision",
  TRANSCRIPTION: "Transcription",
  AUDIO: "Audio",
  VIDEO: "Vidéo",
};

// "Accès complet" (spec: bouton toujours visible en haut du chat Lyra) — a
// compact, real summary of the user's own data (never fabricated), built
// fresh on every request so Lyra always sees current state, not a stale
// snapshot.
export async function buildFullAccessContext(userId: string): Promise<string> {
  const [channel, projects, videos, credits, prefs, geminiKey, ollamaNames] = await Promise.all([
    prisma.channel.findUnique({ where: { userId } }),
    prisma.project.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: MAX_PROJECTS }),
    prisma.video.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: MAX_VIDEOS,
      include: { jobs: { orderBy: { updatedAt: "desc" }, take: 1 } },
    }),
    prisma.creditBalance.findMany({ where: { userId, remaining: { not: null } } }),
    prisma.modelPreference.findMany({ where: { userId } }),
    isGeminiKeyConfigured(),
    listInstalledOllamaModels().catch(() => [] as string[]),
  ]);

  const lines: string[] = [];

  lines.push(
    channel
      ? `Chaîne YouTube : "${channel.title}" — ${channel.subscriberCount ?? "?"} abonnés, ${
          channel.videoCount ?? "?"
        } vidéos, ${channel.viewCount ?? "?"} vues.`
      : "Chaîne YouTube : aucune connectée."
  );

  lines.push(
    projects.length > 0
      ? `Projets (${projects.length}) : ` + projects.map((p) => `"${p.title}" [${p.status}]`).join(", ")
      : "Projets : aucun."
  );

  if (videos.length > 0) {
    const videoLines = videos.map((v) => {
      const job = v.jobs[0];
      const duration = v.durationSec ? `${Math.round(v.durationSec)}s` : "durée inconnue";
      const jobInfo = job ? `job ${job.status} (${job.currentStage})` : "pas encore analysée";
      const analyzable = v.storagePath ? "fichier disponible, analysable" : "pas de fichier local, non analysable";
      const result = job?.result as { textSynthesis?: string | null } | null | undefined;
      const synthesis = result?.textSynthesis ? ` — synthèse : ${result.textSynthesis.slice(0, 300)}` : "";
      return `- "${v.title ?? v.originalFilename ?? v.id}" (${duration}, ${jobInfo}, ${analyzable})${synthesis}`;
    });
    lines.push(`Vidéos récentes (${videos.length}) :\n${videoLines.join("\n")}`);
  } else {
    lines.push("Vidéos : aucune.");
  }

  if (credits.length > 0) {
    lines.push(
      "Crédits fournisseur restants (saisis manuellement par l'utilisateur) : " +
        credits.map((c) => `${c.providerId} ${c.remaining}`).join(", ")
    );
  }

  // Current model configuration — so Lyra knows what's selected before proposing
  // a change, and what's already installed before proposing an install.
  if (prefs.length > 0) {
    lines.push(
      "Modèles actuellement sélectionnés : " +
        prefs
          .map((p) => {
            const m = getModel(p.providerId);
            return `${CAT_FR[p.category] ?? p.category} = ${m?.label ?? p.providerId} (${p.mode === "LOCAL" ? "local" : "en ligne"}, ${p.tier})`;
          })
          .join(" ; ")
    );
  }

  const localModels = getModelCatalog().filter((m) => m.mode === "LOCAL" && m.runtimeModelId);
  const installed = localModels.filter((m) =>
    m.runtime === "whisper-local"
      ? isWhisperModelInstalled(m.runtimeModelId!)
      : isOllamaModelInstalled(ollamaNames, m.runtimeModelId!)
  );
  lines.push(
    installed.length > 0
      ? "Modèles locaux installés : " + installed.map((m) => m.label).join(", ") + "."
      : "Modèles locaux installés : aucun."
  );

  lines.push(
    geminiKey
      ? "Clé API Gemini : configurée (la valeur n'est jamais accessible ici)."
      : "Clé API Gemini : aucune. Les modèles en ligne ne fonctionneront pas tant que l'utilisateur n'en aura pas saisi une dans les Paramètres."
  );

  return lines.join("\n");
}
