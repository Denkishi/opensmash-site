/* Live snapshots (status.json, mastery.json). The lobbies are plain HTTP and this site is HTTPS, so a workflow copies
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
  /* status.json can come straight from the official lobbies, live to the second, once each of them is reachable over
     HTTPS (OSU_CONFIG.LOBBY_HTTPS: {region: "https://host/"}). They already send Access-Control-Allow-Origin: *, but serve
     plain HTTP only, and an HTTPS page may not read an http:// address (mixed content): until then LOBBY_HTTPS is empty and
     the page reads the snapshot. The live answer has the snapshot's shape: summed counts plus "regions". After a failure
     the live read is skipped for 5 minutes so an unreachable lobby costs one short request, not one per refresh. */
  var lobbyDownUntil = 0;
  var COUNT_KEYS = ["online", "rooms", "arenas", "open_rooms", "playing"];
  function getJsonTimeout(url, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    return fetch(url, { cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function liveLobbies() {
    var l = (window.OSU_CONFIG || {}).LOBBY_HTTPS, out = [];
    if (!l || typeof l !== "object") return out;
    Object.keys(l).forEach(function (r) {
      var u = l[r];
      if (typeof u === "string" && (/^https:\/\//.test(u) || (location.protocol === "http:" && /^http:\/\//.test(u)))) out.push([r, u.replace(/\/?$/, "/")]);
    });
    return out;
  }
  function fromLobby(name) {
    var lobbies = name === "status.json" ? liveLobbies() : [];
    if (!lobbies.length || Date.now() < lobbyDownUntil) return Promise.reject(new Error("skip"));
    return Promise.all(lobbies.map(function (l) {
      return getJsonTimeout(l[1] + name, 4000).then(function (d) {
        if (!d || typeof d.online !== "number") throw new Error("bad file");
        return d;
      }, function () { return null; });
    })).then(function (docs) {
      if (!docs.some(Boolean)) throw new Error("no lobby");
      var out = { updated: new Date().toISOString(), up: true, regions: {} }; // live: the answer is from this moment
      COUNT_KEYS.forEach(function (k) { out[k] = 0; });
      docs.forEach(function (d, i) {
        var reg = { up: !!d };
        if (d) COUNT_KEYS.forEach(function (k) { var n = Number(d[k]) || 0; reg[k] = n; out[k] += n; });
        if (d && d.matches && typeof d.matches.total === "number") {
          reg.matches = { total: d.matches.total, today: Number(d.matches.today) || 0 };
          out.matches = out.matches || { total: 0, today: 0 };
          out.matches.total += reg.matches.total; out.matches.today += reg.matches.today;
        }
        out.regions[lobbies[i][0]] = reg;
      });
      return out;
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
