const WALLS = {
  "still-answering": "Still answering",
  "auth-ghost": "Auth ghost",
  "successor-facade": "Successor façade",
  buried: "Buried",
};

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function frame(ex) {
  const wall = WALLS[ex.wall] || ex.wall;
  return `<article class="gm-frame ${esc(ex.wall)}" id="${esc(ex.id)}">
    <p class="gm-wall">${esc(wall)}</p>
    <h2>${esc(ex.title)}</h2>
    <p class="gm-owner">${esc(ex.owner)}</p>
    <p class="gm-note">${esc(ex.note)}</p>
    <p class="gm-stamp">DO NOT INTEGRATE</p>
    <p class="gm-meta">
      Declared dead ${esc(ex.declaredDead)}<br />
      Probe ${esc(ex.httpStatus)} → ${esc(ex.finalUrl)}<br />
      <a href="${esc(ex.obituary)}" rel="noopener noreferrer">Obituary</a>
      ·
      <a href="${esc(ex.probeUrl)}" rel="noopener noreferrer">Probe URL</a>
    </p>
  </article>`;
}

const data = await fetch("./exhibits.json").then((r) => r.json());
document.getElementById("hall").innerHTML = data.exhibits.map(frame).join("");
const probed = document.getElementById("probed-at");
if (probed) probed.textContent = data.probedAt || "unknown";
