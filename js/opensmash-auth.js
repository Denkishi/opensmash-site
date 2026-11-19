/* Sign in with the shared OpenSmash / SSBU Arena account (Supabase Auth OAuth 2.1 server).
   This site is a public OAuth client: authorization code + PKCE (S256), no secret, no supabase-js, no server.
   The player never types a password here: "Sign in" goes to account.opensmashultimate.com and comes back to
   auth/callback/ with a one-time code, which is exchanged for this site's own access + refresh token.
   Session: localStorage "osu_account" = {access, exp (ms), refresh, sub, profile}. A sign-in in progress
   (verifier, state, next, time) lives in sessionStorage "osu_account_pending" until the callback has used it.
   Refresh tokens rotate and work once, so only one refresh runs at a time (Web Locks across tabs). */
(function () {
  "use strict";
  var CLIENT_ID = "4579e1c5-2c06-4247-bbde-ed266f13088b";
  var SITE_URL = "https://denkishi.github.io/opensmash-site/";
  var PROJECT = "https://gnufjvqwynxmudpgrded.supabase.co";
  var AUTHORIZE = PROJECT + "/auth/v1/oauth/authorize";
  var TOKEN = PROJECT + "/auth/v1/oauth/token";
  var PROFILES = PROJECT + "/rest/v1/profiles";
  var PUBLISHABLE_KEY = "sb_publishable_v5DkzLiVBpTnDMy6BdpI7A_rqZSSQWz";
  var CENTRAL = "https://account.opensmashultimate.com";
  var MANAGE_URL = CENTRAL + "/account";
  var KEY = "osu_account", PENDING = "osu_account_pending";
  var SKEW_MS = 60000, PENDING_MAX_MS = 10 * 60 * 1000;

  /* The redirect URI is a constant. The only exception: a local server (localhost / 127.0.0.1), whose exact
     redirect URI the team has to register as well. */
  function isLocal() {
    var h = window.location && window.location.hostname;
    return h === "localhost" || h === "127.0.0.1";
  }
  function redirectUri() { return (isLocal() ? window.location.origin + "/" : SITE_URL) + "auth/callback/"; }

  function configured() {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(CLIENT_ID);
  }

  /* `next` is a plain path inside this site ("", "account/"), never a URL. */
  function cleanNext(n) {
    n = typeof n === "string" ? n : "";
    if (n.length > 100 || !/^[A-Za-z0-9][A-Za-z0-9_\-\/.]*$/.test(n) || n.indexOf("..") >= 0 || n.indexOf("//") >= 0) return "";
    return n;
  }

  function b64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function rand32() { var a = new Uint8Array(32); window.crypto.getRandomValues(a); return b64url(a); }

  function store(name) { try { return window[name] || null; } catch (e) { return null; } }
  function sget(area, k) { var s = store(area); if (!s) return null; try { return s.getItem(k); } catch (e) { return null; } }
  function sset(area, k, v) { var s = store(area); if (!s) return false; try { s.setItem(k, v); return true; } catch (e) { return false; } }
  function sdel(area, k) { var s = store(area); if (s) { try { s.removeItem(k); } catch (e) { /* ignore */ } } }
  function changed() { try { window.dispatchEvent(new Event("osu-account")); } catch (e) { /* ignore */ } }

  function get() {
    var raw = sget("localStorage", KEY);
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (s && typeof s === "object" && s.refresh && s.sub) return s;
    } catch (e) { /* corrupt: drop it */ }
    sdel("localStorage", KEY);
    return null;
  }
  function put(s) { return sset("localStorage", KEY, JSON.stringify(s)); }
  function profile() { var s = get(); return s && s.profile || null; }
  function signedIn() { return !!get(); }
  function valid(s) { return !!(s && s.access && s.exp > Date.now() + SKEW_MS); }

  function subOf(jwt) {
    try {
      var p = String(jwt).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (p.length % 4) p += "=";
      var sub = JSON.parse(atob(p)).sub;
      return typeof sub === "string" && sub ? sub : null;
    } catch (e) { return null; }
  }

  function postToken(params) {
    return window.fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "apikey": PUBLISHABLE_KEY },
      body: new URLSearchParams(params).toString()
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j || {} }; });
    });
  }

  function startSignIn(next) {
    return Promise.resolve().then(function () {
      if (!configured()) throw new Error("Sign-in is not set up on this site yet.");
      if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues) throw new Error("This browser cannot sign in (Web Crypto is missing).");
      var verifier = rand32(), state = rand32();
      return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)).then(function (hash) {
        var ok = sset("sessionStorage", PENDING, JSON.stringify({ verifier: verifier, state: state, next: cleanNext(next), at: Date.now() }));
        if (!ok) throw new Error("This browser blocks the storage the sign-in needs. Allow site data for this page and try again.");
        var q = new URLSearchParams({
          response_type: "code", client_id: CLIENT_ID, redirect_uri: redirectUri(), scope: "email",
          state: state, code_challenge: b64url(new Uint8Array(hash)), code_challenge_method: "S256"
        });
        window.location.href = AUTHORIZE + "?" + q.toString();
      });
    });
  }

  /* Steps 5 and 6. The callback page has already removed the query from the address bar. */
  function finishSignIn(search) {
    var raw = sget("sessionStorage", PENDING);
    sdel("sessionStorage", PENDING); // one use, whatever happens next
    var pend = null;
    try { pend = raw ? JSON.parse(raw) : null; } catch (e) { pend = null; }
    var q = new URLSearchParams(typeof search === "string" ? search : "");
    var state = q.get("state");
    if (!pend || typeof pend.state !== "string" || typeof pend.verifier !== "string" || typeof pend.at !== "number" ||
        !(Date.now() - pend.at <= PENDING_MAX_MS) || !state || state !== pend.state) {
      return Promise.resolve({ ok: false, reason: "not-yours" });
    }
    var err = q.get("error"), code = q.get("code");
    if (err) return Promise.resolve({ ok: false, reason: err === "access_denied" ? "cancelled" : "failed" });
    if (!code) return Promise.resolve({ ok: false, reason: "failed" });
    return postToken({
      grant_type: "authorization_code", code: code, client_id: CLIENT_ID, redirect_uri: redirectUri(), code_verifier: pend.verifier
    }).then(function (res) {
      var sub = res.ok && res.j.access_token && res.j.refresh_token ? subOf(res.j.access_token) : null;
      if (!sub) return { ok: false, reason: "failed" };
      var saved = put({ access: res.j.access_token, exp: Date.now() + (Number(res.j.expires_in) || 3600) * 1000, refresh: res.j.refresh_token, sub: sub, profile: null });
      if (!saved) return { ok: false, reason: "failed" };
      changed();
      return { ok: true, next: cleanNext(pend.next) };
    }, function () { return { ok: false, reason: "failed" }; });
  }

  var inflight = null;
  /* Refresh with the rotating refresh token. Resolves to the session. Rejects with .fatal=true when the service
     refuses the refresh token (400/401: the session is cleared), .fatal=false for a network / 5xx problem (kept). */
  function refresh() {
    if (inflight) return inflight;
    function run() {
      var s = get();
      if (!s) { var e0 = new Error("signed out"); e0.fatal = true; return Promise.reject(e0); }
      if (valid(s)) return Promise.resolve(s); // another tab refreshed while we waited for the lock
      return postToken({ grant_type: "refresh_token", refresh_token: s.refresh, client_id: CLIENT_ID }).then(function (res) {
        if (res.ok && res.j.access_token && res.j.refresh_token) {
          var n = { access: res.j.access_token, exp: Date.now() + (Number(res.j.expires_in) || 3600) * 1000, refresh: res.j.refresh_token, sub: s.sub, profile: s.profile || null };
          put(n); // the old refresh token is dead: store the new one every time
          return n;
        }
        var err = new Error("The session could not be refreshed (" + (res.j.error || res.status) + ").");
        err.fatal = res.status === 400 || res.status === 401;
        if (err.fatal) { sdel("localStorage", KEY); changed(); }
        throw err;
      }, function (e) { e.fatal = false; throw e; });
    }
    var locks = window.navigator && window.navigator.locks;
    var p = locks && locks.request ? locks.request("osu-account-refresh", run) : run();
    inflight = Promise.resolve(p).then(function (v) { inflight = null; return v; }, function (e) { inflight = null; throw e; });
    return inflight;
  }

  /* A valid access token (refreshing when under a minute is left), or null when signed out. */
  function token() {
    var s = get();
    if (!s) return Promise.resolve(null);
    if (valid(s)) return Promise.resolve(s.access);
    return refresh().then(function (n) { return n.access; }, function (e) { if (e.fatal) return null; throw e; });
  }

  /* A request to the shared project as the signed-in player (publishable key + the access token). After a 401: one
     refresh, one retry; if still refused the session ends. Resolves to the Response, or null when signed out. */
  function authed(url, init) {
    init = init || {};
    function once(t) {
      var h = { "apikey": PUBLISHABLE_KEY, "Authorization": "Bearer " + t };
      if (init.json) h["Content-Type"] = "application/json";
      var o = { headers: h };
      if (init.method) o.method = init.method;
      if (init.json) o.body = JSON.stringify(init.json);
      return window.fetch(url, o);
    }
    return token().then(function (t) {
      if (!t || !get()) return null;
      return once(t).then(function (r) {
        if (r.status !== 401) return r;
        var cur = get(); if (cur) { cur.exp = 0; put(cur); } // force one refresh, then retry once
        return refresh().then(function (n) { return once(n.access); }, function (e) { if (e.fatal) return null; throw e; });
      });
    }).then(function (r) {
      if (r && r.status === 401) { sdel("localStorage", KEY); changed(); return null; }
      return r;
    });
  }

  function fetchProfile() {
    var s0 = get();
    if (!s0) return Promise.resolve(null);
    return authed(PROFILES + "?select=id,username,tag,elo,created_at&id=eq." + encodeURIComponent(s0.sub)).then(function (r) {
      if (!r) return null;
      if (!r.ok) throw new Error("The account service answered HTTP " + r.status + ".");
      return r.json().then(function (rows) {
        var p = Array.isArray(rows) && rows[0];
        if (!p) throw new Error("Your profile was not found.");
        p = { id: p.id, username: p.username, tag: p.tag, elo: p.elo, created_at: p.created_at };
        var s = get();
        if (!s) return null; // signed out meanwhile
        s.profile = p; put(s); changed();
        return p;
      });
    });
  }

  /* Mastery points (Global Mastery Points, GMP) live in the shared project: the one copy that sums every region (EU, NA East)
     and SSBU Arena, so this site and Arena's show the same numbers. */
  var FIGHTER_RE = /^[a-z0-9_]{1,32}$/;
  function num(v) { var x = Number(v); return v !== null && v !== "" && typeof v !== "boolean" && isFinite(x) && x >= 0 ? Math.floor(x) : 0; }
  function numOrNull(v) { return v == null || v === "" ? null : num(v); }
  function rpcError(r) {
    if (r.status === 404) { var e = new Error("Mastery points are not available yet."); e.missing = true; return e; }
    return new Error("The account service answered HTTP " + r.status + ".");
  }

  /* The public board, anyone (publishable key only): public.opensmash_mastery_board(p_fighter, p_limit, p_offset).
     Resolves to {rows: [{pos, id, name (null: hidden), tag, main_fighter, total, games}], count: total_count or null}. */
  function masteryBoard(fighter, limit, offset) {
    var body = { p_fighter: fighter && FIGHTER_RE.test(fighter) ? fighter : null,
                 p_limit: Math.max(1, Math.min(100, Math.floor(Number(limit) || 50))), p_offset: Math.max(0, Math.floor(Number(offset) || 0)) };
    return window.fetch(PROJECT + "/rest/v1/rpc/opensmash_mastery_board", {
      method: "POST", headers: { "apikey": PUBLISHABLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw rpcError(r);
      return r.json().then(function (rows) {
        if (!Array.isArray(rows)) throw new Error("The account service sent an unexpected answer.");
        var count = null, out = [];
        rows.forEach(function (x) {
          if (!x || typeof x !== "object" || typeof x.id !== "string" || !/^[0-9a-f]{16}$/.test(x.id) || !(num(x.pos) > 0)) return;
          if (count === null && x.total_count != null) count = num(x.total_count);
          out.push({ pos: num(x.pos), id: x.id, name: typeof x.name === "string" && x.name.trim() ? x.name.trim().slice(0, 64) : null,
                     tag: x.tag == null ? null : num(x.tag), main_fighter: typeof x.main_fighter === "string" && FIGHTER_RE.test(x.main_fighter) ? x.main_fighter : null,
                     total: num(x.total), games: num(x.games) });
        });
        return { rows: out, count: count };
      });
    });
  }

  /* The signed-in player's points per fighter, every region and SSBU Arena summed (public.my_opensmash_mastery()).
     Resolves to [{fighter, points, veteran, total, games, wins, updated_at, points_opensmash, points_arena}] sorted by
     total, or null when signed out. Rejects with .missing = true while the function is not deployed. */
  function myMastery() {
    return authed(PROJECT + "/rest/v1/rpc/my_opensmash_mastery", { method: "POST", json: {} }).then(function (r) {
      if (!r) return null;
      if (!r.ok) throw rpcError(r);
      return r.json().then(function (rows) {
        if (!Array.isArray(rows)) throw new Error("The account service sent an unexpected answer.");
        return rows.filter(function (x) { return x && typeof x.fighter === "string" && FIGHTER_RE.test(x.fighter); }).map(function (x) {
          var points = num(x.points), veteran = num(x.veteran);
          return { fighter: x.fighter, points: points, veteran: veteran, total: x.total == null ? points + veteran : num(x.total), games: num(x.games),
                   wins: num(x.wins), updated_at: typeof x.updated_at === "string" ? x.updated_at : null,
                   points_opensmash: numOrNull(x.points_opensmash), points_arena: numOrNull(x.points_arena) };
        }).sort(function (a, b) { return b.total - a.total || a.fighter.localeCompare(b.fighter); });
      });
    });
  }

  /* The signed-in player's place on the overall board (public.my_opensmash_mastery_rank()): {pos, id, total, total_count,
     main_fighter}; null when signed out or without points. Rejects with .missing = true while it is not deployed. */
  function myMasteryRank() {
    return authed(PROJECT + "/rest/v1/rpc/my_opensmash_mastery_rank", { method: "POST", json: {} }).then(function (r) {
      if (!r) return null;
      if (!r.ok) throw rpcError(r);
      return r.json().then(function (d) {
        var x = Array.isArray(d) ? d[0] : d;
        if (!x || typeof x !== "object" || !(num(x.pos) > 0)) return null;
        return { pos: num(x.pos), id: typeof x.id === "string" ? x.id : null, total: num(x.total), total_count: numOrNull(x.total_count),
                 main_fighter: typeof x.main_fighter === "string" && FIGHTER_RE.test(x.main_fighter) ? x.main_fighter : null };
      });
    });
  }

  function displayName(p) {
    if (!p || !p.username) return "";
    var t = p.tag == null ? "" : String(p.tag);
    while (t && t.length < 4) t = "0" + t;
    return p.username + (t ? "#" + t : "");
  }

  function signOut() {
    sdel("localStorage", KEY);
    sdel("sessionStorage", PENDING);
    changed();
  }

  function signInLink(next) {
    return CENTRAL + "/login?return_to=" + encodeURIComponent(SITE_URL + cleanNext(next));
  }
  function signUpLink(next, thenSignIn) {
    var back = SITE_URL + cleanNext(next) + (thenSignIn ? "?signin=1" : "");
    return CENTRAL + "/signup?return_to=" + encodeURIComponent(back);
  }

  window.OpenSmashAuth = {
    KEY: KEY, manageUrl: MANAGE_URL,
    configured: configured, startSignIn: startSignIn, finishSignIn: finishSignIn,
    signedIn: signedIn, get: get, profile: profile, token: token, fetchProfile: fetchProfile, myMastery: myMastery,
    myMasteryRank: myMasteryRank, masteryBoard: masteryBoard,
    displayName: displayName, signOut: signOut, signInLink: signInLink, signUpLink: signUpLink
  };
})();
