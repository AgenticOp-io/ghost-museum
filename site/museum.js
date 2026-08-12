import { renderDomainDirectory } from "./gm-shared.js";
import { paintCensus, fetchCensus } from "./gm-census.js";

const WALLS = {
  "still-answering": "Still answering",
  "auth-ghost": "Auth ghost",
  "successor-facade": "Successor facade",
  buried: "Buried",
  banished: "Banished",
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
  if (ex.tlsWarning) {
    return `<span class="gm-chip redirect" title="TLS ${esc(ex.tlsWarning)} — browsers may still open this host">tls warn · ${esc(ex.httpStatus ?? "-")}</span>`;
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
    ? `<p class="gm-rail-caption"><strong>${esc(selected.title)}</strong> died ${esc(selected.declaredDead)}${era ? ` · ${esc(era.label)}` : ""} · frames for every year below</p>`
    : `<p class="gm-rail-caption">Click a ghost on the rail, then read every frame grouped by year below.</p>`;

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

function renderCorridor(list, sectionOf, { selectedId = null } = {}) {
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
    parts.push(frame(ex, i, { focus: Boolean(selectedId && ex.id === selectedId) }));
    i += 1;
  }
  return parts.join("");
}

const data = await fetch("./exhibits.json").then((r) => r.json());
const hall = document.getElementById("hall");
const pagerEl = document.getElementById("hall-pager");
let exhibits = data.exhibits || [];
/** Paginated By-wall catalog (hung ∪ hunt-contacted watch). */
let hallPage = null;

const bootParams = new URLSearchParams(location.search);
let view = "walls";
let wallFilter = bootParams.get("wall") || "all";
let selectedId = null;
let showAllDomains = false;
let page = Math.max(1, Number(bootParams.get("page")) || 1);
const PAGE_SIZE = 24;

const bootView = bootParams.get("view");
if (bootView === "domain" || bootView === "timeline" || bootView === "walls") {
  view = bootView;
}
showAllDomains = view === "domain" && bootParams.get("all") === "1";

function ordered() {
  let list = exhibits.slice();
  // Domain directory lists every domain; wall filters apply on the domain page.
  if (view !== "domain" && wallFilter !== "all") {
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

let census = {
  total: exhibits.length,
  hung: exhibits.filter((e) => e.wall !== "banished").length,
  banished: exhibits.filter((e) => e.wall === "banished").length,
  watchlist: 0,
};

function updateGhostCount() {
  paintCensus(census, { hungFallback: exhibits.length });
}

async function refreshCensus() {
  try {
    census = await fetchCensus();
    updateGhostCount();
    if (view === "domain") render();
  } catch {
    /* keep last */
  }
}

function syncUrl() {
  const url = new URL(location.href);
  if (view === "walls") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  if (view === "domain" && showAllDomains) url.searchParams.set("all", "1");
  else url.searchParams.delete("all");
  if (view === "walls" && page > 1) url.searchParams.set("page", String(page));
  else url.searchParams.delete("page");
  if (view !== "domain" && wallFilter !== "all") url.searchParams.set("wall", wallFilter);
  else url.searchParams.delete("wall");
  history.replaceState({}, "", url);
}

async function fetchHallPage() {
  const u = new URL("/api/hall", location.origin);
  u.searchParams.set("page", String(page));
  u.searchParams.set("pageSize", String(PAGE_SIZE));
  u.searchParams.set("wall", wallFilter || "all");
  u.searchParams.set("t", String(Date.now()));
  const data = await fetch(u, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
  hallPage = data;
  if (data.page && data.page !== page) page = data.page;
  return data;
}

function renderPager(payload) {
  if (!pagerEl) return;
  const usePager = view === "walls" && payload && payload.pages > 1;
  pagerEl.hidden = !usePager;
  if (!usePager) {
    pagerEl.innerHTML = "";
    return;
  }
  const { page: p, pages, total } = payload;
  const prevDisabled = p <= 1 ? " disabled" : "";
  const nextDisabled = p >= pages ? " disabled" : "";
  pagerEl.innerHTML = `
    <button type="button" class="gm-pager-btn" data-page="${p - 1}"${prevDisabled}>Previous</button>
    <p class="gm-pager-status">Page ${p} of ${pages} · ${total} ghosts</p>
    <button type="button" class="gm-pager-btn" data-page="${p + 1}"${nextDisabled}>Next</button>
  `;
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
  updateGhostCount();
  hall.classList.toggle("gm-hall--timeline", view === "timeline");
  hall.classList.toggle("gm-hall--domain", view === "domain");
  hall.classList.toggle("gm-hall--rail", view === "timeline");
  document.body.classList.toggle("gm-view-timeline", view === "timeline");
  document.body.classList.toggle("gm-view-domain", view === "domain");
  const wallFilters = document.getElementById("wall-filters");
  if (wallFilters) wallFilters.hidden = view === "domain";
  hall.classList.remove("is-hung");

  if (view === "timeline") {
    ensureSelection(list);
    const corridor = renderCorridor(
      list,
      (ex) => {
        const y = deathYear(ex);
        return y != null ? String(y) : "Undated";
      },
      { selectedId },
    );
    hall.innerHTML =
      renderEraRail(list, selectedId) +
      `<div class="gm-timeline-frames">${corridor}</div>`;
    renderPager(null);
  } else if (view === "domain") {
    hall.innerHTML = renderDomainDirectory(list, census.byDomain, {
      limit: 10,
      showAll: showAllDomains,
    });
    renderPager(null);
  } else if (hallPage?.exhibits) {
    const frames = hallPage.exhibits;
    hall.innerHTML = frames.length
      ? frames.map((ex, i) => frame(ex, i)).join("")
      : `<p class="gm-lede">No ghosts on this page.</p>`;
    renderPager(hallPage);
  } else {
    hall.innerHTML = list.map((ex, i) => frame(ex, i)).join("");
    renderPager(null);
  }

  const filtersBar = document.getElementById("wall-filters");
  if (filtersBar) {
    for (const b of filtersBar.querySelectorAll("[data-filter]")) {
      b.setAttribute(
        "aria-pressed",
        (b.getAttribute("data-filter") || "all") === wallFilter ? "true" : "false",
      );
    }
  }

  requestAnimationFrame(() => {
    hall.classList.add("is-hung");
    if (view === "timeline" && selectedId) {
      const btn = hall.querySelector(`.gm-ghost[data-ghost-id="${CSS.escape(selectedId)}"]`);
      btn?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  });
}

async function showWallsPage() {
  try {
    await fetchHallPage();
  } catch {
    const filtered =
      wallFilter === "all" ? exhibits : exhibits.filter((e) => e.wall === wallFilter);
    hallPage = {
      page: 1,
      pages: 1,
      total: filtered.length,
      exhibits: filtered,
    };
  }
  syncUrl();
  render();
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

if (pagerEl) {
  pagerEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-page]");
    if (!btn || btn.disabled) return;
    const next = Number(btn.getAttribute("data-page"));
    if (!Number.isFinite(next) || next < 1) return;
    page = next;
    showWallsPage();
    hall.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

if (view === "walls") showWallsPage();
else render();

const filters = document.getElementById("wall-filters");
if (filters) {
  filters.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    wallFilter = btn.getAttribute("data-filter") || "all";
    page = 1;
    if (view === "walls") showWallsPage();
    else {
      syncUrl();
      render();
    }
  });
}

const views = document.getElementById("view-modes");
if (views) {
  for (const b of views.querySelectorAll("[data-view]")) {
    b.setAttribute("aria-pressed", b.getAttribute("data-view") === view ? "true" : "false");
  }
  views.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    view = btn.getAttribute("data-view") || "walls";
    showAllDomains = false;
    page = 1;
    for (const b of views.querySelectorAll("[data-view]")) {
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    }
    if (view === "walls") showWallsPage();
    else {
      syncUrl();
      render();
    }
  });
}

/** Keep the census box honest when hunt / recheck update the hall. */
async function refreshExhibits() {
  try {
    const next = await fetch(`./exhibits.json?t=${Date.now()}`, { cache: "no-store" }).then((r) =>
      r.json(),
    );
    const list = next.exhibits || [];
    if (
      list.length === exhibits.length &&
      list.every((ex, i) => ex.id === exhibits[i]?.id && ex.wall === exhibits[i]?.wall)
    ) {
      await refreshCensus();
      if (view === "walls") await showWallsPage();
      return;
    }
    exhibits = list;
    if (view === "walls") await showWallsPage();
    else render();
    await refreshCensus();
  } catch {
    /* keep last good hang */
  }
}
setInterval(refreshCensus, 15_000);
setInterval(refreshExhibits, 60_000);
refreshCensus();
