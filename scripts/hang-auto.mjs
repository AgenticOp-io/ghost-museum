#!/usr/bin/env node
/**
 * Auto-curate hangs — commit strong desk candidates after a fresh GET probe.
 * Evidence only: obituary + ghost-class (or buried) wall. Never invents. doNotIntegrate.
 *
 *   npm run hang:auto
 *   npm run hang:auto -- --max 40
 *   npm run hang:auto -- --min consider
 *   npm run hang:auto -- --dry-run
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { hangOne, isHangableWall } from "./lib/hang.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exhibitsPath = join(root, "exhibits", "exhibits.json");
const rankPath = join(root, "hunt", "curate-rank.json");
const logPath = join(root, "hunt", "hang-auto-log.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipCurate = args.includes("--skip-curate");
const maxHang = (() => {
  const i = args.indexOf("--max");
  return i >= 0 ? Number(args[i + 1]) || 80 : 80;
})();
const minBand = (() => {
  const i = args.indexOf("--min");
  return i >= 0 ? args[i + 1] || "strong" : "strong";
})();
const BAND_ORDER = { strong: 3, consider: 2, review: 1, weak: 0 };
const DELAY_MS = Number(process.env.GM_HANG_AUTO_DELAY_MS || 500);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (!skipCurate) {
  console.log("Refreshing curate desk…");
  const r = spawnSync(process.execPath, [join(root, "scripts", "curate.mjs"), "--desk", "--top", "500"], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("curate failed");
    process.exit(r.status || 1);
  }
}

if (!existsSync(rankPath)) {
  console.error("Missing hunt/curate-rank.json — run npm run curate:desk first");
  process.exit(1);
}

const rank = JSON.parse(readFileSync(rankPath, "utf8"));
const museum = JSON.parse(readFileSync(exhibitsPath, "utf8"));
const hungIds = new Set((museum.exhibits || []).map((e) => e.id));
const hungProbes = new Set(
  (museum.exhibits || []).map((e) => e.probeUrl).filter(Boolean),
);

const queue = (rank.ranked || [])
  .filter((r) => (BAND_ORDER[r.decision] ?? 0) >= (BAND_ORDER[minBand] ?? 3))
  .filter((r) => isHangableWall(r.wall) || r.httpStatus == null)
  .filter((r) => r.obituary && r.probeUrl)
  .filter((r) => !hungIds.has(r.id))
  .filter((r) => !hungProbes.has(r.probeUrl));

console.log(
  `hang:auto · candidates ${queue.length} (min=${minBand}, max=${maxHang}${dryRun ? ", dry-run" : ""}) · hall ${hungIds.size}`,
);

const results = { hung: [], skipped: [], failed: [] };
let n = 0;

for (const row of queue) {
  if (n >= maxHang) break;
  if (hungProbes.has(row.probeUrl)) {
    results.skipped.push({ id: row.id, reason: "probeUrl already hung" });
    continue;
  }
  if (hungIds.has(row.id)) {
    results.skipped.push({ id: row.id, reason: "already hung" });
    continue;
  }

  if (dryRun) {
    console.log(`dry-run would hang ${row.id} · ${row.wall} · score ${row.score}`);
    results.hung.push({ id: row.id, wall: row.wall, dryRun: true });
    n += 1;
    continue;
  }

  const res = await hangOne({
    root,
    id: row.id,
    commit: true,
    requireGhostWall: true,
    quiet: false,
  });

  if (!res.ok) {
    results.failed.push({ id: row.id, reason: res.reason, wall: res.wall || null });
    console.log(`skip ${row.id}: ${res.reason}`);
  } else if (res.committed) {
    results.hung.push({ id: row.id, wall: res.wall, score: row.score });
    hungIds.add(row.id);
    hungProbes.add(row.probeUrl);
    if (res.exhibit?.probeUrl) hungProbes.add(res.exhibit.probeUrl);
    n += 1;
    console.log(`hung ${row.id} · ${res.wall}`);
  } else {
    results.skipped.push({ id: row.id, reason: "draft only" });
  }

  await sleep(DELAY_MS);
}

const summary = {
  museum: "Still Answering",
  ranAt: new Date().toISOString(),
  minBand,
  maxHang,
  dryRun,
  hallBefore: (museum.exhibits || []).length,
  hallAfter: JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits?.length ?? 0,
  hungCount: results.hung.length,
  skippedCount: results.skipped.length,
  failedCount: results.failed.length,
  ...results,
};

writeFileSync(logPath, JSON.stringify(summary, null, 2) + "\n");
console.log(
  `hang:auto done · hung ${summary.hungCount} · failed ${summary.failedCount} · skipped ${summary.skippedCount} · hall ${summary.hallBefore} → ${summary.hallAfter}`,
);
console.log(`log → ${logPath}`);

// Refresh desk so hung ids drop off the public curate queue.
if (!dryRun) {
  console.log("Refreshing curate desk…");
  spawnSync(
    process.execPath,
    [join(root, "scripts", "curate.mjs"), "--desk", "--top", "500"],
    { cwd: root, stdio: "inherit", env: process.env },
  );
}
if (!dryRun && summary.hungCount) {
  console.log("Next: npm run validate");
}
