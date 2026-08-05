export function fmtUsd(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (opts.compact !== false) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e4) return `$${(n / 1e3).toFixed(1)}K`;
  }
  if (Math.abs(n) < 0.01 && n !== 0) return `$${n.toPrecision(3)}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * A per-token price. Distinct from fmtUsd because token prices live below a
 * dollar, where two decimals is destructive: it renders a $0.025 raise beside a
 * $0.0447 quote as "$0.03" and "$0.04", a 33% gain where the real one is 79%.
 * Three significant figures below $1 keeps the comparison honest.
 */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1000) return fmtUsd(n);
  if (abs >= 1) return `$${n.toFixed(2)}`;
  // Trim the trailing zeros toPrecision leaves, but never below cents.
  const trimmed = String(Number(n.toPrecision(3)));
  const decimals = trimmed.split(".")[1]?.length ?? 0;
  return `$${decimals < 2 ? n.toFixed(2) : trimmed}`;
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function fmtPct(n: number | null | undefined, signed = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = signed && n > 0 ? "+" : "";
  return `${s}${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`;
}

export function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "—";
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.floor(s / (86400 * 30))}mo ago`;
  return `${(s / (86400 * 365)).toFixed(1)}y ago`;
}

/** A span between two timestamps, phrased like timeAgo but without the "ago". */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d`;
  if (seconds < 86400 * 365) return `${Math.floor(seconds / (86400 * 30))}mo`;
  return `${(seconds / (86400 * 365)).toFixed(1)}y`;
}

export function shortAddr(a: string | null | undefined): string {
  if (!a) return "—";
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}
