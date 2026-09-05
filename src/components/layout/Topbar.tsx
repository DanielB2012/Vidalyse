"use client";

import { Menu } from "lucide-react";
import { LyraButton } from "@/components/lyra/LyraButton";
import { LyraPanel } from "@/components/lyra/LyraPanel";
import { ProfileMenu } from "./ProfileMenu";
import { useT } from "@/i18n/LanguageProvider";

export function Topbar({
  userName,
  userImage,
  userEmail,
  onMenuClick,
  lyraOpen,
  onLyraOpenChange,
  lyraPinned,
  onLyraPinnedChange,
}: {
  userName: string | null;
  userImage: string | null;
  userEmail: string | null;
  onMenuClick?: () => void;
  lyraOpen: boolean;
  onLyraOpenChange: (open: boolean) => void;
  lyraPinned: boolean;
  onLyraPinnedChange: (pinned: boolean) => void;
}) {
  const { t } = useT();

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
        <button
          onClick={onMenuClick}
          aria-label={t("nav.openMenu")}
          className="rounded-lg border border-border p-1.5 text-muted hover:text-foreground lg:hidden"
        >
          <Menu size={18} />
        </button>
        <div className="hidden lg:block" />
        <div className="flex items-center gap-3">
          <LyraButton onClick={() => onLyraOpenChange(true)} />
          <ProfileMenu userName={userName} userImage={userImage} userEmail={userEmail} />
        </div>
      </header>

      <LyraPanel
        open={lyraOpen}
        onClose={() => onLyraOpenChange(false)}
        pinned={lyraPinned}
        onPinnedChange={onLyraPinnedChange}
      />
    </>
  );
}
