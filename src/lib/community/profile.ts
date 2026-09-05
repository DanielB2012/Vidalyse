import { prisma } from "@/lib/prisma";
import { normalizeHandle, isValidHandle, canViewProfile } from "./visibility";

// Vidalyse community profile (§13 Phase A). Opt-in: a row exists only once the
// user creates one in Paramètres → Profil, and `isPublic` stays false until they
// flip it. Nothing here is exposed to other users unless the profile is public.

export { normalizeHandle, isValidHandle } from "./visibility";

export type PublicProfileRow = Awaited<ReturnType<typeof getMyPublicProfile>>;

export async function getMyPublicProfile(userId: string) {
  return prisma.publicProfile.findUnique({ where: { userId } });
}

export interface SaveProfileInput {
  handle: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export type SaveProfileResult =
  | { ok: true }
  | { ok: false; error: "invalid_handle" | "handle_taken" };

export async function savePublicProfile(
  userId: string,
  input: SaveProfileInput
): Promise<SaveProfileResult> {
  const handle = normalizeHandle(input.handle);
  if (!isValidHandle(handle)) return { ok: false, error: "invalid_handle" };

  // Uniqueness is also enforced by the DB (`@unique`), but check first so we can
  // return a friendly error instead of a constraint crash.
  const clash = await prisma.publicProfile.findFirst({
    where: { handle, NOT: { userId } },
    select: { id: true },
  });
  if (clash) return { ok: false, error: "handle_taken" };

  const data = {
    handle,
    displayName: input.displayName?.trim().slice(0, 80) || null,
    bio: input.bio?.trim().slice(0, 500) || null,
    avatarUrl: input.avatarUrl?.trim().slice(0, 500) || null,
  };

  try {
    // First time this profile is created: default the pinned channel to
    // whichever one is active right now, so it isn't left blank. Purely a
    // starting point — the user can change it independently afterwards
    // (setProfileChannel) without this save ever touching it again.
    const activeLink = await prisma.youtubeChannelLink.findFirst({ where: { userId, active: true } });
    await prisma.publicProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data, youtubeChannelLinkId: activeLink?.id ?? null },
    });
  } catch {
    // Lost a race on the unique handle.
    return { ok: false, error: "handle_taken" };
  }
  return { ok: true };
}

export async function setProfileVisibility(
  userId: string,
  isPublic: boolean
): Promise<{ ok: boolean; error?: "no_profile" }> {
  const existing = await prisma.publicProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "no_profile" };
  await prisma.publicProfile.update({ where: { userId }, data: { isPublic } });
  return { ok: true };
}

// Which linked channel backs the public profile (fallback avatar/title, and
// which channel's uploads get auto-mirrored) — independent from "active" in
// Settings, which drives Contenu/Analytics and can change freely without
// touching the public identity. `null` unpins it (falls back to nothing).
export async function setProfileChannel(
  userId: string,
  youtubeChannelLinkId: string | null
): Promise<{ ok: boolean; error?: "no_profile" | "not_found" }> {
  const existing = await prisma.publicProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!existing) return { ok: false, error: "no_profile" };

  if (youtubeChannelLinkId) {
    const link = await prisma.youtubeChannelLink.findFirst({ where: { id: youtubeChannelLinkId, userId } });
    if (!link) return { ok: false, error: "not_found" };
  }

  await prisma.publicProfile.update({ where: { userId }, data: { youtubeChannelLinkId } });
  return { ok: true };
}

// Toggle the "auto-mirror my public YouTube uploads" setting. Turning it off
// also removes the auto-only rows that were never hand-published; turning it on
// resets the sync clock so the next /community visit re-mirrors immediately.
export async function setAutoIncludeYoutube(userId: string, enabled: boolean): Promise<void> {
  await prisma.publicProfile.updateMany({
    where: { userId },
    data: { autoIncludeYoutube: enabled, youtubeSyncedAt: null },
  });
  if (!enabled) {
    await prisma.publicVideo.deleteMany({
      where: { userId, source: "youtube", isPublic: false },
    });
  }
}

// Viewer-aware read for /community/profile/[handle]. The owner always sees their
// own profile (even while private); everyone else only when `isPublic`. Returns
// null (→ 404) otherwise so a private handle can't be probed for existence.
export async function getVisiblePublicProfile(handle: string, viewerId: string | null) {
  const normalized = normalizeHandle(handle);
  if (!isValidHandle(normalized)) return null;

  const profile = await prisma.publicProfile.findUnique({
    where: { handle: normalized },
    include: {
      user: { select: { id: true, createdAt: true } },
      youtubeChannelLink: { select: { title: true, thumbnailUrl: true } },
    },
  });
  if (!profile) return null;

  const isOwner = viewerId != null && viewerId === profile.userId;
  if (!canViewProfile({ isPublic: profile.isPublic, isOwner })) return null;

  return { profile, isOwner };
}
