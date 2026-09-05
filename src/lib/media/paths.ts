import path from "node:path";
import fs from "node:fs/promises";

// Root for every piece of writable app data: the SQLite DB lives beside it,
// plus uploads, tmp job files and the models downloaded at runtime.
//   - dev / `next start` from the repo: <cwd>/storage (unchanged)
//   - packaged .exe: the Electron main process sets VIDALYSE_DATA_DIR to
//     %APPDATA%\Vidalyse so the data is in a writable place and survives app
//     updates (the install dir gets replaced). See docs/PACKAGING-WINDOWS.md.
// Never inside /public — uploaded videos are private and served only through
// an authenticated route (§85 — protect uploads, minimal exposure).
export const STORAGE_ROOT =
  process.env.VIDALYSE_DATA_DIR?.trim() || path.join(process.cwd(), "storage");
export const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");
export const TMP_DIR = path.join(STORAGE_ROOT, "tmp");

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function userUploadDir(userId: string) {
  return path.join(UPLOADS_DIR, userId);
}

// Community-profile avatars. One normalised JPEG per user, keyed by user id —
// see src/app/api/community/avatar/*.
export const AVATARS_DIR = path.join(STORAGE_ROOT, "avatars");
export function avatarPath(userId: string) {
  return path.join(AVATARS_DIR, `${userId}.jpg`);
}

export function jobTmpDir(jobId: string) {
  return path.join(TMP_DIR, jobId);
}

export async function removeDirIfExists(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}
