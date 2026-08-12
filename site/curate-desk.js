import { WALLS, esc } from "./gm-shared.js";

function bandClass(d) {
  if (d === "strong") return "gm-curate-strong";
  if (d === "consider") return "gm-curate-consider";
  return "";
}

function row(r) {
  const wall = WALLS[r.wall] || r.wall || "—";
  const reasons = Array.isArray(r.reasons)
    ? r.reasons.slice(0, 4).map((x) => esc(x)).join(" · ")
    : "";
  const seed = r.fromSeedPack
    ? `<span class="gm-chip gm-curate-seed">seed</span>`
    : "";
  return `<article class="gm-hunt-card ${bandClass(r.decision)}" id="curate-${esc(r.id)}">
    <div class="gm-frame-top">
      <p class="gm-wall">${esc(r.decision)} · ${esc(wall)}</p>
      <span class="gm-chip status">${esc(r.score)}</span>
      ${seed}
    </div>
    <h2>${esc(r.title || r.id)}</h2>
    <p class="gm-owner">${esc(r.owner || "—")} · ${esc(r.domain || "")}</p>
    <p class="gm-note">${esc(r.probeUrl)}</p>
    <p class="gm-meta">
      ${esc(r.source || "?")}<br />
      Status ${esc(r.httpStatus ?? "unprobed")}
      ${r.obituary ? `<br /><a href="${esc(r.obituary)}" rel="noopener noreferrer">Obituary</a>` : ""}
      ${reasons ? `<br />${reasons}` : ""}
      <br /><span class="gm-curate-auto">Queued for hang:auto</span>
    </p>
  </article>`;
}

const list = document.getElementById("curate-list");
const lede = document.getElementById("curate-lede");
const POLL_MS = 15_000;

function paint(data) {
  const queue = data.queue || [];
  if (lede) {
    const bd = data.byDecision || {};
    const when = (data.refreshedAt || data.curatedAt || "")
      .slice(0, 16)
      .replace("T", " ");
    lede.textContent = `Auto-curate desk · live ${when || "—"} UTC · strong ${bd.strong ?? 0} pending · consider ${bd.consider ?? 0} · hall ${data.hallSize ?? "—"} · hang:auto drains this queue`;
  }
  list.innerHTML = queue.length
    ? queue.map(row).join("")
    : `<p class="gm-lede">Desk clear — hang:auto caught up. Authority will refill from new evidence.</p>`;
}

async function loadDesk() {
  const data = await fetch(`/api/curate?t=${Date.now()}`, { cache: "no-store" }).then((r) =>
    r.json(),
  );
  paint(data);
}

try {
  await loadDesk();
  setInterval(() => {
    loadDesk().catch(() => {});
  }, POLL_MS);
} catch {
  list.innerHTML = `<p class="gm-lede">Could not load curate desk.</p>`;
}
