/**
 * Shared helpers for long-running Still Answering daemons.
 * Bounded work, heartbeats, timed child processes — no infinite hangs.
 */
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function jitter(base, frac = 0.15) {
  const spread = Math.min(Math.max(40, Math.floor(base * frac)), Math.max(200, Math.floor(base * 0.25)));
  return base + Math.floor(Math.random() * spread);
}

export function heartbeat(root, name, extra = {}) {
  const dir = join(root, "hunt");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `heartbeat-${name}.json`);
  const body = {
    name,
    at: new Date().toISOString(),
    pid: process.pid,
    ...extra,
  };
  writeFileSync(path, JSON.stringify(body, null, 2) + "\n");
  return body;
}

export function readHeartbeat(root, name) {
  const path = join(root, "hunt", `heartbeat-${name}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function heartbeatAgeMs(root, name, now = Date.now()) {
  const hb = readHeartbeat(root, name);
  if (!hb?.at) return Infinity;
  const t = Date.parse(hb.at);
  return Number.isFinite(t) ? now - t : Infinity;
}

/**
 * Spawn a node script with a hard wall-clock timeout.
 * On timeout: SIGTERM, then SIGKILL after killGraceMs.
 */
export function spawnTimed(execPath, argv, { cwd, env, timeoutMs, killGraceMs = 8_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(execPath, argv, {
      cwd,
      env: env || process.env,
      stdio: "inherit",
    });
    let settled = false;
    let timedOut = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          if (!child.killed) child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, killGraceMs);
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      finish({ status: 1, timedOut: false, error: String(err?.message || err) });
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      finish({
        status: code == null ? 1 : code,
        signal: signal || null,
        timedOut,
      });
    });
  });
}

export function readJsonSafe(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return fallback;
    }
  }
}
