/* Mastery page (leaderboard/): renders mastery.json (written by .github/scripts/leaderboard.py from every lobby's
   /mastery.json, points summed over the regions) as Global Mastery Points (GMP). Columns: # | fighter icon | player | GMP.
   The list is drawn 50 rows at a time; the next 50 are added when the end of the table scrolls into view.
   Signed in, the player's own status (OpenSmashAuth.myMastery(): GMP, rank, main and top fighters) comes first. */
document.addEventListener("DOMContentLoaded", function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var PAGE = 50, MARGIN = 600; // rows per step; px before the end of the table at which the next step is added
  var status = $("status"), content = $("content"), select = $("fighter"), rows = $("rows"), more = $("more"), count = $("count");
  var data = null, list = [], listKey = "", shown = 0, mine = null;

  function totalOf(p) { return typeof p.total === "number" ? p.total : (Number(p.points) || 0) + (Number(p.veteran) || 0); }
  function pointsCell(p) {
    var td = OSU.el("td", "num", OSU.fmtNum(totalOf(p)));
    if (p.veteran > 0) td.title = OSU.fmtNum(p.points) + " from matches + " + OSU.fmtNum(p.veteran) + " veteran bonus";
    return td;
  }
  function row(p, i) {
    var tr = OSU.el("tr"), fighter = listKey || p.fighter || "";
    tr._p = p;
    if (mine && mine.row && listKey === "" && p === mine.row) tr.className = "me";
    tr.appendChild(OSU.el("td", "pos", String(p.pos || i + 1)));
    var fc = OSU.el("td", "ficon-cell");
    fc.appendChild(OSU_FIGHTER_EL(fighter));
    tr.appendChild(fc);
    tr.appendChild(OSU.el("td", "pname", p.name || "Anonymous"));
    tr.appendChild(pointsCell(p));
    return tr;
  }

  /* Paging: add the next PAGE rows while the end of the table is within MARGIN px of the screen. */
  function nearEnd() { return more.getBoundingClientRect().top < window.innerHeight + MARGIN; }
  function step() {
    if (shown >= list.length) return;
    var frag = document.createDocumentFragment();
    list.slice(shown, shown + PAGE).forEach(function (p, j) { frag.appendChild(row(p, shown + j)); });
    rows.appendChild(frag);
    shown = Math.min(list.length, shown + PAGE);
    count.textContent = list.length > PAGE ? "Showing " + shown + " of " + list.length : "";
  }
  function fillUp() {
    var guard = 50;
    while (shown < list.length && nearEnd() && guard--) step();
  }
  var io = window.IntersectionObserver ? new IntersectionObserver(function (es) {
    if (es.some(function (e) { return e.isIntersecting; })) fillUp();
  }, { rootMargin: "0px 0px " + MARGIN + "px 0px" }) : null;
  if (io) io.observe(more);
  else window.addEventListener("scroll", fillUp, { passive: true });

  function show(key) {
    listKey = key && Array.isArray(data.fighters[key]) ? key : "";
    list = listKey ? data.fighters[listKey] : data.total;
    shown = 0;
    rows.textContent = "";
    step();
    fillUp();
  }

  /* ---- The signed-in player's own status ---- */
  var A = window.OpenSmashAuth, me = $("me"), myRows = null, myErr = null, myFor = null, busy = false;

  /* The player's row in the overall list: the same name with the same main fighter. Else, with a total that reaches the
     list, the place it would have. */
  function findMine(total, main) {
    var prof = A.profile(), uname = prof && prof.username;
    if (!data || !data.total.length) return null;
    var hit = null;
    if (uname) data.total.some(function (r) { if (r.name === uname && (!main || !r.fighter || r.fighter === main)) { hit = r; return true; } return false; });
    if (hit) return { row: hit, pos: hit.pos, total: Math.max(total || 0, totalOf(hit)) };
    if (!total) return null;
    var full = typeof data.players === "number" && data.total.length >= data.players;
    var last = totalOf(data.total[data.total.length - 1]);
    if (!full && total < last) return { pos: null, total: total, outside: data.total.length };
    return { pos: 1 + data.total.filter(function (r) { return totalOf(r) > total; }).length, total: total };
  }
  /* The player's own row, highlighted in the overall list. */
  function markMe() {
    Array.prototype.forEach.call(rows.children, function (tr) { tr.classList.toggle("me", !!(mine && mine.row && listKey === "" && tr._p === mine.row)); });
  }
  function meSay(msg) {
    $("me-status").textContent = msg;
    $("me-status").classList.remove("hidden");
    $("me-content").classList.add("hidden");
  }
  function paintMe() {
    var signed = !!(A && A.signedIn());
    me.classList.toggle("hidden", !signed);
    mine = null;
    if (!signed) { markMe(); return; }
    var prof = A.profile();
    var name = A.displayName(prof) || "You";
    if (myRows === null && !myErr) { meSay("Loading your mastery…"); return; }
    var mySum = (myRows || []).reduce(function (s, r) { return s + r.total; }, 0);
    var main = myRows && myRows.length ? myRows[0].fighter : null;
    mine = findMine(mySum, main);
    if (!main && mine && mine.row) main = mine.row.fighter || null;
    if (!mine && !mySum) {
      meSay(myErr ? "Your mastery is not available right now." : "No GMP yet. Finish an online match to earn your first points.");
      return;
    }
    $("me-name").textContent = name;
    var slot = $("me-main");
    slot.textContent = "";
    slot.appendChild(OSU_FIGHTER_EL(main, 56));
    $("me-main-name").textContent = main ? "Main: " + OSU_FIGHTER(main) : "";
    $("me-total").textContent = OSU.fmtNum(mine ? mine.total : mySum);
    var rank = $("me-rank");
    rank.textContent = mine && mine.pos ? "#" + mine.pos : "-";
    rank.title = mine && mine.outside ? "Outside the top " + mine.outside : "";
    var top = $("me-top"), topRows = (myRows || []).slice(0, 3);
    top.textContent = "";
    topRows.forEach(function (r) {
      var li = OSU.el("li");
      li.appendChild(OSU_FIGHTER_EL(r.fighter, 28));
      li.appendChild(OSU.el("span", "me-top-name", OSU_FIGHTER(r.fighter)));
      li.appendChild(OSU.el("span", "me-top-pts", OSU.fmtNum(r.total)));
      top.appendChild(li);
    });
    top.parentNode.classList.toggle("hidden", !topRows.length);
    markMe();
    $("me-status").classList.add("hidden");
    $("me-content").classList.remove("hidden");
  }
  function loadMe() {
    if (!A || !me) return;
    var s = A.get();
    if (!s) { myRows = null; myErr = null; myFor = null; paintMe(); return; }
    if (busy || myFor === s.sub) { paintMe(); return; }
    busy = true;
    paintMe();
    A.myMastery().then(function (r) {
      busy = false; myFor = s.sub; myRows = r || []; myErr = null;
      paintMe();
    }, function (e) {
      busy = false; myFor = s.sub; myRows = []; myErr = e || true;
      paintMe();
    });
  }
  if (A && me) {
    window.addEventListener("osu-account", loadMe);
    window.addEventListener("storage", function (e) { if (e.key === A.KEY || e.key === null) loadMe(); });
    loadMe();
  }

  OSU.loadMastery().then(function (d) {
    data = d;
    var t = d.updated && OSU.fmtTime(d.updated);
    if (t) $("updated").textContent = "Updated " + t;
    if (!d.total.length) {
      status.textContent = "No mastery points yet. The list fills in once players have finished online matches and the next update has run.";
      paintMe();
      return;
    }
    Object.keys(d.fighters).filter(function (k) { return Array.isArray(d.fighters[k]) && d.fighters[k].length; }).sort(function (a, b) {
      return OSU_FIGHTER(a).localeCompare(OSU_FIGHTER(b));
    }).forEach(function (k) {
      var o = OSU.el("option", null, OSU_FIGHTER(k));
      o.value = k;
      select.appendChild(o);
    });
    var want = (location.hash.match(/^#fighter=([a-z0-9_]{2,32})$/) || [])[1];
    if (want && d.fighters[want]) select.value = want;
    select.addEventListener("change", function () {
      show(select.value);
      try { history.replaceState(null, "", select.value ? "#fighter=" + select.value : location.pathname); } catch (e) { /* ignore */ }
    });
    status.classList.add("hidden");
    content.classList.remove("hidden");
    $("credit").appendChild(OSU_ICON_CREDIT());
    paintMe();
    show(select.value);
  }).catch(function () {
    status.textContent = "Mastery points are not available right now. Try again in a few minutes.";
  });
});
