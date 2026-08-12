# Ghost Museum

**Sunset is a press release. Ghosts are a runtime.**

A hall of interfaces that outlived their obituaries: hostnames that still answer, loaders for runtimes that had a funeral, APIs that return `401` instead of `410`.

This is not a scanner and not an invitation to integrate. Each frame is stamped **DO NOT INTEGRATE**.

## Hall (first hanging)

Exhibits are real probes, not invented façades. Source of truth: `exhibits/exhibits.json`. Schema: `docs/SCHEMA.md`.

| Kind | Meaning |
|------|---------|
| Still answering | Original surface still returns `200` |
| Auth ghost | Host lives; `401`/`403`, not `410` |
| Successor façade | Redirects to a different living product |
| Buried | `410` / gone — they actually held a funeral |

## Local

```bash
npx --yes serve site
```

Refresh probes (GET only, records redirect hops, syncs `site/exhibits.json`):

```bash
npm run probe
npm run validate
```

## Rules

1. Do not invent exhibits — probe first, or label `unprobed`.
2. Never document how to keep using a ghost.
3. Own this lane only — not Chrysalis, WISP, Helix, or AgenticOps chrome.

## GCE / hostname

- Demo port (agenticop-master): `powershell -File scripts/gce-deploy-demo.ps1` → http://35.224.146.25:27474/
- Named host (chrysalis-test-vm nginx): `powershell -File scripts/gce-deploy-ghosts-host.ps1`
- DNS (GoDaddy API): set `GODADDY_API_KEY` + `GODADDY_API_SECRET`, then `powershell -File scripts/godaddy-set-ghosts-dns.ps1`
- TLS after DNS: certbot webroot on the VM (see deploy script output)
- Target URL: https://ghosts.agenticop.io/

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
