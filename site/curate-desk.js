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
  const cmd = `npm run hang -- --id ${r.id}`;
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
    </p>
    <p class="gm-curate-cmd"><code data-cmd="${esc(cmd)}">${esc(cmd)}</code>
      <button type="button" class="gm-curate-copy" data-cmd="${esc(cmd)}">Copy</button>
    </p>
  </article>`;
}

const list = document.getElementById("curate-list");
const lede = document.getElementById("curate-lede");

try {
  const data = await fetch("/api/curate").then((r) => r.json());
  const queue = data.queue || [];
  if (lede && data.curatedAt) {
    const bd = data.byDecision || {};
    lede.textContent = `Refreshed ${data.curatedAt.slice(0, 16)}Z · strong ${bd.strong ?? 0} · consider ${bd.consider ?? 0} · hall ${data.hallSize ?? "—"}`;
  }
  list.innerHTML = queue.length
    ? queue.map(row).join("")
    : `<p class="gm-lede">Empty desk. Run <code>npm run authority</code> then reload.</p>`;
} catch {
  list.innerHTML = `<p class="gm-lede">Could not load curate desk. Try <code>npm run curate -- --desk</code>.</p>`;
}

list?.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".gm-curate-copy");
  if (!btn) return;
  const cmd = btn.getAttribute("data-cmd") || "";
  try {
    await navigator.clipboard.writeText(cmd);
    btn.textContent = "Copied";
    setTimeout(() => {
      btn.textContent = "Copy";
    }, 1200);
  } catch {
    btn.textContent = "Select";
  }
});
