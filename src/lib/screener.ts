/**
 * The screener's row shape, filter state and the URL form of that state.
 *
 * Pure: no React, no database. The table component owns the interaction and
 * hands every decision here, so a view is a plain value that can be put in
 * the address bar, read back out, and applied to the rows the same way each
 * time — which is what makes a screener URL shareable.
 */

export interface ScreenerRowDTO {
  slug: string; name: string; symbol: string | null; status: string | null;
  image_url: string | null; category: string | null;
  price_usd: number | null; mcap: number | null; fdv: number | null;
  liquidity_usd: number | null; vol24h: number | null; change_24h: number | null;
  raise_amount_usd: number | null; raise_price: number | null; raise_price_derived: boolean;
  roi_since_raise: number | null; ath_return: number | null;
  from_ath: number | null;
  /** Returns computed off a pool too thin to defend the price — mark them. */
  returns_thin: boolean;
  /** Why the raise figures are absent, when absence is a fact not a gap. */
  raise_absence: "no_ico" | "private_round" | "unpublished" | null;
  treasury_usd: number | null;
  holder_count: number | null;
  gh_stars: number | null; gh_last_push: number | null;
  /** Composite 0–100 health score, and how many of its 7 dimensions had data. */
  health: number | null;
  health_measured: number;
  /** Close-to-close returns against the live price; archival, not re-quoted. */
  ret_7d: number | null;
  ret_30d: number | null;
}

/**
 * Columns a view may be sorted by — the DTO's keys, listed so a value read
 * from a URL can be checked against them rather than trusted.
 */
export const SORT_KEYS = [
  "name", "status", "health", "price_usd", "change_24h", "ret_7d", "ret_30d",
  "mcap", "liquidity_usd", "vol24h", "raise_amount_usd", "raise_price",
  "roi_since_raise", "ath_return", "from_ath", "treasury_usd", "holder_count",
  "gh_stars", "gh_last_push",
] as const satisfies readonly (keyof ScreenerRowDTO)[];

export type SortKey = (typeof SORT_KEYS)[number];

export interface ScreenerQuery {
  sort: SortKey;
  dir: "asc" | "desc";
  /** Free text matched against name and symbol, case-insensitively. */
  q: string;
  /** Exact category, or "" for all. */
  cat: string;
  /** Exact status, or "all". */
  status: string;
  /** Floors in USD; null means no floor. */
  minLiq: number | null;
  minMcap: number | null;
}

export const DEFAULT_QUERY: ScreenerQuery = {
  sort: "mcap",
  dir: "desc",
  q: "",
  cat: "",
  status: "all",
  minLiq: null,
  minMcap: null,
};

/**
 * "50k", "1.5m", "$2,000" or a bare number → USD. Null for anything else,
 * including an empty field, so a cleared input means "no floor" rather than
 * "floor of zero".
 */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase().replace(/[$,\s_]/g, "");
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)([kmb])?$/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1;
  const v = n * mult;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** The inverse, for writing a floor back into a URL or an input: 50000 → "50k". */
export function formatAmount(n: number | null): string {
  if (n == null) return "";
  if (n >= 1e9 && n % 1e9 === 0) return `${n / 1e9}b`;
  if (n >= 1e6 && n % 1e6 === 0) return `${n / 1e6}m`;
  if (n >= 1e3 && n % 1e3 === 0) return `${n / 1e3}k`;
  return String(n);
}

type ParamSource = { get(name: string): string | null };

function isSortKey(v: string | null): v is SortKey {
  return v != null && (SORT_KEYS as readonly string[]).includes(v);
}

/** Read a view out of a query string. Anything missing or malformed falls back to the default. */
export function parseScreenerQuery(sp: ParamSource): ScreenerQuery {
  const sort = sp.get("sort");
  const dir = sp.get("dir");
  return {
    sort: isSortKey(sort) ? sort : DEFAULT_QUERY.sort,
    dir: dir === "asc" || dir === "desc" ? dir : DEFAULT_QUERY.dir,
    q: (sp.get("q") ?? "").slice(0, 60),
    cat: sp.get("cat") ?? "",
    status: sp.get("status") || "all",
    minLiq: parseAmount(sp.get("minLiq")),
    minMcap: parseAmount(sp.get("minMcap")),
  };
}

/**
 * Write a view as a query string, without the leading "?". Defaults are
 * omitted so the plain screener URL stays plain and only a changed view
 * carries parameters.
 */
export function serializeScreenerQuery(q: ScreenerQuery): string {
  const p = new URLSearchParams();
  if (q.sort !== DEFAULT_QUERY.sort) p.set("sort", q.sort);
  if (q.dir !== DEFAULT_QUERY.dir) p.set("dir", q.dir);
  if (q.q) p.set("q", q.q);
  if (q.cat) p.set("cat", q.cat);
  if (q.status !== "all") p.set("status", q.status);
  if (q.minLiq != null) p.set("minLiq", formatAmount(q.minLiq));
  if (q.minMcap != null) p.set("minMcap", formatAmount(q.minMcap));
  return p.toString();
}

export function isDefaultQuery(q: ScreenerQuery): boolean {
  return serializeScreenerQuery(q) === "";
}

/**
 * Filter, then sort. Nulls sort last in either direction — a project with no
 * figure is not "lowest", it is unmeasured, and belongs at the bottom whichever
 * way the column is read.
 */
export function applyScreenerQuery<T extends ScreenerRowDTO>(rows: T[], q: ScreenerQuery): T[] {
  const needle = q.q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (q.status !== "all" && (r.status ?? "unknown") !== q.status) return false;
    if (q.cat && r.category !== q.cat) return false;
    if (q.minLiq != null && (r.liquidity_usd == null || r.liquidity_usd < q.minLiq)) return false;
    if (q.minMcap != null && (r.mcap == null || r.mcap < q.minMcap)) return false;
    if (needle) {
      const hay = `${r.name} ${r.symbol ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const sign = q.dir === "asc" ? 1 : -1;
  return filtered.sort((a, b) => {
    const av = a[q.sort], bv = b[q.sort];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") return sign * av.localeCompare(String(bv));
    return sign * ((av as number) - (bv as number));
  });
}
