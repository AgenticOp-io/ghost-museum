# Nominations

Ghost Museum hangs frames from **two intake paths**. Same gate for both.

## Paths

| Path | Who | What they bring |
|------|-----|-----------------|
| **Nominate** | Visitors / peers | Public `probeUrl` + public `obituary` URL |
| **Hunt** | Curators | Sunset posts we read, then probe ourselves |

## Gate (required)

1. Public URL only — GET probe with museum user-agent.
2. Cited obituary (blog / EOL notice / sale notice).
3. Honest wall after probe (`still-answering` / `auth-ghost` / `successor-facade` / `buried`), or label `unprobed` / `probeError`.
4. `doNotIntegrate: true` — no “how to keep using.”
5. Curator acceptance — nominations are offers, not automatic hangs.
6. Small hall — prefer a sharp contrast set over a directory.

## Do not accept

- Auth bypass tips, tokens, payloads
- Load-test / fuzz suggestions
- Private or authenticated-only endpoints
- Frames with no funeral citation

## When public

Open a GitHub issue template (probe URL, obituary, one-sentence why). Until then: private issue or curator message.
