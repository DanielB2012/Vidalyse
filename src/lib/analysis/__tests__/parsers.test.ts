import { test } from "node:test";
import assert from "node:assert/strict";

import { parseModelJson } from "../json";
import { parseCrossAnalysis } from "../crossAnalysis";
import { measureHook, parseHookResponse } from "../hookAnalysis";
import { analyzeStructure, parseStructureRefinement } from "../structureAnalysis";
import { scoreHighlights } from "../highlightScoring";
import { buildTimeline } from "../timeline";
import { parseSubtitles } from "../../media/subtitles";
import { proposeShorts } from "../shortsExtraction";

// ---------------- parseModelJson (§3 — imperfect model replies) ----------------

test("parseModelJson: clean object", () => {
  assert.deepEqual(parseModelJson('{"a":1}').value, { a: 1 });
});

test("parseModelJson: fenced ```json block", () => {
  const raw = "Voici le résultat :\n```json\n{\n  \"a\": 1,\n  \"b\": [1,2]\n}\n```\nMerci.";
  assert.deepEqual(parseModelJson(raw).value, { a: 1, b: [1, 2] });
});

test("parseModelJson: prose before and after", () => {
  const raw = 'Bien sûr. {"summary":"ok"} — j\'espère que ça aide !';
  assert.deepEqual(parseModelJson(raw).value, { summary: "ok" });
});

test("parseModelJson: trailing commas are repaired", () => {
  assert.deepEqual(parseModelJson('{"a":1,"b":[1,2,],}').value, { a: 1, b: [1, 2] });
});

test("parseModelJson: brace inside a string value doesn't end the object", () => {
  const raw = '{"text":"utilise { et } dans le montage","n":2}';
  assert.deepEqual(parseModelJson(raw).value, { text: "utilise { et } dans le montage", n: 2 });
});

test("parseModelJson: smart quotes", () => {
  const raw = "{\u201Ca\u201D:\u201Cb\u201D}";
  assert.deepEqual(parseModelJson(raw).value, { a: "b" });
});

test("parseModelJson: empty / whitespace", () => {
  assert.equal(parseModelJson("").ok, false);
  assert.equal(parseModelJson("   \n ").ok, false);
});

test("parseModelJson: no JSON at all", () => {
  assert.equal(parseModelJson("Je ne peux pas répondre à cette demande.").ok, false);
});

test("parseModelJson: very long reply still parses the object", () => {
  const filler = "bla ".repeat(5000);
  const raw = `${filler}\n{"summary":"fin"}\n${filler}`;
  assert.deepEqual(parseModelJson(raw).value, { summary: "fin" });
});

// ---------------- parseCrossAnalysis ----------------

const FULL_CROSS = JSON.stringify({
  summary: "La vidéo présente un tutoriel.",
  strengths: [{ text: "Hook clair", atMs: 2000, basis: "fait" }],
  weaknesses: [{ text: "Baisse de rythme", atMs: 90000, basis: "interpretation" }],
  keyMoments: [{ atMs: 12000, text: "Révélation", why: "changement de ton" }],
  structureNotes: "Structure classique.",
  recommendations: [{ text: "Couper 01:30-01:45", atMs: 90000, rationale: "temps mort" }],
  hypotheses: ["Le titre pourrait sur-promettre"],
  crossInsights: [{ text: "silence avant la punchline", sources: ["audio", "speech"], kind: "correlation" }],
});

test("parseCrossAnalysis: full valid payload", () => {
  const r = parseCrossAnalysis(FULL_CROSS, 180);
  assert.ok(r);
  assert.equal(r!.strengths[0].basis, "fait");
  assert.equal(r!.recommendations[0].atMs, 90000);
  assert.equal(r!.crossInsights[0].kind, "correlation");
});

test("parseCrossAnalysis: markdown-wrapped", () => {
  assert.ok(parseCrossAnalysis("```json\n" + FULL_CROSS + "\n```", 180));
});

test("parseCrossAnalysis: no summary -> null", () => {
  assert.equal(parseCrossAnalysis('{"strengths":[]}', 180), null);
});

test("parseCrossAnalysis: missing arrays default to empty", () => {
  const r = parseCrossAnalysis('{"summary":"x"}', 60);
  assert.ok(r);
  assert.deepEqual(r!.strengths, []);
  assert.deepEqual(r!.hypotheses, []);
  assert.equal(r!.structureNotes, null);
});

test("parseCrossAnalysis: partially invalid entries are dropped, not fatal", () => {
  const raw = JSON.stringify({
    summary: "ok",
    strengths: [{ text: "garde", basis: "fait" }, { atMs: 5 }, { text: "" }, "nope"],
    recommendations: [{ text: "garde", rationale: "" }, { rationale: "sans texte" }],
  });
  const r = parseCrossAnalysis(raw, 60);
  assert.ok(r);
  assert.equal(r!.strengths.length, 1);
  assert.equal(r!.recommendations.length, 1);
});

test("parseCrossAnalysis: unknown basis coerced to interpretation; atMs clamped", () => {
  const raw = JSON.stringify({
    summary: "ok",
    strengths: [{ text: "t", atMs: 999999999, basis: "magic" }],
  });
  const r = parseCrossAnalysis(raw, 10); // 10s -> 10000ms cap
  assert.equal(r!.strengths[0].basis, "interpretation");
  assert.equal(r!.strengths[0].atMs, 10000);
});

test("parseCrossAnalysis: garbage -> null (never throws)", () => {
  assert.equal(parseCrossAnalysis("not json at all", 60), null);
  assert.equal(parseCrossAnalysis("", 60), null);
});

// ---------------- parseHookResponse ----------------

function baseHook() {
  return measureHook({
    durationMs: 120000,
    transcript: [{ timestampMs: 0, endTimestampMs: 4000, text: "Salut à tous, aujourd'hui gros test !" }],
    visionEvents: null,
    audioDsp: null,
    sceneDetection: null,
  });
}

test("parseHookResponse: valid enriches base", () => {
  const raw = JSON.stringify({
    promise: "Montrer un résultat",
    promiseDeliveredAtMs: 30000,
    consistency: "coherent",
    observations: ["débit rapide"],
    recommendations: ["ajouter un texte à l'écran"],
  });
  const r = parseHookResponse(raw, baseHook());
  assert.equal(r.aiUsed, true);
  assert.equal(r.consistency, "coherent");
  assert.equal(r.promiseDeliveredAtMs, 30000);
});

test("parseHookResponse: bad consistency -> indetermine, arrays tolerated", () => {
  const r = parseHookResponse('{"promise":null,"consistency":"maybe","observations":"x"}', baseHook());
  assert.equal(r.consistency, "indetermine");
  assert.deepEqual(r.observations, []);
});

test("parseHookResponse: unparseable -> base unchanged", () => {
  const b = baseHook();
  const r = parseHookResponse("désolé je ne peux pas", b);
  assert.equal(r.aiUsed, false);
  assert.equal(r, b);
});

// ---------------- parseStructureRefinement ----------------

test("parseStructureRefinement: valid segments", () => {
  const raw = JSON.stringify({
    segments: [
      { kind: "hook", startMs: 0, endMs: 15000, label: "Accroche", confidence: "elevee", basis: ["parole"] },
      { kind: "outro", startMs: 110000, endMs: 120000, label: "Fin", confidence: "faible", basis: [] },
    ],
  });
  const segs = parseStructureRefinement(raw, 120000);
  assert.equal(segs?.length, 2);
  assert.equal(segs![0].kind, "hook");
});

test("parseStructureRefinement: unknown kinds filtered, times clamped", () => {
  const raw = JSON.stringify({
    segments: [
      { kind: "banana", startMs: 0, endMs: 10 },
      { kind: "intro", startMs: -50, endMs: 9e9, confidence: "??" },
    ],
  });
  const segs = parseStructureRefinement(raw, 60000);
  assert.equal(segs?.length, 1);
  assert.equal(segs![0].startMs, 0);
  assert.equal(segs![0].endMs, 60000);
  assert.equal(segs![0].confidence, "faible");
});

test("parseStructureRefinement: empty list -> null", () => {
  assert.equal(parseStructureRefinement('{"segments":[]}', 60000), null);
  assert.equal(parseStructureRefinement("nope", 60000), null);
});

// ---------------- scoreHighlights (deterministic) ----------------

test("scoreHighlights: no signals -> note, no crash", () => {
  const r = scoreHighlights({
    durationMs: 60000,
    transcript: null,
    visionEvents: null,
    audioDsp: null,
    sceneDetection: null,
  });
  assert.ok(r.note);
  assert.deepEqual(r.highlights, []);
});

test("scoreHighlights: real signals produce scored, auditable highlights", () => {
  const transcript = Array.from({ length: 20 }, (_, i) => ({
    timestampMs: i * 3000,
    endTimestampMs: i * 3000 + 2500,
    text: i === 5 ? "ATTENTION regardez ça !!!" : "on continue tranquillement",
  }));
  const r = scoreHighlights({
    durationMs: 60000,
    transcript,
    visionEvents: [
      { timestampMs: 15000, type: "movement", description: "geste" },
      { timestampMs: 15500, type: "on_screen_text", description: "BOOM" },
    ],
    audioDsp: {
      meanVolumeDb: -20,
      maxVolumeDb: -3,
      silences: [],
      loudnessSeries: Array.from({ length: 60 }, (_, s) => ({ tSec: s, momentaryLufs: s === 15 ? -8 : -24 })),
    },
    sceneDetection: {
      method: "frame-diff",
      frameCount: 12,
      changes: [{ timestampMs: 15000, changeScore: 0.5, isCut: true }],
      meanChange: 0.1,
      note: null,
    },
  });
  assert.equal(r.note, null);
  assert.ok(r.highlights.length > 0);
  const top = r.highlights[0];
  assert.ok(top.contributions.length >= 5, "score is broken down into contributions");
  assert.ok(top.score > 0 && top.score <= 100);
});

// ---------------- analyzeStructure ----------------

test("analyzeStructure: too short -> undetermined", () => {
  const s = analyzeStructure({ durationMs: 1500, transcript: null, sceneDetection: null });
  assert.equal(s.undetermined, true);
});

test("analyzeStructure: CTA keyword in transcript is detected", () => {
  const s = analyzeStructure({
    durationMs: 120000,
    transcript: [
      { timestampMs: 1000, endTimestampMs: 4000, text: "Bienvenue" },
      { timestampMs: 100000, endTimestampMs: 104000, text: "Pensez à vous abonner et à liker la vidéo" },
    ],
    sceneDetection: null,
  });
  assert.ok(s.segments.some((seg) => seg.kind === "appel_a_action"));
});

// ---------------- buildTimeline ----------------

test("buildTimeline: merges sources, ordered by time", () => {
  const events = buildTimeline({
    durationMs: 30000,
    transcript: [{ timestampMs: 5000, endTimestampMs: 8000, text: "bonjour" }],
    visionEvents: [{ timestampMs: 1000, type: "scene_change", description: "coupe" }],
    audioDsp: { meanVolumeDb: -20, maxVolumeDb: -5, silences: [{ startSec: 20, endSec: 22 }], loudnessSeries: [] },
    sceneDetection: null,
  });
  assert.equal(events.length, 3);
  assert.ok(events[0].startMs <= events[1].startMs && events[1].startMs <= events[2].startMs);
});

// ---------------- proposeShorts (never silently changes the count) ----------------

test("proposeShorts: not enough usable moments -> ok:false with reason, count untouched", () => {
  const r = proposeShorts({
    durationMs: 20000,
    targetDurationSec: 30,
    count: 5,
    transcript: null,
    scoring: { durationMs: 20000, transcript: null, visionEvents: null, audioDsp: null, sceneDetection: null },
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.requested, 5);
    assert.ok(r.reason.length > 0);
    assert.ok(r.produced <= 5);
  }
});

// ---------------- parseSubtitles ----------------

test("parseSubtitles: SRT", () => {
  const srt = `1
00:00:01,000 --> 00:00:03,500
Bonjour tout le monde

2
00:00:04,000 --> 00:00:06,000
<i>On commence</i>
`;
  const segs = parseSubtitles(srt);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].timestampMs, 1000);
  assert.equal(segs[0].endTimestampMs, 3500);
  assert.equal(segs[1].text, "On commence");
});

test("parseSubtitles: WebVTT with header and cue tags", () => {
  const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.000
<c>Salut</c>

00:00:02.000 --> 00:00:04.000
{\\an8}les amis
`;
  const segs = parseSubtitles(vtt);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].text, "Salut");
  assert.equal(segs[1].text, "les amis");
});

test("parseSubtitles: rolling-caption duplicates collapse", () => {
  const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.000
je vais

00:00:01.000 --> 00:00:02.000
je vais vous montrer
`;
  const segs = parseSubtitles(vtt);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].text, "je vais vous montrer");
});

test("parseSubtitles: garbage -> empty array, no throw", () => {
  assert.deepEqual(parseSubtitles("pas du tout un fichier de sous-titres"), []);
});
