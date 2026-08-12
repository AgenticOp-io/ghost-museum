# Bounded funeral search

Still Answering does **not** scrape Google/Bing result pages and does **not** open-crawl the web.

`npm run search:seed` runs **official search APIs** with queries templated from the ghost model:

```
site:{learnedFuneralHost} "shutting down"
site:{learnedFuneralHost} "end of support"
…
```

Hits must land on those funeral hosts. Each hit page is GETed once; outbound **product** URLs become seeds (`hunt/seeds/search.json`).

## Why the hall feels “small”

| Layer | Role | Scale today (approx) |
|-------|------|----------------------|
| Seeds / discover / autoseed | Candidate queue | ~1.9k watch |
| Hunt contact | Evidence | hundreds contacted |
| Ghost-class | Still-answering / auth / successor | hundreds |
| Hung | Auto-curate strong + fresh probe | dozens |

The internet is huge; **product funerals with a citeable obituary + live socket** are rare, and we only count evidence.

## How sunsets get reported (in the wild)

1. **Vendor blogs / lifecycle pages** — blog.google, learn.microsoft.com, github.blog, …
2. **Community graveyards** — killedbygoogle / killed-by-microsoft / …
3. **Structured knowledge** — Wikidata discontinued + official website
4. **Press / TechCrunch / etc.** — secondary; we prefer primary funerals
5. **Search indexes** — surface (1) when you query with `site:` + shutdown language

## Providers

| Provider | Status | Env |
|----------|--------|-----|
| **Brave Search API** | Available | `BRAVE_SEARCH_API_KEY` |
| **SerpAPI Bing** | Available | `SERPAPI_API_KEY` ([Bing engine](https://serpapi.com/bing-search-api)) |
| **Google Programmable Search** | Available | `GOOGLE_CSE_ID` + `GOOGLE_API_KEY` |
| **Bing Web Search API** | **Retired 2025-08-11** | — use SerpAPI Bing instead |

```bash
npm run search:seed -- --dry-run     # print query plan only
npm run search:seed                  # needs an API key
npm run search:seed -- --provider serpapi --max 80
npm run search:seed -- --provider brave --max 80
```

Auto order when several keys are set: Brave → SerpAPI → Google.

Queries are ranked by **seed fitness** (`hunt/seed-fitness.json`) — high-yield funeral hosts × shutdown phrases, skipping recently used queries. See `docs/SEED-FITNESS.md`.

### SerpAPI 25/month schedule

On the ghosts host, `gce-restart-search.sh` runs `search-schedule-loop.mjs`:

| Setting | Default | Meaning |
|---------|---------|---------|
| `SERPAPI_MONTHLY_BUDGET` | `25` | Hard stop when used |
| `GM_SEARCH_QUERIES_PER_RUN` | `1` | API calls per wake |
| `GM_SEARCH_PERIOD_MS` | `111600000` (~31h) | Pace so ≤25 fit in a month |

Quota file: `hunt/search-quota.json`. Authority no longer calls `search:seed` every 6h (that would burn the tier).

Plan written to `hunt/search-plan.json`. Seeds → `hunt/seeds/search.json` → `seed-watchlist:broad` → hunt → hang:auto.

## What we refuse

- Scraping `google.com/search` / Bing HTML SERPs ourselves (ToS + brittle + out of museum scope)
- Open queries without `site:` (turns into a crawler)
- Inventing probe hosts from titles

SerpAPI is allowed as a **JSON API** for the same bounded `site:` queries — we do not scrape Bing HTML from this repo.

See also: `docs/DISCOVER.md`, `docs/AUTOSEED.md`.
