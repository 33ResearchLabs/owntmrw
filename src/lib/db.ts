import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
const BUNDLED_DB_PATH = path.join(DATA_DIR, "metaintel.db");

// Serverless platforms (Vercel) ship the deployment as a read-only bundle —
// only /tmp is writable. WAL mode needs to create -shm/-wal sidecar files
// even for reads, so on read-only filesystems we copy the bundled snapshot
// into /tmp once per cold start and open it there instead.
const IS_READONLY_FS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const DB_PATH = IS_READONLY_FS ? path.join("/tmp", "metaintel.db") : BUNDLED_DB_PATH;

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

  CREATE TABLE IF NOT EXISTS treasury_snapshots (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    ts INTEGER NOT NULL,
    value_usd REAL,
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

  CREATE INDEX IF NOT EXISTS idx_snap_proj ON price_snapshots(project_id, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_events_proj ON events(project_id, ts DESC);
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
}

function addColumns(d: Database.Database, table: string, added: [string, string][]) {
  const cols = new Set(
    (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
  );
  for (const [name, type] of added) {
    if (!cols.has(name)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

// ---------- typed helpers ----------

export interface Project {
  id: number; slug: string; name: string; symbol: string | null;
  description: string | null; category: string | null; status: string | null;
  image_url: string | null; website: string | null; twitter: string | null;
  discord: string | null; telegram: string | null; github: string | null;
  docs: string | null; whitepaper: string | null; mint: string | null;
  dao_address: string | null; treasury_address: string | null; pool_address: string | null;
  launch_ts: number | null; raise_start_ts: number | null; raise_end_ts: number | null;
  raise_amount_usd: number | null; raise_goal_usd: number | null;
  raise_contributors: number | null; raise_price: number | null;
  initial_supply: number | null;
  total_supply: number | null; circulating_supply: number | null;
  team_package: number | null; liquidity_tokens: number | null;
  launch_address: string | null;
  raise_note: string | null; raise_source_url: string | null;
  raise_committed_usd: number | null; raise_fdv_usd: number | null;
  raise_track: string | null;
  source: string | null; updated_ts: number | null;
}

export function upsertProject(p: Partial<Project> & { slug: string; name: string }): number {
  const d = db();
  const existing = d.prepare("SELECT id FROM projects WHERE slug = ? OR (mint IS NOT NULL AND mint = ?)")
    .get(p.slug, p.mint ?? null) as { id: number } | undefined;
  const cols = [
    "name","symbol","description","category","status","image_url","website","twitter","discord",
    "telegram","github","docs","whitepaper","mint","dao_address","treasury_address","pool_address",
    "launch_ts","raise_start_ts","raise_end_ts","raise_amount_usd","raise_goal_usd",
    "raise_contributors","raise_price","initial_supply",
    "total_supply","circulating_supply","team_package","liquidity_tokens","launch_address",
    "raise_note","raise_source_url","raise_committed_usd","raise_fdv_usd","raise_track","source",
  ] as const;
  if (existing) {
    // only overwrite with non-null incoming values
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const c of cols) {
      const v = (p as Record<string, unknown>)[c];
      if (v !== undefined && v !== null && v !== "") { sets.push(`${c} = ?`); vals.push(v); }
    }
    sets.push("updated_ts = ?"); vals.push(Math.floor(Date.now() / 1000));
    vals.push(existing.id);
    d.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return existing.id;
  }
  const vals = cols.map((c) => (p as Record<string, unknown>)[c] ?? null);
  const info = d.prepare(
    `INSERT INTO projects (slug, ${cols.join(", ")}, updated_ts) VALUES (?, ${cols.map(() => "?").join(", ")}, ?)`
  ).run(p.slug, ...vals, Math.floor(Date.now() / 1000));
  return Number(info.lastInsertRowid);
}

export function allProjects(): Project[] {
  return db().prepare("SELECT * FROM projects ORDER BY name").all() as Project[];
}

export function projectBySlug(slug: string): Project | undefined {
  return db().prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as Project | undefined;
}
