# Architecture — Still Answering

## Product shape

Still Answering is a **static hall + small Node server**:

- **Site** (`site/`) — HTML/CSS/JS museum (frames, timeline, domain directory, nominate, curate, hunt)
- **Exhibits** (`exhibits/exhibits.json`) — hung frames (source of truth)
- **Hunt** (`hunt/`) — seeds, watchlist, findings, curate rank, heartbeats, logs
- **Scripts** (`scripts/`) — probe, hunt, curate, hang, authority, daemons, GCE helpers
- **Docs** (`docs/`) — contracts and operator guides

Public host: **https://ghosts.agenticop.io/** (nginx → `demo-server` on `:19191`).

---

## Data flow (big picture)

```
seeds / discover / autoseed / search:seed
              ↓
     hunt/watchlist.json
              ↓
          hunt.mjs  ──GET──►  findings.jsonl + findings-latest.json
              ↓
          curate.mjs  ──►  curate-rank.json + site/curate.json
              ↓
     hang-auto / hang-drain  ──GET──►  exhibits/exhibits.json
              ↓                    └─► site/exhibits.json
          validate.mjs
              ↓
     demo-server  /api/census  /api/hall  /api/curate
              ↓
         browser hall (museum.js + gm-census.js)
```

Hang drain is **independent** of the long authority pass so discover/search never blocks framing.

---

## Important files

| Path | Role |
|------|------|
| `exhibits/exhibits.json` | Hung frames (canonical) |
| `site/exhibits.json` | Copy for static/hall boot |
| `site/census.json` | Best-effort census snapshot |
| `site/curate.json` | Public desk queue |
| `hunt/watchlist.json` | Hunt queue |
| `hunt/findings.jsonl` | Append-only probe evidence |
| `hunt/findings-latest.json` | Incremental latest-by-id index |
| `hunt/curate-rank.json` | Full ranked report |
| `hunt/hang-auto-log.json` | Last auto-hang summary |
| `hunt/hang-skip.json` | Cooldown for timeout / hard failures |
| `hunt/heartbeat-*.json` | Daemon liveness |
| `hunt/seeds/*.json` | Curator seed packs |
| `hunt/search-quota.json` | SerpAPI monthly budget ledger |

Atomic writers: `scripts/lib/atomic-write.mjs` (exhibits / desk / index).

---

## HTTP API (`demo-server.mjs`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/census` | GET | Live census (`?slim=1` omits heavy maps) |
| `/api/hall` | GET | Paginated hall catalog (`page`, `pageSize`, `wall`) |
| `/api/curate` | GET | Desk queue with already-hung stripped |
| `/api/hunt/findings` | GET | Recent findings for hunt desk UI |
| `/api/nominate` | POST | Public nomination (+ Turnstile) |
| static `/site/*` | GET | Museum assets (`Cache-Control: no-store` for html/js/css/json) |

Census/hall rebuilds are **TTL + mtime cached** so a growing `findings.jsonl` does not block every request.

---

## Browser hall

| Module | Role |
|--------|------|
| `site/museum.js` | By-wall (paginated via `/api/hall`), timeline (year clusters + year pager), domain directory |
| `site/gm-census.js` | Shared Ghosts meter |
| `site/gm-shared.js` | Domain grouping + domain directory render |
| `site/curate-desk.js` | Curator UI |
| `site/hunt-desk.js` | Findings UI |

**Performance rules (intentional):**

- By-wall never dumps all frames into the DOM (pager, ~24/page).
- Timeline paints **one death-year page** at a time (not hundreds of frames).
- Full `exhibits.json` loads on demand for timeline/domain, not for walls boot.

---

## Libraries (`scripts/lib/`)

| Module | Role |
|--------|------|
| `probe.mjs` | Shared GET probe + redirect chain + TLS warning retry |
| `census.mjs` | Census payload builder |
| `hall.mjs` | Hung ∪ ghost-class catalog + pagination |
| `hang.mjs` | Hang one id (draft / commit) |
| `findings-index.mjs` | Latest-finding index for hunt/curate/server |
| `loop-kit.mjs` | Sleep, jitter, heartbeats, timed `spawn` |
| `atomic-write.mjs` | Safe JSON writes |
| `seed-fitness.mjs` | Fitness scores for search/autoseed |
| `ghost-model.mjs` | Shared ghost-model helpers |

---

## Lane boundaries

Still Answering owns **only** `engines/ghost-museum`. It does not share AgenticOps marketing chrome, Chrysalis CWL, WISPTools, FDE, or Helix. See `AGENTS.md`.
