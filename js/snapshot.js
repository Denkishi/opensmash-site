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
  /* status.json can come straight from the lobby over HTTPS (Caddy in front of it, tools/deploy/CADDY.md in the game
     repository) which is live to the second. It is tried first; after a failure it is skipped for 5 minutes so an
     undeployed or unreachable lobby costs one short request, not one per refresh. */
  var LOBBY_DIRECT = { "status.json": true };
  var lobbyDownUntil = 0;
  function getJsonTimeout(url, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    return fetch(url, { cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function fromLobby(name) {
    var url = (window.OSU_CONFIG || {}).LOBBY_HTTPS;
    if (!url || !LOBBY_DIRECT[name] || Date.now() < lobbyDownUntil) return Promise.reject(new Error("skip"));
    return getJsonTimeout(url + name, 4000).then(function (d) {
      if (!d || typeof d.online !== "number") throw new Error("bad file");
      d.up = d.up !== false;
      d.updated = new Date().toISOString(); // live: the answer is from this moment
      return d;
    }).catch(function (e) { lobbyDownUntil = Date.now() + 300000; throw e; });
  }
  /* name: "status.json"; localPrefix: "" on the home page, "../" in a sub-folder. */
  function load(name, localPrefix) {
    var base = (window.OSU_CONFIG || {}).DATA_BASE;
    var local = function () { return getJson((localPrefix || "") + name); };
    var snapshot = function () {
      if (!base) return local();
      // raw.githubusercontent caches each URL for 5 minutes; a per-minute query keeps the age honest.
      return getJson(base + name + "?t=" + Math.floor(Date.now() / 60000)).then(function (d) {
        if (!d || typeof d !== "object") throw new Error("bad file");
        return d;
      }).catch(local);
    };
    return fromLobby(name).catch(snapshot);
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
