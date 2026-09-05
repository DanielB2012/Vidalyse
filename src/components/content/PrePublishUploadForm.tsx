"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, AlertTriangle, Loader2 } from "lucide-react";
import { ALLOWED_VIDEO_EXTENSIONS, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/media/validation";
import { useT } from "@/i18n/LanguageProvider";

type State =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "analyzing" }
  | { phase: "error"; message: string };

// Independent "Analyser avant publication" flow (§10): a video NOT published on
// YouTube, plus its planned title/description. Uploads, then auto-starts the
// analysis and lands on the result page (pre-publish tab first).
export function PrePublishUploadForm() {
  const router = useRouter();
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [plannedTitle, setPlannedTitle] = useState("");
  const [plannedDescription, setPlannedDescription] = useState("");

  function handleFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setState({
        phase: "error",
        message: t("upload.fileTooLarge", {
          size: formatBytes(file.size),
          limit: formatBytes(MAX_UPLOAD_BYTES),
        }),
      });
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("title", plannedTitle.trim() || file.name);
    form.append("purpose", "pre_publish");
    form.append("plannedTitle", plannedTitle.trim());
    form.append("plannedDescription", plannedDescription.trim());

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setState({ phase: "uploading", progress: Math.round((e.loaded / e.total) * 100) });
      }
    };
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        setState({ phase: "analyzing" });
        // Kick off the analysis immediately so the result is ready on arrival.
        await fetch(`/api/videos/${data.id}/analyze`, { method: "POST" }).catch(() => {});
        router.push(`/content/${data.id}`);
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          setState({ phase: "error", message: data.error ?? t("upload.importFailed") });
        } catch {
          setState({ phase: "error", message: t("upload.importFailed") });
        }
      }
    };
    xhr.onerror = () => setState({ phase: "error", message: t("upload.importNetworkError") });
    setState({ phase: "uploading", progress: 0 });
    xhr.send(form);
  }

  const busy = state.phase === "uploading" || state.phase === "analyzing";

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-6">
      <div className="space-y-3">
        <label className="block text-xs text-muted">
          {t("upload.plannedTitle")}{" "}
          <span className="text-muted/70">{t("upload.plannedTitleHint")}</span>
          <input
            value={plannedTitle}
            onChange={(e) => setPlannedTitle(e.target.value)}
            disabled={busy}
            placeholder={t("upload.plannedTitlePlaceholder")}
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
        </label>
        <label className="block text-xs text-muted">
          {t("upload.plannedDescription")}{" "}
          <span className="text-muted/70">{t("upload.plannedDescriptionHint")}</span>
          <textarea
            value={plannedDescription}
            onChange={(e) => setPlannedDescription(e.target.value)}
            disabled={busy}
            placeholder={t("upload.plannedDescriptionPlaceholder")}
            className="mt-1 h-20 w-full resize-none rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
        </label>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_VIDEO_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {state.phase === "idle" && (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-raised/40 py-10 text-sm text-muted transition hover:border-accent/60 hover:text-foreground"
        >
          <UploadCloud size={24} className="text-accent" />
          {t("upload.selectUnpublished")}
          <span className="text-xs">
            {t("upload.formats", {
              formats: ALLOWED_VIDEO_EXTENSIONS.join(", "),
              limit: formatBytes(MAX_UPLOAD_BYTES),
            })}
          </span>
        </button>
      )}

      {state.phase === "uploading" && (
        <div className="py-6">
          <p className="mb-2 text-sm text-muted">{t("upload.importing", { progress: state.progress })}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full gradient-ring transition-all" style={{ width: `${state.progress}%` }} />
          </div>
        </div>
      )}

      {state.phase === "analyzing" && (
        <p className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> {t("upload.importDoneStarting")}
        </p>
      )}

      {state.phase === "error" && (
        <div className="space-y-3 py-4">
          <p className="flex items-start gap-2 text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {state.message}
          </p>
          <button
            onClick={() => setState({ phase: "idle" })}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-xs"
          >
            {t("upload.retry")}
          </button>
        </div>
      )}
    </div>
  );
}
