/* Home page: live lobby counts (status.json: the official lobbies, Europe and North America East, summed and per region,
   with a Total / EU / NA switch) and the top 10 Global Mastery Points (mastery.json). Both are snapshots written every few
   minutes by .github/workflows/leaderboard.yml to the `data` branch (the lobbies are plain HTTP; this page is HTTPS);
   js/snapshot.js loads them. The "Updated x min ago" labels tick every 30 s between fetches. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var STALE_MIN = 20, REFRESH_MS = 60000, TICK_MS = 30000, TOP = 10;
  var board = null, lastStatus = null;

  var ago = OSUData.ago;
  function num(v) { return typeof v === "number" && isFinite(v) ? String(v) : "-"; }

  /* The region shown on the "Online now" card: "" (Total: the official regions summed), "eu" or "na-east". */
  var REGION_NAMES = { eu: "Europe", "na-east": "North America East" }, COUNT_KEYS = ["online", "rooms", "arenas"];
  var region = ""; // Total on every visit

  /* One region's counts from status.json ({"regions": {"eu": {...}, "na-east": {...}}}, js/snapshot.js), or the Total:
     the regions summed (the top-level sums of an older snapshot without regions). null: no data for that view. */
  function view(s, r) {
    if (!s || typeof s !== "object") return null;
    var regs = s.regions && typeof s.regions === "object" ? s.regions : null;
    if (r) return regs && regs[r] && typeof regs[r] === "object" ? regs[r] : null;
    if (!regs) return s;
    var ids = Object.keys(REGION_NAMES).filter(function (k) { return regs[k] && typeof regs[k] === "object"; });
    if (!ids.length) return s;
    var up = ids.filter(function (k) { return regs[k].up !== false && typeof regs[k].online === "number"; });
    var out = { up: up.length > 0 };
    COUNT_KEYS.forEach(function (k) { out[k] = up.reduce(function (n, id) { return n + (Number(regs[id][k]) || 0); }, 0); });
    var played = up.filter(function (id) { return regs[id].matches && typeof regs[id].matches.total === "number"; });
    if (played.length) out.matches = {
      total: played.reduce(function (n, id) { return n + regs[id].matches.total; }, 0),
      today: played.reduce(function (n, id) { return n + (Number(regs[id].matches.today) || 0); }, 0)
    };
    out.partial = up.length < ids.length;
    return out;
  }

  /* "N online matches played" (status.json's matches; tools/nex/matches.py in the game's repo): hidden while the lobby
     has no count, never a 0 standing in for a missing number. */
  function showMatches(v) {
    var m = v && v.up !== false && v.matches, total = m && m.total;
    if (typeof total !== "number" || !isFinite(total) || total < 1) { $("matches").hidden = true; return; }
    $("t-matches").textContent = Math.floor(total).toLocaleString("en-US");
    var today = typeof m.today === "number" && m.today > 0 ? Math.floor(m.today) : 0;
    $("t-matches-today").textContent = today ? " · " + today.toLocaleString("en-US") + " today" : "";
    $("matches").hidden = false;
  }

  function showStatus(s) {
    lastStatus = s;
    var v = view(s, region);
    showMatches(v);
    var pill = $("pill"), txt = $("pill-text"), upd = $("upd");
    $("where").textContent = region ? REGION_NAMES[region] : "Europe + North America East";
    function dashes() {
      COUNT_KEYS.forEach(function (k) { $("t-" + k).textContent = "-"; });
    }
    if (!v || (v.up !== false && typeof v.online !== "number")) {
      dashes();
      pill.dataset.s = ""; txt.textContent = s && region ? "No counts for this region yet" : "Live counts coming soon";
      upd.textContent = "";
      return;
    }
    var a = ago(s.updated), stale = a && a.min > STALE_MIN;
    if (v.up === false) {
      dashes();
      pill.dataset.s = "down"; txt.textContent = "Server not answering";
    } else {
      COUNT_KEYS.forEach(function (k) { $("t-" + k).textContent = num(v[k]); });
      pill.dataset.s = stale || v.partial ? "stale" : "up";
      txt.textContent = stale ? "Counts may be out of date" : v.partial ? "One region not answering" : region ? "Server online" : "Servers online";
    }
    upd.textContent = a ? "Updated " + a.text : "";
  }
  function pickRegion(r) {
    region = r;
    Array.prototype.forEach.call($("region-switch").querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-r") === r));
    });
    showStatus(lastStatus);
  }

  function cell(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }

  function pts(p) {
    var t = typeof p.total === "number" ? p.total : (Number(p.points) || 0) + (Number(p.veteran) || 0);
    return Math.floor(t).toLocaleString("en-US");
  }
  /* Global Mastery Points (GMP), points only: # | fighter icon (the main, or the chosen fighter) | player | GMP. */
  function render(key) {
    var body = $("rows"), list;
    body.textContent = "";
    if (!board || !board.total.length) {
      $("table-wrap").hidden = true; $("empty").hidden = false; $("credit").textContent = ""; return;
    }
    $("empty").hidden = true; $("table-wrap").hidden = false;
    if (!$("credit").firstChild) $("credit").appendChild(OSU_ICON_CREDIT());
    key = key && Array.isArray(board.fighters[key]) ? key : "";
    list = (key ? board.fighters[key] : board.total).slice(0, TOP);
    list.forEach(function (p, i) {
      var tr = document.createElement("tr");
      tr.appendChild(cell("td", "pos", String(p.pos || i + 1)));
      var fc = cell("td", "ficon-cell", "");
      fc.appendChild(OSU_FIGHTER_EL(key || p.fighter || ""));
      tr.appendChild(fc);
      tr.appendChild(cell("td", "pname", p.name || "Anonymous"));
      var n = cell("td", "num", pts(p));
      if (p.veteran > 0) n.title = Math.floor(p.points || 0).toLocaleString("en-US") + " from matches + " + Math.floor(p.veteran).toLocaleString("en-US") + " veteran bonus";
      tr.appendChild(n);
      body.appendChild(tr);
    });
  }
  function fillSelect() {
    var sel = $("fighter"), keep = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    var f = (board && board.fighters) || {};
    Object.keys(f).filter(function (k) { return Array.isArray(f[k]) && f[k].length; }).sort(function (a, b) {
      return OSU_FIGHTER(a).localeCompare(OSU_FIGHTER(b));
    }).forEach(function (k) {
      var o = document.createElement("option"); o.value = k; o.textContent = OSU_FIGHTER(k); sel.appendChild(o);
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
    OSUData.load("mastery.json").then(function (d) {
      if (!d || !Array.isArray(d.total)) throw new Error("bad file");
      if (!d.fighters || typeof d.fighters !== "object" || Array.isArray(d.fighters)) d.fighters = {};
      board = d;
      fillSelect();
      render($("fighter").value);
      $("t-mastery").textContent = typeof d.players === "number" ? String(d.players) : "-";
      tickBoardAge();
    }).catch(function () { board = null; $("t-mastery").textContent = "-"; render(""); tickBoardAge(); });
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
    $("region-switch").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-r]");
      if (b) pickRegion(b.getAttribute("data-r"));
    });
    pickRegion(region);
    refresh();
    setInterval(refresh, REFRESH_MS);
    setInterval(function () { if (lastStatus) showStatus(lastStatus); tickBoardAge(); }, TICK_MS);
  });
})();
