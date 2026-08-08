"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The contents rail's active mark, and the smooth scroll to a section.
 *
 * Split into a client component because it is the only part of a legal
 * document that needs the browser — the document itself, its headings and
 * every anchor in this list are server-rendered, and without JavaScript this
 * degrades to exactly what it is: a list of working links that jump.
 *
 * The mark is observed rather than derived from the hash, because a reader who
 * scrolls past four sections has not clicked anything, and a rail that only
 * moves on click is a rail that lies for most of the page.
 *
 * Smoothing is done here rather than with `html { scroll-behavior: smooth }`
 * because that property belongs to the scrollport, not to the link — setting
 * it would smooth every jump on the site, including the project page's `#trade`
 * and every tab anchor, which is a change to pages this one has no business
 * touching.
 */

/**
 * How long the observer stays muted after a click if the browser never reports
 * the scroll settling. Long enough to cover a jump across a long document,
 * short enough that a reader who scrolls away by hand gets the live mark back
 * almost immediately. `scrollend` releases it sooner wherever it exists.
 */
const SETTLE_MS = 1000;

export interface ContentsItem {
  id: string;
  /** The section's own number, e.g. "1." — absent for an unnumbered block. */
  num: string | null;
  label: string;
  /** A subsection, indented under its parent. */
  sub?: boolean;
}

export function LegalContents({ items }: { items: ContentsItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  /*
   * A click-driven scroll crosses every section between here and the target,
   * and the observer would report each one in turn — so the mark would race
   * down the rail and land, which is the flicker a smooth scroll is supposed
   * to avoid. It is muted for the duration and the target is set directly.
   */
  const locked = useRef(false);
  /** Bumped per click, so a settle from an earlier one cannot unmute a later. */
  const seq = useRef(0);
  const timer = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Keyed on the ids rather than the array: `items` arrives as a fresh array
  // on every render of the server parent, and depending on it directly would
  // tear down and rebuild the observer for nothing.
  const key = items.map((i) => i.id).join(",");

  useEffect(() => {
    const els = key
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (!els.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (locked.current) return;
        // The topmost heading inside the band is the one being read. Sorting by
        // position rather than taking the first entry matters because the
        // observer reports in registration order, not document order.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      {
        // A band just under the floating nav and across the top third of the
        // viewport. Watching the whole viewport would keep the last section on
        // a long page permanently "active" once it scrolled into view.
        rootMargin: `-${100}px 0px -68% 0px`,
        threshold: 0,
      }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [key]);

  // Nothing outlives the rail: a pending settle timer would fire into a
  // unmounted component, and an unfired `scrollend` listener would sit on
  // `window` for the rest of the session.
  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
      abort.current?.abort();
    },
    []
  );

  const go = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    // Leave the browser the clicks that are its own: open-in-new-tab, new
    // window, and anything that is not a plain primary click still behave as
    // an ordinary link to `#id`.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    const el = document.getElementById(id);
    // No target means something is out of step between the rail and the
    // document — fall through to the native jump rather than swallow the click.
    if (!el) return;

    e.preventDefault();

    // Read per click rather than once at mount: the setting can change under a
    // running page, and this is the moment it matters.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const mine = ++seq.current;
    locked.current = true;
    setActive(id);

    // `block: "start"` lands the section under the floating nav rather than
    // beneath it: `scroll-padding-top` on `html` is honoured by
    // `scrollIntoView`, the same offset the plain anchor jump already used.
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });

    // Replaced rather than pushed, matching `Tabs`: a contents rail moves
    // inside one document, and pushing would make Back walk the reader up
    // their own click history instead of off the page.
    history.replaceState(null, "", `#${id}`);

    const release = () => {
      // A later click owns the lock now; leave its timer and its mute alone.
      if (seq.current !== mine) return;
      if (timer.current != null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      locked.current = false;
    };

    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    // `scrollend` unmutes as soon as the scroll actually settles. The timer is
    // the fallback for engines without it — and for a click on the section
    // already in view, where no scroll happens and `scrollend` never fires.
    window.addEventListener("scrollend", release, { once: true, signal: ac.signal });
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(release, SETTLE_MS);
  }, []);

  return (
    <nav aria-label="Contents">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
        Contents
      </div>

      <ol className="mt-4 space-y-px border-l border-grid">
        {items.map((it) => {
          const on = active === it.id;
          return (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                onClick={(e) => go(e, it.id)}
                aria-current={on ? "true" : undefined}
                // The active mark is a border on the item itself, replacing the
                // rail's own hairline for that row — so the indicator sits in
                // the line rather than beside it.
                className={`-ml-px flex gap-2.5 border-l py-1.5 pl-3 pr-2 text-[12px] leading-snug transition-colors duration-150 ${
                  it.sub ? "pl-6" : ""
                } ${
                  on
                    ? "border-l-accent font-semibold text-ink"
                    : "border-l-transparent text-muted hover:border-l-line2 hover:text-ink2"
                }`}
              >
                {it.num && (
                  <span className={`num shrink-0 ${on ? "text-accent" : "text-faint"}`}>
                    {it.num}
                  </span>
                )}
                <span className="min-w-0">{it.label}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
