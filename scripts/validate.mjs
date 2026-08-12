#!/usr/bin/env node
/**
 * Exhibit hall gate: required fields, honest walls, DO NOT INTEGRATE.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "exhibits", "exhibits.json");
const sitePath = join(root, "site", "exhibits.json");

const WALLS = new Set([
  "still-answering",
  "auth-ghost",
  "successor-facade",
  "buried",
  "banished",
  "unprobed",
]);

const REQUIRED = [
  "id",
  "wall",
  "title",
  "owner",
  "declaredDead",
  "obituary",
  "probeUrl",
  "note",
  "doNotIntegrate",
];

const errors = [];

function fail(msg) {
  errors.push(msg);
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const data = JSON.parse(readFileSync(path, "utf8"));
const site = JSON.parse(readFileSync(sitePath, "utf8"));

if (data.museum !== "Still Answering") fail('museum must be "Still Answering"');
if (!data.tagline) fail("missing tagline");
if (!Array.isArray(data.exhibits) || !data.exhibits.length) {
  fail("exhibits must be a non-empty array");
}

const ids = new Set();
for (const [i, ex] of data.exhibits.entries()) {
  const label = ex?.id || `#${i}`;
  for (const key of REQUIRED) {
    if (ex[key] === undefined || ex[key] === null || ex[key] === "") {
      fail(`${label}: missing ${key}`);
    }
  }
  if (ids.has(ex.id)) fail(`duplicate id: ${ex.id}`);
  ids.add(ex.id);

  if (!WALLS.has(ex.wall)) fail(`${label}: invalid wall ${ex.wall}`);
  if (ex.doNotIntegrate !== true) fail(`${label}: doNotIntegrate must be true`);
  if (!isHttpUrl(ex.obituary)) fail(`${label}: obituary must be http(s) URL`);
  if (!isHttpUrl(ex.probeUrl)) fail(`${label}: probeUrl must be http(s) URL`);

  if (ex.wall === "unprobed") continue;

  if (ex.probeError) {
    // Failed probe is honest; still require prior shape if status present.
    continue;
  }
  if (typeof ex.httpStatus !== "number") {
    fail(`${label}: httpStatus required unless unprobed/probeError`);
  }
  if (!ex.finalUrl || !isHttpUrl(ex.finalUrl)) {
    fail(`${label}: finalUrl required unless unprobed/probeError`);
  }
  if (ex.redirectChain && !Array.isArray(ex.redirectChain)) {
    fail(`${label}: redirectChain must be an array`);
  }
}

if (JSON.stringify(data) !== JSON.stringify(site)) {
  fail("site/exhibits.json is out of sync with exhibits/exhibits.json — run npm run probe or npm run sync-exhibits");
}

if (errors.length) {
  console.error("VALIDATE_FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`VALIDATE_OK ${data.exhibits.length} exhibits`);
