import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchChannelAnalyticsSummary } from "@/lib/youtube/analytics";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const summary = await fetchChannelAnalyticsSummary(session.user.id);
    if (!summary) {
      return NextResponse.json({ error: "no_permission_or_channel" }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[youtube/analytics] fetch failed", error);
    return NextResponse.json({ error: "youtube_analytics_api_error" }, { status: 502 });
  }
}
