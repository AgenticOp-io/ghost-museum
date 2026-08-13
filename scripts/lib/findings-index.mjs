/**
 * Incremental latest-finding index so hunt/curate/census don't rescan 10MB+ jsonl every pass.
 * Source of truth remains findings.jsonl (append-only). Index is a cache.
 */
import { readFileSync, existsSync, appendFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJson } from "./atomic-write.mjs";

export function findingsIndexPath(root) {
  return join(root, "hunt", "findings-latest.json");
}

export function findingsJsonlPath(root) {
  return join(root, "hunt", "findings.jsonl");
}

/** Full rebuild from jsonl → findings-latest.json */
export function rebuildFindingsIndex(root) {
  const jsonl = findingsJsonlPath(root);
  const byId = {};
  if (existsSync(jsonl)) {
    for (const line of readFileSync(jsonl, "utf8").split(/\r?\n/)) {
      if (!line) continue;
      try {
        const f = JSON.parse(line);
        if (!f?.id) continue;
        const prev = byId[f.id];
        if (!prev || String(f.huntedAt || "") > String(prev.huntedAt || "")) byId[f.id] = f;
      } catch {
        /* skip */
      }
    }
  }
  const payload = {
    museum: "Still Answering",
    updatedAt: new Date().toISOString(),
    count: Object.keys(byId).length,
    byId,
  };
  atomicWriteJson(findingsIndexPath(root), payload);
  return payload;
}

/**
 * Load latest findings map. Uses index when present; rebuilds if missing or older than jsonl.
 */
export function loadLatestFindingsMap(root) {
  const indexPath = findingsIndexPath(root);
  const jsonl = findingsJsonlPath(root);
  let indexMtime = 0;
  let jsonlMtime = 0;
  try {
    if (existsSync(indexPath)) indexMtime = statSync(indexPath).mtimeMs;
  } catch {
    /* ignore */
  }
  try {
    if (existsSync(jsonl)) jsonlMtime = statSync(jsonl).mtimeMs;
  } catch {
    /* ignore */
  }
  let index = null;
  if (existsSync(indexPath) && indexMtime >= jsonlMtime) {
    try {
      index = JSON.parse(readFileSync(indexPath, "utf8"));
    } catch {
      index = null;
    }
  }
  if (!index?.byId) {
    index = rebuildFindingsIndex(root);
  }
  return new Map(Object.entries(index.byId || {}));
}

/** Append one finding to jsonl and patch the index atomically. */
export function appendFinding(root, finding) {
  if (!finding?.id) return;
  appendFileSync(findingsJsonlPath(root), JSON.stringify(finding) + "\n");
  const indexPath = findingsIndexPath(root);
  let index = { museum: "Still Answering", byId: {} };
  if (existsSync(indexPath)) {
    try {
      index = JSON.parse(readFileSync(indexPath, "utf8"));
      if (!index.byId) index.byId = {};
    } catch {
      index = rebuildFindingsIndex(root);
    }
  }
  const prev = index.byId[finding.id];
  if (!prev || String(finding.huntedAt || "") > String(prev.huntedAt || "")) {
    index.byId[finding.id] = finding;
  }
  index.updatedAt = new Date().toISOString();
  index.count = Object.keys(index.byId).length;
  atomicWriteJson(indexPath, index);
}
