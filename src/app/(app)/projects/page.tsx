import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getT } from "@/i18n/server";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { ProjectStatusSelect } from "@/components/projects/ProjectStatusSelect";
import { createProject } from "./actions";

export default async function ProjectsPage() {
  const session = await auth();
  const { t } = await getT();
  const projects = await prisma.project.findMany({
    where: { userId: session!.user.id },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <LyraPageContext description={t("projects.lyraContext")} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("projects.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("projects.subtitle")}</p>
      </div>

      <form
        action={createProject}
        className="space-y-3 rounded-2xl border border-border bg-surface p-5"
      >
        <input
          name="title"
          required
          placeholder={t("projects.titlePlaceholder")}
          className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm placeholder:text-muted"
        />
        <textarea
          name="notes"
          placeholder={t("projects.notesPlaceholder")}
          className="h-20 w-full resize-none rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm placeholder:text-muted"
        />
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          {t("projects.add")}
        </button>
      </form>

      <div className="space-y-3">
        {projects.length === 0 && (
          <p className="text-sm text-muted">{t("projects.empty")}</p>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4"
          >
            <div>
              <p className="text-sm font-medium">{p.title}</p>
              {p.notes && <p className="mt-1 text-xs text-muted">{p.notes}</p>}
            </div>
            <ProjectStatusSelect projectId={p.id} status={p.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
