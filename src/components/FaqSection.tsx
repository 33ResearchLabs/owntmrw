"use client";

import { useState } from "react";

/**
 * Home page FAQ.
 *
 * A client component because the accordion is stateful; nothing here reads or
 * writes application data, so it takes no props and sits at the end of the
 * home page's main column.
 */

type Faq = {
  q: string;
  /** Prose that opens the answer. Always present. */
  a: string;
  /** Only Q2 carries a list; the rest answer in a single paragraph. */
  bullets?: string[];
};

const FAQS: Faq[] = [
  {
    q: "What is OwnTMRW?",
    a: "OwnTMRW is a research platform for private-market and tokenized companies. We combine on-chain data, treasury analysis, holder intelligence, development activity, governance, and AI insights into one institutional-grade workspace.",
  },
  {
    q: "What can I analyze?",
    a: "You can analyze every tracked project across:",
    bullets: [
      "Fundraising & Raise Performance",
      "Treasury Health",
      "Holder Distribution",
      "Developer Activity",
      "Governance",
      "Liquidity & Market Performance",
      "AI Research & Risk Analysis",
    ],
  },
  {
    q: "Where does your data come from?",
    a: "Our research combines verified public sources including blockchain data, GitHub repositories, governance systems, market data providers, and project disclosures. Every metric is linked to a transparent methodology.",
  },
  {
    q: "How often is the data updated?",
    a: "Market data updates in near real-time, while treasury balances, holder snapshots, developer activity, and governance data refresh continuously as new on-chain or public information becomes available.",
  },
  {
    q: "How is the Health Score calculated?",
    a: "The Health Score is generated from multiple measurable dimensions including treasury strength, holder distribution, developer activity, liquidity, governance, market performance, and risk indicators. Every score is fully explainable—no black-box ratings.",
  },
  {
    q: "Can I compare multiple projects?",
    a: "Yes. Compare projects side-by-side across fundraising, treasury, holders, development, governance, liquidity, valuation, and performance to make faster investment decisions.",
  },
  {
    q: "Do I need to connect a wallet?",
    a: "No. You can browse markets and explore research without connecting a wallet. Connecting your wallet unlocks watchlists, portfolio tracking, personalized insights, saved research, and future premium features.",
  },
  {
    q: "Is OwnTMRW an investment platform?",
    a: "No. OwnTMRW provides research and analytics. We do not provide financial advice or guarantee investment outcomes. Our goal is to make private-market intelligence transparent and accessible.",
  },
];

/*
 * Shadows live in inline styles rather than `shadow-[…]` for the reason already
 * documented on the home page's market strip: Tailwind silently emits no rule
 * at all for an arbitrary box-shadow with a negative spread, which is what
 * gives these cards their soft, contained falloff instead of a halo.
 */
const PANEL_SHADOW = { boxShadow: "0 18px 44px -28px rgba(0, 0, 0, 0.95)" };
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

export function FaqSection() {
  // The reference opens on the first question, and an accordion that starts
  // fully closed reads as an unloaded block at this size.
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      aria-labelledby="faq-heading"
      className="card px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12"
      style={PANEL_SHADOW}
    >
      {/*
       * Two columns from `md` up, with the accordion given the larger share —
       * the questions are the long lines here, and an even split wrapped most
       * of them. Below that the pair stacks and each card runs full width.
       */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[0.85fr_1fr] md:gap-7 lg:gap-12">
        {/* ---- left: identity and support ---- */}
        <div className="flex min-w-0 flex-col">
          <span className="inline-flex w-fit items-center rounded-lg border border-line bg-surface2 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink2">
            FAQs
          </span>

          <h2
            id="faq-heading"
            className="mt-5 text-[30px] font-extrabold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[34px] lg:text-[38px]"
          >
            Frequently Asked Questions
          </h2>

          {/*
           * Pushed to the foot of the column on a desktop so it sits against
           * the bottom of the accordion as in the reference, and simply
           * follows the heading once the layout stacks.
           */}
          <div
            className="mt-8 rounded-2xl border border-line bg-page/60 px-5 py-5 md:mt-auto md:pt-8"
            style={CARD_SHADOW}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface2 text-muted">
              <svg viewBox="0 0 24 24" aria-hidden className="h-[17px] w-[17px]">
                <path
                  d="M20 12a8 8 0 1 1-3.2-6.4M20 4v5h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>

            <div className="mt-4 text-[14.5px] font-bold text-ink">Need assistance?</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Contact our team for support.
            </p>

            <a
              href="mailto:support@owntmrw.com"
              className="mt-5 inline-flex items-center rounded-lg border border-line2 bg-white/[0.04] px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink transition-colors duration-150 hover:bg-white/[0.09]"
            >
              Contact Us
            </a>
          </div>
        </div>

        {/* ---- right: accordion ---- */}
        <div className="flex min-w-0 flex-col gap-2.5">
          {FAQS.map((f, i) => {
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
                    // Closing the open row is a click on the same row, so the
                    // set collapses to nothing rather than trapping one open.
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
                 * transitions to the content's natural height without having
                 * to measure it — a `max-height` guess would either clip the
                 * seven-item list in Q2 or leave the shorter answers easing
                 * through empty space.
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
                    <div className="px-5 pb-5 text-[12.5px] leading-relaxed text-ink2 sm:px-6 sm:pb-6 sm:text-[13px]">
                      <p className="m-0">{f.a}</p>
                      {f.bullets && (
                        <ul className="mt-3 space-y-1.5">
                          {f.bullets.map((b) => (
                            <li key={b} className="flex gap-2.5">
                              <span aria-hidden className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-faint" />
                              <span className="min-w-0">{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
