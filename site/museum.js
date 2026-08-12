const WALLS = {
  "still-answering": "Still answering",
  "auth-ghost": "Auth ghost",
  "successor-facade": "Successor façade",
  buried: "Buried",
  unprobed: "Unprobed",
};

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function probeChip(ex) {
  if (ex.probeError) {
    return `<span class="gm-chip fail" title="${esc(ex.probeError)}">probe failed</span>`;
  }
  if (ex.wall === "unprobed" || ex.httpStatus == null) {
    return `<span class="gm-chip muted">unprobed</span>`;
  }
  const chain = Array.isArray(ex.redirectChain) ? ex.redirectChain : null;
  const hops =
    chain && chain.length > 1
      ? chain.map((h) => h.status).join(" → ")
      : String(ex.httpStatus);
  const redirected = chain && chain.length > 1;
  return `<span class="gm-chip ${redirected ? "redirect" : "status"}">${esc(hops)}</span>`;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function frame(ex, index) {
  const wall = WALLS[ex.wall] || ex.wall;
  const finalHost = ex.finalUrl ? hostOf(ex.finalUrl) : "";
  const probeHost = hostOf(ex.probeUrl);
  const moved =
    ex.finalUrl && probeHost && finalHost && probeHost !== finalHost
      ? `<br />Landed on ${esc(finalHost)}`
      : "";

  return `<article class="gm-frame ${esc(ex.wall)}" id="${esc(ex.id)}" data-wall="${esc(ex.wall)}" style="--i:${index}">
    <div class="gm-frame-top">
      <p class="gm-wall">${esc(wall)}</p>
      ${probeChip(ex)}
    </div>
    <h2>${esc(ex.title)}</h2>
    <p class="gm-owner">${esc(ex.owner)}</p>
    <p class="gm-note">${esc(ex.note)}</p>
    <p class="gm-stamp" aria-hidden="true">DO NOT INTEGRATE</p>
    <p class="gm-meta">
      Declared dead ${esc(ex.declaredDead)}<br />
      Probe ${esc(ex.httpStatus ?? "—")} → ${esc(ex.finalUrl || ex.probeUrl)}${moved}<br />
      <a href="${esc(ex.obituary)}" rel="noopener noreferrer">Obituary</a>
      ·
      <a href="${esc(ex.probeUrl)}" rel="noopener noreferrer">Probe URL</a>
    </p>
  </article>`;
}

const data = await fetch("./exhibits.json").then((r) => r.json());
const hall = document.getElementById("hall");
const exhibits = data.exhibits || [];
hall.innerHTML = exhibits.map(frame).join("");

const probed = document.getElementById("probed-at");
if (probed) probed.textContent = data.probedAt || "unknown";

const count = document.getElementById("exhibit-count");
if (count) count.textContent = String(exhibits.length);

const filters = document.getElementById("wall-filters");
if (filters) {
  filters.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    const wall = btn.getAttribute("data-filter");
    for (const b of filters.querySelectorAll("[data-filter]")) {
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    }
    for (const el of hall.querySelectorAll(".gm-frame")) {
      const show = wall === "all" || el.getAttribute("data-wall") === wall;
      el.hidden = !show;
    }
  });
}

requestAnimationFrame(() => hall.classList.add("is-hung"));
