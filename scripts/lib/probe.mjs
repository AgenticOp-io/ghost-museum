#!/usr/bin/env node
/**
 * Shared GET probe + wall classification for Still Answering.
 * GET only. Public URLs. No auth bypass.
 *
 * Browsers often open hosts whose TLS chain Node rejects (missing intermediates).
 * On those TLS verify failures we retry once with a documented tlsWarning so the
 * hall records the HTTP evidence instead of a opaque "fetch failed".
 */
import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

export const MAX_HOPS = 8;
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 64_000;

const TLS_RETRY_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_UNTRUSTED",
]);

export function formatProbeError(err) {
  const cause = err?.cause;
  const parts = [];
  const msg = String(err?.message || err || "probe failed");
  if (msg && msg !== "fetch failed") parts.push(msg);
  else parts.push("fetch failed");
  if (cause?.code) parts.push(cause.code);
  else if (err?.code) parts.push(err.code);
  if (cause?.message && !parts.includes(cause.message)) parts.push(cause.message);
  return parts.join(" · ");
}

function isTlsVerifyError(err) {
  const code = err?.cause?.code || err?.code;
  if (code && TLS_RETRY_CODES.has(code)) return true;
  const msg = String(err?.cause?.message || err?.message || "");
  return /unable to verify the first certificate|self.?signed|certificate/i.test(msg);
}

export async function probeUrl(url, ua, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    return await probeWithFetch(url, ua, { timeoutMs, insecure: false });
  } catch (err) {
    if (!isTlsVerifyError(err)) throw Object.assign(err, { probeMessage: formatProbeError(err) });
    const fallback = await probeWithHttps(url, ua, { timeoutMs, insecure: true });
    fallback.tlsWarning =
      err?.cause?.code || err?.code || "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
    return fallback;
  }
}

async function probeWithFetch(url, ua, { timeoutMs, insecure }) {
  // Built-in fetch cannot relax TLS; insecure path uses https.request.
  if (insecure) return probeWithHttps(url, ua, { timeoutMs, insecure: true });

  const chain = [];
  let current = url;
  let titleTag = null;
  let bodyStatus = null;
  const deadline = Date.now() + timeoutMs;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const remain = Math.max(500, deadline - Date.now());
    if (Date.now() >= deadline) throw new Error(`probe deadline exceeded after ${hop} hops`);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), remain);
    let res;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": ua,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
        signal: ac.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (ac.signal.aborted) throw new Error(`probe timeout after ${timeoutMs}ms`);
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const loc = res.headers.get("location");
    const isRedirect = res.status >= 300 && res.status < 400 && loc;
    chain.push({
      url: current,
      status: res.status,
      ...(isRedirect ? { location: new URL(loc, current).href } : {}),
    });

    if (isRedirect) {
      try {
        res.body?.cancel();
      } catch {
        /* ignore */
      }
      current = new URL(loc, current).href;
      continue;
    }

    bodyStatus = res.status;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html") || ct.includes("application/xhtml")) {
      titleTag = await sniffTitle(res, Math.max(500, deadline - Date.now()));
    } else {
      try {
        res.body?.cancel();
      } catch {
        /* ignore */
      }
    }
    break;
  }

  if (bodyStatus == null && chain.length) {
    bodyStatus = chain[chain.length - 1].status;
  }

  return {
    httpStatus: bodyStatus,
    finalUrl: chain.length ? chain[chain.length - 1].url : url,
    redirectChain: chain,
    titleTag,
  };
}

/** Manual redirect follow via http(s).request — supports insecure TLS retry. */
function probeWithHttps(url, ua, { timeoutMs, insecure }) {
  const chain = [];
  let current = url;
  let titleTag = null;
  let bodyStatus = null;
  const deadline = Date.now() + timeoutMs;

  return (async () => {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const remain = Math.max(500, deadline - Date.now());
      if (Date.now() >= deadline) throw new Error(`probe deadline exceeded after ${hop} hops`);

      const res = await rawRequest(current, ua, { timeoutMs: remain, insecure });
      const loc = res.headers.location;
      const isRedirect = res.status >= 300 && res.status < 400 && loc;
      chain.push({
        url: current,
        status: res.status,
        ...(isRedirect ? { location: new URL(loc, current).href } : {}),
      });

      if (isRedirect) {
        current = new URL(loc, current).href;
        continue;
      }

      bodyStatus = res.status;
      const ct = String(res.headers["content-type"] || "").toLowerCase();
      if (ct.includes("text/html") || ct.includes("application/xhtml")) {
        titleTag = titleFromHtml(res.bodyText || "");
      }
      break;
    }

    if (bodyStatus == null && chain.length) {
      bodyStatus = chain[chain.length - 1].status;
    }

    return {
      httpStatus: bodyStatus,
      finalUrl: chain.length ? chain[chain.length - 1].url : url,
      redirectChain: chain,
      titleTag,
    };
  })();
}

function rawRequest(url, ua, { timeoutMs, insecure }) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "user-agent": ua,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          host: parsed.host,
        },
        timeout: timeoutMs,
        rejectUnauthorized: !insecure,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          if (size >= MAX_HTML_BYTES) return;
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const take = buf.subarray(0, MAX_HTML_BYTES - size);
          chunks.push(take);
          size += take.length;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            bodyText: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`probe timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

async function sniffTitle(res, remainMs) {
  const reader = res.body?.getReader?.();
  if (!reader) {
    try {
      const text = await withTimeout(res.text(), remainMs, "html body timeout");
      return titleFromHtml(text);
    } catch {
      try {
        res.body?.cancel();
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  const chunks = [];
  let size = 0;
  const started = Date.now();
  try {
    while (size < MAX_HTML_BYTES) {
      if (Date.now() - started > remainMs) break;
      const { done, value } = await withTimeout(
        reader.read(),
        remainMs - (Date.now() - started),
        "html body timeout",
      );
      if (done) break;
      if (!value) continue;
      chunks.push(Buffer.from(value));
      size += value.byteLength;
      const soFar = Buffer.concat(chunks).toString("utf8");
      const m = soFar.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (m) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return m[1].trim().replace(/\s+/g, " ").slice(0, 160);
      }
    }
  } catch {
    /* body timeout / cancel */
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
  return titleFromHtml(Buffer.concat(chunks).toString("utf8"));
}

function titleFromHtml(text) {
  const m = String(text || "").match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim().replace(/\s+/g, " ").slice(0, 160) : null;
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), Math.max(1, ms));
    }),
  ]);
}

export function isBanishedResult(r, probeError) {
  if (probeError) return true;
  if (r?.httpStatus === 410) return true;
  return false;
}

export function classifyWall(ex, r, probeError) {
  if (isBanishedResult(r, probeError)) return "banished";

  const hops = Array.isArray(r?.redirectChain) ? r.redirectChain.length : 0;
  if (hops > 1) return "successor-facade";
  if (r?.httpStatus === 401 || r?.httpStatus === 403) return "auth-ghost";
  if (r?.httpStatus === 200) return "still-answering";
  if (r?.httpStatus === 410) return "banished";

  if (ex.wall === "banished") return "unprobed";
  return ex.wall || "unprobed";
}

export function summarizeChain(chain) {
  if (!chain?.length) return "";
  return chain.map((h) => h.status).join("→");
}
