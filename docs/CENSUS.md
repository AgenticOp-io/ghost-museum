# Census — the Ghosts meter

The masthead box on every Still Answering page is the **live census**. It is not a marketing counter and not a cache of “last good number.” It reads `/api/census` (fallback: `site/census.json`).

Example (live shape):

```
Ghosts
1539
903 hung
636 candidates
2555 watch
```

---

## Field definitions

| Meter label | API field | Formula / source |
|-------------|-----------|------------------|
| **Ghosts** (hero) | `total` | Unique ids in **hung ∪ ghost-class evidence** |
| **hung** | `hung` | Count of framed exhibits (`exhibits/exhibits.json`, non-banished framed) |
| **candidates** | `candidates` | Ghost-class evidence **not yet hung** ≈ `total − hung` |
| **watch** | `watchlist` | Length of `hunt/watchlist.json` |
| **awaiting** | `awaitingProbe` | Watch rows with **no** finding yet (line hidden when `0`) |
| *(not shown)* | `verified` / `contacted` | Hunt contact tallies (API only) |
| *(not shown)* | `banished` | Shown only if &gt; 0 |

**Ghost-class walls** (count toward `total` / `candidates`):

- `still-answering`
- `auth-ghost`
- `successor-facade`

**Not ghost-class** (do **not** inflate Ghosts / candidates):

- `unprobed` seeds
- probe errors / `ENOTFOUND`
- non-ghost HTTP (many `404`/`429`/`5xx` without a ghost wall)
- plain watch rows that never produced ghost evidence

Canonical builder: `scripts/lib/census.mjs`. Hall catalog (same union): `scripts/lib/hall.mjs`.

---

## How each number moves

### Ghosts (`total`)

| Event | Effect |
|-------|--------|
| Hunt finds a **new** ghost-class id (not already hung) | **↑** |
| Hang converts a candidate → hung | **unchanged** (same id stays in the union) |
| Watchlist grows with only unprobed seeds | **unchanged** |
| Recheck banishes a hung frame | may **↓** if nothing else holds that id |

So: **hung can rise while Ghosts stays flat** — that is normal. Ghosts rises only when *new* ghost evidence appears.

### hung

| Event | Effect |
|-------|--------|
| `hang:auto` / `hang --commit` succeeds | **↑** |
| Monthly recheck → `banished` | **↓** (banished is separate) |

Source of truth: `exhibits/exhibits.json` (synced to `site/exhibits.json`).

### candidates

| Event | Effect |
|-------|--------|
| New ghost-class finding, id not hung | **↑** |
| That id is hung | **↓** |
| Finding reclassified away from ghost-class | **↓** |

Candidates are **evidence waiting to be framed**, not “things on the curate desk.”

### watch

| Event | Effect |
|-------|--------|
| Authority / autoseed / search / discover → `seed-watchlist:broad` | **↑** (usually) |
| Manual watchlist edit | varies |
| Hunt probing | **unchanged** (probe does not shrink the queue) |

Watch is a **queue size**, not “unfinished work remaining.”

### awaiting

| Event | Effect |
|-------|--------|
| New watch row never probed | **↑** |
| Hunt writes a finding for that id | **↓** |

When awaiting is `0`, every watch id has been contacted at least once (success or fail). The meter **hides** the line.

---

## Why candidates look “stuck”

Typical plateau (as seen when hung≈903, candidates≈636):

1. **Most candidates never reach the hangable desk.**  
   Curate only surfaces `strong` / `consider` with hangable walls. Hundreds of ghost findings score `review`/`weak` (Google saturation, duplicate hosts, missing seed bonus).

2. **Many candidates share a `probeUrl` already hung.**  
   Different product ids, same URL → hang skips them; they remain candidates forever until scoring/skips change.

3. **Desk is full of `unprobed` consider rows.**  
   Those are seeds awaiting a ghost-class probe — they are **not** candidates in the census sense and **cannot** be auto-hung until hunt classifies a hangable wall.

4. **Hang drain only commits hangable walls.**  
   If pending hangable ≈ 0–1 (and that one times out / is on cooldown), **hung** and **candidates** freeze together.

5. **Ghosts total only moves on new ghost evidence.**  
   Converting candidates → hung does not change Ghosts.

### Quick diagnosis

```bash
curl -fsS 'https://ghosts.agenticop.io/api/census?slim=1' | jq '{total,hung,candidates,watchlist,awaitingProbe,updatedAt}'
# pending hangable ≈ desk rows with ghost/buried wall, not already hung by id/url
# hang-auto log: hunt/hang-auto-log.json
# cooldowns: hunt/hang-skip.json
```

---

## UI wiring

| Piece | Role |
|-------|------|
| `site/gm-census.js` | `fetchCensus` → `paintCensus` (hero + meta lines) |
| `site/museum.js` | Hall views; polls census ~15s, exhibits ~60s |
| `GET /api/census` | Live build (mtime/TTL cached in `demo-server`) |
| `GET /api/census?slim=1` | Same without heavy `byDomain` / `byOwner` |
| `site/census.json` | Best-effort snapshot written by the server |

Hero digit scaling: `data-digits` on `#ghost-count` + CSS in `site/museum.css`.

---

## Honesty rules

- Meter must reflect probe evidence, not hopes.
- Do not “fix” candidates by inventing hung frames.
- Do not count unprobed seeds as Ghosts.
- Prefer explaining a flat meter over painting a fake rise.
