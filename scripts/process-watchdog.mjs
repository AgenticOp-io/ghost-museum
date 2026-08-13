#!/usr/bin/env node
/**
 * Watchdog — restart Still Answering daemons when heartbeats go stale or PIDs die.
 *
 *   node scripts/process-watchdog.mjs
 *   node scripts/process-watchdog.mjs --once
 *
 * Checks hunt + hang-drain (+ optional museum). Uses restart shell scripts when present.
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sleep, heartbeatAgeMs, readHeartbeat } from "./lib/loop-kit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const once = args.includes("--once");
const PERIOD_MS = Number(process.env.GM_WATCHDOG_MS || 60_000);

const CHECKS = [
  {
    name: "hunt",
    pidFile: "/tmp/ghost-hunt.pid",
    match: "scripts/hunt.mjs",
    staleMs: Number(process.env.GM_WATCHDOG_HUNT_STALE_MS || 10 * 60 * 1000),
    restart: join(root, "scripts", "gce-restart-hunt.sh"),
  },
  {
    name: "hang-drain",
    pidFile: "/tmp/ghost-hang-drain.pid",
    match: "scripts/hang-drain-loop.mjs",
    staleMs: Number(process.env.GM_WATCHDOG_HANG_STALE_MS || 12 * 60 * 1000),
    restart: join(root, "scripts", "gce-restart-hang-drain.sh"),
  },
  {
    name: "museum",
    pidFile: "/tmp/ghost-museum.pid",
    match: "scripts/demo-server.mjs",
    staleMs: Number(process.env.GM_WATCHDOG_MUSEUM_STALE_MS || 15 * 60 * 1000),
    restart: join(root, "scripts", "gce-restart-museum.sh"),
    // museum may not write heartbeats — PID-only unless heartbeat exists
    pidOnlyUnlessHeartbeat: true,
  },
];

function pidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(path) {
  if (!existsSync(path)) return null;
  try {
    return Number(String(readFileSync(path, "utf8")).trim());
  } catch {
    return null;
  }
}

function processMatchRunning(match) {
  const r = spawnSync("pgrep", ["-f", match], { encoding: "utf8" });
  return r.status === 0 && Boolean(r.stdout?.trim());
}

function restartOne(check) {
  console.log(`watchdog: restarting ${check.name}`);
  if (existsSync(check.restart)) {
    const r = spawnSync("bash", [check.restart], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    console.log(`watchdog: ${check.name} restart exit ${r.status}`);
    return r.status === 0;
  }
  console.error(`watchdog: missing restart script ${check.restart}`);
  return false;
}

function evaluate(check) {
  const pid = readPid(check.pidFile);
  const alive = pidAlive(pid) || processMatchRunning(check.match);
  const age = heartbeatAgeMs(root, check.name);
  const hb = readHeartbeat(root, check.name);
  const hasHb = Boolean(hb?.at);

  if (!alive) {
    return { ok: false, reason: "dead", pid, age, hasHb };
  }
  if (check.pidOnlyUnlessHeartbeat && !hasHb) {
    return { ok: true, reason: "pid-ok", pid, age, hasHb };
  }
  if (age > check.staleMs) {
    return { ok: false, reason: "stale-heartbeat", pid, age, hasHb };
  }
  return { ok: true, reason: "ok", pid, age, hasHb };
}

async function tick() {
  const report = { at: new Date().toISOString(), checks: [] };
  for (const check of CHECKS) {
    const ev = evaluate(check);
    report.checks.push({ name: check.name, ...ev });
    console.log(
      `watchdog ${check.name} · ${ev.ok ? "ok" : "FAIL"} · ${ev.reason} · pid=${ev.pid} · hbAgeMs=${Number.isFinite(ev.age) ? Math.round(ev.age) : "inf"}`,
    );
    if (!ev.ok) restartOne(check);
  }
  mkdirSync(join(root, "hunt"), { recursive: true });
  writeFileSync(join(root, "hunt", "watchdog-last.json"), JSON.stringify(report, null, 2) + "\n");
}

console.log(`watchdog ${once ? "once" : "loop"} · period ${PERIOD_MS}ms`);
if (once) {
  await tick();
} else {
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error(`watchdog tick failed: ${err?.message || err}`);
    }
    await sleep(PERIOD_MS);
  }
}
