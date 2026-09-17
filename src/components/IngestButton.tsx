"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

interface Status {
  running: { mode: string; startedTs: number } | null;
  lastRunTs: number | null;
  lastStatus: string | null;
  lastMode: string | null;
  schedule: { enabled: boolean; fastMinutes: number; fullHourUtc: number };
}

/**
 * The admin desk's view of the ingest clock: what it is doing, when it last
 * ran, and two buttons to run it now. Polls while a run is in flight so the
 * "running" state clears on its own.
 */
export function IngestButtons() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = !!status?.running;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/ingest/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Status;
        if (!cancelled) setStatus(data);
      } catch {
        /* the stamp is cosmetic; a failed poll just leaves the last one */
      }
    };
    void load();
    const id = setInterval(load, running ? 5_000 : 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [running]);

  const trigger = async (mode: "fast" | "full") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json()) as { error?: string; status?: Status };
      if (!res.ok) setError(data.error ?? `Failed (${res.status})`);
      if (data.status) setStatus(data.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <span className="text-muted">
        {status?.running
          ? `Ingest running (${status.running.mode}, started ${timeAgo(status.running.startedTs)})`
          : status?.lastRunTs
            ? `Archive updated ${timeAgo(status.lastRunTs)}${status.lastMode ? ` (${status.lastMode})` : ""}${
                status.lastStatus && status.lastStatus !== "ok" ? ` — last run ${status.lastStatus}` : ""
              }`
            : status
              ? "Archive has not been ingested yet"
              : "…"}
      </span>
      <button
        type="button"
        disabled={busy || running}
        onClick={() => trigger("fast")}
        className="btn-ghost !px-3 !py-1.5 text-[12px] disabled:opacity-50"
        title="Prices, treasuries, governance and signals — a few minutes"
      >
        Run fast ingest
      </button>
      <button
        type="button"
        disabled={busy || running}
        onClick={() => trigger("full")}
        className="btn-ghost !px-3 !py-1.5 text-[12px] disabled:opacity-50"
        title="Everything, including candles, holders, risk, GitHub and news — several minutes"
      >
        Run full ingest
      </button>
      {error && <span className="text-bad">{error}</span>}
    </div>
  );
}
