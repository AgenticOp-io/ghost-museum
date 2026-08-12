# Multi-vendor seeds

Honest breadth for the hunt queue. Each row is a **public probe URL + cited obituary**.

## Layout

```
hunt/seeds/
  microsoft.json
  amazon.json
  meta.json
  yahoo.json
  adobe.json
  apple.json
  misc.json
```

## Entry shape

```json
{
  "id": "smile-amazon",
  "title": "Amazon Smile",
  "owner": "Amazon",
  "probeUrl": "https://smile.amazon.com/",
  "obituary": "https://www.aboutamazon.com/news/company-news/amazon-closing-smile",
  "note": "Optional curator note."
}
```

Rules:

- `probeUrl` and `obituary` required
- Public http(s) only
- Never invent hung exhibits; seeds only grow the watchlist
- Prefer first-party product hosts over guessed `*.googleapis.com` templates

## Commands

```bash
npm run authority              # AUTHORITY: broad seeds + curate desk
npm run seed-watchlist:broad   # hints + seeds/* + deep catalog import (1 host each)
npm run seed-watchlist:vast    # Google host fan-out (noisy; NOT authority)
npm run seed-watchlist         # curated probe-hints only
```

See `docs/AUTHORITY.md` for the full growth pipeline.