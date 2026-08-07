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
import { db, upsertProject, allProjects, recordTreasurySnapshot, recordStructuralEvent } from "../src/lib/db";
import { discoverProjects, fetchSupply } from "../src/lib/sources/metadao";
import { fetchMarketHistory } from "../src/lib/sources/marketdata";
import { bestPairForMint, socialsFromPair } from "../src/lib/sources/dexscreener";
import { dailyOHLCV, topPoolForToken, tokenInfo, poolsForToken, poolListings } from "../src/lib/sources/geckoterminal";
import { largestTokenAccounts, tokenAccountOwner, tokenSupply, usdcBalance } from "../src/lib/sources/rpc";
import { orgStats, githubOwner } from "../src/lib/sources/github";
import { coinIdByContract, coinListings } from "../src/lib/sources/coingecko";
import { fetchWire, matchProject, searchNews, filterForProject } from "../src/lib/sources/newswire";
import { tokenReport } from "../src/lib/sources/rugcheck";
import { jupTokenSearch, jupPrices, jupVolume } from "../src/lib/sources/jupiter";
import { raiseFor, refundRate } from "../src/lib/sources/raises";
import { profileFor, PROFILE_FIELDS } from "../src/lib/sources/profiles";
import { sleep } from "../src/lib/sources/http";
import { discoverFeed, fetchFeed, githubFeeds } from "../src/lib/sources/feeds";
import { KNOWN_WALLETS } from "../src/lib/sources/wallets";
import { capFromSupply, marketCap } from "../src/lib/quote";

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
  let treasuryMoves = 0;
  for (const p of discovered) {
    const id = upsertProject(p);
    if (p.treasury_value_usd != null && recordTreasurySnapshot(id, now(), p.treasury_value_usd)) {
      treasuryMoves++;
    }
  }
  console.log(
    `      ${discovered.length} projects from discovery, ${allProjects().length} total in db` +
    `, ${treasuryMoves} treasury balance${treasuryMoves === 1 ? "" : "s"} moved`
  );

  // 1a. treasuries the tickers feed does not cover. It carries
  // `treasury_usdc_aum` only for the tokens it lists, so a project missing from
  // it had no treasury figure at all — Ranger and ZKLSOL read as unknown when
  // both vaults are verifiably empty. The vault is public, so read it: an
  // unlisted project is not an unknowable one. Checked against a project the
  // feed does list, the two agree exactly (ORDR: $105,000 either way).
  // Keyed on what discovery actually reported, not on whether a row already
  // exists: gating on the latter would read each vault once and then never
  // refresh it, freezing the balance at whatever it was the first time.
  const fedByTickers = new Set(
    discovered.filter((p) => p.treasury_value_usd != null).map((p) => p.slug)
  );
  let onchainTreasuries = 0;
  for (const p of allProjects()) {
    if (!p.treasury_address || fedByTickers.has(p.slug)) continue;
    const usdc = await usdcBalance(p.treasury_address);
    if (usdc == null) { console.log(`      ${p.name}: treasury vault unreadable`); continue; }
    recordTreasurySnapshot(p.id, now(), usdc);
    onchainTreasuries++;
    console.log(`      ${p.name}: treasury $${usdc.toLocaleString()} (on-chain)`);
  }
  if (onchainTreasuries) console.log(`      ${onchainTreasuries} treasury balance(s) read on-chain`);

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

    // A zero circulating supply withholds market cap outright (see quote.ts),
    // so a wrong zero blanks the column rather than erring loudly. MetaDAO
    // reports one for some v0.7 launches whose own allocation block, in the
    // same response, shows millions of tokens claimed — Ranger reads
    // "circulatingSupply": "0" beside 5.3M claimed and 59,439 live on Jupiter.
    // Only a zero is second-guessed: a figure MetaDAO states is authoritative,
    // and a genuinely undistributed token still reports no cap because Jupiter
    // agrees it has none.
    let circulating = s.circulatingSupply;
    if (circulating != null && circulating <= 0) {
      const tok = (await jupTokenSearch(p.mint)).find((t) => t.id === p.mint);
      if (tok?.circSupply != null && tok.circSupply > 0) {
        console.log(
          `      ${p.name}: MetaDAO reports 0 circulating, Jupiter ${fmtM(tok.circSupply)} — using Jupiter`
        );
        circulating = tok.circSupply;
      }
    }

    upsertProject({
      slug: p.slug, name: p.name,
      total_supply: s.totalSupply ?? undefined,
      circulating_supply: circulating ?? undefined,
      team_package: s.teamPackage ?? undefined,
      liquidity_tokens: s.liquidity ?? undefined,
      launch_address: s.launchAddress ?? undefined,
      // The DAO account in its own right, not just as a treasury stand-in. It
      // was read all along but only ever consumed as the fallback below, which
      // left dao_address empty for every project while the value sat in hand.
      dao_address: s.daoAddress ?? undefined,
      treasury_address: p.treasury_address ?? s.daoAddress ?? undefined,
      team_address: s.teamAddress ?? undefined,
      amm_vault_address: s.ammVaultAddress ?? undefined,
      lp_pool_address: s.lpPoolAddress ?? undefined,
    });
    const lockedPct = s.teamPackage && s.totalSupply ? (s.teamPackage / s.totalSupply) * 100 : 0;
    console.log(
      `      ${p.name}: circ ${fmtM(circulating)} / total ${fmtM(s.totalSupply)}` +
      (lockedPct ? ` (${lockedPct.toFixed(0)}% locked in team package)` : "")
    );
  }

  // 1c. raise intelligence (published ICO results, each with a citation)
  console.log("[1c] raise intelligence…");
  let raiseCount = 0;
  for (const p of allProjects()) {
    const r = raiseFor(p.symbol);
    // RAISES is keyed by symbol, so a token discovery finds before anyone
    // records its raise matches nothing and silently keeps both raise columns
    // blank. Saying so is the difference between "this project never raised"
    // and "nobody has written its raise down yet" — ORDR sat in the second
    // state looking like the first.
    if (!r) {
      console.log(`      ${p.name} (${p.symbol ?? "?"}): no raise record — add one to RAISES`);
      continue;
    }
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

  // 1d. curated identity + links. Runs before the market step on purpose: that
  // step fills socials from DexScreener with `p.website ?? s.website`, so
  // anything written here is already in place and wins over an aggregator
  // submission that may be stale or missing. Fields absent from a record stay
  // absent — upsertProject skips undefined, so this never blanks a column the
  // automated path filled correctly.
  console.log("[1d] curated profiles…");
  let profileFields = 0;
  for (const p of allProjects()) {
    const prof = profileFor(p.slug);
    if (!prof) continue;
    const written = PROFILE_FIELDS.filter((k) => prof[k] != null);
    if (!written.length) continue;
    upsertProject({
      slug: p.slug, name: p.name,
      ...Object.fromEntries(written.map((k) => [k, prof[k]])),
    });
    profileFields += written.length;
    console.log(`      ${p.name}: ${written.join(", ")}`);
  }
  console.log(`      ${profileFields} curated field(s) applied`);

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
      const mcap = marketCap(price, p.circulating_supply, pair.marketCap);
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
        const mcap = marketCap(price, p.circulating_supply, tok?.mcap);
        const fdv = capFromSupply(price, p.total_supply, tok?.fdv);
        // Jupiter's rolling windows carry depth, volume and price change, so a
        // token that only trades on MetaDAO's AMM keeps a full row instead of
        // a price beside four nulls. Volume is buy + sell to match how
        // DexScreener quotes h24, keeping the two comparable in one column.
        d.prepare(`
          INSERT OR REPLACE INTO price_snapshots
          (project_id, ts, price_usd, mcap, fdv, liquidity_usd, vol24h, change_1h, change_24h)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(
          p.id, now(), price, mcap, fdv, tok?.liquidity ?? null,
          jupVolume(tok?.stats24h), tok?.stats1h?.priceChange ?? null,
          tok?.stats24h?.priceChange ?? null
        );
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

      // Tokens whose first pool predates DexScreener's record carry no
      // pairCreatedAt, so they had no launch date at all. The first candle is
      // direct evidence of the day trading started — only used as a fallback,
      // never over a date a source actually reported.
      if (!p.launch_ts && candles.length) {
        upsertProject({ slug: p.slug, name: p.name, launch_ts: candles[0].ts });
      }

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
      // GeckoTerminal carries concentration beside its own holder count, which
      // is the only keyless route to it — getTokenLargestAccounts, below, is
      // throttled on the public RPC, and top-10 used to vanish with it.
      const gt = await tokenInfo(p.mint);
      const holderCount = jup?.holderCount ?? gt?.holders ?? null;
      const supply = await tokenSupply(p.mint);
      const largest = await largestTokenAccounts(p.mint);

      // One row per project per run. The count and the concentration used to be
      // written by two separate statements, each calling now() — a second's
      // drift between them split a single reading across two snapshots, one
      // holding the count and the other the concentration.
      const writeSnapshot = (top10: number | null) => {
        d.prepare(`
          INSERT OR REPLACE INTO holder_snapshots (project_id, ts, holder_count, top10_pct, supply)
          VALUES (?,?,?,?,?)
        `).run(p.id, now(), holderCount, top10, supply);
      };

      if (!largest.length) {
        // No RPC list, so no per-wallet table — but the aggregate still lands.
        writeSnapshot(gt?.top10Pct ?? null);
        console.log(
          `      ${p.name}: ${holderCount ?? "?"} holders` +
          (gt?.top10Pct != null ? `, top10 ${gt.top10Pct.toFixed(1)}% (geckoterminal)` : "") +
          " — RPC holder list unavailable"
        );
        continue;
      }
      const insert = d.prepare(`
        INSERT OR REPLACE INTO top_holders (project_id, rank, address, owner, amount, pct, label, ts)
        VALUES (?,?,?,?,?,?,?,?)
      `);
      let rank = 1;
      let rpcTop10 = 0;
      for (const acc of largest.slice(0, 20)) {
        const owner = await tokenAccountOwner(acc.address);
        const pct = supply ? (acc.uiAmount / supply) * 100 : null;
        if (rank <= 10 && pct) rpcTop10 += pct;
        const known = owner ? KNOWN_WALLETS[owner] : null;
        // Match on the token account as well as its owner: the allocation
        // vaults are token accounts, so an owner-only check misses them.
        const isRole = (addr: string | null) =>
          !!addr && (acc.address === addr || owner === addr);
        const label =
          known?.label ??
          (isRole(p.treasury_address) ? "DAO Treasury" : null) ??
          (isRole(p.team_address) ? "Team Package" : null) ??
          (isRole(p.amm_vault_address) ? "Futarchy AMM" : null) ??
          (isRole(p.lp_pool_address) ? "Meteora LP" : null) ??
          (isRole(p.pool_address) ? "Liquidity Pool" : null) ??
          (isRole(p.launch_address) ? "Launch Vault" : null);
        insert.run(p.id, rank, acc.address, owner, acc.uiAmount, pct, label, now());
        rank++;
      }
      // The RPC list is per token account and computed against our own supply
      // figure, so it is preferred; GeckoTerminal covers the run where it fails.
      const top10 = rpcTop10 > 0 ? rpcTop10 : gt?.top10Pct ?? null;
      writeSnapshot(top10);
      console.log(
        `      ${p.name}: ${holderCount ?? "?"} holders` +
        (top10 != null ? `, top10 ${top10.toFixed(1)}%` : "") +
        ` (${rpcTop10 > 0 ? "rpc" : "geckoterminal"})`
      );
    }
  }

  // 4b. exchange listings (CoinGecko free tier; its /news endpoint is PRO-only)
  if (!FAST) {
    console.log("[4b] exchange listings…");
    for (const p of allProjects()) {
      if (!p.mint) continue;
      // CoinGecko is the only source of centralised venues, but only covers
      // tokens it has listed. GeckoTerminal indexes every pool on the chain but
      // is on-chain by definition. Neither is a superset, so both are merged.
      const { id: cgId, failed } = await coinIdByContract(p.mint);
      // A broken lookup must not be read as "delisted" — leave the row alone.
      if (failed) { console.log(`      ${p.name}: lookup failed, keeping stored venues`); continue; }

      const cg = cgId
        ? (await coinListings(cgId, { mint: p.mint, symbol: p.symbol })) ?? []
        : [];
      const pools = (await poolListings(p.mint)) ?? [];

      const byKey = new Map<string, {
        exchange: string; pair: string; volumeUsd: number | null;
        trust: string | null; url: string | null; isDex: boolean;
      }>();
      for (const l of cg) {
        byKey.set(`${l.exchange.toLowerCase()}|${l.pair.toLowerCase()}`, {
          exchange: l.exchange, pair: l.pair, volumeUsd: l.volumeUsd,
          trust: l.trust, url: l.url, isDex: l.isDex,
        });
      }
      for (const l of pools) {
        // CoinGecko's entry wins on a collision: it carries the CEX/DEX call.
        const key = `${l.exchange.toLowerCase()}|${l.pair.toLowerCase()}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          exchange: l.exchange, pair: l.pair, volumeUsd: l.volumeUsd,
          trust: null, url: l.url, isDex: true,
        });
      }
      const rows = [...byKey.values()].sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0));
      if (!rows.length) continue;

      // Replaced, not merged: a venue that stopped trading must drop off.
      d.prepare("DELETE FROM exchange_listings WHERE project_id = ?").run(p.id);
      const ins = d.prepare(`
        INSERT OR REPLACE INTO exchange_listings
          (project_id, exchange, pair, volume_usd, trust, url, is_dex, ts)
        VALUES (?,?,?,?,?,?,?,?)
      `);
      for (const l of rows) {
        ins.run(p.id, l.exchange, l.pair, l.volumeUsd, l.trust, l.url, l.isDex ? 1 : 0, now());
      }
      const cex = rows.filter((l) => !l.isDex).length;
      console.log(`      ${p.name}: ${rows.length} venues (${cex} CEX, ${cg.length} from CoinGecko)`);
    }
  }

  // 4c. contract risk + holder list (RugCheck, keyless). One call per mint
  //     fills three categories: risk, the top-holder list, and concentration.
  if (!FAST) {
    console.log("[4c] risk & holder list…");
    for (const p of allProjects()) {
      if (!p.mint) continue;
      const r = await tokenReport(p.mint);
      if (!r) continue;

      d.prepare(`
        INSERT OR REPLACE INTO risk_snapshots (
          project_id, ts, score, score_normalised, rugged, mint_authority,
          freeze_authority, lp_locked_pct, total_holders, total_lp_providers, risks
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        p.id, now(), r.score, r.scoreNormalised, r.rugged ? 1 : 0,
        // Null through, never coerced: an unread authority is not a revoked one.
        r.mintAuthorityEnabled == null ? null : r.mintAuthorityEnabled ? 1 : 0,
        r.freezeAuthorityEnabled == null ? null : r.freezeAuthorityEnabled ? 1 : 0,
        r.lpLockedPct, r.totalHolders, r.totalLpProviders,
        r.risks.length ? JSON.stringify(r.risks) : null
      );

      if (r.holders.length) {
        // Replaced wholesale: a wallet that sold must leave the table.
        d.prepare("DELETE FROM top_holders WHERE project_id = ?").run(p.id);
        const insH = d.prepare(`
          INSERT OR REPLACE INTO top_holders (project_id, rank, address, owner, amount, pct, label, ts)
          VALUES (?,?,?,?,?,?,?,?)
        `);
        r.holders.forEach((h, i) => {
          // Prefer RugCheck's own venue label, then our curated wallet registry.
          const label = h.label ?? KNOWN_WALLETS[h.owner ?? ""]?.label ?? (h.insider ? "Insider network" : null);
          insH.run(p.id, i + 1, h.address, h.owner, h.uiAmount, h.pct, label, now());
        });
      }

      // Concentration rides on the holder snapshot the holders step wrote.
      if (r.top10Pct != null) {
        const last = d.prepare(
          "SELECT ts FROM holder_snapshots WHERE project_id = ? ORDER BY ts DESC LIMIT 1"
        ).get(p.id) as { ts: number } | undefined;
        if (last) {
          d.prepare(
            "UPDATE holder_snapshots SET top10_pct = ?, top20_pct = ? WHERE project_id = ? AND ts = ?"
          ).run(r.top10Pct, r.top20Pct, p.id, last.ts);
        }
      }

      const danger = r.risks.filter((x) => x.level === "danger").length;
      console.log(
        `      ${p.name}: risk ${r.scoreNormalised ?? "?"}/100, ${r.holders.length} holders` +
        `${r.top10Pct != null ? `, top10 ${r.top10Pct.toFixed(1)}%` : ""}${danger ? `, ${danger} danger` : ""}`
      );
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
            INSERT OR REPLACE INTO github_snapshots (
              project_id, ts, stars, forks, repos, last_push_ts,
              contributors, commits_90d, open_issues, closed_issues, open_prs, merged_prs,
              releases_count, active_repos, last_commit_ts, languages, code_frequency
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `).run(
            p.id, now(), gs.stars, gs.forks, gs.repos, gs.lastPushTs || null,
            gs.contributors, gs.commits90d, gs.openIssues, gs.closedIssues, gs.openPRs, gs.mergedPRs,
            gs.releasesCount, gs.activeRepos, gs.lastCommitTs,
            gs.languages.length ? JSON.stringify(gs.languages) : null,
            gs.codeFrequency.length ? JSON.stringify(gs.codeFrequency) : null
          );
          const insEv = d.prepare(`
            INSERT OR IGNORE INTO events (project_id, ts, type, title, detail, url) VALUES (?,?,?,?,?,?)
          `);
          // Releases are indexed once, as github_release. The Atom feeds reach
          // further back than the REST call, so both feed the same event type
          // and dedupe on (ts, type, title) via the table's unique index.
          for (const r of gs.releases) insEv.run(p.id, r.ts, "github_release", `${r.repo} ${r.tag}`, r.name, r.url);

          // Commits from the busiest repo, replaced wholesale each run: an
          // amended or rebased commit must not linger as a dangling old sha,
          // and this is a rolling "recent" list rather than an append-only log.
          // Repo and short sha are not stored separately — both are recoverable
          // from `url` (.../<owner>/<repo>/commit/<sha>), which keeps this row
          // the same four-column shape every other event type already uses.
          d.prepare("DELETE FROM events WHERE project_id = ? AND type = 'github_commit'").run(p.id);
          for (const c of gs.recentCommits) {
            insEv.run(p.id, c.ts, "github_commit", c.message, c.author, c.url);
          }

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

    // Structural events replace rather than append: a corrected raise date must
    // move the entry, not add a second one beside the superseded reading.
    if (p.raise_end_ts) {
      recordStructuralEvent(
        p.id, p.raise_end_ts, "raise_closed", "Raise closed",
        p.raise_amount_usd ? `$${Math.round(p.raise_amount_usd).toLocaleString()} raised` : null
      );
    }
    if (p.launch_ts) {
      recordStructuralEvent(p.id, p.launch_ts, "token_launch", "Token trading began", null);
    }
  }

  // 6. press coverage, from two complementary directions:
  //    the publisher wire catches the majors, and a per-token search reaches
  //    the smaller outlets that cover a $3M raise the majors never mention.
  if (!FAST) {
    console.log("[6/6] news…");
    const wire = await fetchWire();
    const insNews = d.prepare(
      "INSERT OR IGNORE INTO events (project_id, ts, type, title, detail, url) VALUES (?,?,?,?,?,?)"
    );
    let matched = 0, rows = 0;
    for (const p of allProjects()) {
      const fromWire = matchProject(wire, p.name).map((h) => ({ ...h }));
      const found = await searchNews(`"${p.name}" crypto`);
      await sleep(1800); // space the search requests
      const fromSearch = filterForProject(found, p.name, p.symbol, "Bing News");

      // The wire already carries a publisher name; searched items are titled by
      // outlet inside the feed, so they are attributed generically.
      const all = [...fromWire, ...fromSearch];
      const seen = new Set<string>();
      let added = 0;
      for (const a of all) {
        const key = a.title.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        added += insNews.run(p.id, a.ts, "news", a.title, a.source, a.url).changes;
      }
      rows += added;
      if (all.length) {
        matched++;
        console.log(`      ${p.name}: ${all.length} article${all.length === 1 ? "" : "s"} (${added} new)`);
      }
    }
    console.log(`      ${matched} projects with coverage, ${rows} rows written`);
  }

  generateObservations();

  const pruned = pruneDeadLinks();
  if (pruned) console.log(`      ${pruned} dead link(s) cleared`);

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

/**
 * Clear links a PROFILES record marks dead.
 *
 * Runs last on purpose. DexScreener and GeckoTerminal both re-supply whatever
 * the team once submitted to them, so a dead link cleared in step 1d is simply
 * written back minutes later by step 2 — the aggregator has no idea the invite
 * has been revoked or the domain dropped. Clearing after every writer has run
 * is what makes it stick for the rest of the cycle.
 *
 * upsertProject cannot express this: it skips nulls by design, which is what
 * lets a partial record leave good columns alone. Blanking a column therefore
 * has to be its own statement.
 */
function pruneDeadLinks(): number {
  const d = db();
  let cleared = 0;
  for (const p of allProjects()) {
    const prof = profileFor(p.slug);
    if (!prof?.dead?.length) continue;
    for (const col of prof.dead) {
      // Only report a column that still held something, so a re-run is quiet.
      const had = (p as unknown as Record<string, unknown>)[col];
      d.prepare(`UPDATE projects SET ${col} = NULL WHERE slug = ?`).run(p.slug);
      if (had != null && had !== "") {
        cleared++;
        console.log(`      ${p.name}: cleared dead ${col} (${String(had).slice(0, 48)})`);
      }
    }
  }
  return cleared;
}

main().catch((e) => { console.error(e); process.exit(1); });
