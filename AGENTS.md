# Agent instructions — Still Answering

Lane: `engines/ghost-museum` in the AgenticOps umbrella.

**What this is:** A public hall of interfaces that outlived their obituaries. Sunset is a press release. Ghosts are a runtime.

**What this is not:** A scanner, an exploit kit, a shaming list, a Chrysalis addon, a WISP module, or AgenticOps marketing chrome.

## Hard rules

1. **Do not invent exhibits.** Every frame needs a real probe (`status`, `finalUrl`, `probedAt`) or an honest `buried` / `unprobed` label.
2. **Evidence only.** Never document “how to keep using” a ghost. Frames are funerals with sockets, not integration tips.
3. **GET/HEAD only** on public URLs. No auth bypass, no fuzzing, no credential stuffing, no load tests against ghosts.
4. **Own this lane only.** Do not edit `brand/agenticops-web`, Chrysalis, WISPTools, FDE, or Helix from a Still Answering task.
5. **Brand separation.** Still Answering has its own visual language (gallery, frames, tungsten). Do not import `agenticops.css` / `ao-layout.js`.

## Authority (how the hall grows)

**Canonical:** `docs/AUTHORITY.md`

```
hunt/seeds/* + discover + autoseed → seed-watchlist:broad → hunt → curate:desk → hang:auto
```

| Do | Don’t |
|----|--------|
| Edit `hunt/seeds/*.json` first | Treat `--vast` as breadth |
| `npm run discover` / `autoseed` / `search:seed` / `authority` / `authority:loop` | Open-web crawl / SERP scraping |
| `npm run hang:auto` (strong + fresh probe) | Invent frames without probe |
| `npm run hang -- --id … --commit` for one-offs | Hang without obituary citation |

## Layout

| Path | Role |
|------|------|
| `exhibits/exhibits.json` | Source of truth for hung frames |
| `hunt/seeds/` | Authority seed packs (multi-vendor) |
| `hunt/watchlist.json` | Broad hunt queue |
| `site/curate.json` | Curate desk queue |
| `site/` | Static museum |
| `scripts/probe.mjs` | Refresh last-probe fields + redirect chain |
| `scripts/validate.mjs` | Schema / honesty gate |
| `scripts/curate.mjs` | Rank findings/seeds → desk |
| `scripts/hang.mjs` | Draft / commit one exhibit |
| `scripts/recheck.mjs` | Monthly live recheck → `banished` wall |
| `scripts/demo-server.mjs` | Static hall + nominate + `/api/census` + `/api/curate` |
| `site/nominate.html` | Public nomination form (no login) |
| `site/curate.html` | Curator desk UI |
| `docs/SCHEMA.md` | Exhibit field contract |
| `docs/AUTHORITY.md` | Growth pipeline |
| `docs/CURATE.md` | Ranking contract |
| `docs/NOMINATIONS.md` | Nominate + hunt intake |

## Probe

```bash
npm run probe
npm run validate
```

Writes `probedAt` / `httpStatus` / `finalUrl` / `redirectChain` into `exhibits/exhibits.json` and syncs `site/exhibits.json`. Re-render is automatic (`site/museum.js` loads the JSON).

## GCE host

```powershell
powershell -File scripts/gce-deploy-ghosts-host.ps1
```

Public: **https://ghosts.agenticop.io/** on **chrysalis-test-vm** (nginx → `:19191`).

Optional secondary hall on **agenticop-master** `:27474`:

```powershell
powershell -File scripts/gce-deploy-demo.ps1
```
