import { screenerRows } from "@/lib/queries";
import { scoreboard } from "@/lib/scoreboard";
import { intelProjects, pickFeatured } from "@/components/IntelligenceSection";
import { IntelligencePair } from "@/components/IntelligenceCard";
import { VariantTerminal, VariantUnified, VariantDossier } from "@/components/IntelligenceVariants";
import { VariantCinematic, VariantEditorial, VariantWorkspace } from "@/components/IntelligenceVariantsMore";

/**
 * A comparison page for the intelligence section's layout, not a product page.
 *
 * The shipped pair and the three alternates are rendered one under the other
 * against the same real data, so the choice is made on how each one actually
 * looks at this width with these figures rather than on a description of it.
 * Delete this route and `IntelligenceVariants` once a layout is chosen.
 */

export const dynamic = "force-dynamic";

const OPTIONS = [
  {
    id: "current",
    label: "Current",
    tag: "shipped",
    note: "Two cards. Every row is its own bordered box inside a bordered card, and the verdict sits fourth on the right-hand panel.",
  },
  {
    id: "a",
    label: "A · Terminal readout",
    tag: "densest",
    note: "Row borders come off for a hairline ledger with colour rails; figures step up and set in tabular numerals. The verdict leads the right panel at 46px over a full-width price line, and Buy/Sell become one segmented control.",
  },
  {
    id: "b",
    label: "B · One instrument",
    tag: "one frame",
    note: "The two cards merge into a single panel: one header, one border, the split moved inside as a column rule. The verdict is promoted into the header, the facets become tiles, and both destinations share one footer on the card's bottom edge.",
  },
  {
    id: "c",
    label: "C · Dossier",
    tag: "widest",
    note: "Three full-width bands. A masthead names the project once and carries the score as a dial, which frees the five facets to sit in a single row. The trade band comes last, as what the bands above argue for.",
  },
  {
    id: "d",
    label: "D · Cinematic",
    tag: "loudest",
    note: "Reads as a landing page rather than a dashboard: the site's own hero treatment, the headline at 34px against the project's name, the readings as chips, and the whole trade panel on a plate floating over the gradient. Evidence follows as a flush strip beneath.",
  },
  {
    id: "e",
    label: "E · Editorial index",
    tag: "quietest",
    note: "The opposite move from A — room won by throwing chrome away rather than by packing tighter. Five numbered entries on hairlines, no badges or fills. The right card becomes the argument itself: reading, then stance, then action, as three steps down a spine.",
  },
  {
    id: "f",
    label: "F · Workspace",
    tag: "new structure",
    note: "The only one that changes the architecture, not the styling. The picker becomes a visible rail of everything tracked, so the section shows its breadth instead of asserting it. Five facets plus the verdict fill a 3×2 grid exactly, so the stance sits inside the readings.",
  },
];

function Header({ id }: { id: string }) {
  const o = OPTIONS.find((x) => x.id === id)!;
  return (
    <div className="mb-4 border-b border-grid pb-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-[15px] font-extrabold tracking-tight">{o.label}</h2>
        <span className="rounded-md bg-surface2 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
          {o.tag}
        </span>
      </div>
      <p className="mt-1.5 max-w-[820px] text-[12px] leading-relaxed text-muted">{o.note}</p>
    </div>
  );
}

export default async function DesignIntelligencePage() {
  const rows = await screenerRows();
  const featured = pickFeatured(rows);
  const board = await scoreboard(rows, featured?.slug ?? null);
  const projects = intelProjects(rows, board);

  if (!projects.length) {
    return <p className="text-[13px] text-muted">No project has enough figures on file to fill the card.</p>;
  }

  return (
    <div className="space-y-12 py-2">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Intelligence section — layout options</h1>
        <p className="mt-1 max-w-[820px] text-[13px] leading-relaxed text-ink2">
          Same data, same readings, seven layouts. Each picker is independent, so a project can be
          selected in one and compared against another. Nothing here is wired into the home page.
        </p>
      </div>

      <section><Header id="current" /><IntelligencePair projects={projects} /></section>
      <section><Header id="a" /><VariantTerminal projects={projects} /></section>
      <section><Header id="b" /><VariantUnified projects={projects} /></section>
      <section><Header id="c" /><VariantDossier projects={projects} /></section>
      <section><Header id="d" /><VariantCinematic projects={projects} /></section>
      <section><Header id="e" /><VariantEditorial projects={projects} /></section>
      <section><Header id="f" /><VariantWorkspace projects={projects} /></section>
    </div>
  );
}
