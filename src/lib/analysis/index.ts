import type { MergedAnalysis } from "@/lib/pipeline/types";
import { detectSceneChanges } from "./sceneDetection";
import { attachHighlightMarkers, buildTimeline } from "./timeline";
import { scoreHighlights } from "./highlightScoring";
import {
  analyzeStructure,
  buildStructureRefinementPrompt,
  parseStructureRefinement,
} from "./structureAnalysis";
import { buildHookPrompt, measureHook, parseHookResponse } from "./hookAnalysis";
import { buildCrossAnalysisPrompt, parseCrossAnalysis } from "./crossAnalysis";
import { compareWithChannel, type ComparableVideo } from "./youtubeComparison";
import type { EnrichedAnalysis } from "./types";

export * from "./types";

export type TextRun = (system: string, user: string, maxTokens: number) => Promise<string>;

export interface RunEnrichedAnalysisArgs {
  merged: MergedAnalysis;
  framePaths: { path: string; timestampMs: number }[];
  title: string | null;
  youtubeMissing: string[];
  priors: ComparableVideo[];
  /** null when no Text model runtime is configured — AI steps are skipped. */
  textRun: TextRun | null;
  log: (step: string, status: "started" | "done" | "skipped" | "error", message?: string) => Promise<void>;
}

// Orchestrates every §2–§10/§14 sub-analysis. Deterministic steps always run;
// AI steps run only when a Text runtime is available and degrade to their
// heuristic/measured baseline on any failure. Never throws — a partial bundle
// is still useful (§22).
export async function runEnrichedAnalysis(args: RunEnrichedAnalysisArgs): Promise<EnrichedAnalysis> {
  const { merged, framePaths, textRun, log } = args;
  const durationMs = Math.round((merged.video.durationSec || 0) * 1000);

  const out: EnrichedAnalysis = {
    sceneDetection: null,
    timeline: null,
    highlights: null,
    structure: null,
    hook: null,
    cross: null,
    comparison: null,
  };

  // ---- Scene detection (frame diff) ----
  try {
    await log("scene_detection", "started");
    out.sceneDetection = await detectSceneChanges(framePaths);
    await log("scene_detection", "done", out.sceneDetection.note ?? `${out.sceneDetection.changes.filter((c) => c.isCut).length} coupes`);
  } catch (err) {
    await log("scene_detection", "error", String(err instanceof Error ? err.message : err));
  }

  // ---- Timeline ----
  try {
    await log("timeline", "started");
    out.timeline = buildTimeline({
      durationMs,
      transcript: merged.transcript,
      visionEvents: merged.visionEvents,
      audioDsp: merged.audioDsp,
      sceneDetection: out.sceneDetection,
    });
    await log("timeline", "done", `${out.timeline.length} événements`);
  } catch (err) {
    await log("timeline", "error", String(err instanceof Error ? err.message : err));
  }

  // ---- Highlight scoring ----
  try {
    await log("highlights", "started");
    out.highlights = scoreHighlights({
      durationMs,
      transcript: merged.transcript,
      visionEvents: merged.visionEvents,
      audioDsp: merged.audioDsp,
      sceneDetection: out.sceneDetection,
    });
    if (out.timeline && out.highlights) {
      out.timeline = attachHighlightMarkers(out.timeline, out.highlights.highlights, out.highlights.weakMoments);
    }
    await log(
      "highlights",
      out.highlights.note ? "skipped" : "done",
      out.highlights.note ?? `${out.highlights.highlights.length} moments forts`
    );
  } catch (err) {
    await log("highlights", "error", String(err instanceof Error ? err.message : err));
  }

  // ---- Structure ----
  try {
    await log("structure", "started");
    let structure = analyzeStructure({
      durationMs,
      transcript: merged.transcript,
      sceneDetection: out.sceneDetection,
    });
    // §16 — only spend an AI call on refinement when there's enough transcript
    // to justify it.
    if (textRun && !structure.undetermined && (merged.transcript?.length ?? 0) >= 4 && durationMs >= 5000) {
      try {
        const { system, user } = buildStructureRefinementPrompt(structure, merged.transcript, durationMs);
        const raw = await textRun(system, user, 1500);
        const refined = parseStructureRefinement(raw, durationMs);
        if (refined) {
          structure = { ...structure, segments: refined, aiRefined: true };
        }
      } catch {
        // keep heuristic structure
      }
    }
    out.structure = structure;
    await log("structure", "done", `${structure.segments.length} segments${structure.aiRefined ? " (affiné IA)" : ""}`);
  } catch (err) {
    await log("structure", "error", String(err instanceof Error ? err.message : err));
  }

  // ---- Hook ----
  try {
    await log("hook", "started");
    let hook = measureHook({
      durationMs,
      transcript: merged.transcript,
      visionEvents: merged.visionEvents,
      audioDsp: merged.audioDsp,
      sceneDetection: out.sceneDetection,
    });
    if (textRun && hook.available) {
      try {
        const { system, user } = buildHookPrompt(hook, merged.transcript);
        const raw = await textRun(system, user, 1200);
        hook = parseHookResponse(raw, hook);
      } catch {
        // keep measured-only hook
      }
    }
    out.hook = hook;
    await log("hook", hook.available ? "done" : "skipped", hook.reason ?? (hook.aiUsed ? "analysé (mesures + IA)" : "mesures seules"));
  } catch (err) {
    await log("hook", "error", String(err instanceof Error ? err.message : err));
  }

  // ---- Channel comparison ----
  try {
    await log("comparison", "started");
    const targetHookText = (merged.transcript ?? [])
      .filter((s) => s.timestampMs < 15000)
      .map((s) => s.text.trim())
      .join(" ")
      .trim();
    const targetHookWords = targetHookText
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter((w) => w.length > 3);
    out.comparison = compareWithChannel({
      target: {
        durationSec: merged.video.durationSec,
        hookWords: targetHookWords,
        hookText: targetHookText,
        structureKinds: (out.structure?.segments ?? []).map((s) => s.kind),
      },
      priors: args.priors,
    });
    await log(
      "comparison",
      out.comparison.available ? "done" : "skipped",
      out.comparison.reason ?? `${out.comparison.matches.length} vidéos proches`
    );
  } catch (err) {
    await log("comparison", "error", String(err instanceof Error ? err.message : err));
  }

  // ---- Cross analysis (AI) ----
  if (textRun) {
    try {
      await log("cross_analysis", "started");
      const { system, user } = buildCrossAnalysisPrompt({
        video: merged.video,
        title: args.title,
        audioDsp: merged.audioDsp,
        transcript: merged.transcript,
        visionEvents: merged.visionEvents,
        sceneDetection: out.sceneDetection,
        highlights: out.highlights,
        structure: out.structure,
        hook: out.hook,
        youtubeStats: merged.youtubeStats,
        youtubeMissing: args.youtubeMissing,
        comparison: out.comparison,
      });
      const raw = await textRun(system, user, 4096);
      out.cross = parseCrossAnalysis(raw, merged.video.durationSec);
      await log("cross_analysis", out.cross ? "done" : "skipped", out.cross ? undefined : "réponse IA non exploitable — synthèse classique conservée");
    } catch (err) {
      await log("cross_analysis", "error", String(err instanceof Error ? err.message : err));
    }
  } else {
    await log("cross_analysis", "skipped", "Aucun modèle Texte configuré.");
  }

  return out;
}
