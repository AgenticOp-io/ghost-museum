#!/usr/bin/env node
/**
 * Auto-curate hangs — commit strong then consider after a fresh GET probe.
 * Evidence only. Bounded batch. doNotIntegrate.
 *
 *   npm run hang:auto
 *   npm run hang:auto -- --max 12
 *   npm run hang:auto -- --min consider
 *   npm run hang:auto -- --dry-run
 *   npm run hang:auto -- --skip-curate
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hangOne, isHangableWall } from "./lib/hang.mjs";
import { atomicWriteJson } from "./lib/atomic-write.mjs";
import {
  sleep,
  heartbeat,
  spawnTimed,
  readJsonSafe,
} from "./lib/loop-kit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exhibitsPath = join(root, "exhibits", "exhibits.json");
const rankPath = join(root, "hunt", "curate-rank.json");
const logPath = join(root, "hunt", "hang-auto-log.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipCurate = args.includes("--skip-curate");
const maxHang = (() => {
  const i = args.indexOf("--max");
  return i >= 0 ? Number(args[i + 1]) || 12 : Number(process.env.GM_HANG_AUTO_MAX || 12);
})();
const minBand = (() => {
  const i = args.indexOf("--min");
  return i >= 0 ? args[i + 1] || "strong" : "strong";
})();
const BAND_ORDER = { strong: 3, consider: 2, review: 1, weak: 0 };
const DELAY_MS = Number(process.env.GM_HANG_AUTO_DELAY_MS || 400);
const CURATE_TIMEOUT_MS = Number(process.env.GM_HANG_CURATE_TIMEOUT_MS || 120_000);
const FAIL_STREAK_ABORT = Number(process.env.GM_HANG_FAIL_STREAK || 8);
const SKIP_PATH = join(root, "hunt", "hang-skip.json");
const SKIP_COOLDOWN_MS = Number(process.env.GM_HANG_SKIP_COOLDOWN_MS || 6 * 60 * 60 * 1000);

function loadSkip() {
  const doc = readJsonSafe(SKIP_PATH, { skips: {} });
  const now = Date.now();
  const skips = {};
  for (const [id, row] of Object.entries(doc.skips || {})) {
    const until = Date.parse(row?.until || "");
    if (Number.isFinite(until) && until > now) skips[id] = row;
  }
  return skips;
}

function saveSkip(skips) {
  atomicWriteJson(SKIP_PATH, {
    museum: "Still Answering",
    updatedAt: new Date().toISOString(),
    skips,
  });
}

function noteSkip(skips, id, reason) {
  skips[id] = {
    reason,
    until: new Date(Date.now() + SKIP_COOLDOWN_MS).toISOString(),
    at: new Date().toISOString(),
  };
}

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

if (!skipCurate) {
  console.log("Refreshing curate desk…");
  const r = await spawnTimed(
    process.execPath,
    [join(root, "scripts", "curate.mjs"), "--desk", "--top", "500"],
    { cwd: root, env: process.env, timeoutMs: CURATE_TIMEOUT_MS },
  );
  if (r.timedOut) {
    console.error("curate TIMED OUT — continuing with last desk");
  } else if (r.status !== 0) {
    console.error("curate failed");
    process.exit(r.status || 1);
  }
}

if (!existsSync(rankPath)) {
  console.error("Missing hunt/curate-rank.json — run npm run curate:desk first");
  process.exit(1);
}

const rank = readJsonSafe(rankPath, null);
const museum = readJsonSafe(exhibitsPath, null);
if (!rank || !museum) {
  console.error("Could not read rank or exhibits JSON");
  process.exit(1);
}

const hungIds = new Set((museum.exhibits || []).map((e) => e.id));
const hungProbes = new Set((museum.exhibits || []).map((e) => e.probeUrl).filter(Boolean));
const hungProbeKeys = new Set(
  (museum.exhibits || []).map((e) => probeKey(e.probeUrl)).filter(Boolean),
);
const skips = loadSkip();

function alreadyHungProbe(url) {
  return Boolean(url && (hungProbes.has(url) || hungProbeKeys.has(probeKey(url))));
}

function eligible(r) {
  return (
    r?.id &&
    !skips[r.id] &&
    isHangableWall(r.wall) &&
    r.obituary &&
    r.probeUrl &&
    !hungIds.has(r.id) &&
    !alreadyHungProbe(r.probeUrl) &&
    (BAND_ORDER[r.decision] ?? 0) >= 2
  );
}

const ranked = rank.ranked || [];
const strong = ranked.filter((r) => r.decision === "strong" && eligible(r));
const consider = ranked.filter((r) => r.decision === "consider" && eligible(r));

// Always drain strong first, then consider — unless user forced --min consider only.
let queue;
if (minBand === "consider" && args.includes("--min")) {
  queue = [...consider];
} else if (minBand === "strong" && args.includes("--min")) {
  queue = [...strong];
} else {
  queue = [...strong, ...consider];
}

console.log(
  `hang:auto · candidates ${queue.length} (strong ${strong.length} · consider ${consider.length} · max=${maxHang}${dryRun ? ", dry-run" : ""}) · hall ${hungIds.size}`,
);
heartbeat(root, "hang-auto", {
  phase: "start",
  candidates: queue.length,
  strong: strong.length,
  consider: consider.length,
});

const results = { hung: [], skipped: [], failed: [] };
let n = 0;
let failStreak = 0;

for (const row of queue) {
  if (n >= maxHang) break;
  if (failStreak >= FAIL_STREAK_ABORT) {
    console.error(`abort after ${failStreak} consecutive failures`);
    break;
  }
  if (alreadyHungProbe(row.probeUrl)) {
    results.skipped.push({ id: row.id, reason: "probeUrl already hung" });
    continue;
  }
  if (hungIds.has(row.id)) {
    results.skipped.push({ id: row.id, reason: "already hung" });
    continue;
  }

  heartbeat(root, "hang-auto", { phase: "hang", id: row.id, hung: n, failed: results.failed.length });

  if (dryRun) {
    console.log(`dry-run would hang ${row.id} · ${row.wall} · score ${row.score}`);
    results.hung.push({ id: row.id, wall: row.wall, dryRun: true });
    n += 1;
    failStreak = 0;
    continue;
  }

  let res;
  try {
    res = await hangOne({
      root,
      id: row.id,
      commit: true,
      requireGhostWall: true,
      quiet: false,
    });
  } catch (err) {
    res = { ok: false, reason: String(err?.message || err) };
  }

  if (!res.ok) {
    results.failed.push({ id: row.id, reason: res.reason, wall: res.wall || null });
    console.log(`skip ${row.id}: ${res.reason}`);
    failStreak += 1;
    if (/timeout|TIMED OUT|ENOTFOUND|ECONNREFUSED/i.test(String(res.reason || ""))) {
      noteSkip(skips, row.id, res.reason);
      saveSkip(skips);
      console.log(`cooldown ${row.id} for ${Math.round(SKIP_COOLDOWN_MS / 3600000)}h`);
    }
  } else if (res.committed) {
    results.hung.push({ id: row.id, wall: res.wall, score: row.score });
    hungIds.add(row.id);
    hungProbes.add(row.probeUrl);
    hungProbeKeys.add(probeKey(row.probeUrl));
    if (res.exhibit?.probeUrl) {
      hungProbes.add(res.exhibit.probeUrl);
      hungProbeKeys.add(probeKey(res.exhibit.probeUrl));
    }
    n += 1;
    failStreak = 0;
    console.log(`hung ${row.id} · ${res.wall}`);
  } else {
    results.skipped.push({ id: row.id, reason: "draft only" });
    failStreak += 1;
  }

  await sleep(DELAY_MS);
}

const hallAfter = readJsonSafe(exhibitsPath, museum)?.exhibits?.length ?? hungIds.size;
const summary = {
  museum: "Still Answering",
  ranAt: new Date().toISOString(),
  minBand,
  maxHang,
  dryRun,
  hallBefore: (museum.exhibits || []).length,
  hallAfter,
  hungCount: results.hung.length,
  skippedCount: results.skipped.length,
  failedCount: results.failed.length,
  ...results,
};

atomicWriteJson(logPath, summary);
console.log(
  `hang:auto done · hung ${summary.hungCount} · failed ${summary.failedCount} · skipped ${summary.skippedCount} · hall ${summary.hallBefore} → ${summary.hallAfter}`,
);
heartbeat(root, "hang-auto", {
  phase: "done",
  hungCount: summary.hungCount,
  hallAfter: summary.hallAfter,
});

if (!dryRun && (summary.hungCount > 0 || !skipCurate)) {
  console.log("Refreshing curate desk…");
  await spawnTimed(
    process.execPath,
    [join(root, "scripts", "curate.mjs"), "--desk", "--top", "500"],
    { cwd: root, env: process.env, timeoutMs: CURATE_TIMEOUT_MS },
  );
}
