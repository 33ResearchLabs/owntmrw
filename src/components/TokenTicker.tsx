"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Logo } from "./ui";
import { fmtUsd, fmtPct } from "@/lib/format";

/**
 * The scrolling price strip above the home page boards.
 *
 * Only tracked projects appear here — this is a ticker for the tokens the site
 * indexes, not a market-wide feed.
 */
export interface TickerToken {
  slug: string;
  name: string;
  symbol: string | null;
  image_url: string | null;
  price_usd: number | null;
  change_24h: number | null;
}

/** Same endpoint and cadence the screener re-quotes on. */
const POLL_MS = 30_000;

/**
 * Seconds for one full pass, scaled to how many tokens there are so the strip
 * moves at a steady speed rather than a steady lap time, then held inside the
 * band that reads as a ticker instead of a slideshow.
 */
function loopSeconds(count: number) {
  return Math.min(60, Math.max(40, count * 2.6));
}

/** Live prices patched in place, so an open tab keeps ticking. */
function useLivePrices(initial: TickerToken[]): TickerToken[] {
  const [patches, setPatches] = useState<Map<string, Partial<TickerToken>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          rows: { slug: string; price_usd: number | null; change_24h: number | null }[];
        };
        if (cancelled) return;
        setPatches(new Map(data.rows.map((r) => [r.slug, r])));
      } catch {
        // A failed poll holds the last good quotes rather than blanking the
        // strip — a stale price beats an empty one.
      }
    };
    const id = setInterval(poll, POLL_MS);
    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return useMemo(
    () => (patches ? initial.map((t) => ({ ...t, ...(patches.get(t.slug) ?? {}) })) : initial),
    [initial, patches]
  );
}

function TokenCard({ t }: { t: TickerToken }) {
  const up = (t.change_24h ?? 0) >= 0;
  return (
    <Link
      href={`/project/${t.slug}`}
      className="group flex shrink-0 items-center gap-2 rounded-full border border-line px-2.5 py-1
                 transition-colors duration-150 hover:border-line2"
      style={{
        // Subtle top-down wash rather than a flat fill, so the pills read as
        // raised against the banner's own gradient.
        background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))",
      }}
    >
      <Logo src={t.image_url} name={t.name} size={18} />
      <span className="whitespace-nowrap text-[12px] font-semibold text-ink group-hover:text-brand">
        {t.name}
      </span>
      {t.symbol && (
        <span className="whitespace-nowrap text-[10.5px] uppercase tracking-wide text-faint">
          {t.symbol}
        </span>
      )}
      <span className="num whitespace-nowrap text-[12px] text-ink2 transition-colors duration-300">
        {fmtUsd(t.price_usd, { compact: false })}
      </span>
      {/* A token whose venue reports no 24h window shows its price alone rather
          than a 0% that reads as "it did not move". */}
      {t.change_24h != null && (
        <span
          className={`num flex items-center gap-0.5 whitespace-nowrap text-[11.5px] font-medium
                      transition-colors duration-300 ${up ? "text-good" : "text-bad"}`}
        >
          <span className="text-[8px]">{up ? "▲" : "▼"}</span>
          {fmtPct(t.change_24h, false)}
        </span>
      )}
    </Link>
  );
}

export function TokenTicker({ tokens }: { tokens: TickerToken[] }) {
  const live = useLivePrices(tokens);
  // A ticker cell with no price is noise, so an unquoted token sits this out
  // rather than scrolling past as a dash.
  const priced = live.filter((t) => t.price_usd != null);
  if (!priced.length) return null;

  const row = (dup: boolean) => (
    <div
      className={`flex shrink-0 items-center gap-2 pr-2 ${dup ? "ticker-dup" : ""}`}
      aria-hidden={dup || undefined}
    >
      {priced.map((t) => <TokenCard key={`${dup ? "b" : "a"}-${t.slug}`} t={t} />)}
    </div>
  );

  return (
    <div
      className="ticker relative overflow-hidden rounded-xl border border-line px-2 py-1.5"
      style={{
        background: "linear-gradient(90deg, rgba(57,135,229,0.07), rgba(155,122,224,0.05) 55%, rgba(224,138,60,0.06))",
        // Fades the pills out at both edges instead of clipping them on a hard
        // line, so cards enter and leave rather than appearing and vanishing.
        maskImage: "linear-gradient(90deg, transparent, #000 3.5%, #000 96.5%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 3.5%, #000 96.5%, transparent)",
      }}
    >
      <div className="ticker-track" style={{ animationDuration: `${loopSeconds(priced.length)}s` }}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
