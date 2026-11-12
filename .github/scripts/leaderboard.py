#!/usr/bin/env python3
"""Build leaderboard.json from Epic Online Services (EOS) Web APIs. Standard library only.

Environment: EOS_CLIENT_ID, EOS_CLIENT_SECRET, EOS_DEPLOYMENT_ID (repository secrets).
Without them the script prints a note and exits 0 without touching anything.
Offline test: python .github/scripts/leaderboard.py --selftest

EOS Web API references (https://dev.epicgames.com/docs/web-api-ref). The reference pages are a script-rendered
site that could not be fetched while writing this, so the paths below follow Epic's documented scheme as mirrored in
the public OpenAPI listings at https://apis.io/apis/epic-games/ (leaderboards, stats, connect); every call that
has more than one plausible path tries them in order, and response parsing tolerates field-name variants.
  - token:        POST /auth/v1/oauth/token (HTTP Basic client id:secret, grant_type=client_credentials,
                  deployment_id=<id>)
  - leaderboard:  GET /leaderboards/v1/{deployment}/leaderboard/{id}/ranks?limit=N  (alt: .../leaderboards/{id}/ranks)
  - stats:        GET /stats/v1/{deployment}/users/{puid}/stats
  - connect:      GET /user/v1/{deployment}/accounts?productUserId={puid}   (alt: /connect/v1/{deployment}/users?...)
Nothing secret is ever printed or written to leaderboard.json.
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

API = "https://api.epicgames.dev"
LEADERBOARD_ID = "GSP_TOP"
MAX_PLAYERS = 1000
TOP_PER_FIGHTER = 100
MAX_NEW_IDENTITY_LOOKUPS = 300
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "leaderboard.json")

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


# ---------------------------------------------------------------- HTTP (replaceable in tests)
def http_request(method, url, headers=None, data=None, retries=3):
    """Returns (status, parsed_json_or_None). Never logs headers (they carry the token)."""
    body = None
    hdrs = dict(headers or {})
    if data is not None:
        body = urllib.parse.urlencode(data).encode()
        hdrs.setdefault("Content-Type", "application/x-www-form-urlencoded")
    for attempt in range(retries):
        req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt + 1 < retries:
                time.sleep(2 * (attempt + 1))
                continue
            try:
                payload = json.loads(e.read() or b"null")
            except Exception:
                payload = None
            return e.code, payload
        except (urllib.error.URLError, TimeoutError):
            if attempt + 1 < retries:
                time.sleep(2 * (attempt + 1))
                continue
            raise
    return 0, None


HTTP = http_request


# ---------------------------------------------------------------- EOS calls
def get_token(client_id, client_secret, deployment_id):
    basic = base64.b64encode(("%s:%s" % (client_id, client_secret)).encode()).decode()
    status, js = HTTP("POST", API + "/auth/v1/oauth/token",
                      {"Authorization": "Basic " + basic, "Accept": "application/json"},
                      {"grant_type": "client_credentials", "deployment_id": deployment_id})
    if status != 200 or not isinstance(js, dict) or not js.get("access_token"):
        raise RuntimeError("EOS token request failed (HTTP %s)" % status)
    return js["access_token"]


def _auth(token):
    return {"Authorization": "Bearer " + token, "Accept": "application/json"}


def _first(d, keys):
    for k in keys:
        if isinstance(d, dict) and d.get(k) is not None:
            return d[k]
    return None


def _num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def parse_leaderboard(js):
    """Tolerant: a list, or a dict holding the list under records/ranks/entries/....
    Each item: puid under productUserId/userId/puid, score under score/value/stat, optional rank."""
    items = js
    if isinstance(js, dict):
        items = _first(js, ["records", "ranks", "entries", "leaderboard", "results", "data"]) or []
    out = []
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        puid = _first(it, ["productUserId", "userId", "puid", "user_id", "id"])
        score = _num(_first(it, ["score", "value", "stat", "statValue"]))
        if not puid or score is None:
            continue
        out.append({"puid": str(puid), "score": score})
    return out


def read_leaderboard(token, deployment, lb_id=LEADERBOARD_ID, limit=MAX_PLAYERS):
    paths = ["/leaderboards/v1/%s/leaderboard/%s/ranks" % (deployment, lb_id),
             "/leaderboards/v1/%s/leaderboards/%s/ranks" % (deployment, lb_id)]
    last = None
    for p in paths:
        status, js = HTTP("GET", API + p + "?" + urllib.parse.urlencode({"limit": limit}), _auth(token))
        last = status
        if status == 200:
            return parse_leaderboard(js)
    raise RuntimeError("EOS leaderboard read failed (HTTP %s)" % last)


def parse_stats(js):
    """-> {stat name: int value}. Accepts a list or {"stats": [...]} of {name, value}."""
    items = js
    if isinstance(js, dict):
        items = _first(js, ["stats", "data", "results"]) or []
    out = {}
    for it in items if isinstance(items, list) else []:
        if isinstance(it, dict) and it.get("name") is not None:
            v = _num(_first(it, ["value", "score"]))
            if v is not None:
                out[str(it["name"])] = v
    return out


def keep_gsp_stats(stats):
    out = {}
    for name, v in stats.items():
        if name == "GSP_TOP":
            out["top"] = v
        elif name.startswith("GSP_F") and name[5:].isdigit():
            out[int(name[5:])] = v
    return out


def read_user_stats(token, deployment, puid):
    status, js = HTTP("GET", API + "/stats/v1/%s/users/%s/stats" % (deployment, urllib.parse.quote(puid)),
                      _auth(token))
    if status != 200:
        return None
    return keep_gsp_stats(parse_stats(js))


def parse_identities(js):
    """Walk any JSON for objects with identityProviderId/accountId[/displayName]. -> list of dicts."""
    found = []

    def walk(o):
        if isinstance(o, dict):
            prov = _first(o, ["identityProviderId", "identityProvider", "externalAccountType", "type"])
            acc = _first(o, ["accountId", "externalAccountId", "id"])
            if prov is not None and acc is not None:
                found.append({"provider": str(prov).lower(), "id": str(acc),
                              "name": _first(o, ["displayName", "username", "name"])})
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(js)
    return found


def read_identity(token, deployment, puid):
    """-> {"discord_id": str|None, "name": str|None}. None when no endpoint answered."""
    q = urllib.parse.urlencode({"productUserId": puid})
    for p in ["/user/v1/%s/accounts?%s" % (deployment, q), "/connect/v1/%s/users?%s" % (deployment, q)]:
        status, js = HTTP("GET", API + p, _auth(token))
        if status == 200 and js is not None:
            ids = parse_identities(js)
            disc = next((i for i in ids if i["provider"] == "discord"), None)
            name = (disc or {}).get("name") or next((i["name"] for i in ids if i.get("name")), None)
            return {"discord_id": disc["id"] if disc else None, "name": name}
    return None


# ---------------------------------------------------------------- assembling
def build(entries, stats_by_puid, ident_by_puid, now_iso):
    """entries: parsed leaderboard. stats_by_puid: {puid: {"top": n, fighter_kind: n}}.
    ident_by_puid: {puid: {"discord_id", "name"}}. Returns the leaderboard.json dict."""
    entries = sorted(entries, key=lambda e: (-e["score"], e["puid"]))
    players = []
    for i, e in enumerate(entries):
        puid = e["puid"]
        ident = ident_by_puid.get(puid) or {}
        st = stats_by_puid.get(puid) or {}
        fighters = {k: v for k, v in st.items() if k != "top" and v > 0}
        best = max(fighters, key=lambda k: (fighters[k], -k)) if fighters else None
        players.append({
            "rank": i + 1,
            "puid": puid,
            "discord_id": ident.get("discord_id"),
            "name": ident.get("name") or "Player " + puid[:6],
            "gsp": e["score"],
            "best_fighter": best,
            "_f": fighters,
        })
    fighter_tables = {}
    kinds = sorted({k for p in players for k in p["_f"]})
    for kind in kinds:
        rows = sorted(((p["_f"][kind], p["puid"], p) for p in players if kind in p["_f"]),
                      key=lambda t: (-t[0], t[1]))
        top = []
        for pos, (gsp, puid, p) in enumerate(rows, 1):
            p.setdefault("fighters", {})[str(kind)] = {"gsp": gsp, "rank": pos}
            if pos <= TOP_PER_FIGHTER:
                top.append({"rank": pos, "puid": puid, "discord_id": p["discord_id"], "name": p["name"], "gsp": gsp})
        fighter_tables[str(kind)] = {"name": FIGHTERS.get(kind, "Fighter %d" % kind), "top": top}
    for p in players:
        p.pop("_f")
        p.setdefault("fighters", {})
    return {"updated": now_iso, "players": players, "fighters": fighter_tables}


def same_data(a, b):
    strip = lambda d: {k: v for k, v in (d or {}).items() if k != "updated"}
    return strip(a) == strip(b)


def run(client_id, client_secret, deployment, out_path=OUT_PATH):
    token = get_token(client_id, client_secret, deployment)
    entries = read_leaderboard(token, deployment)
    log("leaderboard: %d entries" % len(entries))
    try:
        with open(out_path, encoding="utf-8") as f:
            previous = json.load(f)
    except (OSError, ValueError):
        previous = {}
    cache = {p["puid"]: {"discord_id": p.get("discord_id"), "name": p.get("name")}
             for p in previous.get("players", []) if isinstance(p, dict) and p.get("puid")}
    puids = [e["puid"] for e in entries]
    with ThreadPoolExecutor(max_workers=8) as ex:
        stats = dict(zip(puids, ex.map(lambda p: read_user_stats(token, deployment, p), puids)))
        # Known Discord links are reused; only unknown players are looked up (capped per run).
        todo = [p for p in puids if not (cache.get(p) or {}).get("discord_id")][:MAX_NEW_IDENTITY_LOOKUPS]
        looked = dict(zip(todo, ex.map(lambda p: read_identity(token, deployment, p), todo)))
    idents = {}
    for p in puids:
        idents[p] = looked.get(p) or cache.get(p) or {}
    # A player whose stats could not be read keeps no fighter table; the leaderboard score still ranks them.
    stats = {p: s for p, s in stats.items() if s is not None}
    out = build(entries, stats, idents, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    if same_data(out, previous) and previous.get("updated"):
        out["updated"] = previous["updated"]
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    log("wrote leaderboard.json: %d players, %d fighters" % (len(out["players"]), len(out["fighters"])))


# ---------------------------------------------------------------- self test
def selftest():
    import tempfile
    calls = []

    def fake(method, url, headers=None, data=None, retries=3):
        calls.append((method, url))
        p = urllib.parse.urlparse(url)
        if p.path == "/auth/v1/oauth/token":
            assert headers["Authorization"].startswith("Basic ")
            assert data == {"grant_type": "client_credentials", "deployment_id": "dep"}
            return 200, {"access_token": "T"}
        assert headers["Authorization"] == "Bearer T"
        if p.path == "/leaderboards/v1/dep/leaderboard/GSP_TOP/ranks":
            return 404, None  # exercises the alternative path
        if p.path == "/leaderboards/v1/dep/leaderboards/GSP_TOP/ranks":
            return 200, {"records": [{"userId": "p2", "score": 900}, {"userId": "p1", "score": 1500},
                                     {"userId": "p3", "score": 900}]}
        if p.path.startswith("/stats/v1/dep/users/"):
            puid = p.path.split("/")[5]
            table = {"p1": [("GSP_TOP", 1500), ("GSP_F43", 1500), ("GSP_F7", 700), ("OTHER", 5)],
                     "p2": [("GSP_TOP", 900), ("GSP_F43", 900)],
                     "p3": [("GSP_TOP", 900), ("GSP_F7", 900), ("GSP_F43", 0)]}[puid]
            return 200, {"stats": [{"name": n, "value": v} for n, v in table]}
        if p.path == "/user/v1/dep/accounts":
            puid = urllib.parse.parse_qs(p.query)["productUserId"][0]
            if puid == "p1":
                return 200, {"externalAccounts": [{"identityProviderId": "discord", "accountId": "111",
                                                   "displayName": "Alice"}]}
            if puid == "p2":
                return 200, {"externalAccounts": [{"identityProviderId": "epic", "accountId": "x",
                                                   "displayName": "Bob"}]}
            return 404, None
        return 404, None

    global HTTP
    saved, HTTP = HTTP, fake
    try:
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "leaderboard.json")
            run("id", "secret", "dep", path)
            with open(path, encoding="utf-8") as f:
                out = json.load(f)
            assert "secret" not in json.dumps(out)
            pl = {p["puid"]: p for p in out["players"]}
            assert [p["puid"] for p in out["players"]] == ["p1", "p2", "p3"], out["players"]
            assert pl["p1"]["rank"] == 1 and pl["p1"]["discord_id"] == "111" and pl["p1"]["name"] == "Alice"
            assert pl["p1"]["best_fighter"] == 43 and pl["p1"]["fighters"]["7"] == {"gsp": 700, "rank": 2}
            assert pl["p2"]["discord_id"] is None and pl["p2"]["name"] == "Bob"
            assert pl["p3"]["name"].startswith("Player ") and pl["p3"]["best_fighter"] == 7
            assert "43" not in pl["p3"]["fighters"]
            assert out["fighters"]["43"]["name"] == "Olimar"
            assert [r["puid"] for r in out["fighters"]["43"]["top"]] == ["p1", "p2"]
            assert [r["puid"] for r in out["fighters"]["7"]["top"]] == ["p3", "p1"]
            # a second run with the same data keeps "updated" (so the workflow does not commit)
            first = out["updated"]
            time.sleep(1.1)
            run("id", "secret", "dep", path)
            with open(path, encoding="utf-8") as f:
                assert json.load(f)["updated"] == first
    finally:
        HTTP = saved
    log("selftest ok (%d fake requests)" % len(calls))


def main():
    if "--selftest" in sys.argv:
        selftest()
        return 0
    cid, sec, dep = (os.environ.get(k, "").strip() for k in ("EOS_CLIENT_ID", "EOS_CLIENT_SECRET", "EOS_DEPLOYMENT_ID"))
    if not (cid and sec and dep):
        log("EOS_CLIENT_ID / EOS_CLIENT_SECRET / EOS_DEPLOYMENT_ID not set: nothing to do.")
        return 0
    try:
        run(cid, sec, dep)
    except Exception as e:  # message only: no headers, no secrets
        log("leaderboard update failed: %s" % e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
