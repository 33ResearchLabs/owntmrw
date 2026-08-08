import Link from "next/link";
import { LegalContents, type ContentsItem } from "./LegalContents";

/**
 * Shared shell for the site's legal documents (/terms, /privacy).
 *
 * The two pages are the same object with different words in it — a titled
 * document, a contents rail, and a run of numbered sections — so the layout
 * lives here once and each page supplies only its own text. A second copy of
 * this markup would be two places for the heading scale and the section
 * rhythm to drift apart.
 *
 * This component formats; it does not author. It adds no numbering, no
 * punctuation and no wording of its own to the copy it is handed. The section
 * numbers that appear above each heading are *taken from* the supplied title
 * rather than generated: `splitNumber` cuts "1. About Underly" into its own
 * two parts, and the pair recombines to the original string character for
 * character. Nothing is zero-padded, renumbered or restyled into a form the
 * document does not already use — a document that numbers itself "1." is
 * shown as "1.", not as "01".
 *
 * Server-rendered apart from the contents rail's active mark, which is the one
 * thing on the page that needs to know where the reader is.
 */

/**
 * One block inside a section.
 *
 * A string is a paragraph, an array of strings is a bullet list, and `lines`
 * is a tight stack with no bullets — the shape a contact block wants, where
 * the lines belong together and paragraph spacing would pull them apart.
 */
export type LegalBlock = string | string[] | { lines: string[] };

/** A numbered subsection, e.g. "1.1 Personal Information". */
export interface LegalSubsection {
  id: string;
  /** Rendered verbatim, including the document's own numbering. */
  title: string;
  body: LegalBlock[];
}

export interface LegalSection {
  /** Anchor target, and the `href` the contents rail points at. */
  id: string;
  /** Supplied verbatim. Any leading number is lifted into the eyebrow above. */
  title: string;
  /**
   * Optional: a section that only introduces its subsections has no prose of
   * its own, and inventing a lead-in for it would be this file writing copy.
   */
  body?: LegalBlock[];
  subsections?: LegalSubsection[];
  /**
   * Draws the section in the warning tone. For a risk notice, which is the one
   * block a reader most needs to not scroll past — the treatment is presentation
   * only and changes nothing about the text inside it.
   */
  tone?: "warn";
}

/**
 * Cut a leading section number off a heading for display.
 *
 * Matches the document's own numbering in whatever form it uses — "1.", "1.1",
 * "12." — and returns it untouched beside the rest of the heading. A heading
 * with no number (a risk notice, say) comes back whole. `num + " " + rest` is
 * always exactly the input, which is what keeps this a layout operation rather
 * than an edit.
 */
function splitNumber(title: string): { num: string | null; rest: string } {
  const m = title.match(/^(\d+(?:\.\d+)*\.?)\s+(.+)$/);
  return m ? { num: m[1], rest: m[2] } : { num: null, rest: title };
}

/** The documents in the tab strip. Only routes that exist appear here. */
const DOCS = [
  { href: "/terms", label: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
] as const;

function DocIcon({ name }: { name: string }) {
  const common = {
    width: 13, height: 13, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.9,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    "aria-hidden": true, className: "shrink-0",
  };
  return name === "Privacy Policy" ? (
    <svg {...common}>
      <path d="M12 3l7 3v6c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V6l7-3Z" />
    </svg>
  ) : (
    <svg {...common}>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z" />
      <path d="M14 3v4h4M9 12h6M9 16h4" />
    </svg>
  );
}

function Blocks({ blocks, className = "" }: { blocks: LegalBlock[]; className?: string }) {
  return (
    <div className={`space-y-3.5 ${className}`}>
      {blocks.map((b, i) => {
        if (Array.isArray(b)) {
          return (
            <ul key={i} className="space-y-2 pt-0.5">
              {b.map((item, j) => (
                <li key={j} className="flex gap-3 text-[13.5px] leading-[1.75] text-ink2">
                  {/* A rotated square, per the reference's diamond markers. */}
                  <span aria-hidden className="mt-[9px] h-[5px] w-[5px] shrink-0 rotate-45 bg-accent/70" />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (typeof b === "object") {
          return (
            <div key={i} className="space-y-1">
              {b.lines.map((line, j) => (
                <p key={j} className="text-[13.5px] leading-[1.75] text-ink2">
                  {line}
                </p>
              ))}
            </div>
          );
        }
        return (
          <p key={i} className="text-[13.5px] leading-[1.75] text-ink2">
            {b}
          </p>
        );
      })}
    </div>
  );
}

export function LegalDoc({
  title,
  meta,
  intro,
  notice,
  sections,
  outro,
}: {
  title: string;
  /** The document's own dateline, e.g. "Last Updated: 1 January 2026". */
  meta?: string;
  /** Blocks that open the document, before the first numbered section. */
  intro?: LegalBlock[];
  /** Banner above the document. For a draft that is not yet in force. */
  notice?: React.ReactNode;
  sections: LegalSection[];
  /**
   * Blocks that close the document, after the last numbered section — for a
   * trailing note the document carries without a heading of its own. Drawn in
   * the warning tone and kept out of the contents rail, because it has no
   * title to list and giving it one would be inventing a heading.
   */
  outro?: LegalBlock[];
}) {
  const parts = sections.map((s) => ({ s, ...splitNumber(s.title) }));

  /*
   * "Introduction" is a navigation label for the opening block, not a heading
   * added to the document — nothing is rendered above the text itself, so the
   * document gains a way to be navigated without gaining a word.
   */
  const items: ContentsItem[] = [
    ...(intro ? [{ id: "introduction", num: null, label: "Introduction" }] : []),
    ...parts.flatMap(({ s, num, rest }) => [
      { id: s.id, num, label: rest },
      ...(s.subsections ?? []).map((sub) => {
        const p = splitNumber(sub.title);
        return { id: sub.id, num: p.num, label: p.rest, sub: true };
      }),
    ]),
  ];

  // Two-tone title, as the reference sets it: the last word carries the accent.
  // A split on whitespace only — no character is added, removed or reordered.
  const cut = title.lastIndexOf(" ");
  const head = cut === -1 ? title : title.slice(0, cut);
  const tail = cut === -1 ? "" : title.slice(cut + 1);

  return (
    /*
     * The legal documents run on a gold accent rather than the terminal blue.
     *
     * Done by redefining the token on this subtree rather than by recolouring
     * each element: `@theme inline` compiles every accent utility straight to
     * `var(--accent)` — `text-accent`, `bg-accent`, `border-l-accent` and the
     * opacity-modified `bg-accent/70` all read it at use — so one declaration
     * here reaches the badge dot, the heading, the section numbers, the bullet
     * diamonds, the rail's active mark and every link, and cannot miss one.
     * Hunting the utilities down one at a time would leave the next element
     * added to these pages back on blue.
     *
     * Scoped to this element rather than to `:root`, because the token is the
     * whole site's accent — the nav mark, the buttons, the charts and the
     * ticker all read the same one, and moving it globally would repaint them.
     *
     * `--accent-hi` is the hover step, kept at the same relative lift the blue
     * pair has, and `--accent-dim` its 14% wash, so anything that reaches for
     * either stays in this palette rather than falling back to blue.
     */
    <div
      className="pb-4"
      style={
        {
          "--accent": "#a98a55",
          "--accent-hi": "#bea36c",
          "--accent-dim": "rgba(169, 138, 85, 0.14)",
        } as React.CSSProperties
      }
    >
      {/* ---------------------------------------------- masthead */}
      {/* Badge, then the heading, then the tab strip below both — and all of it
          inside the same container the grid uses, so the badge and the heading
          start on the contents rail's left edge rather than floating free of
          the column they head. */}
      <div className="mx-auto max-w-[1140px] pt-1">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface2/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
          Legal
          <span aria-hidden className="text-faint">·</span>
          <span className="text-faint">{title}</span>
        </span>

        {/* Responsive from the first step rather than a fixed display size —
            the home page's fixed 64px hero is exactly what overflows a phone,
            and this heading is longer than that one. */}
        <h1 className="mt-5 text-[34px] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[46px] lg:text-[56px]">
          {head}
          {tail && <span className="text-accent"> {tail}</span>}
        </h1>
      </div>

      {/* ---------------------------------------------- document tabs */}
      {/*
       * Scrollable rather than wrapped on a narrow screen — a strip that wraps
       * stops reading as one control.
       *
       * The colour sits on an inner span, not on the link. `globals.css` sets
       * `a { color: inherit }` outside any cascade layer, and an unlayered
       * declaration beats a layered one whatever its specificity — so every
       * Tailwind `text-*` utility loses on an anchor, and the active tab
       * inherited white from `body` onto its own white pill. A span is not an
       * `a`, so the rule cannot reach it. `group-hover` carries the hover
       * across the same boundary.
       *
       * Fixed here rather than in `globals.css`: that rule governs every link
       * on the site, and changing it to repair one pill would repaint all of
       * them.
       */}
      <div className="mt-8 flex justify-center">
        <div className="scroll-x-quiet max-w-full rounded-full border border-line bg-surface2/40 p-1.5">
          <div className="flex items-center gap-1">
            {DOCS.map((d) => {
              const on = d.label === title;
              return (
                <Link
                  key={d.href}
                  href={d.href}
                  aria-current={on ? "page" : undefined}
                  // The active pill carries the accent rather than the plain
                  // white it used to: it is the one navigation state on the
                  // page, and it was the only accented element not reading the
                  // token. Dark ink on the gold measures 5.7:1, so the label
                  // clears AA on the pill it sits in.
                  className={`group flex shrink-0 items-center rounded-full px-4 py-2 text-[12.5px] transition-colors duration-150 ${
                    on ? "bg-accent font-semibold" : "font-medium hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`flex items-center gap-2 whitespace-nowrap ${
                      on ? "text-page" : "text-muted group-hover:text-ink"
                    }`}
                  >
                    <DocIcon name={d.label} />
                    {d.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {notice && <div className="mx-auto mt-8 max-w-[1140px]">{notice}</div>}

      {/* ---------------------------------------------- rail + document */}
      {/* The rail carries the contents and the document card only — the
          masthead sits above the whole block, so this narrows back to the
          width the list itself wants. */}
      <div className="mx-auto mt-10 grid max-w-[1140px] grid-cols-1 gap-8 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:sticky lg:top-[calc(var(--nav-h)+20px)] lg:h-max">
          {/* The rail scrolls inside itself only once it is sticky: a 27-entry
              list is taller than the viewport, and a sticky box taller than the
              screen pins its top and hides its own foot. Stacked above the
              document it is an ordinary block and scrolls with the page.

              The scrollbar itself is hidden in both engines — it is a rail
              beside a document, not a pane, and a track drawn down the middle
              of the page reads as a second scrollbar for the window. Scrolling
              by wheel, drag, keyboard and anchor all still work. */}
          <div className="lg:max-h-[calc(100vh-var(--nav-h)-200px)] lg:overflow-y-auto lg:pr-1 lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
            <LegalContents items={items} />
          </div>

          {meta && (
            <div className="mt-6 rounded-xl border border-line bg-surface2/40 px-4 py-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
                Document
              </div>
              <div className="mt-2 text-[12px] leading-relaxed text-ink2">{meta}</div>
            </div>
          )}
        </aside>

        <article className="min-w-0">
          <div className="max-w-[760px]">
            {intro && (
              <section id="introduction">
                {/* The opening line sits in a tinted panel, per the reference;
                    the paragraphs that follow it are ordinary prose. The panel
                    is only taken when that first block really is a paragraph —
                    a list or a line stack falls through to the normal renderer
                    rather than being flattened into one, which would lose it. */}
                {typeof intro[0] === "string" ? (
                  <>
                    <div className="rounded-xl border border-line border-l-2 border-l-accent bg-surface2/50 px-4 py-3.5 sm:px-5">
                      <p className="text-[13.5px] leading-[1.75] text-ink">{intro[0]}</p>
                    </div>
                    {intro.length > 1 && <Blocks blocks={intro.slice(1)} className="mt-5" />}
                  </>
                ) : (
                  <Blocks blocks={intro} />
                )}
              </section>
            )}

            {parts.map(({ s, num, rest }) => (
              <section
                key={s.id}
                id={s.id}
                className={
                  s.tone === "warn"
                    ? "mt-12 rounded-xl border border-warn/40 bg-warn/5 px-4 py-5 sm:px-6"
                    : "mt-12"
                }
              >
                {/* Number above the heading, as the reference sets it — the
                    document's own number, in its own form. */}
                {num && (
                  <div
                    className={`num text-[11.5px] font-semibold tracking-[0.1em] ${
                      s.tone === "warn" ? "text-warn/80" : "text-accent"
                    }`}
                  >
                    {num}
                  </div>
                )}
                <h2
                  className={`text-[21px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[25px] ${
                    num ? "mt-2" : ""
                  } ${s.tone === "warn" ? "text-warn" : "text-ink"}`}
                >
                  {rest}
                </h2>

                {/* Rule under the heading rather than between sections, which
                    is what gives each section its own opening band. */}
                {s.tone !== "warn" && <div className="mt-5 border-t border-grid" />}

                {s.body && <Blocks blocks={s.body} className={s.tone === "warn" ? "mt-3" : "mt-5"} />}

                {s.subsections?.map((sub) => (
                  <section key={sub.id} id={sub.id} className="mt-7">
                    <h3 className="text-[14.5px] font-bold leading-snug text-ink">{sub.title}</h3>
                    <Blocks blocks={sub.body} className="mt-3" />
                  </section>
                ))}
              </section>
            ))}

            {outro && (
              <div className="mt-12 rounded-xl border border-warn/40 bg-warn/5 px-4 py-5 sm:px-6">
                <Blocks blocks={outro} />
              </div>
            )}

            {/* ---- foot of the document ---- */}
            <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-grid pt-6 text-[12px] text-muted">
              <span>Read next:</span>
              {/* The sibling document. Each page passes its own title, so this
                  never links to the page it is already on. */}
              <Link
                href={title === "Privacy Policy" ? "/terms" : "/privacy"}
                className="text-accent transition-colors hover:underline"
              >
                {title === "Privacy Policy" ? "Terms of Use" : "Privacy Policy"} →
              </Link>
              <Link href="/" className="ml-auto text-ink2 transition-colors hover:text-ink">
                Back to home
              </Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
