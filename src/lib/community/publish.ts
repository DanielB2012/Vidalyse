import { prisma } from "@/lib/prisma";
import { loadLatestResult, type LoadResult } from "@/lib/analysis/loadResult";

type LoadedOk = Extract<LoadResult, { error: null }>;

// "Publier dans la communauté" (§13 Phase A). A video is NEVER published
// automatically — only through the explicit action wired to this module. What
// becomes public is a snapshot taken here, at publish time, from the video's
// most recent COMPLETED analysis: title, AI recap, thumbnail and a short list of
// strengths / key moments / structure. No private field (file paths, provider
// config, raw transcript, YouTube private metrics, logs) is ever copied in.

export interface PublicVideoPayload {
  strengths: { text: string; atMs: number | null }[];
  keyMoments: { atMs: number; text: string }[];
  /** StructureSegment kinds, in order — e.g. ["hook","developpement","outro"]. */
  structure: string[];
  durationSec: number | null;
  /** So the feed can label an auto-transcription honestly (§8). */
  transcriptSource: string | null;
}

export type PublishResult =
  | { ok: true; publicId: string }
  | { ok: false; error: "not_found" | "no_analysis" };

function buildPayload(loaded: LoadedOk): PublicVideoPayload {
  const cross = loaded.result.enriched?.cross ?? null;
  const structure = loaded.result.enriched?.structure ?? null;
  return {
    strengths: (cross?.strengths ?? [])
      .filter((s) => s.text?.trim())
      .slice(0, 6)
      .map((s) => ({ text: s.text.trim().slice(0, 280), atMs: s.atMs ?? null })),
    keyMoments: (cross?.keyMoments ?? [])
      .filter((k) => k.text?.trim() && Number.isFinite(k.atMs))
      .slice(0, 6)
      .map((k) => ({ atMs: Math.max(0, Math.round(k.atMs)), text: k.text.trim().slice(0, 280) })),
    structure: (structure?.segments ?? []).map((s) => s.kind),
    durationSec: loaded.video.durationSec,
    transcriptSource: loaded.result.transcriptSource ?? null,
  };
}

export async function publishVideoToCommunity(
  userId: string,
  videoId: string
): Promise<PublishResult> {
  const loaded = await loadLatestResult(userId, videoId);
  if (loaded.error === "not_found") return { ok: false, error: "not_found" };
  if (loaded.error !== null) return { ok: false, error: "no_analysis" };

  const { video, result } = loaded;
  const data = {
    title: video.title ?? video.originalFilename ?? null,
    summary: result.summary?.trim().slice(0, 1200) || null,
    // Owner-scoped route for now; Phase B adds a public community thumbnail route.
    thumbnailUrl: video.thumbnailPath ? `/api/videos/${video.id}/thumbnail` : null,
    youtubeVideoId: video.youtubeVideoId,
    payload: buildPayload(loaded) as object,
    isPublic: true,
    publishedAt: new Date(),
  };

  const row = await prisma.publicVideo.upsert({
    where: { userId_videoId: { userId, videoId } },
    update: data,
    create: { userId, videoId, ...data },
  });
  return { ok: true, publicId: row.publicId };
}

export async function unpublishVideoFromCommunity(
  userId: string,
  videoId: string
): Promise<{ ok: boolean }> {
  // deleteMany so a missing row is a no-op, not a crash.
  await prisma.publicVideo.deleteMany({ where: { userId, videoId } });
  return { ok: true };
}

export async function getPublicationForVideo(userId: string, videoId: string) {
  return prisma.publicVideo.findUnique({
    where: { userId_videoId: { userId, videoId } },
  });
}

// Everything currently visible in the community for this user — hand-published
// AND auto-mirrored public YouTube videos.
const VISIBLE_PUBLICATION = { OR: [{ isPublic: true }, { youtubePublic: true }] };

export async function listMyPublications(userId: string) {
  return prisma.publicVideo.findMany({
    where: { userId, ...VISIBLE_PUBLICATION },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { likes: true } } },
  });
}

// Published videos for a profile page. Callers gate profile visibility; the
// owner previewing their own private profile still sees this list.
export async function listPublicationsForProfile(profileUserId: string) {
  return prisma.publicVideo.findMany({
    where: { userId: profileUserId, ...VISIBLE_PUBLICATION },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { likes: true } } },
  });
}

export interface PublishableVideo {
  videoId: string;
  title: string | null;
  durationSec: number | null;
  hasThumbnail: boolean;
  published: boolean;
  publicId: string | null;
  likeCount: number;
}

// Every video the user owns that has a completed analysis, tagged with whether
// it's already published — drives the "publish from the Community page" list.
export async function listPublishableVideos(userId: string): Promise<PublishableVideo[]> {
  const [videos, pubs] = await Promise.all([
    prisma.video.findMany({
      where: { userId, jobs: { some: { status: "COMPLETED" } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, originalFilename: true, durationSec: true, thumbnailPath: true },
    }),
    prisma.publicVideo.findMany({
      where: { userId },
      select: { videoId: true, publicId: true, isPublic: true, _count: { select: { likes: true } } },
    }),
  ]);

  const byVideo = new Map(pubs.filter((p) => p.videoId).map((p) => [p.videoId as string, p]));

  return videos.map((v) => {
    const pub = byVideo.get(v.id);
    return {
      videoId: v.id,
      title: v.title ?? v.originalFilename ?? null,
      durationSec: v.durationSec,
      hasThumbnail: Boolean(v.thumbnailPath),
      published: Boolean(pub?.isPublic),
      publicId: pub?.publicId ?? null,
      likeCount: pub?._count.likes ?? 0,
    };
  });
}
