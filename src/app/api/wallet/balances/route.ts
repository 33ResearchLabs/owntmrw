import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/session";
import { isAddress } from "@/lib/auth";
import { ownerBalances } from "@/lib/sources/rpc";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await currentAddress();

  if (!session) {
    return NextResponse.json(
      {
        error: "not signed in",
      },
      {
        status: 401,
      },
    );
  }

  const asked = new URL(req.url).searchParams.get("address");

  if (asked && (!isAddress(asked) || asked !== session)) {
    return NextResponse.json(
      {
        error: "address is not this session",
      },
      {
        status: 403,
      },
    );
  }

  const balances = await ownerBalances(session);

  return NextResponse.json(balances, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
