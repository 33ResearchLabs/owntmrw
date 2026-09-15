import { NextResponse } from "next/server";
import { currentAddress, isAdmin } from "@/lib/session";
import {
  ADMIN_COOKIE,
  adminPasswordConfigured,
  checkPassword,
  issueAdminToken,
  lockedOutFor,
  sameOrigin,
} from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Enter the passphrase; on success, an hour-long unlock bound to this wallet. */
export async function POST(req: Request) {
  const wallet = await currentAddress();
  if (!isAdmin(wallet)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!adminPasswordConfigured())
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not set, or is shorter than 16 characters. The desk stays locked until it is." },
      { status: 503 },
    );

  const wait = lockedOutFor(wallet);
  if (wait > 0)
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.` },
      { status: 429 },
    );

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!checkPassword(wallet, password))
    return NextResponse.json({ error: "Wrong passphrase." }, { status: 401 });

  const issued = issueAdminToken(wallet);
  if (!issued) return NextResponse.json({ error: "Locked." }, { status: 503 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, issued.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: issued.maxAge,
  });
  return res;
}

/** Lock the desk again. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
