"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { unreadCountAction } from "@/app/(app)/messages/actions";
import { SOCIAL_ENABLED } from "@/lib/features";

const PINNED_KEY = "lyra-pinned";
const UNREAD_POLL_MS = 20000;

function readPinned(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PINNED_KEY) === "1";
  } catch {
    return false;
  }
}

// Owns the mobile sidebar drawer state, and the Lyra panel's open/pinned state
// so the main content can slide left out from behind a pinned Lyra.
export function AppShell({
  userName,
  userImage,
  userEmail,
  initialUnreadMessages = 0,
  children,
}: {
  userName: string | null;
  userImage: string | null;
  userEmail: string | null;
  initialUnreadMessages?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [lyraOpen, setLyraOpen] = useState(false);
  const [lyraPinned, setLyraPinned] = useState(readPinned);
  const [unreadMessages, setUnreadMessages] = useState(initialUnreadMessages);

  useEffect(() => {
    if (!SOCIAL_ENABLED) return;
    const interval = setInterval(() => {
      unreadCountAction()
        .then(setUnreadMessages)
        .catch(() => {});
    }, UNREAD_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  function changePinned(next: boolean) {
    setLyraPinned(next);
    try {
      localStorage.setItem(PINNED_KEY, next ? "1" : "0");
    } catch {
      // ignore — the toggle still works for this session.
    }
  }

  const shifted = lyraOpen && lyraPinned;

  return (
    <div className="flex h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} unreadMessages={unreadMessages} />
      <div
        className={clsx(
          "flex min-w-0 flex-1 flex-col overflow-hidden transition-[padding] duration-300 ease-out",
          shifted && "lg:pr-[28rem]"
        )}
      >
        <Topbar
          userName={userName}
          userImage={userImage}
          userEmail={userEmail}
          onMenuClick={() => setOpen(true)}
          lyraOpen={lyraOpen}
          onLyraOpenChange={setLyraOpen}
          lyraPinned={lyraPinned}
          onLyraPinnedChange={changePinned}
        />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
