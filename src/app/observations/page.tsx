import { allObservations } from "@/lib/queries";
import { fmtDate, timeAgo } from "@/lib/format";
import { SignalsFeed } from "@/components/SignalsFeed";

export const dynamic = "force-dynamic";

export default function ObservationsPage() {
  const obs = allObservations(150);

  // The clock is read once, here. This page is force-dynamic and renders per
  // request, which is the one place reading the time is correct — and doing the
  // formatting server-side keeps both renders in agreement.
  // eslint-disable-next-line react-hooks/purity
  const todayLabel = fmtDate(Math.floor(Date.now() / 1000));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">Signals</h1>
        <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted">
          Automatically generated observations — holder shifts, momentum, development spikes,
          concentration changes.
        </p>
      </div>

      <SignalsFeed
        todayLabel={todayLabel}
        signals={obs.map((o) => ({
          ts: o.ts, kind: o.kind, text: o.text,
          slug: o.slug, name: o.name, image_url: o.image_url,
          dateLabel: fmtDate(o.ts),
          timeLabel: new Date(o.ts * 1000).toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit",
          }),
          agoLabel: timeAgo(o.ts),
        }))}
      />
    </div>
  );
}
