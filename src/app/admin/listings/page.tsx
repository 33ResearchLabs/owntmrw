import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { listingQueue, type ListingRequest } from "@/lib/listings";
import { ListingQueue } from "@/components/ListingQueue";
import { AdminLock, AdminUnlock } from "@/components/AdminUnlock";
import { adminPasswordConfigured, adminUnlocked } from "@/lib/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Listing queue — Underly",
  robots: { index: false, follow: false },
};

const TABS: { key: ListingRequest["status"]; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // Signed in and in ADMIN_WALLETS; everyone else goes home.
  const admin = await requireAdmin("/admin/listings");

  // Second factor. Without a live unlock the queue is not even rendered —
  // the report on each card is the submitter's private detail until then.
  if (!(await adminUnlocked(admin))) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Listing queue</h1>
        </div>
        <AdminUnlock configured={adminPasswordConfigured()} />
      </div>
    );
  }

  const { status } = await searchParams;
  const tab = TABS.find((t) => t.key === status)?.key ?? "pending";
  const requests = listingQueue(tab);
  const pendingCount = tab === "pending" ? requests.length : listingQueue("pending").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Listing queue</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {pendingCount} waiting. Approving creates the project immediately; price
            is live on the next request, history fills on the next ingest.
          </p>
        </div>
        <AdminLock />
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "pending" ? "/admin/listings" : `/admin/listings?status=${t.key}`}
            className="chip"
            data-on={t.key === tab}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <ListingQueue requests={requests} />
    </div>
  );
}
