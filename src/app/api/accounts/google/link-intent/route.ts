import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { LINK_INTENT_COOKIE, LINK_INTENT_MAX_AGE_SEC } from "@/lib/auth/linkIntent";

// Called right before signIn("google", ...) from "Ajouter un compte" in
// Settings. Marks the OAuth round-trip that follows as a link, not a login —
// see the adapter override in src/auth.ts for how it's consumed.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  (await cookies()).set(LINK_INTENT_COOKIE, session.user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: LINK_INTENT_MAX_AGE_SEC,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
