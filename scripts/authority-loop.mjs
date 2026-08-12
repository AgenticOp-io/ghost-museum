#!/usr/bin/env node
/**
 * Authority growth loop — discover → watchlist → autoseed → search → watchlist → curate → validate.
 * Hang drain is a separate daemon (hang-drain-loop) so long discover/search never stalls the hall.
 *
 *   npm run authority:once
 *   npm run authority:loop
 *
 * Pace: GM_AUTHORITY_PERIOD_MS (default 6h).
 * Watchlist is refreshed right after discover so hunt can grow the Ghosts total immediately.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const loop = args.includes("--loop");
const PERIOD_MS = Number(process.env.GM_AUTHORITY_PERIOD_MS || 6 * 60 * 60 * 1000);
const statusPath = join(root, "hunt", "authority-last.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function run(label, argv) {
  console.log(`\n── ${label} ──`);
  const r = spawnSync(process.execPath, argv, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`${label} exited ${r.status}`);
    return false;
  }
  return true;
}

async function pass() {
  const started = new Date().toISOString();
  const steps = [];
  const step = (name, argv) => {
    const fine = run(name, argv);
    steps.push({ name, ok: fine });
    return fine;
  };

  // Discover first, then push watchlist so hunt can expand Ghosts total during later steps.
  step("discover", [join(root, "scripts", "discover.mjs")]);
  step("seed-fitness", [join(root, "scripts", "seed-fitness.mjs")]);
  step("seed-watchlist:broad", [join(root, "scripts", "seed-watchlist.mjs"), "--broad"]);
  step("autoseed", [join(root, "scripts", "autoseed.mjs")]);
  // search:seed runs on search-schedule-loop (SerpAPI 25/mo) — not every authority pass.
  step("seed-watchlist:broad", [join(root, "scripts", "seed-watchlist.mjs"), "--broad"]);
  step("curate:desk", [join(root, "scripts", "curate.mjs"), "--desk", "--top", "500"]);
  step("validate", [join(root, "scripts", "validate.mjs")]);

  const finished = new Date().toISOString();
  const summary = {
    museum: "Still Answering",
    started,
    finished,
    steps,
    ok: steps.every((s) => s.ok),
    note: "Hang drain runs via hang-drain-loop.mjs — not blocked by this pass.",
  };
  mkdirSync(join(root, "hunt"), { recursive: true });
  writeFileSync(statusPath, JSON.stringify(summary, null, 2) + "\n");
  console.log(`\nauthority pass → ${statusPath} · ok=${summary.ok}`);
  return summary;
}

console.log(`authority ${loop ? "loop" : "once"} · period ${PERIOD_MS}ms · hang via hang-drain-loop`);

if (loop) {
  for (;;) {
    await pass();
    console.log(`sleep ${PERIOD_MS}ms until next authority pass…`);
    await sleep(PERIOD_MS);
  }
} else {
  const summary = await pass();
  process.exit(summary.ok ? 0 : 1);
}
