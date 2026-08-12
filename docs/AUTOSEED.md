# Autoseed — learn how ghosts get reported

Still Answering does **not** crawl the open web. Autoseed learns from ghosts we already trust, then expands only inside those patterns.

```bash
npm run autoseed
npm run authority          # discover + autoseed + broad watchlist + curate desk
```

## Learning (`hunt/ghost-model.json`)

From **hung exhibits** + **ghost-class hunt findings**:

| Signal | Use |
|--------|-----|
| Obituary hosts | Where funerals are actually published |
| Probe URL shapes | subdomain vs path vs apex success rates |
| Probe bases | `google.com`, `microsoft.com`, … that answer as ghosts |
| Shutdown language | “shutting down”, “end of support”, “retirement”, … |

## Expansion

1. **Funeral feeds / sitemaps** — RSS/Atom + sitemap locs on learned funeral hosts only
2. **Extract probes** — keep outbound product URLs found on those pages (never invent hosts from titles)
3. **Alternate shapes** — short product-token retries for failed/queued discoveries (owner templates only)
4. **Rescore discovery** — keep high-scoring `discovered.json` rows that match the model
5. Write **`hunt/seeds/autoseed.json`**

Nothing auto-hangs. Hunt still only GET-probes the watchlist. Invented subdomain guesses from funeral path titles are rejected.

## Flags

```bash
npm run autoseed -- --min-score 40
npm run autoseed -- --max 100
npm run autoseed -- --no-feeds          # model + rescore only
```

See also: `docs/DISCOVER.md` (bounded catalogs / Wikidata / obituary harvest).
