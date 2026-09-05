"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { extractYoutubeVideoId } from "@/lib/youtube/client";

async function requireOwnVideo(videoId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthenticated");
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || video.userId !== session.user.id) throw new Error("not_found");
  return session.user.id;
}

export async function linkYoutubeVideo(videoId: string, urlOrId: string) {
  await requireOwnVideo(videoId);

  const youtubeVideoId = extractYoutubeVideoId(urlOrId);
  if (!youtubeVideoId) throw new Error("URL ou identifiant YouTube invalide.");

  await prisma.video.update({ where: { id: videoId }, data: { youtubeVideoId } });
  revalidatePath(`/content/${videoId}`);
}

export async function unlinkYoutubeVideo(videoId: string) {
  await requireOwnVideo(videoId);
  await prisma.video.update({ where: { id: videoId }, data: { youtubeVideoId: null } });
  revalidatePath(`/content/${videoId}`);
}
