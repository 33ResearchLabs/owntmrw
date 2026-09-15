import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/session";
import { listingsByWallet, submitListing, validateInput } from "@/lib/listings";

export const dynamic = "force-dynamic";

/**
 * Submit a token for listing. The submitter is the session wallet — the
 * body carries the token, never who is asking. A JSON 401 rather than
 * `requireSession`'s redirect, because this is fetched, not navigated to.
 */
export async function POST(req: Request) {
  const wallet = await currentAddress();
  if (!wallet) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const v = validateInput(body);
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });

  const r = await submitListing(wallet, v.input);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.status });
  return NextResponse.json({ id: r.id, ownership: r.ownership, report: r.report });
}

/** The caller's own requests and their state. */
export async function GET() {
  const wallet = await currentAddress();
  if (!wallet) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json(
    { requests: listingsByWallet(wallet) },
    { headers: { "cache-control": "no-store" } },
  );
}
