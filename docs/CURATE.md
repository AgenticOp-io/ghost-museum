# Curate algorithm (v2) — authority desk

Ranking + curator desk for Still Answering. **Curate never writes exhibits.**  
Framing is `hang:auto` / `hang --commit` only.

Authority path:

```
hunt/seeds/* → seed-watchlist:broad → hunt → curate:desk → hang:auto → validate
```

```bash
npm run curate:desk                 # strong+consider → site/curate.json
npm run curate -- --top 500
npm run hang:auto                   # drains desk (re-probes)
```

Writes:

| File | Role |
|------|------|
| `hunt/curate-rank.json` | Ranked report (top N) |
| `site/curate.json` | Strong + consider desk queue |
| `GET /api/curate` | Live desk (already-hung stripped) |

---

## Goal

Grow a **deeper, broader, honest** hall: incomplete funerals over tombs, multi-vendor seeds over Google fan-out. Never document how to keep calling a ghost.

---

## Authority signals (v2)

| Signal | Points (approx.) |
|--------|------------------|
| Source `seeds/*` | +28 |
| Source `probe-hints` | +16 |
| Public nomination | +12 |
| Source `*-deep` | −18 |
| Source `*-vast` | −45 |
| Hangable ghost wall | +36…+40 |
| **New-host ghost evidence** | +24 |
| Unprobed wall | −12 (must not crowd verified ghosts) |
| New major domain | +18 |
| Busy domain but **new host** | light demotion |
| Busy domain **repeat host** | heavy demotion |
| Probe URL already hung (normalized) | **skip** |
| Id already hung | **skip** |
| Hostname already hung | −18 (demote, do not skip) |

Strong (≥55) is capped to hangable walls only — unprobed cannot be `strong`.

---

## Hard gates

| Gate | Result |
|------|--------|
| No `probeUrl` | reject |
| No obituary citation | reject |
| Abuse / “how to use” language in note | reject |
| Id already hung | skip |
| Probe URL already hung (incl. www / slash variants) | skip |

---

## Decisions

| Band | Label | Meaning |
|------|-------|---------|
| ≥ 55 | `strong` | Hang soon |
| ≥ 35 | `consider` | Worth a look / hang:auto fallback |
| ≥ 10 | `review` | Weak — not on desk |
| &lt; 10 | `weak` | Skip |
| — | `reject` / `skip` | Do not hang |

Desk (`--desk`) shows **strong + consider** only (up to ~160).

---

## Why the desk can look “full” while hung is flat

1. Most rows are **`unprobed` consider** — not hangable until hunt assigns a ghost wall.
2. Ghost findings may score **review/weak** and never appear on the desk.
3. Duplicate probe URLs are **skipped** (already framed under another id).

See [`CENSUS.md`](./CENSUS.md) and [`HANG.md`](./HANG.md).

---

## Human gate (optional)

1. Open **Curate** or `hunt/curate-rank.json`
2. `npm run hang -- --id <id>` → draft
3. Edit note/wall in `hunt/drafts/<id>.json` if needed
4. `npm run hang -- --id <id> --commit` then `npm run validate`
