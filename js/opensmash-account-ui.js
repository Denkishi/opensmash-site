/* Wires the OpenSmash account buttons and labels by element id (see js/opensmash-auth.js):
   osa-signed-out, osa-signin, osa-signup, osa-signed-in, osa-name, osa-manage, osa-signout, osa-error.
   <body data-osa-next="account/"> says where to come back after the sign-in.
   Opened as account/?signin=1 (after "Create account" on the central site) it starts the sign-in by itself. */
(function () {
  "use strict";
  var A = window.OpenSmashAuth;
  if (!A) return;
  var $ = function (id) { return document.getElementById(id); };
  var next = document.body.getAttribute("data-osa-next") || "";

  function err(msg) {
    var e = $("osa-error"); if (!e) return;
    e.textContent = msg || ""; e.classList.toggle("hidden", !msg);
  }
  function paint() {
    var inn = A.signedIn();
    if ($("osa-signed-out")) $("osa-signed-out").classList.toggle("hidden", inn);
    if ($("osa-signed-in")) $("osa-signed-in").classList.toggle("hidden", !inn);
    if ($("osa-name")) $("osa-name").textContent = inn ? (A.displayName(A.profile()) || "Signed in") : "";
  }
  function signIn() { err(""); A.startSignIn(next).catch(function (e) { err(e.message); }); }

  var inBtn = $("osa-signin"), upBtn = $("osa-signup"), outBtn = $("osa-signout"), man = $("osa-manage");
  if (inBtn) inBtn.addEventListener("click", signIn);
  if (upBtn) upBtn.setAttribute("href", A.signUpLink(next, true));
  if (man) man.setAttribute("href", A.manageUrl);
  if (outBtn) outBtn.addEventListener("click", function () { A.signOut(); paint(); });
  window.addEventListener("osu-account", paint);
  window.addEventListener("storage", function (e) { if (e.key === A.KEY || e.key === null) paint(); });
  paint();

  var q = new URLSearchParams(location.search);
  var auto = q.get("signin") === "1";
  if (q.has("signin")) { try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ } }
  if (auto && !A.signedIn()) { signIn(); return; }
  if (A.signedIn()) {
    A.fetchProfile().then(paint, function (e) { if (!A.profile()) err("Could not read your profile: " + e.message); });
  }
})();
