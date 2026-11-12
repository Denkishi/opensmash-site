/* Sign in with Discord: OAuth2 authorization code + PKCE (S256), public client, scope "identify".
   Discord's token endpoint answers browser CORS requests for this origin, so no server and no secret are involved.
   The PKCE verifier and state live in sessionStorage until the redirect comes back; the access token stays in
   sessionStorage (this tab only) and is dropped on sign out. */
document.addEventListener("DOMContentLoaded", function () {
  "use strict";
  var CLIENT_ID = "1069217215540371466";
  var REDIRECT_URI = "https://denkishi.github.io/opensmash-site/account/";
  var AUTHORIZE = "https://discord.com/oauth2/authorize";
  var TOKEN = "https://discord.com/api/oauth2/token";
  var ME = "https://discord.com/api/users/@me";
  var K_VERIFIER = "osu_pkce_verifier", K_STATE = "osu_oauth_state", K_TOKEN = "osu_discord_token", K_EXP = "osu_discord_token_exp";

  var $ = function (id) { return document.getElementById(id); };
  var status = $("status");

  function store(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function drop() { for (var i = 0; i < arguments.length; i++) { try { sessionStorage.removeItem(arguments[i]); } catch (e) { /* ignore */ } } }
  function say(msg, err) { status.textContent = msg; status.className = "notice" + (err ? " err" : ""); }
  function b64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
  function cleanUrl() { history.replaceState(null, "", location.pathname); }

  function signedOut() {
    $("signed-in").classList.add("hidden");
    $("signed-out").classList.remove("hidden");
  }
  function fail(msg) { say(msg, true); signedOut(); }

  function startSignIn() {
    if (!window.crypto || !crypto.subtle) { say("This browser cannot sign in (Web Crypto is missing).", true); return; }
    var verifier = rand(64), state = rand(24);
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)).then(function (hash) {
      store(K_VERIFIER, verifier);
      store(K_STATE, state);
      var q = new URLSearchParams({
        response_type: "code", client_id: CLIENT_ID, scope: "identify", redirect_uri: REDIRECT_URI,
        state: state, code_challenge: b64url(new Uint8Array(hash)), code_challenge_method: "S256", prompt: "none"
      });
      location.href = AUTHORIZE + "?" + q.toString();
    });
  }

  function exchange(code) {
    var verifier = load(K_VERIFIER);
    drop(K_VERIFIER, K_STATE);
    if (!verifier) return Promise.reject(new Error("The sign-in session was lost. Please try again."));
    return fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID, grant_type: "authorization_code", code: code,
        redirect_uri: REDIRECT_URI, code_verifier: verifier
      })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.access_token) throw new Error("Discord refused the sign-in" + (j.error ? " (" + j.error + ")" : "") + ".");
        store(K_TOKEN, j.access_token);
        store(K_EXP, String(Date.now() + (j.expires_in || 3600) * 1000));
        return j.access_token;
      });
    });
  }

  function getToken() {
    var t = load(K_TOKEN), exp = Number(load(K_EXP) || 0);
    if (t && exp > Date.now() + 5000) return t;
    drop(K_TOKEN, K_EXP);
    return null;
  }

  function fetchMe(token) {
    return fetch(ME, { headers: { Authorization: "Bearer " + token } }).then(function (r) {
      if (r.status === 401) { drop(K_TOKEN, K_EXP); throw new Error("expired"); }
      if (!r.ok) throw new Error("Discord answered HTTP " + r.status + ".");
      return r.json();
    });
  }

  function show(user) {
    $("name").textContent = user.global_name || user.username || "Player";
    $("handle").textContent = user.username ? "@" + user.username : "";
    $("avatar").src = OSU.discordAvatar(user.id, user.avatar, 128) || OSU.defaultAvatar(user.id);
    status.classList.add("hidden");
    $("signed-out").classList.add("hidden");
    $("signed-in").classList.remove("hidden");

    OSU.loadBoard().then(function (d) {
      var me = null;
      d.players.forEach(function (p) { if (p.discord_id && String(p.discord_id) === String(user.id)) me = p; });
      var t = d.updated && OSU.fmtTime(d.updated);
      if (t) $("updated").textContent = "Leaderboard updated " + t;
      if (!me) { $("unranked").classList.remove("hidden"); return; }
      $("rank").textContent = "#" + me.rank;
      $("rank").classList.remove("hidden");
      $("overall-gsp").textContent = String(me.gsp);
      $("overall-best").textContent = me.best_fighter != null ? OSU.fighterName(d, me.best_fighter) : "-";
      $("overall").classList.remove("hidden");
      var f = me.fighters || {};
      var kinds = Object.keys(f).sort(function (a, b) { return f[b].gsp - f[a].gsp; });
      var body = $("fighters");
      kinds.forEach(function (k) {
        var tr = OSU.el("tr");
        tr.appendChild(OSU.el("td", null, OSU.fighterName(d, k)));
        tr.appendChild(OSU.el("td", "num", String(f[k].gsp)));
        tr.appendChild(OSU.el("td", "num", "#" + f[k].rank));
        body.appendChild(tr);
      });
      if (kinds.length) $("fighters-block").classList.remove("hidden");
    }).catch(function () {
      $("unranked").textContent = "The leaderboard is not available right now.";
      $("unranked").classList.remove("hidden");
    });
  }

  function signOut() {
    var t = load(K_TOKEN);
    drop(K_TOKEN, K_EXP, K_VERIFIER, K_STATE);
    if (t) { // best effort: ask Discord to forget the token
      fetch("https://discord.com/api/oauth2/token/revoke", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: CLIENT_ID, token: t, token_type_hint: "access_token" })
      }).catch(function () { /* ignore */ });
    }
    $("fighters").textContent = "";
    ["rank", "overall", "fighters-block", "unranked"].forEach(function (i) { $(i).classList.add("hidden"); });
    status.classList.add("hidden");
    signedOut();
  }

  $("signin").addEventListener("click", startSignIn);
  $("signout").addEventListener("click", signOut);

  var q = new URLSearchParams(location.search);
  if (q.has("code") || q.has("error")) {
    var code = q.get("code"), state = q.get("state"), error = q.get("error"), expected = load(K_STATE);
    cleanUrl();
    if (error) {
      drop(K_VERIFIER, K_STATE);
      fail(error === "access_denied" ? "Sign-in cancelled." : "Discord returned an error: " + error);
    } else if (!code || !state || !expected || state !== expected) {
      drop(K_VERIFIER, K_STATE);
      fail("Sign-in check failed (state mismatch). Please try again.");
    } else {
      say("Signing in…");
      exchange(code).then(fetchMe).then(show).catch(function (e) { fail(e.message); });
    }
  } else {
    var token = getToken();
    if (!token) { status.classList.add("hidden"); signedOut(); }
    else fetchMe(token).then(show).catch(function (e) {
      if (e.message === "expired") { status.classList.add("hidden"); signedOut(); } else fail(e.message);
    });
  }
});
