"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useT } from "@/i18n/LanguageProvider";
import { formatMessageTime } from "@/lib/format";
import { sendMessageAction, loadMessagesAfterAction, markReadAction } from "@/app/(app)/messages/actions";
import { ReportButton } from "@/components/moderation/ReportButton";

const POLL_MS = 3000;

interface Msg {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export function ConversationThread({
  conversationId,
  currentUserId,
  initialMessages,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: Msg[];
}) {
  const { t, locale } = useT();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  function scrollToBottom() {
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e9 }));
  }

  useEffect(() => {
    scrollToBottom();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const current = messagesRef.current;
      const lastId = current.length ? current[current.length - 1].id : null;
      try {
        const fresh = await loadMessagesAfterAction(conversationId, lastId);
        if (cancelled || fresh.length === 0) return;
        setMessages((prev) => [
          ...prev,
          ...fresh.map((m) => ({ ...m, createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt })),
        ]);
        scrollToBottom();
        if (fresh.some((m) => m.senderId !== currentUserId)) {
          markReadAction(conversationId);
        }
      } catch {
        // transient — next tick retries.
      }
    }

    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId, currentUserId]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setError(null);
    setPending(true);
    try {
      const res = await sendMessageAction(conversationId, text);
      if (res.ok) {
        const createdAt =
          res.message.createdAt instanceof Date
            ? res.message.createdAt.toISOString()
            : res.message.createdAt;
        setMessages((prev) => [...prev, { ...res.message, createdAt }]);
        scrollToBottom();
      } else {
        setError(res.error === "blocked" ? t("messages.blockedError") : t("messages.sendError"));
        setInput(text);
      }
    } catch {
      setError(t("messages.sendError"));
      setInput(text);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-surface">
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("messages.noMessagesYet")}</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div
                key={m.id}
                className={clsx("group flex items-end gap-1", mine ? "justify-end" : "justify-start")}
              >
                {!mine && (
                  <span className="opacity-0 transition group-hover:opacity-100">
                    <ReportButton targetType="message" targetId={m.id} compact />
                  </span>
                )}
                <div
                  className={clsx(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                    mine ? "bg-accent text-white" : "bg-surface-raised text-foreground"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p className={clsx("mt-1 text-[10px]", mine ? "text-white/70" : "text-muted")}>
                    {formatMessageTime(m.createdAt, locale)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
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
          placeholder={t("messages.placeholder")}
          className="min-h-[40px] max-h-32 flex-1 resize-none rounded-lg border border-border-strong bg-surface-raised/40 px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={pending || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent/60 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>

      {error && <p className="px-3 pb-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
