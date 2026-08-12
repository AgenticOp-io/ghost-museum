# Nominations

Ghost Museum hangs frames from **two intake paths**. Same gate for both.

## Paths

| Path | Who | What they bring |
|------|-----|-----------------|
| **Nominate** | Visitors | Public form at `/nominate.html` — probe URL + obituary |
| **Hunt** | Curators | Sunset posts we read, then probe ourselves |

**No login.** Nominations are offers, not accounts. Curator probes before anything hangs.

## On-page form

`site/nominate.html` → `POST /api/nominate` (demo server).

Anti-bot (no CAPTCHA account required for v1):

1. Honeypot fields (`company` / `website`) — silent drop if filled
2. Minimum fill time (~2.5s)
3. Per-IP rate limit (5 / hour)
4. Reject credentials / “how to keep using” language
5. Body size cap

Stored under `nominations/` as JSONL + per-id JSON. **Never** written into `exhibits/` by the API.

## Gate (required before hang)

1. Public URL only — GET probe with museum user-agent
2. Cited obituary
3. Honest wall after probe
4. `doNotIntegrate: true`
5. Curator acceptance
6. Small hall

## Do not accept

- Auth bypass tips, tokens, payloads
- Load-test / fuzz suggestions
- Private or authenticated-only endpoints
- Frames with no funeral citation

## Later (optional)

Cloudflare Turnstile on the form when on a real hostname — still no user login.
