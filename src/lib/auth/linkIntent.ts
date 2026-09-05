// Short-lived cookie carrying "link this new Google account to the currently
// signed-in Vidalyse user" intent across the OAuth round-trip (our app →
// Google's consent screen → back to /api/auth/callback/google). Read by the
// patched adapter.createUser in src/auth.ts, set by
// POST /api/accounts/google/link-intent right before calling signIn().
export const LINK_INTENT_COOKIE = "vidalyse_link_uid";
export const LINK_INTENT_MAX_AGE_SEC = 300; // 5 min — plenty for a consent screen, short enough to be harmless if unused
