#!/usr/bin/env node
/**
 * Hunt bot — GET only, museum UA, never auto-hangs.
 * Bounded passes so the loop cannot balloon or hang forever.
 *
 *   node scripts/hunt.mjs
 *   node scripts/hunt.mjs --loop
 *   node scripts/hunt.mjs --once id
 *   node scripts/hunt.mjs --full
 *   node scripts/hunt.mjs --rebuild-index
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeUrl, formatProbeError } from "./lib/probe.mjs";
import {
  loadLatestFindingsMap,
  appendFinding,
  rebuildFindingsIndex,
} from "./lib/findings-index.mjs";
import { sleep, jitter, heartbeat, readJsonSafe } from "./lib/loop-kit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const watchPath = join(root, "hunt", "watchlist.json");
const outDir = process.env.GM_HUNT_DIR || join(root, "hunt");
const ua = "GhostMuseum-Hunt/0.1 (curator probe; +https://ghosts.agenticop.io/)";
const DELAY_MS = Number(process.env.GM_HUNT_DELAY_MS || 800);
const PASS_PAUSE_MS = Number(process.env.GM_HUNT_PASS_PAUSE_MS || 20_000);
const PASS_MAX = Number(process.env.GM_HUNT_PASS_MAX || 60);
const REQUERY_MS = Number(process.env.GM_HUNT_REQUERY_MS || 24 * 60 * 60 * 1000);
const REQUERY_UNPROBED_MS = Number(
  process.env.GM_HUNT_REQUERY_UNPROBED_MS || 3 * 60 * 60 * 1000,
);
const TIMEOUT_MS = Number(process.env.GM_HUNT_TIMEOUT_MS || 12_000);
const RELOAD_EVERY = Number(process.env.GM_HUNT_RELOAD_EVERY || 25);

mkdirSync(outDir, { recursive: true });

function suggestWall(r) {
  if (r.httpStatus == null) return "unprobed";
  if (r.redirectChain?.length > 1) return "successor-facade";
  if (r.httpStatus === 410) return "buried";
  if (r.httpStatus === 401 || r.httpStatus === 403) return "auth-ghost";
  if (r.httpStatus === 200) return "still-answering";
  return "unprobed";
}

function isFresh(finding, now = Date.now()) {
  if (!finding?.huntedAt) return false;
  const t = Date.parse(finding.huntedAt);
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  const inconclusive =
    finding.probeError ||
    finding.httpStatus == null ||
    !finding.suggestedWall ||
    finding.suggestedWall === "unprobed";
  return age < (inconclusive ? REQUERY_UNPROBED_MS : REQUERY_MS);
}

function loadWatchlist() {
  const data = readJsonSafe(watchPath, null);
  if (!data || !Array.isArray(data.watchlist)) throw new Error("watchlist.json needs watchlist[]");
  return data.watchlist.filter((w) => w?.probeUrl && w?.id);
}

function seedPriority(w) {
  const s = String(w.source || "");
  if (s.startsWith("seeds/") && !s.includes("discovered")) return 0;
  if (s.startsWith("seeds/")) return 1;
  if (s === "probe-hints") return 2;
  if (s === "nominate") return 3;
  return 4;
}

/** Never-probed first, then stale; cap later by PASS_MAX. */
function planQueue(list, latest, { full = false } = {}) {
  const now = Date.now();
  const awaiting = [];
  const stale = [];
  let skippedFresh = 0;
  for (const w of list) {
    const f = latest.get(w.id);
    if (!f) {
      awaiting.push(w);
      continue;
    }
    if (!full && isFresh(f, now)) {
      skippedFresh += 1;
      continue;
    }
    stale.push(w);
  }
  awaiting.sort((a, b) => seedPriority(a) - seedPriority(b) || String(a.id).localeCompare(b.id));
  stale.sort((a, b) => seedPriority(a) - seedPriority(b) || String(a.id).localeCompare(b.id));
  return {
    queue: [...awaiting, ...stale],
    awaiting: awaiting.length,
    stale: stale.length,
    skippedFresh,
  };
}

async function huntOne(item) {
  const started = new Date().toISOString();
  try {
    const r = await probeUrl(item.probeUrl, ua, { timeoutMs: TIMEOUT_MS });
    const finding = {
      id: item.id,
      title: item.title || item.id,
      obituary: item.obituary || null,
      probeUrl: item.probeUrl,
      huntedAt: started,
      httpStatus: r.httpStatus,
      finalUrl: r.finalUrl,
      titleTag: r.titleTag,
      redirectChain: r.redirectChain,
      suggestedWall: suggestWall(r),
      note: item.note || null,
      ...(r.tlsWarning ? { tlsWarning: r.tlsWarning } : {}),
      autoHang: false,
      status: "pending-review",
      source: item.source || null,
      owner: item.owner || null,
    };
    appendFinding(root, finding);
    console.log(
      `${item.id}\t${finding.suggestedWall}\t${r.redirectChain.map((h) => h.status).join("→")}\t${r.finalUrl}${r.tlsWarning ? "\ttls:" + r.tlsWarning : ""}`,
    );
    return finding;
  } catch (err) {
    const finding = {
      id: item.id,
      title: item.title || item.id,
      obituary: item.obituary || null,
      probeUrl: item.probeUrl,
      huntedAt: started,
      probeError: formatProbeError(err),
      suggestedWall: "unprobed",
      autoHang: false,
      status: "pending-review",
      source: item.source || null,
      owner: item.owner || null,
    };
    appendFinding(root, finding);
    console.error(`${item.id}\tFAIL\t${finding.probeError}`);
    return finding;
  }
}

const args = process.argv.slice(2);
const loop = args.includes("--loop");
const full = args.includes("--full");
const rebuildIndex = args.includes("--rebuild-index");
const onceIdx = args.indexOf("--once");
const onceId = onceIdx >= 0 ? args[onceIdx + 1] : null;

async function pass() {
  heartbeat(root, "hunt", { phase: "start" });
  let latest = loadLatestFindingsMap(root);
  let list = loadWatchlist();
  if (onceId) list = list.filter((w) => w.id === onceId);

  let { queue, awaiting, stale, skippedFresh } = planQueue(list, latest, { full });
  const planned = queue.length;
  if (queue.length > PASS_MAX) queue = queue.slice(0, PASS_MAX);
  console.log(
    `hunt pass · batch ${queue.length}/${planned} (awaiting ${awaiting} · stale ${stale} · skip-fresh ${skippedFresh}) · delay ~${DELAY_MS}ms · timeout ${TIMEOUT_MS}ms`,
  );

  let probed = 0;
  const seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    heartbeat(root, "hunt", {
      phase: "probe",
      probed,
      id: item.id,
      batch: queue.length,
    });
    const finding = await huntOne(item);
    latest.set(item.id, finding);
    probed += 1;

    // Only inject true never-probed newcomers — never re-queue the whole stale list.
    if (!onceId && RELOAD_EVERY > 0 && probed % RELOAD_EVERY === 0) {
      try {
        const freshList = loadWatchlist();
        const newcomers = freshList.filter((w) => !seen.has(w.id) && !latest.has(w.id));
        if (newcomers.length) {
          newcomers.sort((a, b) => seedPriority(a) - seedPriority(b));
          const room = Math.max(0, PASS_MAX - probed);
          const inject = newcomers.slice(0, room);
          if (inject.length) {
            const rest = queue.slice(i + 1).filter((w) => !seen.has(w.id));
            queue = [...queue.slice(0, i + 1), ...inject, ...rest].slice(0, i + 1 + room);
            console.log(`hunt reload · +${inject.length} awaiting · ${queue.length - i - 1} left in batch`);
          }
        }
      } catch (err) {
        console.error(`hunt reload skipped: ${err?.message || err}`);
      }
    }

    if (i < queue.length - 1) await sleep(jitter(DELAY_MS));
  }

  writeFileSync(
    join(outDir, "last-pass.json"),
    JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        probed,
        planned,
        batchMax: PASS_MAX,
        awaitingAtStart: awaiting,
        skippedFresh,
        watchSize: list.length,
      },
      null,
      2,
    ) + "\n",
  );
  heartbeat(root, "hunt", { phase: "idle", probed, planned });
  console.log(`pass done · probed ${probed}`);
}

if (rebuildIndex) {
  const idx = rebuildFindingsIndex(root);
  console.log(`rebuilt findings index · ${idx.count} ids`);
  if (!loop && !onceId) process.exit(0);
}

if (loop) {
  console.log(
    `hunt loop · passMax ${PASS_MAX} · pause ~${PASS_PAUSE_MS}ms · unprobed requery ${REQUERY_UNPROBED_MS}ms`,
  );
  for (;;) {
    try {
      await pass();
    } catch (err) {
      console.error(`hunt pass failed: ${err?.message || err}`);
      heartbeat(root, "hunt", { phase: "error", error: String(err?.message || err) });
    }
    console.log(`sleeping ~${PASS_PAUSE_MS}ms`);
    await sleep(jitter(PASS_PAUSE_MS));
  }
} else {
  await pass();
}
