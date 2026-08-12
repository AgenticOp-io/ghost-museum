# Authority pipeline — Still Answering

**This is how the hall grows.** Everything else is secondary.

```
hunt/seeds/* + npm run discover + autoseed + search:seed
        ↓
npm run seed-watchlist:broad
        ↓
hunt/watchlist.json   ← honest breadth (not vast fan-out)
        ↓
npm run hunt          ← GET-only evidence → findings.jsonl
        ↓
npm run curate:desk   ← ranks seeds first → site/curate.json
        ↓
npm run hang:auto     ← strong + ghost-class + fresh probe → exhibits/
        ↓
npm run validate
```

Shortcut: `npm run authority` / `authority:once` = one growth pass.
Live daemon: `npm run authority:loop` (default every 6h) — see `scripts/gce-restart-authority.sh`.

## Automated growth (GCE)

On **chrysalis-test-vm** (`/var/www/ghost-museum`):

| Daemon | Script | Role |
|--------|--------|------|
| Museum | `gce-restart-museum.sh` | Static hall + APIs |
| Hunt | `gce-restart-hunt.sh` | GET-probe watchlist forever |
| Authority | `gce-restart-authority.sh` | discover → autoseed → search → broad → hang:auto every 6h |

```bash
npm run authority:loop
# or on host:
bash scripts/gce-restart-authority.sh
bash scripts/gce-authority-status.sh
```

Optional env (host `.env` or process env):

| Var | Default | Meaning |
|-----|---------|---------|
| `GM_AUTHORITY_PERIOD_MS` | `21600000` (6h) | Sleep between passes |
| `GM_HANG_AUTO_MAX` | `25` | Max new hangs per pass |
| `BRAVE_SEARCH_API_KEY` / Google CSE | — | Enables `search:seed` hits |

Hunt never auto-hangs. Authority loop is what grows hung frames.

## What is authoritative

| Layer | Path | Rule |
|-------|------|------|
| Seed packs | `hunt/seeds/*.json` | Curator-written probe + obituary |
| Discover | `npm run discover` | Bounded catalogs + Wikidata + links on cited obituaries |
| Autoseed | `npm run autoseed` | Learn funeral hosts / probe shapes; poll those feeds only |
| Search seed | `npm run search:seed` | Official Brave/Google CSE APIs; `site:` funeral hosts only |
| Broad watchlist | `npm run seed-watchlist:broad` | Hints + seeds + deep catalog import |
| Curate v2 | `scripts/curate.mjs` | Prefers `seeds/*`; demotes `*-vast` / `*-deep` |
| Auto-hang | `npm run hang:auto` | Strong desk + fresh GET + hangable wall → `exhibits/` |
| Hall frames | `exhibits/exhibits.json` | Only after probe (auto or manual hang) |

## What is not authority

| Path | Why |
|------|-----|
| `npm run seed-watchlist:vast` | Google host spam; inflates queue, not breadth |
| Deep catalog fan-out alone | Guessed hosts without seed curation |
| Open-web crawl / search engines | Out of scope — see `docs/DISCOVER.md` |
| Hang without probe / obituary | Forbidden — invents frames |

## Auto-hang gates

`hang:auto` only commits when **all** hold:

1. Curate decision ≥ `strong` (override with `--min consider`)
2. Fresh GET succeeds
3. Wall is hangable: `still-answering` / `auth-ghost` / `successor-facade` / `buried`
4. Obituary URL present
5. Id / hostname not already hung
6. `doNotIntegrate: true` always

```bash
npm run hang:auto
npm run hang:auto -- --max 40
npm run hang:auto -- --dry-run
npm run hang -- --id <id> --commit   # one-off
```

## Operator loop

```bash
# 1. Expand candidates + auto-hang strong ghosts
npm run authority

# 2. Optional: live hunt pass, then hang again
npm run hunt
npm run hang:auto

# 3. Re-rank desk UI
npm run curate:desk
```

Public desk: `/curate.html` · API: `GET /api/curate`.

## Census (Ghosts box)

`total` = unique **hung ∪ ghost-class hunt contacts** (`still-answering` / `auth-ghost` / `successor-facade`).
`verified` = ghost-class subset (same set, for meta).
`contacted` = any watch row with an HTTP status (includes non-ghost 404/etc — meta only).
`watchlist` = full hunt queue (seeds may sit here unprobed — they do **not** inflate `total` or the wall).

Unprobed seeds and non-ghost replies belong on the curate desk / watchlist, not as wall frames.
**Hung grows via `hang:auto`** (and optional manual hang) after a fresh probe — hunt findings alone never invent frames.
