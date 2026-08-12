# Exhibit schema

Source of truth: `exhibits/exhibits.json`. The hall loads `site/exhibits.json` (kept in sync by `npm run probe`).

## Root

| Field | Required | Notes |
|-------|----------|--------|
| `museum` | yes | `"Still Answering"` |
| `tagline` | yes | Public tagline |
| `probedAt` | after probe | ISO timestamp of last hall probe |
| `userAgent` | yes | Sent on probes |
| `exhibits` | yes | Non-empty array |

## Exhibit

| Field | Required | Notes |
|-------|----------|--------|
| `id` | yes | Stable slug |
| `wall` | yes | `still-answering` \| `auth-ghost` \| `successor-facade` \| `buried` \| `banished` \| `unprobed` |
| `title` | yes | Frame title |
| `owner` | yes | Who ran it |
| `declaredDead` | yes | ISO date of sunset / sale / EOL |
| `obituary` | yes | Public URL citing the funeral |
| `obituaryNote` | no | Short citation |
| `probeUrl` | yes | Public URL we GET |
| `httpStatus` | unless unprobed / probeError | Final response status after redirects |
| `finalUrl` | unless unprobed / probeError | URL of the last hop |
| `redirectChain` | after probe | `[{ url, status, location? }, …]` |
| `titleTag` | no | HTML `<title>` when body is HTML |
| `note` | yes | Why this hangs here — never “how to use” |
| `doNotIntegrate` | yes | Must be `true` |
| `probeError` | on failure | Honest failure string |

| `lastRecheckAt` | after recheck | ISO time of last monthly live recheck |
| `banishedAt` | when banished | When recheck moved the frame to `banished` |
| `previousWall` | when banished | Wall before banishment |

## Rules

1. Do not invent exhibits. Probe first, or label `unprobed` (hunt/status only — not a public hall wall; hung frames require a ghost-class probe).
2. Evidence only — never “how to keep using.” Schema keeps `doNotIntegrate: true` as a gate.
3. GET only on public URLs. No auth bypass.
4. `buried` is for completed funerals hung as contrast (`410` / gone).
5. `banished` is for hung ghosts that a later recheck found gone (unreachable or `410`). Monthly live recheck: `npm run recheck -- --loop`.
6. Census `hung` = framed ghosts. `candidates` / `total` use ghost-class hunt contacts only — seeds and non-ghost HTTP replies stay off the wall.
