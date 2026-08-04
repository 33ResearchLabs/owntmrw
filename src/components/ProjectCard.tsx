import Link from "next/link";
import { Logo } from "./ui";
import { fmtUsd, fmtNum, fmtPct } from "@/lib/format";

export interface CardProject {
  slug: string; name: string; symbol: string | null; category: string | null;
  image_url: string | null; status: string | null;
  price_usd: number | null; mcap: number | null; change_24h: number | null;
  raise_amount_usd: number | null; roi_since_raise: number | null;
  holder_count: number | null; treasury_usd: number | null;
}

/**
 * Feature card for the listing rail. Mirrors the imported design's card:
 * tinted art panel, then a metric row, then a hairline-separated footer.
 * The art tint is derived from the project slug so each card is stable and
 * distinct without needing per-project artwork.
 */
export function ProjectCard({ p, badge }: { p: CardProject; badge?: string }) {
  const hue = [...p.slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const art = `radial-gradient(80% 100% at 50% 100%, hsla(${hue},45%,45%,0.30), rgba(13,13,16,0) 70%), #101018`;
  const up = (p.change_24h ?? 0) >= 0;

  return (
    <Link href={`/project/${p.slug}`} className="card lift block overflow-hidden">
      <div className="relative flex h-[132px] items-center justify-center" style={{ background: art }}>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line2 bg-white/6">
          <Logo src={p.image_url} name={p.name} size={44} />
        </div>
        {badge && (
          <span className="absolute left-3.5 top-3.5 rounded-md bg-accent px-2 py-1 text-[10px] font-extrabold tracking-[0.08em] text-white">
            {badge}
          </span>
        )}
        {p.change_24h != null && (
          <span className={`num absolute right-4 top-4 text-[12px] font-bold ${up ? "text-good" : "text-bad"}`}>
            {up ? "▲" : "▼"} {fmtPct(p.change_24h, false)}
          </span>
        )}
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[16.5px] font-bold">{p.name}</span>
          {p.symbol && <span className="text-[11.5px] text-faint">{p.symbol}</span>}
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-muted">{p.category ?? "MetaDAO project"}</div>

        <div className="mt-3.5 flex gap-7">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.07em] text-faint">Raised</div>
            <div className="num mt-0.5 text-[14.5px] font-bold">
              {p.raise_amount_usd === 0 ? "$0" : fmtUsd(p.raise_amount_usd)}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.07em] text-faint">Market Cap</div>
            <div className="num mt-0.5 text-[14.5px] font-bold">{fmtUsd(p.mcap)}</div>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between border-t border-grid pt-3">
          <span className="num text-[12px] text-muted">
            {p.holder_count != null ? `${fmtNum(p.holder_count)} holders` : "holders —"}
          </span>
          {p.roi_since_raise != null ? (
            <span className={`num text-[12.5px] font-bold ${p.roi_since_raise >= 0 ? "text-good" : "text-bad"}`}>
              {p.roi_since_raise >= 0 ? "↑" : "↓"} {fmtPct(p.roi_since_raise, false)} vs raise
            </span>
          ) : (
            <span className="text-[12px] text-faint">ROI —</span>
          )}
        </div>
      </div>
    </Link>
  );
}
