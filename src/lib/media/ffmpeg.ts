import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { ensureDir } from "./paths";

const execFileAsync = promisify(execFile);

// ffmpeg-static/ffprobe-static bundle real, verifiable binaries per platform
// (spec §106 — never invent a tool; these are real npm packages, checked at
// install time). No system-wide ffmpeg install is required.
const FFMPEG_BIN = ffmpegPath as unknown as string;
const FFPROBE_BIN = ffprobeStatic.path;

export interface VideoTechnicalInfo {
  durationSec: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
}

function parseFrameRate(rate: string | undefined): number | null {
  if (!rate) return null;
  const [num, den] = rate.split("/").map(Number);
  if (!den) return num || null;
  return num / den;
}

export async function probeVideo(filePath: string): Promise<VideoTechnicalInfo> {
  const { stdout } = await execFileAsync(FFPROBE_BIN, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      avg_frame_rate?: string;
    }>;
  };

  const videoStream = data.streams?.find((s) => s.codec_type === "video");
  const audioStream = data.streams?.find((s) => s.codec_type === "audio");
  const durationSec = Number(data.format?.duration ?? 0);

  return {
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    fps: parseFrameRate(videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate),
    hasAudio: Boolean(audioStream),
  };
}

// Pull the first text-based embedded subtitle track (mov_text / subrip / webvtt
// / ass) out to an SRT file. Returns null when the container has no such track
// or the extraction fails — the caller then falls back to ASR. Bitmap subs
// (dvd_subtitle / hdmv_pgs) can't become text and are treated as "none".
export async function extractEmbeddedSubtitles(inputPath: string, outDir: string): Promise<string | null> {
  let streams: Array<{ codec_type?: string; codec_name?: string }> = [];
  try {
    const { stdout } = await execFileAsync(FFPROBE_BIN, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-select_streams",
      "s",
      inputPath,
    ]);
    streams = (JSON.parse(stdout).streams ?? []) as typeof streams;
  } catch {
    return null;
  }

  const TEXT_SUBS = new Set(["mov_text", "subrip", "srt", "webvtt", "ass", "ssa", "text"]);
  const textIdx = streams.findIndex((s) => s.codec_name && TEXT_SUBS.has(s.codec_name));
  if (textIdx === -1) return null;

  await ensureDir(outDir);
  const outPath = path.join(outDir, "subs_embedded.srt");
  try {
    await execFileAsync(FFMPEG_BIN, [
      "-y",
      "-i",
      inputPath,
      "-map",
      `0:s:${textIdx}`,
      "-c:s",
      "srt",
      outPath,
    ]);
  } catch {
    return null;
  }
  const fs = await import("node:fs/promises");
  try {
    const stat = await fs.stat(outPath);
    return stat.size > 0 ? outPath : null;
  } catch {
    return null;
  }
}

export async function extractAudio(inputPath: string, outDir: string): Promise<string> {
  await ensureDir(outDir);
  const outPath = path.join(outDir, "audio.wav");
  // 16kHz mono PCM — the standard input format for speech-to-text engines,
  // and small enough to keep temp storage reasonable.
  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    outPath,
  ]);
  return outPath;
}

export interface FrameExtractionPlan {
  fps: number;
  maxFrames: number;
  scaleHeight: number;
}

// Adaptive extraction (spec §23): pick an fps that yields at most maxFrames
// frames across the video's duration, so a 10-minute video and a 10-second
// video don't cost the same. Never exceeds 24fps or goes below one frame
// every 10s so very long videos still get some coverage.
export function planFrameExtraction(durationSec: number, maxFrames: number): FrameExtractionPlan {
  const safeDuration = Math.max(durationSec, 1);
  const rawFps = maxFrames / safeDuration;
  const fps = Math.min(24, Math.max(rawFps, 1 / 10));
  return { fps, maxFrames, scaleHeight: 420 };
}

export async function extractFrames(
  inputPath: string,
  outDir: string,
  plan: FrameExtractionPlan
): Promise<{ path: string; timestampMs: number }[]> {
  await ensureDir(outDir);
  const pattern = path.join(outDir, "frame_%05d.jpg");

  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `fps=${plan.fps},scale=-2:${plan.scaleHeight}`,
    "-frames:v",
    String(plan.maxFrames),
    "-qscale:v",
    "4",
    pattern,
  ]);

  const fs = await import("node:fs/promises");
  const files = (await fs.readdir(outDir)).filter((f) => f.endsWith(".jpg")).sort();
  return files.map((file, index) => ({
    path: path.join(outDir, file),
    timestampMs: Math.round((index / plan.fps) * 1000),
  }));
}

export async function generateThumbnail(inputPath: string, outPath: string, atSec: number) {
  await ensureDir(path.dirname(outPath));
  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-ss",
    String(Math.max(atSec, 0)),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=480:-2",
    outPath,
  ]);
}

export interface LoudnessPoint {
  tSec: number;
  momentaryLufs: number;
}

export interface AudioDspResult {
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  silences: { startSec: number; endSec: number | null }[];
  // Real per-time momentary-loudness curve (EBU R128, ffmpeg ebur128 filter),
  // downsampled to ~1s. Empty when the filter produced nothing parseable.
  // This is a DSP measurement, never an AI classification.
  loudnessSeries: LoudnessPoint[];
}

// Real signal-processing analysis (no AI model, no invented numbers) — see
// the "not_integrated" note on the AUDIO AI category in the provider
// registry: this is what's genuinely available today for §9 (volume/silences).
export async function analyzeAudioDsp(audioPath: string): Promise<AudioDspResult> {
  // ffmpeg writes ebur128/silencedetect/volumedetect output to stderr
  // regardless of exit code; -f null with no output file normally exits 0.
  let stderr: string;
  try {
    const result = await execFileAsync(FFMPEG_BIN, [
      "-i",
      audioPath,
      "-af",
      "ebur128=metadata=1,silencedetect=noise=-30dB:d=0.5,volumedetect",
      "-f",
      "null",
      "-",
    ], { maxBuffer: 64 * 1024 * 1024 });
    stderr = result.stderr;
  } catch (err) {
    const fallback = (err as { stderr?: string }).stderr;
    if (!fallback) throw err;
    stderr = fallback;
  }

  const meanMatch = stderr.match(/mean_volume:\s*(-?\d+(\.\d+)?)\s*dB/);
  const maxMatch = stderr.match(/max_volume:\s*(-?\d+(\.\d+)?)\s*dB/);

  const silences: { startSec: number; endSec: number | null }[] = [];
  const starts = [...stderr.matchAll(/silence_start:\s*(-?\d+(\.\d+)?)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*(-?\d+(\.\d+)?)/g)].map((m) => Number(m[1]));
  starts.forEach((start, i) => {
    silences.push({ startSec: start, endSec: ends[i] ?? null });
  });

  return {
    meanVolumeDb: meanMatch ? Number(meanMatch[1]) : null,
    maxVolumeDb: maxMatch ? Number(maxMatch[1]) : null,
    silences,
    loudnessSeries: parseLoudnessSeries(stderr),
  };
}

// ffmpeg's ebur128 filter emits lines like:
//   [Parsed_ebur128_0 @ 0x..] t: 1.2   TARGET:-23 LUFS    M: -19.4 S: ...
// We keep the momentary (M) value, take the max per whole second so a long
// video collapses to a bounded series, and drop the -120 "silence" sentinels.
function parseLoudnessSeries(stderr: string): LoudnessPoint[] {
  const bySec = new Map<number, number>();
  const re = /t:\s*(\d+(?:\.\d+)?)\s+TARGET:[^\n]*?M:\s*(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    const tSec = Number(m[1]);
    const lufs = Number(m[2]);
    if (!Number.isFinite(tSec) || !Number.isFinite(lufs) || lufs <= -70) continue;
    const bucket = Math.floor(tSec);
    const prev = bySec.get(bucket);
    if (prev === undefined || lufs > prev) bySec.set(bucket, lufs);
  }
  const points = [...bySec.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tSec, momentaryLufs]) => ({ tSec, momentaryLufs }));

  // Keep the series bounded for very long videos (§16 — don't blow up memory or
  // the stored JSON): downsample to at most ~1200 points, keeping the loudest
  // value in each bucket so peaks survive.
  const CAP = 1200;
  if (points.length <= CAP) return points;
  const bucketSize = Math.ceil(points.length / CAP);
  const out: LoudnessPoint[] = [];
  for (let i = 0; i < points.length; i += bucketSize) {
    const slice = points.slice(i, i + bucketSize);
    const loudest = slice.reduce((a, b) => (b.momentaryLufs > a.momentaryLufs ? b : a));
    out.push(loudest);
  }
  return out;
}

export interface CutClipOptions {
  /** Produce a 1080×1920 (9:16) output for Shorts. */
  vertical?: boolean;
  /** "center" = crop to fill 9:16 (keeps the middle of the frame, best when
   *  Vision has no subject box); "letterbox" = fit + black bars (no content lost). */
  cropMode?: "center" | "letterbox";
  /** Bare filename of an SRT sitting in the OUTPUT directory. Burned in.
   *  Only pass this when a reliable transcript exists — never fake subtitles. */
  subtitlesFileName?: string;
}

// Cut a single clip. Plain cut → stream-copy (instant, lossless); any transform
// (vertical reframe, burned subtitles) forces a re-encode. Real ffmpeg only.
export async function cutClip(
  inputPath: string,
  outPath: string,
  startSec: number,
  endSec: number,
  opts: CutClipOptions = {}
): Promise<void> {
  await ensureDir(path.dirname(outPath));
  const duration = Math.max(0.1, endSec - startSec);
  const ss = String(Math.max(0, startSec));
  const needsFilters = Boolean(opts.vertical || opts.subtitlesFileName);

  if (!needsFilters) {
    const base = ["-y", "-ss", ss, "-i", inputPath, "-t", String(duration)];
    try {
      await execFileAsync(FFMPEG_BIN, [...base, "-c", "copy", "-avoid_negative_ts", "make_zero", outPath]);
      return;
    } catch {
      await execFileAsync(FFMPEG_BIN, [
        ...base, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", outPath,
      ]);
      return;
    }
  }

  const filters: string[] = [];
  if (opts.vertical) {
    if (opts.cropMode === "letterbox") {
      filters.push(
        "scale=1080:1920:force_original_aspect_ratio=decrease",
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black"
      );
    } else {
      // center-crop the largest 9:16 region, then scale to 1080×1920
      filters.push("crop='min(iw,ih*9/16)':ih", "scale=1080:1920:flags=lanczos");
    }
  }
  if (opts.subtitlesFileName) {
    // Referenced by bare name with cwd set to the output dir — avoids the
    // Windows path-escaping minefield in the subtitles filter.
    filters.push(
      `subtitles=${opts.subtitlesFileName}:force_style='FontSize=22,Outline=2,Shadow=0,Alignment=2,MarginV=60'`
    );
  }

  await execFileAsync(
    FFMPEG_BIN,
    [
      "-y", "-ss", ss, "-i", inputPath, "-t", String(duration),
      "-vf", filters.join(","),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      outPath,
    ],
    { cwd: path.dirname(outPath), maxBuffer: 16 * 1024 * 1024 }
  );
}
