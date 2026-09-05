"use client";

import { useTransition } from "react";
import { updateProjectStatus } from "@/app/(app)/projects/actions";
import { useT } from "@/i18n/LanguageProvider";

const STATUSES = ["IDEA", "IN_PROGRESS", "READY", "PUBLISHED"] as const;
const LABEL_KEY: Record<(typeof STATUSES)[number], string> = {
  IDEA: "projects.statusIdea",
  IN_PROGRESS: "projects.statusInProgress",
  READY: "projects.statusReady",
  PUBLISHED: "projects.statusPublished",
};

export function ProjectStatusSelect({ projectId, status }: { projectId: string; status: string }) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => startTransition(() => updateProjectStatus(projectId, e.target.value))}
      className="rounded-lg border border-border-strong bg-surface-raised px-2 py-1 text-xs"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {t(LABEL_KEY[s])}
        </option>
      ))}
    </select>
  );
}
