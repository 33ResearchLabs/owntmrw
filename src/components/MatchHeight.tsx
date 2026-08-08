"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Stretches one box to the measured height of another.
 *
 * Used to sit the rail's first card level with the hero beside it. The two live
 * in different columns — the hero is a child of the left flex column, the card
 * is inside the rail, which is taken out of flow at `xl` — and CSS can only
 * equalise heights across a shared grid or flex line. Putting these two on one
 * would mean rebuilding the two-column block, and the rail's own layout is
 * built around Signals absorbing whatever slack the column leaves. Measuring is
 * the smaller change: it touches one card and nothing else.
 *
 * Everything about this degrades to the card's natural height — no JavaScript,
 * a narrow viewport, or a missing target all leave it exactly as it was, which
 * is why the height is applied as an override rather than assumed.
 */

/** `xl` in px. The rail is only a rail from here; below it the cards grid. */
const XL = 1280;

export function MatchHeight({
  of,
  className,
  children,
}: {
  /** `id` of the element to match. */
  of: string;
  className?: string;
  children: ReactNode;
}) {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const target = document.getElementById(of);
    if (!target) return;

    const mq = window.matchMedia(`(min-width: ${XL}px)`);
    // `getBoundingClientRect` rather than `offsetHeight`: the height wanted is
    // the rendered one including fractions, and rounding it leaves a hairline
    // of misalignment against a box that was not rounded.
    const apply = () =>
      setHeight(mq.matches ? target.getBoundingClientRect().height : null);

    apply();

    // The hero's height moves with the viewport — its copy rewraps — so this
    // watches the element rather than measuring once on mount.
    const ro = new ResizeObserver(apply);
    ro.observe(target);
    mq.addEventListener("change", apply);

    return () => {
      ro.disconnect();
      mq.removeEventListener("change", apply);
    };
  }, [of]);

  return (
    <div
      className={className}
      style={
        height != null
          ? // `flexShrink: 0` goes with the height, not instead of it: the rail
            // is a flex column, and a flex item with a set height still shrinks
            // from it unless told otherwise.
            { height, flexShrink: 0 }
          : undefined
      }
    >
      {children}
    </div>
  );
}
