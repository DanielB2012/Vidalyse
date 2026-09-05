import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Ship a self-contained Node server under .next/standalone so the Windows
  // installer can run `node .next/standalone/server.js` without a full
  // node_modules. The binary-backed packages in serverExternalPackages
  // (ffmpeg/ffprobe/yt-dlp/onnxruntime/sharp/better-sqlite3) are traced into
  // the bundle automatically. See docs/PACKAGING-WINDOWS.md.
  output: "standalone",
  // The standalone tracer otherwise sweeps the whole repo root into
  // .next/standalone (build output, uploaded media, sources…). Keep it lean.
  outputFileTracingExcludes: {
    "*": [
      "dist/**",
      "dist-app/**",
      "storage/**",
      "docs/**",
      "Logos/**",
      "Site/**",
      ".git/**",
      "**/*.test.*",
    ],
  },
  // Native / binary-backed packages must stay out of the bundler:
  // - yt-dlp / ffmpeg / ffprobe are spawned as real binaries; bundling breaks
  //   their __dirname path resolution ("spawn \ROOT\node_modules\...\ffprobe.exe").
  // - @huggingface/transformers loads onnxruntime-node (.node addon) + sharp
  //   and resolves model files from disk at runtime.
  serverExternalPackages: [
    "youtube-dl-exec",
    "ffmpeg-static",
    "ffprobe-static",
    "@huggingface/transformers",
    "onnxruntime-node",
    "sharp",
  ],
};

export default nextConfig;
