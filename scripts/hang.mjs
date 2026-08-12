#!/usr/bin/env node
/**
 * Hang draft / commit — turn a curated id into an exhibit (fresh GET required).
 *
 *   npm run hang -- --id smile-amazon
 *   npm run hang -- --id smile-amazon --commit
 *   npm run hang:auto   # auto-curate strong desk candidates
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hangOne } from "./lib/hang.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const idIdx = args.indexOf("--id");
const id = idIdx >= 0 ? args[idIdx + 1] : null;
const commit = args.includes("--commit");
const wallOverride = (() => {
  const i = args.indexOf("--wall");
  return i >= 0 ? args[i + 1] : null;
})();

if (!id) {
  console.error("Usage: npm run hang -- --id <id> [--wall still-answering] [--commit]");
  console.error("       npm run hang:auto");
  process.exit(1);
}

const res = await hangOne({ root, id, commit, wallOverride });
if (!res.ok) {
  console.error(res.reason || "hang failed");
  process.exit(1);
}
if (!commit) {
  console.log("Review the draft, then: npm run hang -- --id " + id + " --commit");
  console.log("Or auto-curate strong desk: npm run hang:auto");
}
