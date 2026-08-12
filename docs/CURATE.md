# Curate algorithm (v2) — authority desk

Ranking + curator desk for Still Answering. **Never auto-hangs.**

Authority path:

```
hunt/seeds/*  →  npm run seed-watchlist:broad  →  npm run hunt  →  npm run curate:desk  →  npm run hang -- --id <id>  →  human --commit
```

One-shot refresh:

```bash
npm run authority          # broad seeds + curate desk
npm run curate:desk        # desk only
npm run hang -- --id foo   # draft only
npm run hang -- --id foo --commit   # append exhibit after you review
```

Writes:

| File | Role |
|------|------|
| `hunt/curate-rank.json` | Full ranked report |
| `site/curate.json` | Strong + consider desk queue |
| `GET /api/curate` | Same desk JSON for `site/curate.html` |
| `hunt/drafts/<id>.json` | Hang draft (from `npm run hang`) |

## Goal

Grow a **deeper, broader, honest** hall: incomplete funerals over tombs, multi-vendor seed packs over Google fan-out. Never document how to keep calling a ghost.

## Authority signals (v2)

| Signal | Points |
|--------|--------|
| Source `seeds/*` | +28 |
| Source `probe-hints` | +16 |
| Public nomination | +12 |
| Source `*-deep` (catalog guess) | −18 |
| Source `*-vast` (host spam) | −45 |
| New major domain in hall | +18 |
| Non-Google owner | +6 |
| Google already over-represented | −10 |

Plus v1 wall / status / diversity scoring (still-answering +40, auth-ghost +38, etc.).

## Hard gates (reject / skip)

| Gate | Result |
|------|--------|
| No `probeUrl` | reject |
| No obituary citation | reject |
| Note contains credentials / “how to use” / exploit language | reject |
| `id` or probe hostname already hung | skip |

## Decisions

| Band | Label | Meaning |
|------|-------|---------|
| ≥ 55 | `strong` | Hang soon (fresh probe → draft → commit) |
| ≥ 35 | `consider` | Worth a look |
| ≥ 10 | `review` | Weak / niche |
| &lt; 10 | `weak` | Probably skip |
| — | `reject` / `skip` | Do not hang |

Desk default (`--desk` / `curate:desk`) shows **strong + consider** only.

## Human gate

1. Open **Curate** desk or `hunt/curate-rank.json`
2. `npm run hang -- --id <id>` — fresh GET, writes draft
3. Edit note / wall if needed in `hunt/drafts/<id>.json`
4. `npm run hang -- --id <id> --commit` then `npm run validate`

The algorithm does not write exhibits without `--commit`.
