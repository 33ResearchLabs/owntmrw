import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionAddress } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Who the browser is signed in as, for client components that need to know. */
export async function GET() {
  const jar = await cookies();
  return NextResponse.json(
    { address: sessionAddress(jar.get(SESSION_COOKIE)?.value) },
    { headers: { "cache-control": "no-store" } }
  );
}
