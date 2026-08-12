# Bounded discovery

Expand the candidate list **without crawling the open web**.

```bash
npm run discover
npm run authority          # discover → broad watchlist → curate desk
```

## What it does

| Source | How | Bound |
|--------|-----|--------|
| Sunset catalogs | Fetch known killed-by-* JSON | URLs in `hunt/discover-sources.json` only |
| Wikidata | SPARQL: discontinued products with official websites | Structured query, capped |
| Obituary harvest | GET funerals we already cite; pull product links | Only existing obituary URLs |

Writes `hunt/seeds/discovered.json` (seed pack). Hunt still only probes the watchlist. Nothing auto-hangs.

## What it does not do

- Scrape Google/Bing HTML result pages (use `npm run search:seed` + official APIs instead)
- Open-web crawl without `site:` bounds
- Follow arbitrary outbound links beyond cited obituaries / funeral search hits
- Guess every hostname on the internet (`--vast` stays demoted)

## Flags

```bash
npm run discover -- --wikidata-only
npm run discover -- --catalogs-only
npm run discover -- --no-obituaries
```

Edit `hunt/discover-sources.json` to add another **known** sunset catalog URL.

For **search-engine** expansion (official APIs, `site:` funeral hosts only), see [`docs/SEARCH.md`](./SEARCH.md) / `npm run search:seed`.
