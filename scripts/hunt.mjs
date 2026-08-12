#!/usr/bin/env node
/**
 * Slow hunt bot — GET only, museum UA, never auto-hangs.
 * Probes a curated watchlist and writes findings for curator review.
 *
 *   node scripts/hunt.mjs              # one slow pass
 *   node scripts/hunt.mjs --loop       # keep going (sleep between passes)
 *   node scripts/hunt.mjs --once id    # single id
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const watchPath = join(root, "hunt", "watchlist.json");
const outDir = process.env.GM_HUNT_DIR || join(root, "hunt");
const findingsPath = join(outDir, "findings.jsonl");
const ua = "GhostMuseum-Hunt/0.1 (slow curator probe; +https://ghosts.agenticop.io/)";
const DELAY_MS = Number(process.env.GM_HUNT_DELAY_MS || 55_000);
const PASS_PAUSE_MS = Number(process.env.GM_HUNT_PASS_PAUSE_MS || 30 * 60_000);
const MAX_HOPS = 8;

mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(base) {
  return base + Math.floor(Math.random() * Math.min(20_000, base * 0.25));
}

async function probe(url) {
  const chain = [];
  let current = url;
  let titleTag = null;
  let bodyStatus = null;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": ua, accept: "*/*" },
      signal: AbortSignal.timeout(20000),
    });
    const loc = res.headers.get("location");
    const isRedirect = res.status >= 300 && res.status < 400 && loc;
    chain.push({
      url: current,
      status: res.status,
      ...(isRedirect ? { location: new URL(loc, current).href } : {}),
    });
    if (isRedirect) {
      current = new URL(loc, current).href;
      continue;
    }
    bodyStatus = res.status;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html") || ct.includes("application/xhtml")) {
      const text = await res.text();
      const m = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      titleTag = m ? m[1].trim().replace(/\s+/g, " ").slice(0, 160) : null;
    } else {
      await res.arrayBuffer();
    }
    break;
  }

  return {
    httpStatus: bodyStatus ?? chain.at(-1)?.status ?? null,
    finalUrl: chain.length ? chain[chain.length - 1].url : url,
    redirectChain: chain,
    titleTag,
  };
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
      autoHang: false,
      status: "pending-review",
    };
    appendFileSync(findingsPath, JSON.stringify(finding) + "\n");
    console.log(
      `${item.id}\t${finding.suggestedWall}\t${r.redirectChain.map((h) => h.status).join("→")}\t${r.finalUrl}`,
    );
    return finding;
  } catch (err) {
    const finding = {
      id: item.id,
      probeUrl: item.probeUrl,
      huntedAt: started,
      probeError: String(err.message || err),
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
