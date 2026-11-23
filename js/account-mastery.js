/* Account page: the signed-in player's own Global Mastery Points per fighter (OpenSmashAuth.myMastery(): the RPC
   my_opensmash_mastery() on the shared account project: every region and SSBU Arena summed, with the OpenSmash / Arena
   split) and the place on the board (myMasteryRank()). Points only: no levels, no tiers. */
(function () {
  "use strict";
  var A = window.OpenSmashAuth;
  var $ = function (id) { return document.getElementById(id); };
  var panel = $("my-mastery");
  if (!A || !panel || !A.myMastery) return;
  var busy = false, shownFor = null;

  function say(msg) {
    $("my-status").textContent = msg;
    $("my-status").classList.remove("hidden");
    $("my-content").classList.add("hidden");
  }
  function render(rows, rank) {
    var body = $("my-rows"), total = 0;
    body.textContent = "";
    rows.forEach(function (r) {
      total += r.total;
      var tr = OSU.el("tr");
      tr.appendChild(OSU.el("td", null, OSU_FIGHTER(r.fighter)));
      var pts = OSU.el("td", "num", OSU.fmtNum(r.total));
      if (r.veteran > 0) {
        pts.title = OSU.fmtNum(r.points) + " from matches + " + OSU.fmtNum(r.veteran) + " veteran bonus";
        pts.appendChild(OSU.el("span", "vet", "incl. veteran"));
      }
      tr.appendChild(pts);
      tr.appendChild(OSU.el("td", "num split", r.points_opensmash == null ? "-" : OSU.fmtNum(r.points_opensmash)));
      tr.appendChild(OSU.el("td", "num split", r.points_arena == null ? "-" : OSU.fmtNum(r.points_arena)));
      tr.appendChild(OSU.el("td", "num", OSU.fmtNum(r.games)));
      body.appendChild(tr);
    });
    $("my-total").textContent = OSU.fmtNum(rank ? Math.max(rank.total, total) : total);
    $("my-rank").textContent = rank ? "Rank #" + OSU.fmtNum(rank.pos) + (rank.total_count ? " of " + OSU.fmtNum(rank.total_count) : "") : "";
    $("my-status").classList.add("hidden");
    $("my-content").classList.remove("hidden");
  }
  function load() {
    var s = A.get();
    panel.classList.toggle("hidden", !s);
    if (!s) { shownFor = null; return; }
    if (busy || shownFor === s.sub) return;
    busy = true;
    say("Loading…");
    var rank = A.myMasteryRank ? A.myMasteryRank().catch(function () { return null; }) : Promise.resolve(null);
    Promise.all([A.myMastery(), rank]).then(function (got) {
      var rows = got[0];
      busy = false;
      if (rows === null) { panel.classList.add("hidden"); return; }
      shownFor = s.sub;
      if (!rows.length) { say("No mastery points yet. Finish an online match (Quickplay or Battle Arena, 1 vs 1) or a match in SSBU Arena to earn your first ones; points are updated every hour."); return; }
      render(rows, got[1]);
    }, function (e) {
      busy = false;
      say(e && e.missing ? "Mastery points are not available yet. They will show here once the update is live." : "Could not read your mastery points: " + (e && e.message || "error") + " Try again later.");
    });
  }
  window.addEventListener("osu-account", load);
  window.addEventListener("storage", function (e) { if (e.key === A.KEY || e.key === null) load(); });
  load();
})();
