import { db, upsertProject } from "./db";
import { isAddress } from "./auth";
import {
  ownershipOf,
  verifyListing,
  type ListingVerification,
  type Ownership,
} from "./sources/listings";

/**
 * Self-serve listings: what a creator may submit, what the server records,
 * and what an admin does with it. The on-chain and market reads live in
 * `sources/listings.ts`; this is the queue around them.
 */

const nowSec = () => Math.floor(Date.now() / 1000);

/** One open request per wallet, and a daily ceiling on top. */
const MAX_PER_DAY = 3;

export const CATEGORIES = [
  "DeFi",
  "Perps / Trading",
  "Payments",
  "Infrastructure",
  "Governance / Launchpad",
  "LST / ZK",
  "Consumer",
  "Gaming",
  "AI",
  "Other",
] as const;

/** The fields a creator fills in. Everything else is the server's. */
export interface ListingInput {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  category: string;
  website: string;
  twitter: string;
  discord: string;
  telegram: string;
  github: string;
  docs: string;
  image_url: string;
  proof_url: string;
}

export interface ListingRequest extends ListingInput {
  id: number;
  submitted_by: string;
  status: "pending" | "approved" | "rejected";
  ownership: Ownership;
  verification: ListingVerification;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_ts: number | null;
  project_id: number | null;
  created_ts: number;
  /** Slug of the approved project, joined in for the status list. */
  slug: string | null;
}

/* ------------------------------------------------------------ validation --- */

/**
 * Link hosts. The point is not tidiness: a real token listed with a phishing
 * "website" is the one attack this feature obviously invites, and pinning
 * the socials to their own hosts removes most of the surface. The website
 * itself can be anything https.
 */
const HOSTS: Partial<Record<keyof ListingInput, string[]>> = {
  twitter: ["x.com", "twitter.com"],
  github: ["github.com"],
  discord: ["discord.gg", "discord.com"],
  telegram: ["t.me", "telegram.me"],
};

function cleanUrl(
  field: keyof ListingInput,
  raw: string,
): { ok: true; value: string } | { ok: false; reason: string } {
  const v = raw.trim();
  if (!v) return { ok: true, value: "" };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { ok: false, reason: `${field}: not a valid URL.` };
  }
  if (u.protocol !== "https:")
    return { ok: false, reason: `${field}: must be an https:// link.` };
  const hosts = HOSTS[field];
  if (hosts) {
    const host = u.hostname.replace(/^www\./, "");
    if (!hosts.includes(host))
      return { ok: false, reason: `${field}: must be on ${hosts.join(" or ")}.` };
  }
  if (v.length > 300) return { ok: false, reason: `${field}: too long.` };
  return { ok: true, value: u.toString() };
}

export type Validated =
  | { ok: true; input: ListingInput }
  | { ok: false; reason: string };

/** Shape checks only — nothing here touches the chain. */
export function validateInput(body: unknown): Validated {
  const b = (body ?? {}) as Record<string, unknown>;
  const s = (k: keyof ListingInput) =>
    typeof b[k] === "string" ? (b[k] as string).trim() : "";

  const mint = s("mint");
  if (!isAddress(mint)) return { ok: false, reason: "Mint address is not a valid Solana address." };

  const name = s("name");
  if (name.length < 2 || name.length > 40)
    return { ok: false, reason: "Name must be 2–40 characters." };

  const symbol = s("symbol").toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(symbol))
    return { ok: false, reason: "Symbol must be 2–10 letters or digits." };

  const description = s("description");
  if (description.length > 600)
    return { ok: false, reason: "Description must be 600 characters or fewer." };
  if (/<[a-z!/]/i.test(description))
    return { ok: false, reason: "Description is plain text — no HTML." };

  const category = s("category");
  if (category && !(CATEGORIES as readonly string[]).includes(category))
    return { ok: false, reason: "Unknown category." };

  const out: ListingInput = {
    mint, name, symbol, description, category,
    website: "", twitter: "", discord: "", telegram: "",
    github: "", docs: "", image_url: "", proof_url: "",
  };
  for (const k of ["website", "twitter", "discord", "telegram", "github", "docs", "image_url", "proof_url"] as const) {
    const r = cleanUrl(k, s(k));
    if (!r.ok) return r;
    out[k] = r.value;
  }
  return { ok: true, input: out };
}

/* ---------------------------------------------------------------- submit --- */

export type SubmitResult =
  | { ok: true; id: number; ownership: Ownership; report: ListingVerification }
  | { ok: false; reason: string; status: number };

export async function submitListing(
  wallet: string,
  input: ListingInput,
): Promise<SubmitResult> {
  const d = db();

  // Cheap refusals first, before spending an RPC round trip.
  const listed = d
    .prepare("SELECT slug FROM projects WHERE mint = ?")
    .get(input.mint) as { slug: string } | undefined;
  if (listed)
    return { ok: false, status: 409, reason: `Already listed as /project/${listed.slug}.` };

  const pendingMint = d
    .prepare("SELECT id FROM listing_requests WHERE mint = ? AND status = 'pending'")
    .get(input.mint);
  if (pendingMint)
    return { ok: false, status: 409, reason: "This token is already under review." };

  const openByWallet = d
    .prepare("SELECT id FROM listing_requests WHERE submitted_by = ? AND status = 'pending'")
    .get(wallet);
  if (openByWallet)
    return { ok: false, status: 429, reason: "You already have a listing under review. Wait for that one first." };

  const today = (
    d.prepare("SELECT COUNT(*) AS n FROM listing_requests WHERE submitted_by = ? AND created_ts > ?")
      .get(wallet, nowSec() - 86400) as { n: number }
  ).n;
  if (today >= MAX_PER_DAY)
    return { ok: false, status: 429, reason: "Daily submission limit reached." };

  const verified = await verifyListing(input.mint, input.website || null);
  if (!verified.ok) return { ok: false, status: 422, reason: verified.reason };
  const { report } = verified;

  const ownership = ownershipOf(wallet, report.mint, report.metadata);
  if (ownership === "unverified" && !input.proof_url) {
    return {
      ok: false,
      status: 422,
      reason:
        "Your wallet is not this token's mint or update authority. Add a public proof link — a post from the project's official account, or a page on its site — that names this mint.",
    };
  }

  // Fall back to what the chain and the market say for anything left blank.
  const image_url = input.image_url || report.metadata?.image || report.market?.image || "";
  const website = input.website || report.market?.website || "";
  const twitter = input.twitter || report.market?.twitter || "";
  const telegram = input.telegram || report.market?.telegram || "";
  const discord = input.discord || report.market?.discord || "";

  const info = d
    .prepare(
      `INSERT INTO listing_requests
         (mint, submitted_by, status, name, symbol, description, category,
          website, twitter, discord, telegram, github, docs, image_url, proof_url,
          verification, ownership, created_ts)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.mint, wallet, input.name, input.symbol,
      input.description || null, input.category || null,
      website || null, twitter || null, discord || null, telegram || null,
      input.github || null, input.docs || null, image_url || null, input.proof_url || null,
      JSON.stringify(report), ownership, nowSec(),
    );
  return { ok: true, id: Number(info.lastInsertRowid), ownership, report };
}

/* ----------------------------------------------------------------- reads --- */

function hydrate(row: Record<string, unknown>): ListingRequest {
  return {
    ...(row as unknown as ListingRequest),
    verification: JSON.parse(row.verification as string) as ListingVerification,
  };
}

const SELECT = `
  SELECT r.*, p.slug AS slug
  FROM listing_requests r
  LEFT JOIN projects p ON p.id = r.project_id`;

export function listingsByWallet(wallet: string): ListingRequest[] {
  return (
    db()
      .prepare(`${SELECT} WHERE r.submitted_by = ? ORDER BY r.created_ts DESC LIMIT 20`)
      .all(wallet) as Record<string, unknown>[]
  ).map(hydrate);
}

export function listingQueue(status: ListingRequest["status"] = "pending", limit = 100): ListingRequest[] {
  return (
    db()
      .prepare(`${SELECT} WHERE r.status = ? ORDER BY r.created_ts ${status === "pending" ? "ASC" : "DESC"} LIMIT ?`)
      .all(status, limit) as Record<string, unknown>[]
  ).map(hydrate);
}

export function listingById(id: number): ListingRequest | null {
  const row = db().prepare(`${SELECT} WHERE r.id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? hydrate(row) : null;
}

/* ---------------------------------------------------------------- review --- */

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Symbol first, name as fallback, numeric suffix on collision. */
function freeSlug(symbol: string, name: string): string {
  const d = db();
  const taken = (slug: string) =>
    !!d.prepare("SELECT 1 FROM projects WHERE slug = ?").get(slug);
  const base = slugify(symbol) || slugify(name) || "token";
  if (!taken(base)) return base;
  const alt = slugify(name);
  if (alt && alt !== base && !taken(alt)) return alt;
  for (let i = 2; i < 100; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${nowSec()}`;
}

export type ReviewResult =
  | { ok: true; slug: string | null }
  | { ok: false; reason: string; status: number };

/**
 * Approve: create the project and stamp the listing on its timeline, in one
 * transaction so a half-approved request cannot exist. `upsertProject`
 * matches on mint as well as slug, so a token MetaDAO discovery later finds
 * overlays this row rather than duplicating it.
 */
export function approveListing(id: number, admin: string, note: string | null): ReviewResult {
  const r = listingById(id);
  if (!r) return { ok: false, status: 404, reason: "No such request." };
  if (r.status !== "pending") return { ok: false, status: 409, reason: `Already ${r.status}.` };

  const d = db();
  const run = d.transaction(() => {
    const slug = freeSlug(r.symbol, r.name);
    const market = r.verification.market;
    const ts = nowSec();
    const projectId = upsertProject({
      slug,
      name: r.name,
      symbol: r.symbol,
      description: r.description || null,
      category: r.category || null,
      status: market ? "live" : "unlaunched",
      image_url: r.image_url || null,
      website: r.website || null,
      twitter: r.twitter || null,
      discord: r.discord || null,
      telegram: r.telegram || null,
      github: r.github || null,
      docs: r.docs || null,
      mint: r.mint,
      pool_address: market?.pairAddress ?? null,
      total_supply: r.verification.mint.supply || null,
      launch_ts: market?.createdTs ?? null,
      source: "submitted",
      submitted_by: r.submitted_by,
      listed_ts: ts,
    });
    d.prepare(
      `INSERT OR IGNORE INTO events (project_id, ts, type, title, detail, url)
       VALUES (?, ?, 'listing', 'Listed on Underly', ?, NULL)`,
    ).run(projectId, ts, `Community listing submitted by ${r.submitted_by.slice(0, 4)}…${r.submitted_by.slice(-4)}`);
    d.prepare(
      `UPDATE listing_requests
         SET status = 'approved', reviewed_by = ?, review_note = ?, reviewed_ts = ?, project_id = ?
       WHERE id = ?`,
    ).run(admin, note, ts, projectId, id);
    return slug;
  });
  return { ok: true, slug: run() };
}

export function rejectListing(id: number, admin: string, note: string | null): ReviewResult {
  const r = listingById(id);
  if (!r) return { ok: false, status: 404, reason: "No such request." };
  if (r.status !== "pending") return { ok: false, status: 409, reason: `Already ${r.status}.` };
  db()
    .prepare(
      `UPDATE listing_requests
         SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_ts = ?
       WHERE id = ?`,
    )
    .run(admin, note, nowSec(), id);
  return { ok: true, slug: null };
}
