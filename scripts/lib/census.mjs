/**
 * Shared census builder.
 * total = unique hung ∪ ghost-class hunt evidence (still-answering / auth-ghost / successor-facade).
 * Ghost-class findings still count after a watchlist rebuild (evidence outlives the queue).
 * Seeds and non-ghost HTTP replies (404, 500, …) do NOT inflate total or the wall.
 */
import { majorDomain } from "../../site/gm-shared.js";

const GHOST_WALLS = new Set(["still-answering", "auth-ghost", "successor-facade"]);

export function isAuthoritySource(source) {
  const s = String(source || "");
  return (
    s.startsWith("seeds/") ||
    s === "probe-hints" ||
    s === "extra-hints" ||
    s === "nominate" ||
    s === "hints"
  );
}

export function isGhostWall(wall) {
  return GHOST_WALLS.has(wall);
}

/** Latest finding per id (scan jsonl rows or pre-parsed objects). */
export function latestFindingsById(rows) {
  const byId = new Map();
  for (const f of rows || []) {
    if (!f?.id) continue;
    const prev = byId.get(f.id);
    if (!prev || String(f.huntedAt || "") > String(prev.huntedAt || "")) byId.set(f.id, f);
  }
  return byId;
}

export function buildCensusPayload({
  museum = "Still Answering",
  exhibits = [],
  watch = [],
  findings = [],
  lastPass = null,
} = {}) {
  const ids = new Set();
  const byWall = {};
  const byDomainMap = new Map();
  const latest = latestFindingsById(findings);

  function touchDomain(domain) {
    if (!byDomainMap.has(domain)) {
      byDomainMap.set(domain, {
        domain,
        ids: new Set(),
        hung: 0,
        banished: 0,
        watch: 0,
        verified: 0,
        contacted: 0,
      });
    }
    return byDomainMap.get(domain);
  }

  function countTowardTotal(id, domain, bucket) {
    if (!id) return;
    ids.add(id);
    const row = touchDomain(domain);
    const already = row.ids.has(id);
    row.ids.add(id);
    if (!already && bucket) row[bucket] = (row[bucket] || 0) + 1;
  }

  for (const ex of exhibits) {
    if (!ex?.id) continue;
    byWall[ex.wall] = (byWall[ex.wall] || 0) + 1;
    const domain = majorDomain(ex);
    if (ex.wall === "banished") countTowardTotal(ex.id, domain, "banished");
    else countTowardTotal(ex.id, domain, "hung");
  }

  let authorityWatch = 0;
  let deepWatch = 0;
  let awaitingProbe = 0;
  for (const w of watch) {
    if (!w?.id) continue;
    if (isAuthoritySource(w.source)) authorityWatch += 1;
    else deepWatch += 1;
  }

  let verified = 0;
  let verifiedDeep = 0;
  let contacted = 0;
  let contactedDeep = 0;
  let probeErrors = 0;
  const verifiedWalls = {};
  const watchById = new Map((watch || []).map((w) => [w.id, w]));

  // Prefer watch rows (have owner/source), then orphan ghost-class findings.
  const candidateIds = new Set([
    ...watchById.keys(),
    ...[...latest.keys()].filter((id) => {
      const f = latest.get(id);
      return f && !f.probeError && f.httpStatus != null && GHOST_WALLS.has(f.suggestedWall);
    }),
  ]);

  for (const id of candidateIds) {
    const w = watchById.get(id);
    const f = latest.get(id);
    if (!f) continue;
    if (f.probeError) {
      probeErrors += 1;
      continue;
    }
    if (f.httpStatus == null) continue;

    contacted += 1;
    const rowLike = w || {
      id,
      probeUrl: f.probeUrl,
      owner: f.owner || "Unknown",
      source: f.source || "hunt",
    };
    const domain = majorDomain(rowLike);
    const wasAuthority = isAuthoritySource(rowLike.source);
    if (!wasAuthority) contactedDeep += 1;

    const wall = f.suggestedWall;
    if (!GHOST_WALLS.has(wall)) continue;

    verified += 1;
    verifiedWalls[wall] = (verifiedWalls[wall] || 0) + 1;
    if (!wasAuthority) verifiedDeep += 1;
    if (!ids.has(id)) {
      countTowardTotal(id, domain, wasAuthority ? "watch" : "contacted");
    }
    const row = touchDomain(domain);
    row.verified = (row.verified || 0) + 1;
  }

  // Awaiting = on watch with no usable finding yet.
  for (const w of watch) {
    if (!w?.id) continue;
    const f = latest.get(w.id);
    if (!f) awaitingProbe += 1;
    else if (!f.probeError && f.httpStatus == null) awaitingProbe += 1;
  }

  const byDomain = {};
  for (const row of byDomainMap.values()) {
    byDomain[row.domain] = {
      total: row.ids.size,
      hung: row.hung,
      banished: row.banished,
      watch: row.watch,
      verified: row.verified || 0,
      contacted: row.contacted || 0,
    };
  }

  const byOwner = {};
  for (const w of watch) {
    const o = w?.owner || "Unknown";
    byOwner[o] = (byOwner[o] || 0) + 1;
  }
  for (const ex of exhibits) {
    const o = ex?.owner || "Unknown";
    if (!byOwner[o]) byOwner[o] = 0;
  }

  return {
    museum,
    updatedAt: new Date().toISOString(),
    total: ids.size,
    hung: exhibits.filter((e) => e.wall !== "banished").length,
    banished: exhibits.filter((e) => e.wall === "banished").length,
    watchlist: watch.length,
    authorityWatch,
    deepWatch,
    awaitingProbe,
    contacted,
    contactedDeep,
    verified,
    verifiedDeep,
    probeErrors,
    verifiedWalls,
    exhibits: exhibits.length,
    byWall,
    byDomain,
    byOwner,
    lastPass: lastPass || null,
    note: "total = hung ∪ ghost-class evidence (findings survive watchlist rebuilds). Seeds/404s do not inflate total.",
  };
}
