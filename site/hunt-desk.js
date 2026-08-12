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
  const err = f.probeError ? `<p class="gm-hunt-err">${esc(f.probeError)}</p>` : "";
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
      ${f.obituary ? `<a href="${esc(f.obituary)}" rel="noopener noreferrer">Obituary</a>` : "No obituary"}
    </p>
  </article>`;
}

const list = document.getElementById("hunt-list");
const filters = document.getElementById("hunt-filters");
const meta = document.getElementById("hunt-meta");

const params = new URLSearchParams(location.search);
let wall = params.get("wall") || "signal";

async function load() {
  const u = new URL("/api/hunt/findings", location.origin);
  u.searchParams.set("wall", wall);
  u.searchParams.set("t", String(Date.now()));
  const data = await fetch(u, { cache: "no-store" }).then((r) => r.json());
  const findings = data.findings || [];
  if (meta) {
    const bits = [];
    if (data.watchlistSize != null) bits.push(`${data.watchlistSize} watch`);
    if (data.noiseSkipped) bits.push(`${data.noiseSkipped} DNS-noise hidden`);
    bits.push(data.note || "signal view");
    meta.textContent = bits.join(" · ");
  }
  list.innerHTML = findings.length
    ? findings.map(row).join("")
    : `<p class="gm-lede">No signal in this view. Try “All contacted” or wait for hunt.</p>`;
  if (filters) {
    for (const b of filters.querySelectorAll("[data-wall]")) {
      b.setAttribute("aria-pressed", b.getAttribute("data-wall") === wall ? "true" : "false");
    }
  }
}

if (filters) {
  filters.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wall]");
    if (!btn) return;
    wall = btn.getAttribute("data-wall") || "signal";
    const url = new URL(location.href);
    if (wall === "signal") url.searchParams.delete("wall");
    else url.searchParams.set("wall", wall);
    history.replaceState({}, "", url);
    load().catch(() => {
      list.innerHTML = `<p class="gm-lede">Could not load hunt findings.</p>`;
    });
  });
}

try {
  await load();
} catch {
  list.innerHTML = `<p class="gm-lede">Could not load hunt findings.</p>`;
}
