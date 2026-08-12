#!/usr/bin/env node
/**
 * Curate desk (v2) — authority ranking for Still Answering.
 * Prefers multi-vendor seed packs + hunt evidence. NEVER auto-hangs.
 *
 *   npm run curate
 *   npm run curate -- --top 40
 *   npm run curate -- --desk          # strong+consider only → site/curate.json
 *   npm run curate -- --min strong
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { majorDomain, hostOf as sharedHostOf } from "../site/gm-shared.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exhibitsPath = join(root, "exhibits", "exhibits.json");
const findingsPath = join(root, "hunt", "findings.jsonl");
const watchPath = join(root, "hunt", "watchlist.json");
const nominationsDir = join(root, "nominations");
const outPath = join(root, "hunt", "curate-rank.json");
const deskPath = join(root, "site", "curate.json");

const args = process.argv.slice(2);
const topN = (() => {
  const i = args.indexOf("--top");
  return i >= 0 ? Number(args[i + 1]) || 40 : 40;
})();
const desk = args.includes("--desk");
const minBand = (() => {
  const i = args.indexOf("--min");
  if (i >= 0) return args[i + 1] || "consider";
  return desk ? "consider" : "weak";
})();
const asJson = args.includes("--json");

const BAND_ORDER = { strong: 3, consider: 2, review: 1, weak: 0 };

function hostOf(url) {
  try {
    return sharedHostOf(url).toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const hung = JSON.parse(readFileSync(exhibitsPath, "utf8"));
const hungIds = new Set((hung.exhibits || []).map((e) => e.id));
const hungHosts = new Set();
const hungDomains = new Map();
const hungYears = new Map();

for (const ex of hung.exhibits || []) {
  const host = hostOf(ex.probeUrl);
  if (host) hungHosts.add(host);
  const d = majorDomain(ex);
  hungDomains.set(d, (hungDomains.get(d) || 0) + 1);
  const y = String(ex.declaredDead || "").slice(0, 4);
  if (/^\d{4}$/.test(y)) hungYears.set(y, (hungYears.get(y) || 0) + 1);
}

const watchById = new Map();
if (existsSync(watchPath)) {
  try {
    const w = JSON.parse(readFileSync(watchPath, "utf8"));
    for (const row of w.watchlist || []) if (row?.id) watchById.set(row.id, row);
  } catch {
    /* ignore */
  }
}

function loadFindings() {
  if (!existsSync(findingsPath)) return [];
  const lines = readFileSync(findingsPath, "utf8").split(/\r?\n/).filter(Boolean);
  const byId = new Map();
  for (const line of lines) {
    try {
      const f = JSON.parse(line);
      if (!f?.id) continue;
      const prev = byId.get(f.id);
      if (!prev || String(f.huntedAt || "") > String(prev.huntedAt || "")) byId.set(f.id, f);
    } catch {
      /* skip */
    }
  }
  return [...byId.values()].map((f) => {
    const w = watchById.get(f.id);
    return {
      ...f,
      source: f.source || w?.source || "hunt",
      owner: f.owner || w?.owner || null,
      title: f.title || w?.title || f.id,
      obituary: f.obituary || w?.obituary || null,
      fromSeedPack: Boolean(w?.source?.startsWith("seeds/")),
    };
  });
}

function loadNominations() {
  if (!existsSync(nominationsDir)) return [];
  const out = [];
  for (const name of readdirSync(nominationsDir)) {
    if (!name.endsWith(".json") || name.endsWith(".jsonl")) continue;
    try {
      const n = JSON.parse(readFileSync(join(nominationsDir, name), "utf8"));
      if (!n?.probeUrl) continue;
      out.push({
        id: n.id || name.replace(/\.json$/, ""),
        title: n.title || n.probeUrl,
        probeUrl: n.probeUrl,
        obituary: n.obituary || null,
        note: n.note || n.reason || null,
        httpStatus: n.httpStatus ?? null,
        finalUrl: n.finalUrl || null,
        redirectChain: n.redirectChain || null,
        suggestedWall: n.suggestedWall || n.wall || null,
        owner: n.owner || "Nominate",
        source: "nominate",
        fromSeedPack: false,
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Seed-pack rows that hunt has not probed yet — still rankable for curator priority. */
function loadUnprobedSeeds() {
  const findings = new Set(loadFindings().map((f) => f.id));
  const out = [];
  for (const w of watchById.values()) {
    if (!w?.source?.startsWith("seeds/")) continue;
    if (findings.has(w.id) || hungIds.has(w.id)) continue;
    out.push({
      id: w.id,
      title: w.title || w.id,
      probeUrl: w.probeUrl,
      obituary: w.obituary,
      note: w.note || null,
      owner: w.owner || null,
      source: w.source,
      fromSeedPack: true,
      httpStatus: null,
      suggestedWall: "unprobed",
    });
  }
  return out;
}

function scoreCandidate(c) {
  const reasons = [];
  const host = hostOf(c.probeUrl);
  const domain = majorDomain({ probeUrl: c.probeUrl });
  let score = 0;

  if (!c.probeUrl) {
    return { score: -Infinity, decision: "reject", reasons: ["missing probeUrl"] };
  }
  if (!c.obituary) {
    return { score: -Infinity, decision: "reject", reasons: ["missing obituary citation"] };
  }
  if (hungIds.has(c.id)) {
    return { score: -Infinity, decision: "skip", reasons: ["already hung"] };
  }
  // Same hostname may still hold multiple ghosts — demote, do not skip.
  if (host && hungHosts.has(host)) {
    score -= 18;
    reasons.push(`hostname already hung (${host})`);
  }

  const note = String(c.note || "").toLowerCase();
  if (
    /how to (keep )?us|auth bypass|api key|bearer |password|credential|exploit|fuzz|load.?test/.test(
      note,
    )
  ) {
    return { score: -Infinity, decision: "reject", reasons: ["integration / abuse language in note"] };
  }
  if (/not hang early|living product until|log only|may not be a ghost|confirm before hang/.test(note)) {
    score -= 25;
    reasons.push("note flags uncertainty / living product");
  }

  const src = String(c.source || "");
  if (src.startsWith("seeds/")) {
    score += 28;
    reasons.push("authority seed pack");
  } else if (src === "probe-hints") {
    score += 16;
    reasons.push("curated probe-hint");
  } else if (src === "nominate") {
    score += 12;
    reasons.push("public nomination");
  } else if (/-vast$/.test(src)) {
    score -= 45;
    reasons.push("vast fan-out (demoted)");
  } else if (/-deep$/.test(src)) {
    score -= 18;
    reasons.push("catalog host guess");
  }

  if (c.probeError) {
    score -= 40;
    reasons.push("probe error");
  } else if (c.httpStatus == null) {
    score -= 8;
    reasons.push("awaiting hunt probe");
  } else {
    score += 15;
    reasons.push(`status ${c.httpStatus}`);
  }

  const chain = Array.isArray(c.redirectChain) ? c.redirectChain : [];
  const hops = chain.length;
  const wall = c.suggestedWall || inferWall(c);

  const wallScore = {
    "still-answering": 40,
    "auth-ghost": 38,
    "successor-facade": 36,
    buried: 12,
    unprobed: 0,
  };
  score += wallScore[wall] ?? 0;
  reasons.push(`wall ${wall}`);

  if (hops > 1) {
    score += Math.min(12, hops * 3);
    reasons.push(`${hops} redirect hops`);
  }

  if (c.httpStatus === 200 && hops <= 1) {
    score += 10;
    reasons.push("still-200 without redirect");
  }
  if (c.httpStatus === 401 || c.httpStatus === 403) {
    score += 8;
    reasons.push("auth ghost signal");
  }
  if (c.httpStatus === 404) {
    score -= 15;
    reasons.push("404 tomb");
  }
  if (c.httpStatus === 410) {
    score -= 5;
    reasons.push("honest 410");
  }
  if (c.httpStatus === 400) {
    score -= 8;
    reasons.push("non-ghost 400");
  }
  if (c.httpStatus === 429 || c.httpStatus === 502 || c.httpStatus === 503 || c.httpStatus === 522) {
    score -= 20;
    reasons.push(`non-ghost ${c.httpStatus}`);
  }

  const domainCount = hungDomains.get(domain) || 0;
  if (domain === "google.com") {
    score -= 10;
    reasons.push("google already over-represented");
  }
  if (domainCount >= 6) {
    score -= 30;
    reasons.push(`hall saturated for ${domain} (${domainCount})`);
  } else if (domainCount >= 3) {
    score -= 12;
    reasons.push(`many ${domain} frames already (${domainCount})`);
  } else if (domainCount === 0) {
    score += 18;
    reasons.push(`new major domain ${domain}`);
  } else {
    score += 6;
  }

  const year = String(c.declaredDead || c.huntedAt || "").slice(0, 4);
  if (/^\d{4}$/.test(year)) {
    const yc = hungYears.get(year) || 0;
    if (yc === 0) {
      score += 10;
      reasons.push(`fills empty year ${year}`);
    } else if (yc >= 4) {
      score -= 8;
      reasons.push(`year ${year} already crowded`);
    }
  }

  if (c.title && !/^https?:/i.test(c.title) && c.title.length > 2) score += 4;
  if (c.owner && !/google/i.test(c.owner)) {
    score += 6;
    reasons.push(`owner ${c.owner}`);
  }

  const finalHost = hostOf(c.finalUrl || "");
  if (finalHost && [...hungHosts].some((h) => h === finalHost)) {
    score -= 10;
    reasons.push("lands on a host we already hang");
  }

  let decision = "review";
  if (score >= 55) decision = "strong";
  else if (score >= 35) decision = "consider";
  else if (score < 10) decision = "weak";

  // Strong is reserved for hangable ghost walls — never promote 400/429/unprobed to strong.
  if (decision === "strong" && !["still-answering", "auth-ghost", "successor-facade", "buried"].includes(wall)) {
    decision = "consider";
    reasons.push("capped at consider — wall not hangable");
  }

  return { score, decision, wall, domain, host, reasons };
}

function inferWall(c) {
  if (c.httpStatus == null) return "unprobed";
  const hops = Array.isArray(c.redirectChain) ? c.redirectChain.length : 0;
  if (hops > 1) return "successor-facade";
  if (c.httpStatus === 410) return "buried";
  if (c.httpStatus === 401 || c.httpStatus === 403) return "auth-ghost";
  if (c.httpStatus === 200) return "still-answering";
  return "unprobed";
}

const candidates = [...loadFindings(), ...loadNominations(), ...loadUnprobedSeeds()];
const ranked = candidates
  .map((c) => {
    const s = scoreCandidate(c);
    return {
      id: c.id,
      title: c.title || c.id,
      owner: c.owner || null,
      source: c.source,
      fromSeedPack: Boolean(c.fromSeedPack),
      probeUrl: c.probeUrl,
      obituary: c.obituary,
      httpStatus: c.httpStatus ?? null,
      finalUrl: c.finalUrl || null,
      huntedAt: c.huntedAt || null,
      note: c.note || null,
      hangHint: `npm run hang:auto  # or: npm run hang -- --id ${c.id} --commit`,
      ...s,
    };
  })
  .filter((r) => r.decision !== "skip" && r.decision !== "reject")
  .filter((r) => (BAND_ORDER[r.decision] ?? 0) >= (BAND_ORDER[minBand] ?? 0))
  .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));

const rejected = candidates
  .map((c) => ({ id: c.id, source: c.source, ...scoreCandidate(c) }))
  .filter((r) => r.decision === "reject" || r.decision === "skip");

const byDecision = { strong: 0, consider: 0, review: 0, weak: 0 };
for (const r of ranked) byDecision[r.decision] = (byDecision[r.decision] || 0) + 1;

const report = {
  museum: "Still Answering",
  curatedAt: new Date().toISOString(),
  algorithm: "ghost-curate-v2",
  authority: "hunt/seeds/* → hunt → curate desk → hang:auto (strong + fresh probe)",
  note: "Ranking feeds auto-hang. Strong + ghost-class (or buried) + fresh GET → exhibits. Prefer seed packs. Manual: npm run hang -- --id <id> --commit",
  hallSize: hung.exhibits?.length ?? 0,
  candidateCount: candidates.length,
  byDecision,
  ranked: ranked.slice(0, topN),
  rejectedSample: rejected.slice(0, 20),
};

writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

const deskPayload = {
  museum: report.museum,
  curatedAt: report.curatedAt,
  algorithm: report.algorithm,
  authority: report.authority,
  hallSize: report.hallSize,
  byDecision: report.byDecision,
  queue: ranked
    .filter((r) => r.decision === "strong" || r.decision === "consider")
    .slice(0, Math.min(topN, 80)),
};
writeFileSync(deskPath, JSON.stringify(deskPayload, null, 2) + "\n");

if (asJson) {
  process.stdout.write(JSON.stringify(desk ? deskPayload : report, null, 2) + "\n");
} else {
  console.log(
    `curate-rank v2 · hall ${report.hallSize} · candidates ${candidates.length} · showing ${Math.min(topN, ranked.length)} (min=${minBand})`,
  );
  console.log(`wrote ${outPath}`);
  console.log(`wrote ${deskPath} (desk queue ${deskPayload.queue.length})`);
  for (const r of ranked.slice(0, Math.min(topN, 25))) {
    console.log(
      `${String(r.score).padStart(3)} ${r.decision.padEnd(8)} ${r.domain.padEnd(18)} ${r.id} · ${r.wall} · ${r.source || "?"}`,
    );
  }
}
