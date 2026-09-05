import { prisma } from "@/lib/prisma";
import { fetchOwnChannel } from "@/lib/youtube/client";

// User-filed reports against a message, a profile, or a community video.
// Always saved to the `Report` table; also best-effort posted to a Discord
// webhook (DISCORD_REPORT_WEBHOOK_URL) so it doesn't just silently sit in the
// DB — mirrors the "Signaler une erreur" flow in src/app/api/report-error,
// including never sending the reporter's email (their YouTube handle only).
// Still no moderation queue/admin UI — the DB row stays the source of truth,
// reviewable via `npx prisma studio`.

export type ReportTargetType = "message" | "profile" | "video";

const VALID_TARGET_TYPES: ReportTargetType[] = ["message", "profile", "video"];
const MAX_REASON_LENGTH = 200;
const MAX_DETAILS_LENGTH = 2000;

const TARGET_LABEL: Record<ReportTargetType, string> = {
  message: "Message privé",
  profile: "Profil",
  video: "Vidéo communautaire",
};

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
}

export type CreateReportResult = { ok: true } | { ok: false; error: "invalid" };

export async function createReport(
  reporterId: string,
  input: CreateReportInput
): Promise<CreateReportResult> {
  if (!VALID_TARGET_TYPES.includes(input.targetType) || !input.targetId.trim()) {
    return { ok: false, error: "invalid" };
  }
  const reason = input.reason.trim().slice(0, MAX_REASON_LENGTH);
  if (!reason) return { ok: false, error: "invalid" };

  const details = input.details?.trim().slice(0, MAX_DETAILS_LENGTH) || null;

  await prisma.report.create({
    data: { reporterId, targetType: input.targetType, targetId: input.targetId, reason, details },
  });

  await notifyDiscord(reporterId, { ...input, reason, details }).catch((err) =>
    console.error("[report] discord notification failed", err)
  );

  return { ok: true };
}

// Fetches a bit of context per target type so the Discord message is
// actionable on its own, without opening Prisma Studio for every report.
async function targetContext(targetType: ReportTargetType, targetId: string): Promise<string | null> {
  if (targetType === "message") {
    const msg = await prisma.directMessage.findUnique({
      where: { id: targetId },
      select: { content: true, sender: { select: { publicProfile: { select: { handle: true } } } } },
    });
    if (!msg) return null;
    const from = msg.sender.publicProfile?.handle ? `@${msg.sender.publicProfile.handle}` : "?";
    return `${from} : "${msg.content.slice(0, 500)}"`;
  }
  if (targetType === "profile") {
    const profile = await prisma.publicProfile.findUnique({
      where: { userId: targetId },
      select: { handle: true, displayName: true },
    });
    return profile ? `@${profile.handle}${profile.displayName ? ` (${profile.displayName})` : ""}` : null;
  }
  const video = await prisma.publicVideo.findUnique({ where: { publicId: targetId }, select: { title: true } });
  return video?.title ?? null;
}

async function notifyDiscord(
  reporterId: string,
  input: { targetType: ReportTargetType; targetId: string; reason: string; details: string | null }
): Promise<void> {
  const webhookUrl = process.env.DISCORD_REPORT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn("[report] DISCORD_REPORT_WEBHOOK_URL not configured — report saved to DB only.");
    return;
  }
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhookUrl)) {
    console.error("[report] DISCORD_REPORT_WEBHOOK_URL doesn't look like a Discord webhook URL.");
    return;
  }

  const [channel, context] = await Promise.all([
    fetchOwnChannel(reporterId).catch(() => null),
    targetContext(input.targetType, input.targetId).catch(() => null),
  ]);
  // Never the account email in a message posted to a channel other people
  // can read — identify the reporter by their YouTube handle instead.
  const reporter = channel?.handle ?? channel?.title ?? "Utilisateur Vidalyse (chaîne non connectée)";

  const fields = [
    { name: "Signalé par", value: reporter, inline: true },
    { name: "Cible", value: context ?? `${input.targetType}:${input.targetId}`, inline: true },
  ];
  if (input.details) fields.push({ name: "Détails", value: input.details.slice(0, 1024), inline: false });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Only meaningful if the webhook targets a forum/media channel — in
      // that case Discord requires a thread name to create the post; a
      // normal text-channel webhook ignores this field.
      thread_name: `🚩 ${TARGET_LABEL[input.targetType]} — ${reporter}`.slice(0, 100),
      embeds: [
        {
          title: `🚩 Signalement — ${TARGET_LABEL[input.targetType]}`,
          description: input.reason,
          color: 0xfb7185,
          fields,
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[report] discord webhook failed", res.status, body);
  }
}
