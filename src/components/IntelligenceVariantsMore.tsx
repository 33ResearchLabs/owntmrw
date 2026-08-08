"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "./ui";
import { Eyebrow, IconBadge } from "./viz";
import { fmtPct } from "@/lib/format";
import { facetsFor, Picker, type Facet, type IntelProject } from "./IntelligenceCard";
import { TONE } from "./TradePanel";
import { useWallet } from "./wallet";
import { useSignIn } from "./SignInProvider";
import {
  readingsFor, WideSpark, ConnectButton, CardCta, StripStat, METHODOLOGY_ICON,
} from "./IntelligenceVariants";

/**
 * Layouts D, E and F, continuing `IntelligenceVariants`.
 *
 * Split across two files only for editing: at six layouts one file runs past a
 * thousand lines. Everything shared — the readings, the wide spark, the connect
 * button, the footer link — is imported from the first file rather than copied,
 * so the six differ in arrangement and in nothing else.
 */

/* ============================================================== variant D
 *
 * Cinematic.
 *
 * The one that reads as a landing page rather than as a dashboard. The section
 * opens on the site's own `.hero` treatment, sets the headline at 34px against
 * the project's name, and puts the whole trade panel in a plate floating over
 * the gradient. Evidence comes second, as a flush strip beneath.
 *
 * The argument for it: this section sits on the home page, where the reader has
 * not agreed to look at a dashboard yet. Everything above it on the page is
 * sized to be scanned; this is the only block that asks to be studied. The
 * argument against is the same fact from the other side — it is the loudest of
 * the six, and it repeats a treatment the page already uses at the top.
 */

function HeroChip({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line2 bg-page/60 px-3.5 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</span>
      <span className={`text-[12.5px] font-bold ${tone}`}>{value}</span>
    </span>
  );
}

export function VariantCinematic({ projects }: { projects: IntelProject[] }) {
  const [slug, setSlug] = useState(projects[0]?.slug ?? null);
  const w = useWallet();
  const signIn = useSignIn();

  const p = projects.find((x) => x.slug === slug) ?? projects[0];
  if (!p) return null;

  const { verdict, trend, risk, strength, up } = readingsFor(p);

  return (
    <div className="space-y-6">
      <div className="hero p-6 sm:p-8">
        {/* The same glow the page's other hero carries, so this reads as the
            same object rather than as a card that happens to have a gradient. */}
        <div className="hero-glow" />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-center">
          <div className="min-w-0">
            <Eyebrow label="Project Intelligence" color="var(--brand)" />
            <h2 className="mt-2.5 text-[28px] font-extrabold leading-[1.08] tracking-tight sm:text-[34px]">
              Institutional-grade intelligence on{" "}
              <span className="text-brand">{p.name}</span>.
            </h2>
            <p className="mt-3 max-w-[520px] text-[13.5px] leading-relaxed text-ink2">
              Go beyond token prices — fundraising, treasury, holders, developers and governance
              in one workspace.
            </p>

            {/* The readings as chips on the copy side. At this size a ruled
                three-cell strip would read as a table dropped into a hero. */}
            <div className="mt-5 flex flex-wrap gap-2.5">
              <HeroChip label="Stance" value={verdict.label} tone={TONE[verdict.tone]} />
              <HeroChip label="Trend" value={trend.label} tone={TONE[trend.tone]} />
              <HeroChip label="Risk" value={risk.label} tone={TONE[risk.tone]} />
              <HeroChip label="Data" value={strength.label} tone={TONE[strength.tone]} />
            </div>
          </div>

          {/*
           * The plate. Opaque rather than translucent-with-blur: the gradient
           * behind it is high-contrast at exactly this corner, and 20px of blur
           * does not stop a bright band reading through a panel of numbers.
           */}
          <div className="rounded-2xl border border-line2 bg-page/95 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow label="Methodology" color="#9b7ae0" />
              <Picker projects={projects} selected={p} onSelect={(x) => setSlug(x.slug)} />
            </div>

            <div className="mt-4 flex items-baseline justify-between gap-3">
              <div className={`text-[40px] font-extrabold leading-none tracking-tight ${TONE[verdict.tone]}`}>
                {verdict.label}
              </div>
              {p.change_24h != null && (
                <span className={`num shrink-0 text-[14px] font-bold ${up ? "text-good" : "text-bad"}`}>
                  {fmtPct(p.change_24h)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{verdict.note}</p>

            <div className="mt-3"><WideSpark points={p.spark} tone={up ? "good" : "bad"} height={46} /></div>

            <div className="mt-4 flex flex-col gap-3">
              {!w.session && <ConnectButton onClick={() => signIn.open()} />}
              <div className="grid grid-cols-2 gap-3">
                {(["buy", "sell"] as const).map((side) => {
                  const buy = side === "buy";
                  return (
                    <Link
                      key={side}
                      href={`/project/${p.slug}#trade`}
                      className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-[14px] font-bold transition-colors duration-150 ${
                        buy
                          ? "border-good/30 bg-good/10 text-good hover:border-good/50 hover:bg-good/15"
                          : "border-bad/30 bg-bad/10 text-bad hover:border-bad/50 hover:bg-bad/15"
                      }`}
                    >
                      <span aria-hidden>{buy ? "↑" : "↓"}</span>{buy ? "Buy" : "Sell"}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Evidence, under the claim. Flush cells rather than tiles with gaps, so
          the strip reads as one instrument the hero is drawing on. */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-grid sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          {facetsFor(p).map((f) => (
            <Link
              key={f.title}
              href={`/project/${p.slug}#${f.tab}`}
              className="flex min-w-0 items-center justify-between gap-3 px-4 py-4 transition-colors duration-150 hover:bg-surface2/60 sm:block"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.color }} aria-hidden />
                  <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                    {f.title}
                  </span>
                </div>
                <div className="num mt-2 text-[19px] font-bold leading-none">{f.value}</div>
              </div>
              <div className="shrink-0 text-right text-[10.5px] text-faint sm:mt-1.5 sm:text-left">{f.unit}</div>
            </Link>
          ))}
        </div>
        <Link
          href={`/project/${p.slug}`}
          className="flex items-center justify-center gap-2 border-t border-line px-4 py-3 text-[12.5px] font-medium text-ink2 transition-colors duration-150 hover:bg-surface2 hover:text-ink"
        >
          Explore all project intelligence <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}

/* ============================================================== variant E
 *
 * Editorial index.
 *
 * The quiet one, and the opposite move from A: where A wins room by packing
 * tighter, this wins it by throwing chrome away. No icon badges, no tinted
 * fills, no boxes — five numbered entries on hairlines, like the contents page
 * of a report. Colour appears exactly twice on the left card: the eyebrow and
 * whatever the performance figure is.
 *
 * The right card stops being a trade widget and becomes the argument: reading,
 * then stance, then action, as three steps down a spine. That ordering is the
 * honest one — the panel is only allowed to say HOLD because of the score
 * above it, and the buttons are only offered after both.
 */

function IndexRow({ slug, f, n }: { slug: string; f: Facet; n: number }) {
  return (
    <Link
      href={`/project/${slug}#${f.tab}`}
      className="group flex items-baseline gap-4 border-t border-grid py-4 transition-colors duration-150 first:border-t-0 hover:bg-white/[0.02]"
    >
      <span className="num w-6 shrink-0 text-[11px] font-semibold text-faint transition-colors duration-150 group-hover:text-brand">
        {String(n).padStart(2, "0")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{f.title}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-muted">{f.blurb}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="num block text-[17px] font-bold leading-none">{f.value}</span>
        <span className="mt-1.5 block text-[10.5px] text-faint">{f.unit}</span>
      </span>
    </Link>
  );
}

/** One step on the spine: a numbered dot, a heading and whatever it carries. */
function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="relative pl-9">
      {/* The connector runs the full height of the step and is hidden on the
          last one by `last:before:hidden` on the wrapper below, so the spine
          stops at the final dot instead of trailing into the padding. */}
      <span
        className="absolute left-[11px] top-6 bottom-0 w-px bg-grid"
        aria-hidden
      />
      <span className="absolute left-0 top-0 flex h-[23px] w-[23px] items-center justify-center rounded-full border border-line2 bg-surface2 text-[10.5px] font-bold text-ink2">
        {n}
      </span>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function VariantEditorial({ projects }: { projects: IntelProject[] }) {
  const [slug, setSlug] = useState(projects[0]?.slug ?? null);
  const w = useWallet();
  const signIn = useSignIn();

  const p = projects.find((x) => x.slug === slug) ?? projects[0];
  if (!p) return null;

  const { verdict, trend, risk, strength, up } = readingsFor(p);

  return (
    <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
      <div className="card flex h-full flex-col gap-6 p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <Eyebrow label="Project Intelligence" color="var(--brand)" />
            <h2 className="mt-2 text-[21px] font-extrabold leading-tight tracking-tight">
              Institutional-grade project intelligence.
            </h2>
            <p className="mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed text-ink2">
              Go beyond token prices — fundraising, treasury, holders, developers and governance
              in one workspace.
            </p>
          </div>
          <Picker projects={projects} selected={p} onSelect={(x) => setSlug(x.slug)} />
        </div>

        <div className="flex flex-col">
          {facetsFor(p).map((f, i) => <IndexRow key={f.title} slug={p.slug} f={f} n={i + 1} />)}
        </div>

        <CardCta href={`/project/${p.slug}`}>Explore project intelligence</CardCta>
      </div>

      <div className="card flex h-full flex-col gap-6 p-6 sm:p-7">
        <div>
          <Eyebrow label="Methodology" color="#9b7ae0" />
          <h2 className="mt-2 text-[21px] font-extrabold leading-tight tracking-tight">
            Turn data into action.
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink2">
            Use data-backed insights to trade with clarity, not guesswork.
          </p>
        </div>

        <div className="flex flex-col gap-7 [&>*:last-child>span:first-child]:hidden">
          <Step n={1} label="The reading">
            <div className="flex items-baseline gap-2">
              <span className="num text-[24px] font-extrabold leading-none">{p.overall ?? "—"}</span>
              <span className="text-[12px] text-muted">/ 100 health</span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              {p.measured} of {p.total} dimensions measured · trend, risk and data strength are
              read off the same figures.
            </p>
            <div className="mt-2.5"><WideSpark points={p.spark} tone={up ? "good" : "bad"} height={38} /></div>
          </Step>

          <Step n={2} label="The stance">
            <div className={`text-[30px] font-extrabold leading-none tracking-tight ${TONE[verdict.tone]}`}>
              {verdict.label}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{verdict.note}</p>
            <div className="mt-3 flex divide-x divide-grid border-y border-grid py-2.5">
              <div className="min-w-0 flex-1"><StripStat label="Trend" r={trend} /></div>
              <div className="min-w-0 flex-1"><StripStat label="Risk" r={risk} /></div>
              <div className="min-w-0 flex-1"><StripStat label="Data" r={strength} /></div>
            </div>
          </Step>

          <Step n={3} label="The action">
            {!w.session && (
              <div className="mb-3"><ConnectButton onClick={() => signIn.open()} /></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {(["buy", "sell"] as const).map((side) => {
                const buy = side === "buy";
                return (
                  <Link
                    key={side}
                    href={`/project/${p.slug}#trade`}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-[14px] font-bold transition-colors duration-150 ${
                      buy
                        ? "border-good/30 bg-good/10 text-good hover:border-good/50 hover:bg-good/15"
                        : "border-bad/30 bg-bad/10 text-bad hover:border-bad/50 hover:bg-bad/15"
                    }`}
                  >
                    <span aria-hidden>{buy ? "↑" : "↓"}</span>{buy ? "Buy" : "Sell"}
                  </Link>
                );
              })}
            </div>
          </Step>
        </div>

        <CardCta href={`/project/${p.slug}#overview`} icon={METHODOLOGY_ICON}>View methodology</CardCta>
      </div>
    </div>
  );
}

/* ============================================================== variant F
 *
 * Workspace.
 *
 * The only one that changes the information architecture rather than the
 * styling. The picker stops being a dropdown and becomes a visible rail of
 * everything tracked, so the section demonstrates the breadth of the product
 * instead of asserting it in a subtitle — a reader learns there are twenty-odd
 * projects on file by seeing them, not by opening a menu.
 *
 * The cost is honest: a rail of names is a list a reader can be bored by, and
 * the shipped chip is smaller and quieter. This trades that quiet for the one
 * thing the other five cannot show, which is scale.
 */

function RailItem({
  p, on, onSelect,
}: { p: IntelProject; on: boolean; onSelect: () => void }) {
  const up = (p.change_24h ?? 0) >= 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={on || undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ${
        on ? "bg-surface2" : "hover:bg-white/[0.03]"
      }`}
    >
      {/* The selected marker is a rail rather than a tick: it sits in the
          reading order before the name, which is where a reader scanning a
          column of names is already looking. */}
      <span
        className="h-7 w-[2px] shrink-0 rounded-full"
        style={{ background: on ? "var(--brand)" : "transparent" }}
        aria-hidden
      />
      <Logo src={p.image_url} name={p.name} size={24} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[12px] leading-tight ${on ? "font-bold" : "font-medium text-ink2"}`}>
          {p.name}
        </span>
        <span className="block truncate text-[10px] leading-tight text-faint">{p.category ?? "Project"}</span>
      </span>
      {p.change_24h != null && (
        <span className={`num shrink-0 text-[10.5px] font-semibold ${up ? "text-good" : "text-bad"}`}>
          {fmtPct(p.change_24h)}
        </span>
      )}
    </button>
  );
}

function WorkTile({ slug, f }: { slug: string; f: Facet }) {
  return (
    <Link
      href={`/project/${slug}#${f.tab}`}
      className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-surface2/40 p-3.5 transition-colors duration-150 hover:border-line2 hover:bg-surface2"
    >
      <div className="flex min-w-0 items-center gap-2">
        <IconBadge name={f.icon} color={f.color} size={24} />
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          {f.title}
        </span>
      </div>
      <div>
        <div className="num text-[20px] font-bold leading-none">{f.value}</div>
        <div className="mt-1.5 text-[10.5px] text-faint">{f.unit}</div>
      </div>
    </Link>
  );
}

export function VariantWorkspace({ projects }: { projects: IntelProject[] }) {
  const [slug, setSlug] = useState(projects[0]?.slug ?? null);
  const w = useWallet();
  const signIn = useSignIn();

  const p = projects.find((x) => x.slug === slug) ?? projects[0];
  if (!p) return null;

  const { verdict, trend, risk, strength, up } = readingsFor(p);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          <Eyebrow label="Project Intelligence" color="var(--brand)" />
          <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">
            Institutional-grade project intelligence.
          </h2>
          <p className="mt-0.5 max-w-[600px] text-[12.5px] leading-relaxed text-ink2">
            Go beyond token prices — fundraising, treasury, holders, developers and governance in
            one workspace. Pick any project on the left.
          </p>
        </div>
      </div>

      <div className="grid border-t border-line lg:grid-cols-[240px_minmax(0,1fr)]">
        {/*
         * The rail. Capped and scrolling rather than rendering all twenty-odd:
         * the panel beside it is a fixed height, and a rail that sets the
         * section's height by its own item count would leave the readings
         * stranded at the top of a very tall card.
         */}
        <div className="border-b border-line p-3 lg:border-b-0 lg:border-r">
          <div className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
            Tracking · {projects.length}
          </div>
          <div className="flex max-h-[300px] flex-col gap-0.5 overflow-y-auto overscroll-contain lg:max-h-[420px]">
            {projects.map((x) => (
              <RailItem key={x.slug} p={x} on={x.slug === p.slug} onSelect={() => setSlug(x.slug)} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Logo src={p.image_url} name={p.name} size={34} />
              <div className="min-w-0">
                <div className="truncate text-[16px] font-extrabold leading-tight tracking-tight">{p.name}</div>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  {p.symbol && <span className="num font-semibold text-ink2">{p.symbol}</span>}
                  <span className="truncate">{p.category ?? "Project"}</span>
                </div>
              </div>
            </div>
            <Link
              href={`/project/${p.slug}`}
              className="shrink-0 text-[12px] font-medium text-brand transition-opacity duration-150 hover:opacity-80"
            >
              Open workspace →
            </Link>
          </div>

          {/* Five facets and the verdict fill a 3×2 grid exactly, which is what
              lets the stance sit inside the readings rather than after them. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {facetsFor(p).map((f) => <WorkTile key={f.title} slug={p.slug} f={f} />)}

            <div className="flex flex-col justify-between gap-2 rounded-xl border border-line2 bg-page/50 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Market view
                </span>
                {p.change_24h != null && (
                  <span className={`num text-[11px] font-bold ${up ? "text-good" : "text-bad"}`}>
                    {fmtPct(p.change_24h)}
                  </span>
                )}
              </div>
              <div className={`text-[24px] font-extrabold leading-none tracking-tight ${TONE[verdict.tone]}`}>
                {verdict.label}
              </div>
              <WideSpark points={p.spark} tone={up ? "good" : "bad"} height={26} />
            </div>
          </div>

          <div className="flex divide-x divide-line rounded-xl border border-line bg-surface2/30 py-2.5">
            <div className="min-w-0 flex-1"><StripStat label="Trend" r={trend} /></div>
            <div className="min-w-0 flex-1"><StripStat label="Risk level" r={risk} /></div>
            <div className="min-w-0 flex-1"><StripStat label="Data strength" r={strength} /></div>
          </div>

          {!w.session && <ConnectButton onClick={() => signIn.open()} />}

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            {(["buy", "sell"] as const).map((side) => {
              const buy = side === "buy";
              return (
                <Link
                  key={side}
                  href={`/project/${p.slug}#trade`}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-[14px] font-bold transition-colors duration-150 ${
                    buy
                      ? "border-good/30 bg-good/10 text-good hover:border-good/50 hover:bg-good/15"
                      : "border-bad/30 bg-bad/10 text-bad hover:border-bad/50 hover:bg-bad/15"
                  }`}
                >
                  <span aria-hidden>{buy ? "↑" : "↓"}</span>{buy ? "Buy" : "Sell"}
                </Link>
              );
            })}
            <Link
              href={`/project/${p.slug}#overview`}
              className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2/40 px-4 py-3 text-[12.5px] font-medium text-ink2 transition-colors duration-150 hover:border-line2 hover:bg-surface2 hover:text-ink"
            >
              {METHODOLOGY_ICON} Methodology
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
