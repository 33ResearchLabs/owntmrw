import Link from "next/link";
import { requireSession } from "@/lib/session";
import { CATEGORIES, listingsByWallet } from "@/lib/listings";
import { ListingForm } from "@/components/ListingForm";
import { LISTINGS_CLUSTER } from "@/lib/sources/listings";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "List a token — Underly",
  description: "Submit a Solana token for a permanent intelligence profile on Underly.",
};

const STATUS_TONE: Record<string, string> = {
  pending: "text-warn border-warn/40",
  approved: "text-good border-good/40",
  rejected: "text-bad border-bad/40",
};

export default async function ListPage() {
  // The real gate; `proxy.ts` only saw that a cookie existed.
  const wallet = await requireSession("/list");
  const mine = listingsByWallet(wallet);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">List a token</h1>
        <p className="mt-1 text-[12.5px] leading-6 text-muted">
          Get a permanent profile — price history, holders, governance, development —
          for a token you launched. Submissions are checked against the chain and
          reviewed before anything is published.
          {LISTINGS_CLUSTER !== "mainnet" && (
            <span className="ml-1 text-warn">Verifier is pointed at {LISTINGS_CLUSTER}.</span>
          )}
        </p>
      </div>

      <ListingForm categories={CATEGORIES} />

      {mine.length > 0 && (
        <section className="card">
          <div className="border-b border-grid px-4 py-3">
            <h3 className="text-[14px] font-semibold">Your submissions</h3>
          </div>
          <ul className="divide-y divide-line">
            {mine.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[12.5px]">
                <span className="font-semibold text-ink">{r.name}</span>
                <span className="text-muted">${r.symbol}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_TONE[r.status] ?? "text-muted border-line"}`}>
                  {r.status}
                </span>
                <span className="text-faint">
                  {fmtDate(r.created_ts)}
                </span>
                {r.status === "approved" && r.slug && (
                  <Link href={`/project/${r.slug}`} className="text-accent hover:underline">
                    View profile →
                  </Link>
                )}
                {r.status === "rejected" && r.review_note && (
                  <span className="basis-full text-ink2">Reason: {r.review_note}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
