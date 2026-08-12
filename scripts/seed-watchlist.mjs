#!/usr/bin/env node
/**
 * Expand watchlist from:
 *  1) hunt/probe-hints.json (curated product → probeUrl)
 *  2) optional KilledByGoogle graveyard.json (obituaries only — never used as probeUrl)
 *
 * Does not invent hung exhibits. Only grows the hunt queue for slow probing.
 *
 *   node scripts/seed-watchlist.mjs
 *   node scripts/seed-watchlist.mjs --fetch-graveyard
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const watchPath = join(root, "hunt", "watchlist.json");
const hintsPath = join(root, "hunt", "probe-hints.json");
const exhibitsPath = join(root, "exhibits", "exhibits.json");
const fetchGraveyard = process.argv.includes("--fetch-graveyard");

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

const hung = new Set(
  JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits.map((e) => e.id),
);

const watch = existsSync(watchPath)
  ? JSON.parse(readFileSync(watchPath, "utf8"))
  : { museum: "Ghost Museum", watchlist: [] };
const byId = new Map(watch.watchlist.map((w) => [w.id, w]));

const hints = JSON.parse(readFileSync(hintsPath, "utf8"));
let graveyard = [];
if (fetchGraveyard) {
  const res = await fetch(
    "https://raw.githubusercontent.com/codyogden/killedbygoogle/main/graveyard.json",
    {
      headers: { "user-agent": "GhostMuseum-Seed/0.1 (watchlist seed; +https://ghosts.agenticop.io/)" },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!res.ok) throw new Error(`graveyard fetch ${res.status}`);
  graveyard = await res.json();
  console.log(`fetched graveyard ${graveyard.length}`);
}

const obitByName = new Map();
for (const g of graveyard) {
  if (g?.name && g?.link) obitByName.set(String(g.name).toLowerCase(), g);
}

let added = 0;
for (const h of hints.hints || []) {
  if (!h.probeUrl || !h.id) continue;
  if (hung.has(h.id) || byId.has(h.id)) continue;
  const g = h.matchName ? obitByName.get(String(h.matchName).toLowerCase()) : null;
  const entry = {
    id: h.id,
    title: h.title || h.id,
    probeUrl: h.probeUrl,
    obituary: h.obituary || g?.link || null,
    note:
      h.note ||
      (g
        ? `Seeded from KilledByGoogle (${g.dateClose || "unknown close"}). Probe before hang.`
        : "Curated probe hint. Probe before hang."),
  };
  if (!entry.obituary) {
    console.warn(`skip ${h.id}: no obituary`);
    continue;
  }
  byId.set(h.id, entry);
  added++;
}

watch.museum = "Ghost Museum";
watch.purpose =
  "Curator watchlist for the slow hunt bot. Findings never auto-hang. Seeded from probe-hints (+ optional KilledByGoogle obituaries).";
watch.updatedAt = new Date().toISOString();
watch.watchlist = [...byId.values()];
writeFileSync(watchPath, JSON.stringify(watch, null, 2) + "\n");
console.log(`watchlist ${watch.watchlist.length} (+${added} new)`);
