/**
 * Ghost reporting model — learned from hung frames + hunt evidence.
 * Used by autoseed to prefer how real ghosts get cited and probed.
 */
import { isAuthoritySource, isGhostWall, latestFindingsById } from "./census.mjs";

const BOOTSTRAP_FUNERAL_HOSTS = [
  "blog.google",
  "googleblog.blogspot.com",
  "developers.googleblog.com",
  "opensource.googleblog.com",
  "workspaceupdates.googleblog.com",
  "blog.youtube",
  "blog.google",
  "techcommunity.microsoft.com",
  "blogs.windows.com",
  "news.xbox.com",
  "devblogs.microsoft.com",
  "learn.microsoft.com",
  "about.fb.com",
  "engineering.fb.com",
  "blog.x.com",
  "blog.twitter.com",
  "www.aboutamazon.com",
  "aws.amazon.com",
  "blog.adobe.com",
  "github.blog",
  "blog.heroku.com",
  "blog.angular.io",
];

const FUNERAL_KEYWORDS = [
  "shutting down",
  "shut down",
  "shutdown",
  "discontinued",
  "discontinuing",
  "end of support",
  "end-of-support",
  "end of life",
  "end-of-life",
  "retirement",
  "retiring",
  "sunset",
  "sunsetting",
  "goodbye",
  "farewell",
  "deprecated",
  "deprecating",
  "no longer available",
  "will be turned off",
  "turning off",
  "killed",
  "winding down",
];

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function registrable(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return "";
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return h;
  return parts.slice(-2).join(".");
}

function bump(map, key, n = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + n;
}

function probeShape(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const labels = host.split(".");
    const base = registrable(host);
    let kind = "other";
    if (labels.length >= 3 && base === labels.slice(-2).join(".")) kind = "subdomain";
    else if (u.pathname && u.pathname !== "/") kind = "path";
    else kind = "apex";
    return { host, base, kind, path: u.pathname || "/" };
  } catch {
    return null;
  }
}

/**
 * Learn reporting/probe patterns from hung exhibits + latest findings.
 */
export function learnGhostModel({ exhibits = [], watch = [], findings = [] } = {}) {
  const latest = latestFindingsById(findings);
  const funeralHosts = {};
  const funeralBases = {};
  const ownerWins = {};
  const sourceWins = {};
  const shapeWins = { subdomain: 0, path: 0, apex: 0, other: 0 };
  const shapeTries = { subdomain: 0, path: 0, apex: 0, other: 0 };
  const baseGhost = {};
  const baseFail = {};
  const keywordHits = {};
  const examples = [];

  for (const ex of exhibits || []) {
    const fh = hostOf(ex.obituary);
    if (fh) {
      bump(funeralHosts, fh, 3);
      bump(funeralBases, registrable(fh), 3);
    }
    bump(ownerWins, ex.owner || "Unknown", 2);
    const shape = probeShape(ex.probeUrl);
    if (shape) {
      bump(shapeWins, shape.kind, 2);
      bump(shapeTries, shape.kind, 2);
      bump(baseGhost, shape.base, 2);
    }
    examples.push({
      id: ex.id,
      kind: "hung",
      wall: ex.wall,
      probeUrl: ex.probeUrl,
      obituary: ex.obituary,
      owner: ex.owner,
    });
  }

  for (const w of watch || []) {
    const f = latest.get(w.id);
    if (!f) continue;
    const shape = probeShape(w.probeUrl || f.probeUrl);
    if (shape) bump(shapeTries, shape.kind, 1);

    if (f.probeError) {
      if (shape) bump(baseFail, shape.base, 1);
      continue;
    }
    if (!isGhostWall(f.suggestedWall)) continue;

    const obit = w.obituary || f.obituary;
    const fh = hostOf(obit);
    if (fh) {
      bump(funeralHosts, fh, 2);
      bump(funeralBases, registrable(fh), 2);
    }
    bump(ownerWins, w.owner || "Unknown", 1);
    bump(sourceWins, isAuthoritySource(w.source) ? "authority" : "deep", 1);
    if (shape) {
      bump(shapeWins, shape.kind, 1);
      bump(baseGhost, shape.base, 1);
    }
    examples.push({
      id: w.id,
      kind: "verified",
      wall: f.suggestedWall,
      probeUrl: w.probeUrl,
      obituary: obit,
      owner: w.owner,
      source: w.source,
    });
  }

  // Merge bootstrap funeral hosts at low weight so first runs still work.
  for (const h of BOOTSTRAP_FUNERAL_HOSTS) {
    if (!funeralHosts[h]) bump(funeralHosts, h, 1);
    bump(funeralBases, registrable(h), 1);
  }

  for (const kw of FUNERAL_KEYWORDS) keywordHits[kw] = 1;

  const topFuneralHosts = Object.entries(funeralHosts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([host, weight]) => ({ host, weight }));

  const preferredShapes = Object.entries(shapeWins)
    .map(([kind, wins]) => ({
      kind,
      wins,
      tries: shapeTries[kind] || 0,
      rate: (shapeTries[kind] || 0) ? wins / shapeTries[kind] : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins);

  const preferredBases = Object.entries(baseGhost)
    .map(([base, ghost]) => ({
      base,
      ghost,
      fail: baseFail[base] || 0,
      score: ghost / Math.max(1, ghost + (baseFail[base] || 0)),
    }))
    .sort((a, b) => b.score - a.score || b.ghost - a.ghost)
    .slice(0, 50);

  return {
    learnedAt: new Date().toISOString(),
    algorithm: "ghost-report-model-v2",
    note: "Learned from hung exhibits + ghost-class hunt findings. Bounds autoseed to funeral hosts and probe shapes that historically produce ghosts. Probe URLs must be extracted or short product-token templates — never title-invented hosts.",
    funeralHosts: topFuneralHosts,
    funeralBases: Object.entries(funeralBases)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([base, weight]) => ({ base, weight })),
    preferredShapes,
    preferredBases,
    ownerWins: Object.entries(ownerWins)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([owner, weight]) => ({ owner, weight })),
    sourceWins,
    keywords: FUNERAL_KEYWORDS,
    exampleCount: examples.length,
    examples: examples.slice(0, 40),
  };
}

export function scoreAutoseedCandidate(seed, model) {
  let score = 0;
  const reasons = [];
  const fh = hostOf(seed.obituary);
  const fb = registrable(fh);
  const funeralHit = (model.funeralHosts || []).find((x) => x.host === fh);
  const funeralBaseHit = (model.funeralBases || []).find((x) => x.base === fb);
  if (funeralHit) {
    score += 25 + Math.min(20, funeralHit.weight);
    reasons.push(`funeral host ${fh}`);
  } else if (funeralBaseHit) {
    score += 12 + Math.min(10, funeralBaseHit.weight);
    reasons.push(`funeral base ${fb}`);
  } else {
    score -= 15;
    reasons.push("unknown funeral host");
  }

  const shape = probeShape(seed.probeUrl);
  if (shape) {
    const label = shape.host.split(".")[0] || "";
    if (label.length > 36 || (label.match(/-/g) || []).length >= 4) {
      score -= 40;
      reasons.push("invented-looking host label");
    }
    const pref = (model.preferredShapes || []).find((x) => x.kind === shape.kind);
    if (pref) {
      score += Math.round(pref.rate * 20);
      reasons.push(`shape ${shape.kind} rate=${pref.rate.toFixed(2)}`);
    }
    const base = (model.preferredBases || []).find((x) => x.base === shape.base);
    if (base) {
      score += Math.round(base.score * 25);
      reasons.push(`base ${shape.base} score=${base.score.toFixed(2)}`);
    } else if (shape.kind === "apex" && /\.(com|io|ai|net|org)$/.test(shape.host)) {
      score -= 8;
      reasons.push("generic apex guess");
    }
  }

  const text = `${seed.title || ""} ${seed.note || ""} ${seed.obituary || ""}`.toLowerCase();
  let kw = 0;
  for (const k of model.keywords || FUNERAL_KEYWORDS) {
    if (text.includes(k)) kw += 1;
  }
  if (kw) {
    score += Math.min(18, kw * 6);
    reasons.push(`keywords x${kw}`);
  }

  if (seed.owner && (model.ownerWins || []).some((o) => o.owner === seed.owner)) {
    score += 6;
    reasons.push(`known owner ${seed.owner}`);
  }

  return { score, reasons };
}

export { FUNERAL_KEYWORDS, BOOTSTRAP_FUNERAL_HOSTS, hostOf, registrable, probeShape };
