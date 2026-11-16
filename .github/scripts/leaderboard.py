#!/usr/bin/env python3
"""Build leaderboard.json from the OpenSmash lobby servers. Standard library only.

Every public lobby serves GET http://<host>:39421/leaderboard.json (plain HTTP). This script fetches all of them,
merges players by their opaque "id" (per fighter the highest GSP seen on any lobby; name/discord from any lobby that
has them), recomputes the global positions and writes leaderboard.json at the repository root.

Lobbies: LOBBIES below, or the LOBBIES environment variable (comma-separated URLs).
If no lobby answers, the script exits 0 and leaves the file alone. The file is only rewritten when the data changed
(ignoring "updated"), so the workflow commits only real changes.
Offline test: python .github/scripts/leaderboard.py --selftest
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

LOBBIES = [
    "http://smash.recomps.wtf:39421/leaderboard.json",
    "http://opensmash-lobby.duckdns.org:39421/leaderboard.json",
]
TIMEOUT_S = 20
MAX_PLAYERS = 10000
TOP_PER_FIGHTER = 100
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "leaderboard.json")
ID_RE = re.compile(r"^[0-9a-f]{16}$")

FIGHTERS = {
    0: "Mario", 1: "Donkey Kong", 2: "Link", 3: "Samus", 4: "Dark Samus", 5: "Yoshi", 6: "Kirby", 7: "Fox",
    8: "Pikachu", 9: "Luigi", 10: "Ness", 11: "Captain Falcon", 12: "Jigglypuff", 13: "Peach", 14: "Daisy",
    15: "Bowser", 16: "Sheik", 17: "Zelda", 18: "Dr. Mario", 19: "Pichu", 20: "Falco", 21: "Marth", 22: "Lucina",
    23: "Young Link", 24: "Ganondorf", 25: "Mewtwo", 26: "Roy", 27: "Chrom", 28: "Mr. Game & Watch",
    29: "Meta Knight", 30: "Pit", 31: "Dark Pit", 32: "Zero Suit Samus", 33: "Wario", 34: "Snake", 35: "Ike",
    36: "Squirtle", 37: "Ivysaur", 38: "Charizard", 39: "Diddy Kong", 40: "Lucas", 41: "Sonic", 42: "King Dedede",
    43: "Olimar", 44: "Lucario", 45: "R.O.B.", 46: "Toon Link", 47: "Wolf", 48: "Villager", 49: "Mega Man",
    50: "Wii Fit Trainer", 51: "Rosalina & Luma", 52: "Little Mac", 53: "Greninja", 54: "Palutena", 55: "Pac-Man",
    56: "Robin", 57: "Shulk", 58: "Bowser Jr.", 59: "Duck Hunt", 60: "Ryu", 61: "Ken", 62: "Cloud", 63: "Corrin",
    64: "Bayonetta", 65: "Inkling", 66: "Ridley", 67: "Simon", 68: "Richter", 69: "King K. Rool", 70: "Isabelle",
    71: "Incineroar", 72: "Mii Brawler", 73: "Mii Swordfighter", 74: "Mii Gunner", 75: "Ice Climbers",
    81: "Piranha Plant", 82: "Joker", 83: "Hero", 84: "Banjo & Kazooie", 85: "Terry", 86: "Byleth", 87: "Min Min",
    88: "Steve", 89: "Sephiroth", 90: "Pyra", 91: "Mythra", 92: "Kazuya", 93: "Sora", 114: "Pokemon Trainer",
}


def log(msg):
    print(msg, flush=True)


def fetch(url):
    """Returns the parsed JSON of one lobby, or None on any failure (not deployed yet, down, 404, bad JSON)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "opensmash-site-leaderboard"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            return json.loads(r.read(20_000_000).decode("utf-8"))
    except Exception as e:  # noqa: BLE001 - every failure just means "skip this lobby"
        log("lobby %s: unavailable (%s)" % (url, type(e).__name__))
        return None


def _int(v):
    try:
        if isinstance(v, bool):
            return None
        n = int(v)
        return n if n >= 0 else None
    except (TypeError, ValueError):
        return None


def merge(lobbies):
    """lobbies: parsed lobby documents. Returns {id: {"gsp": {kind: gsp}, "name", "discord"}}."""
    merged = {}
    for doc in lobbies:
        if not isinstance(doc, dict) or not isinstance(doc.get("players"), list):
            continue
        for p in doc["players"]:
            if not isinstance(p, dict):
                continue
            pid = str(p.get("id", "")).lower()
            if not ID_RE.match(pid):
                continue
            m = merged.setdefault(pid, {"gsp": {}, "name": None, "discord": None})
            per = {}
            if isinstance(p.get("fighters"), dict):
                for k, v in p["fighters"].items():
                    kind, gsp = _int(k), _int(v.get("gsp") if isinstance(v, dict) else None)
                    if kind is not None and gsp is not None:
                        per[kind] = gsp
            kind, gsp = _int(p.get("fighter")), _int(p.get("gsp"))
            if kind is not None and gsp is not None:
                per[kind] = max(per.get(kind, 0), gsp)
            for kind, gsp in per.items():
                if gsp > m["gsp"].get(kind, -1):
                    m["gsp"][kind] = gsp
            name = p.get("name")
            if isinstance(name, str) and name.strip() and not m["name"]:
                m["name"] = name.strip()[:64]
            d = p.get("discord")
            if isinstance(d, str) and ID_RE.match(d.lower()) and not m["discord"]:
                m["discord"] = d.lower()
    return {k: v for k, v in merged.items() if v["gsp"]}


def build(merged, now_iso):
    rows = []
    for pid, m in merged.items():
        kind, gsp = sorted(m["gsp"].items(), key=lambda kv: (-kv[1], kv[0]))[0]
        rows.append((pid, m, kind, gsp))
    rows.sort(key=lambda r: (-r[3], r[0]))
    rows = rows[:MAX_PLAYERS]

    per_fighter = {}  # kind -> [(gsp, id)]
    for pid, m, _, _ in rows:
        for kind, gsp in m["gsp"].items():
            per_fighter.setdefault(kind, []).append((gsp, pid))
    fighter_rank = {}
    for kind, lst in per_fighter.items():
        lst.sort(key=lambda t: (-t[0], t[1]))
        for pos, (_, pid) in enumerate(lst, 1):
            fighter_rank[(kind, pid)] = pos
    by_id = {r[0]: r[1] for r in rows}
    tables = {}
    for kind in sorted(per_fighter):
        top = []
        for pos, (gsp, pid) in enumerate(per_fighter[kind][:TOP_PER_FIGHTER], 1):
            row = {"rank": pos, "gsp": gsp, "id": pid}
            if by_id[pid]["name"]:
                row["name"] = by_id[pid]["name"]
            top.append(row)
        tables[str(kind)] = {"name": FIGHTERS.get(kind, "Fighter %d" % kind), "top": top}

    players = []
    for pos, (pid, m, kind, gsp) in enumerate(rows, 1):
        p = {"id": pid, "rank": pos, "gsp": gsp, "fighter": kind,
             "fighters": {str(k): {"gsp": g, "rank": fighter_rank[(k, pid)]} for k, g in sorted(m["gsp"].items())}}
        if m["name"]:
            p["name"] = m["name"]
        if m["discord"]:
            p["discord"] = m["discord"]
        players.append(p)
    return {"updated": now_iso, "ranked": len(players), "players": players, "fighters": tables}


def same_data(a, b):
    strip = lambda d: {k: v for k, v in (d or {}).items() if k != "updated"}  # noqa: E731
    return strip(a) == strip(b)


def run(urls, out_path=OUT_PATH, fetcher=fetch):
    docs = [d for d in (fetcher(u) for u in urls) if d is not None]
    if not docs:
        log("no lobby answered: leaving leaderboard.json alone")
        return 0
    new = build(merge(docs), datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    old = None
    try:
        with open(out_path, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        pass
    if same_data(old, new):
        log("data unchanged (%d players): not rewriting" % new["ranked"])
        return 0
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(new, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    log("wrote %d players from %d lobbies" % (new["ranked"], len(docs)))
    return 0


def selftest():
    import tempfile
    a = {"updated": "x", "ranked": 2, "players": [
        {"id": "3f9a0c1d2e4b5a69", "rank": 1, "gsp": 2000, "fighter": 43, "fighters": {"43": {"gsp": 2000, "rank": 1}},
         "name": "Nelly", "discord": "ab12cd34ef56ab78"},
        {"id": "77aa000000000001", "rank": 2, "gsp": 1500, "fighter": 43,
         "fighters": {"0": {"gsp": 900, "rank": 1}, "43": {"gsp": 1500, "rank": 2}}}]}
    b = {"players": [
        {"id": "77aa000000000001", "gsp": 1700, "fighter": 0, "fighters": {"0": {"gsp": 1700, "rank": 1}},
         "name": "<b>Bob</b>", "discord": "1111222233334444"},
        {"id": "3f9a0c1d2e4b5a69", "gsp": 1800, "fighter": 43, "fighters": {"43": {"gsp": 1800, "rank": 2}}},
        {"id": "zz", "gsp": 5, "fighter": 1}]}
    docs = {"http://a/l.json": a, "http://b/l.json": b}
    fetcher = lambda u: docs.get(u)  # noqa: E731 - "http://c/l.json" is a missing lobby
    urls = ["http://a/l.json", "http://c/l.json", "http://b/l.json"]
    out = build(merge([a, b]), "T")
    ps = {p["id"]: p for p in out["players"]}
    n, bob = ps["3f9a0c1d2e4b5a69"], ps["77aa000000000001"]
    assert out["ranked"] == 2 and len(ps) == 2, out
    assert n["rank"] == 1 and n["gsp"] == 2000 and n["name"] == "Nelly" and n["discord"] == "ab12cd34ef56ab78"
    assert bob["rank"] == 2 and bob["gsp"] == 1700 and bob["fighter"] == 0 and bob["name"] == "<b>Bob</b>"
    assert bob["fighters"] == {"0": {"gsp": 1700, "rank": 1}, "43": {"gsp": 1500, "rank": 2}}, bob
    assert out["fighters"]["43"]["top"][0] == {"rank": 1, "gsp": 2000, "id": n["id"], "name": "Nelly"}
    assert out["fighters"]["0"]["name"] == "Mario"
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "lb.json")
        empty = {"updated": None, "ranked": 0, "players": [], "fighters": {}}
        with open(path, "w") as f:
            json.dump(empty, f)
        assert run(["http://c/l.json"], path, fetcher) == 0
        with open(path) as f:
            assert json.load(f) == empty, "must not change when no lobby answers"
        assert run(urls, path, fetcher) == 0
        with open(path) as f:
            first_text = f.read()
        first = json.loads(first_text)
        assert first["ranked"] == 2 and first["updated"]
        assert run(urls, path, fetcher) == 0
        with open(path) as f:
            assert f.read() == first_text, "unchanged data must not rewrite"
    log("selftest ok")
    return 0


def main():
    if "--selftest" in sys.argv[1:]:
        return selftest()
    env = os.environ.get("LOBBIES", "").strip()
    urls = [u.strip() for u in env.split(",") if u.strip()] if env else LOBBIES
    return run(urls)


if __name__ == "__main__":
    sys.exit(main())
