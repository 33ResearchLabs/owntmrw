"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import {
  DEFAULT_CHART_SOURCE, EMBED_OPTIONS, EMBED_PROVIDERS, ENABLED_EMBEDS, NATIVE_CHART_ENABLED,
  PRELOAD_EMBEDS, TRADINGVIEW_ENABLED,
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
  // The native chart is the fallback: it can always draw, so it stays on
  // offer whenever nothing else on this page can show the token.
  const hasNative =
    NATIVE_CHART_ENABLED || (!hasTradingView && embeds.every((e) => e.id == null));

  // The configured default, unless this page cannot offer it.
  const offered = (key: ChartSourceKey) =>
    key === "native" ? hasNative :
    key === "tradingview" ? hasTradingView :
    embeds.some((e) => e.key === key && e.id != null);
  const fallback: ChartSourceKey =
    hasNative ? "native" :
    hasTradingView ? "tradingview" :
    (embeds.find((e) => e.id != null)?.key ?? "native");
  const initial: ChartSourceKey = offered(DEFAULT_CHART_SOURCE) ? DEFAULT_CHART_SOURCE : fallback;
  // One source needs no switch.
  const showTabs = (hasNative ? 1 : 0) + (hasTradingView ? 1 : 0) + embeds.length > 1;

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
      {showTabs && (
        <div className="mb-3 flex items-center">
          <SegGroup label="Chart source">
            {hasNative && (
              <SegButton active={source === "native"} onClick={() => show("native")}>
                tekno.works
              </SegButton>
            )}
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
      )}

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

/**
 * One provider's hosted chart, with a loading note until its document arrives.
 *
 * The fullscreen button is ours, not the provider's: DexScreener's own "Full"
 * control is wired to a no-op in embed mode, so the frame can never expand
 * itself. The wrapper — button row and frame together — is what goes
 * fullscreen, so the button stays reachable as an exit and the frame fills the
 * rest of the screen. Not offered where the API is missing (iPhone Safari).
 */
function EmbedFrame({
  provider, id, symbol,
}: {
  provider: EmbedProviderKey; id: string; symbol: string;
}) {
  const p = EMBED_PROVIDERS[provider];
  const [ready, setReady] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // Read on the client only; the server renders without the button.
  const canFull = useSyncExternalStore(
    () => () => {},
    () => typeof document.documentElement.requestFullscreen === "function",
    () => false,
  );
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.current?.requestFullscreen();
  };

  return (
    <div ref={wrap} className={full ? "flex flex-col bg-page p-3" : undefined}>
      {canFull && (
        <div className="mb-2 flex justify-end">
          <SegGroup>
            <SegButton active={full} onClick={toggleFull} title={full ? "Exit fullscreen (Esc)" : "Fullscreen"}>
              <span className="flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {full
                    ? <path d="M4.5 1v3.5H1M7.5 1v3.5H11M4.5 11V7.5H1M7.5 11V7.5H11" />
                    : <path d="M1 4.5V1h3.5M11 4.5V1H7.5M1 7.5V11h3.5M11 7.5V11H7.5" />}
                </svg>
                {full ? "Exit fullscreen" : "Fullscreen"}
              </span>
            </SegButton>
          </SegGroup>
        </div>
      )}
      {/*
        `overflow: clip`, not `hidden`: the frame is drawn taller than this box
        (see `clipBottom`), and a `hidden` box is still a scroll container, so a
        click inside the frame could scroll the box to "reveal" the focused
        control and shove the whole chart up under the top edge. `clip` cannot
        scroll. The `hidden` class stays as the fallback for browsers without it.
      */}
      <div
        className={`relative overflow-hidden rounded-xl border border-line bg-surface2/40 ${full ? "min-h-0 flex-1" : ""}`}
        style={{ height: full ? undefined : p.height, overflow: "clip" }}
      >
        <iframe
          src={p.src(id, EMBED_OPTIONS)}
          title={`${symbol} chart on ${p.label}`}
          className="w-full border-0"
          style={{ height: `calc(100% + ${p.clipBottom ?? 0}px)` }}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="clipboard-write; fullscreen"
          allowFullScreen
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
    </div>
  );
}
