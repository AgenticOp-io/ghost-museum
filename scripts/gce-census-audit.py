import json
from collections import Counter

GHOST = {"still-answering", "auth-ghost", "successor-facade"}


def auth(src):
    s = str(src or "")
    return s.startswith("seeds/") or s in ("probe-hints", "extra-hints", "nominate", "hints")


w = json.load(open("/var/www/ghost-museum/hunt/watchlist.json"))["watchlist"]
ex = json.load(open("/var/www/ghost-museum/site/exhibits.json"))["exhibits"]
hung = {e["id"] for e in ex}

latest = {}
with open("/var/www/ghost-museum/hunt/findings.jsonl") as f:
    for line in f:
        try:
            o = json.loads(line)
        except Exception:
            continue
        i = o.get("id")
        if not i:
            continue
        t = o.get("huntedAt") or ""
        if i not in latest or t > latest[i].get("huntedAt", ""):
            latest[i] = o

ids = set(hung)
auth_n = deep_n = 0
ver_auth = ver_deep = 0
eligible_deep = []
for row in w:
    i = row["id"]
    if auth(row.get("source")):
        auth_n += 1
        ids.add(i)
    else:
        deep_n += 1
    f = latest.get(i)
    if not f or f.get("probeError"):
        continue
    wall = f.get("suggestedWall")
    if wall not in GHOST:
        continue
    if auth(row.get("source")):
        ver_auth += 1
    else:
        ver_deep += 1
        if i not in ids:
            eligible_deep.append((i, wall, f.get("httpStatus"), row.get("probeUrl")))
            ids.add(i)

print("watch", len(w), "auth", auth_n, "deep", deep_n)
print("hung", len(hung), "would_total", len(ids), "ver_auth", ver_auth, "ver_deep", ver_deep)
print("new_deep_eligible", len(eligible_deep))
print("sample_new_deep", eligible_deep[:20])

c = Counter()
for row in w:
    if auth(row.get("source")):
        continue
    f = latest.get(row["id"])
    if not f:
        c["no-finding"] += 1
        continue
    if f.get("probeError"):
        c["error"] += 1
        continue
    c[f.get("suggestedWall") or "none"] += 1
print("deep_latest_walls:")
for k, v in c.most_common(12):
    print(v, k)
