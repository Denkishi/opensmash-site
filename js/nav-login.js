/* Top-bar "Register / Log in" button on every page: shows the signed-in OpenSmash account's name
   (js/opensmash-auth.js; the account is shared with SSBU Arena and signed in on account.opensmashultimate.com). */
(function () {
  "use strict";
  var a = document.getElementById("nav-login");
  var OA = window.OpenSmashAuth;
  if (!a || !OA) return;
  var loggedOutText = a.textContent, loggedOutTitle = a.title;

  function paint() {
    if (OA.signedIn()) {
      a.textContent = OA.displayName(OA.profile()) || "Signed in";
      a.title = "Your account"; a.classList.add("signed-in");
    } else {
      a.textContent = loggedOutText; a.title = loggedOutTitle; a.classList.remove("signed-in");
    }
  }

  paint();
  if (OA.signedIn() && !OA.profile() && !/\/account\/?$/.test(location.pathname)) OA.fetchProfile().then(paint, function () { /* keep "Signed in" */ });
  window.addEventListener("storage", function (e) { if (e.key === OA.KEY || e.key === null) paint(); }); // other tab
  window.addEventListener("osu-account", paint);
})();
