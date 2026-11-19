#!/usr/bin/env python3
"""Build mastery.json and status.json from the OpenSmash lobby servers. Standard library only.

Mastery points (OPENSMASH_MASTERY_SPEC v1): points per account and per fighter, earned by playing online, that only go
up. Engagement points, not a skill ranking: no levels, no tiers. The competitive ladder is SSBU Arena's ranked.

Every public lobby serves GET http://<host>:39421/mastery.json (plain HTTP):
  {"region", "updated", "fighters": {"<key>": [{"id", "name", "points", "veteran"}, ... top 100]}, "total": [... top 100]}
Each region counts only its own matches, so points are SUMMED over the regions; the one-time veteran bonus is per
(account, fighter) and may be granted by more than one region, so the LARGEST one is kept (never summed).
A player's total = summed points + the veteran of each fighter (see merge() for the overall list).

The GSP leaderboard is frozen: the last leaderboard.json snapshot is copied once to gsp_archive.json (read only, the
site's "GSP archive") and leaderboard.json is no longer rewritten.

Lobbies: LOBBIES below, or the LOBBIES environment variable (comma-separated URLs; any file name at the end is replaced:
".../leaderboard.json" still works). A lobby without /mastery.json (404, down, bad JSON) is skipped. If no lobby answers,
mastery.json is left alone; a region that stops answering keeps its last known
points (mastery_regions.json). Files are only rewritten when the data changed (ignoring "updated"), so the workflow
commits only real changes.
Offline test: python .github/scripts/leaderboard.py --selftest
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

LOBBIES = [
    # the official lobbies, and only them (relay only, signed-in players): Europe and North America East
    "http://eu.lobby.opensmashultimate.com:39421/",
    "http://na.lobby.opensmashultimate.com:39421/",
]
STATUS_KEYS = ("online", "rooms", "arenas", "open_rooms", "playing")
# The region of each official lobby, by host name (its /status.json does not name one; a "region" in it wins). status.json
# lists their counts apart under "regions" for the home page's Total / EU / NA switch; the top-level counts are their sum.
# A lobby of no region (not an official one) is not counted at all.
REGION_OF_HOST = {"eu.lobby.opensmashultimate.com": "eu", "na.lobby.opensmashultimate.com": "na-east"}
MATCH_MODES = ("quickplay", "arena", "room")
_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
# DATA_DIR: where the snapshots are written (the workflow checks the `data` branch out there). Default: repo root.
_DATA = os.environ.get("DATA_DIR") or _ROOT
# HEARTBEAT_S: rewrite an unchanged file when its "updated" is older than this, so the page can show a fresh age.
# 0 (default) = never rewrite unchanged data.
HEARTBEAT_S = int(os.environ.get("HEARTBEAT_S", "0") or 0)
STATUS_PATH = os.path.join(_DATA, "status.json")
MASTERY_PATH = os.path.join(_DATA, "mastery.json")
GSP_PATH = os.path.join(_DATA, "leaderboard.json")
GSP_ARCHIVE_PATH = os.path.join(_DATA, "gsp_archive.json")
# The last /mastery.json of each region (without "updated"): a lobby that is down for a while keeps its last points in the
# sum instead of dropping out of it (points only go up, so old numbers are late, never wrong). Written only on a change.
REGIONS_PATH = os.path.join(_DATA, "mastery_regions.json")
TIMEOUT_S = 20
TOP = 100                 # rows kept in the overall list and in each fighter's list
VETERAN_MAX = 1000        # the one-time veteran bonus of one (account, fighter)
POINTS_MAX = 10 ** 12     # a sanity bound: a bigger number from a lobby is a broken file, not points
# The lobby's opaque id (no account uuid, pid or Discord id) and the fighter key (ui_chara_<key>: "mario", "pzenigame").
ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,64}$")
KEY_RE = re.compile(r"^[a-z0-9_]{2,32}$")
REGION_RE = re.compile(r"^[a-z0-9-]{1,16}$")
# A Discord profile picture (only if a lobby ever lists one): uploaded, or Discord's default one.
AVATAR_RE = re.compile(r"^https://cdn\.discordapp\.com/(avatars/[0-9]{1,32}/(a_)?[0-9a-f]{32}\.png\?size=64|embed/avatars/[0-5]\.png)$")


def log(msg):
    print(msg, flush=True)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(url):
    """Returns the parsed JSON of one lobby file, or None on any failure (not deployed yet, down, 404, bad JSON)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "opensmash-site-snapshot"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            return json.loads(r.read(20_000_000).decode("utf-8"))
    except Exception as e:  # noqa: BLE001 - every failure just means "skip this lobby"
        log("%s: unavailable (%s)" % (url, type(e).__name__))
        return None


def lobby_file(url, name):
    """"http://h:39421/leaderboard.json" or "http://h:39421/" -> "http://h:39421/<name>"."""
    return url.rsplit("/", 1)[0] + "/" + name


def _int(v, top=None):
    try:
        if isinstance(v, bool):
            return None
        n = int(v)
        if n < 0 or (top is not None and n > top):
            return None
        return n
    except (TypeError, ValueError, OverflowError):
        return None


def _row(r):
    """One lobby row -> (id, name, avatar, points, veteran), or None for a row to ignore."""
    if not isinstance(r, dict):
        return None
    rid = r.get("id")
    if not isinstance(rid, str) or not ID_RE.match(rid):
        return None
    pts, vet = _int(r.get("points"), POINTS_MAX), _int(r.get("veteran", 0), POINTS_MAX)
    if pts is None:
        return None
    name = r.get("name")
    name = name.strip()[:64] if isinstance(name, str) and name.strip() else None
    av = r.get("avatar")
    av = av if isinstance(av, str) and AVATAR_RE.match(av) else None
    return rid, name, av, pts, vet or 0


def merge(docs):
    """docs: parsed lobby /mastery.json documents. Returns (players, regions):
    players = {id: {"name", "avatar", "fighters": {key: [points, veteran]}, "tot_points", "tot_vet"}}.

    Per fighter: points summed over the regions, veteran = the largest (max 1000).
    Overall (the lobbies' "total" rows): points summed; for the veteran the best estimate the lists allow, since each
    lobby sends only its top 100 per fighter: the largest of (a) the largest "total" veteran of one region and (b) the sum
    over the fighters seen of their largest veteran, never more than the sum over the regions (a fighter's bonus counted
    twice). Likewise the points: the larger of the summed "total" rows and the summed fighter rows."""
    players, regions = {}, []
    for doc in docs:
        if not isinstance(doc, dict) or not isinstance(doc.get("fighters"), dict):
            continue
        region = doc.get("region")
        region = region.lower() if isinstance(region, str) and REGION_RE.match(region.lower()) else "?%d" % len(regions)
        if region in regions:  # two addresses of the same lobby: count its points once
            log("region %s listed twice: the second copy is skipped" % region)
            continue
        regions.append(region)

        def player(rid, name, av):
            p = players.setdefault(rid, {"name": None, "avatar": None, "fighters": {}, "tot_points": 0, "tot_vet_max": 0,
                                         "tot_vet_sum": 0, "regions": set()})
            if name and not p["name"]:
                p["name"] = name
            if av and not p["avatar"]:
                p["avatar"] = av
            return p

        for key, rows in doc["fighters"].items():
            if not isinstance(key, str) or not KEY_RE.match(key) or not isinstance(rows, list):
                continue
            seen = set()
            for r in rows[:TOP * 5]:
                row = _row(r)
                if not row or row[0] in seen:
                    continue
                seen.add(row[0])
                rid, name, av, pts, vet = row
                f = player(rid, name, av)["fighters"].setdefault(key, [0, 0])
                f[0] += pts
                f[1] = max(f[1], min(vet, VETERAN_MAX))
        seen = set()
        for r in (doc.get("total") if isinstance(doc.get("total"), list) else [])[:TOP * 5]:
            row = _row(r)
            if not row or row[0] in seen:
                continue
            seen.add(row[0])
            rid, name, av, pts, vet = row
            p = player(rid, name, av)
            p["tot_points"] += pts
            p["tot_vet_max"] = max(p["tot_vet_max"], vet)
            p["tot_vet_sum"] += vet
            p["regions"].add(region)
    return players, regions


def _total_of(p):
    """(points, veteran) of a player's overall row: see merge()."""
    f_points = sum(v[0] for v in p["fighters"].values())
    f_vet = sum(v[1] for v in p["fighters"].values())
    points = max(p["tot_points"], f_points)
    vet = max(p["tot_vet_max"], f_vet)
    if p["regions"]:
        vet = min(vet, max(p["tot_vet_sum"], f_vet))
    return points, vet


def _out_row(pos, pid, p, points, vet):
    row = {"pos": pos, "id": pid, "points": points, "veteran": vet, "total": points + vet}
    if p["name"]:
        row["name"] = p["name"]
    if p["avatar"]:
        row["avatar"] = p["avatar"]
    return row


def build(players, regions, updated):
    """The site's mastery.json: {"updated", "regions", "players", "total": [rows], "fighters": {key: [rows]}};
    row = {"pos", "id", "name"?, "avatar"?, "points", "veteran", "total" (= points + veteran)}; overall rows also
    "fighter": the key of the player's fighter with the most mastery. Points only: no levels, no tiers."""
    overall = []
    for pid, p in players.items():
        points, vet = _total_of(p)
        if points + vet <= 0:
            continue
        main = sorted(p["fighters"].items(), key=lambda kv: (-(kv[1][0] + kv[1][1]), kv[0]))
        overall.append((points + vet, points, pid, vet, main[0][0] if main else None))
    overall.sort(key=lambda t: (-t[0], -t[1], t[2]))
    total = []
    for pos, (_, points, pid, vet, main) in enumerate(overall[:TOP], 1):
        row = _out_row(pos, pid, players[pid], points, vet)
        if main:
            row["fighter"] = main
        total.append(row)
    fighters = {}
    per = {}
    for pid, p in players.items():
        for key, (points, vet) in p["fighters"].items():
            if points + vet > 0:
                per.setdefault(key, []).append((points + vet, points, pid, vet))
    for key in sorted(per):
        lst = sorted(per[key], key=lambda t: (-t[0], -t[1], t[2]))[:TOP]
        fighters[key] = [_out_row(pos, pid, players[pid], points, vet) for pos, (_, points, pid, vet) in enumerate(lst, 1)]
    return {"updated": updated, "regions": sorted(regions), "players": len(overall), "total": total, "fighters": fighters}


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


def read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_json(path, doc):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    os.replace(tmp, path)


def write_if_changed(path, new):
    if same_data(read_json(path), new):
        return False
    write_json(path, new)
    return True


def region_of(url, doc=None):
    """The region of a lobby: its document's "region", else its host's (REGION_OF_HOST), else None."""
    r = doc.get("region") if isinstance(doc, dict) else None
    if isinstance(r, str) and REGION_RE.match(r.lower()):
        return r.lower()
    host = re.sub(r"^[a-z]+://", "", str(url)).split("/", 1)[0].rsplit(":", 1)[0].lower()
    return REGION_OF_HOST.get(host)


def build_status(docs, updated, by_region=None):
    """Sum the lobbies' aggregate counts. docs: parsed /status.json documents (counts only). by_region: {region: document,
    or None when that region's lobby did not answer} -> "regions": {region: counts (+ "up")}, sorted by region."""
    out = _counts(docs)
    out = dict({"updated": updated, "up": True}, **out)
    if by_region:
        out["regions"] = {r: (dict({"up": True}, **_counts([d])) if isinstance(d, dict) else {"up": False})
                          for r, d in sorted(by_region.items())}
    return out


def _counts(docs):
    out = {}
    for k in STATUS_KEYS:
        out[k] = sum(n for n in (_int(d.get(k)) for d in docs if isinstance(d, dict)) if n is not None)
    # (online matches played, from lobbies that count them; left out until one does)
    played = [d["matches"] for d in docs if isinstance(d, dict) and isinstance(d.get("matches"), dict)
              and _int(d["matches"].get("total")) is not None]
    if played:
        out["matches"] = {"total": sum(_int(m.get("total")) for m in played),
                          "today": sum(_int(m.get("today")) or 0 for m in played),
                          "by_mode": {k: sum(_int((m.get("by_mode") or {}).get(k)) or 0 for m in played if isinstance(m.get("by_mode"), dict))
                                      for k in MATCH_MODES}}
    return out


def run_status(urls, status_path, fetcher, mastery_up):
    """status.json: live counts. A lobby without /status.json is skipped; when no lobby answers at all (neither
    /status.json nor /mastery.json) the file says {"up": false}."""
    docs, by_region = [], {}
    for u in urls:
        d = fetcher(lobby_file(u, "status.json"))
        d = d if isinstance(d, dict) else None
        r = region_of(u, d)
        if not r:
            log("%s: no region (not an official lobby): its counts are left out" % u)
            continue
        if d is not None:
            docs.append(d)
        if d is not None or r not in by_region:
            by_region[r] = d
    if docs:
        new = build_status(docs, now_iso(), by_region)
    elif not mastery_up:
        new = {"updated": now_iso(), "up": False}
    else:
        log("no lobby serves /status.json: leaving status.json alone")
        return
    log("status.json %s" % ("written" if write_if_changed(status_path, new) else "unchanged"))


def freeze_gsp(gsp_path=GSP_PATH, archive_path=GSP_ARCHIVE_PATH):
    """Once: the last GSP snapshot becomes gsp_archive.json (read only on the site). Never overwritten afterwards."""
    if not archive_path or os.path.exists(archive_path):
        return False
    old = read_json(gsp_path)
    if not isinstance(old, dict) or not isinstance(old.get("players"), list):
        return False
    old["frozen"] = now_iso()
    write_json(archive_path, old)
    log("GSP leaderboard frozen: %s (%d players)" % (os.path.basename(archive_path), len(old["players"])))
    return True


def with_cached_regions(docs, regions_path):
    """docs + the last known document of every region that did not answer now (REGIONS_PATH)."""
    if not regions_path:
        return docs
    cache = read_json(regions_path)
    cache = cache if isinstance(cache, dict) else {}
    changed, fresh = False, set()
    for d in docs:
        r = d.get("region")
        if not isinstance(r, str) or not REGION_RE.match(r.lower()) or not isinstance(d.get("fighters"), dict):
            continue
        fresh.add(r.lower())
        keep = {k: v for k, v in d.items() if k != "updated"}
        if cache.get(r.lower()) != keep:
            cache[r.lower()] = keep
            changed = True
    if changed:
        write_json(regions_path, cache)
    late = [cache[r] for r in sorted(cache) if r not in fresh and isinstance(cache[r], dict)]
    if late:
        log("last known points used for: %s" % ", ".join(r for r in sorted(cache) if r not in fresh))
    return docs + late


def run(urls, out_path=MASTERY_PATH, fetcher=fetch, status_path=STATUS_PATH, gsp_path=GSP_PATH, archive_path=GSP_ARCHIVE_PATH,
        regions_path=REGIONS_PATH):
    freeze_gsp(gsp_path, archive_path)
    docs = [d for d in (fetcher(lobby_file(u, "mastery.json")) for u in urls) if isinstance(d, dict)]
    if status_path:
        run_status(urls, status_path, fetcher, bool(docs))
    if not docs:
        log("no lobby serves /mastery.json: leaving mastery.json alone")
        return 0
    # one order whatever answered first, so the name kept (the first one seen) does not flip between runs
    all_docs = sorted(with_cached_regions(docs, regions_path), key=lambda d: str(d.get("region") or "~").lower())
    players, regions = merge(all_docs)
    new = build(players, regions, now_iso())
    if write_if_changed(out_path, new):
        log("mastery.json written: %d players from %s" % (new["players"], ", ".join(new["regions"])))
    else:
        log("mastery.json unchanged (%d players)" % new["players"])
    return 0


def selftest():
    import tempfile
    eu = {"region": "eu", "updated": "x",
          "fighters": {"mario": [{"id": "acc_A1", "name": "Nelly", "points": 900, "veteran": 1000},
                                 {"id": "acc_B2", "points": 300, "veteran": 0}],
                       "pzenigame": [{"id": "acc_A1", "name": "Nelly", "points": 50, "veteran": 0}],
                       "Bad Key": [{"id": "acc_A1", "points": 99999}],
                       "fox": [{"id": "x", "points": 5}, {"id": "acc_C3", "points": "7"}, {"id": "acc_D4", "points": -1},
                               {"id": "acc_E5", "points": True}, "junk"]},
          "total": [{"id": "acc_A1", "name": "Nelly", "points": 950, "veteran": 1000},
                    {"id": "acc_B2", "points": 300, "veteran": 0}, {"id": "acc_C3", "points": 7, "veteran": 0}]}
    na = {"region": "na-east", "updated": "y",
          "fighters": {"mario": [{"id": "acc_A1", "name": "<b>Nelly2</b>", "points": 100, "veteran": 1000},
                                 {"id": "acc_B2", "name": "Bob", "points": 2000, "veteran": 5000}],
                       "fox": [{"id": "acc_B2", "name": "Bob", "points": 40, "veteran": 1000}]},
          "total": [{"id": "acc_B2", "name": "Bob", "points": 2040, "veteran": 2000},
                    {"id": "acc_A1", "name": "Nelly2", "points": 100, "veteran": 1000}]}
    na_copy = dict(na)  # the same region at a second address: counted once
    players, regions = merge([eu, na, na_copy, {"fighters": "x"}, "junk", None])
    out = build(players, regions, "T")
    assert out["regions"] == ["eu", "na-east"], out["regions"]
    fm = {r["id"]: r for r in out["fighters"]["mario"]}
    # per fighter: points summed over regions, veteran = the largest one (capped at 1000)
    assert fm["acc_A1"]["points"] == 1000 and fm["acc_A1"]["veteran"] == 1000 and fm["acc_A1"]["total"] == 2000, fm
    assert fm["acc_B2"]["points"] == 2300 and fm["acc_B2"]["veteran"] == 1000 and fm["acc_B2"]["total"] == 3300, fm
    assert [r["id"] for r in out["fighters"]["mario"]] == ["acc_B2", "acc_A1"] and out["fighters"]["mario"][0]["pos"] == 1
    assert fm["acc_A1"]["name"] == "Nelly" and fm["acc_B2"]["name"] == "Bob", "first name seen; Bob named by NA"
    assert "Bad Key" not in out["fighters"], "fighter keys are checked"
    assert [r["id"] for r in out["fighters"]["fox"]] == ["acc_B2", "acc_C3"], out["fighters"]["fox"]
    assert out["fighters"]["fox"][1]["points"] == 7, "numeric strings are accepted, negatives/booleans/bad ids are not"
    tot = {r["id"]: r for r in out["total"]}
    # A: points 950 (EU) + 100 (NA) = 1050; veteran: Mario's, once (1000), not 2000
    assert tot["acc_A1"]["points"] == 1050 and tot["acc_A1"]["veteran"] == 1000 and tot["acc_A1"]["total"] == 2050, tot["acc_A1"]
    # B: points 300 + 2040; veteran: Mario 1000 (capped) + Fox 1000 = 2000
    assert tot["acc_B2"]["points"] == 2340 and tot["acc_B2"]["veteran"] == 2000 and tot["acc_B2"]["fighter"] == "mario", tot["acc_B2"]
    assert [r["id"] for r in out["total"]] == ["acc_B2", "acc_A1", "acc_C3"] and out["players"] == 3
    assert tot["acc_A1"]["fighter"] == "mario" and "avatar" not in tot["acc_A1"]
    assert all(set(r) <= {"pos", "id", "name", "avatar", "points", "veteran", "total", "fighter"} for r in out["total"])
    assert not any(k in json.dumps(out) for k in ("level", "tier", "rank")), "points only: no levels, tiers or ranks"

    # files: a lobby without /mastery.json is skipped, nothing answering leaves the file alone, no rewrite when unchanged
    docs = {"http://a/mastery.json": eu, "http://b/mastery.json": na, "http://a/status.json": {"online": 3, "rooms": 2, "x": 1, "region": "eu"}}
    fetcher = lambda u: docs.get(u)  # noqa: E731 - "http://c/..." is a lobby without the new endpoints
    with tempfile.TemporaryDirectory() as d:
        mpath, spath = os.path.join(d, "mastery.json"), os.path.join(d, "status.json")
        gpath, apath = os.path.join(d, "leaderboard.json"), os.path.join(d, "gsp_archive.json")
        rpath = os.path.join(d, "mastery_regions.json")
        gsp = {"updated": "2026-11-19T16:02:43Z", "ranked": 1, "players": [{"id": "9d74203bd22b4243", "rank": 1, "gsp": 1725}], "fighters": {}}
        write_json(gpath, gsp)
        assert run(["http://c/"], mpath, fetcher, spath, gpath, apath, rpath) == 0
        assert not os.path.exists(mpath), "no lobby with /mastery.json: no file"
        assert read_json(spath)["up"] is False
        arch = read_json(apath)
        assert arch["players"] == gsp["players"] and arch["frozen"], "the GSP list is archived once"
        write_json(gpath, {"updated": "later", "ranked": 0, "players": [], "fighters": {}})
        assert run(["http://a/leaderboard.json", "http://c/", "http://b/"], mpath, fetcher, spath, gpath, apath, rpath) == 0
        assert read_json(apath) == arch, "the archive is never overwritten"
        assert read_json(gpath)["updated"] == "later", "leaderboard.json is not rewritten any more"
        with open(mpath, encoding="utf-8") as f:
            first_text = f.read()
        assert json.loads(first_text)["players"] == 3
        st = read_json(spath)
        assert st["up"] is True and st["online"] == 3 and st["rooms"] == 2 and "x" not in st and "ranked" not in st, st
        assert run(["http://a/", "http://c/", "http://b/"], mpath, fetcher, spath, gpath, apath, rpath) == 0
        with open(mpath, encoding="utf-8") as f:
            assert f.read() == first_text, "unchanged data must not rewrite"
        assert run(["http://c/"], mpath, fetcher, spath, gpath, apath, rpath) == 0
        with open(mpath, encoding="utf-8") as f:
            assert f.read() == first_text, "must not change when no lobby answers"
        # a region that is down keeps its last points in the sum; status.json left alone without /status.json
        write_json(spath, {"updated": "s", "up": True, "online": 9})
        regions_text = open(rpath, encoding="utf-8").read()
        assert run(["http://b/"], mpath, fetcher, spath, gpath, apath, rpath) == 0
        assert read_json(spath)["online"] == 9
        with open(mpath, encoding="utf-8") as f:
            assert f.read() == first_text, "EU down: its last points still count"
        assert open(rpath, encoding="utf-8").read() == regions_text, "the region cache is rewritten only on a change"
        assert sorted(read_json(rpath)) == ["eu", "na-east"] and "updated" not in read_json(rpath)["eu"]
        assert run(["http://b/"], os.path.join(d, "m2.json"), fetcher, None, gpath, apath, None) == 0
        assert read_json(os.path.join(d, "m2.json"))["players"] == 2, "without the cache: only the regions that answered"
    global HEARTBEAT_S
    HEARTBEAT_S = 600
    m = build_status([{"online": 1, "matches": {"total": 120, "today": 7, "by_mode": {"quickplay": 100, "arena": 15, "room": 5},
                                                "estimated": 40, "since": "2026-11-18"}},
                      {"online": 2, "matches": {"total": "x"}}, {"online": 0}], "t")
    assert m["matches"] == {"total": 120, "today": 7, "by_mode": {"quickplay": 100, "arena": 15, "room": 5}}, m
    # regions: the official lobbies by host name (or a "region" in the document), a lobby that does not answer is "up": false,
    # a lobby of no region (not an official one) is not counted at all
    sdocs = {"http://eu.lobby.opensmashultimate.com:39421/status.json": {"online": 4, "rooms": 1, "matches": {"total": 10, "today": 2}},
             "http://na.lobby.opensmashultimate.com:39421/status.json": None,
             "http://old.example:39421/status.json": {"online": 6, "rooms": 2},
             "http://x.example/status.json": {"online": 1, "region": "NA-East"}}
    with tempfile.TemporaryDirectory() as d:
        sp = os.path.join(d, "status.json")
        run_status([u.replace("status.json", "") for u in sdocs], sp, sdocs.get, True)
        st = read_json(sp)
        assert st["online"] == 5 and st["rooms"] == 1, st
        assert st["regions"]["eu"] == {"up": True, "online": 4, "rooms": 1, "arenas": 0, "open_rooms": 0, "playing": 0,
                                       "matches": {"total": 10, "today": 2, "by_mode": {"quickplay": 0, "arena": 0, "room": 0}}}, st
        assert st["regions"]["na-east"]["up"] is True and st["regions"]["na-east"]["online"] == 1, "a region's answer beats its silent lobby"
        assert sorted(st["regions"]) == ["eu", "na-east"]
        run_status(["http://eu.lobby.opensmashultimate.com:39421/", "http://na.lobby.opensmashultimate.com:39421/"], sp, sdocs.get, True)
        assert read_json(sp)["regions"]["na-east"] == {"up": False}
    assert region_of("http://EU.lobby.opensmashultimate.com:39421/x") == "eu" and region_of("http://old.example/") is None
    assert sorted(region_of(u) for u in LOBBIES) == ["eu", "na-east"], "the default lobbies are the two official ones only"
    assert same_data({"a": 1, "updated": "2026-01-01T00:00:00Z"}, {"a": 1, "updated": "2026-01-01T00:05:00Z"})
    assert not same_data({"a": 1, "updated": "2026-01-01T00:00:00Z"}, {"a": 1, "updated": "2026-01-01T00:11:00Z"})
    assert not same_data({"a": 1, "updated": "2026-01-01T00:00:00Z"}, {"a": 2, "updated": "2026-01-01T00:00:01Z"})
    HEARTBEAT_S = 0
    assert lobby_file("http://h:39421/leaderboard.json", "mastery.json") == "http://h:39421/mastery.json"
    assert lobby_file("http://h:39421/", "mastery.json") == "http://h:39421/mastery.json"
    assert AVATAR_RE.match("https://cdn.discordapp.com/embed/avatars/3.png")
    assert not AVATAR_RE.match("https://cdn.discordapp.com.evil.example/embed/avatars/1.png")
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
