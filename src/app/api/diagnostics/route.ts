import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runDiagnostics } from "@/lib/system/diagnostics";
import { getT } from "@/i18n/server";

// Environment self-check for Settings (§1). Auth-gated; the payload never
// contains an API key or secret, only presence/status.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const result = await runDiagnostics();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { t } = await getT();
    return NextResponse.json(
      { error: t("diag.runFailed"), detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
