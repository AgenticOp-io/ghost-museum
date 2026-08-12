#!/usr/bin/env node
/**
 * Bounded discovery — expand candidate seeds WITHOUT crawling the open web.
 *
 * Sources (closed set):
 *   1) Known sunset catalogs (killed-by-* JSON)
 *   2) Wikidata discontinued products with official websites
 *   3) Link harvest from obituaries we already cite (GET those pages only)
 *
 * Writes hunt/seeds/discovered.json for seed-watchlist / authority.
 * Never invents hung exhibits. Never auto-hangs.
 *
 *   npm run discover
 *   npm run discover -- --no-obituaries
 *   npm run discover -- --wikidata-only
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcesPath = join(root, "hunt", "discover-sources.json");
const seedsDir = join(root, "hunt", "seeds");
const outPath = join(seedsDir, "discovered.json");
const watchPath = join(root, "hunt", "watchlist.json");
const exhibitsPath = join(root, "exhibits", "exhibits.json");
const hintsPath = join(root, "hunt", "probe-hints.json");

const args = process.argv.slice(2);
const noObituaries = args.includes("--no-obituaries");
const wikidataOnly = args.includes("--wikidata-only");
const catalogsOnly = args.includes("--catalogs-only");

const UA =
  "StillAnswering-Discover/0.1 (+https://ghosts.agenticop.io/; bounded sunset catalogs; not a crawler)";

const DENY_HOST = /(?:^|\.)(facebook|fb|twitter|x|instagram|linkedin|youtube|youtu|tiktok|pinterest|reddit|doubleclick|google-analytics|googletagmanager|cookiebot|cloudflareinsights|schema|w3|creativecommons|wikimedia|mediawiki)\./i;

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchText(url, { timeoutMs = 25000 } = {}) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/json,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return { ct: res.headers.get("content-type") || "", text: await res.text(), finalUrl: res.url };
}

async function fetchJson(url) {
  const { text } = await fetchText(url, { timeoutMs: 45000 });
  return JSON.parse(text);
}

const sources = existsSync(sourcesPath)
  ? JSON.parse(readFileSync(sourcesPath, "utf8"))
  : { catalogs: [], wikidata: { enabled: true }, obituaries: { enabled: true } };

const knownIds = new Set();
const knownHosts = new Set();
const knownProbe = new Set();

function remember(row) {
  if (row?.id) knownIds.add(row.id);
  if (row?.probeUrl) {
    knownProbe.add(row.probeUrl);
    const h = hostOf(row.probeUrl);
    if (h) knownHosts.add(h);
  }
}

if (existsSync(exhibitsPath)) {
  for (const ex of JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits || []) remember(ex);
}
if (existsSync(watchPath)) {
  for (const w of JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []) remember(w);
}
if (existsSync(hintsPath)) {
  for (const h of JSON.parse(readFileSync(hintsPath, "utf8")).hints || []) remember(h);
}
if (existsSync(seedsDir)) {
  for (const name of readdirSync(seedsDir)) {
    if (!name.endsWith(".json") || name === "discovered.json") continue;
    try {
      const pack = JSON.parse(readFileSync(join(seedsDir, name), "utf8"));
      for (const s of pack.seeds || []) remember(s);
    } catch {
      /* skip */
    }
  }
}

const byId = new Map();
const stats = { catalogs: 0, wikidata: 0, obituaries: 0, skipped: 0, pages: 0 };

function addSeed(seed, via) {
  if (!seed?.id || !seed?.probeUrl || !seed?.obituary) {
    stats.skipped += 1;
    return false;
  }
  if (!isHttpUrl(seed.probeUrl) || !isHttpUrl(seed.obituary)) {
    stats.skipped += 1;
    return false;
  }
  const h = hostOf(seed.probeUrl);
  if (!h || DENY_HOST.test(h + ".")) {
    stats.skipped += 1;
    return false;
  }
  if (knownIds.has(seed.id) || knownProbe.has(seed.probeUrl)) {
    stats.skipped += 1;
    return false;
  }
  // Prefer not to re-add the exact same host unless path differs meaningfully
  if (byId.has(seed.id)) {
    stats.skipped += 1;
    return false;
  }
  byId.set(seed.id, {
    id: seed.id,
    title: seed.title || seed.id,
    probeUrl: seed.probeUrl,
    obituary: seed.obituary,
    owner: seed.owner || "Discovered",
    note: seed.note || `Discovered via ${via}. Probe before hang.`,
  });
  knownIds.add(seed.id);
  knownProbe.add(seed.probeUrl);
  knownHosts.add(h);
  stats[via] = (stats[via] || 0) + 1;
  return true;
}

function normalizeKbg(item, owner, catalogId) {
  if (!item?.name || !item?.link) return null;
  const s = slug(item.name);
  if (!s || s.length < 2) return null;
  // Prefer first-party-ish URLs already on the catalog entry when present
  let probeUrl = null;
  if (item.website && isHttpUrl(item.website)) probeUrl = item.website;
  else if (item.url && isHttpUrl(item.url)) probeUrl = item.url;
  else if (owner === "Google") probeUrl = `https://${s}.google.com/`;
  else if (owner === "Microsoft") probeUrl = `https://${s}.microsoft.com/`;
  else if (owner === "Apple") probeUrl = `https://www.apple.com/${s}/`;
  else probeUrl = `https://${s}.com/`;
  return {
    id: `disc-${catalogId}-${s}`,
    title: item.name,
    probeUrl,
    obituary: item.link,
    owner,
    note: `Catalog ${catalogId} (${item.dateClose || item.dateOpen || "unknown"}). Discovered — verify before hang.`,
  };
}

function normalizeKbap(item, owner, catalogId) {
  const link = item.refs?.[0]?.url || null;
  if (!item?.name || !link) return null;
  const s = slug(item.name);
  if (!s) return null;
  return {
    id: `disc-${catalogId}-${s}`,
    title: item.name,
    probeUrl: `https://www.apple.com/${s}/`,
    obituary: link,
    owner,
    note: `Catalog ${catalogId}. Discovered — verify before hang.`,
  };
}

/** 1) Sunset catalogs — closed URL list from discover-sources.json */
async function fromCatalogs() {
  if (wikidataOnly) return;
  for (const cat of sources.catalogs || []) {
    try {
      const data = await fetchJson(cat.url);
      const items = Array.isArray(data) ? data : [];
      console.log(`catalog ${cat.id}: ${items.length}`);
      for (const item of items) {
        const seed =
          cat.format === "kbap"
            ? normalizeKbap(item, cat.owner, cat.id)
            : normalizeKbg(item, cat.owner, cat.id);
        if (seed) addSeed(seed, "catalogs");
      }
    } catch (err) {
      console.warn(`catalog ${cat.id} skipped: ${err.message}`);
    }
  }
}

/** 2) Wikidata — structured discontinued products with official websites */
async function fromWikidata() {
  if (catalogsOnly) return;
  if (sources.wikidata?.enabled === false) return;
  const limit = Number(sources.wikidata?.limit || 400);
  const minYear = Number(sources.wikidata?.minYear || 2005);
  const query = `
SELECT DISTINCT ?item ?itemLabel ?website ?end WHERE {
  VALUES ?type { wd:Q7397 wd:Q15534553 wd:Q7889 wd:Q166142 }
  ?item wdt:P31/wdt:P279* ?type .
  ?item wdt:P856 ?website .
  { ?item wdt:P576 ?end } UNION { ?item wdt:P2669 ?end }
  FILTER(YEAR(?end) >= ${minYear})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`.trim();

  const url =
    "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
  try {
    const data = await fetchJson(url);
    const rows = data?.results?.bindings || [];
    console.log(`wikidata rows: ${rows.length}`);
    for (const row of rows) {
      const website = row.website?.value;
      const label = row.itemLabel?.value;
      const item = row.item?.value;
      const end = row.end?.value || "";
      if (!website || !label || !item) continue;
      if (!/^https?:/i.test(website)) continue;
      const id = `disc-wd-${slug(label)}`;
      addSeed(
        {
          id,
          title: label,
          probeUrl: website.endsWith("/") ? website : `${website}/`,
          obituary: item, // Wikidata entity is the citation; Wikipedia may also exist
          owner: "Wikidata",
          note: `Wikidata discontinued/dissolved (${String(end).slice(0, 10)}). Official website cited — verify funeral before hang.`,
        },
        "wikidata",
      );
    }
  } catch (err) {
    console.warn(`wikidata skipped: ${err.message}`);
  }
}

function collectObituaryUrls() {
  const urls = new Set();
  function take(u) {
    if (u && isHttpUrl(u)) urls.add(u);
  }
  if (existsSync(exhibitsPath)) {
    for (const ex of JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits || []) take(ex.obituary);
  }
  if (existsSync(watchPath)) {
    for (const w of JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []) {
      if (String(w.source || "").startsWith("seeds/") || w.source === "probe-hints") take(w.obituary);
    }
  }
  if (existsSync(seedsDir)) {
    for (const name of readdirSync(seedsDir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const pack = JSON.parse(readFileSync(join(seedsDir, name), "utf8"));
        for (const s of pack.seeds || []) take(s.obituary);
      } catch {
        /* skip */
      }
    }
  }
  return [...urls];
}

function extractLinks(html, baseUrl) {
  const out = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1], baseUrl).href;
      if (!/^https?:/i.test(abs)) continue;
      out.push(abs);
    } catch {
      /* skip */
    }
  }
  return out;
}

/** 3) Harvest product links only from obituaries we already cite */
async function fromObituaries() {
  if (wikidataOnly || catalogsOnly || noObituaries) return;
  if (sources.obituaries?.enabled === false) return;
  const maxPages = Number(sources.obituaries?.maxPages || 60);
  const maxLinks = Number(sources.obituaries?.maxLinksPerPage || 8);
  const pages = collectObituaryUrls().slice(0, maxPages);
  console.log(`obituary pages to fetch: ${pages.length}`);

  for (const obit of pages) {
    try {
      const { text, finalUrl } = await fetchText(obit, { timeoutMs: 20000 });
      stats.pages += 1;
      const links = extractLinks(text, finalUrl || obit);
      let added = 0;
      const seenHost = new Set();
      for (const link of links) {
        if (added >= maxLinks) break;
        const h = hostOf(link);
        if (!h || seenHost.has(h) || knownHosts.has(h) || DENY_HOST.test(h + ".")) continue;
        // Skip same host as the obituary itself (blog chrome)
        if (h === hostOf(obit)) continue;
        // Prefer short product-looking paths
        let path = "/";
        try {
          path = new URL(link).pathname || "/";
        } catch {
          continue;
        }
        if (path.length > 80) continue;
        if (/\.(pdf|zip|png|jpe?g|gif|svg|css|js)(\?|$)/i.test(path)) continue;
        seenHost.add(h);
        const id = `disc-obit-${slug(h)}`;
        if (
          addSeed(
            {
              id,
              title: h,
              probeUrl: `https://${h}/`,
              obituary: obit,
              owner: "Obituary harvest",
              note: "Linked from an already-cited funeral page. Discovered — verify product match before hang.",
            },
            "obituaries",
          )
        ) {
          added += 1;
        }
      }
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      console.warn(`obituary skip ${obit}: ${err.message}`);
    }
  }
}

await fromCatalogs();
await fromWikidata();
await fromObituaries();

mkdirSync(seedsDir, { recursive: true });
const seeds = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
const pack = {
  owner: "Discovered",
  purpose:
    "Bounded discovery from sunset catalogs, Wikidata, and links on already-cited obituaries. Not an open-web crawl. Probe before hang.",
  discoveredAt: new Date().toISOString(),
  stats,
  seeds,
};
writeFileSync(outPath, JSON.stringify(pack, null, 2) + "\n");
console.log(
  `discovered ${seeds.length} new seeds → ${outPath} (catalogs +${stats.catalogs || 0}, wikidata +${stats.wikidata || 0}, obituaries +${stats.obituaries || 0}, skipped ${stats.skipped}, pages ${stats.pages})`,
);
console.log("Next: npm run seed-watchlist:broad && npm run curate:desk");
