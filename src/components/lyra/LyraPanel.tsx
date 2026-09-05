"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Sparkles, Pin, PinOff, Check, Ban } from "lucide-react";
import clsx from "clsx";
import { useLyraDescription } from "./LyraContext";
import { Markdown } from "@/components/ui/Markdown";
import { useT } from "@/i18n/LanguageProvider";
import { applyTheme } from "@/lib/theme";
import type { LyraClientAction, PendingAction } from "@/lib/ai/lyra-actions";

interface ChatMessage {
  role: "user" | "assistant" | "error" | "actions";
  content: string;
  displayed: string;
  actions?: PendingAction[];
  resolved?: "accepted" | "refused";
}

const TYPE_CHARS_PER_TICK = 3;
const TYPE_INTERVAL_MS = 15;
const FULL_ACCESS_STORAGE_KEY = "lyra-full-access";
const AUTO_APPROVE_STORAGE_KEY = "lyra-auto-approve";

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore — the toggle still works for this session.
  }
}

function Switch({
  checked,
  onChange,
  label,
  title,
  tone = "accent",
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  title?: string;
  tone?: "accent" | "warning";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      title={title}
      className="flex items-center gap-2 text-[11px]"
    >
      <span
        className={clsx(
          "inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
          checked ? (tone === "warning" ? "bg-warning" : "bg-accent") : "bg-border-strong"
        )}
      >
        <span
          className={clsx(
            "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </span>
      <span className={checked ? "text-foreground" : "text-muted"}>{label}</span>
    </button>
  );
}

export function LyraPanel({
  open,
  onClose,
  pinned,
  onPinnedChange,
}: {
  open: boolean;
  onClose: () => void;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
}) {
  const { t, setLocale } = useT();
  const router = useRouter();
  const description = useLyraDescription();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fullAccess, setFullAccess] = useState(() => readFlag(FULL_ACCESS_STORAGE_KEY));
  const [autoApprove, setAutoApprove] = useState(() => readFlag(AUTO_APPROVE_STORAGE_KEY));
  const [logoFailed, setLogoFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function autoGrow() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  function toggleFullAccess() {
    setFullAccess((prev) => {
      writeFlag(FULL_ACCESS_STORAGE_KEY, !prev);
      return !prev;
    });
  }
  function toggleAutoApprove() {
    setAutoApprove((prev) => {
      writeFlag(AUTO_APPROVE_STORAGE_KEY, !prev);
      return !prev;
    });
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Lyra can change theme / language / route — the server can't touch the
  // browser, so it hands these back for us to run. Only theme/language/navigate
  // ever arrive here.
  function runClientActions(actions: LyraClientAction[] | undefined) {
    for (const action of actions ?? []) {
      if (action.type === "theme") applyTheme(action.value);
      else if (action.type === "language") setLocale(action.value);
      else if (action.type === "navigate" && action.value.startsWith("/")) router.push(action.value);
    }
  }

  function pushAssistantNote(text: string) {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "assistant", content: text, displayed: text }]);
  }

  async function acceptPending(index: number) {
    const msg = messages[index];
    if (!msg?.actions || msg.resolved) return;
    setMessages((m) => m.map((x, i) => (i === index ? { ...x, resolved: "accepted" } : x)));
    try {
      const res = await fetch("/api/lyra/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: msg.actions, fullAccess }),
      });
      const data = await res.json();
      runClientActions(data.clientActions);
      pushAssistantNote(
        [t("lyra.applied"), ...((data.notes as string[]) ?? [])].map((n) => `- ${n}`).join("\n")
      );
    } catch {
      pushAssistantNote(t("lyra.cannotReach"));
    }
  }

  function refusePending(index: number) {
    setMessages((m) => m.map((x, i) => (i === index ? { ...x, resolved: "refused" } : x)));
    pushAssistantNote(t("lyra.cancelled"));
  }

  // Reveal the last assistant reply progressively — purely a display effect.
  useEffect(() => {
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    const lastIndex = messages.length - 1;
    const last = messages[lastIndex];
    if (!last || last.role !== "assistant" || last.displayed.length >= last.content.length) return;

    typingIntervalRef.current = setInterval(() => {
      setMessages((current) => {
        const target = current[lastIndex];
        if (!target || target.displayed.length >= target.content.length) {
          if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
          return current;
        }
        const nextDisplayed = target.content.slice(0, target.displayed.length + TYPE_CHARS_PER_TICK);
        const updated = [...current];
        updated[lastIndex] = { ...target, displayed: nextDisplayed };
        return updated;
      });
    }, TYPE_INTERVAL_MS);

    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  async function send() {
    const message = input.trim();
    if (!message || loading) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    setMessages((m) => [...m, { role: "user", content: message, displayed: message }]);
    setLoading(true);
    try {
      const res = await fetch("/api/lyra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context: description, history, fullAccess, autoApprove }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errText = data.error ?? t("lyra.unknownError");
        setMessages((m) => [...m, { role: "error", content: errText, displayed: errText }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply, displayed: "" }]);
        const pending = data.pendingActions as PendingAction[] | undefined;
        if (pending && pending.length > 0) {
          setMessages((m) => [...m, { role: "actions", content: "", displayed: "", actions: pending }]);
        } else {
          runClientActions(data.clientActions);
        }
      }
    } catch {
      const errText = t("lyra.cannotReach");
      setMessages((m) => [...m, { role: "error", content: errText, displayed: errText }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const panel = (
    <div
      className="flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {logoFailed ? (
            <Sparkles size={18} className="text-accent" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/logo-lyra.png"
              alt="Lyra"
              className="h-6 w-6 object-contain"
              onError={() => setLogoFailed(true)}
            />
          )}
          <span className="font-semibold">Lyra</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPinnedChange(!pinned)}
            title={pinned ? t("lyra.unpinTitle") : t("lyra.pinTitle")}
            aria-label={pinned ? t("lyra.unpinAria") : t("lyra.pinAria")}
            className={`rounded-full border p-1.5 transition ${
              pinned ? "border-accent/60 bg-accent/15 text-accent" : "border-border-strong text-muted hover:border-accent/40"
            }`}
          >
            {pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>
          <button onClick={onClose} aria-label={t("lyra.close")} className="text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-4 py-2.5">
        <Switch
          checked={fullAccess}
          onChange={toggleFullAccess}
          label={`${t("lyra.fullAccess")} ${fullAccess ? t("lyra.on") : t("lyra.off")}`}
          title={fullAccess ? t("lyra.fullAccessOnTitle") : t("lyra.fullAccessOffTitle")}
        />
        <Switch
          checked={autoApprove}
          onChange={toggleAutoApprove}
          tone="warning"
          label={`${t("lyra.autoLabel")} ${autoApprove ? t("lyra.on") : t("lyra.off")}`}
          title={autoApprove ? t("lyra.autoOnTitle") : t("lyra.autoOffTitle")}
        />
      </div>

        {description && (
          <div className="border-b border-border bg-surface-raised/60 px-5 py-2 text-xs text-muted">
            {t("lyra.contextPrefix", { context: description })}
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]"
        >
          {messages.length === 0 && (
            <p className="text-sm text-muted">{t("lyra.emptyState")}</p>
          )}
          {messages.map((m, i) => {
            if (m.role === "actions") {
              return (
                <div
                  key={i}
                  className="mr-4 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm"
                >
                  <p className="mb-2 text-xs font-semibold text-accent">{t("lyra.willDo")}</p>
                  <ul className="mb-3 list-disc space-y-1 pl-5 text-[13px]">
                    {(m.actions ?? []).map((a, ai) => (
                      <li key={ai}>{a.label}</li>
                    ))}
                  </ul>
                  {m.resolved ? (
                    <p
                      className={`flex items-center gap-1.5 text-xs ${
                        m.resolved === "accepted" ? "text-success" : "text-muted"
                      }`}
                    >
                      {m.resolved === "accepted" ? <Check size={13} /> : <Ban size={13} />}
                      {m.resolved === "accepted" ? t("lyra.applied") : t("lyra.cancelled")}
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptPending(i)}
                        className="flex items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25"
                      >
                        <Check size={13} /> {t("lyra.accept")}
                      </button>
                      <button
                        onClick={() => refusePending(i)}
                        className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-muted hover:text-foreground"
                      >
                        <Ban size={13} /> {t("lyra.refuse")}
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-8 whitespace-pre-wrap rounded-xl rounded-br-sm bg-accent/20 px-4 py-2.5 text-sm"
                    : m.role === "error"
                      ? "mr-8 whitespace-pre-wrap rounded-xl rounded-bl-sm border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger"
                      : "mr-8 rounded-xl rounded-bl-sm border border-border bg-surface-raised px-4 py-2.5 text-sm"
                }
              >
                {m.role === "assistant" ? <Markdown>{m.displayed}</Markdown> : m.content}
              </div>
            );
          })}
          {loading && <div className="mr-8 text-sm text-muted">{t("lyra.thinking")}</div>}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2 rounded-xl border border-border-strong bg-surface-raised px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoGrow();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
                // Shift+Enter: let the newline through.
              }}
              rows={1}
              placeholder={t("lyra.inputPlaceholder")}
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted"
            />
            <button
              onClick={send}
              aria-label={t("lyra.send")}
              className="mb-0.5 shrink-0 text-accent disabled:opacity-40"
              disabled={loading}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
  );

  // Pinned: no full-screen backdrop, so the rest of the app stays clickable.
  // Explicit width (matches the panel's max-w-md and AppShell's lg:pr-[28rem])
  // so the panel never resizes as messages come in.
  if (pinned) {
    return <div className="fixed right-0 top-0 z-40 h-full w-full max-w-md">{panel}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      {panel}
    </div>
  );
}
