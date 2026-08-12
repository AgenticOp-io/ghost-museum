#!/usr/bin/env node
/**
 * Scheduled SerpAPI search:seed — ~1 query per day, hard monthly budget (default 25).
 * Keeps the 25/month free tier from being burned by the 6h authority loop.
 *
 *   node scripts/search-schedule-loop.mjs
 *
 * Env:
 *   SERPAPI_API_KEY
 *   SERPAPI_MONTHLY_BUDGET=25
 *   GM_SEARCH_PERIOD_MS=111600000   (~31h → ≤25 calls / 31d)
 *   GM_SEARCH_QUERIES_PER_RUN=1
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PERIOD_MS = Number(process.env.GM_SEARCH_PERIOD_MS || 31 * 60 * 60 * 1000);
const QUERIES = String(process.env.GM_SEARCH_QUERIES_PER_RUN || 1);
const MAX = String(process.env.GM_SEARCH_MAX_SEEDS || 40);
const quotaPath = join(root, "hunt", "search-quota.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function quotaLine() {
  try {
    if (!existsSync(quotaPath)) return "quota unset";
    const q = JSON.parse(readFileSync(quotaPath, "utf8"));
    return `${q.used || 0}/${q.budget || "?"} used (${q.month}) · remaining ${q.remaining ?? "?"}`;
  } catch {
    return "quota unreadable";
  }
}

function runSearch() {
  console.log(`\n── search:seed scheduled · ${quotaLine()} ──`);
  const r = spawnSync(
    process.execPath,
    [
      join(root, "scripts", "search-seed.mjs"),
      "--provider",
      "serpapi",
      "--queries",
      QUERIES,
      "--max",
      MAX,
    ],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  if (r.status !== 0) console.error(`search:seed exited ${r.status}`);
  // Fold new seeds into the hunt queue.
  spawnSync(process.execPath, [join(root, "scripts", "seed-watchlist.mjs"), "--broad"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  spawnSync(
    process.execPath,
    [join(root, "scripts", "curate.mjs"), "--desk", "--top", "500"],
    { cwd: root, stdio: "inherit", env: process.env },
  );
}

if (!process.env.SERPAPI_API_KEY) {
  console.error("SERPAPI_API_KEY missing — search schedule idle.");
  process.exit(1);
}

console.log(
  `search schedule · period ${PERIOD_MS}ms · queries/run ${QUERIES} · ${quotaLine()}`,
);

function msSinceLastSearch() {
  try {
    if (!existsSync(quotaPath)) return Number.POSITIVE_INFINITY;
    const q = JSON.parse(readFileSync(quotaPath, "utf8"));
    if (!q.updatedAt) return Number.POSITIVE_INFINITY;
    const t = Date.parse(q.updatedAt);
    if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
    return Date.now() - t;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

// Do not burn a credit on every daemon restart — wait out the remaining period.
const since = msSinceLastSearch();
if (since < PERIOD_MS) {
  const wait = PERIOD_MS - since;
  console.log(`last SerpAPI search ${Math.round(since / 60000)}m ago — sleep ${wait}ms first`);
  await sleep(wait);
}

for (;;) {
  runSearch();
  console.log(`sleep ${PERIOD_MS}ms until next SerpAPI search…`);
  await sleep(PERIOD_MS);
}
