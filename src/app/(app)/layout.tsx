import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { LyraContextProvider } from "@/components/lyra/LyraContext";
import { ReportErrorButton } from "@/components/layout/ReportErrorButton";
import { totalUnreadCount } from "@/lib/messages/dm";
import { SOCIAL_ENABLED } from "@/lib/features";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id;

  // The top-right menu shows the YouTube *channel* (name + avatar), not the
  // Google account. The channel is a cached snapshot (filled once the dashboard
  // loads); fall back to the Google account until it exists.
  const [channel, unreadMessages] = await Promise.all([
    userId
      ? prisma.channel.findUnique({
          where: { userId },
          select: { title: true, thumbnailUrl: true },
        })
      : null,
    userId && SOCIAL_ENABLED ? totalUnreadCount(userId) : Promise.resolve(0),
  ]);

  return (
    <LyraContextProvider>
      <AppShell
        userName={channel?.title ?? session?.user?.name ?? null}
        userImage={channel?.thumbnailUrl ?? session?.user?.image ?? null}
        userEmail={session?.user?.email ?? null}
        initialUnreadMessages={unreadMessages}
      >
        {children}
      </AppShell>
      <ReportErrorButton />
    </LyraContextProvider>
  );
}
