#!/usr/bin/env node
/**
 * Bounded funeral search — find shutdown posts via official search APIs.
 *
 * NOT an open-web crawl. NOT HTML scraping of Google/Bing SERPs.
 * Queries are templated from the ghost model: site:{learnedFuneralHost} + shutdown language.
 *
 * Providers (env keys required to execute):
 *   Google Programmable Search: GOOGLE_CSE_ID + GOOGLE_API_KEY
 *   Brave Search API:           BRAVE_SEARCH_API_KEY
 *   SerpAPI Bing:               SERPAPI_API_KEY  (Bing results via serpapi.com; not Microsoft's retired API)
 *
 * Bing Web Search API retired 2025-08-11 — use SerpAPI Bing or Brave/Google instead.
 *
 *   npm run search:seed -- --dry-run
 *   npm run search:seed
 *   npm run search:seed -- --provider brave --max 80
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { learnGhostModel, FUNERAL_KEYWORDS, hostOf, registrable } from "./lib/ghost-model.mjs";
import {
  buildSeedFitness,
  loadSeedFitness,
  saveSeedFitness,
  rankSearchQueries,
  rememberSearchQuery,
} from "./lib/seed-fitness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exhibitsPath = join(root, "exhibits", "exhibits.json");
const watchPath = join(root, "hunt", "watchlist.json");
const findingsPath = join(root, "hunt", "findings.jsonl");
const modelPath = join(root, "hunt", "ghost-model.json");
const fitnessPath = join(root, "hunt", "seed-fitness.json");
const seedsDir = join(root, "hunt", "seeds");
const outPath = join(seedsDir, "search.json");
const planPath = join(root, "hunt", "search-plan.json");
const quotaPath = join(root, "hunt", "search-quota.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const maxSeeds = (() => {
  const i = args.indexOf("--max");
  return i >= 0 ? Number(args[i + 1]) || 80 : 80;
})();
const maxQueries = (() => {
  const i = args.indexOf("--queries");
  return i >= 0 ? Number(args[i + 1]) || 24 : 24;
})();
const providerArg = (() => {
  const i = args.indexOf("--provider");
  return i >= 0 ? String(args[i + 1] || "auto") : "auto";
})();

/** SerpAPI free/low tiers — hard monthly API-call budget (default 25). */
const MONTHLY_BUDGET = Number(
  process.env.SERPAPI_MONTHLY_BUDGET || process.env.GM_SEARCH_MONTHLY_BUDGET || 25,
);

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function loadQuota() {
  const month = monthKey();
  let used = 0;
  let budget = MONTHLY_BUDGET;
  try {
    if (existsSync(quotaPath)) {
      const q = JSON.parse(readFileSync(quotaPath, "utf8"));
      if (q.month === month) used = Number(q.used) || 0;
      if (Number.isFinite(Number(q.budget)) && Number(q.budget) > 0) budget = Number(q.budget);
    }
  } catch {
    /* ignore */
  }
  return { month, used, budget, remaining: Math.max(0, budget - used) };
}

function saveQuota(q) {
  mkdirSync(join(root, "hunt"), { recursive: true });
  writeFileSync(
    quotaPath,
    JSON.stringify(
      {
        month: q.month,
        used: q.used,
        budget: q.budget,
        remaining: Math.max(0, q.budget - q.used),
        updatedAt: new Date().toISOString(),
        note: "Counts SerpAPI search calls only (not Brave/Google or page GETs).",
      },
      null,
      2,
    ) + "\n",
  );
}

const UA =
  "StillAnswering-SearchSeed/0.1 (+https://ghosts.agenticop.io/; funeral-host site: queries via official APIs; not a crawler)";

const SKIP_LINK =
  /twitter|x\.com|facebook|linkedin|youtube|instagram|tiktok|reddit|wikipedia|wikidata|googleusercontent|gstatic|schema\.org|w3\.org|googleapis|doubleclick|googletagmanager|developers\.google|support\.google|learn\.microsoft|docs\.microsoft|blogspot|blog\.|news\./i;

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function loadFindingsTail() {
  if (!existsSync(findingsPath)) return [];
  const raw = readFileSync(findingsPath, "utf8");
  const text = raw.length > 4_000_000 ? raw.slice(-4_000_000) : raw;
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

function knownSets() {
  const ids = new Set();
  const probes = new Set();
  const obituaries = new Set();
  function remember(row) {
    if (row?.id) ids.add(row.id);
    if (row?.probeUrl) probes.add(row.probeUrl);
    if (row?.obituary) obituaries.add(row.obituary);
  }
  if (existsSync(exhibitsPath)) {
    for (const ex of JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits || []) remember(ex);
  }
  if (existsSync(watchPath)) {
    for (const w of JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []) remember(w);
  }
  if (existsSync(seedsDir)) {
    for (const name of readdirSync(seedsDir)) {
      if (!name.endsWith(".json") || name === "search.json") continue;
      try {
        const pack = JSON.parse(readFileSync(join(seedsDir, name), "utf8"));
        for (const s of pack.seeds || []) remember(s);
      } catch {
        /* skip */
      }
    }
  }
  return { ids, probes, obituaries };
}

async function fetchText(url, timeoutMs = 20000) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/json,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return { text: await res.text(), finalUrl: res.url };
}

function extractHttpLinks(html, base) {
  const out = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1], base).href;
      if (/^https?:/i.test(abs)) out.push(abs);
    } catch {
      /* skip */
    }
  }
  return out;
}

function pickProbeLinks(links, funeralUrl) {
  const funeralHost = hostOf(funeralUrl);
  const funeralBase = registrable(funeralHost);
  const out = [];
  const seen = new Set();
  for (const link of links) {
    if (!isHttpUrl(link)) continue;
    const h = hostOf(link);
    if (!h || h === funeralHost) continue;
    if (SKIP_LINK.test(h)) continue;
    if (funeralBase && registrable(h) === funeralBase && /blog|news|press|developer|support|learn|docs/i.test(h)) {
      continue;
    }
    if (seen.has(link)) continue;
    seen.add(link);
    out.push(link);
    if (out.length >= 4) break;
  }
  return out;
}

function ownerFromFuneral(host) {
  const h = String(host || "");
  if (/google|youtube|angular|polymer/i.test(h)) return "Google";
  if (/microsoft|windows|xbox/i.test(h)) return "Microsoft";
  if (/apple/i.test(h)) return "Apple";
  if (/amazon|aws/i.test(h)) return "Amazon";
  if (/adobe/i.test(h)) return "Adobe";
  if (/fb\.|facebook|meta/i.test(h)) return "Meta";
  if (/github/i.test(h)) return "GitHub";
  return "Search";
}

/** Build site:-scoped queries — fitness-ranked when seed-fitness.json exists. */
export function buildSearchPlan(model, { maxQueries = 24, fitness = null } = {}) {
  if (fitness?.funeralHosts?.length) {
    return rankSearchQueries(fitness, model, { maxQueries });
  }
  const hosts = (model.funeralHosts || []).map((x) => x.host).filter(Boolean);
  const keywords = (model.keywords || FUNERAL_KEYWORDS).slice(0, 8);
  const queries = [];
  const seen = new Set();

  const core = ["shutting down", "end of support", "discontinued", "retirement", "sunset"];
  for (const host of hosts.slice(0, 14)) {
    for (const kw of core) {
      const q = `site:${host} "${kw}"`;
      if (seen.has(q)) continue;
      seen.add(q);
      queries.push({ q, host, keyword: kw, kind: "site-phrase", expected: 0 });
      if (queries.length >= maxQueries) return queries;
    }
  }

  for (const host of hosts.slice(0, 8)) {
    for (const kw of keywords.slice(0, 3)) {
      const q = `site:${host} ${kw}`;
      if (seen.has(q)) continue;
      seen.add(q);
      queries.push({ q, host, keyword: kw, kind: "site-loose", expected: 0 });
      if (queries.length >= maxQueries) return queries;
    }
  }

  return queries;
}

function resolveProvider() {
  const googleOk = Boolean(process.env.GOOGLE_CSE_ID && process.env.GOOGLE_API_KEY);
  const braveOk = Boolean(process.env.BRAVE_SEARCH_API_KEY);
  const serpapiOk = Boolean(process.env.SERPAPI_API_KEY);
  if (providerArg === "google") return googleOk ? "google" : null;
  if (providerArg === "brave") return braveOk ? "brave" : null;
  if (providerArg === "serpapi" || providerArg === "bing") return serpapiOk ? "serpapi" : null;
  if (providerArg === "auto") {
    if (braveOk) return "brave";
    if (serpapiOk) return "serpapi";
    if (googleOk) return "google";
    return null;
  }
  return null;
}

async function searchGoogle(q, count = 8) {
  const cx = process.env.GOOGLE_CSE_ID;
  const key = process.env.GOOGLE_API_KEY;
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", key);
  u.searchParams.set("cx", cx);
  u.searchParams.set("q", q);
  u.searchParams.set("num", String(Math.min(10, count)));
  const res = await fetch(u, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((it) => ({
    title: it.title || "",
    url: it.link,
    snippet: it.snippet || "",
  }));
}

async function searchBrave(q, count = 8) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", q);
  u.searchParams.set("count", String(Math.min(20, count)));
  const res = await fetch(u, {
    headers: {
      "user-agent": UA,
      accept: "application/json",
      "X-Subscription-Token": key,
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`brave ${res.status}`);
  const data = await res.json();
  return (data.web?.results || []).map((it) => ({
    title: it.title || "",
    url: it.url,
    snippet: it.description || "",
  }));
}

async function searchSerpapiBing(q, count = 8) {
  const key = process.env.SERPAPI_API_KEY;
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "bing");
  u.searchParams.set("q", q);
  u.searchParams.set("api_key", key);
  const res = await fetch(u, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`serpapi ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`serpapi: ${data.error}`);
  return (data.organic_results || []).slice(0, count).map((it) => ({
    title: it.title || "",
    url: it.link,
    snippet: it.snippet || "",
  }));
}

async function runQuery(provider, q) {
  if (provider === "google") return searchGoogle(q);
  if (provider === "brave") return searchBrave(q);
  if (provider === "serpapi") return searchSerpapiBing(q);
  throw new Error(`unknown provider ${provider}`);
}

const exhibits = existsSync(exhibitsPath)
  ? JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits || []
  : [];
const watch = existsSync(watchPath)
  ? JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []
  : [];
const findings = loadFindingsTail();
const model = existsSync(modelPath)
  ? JSON.parse(readFileSync(modelPath, "utf8"))
  : learnGhostModel({ exhibits, watch, findings });

const priorFitness = loadSeedFitness(fitnessPath);
let fitness = buildSeedFitness({
  exhibits,
  watch,
  findings,
  prior: priorFitness,
  searchHistory: priorFitness?.searchHistory || [],
});
saveSeedFitness(fitnessPath, fitness);

const plan = buildSearchPlan(model, { maxQueries, fitness });
mkdirSync(join(root, "hunt"), { recursive: true });
writeFileSync(
  planPath,
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      algorithm: "funeral-site-search-v2-fitness",
      note: "site:{high-fitness funeral host} + shutdown language. Ranked by seed-fitness.json.",
      providers: {
        brave: Boolean(process.env.BRAVE_SEARCH_API_KEY),
        google: Boolean(process.env.GOOGLE_CSE_ID && process.env.GOOGLE_API_KEY),
        serpapi: Boolean(process.env.SERPAPI_API_KEY),
        bingOfficial: false,
      },
      fitnessTop: fitness.top,
      queries: plan,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `search plan ${plan.length} queries → ${planPath} (fitness hosts: ${(fitness.top.funeralHosts || []).slice(0, 4).join(", ")})`,
);

if (dryRun) {
  for (const row of plan.slice(0, 12)) console.log(`  ${row.q}`);
  console.log("Dry-run only. Set BRAVE_SEARCH_API_KEY, SERPAPI_API_KEY, or GOOGLE_CSE_ID+GOOGLE_API_KEY, then: npm run search:seed");
  process.exit(0);
}

const provider = resolveProvider();
if (!provider) {
  console.warn(
    "search:seed skipped — no API key.\n" +
      "  Brave:   BRAVE_SEARCH_API_KEY\n" +
      "  SerpAPI: SERPAPI_API_KEY  (Bing via serpapi.com)\n" +
      "  Google:  GOOGLE_CSE_ID + GOOGLE_API_KEY\n" +
      "Dry-run plan is in hunt/search-plan.json. Docs: docs/SEARCH.md",
  );
  mkdirSync(seedsDir, { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        owner: "Search",
        purpose: "No provider configured this run.",
        searchedAt: new Date().toISOString(),
        algorithm: "funeral-site-search-v1",
        provider: null,
        stats: { queries: 0, hits: 0, pages: 0, seeds: 0, skipped: 0 },
        seeds: [],
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(0);
}

let quota = loadQuota();
let runPlan = plan;
if (provider === "serpapi") {
  if (quota.remaining <= 0) {
    console.warn(
      `search:seed skipped — SerpAPI monthly budget exhausted (${quota.used}/${quota.budget} in ${quota.month}).`,
    );
    saveQuota(quota);
    process.exit(0);
  }
  runPlan = plan.slice(0, Math.min(plan.length, maxQueries, quota.remaining));
  console.log(
    `SerpAPI quota ${quota.used}/${quota.budget} used · remaining ${quota.remaining} · this run ${runPlan.length}`,
  );
}

const { ids: knownIds, probes: knownProbes, obituaries: knownObits } = knownSets();
const candidates = new Map();
const stats = { queries: 0, hits: 0, pages: 0, seeds: 0, skipped: 0 };

function consider(seed) {
  if (!seed?.id || !seed?.probeUrl || !seed?.obituary) {
    stats.skipped += 1;
    return;
  }
  if (!isHttpUrl(seed.probeUrl) || !isHttpUrl(seed.obituary)) {
    stats.skipped += 1;
    return;
  }
  if (knownIds.has(seed.id) || knownProbes.has(seed.probeUrl) || knownObits.has(seed.obituary)) {
    stats.skipped += 1;
    return;
  }
  if (candidates.has(seed.id)) return;
  candidates.set(seed.id, seed);
  knownIds.add(seed.id);
  knownProbes.add(seed.probeUrl);
  knownObits.add(seed.obituary);
  stats.seeds += 1;
}

for (const row of runPlan) {
  if (candidates.size >= maxSeeds) break;
  if (provider === "serpapi") {
    quota = loadQuota();
    if (quota.remaining <= 0) {
      console.warn("SerpAPI budget hit mid-run — stopping.");
      break;
    }
  }
  const seedsBefore = stats.seeds;
  stats.queries += 1;
  let hits = [];
  try {
    hits = await runQuery(provider, row.q);
    if (provider === "serpapi") {
      quota.used += 1;
      saveQuota(quota);
    }
  } catch (err) {
    console.error(`query fail: ${row.q} · ${err.message || err}`);
    rememberSearchQuery(fitness, {
      q: row.q,
      host: row.host,
      keyword: row.keyword,
      hits: 0,
      seeds: 0,
      provider,
    });
    continue;
  }
  stats.hits += hits.length;
  console.log(
    `${hits.length} hits · ${row.q}${row.expected != null ? ` · ev=${row.expected}` : ""}`,
  );

  for (const hit of hits) {
    if (candidates.size >= maxSeeds) break;
    if (!isHttpUrl(hit.url)) continue;
    const h = hostOf(hit.url);
    // Keep results on the funeral host we searched (or same registrable).
    if (row.host && h !== row.host && registrable(h) !== registrable(row.host)) continue;
    if (knownObits.has(hit.url)) {
      stats.skipped += 1;
      continue;
    }

    stats.pages += 1;
    let links = [];
    try {
      const page = await fetchText(hit.url, 15000);
      links = pickProbeLinks(extractHttpLinks(page.text, page.finalUrl || hit.url), hit.url);
    } catch {
      /* page fetch failed — skip inventing probes */
      continue;
    }

    for (const probeUrl of links.slice(0, 2)) {
      const id = `search-${slug(hit.title || hostOf(probeUrl))}`.slice(0, 72);
      consider({
        id,
        title: (hit.title || id).slice(0, 120),
        probeUrl,
        obituary: hit.url,
        owner: ownerFromFuneral(row.host),
        note: `Search-seed via ${provider}: ${row.q}. Probe extracted from funeral page — verify before hang.`,
      });
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  rememberSearchQuery(fitness, {
    q: row.q,
    host: row.host,
    keyword: row.keyword,
    hits: hits.length,
    seeds: Math.max(0, stats.seeds - seedsBefore),
    provider,
  });
  await new Promise((r) => setTimeout(r, 500));
}

saveSeedFitness(fitnessPath, fitness);

const seeds = [...candidates.values()].slice(0, maxSeeds);
mkdirSync(seedsDir, { recursive: true });
const pack = {
  owner: "Search",
  purpose:
    "Bounded funeral-host search via official APIs (site: + shutdown language). Not SERP scraping. Not open-web crawl.",
  searchedAt: new Date().toISOString(),
  algorithm: "funeral-site-search-v1",
  provider,
  stats,
  seeds,
};
writeFileSync(outPath, JSON.stringify(pack, null, 2) + "\n");
console.log(
  `search:seed ${seeds.length} → ${outPath} (provider ${provider}, queries ${stats.queries}, hits ${stats.hits}, pages ${stats.pages}, skipped ${stats.skipped})`,
);
console.log("Next: npm run seed-watchlist:broad && npm run hang:auto");
