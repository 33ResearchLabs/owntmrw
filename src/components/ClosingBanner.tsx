import Link from "next/link";

/**
 * The page's closing call to action.
 *
 * `.hero` is the same shape and shell the page's top banner sits in — same
 * border, radius and vertical wash — paired with `.hero-gold`, which swaps
 * `.hero`'s own two radial gradients from the old terminal blue to the brand
 * gold. The top hero can leave those blue because `.hero-banner`'s artwork and
 * veil sit on top and hide most of them; a plain panel with nothing layered
 * over it, like this one, would otherwise show the blue in full.
 */

/**
 * Half of an ellipse, split at its widest points, as an SVG arc path — the
 * unit `OrbitMark` draws a ring from. A single `<ellipse>` cannot sit partly
 * behind and partly in front of the disc; two half-paths can, drawn either
 * side of it in document order. `sweep` picks which half: 0 and 1 are the two
 * complements of the same split, not an up/down or front/back choice by
 * themselves — which physical half each one lands on then depends on the
 * ring's own rotation, so `OrbitMark` assigns them by eye, not by formula.
 */
function halfEllipse(cx: number, cy: number, rx: number, ry: number, sweep: 0 | 1): string {
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 ${sweep} ${cx + rx} ${cy}`;
}

interface Ring { rx: number; ry: number; rotate: number; opacity: number; width: number }

const RINGS: Ring[] = [
  { rx: 104, ry: 38, rotate: -14, opacity: 0.85, width: 1.2 },
  { rx: 76, ry: 27, rotate: -20, opacity: 0.55, width: 1 },
];

/**
 * The mark, rendered as an orbiting disc rather than the flat badge.
 *
 * Built from the same bar-across-a-circle shape `Mark` is, just at hero scale
 * with a disc gradient and two rings standing in for the flat fill —
 * recognisably the same object, not a new one invented for this banner. Each
 * ring is drawn as a back half (before the disc, so it disappears behind it)
 * and a front half (after, so it crosses over) — an orbit has to pass behind
 * its own planet on one side and in front on the other, and a single ellipse
 * drawn whole cannot do both at once. The disc carries a lighter rim than
 * `Mark`'s flat navy so it still reads as a shape against the hero's own dark
 * gradient rather than disappearing into it. Hidden below `sm`: at that width
 * it would outweigh the copy it sits beside.
 */
function OrbitMark() {
  const cx = 118, cy = 96, r = 48;
  return (
    <svg width={220} height={186} viewBox="0 0 220 186" aria-hidden className="hidden shrink-0 sm:block">
      <defs>
        {/* A gold-lit sheen rather than the cooler blue-grey this started as —
            the disc's only light source in the scene is the gold the rings and
            pedestal are drawn in, so its highlight reads as that light hitting
            navy metal rather than as a stray blue accent. */}
        <radialGradient id="orbit-disc" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0%" stopColor="#7d6a48" />
          <stop offset="55%" stopColor="#241f2c" />
          <stop offset="100%" stopColor="#0b1320" />
        </radialGradient>
        <radialGradient id="orbit-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r={92} fill="url(#orbit-halo)" />

      {/* back halves — behind the disc. Centred on the disc itself, not below
          it: `ry` is close enough to `r` that the ellipse's edge actually
          crosses the disc's circle, which is what the front half needs to cut
          across rather than merely graze its rim. */}
      {RINGS.map((ring, i) => (
        <path
          key={`back-${i}`}
          d={halfEllipse(cx, cy, ring.rx, ring.ry, 1)}
          transform={`rotate(${ring.rotate} ${cx} ${cy})`}
          stroke="var(--brand)" strokeWidth={ring.width} opacity={ring.opacity} fill="none"
        />
      ))}

      {/* pedestal — a cylinder, not a flat ellipse: a body rect between two
          ellipses gives it a visible side rather than reading as a coin lying
          flat under the disc */}
      <rect x={cx - 30} y={cy + r - 6} width="60" height="18" fill="var(--brand)" />
      <ellipse cx={cx} cy={cy + r + 12} rx="30" ry="7" fill="#8a6f43" />
      <ellipse cx={cx} cy={cy + r - 6} rx="30" ry="7" fill="var(--brand-hi)" />

      <circle cx={cx} cy={cy} r={r} fill="url(#orbit-disc)" stroke="rgba(255,255,255,0.12)" />
      <circle cx={cx - 14} cy={cy - 16} r="9.5" fill="#f3efe9" />
      <rect x={cx - 27} y={cy + 12} width="34" height="8" rx="4" fill="var(--brand)" />

      {/* front halves — over the disc, plus the two orbiting points, both
          drawn last so neither is ever clipped by it */}
      {RINGS.map((ring, i) => (
        <path
          key={`front-${i}`}
          d={halfEllipse(cx, cy, ring.rx, ring.ry, 0)}
          transform={`rotate(${ring.rotate} ${cx} ${cy})`}
          stroke="var(--brand)" strokeWidth={ring.width} opacity={ring.opacity} fill="none"
        />
      ))}
      <circle cx={cx + 94} cy={cy - 4} r="3.2" fill="var(--brand-hi)" />
      <circle cx={cx - 82} cy={cy + 36} r="2.2" fill="var(--brand)" opacity="0.8" />
    </svg>
  );
}

export function ClosingBanner() {
  return (
    <Link
      href="/screener"
      className="hero hero-gold group relative flex flex-col items-start gap-8 px-8 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-12 sm:py-11"
    >
      {/* `--hero-glow-light` set to the brand gold, same as the top hero:
          `.hero-glow`'s own default is the old terminal blue, and left
          unset here it would be the one blue thing left on a page that has
          otherwise moved to the brand gold. */}
      <div
        className="hero-glow"
        style={{ "--hero-glow-light": "rgba(169, 138, 85, 0.22)" } as React.CSSProperties}
      />

      <div className="relative max-w-[420px]">
        <h3 className="text-[27px] font-extrabold leading-[1.15] tracking-tight text-ink sm:text-[31px]">
          Own tomorrow&apos;s<br />winners.
        </h3>
        <span className="mt-4 block h-[3px] w-10 rounded-full bg-brand" aria-hidden />
        <p className="mt-4 text-[13.5px] leading-relaxed text-ink2">
          Discover insights that power better decisions.<br />
          Track what matters. Understand what comes next.
        </p>
        <span className="btn-primary mt-6 inline-flex transition-[filter] duration-150 group-hover:brightness-110">
          Explore now <span aria-hidden>→</span>
        </span>
      </div>

      <div className="relative"><OrbitMark /></div>
    </Link>
  );
}
