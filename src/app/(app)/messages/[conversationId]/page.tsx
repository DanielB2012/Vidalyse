import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getT } from "@/i18n/server";
import { getConversationDetail, listMessages, markConversationRead } from "@/lib/messages/dm";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { ConversationThread } from "@/components/messages/ConversationThread";
import { BlockButton } from "@/components/moderation/BlockButton";
import { ReportButton } from "@/components/moderation/ReportButton";
import { ArrowLeft } from "lucide-react";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const session = await auth();
  const userId = session!.user.id;
  const { t } = await getT();

  const [detail, messages] = await Promise.all([
    getConversationDetail(userId, conversationId),
    listMessages(userId, conversationId),
  ]);
  if (!detail || !messages) notFound();

  await markConversationRead(userId, conversationId);

  const displayName = detail.otherUser.displayName || `@${detail.otherUser.handle}`;

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col space-y-4">
      <LyraPageContext description={t("messages.lyraThreadContext", { name: displayName })} />

      <div className="flex items-center gap-3">
        <Link href="/messages" className="text-muted hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised">
          {detail.otherUser.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.otherUser.avatarUrl} alt="" className="h-full w-full object-cover" />
          )}
        </span>
        <Link href={`/community/profile/${detail.otherUser.handle}`} className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold hover:underline">{displayName}</p>
          <p className="truncate text-xs text-muted">@{detail.otherUser.handle}</p>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <ReportButton targetType="profile" targetId={detail.otherUser.id} compact />
          <BlockButton
            targetUserId={detail.otherUser.id}
            initialBlocked={detail.blockedByMe}
            redirectOnBlockTo="/messages"
          />
        </div>
      </div>

      <ConversationThread
        conversationId={detail.id}
        currentUserId={userId}
        initialMessages={messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      />
    </div>
  );
}
