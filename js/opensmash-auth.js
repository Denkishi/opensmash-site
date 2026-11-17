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

  function fetchProfile() {
    function once(t, sub) {
      return window.fetch(PROFILES + "?select=id,username,tag,elo,created_at&id=eq." + encodeURIComponent(sub), {
        headers: { "apikey": PUBLISHABLE_KEY, "Authorization": "Bearer " + t }
      });
    }
    return token().then(function (t) {
      var s = get();
      if (!t || !s) return null;
      return once(t, s.sub).then(function (r) {
        if (r.status !== 401) return r;
        var cur = get(); if (cur) { cur.exp = 0; put(cur); } // force one refresh, then retry once
        return refresh().then(function (n) { return once(n.access, n.sub); }, function (e) { if (e.fatal) return null; throw e; });
      });
    }).then(function (r) {
      if (!r) return null;
      if (r.status === 401) { sdel("localStorage", KEY); changed(); return null; }
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
    signedIn: signedIn, get: get, profile: profile, token: token, fetchProfile: fetchProfile,
    displayName: displayName, signOut: signOut, signInLink: signInLink, signUpLink: signUpLink
  };
})();
