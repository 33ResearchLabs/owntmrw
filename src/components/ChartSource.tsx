"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  DEFAULT_CHART_SOURCE, EMBED_OPTIONS, EMBED_PROVIDERS, ENABLED_EMBEDS, PRELOAD_EMBEDS,
  TRADINGVIEW_ENABLED,
  type ChartSourceKey, type EmbedIds, type EmbedProviderKey,
} from "@/lib/chartSources";
import { SegButton, SegGroup } from "@/components/PriceChart";

function isEmbed(key: ChartSourceKey): key is EmbedProviderKey {
  return key in EMBED_PROVIDERS;
}

/**
 * Chart source switch: the native chart, TradingView, then one tab per hosted
 * embed in `ENABLED_EMBEDS`. What is offered, and how each source is
 * configured, is `src/lib/chartSources.ts`'s business — this only lays it out.
 *
 * Only the chosen view is mounted, with one exception: TradingView and the
 * embeds stay in the DOM once mounted, parked off-screen, because each boots a
 * whole app inside an iframe. With `PRELOAD_EMBEDS` the embeds are mounted
 * that way before they are ever chosen, so the tab opens on a loaded frame.
 * The native chart is cheap to remount (its daily candles arrive as props), so
 * it is simply dropped while another source shows.
 */
export function ChartSource({
  ids, symbol, tradingview, children,
}: {
  ids: EmbedIds;
  /** Ticker, for the frames' accessible names. */
  symbol: string;
  /** The TradingView chart; omit it when the page cannot feed one. */
  tradingview?: ReactNode;
  /** The native chart. */
  children: ReactNode;
}) {
  const embeds = ENABLED_EMBEDS.map((key) => ({
    key, label: EMBED_PROVIDERS[key].label, id: EMBED_PROVIDERS[key].id(ids),
  }));
  const hasTradingView = TRADINGVIEW_ENABLED && tradingview != null;

  // The configured default, unless this page cannot offer it.
  const offered = (key: ChartSourceKey) =>
    key === "native" ||
    (key === "tradingview" ? hasTradingView : embeds.some((e) => e.key === key && e.id != null));
  const initial: ChartSourceKey = offered(DEFAULT_CHART_SOURCE) ? DEFAULT_CHART_SOURCE : "native";

  const [source, setSource] = useState<ChartSourceKey>(initial);
  /** Non-native sources in the DOM, in mount order: the one showing, any seen before, any preloaded. */
  const [mounted, setMounted] = useState<ChartSourceKey[]>(initial === "native" ? [] : [initial]);

  const mount = (keys: ChartSourceKey[]) =>
    setMounted((m) => [...m, ...keys.filter((k) => !m.includes(k))]);

  const show = (key: ChartSourceKey) => {
    setSource(key);
    if (key !== "native") mount([key]);
  };

  // Warm the embeds up once the page has settled. A phone-width viewport or a
  // data-saver request opts out: the download is the provider's whole app.
  const warm = embeds.filter((e) => e.id != null).map((e) => e.key).join(",");
  useEffect(() => {
    if (!PRELOAD_EMBEDS || !warm) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData || !window.matchMedia("(min-width: 640px)").matches) return;
    const keys = warm.split(",") as EmbedProviderKey[];
    // Safari only grew requestIdleCallback recently; fall back to a short delay.
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => mount(keys), { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => mount(keys), 1500);
    return () => window.clearTimeout(id);
  }, [warm]);

  return (
    <div>
      <div className="mb-3 flex items-center">
        <SegGroup label="Chart source">
          <SegButton active={source === "native"} onClick={() => show("native")}>
            Underly
          </SegButton>
          {hasTradingView && (
            <SegButton active={source === "tradingview"} onClick={() => show("tradingview")}>
              TradingView
            </SegButton>
          )}
          {embeds.map((e) => (
            <SegButton
              key={e.key}
              active={source === e.key}
              onClick={() => show(e.key)}
              disabled={e.id == null}
              title={e.id == null ? `${e.label} does not list this token` : undefined}
            >
              {e.label}
            </SegButton>
          ))}
        </SegGroup>
      </div>

      {source === "native" && children}

      {mounted.map((key) => {
        if (key === "tradingview") {
          return <Parked key={key} active={source === key}>{tradingview}</Parked>;
        }
        if (!isEmbed(key)) return null;
        const id = EMBED_PROVIDERS[key].id(ids);
        return id == null ? null : (
          <Parked key={key} active={source === key}>
            <EmbedFrame provider={key} id={id} symbol={symbol} />
          </Parked>
        );
      })}
    </div>
  );
}

/**
 * Keeps a mounted source in the DOM while another one shows.
 *
 * Parked transparent at a real width, inside the viewport, rather than hidden
 * or off-screen: the app inside the frame lays itself out for the width it
 * first sees, and browsers pause timers and animation frames in cross-origin
 * frames they consider off-screen — which is exactly when a provider stops
 * loading its chart. Behind the page and inert, it is neither seen, announced
 * nor focusable.
 */
function Parked({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      inert={!active}
      aria-hidden={!active}
      style={
        active
          ? undefined
          : {
              position: "fixed", top: 0, left: 0, width: "min(100vw, 900px)",
              opacity: 0, pointerEvents: "none", zIndex: -1,
            }
      }
    >
      {children}
    </div>
  );
}

/** One provider's hosted chart, with a loading note until its document arrives. */
function EmbedFrame({
  provider, id, symbol,
}: {
  provider: EmbedProviderKey; id: string; symbol: string;
}) {
  const p = EMBED_PROVIDERS[provider];
  const [ready, setReady] = useState(false);

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-xl border border-line bg-surface2/40"
        style={{ height: p.height }}
      >
        <iframe
          src={p.src(id, EMBED_OPTIONS)}
          title={`${symbol} chart on ${p.label}`}
          className="h-full w-full border-0"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="clipboard-write"
          onLoad={() => setReady(true)}
        />
        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-md border border-line bg-surface/95 px-3 py-1.5 text-[12px] text-muted backdrop-blur">
              Loading {p.label}…
            </span>
          </div>
        )}
      </div>
      {/* The chart and every figure in it are the provider's, not ours. */}
      <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>Chart and data by {p.label}.</span>
        <a
          href={p.site(id)}
          target="_blank" rel="noopener noreferrer"
          className="text-ink2 transition-colors hover:text-brand"
        >
          Open on {p.label} ↗
        </a>
      </p>
    </div>
  );
}
