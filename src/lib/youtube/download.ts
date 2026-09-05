import fs from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import youtubeDl from "youtube-dl-exec";

// We download published YouTube videos with yt-dlp (bundled binary via
// youtube-dl-exec) rather than a pure-JS library: yt-dlp is actively
// maintained and keeps working when YouTube changes its player, which the
// JS-only libraries do not.
//
// - `--js-runtimes node`: yt-dlp needs a JS engine to solve YouTube's player
//   challenges; Node is already here, so point it at Node instead of Deno.
// - merge is done by the bundled ffmpeg-static binary (no system ffmpeg).
const FFMPEG_DIR = path.dirname(ffmpegPath as unknown as string);

const COMMON_FLAGS = {
  noPlaylist: true,
  noWarnings: true,
  jsRuntimes: "node",
  ffmpegLocation: FFMPEG_DIR,
  retries: 3,
} as const;

export async function downloadYoutubeVideo(youtubeVideoId: string, destPath: string): Promise<void> {
  const url = `https://www.youtube.com/watch?v=${youtubeVideoId}`;
  try {
    await youtubeDl(url, {
      ...COMMON_FLAGS,
      output: destPath,
      // best mp4 video ≤1080p + m4a audio, merged to mp4; fall back to
      // whatever single stream is muxed if that combo isn't offered.
      format: "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*+ba/b",
      mergeOutputFormat: "mp4",
      // Grab the creator's OWN uploaded captions (not YouTube's auto-ASR) as a
      // sidecar .srt — the pipeline prefers these over local Whisper. `--sub-langs`
      // globs cover regional variants (fr, fr-FR, en, en-US…).
      writeSub: true,
      subLang: "fr.*,en.*,fr,en",
      subFormat: "srt/vtt/best",
      convertSubs: "srt",
    });
  } catch (err) {
    fs.rmSync(destPath, { force: true });
    throw new Error(
      `Échec du téléchargement de la vidéo YouTube (${youtubeVideoId}) : ${
        err instanceof Error ? err.message.split("\n").slice(-3).join(" ").trim() : String(err)
      }`
    );
  }

  if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
    fs.rmSync(destPath, { force: true });
    throw new Error(`yt-dlp n'a produit aucun fichier pour la vidéo YouTube (${youtubeVideoId}).`);
  }
}

// yt-dlp writes captions next to the video as `<name>.<lang>.srt`. Returns the
// first one found (French preferred), or null when the creator uploaded none.
export async function findDownloadedSubtitleFile(videoDestPath: string): Promise<string | null> {
  const dir = path.dirname(videoDestPath);
  const stem = path.basename(videoDestPath).replace(/\.[^.]+$/, "");
  let entries: string[];
  try {
    entries = await fs.promises.readdir(dir);
  } catch {
    return null;
  }
  const subs = entries
    .filter((f) => f.startsWith(`${stem}.`) && (f.endsWith(".srt") || f.endsWith(".vtt")))
    .sort((a, b) => {
      const score = (n: string) => (/\.fr[.-]/i.test(n) || /\.fr\./i.test(n) ? 0 : /\.en[.-]/i.test(n) ? 1 : 2);
      return score(a) - score(b);
    });
  return subs.length ? path.join(dir, subs[0]) : null;
}

export async function fetchYoutubeVideoTitle(youtubeVideoId: string): Promise<string | null> {
  try {
    const info = (await youtubeDl(`https://www.youtube.com/watch?v=${youtubeVideoId}`, {
      ...COMMON_FLAGS,
      dumpSingleJson: true,
      skipDownload: true,
    })) as unknown as { title?: string };
    return info?.title ?? null;
  } catch {
    return null;
  }
}
