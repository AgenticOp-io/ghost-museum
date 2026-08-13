#!/usr/bin/env node
/**
 * Continuous hang:auto drain — independent of authority.
 * Timed child runs, small batches, heartbeats. Never blocks forever.
 *
 *   node scripts/hang-drain-loop.mjs
 *
 * Env: GM_HANG_AUTO_MAX, GM_HANG_CATCHUP_MS, GM_HANG_DRAIN_MS, GM_HANG_CHILD_TIMEOUT_MS
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isHangableWall } from "./lib/hang.mjs";
import {
  sleep,
  jitter,
  heartbeat,
  spawnTimed,
  readJsonSafe,
} from "./lib/loop-kit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HANG_DRAIN_MS = Number(process.env.GM_HANG_DRAIN_MS || 3 * 60 * 1000);
const HANG_CATCHUP_MS = Number(process.env.GM_HANG_CATCHUP_MS || 45 * 1000);
const HANG_MAX = String(process.env.GM_HANG_AUTO_MAX || 12);
const CHILD_TIMEOUT_MS = Number(process.env.GM_HANG_CHILD_TIMEOUT_MS || 6 * 60 * 1000);
const CURATE_EVERY = Number(process.env.GM_HANG_CURATE_EVERY || 3);

function probeKey(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./i, "").toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    u.search = "";
    return u.toString();
  } catch {
    return String(url || "");
  }
}

function pendingHangableCount() {
  try {
    const exhibits =
      readJsonSafe(join(root, "exhibits", "exhibits.json"), { exhibits: [] })?.exhibits || [];
    const hungIds = new Set(exhibits.map((e) => e.id));
    const hungProbes = new Set(exhibits.map((e) => e.probeUrl).filter(Boolean));
    const hungProbeKeys = new Set(exhibits.map((e) => probeKey(e.probeUrl)).filter(Boolean));
    const rankPath = join(root, "hunt", "curate-rank.json");
    const curatePath = join(root, "site", "curate.json");
    let rows = [];
    if (existsSync(rankPath)) {
      rows = (readJsonSafe(rankPath, { ranked: [] })?.ranked || []).filter(
        (r) => r.decision === "strong" || r.decision === "consider",
      );
    } else if (existsSync(curatePath)) {
      rows = readJsonSafe(curatePath, { queue: [] })?.queue || [];
    }
    return rows.filter(
      (r) =>
        r?.id &&
        isHangableWall(r.wall) &&
        r.probeUrl &&
        r.obituary &&
        !hungIds.has(r.id) &&
        !hungProbes.has(r.probeUrl) &&
        !hungProbeKeys.has(probeKey(r.probeUrl)),
    ).length;
  } catch {
    return 0;
  }
}

async function drain({ skipCurate }) {
  const argv = [join(root, "scripts", "hang-auto.mjs"), "--max", HANG_MAX];
  if (skipCurate) argv.push("--skip-curate");
  console.log(`\n── hang:auto drain max=${HANG_MAX} skipCurate=${skipCurate} timeout=${CHILD_TIMEOUT_MS}ms ──`);
  heartbeat(root, "hang-drain", { phase: "drain", skipCurate, max: Number(HANG_MAX) });
  const r = await spawnTimed(process.execPath, argv, {
    cwd: root,
    env: process.env,
    timeoutMs: CHILD_TIMEOUT_MS,
  });
  if (r.timedOut) console.error(`hang:auto TIMED OUT after ${CHILD_TIMEOUT_MS}ms — killed`);
  else if (r.status !== 0) console.error(`hang:auto exited ${r.status}${r.signal ? ` signal=${r.signal}` : ""}`);
  return r;
}

console.log(
  `hang-drain loop · catch-up ${HANG_CATCHUP_MS}ms · idle ${HANG_DRAIN_MS}ms · max ${HANG_MAX} · childTimeout ${CHILD_TIMEOUT_MS}ms`,
);

let cycle = 0;
let lastHung = 0;
for (;;) {
  cycle += 1;
  // Refresh desk when we hung something, on schedule, or when the last drain hung nothing.
  const skipCurate = lastHung > 0 && cycle % CURATE_EVERY !== 1;
  try {
    const r = await drain({ skipCurate });
    const log = readJsonSafe(join(root, "hunt", "hang-auto-log.json"), null);
    lastHung = Number(log?.hungCount || 0);
    if (r.timedOut) lastHung = 0;
  } catch (err) {
    console.error(`drain failed: ${err?.message || err}`);
    heartbeat(root, "hang-drain", { phase: "error", error: String(err?.message || err) });
    lastHung = 0;
  }
  const pending = pendingHangableCount();
  const sleepFor = pending > 0 ? HANG_CATCHUP_MS : HANG_DRAIN_MS;
  heartbeat(root, "hang-drain", { phase: "idle", pending, cycle });
  console.log(`sleep ${sleepFor}ms · pending hangable ${pending} · cycle ${cycle}`);
  await sleep(jitter(sleepFor, 0.1));
}
