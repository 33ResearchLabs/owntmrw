import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/session";
import { isAddress } from "@/lib/auth";
import { inspectMint, ownershipOf, LISTINGS_CLUSTER } from "@/lib/sources/listings";

export const dynamic = "force-dynamic";

/**
 * Step one of the form: paste a mint, learn what the chain calls it and
 * whether this wallet can prove it owns it — before typing anything else.
 * Creates nothing.
 */
export async function POST(req: Request) {
  const wallet = await currentAddress();
  if (!wallet) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { mint?: unknown } | null;
  const mint = typeof body?.mint === "string" ? body.mint.trim() : "";
  if (!isAddress(mint))
    return NextResponse.json({ error: "Not a valid Solana address." }, { status: 400 });

  const r = await inspectMint(mint);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 422 });
  return NextResponse.json({
    cluster: LISTINGS_CLUSTER,
    mint: r.mint,
    metadata: r.metadata,
    ownership: ownershipOf(wallet, r.mint, r.metadata),
  });
}
