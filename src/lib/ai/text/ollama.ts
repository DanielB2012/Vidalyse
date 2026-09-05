import { ollamaChat, isOllamaReachable } from "@/lib/ai/local/ollama-client";

export { isOllamaReachable as isOllamaTextReachable };

export async function runOllamaText(params: {
  model: string;
  systemPrompt: string;
  userMessage: string;
}): Promise<string> {
  // Transcript + vision events can make the synthesis prompt long; raise the
  // context window past Ollama's 4096 default so it isn't silently truncated.
  return ollamaChat(
    params.model,
    [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessage },
    ],
    { num_ctx: 8192 }
  );
}
