"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, AlertTriangle } from "lucide-react";
import { ALLOWED_VIDEO_EXTENSIONS, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/media/validation";
import { useT } from "@/i18n/LanguageProvider";

type State =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "error"; message: string };

export function VideoUploadForm() {
  const router = useRouter();
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ phase: "idle" });

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
    form.append("title", file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setState({ phase: "uploading", progress: Math.round((e.loaded / e.total) * 100) });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
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

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
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
          {t("upload.selectFromPc")}
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
