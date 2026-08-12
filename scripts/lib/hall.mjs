/**
 * Full hall catalog — hung ∪ ghost-class evidence (watch or findings).
 * DNS misses and non-ghost HTTP replies stay off the wall.
 */
import { isGhostWall, latestFindingsById } from "./census.mjs";

function wallFromFinding(f) {
  if (!f) return "unprobed";
  if (f.probeError) return "unprobed";
  if (f.suggestedWall) return f.suggestedWall;
  return "unprobed";
}

function toFrame(w, f) {
  const wall = wallFromFinding(f);
  const title = w.title || f?.title || w.id;
  const ghost = isGhostWall(wall);
  const note =
    w.note ||
    f?.note ||
    (ghost
      ? "Hunt-verified ghost — not hung yet. hang:auto may commit when curate ranks it strong."
      : f?.httpStatus != null
        ? `Hunt contacted this host (HTTP ${f.httpStatus}). Not hung — evidence only.`
        : "On the authority watchlist — awaiting hunt contact. Not hung.");
  return {
    id: w.id,
    wall,
    title,
    owner: w.owner || f?.owner || "Unknown",
    declaredDead: w.declaredDead || (f?.huntedAt ? String(f.huntedAt).slice(0, 10) : ""),
    obituary: w.obituary || f?.obituary || "#",
    probeUrl: w.probeUrl || f?.probeUrl,
    httpStatus: f?.httpStatus ?? null,
    finalUrl: f?.finalUrl || null,
    titleTag: f?.titleTag || null,
    note,
    doNotIntegrate: true,
    redirectChain: f?.redirectChain || [],
    probeError: f?.probeError || null,
    ...(f?.tlsWarning ? { tlsWarning: f.tlsWarning } : {}),
    hallKind: "watching",
    source: w.source || f?.source || null,
  };
}

function isGhostFinding(f) {
  if (!f || f.probeError || f.httpStatus == null) return false;
  return isGhostWall(wallFromFinding(f));
}

/**
 * @returns {object[]} frame-shaped rows (hung first, then watching)
 */
export function buildHallCatalog({ exhibits = [], watch = [], findings = [] } = {}) {
  const latest = latestFindingsById(findings);
  const out = [];
  const seen = new Set();

  for (const ex of exhibits || []) {
    if (!ex?.id) continue;
    out.push({ ...ex, hallKind: "hung" });
    seen.add(ex.id);
  }

  for (const w of watch || []) {
    if (!w?.id || !w?.probeUrl || seen.has(w.id)) continue;
    const f = latest.get(w.id);
    if (!isGhostFinding(f)) continue;
    out.push(toFrame(w, f));
    seen.add(w.id);
  }

  // Ghost-class findings that fell off a watchlist rebuild still belong on the wall.
  for (const f of latest.values()) {
    if (!f?.id || seen.has(f.id) || !f.probeUrl) continue;
    if (!isGhostFinding(f)) continue;
    out.push(
      toFrame(
        {
          id: f.id,
          title: f.title,
          probeUrl: f.probeUrl,
          obituary: f.obituary,
          owner: f.owner,
          source: f.source || "hunt",
          note: f.note,
        },
        f,
      ),
    );
    seen.add(f.id);
  }

  out.sort((a, b) => {
    const ka = a.hallKind === "hung" ? 0 : 1;
    const kb = b.hallKind === "hung" ? 0 : 1;
    if (ka !== kb) return ka - kb;
    const da = String(a.declaredDead || "9999");
    const db = String(b.declaredDead || "9999");
    if (da !== db) return da < db ? -1 : 1;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  return out;
}

export function paginateHall(catalog, { page = 1, pageSize = 24, wall = "all" } = {}) {
  let list = catalog;
  if (wall && wall !== "all") list = list.filter((ex) => ex.wall === wall);
  const total = list.length;
  const size = Math.max(1, Math.min(100, Number(pageSize) || 24));
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(pages, Math.max(1, Number(page) || 1));
  const start = (p - 1) * size;
  return {
    page: p,
    pageSize: size,
    pages,
    total,
    wall: wall || "all",
    exhibits: list.slice(start, start + size),
  };
}
