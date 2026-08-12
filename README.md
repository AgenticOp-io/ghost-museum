# Still Answering

**Sunset is a press release. Ghosts are a runtime.**

A hall of interfaces that outlived their obituaries: hostnames that still answer, loaders for runtimes that had a funeral, APIs that return `401` instead of `410`.

This is not a scanner and not an invitation to integrate. The hall shows evidence of incomplete funerals — never how to keep calling them.

## Hall (first hanging)

Exhibits are real probes, not invented facades. Source of truth: `exhibits/exhibits.json`. Schema: `docs/SCHEMA.md`.

| Kind | Meaning |
|------|---------|
| Still answering | Original surface still returns `200` |
| Auth ghost | Host lives; `401`/`403`, not `410` |
| Successor facade | Redirects to a different living product |
| Buried | `410` / gone — they actually held a funeral |

## Grow the hall

```bash
npm run authority          # discover → autoseed → search:seed → broad → curate → hang:auto → validate
npm run search:seed -- --dry-run
npm run hang:auto
```

Authority docs: `docs/AUTHORITY.md` · bounded search: `docs/SEARCH.md`.

## Local

```bash
npx --yes serve site
# or: npm run demo
```

Refresh probes (GET only, records redirect hops, syncs `site/exhibits.json`):

```bash
npm run probe
npm run validate
```

## Rules

1. Do not invent exhibits — probe first (auto-hang re-probes).
2. Never document how to keep using a ghost.
3. Own this lane only — not Chrysalis, WISP, Helix, or AgenticOps chrome.
4. Official search APIs only for discovery expansion — no SERP scraping.

## GCE / hostname

- **Live:** https://ghosts.agenticop.io/ — `powershell -File scripts/gce-deploy-ghosts-host.ps1` (chrysalis-test-vm + nginx + Let’s Encrypt)
- Secondary hall (agenticop-master `:27474`): `powershell -File scripts/gce-deploy-demo.ps1`
- DNS (GoDaddy API): set `GODADDY_API_KEY` + `GODADDY_API_SECRET`, then `powershell -File scripts/godaddy-set-ghosts-dns.ps1`

## Hunt bot

```bash
npm run hunt              # one slow pass (~55s between GETs)
npm run hunt -- --loop    # keep hunting
```

Writes `hunt/findings.jsonl` for curator review. Never auto-hangs.

## Turnstile

Requires a **Cloudflare account** (widget already created). Sitekey is public in `site/nominate.html`. Set `TURNSTILE_SECRET` in `.env` (see `.env.example`) or on the GCE process — never commit or paste the secret into chat. Optional: `TURNSTILE_HOSTNAMES`.

## License

Apache-2.0.
