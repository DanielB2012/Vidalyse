"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Globe, Lock, Loader2, Upload, ImageOff } from "lucide-react";
import {
  saveProfileAction,
  setProfileVisibilityAction,
  setAutoIncludeYoutubeAction,
  setProfileChannelAction,
  type ProfileFormState,
} from "@/app/(app)/community/actions";
import { useT } from "@/i18n/LanguageProvider";

interface Props {
  profile: {
    handle: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    isPublic: boolean;
    autoIncludeYoutube: boolean;
    youtubeChannelLinkId: string | null;
  } | null;
  channels: { id: string; title: string; handle: string | null }[];
}

const INITIAL: ProfileFormState = { status: "idle" };
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const AVATAR_MAX = 5 * 1024 * 1024;

export function CommunityProfileSection({ profile, channels }: Props) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState(saveProfileAction, INITIAL);
  const [visPending, startVis] = useTransition();
  const [isPublic, setIsPublic] = useState(profile?.isPublic ?? false);
  const [autoYt, setAutoYt] = useState(profile?.autoIncludeYoutube ?? true);
  const [autoYtPending, startAutoYt] = useTransition();
  const [channelId, setChannelId] = useState(profile?.youtubeChannelLinkId ?? "");
  const [channelPending, startChannel] = useTransition();

  // Controlled fields — a rejected save (bad handle, taken handle) must keep
  // every other value the user typed. Only the flagged field is the problem.
  const [handle, setHandle] = useState(profile?.handle ?? "");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? "");

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleError =
    state.status === "error" && (state.error === "invalid_handle" || state.error === "handle_taken")
      ? t(state.error === "invalid_handle" ? "community.handleInvalid" : "community.handleTaken")
      : null;
  const genericError =
    state.status === "error" && state.error === "unknown" ? t("community.saveError") : null;

  async function onPickFile(file: File) {
    setAvatarError(null);
    if (!AVATAR_TYPES.includes(file.type)) {
      setAvatarError(t("community.avatarTypeError"));
      return;
    }
    if (file.size > AVATAR_MAX) {
      setAvatarError(t("community.avatarSizeError"));
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/community/avatar", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const { url } = (await res.json()) as { url: string };
      setAvatarUrl(url);
    } catch {
      setAvatarError(t("community.avatarUploadError"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggleVisibility() {
    const next = !isPublic;
    setIsPublic(next);
    startVis(async () => {
      await setProfileVisibilityAction(next);
    });
  }

  function toggleAutoYt() {
    const next = !autoYt;
    setAutoYt(next);
    startAutoYt(async () => {
      await setAutoIncludeYoutubeAction(next);
    });
  }

  function changeChannel(next: string) {
    setChannelId(next);
    startChannel(async () => {
      await setProfileChannelAction(next || null);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">{t("community.profileSectionTitle")}</h2>
      <p className="mt-1 text-xs text-muted">{t("community.profileSectionIntro")}</p>

      <form action={formAction} className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-muted">{t("community.handleLabel")}</span>
          <div
            className={`mt-1 flex items-center rounded-lg border bg-surface-raised px-3 ${
              handleError ? "border-danger" : "border-border-strong"
            }`}
          >
            <span className="text-sm text-muted">@</span>
            <input
              name="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              required
              placeholder={t("community.handlePlaceholder")}
              className="w-full bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted"
            />
          </div>
          <span className={`mt-1 block text-[11px] ${handleError ? "text-danger" : "text-muted"}`}>
            {handleError ?? t("community.handleHint")}
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">{t("community.displayNameLabel")}</span>
          <input
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("community.displayNamePlaceholder")}
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm placeholder:text-muted"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted">{t("community.bioLabel")}</span>
          <textarea
            name="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            placeholder={t("community.bioPlaceholder")}
            className="mt-1 h-20 w-full resize-none rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm placeholder:text-muted"
          />
        </label>

        <div className="block">
          <span className="text-xs font-medium text-muted">{t("community.avatarLabel")}</span>
          <div className="mt-1 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageOff size={16} className="text-muted" />
              )}
            </span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-raised disabled:opacity-50"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? t("community.avatarUploading") : t("community.avatarUpload")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={AVATAR_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickFile(f);
              }}
            />
          </div>
          <input
            name="avatarUrl"
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="mt-2 w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm placeholder:text-muted"
          />
          <span className={`mt-1 block text-[11px] ${avatarError ? "text-danger" : "text-muted"}`}>
            {avatarError ?? t("community.avatarOrUrl")}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending && <Loader2 size={13} className="animate-spin" />}
            {profile ? t("community.saveProfile") : t("community.createProfile")}
          </button>
          {state.status === "ok" && <span className="text-xs text-accent">{t("community.saved")}</span>}
          {genericError && <span className="text-xs text-danger">{genericError}</span>}
        </div>
      </form>

      {profile && (
        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {isPublic ? <Globe size={14} className="text-accent" /> : <Lock size={14} className="text-muted" />}
              {isPublic ? t("community.profilePublic") : t("community.profilePrivate")}
            </p>
            <p className="text-xs text-muted">
              {isPublic ? (
                <Link href={`/community/profile/${profile.handle}`} className="text-accent hover:underline">
                  {t("community.viewPublicProfile")}
                </Link>
              ) : (
                t("community.profilePrivateHint")
              )}
            </p>
          </div>
          <button
            onClick={toggleVisibility}
            disabled={visPending}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-raised disabled:opacity-50"
          >
            {visPending && <Loader2 size={12} className="animate-spin" />}
            {isPublic ? t("community.makePrivate") : t("community.makePublic")}
          </button>
        </div>
      )}

      {profile && (
        <div className="mt-3 border-t border-border pt-4">
          <label className="block">
            <span className="text-xs font-medium">{t("community.channelLabel")}</span>
            <span className="mt-0.5 block text-[11px] text-muted">{t("community.channelHint")}</span>
            <div className="mt-1.5 flex items-center gap-2">
              <select
                value={channelId}
                disabled={channelPending}
                onChange={(e) => changeChannel(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">{t("community.channelNone")}</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.handle ? ` (${c.handle})` : ""}
                  </option>
                ))}
              </select>
              {channelPending && <Loader2 size={14} className="shrink-0 animate-spin text-muted" />}
            </div>
          </label>
        </div>
      )}

      {profile && (
        <label className="mt-3 flex items-start gap-2 border-t border-border pt-4 text-xs">
          <input
            type="checkbox"
            checked={autoYt}
            disabled={autoYtPending}
            onChange={toggleAutoYt}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">{t("community.autoYoutubeLabel")}</span>
            <span className="mt-0.5 block text-muted">{t("community.autoYoutubeHint")}</span>
          </span>
        </label>
      )}
    </div>
  );
}
