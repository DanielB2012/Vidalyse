"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, CheckCircle2, Loader2, Eye, EyeOff, Trash2, Info, Lock } from "lucide-react";
import { setGeminiApiKey } from "@/app/(app)/settings/actions";
import { useT } from "@/i18n/LanguageProvider";

// Where the user pastes their own Gemini API key for the online models.
// Vidalyse ships with no key: this is what makes a Cloud model work. Revealed
// (with a slide-in) only once an online model is chosen — see AiModelsSection.
export function CloudApiKeyField({
  configured,
  fromEnv,
}: {
  configured: boolean;
  fromEnv: boolean;
}) {
  const router = useRouter();
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [hasKey, setHasKey] = useState(configured);
  const [justSaved, setJustSaved] = useState(false);

  function save() {
    const key = value.trim();
    if (!key || pending) return;
    startTransition(async () => {
      await setGeminiApiKey(key);
      setValue("");
      setHasKey(true);
      setJustSaved(true);
      router.refresh();
    });
  }

  function clear() {
    if (pending) return;
    startTransition(async () => {
      await setGeminiApiKey("");
      setValue("");
      setHasKey(false);
      setJustSaved(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex items-center gap-2">
        <KeyRound size={14} className="text-muted" />
        <p className="text-sm font-medium">{t("cloudKey.title")}</p>
        {hasKey && !fromEnv && (
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 size={12} /> {t("cloudKey.savedBadge")}
          </span>
        )}
      </div>

      {fromEnv ? (
        <p className="mt-2 text-xs text-muted">
          {t("cloudKey.fromEnv1")}
          <code>GEMINI_API_KEY</code>
          {t("cloudKey.fromEnv2")}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">{t("cloudKey.intro")}</p>

          <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
            <Info size={13} className="mt-px shrink-0" />
            <span>
              {t("cloudKey.howto1")}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                aistudio.google.com/apikey
              </a>
              {t("cloudKey.howto2")}
              <em>{t("cloudKey.howtoCreate")}</em>
              {t("cloudKey.howto3")}
              <strong>{t("cloudKey.howtoSave")}</strong>
              {t("cloudKey.howtoEnd")}
            </span>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <input
                type={reveal ? "text" : "password"}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setJustSaved(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder={t(hasKey ? "cloudKey.placeholderReplace" : "cloudKey.placeholderNew")}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 pr-9 text-sm"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                aria-label={t(reveal ? "common.hide" : "common.show")}
              >
                {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <button
              onClick={save}
              disabled={pending || !value.trim()}
              className="flex items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : null}
              {t("common.save")}
            </button>

            {hasKey && (
              <button
                onClick={clear}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-xs text-muted hover:border-danger/60 hover:text-danger disabled:opacity-50"
              >
                <Trash2 size={12} /> {t("common.clear")}
              </button>
            )}
          </div>

          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
            <Lock size={12} className="mt-px shrink-0" />
            <span>
              {t("cloudKey.localOnly1")}
              <strong>{t("cloudKey.localOnlyStrong")}</strong>
              {t("cloudKey.localOnly2")}
            </span>
          </p>

          {justSaved && (
            <p className="mt-2 flex items-center gap-1 text-xs text-success">
              <CheckCircle2 size={12} /> {t("cloudKey.savedOk")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
