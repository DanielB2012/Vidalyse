// Resolve a dotted key ("settings.title") against a nested message object and
// interpolate {vars}. Missing keys fall back to the key itself so nothing ever
// renders blank.

type Vars = Record<string, string | number>;

export function translate(dict: unknown, key: string, vars?: Vars): string {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      node = undefined;
      break;
    }
  }
  let out = typeof node === "string" ? node : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
