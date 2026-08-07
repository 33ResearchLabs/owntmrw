import { NextResponse } from "next/server";
import { isAddress, verifySignature, sessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { address?: unknown; nonce?: unknown; signature?: unknown }
    | null;
  const { address, nonce, signature } = body ?? {};

  if (!isAddress(address) || typeof nonce !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const result = verifySignature(address, nonce, signature);
  // The reason is returned because every one of them is a user-fixable state —
  // an expired challenge, a wallet switched mid-flow — and "login failed" sends
  // people to support instead of to the retry button.
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }

  const res = NextResponse.json({ address }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(sessionCookie(result.token, result.expiresTs - Math.floor(Date.now() / 1000)));
  return res;
}
