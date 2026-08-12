const WALLS = {
  "still-answering": "Still answering",
  "auth-ghost": "Auth ghost",
  "successor-facade": "Successor facade",
  buried: "Buried",
  banished: "Banished",
  unprobed: "Unprobed",
};

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hops(chain) {
  if (!Array.isArray(chain) || !chain.length) return "-";
  return chain.map((h) => h.status).join(" -> ");
}

function row(f) {
  const wallKey = f.suggestedWall || "unprobed";
  const wall = WALLS[wallKey] || wallKey;
  const err = f.probeError
    ? `<p class="gm-hunt-err">${esc(f.probeError)}</p>`
    : "";
  return `<article class="gm-hunt-card" id="${esc(f.id)}-${esc(f.huntedAt || "")}" data-wall="${esc(wallKey)}">
    <div class="gm-frame-top">
      <p class="gm-wall">${esc(wall)}</p>
      <span class="gm-chip status">${esc(hops(f.redirectChain) || f.httpStatus || "-")}</span>
    </div>
    <h2>${esc(f.title || f.id)}</h2>
    <p class="gm-owner">${esc(f.probeUrl)}</p>
    <p class="gm-note">${esc(f.note || "No curator note.")}</p>
    ${err}
    <p class="gm-meta">
      Hunted ${esc(f.huntedAt || "-")}<br />
      Final ${esc(f.finalUrl || "-")}<br />
      Status ${esc(f.status || "pending-review")} · autoHang ${esc(String(!!f.autoHang))}
      ${f.obituary ? `<br /><a href="${esc(f.obituary)}" rel="noopener noreferrer">Obituary</a>` : ""}
    </p>
  </article>`;
}

const list = document.getElementById("hunt-list");

try {
  const data = await fetch("/api/hunt/findings").then((r) => r.json());
  const findings = data.findings || [];
  list.innerHTML = findings.length
    ? findings.map(row).join("")
    : `<p class="gm-lede">Empty queue. The bot only writes after each GET.</p>`;
} catch {
  list.innerHTML = `<p class="gm-lede">Could not load hunt findings.</p>`;
}
