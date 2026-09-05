import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildChannelLinkAuthUrl, LINK_CALLBACK_PATH, LINK_STATE_COOKIE } from "@/lib/youtube/channelAuth";

// GET, not POST: this has to be a real top-level browser navigation so it can
// redirect on to Google's consent screen.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const state = randomBytes(24).toString("hex");
  (await cookies()).set(LINK_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const redirectUri = new URL(LINK_CALLBACK_PATH, req.url).toString();
  return NextResponse.redirect(buildChannelLinkAuthUrl(redirectUri, state));
}
