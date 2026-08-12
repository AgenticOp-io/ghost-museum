# Agent instructions — Ghost Museum

Lane: `engines/ghost-museum` in the AgenticOps umbrella.

**What this is:** A public hall of interfaces that outlived their obituaries. Sunset is a press release. Ghosts are a runtime.

**What this is not:** A scanner, an exploit kit, a shaming list, a Chrysalis addon, a WISP module, or AgenticOps marketing chrome.

## Hard rules

1. **Do not invent exhibits.** Every frame needs a real probe (`status`, `finalUrl`, `probedAt`) or an honest `buried` / `unprobed` label.
2. **Do not integrate.** The stamp on every frame is the product. Never document “how to keep using” a ghost.
3. **GET/HEAD only** on public URLs. No auth bypass, no fuzzing, no credential stuffing, no load tests against ghosts.
4. **Own this lane only.** Do not edit `brand/agenticops-web`, Chrysalis, WISPTools, FDE, or Helix from a Ghost Museum task.
5. **Brand separation.** Ghost Museum has its own visual language (gallery, frames, tungsten). Do not import `agenticops.css` / `ao-layout.js`.

## Layout

| Path | Role |
|------|------|
| `exhibits/exhibits.json` | Source of truth for the hall |
| `site/` | Static museum |
| `scripts/probe.mjs` | Refresh last-probe fields |
| `README.md` | Public explanation |

## Probe

```bash
node scripts/probe.mjs
```

Writes `probedAt` / `httpStatus` / `finalUrl` back into `exhibits/exhibits.json`. Re-render is automatic (`site/museum.js` loads the JSON).
