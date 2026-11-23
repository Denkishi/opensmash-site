/* Mastery page (leaderboard/): Global Mastery Points (GMP) from the shared account project, the one copy that sums every
   region and SSBU Arena (OpenSmashAuth.masteryBoard: public.opensmash_mastery_board). Columns: # | fighter icon | player | GMP.
   The list is read 50 rows at a time (p_limit 50, p_offset); the next 50 come when the end of the table scrolls into view.
   The fighter list (p_fighter) uses the same paging. Signed in, the player's own status comes first
   (OpenSmashAuth.myMastery + myMasteryRank). */
document.addEventListener("DOMContentLoaded", function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var A = window.OpenSmashAuth;
  var PAGE = 50, MARGIN = 600; // rows per request; px before the end of the table at which the next ones are read
  var status = $("status"), content = $("content"), select = $("fighter"), rows = $("rows"), more = $("more"), count = $("count");
  var listKey = "", loaded = 0, total = null, done = false, busy = false, gen = 0, failed = false;
  var mineId = null; // the signed-in player's opaque board id (my_opensmash_mastery_rank), for the highlighted row

  if (!A || !A.masteryBoard) { status.textContent = "Mastery points are not available right now."; return; }

  function row(p) {
    var tr = OSU.el("tr");
    tr._id = p.id;
    if (mineId && listKey === "" && p.id === mineId) tr.className = "me";
    tr.appendChild(OSU.el("td", "pos", String(p.pos)));
    var fc = OSU.el("td", "ficon-cell");
    fc.appendChild(OSU_FIGHTER_EL(listKey || p.main_fighter || ""));
    tr.appendChild(fc);
    var who = OSU.el("td", "pname", p.name || "Anonymous");
    if (p.name && p.tag != null) who.appendChild(OSU.el("span", "ptag", "#" + ("000" + p.tag).slice(-4)));
    tr.appendChild(who);
    tr.appendChild(OSU.el("td", "num", OSU.fmtNum(p.total)));
    return tr;
  }
  function markMe() {
    Array.prototype.forEach.call(rows.children, function (tr) { tr.classList.toggle("me", !!(mineId && listKey === "" && tr._id === mineId)); });
  }
  function showCount() {
    if (failed) { count.textContent = "Could not read more rows. Scroll again to retry."; return; }
    count.textContent = loaded && (total || 0) > PAGE ? "Showing " + loaded + " of " + total : "";
  }

  /* Read the next PAGE rows while the end of the table is within MARGIN px of the screen. */
  function nearEnd() { return more.getBoundingClientRect().top < window.innerHeight + MARGIN; }
  function next() {
    if (busy || done) return;
    busy = true;
    var mine = gen, key = listKey;
    A.masteryBoard(key || null, PAGE, loaded).then(function (res) {
      if (mine !== gen) return;
      busy = false; failed = false;
      if (res.count !== null) total = res.count;
      var frag = document.createDocumentFragment();
      res.rows.forEach(function (p) { frag.appendChild(row(p)); });
      rows.appendChild(frag);
      loaded += res.rows.length;
      done = res.rows.length < PAGE || (total !== null && loaded >= total);
      if (total === null && done) total = loaded;
      if (!loaded) {
        status.textContent = key ? "No points with " + OSU_FIGHTER(key) + " yet." : "No mastery points yet. Finish an online match to be the first.";
        status.classList.remove("hidden");
      } else status.classList.add("hidden");
      content.classList.remove("hidden");
      content.querySelector(".table-wrap").classList.toggle("hidden", !loaded);
      showCount();
      if (!done && nearEnd()) next();
    }, function (e) {
      if (mine !== gen) return;
      busy = false;
      if (!loaded) {
        status.textContent = e && e.missing ? "Mastery points are not available yet." : "Mastery points are not available right now. Try again in a few minutes.";
        status.classList.remove("hidden");
      } else { failed = true; showCount(); }
    });
  }
  var io = window.IntersectionObserver ? new IntersectionObserver(function (es) {
    if (es.some(function (e) { return e.isIntersecting; })) next();
  }, { rootMargin: "0px 0px " + MARGIN + "px 0px" }) : null;
  if (io) io.observe(more);
  else window.addEventListener("scroll", function () { if (nearEnd()) next(); }, { passive: true });

  function show(key) {
    gen++;
    listKey = key || ""; loaded = 0; total = null; done = false; busy = false; failed = false;
    rows.textContent = "";
    showCount();
    next();
  }

  /* ---- The signed-in player's own status ---- */
  var me = $("me"), myFor = null, myBusy = false;
  function meSay(msg) {
    $("me-status").textContent = msg;
    $("me-status").classList.remove("hidden");
    $("me-content").classList.add("hidden");
  }
  function paintMe(fighters, rank, err) {
    var sum = (fighters || []).reduce(function (s, r) { return s + r.total; }, 0);
    mineId = rank && rank.id || null;
    markMe();
    if (!rank && !sum) {
      meSay(err ? "Your mastery is not available right now." : "No GMP yet. Finish an online match to earn your first points.");
      return;
    }
    var main = rank && rank.main_fighter || (fighters && fighters.length ? fighters[0].fighter : null);
    $("me-name").textContent = A.displayName(A.profile()) || "You";
    var slot = $("me-main");
    slot.textContent = "";
    slot.appendChild(OSU_FIGHTER_EL(main, 56));
    $("me-main-name").textContent = main ? "Main: " + OSU_FIGHTER(main) : "";
    $("me-total").textContent = OSU.fmtNum(rank ? rank.total : sum);
    $("me-rank").textContent = rank ? "#" + rank.pos : "-";
    $("me-of").textContent = rank && rank.total_count ? "of " + OSU.fmtNum(rank.total_count) : "";
    var top = $("me-top"), topRows = (fighters || []).slice(0, 3);
    top.textContent = "";
    topRows.forEach(function (r) {
      var li = OSU.el("li");
      li.appendChild(OSU_FIGHTER_EL(r.fighter, 28));
      li.appendChild(OSU.el("span", "me-top-name", OSU_FIGHTER(r.fighter)));
      li.appendChild(OSU.el("span", "me-top-pts", OSU.fmtNum(r.total)));
      top.appendChild(li);
    });
    top.parentNode.classList.toggle("hidden", !topRows.length);
    $("me-status").classList.add("hidden");
    $("me-content").classList.remove("hidden");
  }
  function loadMe() {
    var s = A.get();
    me.classList.toggle("hidden", !s);
    if (!s) { myFor = null; mineId = null; markMe(); return; }
    if (myBusy || myFor === s.sub) { if (myFor === s.sub) $("me-name").textContent = A.displayName(A.profile()) || "You"; return; }
    myBusy = true;
    meSay("Loading your mastery…");
    var soft = function (p) { return p.then(function (v) { return { v: v }; }, function (e) { return { e: e || true }; }); };
    Promise.all([soft(A.myMastery()), soft(A.myMasteryRank ? A.myMasteryRank() : Promise.resolve(null))]).then(function (got) {
      myBusy = false;
      if (!A.get()) { me.classList.add("hidden"); return; }
      myFor = s.sub;
      paintMe(got[0].v || [], got[1].v || null, got[0].e && got[1].e);
    });
  }
  if (me) {
    window.addEventListener("osu-account", loadMe);
    window.addEventListener("storage", function (e) { if (e.key === A.KEY || e.key === null) loadMe(); });
    loadMe();
  }

  OSU_FIGHTER_KEYS.forEach(function (k) {
    var o = OSU.el("option", null, OSU_FIGHTER(k));
    o.value = k;
    select.appendChild(o);
  });
  var want = (location.hash.match(/^#fighter=([a-z0-9_]{2,32})$/) || [])[1];
  if (want && OSU_FIGHTER_KEYS.indexOf(want) >= 0) select.value = want;
  select.addEventListener("change", function () {
    show(select.value);
    try { history.replaceState(null, "", select.value ? "#fighter=" + select.value : location.pathname); } catch (e) { /* ignore */ }
  });
  $("credit").appendChild(OSU_ICON_CREDIT());
  show(select.value);
});
