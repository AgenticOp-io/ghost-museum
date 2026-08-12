# Curate algorithm (v1)

Ranking helper for hunt findings and nominations. **Never auto-hangs.** Output is a review queue only.

```bash
npm run curate
npm run curate -- --top 30
```

Writes `hunt/curate-rank.json`.

## Goal

Grow a **deeper, broader, honest** hall: incomplete funerals over tombs, domain/era diversity over Google spam. Never document how to keep calling a ghost.

## Hard gates (reject / skip)

| Gate | Result |
|------|--------|
| No `probeUrl` | reject |
| No obituary citation | reject |
| Note contains credentials / “how to use” / exploit language | reject |
| `id` or probe hostname already hung | skip |

## Score (higher = hang sooner)

| Signal | Points |
|--------|--------|
| Probe succeeded with status | +15 |
| Wall `still-answering` | +40 |
| Wall `auth-ghost` | +38 |
| Wall `successor-facade` | +36 |
| Wall `buried` | +12 (contrast only) |
| Redirect hops | +3 each (cap +12) |
| Lone `200` (no redirect) | +10 |
| `401` / `403` | +8 |
| Hostile `400` | +6 |
| New major domain in hall | +14 |
| Death year empty in hall | +10 |
| Named title | +4 |
| Note says living / “don’t hang early” | −25 |
| Probe error | −40 |
| `404` tomb | −15 |
| Honest `410` | −5 |
| Domain already 3+ frames | −12 |
| Domain already 6+ frames | −30 |
| Final host already hung | −10 |
| Year already crowded (4+) | −8 |

## Decisions

| Band | Label | Meaning |
|------|-------|---------|
| ≥ 55 | `strong` | Curator should hang soon (after fresh probe) |
| ≥ 35 | `consider` | Worth a look |
| ≥ 10 | `review` | Weak / niche |
| &lt; 10 | `weak` | Probably skip |
| — | `reject` / `skip` | Do not hang |

## After a strong rank

1. Fresh `GET` probe with museum UA  
2. Confirm obituary still cites the funeral  
3. Write wall + note (never “how to keep calling”)  
4. Set `doNotIntegrate: true`  
5. Append to `exhibits/exhibits.json`, run `npm run probe` + `validate`  

Human acceptance is mandatory. The algorithm does not write exhibits.
