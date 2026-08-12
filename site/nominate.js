const form = document.getElementById("nominate-form");
const statusEl = document.getElementById("form-status");
const submitBtn = document.getElementById("submit-btn");
const startedAt = document.getElementById("startedAt");
const turnstileEl = form.querySelector(".cf-turnstile");

startedAt.value = String(Date.now());

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.dataset.kind = kind || "";
}

function readTurnstileToken() {
  const input = form.querySelector('[name="cf-turnstile-response"]');
  if (input?.value) return input.value;
  if (window.turnstile?.getResponse) return window.turnstile.getResponse() || "";
  return "";
}

function resetTurnstile() {
  if (!window.turnstile?.reset || !turnstileEl) return;
  try {
    window.turnstile.reset(turnstileEl);
  } catch {
    window.turnstile.reset();
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");
  submitBtn.disabled = true;

  const fd = new FormData(form);
  const turnstileToken = readTurnstileToken();
  if (!turnstileToken) {
    setStatus("Complete the bot check first.", "err");
    submitBtn.disabled = false;
    return;
  }

  const payload = {
    probeUrl: String(fd.get("probeUrl") || "").trim(),
    obituary: String(fd.get("obituary") || "").trim(),
    note: String(fd.get("note") || "").trim(),
    contact: String(fd.get("contact") || "").trim(),
    company: String(fd.get("company") || "").trim(),
    website: String(fd.get("website") || "").trim(),
    startedAt: Number(fd.get("startedAt") || 0),
    "cf-turnstile-response": turnstileToken,
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
      resetTurnstile();
      submitBtn.disabled = false;
      return;
    }
    form.reset();
    startedAt.value = String(Date.now());
    resetTurnstile();
    setStatus(data.message || "Received. A curator will probe before anything hangs.", "ok");
    submitBtn.disabled = false;
  } catch {
    setStatus("Network error — is the museum demo server running?", "err");
    resetTurnstile();
    submitBtn.disabled = false;
  }
});
