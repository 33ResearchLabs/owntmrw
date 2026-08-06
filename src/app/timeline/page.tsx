import { globalTimeline } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { TimelineFeed } from "@/components/TimelineFeed";

export const dynamic = "force-dynamic";

export default function TimelinePage() {
  const events = globalTimeline(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">Ecosystem Timeline</h1>
        <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted">
          Every indexed event across all MetaDAO projects, newest first.
        </p>
      </div>

      <TimelineFeed
        // Dates and times are formatted here, on the server, so the grouping key
        // and the row stamps are identical in both renders. The list itself is
        // passed straight through in the order the query returned it.
        events={events.map((e) => ({
          ts: e.ts, type: e.type, title: e.title, url: e.url,
          slug: e.slug, name: e.name, image_url: e.image_url,
          dateLabel: fmtDate(e.ts),
          timeLabel: new Date(e.ts * 1000).toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit",
          }),
        }))}
      />
    </div>
  );
}
