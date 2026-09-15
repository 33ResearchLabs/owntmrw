import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Second factor for the review desk.
 *
 * A wallet in ADMIN_WALLETS proves who is asking; this proves they also hold
 * the shared passphrase. Either alone is not enough to approve a listing: a
 * stolen session cookie has no passphrase, and a leaked passphrase has no
 * admin wallet. The unlock is short-lived and bound to the wallet that
 * entered it, so it cannot be carried to another session.
 */

export const ADMIN_COOKIE = "owntmrw_admin";

/** How long an unlock lasts before the passphrase is asked for again. */
const UNLOCK_TTL = 60 * 60;

/** Anything shorter is not a strong passphrase; the desk stays locked. */
const MIN_PASSWORD_LENGTH = 16;

/** Failed attempts before a wallet is locked out, and for how long. */
const MAX_ATTEMPTS = 5;
const LOCKOUT = 15 * 60;

const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * The configured passphrase, or null when it is missing or too weak. Null
 * closes the desk rather than opening it: a deployment that forgot to set a
 * passphrase must not be one where approval needs no passphrase.
 */
function configuredPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD ?? "";
  return p.length >= MIN_PASSWORD_LENGTH ? p : null;
}

export function adminPasswordConfigured(): boolean {
  return configuredPassword() !== null;
}

/**
 * Unlock tokens are HMACs keyed off the passphrase itself, so rotating the
 * passphrase invalidates every outstanding unlock with no state to clear.
 */
function sign(payload: string, password: string): string {
  return createHmac("sha256", `underly-admin:${password}`)
    .update(payload)
    .digest("base64url");
}

export function issueAdminToken(wallet: string): { token: string; maxAge: number } | null {
  const password = configuredPassword();
  if (!password) return null;
  const payload = `${wallet}.${nowSec() + UNLOCK_TTL}`;
  return {
    token: `${Buffer.from(payload).toString("base64url")}.${sign(payload, password)}`,
    maxAge: UNLOCK_TTL,
  };
}

export function verifyAdminToken(token: string | undefined, wallet: string): boolean {
  const password = configuredPassword();
  if (!password || !token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = Buffer.from(token.slice(0, dot), "base64url").toString();
  const expected = sign(payload, password);
  const given = token.slice(dot + 1);
  if (expected.length !== given.length) return false;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return false;
  const [w, exp] = payload.split(".");
  return w === wallet && Number(exp) > nowSec();
}

/** Whether this request carries a valid, unexpired unlock for `wallet`. */
export async function adminUnlocked(wallet: string): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminToken(jar.get(ADMIN_COOKIE)?.value, wallet);
}

/* ------------------------------------------------------------ attempts --- */

/**
 * Per-wallet failure counter. In memory: the admin set is a handful of
 * people, and a lockout that resets on redeploy is an acceptable trade for
 * having nothing about passphrase attempts in the database.
 */
const attempts = new Map<string, { fails: number; lockedUntil: number }>();

export function lockedOutFor(wallet: string): number {
  const a = attempts.get(wallet);
  if (!a) return 0;
  const left = a.lockedUntil - nowSec();
  return left > 0 ? left : 0;
}

/**
 * Compare a submitted passphrase against the configured one in constant
 * time, and count the failure. True only when the desk is configured, the
 * wallet is not locked out, and the passphrase matches.
 */
export function checkPassword(wallet: string, given: string): boolean {
  const password = configuredPassword();
  if (!password) return false;
  if (lockedOutFor(wallet) > 0) return false;

  const a = Buffer.from(given);
  const b = Buffer.from(password);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (ok) {
    attempts.delete(wallet);
    return true;
  }
  const cur = attempts.get(wallet) ?? { fails: 0, lockedUntil: 0 };
  cur.fails += 1;
  if (cur.fails >= MAX_ATTEMPTS) {
    cur.fails = 0;
    cur.lockedUntil = nowSec() + LOCKOUT;
  }
  attempts.set(wallet, cur);
  return false;
}

/**
 * Same-origin check for state-changing admin calls. The session cookie is
 * SameSite=Lax, which already stops cross-site POSTs in current browsers;
 * this is the explicit version of that rule, so it does not depend on
 * browser defaults staying what they are.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
