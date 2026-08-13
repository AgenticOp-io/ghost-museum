# Still Answering

**Sunset is a press release. Ghosts are a runtime.**

A public hall of interfaces that outlived their obituaries: hostnames that still answer, loaders for runtimes that had a funeral, APIs that return `401` instead of `410`.

This is **not** a scanner, an exploit kit, a shaming list, or an invitation to integrate. Frames are funerals with sockets — evidence of incomplete sunsets, never how to keep calling the dead.

**Live hall:** https://ghosts.agenticop.io/

---

## What you are looking at (the meter)

The masthead **Ghosts** box is the live census. Example snapshot:

```
Ghosts
1539
903 hung · 636 candidates · 2555 watch
```

| Line | Meaning |
|------|---------|
| **Ghosts** (big number) | Hall catalog size = **hung ∪ candidates** |
| **hung** | Framed exhibits in `exhibits/exhibits.json` |
| **candidates** | Ghost-class hunt evidence **not yet hung** |
| **watch** | Hunt queue size (`hunt/watchlist.json`) |
| **awaiting** | Watch rows with no finding yet (hidden when `0`) |

Full semantics, why lines stall, and how numbers move: **[`docs/CENSUS.md`](./docs/CENSUS.md)**.

---

## Documentation map

| Doc | Topic |
|-----|--------|
| [`docs/CENSUS.md`](./docs/CENSUS.md) | Masthead meter, formulas, stall diagnosis |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Repo layout, data files, APIs, site views |
| [`docs/AUTHORITY.md`](./docs/AUTHORITY.md) | How the hall grows (canonical pipeline) |
| [`docs/OPS.md`](./docs/OPS.md) | GCE daemons, heartbeats, watchdog, deploy |
| [`docs/HUNT.md`](./docs/HUNT.md) | GET-only hunt bot, batches, findings index |
| [`docs/HANG.md`](./docs/HANG.md) | Hang / hang:auto / hang-drain |
| [`docs/CURATE.md`](./docs/CURATE.md) | Ranking desk (strong / consider) |
| [`docs/SCHEMA.md`](./docs/SCHEMA.md) | Exhibit JSON contract |
| [`docs/SEEDS.md`](./docs/SEEDS.md) | Seed packs |
| [`docs/DISCOVER.md`](./docs/DISCOVER.md) | Bounded discovery |
| [`docs/AUTOSEED.md`](./docs/AUTOSEED.md) | Learned funeral-host seeding |
| [`docs/SEARCH.md`](./docs/SEARCH.md) | Bounded SerpAPI / Brave / CSE search |
| [`docs/SEED-FITNESS.md`](./docs/SEED-FITNESS.md) | Fitness loop for search/autoseed |
| [`docs/NOMINATIONS.md`](./docs/NOMINATIONS.md) | Public nominate intake |
| [`AGENTS.md`](./AGENTS.md) | Agent lane rules |

---

## Walls (kinds of ghosts)

| Wall | Meaning |
|------|---------|
| Still answering | Original surface still returns `200` |
| Auth ghost | Host lives; `401`/`403`, not `410` |
| Successor facade | Redirects into a different living product |
| Buried | Honest `410` / gone — hung as contrast |
| Banished | Was hung; later recheck found it gone |
| Unprobed | On desk/watch only — **never** a hung frame |

---

## Grow the hall

```bash
npm run authority              # one growth pass (discover → watchlist → curate)
npm run authority:loop         # every 6h on a host
npm run hang:drain             # continuous hang:auto (separate from authority)
npm run hunt -- --loop         # GET-probe the watchlist
npm run search:schedule        # SerpAPI budget (~25/mo)
npm run watchdog               # restart stale/dead daemons
```

Canonical growth path: [`docs/AUTHORITY.md`](./docs/AUTHORITY.md). Ops on GCE: [`docs/OPS.md`](./docs/OPS.md).

---

## Local

```bash
npm run demo                   # static hall + /api/census + nominate
# or: npx --yes serve site
```

Refresh hung probes (GET only):

```bash
npm run probe
npm run validate
```

---

## Hard rules

1. **Do not invent exhibits** — probe first (auto-hang re-probes).
2. **Evidence only** — never “how to keep using” a ghost.
3. **GET/HEAD only** on public URLs — no auth bypass, fuzzing, or load tests.
4. **Own this lane only** — not Chrysalis, WISP, Helix, or AgenticOps chrome.
5. **Official search APIs only** for discovery expansion — no SERP scraping HTML.

---

## Hosting

| Surface | How |
|---------|-----|
| **https://ghosts.agenticop.io/** | `powershell -File scripts/gce-deploy-ghosts-host.ps1` → chrysalis-test-vm, nginx → `:19191` |
| Secondary hall | `powershell -File scripts/gce-deploy-demo.ps1` → agenticop-master `:27474` |

Turnstile: set `TURNSTILE_SECRET` in `.env` (see `.env.example`). Never commit secrets.

---

## License

Apache-2.0.
