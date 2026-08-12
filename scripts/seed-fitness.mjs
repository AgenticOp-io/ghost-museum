#!/usr/bin/env node
/**
 * Rebuild hunt/seed-fitness.json from hung + findings.
 *   npm run seed:fitness
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSeedFitness,
  loadSeedFitness,
  saveSeedFitness,
} from "./lib/seed-fitness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exhibitsPath = join(root, "exhibits", "exhibits.json");
const watchPath = join(root, "hunt", "watchlist.json");
const findingsPath = join(root, "hunt", "findings.jsonl");
const outPath = join(root, "hunt", "seed-fitness.json");

function loadFindings() {
  if (!existsSync(findingsPath)) return [];
  const raw = readFileSync(findingsPath, "utf8");
  // Cap read for very large logs — keep last ~6MB
  const text = raw.length > 6_000_000 ? raw.slice(-6_000_000) : raw;
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return out;
}

const exhibits = existsSync(exhibitsPath)
  ? JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits || []
  : [];
const watch = existsSync(watchPath)
  ? JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []
  : [];
const findings = loadFindings();
const prior = loadSeedFitness(outPath);

const fitness = buildSeedFitness({
  exhibits,
  watch,
  findings,
  prior,
  searchHistory: prior?.searchHistory || [],
});
saveSeedFitness(outPath, fitness);

console.log(
  `seed-fitness → ${outPath} · hosts ${fitness.funeralHosts.length} · keywords ${fitness.keywords.length}`,
);
console.log(`top hosts: ${(fitness.top.funeralHosts || []).join(", ") || "(none)"}`);
console.log(`top keywords: ${(fitness.top.keywords || []).join(", ") || "(none)"}`);
console.log(`top sources: ${(fitness.top.sources || []).join(", ") || "(none)"}`);
