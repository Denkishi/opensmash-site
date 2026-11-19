/* GSP archive page (leaderboard/gsp/): the GSP leaderboard as it was when it was frozen (gsp_archive.json on the `data`
   branch, copied once by .github/scripts/leaderboard.py). Read only: GSP is no longer updated here. */
document.addEventListener("DOMContentLoaded", function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var status = $("status"), content = $("content"), select = $("fighter"), head = $("head"), rows = $("rows");
  var data = null;

  /* The Discord profile picture the lobby lists (only for players who show their name), else the initial. */
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
  function playerCell(p) {
    var td = OSU.el("td"), box = OSU.el("div", "player");
    box.appendChild(avatar(p));
    box.appendChild(OSU.el("span", null, p.name || "Anonymous"));
    td.appendChild(box);
    return td;
  }
  function headRow(cols) {
    head.textContent = "";
    cols.forEach(function (c) { head.appendChild(OSU.el("th", c[1], c[0])); });
  }

  function showOverall() {
    headRow([["#", ""], ["Player", ""], ["Best fighter", ""], ["GSP", "num"]]);
    rows.textContent = "";
    data.players.forEach(function (p) {
      var tr = OSU.el("tr");
      tr.appendChild(OSU.el("td", "pos", "#" + p.rank));
      tr.appendChild(playerCell(p));
      tr.appendChild(OSU.el("td", null, p.fighter != null ? OSU.fighterName(data, p.fighter) : "-"));
      tr.appendChild(OSU.el("td", "num", String(p.gsp)));
      rows.appendChild(tr);
    });
  }
  function showFighter(kind) {
    var f = data.fighters[kind];
    headRow([["#", ""], ["Player", ""], ["GSP with " + f.name, "num"]]);
    rows.textContent = "";
    (f.top || []).forEach(function (p) {
      var tr = OSU.el("tr");
      tr.appendChild(OSU.el("td", "pos", "#" + p.rank));
      tr.appendChild(playerCell(p));
      tr.appendChild(OSU.el("td", "num", String(p.gsp)));
      rows.appendChild(tr);
    });
  }

  OSU.loadGspArchive("../../").then(function (d) {
    data = d;
    if (!d.players.length) {
      $("note").classList.add("hidden");
      status.textContent = "The GSP archive is empty.";
      return;
    }
    var frozen = d.frozen || d.updated, t = frozen && new Date(frozen);
    if (t && !isNaN(t)) $("updated").textContent = (d.frozen ? "Frozen on " : "Last update ") + t.toLocaleDateString(undefined, { dateStyle: "long" });
    Object.keys(d.fighters).sort(function (a, b) {
      return d.fighters[a].name.localeCompare(d.fighters[b].name);
    }).forEach(function (k) {
      var o = OSU.el("option", null, d.fighters[k].name);
      o.value = k;
      select.appendChild(o);
    });
    select.addEventListener("change", function () { if (select.value) showFighter(select.value); else showOverall(); });
    status.classList.add("hidden");
    content.classList.remove("hidden");
    showOverall();
  }).catch(function () {
    status.textContent = "The GSP archive is not available right now. Try again in a few minutes.";
  });
});
