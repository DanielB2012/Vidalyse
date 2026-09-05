import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe subset of the Auth.js config (no Prisma adapter, no Node APIs) —
// used by middleware.ts, which runs on the Edge runtime and cannot bundle
// the Prisma client. The full config (adapter, events) lives in src/auth.ts.

// Sign-in asks for identity only — all non-sensitive, so the Google OAuth
// consent screen can be published without Google's (weeks-long) verification
// review and is open to everyone. YouTube read access is requested separately
// and on demand by the "connect a channel" flow (src/lib/youtube/channelAuth.ts).
export const LOGIN_SCOPES = ["openid", "email", "profile"].join(" ");

// The sensitive scopes, used only by the channel-link flow.
export const YOUTUBE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

export default {
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: LOGIN_SCOPES,
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
