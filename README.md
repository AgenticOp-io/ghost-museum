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

## GCE demo (no hostname)

Static hall on **agenticop-master**, demo port only (not :80/:443):

```powershell
powershell -File scripts/gce-deploy-demo.ps1
```

View: http://35.224.146.25:27474/

Default port `27474` reuses an existing `http-server` firewall allow. Dedicated `:19191` needs a project admin to create `allow-ghost-museum` (`compute.firewalls.create`).

## License

Apache-2.0. Private remote for now; open the hall when a hostname is assigned.
