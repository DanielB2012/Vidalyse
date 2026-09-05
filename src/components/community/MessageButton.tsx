"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2 } from "lucide-react";
import { startConversationAction } from "@/app/(app)/messages/actions";
import { useT } from "@/i18n/LanguageProvider";

export function MessageButton({ targetUserId }: { targetUserId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const res = await startConversationAction(targetUserId);
      if (res.ok) router.push(`/messages/${res.conversationId}`);
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-full border border-border-strong px-3.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-raised disabled:opacity-60"
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
      {t("communityProfile.message")}
    </button>
  );
}
