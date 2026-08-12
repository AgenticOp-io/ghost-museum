/**
 * Seed fitness — closed loop over funeral hosts, query phrases, and seed sources.
 * Rewards patterns that produce ghost-class contacts / hung frames; penalizes noise.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { isGhostWall, latestFindingsById } from "./census.mjs";
import { FUNERAL_KEYWORDS, hostOf } from "./ghost-model.mjs";

const GHOST_WALLS = new Set(["still-answering", "auth-ghost", "successor-facade"]);

function rate(wins, tries) {
  const t = Math.max(1, tries || 0);
  return (wins || 0) / t;
}

function fitnessScore({ wins = 0, hung = 0, tries = 0, fails = 0 }) {
  const w = wins + hung * 2;
  const t = Math.max(1, tries + fails);
  return w / t + Math.log1p(w) * 0.05 - (fails / Math.max(1, tries + fails)) * 0.25;
}

/**
 * Build fitness ledger from hung exhibits + latest findings (+ optional prior).
 */
export function buildSeedFitness({
  exhibits = [],
  watch = [],
  findings = [],
  prior = null,
  searchHistory = [],
} = {}) {
  const latest = latestFindingsById(findings);
  const watchById = new Map((watch || []).map((w) => [w.id, w]));

  const funeral = {};
  const keywords = {};
  const sources = {};
  const owners = {};

  function touch(bucket, key) {
    if (!key) return null;
    if (!bucket[key]) bucket[key] = { wins: 0, hung: 0, tries: 0, fails: 0 };
    return bucket[key];
  }

  for (const ex of exhibits || []) {
    const fh = hostOf(ex.obituary);
    const row = touch(funeral, fh);
    if (row) {
      row.hung += 1;
      row.wins += 1;
      row.tries += 1;
    }
    const own = touch(owners, ex.owner || "Unknown");
    if (own) {
      own.hung += 1;
      own.wins += 1;
      own.tries += 1;
    }
    const text = `${ex.title || ""} ${ex.note || ""} ${ex.obituary || ""}`.toLowerCase();
    for (const kw of FUNERAL_KEYWORDS) {
      if (text.includes(kw)) {
        const k = touch(keywords, kw);
        k.hung += 1;
        k.wins += 1;
        k.tries += 1;
      }
    }
  }

  for (const [id, f] of latest) {
    const w = watchById.get(id) || {};
    const src = String(w.source || f.source || "unknown");
    const srcKey = src.startsWith("seeds/")
      ? src
      : /discover|disc-/i.test(src)
        ? "discover"
        : /autoseed|^auto-/i.test(src)
          ? "autoseed"
          : /search/i.test(src)
            ? "search"
            : src;
    const srow = touch(sources, srcKey);
    if (srow) srow.tries += 1;

    const fh = hostOf(w.obituary || f.obituary);
    const frow = touch(funeral, fh);
    if (frow) frow.tries += 1;

    const own = touch(owners, w.owner || f.owner || "Unknown");
    if (own) own.tries += 1;

    if (f.probeError) {
      if (frow) frow.fails += 1;
      if (srow) srow.fails += 1;
      if (own) own.fails += 1;
      continue;
    }
    if (f.httpStatus == null) continue;

    const ghost = isGhostWall(f.suggestedWall) || GHOST_WALLS.has(f.suggestedWall);
    if (ghost) {
      if (frow) frow.wins += 1;
      if (srow) srow.wins += 1;
      if (own) own.wins += 1;
    } else {
      if (frow) frow.fails += 1;
      if (srow) srow.fails += 1;
    }
  }

  if (prior?.funeralHosts) {
    for (const row of prior.funeralHosts) {
      const cur = touch(funeral, row.host);
      if (cur && row.score > 0 && cur.tries === 0) {
        cur.wins += Math.max(0, Math.round(row.score * 2));
        cur.tries += 2;
      }
    }
  }

  function rankMap(bucket) {
    return Object.entries(bucket)
      .map(([key, st]) => ({
        key,
        ...st,
        yield: rate(st.wins + st.hung * 2, st.tries + st.fails),
        score: fitnessScore(st),
      }))
      .sort((a, b) => b.score - a.score || b.wins - a.wins)
      .slice(0, 60);
  }

  const funeralHosts = rankMap(funeral).map(({ key, ...rest }) => ({ host: key, ...rest }));
  const keywordRank = rankMap(keywords).map(({ key, ...rest }) => ({ keyword: key, ...rest }));
  const kwSet = new Set(keywordRank.map((k) => k.keyword));
  for (const kw of ["shutting down", "end of support", "discontinued", "retirement", "sunset"]) {
    if (!kwSet.has(kw)) {
      keywordRank.push({
        keyword: kw,
        wins: 1,
        hung: 0,
        tries: 2,
        fails: 0,
        yield: 0.5,
        score: 0.4,
      });
    }
  }
  keywordRank.sort((a, b) => b.score - a.score);

  const sourceRank = rankMap(sources).map(({ key, ...rest }) => ({ source: key, ...rest }));
  const ownerRank = rankMap(owners).map(({ key, ...rest }) => ({ owner: key, ...rest }));

  const history = Array.isArray(searchHistory)
    ? searchHistory
    : Array.isArray(prior?.searchHistory)
      ? prior.searchHistory
      : [];

  return {
    learnedAt: new Date().toISOString(),
    algorithm: "seed-fitness-v1",
    note: "Fitness from hung + ghost-class findings. Drives SerpAPI query pick and autoseed funeral-host order. Never invents probes.",
    funeralHosts,
    keywords: keywordRank.slice(0, 24),
    sources: sourceRank.slice(0, 30),
    owners: ownerRank.slice(0, 24),
    searchHistory: history.slice(-200),
    top: {
      funeralHosts: funeralHosts.slice(0, 8).map((h) => h.host),
      keywords: keywordRank.slice(0, 6).map((k) => k.keyword),
      sources: sourceRank.slice(0, 6).map((s) => s.source),
    },
  };
}

/** Rank site: queries by expected fitness; skip ones already used recently. */
export function rankSearchQueries(fitness, model, { maxQueries = 24, usedQueries = null } = {}) {
  const used = usedQueries || new Set((fitness?.searchHistory || []).map((h) => h.q));
  const hosts = (fitness?.funeralHosts?.length
    ? fitness.funeralHosts.map((h) => h.host)
    : (model?.funeralHosts || []).map((h) => h.host)
  )
    .filter(Boolean)
    // Knowledge bases are citations, not vendor funeral blogs — poor site: search yield.
    .filter((h) => !/wikidata\.org|wikipedia\.org|googleusercontent/i.test(h));

  const hostScore = new Map((fitness?.funeralHosts || []).map((h) => [h.host, h.score]));
  const kwList =
    fitness?.keywords?.length > 0
      ? fitness.keywords.map((k) => k.keyword)
      : ["shutting down", "end of support", "discontinued", "retirement", "sunset"];
  const kwScore = new Map((fitness?.keywords || []).map((k) => [k.keyword, k.score]));

  const scored = [];
  const seen = new Set();
  for (const host of hosts.slice(0, 20)) {
    for (const kw of kwList.slice(0, 8)) {
      const q = `site:${host} "${kw}"`;
      if (seen.has(q) || used.has(q)) continue;
      seen.add(q);
      const ev = (hostScore.get(host) ?? 0.3) * 0.65 + (kwScore.get(kw) ?? 0.3) * 0.35;
      scored.push({
        q,
        host,
        keyword: kw,
        kind: "site-phrase",
        expected: Number(ev.toFixed(4)),
      });
    }
  }
  scored.sort((a, b) => b.expected - a.expected || a.host.localeCompare(b.host));
  return scored.slice(0, maxQueries);
}

/** Prefer high-fitness funeral hosts for feeds/sitemaps. */
export function rankFuneralHosts(fitness, model, { limit = 18 } = {}) {
  if (fitness?.funeralHosts?.length) {
    return fitness.funeralHosts.slice(0, limit).map((h) => h.host);
  }
  return (model?.funeralHosts || []).slice(0, limit).map((h) => h.host);
}

export function loadSeedFitness(path) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    /* ignore */
  }
  return null;
}

export function saveSeedFitness(path, fitness) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(fitness, null, 2) + "\n");
}

/** Append a search query outcome into fitness history (mutates + returns). */
export function rememberSearchQuery(fitness, { q, host, keyword, hits = 0, seeds = 0, provider = null }) {
  const entry = {
    q,
    host,
    keyword,
    hits,
    seeds,
    provider,
    at: new Date().toISOString(),
  };
  const history = Array.isArray(fitness.searchHistory) ? fitness.searchHistory.slice() : [];
  history.push(entry);
  fitness.searchHistory = history.slice(-200);
  const fh = (fitness.funeralHosts || []).find((h) => h.host === host);
  if (fh) {
    fh.tries = (fh.tries || 0) + 1;
    if (seeds > 0) fh.wins = (fh.wins || 0) + 1;
    else if (hits === 0) fh.fails = (fh.fails || 0) + 1;
    fh.score = fitnessScore(fh);
  }
  const kw = (fitness.keywords || []).find((k) => k.keyword === keyword);
  if (kw) {
    kw.tries = (kw.tries || 0) + 1;
    if (seeds > 0) kw.wins = (kw.wins || 0) + 1;
    else if (hits === 0) kw.fails = (kw.fails || 0) + 1;
    kw.score = fitnessScore(kw);
  }
  return fitness;
}

export { fitnessScore };
