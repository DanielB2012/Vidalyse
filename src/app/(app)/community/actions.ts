"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  savePublicProfile,
  setProfileVisibility,
  setAutoIncludeYoutube,
  setProfileChannel,
  getMyPublicProfile,
} from "@/lib/community/profile";
import {
  publishVideoToCommunity,
  unpublishVideoFromCommunity,
} from "@/lib/community/publish";
import { toggleLike, toggleYoutubeLike } from "@/lib/community/likes";
import { toggleFollow } from "@/lib/community/follow";
import { toggleChannelFollow } from "@/lib/community/channelFollow";
import { listCommunityFeed, type FeedPage } from "@/lib/community/feed";
import { SOCIAL_ENABLED } from "@/lib/features";

async function requireUserId(): Promise<string> {
  if (!SOCIAL_ENABLED) throw new Error("La communauté est désactivée sur cette installation.");
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthenticated");
  return session.user.id;
}

export type ProfileFormState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; error: "invalid_handle" | "handle_taken" | "unknown" };

// Used with useActionState in CommunityProfileSection.
export async function saveProfileAction(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const userId = await requireUserId();
  const res = await savePublicProfile(userId, {
    handle: String(formData.get("handle") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    avatarUrl: String(formData.get("avatarUrl") ?? ""),
  });
  if (!res.ok) return { status: "error", error: res.error };
  revalidatePath("/community");
  revalidatePath("/profile");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { status: "ok" };
}

export async function setProfileVisibilityAction(isPublic: boolean): Promise<void> {
  const userId = await requireUserId();
  await setProfileVisibility(userId, isPublic);
  revalidatePath("/community");
  revalidatePath("/profile");
  revalidatePath("/settings");
  const profile = await getMyPublicProfile(userId);
  if (profile) revalidatePath(`/community/profile/${profile.handle}`);
}

export async function setAutoIncludeYoutubeAction(enabled: boolean): Promise<void> {
  const userId = await requireUserId();
  await setAutoIncludeYoutube(userId, enabled);
  revalidatePath("/community");
  revalidatePath("/profile");
  revalidatePath("/settings");
}

export async function setProfileChannelAction(
  youtubeChannelLinkId: string | null
): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const res = await setProfileChannel(userId, youtubeChannelLinkId);
  if (res.ok) {
    revalidatePath("/community");
    revalidatePath("/profile");
    revalidatePath("/settings");
    const profile = await getMyPublicProfile(userId);
    if (profile) revalidatePath(`/community/profile/${profile.handle}`);
  }
  return { ok: res.ok };
}

export type PublishActionResult =
  | { ok: true; publicId: string }
  | { ok: false; error: "not_found" | "no_analysis" };

export async function publishVideoAction(videoId: string): Promise<PublishActionResult> {
  const userId = await requireUserId();
  const res = await publishVideoToCommunity(userId, videoId);
  if (res.ok) {
    revalidatePath(`/content/${videoId}`);
    revalidatePath("/community");
  }
  return res;
}

export async function unpublishVideoAction(videoId: string): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const res = await unpublishVideoFromCommunity(userId, videoId);
  revalidatePath(`/content/${videoId}`);
  revalidatePath("/community");
  return res;
}

// ---- Feed + likes (Phase B) ----

export type ToggleLikeActionResult =
  | { ok: true; liked: boolean; count: number }
  | { ok: false };

export async function toggleLikeAction(publicId: string): Promise<ToggleLikeActionResult> {
  const userId = await requireUserId();
  const res = await toggleLike(userId, publicId);
  if (!res.ok) return { ok: false };
  revalidatePath("/community");
  return { ok: true, liked: res.liked, count: res.count };
}

export async function loadFeedPageAction(cursor: string | null): Promise<FeedPage> {
  const userId = await requireUserId();
  return listCommunityFeed({ viewerId: userId, cursor });
}

export type ToggleYoutubeLikeActionResult =
  | { ok: true; liked: boolean; count: number }
  | { ok: false; reason: "creator_not_on_vidalyse" | "not_found" };

export async function toggleYoutubeLikeAction(input: {
  youtubeVideoId: string;
  channelId: string;
  title?: string | null;
  thumbnailUrl?: string | null;
}): Promise<ToggleYoutubeLikeActionResult> {
  const userId = await requireUserId();
  const res = await toggleYoutubeLike(userId, input);
  if (res.ok) revalidatePath("/community");
  return res;
}

export type ToggleFollowActionResult =
  | { ok: true; following: boolean; followerCount: number }
  | { ok: false };

export async function toggleFollowAction(targetUserId: string): Promise<ToggleFollowActionResult> {
  const userId = await requireUserId();
  const res = await toggleFollow(userId, targetUserId);
  if (!res.ok) return { ok: false };
  revalidatePath("/community");
  return { ok: true, following: res.following, followerCount: res.followerCount };
}

export async function toggleChannelFollowAction(input: {
  youtubeChannelId: string;
  channelTitle?: string | null;
  thumbnailUrl?: string | null;
}): Promise<{ following: boolean; count: number }> {
  const userId = await requireUserId();
  const res = await toggleChannelFollow(userId, input);
  revalidatePath("/community");
  return res;
}
