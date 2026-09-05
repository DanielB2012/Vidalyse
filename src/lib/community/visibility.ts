// Pure, DB-free community rules — kept in their own module so they can be unit
// tested without importing Prisma.

// Vidalyse "@handle": 3–20 chars, lowercase letters / digits / "_" / "-",
// must start and end with a letter or digit (no leading/trailing separator).
// Distinct from the YouTube handle.
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$/;

export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle);
}

// A public profile is visible to anyone; a private one only to its owner.
export function canViewProfile(opts: { isPublic: boolean; isOwner: boolean }): boolean {
  return opts.isPublic || opts.isOwner;
}

// A published video reaches the community feed (and can be liked / have its
// thumbnail served publicly) only when the owner's profile is public AND the
// video is either explicitly published OR currently public on YouTube (the
// auto-mirror). Mirrors the Prisma where-clause in listCommunityFeed.
export function isFeedVisible(opts: {
  publicationIsPublic: boolean;
  youtubePublic?: boolean;
  ownerProfileIsPublic: boolean;
}): boolean {
  return (opts.publicationIsPublic || opts.youtubePublic === true) && opts.ownerProfileIsPublic;
}
