import { NextResponse } from "next/server";
import { currentAddress, isAdmin } from "@/lib/session";
import { adminUnlocked, sameOrigin } from "@/lib/admin";
import { ingestStatus, triggerIngest } from "@/lib/ingest/scheduler";

export const dynamic = "force-dynamic";

/**
 * Start an ingest now. The same three checks as approving a listing — an
 * admin wallet, a live passphrase unlock, a same-origin request — because a
 * full run is minutes of public-API traffic that a stranger must not be able
 * to set off with a link.
 */
export async function POST(req: Request) {
  const admin = await currentAddress();
  if (!isAdmin(admin)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!(await adminUnlocked(admin)))
    return NextResponse.json({ error: "Enter the admin passphrase first." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { mode?: unknown } | null;
  const mode = body?.mode === "full" ? "full" : body?.mode === "fast" ? "fast" : null;
  if (!mode) return NextResponse.json({ error: "mode must be fast or full." }, { status: 400 });

  const r = triggerIngest(mode);
  if (!r.started) {
    return NextResponse.json(
      {
        error:
          r.reason === "running"
            ? "An ingest is already running."
            : "Another process holds the ingest lock; try again in a few minutes.",
        status: ingestStatus(),
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, mode, status: ingestStatus() }, { status: 202 });
}
