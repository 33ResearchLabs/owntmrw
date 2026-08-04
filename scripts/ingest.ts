/**
 * OwnTmrw ingestion engine.
 *
 * Pulls everything from public sources:
 *   1. Discover projects (MetaDAO launchpad / on-chain / curated registry)
 *   2. Market data per token (DexScreener best pair, GeckoTerminal OHLCV)
 *   3. Holder intelligence (Solana RPC top accounts + GeckoTerminal holder count)
 *   4. Development intelligence (GitHub org stats + releases)
 *   5. Event timeline + automatic observations
 *
 * Usage: npm run ingest            (full run)
 *        npm run ingest -- --fast  (skip candles/holders, prices only)
 */
import { db, upsertProject, allProjects } from "../src/lib/db";
import { discoverProjects, fetchSupply } from "../src/lib/sources/metadao";
import { fetchMarketHistory } from "../src/lib/sources/marketdata";
import { bestPairForMint, socialsFromPair } from "../src/lib/sources/dexscreener";
import { dailyOHLCV, topPoolForToken, tokenInfo, poolsForToken } from "../src/lib/sources/geckoterminal";
import { largestTokenAccounts, tokenAccountOwner, tokenSupply } from "../src/lib/sources/rpc";
import { orgStats, githubOwner } from "../src/lib/sources/github";
import { jupTokenSearch, jupPrices } from "../src/lib/sources/jupiter";
import { raiseFor, refundRate } from "../src/lib/sources/raises";
import { sleep } from "../src/lib/sources/http";
import { discoverFeed, fetchFeed, githubFeeds } from "../src/lib/sources/feeds";
import { KNOWN_WALLETS } from "../src/lib/sources/wallets";
import { capFromSupply, isUndistributed } from "../src/lib/quote";

const FAST = process.argv.includes("--fast");
const now = () => Math.floor(Date.now() / 1000);
const fmtM = (n: number | null) =>
  n == null ? "?" : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.round(n).toLocaleString();

async function main() {
  const d = db();
  console.log("── OwnTmrw ingest ──");

  // 1. discovery
  console.log("[1/5] discovering projects…");
  const discovered = await discoverProjects();
  for (const p of discovered) {
    const id = upsertProject(p);
    if (p.treasury_value_usd != null) {
      d.prepare(
        "INSERT OR REPLACE INTO treasury_snapshots (project_id, ts, value_usd) VALUES (?,?,?)"
      ).run(id, now(), p.treasury_value_usd);
    }
  }
  console.log(`      ${discovered.length} projects from discovery, ${allProjects().length} total in db`);

  const projects = allProjects();

  // 1b. authoritative supply + allocation (drives correct market cap)
  console.log("[1b] supply & allocation (MetaDAO)…");
  for (const p of projects) {
    if (!p.mint) continue;
    let s = await fetchSupply(p.mint);
    if (!s) {
      // one retry — the endpoint rate-limits aggressively
      await sleep(4000);
      s = await fetchSupply(p.mint);
    }
    if (!s) { console.log(`      ${p.name}: supply unavailable`); continue; }
    upsertProject({
      slug: p.slug, name: p.name,
      total_supply: s.totalSupply ?? undefined,
      circulating_supply: s.circulatingSupply ?? undefined,
      team_package: s.teamPackage ?? undefined,
      liquidity_tokens: s.liquidity ?? undefined,
      launch_address: s.launchAddress ?? undefined,
      treasury_address: p.treasury_address ?? s.daoAddress ?? undefined,
    });
    const lockedPct = s.teamPackage && s.totalSupply ? (s.teamPackage / s.totalSupply) * 100 : 0;
    console.log(
      `      ${p.name}: circ ${fmtM(s.circulatingSupply)} / total ${fmtM(s.totalSupply)}` +
      (lockedPct ? ` (${lockedPct.toFixed(0)}% locked in team package)` : "")
    );
  }

  // 1c. raise intelligence (published ICO results, each with a citation)
  console.log("[1c] raise intelligence…");
  let raiseCount = 0;
  for (const p of allProjects()) {
    const r = raiseFor(p.symbol);
    if (!r) continue;
    const closedTs = r.closed ? Math.floor(Date.parse(`${r.closed}T00:00:00Z`) / 1000) : undefined;
    upsertProject({
      slug: p.slug, name: p.name,
      raise_amount_usd: r.amountUnknown || r.noRaise ? undefined : r.amountUsd,
      raise_goal_usd: r.goalUsd,
      raise_committed_usd: r.committedUsd,
      raise_price: r.price,
      raise_fdv_usd: r.fdvUsd,
      raise_contributors: r.contributors,
      raise_end_ts: closedTs,
      raise_note: r.note,
      raise_source_url: r.sourceUrl,
      raise_track: r.track,
      status: r.failed ? "failed" : undefined,
    });
    raiseCount++;
    if (r.noRaise) { console.log(`      ${p.name}: no raise (${r.note?.slice(0, 40)}…)`); continue; }
    const over = refundRate(r);
    console.log(
      `      ${p.name}: ${r.amountUsd != null && !r.amountUnknown ? "$" + r.amountUsd.toLocaleString() : "amount unpublished"}` +
      (r.price ? ` @ $${r.price}/token` : "") +
      (over != null ? ` · ${over.toFixed(0)}% refunded` : "")
    );
  }
  console.log(`      ${raiseCount} projects with raise data`);

  // 2. market data
  console.log("[2/5] market data…");
  for (const p of allProjects()) {
    if (!p.mint) continue;
    const pair = await bestPairForMint(p.mint);
    if (pair) {
      const s = socialsFromPair(pair);
      upsertProject({
        slug: p.slug, name: p.name,
        symbol: p.symbol ?? pair.baseToken.symbol,
        pool_address: p.pool_address ?? pair.pairAddress,
        image_url: p.image_url ?? s.image,
        website: p.website ?? s.website,
        twitter: p.twitter ?? s.twitter,
        telegram: p.telegram ?? s.telegram,
        discord: p.discord ?? s.discord,
        launch_ts: p.launch_ts ?? (pair.pairCreatedAt ? Math.floor(pair.pairCreatedAt / 1000) : undefined),
      });
      const price = Number(pair.priceUsd) || null;
      const mcap = capFromSupply(price, p.circulating_supply, pair.marketCap);
      const fdv = capFromSupply(price, p.total_supply, pair.fdv);
      d.prepare(`
        INSERT OR REPLACE INTO price_snapshots
        (project_id, ts, price_usd, mcap, fdv, liquidity_usd, vol24h, change_1h, change_24h)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(
        p.id, now(), price, mcap, fdv,
        pair.liquidity?.usd ?? null, pair.volume?.h24 ?? null,
        pair.priceChange?.h1 ?? null, pair.priceChange?.h24 ?? null
      );
      const src = p.circulating_supply ? "metadao supply" : "dexscreener";
      console.log(`      ${p.name}: $${pair.priceUsd} mcap=${mcap ? Math.round(mcap).toLocaleString() : "?"} (${src})`);
    } else {
      // tokens that trade only on MetaDAO's own AMM: fall back to Jupiter
      const [prices, toks] = [await jupPrices([p.mint]), await jupTokenSearch(p.mint)];
      const tok = toks.find((t) => t.id === p.mint);
      const price = prices[p.mint] ?? null;
      if (price != null || tok) {
        // Jupiter's own mcap is as meaningless as ours for a token that has not
        // distributed yet, so report none instead of a figure like "$768".
        const mcap = isUndistributed(p.circulating_supply)
          ? null
          : capFromSupply(price, p.circulating_supply, tok?.mcap);
        const fdv = capFromSupply(price, p.total_supply, tok?.fdv);
        d.prepare(`
          INSERT OR REPLACE INTO price_snapshots
          (project_id, ts, price_usd, mcap, fdv, liquidity_usd, vol24h, change_1h, change_24h)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(p.id, now(), price, mcap, fdv, tok?.liquidity ?? null, null, null, null);
        console.log(`      ${p.name}: $${price ?? "?"} (jupiter fallback)`);
      } else {
        console.log(`      ${p.name}: no market data found`);
      }
    }
  }

  if (!FAST) {
    // 3. candles + token info
    console.log("[3/5] price history + token info (GeckoTerminal)…");
    for (const p of allProjects()) {
      if (!p.mint) continue;
      const info = await tokenInfo(p.mint);
      if (info) {
        upsertProject({
          slug: p.slug, name: p.name,
          description: p.description ?? info.description,
          image_url: p.image_url ?? info.image,
          twitter: p.twitter ?? info.twitter,
          telegram: p.telegram ?? info.telegram,
          discord: p.discord ?? info.discord,
          website: p.website ?? info.websites?.[0],
        });
        if (info.holders != null) {
          d.prepare(
            "INSERT OR REPLACE INTO holder_snapshots (project_id, ts, holder_count) VALUES (?,?,?)"
          ).run(p.id, now(), info.holders);
        }
      }
      // Merge every pool GeckoTerminal knows for this mint. MetaDAO re-created
      // its AMM pools in the June 2026 migration, so the live pool holds only
      // ~51 days while the retired pools carry the earlier history — and all of
      // it is real OHLC, unlike the single-price ETL backfill.
      const pools = await poolsForToken(p.mint);
      const ranked = [
        ...(p.pool_address ? [{ address: p.pool_address, createdAt: 0, liquidity: Infinity }] : []),
        ...pools.filter((x) => x.address !== p.pool_address && x.liquidity >= 1),
      ].slice(0, 5);
      if (!ranked.length) continue;
      if (!p.pool_address) upsertProject({ slug: p.slug, name: p.name, pool_address: ranked[0].address });

      const byDay = new Map<number, { ts: number; o: number; h: number; l: number; c: number; v: number }>();
      for (const pool of ranked) {
        for (const c of await dailyOHLCV(pool.address)) {
          const prev = byDay.get(c.ts);
          // Deepest pool wins a contested day; a real range beats a flat one.
          if (!prev || (prev.h === prev.l && c.h !== c.l)) byDay.set(c.ts, c);
        }
      }
      const candles = [...byDay.values()].sort((a, b) => a.ts - b.ts);
      const ins = d.prepare("INSERT OR REPLACE INTO candles (project_id, ts, o,h,l,c,v) VALUES (?,?,?,?,?,?,?)");
      const tx = d.transaction(() => {
        for (const c of candles) ins.run(p.id, c.ts, c.o, c.h, c.l, c.c, c.v);
      });
      tx();
      const real = candles.filter((c) => c.h !== c.l).length;
      console.log(
        `      ${p.name}: ${candles.length} candles from ${ranked.length} pool(s), ${real} with real range`
      );
    }

    // 3b. backfill history from MetaDAO's own ETL. GeckoTerminal's free tier
    // holds nothing before the June 2026 AMM migration, so without this the
    // chart starts mid-life instead of at the raise.
    console.log("[3b] history backfill (MetaDAO market-data)…");
    const history = await fetchMarketHistory("2024-01-01");
    if (history.size === 0) {
      console.log("      market-data unavailable — keeping GeckoTerminal range only");
    } else {
      const ins = d.prepare(
        "INSERT OR IGNORE INTO candles (project_id, ts, o,h,l,c,v) VALUES (?,?,?,?,?,?,?)"
      );
      for (const p of allProjects()) {
        if (!p.mint) continue;
        const pts = history.get(p.mint);
        if (!pts?.length) continue;
        // INSERT OR IGNORE keeps real OHLC where we already have it; these
        // daily points only have one price, so o/h/l/c all take it.
        const tx = d.transaction(() => {
          for (const pt of pts) ins.run(p.id, pt.ts, pt.price, pt.price, pt.price, pt.price, pt.volume);
        });
        tx();
        const span = d.prepare(
          "SELECT COUNT(*) n, MIN(ts) lo FROM candles WHERE project_id = ?"
        ).get(p.id) as { n: number; lo: number };
        console.log(
          `      ${p.name}: ${span.n} days from ${new Date(span.lo * 1000).toISOString().slice(0, 10)}`
        );
      }
    }

    // 4. holders — Jupiter holder counts (reliable, keyless) + RPC top accounts (best-effort)
    console.log("[4/5] holder intelligence…");
    for (const p of allProjects()) {
      if (!p.mint) continue;
      const jup = (await jupTokenSearch(p.mint)).find((t) => t.id === p.mint);
      if (jup?.holderCount != null) {
        d.prepare(
          "INSERT OR REPLACE INTO holder_snapshots (project_id, ts, holder_count) VALUES (?,?,?)"
        ).run(p.id, now(), jup.holderCount);
        console.log(`      ${p.name}: ${jup.holderCount} holders (jupiter)`);
      }
      const supply = await tokenSupply(p.mint);
      const largest = await largestTokenAccounts(p.mint);
      if (!largest.length) continue;
      const insert = d.prepare(`
        INSERT OR REPLACE INTO top_holders (project_id, rank, address, owner, amount, pct, label, ts)
        VALUES (?,?,?,?,?,?,?,?)
      `);
      let rank = 1;
      let top10 = 0;
      for (const acc of largest.slice(0, 20)) {
        const owner = await tokenAccountOwner(acc.address);
        const pct = supply ? (acc.uiAmount / supply) * 100 : null;
        if (rank <= 10 && pct) top10 += pct;
        const known = owner ? KNOWN_WALLETS[owner] : null;
        const label =
          known?.label ??
          (owner && owner === p.treasury_address ? "DAO Treasury" : null) ??
          (acc.address === p.pool_address || owner === p.pool_address ? "Liquidity Pool" : null) ??
          (owner && owner === p.launch_address ? "Launch Vault" : null);
        insert.run(p.id, rank, acc.address, owner, acc.uiAmount, pct, label, now());
        rank++;
      }
      const prev = d.prepare(
        "SELECT holder_count FROM holder_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 1"
      ).get(p.id) as { holder_count: number | null } | undefined;
      d.prepare(`
        INSERT OR REPLACE INTO holder_snapshots (project_id, ts, holder_count, top10_pct, supply)
        VALUES (?,?,?,?,?)
      `).run(p.id, now(), prev?.holder_count ?? null, top10 || null, supply);
      console.log(`      ${p.name}: top10 = ${top10.toFixed(1)}% of supply`);
    }
  }

  // 5. github + events + observations
  console.log("[5/5] github, events, observations…");
  for (const p of allProjects()) {
    if (p.github) {
      const owner = githubOwner(p.github);
      if (owner) {
        const gs = await orgStats(owner);
        if (gs) {
          d.prepare(`
            INSERT OR REPLACE INTO github_snapshots (project_id, ts, stars, forks, repos, last_push_ts)
            VALUES (?,?,?,?,?,?)
          `).run(p.id, now(), gs.stars, gs.forks, gs.repos, gs.lastPushTs || null);
          const insEv = d.prepare(`
            INSERT OR IGNORE INTO events (project_id, ts, type, title, detail, url) VALUES (?,?,?,?,?,?)
          `);
          // Releases are indexed once, as github_release. The Atom feeds reach
          // further back than the REST call, so both feed the same event type
          // and dedupe on (ts, type, title) via the table's unique index.
          for (const r of gs.releases) insEv.run(p.id, r.ts, "github_release", `${r.repo} ${r.tag}`, r.name, r.url);

          // The REST and Atom sources timestamp the same release seconds apart,
          // so the table's (ts,type,title) index won't catch it — dedupe on the day.
          const seen = d.prepare(
            "SELECT title, ts FROM events WHERE project_id = ? AND type = 'github_release'"
          ).all(p.id) as { title: string; ts: number }[];
          let feedCount = 0;
          for (const repo of gs.topRepos.slice(0, 3)) {
            for (const it of await githubFeeds(owner, repo.name)) {
              const title = `${repo.name} ${it.title}`;
              const dup = seen.some(
                (s) => s.title === title && Math.abs(s.ts - it.ts) < 172800
              );
              if (dup) continue;
              insEv.run(p.id, it.ts, "github_release", title, "GitHub release", it.url);
              seen.push({ title, ts: it.ts });
              feedCount++;
            }
          }
          console.log(`      ${p.name}: ★${gs.stars} across ${gs.repos} repos, ${feedCount} feed items`);
        }
      }
    }
    // news from the project's own public feed
    if (p.website && !FAST) {
      const feed = await discoverFeed(p.website);
      if (feed) {
        const items = await fetchFeed(feed);
        const insNews = d.prepare(
          "INSERT OR IGNORE INTO events (project_id, ts, type, title, detail, url) VALUES (?,?,?,?,?,?)"
        );
        for (const it of items) insNews.run(p.id, it.ts, "news", it.title, null, it.url);
        if (items.length) console.log(`      ${p.name}: ${items.length} feed items`);
      }
    }

    // structural events
    const insEv = d.prepare("INSERT OR IGNORE INTO events (project_id, ts, type, title, detail, url) VALUES (?,?,?,?,?,?)");
    if (p.raise_end_ts) insEv.run(p.id, p.raise_end_ts, "raise_closed", "Raise closed", p.raise_amount_usd ? `$${Math.round(p.raise_amount_usd).toLocaleString()} raised` : null, null);
    if (p.launch_ts) insEv.run(p.id, p.launch_ts, "token_launch", "Token trading began", null, null);
  }

  generateObservations();
  console.log("done.");
}

/** Deterministic analytics-driven observations ("AI signals"). */
function generateObservations() {
  const d = db();
  const ts = now();
  const ins = d.prepare("INSERT INTO observations (project_id, ts, kind, text) VALUES (?,?,?,?)");
  // wipe today's regenerated observations to avoid dupes on re-run
  d.prepare("DELETE FROM observations WHERE ts > ?").run(ts - 3600);

  for (const p of allProjects()) {
    const snaps = d.prepare(
      "SELECT ts, price_usd, vol24h, liquidity_usd FROM price_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 30"
    ).all(p.id) as { ts: number; price_usd: number | null; vol24h: number | null; liquidity_usd: number | null }[];
    const candles = d.prepare("SELECT ts,c,h,v FROM candles WHERE project_id = ? ORDER BY ts").all(p.id) as { ts: number; c: number; h: number; v: number }[];
    const holders = d.prepare("SELECT ts, holder_count, top10_pct FROM holder_snapshots WHERE project_id = ? ORDER BY ts").all(p.id) as { ts: number; holder_count: number | null; top10_pct: number | null }[];

    if (candles.length >= 8) {
      const last7 = candles.slice(-7);
      const prev7 = candles.slice(-14, -7);
      const v7 = last7.reduce((s, c) => s + c.v, 0);
      const pv7 = prev7.reduce((s, c) => s + c.v, 0);
      if (pv7 > 0 && v7 / pv7 > 1.5) {
        ins.run(p.id, ts, "momentum", `Weekly volume up ${Math.round((v7 / pv7 - 1) * 100)}% vs the prior week.`);
      }
      const ath = Math.max(...candles.map((c) => c.h));
      const last = candles[candles.length - 1].c;
      if (last >= ath * 0.95) ins.run(p.id, ts, "price", "Trading within 5% of all-time high.");
      const d30 = candles.slice(-30);
      if (d30.length >= 30) {
        const chg = (last - d30[0].c) / d30[0].c;
        if (Math.abs(chg) > 0.4) {
          ins.run(p.id, ts, "price", `Price ${chg > 0 ? "up" : "down"} ${Math.abs(Math.round(chg * 100))}% over the last 30 days.`);
        }
      }
    }
    if (holders.length >= 2) {
      const a = holders[0], b = holders[holders.length - 1];
      if (a.holder_count && b.holder_count && a.ts < b.ts - 86400) {
        const chg = (b.holder_count - a.holder_count) / a.holder_count;
        if (Math.abs(chg) > 0.05) {
          ins.run(p.id, ts, "holders", `Holder count ${chg > 0 ? "grew" : "declined"} ${Math.abs(Math.round(chg * 100))}% since tracking began.`);
        }
      }
      const t10 = b.top10_pct;
      if (t10 != null && t10 > 60) ins.run(p.id, ts, "risk", `High concentration: top 10 accounts hold ${t10.toFixed(0)}% of supply.`);
    }
    const snap = snaps[0];
    if (snap?.liquidity_usd != null && snap.vol24h != null && snap.liquidity_usd > 0 && snap.vol24h / snap.liquidity_usd > 2) {
      ins.run(p.id, ts, "momentum", "24h volume exceeds 2× pool liquidity — unusually active trading.");
    }
    const gh = d.prepare("SELECT last_push_ts FROM github_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 1").get(p.id) as { last_push_ts: number | null } | undefined;
    if (gh?.last_push_ts && ts - gh.last_push_ts < 3 * 86400) {
      ins.run(p.id, ts, "github", "Active development: code pushed within the last 3 days.");
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
