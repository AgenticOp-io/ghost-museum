# Hang — framing ghosts

Hanging **commits** a probed ghost into `exhibits/exhibits.json` (and syncs `site/exhibits.json`).  
Every hang does a **fresh GET**. No inventing. `doNotIntegrate: true` always.

---

## Commands

```bash
# One-off (draft, then commit)
npm run hang -- --id <id>
npm run hang -- --id <id> --commit

# Auto from curate desk
npm run hang:auto
npm run hang:auto -- --max 12
npm run hang:auto -- --skip-curate
npm run hang:auto -- --dry-run

# Continuous drain daemon
npm run hang:drain
```

---

## Auto-hang gates

`hang:auto` commits only when **all** hold:

1. Curate band is `strong` or (fallback) `consider`
2. Wall is hangable: `still-answering` | `auth-ghost` | `successor-facade` | `buried`
3. Obituary URL present
4. Fresh GET succeeds
5. Id **and** probe URL (normalized: host without `www`, no trailing slash) not already hung
6. Id not on cooldown in `hunt/hang-skip.json`

Queue order: **all strong, then all consider** (unless `--min` forces one band).

---

## Hang drain loop

`hang-drain-loop.mjs` repeatedly runs timed `hang:auto` children:

- Small batches (`GM_HANG_AUTO_MAX`, default 12)
- Child wall-clock timeout (default 6 minutes)
- Catch-up sleep while hangable pending; longer idle when clear
- Curate refresh every N cycles, and whenever the last drain hung `0`
- Heartbeats + pending hangable count in logs

Restart on GCE: `bash scripts/gce-restart-hang-drain.sh`.

---

## Skip / cooldown

Hard failures (`timeout`, `ENOTFOUND`, …) write `hunt/hang-skip.json` so one bad URL cannot monopolize the drain. Default cooldown: 6h.

---

## Manual hang

1. Pick an id from the curate desk or rank file.
2. `npm run hang -- --id <id>` → draft under `hunt/drafts/`.
3. Review note / wall.
4. `npm run hang -- --id <id> --commit`.
5. `npm run validate`.

---

## Relation to the meter

| After a successful hang | Meter |
|-------------------------|--------|
| hung | **↑** |
| candidates | **↓** (same id leaves the candidate set) |
| Ghosts (`total`) | usually **unchanged** |
| watch | unchanged |

See [`CENSUS.md`](./CENSUS.md).
