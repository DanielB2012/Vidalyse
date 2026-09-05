import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { executeLyraActions, sanitizePendingActions } from "@/lib/ai/lyra-actions";

// Runs the actions the user just confirmed in the chat. The action list comes
// from the client, so it's re-narrowed (sanitizePendingActions) and every value
// is re-validated inside executeLyraActions. fullAccess is re-read from the
// request but each server action re-checks it anyway.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    actions?: unknown;
    fullAccess?: boolean;
  } | null;

  const actions = sanitizePendingActions(body?.actions);
  if (actions.length === 0) {
    return NextResponse.json({ clientActions: [], notes: [] });
  }

  const { clientActions, execNotes } = await executeLyraActions(session.user.id, actions, {
    fullAccess: Boolean(body?.fullAccess),
  });

  return NextResponse.json({ clientActions, notes: execNotes });
}
