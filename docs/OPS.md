# Operations — GCE daemons

Production tree: `/var/www/ghost-museum` on **chrysalis-test-vm**.  
Public: **https://ghosts.agenticop.io/** (nginx → `127.0.0.1:19191`).

---

## Daemon set

| Daemon | Restart script | Process | Role |
|--------|----------------|---------|------|
| Museum | `gce-restart-museum.sh` | `demo-server.mjs` | Static site + APIs |
| Hunt | `gce-restart-hunt.sh` | `hunt.mjs --loop` | Bounded GET passes |
| Hang drain | `gce-restart-hang-drain.sh` | `hang-drain-loop.mjs` | Timed `hang:auto` batches |
| Authority | `gce-restart-authority.sh` | `authority-loop.mjs --loop` | Discover → watchlist → curate (~6h) |
| Search | `gce-restart-search.sh` | `search-schedule-loop.mjs` | SerpAPI budget (~25/mo) |
| Watchdog | `gce-restart-watchdog.sh` | `process-watchdog.mjs` | Restart stale/dead hunt/hang/museum |
| Recheck | (long-lived) | `recheck.mjs --loop` | Monthly wall refresh → banished |

PID files live under `/tmp/ghost-*.pid`. Logs: `/tmp/ghost-*.log`.

Hang drain is **not** inside authority: long discover/search must never block framing.

---

## Robustness contract

Daemons are designed so they **cannot hang forever**:

| Mechanism | Where |
|-----------|--------|
| Timed child processes (`spawnTimed`) | hang-drain, hang-auto curate, authority steps |
| Bounded hunt batch (`GM_HUNT_PASS_MAX`, default 60) | hunt |
| Findings index (no full jsonl rescan every request) | hunt, curate, demo-server |
| Heartbeats `hunt/heartbeat-*.json` | hunt, hang-drain, hang-auto |
| Watchdog stale thresholds | process-watchdog |
| Hang skip cooldown `hunt/hang-skip.json` | timeout / ENOTFOUND / hard fails |
| Atomic JSON writes | exhibits, desk, index |

---

## Environment (host `.env` or process)

### Hunt

| Var | Default | Meaning |
|-----|---------|---------|
| `GM_HUNT_PASS_MAX` | `60` | Max probes per pass |
| `GM_HUNT_PASS_PAUSE_MS` | `20000` | Pause between passes |
| `GM_HUNT_DELAY_MS` | `800` | Delay between GETs |
| `GM_HUNT_TIMEOUT_MS` | `12000` | Per-URL timeout |
| `GM_HUNT_REQUERY_MS` | `24h` | Fresh window for ghost-class findings |
| `GM_HUNT_REQUERY_UNPROBED_MS` | `3h` | Revisit inconclusive / unprobed sooner |

### Hang drain

| Var | Default | Meaning |
|-----|---------|---------|
| `GM_HANG_AUTO_MAX` | `12` | Max commits per drain child |
| `GM_HANG_CATCHUP_MS` | `45000` | Sleep while hangable pending |
| `GM_HANG_DRAIN_MS` | `180000` | Sleep when desk clear |
| `GM_HANG_CHILD_TIMEOUT_MS` | `360000` | Kill hung hang-auto |
| `GM_HANG_CURATE_EVERY` | `3` | Curate every N cycles (always if last hung 0) |
| `GM_HANG_SKIP_COOLDOWN_MS` | `6h` | Cooldown after timeout failures |

### Authority / search

| Var | Default | Meaning |
|-----|---------|---------|
| `GM_AUTHORITY_PERIOD_MS` | `6h` | Sleep between authority passes |
| `GM_AUTHORITY_STEP_TIMEOUT_MS` | `20m` | Per-step kill |
| `SERPAPI_API_KEY` / `SERPAPI_MONTHLY_BUDGET` | — / `25` | Search schedule |
| `GM_SEARCH_PERIOD_MS` | ~31h | Spacing between search queries |
| `BRAVE_SEARCH_API_KEY` / Google CSE | — | Alternate search providers |

### Server

| Var | Default | Meaning |
|-----|---------|---------|
| `GM_PORT` | `19191` | demo-server port |
| `GM_API_CACHE_MS` | `10000` | Census/hall cache TTL |
| `TURNSTILE_SECRET` | — | Nominate verification |

---

## Operator checks

```bash
# Live meter
curl -fsS 'https://ghosts.agenticop.io/api/census?slim=1'

# PIDs
for f in /tmp/ghost-*.pid; do echo -n "$f "; cat "$f"; echo; done

# Heartbeats
ls -la /var/www/ghost-museum/hunt/heartbeat-*.json
cat /var/www/ghost-museum/hunt/watchdog-last.json

# Logs
tail -n 40 /tmp/ghost-hang-drain.log
tail -n 40 /tmp/ghost-hunt.log
```

Restart one lane:

```bash
bash scripts/gce-restart-hunt.sh
bash scripts/gce-restart-hang-drain.sh
bash scripts/gce-restart-museum.sh
bash scripts/gce-restart-watchdog.sh
bash scripts/gce-restart-authority.sh
bash scripts/gce-restart-search.sh
```

Deploy site/scripts from a workstation:

```powershell
powershell -File scripts/gce-deploy-ghosts-host.ps1
```

---

## Flat meter? (ops triage)

1. Read census: is **awaiting** 0 and **pending hangable** ~0? → hang cannot move hung/candidates.
2. `hunt/hang-auto-log.json` — last `hungCount` / failures.
3. `hunt/hang-skip.json` — cooldown list.
4. Desk walls: if almost all `unprobed`, hunt must reclassify before hang.
5. Watchdog — any `FAIL` / restarts?
6. See [`CENSUS.md`](./CENSUS.md) for semantic stalls vs process stalls.
