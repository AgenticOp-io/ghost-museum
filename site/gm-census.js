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
  const verified = census.verified ?? 0;
  const contacted = census.contacted ?? verified;
  const watching = census.watchlist ?? 0;
  const awaiting = census.awaitingProbe ?? Math.max(0, watching - contacted);
  const prev = el.textContent;
  // Hero = hung frames (moves with hang:auto). Wall/evidence total stays in meta.
  const next = String(hung);
  el.textContent = next;
  if (frame && prev !== "…" && prev !== next) {
    frame.classList.add("is-live");
    clearTimeout(paintCensus._flash);
    paintCensus._flash = setTimeout(() => frame.classList.remove("is-live"), 900);
  }
  const wall = census.total ?? hung;
  const parts = [`${wall} on wall`];
  if (verified) parts.push(`${verified} ghost-class`);
  if (contacted) parts.push(`${contacted} contacted`);
  if (watching) parts.push(`${watching} watch`);
  if (awaiting && awaiting !== watching) parts.push(`${awaiting} awaiting probe`);
  if (census.banished) parts.push(`${census.banished} banished`);
  const detail = parts.join(" · ");
  if (meta) {
    meta.innerHTML = parts.map((p) => `<span class="gm-count-line">${esc(p)}</span>`).join("");
  }
  if (frame) frame.setAttribute("aria-label", `Hung ${next} · ${detail}`);
  const kicker = frame?.querySelector(".gm-count-wall");
  if (kicker) kicker.textContent = "Hung";
}

export async function fetchCensus() {
  try {
    const next = await fetch(`/api/census?t=${Date.now()}`, { cache: "no-store" }).then((r) => {
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
