/* Home page: live lobby counts (status.json) and the top of the leaderboard (leaderboard.json). Both are snapshots
   written every few minutes by .github/workflows/leaderboard.yml to the `data` branch (the lobby is plain HTTP; this
   page is HTTPS); js/snapshot.js loads them. The "Updated x min ago" labels tick every 30 s between fetches. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var STALE_MIN = 20, REFRESH_MS = 60000, TICK_MS = 30000, TOP = 10;
  var board = null, lastStatus = null;

  var ago = OSUData.ago;
  function num(v) { return typeof v === "number" && isFinite(v) ? String(v) : "-"; }

  /* "N online matches played" (status.json's matches; tools/nex/matches.py in the game's repo): hidden while the lobby
     has no count, never a 0 standing in for a missing number. */
  function showMatches(s) {
    var m = s && s.up !== false && s.matches, total = m && m.total;
    if (typeof total !== "number" || !isFinite(total) || total < 1) { $("matches").hidden = true; return; }
    $("t-matches").textContent = Math.floor(total).toLocaleString("en-US");
    var today = typeof m.today === "number" && m.today > 0 ? Math.floor(m.today) : 0;
    $("t-matches-today").textContent = today ? " · " + today.toLocaleString("en-US") + " today" : "";
    $("matches").hidden = false;
  }

  function showStatus(s) {
    lastStatus = s;
    showMatches(s);
    var pill = $("pill"), txt = $("pill-text"), upd = $("upd");
    var keys = ["online", "rooms", "arenas", "ranked"];
    function dashes() {
      keys.forEach(function (k) { $("t-" + k).textContent = k === "ranked" && board && typeof board.ranked === "number" ? String(board.ranked) : "-"; });
    }
    if (!s || typeof s !== "object" || (s.up !== false && typeof s.online !== "number")) {
      dashes();
      pill.dataset.s = ""; txt.textContent = "Live counts coming soon";
      upd.textContent = "";
      return;
    }
    var a = ago(s.updated), stale = a && a.min > STALE_MIN;
    if (s.up === false) {
      dashes();
      pill.dataset.s = "down"; txt.textContent = "Server not answering";
    } else {
      keys.forEach(function (k) { $("t-" + k).textContent = num(s[k]); });
      pill.dataset.s = stale ? "stale" : "up";
      txt.textContent = stale ? "Counts may be out of date" : "Server online";
    }
    upd.textContent = a ? "Updated " + a.text : "";
  }

  function cell(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }

  /* The Discord profile picture the lobby lists (same check as the full leaderboard page), else the initial. */
  var AVATAR_RE = /^https:\/\/cdn\.discordapp\.com\/(avatars\/[0-9]+\/(a_)?[0-9a-f]{32}\.png\?size=64|embed\/avatars\/[0-5]\.png)$/;
  function initial(name) { return cell("span", "initial", (name || "A").charAt(0).toUpperCase()); }
  function avatar(p) {
    if (!p || typeof p.avatar !== "string" || !AVATAR_RE.test(p.avatar)) return initial(p && p.name);
    var img = document.createElement("img");
    img.className = "avatar"; img.alt = ""; img.width = img.height = 28;
    img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function () { if (img.parentNode) img.parentNode.replaceChild(initial(p.name), img); });
    img.src = p.avatar;
    return img;
  }
  /* A per-fighter top entry carries only the player's id: name and picture come from the overall list. */
  function byId(id) {
    var ps = (board && board.players) || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
    return null;
  }

  function fighterName(kind) {
    var f = board && board.fighters && board.fighters[kind];
    return (f && f.name) || "Fighter " + kind;
  }
  function render(kind) {
    var body = $("rows"), head = $("head"), rows = [];
    body.textContent = ""; head.textContent = "";
    if (!board || !board.players || !board.players.length) {
      $("table-wrap").hidden = true; $("empty").hidden = false; return;
    }
    $("empty").hidden = true; $("table-wrap").hidden = false;
    if (kind) {
      ["#", "Player", "GSP"].forEach(function (c, i) { head.appendChild(cell("th", i === 2 ? "num" : "", c)); });
      rows = ((board.fighters[kind] || {}).top || []).slice(0, TOP).map(function (p) { var q = byId(p.id) || p; return [p.rank, q.name, null, p.gsp, q]; });
    } else {
      ["#", "Player", "GSP"].forEach(function (c, i) { head.appendChild(cell("th", i === 2 ? "num" : "", c)); });
      rows = board.players.slice(0, TOP).map(function (p) { return [p.rank, p.name, p.fighter != null ? fighterName(p.fighter) : "-", p.gsp, p]; });
    }
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.appendChild(cell("td", "pos", "#" + r[0]));
      var pc = cell("td", ""), box = cell("div", "player", "");
      box.appendChild(avatar(r[4]));
      var who = cell("span", "", r[1] || "Anonymous");
      if (r[2] !== null) who.appendChild(cell("small", "fn", r[2]));
      box.appendChild(who);
      pc.appendChild(box);
      tr.appendChild(pc);
      tr.appendChild(cell("td", "num", String(r[3])));
      body.appendChild(tr);
    });
  }
  function fillSelect() {
    var sel = $("fighter"), keep = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    Object.keys((board && board.fighters) || {}).sort(function (a, b) {
      return board.fighters[a].name.localeCompare(board.fighters[b].name);
    }).forEach(function (k) {
      var o = document.createElement("option"); o.value = k; o.textContent = board.fighters[k].name; sel.appendChild(o);
    });
    sel.value = keep;
    if (sel.value !== keep) sel.value = "";
  }

  function tickBoardAge() {
    var a = board && ago(board.updated);
    $("board-upd").textContent = a ? "Updated " + a.text : "";
  }

  function refresh() {
    OSUData.load("status.json").then(showStatus).catch(function () { showStatus(null); });
    OSUData.load("leaderboard.json").then(function (d) {
      if (!d || !Array.isArray(d.players)) throw new Error("bad file");
      d.fighters = d.fighters || {};
      board = d;
      fillSelect();
      render($("fighter").value);
      if ($("t-ranked").textContent === "-" && typeof d.ranked === "number") $("t-ranked").textContent = String(d.ranked);
      tickBoardAge();
    }).catch(function () { board = null; render(""); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var cfg = window.OSU_CONFIG || {};
    document.querySelectorAll("[data-link=repo]").forEach(function (a) { if (cfg.REPO_URL) a.href = cfg.REPO_URL; });
    document.querySelectorAll("[data-link=discord]").forEach(function (a) { if (cfg.DISCORD_URL) a.href = cfg.DISCORD_URL; });
    var toggle = document.querySelector(".nav-toggle"), menu = $("nav-links");
    toggle.addEventListener("click", function () {
      var open = !menu.classList.contains("open");
      menu.classList.toggle("open", open); toggle.setAttribute("aria-expanded", String(open));
    });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) { menu.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); } });
    $("fighter").addEventListener("change", function () { render(this.value); });
    refresh();
    setInterval(refresh, REFRESH_MS);
    setInterval(function () { if (lastStatus) showStatus(lastStatus); tickBoardAge(); }, TICK_MS);
  });
})();
