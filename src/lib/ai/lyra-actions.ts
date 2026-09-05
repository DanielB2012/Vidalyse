import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getModel, getModelCatalog, getPackModels } from "@/lib/ai/providers/registry";
import { startAnalysisJob } from "@/lib/pipeline/startAnalysisJob";
import { startLocalModelInstall } from "@/lib/ai/local/startInstall";
import { toggleLike, toggleYoutubeLike } from "@/lib/community/likes";
import { searchYoutube } from "@/lib/youtube/search";
import { SOCIAL_ENABLED } from "@/lib/features";
import type { AICategory, ModelEntry, ModelTier, ProviderMode } from "@/lib/ai/providers/types";

// Markers Lyra may put, each on its own line, at the end of a reply. Everything
// is expressed in plain words (category / tier / mode / page), never opaque ids —
// small local models don't echo ids back reliably.
//
// There is deliberately NO marker for: reading/setting/clearing an API key,
// uninstalling a model, signing out, switching account, deleting data, or any
// other sensitive/destructive action. Those must be done by hand in Settings.
const ANALYZE_RE = /\[\[ANALYSER_VIDEO:([^\]]+)\]\]/g;
const MODEL_RE = /\[\[MODELE:([^\]]+)\]\]/g;
const PACK_RE = /\[\[PACK:([^\]]+)\]\]/g;
const INSTALL_RE = /\[\[INSTALLER_MODELE:([^\]]+)\]\]/g;
const LIKE_RE = /\[\[AIMER_VIDEO:([^\]]+)\]\]/g;
const THEME_RE = /\[\[THEME:([^\]]+)\]\]/g;
const LANG_RE = /\[\[LANGUE:([^\]]+)\]\]/g;
const NAV_RE = /\[\[OUVRIR:([^\]]+)\]\]/g;
const LYRA_ACTION_RE =
  /\[\[(?:ANALYSER_VIDEO|MODELE|PACK|INSTALLER_MODELE|AIMER_VIDEO|THEME|LANGUE|OUVRIR):[^\]]*\]\]/g;

// A fully-parsed, validated action. Safe to send to the client and back: it
// carries resolved ids/enums, never free text, and every field is re-checked
// server-side in executeLyraActions before anything runs.
export type PendingAction =
  | { kind: "theme"; value: "light" | "dark" | "system"; label: string }
  | { kind: "language"; value: "fr" | "en"; label: string }
  | { kind: "navigate"; path: string; label: string }
  | { kind: "analyze"; videoId: string; label: string }
  | { kind: "model"; providerId: string; label: string }
  | { kind: "pack"; mode: ProviderMode; tier: ModelTier; label: string }
  | { kind: "install"; providerId: string; label: string }
  | {
      kind: "like";
      label: string;
      title: string;
      publicId?: string;
      youtubeVideoId?: string;
      channelId?: string;
    };

// Runs in the browser (the server can't touch the current view).
export type LyraClientAction =
  | { type: "theme"; value: "light" | "dark" | "system" }
  | { type: "language"; value: "fr" | "en" }
  | { type: "navigate"; value: string };

export interface ParseResult {
  /** rawReply with every marker stripped */
  reply: string;
  /** confirmable actions */
  actions: PendingAction[];
  /** parse-time messages that aren't actionable (bad value, video not found…) */
  parseNotes: string[];
}

export interface ExecuteResult {
  clientActions: LyraClientAction[];
  execNotes: string[];
}

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s: string) =>
  s.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase().replace(/[\s_-]+/g, " ").trim();

const THEME_MAP: Record<string, "light" | "dark" | "system"> = {
  clair: "light", light: "light", jour: "light", blanc: "light",
  sombre: "dark", dark: "dark", nuit: "dark", noir: "dark",
  systeme: "system", system: "system", auto: "system", automatique: "system", appareil: "system",
};
const LANG_MAP: Record<string, "fr" | "en"> = {
  francais: "fr", french: "fr", fr: "fr",
  anglais: "en", english: "en", en: "en",
};
const NAV_MAP: Record<string, string> = {
  "tableau de bord": "/dashboard", dashboard: "/dashboard", accueil: "/dashboard",
  statistiques: "/analytics", analytics: "/analytics",
  contenu: "/content",
  "contenu analyse": "/content/analyzed", "analyser du contenu": "/content/analyzed",
  "avant publication": "/content/pre-publish", "analyser avant publication": "/content/pre-publish",
  projets: "/projects",
  ...(SOCIAL_ENABLED ? { communaute: "/community" } : {}),
  profil: "/profile",
  parametres: "/settings", reglages: "/settings", settings: "/settings",
};
const NAV_PATHS = new Set(Object.values(NAV_MAP));

const CATEGORY_MAP: Record<string, AICategory> = {
  texte: "TEXT", text: "TEXT", lyra: "TEXT",
  vision: "VISION", image: "VISION",
  transcription: "TRANSCRIPTION", parole: "TRANSCRIPTION",
  audio: "AUDIO",
  video: "VIDEO",
};
const TIER_MAP: Record<string, ModelTier> = {
  leger: "LIGHT", light: "LIGHT", bas: "LIGHT",
  moyen: "MEDIUM", medium: "MEDIUM", standard: "MEDIUM",
  pro: "PRO", eleve: "PRO", max: "PRO",
};
const MODE_MAP: Record<string, ProviderMode> = {
  local: "LOCAL", "hors ligne": "LOCAL",
  "en ligne": "CLOUD", ligne: "CLOUD", cloud: "CLOUD", gemini: "CLOUD",
};
const CAT_FR: Record<AICategory, string> = {
  TEXT: "Texte", VISION: "Vision", TRANSCRIPTION: "Transcription", AUDIO: "Audio", VIDEO: "Vidéo",
};
const THEME_FR: Record<"light" | "dark" | "system", string> = {
  light: "clair", dark: "sombre", system: "système",
};

function parseTriplet(raw: string): {
  category?: AICategory;
  tier?: ModelTier;
  mode?: ProviderMode;
} {
  const out: { category?: AICategory; tier?: ModelTier; mode?: ProviderMode } = {};
  for (const p of raw.split("|").map((x) => norm(x))) {
    if (CATEGORY_MAP[p]) out.category = CATEGORY_MAP[p];
    else if (TIER_MAP[p]) out.tier = TIER_MAP[p];
    else if (MODE_MAP[p]) out.mode = MODE_MAP[p];
  }
  return out;
}

function findCatalogEntry(
  category: AICategory,
  tier: ModelTier,
  mode: ProviderMode
): ModelEntry | undefined {
  const catalog = getModelCatalog();
  return (
    catalog.find(
      (m) => m.category === category && m.tier === tier && m.mode === mode && m.runtime !== "none"
    ) ?? catalog.find((m) => m.category === category && m.mode === mode && m.runtime !== "none")
  );
}

// ---------------------------------------------------------------------------
// PARSE — never executes anything. Resolves markers into concrete PendingActions
// (+ parse notes for things it couldn't make sense of).
// ---------------------------------------------------------------------------
export async function parseLyraActions(
  userId: string,
  rawReply: string,
  { fullAccess }: { fullAccess: boolean }
): Promise<ParseResult> {
  const reply = rawReply.replace(LYRA_ACTION_RE, "").trim();
  const actions: PendingAction[] = [];
  const parseNotes: string[] = [];

  // --- client-view markers (theme / language / navigation) ---
  for (const m of rawReply.matchAll(THEME_RE)) {
    const value = THEME_MAP[norm(m[1])];
    if (value) actions.push({ kind: "theme", value, label: `Passer l'affichage en mode ${THEME_FR[value]}` });
  }
  for (const m of rawReply.matchAll(LANG_RE)) {
    const value = LANG_MAP[norm(m[1])];
    if (value)
      actions.push({
        kind: "language",
        value,
        label: `Mettre l'interface en ${value === "fr" ? "français" : "anglais"}`,
      });
  }
  for (const m of rawReply.matchAll(NAV_RE)) {
    const path = NAV_MAP[norm(m[1])];
    if (path) actions.push({ kind: "navigate", path, label: `Ouvrir la page ${m[1].trim()}` });
  }

  const serverMarkers =
    [...rawReply.matchAll(ANALYZE_RE)].length +
    [...rawReply.matchAll(MODEL_RE)].length +
    [...rawReply.matchAll(PACK_RE)].length +
    [...rawReply.matchAll(INSTALL_RE)].length +
    [...rawReply.matchAll(LIKE_RE)].length;

  if (serverMarkers > 0 && !fullAccess) {
    parseNotes.push(
      "Pour changer un modèle, l'installer ou lancer une analyse, active « Accès complet » en haut du chat."
    );
    return { reply, actions, parseNotes };
  }

  // --- server markers (only reached when fullAccess) ---
  for (const m of rawReply.matchAll(ANALYZE_RE)) {
    const titleGuess = m[1].trim();
    const resolved = await resolveVideoByTitle(userId, titleGuess);
    if (!resolved) {
      parseNotes.push(
        `Je n'ai pas retrouvé précisément « ${titleGuess} » parmi tes vidéos — redonne-moi le titre exact ?`
      );
      continue;
    }
    actions.push({
      kind: "analyze",
      videoId: resolved.id,
      label: `Lancer l'analyse de « ${resolved.title} »`,
    });
  }

  for (const m of rawReply.matchAll(MODEL_RE)) {
    const { category, tier, mode } = parseTriplet(m[1]);
    if (!category || !tier || !mode) {
      parseNotes.push(
        "Je n'ai pas bien compris quel modèle mettre — précise la catégorie, le niveau et le mode (local ou en ligne)."
      );
      continue;
    }
    const entry = findCatalogEntry(category, tier, mode);
    if (!entry) {
      parseNotes.push(
        `Pas de modèle ${mode === "LOCAL" ? "local" : "en ligne"} disponible pour ${CAT_FR[category]} au niveau demandé.`
      );
      continue;
    }
    actions.push({
      kind: "model",
      providerId: entry.id,
      label: `Régler le modèle ${CAT_FR[entry.category]} sur « ${entry.label} »`,
    });
  }

  for (const m of rawReply.matchAll(PACK_RE)) {
    const { tier, mode } = parseTriplet(m[1]);
    if (!tier || !mode) {
      parseNotes.push("Précise le mode (local ou en ligne) et le niveau du pack.");
      continue;
    }
    if (getPackModels(mode, tier).length === 0) {
      parseNotes.push("Ce pack n'existe pas.");
      continue;
    }
    actions.push({
      kind: "pack",
      mode,
      tier,
      label: `Appliquer le pack ${mode === "LOCAL" ? "local" : "en ligne"} ${tier} (toutes les catégories)`,
    });
  }

  for (const m of rawReply.matchAll(INSTALL_RE)) {
    const { category, tier } = parseTriplet(m[1]);
    if (!category || !tier) {
      parseNotes.push("Précise quelle catégorie et quel niveau de modèle local installer.");
      continue;
    }
    const entry = findCatalogEntry(category, tier, "LOCAL");
    if (!entry || !entry.local) {
      parseNotes.push(`Pas de modèle local à installer pour ${CAT_FR[category]} au niveau demandé.`);
      continue;
    }
    actions.push({
      kind: "install",
      providerId: entry.id,
      label: `Installer « ${entry.label} » (~${entry.local.diskGB} Go, en arrière-plan)`,
    });
  }

  for (const m of rawReply.matchAll(LIKE_RE)) {
    const query = m[1].trim();
    const resolved = await resolveLikeTarget(userId, query);
    if (!resolved) {
      parseNotes.push(`Je n'ai pas trouvé de vidéo correspondant à « ${query} » pour la liker.`);
      continue;
    }
    actions.push(resolved);
  }

  return { reply, actions, parseNotes };
}

// ---------------------------------------------------------------------------
// EXECUTE — runs a list of PendingActions. Every field is re-validated here, so
// a tampered client list can still only do things within these constrained
// shapes for the authenticated user. Server actions need fullAccess.
// ---------------------------------------------------------------------------
export async function executeLyraActions(
  userId: string,
  actions: PendingAction[],
  { fullAccess }: { fullAccess: boolean }
): Promise<ExecuteResult> {
  const clientActions: LyraClientAction[] = [];
  const execNotes: string[] = [];
  let touchedSettings = false;

  for (const a of actions) {
    switch (a.kind) {
      case "theme": {
        if (a.value === "light" || a.value === "dark" || a.value === "system") {
          clientActions.push({ type: "theme", value: a.value });
          execNotes.push(`Affichage passé en mode ${THEME_FR[a.value]}.`);
        }
        break;
      }
      case "language": {
        if (a.value === "fr" || a.value === "en") {
          clientActions.push({ type: "language", value: a.value });
          execNotes.push(`Interface en ${a.value === "fr" ? "français" : "anglais"}.`);
        }
        break;
      }
      case "navigate": {
        if (NAV_PATHS.has(a.path)) {
          clientActions.push({ type: "navigate", value: a.path });
          execNotes.push("Page ouverte.");
        }
        break;
      }
      case "analyze": {
        if (!fullAccess) {
          execNotes.push("Analyse non lancée : active « Accès complet ».");
          break;
        }
        const res = await startAnalysisJob(userId, a.videoId);
        execNotes.push(
          res.ok
            ? res.reused
              ? "Une analyse était déjà en cours pour cette vidéo, je la laisse finir."
              : "C'est parti ! Je te préviens ici dès que l'analyse est terminée."
            : `Je n'ai pas pu lancer l'analyse : ${res.error === "not_found" ? "vidéo introuvable." : res.error}`
        );
        break;
      }
      case "model": {
        if (!fullAccess) {
          execNotes.push("Modèle non changé : active « Accès complet ».");
          break;
        }
        const model = getModel(a.providerId);
        if (!model || model.runtime === "none") {
          execNotes.push("Ce modèle n'existe pas.");
          break;
        }
        await upsertPreference(userId, model);
        touchedSettings = true;
        execNotes.push(`Modèle ${CAT_FR[model.category]} réglé sur « ${model.label} ».`);
        break;
      }
      case "pack": {
        if (!fullAccess) {
          execNotes.push("Pack non appliqué : active « Accès complet ».");
          break;
        }
        const packModels = getPackModels(a.mode, a.tier);
        if (packModels.length === 0) {
          execNotes.push("Ce pack n'existe pas.");
          break;
        }
        for (const pm of packModels) await upsertPreference(userId, pm);
        touchedSettings = true;
        execNotes.push(
          `Pack ${a.mode === "LOCAL" ? "local" : "en ligne"} ${a.tier} appliqué (${packModels
            .map((p) => CAT_FR[p.category])
            .join(", ")}).`
        );
        break;
      }
      case "install": {
        if (!fullAccess) {
          execNotes.push("Installation non lancée : active « Accès complet ».");
          break;
        }
        const model = getModel(a.providerId);
        if (!model || model.mode !== "LOCAL") {
          execNotes.push("Ce modèle local n'existe pas.");
          break;
        }
        const res = startLocalModelInstall(model.id);
        if (!res.ok) {
          execNotes.push(`Je n'ai pas pu lancer l'installation de « ${model.label} ».`);
          break;
        }
        touchedSettings = true;
        execNotes.push(
          res.alreadyRunning
            ? `L'installation de « ${model.label} » est déjà en cours.`
            : `Installation de « ${model.label} » lancée en arrière-plan — suis la progression dans Paramètres → IA & Lyra.`
        );
        break;
      }
      case "like": {
        if (!SOCIAL_ENABLED) {
          execNotes.push("La communauté est désactivée sur cette installation.");
          break;
        }
        if (!fullAccess) {
          execNotes.push("Like non enregistré : active « Accès complet ».");
          break;
        }
        if (a.publicId) {
          const r = await toggleLike(userId, a.publicId);
          execNotes.push(
            r.ok
              ? r.liked
                ? `J'ai aimé « ${a.title} » (${r.count} like${r.count > 1 ? "s" : ""}).`
                : `J'ai retiré le like sur « ${a.title} » (${r.count}).`
              : "Cette vidéo n'est plus disponible dans la communauté."
          );
        } else if (a.youtubeVideoId) {
          const r = await toggleYoutubeLike(userId, {
            youtubeVideoId: a.youtubeVideoId,
            channelId: a.channelId ?? "",
            title: a.title,
          });
          execNotes.push(
            r.ok
              ? r.liked
                ? `J'ai aimé « ${a.title} » (${r.count}).`
                : `J'ai retiré le like sur « ${a.title} » (${r.count}).`
              : r.reason === "creator_not_on_vidalyse"
                ? `Je ne peux pas aimer « ${a.title} » ici : ce créateur n'est pas sur Vidalyse.`
                : "Le like n'a pas pu être enregistré."
          );
        }
        revalidatePath("/community");
        break;
      }
    }
  }

  if (touchedSettings) {
    revalidatePath("/settings");
    revalidatePath("/dashboard");
  }
  return { clientActions, execNotes };
}

async function upsertPreference(userId: string, model: ModelEntry) {
  await prisma.modelPreference.upsert({
    where: { userId_category: { userId, category: model.category } },
    update: { mode: model.mode, tier: model.tier, providerId: model.id },
    create: {
      userId,
      category: model.category,
      mode: model.mode,
      tier: model.tier,
      providerId: model.id,
    },
  });
}

async function resolveVideoByTitle(
  userId: string,
  titleGuess: string
): Promise<{ id: string; title: string } | null> {
  const target = norm(titleGuess.replace(/[^a-z0-9\s]/gi, " "));
  if (!target) return null;
  const videos = await prisma.video.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, originalFilename: true },
  });
  const withNorm = videos.map((v) => ({
    id: v.id,
    title: v.title ?? v.originalFilename ?? v.id,
    n: norm((v.title ?? v.originalFilename ?? "").replace(/[^a-z0-9\s]/gi, " ")),
  }));
  const exact = withNorm.find((v) => v.n === target);
  if (exact) return { id: exact.id, title: exact.title };
  const partial = withNorm.find((v) => v.n.length > 0 && (v.n.includes(target) || target.includes(v.n)));
  return partial ? { id: partial.id, title: partial.title } : null;
}

// Resolve a free-text "like this video" request. Prefers a video already in the
// community (by title); otherwise takes the top YouTube search hit.
async function resolveLikeTarget(userId: string, query: string): Promise<PendingAction | null> {
  const target = norm(query.replace(/[^a-z0-9\s]/gi, " "));
  if (!target) return null;

  const rows = await prisma.publicVideo.findMany({
    where: { OR: [{ isPublic: true }, { youtubePublic: true }], user: { publicProfile: { isPublic: true } } },
    orderBy: [{ publishedAt: "desc" }],
    take: 200,
    select: { publicId: true, title: true },
  });
  const match = rows
    .map((r) => ({ ...r, n: norm((r.title ?? "").replace(/[^a-z0-9\s]/gi, " ")) }))
    .find((r) => r.n.length > 0 && (r.n === target || r.n.includes(target) || target.includes(r.n)));
  if (match) {
    return {
      kind: "like",
      publicId: match.publicId,
      title: match.title ?? query,
      label: `Aimer « ${match.title ?? query} »`,
    };
  }

  const yt = await searchYoutube(userId, query, 5).catch(() => null);
  const top = yt?.videos[0];
  if (top) {
    return {
      kind: "like",
      youtubeVideoId: top.videoId,
      channelId: top.channelId,
      title: top.title,
      label: `Aimer « ${top.title} » (${top.channelTitle})`,
    };
  }
  return null;
}

// Narrow an untrusted array (from the client, after "Accept") to real
// PendingActions. Shapes only — every value is still re-checked in execute.
export function sanitizePendingActions(input: unknown): PendingAction[] {
  if (!Array.isArray(input)) return [];
  const out: PendingAction[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const label = typeof a.label === "string" ? a.label : "";
    switch (a.kind) {
      case "theme":
        if (a.value === "light" || a.value === "dark" || a.value === "system")
          out.push({ kind: "theme", value: a.value, label });
        break;
      case "language":
        if (a.value === "fr" || a.value === "en") out.push({ kind: "language", value: a.value, label });
        break;
      case "navigate":
        if (typeof a.path === "string" && NAV_PATHS.has(a.path))
          out.push({ kind: "navigate", path: a.path, label });
        break;
      case "analyze":
        if (typeof a.videoId === "string") out.push({ kind: "analyze", videoId: a.videoId, label });
        break;
      case "model":
        if (typeof a.providerId === "string")
          out.push({ kind: "model", providerId: a.providerId, label });
        break;
      case "pack":
        if (
          (a.mode === "LOCAL" || a.mode === "CLOUD") &&
          (a.tier === "LIGHT" || a.tier === "MEDIUM" || a.tier === "PRO")
        )
          out.push({ kind: "pack", mode: a.mode, tier: a.tier, label });
        break;
      case "install":
        if (typeof a.providerId === "string")
          out.push({ kind: "install", providerId: a.providerId, label });
        break;
      case "like":
        if (typeof a.title === "string" && (typeof a.publicId === "string" || typeof a.youtubeVideoId === "string"))
          out.push({
            kind: "like",
            title: a.title,
            label,
            publicId: typeof a.publicId === "string" ? a.publicId : undefined,
            youtubeVideoId: typeof a.youtubeVideoId === "string" ? a.youtubeVideoId : undefined,
            channelId: typeof a.channelId === "string" ? a.channelId : undefined,
          });
        break;
    }
  }
  return out.slice(0, 12);
}
