import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
const BUNDLED_DB_PATH = path.join(DATA_DIR, "metaintel.db");

// Serverless platforms (Vercel) ship the deployment as a read-only bundle —
// only /tmp is writable. WAL mode needs to create -shm/-wal sidecar files
// even for reads, so on read-only filesystems we copy the bundled snapshot
// into /tmp once per cold start and open it there instead.
const IS_READONLY_FS =
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const DB_PATH = IS_READONLY_FS
  ? path.join("/tmp", "metaintel.db")
  : BUNDLED_DB_PATH;

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  if (IS_READONLY_FS) {
    if (!fs.existsSync(DB_PATH) && fs.existsSync(BUNDLED_DB_PATH)) {
      fs.copyFileSync(BUNDLED_DB_PATH, DB_PATH);
    }
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  migrate(_db);
  return _db;
}

function migrate(d: Database.Database) {
  d.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT,
    description TEXT,
    category TEXT,
    status TEXT,               -- live | raising | completed | failed | unlaunched
    image_url TEXT,
    website TEXT, twitter TEXT, discord TEXT, telegram TEXT,
    github TEXT, docs TEXT, whitepaper TEXT,
    mint TEXT UNIQUE,
    dao_address TEXT,
    treasury_address TEXT,
    pool_address TEXT,
    launch_ts INTEGER,
    raise_start_ts INTEGER,
    raise_end_ts INTEGER,
    raise_amount_usd REAL,
    raise_goal_usd REAL,
    raise_contributors INTEGER,
    raise_price REAL,          -- token price at raise
    initial_supply REAL,
    total_supply REAL,
    circulating_supply REAL,
    team_package REAL,         -- locked team performance package
    liquidity_tokens REAL,     -- tokens seeded into AMM + LP
    launch_address TEXT,
    team_address TEXT,         -- vault holding team_package
    amm_vault_address TEXT,    -- futarchy AMM liquidity vault
    lp_pool_address TEXT,      -- MetaDAO's Meteora pool
    source TEXT,               -- where we discovered it
    updated_ts INTEGER
  );

  CREATE TABLE IF NOT EXISTS price_snapshots (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    ts INTEGER NOT NULL,
    price_usd REAL, mcap REAL, fdv REAL,
    liquidity_usd REAL, vol24h REAL,
    change_1h REAL, change_24h REAL, change_7d REAL,
    PRIMARY KEY (project_id, ts)
  );

  CREATE TABLE IF NOT EXISTS candles (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    ts INTEGER NOT NULL,       -- unix seconds, day open
    o REAL, h REAL, l REAL, c REAL, v REAL,
    PRIMARY KEY (project_id, ts)
  );

  CREATE TABLE IF NOT EXISTS holder_snapshots (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    ts INTEGER NOT NULL,
    holder_count INTEGER,
    top10_pct REAL, top20_pct REAL,
    supply REAL,
    PRIMARY KEY (project_id, ts)
  );

  CREATE TABLE IF NOT EXISTS top_holders (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    rank INTEGER NOT NULL,
    address TEXT NOT NULL,
    owner TEXT,
    amount REAL, pct REAL,
    label TEXT,                -- classified: Liquidity Pool, Treasury, Exchange, ...
    ts INTEGER,
    PRIMARY KEY (project_id, rank)
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    number INTEGER,
    address TEXT UNIQUE,
    title TEXT, author TEXT,
    created_ts INTEGER,
    state TEXT,                -- pending | passed | failed
    pass_price REAL, fail_price REAL,
    url TEXT, description TEXT
  );

  CREATE TABLE IF NOT EXISTS governance (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id),
  
    detected INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'unknown',
    protocol TEXT,
  
    governance_address TEXT,
    governance_program TEXT,
  
    voting_model TEXT,
    voting_token TEXT,
  
    proposal_count INTEGER NOT NULL DEFAULT 0,
    active_proposals INTEGER NOT NULL DEFAULT 0,
    passed_proposals INTEGER NOT NULL DEFAULT 0,
    failed_proposals INTEGER NOT NULL DEFAULT 0,
  
    quorum REAL,
    approval_threshold REAL,
  
    treasury_address TEXT,
  
    mint_authority TEXT,
    freeze_authority TEXT,
  
    source_url TEXT,
    updated_ts INTEGER
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    ts INTEGER NOT NULL,
    type TEXT NOT NULL,        -- raise_closed | token_launch | proposal | github_release | listing | news
    title TEXT NOT NULL,
    detail TEXT, url TEXT,
    UNIQUE (project_id, ts, type, title)
  );

  CREATE TABLE IF NOT EXISTS github_snapshots (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    ts INTEGER NOT NULL,
    stars INTEGER, forks INTEGER, repos INTEGER,
    commits_30d INTEGER, contributors INTEGER,
    last_push_ts INTEGER,
    PRIMARY KEY (project_id, ts)
  );

  CREATE TABLE IF NOT EXISTS wallets (
    address TEXT PRIMARY KEY,
    label TEXT, type TEXT, note TEXT
  );

  CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    ts INTEGER NOT NULL,
    kind TEXT,                 -- momentum | holders | github | price | risk
    text TEXT NOT NULL
  );

  -- One row per balance *change*, not per read. ts is when the balance first
  -- read as value_usd, last_seen_ts when we last confirmed it still did — so a
  -- vault that sits still stays one row without losing the fact that we kept
  -- checking. See recordTreasurySnapshot.
  CREATE TABLE IF NOT EXISTS treasury_snapshots (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    ts INTEGER NOT NULL,
    value_usd REAL,
    last_seen_ts INTEGER,
    PRIMARY KEY (project_id, ts)
  );

  -- Current venue list per token. Replaced wholesale on each ingest rather than
  -- appended: a delisting must disappear, not linger as stale history.
  CREATE TABLE IF NOT EXISTS exchange_listings (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    exchange TEXT NOT NULL,
    pair TEXT NOT NULL,
    volume_usd REAL,
    trust TEXT,
    url TEXT,
    is_dex INTEGER,
    ts INTEGER,
    PRIMARY KEY (project_id, exchange, pair)
  );

  -- Contract risk as reported by RugCheck. score_normalised is 0-100 where
  -- higher is safer, which is the opposite direction to the raw score.
  CREATE TABLE IF NOT EXISTS risk_snapshots (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    ts INTEGER NOT NULL,
    score REAL,
    score_normalised INTEGER,
    rugged INTEGER,
    mint_authority INTEGER,
    freeze_authority INTEGER,
    lp_locked_pct REAL,
    total_holders INTEGER,
    total_lp_providers INTEGER,
    risks TEXT,
    PRIMARY KEY (project_id, ts)
  );

  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

  /*
   * Wallet sign-in. A nonce is issued per login attempt, consumed exactly
   * once, and kept only long enough to be signed — storing it server-side is
   * what stops a captured signature being replayed, which is the whole point
   * of the challenge.
   */
  CREATE TABLE IF NOT EXISTS auth_nonces (
    nonce TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    issued_ts INTEGER NOT NULL,
    used_ts INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    created_ts INTEGER NOT NULL,
    expires_ts INTEGER NOT NULL
  );

  /*
   * Simulated trading. The vault has no inventory of any tracked project
   * token and no mint authority over them, so a "buy" cannot deliver a real
   * token — only the real USDT leg (collected by /api/swap) is on-chain.
   * This is the ledger for the other half: a paper position, kept only so
   * Portfolio has something to show for a completed trade. tx_signature is
   * set on buy rows (the USDT transfer that funded the position) and left
   * NULL on sell rows, which never move real funds.
   */
  CREATE TABLE IF NOT EXISTS ledger_trades (
    id INTEGER PRIMARY KEY,
    address TEXT NOT NULL,
    mint TEXT NOT NULL,
    side TEXT NOT NULL,          -- buy | sell
    token_amount REAL NOT NULL,
    price_usd REAL,
    usd_amount REAL NOT NULL,
    tx_signature TEXT UNIQUE,
    ts INTEGER NOT NULL
  );

  -- Current simulated holding per wallet/mint. Derived entirely from
  -- ledger_trades; kept as its own table so a read doesn't have to fold the
  -- whole history every time.
  CREATE TABLE IF NOT EXISTS ledger_positions (
    address TEXT NOT NULL,
    mint TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    updated_ts INTEGER NOT NULL,
    PRIMARY KEY (address, mint)
  );

  CREATE INDEX IF NOT EXISTS idx_snap_proj ON price_snapshots(project_id, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_events_proj ON events(project_id, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_ts);
  CREATE INDEX IF NOT EXISTS idx_ledger_trades_addr ON ledger_trades(address, ts DESC);
  `);

  // additive column migrations for databases created by an earlier schema
  addColumns(d, "projects", [
    ["total_supply", "REAL"],
    ["circulating_supply", "REAL"],
    ["team_package", "REAL"],
    ["liquidity_tokens", "REAL"],
    ["launch_address", "TEXT"],
    ["raise_contributors", "INTEGER"],
    ["raise_note", "TEXT"],
    ["raise_source_url", "TEXT"],
    ["raise_committed_usd", "REAL"],
    ["raise_fdv_usd", "REAL"],
    ["raise_track", "TEXT"],
    // The allocation vaults. MetaDAO returned these all along; reading only the
    // amounts left the vault holding half a launch's supply unidentifiable.
    ["team_address", "TEXT"],
    ["amm_vault_address", "TEXT"],
    ["lp_pool_address", "TEXT"],
  ]);

  // The GitHub snapshot began as four headline counters; the development view
  // needs the whole engineering picture, and these are all additive.
  addColumns(d, "github_snapshots", [
    ["commits_90d", "INTEGER"],
    ["open_issues", "INTEGER"],
    ["closed_issues", "INTEGER"],
    ["open_prs", "INTEGER"],
    ["merged_prs", "INTEGER"],
    ["releases_count", "INTEGER"],
    ["active_repos", "INTEGER"],
    ["last_commit_ts", "INTEGER"],
    // JSON blobs: a language breakdown and a weekly additions/deletions series.
    // Neither is queried relationally, so a column beats a child table here.
    ["languages", "TEXT"],
    ["code_frequency", "TEXT"],
  ]);

  // Rows written before the series became change-based have no last_seen_ts;
  // readers coalesce it to ts, which is correct for a one-read-one-row past.
  addColumns(d, "treasury_snapshots", [["last_seen_ts", "INTEGER"]]);
}

function addColumns(
  d: Database.Database,
  table: string,
  added: [string, string][],
) {
  const cols = new Set(
    (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  for (const [name, type] of added) {
    if (!cols.has(name))
      d.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

// ---------- typed helpers ----------

export interface Project {
  id: number;
  slug: string;
  name: string;
  symbol: string | null;
  description: string | null;
  category: string | null;
  status: string | null;
  image_url: string | null;
  website: string | null;
  twitter: string | null;
  discord: string | null;
  telegram: string | null;
  github: string | null;
  docs: string | null;
  whitepaper: string | null;
  mint: string | null;
  dao_address: string | null;
  treasury_address: string | null;
  pool_address: string | null;
  launch_ts: number | null;
  raise_start_ts: number | null;
  raise_end_ts: number | null;
  raise_amount_usd: number | null;
  raise_goal_usd: number | null;
  raise_contributors: number | null;
  raise_price: number | null;
  initial_supply: number | null;
  total_supply: number | null;
  circulating_supply: number | null;
  team_package: number | null;
  liquidity_tokens: number | null;
  launch_address: string | null;
  /** Vault holding team_package — the largest holder of most launches. */
  team_address: string | null;
  /** Vaults behind liquidity_tokens, from MetaDAO rather than an aggregator. */
  amm_vault_address: string | null;
  lp_pool_address: string | null;
  raise_note: string | null;
  raise_source_url: string | null;
  raise_committed_usd: number | null;
  raise_fdv_usd: number | null;
  raise_track: string | null;
  source: string | null;
  updated_ts: number | null;
}

export type GovernanceType =
  | "metadao"
  | "realms"
  | "squads"
  | "multisig"
  | "custom"
  | "none"
  | "unknown";

export interface Governance {
  project_id: number;
  detected: number;
  type: GovernanceType;
  protocol: string | null;

  governance_address: string | null;
  governance_program: string | null;

  voting_model: string | null;
  voting_token: string | null;

  proposal_count: number;
  active_proposals: number;
  passed_proposals: number;
  failed_proposals: number;

  quorum: number | null;
  approval_threshold: number | null;

  treasury_address: string | null;

  mint_authority: string | null;
  freeze_authority: string | null;

  source_url: string | null;
  updated_ts: number | null;
}

export function upsertProject(
  p: Partial<Project> & { slug: string; name: string },
): number {
  const d = db();
  const existing = d
    .prepare(
      "SELECT id FROM projects WHERE slug = ? OR (mint IS NOT NULL AND mint = ?)",
    )
    .get(p.slug, p.mint ?? null) as { id: number } | undefined;
  const cols = [
    "name",
    "symbol",
    "description",
    "category",
    "status",
    "image_url",
    "website",
    "twitter",
    "discord",
    "telegram",
    "github",
    "docs",
    "whitepaper",
    "mint",
    "dao_address",
    "treasury_address",
    "pool_address",
    "launch_ts",
    "raise_start_ts",
    "raise_end_ts",
    "raise_amount_usd",
    "raise_goal_usd",
    "raise_contributors",
    "raise_price",
    "initial_supply",
    "total_supply",
    "circulating_supply",
    "team_package",
    "liquidity_tokens",
    "launch_address",
    "team_address",
    "amm_vault_address",
    "lp_pool_address",
    "raise_note",
    "raise_source_url",
    "raise_committed_usd",
    "raise_fdv_usd",
    "raise_track",
    "source",
  ] as const;
  if (existing) {
    // only overwrite with non-null incoming values
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const c of cols) {
      const v = (p as Record<string, unknown>)[c];
      if (v !== undefined && v !== null && v !== "") {
        sets.push(`${c} = ?`);
        vals.push(v);
      }
    }
    sets.push("updated_ts = ?");
    vals.push(Math.floor(Date.now() / 1000));
    vals.push(existing.id);
    d.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(
      ...vals,
    );
    return existing.id;
  }
  const vals = cols.map((c) => (p as Record<string, unknown>)[c] ?? null);
  const info = d
    .prepare(
      `INSERT INTO projects (slug, ${cols.join(", ")}, updated_ts) VALUES (?, ${cols.map(() => "?").join(", ")}, ?)`,
    )
    .run(p.slug, ...vals, Math.floor(Date.now() / 1000));
  return Number(info.lastInsertRowid);
}

export function allProjects(): Project[] {
  return db()
    .prepare("SELECT * FROM projects ORDER BY name")
    .all() as Project[];
}

export function projectBySlug(slug: string): Project | undefined {
  return db().prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as
    | Project
    | undefined;
}

/**
 * Event types that are a derived fact rather than an occurrence.
 *
 * A project closes its raise once and begins trading once. News, releases and
 * proposals are the opposite — each row is its own event and must accumulate.
 */
export type StructuralEvent = "raise_closed" | "token_launch";

/**
 * Record a structural event, replacing any earlier reading of the same fact.
 *
 * The events table is unique on (project_id, ts, type, title), so when a source
 * corrects a date the new row does not collide with the old one and INSERT OR
 * IGNORE appends instead of updating — which is how three projects came to show
 * "Raise closed" twice, two days apart, one of them a fossil of a superseded
 * date.
 *
 * Ordered so a failure can only ever leave the record more correct: rows with a
 * different timestamp go first, then the right one is written or its detail
 * refreshed. Nothing is deleted unless a replacement timestamp is already known,
 * so a source that temporarily stops reporting a date cannot erase the event.
 */
export function recordStructuralEvent(
  projectId: number,
  ts: number,
  type: StructuralEvent,
  title: string,
  detail: string | null,
): void {
  const d = db();
  d.prepare(
    "DELETE FROM events WHERE project_id = ? AND type = ? AND ts <> ?",
  ).run(projectId, type, ts);
  d.prepare(
    `
    INSERT INTO events (project_id, ts, type, title, detail, url) VALUES (?,?,?,?,?,NULL)
    ON CONFLICT (project_id, ts, type, title) DO UPDATE SET detail = excluded.detail
  `,
  ).run(projectId, ts, type, title, detail);
}

/**
 * Two vault reads that mean "the balance did not move". Compared at cent
 * precision because the balance is a USDC total: anything finer is float
 * noise from the RPC decimal conversion, not money leaving the treasury.
 */
export function sameBalance(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) < 0.005;
}

/**
 * Record a treasury reading. Ingest runs on a schedule while balances move on
 * governance time, so appending every read buries the handful of real
 * movements under hundreds of identical rows. An unchanged balance instead
 * extends the current row's last_seen_ts — the read is still on file, it just
 * does not pretend to be a new data point. Returns true on a real change.
 */
export function recordTreasurySnapshot(
  projectId: number,
  ts: number,
  valueUsd: number,
): boolean {
  const d = db();
  const prev = d
    .prepare(
      "SELECT ts, value_usd FROM treasury_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 1",
    )
    .get(projectId) as { ts: number; value_usd: number | null } | undefined;

  if (prev && sameBalance(prev.value_usd, valueUsd)) {
    // max() guards a clock skew or a backfill from walking last_seen_ts backwards.
    d.prepare(
      "UPDATE treasury_snapshots SET last_seen_ts = max(COALESCE(last_seen_ts, ts), ?) WHERE project_id = ? AND ts = ?",
    ).run(ts, projectId, prev.ts);
    return false;
  }

  d.prepare(
    "INSERT OR REPLACE INTO treasury_snapshots (project_id, ts, value_usd, last_seen_ts) VALUES (?,?,?,?)",
  ).run(projectId, ts, valueUsd, ts);
  return true;
}

export function saveGovernance(
  projectId: number,
  data: Omit<Governance, "project_id">,
): void {
  const d = db();

  d.prepare(
    `
    INSERT INTO governance (
      project_id,
      detected,
      type,
      protocol,
      governance_address,
      governance_program,
      voting_model,
      voting_token,
      proposal_count,
      active_proposals,
      passed_proposals,
      failed_proposals,
      quorum,
      approval_threshold,
      treasury_address,
      mint_authority,
      freeze_authority,
      source_url,
      updated_ts
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      detected = excluded.detected,
      type = excluded.type,
      protocol = excluded.protocol,
      governance_address = excluded.governance_address,
      governance_program = excluded.governance_program,
      voting_model = excluded.voting_model,
      voting_token = excluded.voting_token,
      proposal_count = excluded.proposal_count,
      active_proposals = excluded.active_proposals,
      passed_proposals = excluded.passed_proposals,
      failed_proposals = excluded.failed_proposals,
      quorum = excluded.quorum,
      approval_threshold = excluded.approval_threshold,
      treasury_address = excluded.treasury_address,
      mint_authority = excluded.mint_authority,
      freeze_authority = excluded.freeze_authority,
      source_url = excluded.source_url,
      updated_ts = excluded.updated_ts
  `,
  ).run(
    projectId,
    data.detected,
    data.type,
    data.protocol,
    data.governance_address,
    data.governance_program,
    data.voting_model,
    data.voting_token,
    data.proposal_count,
    data.active_proposals,
    data.passed_proposals,
    data.failed_proposals,
    data.quorum,
    data.approval_threshold,
    data.treasury_address,
    data.mint_authority,
    data.freeze_authority,
    data.source_url,
    data.updated_ts,
  );
}

export function governanceForProject(projectId: number): Governance | null {
  return (
    (db()
      .prepare("SELECT * FROM governance WHERE project_id = ?")
      .get(projectId) as Governance | undefined) ?? null
  );
}

// ---------- simulated trading ledger ----------

export interface LedgerTrade {
  address: string;
  mint: string;
  side: "buy" | "sell";
  tokenAmount: number;
  priceUsd: number | null;
  usdAmount: number;
  txSignature: string | null;
}

/**
 * Apply a trade to the ledger: append the trade row and fold it into the
 * running position in one transaction. Returns false without writing
 * anything if `txSignature` has already been recorded — `/api/swap/confirm`
 * can be retried (e.g. the client re-sends after a flaky response) without
 * double-crediting the same on-chain transfer.
 */
export function recordLedgerTrade(t: LedgerTrade): boolean {
  const d = db();
  const ts = Math.floor(Date.now() / 1000);
  const delta = t.side === "buy" ? t.tokenAmount : -t.tokenAmount;

  const apply = d.transaction(() => {
    const inserted = d
      .prepare(
        `INSERT OR IGNORE INTO ledger_trades
           (address, mint, side, token_amount, price_usd, usd_amount, tx_signature, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        t.address,
        t.mint,
        t.side,
        t.tokenAmount,
        t.priceUsd,
        t.usdAmount,
        t.txSignature,
        ts,
      );

    // Only possible when txSignature collides with an already-recorded buy.
    if (t.txSignature != null && inserted.changes === 0) return false;

    const current = d
      .prepare(
        "SELECT amount FROM ledger_positions WHERE address = ? AND mint = ?",
      )
      .get(t.address, t.mint) as { amount: number } | undefined;

    const next = Math.max(0, (current?.amount ?? 0) + delta);

    d.prepare(
      `INSERT INTO ledger_positions (address, mint, amount, updated_ts) VALUES (?, ?, ?, ?)
       ON CONFLICT(address, mint) DO UPDATE SET amount = excluded.amount, updated_ts = excluded.updated_ts`,
    ).run(t.address, t.mint, next, ts);

    return true;
  });

  return apply();
}

/** Every simulated position a wallet holds, mint -> amount. Zero rows omitted. */
export function ledgerPositions(address: string): Map<string, number> {
  const rows = db()
    .prepare(
      "SELECT mint, amount FROM ledger_positions WHERE address = ? AND amount > 0",
    )
    .all(address) as { mint: string; amount: number }[];
  return new Map(rows.map((r) => [r.mint, r.amount]));
}

/** The simulated position for one wallet/mint pair. 0 when none exists. */
export function ledgerPosition(address: string, mint: string): number {
  const row = db()
    .prepare(
      "SELECT amount FROM ledger_positions WHERE address = ? AND mint = ?",
    )
    .get(address, mint) as { amount: number } | undefined;
  return row?.amount ?? 0;
}
