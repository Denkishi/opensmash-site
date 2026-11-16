/* Sign in with Discord (account page). The session itself (localStorage, refresh token, PKCE) is js/session.js;
   this page shows the profile and the player's rank. A returning visitor is signed in again without any redirect:
   the cached profile is shown at once and the access token is refreshed in the background when it has expired. */
document.addEventListener("DOMContentLoaded", function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var status = $("status");

  function say(msg, err) { status.textContent = msg; status.className = "notice" + (err ? " err" : ""); }
  function cleanUrl() { history.replaceState(null, "", location.pathname); }

  function signedOut() {
    $("signed-in").classList.add("hidden");
    $("signed-out").classList.remove("hidden");
  }
  function fail(msg) { say(msg, true); signedOut(); }

  function startSignIn() {
    OSUSession.startLogin().catch(function (e) { say(e.message, true); });
  }

  /* The lobbies publish sha256("opensmash-discord\n" + Discord user id), first 16 hex characters, never the id itself. */
  function discordHash(id) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode("opensmash-discord\n" + id)).then(function (buf) {
      var a = new Uint8Array(buf), s = "";
      for (var i = 0; i < 8; i++) s += (a[i] < 16 ? "0" : "") + a[i].toString(16);
      return s;
    });
  }

  function show(user) {
    $("fighters").textContent = "";
    ["rank", "overall", "fighters-block", "unranked"].forEach(function (i) { $(i).classList.add("hidden"); });
    $("name").textContent = user.global_name || user.username || "Player";
    $("handle").textContent = user.username ? "@" + user.username : "";
    $("avatar").src = OSU.discordAvatar(user.id, user.avatar, 128) || OSU.defaultAvatar(user.id);
    status.classList.add("hidden");
    $("signed-out").classList.add("hidden");
    $("signed-in").classList.remove("hidden");

    discordHash(user.id).then(function (h) {
      return OSU.loadBoard().then(function (d) { return [d, h]; });
    }).then(function (res) {
      var d = res[0], h = res[1], me = null;
      d.players.forEach(function (p) { if (p.discord && String(p.discord).toLowerCase() === h) me = p; });
      var t = d.updated && OSU.fmtTime(d.updated);
      if (t) $("updated").textContent = "Leaderboard updated " + t;
      if (!me) {
        $("unranked").textContent = "You are not on the leaderboard yet. Either you have not played a ranked online match, or you have not chosen to show your name: turn on \"Show my name on the leaderboard\" in OpenSmash.exe or in the web launcher's Discord card, then play online.";
        $("unranked").classList.remove("hidden");
        return;
      }
      $("rank").textContent = "#" + me.rank;
      $("rank").classList.remove("hidden");
      $("overall-gsp").textContent = String(me.gsp);
      $("overall-best").textContent = me.fighter != null ? OSU.fighterName(d, me.fighter) : "-";
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
    OSUSession.logout();
    $("fighters").textContent = "";
    ["rank", "overall", "fighters-block", "unranked"].forEach(function (i) { $(i).classList.add("hidden"); });
    status.classList.add("hidden");
    signedOut();
    window.dispatchEvent(new Event("osu-session"));
  }

  $("signin").addEventListener("click", startSignIn);
  $("signout").addEventListener("click", signOut);
  window.addEventListener("storage", function (e) {
    if (e.key === OSUSession.KEY && !OSUSession.signedIn() && $("signed-out").classList.contains("hidden")) signOut(); // signed out in another tab
  });

  var q = new URLSearchParams(location.search);
  if (q.has("code") || q.has("error")) {
    var code = q.get("code"), state = q.get("state"), error = q.get("error"), expected = OSUSession.expectedState();
    cleanUrl();
    if (error) {
      OSUSession.dropLogin();
      fail(error === "access_denied" ? "Sign-in cancelled." : "Discord returned an error: " + error);
    } else if (!code || !state || !expected || state !== expected) {
      OSUSession.dropLogin();
      fail("Sign-in check failed (state mismatch). Please try again.");
    } else {
      say("Signing in…");
      OSUSession.finishLogin(code).then(function () { return OSUSession.fetchUser(); }).then(function (u) {
        if (!u) throw new Error("Discord did not return your profile.");
        show(u);
        window.dispatchEvent(new Event("osu-session"));
      }).catch(function (e) { fail(e.message); });
    }
  } else {
    var cached = OSUSession.user();
    if (!OSUSession.signedIn()) { status.classList.add("hidden"); signedOut(); }
    else {
      if (cached) show(cached); // instant, from the saved session
      OSUSession.fetchUser().then(function (u) {
        if (!u) { status.classList.add("hidden"); signedOut(); window.dispatchEvent(new Event("osu-session")); return; } // session ended (revoked or expired)
        if (!cached || cached.avatar !== u.avatar || cached.username !== u.username || cached.global_name !== u.global_name) show(u);
        window.dispatchEvent(new Event("osu-session"));
      }).catch(function (e) { if (!cached) fail(e.message); /* else stay on the cached profile while offline */ });
    }
  }
});
