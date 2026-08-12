#!/usr/bin/env node
/**
 * Authority growth loop — discover → autoseed → search:seed → broad → curate → hang:auto → validate.
 * Hunt stays a separate daemon (GET probes only). This loop expands seeds and auto-hangs.
 *
 *   npm run authority:once
 *   npm run authority:loop
 *
 * Pace: GM_AUTHORITY_PERIOD_MS (default 6h). Hang cap: GM_HANG_AUTO_MAX (default 25).
 * Search needs BRAVE_SEARCH_API_KEY or GOOGLE_CSE_ID+GOOGLE_API_KEY (optional; skips cleanly).
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const loop = args.includes("--loop");
const PERIOD_MS = Number(process.env.GM_AUTHORITY_PERIOD_MS || 6 * 60 * 60 * 1000);
const HANG_MAX = String(process.env.GM_HANG_AUTO_MAX || 25);
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

  step("discover", [join(root, "scripts", "discover.mjs")]);
  step("autoseed", [join(root, "scripts", "autoseed.mjs")]);
  step("search:seed", [join(root, "scripts", "search-seed.mjs")]);
  step("seed-watchlist:broad", [join(root, "scripts", "seed-watchlist.mjs"), "--broad"]);
  step("curate:desk", [join(root, "scripts", "curate.mjs"), "--desk", "--top", "200"]);
  step("hang:auto", [
    join(root, "scripts", "hang-auto.mjs"),
    "--skip-curate",
    "--max",
    HANG_MAX,
  ]);
  step("validate", [join(root, "scripts", "validate.mjs")]);

  const finished = new Date().toISOString();
  const summary = {
    museum: "Still Answering",
    started,
    finished,
    hangMax: Number(HANG_MAX),
    steps,
    ok: steps.every((s) => s.ok),
  };
  mkdirSync(join(root, "hunt"), { recursive: true });
  writeFileSync(statusPath, JSON.stringify(summary, null, 2) + "\n");
  console.log(`\nauthority pass → ${statusPath} · ok=${summary.ok}`);
  return summary;
}

console.log(
  `authority ${loop ? "loop" : "once"} · period ${PERIOD_MS}ms · hang max ${HANG_MAX}`,
);

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
