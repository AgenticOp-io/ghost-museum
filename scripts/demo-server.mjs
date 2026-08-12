#!/usr/bin/env node
/**
 * Static hall + nomination intake. No login.
 * Anti-bot: Turnstile siteverify + honeypot + fill-time + IP rate limit.
 * Nominations are offers only — never auto-hung.
 */
import { createServer } from "node:http";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { dirname, join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCensusPayload } from "./lib/census.mjs";
import { buildHallCatalog, paginateHall } from "./lib/hall.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadDotEnv(join(root, ".env"));
if (process.env.GM_ENV_FILE) loadDotEnv(process.env.GM_ENV_FILE);

const siteRoot = process.env.GM_SITE_ROOT || join(root, "site");
const nomDir = process.env.GM_NOMINATIONS_DIR || join(root, "nominations");
const huntDir = process.env.GM_HUNT_DIR || join(root, "hunt");
const PORT = Number(process.env.GM_PORT || 27474);
const BIND = process.env.GM_BIND || "0.0.0.0";
const MIN_MS = 2500;
const MAX_NOTE = 500;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 5;
const EXPECTED_ACTION = "nominate";
const TURNSTILE_SECRET =
  process.env.TURNSTILE_SECRET || process.env.TURNSTILE_SECRET_KEY || "";
const expectedHostnames = new Set(
  (process.env.TURNSTILE_HOSTNAMES || "ghosts.agenticop.io,35.224.146.25,localhost,127.0.0.1")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webp": "image/webp",
};

mkdirSync(nomDir, { recursive: true });

/** @type {Map<string, number[]>} */
const hits = new Map();

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function rateOk(ip) {
  const now = Date.now();
  const prev = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (prev.length >= RATE_MAX) {
    hits.set(ip, prev);
    return false;
  }
  prev.push(now);
  hits.set(ip, prev);
  return true;
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function readBody(req, limit = 16_384) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

/**
 * Canonical Turnstile siteverify (Spin existing-widget flow).
 * Requires success, expected action, and an approved frontend hostname.
 */
async function verifyTurnstile(token, ip) {
  if (!TURNSTILE_SECRET || expectedHostnames.size === 0) {
    return { ok: false, status: 503, error: "Turnstile is not configured on the server." };
  }
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 2048
  ) {
    return { ok: false, status: 403, error: "Bot check failed." };
  }

  let result;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET,
        response: token,
        remoteip: ip,
      }),
    });
    if (!r.ok) throw new Error(`siteverify ${r.status}`);
    result = await r.json();
  } catch {
    return { ok: false, status: 403, error: "Bot check failed." };
  }

  const hostname = String(result.hostname || "").toLowerCase();
  if (
    !result.success ||
    result.action !== EXPECTED_ACTION ||
    !expectedHostnames.has(hostname)
  ) {
    return { ok: false, status: 403, error: "Bot check failed." };
  }
  return { ok: true };
}

function safeSitePath(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p === "/") p = "/index.html";
  if (p.includes("\0")) return null;
  const full = normalize(join(siteRoot, p));
  if (!full.startsWith(normalize(siteRoot))) return null;
  return full;
}

async function handleNominate(req, res) {
  const ip = clientIp(req);
  if (!rateOk(ip)) {
    return sendJson(res, 429, {
      ok: false,
      error: "Too many nominations from this network. Try later.",
    });
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch {
    return sendJson(res, 413, { ok: false, error: "Payload too large." });
  }

  let data;
  try {
    data = JSON.parse(raw || "{}");
  } catch {
    return sendJson(res, 400, { ok: false, error: "Invalid JSON." });
  }

  // Honeypot — bots fill hidden fields; silent drop.
  if (data.company || data.website || data.url) {
    return sendJson(res, 200, { ok: true });
  }

  const token = String(data["cf-turnstile-response"] || data.turnstileToken || "");
  const ts = await verifyTurnstile(token, ip);
  if (!ts.ok) {
    return sendJson(res, ts.status || 403, { ok: false, error: ts.error || "Bot check failed." });
  }

  const started = Number(data.startedAt);
  if (!Number.isFinite(started) || Date.now() - started < MIN_MS) {
    return sendJson(res, 400, { ok: false, error: "Take a moment — then submit again." });
  }

  const probeUrl = String(data.probeUrl || "").trim();
  const obituary = String(data.obituary || "").trim();
  const note = String(data.note || "").trim();
  const contact = String(data.contact || "").trim();

  if (!isHttpUrl(probeUrl) || !isHttpUrl(obituary)) {
    return sendJson(res, 400, {
      ok: false,
      error: "Probe URL and obituary must be public http(s) links.",
    });
  }
  if (note.length > MAX_NOTE) {
    return sendJson(res, 400, { ok: false, error: `Note must be ≤ ${MAX_NOTE} characters.` });
  }
  if (contact && contact.length > 200) {
    return sendJson(res, 400, { ok: false, error: "Contact is too long." });
  }
  const blob = `${note} ${probeUrl}`.toLowerCase();
  if (
    /\b(api[_ -]?key|bearer\s|password|curl\s+-u|how to (keep|still) (use|call|integrate))\b/.test(
      blob,
    )
  ) {
    return sendJson(res, 400, {
      ok: false,
      error: "Nominations cannot include credentials or integration instructions.",
    });
  }

  const entry = {
    id: `nom-${Date.now().toString(36)}`,
    receivedAt: new Date().toISOString(),
    ipHash: Buffer.from(ip).toString("base64url").slice(0, 12),
    probeUrl,
    obituary,
    note: note || null,
    contact: contact || null,
    status: "pending",
    doNotIntegrate: true,
  };

  appendFileSync(join(nomDir, "nominations.jsonl"), JSON.stringify(entry) + "\n");
  writeFileSync(join(nomDir, `${entry.id}.json`), JSON.stringify(entry, null, 2) + "\n");

  return sendJson(res, 200, {
    ok: true,
    id: entry.id,
    message: "Received. A curator will probe before anything hangs. DO NOT INTEGRATE.",
  });
}

function handleHuntFindings(req, res) {
  const u = new URL(req.url || "/", "http://localhost");
  const includeNoise = u.searchParams.get("noise") === "1" || u.searchParams.get("include") === "noise";
  const wallFilter = u.searchParams.get("wall") || "signal";
  const findingsPath = join(huntDir, "findings.jsonl");
  const watchPath = join(huntDir, "watchlist.json");
  const lastPassPath = join(huntDir, "last-pass.json");
  const lines = existsSync(findingsPath)
    ? readFileSync(findingsPath, "utf8").split(/\r?\n/).filter(Boolean)
    : [];

  const GHOST = new Set(["still-answering", "auth-ghost", "successor-facade", "buried"]);
  function isNoise(f) {
    if (f?.probeError && /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(f.probeError)) return true;
    if (/-deep$|-vast$/.test(String(f?.source || "")) && f?.probeError) return true;
    return false;
  }
  function keep(f) {
    if (!includeNoise && isNoise(f)) return false;
    if (wallFilter === "all") return true;
    if (wallFilter === "noise") return isNoise(f);
    if (wallFilter === "signal") {
      if (isNoise(f)) return false;
      const w = f.suggestedWall || "unprobed";
      if (GHOST.has(w)) return true;
      if (f.httpStatus != null && !f.probeError) return true;
      return false;
    }
    return (f.suggestedWall || "unprobed") === wallFilter;
  }

  const parsed = [];
  let scanned = 0;
  let noiseSkipped = 0;
  for (let i = lines.length - 1; i >= 0 && parsed.length < 48; i--) {
    scanned += 1;
    try {
      const f = JSON.parse(lines[i]);
      if (!keep(f)) {
        if (isNoise(f)) noiseSkipped += 1;
        continue;
      }
      parsed.push(f);
    } catch {
      /* skip bad line */
    }
  }
  let watchlistSize = null;
  let lastPass = null;
  try {
    if (existsSync(watchPath)) {
      watchlistSize = JSON.parse(readFileSync(watchPath, "utf8")).watchlist?.length ?? null;
    }
  } catch {
    /* ignore */
  }
  try {
    if (existsSync(lastPassPath)) lastPass = JSON.parse(readFileSync(lastPassPath, "utf8"));
  } catch {
    /* ignore */
  }
  return sendJson(res, 200, {
    findings: parsed,
    watchlistSize,
    lastPass,
    wall: wallFilter,
    includeNoise,
    scanned,
    noiseSkipped,
    note: "Default view hides ENOTFOUND / deep-guess noise. ?wall=signal|all|noise or ?noise=1. Hangs via hang:auto.",
  });
}

function loadFindings() {
  const findingsPath = join(huntDir, "findings.jsonl");
  const findings = [];
  if (existsSync(findingsPath)) {
    for (const line of readFileSync(findingsPath, "utf8").split(/\r?\n/)) {
      if (!line) continue;
      try {
        findings.push(JSON.parse(line));
      } catch {
        /* skip */
      }
    }
  }
  return findings;
}

function buildCensus() {
  const exhibitsPath = join(siteRoot, "exhibits.json");
  const watchPath = join(huntDir, "watchlist.json");
  const lastPassPath = join(huntDir, "last-pass.json");
  const exhibits = existsSync(exhibitsPath)
    ? JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits || []
    : [];
  const watch = existsSync(watchPath)
    ? JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []
    : [];
  const findings = loadFindings();
  let lastPass = null;
  try {
    if (existsSync(lastPassPath)) lastPass = JSON.parse(readFileSync(lastPassPath, "utf8"));
  } catch {
    /* ignore */
  }
  return buildCensusPayload({ museum: "Still Answering", exhibits, watch, findings, lastPass });
}

function handleHall(req, res) {
  const u = new URL(req.url || "/", "http://localhost");
  const page = Number(u.searchParams.get("page") || 1);
  const pageSize = Number(u.searchParams.get("pageSize") || 24);
  const wall = u.searchParams.get("wall") || "all";
  const exhibitsPath = join(siteRoot, "exhibits.json");
  const watchPath = join(huntDir, "watchlist.json");
  const exhibits = existsSync(exhibitsPath)
    ? JSON.parse(readFileSync(exhibitsPath, "utf8")).exhibits || []
    : [];
  const watch = existsSync(watchPath)
    ? JSON.parse(readFileSync(watchPath, "utf8")).watchlist || []
    : [];
  const catalog = buildHallCatalog({ exhibits, watch, findings: loadFindings() });
  const payload = paginateHall(catalog, { page, pageSize, wall });
  payload.museum = "Still Answering";
  payload.catalogSize = catalog.length;
  payload.note = "Hung frames plus ghost-class hunt contacts not yet hung. Unprobed seeds stay off the wall.";
  return sendJson(res, 200, payload);
}

function handleCensus(_req, res) {
  const census = buildCensus();
  try {
    writeFileSync(join(siteRoot, "census.json"), JSON.stringify(census, null, 2) + "\n");
  } catch {
    /* best effort */
  }
  return sendJson(res, 200, census);
}

function handleCurate(_req, res) {
  const curatePath = join(siteRoot, "curate.json");
  const rankPath = join(huntDir, "curate-rank.json");
  let payload = null;
  try {
    if (existsSync(curatePath)) payload = JSON.parse(readFileSync(curatePath, "utf8"));
  } catch {
    /* ignore */
  }
  if (!payload?.queue) {
    try {
      if (existsSync(rankPath)) {
        const rank = JSON.parse(readFileSync(rankPath, "utf8"));
        payload = {
          museum: rank.museum || "Still Answering",
          curatedAt: rank.curatedAt,
          algorithm: rank.algorithm,
          authority: rank.authority,
          hallSize: rank.hallSize,
          byDecision: rank.byDecision,
          queue: (rank.ranked || []).filter(
            (r) => r.decision === "strong" || r.decision === "consider",
          ),
        };
      }
    } catch {
      /* ignore */
    }
  }
  if (!payload) {
    return sendJson(res, 200, {
      museum: "Still Answering",
      queue: [],
      note: "Empty desk. Run npm run curate -- --desk",
    });
  }
  return sendJson(res, 200, payload);
}

function handleStatic(req, res) {
  const file = safeSitePath(req.url || "/");
  if (!file) {
    res.writeHead(400);
    return res.end("Bad path");
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  const ext = extname(file).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  res.end(readFileSync(file));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS" && req.url?.startsWith("/api/")) {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      return res.end();
    }
    if (
      req.method === "POST" &&
      (req.url === "/api/nominate" || req.url?.startsWith("/api/nominate?"))
    ) {
      return await handleNominate(req, res);
    }
    if (
      req.method === "GET" &&
      (req.url === "/api/hunt/findings" || req.url?.startsWith("/api/hunt/findings?"))
    ) {
      return handleHuntFindings(req, res);
    }
    if (
      req.method === "GET" &&
      (req.url === "/api/census" || req.url?.startsWith("/api/census?"))
    ) {
      return handleCensus(req, res);
    }
    if (
      req.method === "GET" &&
      (req.url === "/api/hall" || req.url?.startsWith("/api/hall?"))
    ) {
      return handleHall(req, res);
    }
    if (
      req.method === "GET" &&
      (req.url === "/api/curate" || req.url?.startsWith("/api/curate?"))
    ) {
      return handleCurate(req, res);
    }
    if (req.method === "GET" || req.method === "HEAD") {
      return handleStatic(req, res);
    }
    res.writeHead(405);
    res.end("Method not allowed");
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Server error." });
  }
});

server.listen(PORT, BIND, () => {
  console.log(
    `Still Answering http://${BIND}:${PORT}/ turnstile=${TURNSTILE_SECRET ? "on" : "MISSING_SECRET"} action=${EXPECTED_ACTION}`,
  );
});
