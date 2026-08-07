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
