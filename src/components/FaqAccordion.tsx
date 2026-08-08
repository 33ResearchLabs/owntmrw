"use client";

import { useState } from "react";

/**
 * The stacked accordion on the FAQ page.
 *
 * Separate from `FaqSection`, which is the home page's own panel: that one is a
 * card with a heading and its own copy baked in, this one is a bare list that
 * takes its questions as a prop. What the two do share is the mechanism and the
 * card treatment, kept deliberately identical so the site reads as having one
 * FAQ style rather than two.
 *
 * A client component because the accordion is stateful. It holds no copy of its
 * own — every word on screen comes from the `items` it is handed.
 */

/**
 * One answer block: a string is a paragraph, an array of strings is a bullet
 * list. An answer is only ever those two things, and modelling it as a tagged
 * union would cost every line of copy a wrapper object.
 */
export type FaqBlock = string | string[];

export interface FaqItem {
  q: string;
  a: FaqBlock[];
}

/*
 * Shadow lives in an inline style rather than `shadow-[…]` for the reason
 * already documented on the home page's market strip: Tailwind silently emits
 * no rule at all for an arbitrary box-shadow with a negative spread, which is
 * what gives the open card its soft, contained falloff instead of a halo.
 */
const CARD_SHADOW = { boxShadow: "0 10px 26px -20px rgba(0, 0, 0, 0.9)" };

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`h-[18px] w-[18px] shrink-0 text-muted transition-transform duration-300 ease-out motion-reduce:transition-none ${
        open ? "-rotate-180 text-ink2" : "rotate-0"
      }`}
    >
      <path
        d="M6 9.5 12 15.5 18 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  // The first question opens with the page, as the reference sets it. Clicking
  // it closes it, so the set can collapse to nothing rather than trapping one
  // open.
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-3">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div
            key={f.q}
            className={`rounded-2xl border transition-colors duration-200 ${
              isOpen
                ? "border-line2 bg-surface2"
                : "border-line bg-surface2/60 hover:border-line2 hover:bg-surface2"
            }`}
            style={isOpen ? CARD_SHADOW : undefined}
          >
            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                id={`faq-trigger-${i}`}
                className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-[18px]"
              >
                <span className="min-w-0 text-[14px] font-semibold leading-snug text-ink sm:text-[15px]">
                  {f.q}
                </span>
                <Chevron open={isOpen} />
              </button>
            </h3>

            {/*
             * Height animates via `grid-template-rows: 0fr → 1fr`, which
             * transitions to the content's natural height without having to
             * measure it — a `max-height` guess would either clip a long
             * answer or leave the short ones easing through empty space.
             */}
            <div
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-trigger-${i}`}
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="space-y-3 px-5 pb-5 text-[12.5px] leading-relaxed text-ink2 sm:px-6 sm:pb-6 sm:text-[13px]">
                  {f.a.map((b, j) =>
                    Array.isArray(b) ? (
                      <ul key={j} className="space-y-1.5">
                        {b.map((item) => (
                          <li key={item} className="flex gap-2.5">
                            <span
                              aria-hidden
                              className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-faint"
                            />
                            <span className="min-w-0">{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p key={j} className="m-0">
                        {b}
                      </p>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
