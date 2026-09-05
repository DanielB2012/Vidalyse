"use client";

import { useRef, useState } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { useT } from "@/i18n/LanguageProvider";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

// Inline chat scoped to one analysed video: it talks to the same assistant
// (/api/lyra) but seeded only with this video's analysis (transcript,
// synthèse, résumé) as context.
export function VideoChat({ context, title }: { context: string; title: string | null }) {
  const { t } = useT();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setPending(true);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e9 }));
    try {
      const res = await fetch("/api/lyra", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          videoScoped: true,
          context: title
            ? `${t("chat.videoTitleLine", { title })}\n\n${context}`
            : context,
          history: next.slice(-10),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("chat.noReply"));
      } else {
        setMessages([...next, { role: "assistant", content: data.reply ?? "" }]);
      }
    } catch {
      setError(t("chat.networkError"));
    } finally {
      setPending(false);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e9 }));
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface-raised/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
        <Sparkles size={12} />
        {t("chat.askAi")}
      </p>

      {messages.length > 0 && (
        <div ref={listRef} className="mb-2 max-h-56 space-y-2 overflow-y-auto pr-1 text-sm">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-6 whitespace-pre-wrap rounded-lg bg-accent/10 px-2.5 py-1.5 leading-relaxed text-foreground"
                  : "mr-6 rounded-lg bg-surface px-2.5 py-1.5 text-foreground"
              }
            >
              {m.role === "user" ? m.content : <Markdown>{m.content}</Markdown>}
            </div>
          ))}
          {pending && (
            <div className="mr-6 flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-muted">
              <Loader2 size={13} className="animate-spin" /> …
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={t("chat.placeholder")}
          className="min-h-[36px] max-h-28 flex-1 resize-none rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={pending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/60 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>

      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
