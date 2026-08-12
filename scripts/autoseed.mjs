#!/usr/bin/env node
/**
 * Autoseed — learn how ghosts get reported, then expand seeds inside those bounds.
 *
 * Learns from hung exhibits + ghost-class hunt findings:
 *   - which funeral hosts cite sunsets
 *   - which probe URL shapes actually answer as ghosts
 *   - keyword language of obituaries
 *
 * Then:
 *   1) Writes hunt/ghost-model.json (the learned model)
 *   2) Polls RSS/Atom on learned funeral hosts for new shutdown posts
 *   3) Scores catalog/discovered leftovers with the model
 *   4) Writes hunt/seeds/autoseed.json
 *
 * Never invents hung exhibits. Never auto-hangs. Not an open-web crawl.
 *
 *   npm run autoseed
 *   npm run authority   # includes autoseed
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  learnGhostModel,
  scoreAutoseedCandidate,
  FUNERAL_KEYWORDS,
  hostOf,
  registrable,
} from "./lib/ghost-model.mjs";
import { latestFindingsById } from "./lib/census.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exhibitsPath = join(root, "exhibits", "exhibits.json");
const watchPath = join(root, "hunt", "watchlist.json");
const findingsPath = join(root, "hunt", "findings.jsonl");
const seedsDir = join(root, "hunt", "seeds");
const modelPath = join(root, "hunt", "ghost-model.json");
const outPath = join(seedsDir, "autoseed.json");
const discoveredPath = join(seedsDir, "discovered.json");

const UA =
  "StillAnswering-Autoseed/0.1 (+https://ghosts.agenticop.io/; funeral-host feeds only; not a crawler)";

const args = process.argv.slice(2);
const minScore = (() => {
  const i = args.indexOf("--min-score");
  return i >= 0 ? Number(args[i + 1]) || 28 : 28;
})();
const maxSeeds = (() => {
  const i = args.indexOf("--max");
  return i >= 0 ? Number(args[i + 1]) || 200 : 200;
})();
const skipFeeds = args.includes("--no-feeds");

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

function loadFindings() {
  if (!existsSync(findingsPath)) return [];
  const raw = readFileSync(findingsPath, "utf8");
  // Tail large files — latest findings matter most for learning.
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
  function remember(row) {
    if (row?.id) ids.add(row.id);
    if (row?.probeUrl) probes.add(row.probeUrl);
  }
  if (existsSync(exhibitsPath)) {
    for (const ex of JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits || []) remember(ex);
  }
  if (existsSync(watchPath)) {
    for (const w of JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []) remember(w);
  }
  if (existsSync(seedsDir)) {
    for (const name of readdirSync(seedsDir)) {
      if (!name.endsWith(".json") || name === "autoseed.json") continue;
      try {
        const pack = JSON.parse(readFileSync(join(seedsDir, name), "utf8"));
        for (const s of pack.seeds || []) remember(s);
      } catch {
        /* skip */
      }
    }
  }
  return { ids, probes };
}

async function fetchText(url, timeoutMs = 20000) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,text/html,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return { text: await res.text(), finalUrl: res.url };
}

function feedCandidates(host) {
  const h = host.replace(/^www\./, "");
  const https = `https://${h}`;
  return [
    `${https}/rss/`,
    `${https}/feed/`,
    `${https}/feed.xml`,
    `${https}/atom.xml`,
    `${https}/feeds/posts/default?alt=rss`,
    `${https}/index.xml`,
  ];
}

function parseFeedItems(xml) {
  const items = [];
  const blocks = [
    ...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...String(xml).matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ];
  for (const m of blocks) {
    const block = m[0];
    const title =
      (block.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
        block.match(/<title[^>]*>([^<]+)<\/title>/i) ||
        [])[1]?.trim() || "";
    const link =
      (block.match(/<link[^>]*href=["']([^"']+)["']/i) ||
        block.match(/<link[^>]*>([^<]+)<\/link>/i) ||
        [])[1]?.trim() || "";
    const summary =
      (block.match(/<summary[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/summary>/i) ||
        block.match(/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ||
        block.match(/<content[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/content>/i) ||
        block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
        [])[1] || "";
    if (!title || !link) continue;
    items.push({ title: title.replace(/\s+/g, " "), link, summary: summary.slice(0, 4000) });
  }
  return items;
}

function hasFuneralLanguage(text) {
  const t = String(text || "").toLowerCase();
  return FUNERAL_KEYWORDS.some((k) => t.includes(k));
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

const SKIP_LINK_HOST =
  /twitter|x\.com|facebook|linkedin|youtube|instagram|tiktok|reddit|medium\.com|substack|wikipedia|wikidata|googleusercontent|gstatic|schema\.org|w3\.org|googleapis|doubleclick|googletagmanager|developers\.google|developer\.|cloud\.google|support\.google|learn\.microsoft|docs\.microsoft|techcommunity\.microsoft|github\.blog|blog\.|news\.|press\.|blogspot/i;

/** Real product/service URLs only — never invent hosts from titles. */
function pickProbeLinks(links, funeralUrl) {
  const funeralHost = hostOf(funeralUrl);
  const funeralBase = registrable(funeralHost);
  const out = [];
  const seen = new Set();
  for (const link of links) {
    if (!isHttpUrl(link)) continue;
    const h = hostOf(link);
    if (!h || h === funeralHost) continue;
    if (SKIP_LINK_HOST.test(h)) continue;
    // Same blog family (googleblog ↔ blog.google) is still funeral chrome.
    if (funeralBase && registrable(h) === funeralBase && /blog|news|press|developer|support|learn|docs/i.test(h)) {
      continue;
    }
    // Apex docs hubs are not product ghosts.
    if (/^(developers|developer|support|docs|learn|cloud)\./i.test(h)) continue;
    if (seen.has(link)) continue;
    seen.add(link);
    out.push(link);
    if (out.length >= 6) break;
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
  if (/twitter|x\.com/i.test(h)) return "X";
  if (/github/i.test(h)) return "GitHub";
  if (/heroku/i.test(h)) return "Heroku";
  return "Autoseed";
}

/** Product-like token only — reject sentence slugs from funeral paths. */
function productToken(titleOrSlug) {
  let raw = slug(titleOrSlug)
    .replace(/^(google|microsoft|apple|amazon|meta|yahoo|adobe|kb[a-z]+|disc|auto|sm|retry|alt|killedby[a-z]*|obit)-/, "")
    .replace(
      /^(discontinuing|discontinued|shutting|shutdown|goodbye|farewell|retiring|retirement|sunsetting|end-of-life|end-of-support)-/,
      "",
    )
    .replace(/^-|-$/g, "");
  if (!raw || raw.length < 2 || raw.length > 32) return "";
  const parts = raw.split("-").filter((p) => p && !/^(the|a|an|and|for|of|to|on|in|with|from)$/.test(p));
  if (parts.length > 2) raw = parts.slice(0, 2).join("-");
  else raw = parts.join("-");
  if (!raw || raw.length < 2) return "";
  if (
    /discontinu|shutting|goodbye|farewell|retiring|sunset|end-of|authorization|javascript|platform|library|support-for|blogspot|obit|disc-|com$|net$|org$/.test(
      raw,
    )
  ) {
    return "";
  }
  return raw;
}

function tokenFromSeed(seed) {
  const fromProbe = hostOf(seed?.probeUrl).split(".")[0] || "";
  if (fromProbe && fromProbe.length >= 2 && fromProbe.length <= 28 && !/blog|news|www|support|developer/.test(fromProbe)) {
    const t = productToken(fromProbe);
    if (t) return t;
  }
  return productToken(seed?.title || seed?.id || "");
}

const exhibits = existsSync(exhibitsPath)
  ? JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits || []
  : [];
const watch = existsSync(watchPath)
  ? JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []
  : [];
const findings = loadFindings();
const latest = latestFindingsById(findings);
const model = learnGhostModel({ exhibits, watch, findings });
mkdirSync(join(root, "hunt"), { recursive: true });
writeFileSync(modelPath, JSON.stringify(model, null, 2) + "\n");
console.log(
  `model → ${modelPath} (examples ${model.exampleCount}, funeralHosts ${model.funeralHosts.length})`,
);

const { ids: knownIds, probes: knownProbes } = knownSets();
const candidates = new Map();
const stats = {
  feeds: 0,
  feedItems: 0,
  feedHits: 0,
  sitemaps: 0,
  sitemapHits: 0,
  retries: 0,
  rescored: 0,
  kept: 0,
  skipped: 0,
};

function looksInventedProbe(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (SKIP_LINK_HOST.test(host)) return true;
    if (/^(developers|developer|support|docs|learn|cloud)\./i.test(host)) return true;
    const label = host.split(".")[0] || "";
    if (label.length > 28) return true;
    if ((label.match(/-/g) || []).length >= 3) return true;
    if (/discontinu|shutting|goodbye|farewell|end-of-life|authorization-support|blogspot/.test(label)) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function consider(seed, via) {
  if (!seed?.id || !seed?.probeUrl || !seed?.obituary) {
    stats.skipped += 1;
    return;
  }
  if (!isHttpUrl(seed.probeUrl) || !isHttpUrl(seed.obituary)) {
    stats.skipped += 1;
    return;
  }
  if (looksInventedProbe(seed.probeUrl)) {
    stats.skipped += 1;
    return;
  }
  if (knownIds.has(seed.id) || knownProbes.has(seed.probeUrl)) {
    stats.skipped += 1;
    return;
  }
  const scored = scoreAutoseedCandidate(seed, model);
  if (scored.score < minScore) {
    stats.skipped += 1;
    return;
  }
  const prev = candidates.get(seed.id);
  if (prev && prev._score >= scored.score) return;
  candidates.set(seed.id, {
    ...seed,
    note: `${seed.note || "Autoseed candidate."} [score ${scored.score}: ${scored.reasons.slice(0, 3).join("; ")}]`,
    _score: scored.score,
    _via: via,
    _reasons: scored.reasons,
  });
  knownProbes.add(seed.probeUrl);
  knownIds.add(seed.id);
}

/** Poll RSS/Atom only on learned funeral hosts. */
async function fromFuneralFeeds() {
  if (skipFeeds) return;
  const hosts = (model.funeralHosts || []).slice(0, 18).map((x) => x.host);
  for (const host of hosts) {
    let xml = null;
    let feedUrl = null;
    for (const url of feedCandidates(host)) {
      try {
        const res = await fetchText(url, 15000);
        if (/<rss\b|<feed\b/i.test(res.text)) {
          xml = res.text;
          feedUrl = res.finalUrl || url;
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!xml) continue;
    stats.feeds += 1;
    const items = parseFeedItems(xml).slice(0, 40);
    stats.feedItems += items.length;
    for (const item of items) {
      const blob = `${item.title}\n${item.summary}`;
      if (!hasFuneralLanguage(blob)) continue;
      stats.feedHits += 1;
      const obituary = item.link;
      let links = pickProbeLinks(extractHttpLinks(item.summary, obituary), obituary);
      if (!links.length) {
        try {
          const page = await fetchText(obituary, 15000);
          links = pickProbeLinks(extractHttpLinks(page.text, page.finalUrl || obituary), obituary);
        } catch {
          /* no invent */
        }
      }
      for (const probeUrl of links.slice(0, 3)) {
        const id = `auto-${slug(item.title)}-${slug(hostOf(probeUrl) || "x")}`.slice(0, 72);
        consider(
          {
            id,
            title: item.title.slice(0, 120),
            probeUrl,
            obituary,
            owner: ownerFromFuneral(host),
            note: `Autoseed from funeral feed ${feedUrl}. Probe URL extracted from post — verify before hang.`,
          },
          "feed",
        );
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

function alternateProbes(titleOrSlug, owner, funeralHost) {
  const raw = productToken(titleOrSlug);
  if (!raw) return [];
  const o = String(owner || ownerFromFuneral(funeralHost) || "").toLowerCase();
  const out = [];
  const push = (u) => {
    if (u && !knownProbes.has(u) && !looksInventedProbe(u)) out.push(u);
  };
  if (o.includes("google") || /google|youtube/.test(String(funeralHost || ""))) {
    push(`https://${raw}.google.com/`);
    push(`https://www.google.com/${raw}/`);
    push(`https://${raw}.withgoogle.com/`);
  } else if (o.includes("microsoft") || /microsoft|windows|xbox/.test(String(funeralHost || ""))) {
    push(`https://www.microsoft.com/en-us/${raw}`);
    push(`https://${raw}.microsoft.com/`);
  } else if (o.includes("apple")) {
    push(`https://www.apple.com/${raw}/`);
  } else if (o.includes("amazon") || /amazon|aws/.test(String(funeralHost || ""))) {
    push(`https://aws.amazon.com/${raw}/`);
    push(`https://www.amazon.com/${raw}`);
  } else if (o.includes("adobe")) {
    push(`https://www.adobe.com/products/${raw}.html`);
  } else if (o.includes("github")) {
    push(`https://${raw}.github.io/`);
  }
  return out;
}

/** Re-probe shapes for watch rows that failed DNS/TLS — learned templates only. */
function fromFailedRetries() {
  for (const w of watch) {
    const f = latest.get(w.id);
    if (!f?.probeError) continue;
    if (!/ENOTFOUND|certificate|UNABLE_TO_VERIFY|timeout/i.test(f.probeError)) continue;
    const alts = alternateProbes(tokenFromSeed(w) || w.title || w.id, w.owner, hostOf(w.obituary));
    for (const probeUrl of alts.slice(0, 3)) {
      stats.retries += 1;
      consider(
        {
          id: `auto-retry-${slug(w.id)}-${slug(hostOf(probeUrl) || "x")}`.slice(0, 72),
          title: w.title || w.id,
          probeUrl,
          obituary: w.obituary,
          owner: w.owner || "Autoseed",
          note: `Autoseed retry: prior probe failed (${String(f.probeError).slice(0, 80)}). Alternate shape from learned ghost model.`,
        },
        "retry",
      );
    }
  }
}

/** Sitemap locs on funeral hosts — fetch page and extract real product links. */
async function fromFuneralSitemaps() {
  if (skipFeeds) return;
  const hosts = (model.funeralHosts || []).slice(0, 12).map((x) => x.host);
  for (const host of hosts) {
    const tries = [`https://${host}/sitemap.xml`, `https://${host}/sitemap_index.xml`];
    for (const url of tries) {
      try {
        const { text } = await fetchText(url, 20000);
        if (!/<urlset|<sitemapindex/i.test(text)) continue;
        stats.sitemaps += 1;
        const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
        const childMaps = locs.filter((l) => /sitemap/i.test(l)).slice(0, 3);
        const pageLocs = locs.filter((l) => !/sitemap/i.test(l));
        for (const child of childMaps) {
          try {
            const childXml = await fetchText(child, 20000);
            pageLocs.push(
              ...[...childXml.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim()),
            );
          } catch {
            /* skip */
          }
        }
        let fetched = 0;
        for (const loc of pageLocs.slice(0, 500)) {
          const path = (() => {
            try {
              return new URL(loc).pathname.toLowerCase();
            } catch {
              return "";
            }
          })();
          const blob = `${path} ${loc}`.toLowerCase();
          if (!hasFuneralLanguage(blob) && !/shut|retir|discontinu|sunset|farewell|goodbye|eol|end-of/.test(path)) {
            continue;
          }
          stats.sitemapHits += 1;
          if (fetched >= 24) continue;
          fetched += 1;
          try {
            const page = await fetchText(loc, 15000);
            const links = pickProbeLinks(extractHttpLinks(page.text, page.finalUrl || loc), loc);
            const title = path.split("/").filter(Boolean).pop() || host;
            for (const probeUrl of links.slice(0, 2)) {
              consider(
                {
                  id: `auto-sm-${slug(title)}-${slug(hostOf(probeUrl) || "x")}`.slice(0, 72),
                  title: title.replace(/[-_]/g, " ").slice(0, 120),
                  probeUrl,
                  obituary: loc,
                  owner: ownerFromFuneral(host),
                  note: `Autoseed from funeral-host sitemap ${host}. Probe URL extracted from page — verify before hang.`,
                },
                "sitemap",
              );
            }
          } catch {
            /* skip page */
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        break;
      } catch {
        /* next */
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** Rescore discovered leftovers — only keep if probe URL not already watched. */
function fromDiscovered() {
  if (!existsSync(discoveredPath)) return;
  try {
    const pack = JSON.parse(readFileSync(discoveredPath, "utf8"));
    for (const s of pack.seeds || []) {
      stats.rescored += 1;
      if (knownProbes.has(s.probeUrl)) {
        // Already queued — try learned alternate shapes instead.
        for (const probeUrl of alternateProbes(tokenFromSeed(s) || s.title || s.id, s.owner, hostOf(s.obituary)).slice(0, 2)) {
          consider(
            {
              id: `auto-alt-${slug(s.id)}-${slug(hostOf(probeUrl))}`.slice(0, 72),
              title: s.title,
              probeUrl,
              obituary: s.obituary,
              owner: s.owner || "Autoseed",
              note: "Autoseed alternate probe shape for an already-queued discovery.",
            },
            "alt",
          );
        }
        continue;
      }
      consider(
        {
          ...s,
          id: s.id.startsWith("auto-") ? s.id : `auto-${s.id.replace(/^disc-/, "")}`,
          note: s.note || "Rescored discovered seed via ghost-report model.",
        },
        "rescored",
      );
    }
  } catch {
    /* skip */
  }
}

await fromFuneralFeeds();
await fromFuneralSitemaps();
fromFailedRetries();
fromDiscovered();

const seeds = [...candidates.values()]
  .sort((a, b) => b._score - a._score || a.id.localeCompare(b.id))
  .slice(0, maxSeeds)
  .map(({ _score, _via, _reasons, ...seed }) => seed);

stats.kept = seeds.length;
mkdirSync(seedsDir, { recursive: true });
const pack = {
  owner: "Autoseed",
  purpose:
    "Learned from hung + verified ghosts: funeral hosts, probe shapes, shutdown language. Feed polls + rescored discovery. Not an open-web crawl. Probe before hang.",
  learnedAt: model.learnedAt,
  algorithm: model.algorithm,
  minScore,
  stats,
  seeds,
};
writeFileSync(outPath, JSON.stringify(pack, null, 2) + "\n");
console.log(
  `autoseed ${seeds.length} → ${outPath} (feeds ${stats.feeds}, feedHits ${stats.feedHits}, sitemaps ${stats.sitemaps}/${stats.sitemapHits}, retries ${stats.retries}, rescored ${stats.rescored}, skipped ${stats.skipped}, minScore ${minScore})`,
);
if (seeds[0]) {
  console.log(`top ${seeds[0].id} · ${seeds[0].probeUrl}`);
}
console.log("Next: npm run seed-watchlist:broad && npm run curate:desk");
