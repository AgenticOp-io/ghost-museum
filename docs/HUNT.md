# Hunt — GET-only evidence bot

Hunt probes the **watchlist**. It never invents exhibits and **never auto-hangs**.

```bash
npm run hunt                 # one bounded pass
npm run hunt -- --loop       # continuous
npm run hunt -- --once <id>
npm run hunt -- --full       # ignore fresh window
npm run hunt -- --rebuild-index
```

---

## What it writes

| File | Role |
|------|------|
| `hunt/findings.jsonl` | Append-only evidence rows |
| `hunt/findings-latest.json` | Latest finding per id (incremental index) |
| `hunt/last-pass.json` | Pass stats (`probed`, `planned`, `skippedFresh`, …) |
| `hunt/heartbeat-hunt.json` | Liveness for watchdog |

Each finding includes `httpStatus` / `probeError`, `finalUrl`, `redirectChain`, `suggestedWall`, `huntedAt`, and usually `obituary` / `source` when known.

---

## Pass model (robust)

1. Load watchlist + findings index.
2. Plan queue: **never-probed first**, then **stale** (past fresh window).
3. Cap to `GM_HUNT_PASS_MAX` (default **60**).
4. Probe with hard timeout (`GM_HUNT_TIMEOUT_MS`).
5. Mid-pass reload injects **only true awaiting** (no finding yet) — never re-queues the whole stale list.
6. Sleep `GM_HUNT_PASS_PAUSE_MS`, repeat if `--loop`.

### Fresh windows

| Finding kind | Default requery |
|--------------|-----------------|
| Ghost-class suggested wall | 24h (`GM_HUNT_REQUERY_MS`) |
| `unprobed` / probeError / null status | 3h (`GM_HUNT_REQUERY_UNPROBED_MS`) |

---

## Suggested walls

From the GET result (same spirit as hang inference):

| Signal | Wall |
|--------|------|
| Redirect chain length &gt; 1 | `successor-facade` |
| `401` / `403` | `auth-ghost` |
| `410` | `buried` |
| `200` (no multi-hop) | `still-answering` |
| Else / failure | `unprobed` |

Only ghost-class walls (`still-answering` / `auth-ghost` / `successor-facade`) grow census **candidates** / **Ghosts**.

---

## Rules

1. GET only. Museum UA. Public URLs.
2. No auth bypass, fuzzing, credential stuffing, or load tests.
3. Failures are recorded honestly (`probeError`) — they are not hung.
4. Hunt output feeds **curate**, not the hall frames file.
