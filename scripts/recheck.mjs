#!/usr/bin/env node
/**
 * Recheck hung exhibits on a ~monthly cadence (live loop).
 * Spreads one GET per ghost across ~30 days so the whole hall is refreshed monthly.
 * Gone / 410 → wall `banished`.
 *
 *   node scripts/recheck.mjs           # one full pass now
 *   node scripts/recheck.mjs --loop    # live monthly cadence
 *   node scripts/recheck.mjs --once id
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeUrl, classifyWall, summarizeChain } from "./lib/probe.mjs";
import { buildCensusPayload } from "./lib/census.mjs";
import { atomicWrite, atomicWriteJson } from "./lib/atomic-write.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "exhibits", "exhibits.json");
const sitePath = join(root, "site", "exhibits.json");
const censusPath = join(root, "site", "census.json");
const watchPath = join(root, "hunt", "watchlist.json");
const MONTH_MS = Number(process.env.GM_RECHECK_PERIOD_MS || 30 * 24 * 60 * 60 * 1000);

const args = process.argv.slice(2);
const loop = args.includes("--loop");
const onceIdx = args.indexOf("--once");
const onceId = onceIdx >= 0 ? args[onceIdx + 1] : null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(base) {
  return base + Math.floor(Math.random() * Math.min(3_600_000, Math.max(1000, base * 0.05)));
}

function load() {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeCensus(data) {
  const watch = existsSync(watchPath)
    ? JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []
    : [];
  const census = buildCensusPayload({
    museum: data.museum || "Still Answering",
    exhibits: data.exhibits || [],
    watch,
  });
  atomicWriteJson(censusPath, census);
  return census;
}

function persist(data) {
  const json = JSON.stringify(data, null, 2) + "\n";
  atomicWrite(path, json);
  atomicWrite(sitePath, json);
  return writeCensus(data);
}

async function recheckOne(ex, ua) {
  const prev = ex.wall;
  const started = new Date().toISOString();
  try {
    const r = await probeUrl(ex.probeUrl, ua);
    ex.httpStatus = r.httpStatus;
    ex.finalUrl = r.finalUrl;
    ex.redirectChain = r.redirectChain;
    if (r.titleTag) ex.titleTag = r.titleTag;
    delete ex.probeError;
    const next = classifyWall(ex, r, null);
    ex.wall = next;
    ex.lastRecheckAt = started;
    if (next === "banished" && prev !== "banished") {
      ex.banishedAt = started;
      ex.previousWall = prev;
    }
    if (prev === "banished" && next !== "banished") {
      delete ex.banishedAt;
    }
    console.log(`${ex.id}\t${prev}→${next}\t${summarizeChain(r.redirectChain)}\t${r.finalUrl}`);
    return { prev, next };
  } catch (err) {
    const msg = String(err.message || err);
    ex.probeError = msg;
    ex.lastRecheckAt = started;
    const next = classifyWall(ex, null, msg);
    ex.wall = next;
    if (next === "banished" && prev !== "banished") {
      ex.banishedAt = started;
      ex.previousWall = prev;
    }
    console.error(`${ex.id}\t${prev}→${next}\tFAIL\t${msg}`);
    return { prev, next, error: msg };
  }
}

async function fullPass() {
  const data = load();
  const ua = data.userAgent || "StillAnswering/0.1 (monthly recheck; +https://ghosts.agenticop.io/)";
  let list = data.exhibits || [];
  if (onceId) list = list.filter((e) => e.id === onceId);
  console.log(`recheck pass ${list.length} · GET only`);
  for (const ex of list) {
    await recheckOne(ex, ua);
    await sleep(500);
  }
  data.probedAt = new Date().toISOString();
  const census = persist(data);
  console.log(`census total=${census.total} hung=${census.hung} banished=${census.banished}`);
}

async function liveLoop() {
  let i = 0;
  for (;;) {
    const data = load();
    const ua = data.userAgent || "StillAnswering/0.1 (monthly recheck; +https://ghosts.agenticop.io/)";
    const list = data.exhibits || [];
    if (!list.length) {
      writeCensus(data);
      await sleep(3_600_000);
      continue;
    }
    const ex = list[i % list.length];
    await recheckOne(ex, ua);
    data.probedAt = new Date().toISOString();
    const census = persist(data);
    i += 1;
    const gap = Math.max(60_000, Math.floor(MONTH_MS / list.length));
    console.log(
      `census total=${census.total} · next in ~${Math.round(gap / 3600000)}h (${list.length} ghosts / ~30d)`,
    );
    await sleep(jitter(gap));
  }
}

if (loop) {
  console.log(`recheck live loop · period ${MONTH_MS}ms ≈ monthly`);
  await liveLoop();
} else {
  await fullPass();
}
