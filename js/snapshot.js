/* Live snapshots (status.json, leaderboard.json). The lobby is plain HTTP and this site is HTTPS, so a workflow copies
   the lobby's JSON to the `data` branch every few minutes; we read it from raw.githubusercontent.com (CORS enabled)
   and fall back to the copy served next to the page by GitHub Pages. */
(function () {
  "use strict";
  function getJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  /* name: "status.json"; localPrefix: "" on the home page, "../" in a sub-folder. */
  function load(name, localPrefix) {
    var base = (window.OSU_CONFIG || {}).DATA_BASE;
    var local = function () { return getJson((localPrefix || "") + name); };
    if (!base) return local();
    // raw.githubusercontent caches each URL for 5 minutes; a per-minute query keeps the age honest.
    return getJson(base + name + "?t=" + Math.floor(Date.now() / 60000)).then(function (d) {
      if (!d || typeof d !== "object") throw new Error("bad file");
      return d;
    }).catch(local);
  }
  /* "just now" / "5 min ago" / "3 h ago" / "2 d ago", or null for a bad date. */
  function ago(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return null;
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return { min: m, text: m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago" };
  }
  window.OSUData = { load: load, ago: ago };
})();
