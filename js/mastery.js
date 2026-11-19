/* Mastery page (leaderboard/): renders mastery.json (written by .github/scripts/leaderboard.py from every lobby's
   /mastery.json, points summed over the regions). Points only: engagement, not skill, so no levels and no tiers. */
document.addEventListener("DOMContentLoaded", function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var status = $("status"), content = $("content"), select = $("fighter"), head = $("head"), rows = $("rows");
  var data = null;

  /* A Discord profile picture, only if the snapshot lists one; else the initial. */
  var AVATAR_RE = /^https:\/\/cdn\.discordapp\.com\/(avatars\/[0-9]+\/(a_)?[0-9a-f]{32}\.png\?size=64|embed\/avatars\/[0-5]\.png)$/;
  function initial(p) { return OSU.el("span", "initial", (p.name || "A").charAt(0).toUpperCase()); }
  function avatar(p) {
    if (typeof p.avatar !== "string" || !AVATAR_RE.test(p.avatar)) return initial(p);
    var img = document.createElement("img");
    img.className = "avatar";
    img.alt = "";
    img.width = img.height = 28;
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function () { if (img.parentNode) img.parentNode.replaceChild(initial(p), img); });
    img.src = p.avatar;
    return img;
  }
  function playerCell(p, sub) {
    var td = OSU.el("td"), box = OSU.el("div", "player"), who = OSU.el("span", null, p.name || "Anonymous");
    box.appendChild(avatar(p));
    if (sub) who.appendChild(OSU.el("small", "fn", sub));
    box.appendChild(who);
    td.appendChild(box);
    return td;
  }
  function pointsCell(p) {
    var total = typeof p.total === "number" ? p.total : (p.points || 0) + (p.veteran || 0);
    var td = OSU.el("td", "num", OSU.fmtNum(total));
    if (p.veteran > 0) td.title = OSU.fmtNum(p.points) + " from matches + " + OSU.fmtNum(p.veteran) + " veteran bonus";
    return td;
  }
  function headRow(cols) {
    head.textContent = "";
    cols.forEach(function (c) { head.appendChild(OSU.el("th", c[1], c[0])); });
  }
  function fill(list, withFighter) {
    rows.textContent = "";
    list.forEach(function (p, i) {
      var tr = OSU.el("tr");
      tr.appendChild(OSU.el("td", "pos", String(p.pos || i + 1)));
      tr.appendChild(playerCell(p, withFighter && p.fighter ? "Most played: " + OSU_FIGHTER(p.fighter) : null));
      tr.appendChild(pointsCell(p));
      rows.appendChild(tr);
    });
  }

  function show(key) {
    if (key && Array.isArray(data.fighters[key])) {
      headRow([["#", ""], ["Player", ""], [OSU_FIGHTER(key) + " points", "num"]]);
      fill(data.fighters[key], false);
    } else {
      headRow([["#", ""], ["Player", ""], ["Mastery points", "num"]]);
      fill(data.total, true);
    }
  }

  OSU.loadMastery().then(function (d) {
    data = d;
    var t = d.updated && OSU.fmtTime(d.updated);
    if (t) $("updated").textContent = "Updated " + t;
    if (!d.total.length) {
      $("note").classList.add("hidden");
      status.textContent = "No mastery points yet. The list fills in once players have finished online matches and the next update has run.";
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
    show(select.value);
  }).catch(function () {
    status.textContent = "Mastery points are not available right now. Try again in a few minutes.";
  });
});
