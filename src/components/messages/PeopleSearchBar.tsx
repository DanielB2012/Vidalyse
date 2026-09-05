"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export function PeopleSearchBar({ initialQuery = "" }: { initialQuery?: string }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        router.push(v ? `/messages/new?q=${encodeURIComponent(v)}` : "/messages/new");
      }}
      className="flex items-center gap-2"
    >
      <div className="flex flex-1 items-center rounded-full border border-border-strong bg-surface px-4">
        <Search size={15} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("messages.searchPlaceholder")}
          className="w-full bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted"
          autoFocus
        />
      </div>
    </form>
  );
}
