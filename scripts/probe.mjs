#!/usr/bin/env node
/**
 * Refresh last-probe fields. GET/HEAD only. Public URLs. No auth bypass.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "exhibits", "exhibits.json");
const data = JSON.parse(readFileSync(path, "utf8"));
const ua = data.userAgent || "GhostMuseum/0.1 (exhibit probe)";

async function probe(url) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": ua },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  const title = (text.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || null;
  return {
    httpStatus: res.status,
    finalUrl: res.url,
    titleTag: title ? title.trim() : null,
  };
}

const probedAt = new Date().toISOString();
for (const ex of data.exhibits) {
  try {
    const r = await probe(ex.probeUrl);
    ex.httpStatus = r.httpStatus;
    ex.finalUrl = r.finalUrl;
    if (r.titleTag) ex.titleTag = r.titleTag;
    ex.probeError = undefined;
    console.log(`${ex.id}\t${r.httpStatus}\t${r.finalUrl}`);
  } catch (err) {
    ex.probeError = String(err.message || err);
    console.error(`${ex.id}\tFAIL\t${ex.probeError}`);
  }
}
data.probedAt = probedAt;
const json = JSON.stringify(data, null, 2) + "\n";
writeFileSync(path, json);
writeFileSync(join(root, "site", "exhibits.json"), json);
console.log(`wrote ${path} @ ${probedAt}`);
