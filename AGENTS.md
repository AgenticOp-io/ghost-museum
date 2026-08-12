# Agent instructions — Still Answering

Lane: `engines/ghost-museum` in the AgenticOps umbrella.

**What this is:** A public hall of interfaces that outlived their obituaries. Sunset is a press release. Ghosts are a runtime.

**What this is not:** A scanner, an exploit kit, a shaming list, a Chrysalis addon, a WISP module, or AgenticOps marketing chrome.

## Hard rules

1. **Do not invent exhibits.** Every frame needs a real probe (`status`, `finalUrl`, `probedAt`) or an honest `buried` / `unprobed` label.
2. **Evidence only.** Never document “how to keep using” a ghost. Frames are funerals with sockets, not integration tips.
3. **GET/HEAD only** on public URLs. No auth bypass, no fuzzing, no credential stuffing, no load tests against ghosts.
4. **Own this lane only.** Do not edit `brand/agenticops-web`, Chrysalis, WISPTools, FDE, or Helix from a Still Answering task.
5. **Brand separation.** Still Answering has its own visual language (gallery, frames, tungsten). Do not import `agenticops.css` / `ao-layout.js`.

## Layout

| Path | Role |
|------|------|
| `exhibits/exhibits.json` | Source of truth for the hall |
| `site/` | Static museum |
| `scripts/probe.mjs` | Refresh last-probe fields + redirect chain |
| `scripts/validate.mjs` | Schema / honesty gate |
| `scripts/demo-server.mjs` | Static hall + `POST /api/nominate` |
| `site/nominate.html` | Public nomination form (no login) |
| `docs/SCHEMA.md` | Exhibit field contract |
| `docs/NOMINATIONS.md` | Nominate + hunt intake |

## Probe

```bash
npm run probe
npm run validate
```

Writes `probedAt` / `httpStatus` / `finalUrl` / `redirectChain` into `exhibits/exhibits.json` and syncs `site/exhibits.json`. Re-render is automatic (`site/museum.js` loads the JSON).

## GCE host

```powershell
powershell -File scripts/gce-deploy-ghosts-host.ps1
```

Public: **https://ghosts.agenticop.io/** on **chrysalis-test-vm** (nginx → `:19191`).

Optional secondary hall on **agenticop-master** `:27474`:

```powershell
powershell -File scripts/gce-deploy-demo.ps1
```
