import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/session";
import { isAddress } from "@/lib/auth";
import { ownerBalances } from "@/lib/sources/rpc";

export const dynamic = "force-dynamic";

/**
 * The connected wallet's balances, read server-side.
 *
 * The browser used to call `api.mainnet-beta.solana.com` directly, which is
 * the shape the rest of this component still describes — balances are the
 * reader's, not the archive's. It never worked: that endpoint answers 403
 * "Access forbidden" to any request carrying an `Origin` header, which is
 * every request a browser can make. `getBalance` and `getTokenAccountsByOwner`
 * both failed, so SOL and USDC read as absent and the portfolio scan returned
 * nothing — the header's "$0" was that failure rendering as a number.
 *
 * Server-side the same call succeeds, because there is no `Origin` to reject.
 *
 * What this does not do is store anything. The address is one the server
 * already holds — it is the session's own, and the check below refuses any
 * other — so nothing here learns something it did not already know; the
 * balances are read, returned, and forgotten.
 *
 * Restricted to the session's own address on purpose. Without that this is an
 * open Solana RPC proxy wearing the site's domain, and the free endpoint
 * behind it is a shared resource that would be spent by whoever found it.
 */
export async function GET(req: Request) {
  const session = await currentAddress();
  if (!session) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const asked = new URL(req.url).searchParams.get("address");
  if (asked && (!isAddress(asked) || asked !== session)) {
    // A wallet other than the signed-in one. `ConnectButton` already calls
    // this state out as "Wallet changed — reconnect"; this is the same
    // judgement enforced rather than displayed.
    return NextResponse.json({ error: "address is not this session" }, { status: 403 });
  }

  const balances = await ownerBalances(session);
  return NextResponse.json(balances, { headers: { "cache-control": "no-store" } });
}
