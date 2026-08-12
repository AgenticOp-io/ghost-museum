/** Shared Still Answering hall helpers. */
export const WALLS = {
  "still-answering": "Still answering",
  "auth-ghost": "Auth ghost",
  "successor-facade": "Successor facade",
  buried: "Buried",
  banished: "Banished",
  unprobed: "Unprobed",
};

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

export function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function deathYear(ex) {
  const d = String(ex.declaredDead || "");
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export function majorDomain(ex) {
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

export function probeChip(ex) {
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

export function frame(ex, index, { focus = false } = {}) {
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

export function domainStats(list, censusByDomain) {
  const map = new Map();
  for (const ex of list) {
    const d = majorDomain(ex);
    if (!map.has(d)) {
      map.set(d, {
        domain: d,
        total: 0,
        hung: 0,
        banished: 0,
        watch: 0,
        byWall: {},
      });
    }
    const row = map.get(d);
    row.total += 1;
    if (ex.wall === "banished") row.banished += 1;
    else row.hung += 1;
    row.byWall[ex.wall] = (row.byWall[ex.wall] || 0) + 1;
  }

  if (censusByDomain && typeof censusByDomain === "object") {
    for (const [domain, stats] of Object.entries(censusByDomain)) {
      if (!map.has(domain)) {
        map.set(domain, {
          domain,
          total: 0,
          hung: 0,
          banished: 0,
          watch: 0,
          byWall: {},
        });
      }
      const row = map.get(domain);
      row.total = Number(stats.total) || row.total;
      row.hung = Number(stats.hung) || 0;
      row.banished = Number(stats.banished) || 0;
      row.watch = Number(stats.watch) || 0;
    }
  }

  return [...map.values()].sort(
    (a, b) => b.total - a.total || a.domain.localeCompare(b.domain),
  );
}

export function renderDomainDirectory(list, censusByDomain, { limit = 10, showAll = false } = {}) {
  const rows = domainStats(list, censusByDomain);
  if (!rows.length) {
    return `<p class="gm-lede">No domains in this filter.</p>`;
  }
  const visible = showAll ? rows : rows.slice(0, limit);
  const hidden = Math.max(0, rows.length - visible.length);
  const cards = visible
    .map((row, i) => {
      const bits = [];
      if (row.hung) bits.push(`${row.hung} hung`);
      if (row.watch) bits.push(`${row.watch} watch`);
      if (row.banished) bits.push(`${row.banished} banished`);
      for (const [wall, n] of Object.entries(row.byWall)) {
        if (wall === "banished") continue;
        bits.push(`${n} ${WALLS[wall] || wall}`);
      }
      return `<a class="gm-domain-card" role="listitem" href="./domain.html?d=${encodeURIComponent(row.domain)}" style="--i:${i}">
          <span class="gm-domain-name">${esc(row.domain)}</span>
          <span class="gm-domain-count">${row.total}</span>
          <span class="gm-domain-meta">${esc(bits.slice(0, 4).join(" · "))}</span>
        </a>`;
    })
    .join("");

  let more = "";
  if (!showAll && hidden > 0) {
    more = `<p class="gm-domain-more"><a href="?view=domain&amp;all=1">Show ${hidden} more domain${hidden === 1 ? "" : "s"} (${rows.length} total)</a></p>`;
  } else if (showAll && rows.length > limit) {
    more = `<p class="gm-domain-more"><a href="?view=domain">Show top ${limit}</a></p>`;
  }

  return `<div class="gm-domain-dir" role="list">${cards}</div>${more}`;
}
