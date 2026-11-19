#!/usr/bin/env python3
"""Build leaderboard.json from the OpenSmash lobby servers. Standard library only.

Every public lobby serves GET http://<host>:39421/leaderboard.json (plain HTTP). This script fetches all of them,
merges players by their opaque "id" (per fighter the highest GSP seen on any lobby; name/discord/avatar from any lobby
that has them; the avatar only as a Discord CDN URL), recomputes the global positions and writes leaderboard.json at the repository root.

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
    # v0.5.0: the official lobbies (relay only, signed-in players; run by SSBU Arena)
    "http://eu.lobby.opensmashultimate.com:39421/leaderboard.json",
    "http://na.lobby.opensmashultimate.com:39421/leaderboard.json",
    # v0.4.x players, until they update
    "http://opensmash-lobby.duckdns.org:39421/leaderboard.json",
]
STATUS_KEYS = ("online", "rooms", "arenas", "open_rooms", "playing")
MATCH_MODES = ("quickplay", "arena", "room")
_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
# DATA_DIR: where the snapshots are written (the workflow checks the `data` branch out there). Default: repo root.
_DATA = os.environ.get("DATA_DIR") or _ROOT
# HEARTBEAT_S: rewrite an unchanged file when its "updated" is older than this, so the page can show a fresh age.
# 0 (default) = never rewrite unchanged data.
HEARTBEAT_S = int(os.environ.get("HEARTBEAT_S", "0") or 0)
STATUS_PATH = os.path.join(_DATA, "status.json")
TIMEOUT_S = 20
MAX_PLAYERS = 10000
TOP_PER_FIGHTER = 100
OUT_PATH = os.path.join(_DATA, "leaderboard.json")
ID_RE = re.compile(r"^[0-9a-f]{16}$")
# A Discord profile picture as the lobby gives it (tools/nex/board.py): uploaded, or Discord's default one.
AVATAR_RE = re.compile(r"^https://cdn\.discordapp\.com/(avatars/[0-9]{1,32}/(a_)?[0-9a-f]{32}\.png\?size=64|embed/avatars/[0-5]\.png)$")

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
            m = merged.setdefault(pid, {"gsp": {}, "name": None, "discord": None, "avatar": None})
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
            av = p.get("avatar")
            if isinstance(av, str) and AVATAR_RE.match(av) and not m["avatar"]:
                m["avatar"] = av
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
            if by_id[pid]["avatar"]:
                row["avatar"] = by_id[pid]["avatar"]
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
        if m["avatar"]:
            p["avatar"] = m["avatar"]
        players.append(p)
    return {"updated": now_iso, "ranked": len(players), "players": players, "fighters": tables}


def same_data(a, b):
    strip = lambda d: {k: v for k, v in (d or {}).items() if k != "updated"}  # noqa: E731
    if strip(a) != strip(b):
        return False
    if HEARTBEAT_S > 0:  # unchanged, but old enough that the page would show a stale age: count it as changed
        try:
            t0 = datetime.strptime(a["updated"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            t1 = datetime.strptime(b["updated"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            return (t1 - t0).total_seconds() < HEARTBEAT_S
        except (TypeError, KeyError, ValueError):
            return False
    return True


def status_url(url):
    return url.rsplit("/", 1)[0] + "/status.json"


def build_status(docs, ranked, now_iso):
    """Sum the lobbies' aggregate counts. docs: parsed /status.json documents (counts only)."""
    out = {"updated": now_iso, "up": True}
    for k in STATUS_KEYS:
        out[k] = sum(n for n in (_int(d.get(k)) for d in docs if isinstance(d, dict)) if n is not None)
    out["ranked"] = ranked
    # (online matches played, from lobbies that count them: tools/nex/matches.py; left out until one does)
    played = [d["matches"] for d in docs if isinstance(d, dict) and isinstance(d.get("matches"), dict)
              and _int(d["matches"].get("total")) is not None]
    if played:
        out["matches"] = {"total": sum(_int(m.get("total")) for m in played),
                          "today": sum(_int(m.get("today")) or 0 for m in played),
                          "by_mode": {k: sum(_int((m.get("by_mode") or {}).get(k)) or 0 for m in played if isinstance(m.get("by_mode"), dict))
                                      for k in MATCH_MODES}}
    return out


def write_if_changed(path, new):
    old = None
    try:
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        pass
    if same_data(old, new):
        return False
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(new, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    return True


def run_status(urls, ranked, status_path, fetcher, board_up):
    """status.json: live counts. A lobby without /status.json yet is skipped (the file is left alone); when no lobby
    answers at all the file says {"up": false}."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    docs = [d for d in (fetcher(status_url(u)) for u in urls) if d is not None]
    if docs:
        new = build_status(docs, ranked, now)
    elif not board_up:
        new = {"updated": now, "up": False}
    else:
        log("no lobby serves /status.json yet: leaving status.json alone")
        return
    log("status.json %s" % ("written" if write_if_changed(status_path, new) else "unchanged"))


def run(urls, out_path=OUT_PATH, fetcher=fetch, status_path=STATUS_PATH):
    docs = [d for d in (fetcher(u) for u in urls) if d is not None]
    if status_path:
        ranked = sum(_int(d.get("ranked")) or 0 for d in docs if isinstance(d, dict))
        run_status(urls, ranked, status_path, fetcher, bool(docs))
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
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(new, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    log("wrote %d players from %d lobbies" % (new["ranked"], len(docs)))
    return 0


def selftest():
    import tempfile
    a = {"updated": "x", "ranked": 2, "players": [
        {"id": "3f9a0c1d2e4b5a69", "rank": 1, "gsp": 2000, "fighter": 43, "fighters": {"43": {"gsp": 2000, "rank": 1}},
         "name": "Nelly", "discord": "ab12cd34ef56ab78", "avatar": "https://cdn.discordapp.com/embed/avatars/3.png"},
        {"id": "77aa000000000001", "rank": 2, "gsp": 1500, "fighter": 43,
         "fighters": {"0": {"gsp": 900, "rank": 1}, "43": {"gsp": 1500, "rank": 2}}}]}
    b = {"players": [
        {"id": "77aa000000000001", "gsp": 1700, "fighter": 0, "fighters": {"0": {"gsp": 1700, "rank": 1}},
         "name": "<b>Bob</b>", "discord": "1111222233334444", "avatar": "javascript:alert(1)"},
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
    assert n["avatar"] == "https://cdn.discordapp.com/embed/avatars/3.png" and "avatar" not in bob, "only Discord CDN avatars"
    assert AVATAR_RE.match("https://cdn.discordapp.com/avatars/175928847299117063/a_" + "0" * 32 + ".png?size=64")
    assert not AVATAR_RE.match("https://cdn.discordapp.com.evil.example/embed/avatars/1.png")
    assert out["fighters"]["43"]["top"][0] == {"rank": 1, "gsp": 2000, "id": n["id"], "name": "Nelly",
                                               "avatar": "https://cdn.discordapp.com/embed/avatars/3.png"}
    assert out["fighters"]["0"]["name"] == "Mario"
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "lb.json")
        empty = {"updated": None, "ranked": 0, "players": [], "fighters": {}}
        with open(path, "w") as f:
            json.dump(empty, f)
        assert run(["http://c/l.json"], path, fetcher, None) == 0
        with open(path) as f:
            assert json.load(f) == empty, "must not change when no lobby answers"
        assert run(urls, path, fetcher, None) == 0
        with open(path) as f:
            first_text = f.read()
        first = json.loads(first_text)
        assert first["ranked"] == 2 and first["updated"]
        assert run(urls, path, fetcher, None) == 0
        with open(path) as f:
            assert f.read() == first_text, "unchanged data must not rewrite"
        spath = os.path.join(d, "status.json")
        st = {"http://a/status.json": {"online": 3, "rooms": 2, "arenas": 1, "open_rooms": 1, "playing": 2, "x": 1}}
        sf = lambda u: st.get(u) or docs.get(u)  # noqa: E731
        assert run(["http://a/l.json"], os.path.join(d, "l2.json"), sf, spath) == 0
        with open(spath) as f:
            got = json.load(f)
        assert got["up"] is True and got["online"] == 3 and got["rooms"] == 2 and got["ranked"] == 2 and "x" not in got, got
        assert "matches" not in got, "no count from a lobby that has none"
        # a lobby that does not serve /status.json yet: file left alone
        assert run(["http://b/l.json"], os.path.join(d, "l3.json"), fetcher, spath) == 0
        with open(spath) as f:
            assert json.load(f)["online"] == 3
        # nothing answers: marked down
        assert run(["http://c/l.json"], os.path.join(d, "l4.json"), fetcher, spath) == 0
        with open(spath) as f:
            assert json.load(f)["up"] is False
    global HEARTBEAT_S
    HEARTBEAT_S = 600
    m = build_status([{"online": 1, "matches": {"total": 120, "today": 7, "by_mode": {"quickplay": 100, "arena": 15, "room": 5},
                                                "estimated": 40, "since": "2026-11-18"}},
                      {"online": 2, "matches": {"total": "x"}}, {"online": 0}], 0, "t")
    assert m["matches"] == {"total": 120, "today": 7, "by_mode": {"quickplay": 100, "arena": 15, "room": 5}}, m
    assert same_data({"a": 1, "updated": "2026-01-01T00:00:00Z"}, {"a": 1, "updated": "2026-01-01T00:05:00Z"})
    assert not same_data({"a": 1, "updated": "2026-01-01T00:00:00Z"}, {"a": 1, "updated": "2026-01-01T00:11:00Z"})
    assert not same_data({"a": 1, "updated": "2026-01-01T00:00:00Z"}, {"a": 2, "updated": "2026-01-01T00:00:01Z"})
    HEARTBEAT_S = 0
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
