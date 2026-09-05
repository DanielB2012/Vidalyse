"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export function CommunitySearchBar({ initialQuery = "" }: { initialQuery?: string }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (v.length >= 2) router.push(`/community/search?q=${encodeURIComponent(v)}`);
      }}
      className="flex items-center gap-2"
    >
      <div className="flex flex-1 items-center rounded-full border border-border-strong bg-surface px-4">
        <Search size={15} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("communitySearch.placeholder")}
          className="w-full bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-full border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-raised"
      >
        {t("communitySearch.submit")}
      </button>
    </form>
  );
}
