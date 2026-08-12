const form = document.getElementById("nominate-form");
const statusEl = document.getElementById("form-status");
const submitBtn = document.getElementById("submit-btn");
const startedAt = document.getElementById("startedAt");
const turnstileSlot = document.getElementById("turnstile-slot");

startedAt.value = String(Date.now());

/** Optional: set window.__GM_TURNSTILE_SITEKEY or meta[name=gm-turnstile-sitekey] */
function turnstileSitekey() {
  if (window.__GM_TURNSTILE_SITEKEY) return window.__GM_TURNSTILE_SITEKEY;
  const meta = document.querySelector('meta[name="gm-turnstile-sitekey"]');
  return meta?.content?.trim() || "";
}

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.dataset.kind = kind || "";
}

async function loadTurnstile(sitekey) {
  if (!sitekey || !turnstileSlot) return;
  turnstileSlot.hidden = false;
  await new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  window.turnstile.render(turnstileSlot, {
    sitekey,
    theme: "dark",
  });
}

const sitekey = turnstileSitekey();
if (sitekey) {
  loadTurnstile(sitekey).catch(() => setStatus("Turnstile failed to load.", "err"));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");
  submitBtn.disabled = true;

  const fd = new FormData(form);
  let turnstileToken = "";
  if (sitekey && window.turnstile) {
    turnstileToken = window.turnstile.getResponse?.() || "";
    if (!turnstileToken) {
      setStatus("Complete the bot check first.", "err");
      submitBtn.disabled = false;
      return;
    }
  }

  const payload = {
    probeUrl: String(fd.get("probeUrl") || "").trim(),
    obituary: String(fd.get("obituary") || "").trim(),
    note: String(fd.get("note") || "").trim(),
    contact: String(fd.get("contact") || "").trim(),
    company: String(fd.get("company") || "").trim(),
    website: String(fd.get("website") || "").trim(),
    startedAt: Number(fd.get("startedAt") || 0),
    turnstileToken,
  };

  try {
    const res = await fetch("/api/nominate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setStatus(data.error || "Could not submit. Try again.", "err");
      submitBtn.disabled = false;
      return;
    }
    form.reset();
    startedAt.value = String(Date.now());
    if (sitekey && window.turnstile) window.turnstile.reset();
    setStatus(data.message || "Received. A curator will probe before anything hangs.", "ok");
    submitBtn.disabled = false;
  } catch {
    setStatus("Network error — is the museum demo server running?", "err");
    submitBtn.disabled = false;
  }
});
