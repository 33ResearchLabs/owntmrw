import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionAddress } from "./auth";

/**
 * The signed-in address, read from the database rather than trusted from the
 * cookie. Null when signed out.
 */
export async function currentAddress(): Promise<string | null> {
  const jar = await cookies();
  return sessionAddress(jar.get(SESSION_COOKIE)?.value);
}

/**
 * The real gate. `proxy.ts` only checks that a cookie exists, because it
 * cannot open SQLite — this is where a cookie that is forged, expired, or
 * left over from a deleted session is actually turned away.
 */
export async function requireSession(next: string): Promise<string> {
  const address = await currentAddress();
  if (!address) redirect(`/login?next=${encodeURIComponent(next)}`);
  return address;
}

/**
 * Admin wallets, from `ADMIN_WALLETS` (comma-separated). There is no admin
 * table: the set is tiny, changes with a deploy, and keeping it out of the
 * database means a compromised write path cannot promote anyone.
 */
export function adminWallets(): Set<string> {
  return new Set(
    (process.env.ADMIN_WALLETS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isAdmin(address: string | null): address is string {
  return !!address && adminWallets().has(address);
}

/** Signed in *and* an admin; anyone else is sent to the sign-in page. */
export async function requireAdmin(next: string): Promise<string> {
  const address = await requireSession(next);
  if (!isAdmin(address)) redirect("/");
  return address;
}
