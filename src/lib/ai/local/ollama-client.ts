// Real local runtime (spec §14): Ollama exposes a plain HTTP API on
// localhost when installed and running — no API key, fully offline, fully
// free. Verified against https://github.com/ollama/ollama/blob/main/docs/api.md
// before writing this. If the daemon isn't running or the model isn't
// pulled, calls fail with a clear, honest error — never a fabricated result.
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export async function isOllamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

interface OllamaTagsResponse {
  models?: { name: string }[];
}

// Real installed-model list straight from Ollama's own tags endpoint — never
// inferred/cached, so "installé" in the UI always reflects the daemon's
// actual state.
export async function listInstalledOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return [];
    const data = (await res.json()) as OllamaTagsResponse;
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

// Ollama tags always carry a version, e.g. "moondream:latest" — our catalog
// stores the bare "moondream" for the default tag, so compare with that
// normalized against both sides.
export function isOllamaModelInstalled(installedNames: string[], runtimeModelId: string): boolean {
  const normalize = (name: string) => (name.includes(":") ? name : `${name}:latest`);
  const target = normalize(runtimeModelId);
  return installedNames.some((name) => normalize(name) === target);
}

export async function deleteOllamaModel(model: string): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Ollama a répondu avec le statut ${res.status}.`);
  }
}

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[]; // base64, no data: prefix
}

interface OllamaChatResponse {
  message?: { role: string; content: string };
  error?: string;
}

export async function ollamaChat(
  model: string,
  messages: OllamaMessage[],
  options?: Record<string, number>
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false, options }),
      signal: AbortSignal.timeout(300_000),
    });
  } catch {
    throw new Error(
      `Ollama n'est pas accessible sur ${OLLAMA_BASE_URL}. Vérifie qu'Ollama est installé et lancé.`
    );
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as OllamaChatResponse | null;
    throw new Error(
      body?.error
        ? `Erreur Ollama : ${body.error}`
        : `Ollama a répondu avec le statut ${res.status}. Le modèle "${model}" est-il bien téléchargé (ollama pull ${model}) ?`
    );
  }

  const data = (await res.json()) as OllamaChatResponse;
  return data.message?.content ?? "";
}
