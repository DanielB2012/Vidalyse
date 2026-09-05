import Link from "next/link";
import { auth } from "@/auth";
import { getT } from "@/i18n/server";
import { listConversations } from "@/lib/messages/dm";
import { formatMessageTime } from "@/lib/format";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { MessageCircle, SquarePen } from "lucide-react";

export default async function MessagesPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { t, locale } = await getT();

  const conversations = await listConversations(userId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <LyraPageContext description={t("messages.lyraContext")} />

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{t("messages.title")}</h1>
        <Link
          href="/messages/new"
          className="flex items-center gap-1.5 rounded-full border border-border-strong px-3.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-raised"
        >
          <SquarePen size={13} />
          {t("messages.newMessage")}
        </Link>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface/50 p-8 text-center">
          <MessageCircle className="mx-auto mb-2 text-muted" size={28} />
          <p className="text-sm text-muted">{t("messages.empty")}</p>
          <Link href="/messages/new" className="mt-2 inline-block text-sm text-accent hover:underline">
            {t("messages.emptyHint")}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {conversations.map((c) => {
            const displayName = c.otherUser.displayName || `@${c.otherUser.handle}`;
            return (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  className="flex items-center gap-3 p-4 transition hover:bg-surface-raised/60"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised">
                    {c.otherUser.avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.otherUser.avatarUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{displayName}</span>
                      {c.lastMessage && (
                        <span className="shrink-0 text-[11px] text-muted">
                          {formatMessageTime(c.lastMessage.createdAt.toISOString(), locale)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted">
                        {c.lastMessage
                          ? `${c.lastMessage.fromMe ? `${t("messages.you")} ` : ""}${c.lastMessage.content}`
                          : t("messages.noMessagesYet")}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
