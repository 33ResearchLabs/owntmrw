import { randomBytes, timingSafeEqual } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { db } from "./db";

/**
 * Wallet sign-in.
 *
 * Connecting a wallet proves nothing — any page can ask Phantom for a public
 * key, and a public key is public. What proves control of the key is a
 * signature over a challenge the server chose, which is what this module
 * issues and checks.
 */

/** Cookie the session token travels in. */
export const SESSION_COOKIE = "owntmrw_session";

/** How long a signed-in session lasts before the wallet must sign again. */
const SESSION_TTL = 7 * 24 * 60 * 60;

/**
 * How long a challenge stays signable. Short, because the window between
 * issuing a nonce and Phantom returning a signature is a few seconds of
 * human time, and anything longer is just a larger target.
 */
const NONCE_TTL = 5 * 60;

const nowSec = () => Math.floor(Date.now() / 1000);

/** A base58 Solana address is 32 bytes; anything else is not one. */
export function isAddress(v: unknown): v is string {
  if (typeof v !== "string" || v.length < 32 || v.length > 44) return false;
  try {
    return bs58.decode(v).length === 32;
  } catch {
    return false;
  }
}

/**
 * The text the wallet is asked to sign.
 *
 * It names the site and states what signing does, because a wallet popup
 * showing an opaque blob teaches people to approve opaque blobs. The nonce
 * and the timestamp are what make it single-use.
 */
export function challengeMessage(address: string, nonce: string, issuedTs: number) {
  return [
    "Underly wants you to sign in with your Solana account:",
    address,
    "",
    "Signing proves you control this wallet. It does not approve any transaction and cannot move funds.",
    "",
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(issuedTs * 1000).toISOString()}`,
  ].join("\n");
}

/** Issue a fresh challenge for an address, and sweep expired ones. */
export function issueNonce(address: string): { nonce: string; message: string; issuedTs: number } {
  const d = db();
  const now = nowSec();
  d.prepare("DELETE FROM auth_nonces WHERE issued_ts < ?").run(now - NONCE_TTL);

  const nonce = randomBytes(24).toString("base64url");
  d.prepare("INSERT INTO auth_nonces (nonce, address, issued_ts) VALUES (?, ?, ?)")
    .run(nonce, address, now);
  return { nonce, message: challengeMessage(address, nonce, now), issuedTs: now };
}

export type VerifyResult =
  | { ok: true; token: string; expiresTs: number }
  | { ok: false; reason: string };

/**
 * Check a signature against the challenge we issued, and open a session.
 *
 * The signature arrives base64 (see `toBase64` in the wallet provider); the
 * address is base58, because that is what a Solana address genuinely is.
 *
 * The nonce is consumed whatever the outcome. A failed attempt burning its
 * challenge means a captured signature cannot be retried against the same
 * nonce, and it costs an honest user nothing but a second click.
 */
export function verifySignature(address: string, nonce: string, signatureB64: string): VerifyResult {
  const d = db();
  const now = nowSec();

  const row = d.prepare(
    "SELECT nonce, address, issued_ts AS issuedTs, used_ts AS usedTs FROM auth_nonces WHERE nonce = ?"
  ).get(nonce) as { nonce: string; address: string; issuedTs: number; usedTs: number | null } | undefined;

  if (!row) return { ok: false, reason: "unknown challenge" };
  d.prepare("UPDATE auth_nonces SET used_ts = ? WHERE nonce = ?").run(now, nonce);

  if (row.usedTs != null) return { ok: false, reason: "challenge already used" };
  if (row.issuedTs < now - NONCE_TTL) return { ok: false, reason: "challenge expired" };
  // The challenge names an address; a signature from a different one is valid
  // in itself and still not an answer to what was asked.
  if (row.address !== address) return { ok: false, reason: "challenge was issued to another address" };

  let verified = false;
  try {
    verified = nacl.sign.detached.verify(
      new TextEncoder().encode(challengeMessage(address, nonce, row.issuedTs)),
      new Uint8Array(Buffer.from(signatureB64, "base64")),
      bs58.decode(address)
    );
  } catch {
    return { ok: false, reason: "malformed signature" };
  }
  if (!verified) return { ok: false, reason: "signature does not match" };

  const token = randomBytes(32).toString("base64url");
  const expiresTs = now + SESSION_TTL;
  d.prepare("INSERT INTO sessions (token, address, created_ts, expires_ts) VALUES (?, ?, ?, ?)")
    .run(token, address, now, expiresTs);
  d.prepare("DELETE FROM sessions WHERE expires_ts < ?").run(now);

  return { ok: true, token, expiresTs };
}

/**
 * The address behind a session token, or null.
 *
 * Compared with `timingSafeEqual` rather than by SQL equality on the way in —
 * the lookup is by primary key so the query itself is constant-ish, but the
 * confirmation is explicit so the intent survives a later refactor.
 */
export function sessionAddress(token: string | undefined | null): string | null {
  if (!token) return null;
  const row = db().prepare(
    "SELECT token, address, expires_ts AS expiresTs FROM sessions WHERE token = ?"
  ).get(token) as { token: string; address: string; expiresTs: number } | undefined;
  if (!row) return null;
  if (row.expiresTs < nowSec()) return null;

  const a = Buffer.from(row.token), b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return row.address;
}

export function endSession(token: string | undefined | null) {
  if (token) db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/** Cookie attributes shared by the routes that set and clear the session. */
export function sessionCookie(token: string, maxAge: number) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
