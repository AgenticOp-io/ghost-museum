#!/usr/bin/env node
/**
 * Authority growth loop — discover → autoseed → search:seed → broad → curate → hang:auto → validate.
 * Hunt stays a separate daemon (GET probes only). This loop expands seeds and auto-hangs.
 *
 *   npm run authority:once
 *   npm run authority:loop
 *
 * Pace: GM_AUTHORITY_PERIOD_MS (default 6h). Hang cap: GM_HANG_AUTO_MAX (default 80).
 * Between full passes, a hang drain runs every GM_HANG_DRAIN_MS (default 30m).
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const loop = args.includes("--loop");
const PERIOD_MS = Number(process.env.GM_AUTHORITY_PERIOD_MS || 6 * 60 * 60 * 1000);
const HANG_DRAIN_MS = Number(process.env.GM_HANG_DRAIN_MS || 30 * 60 * 1000);
const HANG_MAX = String(process.env.GM_HANG_AUTO_MAX || 80);
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

function hangDrain(label = "hang:auto drain") {
  return run(label, [
    join(root, "scripts", "hang-auto.mjs"),
    "--max",
    HANG_MAX,
  ]);
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
  step("curate:desk", [join(root, "scripts", "curate.mjs"), "--desk", "--top", "500"]);
  steps.push({ name: "hang:auto", ok: hangDrain("hang:auto") });
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
  `authority ${loop ? "loop" : "once"} · period ${PERIOD_MS}ms · hang drain ${HANG_DRAIN_MS}ms · hang max ${HANG_MAX}`,
);

if (loop) {
  let lastFull = 0;
  for (;;) {
    const now = Date.now();
    if (!lastFull || now - lastFull >= PERIOD_MS) {
      await pass();
      lastFull = Date.now();
    } else {
      hangDrain();
    }
    const untilFull = Math.max(0, PERIOD_MS - (Date.now() - lastFull));
    const sleepFor = Math.min(HANG_DRAIN_MS, untilFull || HANG_DRAIN_MS);
    console.log(`sleep ${sleepFor}ms (next hang drain / full authority)…`);
    await sleep(sleepFor);
  }
} else {
  const summary = await pass();
  process.exit(summary.ok ? 0 : 1);
}
