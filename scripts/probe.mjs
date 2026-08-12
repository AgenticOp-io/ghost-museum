#!/usr/bin/env node
/**
 * Refresh last-probe fields. GET only. Public URLs. No auth bypass.
 * Follows redirects manually so each hop is recorded honestly.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "exhibits", "exhibits.json");
const sitePath = join(root, "site", "exhibits.json");
const data = JSON.parse(readFileSync(path, "utf8"));
const ua = data.userAgent || "GhostMuseum/0.1 (exhibit probe)";
const MAX_HOPS = 8;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function probe(url) {
  const chain = [];
  let current = url;
  let titleTag = null;
  let bodyStatus = null;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": ua, accept: "*/*" },
      signal: AbortSignal.timeout(15000),
    });

    const loc = res.headers.get("location");
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
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html") || ct.includes("application/xhtml")) {
      const text = await res.text();
      const m = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      titleTag = m ? m[1].trim().replace(/\s+/g, " ") : null;
    } else {
      // Drain body so the socket can close cleanly; do not parse binaries.
      await res.arrayBuffer();
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

function summarize(chain) {
  if (!chain?.length) return "";
  return chain.map((h) => h.status).join(" → ");
}

const probedAt = new Date().toISOString();
for (const ex of data.exhibits) {
  try {
    const r = await probe(ex.probeUrl);
    ex.httpStatus = r.httpStatus;
    ex.finalUrl = r.finalUrl;
    ex.redirectChain = r.redirectChain;
    if (r.titleTag) ex.titleTag = r.titleTag;
    delete ex.probeError;
    console.log(`${ex.id}\t${summarize(r.redirectChain)}\t${r.finalUrl}`);
  } catch (err) {
    ex.probeError = String(err.message || err);
    console.error(`${ex.id}\tFAIL\t${ex.probeError}`);
  }
  await sleep(400);
}
data.probedAt = probedAt;
const json = JSON.stringify(data, null, 2) + "\n";
writeFileSync(path, json);
writeFileSync(sitePath, json);
console.log(`wrote ${path} @ ${probedAt}`);
