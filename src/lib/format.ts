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

export function shortAddr(a: string | null | undefined): string {
  if (!a) return "—";
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}
