# Nominations

Still Answering hangs frames from **two intake paths**. Same gate for both.

## Paths

| Path | Who | What they bring |
|------|-----|-----------------|
| **Nominate** | Visitors | Public form at `/nominate.html` — probe URL + obituary |
| **Hunt** | Curators | Sunset posts we read, then probe ourselves |

**No login.** Nominations are offers, not accounts. Curator probes before anything hangs.

## Turnstile

Widget sitekey (public) is embedded on `/nominate.html` with `data-action="nominate"`.

Server-side siteverify (canonical) requires:

| Env | Role |
|-----|------|
| `TURNSTILE_SECRET` | Widget secret — **never** in the browser or git |
| `TURNSTILE_HOSTNAMES` | Comma list of allowed frontend hostnames from siteverify |

Copy `.env.example` → `.env` (gitignored) or set the same vars on the GCE process. Do not paste the secret into chat.

Without `TURNSTILE_SECRET`, `POST /api/nominate` fails closed (503).

## On-page form

`site/nominate.html` → `POST /api/nominate` (museum server).

Anti-bot:

1. Cloudflare Turnstile (siteverify: success + action `nominate` + hostname allowlist)
2. Honeypot fields (`company` / `website`) — silent drop if filled
3. Minimum fill time (~2.5s)
4. Per-IP rate limit (5 / hour)
5. Reject credentials / “how to keep using” language
6. Body size cap

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
