"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { startConversationAction } from "@/app/(app)/messages/actions";

export function PersonRow({
  userId,
  displayName,
  handle,
  avatarUrl,
}: {
  userId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const res = await startConversationAction(userId);
      if (res.ok) router.push(`/messages/${res.conversationId}`);
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition hover:border-border-strong disabled:opacity-60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised">
        {avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{displayName}</span>
        <span className="block truncate text-[11px] text-muted">@{handle}</span>
      </span>
      {pending && <Loader2 size={15} className="shrink-0 animate-spin text-muted" />}
    </button>
  );
}
