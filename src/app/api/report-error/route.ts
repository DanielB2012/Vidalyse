import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchOwnChannel } from "@/lib/youtube/client";

const CATEGORY_COLOR: Record<string, number> = {
  Bug: 0xfb7185, // danger
  Suggestion: 0x22d3ee, // accent-2
  Autre: 0x8a8fa3, // muted
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const webhookUrl = process.env.DISCORD_ERROR_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Le webhook Discord n'est pas configuré (DISCORD_ERROR_WEBHOOK_URL manquant)." },
      { status: 503 }
    );
  }
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhookUrl)) {
    return NextResponse.json(
      {
        error:
          "DISCORD_ERROR_WEBHOOK_URL n'a pas le format d'une URL de webhook Discord (attendu : https://discord.com/api/webhooks/<id>/<token>).",
      },
      { status: 503 }
    );
  }

  const { title, category, description } = (await req.json()) as {
    title?: string;
    category?: string;
    description?: string;
  };
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "Titre et description requis." }, { status: 400 });
  }

  // Never the account email in a message posted to a channel other people
  // can read — identify the reporter by their YouTube handle instead.
  const channel = await fetchOwnChannel(session.user.id).catch(() => null);
  const reporter = channel?.handle ?? channel?.title ?? "Utilisateur Vidalyse (chaîne non connectée)";

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Only meaningful if the webhook targets a forum/media channel — in
      // that case Discord requires a thread name to create the post; a
      // normal text-channel webhook ignores this field.
      thread_name: `[${category ?? "Autre"}] ${title.trim()}`.slice(0, 100),
      embeds: [
        {
          title: title.trim().slice(0, 256),
          description: description.trim().slice(0, 4000),
          color: CATEGORY_COLOR[category ?? "Autre"] ?? CATEGORY_COLOR.Autre,
          fields: [
            { name: "Catégorie", value: category ?? "Autre", inline: true },
            { name: "Utilisateur", value: reporter, inline: true },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[report-error] discord webhook failed", res.status, body);
    return NextResponse.json(
      { error: `Discord a répondu avec le statut ${res.status}${body ? ` : ${body.slice(0, 300)}` : ""}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
