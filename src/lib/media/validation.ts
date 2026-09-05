// §21/§22: accept the common container formats a creator would actually
// upload. Extension is only a first-pass check — probeVideo() is the real
// validation, since a renamed file can lie about its extension.
export const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"];

// Prototype ceiling to keep local disk/processing bounded. Real product
// tuning (chunked/resumable upload, size by plan) is future work — see §100.
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB

export function hasAllowedVideoExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}
