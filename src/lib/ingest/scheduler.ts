import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { getMeta, getMetaInt, releaseLock, setMeta, tryLock } from "./meta";

/**
 * Keeps the archive fresh without an operator.
 *
 * Before this the only way data moved was someone running `npm run ingest`
 * by hand, and the history panels aged silently between those runs while the
 * live quotes on top of them looked current. This runs the same script on a
 * clock from inside the web process: a `--fast` pass (prices, treasuries,
 * governance, observations) every hour and a full pass (candles, holders,
 * listings, risk, GitHub, news) once a day.
 *
 * The script runs as a child process rather than being imported. It is a
 * thousand lines of synchronous SQLite writes between awaits, with a
 * `process.exit` on failure — in-process it would stall every request for
 * minutes and a crash or an out-of-memory would take the site down with it.
 * A child can be timed out and killed, and its imports already honour
 * DATA_DIR / RAILWAY_VOLUME_MOUNT_PATH, so it writes the same database this
 * process reads. This does assume the source tree ships with the deploy
 * (`scripts/`, `src/lib`), which `npm run start` from the repo guarantees; an
 * `output: "standalone"` build would have to copy them in.
 *
 * What is due is decided from stamps in the `meta` table, not from timers
 * that started at boot: a restart does not trigger a run, a missed window is
 * caught up on the next tick, and a manual run from the shell counts. A
 * lease in the same table stops two runs overlapping — this process against
 * a shell run, or the old container against the new one during a deploy.
 *
 * Env (all optional):
 *   INGEST_SCHEDULE=off           never schedule (manual trigger still works)
 *   INGEST_FAST_MINUTES=60        gap between fast passes
 *   INGEST_FULL_HOUR_UTC=3        the hour a full pass is due each day
 *   INGEST_BOOT_DELAY_MINUTES=3   quiet period after start before the first tick acts
 *   INGEST_TIMEOUT_MINUTES=45     a run past this is killed
 */

export type IngestMode = "fast" | "full";

interface Running {
  mode: IngestMode;
  startedTs: number;
  child: ChildProcess;
  timer: NodeJS.Timeout;
}

interface SchedulerState {
  bootTs: number;
  tick: NodeJS.Timeout | null;
  running: Running | null;
}

// One per process. Dev's Fast Refresh re-evaluates modules, and a second
// interval on the same clock would double every run.
const g = globalThis as typeof globalThis & { __underlyIngest?: SchedulerState };

const LOCK_KEY = "ingest_lock_until";
const TICK_MS = 60_000;

const envInt = (name: string, fallback: number, min: number, max: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
};

const config = () => ({
  enabled: (process.env.INGEST_SCHEDULE ?? "on").toLowerCase() !== "off",
  fastMinutes: envInt("INGEST_FAST_MINUTES", 60, 1, 24 * 60),
  fullHourUtc: envInt("INGEST_FULL_HOUR_UTC", 3, 0, 23),
  bootDelayMinutes: envInt("INGEST_BOOT_DELAY_MINUTES", 3, 0, 120),
  timeoutMinutes: envInt("INGEST_TIMEOUT_MINUTES", 45, 1, 6 * 60),
});

const nowSec = () => Math.floor(Date.now() / 1000);

function state(): SchedulerState {
  if (!g.__underlyIngest) g.__underlyIngest = { bootTs: nowSec(), tick: null, running: null };
  return g.__underlyIngest;
}

/** Which pass, if any, the stamps say is owed right now. */
function due(now: number): IngestMode | null {
  const c = config();
  const lastRun = getMetaInt("last_ingest_ts");
  const lastFull = getMetaInt("last_full_ingest_ts");
  const lastAttempt = getMetaInt("last_ingest_attempt_ts");
  // A failing run must not be retried every minute: the gap is measured from
  // the last attempt as well as the last success.
  const since = (ts: number | null) => (ts == null ? Infinity : now - ts);
  const gapOk = since(lastAttempt) >= c.fastMinutes * 60;

  const hour = new Date(now * 1000).getUTCHours();
  const fullElapsed = since(lastFull);
  // Once a day in the configured hour; never before 20h have passed (so the
  // hour-long window runs it once, not sixty times); and if the window was
  // missed — the server was down, or a run overran — catch up after 30h
  // rather than waiting for the next window.
  const fullDue =
    lastFull == null ||
    (fullElapsed >= 20 * 3600 && hour === c.fullHourUtc) ||
    fullElapsed >= 30 * 3600;
  if (fullDue && gapOk) return "full";
  if (since(lastRun) >= c.fastMinutes * 60 && gapOk) return "fast";
  return null;
}

function log(line: string) {
  console.log(`[ingest] ${line}`);
}

/**
 * Start one run. Returns why it did not, when it did not: another run is in
 * flight in this process, or the database lease is held elsewhere.
 */
function run(mode: IngestMode): { started: true } | { started: false; reason: "running" | "locked" } {
  const s = state();
  if (s.running) return { started: false, reason: "running" };
  const c = config();
  const now = nowSec();
  // The lease outlives the timeout by a margin, so a run killed at the limit
  // has released it before anyone else could think it free.
  if (!tryLock(LOCK_KEY, now + (c.timeoutMinutes + 5) * 60, now)) {
    return { started: false, reason: "locked" };
  }
  setMeta("last_ingest_attempt_ts", now);

  const root = process.cwd();
  const args = [
    path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(root, "scripts", "ingest.ts"),
    ...(mode === "fast" ? ["--fast"] : []),
  ];
  log(`starting ${mode} run`);
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const relay = (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) if (line.trim()) log(line);
  };
  child.stdout?.on("data", relay);
  child.stderr?.on("data", relay);

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    log(`${mode} run exceeded ${c.timeoutMinutes}m — terminating`);
    child.kill("SIGTERM");
    setTimeout(() => { if (child.exitCode == null) child.kill("SIGKILL"); }, 10_000).unref();
  }, c.timeoutMinutes * 60_000);

  child.on("error", (err) => log(`could not start: ${err.message}`));
  child.on("exit", (code, signal) => {
    clearTimeout(timer);
    const took = nowSec() - now;
    // The script stamps its own success (so shell runs count too); this side
    // records how a run ended when the script never got to say.
    const status = timedOut ? "timeout" : code === 0 ? "ok" : `failed:${code ?? signal ?? "?"}`;
    setMeta("last_ingest_status", status);
    releaseLock(LOCK_KEY);
    s.running = null;
    log(`${mode} run ${status} after ${took}s`);
  });

  s.running = { mode, startedTs: now, child, timer };
  return { started: true };
}

function tick() {
  const s = state();
  const c = config();
  if (s.running) return;
  if (nowSec() - s.bootTs < c.bootDelayMinutes * 60) return;
  try {
    const mode = due(nowSec());
    if (mode) run(mode);
  } catch (err) {
    log(`tick failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Called once from `instrumentation.ts` when the server starts. */
export function startScheduler(): void {
  const s = state();
  if (s.tick) return;
  const c = config();
  if (!c.enabled) {
    log("schedule off (INGEST_SCHEDULE=off); manual runs only");
    return;
  }
  // `unref` so a timer alone never keeps a stopping server alive.
  s.tick = setInterval(tick, TICK_MS);
  s.tick.unref();
  log(
    `scheduled: fast every ${c.fastMinutes}m, full daily at ${String(c.fullHourUtc).padStart(2, "0")}:00 UTC, ` +
      `first check in ${c.bootDelayMinutes}m`,
  );
}

export interface IngestStatus {
  running: { mode: IngestMode; startedTs: number } | null;
  lastRunTs: number | null;
  lastFullRunTs: number | null;
  lastStatus: string | null;
  lastMode: string | null;
  lastDurationS: number | null;
  /** When the next fast pass is owed, from the stamps; null when unscheduled. */
  nextFastDueTs: number | null;
  schedule: { enabled: boolean; fastMinutes: number; fullHourUtc: number };
}

export function ingestStatus(): IngestStatus {
  const s = state();
  const c = config();
  const lastRunTs = getMetaInt("last_ingest_ts");
  return {
    running: s.running ? { mode: s.running.mode, startedTs: s.running.startedTs } : null,
    lastRunTs,
    lastFullRunTs: getMetaInt("last_full_ingest_ts"),
    lastStatus: getMeta("last_ingest_status"),
    lastMode: getMeta("last_ingest_mode"),
    lastDurationS: getMetaInt("last_ingest_duration_s"),
    nextFastDueTs: c.enabled && s.tick ? (lastRunTs ?? s.bootTs) + c.fastMinutes * 60 : null,
    schedule: { enabled: c.enabled, fastMinutes: c.fastMinutes, fullHourUtc: c.fullHourUtc },
  };
}

/** A run now, from the admin desk. Same lease and same child as a scheduled one. */
export function triggerIngest(mode: IngestMode) {
  return run(mode);
}
