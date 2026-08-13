/** Shared live census box for every masthead. */
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function paintCensus(census, { hungFallback = 0 } = {}) {
  const el = document.getElementById("ghost-count");
  const meta = document.getElementById("ghost-count-meta");
  const frame = document.querySelector(".gm-count-frame");
  if (!el || !census) return;

  const hung = census.hung ?? hungFallback;
  const wall = census.total ?? hung;
  const candidates =
    census.candidates ?? Math.max(0, wall - hung);
  const watching = census.watchlist ?? 0;
  const awaiting = census.awaitingProbe ?? 0;

  const prev = el.textContent;
  // Hero matches the hall catalog (hung ∪ ghost-class evidence).
  const next = String(wall);
  el.textContent = next;
  el.dataset.digits = String(Math.min(7, Math.max(1, next.replace(/\D/g, "").length || next.length)));
  if (frame && prev !== "…" && prev !== next) {
    frame.classList.add("is-live");
    clearTimeout(paintCensus._flash);
    paintCensus._flash = setTimeout(() => frame.classList.remove("is-live"), 900);
  }

  const parts = [`${hung} hung`];
  if (candidates > 0) parts.push(`${candidates} candidates`);
  if (awaiting > 0) parts.push(`${awaiting} awaiting`);
  if (watching > 0) parts.push(`${watching} watch`);
  if (census.banished) parts.push(`${census.banished} banished`);

  const detail = parts.join(" · ");
  if (meta) {
    meta.innerHTML = parts.map((p) => `<span class="gm-count-line">${esc(p)}</span>`).join("");
  }
  if (frame) {
    frame.setAttribute("aria-label", `Ghosts ${next} on wall · ${detail}`);
  }
  const kicker = frame?.querySelector(".gm-count-wall");
  if (kicker) kicker.textContent = "Ghosts";
}

export async function fetchCensus({ slim = true } = {}) {
  try {
    const q = slim ? "slim=1&" : "";
    const next = await fetch(`/api/census?${q}t=${Date.now()}`, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
    return next;
  } catch {
    return fetch(`./census.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
  }
}

export function startCensusBox({ intervalMs = 15_000, onUpdate } = {}) {
  if (startCensusBox._started) return;
  startCensusBox._started = true;

  async function tick() {
    try {
      const census = await fetchCensus();
      paintCensus(census);
      onUpdate?.(census);
    } catch {
      /* keep last */
    }
  }

  tick();
  setInterval(tick, intervalMs);
}
