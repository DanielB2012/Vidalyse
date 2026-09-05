import type { SceneChange, SceneDetectionResult } from "./types";

interface FrameInput {
  path: string;
  timestampMs: number;
}

const GRID = 32; // downscale target — enough to catch composition changes, cheap

// Real visual-change signal: decode each already-extracted frame to a tiny
// grayscale grid and compare consecutive grids. No AI, no invented values —
// when `sharp` can't be loaded or too few frames exist we say so in `note`.
export async function detectSceneChanges(frames: FrameInput[]): Promise<SceneDetectionResult> {
  const ordered = [...frames].sort((a, b) => a.timestampMs - b.timestampMs);

  if (ordered.length < 2) {
    return {
      method: "frame-diff",
      frameCount: ordered.length,
      changes: [],
      meanChange: 0,
      note: "Trop peu de frames extraites pour détecter des changements de scène.",
    };
  }

  interface SharpImage {
    greyscale(): SharpImage;
    resize(w: number, h: number, opts?: { fit?: "fill" | "cover" | "contain" }): SharpImage;
    raw(): SharpImage;
    toBuffer(opts: { resolveWithObject: true }): Promise<{ data: Buffer }>;
  }
  type SharpFactory = (input: string) => SharpImage;

  let sharp: SharpFactory;
  try {
    const mod = (await import("sharp")) as unknown as { default?: SharpFactory };
    sharp = (mod.default ?? (mod as unknown as SharpFactory));
    if (typeof sharp !== "function") throw new Error("sharp indisponible");
  } catch {
    return {
      method: "frame-diff",
      frameCount: ordered.length,
      changes: [],
      meanChange: 0,
      note: "Décodage d'images indisponible (sharp non chargé) — détection de scènes ignorée.",
    };
  }

  const grids: (Uint8Array | null)[] = [];
  for (const frame of ordered) {
    try {
      const { data } = await sharp(frame.path)
        .greyscale()
        .resize(GRID, GRID, { fit: "fill" })
        .raw()
        .toBuffer({ resolveWithObject: true });
      grids.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    } catch {
      grids.push(null);
    }
  }

  const raw: { timestampMs: number; changeScore: number }[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const a = grids[i - 1];
    const b = grids[i];
    if (!a || !b || a.length !== b.length) continue;
    let sum = 0;
    for (let p = 0; p < a.length; p++) sum += Math.abs(a[p] - b[p]);
    raw.push({ timestampMs: ordered[i].timestampMs, changeScore: sum / a.length / 255 });
  }

  if (raw.length === 0) {
    return {
      method: "frame-diff",
      frameCount: ordered.length,
      changes: [],
      meanChange: 0,
      note: "Aucune paire de frames exploitable pour la détection de scènes.",
    };
  }

  const mean = raw.reduce((s, r) => s + r.changeScore, 0) / raw.length;
  const variance = raw.reduce((s, r) => s + (r.changeScore - mean) ** 2, 0) / raw.length;
  const std = Math.sqrt(variance);
  const threshold = Math.max(0.12, mean + 2 * std);

  const changes: SceneChange[] = raw.map((r) => ({
    timestampMs: r.timestampMs,
    changeScore: Number(r.changeScore.toFixed(4)),
    isCut: r.changeScore >= threshold,
  }));

  const sparse = ordered.length < 8;
  return {
    method: "frame-diff",
    frameCount: ordered.length,
    changes,
    meanChange: Number(mean.toFixed(4)),
    note: sparse
      ? "Peu de frames extraites : la détection de changements de scène est approximative."
      : null,
  };
}
