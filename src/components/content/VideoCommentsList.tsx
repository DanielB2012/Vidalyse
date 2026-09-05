import { ThumbsUp } from "lucide-react";
import type { VideoCommentsResult } from "@/lib/youtube/comments";
import { getT } from "@/i18n/server";
import { formatCount } from "@/lib/format";

export async function VideoCommentsList({ result }: { result: VideoCommentsResult }) {
  const { t, locale } = await getT();
  const bcp47 = locale === "en" ? "en-US" : "fr-FR";

  const formatCommentDate = (iso: string | null): string => {
    if (!iso) return "";
    return new Intl.DateTimeFormat(bcp47, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  };

  if (result.status === "disabled") {
    return <p className="text-sm text-muted">{t("comments.disabled")}</p>;
  }
  if (result.status === "unavailable") {
    return <p className="text-sm text-muted">{t("comments.unavailable")}</p>;
  }
  if (result.comments.length === 0) {
    return <p className="text-sm text-muted">{t("comments.empty")}</p>;
  }

  return (
    <div className="space-y-4">
      {result.comments.map((c) => (
        <div key={c.id} className="flex gap-3">
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-raised">
            {c.authorAvatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2 text-xs">
              <span className="font-medium text-foreground">{c.authorName}</span>
              <span className="text-muted">{formatCommentDate(c.publishedAt)}</span>
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/90">{c.text}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted">
              <ThumbsUp size={11} /> {formatCount(c.likeCount, locale)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
