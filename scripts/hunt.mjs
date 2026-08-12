#!/usr/bin/env node
/**
 * Hunt bot - GET only, museum UA, never auto-hangs.
 * Probes a curated watchlist and writes findings for curator review.
 *
 *   node scripts/hunt.mjs              # one pass
 *   node scripts/hunt.mjs --loop       # keep going (short pause between passes)
 *   node scripts/hunt.mjs --once id    # single id
 *   node scripts/hunt.mjs --full       # re-probe even fresh findings
 *
 * Pace (defaults): ~1 probe/sec. Override with GM_HUNT_DELAY_MS / GM_HUNT_PASS_PAUSE_MS.
 * Fresh findings are skipped for GM_HUNT_REQUERY_MS (default 24h) so new awaiting drain first.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeUrl, formatProbeError } from "./lib/probe.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const watchPath = join(root, "hunt", "watchlist.json");
const outDir = process.env.GM_HUNT_DIR || join(root, "hunt");
const findingsPath = join(outDir, "findings.jsonl");
const ua = "GhostMuseum-Hunt/0.1 (curator probe; +https://ghosts.agenticop.io/)";
const DELAY_MS = Number(process.env.GM_HUNT_DELAY_MS || 1000);
const PASS_PAUSE_MS = Number(process.env.GM_HUNT_PASS_PAUSE_MS || 60_000);
const REQUERY_MS = Number(process.env.GM_HUNT_REQUERY_MS || 24 * 60 * 60 * 1000);
const RELOAD_EVERY = Number(process.env.GM_HUNT_RELOAD_EVERY || 40);

mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(base) {
  const spread = Math.min(200, Math.max(40, Math.floor(base * 0.15)));
  return base + Math.floor(Math.random() * spread);
}

async function probe(url) {
  return probeUrl(url, ua, { timeoutMs: Number(process.env.GM_HUNT_TIMEOUT_MS || 20_000) });
}

function suggestWall(r) {
  if (r.httpStatus == null) return "unprobed";
  if (r.redirectChain?.length > 1) return "successor-facade";
  if (r.httpStatus === 410) return "buried";
  if (r.httpStatus === 401 || r.httpStatus === 403) return "auth-ghost";
  if (r.httpStatus === 200) return "still-answering";
  return "unprobed";
}

/** Latest finding per id (full scan — findings.jsonl is append-only). */
function loadLatestFindings() {
  const byId = new Map();
  if (!existsSync(findingsPath)) return byId;
  const raw = readFileSync(findingsPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const f = JSON.parse(line);
      if (!f?.id) continue;
      const prev = byId.get(f.id);
      if (!prev || String(f.huntedAt || "") > String(prev.huntedAt || "")) byId.set(f.id, f);
    } catch {
      /* skip bad line */
    }
  }
  return byId;
}

function isFresh(finding, now = Date.now()) {
  if (!finding?.huntedAt) return false;
  const t = Date.parse(finding.huntedAt);
  if (!Number.isFinite(t)) return false;
  return now - t < REQUERY_MS;
}

async function huntOne(item) {
  const started = new Date().toISOString();
  try {
    const r = await probe(item.probeUrl);
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
    };
    appendFileSync(findingsPath, JSON.stringify(finding) + "\n");
    console.log(
      `${item.id}\t${finding.suggestedWall}\t${r.redirectChain.map((h) => h.status).join("→")}\t${r.finalUrl}${r.tlsWarning ? "\ttls:" + r.tlsWarning : ""}`,
    );
    return finding;
  } catch (err) {
    const finding = {
      id: item.id,
      probeUrl: item.probeUrl,
      huntedAt: started,
      probeError: formatProbeError(err),
      autoHang: false,
      status: "pending-review",
    };
    appendFileSync(findingsPath, JSON.stringify(finding) + "\n");
    console.error(`${item.id}\tFAIL\t${finding.probeError}`);
    return finding;
  }
}

function loadWatchlist() {
  if (!existsSync(watchPath)) throw new Error(`Missing ${watchPath}`);
  const data = JSON.parse(readFileSync(watchPath, "utf8"));
  if (!Array.isArray(data.watchlist)) throw new Error("watchlist.json needs watchlist[]");
  return data.watchlist.filter((w) => w?.probeUrl && w?.id);
}

/** Never-probed first, then stale; skip fresh unless --full. */
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
  return { queue: [...awaiting, ...stale], awaiting: awaiting.length, stale: stale.length, skippedFresh };
}

const args = process.argv.slice(2);
const loop = args.includes("--loop");
const full = args.includes("--full");
const onceIdx = args.indexOf("--once");
const onceId = onceIdx >= 0 ? args[onceIdx + 1] : null;

async function pass() {
  let latest = loadLatestFindings();
  let list = loadWatchlist();
  if (onceId) list = list.filter((w) => w.id === onceId);

  let { queue, awaiting, stale, skippedFresh } = planQueue(list, latest, { full });
  console.log(
    `hunt pass · queue ${queue.length} (awaiting ${awaiting} · stale ${stale} · skip-fresh ${skippedFresh}) · delay ~${DELAY_MS}ms · GET only`,
  );

  let probed = 0;
  const seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const finding = await huntOne(item);
    latest.set(item.id, finding);
    probed += 1;

    // Mid-pass: pull newly seeded awaiting so they don't wait for a 40m cycle.
    if (!onceId && RELOAD_EVERY > 0 && probed % RELOAD_EVERY === 0) {
      const freshList = loadWatchlist();
      const planned = planQueue(freshList, latest, { full });
      const newcomers = planned.queue.filter((w) => !seen.has(w.id));
      if (newcomers.length) {
        const rest = queue.slice(i + 1).filter((w) => !seen.has(w.id));
        queue = [...queue.slice(0, i + 1), ...newcomers, ...rest];
        console.log(`hunt reload · +${newcomers.length} awaiting injected · queue now ${queue.length - i - 1} left`);
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
        awaitingAtStart: awaiting,
        skippedFresh,
        watchSize: list.length,
      },
      null,
      2,
    ) + "\n",
  );
}

if (loop) {
  for (;;) {
    await pass();
    console.log(`pass done · sleeping ~${PASS_PAUSE_MS}ms`);
    await sleep(jitter(PASS_PAUSE_MS));
  }
} else {
  await pass();
}
