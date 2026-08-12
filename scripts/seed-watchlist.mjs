#!/usr/bin/env node
/**
 * Expand watchlist from curated hints, multi-vendor seeds, and optional catalogs.
 *
 *   node scripts/seed-watchlist.mjs              # probe-hints only (merge)
 *   node scripts/seed-watchlist.mjs --broad      # hints + seeds/* only (REBUILD) — no invented hosts
 *   node scripts/seed-watchlist.mjs --deep       # broad + single guessed catalog host (noisy)
 *   node scripts/seed-watchlist.mjs --vast       # multi-host fan-out (avoid)
 *
 * Does not invent hung exhibits. Never auto-hangs.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const watchPath = join(root, "hunt", "watchlist.json");
const hintsPath = join(root, "hunt", "probe-hints.json");
const seedsDir = join(root, "hunt", "seeds");
const extraPath = join(root, "hunt", "extra-hints.json");
const exhibitsPath = join(root, "exhibits", "exhibits.json");

const broad = process.argv.includes("--broad");
const vast = process.argv.includes("--vast");
const deep = process.argv.includes("--deep") || vast; // NOT implied by --broad
const fetchRemote = process.argv.includes("--fetch-graveyard") || deep || vast;
const rebuild = broad || deep || vast || process.argv.includes("--rebuild");

const UA = "StillAnswering-Seed/0.5 (watchlist seed; +https://ghosts.agenticop.io/)";

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function productSlug(name) {
  return slug(name).replace(
    /^(google|youtube|android|chrome|microsoft|apple|meta|amazon|openai|yahoo|adobe)-/,
    "",
  );
}

function googlePatterns(s) {
  return [
    ["sub", `https://${s}.google.com/`],
    ["www", `https://www.google.com/${s}/`],
    ["with", `https://${s}.withgoogle.com/`],
    ["appspot", `https://${s}.appspot.com/`],
    ["dev", `https://developers.google.com/${s}/`],
    ["support", `https://support.google.com/${s}/`],
    ["cloud", `https://cloud.google.com/${s}`],
    ["apis", `https://${s}.googleapis.com/`],
    ["docs", `https://docs.google.com/${s}`],
    ["workspace", `https://workspace.google.com/${s}`],
  ];
}

function startupPatterns(s) {
  return [
    ["com", `https://${s}.com/`],
    ["www", `https://www.${s}.com/`],
    ["app", `https://app.${s}.com/`],
    ["api", `https://api.${s}.com/`],
    ["io", `https://${s}.io/`],
    ["ai", `https://${s}.ai/`],
  ];
}

function microsoftPatterns(s) {
  return [
    ["com", `https://${s}.microsoft.com/`],
    ["www", `https://www.microsoft.com/en-us/${s}`],
    ["azure", `https://${s}.azurewebsites.net/`],
  ];
}

function applePatterns(s) {
  return [
    ["www", `https://www.apple.com/${s}/`],
    ["support", `https://support.apple.com/${s}`],
  ];
}

function upsert(byId, entry, counters) {
  if (!entry?.id || !entry?.probeUrl || !entry?.obituary) return false;
  try {
    const u = new URL(entry.probeUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (!u.hostname.includes(".")) return false;
  } catch {
    return false;
  }
  const prev = byId.get(entry.id);
  if (!prev) counters.added += 1;
  else counters.updated += 1;
  byId.set(entry.id, {
    id: entry.id,
    title: entry.title || entry.id,
    probeUrl: entry.probeUrl,
    obituary: entry.obituary,
    owner: entry.owner || prev?.owner || null,
    note: entry.note || prev?.note || "Watchlist candidate. Probe before hang.",
    source: entry.source || prev?.source || "seed",
  });
  return true;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function loadSeedPacks() {
  if (!existsSync(seedsDir)) return [];
  return readdirSync(seedsDir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((name) => {
      const pack = JSON.parse(readFileSync(join(seedsDir, name), "utf8"));
      return { file: name, owner: pack.owner || name, seeds: pack.seeds || [] };
    });
}

const hung = new Set(
  JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits.map((e) => e.id),
);

const watch = existsSync(watchPath)
  ? JSON.parse(readFileSync(watchPath, "utf8"))
  : { museum: "Still Answering", watchlist: [] };

const byId = rebuild ? new Map() : new Map(watch.watchlist.map((w) => [w.id, w]));
const counters = {
  added: 0,
  updated: 0,
  proposed: 0,
  skipped: 0,
  packs: 0,
  packSeeds: 0,
  catalogs: 0,
};

const hints = JSON.parse(readFileSync(hintsPath, "utf8"));
const catalogs = [];

if (fetchRemote) {
  try {
    const kbg = await fetchJson(
      "https://raw.githubusercontent.com/codyogden/killedbygoogle/main/graveyard.json",
    );
    catalogs.push({ key: "kbg", items: kbg, family: "google" });
    console.log(`fetched killedbygoogle ${kbg.length}`);
  } catch (err) {
    console.warn(`killedbygoogle skipped: ${err.message}`);
  }

  try {
    const kbai = await fetchJson("https://mixtpatrik.github.io/killedbyai/graveyard.json");
    catalogs.push({ key: "kbai", items: kbai, family: "startup" });
    console.log(`fetched killedbyai ${kbai.length}`);
  } catch (err) {
    console.warn(`killedbyai skipped: ${err.message}`);
  }

  try {
    const ms = await fetchJson(
      "https://raw.githubusercontent.com/fabianoriccardi/killed-by-microsoft/main/graveyard.json",
    );
    catalogs.push({ key: "kbms", items: ms, family: "microsoft" });
    console.log(`fetched killed-by-microsoft ${ms.length}`);
  } catch (err) {
    console.warn(`killed-by-microsoft skipped: ${err.message}`);
  }

  try {
    const apple = await fetchJson(
      "https://raw.githubusercontent.com/TheDen/killed-by-apple/main/products.json",
    );
    const normalized = apple.map((p) => ({
      name: p.name,
      type: (p.cats || []).includes("Hardware") ? "hardware" : "service",
      link: p.refs?.[0]?.url || null,
      dateClose: p.died ? `${p.died}-01-01` : null,
    }));
    catalogs.push({ key: "kbap", items: normalized, family: "apple" });
    console.log(`fetched killed-by-apple ${normalized.length}`);
  } catch (err) {
    console.warn(`killed-by-apple skipped: ${err.message}`);
  }

  counters.catalogs = catalogs.length;
}

const obitByName = new Map();
for (const cat of catalogs) {
  for (const g of cat.items) {
    if (g?.name && g?.link) obitByName.set(String(g.name).toLowerCase(), g);
  }
}

// 1) Curated hints
for (const h of hints.hints || []) {
  if (!h.probeUrl || !h.id) {
    counters.skipped += 1;
    continue;
  }
  const g = h.matchName ? obitByName.get(String(h.matchName).toLowerCase()) : null;
  const obituary = h.obituary || g?.link || null;
  if (!obituary) {
    console.warn(`skip ${h.id}: no obituary`);
    counters.skipped += 1;
    continue;
  }
  upsert(
    byId,
    {
      id: h.id,
      title: h.title || h.id,
      probeUrl: h.probeUrl,
      obituary,
      owner: h.owner || "Curated",
      source: "probe-hints",
      note:
        h.note ||
        (hung.has(h.id)
          ? "Already hung in hall - keep on watchlist for re-probe only."
          : "Curated probe hint. Probe before hang."),
    },
    counters,
  );
}

// 2) Multi-vendor seed packs (honest breadth)
for (const pack of loadSeedPacks()) {
  counters.packs += 1;
  for (const s of pack.seeds) {
    counters.packSeeds += 1;
    upsert(
      byId,
      {
        ...s,
        owner: s.owner || pack.owner,
        source: `seeds/${pack.file}`,
        note: s.note || `Seed pack ${pack.file}. Probe before hang.`,
      },
      counters,
    );
  }
}

// 3) Optional local expansions
if (existsSync(extraPath)) {
  const extra = JSON.parse(readFileSync(extraPath, "utf8"));
  for (const h of extra.hints || []) {
    upsert(
      byId,
      {
        ...h,
        source: "extra-hints",
        note: h.note || "Extra hint. Probe before hang.",
      },
      counters,
    );
  }
}

function patternsFor(family, s, type) {
  if (family === "google") {
    if (type === "hardware") return googlePatterns(s).filter(([k]) => k === "support" || k === "www");
    return vast ? googlePatterns(s) : googlePatterns(s).slice(0, 1);
  }
  if (family === "microsoft") {
    return vast ? microsoftPatterns(s) : microsoftPatterns(s).slice(0, 1);
  }
  if (family === "apple") {
    if (type === "hardware") return applePatterns(s).filter(([k]) => k === "support");
    return vast ? applePatterns(s) : applePatterns(s).slice(0, 1);
  }
  return vast ? startupPatterns(s) : startupPatterns(s).slice(0, 1);
}

// 4) Catalog products → candidate probe hosts (deep/broad = 1 host; vast = fan-out)
if (deep || vast) {
  for (const cat of catalogs) {
    for (const g of cat.items) {
      if (!g?.name || !g?.link) {
        counters.skipped += 1;
        continue;
      }
      const type = String(g.type || "service").toLowerCase();
      if (type === "hardware" && cat.family === "google" && !vast) {
        counters.skipped += 1;
        continue;
      }
      const s = productSlug(g.name);
      if (!s || s.length < 2 || !/^[a-z0-9-]+$/.test(s)) {
        counters.skipped += 1;
        continue;
      }
      const patterns = patternsFor(cat.family, s, type);
      for (const [kind, probeUrl] of patterns) {
        const id = vast || patterns.length > 1 ? `${cat.key}-${s}-${kind}` : `${cat.key}-${s}`;
        if (byId.has(id)) continue;
        counters.proposed += 1;
        upsert(
          byId,
          {
            id,
            title: patterns.length > 1 ? `${g.name} (${kind})` : g.name,
            probeUrl,
            obituary: g.link,
            owner:
              cat.family === "google"
                ? "Google"
                : cat.family === "microsoft"
                  ? "Microsoft"
                  : cat.family === "apple"
                    ? "Apple"
                    : "Startup",
            source: `${cat.key}-${vast ? "vast" : "deep"}`,
            note: `Catalog seed from ${cat.key} (${g.dateClose || "unknown close"}, ${type}). Candidate “${kind}” — hunt must verify.`,
          },
          counters,
        );
      }
    }
  }
}

const owners = {};
const sources = {};
for (const w of byId.values()) {
  const o = w.owner || "Unknown";
  owners[o] = (owners[o] || 0) + 1;
  const s = w.source || "unknown";
  sources[s] = (sources[s] || 0) + 1;
}

watch.museum = "Still Answering";
watch.purpose =
  "Curator watchlist (~1 probe/sec). Prefer --broad (hints + seeds with real probe URLs). --deep/--vast invent catalog hosts and flood ENOTFOUND — opt-in only.";
watch.updatedAt = new Date().toISOString();
watch.seedMode = vast ? "vast" : deep ? "deep" : broad ? "broad" : "hints";
watch.owners = owners;
watch.sources = sources;
watch.watchlist = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(watchPath, JSON.stringify(watch, null, 2) + "\n");
console.log(
  `watchlist ${watch.watchlist.length} (+${counters.added} new, ~${counters.updated} refreshed, packs=${counters.packs}/${counters.packSeeds}, proposed=${counters.proposed}, skipped=${counters.skipped}, catalogs=${counters.catalogs}, mode=${watch.seedMode}, rebuild=${rebuild})`,
);
console.log(
  "owners",
  Object.entries(owners)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => `${k}:${v}`)
    .join(" · "),
);
