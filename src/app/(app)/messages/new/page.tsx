import Link from "next/link";
import { auth } from "@/auth";
import { getT } from "@/i18n/server";
import { listPublicCreators } from "@/lib/community/directory";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { PeopleSearchBar } from "@/components/messages/PeopleSearchBar";
import { PersonRow } from "@/components/messages/PersonRow";
import { ArrowLeft, Users } from "lucide-react";

export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const session = await auth();
  const userId = session!.user.id;
  const { t } = await getT();

  const people = await listPublicCreators({ excludeUserId: userId, q, limit: 30 });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <LyraPageContext description={t("messages.lyraNewContext")} />

      <Link href="/messages" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} />
        {t("messages.back")}
      </Link>

      <h1 className="text-xl font-semibold tracking-tight">{t("messages.findTitle")}</h1>

      <PeopleSearchBar initialQuery={q} />

      {people.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface/50 p-8 text-center">
          <Users className="mx-auto mb-2 text-muted" size={28} />
          <p className="text-sm text-muted">
            {q.length > 0 ? t("messages.searchEmpty", { q }) : t("messages.searchBrowseEmpty")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {people.map((p) => (
            <PersonRow
              key={p.userId}
              userId={p.userId}
              displayName={p.displayName || `@${p.handle}`}
              handle={p.handle}
              avatarUrl={p.avatarUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}
