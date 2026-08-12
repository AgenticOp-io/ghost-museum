# Seed fitness loop

Closed-loop ranking for funeral hosts, shutdown phrases, and seed sources.
Rewards patterns that produce **ghost-class** hunt contacts or **hung** frames; penalizes ENOTFOUND / non-ghost noise.

```bash
npm run seed:fitness          # rebuild hunt/seed-fitness.json
npm run search:seed -- --dry-run   # plan uses fitness ranking
npm run autoseed              # feeds/sitemaps prefer high-fitness hosts
```

## Output: `hunt/seed-fitness.json`

| Field | Meaning |
|-------|---------|
| `funeralHosts[]` | Host → tries / wins / hung / fails / score |
| `keywords[]` | Shutdown phrases ranked by yield |
| `sources[]` | `seeds/*`, discover, autoseed, search, … |
| `searchHistory[]` | Recent SerpAPI/Brave queries + hit/seed counts |
| `top` | Short lists for logs / plans |

## How it steers growth

1. **Authority** runs `seed:fitness` each pass (before autoseed).
2. **Autoseed** polls feeds/sitemaps on highest-scoring funeral hosts first.
3. **search:seed** (SerpAPI schedule, ≤25/mo) picks `site:{host} "{phrase}"` by expected fitness and skips queries already in `searchHistory`.
4. Outcomes write back into `searchHistory` so the next credit is not wasted on a dead pair.

Still bounded: no open crawl, no inventing probe hosts, GET-only hunt, hang:auto still requires ghost walls.

See also: `docs/AUTOSEED.md`, `docs/SEARCH.md`, `docs/AUTHORITY.md`.
