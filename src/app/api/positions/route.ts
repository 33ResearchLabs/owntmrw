import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/session";
import { ledgerPositions } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Simulated positions for the signed-in wallet, mint -> amount. */
export async function GET() {
  const session = await currentAddress();

  if (!session) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const positions = ledgerPositions(session);

  return NextResponse.json(Object.fromEntries(positions), {
    headers: { "cache-control": "no-store" },
  });
}
