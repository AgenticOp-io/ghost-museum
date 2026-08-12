#!/usr/bin/env node
/**
 * Static hall + nomination intake. No login.
 * Anti-bot: honeypot, min fill time, IP rate limit, field validation.
 * Nominations are offers only — never auto-hung.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = process.env.GM_SITE_ROOT || join(root, "site");
const nomDir = process.env.GM_NOMINATIONS_DIR || join(root, "nominations");
const PORT = Number(process.env.GM_PORT || 27474);
const MIN_MS = 2500;
const MAX_NOTE = 500;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 5;

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
    return sendJson(res, 429, { ok: false, error: "Too many nominations from this network. Try later." });
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

  // Honeypot — bots fill hidden "company" / website fields.
  if (data.company || data.website || data.url) {
    return sendJson(res, 200, { ok: true }); // silent success
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
    return sendJson(res, 400, { ok: false, error: "Probe URL and obituary must be public http(s) links." });
  }
  if (note.length > MAX_NOTE) {
    return sendJson(res, 400, { ok: false, error: `Note must be ≤ ${MAX_NOTE} characters.` });
  }
  if (contact && contact.length > 200) {
    return sendJson(res, 400, { ok: false, error: "Contact is too long." });
  }
  // Soft reject integration language
  const blob = `${note} ${probeUrl}`.toLowerCase();
  if (/\b(api[_ -]?key|bearer\s|password|curl\s+-u|how to (keep|still) (use|call|integrate))\b/.test(blob)) {
    return sendJson(res, 400, { ok: false, error: "Nominations cannot include credentials or integration instructions." });
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

  const line = JSON.stringify(entry) + "\n";
  appendFileSync(join(nomDir, "nominations.jsonl"), line);
  writeFileSync(join(nomDir, `${entry.id}.json`), JSON.stringify(entry, null, 2) + "\n");

  return sendJson(res, 200, {
    ok: true,
    id: entry.id,
    message: "Received. A curator will probe before anything hangs. DO NOT INTEGRATE.",
  });
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
    if (req.method === "POST" && (req.url === "/api/nominate" || req.url?.startsWith("/api/nominate?"))) {
      return await handleNominate(req, res);
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Ghost Museum demo http://0.0.0.0:${PORT}/ (site=${siteRoot})`);
});
