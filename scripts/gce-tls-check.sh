#!/bin/bash
# quick remote TLS check
node -v
node --use-system-ca -e '
(async () => {
  const urls = ["https://www.myspace.com/", "https://myspace.com/", "https://www.facebook.com/paper/"];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: "GET", redirect: "manual", headers: { "user-agent": "GhostMuseum-Hunt/0.1", accept: "*/*" }, signal: AbortSignal.timeout(12000) });
      console.log("OK", res.status, url, res.headers.get("location") || "");
      try { res.body?.cancel(); } catch {}
    } catch (e) {
      console.log("FAIL", url, e.cause?.code || e.cause?.message || e.message);
    }
  }
})();
'
