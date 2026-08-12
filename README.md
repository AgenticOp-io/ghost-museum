# Ghost Museum

**Sunset is a press release. Ghosts are a runtime.**

A hall of interfaces that outlived their obituaries: hostnames that still answer, loaders for runtimes that had a funeral, APIs that return `401` instead of `410`.

This is not a scanner and not an invitation to integrate. Each frame is stamped **DO NOT INTEGRATE**.

## Hall (first hanging)

Exhibits are real probes from 2026-08-12, not invented façades. See `exhibits/exhibits.json`.

| Kind | Meaning |
|------|---------|
| Still answering | Original surface still returns `200` |
| Auth ghost | Host lives; `401`/`403`, not `410` |
| Successor façade | Redirects to a different living product |
| Buried | `410` / gone — they actually held a funeral |

## Local

Open `site/index.html` in a browser, or:

```bash
npx --yes serve site
```

Refresh probes:

```bash
node scripts/probe.mjs
```

## License

Apache-2.0. Private remote for now; the intent is to open the hall when the first hanging is ready for visitors.
