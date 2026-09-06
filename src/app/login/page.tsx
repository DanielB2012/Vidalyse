import { signIn } from "@/auth";
import { getT } from "@/i18n/server";
import { LegalFooter } from "@/components/legal/LegalFooter";

export default async function LoginPage() {
  const { t } = await getT();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-200px] right-[-100px] h-[480px] w-[480px] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent-2), transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface/80 p-10 shadow-2xl backdrop-blur">
        <div className="mb-8 text-center">
          {/* Full wordmark (white on transparent) — `.brand-logo` turns it black
              on the light theme, see globals.css. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-vidalyse-complet.png"
            alt="Vidalyse"
            className="brand-logo mx-auto mb-1 h-20 w-auto max-w-full object-contain"
          />
          <p className="text-sm text-muted">{t("login.tagline")}</p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border-strong bg-surface-raised px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/60 hover:bg-surface-raised/80"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#FF0000"
                d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.5V8.5l6.3 3.5-6.3 3.5Z"
              />
            </svg>
            {t("login.continueWithYoutube")}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">{t("login.authNote")}</p>

        <div className="mt-6 flex justify-center">
          <LegalFooter />
        </div>
      </div>
    </div>
  );
}
