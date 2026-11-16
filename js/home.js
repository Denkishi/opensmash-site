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

  function showStatus(s) {
    lastStatus = s;
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
      rows = ((board.fighters[kind] || {}).top || []).slice(0, TOP).map(function (p) { return [p.rank, p.name, null, p.gsp]; });
    } else {
      ["#", "Player", "GSP"].forEach(function (c, i) { head.appendChild(cell("th", i === 2 ? "num" : "", c)); });
      rows = board.players.slice(0, TOP).map(function (p) { return [p.rank, p.name, p.fighter != null ? fighterName(p.fighter) : "-", p.gsp]; });
    }
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.appendChild(cell("td", "pos", "#" + r[0]));
      var pc = cell("td", "", r[1] || "Anonymous");
      if (r[2] !== null) pc.appendChild(cell("small", "fn", r[2]));
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
