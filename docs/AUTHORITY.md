# Authority pipeline — Still Answering

**This is how the hall grows.** Everything else is secondary.

```
hunt/seeds/* + discover + autoseed + search:seed
        ↓
npm run seed-watchlist:broad
        ↓
hunt/watchlist.json   ← honest breadth (not vast fan-out)
        ↓
npm run hunt          ← GET-only evidence → findings.jsonl + findings-latest.json
        ↓
npm run curate:desk   ← ranks seeds first → site/curate.json
        ↓
npm run hang:auto / hang:drain   ← strong+consider + ghost wall + fresh probe → exhibits/
        ↓
npm run validate
```

Shortcut: `npm run authority` / `authority:once` = one growth pass (**does not** run hang — hang-drain is separate).  
Live: `npm run authority:loop` (default every 6h).

Deep docs: [`CENSUS.md`](./CENSUS.md) · [`OPS.md`](./OPS.md) · [`HUNT.md`](./HUNT.md) · [`HANG.md`](./HANG.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Automated growth (GCE)

On **chrysalis-test-vm** (`/var/www/ghost-museum`):

| Daemon | Restart script | Role |
|--------|----------------|------|
| Museum | `gce-restart-museum.sh` | Static hall + APIs |
| Hunt | `gce-restart-hunt.sh` | Bounded GET passes forever |
| Authority | `gce-restart-authority.sh` | discover → fitness → watchlist → autoseed → curate (~6h) |
| Hang drain | `gce-restart-hang-drain.sh` | Timed hang:auto catch-up |
| Search | `gce-restart-search.sh` | SerpAPI ~1 query / ~31h, hard cap 25/mo |
| Watchdog | `gce-restart-watchdog.sh` | Restart stale/dead daemons |
| Recheck | (manual/long-lived) | Monthly → `banished` |

```bash
bash scripts/gce-restart-authority.sh
bash scripts/gce-restart-hang-drain.sh
bash scripts/gce-restart-hunt.sh
bash scripts/gce-restart-watchdog.sh
bash scripts/gce-authority-status.sh
```

Env defaults and triage: [`OPS.md`](./OPS.md).

Hunt never auto-hangs. **Hang-drain** grows **hung**. **Authority + hunt + search** expand watch/evidence so **Ghosts** (`hung ∪ candidates`) can grow.

---

## What is authoritative

| Layer | Path | Rule |
|-------|------|------|
| Seed packs | `hunt/seeds/*.json` | Curator-written probe + obituary |
| Discover | `npm run discover` | Bounded catalogs + Wikidata + links on cited obituaries |
| Seed fitness | `npm run seed:fitness` | Rank funeral hosts / phrases / sources |
| Autoseed | `npm run autoseed` | Learn funeral hosts; poll those feeds only |
| Search seed | `npm run search:seed` | Official Brave / SerpAPI / CSE; `site:` funeral hosts |
| Broad watchlist | `npm run seed-watchlist:broad` | Hints + seeds + deep catalog import |
| Curate v2 | `scripts/curate.mjs` | Prefers `seeds/*`; skips already-hung probe URLs |
| Auto-hang | `npm run hang:auto` | Strong then consider + fresh GET + hangable wall |
| Hall frames | `exhibits/exhibits.json` | Only after probe |

## What is not authority

| Path | Why |
|------|-----|
| `seed-watchlist:vast` / `--deep` alone | Invented hosts; floods ENOTFOUND — opt-in only |
| Open-web crawl / HTML SERP scraping | Out of scope |
| Hang without probe / obituary | Forbidden — invents frames |

---

## Auto-hang gates

See [`HANG.md`](./HANG.md). Summary: hangable wall + obituary + fresh GET + not already hung (id / normalized probe URL) + not on skip cooldown.

```bash
npm run hang:auto
npm run hang:auto -- --max 12
npm run hang:auto -- --dry-run
npm run hang -- --id <id> --commit
```

---

## Operator loop

```bash
npm run authority          # expand watch + desk
npm run hunt               # evidence
npm run hang:auto          # frame strong/consider ghosts
npm run curate:desk        # refresh UI desk
npm run validate
```

Public desk: `/curate.html` · `GET /api/curate`.

---

## Census (Ghosts box)

| Field | Meaning |
|-------|---------|
| **Ghosts** / `total` | Hall catalog — hung ∪ ghost-class evidence |
| **hung** | Framed ghosts |
| **candidates** | Ghost-class evidence not yet hung |
| **watch** / **awaiting** | Hunt queue size / never-probed watch rows |

Full semantics: [`CENSUS.md`](./CENSUS.md).
