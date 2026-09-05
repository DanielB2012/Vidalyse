// Robust extraction of the first JSON object from a language-model reply.
// Gemini / Ollama frequently wrap JSON in ```json fences, prepend "Voici le
// JSON :", append a trailing comment, or emit trailing commas. This isolates a
// single balanced `{...}` block and repairs the most common syntactic noise so
// the analysis never crashes on an imperfect reply (§3 — always degrade
// cleanly).

function stripFences(text: string): string {
  // ```json ... ``` or ``` ... ```
  const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return fence ? fence[1] : text;
}

// Walk from the first `{` and return the substring up to its matching `}`,
// respecting strings and escapes so a `}` inside a string value doesn't end it.
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function repairCommonNoise(json: string): string {
  return json
    // trailing commas before } or ]
    .replace(/,(\s*[}\]])/g, "$1")
    // JS-style // comments on their own or trailing
    .replace(/(^|[^:])\/\/[^\n\r]*/g, "$1")
    // smart quotes a small model sometimes emits
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

export interface ParsedJson<T = Record<string, unknown>> {
  ok: boolean;
  value: T | null;
  /** Why parsing failed, for logging (never shown raw to end users). */
  error: string | null;
}

export function parseModelJson<T = Record<string, unknown>>(raw: string): ParsedJson<T> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, value: null, error: "réponse vide" };
  }
  const candidates = [
    () => firstBalancedObject(stripFences(raw)),
    () => firstBalancedObject(raw),
    () => {
      const m = raw.match(/\{[\s\S]*\}/);
      return m ? m[0] : null;
    },
  ];

  for (const get of candidates) {
    const block = get();
    if (!block) continue;
    for (const text of [block, repairCommonNoise(block)]) {
      try {
        const value = JSON.parse(text) as T;
        if (value && typeof value === "object") return { ok: true, value, error: null };
      } catch {
        // try next repair / candidate
      }
    }
  }
  return { ok: false, value: null, error: "aucun objet JSON exploitable dans la réponse" };
}

// Coercion helpers shared by the analysis parsers.
export function asString(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t.slice(0, max) : null;
}

export function asFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function asStringArray(v: unknown, maxItems = 20, maxLen = 400): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => asString(x, maxLen))
    .filter((x): x is string => x !== null)
    .slice(0, maxItems);
}

export function clampMs(v: unknown, durationMs: number): number | null {
  const n = asFiniteNumber(v);
  if (n === null) return null;
  return Math.max(0, Math.min(Math.max(durationMs, 0) || n, Math.round(n)));
}
