#!/usr/bin/env node
/**
 * Curate ranking for hunt findings + nominations.
 * Scores candidates for human review. NEVER writes exhibits / never auto-hangs.
 *
 *   node scripts/curate.mjs
 *   node scripts/curate.mjs --top 15
 *   node scripts/curate.mjs --json > hunt/curate-rank.json
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exhibitsPath = join(root, "exhibits", "exhibits.json");
const findingsPath = join(root, "hunt", "findings.jsonl");
const nominationsDir = join(root, "nominations");
const outPath = join(root, "hunt", "curate-rank.json");

const args = process.argv.slice(2);
const topN = (() => {
  const i = args.indexOf("--top");
  return i >= 0 ? Number(args[i + 1]) || 20 : 20;
})();
const asJson = args.includes("--json");

const hung = JSON.parse(readFileSync(exhibitsPath, "utf8"));
const hungIds = new Set((hung.exhibits || []).map((e) => e.id));
const hungHosts = new Set();
const hungDomains = new Map(); // domain -> count
const hungYears = new Map();

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function majorDomain(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return "unknown";
  if (/(^|\.)google\.com$|(^|\.)youtube\.com$|^goo\.gl$|^g\.co$/.test(h)) return "google.com";
  if (/(^|\.)microsoft\.com$|(^|\.)windows\.net$|(^|\.)live\.com$|(^|\.)xbox\.com$|(^|\.)msn\.com$/.test(h))
    return "microsoft.com";
  if (/(^|\.)github\.com$|(^|\.)github\.io$/.test(h)) return "github.com";
  if (/(^|\.)adobe\.com$/.test(h)) return "adobe.com";
  if (/(^|\.)yahoo\.com$/.test(h)) return "yahoo.com";
  if (/(^|\.)facebook\.com$|(^|\.)fb\.com$/.test(h)) return "facebook.com";
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return h;
  return parts.slice(-2).join(".");
}

for (const ex of hung.exhibits || []) {
  const host = hostOf(ex.probeUrl);
  if (host) hungHosts.add(host);
  const d = majorDomain(host);
  hungDomains.set(d, (hungDomains.get(d) || 0) + 1);
  const y = String(ex.declaredDead || "").slice(0, 4);
  if (/^\d{4}$/.test(y)) hungYears.set(y, (hungYears.get(y) || 0) + 1);
}

function loadFindings() {
  if (!existsSync(findingsPath)) return [];
  const lines = readFileSync(findingsPath, "utf8").split(/\r?\n/).filter(Boolean);
  const byId = new Map();
  for (const line of lines) {
    try {
      const f = JSON.parse(line);
      if (!f?.id) continue;
      // Keep latest hunt per id
      const prev = byId.get(f.id);
      if (!prev || String(f.huntedAt || "") > String(prev.huntedAt || "")) byId.set(f.id, f);
    } catch {
      /* skip bad line */
    }
  }
  return [...byId.values()].map((f) => ({ ...f, source: "hunt" }));
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
        source: "nominate",
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * Score a candidate. Higher = more worth hanging.
 * Hard rejects return score -Infinity with reasons.
 */
function scoreCandidate(c) {
  const reasons = [];
  const host = hostOf(c.probeUrl);
  const domain = majorDomain(host);
  let score = 0;

  // --- Hard gates (museum honesty) ---
  if (!c.probeUrl) {
    return { score: -Infinity, decision: "reject", reasons: ["missing probeUrl"] };
  }
  if (!c.obituary) {
    return { score: -Infinity, decision: "reject", reasons: ["missing obituary citation"] };
  }
  if (hungIds.has(c.id)) {
    return { score: -Infinity, decision: "skip", reasons: ["already hung"] };
  }
  if (host && hungHosts.has(host)) {
    return { score: -Infinity, decision: "skip", reasons: [`hostname already hung (${host})`] };
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

  // --- Probe evidence ---
  if (c.probeError) {
    score -= 40;
    reasons.push("probe error");
  } else if (c.httpStatus == null) {
    score -= 20;
    reasons.push("no http status yet");
  } else {
    score += 15;
    reasons.push(`status ${c.httpStatus}`);
  }

  const chain = Array.isArray(c.redirectChain) ? c.redirectChain : [];
  const hops = chain.length;
  const wall = c.suggestedWall || inferWall(c);

  // Wall drama: incomplete funerals rank highest
  const wallScore = {
    "still-answering": 40,
    "auth-ghost": 38,
    "successor-facade": 36,
    buried: 12, // contrast only — keep few
    unprobed: 0,
  };
  score += wallScore[wall] ?? 0;
  reasons.push(`wall ${wall}`);

  if (hops > 1) {
    score += Math.min(12, hops * 3);
    reasons.push(`${hops} redirect hops`);
  }

  // Interesting status classes
  if (c.httpStatus === 200 && hops <= 1) {
    score += 10;
    reasons.push("still-200 without redirect (strong ghost)");
  }
  if (c.httpStatus === 401 || c.httpStatus === 403) {
    score += 8;
    reasons.push("auth ghost signal");
  }
  if (c.httpStatus === 404) {
    score -= 15;
    reasons.push("404 tomb — weak unless unique story");
  }
  if (c.httpStatus === 410) {
    score -= 5;
    reasons.push("honest 410 — buried contrast only");
  }
  if (c.httpStatus === 400) {
    score += 6;
    reasons.push("socket refuses with 400 (alive but hostile)");
  }

  // --- Hall diversity ---
  const domainCount = hungDomains.get(domain) || 0;
  if (domainCount >= 6) {
    score -= 30;
    reasons.push(`hall saturated for ${domain} (${domainCount})`);
  } else if (domainCount >= 3) {
    score -= 12;
    reasons.push(`many ${domain} frames already (${domainCount})`);
  } else if (domainCount === 0) {
    score += 14;
    reasons.push(`new major domain ${domain}`);
  } else {
    score += 4;
  }

  // Era coverage: boost underrepresented death years
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

  // Prefer named products over generic doors
  if (c.title && !/^https?:/i.test(c.title) && c.title.length > 2) {
    score += 4;
  }

  // Deduplicate soft: same final host as another hung frame
  const finalHost = hostOf(c.finalUrl || "");
  if (finalHost && [...hungHosts].some((h) => h === finalHost)) {
    score -= 10;
    reasons.push("lands on a host we already hang");
  }

  let decision = "review";
  if (score >= 55) decision = "strong";
  else if (score >= 35) decision = "consider";
  else if (score < 10) decision = "weak";

  return {
    score,
    decision,
    wall,
    domain,
    host,
    reasons,
  };
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

const candidates = [...loadFindings(), ...loadNominations()];
const ranked = candidates
  .map((c) => {
    const s = scoreCandidate(c);
    return {
      id: c.id,
      title: c.title || c.id,
      source: c.source,
      probeUrl: c.probeUrl,
      obituary: c.obituary,
      httpStatus: c.httpStatus ?? null,
      finalUrl: c.finalUrl || null,
      huntedAt: c.huntedAt || null,
      note: c.note || null,
      ...s,
    };
  })
  .filter((r) => r.decision !== "skip" && r.decision !== "reject")
  .sort((a, b) => b.score - a.score);

const rejected = candidates
  .map((c) => ({ id: c.id, ...scoreCandidate(c) }))
  .filter((r) => r.decision === "reject" || r.decision === "skip");

const report = {
  museum: "Still Answering",
  curatedAt: new Date().toISOString(),
  algorithm: "ghost-curate-v1",
  note: "Ranking only. Never auto-hangs. Curator must probe + accept before exhibits change.",
  hallSize: hung.exhibits?.length ?? 0,
  candidateCount: candidates.length,
  ranked: ranked.slice(0, topN),
  rejectedSample: rejected.slice(0, 30),
};

writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

if (asJson) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else {
  console.log(`curate-rank v1 · hall ${report.hallSize} · candidates ${candidates.length} · top ${Math.min(topN, ranked.length)}`);
  console.log(`wrote ${outPath}`);
  for (const r of ranked.slice(0, topN)) {
    console.log(
      `${String(r.score).padStart(4)}  ${r.decision.padEnd(8)}  ${r.wall || "-"}  ${r.id}\t${r.probeUrl}`,
    );
  }
}
