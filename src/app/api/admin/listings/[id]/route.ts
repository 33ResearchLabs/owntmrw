import { NextResponse } from "next/server";
import { currentAddress, isAdmin } from "@/lib/session";
import { adminUnlocked, sameOrigin } from "@/lib/admin";
import { approveListing, rejectListing } from "@/lib/listings";

export const dynamic = "force-dynamic";

/**
 * Approve or reject one request. Three checks, all server-side: an admin
 * wallet, a live passphrase unlock for that wallet, and a same-origin
 * request — see `lib/admin.ts` for why one is not enough.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await currentAddress();
  if (!isAdmin(admin)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!(await adminUnlocked(admin)))
    return NextResponse.json({ error: "Enter the admin passphrase first." }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const body = (await req.json().catch(() => null)) as
    | { action?: unknown; note?: unknown }
    | null;
  const note =
    typeof body?.note === "string" ? body.note.trim().slice(0, 500) || null : null;

  const r =
    body?.action === "approve"
      ? approveListing(id, admin, note)
      : body?.action === "reject"
        ? rejectListing(id, admin, note)
        : null;
  if (!r) return NextResponse.json({ error: "action must be approve or reject." }, { status: 400 });
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.status });
  return NextResponse.json({ ok: true, slug: r.slug });
}
