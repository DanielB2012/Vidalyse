import { google } from "googleapis";
import { YOUTUBE_SCOPES } from "@/auth.config";

// Manual OAuth flow for "Ajouter une chaîne YouTube" — deliberately separate
// from the sign-in flow (src/auth.ts). A Google account with several
// channels (Brand Accounts) only exposes ONE of them per authorization —
// whichever the user picks on Google's channel-chooser consent screen — so
// linking N channels means going through consent N times and keeping N
// distinct token sets (see YoutubeChannelLink in schema.prisma). Reusing the
// sign-in callback for this would either overwrite the login token or, if a
// channel belongs to a Google identity already used to log in, not trigger a
// fresh authorization at all. Needs its own redirect URI registered in the
// Google Cloud OAuth client — see LINK_CALLBACK_PATH.
export const LINK_CALLBACK_PATH = "/api/youtube-channels/link/callback";
export const LINK_STATE_COOKIE = "vidalyse_ytlink_state";

export function createOAuth2Client(redirectUri: string) {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
}

export function buildChannelLinkAuthUrl(redirectUri: string, state: string): string {
  const client = createOAuth2Client(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: YOUTUBE_SCOPES.split(" "),
    state,
  });
}
