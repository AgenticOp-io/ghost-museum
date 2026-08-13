/**
 * Hang one exhibit from watch/finding/nomination evidence.
 * Always fresh GET. Never invents. doNotIntegrate stays true.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { atomicWriteJson } from "./atomic-write.mjs";
import { join } from "node:path";
import { probeUrl, formatProbeError } from "./probe.mjs";

const GHOST_WALLS = new Set(["still-answering", "auth-ghost", "successor-facade"]);

export function isHangableWall(wall) {
  return GHOST_WALLS.has(wall) || wall === "buried";
}

export function inferWallFromProbe(r) {
  const hops = Array.isArray(r?.redirectChain) ? r.redirectChain.length : 0;
  if (hops > 1) return "successor-facade";
  if (r?.httpStatus === 401 || r?.httpStatus === 403) return "auth-ghost";
  if (r?.httpStatus === 410) return "buried";
  if (r?.httpStatus === 200) return "still-answering";
  return "unprobed";
}

function noteFrom(src, wall, title) {
  const base = String(src.note || "").trim();
  if (base && !/how to (keep )?us|credential|exploit|fuzz/i.test(base)) return base;
  const name = title || src.id;
  if (wall === "auth-ghost") {
    return `${name} was declared dead, but the hostname still answers with an auth challenge. Funeral cited; socket not gone.`;
  }
  if (wall === "successor-facade") {
    return `${name} redirects through a chain after the product funeral — successor facade, not a clean burial.`;
  }
  if (wall === "buried") {
    return `${name} returns an honest 410. Hung as contrast: a completed funeral.`;
  }
  return `${name} was declared dead. The probe URL still answers. That is a ghost, not a guide.`;
}

function loadFinding(root, targetId) {
  const findingsPath = join(root, "hunt", "findings.jsonl");
  if (!existsSync(findingsPath)) return null;
  const raw = readFileSync(findingsPath, "utf8");
  const lines = raw.length > 2_000_000 ? raw.slice(-2_000_000).split(/\r?\n/) : raw.split(/\r?\n/);
  let best = null;
  for (const line of lines) {
    if (!line || !line.includes(targetId)) continue;
    try {
      const f = JSON.parse(line);
      if (f?.id !== targetId) continue;
      if (!best || String(f.huntedAt || "") > String(best.huntedAt || "")) best = f;
    } catch {
      /* skip */
    }
  }
  return best;
}

function loadWatch(root, targetId) {
  const watchPath = join(root, "hunt", "watchlist.json");
  if (!existsSync(watchPath)) return null;
  try {
    return (JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []).find((w) => w.id === targetId) || null;
  } catch {
    return null;
  }
}

function loadNomination(root, targetId) {
  const p = join(root, "nominations", `${targetId}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function loadRank(root, targetId) {
  const rankPath = join(root, "hunt", "curate-rank.json");
  if (!existsSync(rankPath)) return null;
  try {
    return (JSON.parse(readFileSync(rankPath, "utf8")).ranked || []).find((r) => r.id === targetId) || null;
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.root
 * @param {string} opts.id
 * @param {boolean} [opts.commit]
 * @param {string|null} [opts.wallOverride]
 * @param {boolean} [opts.requireGhostWall] — auto-curate gate
 * @param {boolean} [opts.quiet]
 * @returns {Promise<{ ok: boolean, reason?: string, exhibit?: object, draftPath?: string, wall?: string }>}
 */
export async function hangOne({
  root,
  id,
  commit = false,
  wallOverride = null,
  requireGhostWall = false,
  quiet = false,
} = {}) {
  if (!id) return { ok: false, reason: "missing id" };

  const exhibitsPath = join(root, "exhibits", "exhibits.json");
  const draftsDir = join(root, "hunt", "drafts");
  const finding = loadFinding(root, id);
  const watch = loadWatch(root, id);
  const nom = loadNomination(root, id);
  const ranked = loadRank(root, id);
  const base = watch || finding || nom || null;
  const src = base || ranked
    ? {
        ...(ranked || {}),
        ...(base || {}),
        probeUrl: base?.probeUrl || ranked?.probeUrl,
        obituary: base?.obituary || ranked?.obituary,
        title: base?.title || ranked?.title,
        owner: base?.owner || ranked?.owner,
      }
    : null;

  if (!src?.probeUrl) return { ok: false, reason: "no probeUrl" };
  if (!src.obituary) return { ok: false, reason: "no obituary" };

  const museum = JSON.parse(readFileSync(exhibitsPath, "utf8"));
  if ((museum.exhibits || []).some((e) => e.id === id)) {
    return { ok: false, reason: "already hung" };
  }

  const ua = museum.userAgent || "GhostMuseum/0.1 (exhibit probe)";
  const timeoutMs = Number(process.env.GM_HANG_TIMEOUT_MS || 12_000);
  if (!quiet) console.log(`Probing ${src.probeUrl} (timeout ${timeoutMs}ms) …`);

  let probe;
  let probeError = null;
  try {
    probe = await probeUrl(src.probeUrl, ua, { timeoutMs });
  } catch (err) {
    probeError = formatProbeError(err);
    probe = null;
  }

  if (probeError || !probe) {
    return { ok: false, reason: `probe failed: ${probeError || "unknown"}` };
  }

  const wall = wallOverride || ranked?.wall || inferWallFromProbe(probe);
  if (requireGhostWall && !isHangableWall(wall)) {
    return { ok: false, reason: `wall ${wall} not hangable`, wall };
  }

  const title = src.title || ranked?.title || id;
  const owner = src.owner || ranked?.owner || "Unknown";
  const declaredDead =
    src.declaredDead ||
    String(src.huntedAt || ranked?.huntedAt || new Date().toISOString()).slice(0, 10);

  let note = noteFrom(src, wall, title);
  if (probe.tlsWarning) {
    note = `${note} TLS note: browser may open this host; Node saw ${probe.tlsWarning} (incomplete/untrusted chain) and recorded status after a documented retry.`;
  }

  const draft = {
    id,
    wall,
    title,
    owner,
    declaredDead,
    obituary: src.obituary || ranked?.obituary,
    ...(src.obituaryNote ? { obituaryNote: src.obituaryNote } : {}),
    probeUrl: src.probeUrl,
    httpStatus: probe.httpStatus,
    finalUrl: probe.finalUrl,
    titleTag: probe.titleTag || undefined,
    note,
    doNotIntegrate: true,
    redirectChain: probe.redirectChain,
    ...(probe.tlsWarning ? { tlsWarning: probe.tlsWarning } : {}),
    _draft: {
      draftedAt: new Date().toISOString(),
      source: src.source || watch?.source || (nom ? "nominate" : "unknown"),
      curateScore: ranked?.score ?? null,
      curateDecision: ranked?.decision ?? null,
      autoCurated: Boolean(requireGhostWall && commit),
      commit: false,
    },
  };

  mkdirSync(draftsDir, { recursive: true });
  const draftPath = join(draftsDir, `${id}.json`);
  writeFileSync(draftPath, JSON.stringify(draft, null, 2) + "\n");
  if (!quiet) {
    console.log(`Draft → ${draftPath}`);
    console.log(`  wall ${wall} · status ${probe.httpStatus} · final ${probe.finalUrl}`);
  }

  if (!commit) {
    return { ok: true, draftPath, wall, exhibit: draft, committed: false };
  }

  const { _draft, ...exhibit } = draft;
  museum.exhibits.push(exhibit);
  museum.probedAt = new Date().toISOString();
  atomicWriteJson(exhibitsPath, museum);
  atomicWriteJson(join(root, "site", "exhibits.json"), museum);

  draft._draft.commit = true;
  draft._draft.committedAt = museum.probedAt;
  atomicWriteJson(draftPath, draft);

  if (!quiet) console.log(`Committed ${id} → exhibits/exhibits.json`);
  return { ok: true, draftPath, wall, exhibit, committed: true };
}
