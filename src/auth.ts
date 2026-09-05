import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { cookies } from "next/headers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { ensureDefaultUserResources } from "@/lib/ai/resources";
import { LINK_INTENT_COOKIE } from "@/lib/auth/linkIntent";
import authConfig from "@/auth.config";

const baseAdapter = PrismaAdapter(prisma);

// Auth.js has no first-class "link another OAuth account to the currently
// signed-in user" flow — an OAuth sign-in for an account it's never seen
// always goes through `createUser`, which would otherwise spin up a brand
// new Vidalyse profile. "Ajouter un compte" in Settings works around that:
// it sets a short-lived cookie with the current user's id right before
// calling signIn("google", ...), and this override reads it here — inside
// the same request that handles /api/auth/callback/google — to hand back
// the EXISTING user instead. Auth.js then calls the untouched
// `linkAccount` as usual, attaching the new Google account's Account row to
// that user. Returning the real row (not a value built from the new
// Google profile) matters: whatever this resolves to becomes the session's
// identity, and we don't want a second Google account's name/email/picture
// to overwrite the Vidalyse profile's own.
const adapter: Adapter = {
  ...baseAdapter,
  async createUser(user) {
    const linkingUserId = (await cookies()).get(LINK_INTENT_COOKIE)?.value;
    if (linkingUserId) {
      const existing = await prisma.user.findUnique({ where: { id: linkingUserId } });
      if (existing) {
        return {
          id: existing.id,
          name: existing.name,
          email: existing.email ?? "",
          emailVerified: existing.emailVerified,
          image: existing.image,
        };
      }
    }
    return baseAdapter.createUser!(user);
  },
};

// Full config — Node runtime only (API routes, server components/actions).
// Never import this file from middleware.ts; see auth.config.ts for why.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter,
  events: {
    async createUser({ user }) {
      if (user.id) await ensureDefaultUserResources(user.id);
    },
    // Fires for the primary account at signup AND for every account linked
    // afterwards — cache the linked Google identity (Account has no such
    // columns by default) and make the very first Google account active.
    async linkAccount({ user, account, profile: rawProfile }) {
      if (account.provider !== "google" || !user.id) return;
      // Typed as User | AdapterUser upstream, but for an OAuth provider this
      // is really the raw profile Google returned (name/email/picture).
      const profile = rawProfile as unknown as { email?: string; name?: string; picture?: string };
      const count = await prisma.account.count({ where: { userId: user.id, provider: "google" } });
      await prisma.account.update({
        where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
        data: {
          googleEmail: typeof profile?.email === "string" ? profile.email : null,
          googleName: typeof profile?.name === "string" ? profile.name : null,
          googleImage: typeof profile?.picture === "string" ? profile.picture : null,
          active: count <= 1,
        },
      });
    },
  },
});
