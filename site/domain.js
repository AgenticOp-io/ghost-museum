import { frame, majorDomain, WALLS } from "./gm-shared.js";

const params = new URLSearchParams(location.search);
const domain = (params.get("d") || "").trim().toLowerCase();
const hall = document.getElementById("hall");
const titleEl = document.getElementById("domain-title");
const tagEl = document.getElementById("domain-tag");

let wallFilter = "all";
let exhibits = [];
let censusRow = null;

if (!domain) {
  location.replace("./index.html?view=domain");
}

document.title = `${domain} · Still Answering`;
if (titleEl) titleEl.textContent = domain;

async function loadExhibits() {
  const data = await fetch(`./exhibits.json?t=${Date.now()}`, { cache: "no-store" }).then((r) =>
    r.json(),
  );
  exhibits = (data.exhibits || []).filter((ex) => majorDomain(ex) === domain);
}

async function loadCensusRow() {
  try {
    const census = await fetch(`/api/census?t=${Date.now()}`, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
    censusRow = census.byDomain?.[domain] || null;
  } catch {
    try {
      const census = await fetch(`./census.json?t=${Date.now()}`, { cache: "no-store" }).then((r) =>
        r.json(),
      );
      censusRow = census.byDomain?.[domain] || null;
    } catch {
      /* keep last */
    }
  }
}

function ordered() {
  let list = exhibits.slice();
  if (wallFilter !== "all") list = list.filter((ex) => ex.wall === wallFilter);
  list.sort((a, b) => {
    const da = String(a.declaredDead || "9999");
    const db = String(b.declaredDead || "9999");
    if (da !== db) return da < db ? -1 : 1;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
  return list;
}

function render() {
  const list = ordered();
  const banished = exhibits.filter((e) => e.wall === "banished").length;
  const hung = exhibits.length - banished;
  const total = censusRow?.total ?? exhibits.length;
  const watch = censusRow?.watch ?? 0;
  if (tagEl) {
    if (!list.length && wallFilter !== "all") {
      tagEl.textContent = `No ${WALLS[wallFilter] || wallFilter} ghosts here.`;
    } else if (!total) {
      tagEl.textContent = "No hung ghosts for this domain yet.";
    } else {
      const parts = [`${total} ghost${total === 1 ? "" : "s"}`];
      parts.push(`${censusRow?.hung ?? hung} hung`);
      if (watch) parts.push(`${watch} watch`);
      if ((censusRow?.banished ?? banished) > 0) {
        parts.push(`${censusRow?.banished ?? banished} banished`);
      }
      tagEl.textContent = parts.join(" · ");
    }
  }
  hall.classList.remove("is-hung");
  hall.innerHTML = list.length
    ? list.map((ex, i) => frame(ex, i)).join("")
    : `<p class="gm-lede">Empty wing. <a href="./index.html?view=domain">Back to domains</a>.</p>`;
  requestAnimationFrame(() => hall.classList.add("is-hung"));
}

const filters = document.getElementById("wall-filters");
if (filters) {
  filters.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    wallFilter = btn.getAttribute("data-filter") || "all";
    for (const b of filters.querySelectorAll("[data-filter]")) {
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    }
    render();
  });
}

async function refresh() {
  await Promise.all([loadExhibits(), loadCensusRow()]);
  render();
}

await refresh();
setInterval(refresh, 15_000);
