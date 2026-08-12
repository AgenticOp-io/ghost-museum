const form = document.getElementById("nominate-form");
const statusEl = document.getElementById("form-status");
const submitBtn = document.getElementById("submit-btn");
const startedAt = document.getElementById("startedAt");

startedAt.value = String(Date.now());

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.dataset.kind = kind || "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");
  submitBtn.disabled = true;

  const fd = new FormData(form);
  const payload = {
    probeUrl: String(fd.get("probeUrl") || "").trim(),
    obituary: String(fd.get("obituary") || "").trim(),
    note: String(fd.get("note") || "").trim(),
    contact: String(fd.get("contact") || "").trim(),
    company: String(fd.get("company") || "").trim(),
    website: String(fd.get("website") || "").trim(),
    startedAt: Number(fd.get("startedAt") || 0),
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
    setStatus(data.message || "Received. A curator will probe before anything hangs.", "ok");
    submitBtn.disabled = false;
  } catch {
    setStatus("Network error — is the museum demo server running?", "err");
    submitBtn.disabled = false;
  }
});
