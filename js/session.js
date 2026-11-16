/* Discord sign-in session shared by every page (top-bar button and account/).
   OAuth2 authorization code + PKCE (S256), public client, scope "identify": no server, no secret. Discord's token
   endpoint answers CORS requests from this origin and accepts the refresh_token grant from a PKCE public client with
   only client_id (it answers invalid_grant, not invalid_client, for a bad token).
   The session lives in localStorage under "osu_session" = {access, exp (ms), refresh, user:{id,username,global_name,avatar}}
   so it survives closing the tab. Discord rotates refresh tokens: every refresh replaces both tokens.
   Every storage access is wrapped: localStorage -> sessionStorage -> memory. The PKCE verifier/state of a login in
   progress stay in sessionStorage (this tab only) until the redirect comes back. */
(function () {
  "use strict";
  var CLIENT_ID = "1069217215540371466";
  var REDIRECT_URI = "https://denkishi.github.io/opensmash-site/account/";
  var API = "https://discord.com/api";
  var KEY = "osu_session", SKEW_MS = 60000;
  var LEGACY = ["osu_discord_token", "osu_discord_token_exp", "osu_nav_user"];
  var mem = {};

  function areas() {
    var out = [];
    ["localStorage", "sessionStorage"].forEach(function (n) { try { if (window[n]) out.push(window[n]); } catch (e) { /* blocked */ } });
    return out;
  }
  function read(k) {
    var a = areas();
    for (var i = 0; i < a.length; i++) { try { var v = a[i].getItem(k); if (v != null) return v; } catch (e) { /* try next */ } }
    return mem[k] == null ? null : mem[k];
  }
  function write(k, v) {
    var a = areas();
    for (var i = 0; i < a.length; i++) { try { a[i].setItem(k, v); return; } catch (e) { /* full or blocked: try next */ } }
    mem[k] = v;
  }
  function del(k) {
    areas().forEach(function (s) { try { s.removeItem(k); } catch (e) { /* ignore */ } });
    delete mem[k];
  }
  /* Short-lived login-in-progress values: sessionStorage first (survives the redirect in this tab). */
  function tmpSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { mem[k] = v; } }
  function tmpGet(k) { try { var v = sessionStorage.getItem(k); if (v != null) return v; } catch (e) { /* fall through */ } return mem[k] == null ? null : mem[k]; }
  function tmpDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } delete mem[k]; }

  function get() {
    var raw = read(KEY);
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (s && typeof s === "object" && (s.access || s.refresh)) return s;
    } catch (e) { /* corrupt: drop it */ }
    del(KEY);
    return null;
  }
  function put(s) { write(KEY, JSON.stringify(s)); }
  function cleanUser(u) {
    return u ? { id: u.id, username: u.username, global_name: u.global_name, avatar: u.avatar } : null;
  }
  function tokenReply(j, prev) {
    return {
      access: j.access_token,
      exp: Date.now() + (Number(j.expires_in) || 3600) * 1000,
      refresh: j.refresh_token || (prev && prev.refresh) || null,
      user: (prev && prev.user) || null
    };
  }
  function postToken(params) {
    return fetch(API + "/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
    });
  }

  var inflight = null;
  /* Refresh with the refresh token. Resolves to the new session; rejects with .fatal=true when Discord says the
     refresh token is no longer valid (the session is then cleared), or fatal=false for a network/server problem
     (the session is kept and retried later). Other tabs are serialised with the Web Locks API when it exists. */
  function refresh() {
    if (inflight) return inflight;
    function run() {
      var s = get();
      if (!s || !s.refresh) { var e = new Error("no refresh token"); e.fatal = true; return Promise.reject(e); }
      if (s.access && s.exp > Date.now() + SKEW_MS) return Promise.resolve(s); // another tab refreshed meanwhile
      return postToken({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: s.refresh }).then(function (res) {
        if (res.ok && res.j.access_token) { var n = tokenReply(res.j, s); put(n); return n; }
        var err = new Error("refresh failed (" + (res.j.error || res.status) + ")");
        err.fatal = res.status === 400 || res.status === 401; // invalid_grant: revoked, expired or already rotated
        if (err.fatal) del(KEY);
        throw err;
      }, function (e) { e.fatal = false; throw e; });
    }
    var p = (navigator.locks && navigator.locks.request) ? navigator.locks.request("osu-session-refresh", run) : run();
    inflight = Promise.resolve(p).then(function (v) { inflight = null; return v; }, function (e) { inflight = null; throw e; });
    return inflight;
  }

  /* A valid access token (refreshing if it is about to expire), or null when signed out. A temporary network
     failure while refreshing rejects, so callers can keep showing the cached user. */
  function token() {
    var s = get();
    if (!s) return Promise.resolve(null);
    if (s.access && s.exp > Date.now() + SKEW_MS) return Promise.resolve(s.access);
    return refresh().then(function (n) { return n.access; }, function (e) { if (e.fatal) return null; throw e; });
  }

  /* Fetch /users/@me; on 401 refresh once and retry. Saves the user into the session. */
  function fetchUser() {
    function once(t) { return fetch(API + "/users/@me", { headers: { Authorization: "Bearer " + t } }); }
    return token().then(function (t) {
      if (!t) return null;
      return once(t).then(function (r) {
        if (r.status !== 401) return r;
        var s = get(); if (s) { s.exp = 0; put(s); }
        return refresh().then(function (n) { return once(n.access); }, function (e) { if (e.fatal) return { status: 401, ok: false }; throw e; });
      });
    }).then(function (r) {
      if (!r) return null;
      if (r.status === 401) { del(KEY); return null; }
      if (!r.ok) throw new Error("Discord answered HTTP " + r.status + ".");
      return r.json().then(function (u) {
        var s = get(); if (s) { s.user = cleanUser(u); put(s); }
        return u;
      });
    });
  }

  function b64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }

  /* prompt=none is Discord's "do not show the consent screen again if this user already authorised the app";
     it is only valid on the authorize request (never on token calls). First-time users still see the consent screen. */
  function startLogin() {
    if (!window.crypto || !crypto.subtle) return Promise.reject(new Error("This browser cannot sign in (Web Crypto is missing)."));
    var verifier = rand(64), state = rand(24);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)).then(function (hash) {
      tmpSet("osu_pkce_verifier", verifier);
      tmpSet("osu_oauth_state", state);
      var q = new URLSearchParams({
        response_type: "code", client_id: CLIENT_ID, scope: "identify", redirect_uri: REDIRECT_URI,
        state: state, code_challenge: b64url(new Uint8Array(hash)), code_challenge_method: "S256", prompt: "none"
      });
      location.href = "https://discord.com/oauth2/authorize?" + q.toString();
    });
  }
  function expectedState() { return tmpGet("osu_oauth_state"); }
  function dropLogin() { tmpDel("osu_pkce_verifier"); tmpDel("osu_oauth_state"); }

  function finishLogin(code) {
    var verifier = tmpGet("osu_pkce_verifier");
    dropLogin();
    if (!verifier) return Promise.reject(new Error("The sign-in session was lost. Please try again."));
    return postToken({
      client_id: CLIENT_ID, grant_type: "authorization_code", code: code, redirect_uri: REDIRECT_URI, code_verifier: verifier
    }).then(function (res) {
      if (!res.ok || !res.j.access_token) throw new Error("Discord refused the sign-in" + (res.j.error ? " (" + res.j.error + ")" : "") + ".");
      put(tokenReply(res.j, null));
    });
  }

  function logout() {
    var s = get();
    del(KEY); dropLogin();
    LEGACY.forEach(del);
    if (s) { // best effort: ask Discord to forget the tokens (a failure changes nothing: we are signed out here)
      [["refresh_token", s.refresh], ["access_token", s.access]].forEach(function (t) {
        if (!t[1]) return;
        fetch(API + "/oauth2/token/revoke", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: CLIENT_ID, token: t[1], token_type_hint: t[0] })
        }).catch(function () { /* ignore */ });
      });
    }
  }

  LEGACY.forEach(function (k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } });

  window.OSUSession = {
    KEY: KEY, get: get, token: token, refresh: refresh, fetchUser: fetchUser,
    user: function () { var s = get(); return s && s.user || null; },
    signedIn: function () { return !!get(); },
    startLogin: startLogin, finishLogin: finishLogin, expectedState: expectedState, dropLogin: dropLogin, logout: logout
  };
})();
