#!/usr/bin/env node
/**
 * Hunt bot - GET only, museum UA, never auto-hangs.
 * Probes a curated watchlist and writes findings for curator review.
 *
 *   node scripts/hunt.mjs              # one pass
 *   node scripts/hunt.mjs --loop       # keep going (short pause between passes)
 *   node scripts/hunt.mjs --once id    # single id
 *
 * Pace (defaults): ~1 probe/sec. Override with GM_HUNT_DELAY_MS / GM_HUNT_PASS_PAUSE_MS.
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

mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(base) {
  // Keep ~1/sec mean; small jitter only (do not stretch into multi-second gaps).
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

const args = process.argv.slice(2);
const loop = args.includes("--loop");
const onceIdx = args.indexOf("--once");
const onceId = onceIdx >= 0 ? args[onceIdx + 1] : null;

async function pass() {
  let list = loadWatchlist();
  if (onceId) list = list.filter((w) => w.id === onceId);
  console.log(`hunt pass ${list.length} targets · delay ~${DELAY_MS}ms · GET only · no auto-hang`);
  for (let i = 0; i < list.length; i++) {
    await huntOne(list[i]);
    if (i < list.length - 1) await sleep(jitter(DELAY_MS));
  }
  writeFileSync(
    join(outDir, "last-pass.json"),
    JSON.stringify({ finishedAt: new Date().toISOString(), count: list.length }, null, 2) + "\n",
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
