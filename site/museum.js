const WALLS = {
  "still-answering": "Still answering",
  "auth-ghost": "Auth ghost",
  "successor-facade": "Successor facade",
  buried: "Buried",
  unprobed: "Unprobed",
};

/** Host suffixes that fold into one major domain label. */
const DOMAIN_ALIASES = [
  [/^(?:.+\.)?google(?:apis)?\.com$/i, "google.com"],
  [/^(?:.+\.)?youtube\.com$/i, "google.com"],
  [/^(?:.+\.)?blogspot\.com$/i, "google.com"],
  [/^goo\.gl$/i, "google.com"],
  [/^g\.co$/i, "google.com"],
  [/^(?:.+\.)?googleblog\.com$/i, "google.com"],
  [/^(?:.+\.)?withgoogle\.com$/i, "google.com"],
  [/^(?:.+\.)?microsoft\.com$/i, "microsoft.com"],
  [/^(?:.+\.)?windows\.net$/i, "microsoft.com"],
  [/^(?:.+\.)?live\.com$/i, "microsoft.com"],
  [/^(?:.+\.)?msn\.com$/i, "microsoft.com"],
  [/^(?:.+\.)?xbox\.com$/i, "microsoft.com"],
  [/^(?:.+\.)?azure\.com$/i, "microsoft.com"],
  [/^(?:.+\.)?office\.com$/i, "microsoft.com"],
  [/^(?:.+\.)?github\.com$/i, "github.com"],
  [/^(?:.+\.)?github\.io$/i, "github.com"],
  [/^(?:.+\.)?adobe\.com$/i, "adobe.com"],
  [/^(?:.+\.)?yahoo\.com$/i, "yahoo.com"],
  [/^(?:.+\.)?facebook\.com$/i, "facebook.com"],
  [/^(?:.+\.)?fb\.com$/i, "facebook.com"],
];

const MULTI_PART_TLDS = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "co.jp",
  "com.au",
  "com.br",
  "co.nz",
  "co.kr",
]);

/** Fixed internet-history reference eras (clipped to the hung range). */
const ERAS = [
  { id: "dialup", label: "Dial-up", from: "1995-01-01", to: "2000-12-31" },
  { id: "portal", label: "Portal web", from: "2001-01-01", to: "2005-12-31" },
  { id: "social", label: "Social rise", from: "2006-01-01", to: "2011-12-31" },
  { id: "mobile", label: "Mobile web", from: "2012-01-01", to: "2016-12-31" },
  { id: "cloud", label: "Cloud peak", from: "2017-01-01", to: "2020-12-31" },
  { id: "sunset", label: "Sunset decade", from: "2021-01-01", to: "2026-12-31" },
];

const GHOST_SVG = `<svg class="gm-ghost-icon" viewBox="0 0 32 40" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M16 2c-7.2 0-13 5.6-13 12.5V34.2c0 1.4 1.6 2.2 2.7 1.4L9 33l3.3 2.6a1.6 1.6 0 0 0 2 0L16 33l1.7 2.6a1.6 1.6 0 0 0 2 0L23 33l3.3 2.6c1.1.8 2.7 0 2.7-1.4V14.5C29 7.6 23.2 2 16 2z"/>
  <circle cx="11.5" cy="15" r="2.1" fill="var(--void)"/>
  <circle cx="20.5" cy="15" r="2.1" fill="var(--void)"/>
</svg>`;

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
      ? chain.map((h) => h.status).join(" -> ")
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

function deathYear(ex) {
  const d = String(ex.declaredDead || "");
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function deathMs(ex) {
  const raw = String(ex.declaredDead || "");
  if (!/^\d{4}/.test(raw)) return null;
  const iso = raw.length === 4 ? `${raw}-06-15` : raw.length === 7 ? `${raw}-15` : raw;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Fit the rail to hung deaths so ghosts spread instead of piling on recent years. */
function axisBounds(list) {
  const times = list.map(deathMs).filter((t) => t != null);
  if (!times.length) {
    return { start: Date.UTC(2010, 0, 1), end: Date.UTC(2026, 11, 31) };
  }
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 1000 * 60 * 60 * 24 * 365 * 2);
  const pad = Math.max(span * 0.1, 1000 * 60 * 60 * 24 * 180);
  return { start: min - pad, end: max + pad };
}

function axisPos(ex, bounds) {
  const t = deathMs(ex);
  if (t == null) return null;
  const p = (t - bounds.start) / (bounds.end - bounds.start);
  return Math.min(0.97, Math.max(0.03, p));
}

function eraFor(ex) {
  const t = deathMs(ex);
  if (t == null) return null;
  for (const era of ERAS) {
    const a = Date.parse(era.from);
    const b = Date.parse(era.to) + 86400000 - 1;
    if (t >= a && t <= b) return era;
  }
  return null;
}

/**
 * Place ghosts left-to-right by death date; bump to a free lane when too close.
 * Returns { items: [{ex, p, lane}], laneCount, bounds }.
 */
function layoutGhosts(list) {
  const bounds = axisBounds(list);
  const items = list
    .map((ex) => ({ ex, p: axisPos(ex, bounds) }))
    .filter((x) => x.p != null)
    .sort((a, b) => a.p - b.p || String(a.ex.title).localeCompare(String(b.ex.title)));

  // ~56px gap on a ~1400px rail ≈ 4%; scale slightly with density.
  const minGap = Math.max(0.038, Math.min(0.07, 0.85 / Math.max(items.length, 1)));
  const laneLast = [];
  for (const item of items) {
    let lane = 0;
    while (lane < laneLast.length && item.p - laneLast[lane] < minGap) lane += 1;
    if (lane === laneLast.length) laneLast.push(-1);
    laneLast[lane] = item.p;
    item.lane = lane;
  }
  return { items, laneCount: Math.max(1, laneLast.length), bounds };
}

function yearTicks(bounds) {
  const startY = new Date(bounds.start).getUTCFullYear();
  const endY = new Date(bounds.end).getUTCFullYear();
  const span = endY - startY;
  const step = span > 16 ? 4 : span > 10 ? 2 : 1;
  const years = [];
  const first = Math.ceil(startY / step) * step;
  for (let y = first; y <= endY; y += step) years.push(y);
  if (!years.includes(startY)) years.unshift(startY);
  if (!years.includes(endY)) years.push(endY);
  return [...new Set(years)].sort((a, b) => a - b);
}

/** Registrable / major domain for grouping (probe hostname). */
function majorDomain(ex) {
  const host = String(hostOf(ex.probeUrl) || "")
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (!host) return "unknown";

  for (const [re, label] of DOMAIN_ALIASES) {
    if (re.test(host)) return label;
  }

  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

function frame(ex, index, { focus = false } = {}) {
  const wall = WALLS[ex.wall] || ex.wall;
  const finalHost = ex.finalUrl ? hostOf(ex.finalUrl) : "";
  const probeHost = hostOf(ex.probeUrl);
  const domain = majorDomain(ex);
  const moved =
    ex.finalUrl && probeHost && finalHost && probeHost !== finalHost
      ? `<br />Landed on ${esc(finalHost)}`
      : "";
  const year = deathYear(ex);

  return `<article class="gm-frame ${esc(ex.wall)}${focus ? " is-focus" : ""}" id="${esc(ex.id)}" data-wall="${esc(ex.wall)}" data-dead="${esc(ex.declaredDead || "")}" data-year="${year ?? ""}" data-domain="${esc(domain)}" style="--i:${index}" tabindex="-1">
    <div class="gm-frame-top">
      <p class="gm-wall">${esc(wall)}</p>
      ${probeChip(ex)}
    </div>
    <h2>${esc(ex.title)}</h2>
    <p class="gm-owner">${esc(ex.owner)}</p>
    <p class="gm-note">${esc(ex.note)}</p>
    <p class="gm-meta">
      Declared dead ${esc(ex.declaredDead)}<br />
      Probe ${esc(ex.httpStatus ?? "-")} -> ${esc(ex.finalUrl || ex.probeUrl)}${moved}<br />
      <a href="${esc(ex.obituary)}" rel="noopener noreferrer">Obituary</a>
      ·
      <a href="${esc(ex.probeUrl)}" rel="noopener noreferrer">Probe URL</a>
    </p>
  </article>`;
}

function sectionMarker(label, index) {
  return `<div class="gm-year gm-section" style="--i:${index}" role="presentation"><span>${esc(String(label))}</span></div>`;
}

function ghostButton(item, selectedId) {
  const { ex, p, lane } = item;
  const wall = ex.wall || "unprobed";
  const selected = ex.id === selectedId;
  const title = `${ex.title} · declared dead ${ex.declaredDead}`;
  return `<button type="button" class="gm-ghost wall-${esc(wall)}${selected ? " is-selected" : ""}" data-ghost-id="${esc(ex.id)}" style="--p:${(p * 100).toFixed(3)}%; --lane:${lane}" aria-pressed="${selected ? "true" : "false"}" aria-label="${esc(title)}" title="${esc(title)}">${GHOST_SVG}<span class="gm-ghost-label">${esc(ex.title)}</span></button>`;
}

function renderEraRail(list, selectedId) {
  const { items, laneCount, bounds } = layoutGhosts(list);
  const span = bounds.end - bounds.start;

  const eras = ERAS.map((era) => {
    const a = Date.parse(era.from);
    const b = Date.parse(era.to) + 86400000 - 1;
    if (b < bounds.start || a > bounds.end) return "";
    const left = ((Math.max(a, bounds.start) - bounds.start) / span) * 100;
    const right = ((Math.min(b, bounds.end) - bounds.start) / span) * 100;
    return `<div class="gm-era" style="left:${left}%; width:${Math.max(0, right - left)}%"><span>${esc(era.label)}</span></div>`;
  }).join("");

  const ticks = yearTicks(bounds)
    .map((y) => {
      const t = Date.UTC(y, 0, 1);
      if (t < bounds.start || t > bounds.end) return "";
      const p = ((t - bounds.start) / span) * 100;
      return `<span class="gm-tick" style="left:${p}%"><i></i>${y}</span>`;
    })
    .join("");

  const ghosts = items.map((item) => ghostButton(item, selectedId)).join("");

  const selected = list.find((ex) => ex.id === selectedId);
  const era = selected ? eraFor(selected) : null;
  const caption = selected
    ? `<p class="gm-rail-caption"><strong>${esc(selected.title)}</strong> died ${esc(selected.declaredDead)}${era ? ` · ${esc(era.label)}` : ""} · click another ghost to travel</p>`
    : `<p class="gm-rail-caption">Click a ghost along the history of the public web. Each mark is a declared death.</p>`;

  return `<section class="gm-timeline-stage" aria-label="Internet history timeline" style="--lanes:${laneCount}">
    <div class="gm-era-row" aria-hidden="true">${eras}</div>
    <div class="gm-rail" role="list">
      <div class="gm-rail-line" aria-hidden="true"></div>
      ${ghosts}
    </div>
    <div class="gm-rail-years" aria-hidden="true">${ticks}</div>
    ${caption}
  </section>`;
}

function renderCorridor(list, sectionOf) {
  const parts = [];
  let last = null;
  let i = 0;
  for (const ex of list) {
    const key = sectionOf(ex);
    if (key != null && key !== last) {
      parts.push(sectionMarker(key, i));
      last = key;
      i += 1;
    }
    parts.push(frame(ex, i));
    i += 1;
  }
  return parts.join("");
}

const data = await fetch("./exhibits.json").then((r) => r.json());
const hall = document.getElementById("hall");
let exhibits = data.exhibits || [];

let view = "walls";
let wallFilter = "all";
let selectedId = null;

function ordered() {
  let list = exhibits.slice();
  if (wallFilter !== "all") {
    list = list.filter((ex) => ex.wall === wallFilter);
  }
  if (view === "timeline") {
    list.sort((a, b) => {
      const da = String(a.declaredDead || "9999");
      const db = String(b.declaredDead || "9999");
      if (da !== db) return da < db ? -1 : 1;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  } else if (view === "domain") {
    list.sort((a, b) => {
      const da = majorDomain(a);
      const db = majorDomain(b);
      if (da !== db) return da.localeCompare(db);
      const ya = String(a.declaredDead || "9999");
      const yb = String(b.declaredDead || "9999");
      if (ya !== yb) return ya < yb ? -1 : 1;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }
  return list;
}

function updateGhostCount(visible) {
  const el = document.getElementById("ghost-count");
  const meta = document.getElementById("ghost-count-meta");
  if (!el) return;
  const total = exhibits.length;
  const shown = visible ?? total;
  el.textContent = String(total);
  if (meta) {
    meta.textContent =
      wallFilter === "all" || shown === total
        ? "hung"
        : `showing ${shown}`;
  }
}

function ensureSelection(list) {
  if (!list.length) {
    selectedId = null;
    return;
  }
  if (!selectedId || !list.some((ex) => ex.id === selectedId)) {
    selectedId = list[Math.floor(list.length / 2)]?.id || list[0].id;
  }
}

function render() {
  const list = ordered();
  updateGhostCount(list.length);
  hall.classList.toggle("gm-hall--timeline", view === "timeline");
  hall.classList.toggle("gm-hall--domain", view === "domain");
  hall.classList.toggle("gm-hall--rail", view === "timeline");
  document.body.classList.toggle("gm-view-timeline", view === "timeline");
  hall.classList.remove("is-hung");

  if (view === "timeline") {
    ensureSelection(list);
    const focus = list.find((ex) => ex.id === selectedId) || list[0];
    const neighbors = list.filter((ex) => {
      if (!focus) return false;
      const y = deathYear(ex);
      return y != null && y === deathYear(focus) && ex.id !== focus.id;
    });
    const neighborNote = neighbors.length
      ? `<p class="gm-same-year">Also declared dead in ${esc(String(deathYear(focus)))}: ${neighbors
          .map(
            (ex) =>
              `<button type="button" class="gm-inline-ghost" data-ghost-id="${esc(ex.id)}">${esc(ex.title)}</button>`,
          )
          .join(" · ")}</p>`
      : "";
    hall.innerHTML =
      renderEraRail(list, selectedId) +
      (focus ? frame(focus, 0, { focus: true }) : "") +
      neighborNote;
  } else if (view === "domain") {
    hall.innerHTML = renderCorridor(list, (ex) => majorDomain(ex));
  } else {
    hall.innerHTML = list.map((ex, i) => frame(ex, i)).join("");
  }

  requestAnimationFrame(() => {
    hall.classList.add("is-hung");
    if (view === "timeline" && selectedId) {
      const btn = hall.querySelector(`.gm-ghost[data-ghost-id="${CSS.escape(selectedId)}"]`);
      btn?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  });
}

hall.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-ghost-id]");
  if (!btn || view !== "timeline") return;
  selectedId = btn.getAttribute("data-ghost-id");
  render();
  const card = document.getElementById(selectedId);
  card?.focus({ preventScroll: true });
  card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

render();

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

const views = document.getElementById("view-modes");
if (views) {
  views.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    view = btn.getAttribute("data-view") || "walls";
    for (const b of views.querySelectorAll("[data-view]")) {
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    }
    render();
  });
}

/** Keep the left frame honest when the hall grows without a full reload. */
async function refreshExhibits() {
  try {
    const next = await fetch(`./exhibits.json?t=${Date.now()}`, { cache: "no-store" }).then((r) =>
      r.json(),
    );
    const list = next.exhibits || [];
    if (list.length === exhibits.length && list.every((ex, i) => ex.id === exhibits[i]?.id)) {
      return;
    }
    exhibits = list;
    render();
  } catch {
    /* keep last good hang */
  }
}
setInterval(refreshExhibits, 60_000);
