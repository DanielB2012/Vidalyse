import fs from "node:fs/promises";
import type { TranscriptSegment } from "@/lib/pipeline/types";

// Parses SRT or WebVTT subtitle text into the same TranscriptSegment shape the
// Whisper path produces, so downstream code is source-agnostic. These are the
// creator's OWN captions when present — far more reliable than local ASR.

function toMs(h: string, m: string, s: string, ms: string): number {
  return (
    parseInt(h, 10) * 3_600_000 +
    parseInt(m, 10) * 60_000 +
    parseInt(s, 10) * 1000 +
    parseInt(ms.padEnd(3, "0").slice(0, 3), 10)
  );
}

const CUE_TIME =
  /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/;

export function parseSubtitles(raw: string): TranscriptSegment[] {
  // Normalise line endings, strip a BOM and the "WEBVTT" header block.
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const segments: TranscriptSegment[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    const timeLineIdx = lines.findIndex((l) => CUE_TIME.test(l));
    if (timeLineIdx === -1) continue;

    const m = CUE_TIME.exec(lines[timeLineIdx])!;
    const startMs = toMs(m[1], m[2], m[3], m[4]);
    const endMs = toMs(m[5], m[6], m[7], m[8]);

    const body = lines
      .slice(timeLineIdx + 1)
      .join(" ")
      // strip VTT/SRT inline tags (<c>, <v Roger>, <i>, {\an8}, etc.)
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^}]+\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!body) continue;

    segments.push({ timestampMs: startMs, endTimestampMs: Math.max(endMs, startMs), text: body });
  }

  // YouTube auto-caption exports repeat each line as it "rolls up"; collapse
  // consecutive identical / prefix-duplicated cues.
  const deduped: TranscriptSegment[] = [];
  for (const seg of segments.sort((a, b) => a.timestampMs - b.timestampMs)) {
    const prev = deduped[deduped.length - 1];
    if (prev && (prev.text === seg.text || seg.text.startsWith(prev.text))) {
      prev.text = seg.text;
      prev.endTimestampMs = seg.endTimestampMs;
      continue;
    }
    deduped.push({ ...seg });
  }
  return deduped;
}

export async function parseSubtitleFile(filePath: string): Promise<TranscriptSegment[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return parseSubtitles(raw);
}
