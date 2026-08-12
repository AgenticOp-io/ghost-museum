#!/usr/bin/env node
/**
 * Continuous hang:auto drain — independent of the long authority discover/search pass.
 * Grows hung frames; desk empties. Does not invent exhibits.
 *
 *   node scripts/hang-drain-loop.mjs
 *
 * Env: GM_HANG_AUTO_MAX, GM_HANG_CATCHUP_MS, GM_HANG_DRAIN_MS
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HANG_DRAIN_MS = Number(process.env.GM_HANG_DRAIN_MS || 30 * 60 * 1000);
const HANG_CATCHUP_MS = Number(process.env.GM_HANG_CATCHUP_MS || 90 * 1000);
const HANG_MAX = String(process.env.GM_HANG_AUTO_MAX || 80);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pendingStrongCount() {
  try {
    const exhibits = existsSync(join(root, "exhibits", "exhibits.json"))
      ? JSON.parse(readFileSync(join(root, "exhibits", "exhibits.json"), "utf8")).exhibits || []
      : [];
    const hungIds = new Set(exhibits.map((e) => e.id));
    const hungProbes = new Set(exhibits.map((e) => e.probeUrl).filter(Boolean));
    const curatePath = join(root, "site", "curate.json");
    const rankPath = join(root, "hunt", "curate-rank.json");
    let rows = [];
    if (existsSync(curatePath)) {
      rows = JSON.parse(readFileSync(curatePath, "utf8")).queue || [];
    } else if (existsSync(rankPath)) {
      rows = (JSON.parse(readFileSync(rankPath, "utf8")).ranked || []).filter(
        (r) => r.decision === "strong",
      );
    }
    return rows.filter(
      (r) =>
        r.decision === "strong" &&
        r.id &&
        !hungIds.has(r.id) &&
        !(r.probeUrl && hungProbes.has(r.probeUrl)),
    ).length;
  } catch {
    return 0;
  }
}

function drain() {
  console.log(`\n── hang:auto drain max=${HANG_MAX} ──`);
  const r = spawnSync(
    process.execPath,
    [join(root, "scripts", "hang-auto.mjs"), "--max", HANG_MAX],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  if (r.status !== 0) console.error(`hang:auto exited ${r.status}`);
  return r.status === 0;
}

console.log(
  `hang-drain loop · catch-up ${HANG_CATCHUP_MS}ms · steady ${HANG_DRAIN_MS}ms · max ${HANG_MAX}`,
);

for (;;) {
  drain();
  const pending = pendingStrongCount();
  const sleepFor = pending > 0 ? HANG_CATCHUP_MS : HANG_DRAIN_MS;
  console.log(`sleep ${sleepFor}ms · pending strong ${pending}`);
  await sleep(sleepFor);
}
