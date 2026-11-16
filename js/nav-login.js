/* Top-bar "Register / Log in" button: shows the signed-in Discord player's name and avatar (same tab session as account/). */
(function () {
  "use strict";
  var a = document.getElementById("nav-login");
  if (!a) return;
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } }
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
  }
  var token = load("osu_discord_token"), exp = Number(load("osu_discord_token_exp") || 0);
  if (!token || (exp && exp < Date.now())) return;
  var cached = load("osu_nav_user");
  if (cached) { try { show(JSON.parse(cached)); return; } catch (e) { /* refetch */ } }
  fetch("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + token } })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (u) { put("osu_nav_user", JSON.stringify({ id: u.id, username: u.username, global_name: u.global_name, avatar: u.avatar })); show(u); })
    .catch(function () { /* stay as Log in */ });
})();
