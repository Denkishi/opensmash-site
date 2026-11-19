/* Shared by the account, mastery, competitive and GSP archive pages: nav menu, small helpers. No dependencies, no tracking. */
(function () {
  "use strict";
  var toggle = document.querySelector(".nav-toggle"), menu = document.getElementById("nav-links");
  if (toggle && menu) {
    var close = function () { menu.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; };
    toggle.addEventListener("click", function () {
      var open = !menu.classList.contains("open");
      menu.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.classList.contains("open")) { close(); toggle.focus(); } });
  }
  var cfg = window.OSU_CONFIG || {};
  document.querySelectorAll("[data-link=repo]").forEach(function (a) { if (cfg.REPO_URL) a.href = cfg.REPO_URL; });
  document.querySelectorAll("[data-link=discord]").forEach(function (a) { if (cfg.DISCORD_URL) a.href = cfg.DISCORD_URL; });

  window.OSU = {
    /* Build an element; text is always set with textContent (names come from players: never innerHTML). */
    el: function (tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    },
    /* The frozen GSP list (gsp_archive.json; before the workflow has frozen it, the last leaderboard.json). */
    loadGspArchive: function (localPrefix) {
      function check(d) {
        if (!d || !Array.isArray(d.players)) throw new Error("bad file");
        d.fighters = d.fighters || {};
        return d;
      }
      return OSUData.load("gsp_archive.json", localPrefix).then(check).catch(function () {
        return OSUData.load("leaderboard.json", localPrefix).then(check);
      });
    },
    fmtNum: function (n) {
      return typeof n === "number" && isFinite(n) ? Math.floor(n).toLocaleString("en-US") : "-";
    },
    fighterName: function (data, kind) {
      var f = data.fighters && data.fighters[kind];
      return (f && f.name) || "Fighter " + kind;
    },
    discordAvatar: function (id, hash, size) {
      if (id && hash && /^[0-9]+$/.test(String(id)) && /^(a_)?[0-9a-f]+$/.test(String(hash))) {
        return "https://cdn.discordapp.com/avatars/" + id + "/" + hash + ".png?size=" + (size || 128);
      }
      return null;
    },
    defaultAvatar: function (id) {
      var n = 0;
      try { n = Number((BigInt(id) >> 22n) % 6n); } catch (e) { n = 0; }
      return "https://cdn.discordapp.com/embed/avatars/" + n + ".png";
    },
    fmtTime: function (iso) {
      var d = new Date(iso);
      if (isNaN(d)) return null;
      var a = OSUData.ago(iso);
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + (a ? " (" + a.text + ")" : "");
    }
  };
})();
