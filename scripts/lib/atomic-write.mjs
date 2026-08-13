/**
 * Atomic-ish JSON / text writes so readers never see a half-written file.
 * Linux: rename replaces. Windows: unlink+rename fallback.
 */
import { writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";

export function atomicWrite(path, contents) {
  const body = typeof contents === "string" ? contents : String(contents);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body);
  try {
    renameSync(tmp, path);
  } catch {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      /* ignore */
    }
    renameSync(tmp, path);
  }
}

export function atomicWriteJson(path, value) {
  atomicWrite(path, JSON.stringify(value, null, 2) + "\n");
}
