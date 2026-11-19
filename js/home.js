/* Home page: live lobby counts (status.json: the official lobbies, Europe and North America East, summed and per region,
   with a Total / EU / NA switch: a snapshot written every few minutes by .github/workflows/leaderboard.yml to the `data`
   branch, as the lobbies are plain HTTP and this page is HTTPS; js/snapshot.js loads it) and the top 10 Global Mastery
   Points (read from the shared account project, the same numbers as SSBU Arena's site). The "Updated x min ago" labels tick every 30 s between fetches. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var STALE_MIN = 20, REFRESH_MS = 60000, BOARD_MS = 300000, TICK_MS = 30000, TOP = 10;
  var lastStatus = null;

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

  /* Top 10 Global Mastery Points (OpenSmashAuth.masteryBoard: public.opensmash_mastery_board on the shared account project,
     every region and SSBU Arena summed): # | fighter icon (the main, or the chosen fighter) | player | GMP. */
  var boardGen = 0;
  function showBoard(key, res) {
    var body = $("rows");
    body.textContent = "";
    if (!res || !res.rows.length) {
      $("table-wrap").hidden = true; $("credit").textContent = "";
      $("empty").textContent = !res ? "Mastery points are not available right now." : key ? "No points with " + OSU_FIGHTER(key) + " yet." : "No mastery points yet. Play online to be the first.";
      $("empty").hidden = false;
      return;
    }
    $("empty").hidden = true; $("table-wrap").hidden = false;
    if (!$("credit").firstChild) $("credit").appendChild(OSU_ICON_CREDIT());
    res.rows.slice(0, TOP).forEach(function (p) {
      var tr = document.createElement("tr");
      tr.appendChild(cell("td", "pos", String(p.pos)));
      var fc = cell("td", "ficon-cell", "");
      fc.appendChild(OSU_FIGHTER_EL(key || p.main_fighter || ""));
      tr.appendChild(fc);
      tr.appendChild(cell("td", "pname", p.name || "Anonymous"));
      tr.appendChild(cell("td", "num", Math.floor(p.total).toLocaleString("en-US")));
      body.appendChild(tr);
    });
  }
  function loadBoard() {
    var A = window.OpenSmashAuth, key = $("fighter").value, mine = ++boardGen;
    if (!A || !A.masteryBoard) { showBoard(key, null); return; }
    A.masteryBoard(key || null, TOP, 0).then(function (res) {
      if (mine !== boardGen) return;
      showBoard(key, res);
      if (!key) $("t-mastery").textContent = res.count !== null ? res.count.toLocaleString("en-US") : String(res.rows.length);
    }, function () {
      if (mine !== boardGen) return;
      showBoard(key, null);
      if (!key) $("t-mastery").textContent = "-";
    });
  }
  function fillSelect() {
    var sel = $("fighter");
    OSU_FIGHTER_KEYS.forEach(function (k) {
      var o = document.createElement("option"); o.value = k; o.textContent = OSU_FIGHTER(k); sel.appendChild(o);
    });
  }

  function refreshStatus() {
    OSUData.load("status.json").then(showStatus).catch(function () { showStatus(null); });
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
    fillSelect();
    $("fighter").addEventListener("change", loadBoard);
    $("region-switch").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-r]");
      if (b) pickRegion(b.getAttribute("data-r"));
    });
    pickRegion(region);
    refreshStatus();
    loadBoard();
    setInterval(refreshStatus, REFRESH_MS);
    setInterval(loadBoard, BOARD_MS);
    setInterval(function () { if (lastStatus) showStatus(lastStatus); }, TICK_MS);
  });
})();
