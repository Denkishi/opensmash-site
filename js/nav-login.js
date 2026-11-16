/* Top-bar "Register / Log in" button on every page: shows the signed-in Discord player's name and avatar.
   The session (js/session.js) is kept in localStorage, so it is there on every visit; the cached user is shown at once,
   then the token is refreshed in the background when it has expired (and the profile re-read). */
(function () {
  "use strict";
  var a = document.getElementById("nav-login");
  if (!a || !window.OSUSession) return;
  var loggedOutText = a.textContent, loggedOutTitle = a.title;

  function reset() { a.textContent = loggedOutText; a.title = loggedOutTitle; a.classList.remove("signed-in"); }
  function show(u) {
    var name = u.global_name || u.username || "Player";
    a.textContent = "";
    if (u.id && u.avatar && /^[0-9]+$/.test(String(u.id)) && /^(a_)?[0-9a-f]+$/.test(String(u.avatar))) {
      var img = document.createElement("img");
      img.src = "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + ".png?size=32";
      img.alt = ""; img.width = 20; img.height = 20; img.style.cssText = "border-radius:50%;margin-right:8px;vertical-align:-5px;display:inline-block";
      a.appendChild(img);
    }
    a.appendChild(document.createTextNode(name.length > 18 ? name.slice(0, 17) + "…" : name));
    a.title = "Your account";
    a.classList.add("signed-in");
  }
  function paint() {
    var s = OSUSession.get();
    if (!s) { reset(); return; }
    show(s.user || { username: "Signed in" });
  }

  paint();
  var s0 = OSUSession.get();
  if (s0 && !/\/account\/?$/.test(location.pathname)) { // account/ does its own refresh
    // No network while the cached user and a valid token are there; refresh only when the access token has expired.
    var job = !s0.user ? OSUSession.fetchUser() : (!s0.access || s0.exp <= Date.now() + 60000) ? OSUSession.token() : null;
    if (job) job.then(paint, function () { /* offline or Discord down: keep the cached name */ });
  }
  window.addEventListener("storage", function (e) { if (e.key === OSUSession.KEY || e.key === null) paint(); }); // other tab
  window.addEventListener("osu-session", paint); // this tab (account page)
})();
