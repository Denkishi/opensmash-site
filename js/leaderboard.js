/* Leaderboard page: renders ../leaderboard.json (written by .github/scripts/leaderboard.py). */
document.addEventListener("DOMContentLoaded", function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var status = $("status"), content = $("content"), select = $("fighter"), head = $("head"), rows = $("rows");
  var data = null;

  function playerCell(p) {
    var td = OSU.el("td"), box = OSU.el("div", "player");
    var url = OSU.discordAvatar(p.discord_id, p.avatar, 64);
    if (url) {
      var img = OSU.el("img", "avatar sm");
      img.src = url; img.alt = ""; img.width = 28; img.height = 28; img.loading = "lazy";
      box.appendChild(img);
    } else {
      box.appendChild(OSU.el("span", "initial", (p.name || "?").charAt(0).toUpperCase()));
    }
    box.appendChild(OSU.el("span", null, p.name || "Player"));
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
      tr.appendChild(OSU.el("td", null, p.best_fighter != null ? OSU.fighterName(data, p.best_fighter) : "-"));
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

  OSU.loadBoard().then(function (d) {
    data = d;
    if (!d.players.length) {
      status.textContent = "No ranked players yet. The leaderboard fills in once players have played online and the first update has run.";
      return;
    }
    var t = d.updated && OSU.fmtTime(d.updated);
    if (t) $("updated").textContent = "Updated " + t;
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
    status.textContent = "The leaderboard is not available right now. Try again in a few minutes.";
  });
});
