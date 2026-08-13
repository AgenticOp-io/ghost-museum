#!/usr/bin/env node
/**
 * Refresh last-probe fields and reclassify walls (including banished).
 * GET only. Public URLs. No auth bypass.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeUrl, classifyWall, summarizeChain, formatProbeError } from "./lib/probe.mjs";
import { buildCensusPayload } from "./lib/census.mjs";
import { atomicWrite, atomicWriteJson } from "./lib/atomic-write.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "exhibits", "exhibits.json");
const sitePath = join(root, "site", "exhibits.json");
const censusPath = join(root, "site", "census.json");
const watchPath = join(root, "hunt", "watchlist.json");
const data = JSON.parse(readFileSync(path, "utf8"));
const ua = data.userAgent || "StillAnswering/0.1 (exhibit probe; +https://ghosts.agenticop.io/)";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeCensus(data) {
  const watch = existsSync(watchPath)
    ? JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []
    : [];
  const findingsPath = join(root, "hunt", "findings.jsonl");
  const findings = [];
  if (existsSync(findingsPath)) {
    for (const line of readFileSync(findingsPath, "utf8").split(/\r?\n/)) {
      if (!line) continue;
      try {
        findings.push(JSON.parse(line));
      } catch {
        /* skip */
      }
    }
  }
  let lastPass = null;
  try {
    const lp = join(root, "hunt", "last-pass.json");
    if (existsSync(lp)) lastPass = JSON.parse(readFileSync(lp, "utf8"));
  } catch {
    /* ignore */
  }
  const census = buildCensusPayload({
    museum: data.museum || "Still Answering",
    exhibits: data.exhibits || [],
    watch,
    findings,
    lastPass,
  });
  atomicWriteJson(censusPath, census);
  return census;
}

const probedAt = new Date().toISOString();
for (const ex of data.exhibits) {
  const prev = ex.wall;
  try {
    const r = await probeUrl(ex.probeUrl, ua);
    ex.httpStatus = r.httpStatus;
    ex.finalUrl = r.finalUrl;
    ex.redirectChain = r.redirectChain;
    if (r.titleTag) ex.titleTag = r.titleTag;
    if (r.tlsWarning) ex.tlsWarning = r.tlsWarning;
    else delete ex.tlsWarning;
    delete ex.probeError;
    const next = classifyWall(ex, r, null);
    ex.wall = next;
    ex.lastRecheckAt = probedAt;
    if (next === "banished" && prev !== "banished") {
      ex.banishedAt = probedAt;
      ex.previousWall = prev;
    }
    console.log(`${ex.id}\t${prev}→${next}\t${summarizeChain(r.redirectChain)}\t${r.finalUrl}${r.tlsWarning ? "\ttls:"+r.tlsWarning : ""}`);
  } catch (err) {
    ex.probeError = formatProbeError(err);
    ex.lastRecheckAt = probedAt;
    const next = classifyWall(ex, null, ex.probeError);
    ex.wall = next;
    if (next === "banished" && prev !== "banished") {
      ex.banishedAt = probedAt;
      ex.previousWall = prev;
    }
    console.error(`${ex.id}\t${prev}→${next}\tFAIL\t${ex.probeError}`);
  }
  await sleep(400);
}
data.probedAt = probedAt;
const json = JSON.stringify(data, null, 2) + "\n";
atomicWrite(path, json);
atomicWrite(sitePath, json);
const census = writeCensus(data);
console.log(`wrote ${path} @ ${probedAt} · census total=${census.total}`);
