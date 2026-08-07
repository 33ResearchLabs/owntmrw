import { NextResponse } from "next/server";
import { isAddress, issueNonce } from "@/lib/auth";

/** A challenge is per-attempt and must never be cached or prerendered. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const address = (body as { address?: unknown } | null)?.address;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const { nonce, message } = issueNonce(address);
  return NextResponse.json({ nonce, message }, { headers: { "cache-control": "no-store" } });
}
