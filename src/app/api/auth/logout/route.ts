import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, endSession, sessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  endSession(jar.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  // Same attributes, empty value, zero age — a cookie only clears when the
  // attributes match the ones it was set with.
  res.cookies.set(sessionCookie("", 0));
  return res;
}
