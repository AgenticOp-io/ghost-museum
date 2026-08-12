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
| **Google Programmable Search** | Available | `GOOGLE_CSE_ID` + `GOOGLE_API_KEY` |
| **Bing Web Search API** | **Retired 2025-08-11** | — |

```bash
npm run search:seed -- --dry-run     # print query plan only
npm run search:seed                  # needs an API key
npm run search:seed -- --provider brave --max 80
```

Plan written to `hunt/search-plan.json`. Seeds → `hunt/seeds/search.json` → `seed-watchlist:broad` → hunt → hang:auto.

## What we refuse

- Scraping `google.com/search` / Bing HTML SERPs (ToS + brittle + out of museum scope)
- Open queries without `site:` (turns into a crawler)
- Inventing probe hosts from titles

See also: `docs/DISCOVER.md`, `docs/AUTOSEED.md`.
