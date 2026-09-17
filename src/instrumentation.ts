/**
 * Runs once per server start, before the first request (and never during
 * `next build`). The only thing started here is the ingest clock, and only
 * on the Node runtime — the scheduler spawns a child process and reads
 * SQLite, neither of which exists on the edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("./lib/ingest/scheduler");
  startScheduler();
}
