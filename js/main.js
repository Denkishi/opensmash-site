/* OpenSmash-Ultimate site: links from config.js, hero canvas, scroll reveals, feature filter, lobby status. No libraries. */
(function () {
  "use strict";
  var C = window.OSU_CONFIG || {};
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var doc = document.documentElement;

  /* ---------- links ---------- */
  var repo = String(C.REPO_URL || "").replace(/\/+$/, "");
  var branch = C.REPO_BRANCH || "main";
  function inRepo(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (!repo) return "";
    var clean = path.replace(/^\/+/, "");
    var isDir = !/\.[a-z0-9]+(#.*)?$/i.test(clean.split("#")[0]) && clean.indexOf("#") < 0;
    return repo + (isDir ? "/tree/" : "/blob/") + branch + "/" + clean;
  }
  var links = {
    repo: repo,
    issues: repo && repo + "/issues",
    license: inRepo("LICENSE"),
    contributing: inRepo("CONTRIBUTING.md"),
    guide: inRepo(C.INSTALL_GUIDE || "BUILDING.md"),
    online: inRepo(C.ONLINE_GUIDE || "docs/ONLINE.md"),
    discord: C.DISCORD_URL || "",
    video: C.VIDEO_URL || ""
  };
  var soon = { discord: "Discord soon", video: "Video tutorial: soon" };
  function disable(a, text) {
    a.setAttribute("aria-disabled", "true");
    a.removeAttribute("href");
    a.setAttribute("role", "link");
    var label = a.querySelector("[data-label]");
    if (label && text) label.textContent = text; else if (text && !a.children.length) a.textContent = text;
  }
  document.querySelectorAll("[data-link]").forEach(function (a) {
    var key = a.getAttribute("data-link"), url = links[key];
    if (url) {
      a.href = url;
      if (/^https?:/.test(url)) { a.target = "_blank"; a.rel = "noopener"; }
    } else {
      disable(a, soon[key]);
    }
  });
  var tools = C.TOOLS || {};
  document.querySelectorAll("[data-tool]").forEach(function (a) {
    var url = inRepo(tools[a.getAttribute("data-tool")]);
    if (url) { a.href = url; a.textContent = "Open →"; a.target = "_blank"; a.rel = "noopener"; }
    else { a.textContent = "Soon"; disable(a); }
  });

  /* ---------- screenshot slots: keep the drawn fallback when a file is missing ---------- */
  document.querySelectorAll(".shot img").forEach(function (img) {
    function gone() { img.remove(); }
    if (img.complete && img.naturalWidth === 0) gone(); else img.addEventListener("error", gone);
  });

  /* ---------- nav ---------- */
  var nav = document.querySelector(".nav"), toggle = document.querySelector(".nav-toggle"), menu = document.getElementById("nav-links");
  function onScrollNav() { nav.classList.toggle("scrolled", window.scrollY > 40); }
  onScrollNav();
  window.addEventListener("scroll", onScrollNav, { passive: true });
  function closeMenu() { menu.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; }
  toggle.addEventListener("click", function () {
    var open = !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  });
  menu.addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.classList.contains("open")) { closeMenu(); toggle.focus(); } });

  /* ---------- reveal on scroll + counters + active nav ---------- */
  document.querySelectorAll(".grid, .pipeline, .steps, .road, .tool-grid, .nums, .modes, .qa").forEach(function (list) {
    Array.prototype.forEach.call(list.children, function (el, i) { el.style.setProperty("--d", i % 6); });
  });
  function countUp(el) {
    var end = +el.getAttribute("data-count"), pre = el.getAttribute("data-prefix") || "", suf = el.getAttribute("data-suffix") || "";
    if (reduce || !end) return;
    var t0 = null, dur = 1400;
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - k, 3)));
      el.textContent = pre + v.toLocaleString("en-US") + suf;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if (!reduce) {
    // Reveal everything whose top has come within the viewport, also what a fast scroll or an anchor jump skipped.
    var pending = Array.prototype.slice.call(document.querySelectorAll(".reveal")), ticking = false;
    var check = function () {
      ticking = false;
      var limit = window.innerHeight * 0.92;
      pending = pending.filter(function (el) {
        if (el.getBoundingClientRect().top > limit) return true;
        el.classList.add("in");
        var b = el.querySelector("[data-count]");
        if (b) countUp(b);
        return false;
      });
      if (!pending.length) window.removeEventListener("scroll", onScrollReveal);
    };
    var onScrollReveal = function () { if (!ticking) { ticking = true; requestAnimationFrame(check); } };
    window.addEventListener("scroll", onScrollReveal, { passive: true });
    window.addEventListener("resize", onScrollReveal);
    check();
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }
  if ("IntersectionObserver" in window) {
    var navLinks = {};
    menu.querySelectorAll('a[href^="#"]').forEach(function (a) { navLinks[a.getAttribute("href").slice(1)] = a; });
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var a = navLinks[e.target.id];
        if (a) a.classList.toggle("active", e.isIntersecting);
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(navLinks).forEach(function (id) { var s = document.getElementById(id); if (s) so.observe(s); });
  }

  /* ---------- feature filter ---------- */
  var filters = document.querySelectorAll(".filter"), cards = document.querySelectorAll(".card[data-status]");
  filters.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var f = btn.getAttribute("data-filter");
      filters.forEach(function (b) { var on = b === btn; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); });
      cards.forEach(function (c) {
        var show = f === "all" || c.getAttribute("data-status") === f;
        c.classList.toggle("is-hidden", !show);
        if (show) c.classList.add("in");
      });
    });
  });

  /* ---------- hero: speed lines, sparks, parallax ---------- */
  var hero = document.querySelector(".hero"), canvas = document.querySelector(".hero-canvas");
  var inner = document.querySelector(".hero-inner"), slashes = document.querySelector(".hero-slashes");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d"), W = 0, H = 0, dpr = 1, lines = [], sparks = [], running = false, visible = true;
    var ang = -14 * Math.PI / 180, cos = Math.cos(ang), sin = Math.sin(ang), mx = 0, my = 0, tx = 0, ty = 0;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = hero.clientWidth; H = hero.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(70, W / 18));
      lines = []; for (var i = 0; i < n; i++) lines.push(newLine(true));
      sparks = []; for (var j = 0; j < Math.round(n * 0.9); j++) sparks.push(newSpark(true));
      if (!running) draw(0);
    }
    function newLine(any) {
      var len = 60 + Math.random() * 260;
      return { x: any ? Math.random() * W * 1.4 - W * 0.2 : W + len + Math.random() * W * 0.3, y: Math.random() * (H * 1.4) - H * 0.2,
        len: len, v: 6 + Math.random() * 16, w: Math.random() < 0.12 ? 2 : 1, a: 0.08 + Math.random() * 0.32, red: Math.random() < 0.08, z: 0.4 + Math.random() };
    }
    function newSpark(any) {
      return { x: Math.random() * W, y: any ? Math.random() * H : H + 10, r: 0.6 + Math.random() * 1.8, vy: 0.2 + Math.random() * 0.9,
        vx: (Math.random() - 0.5) * 0.4, a: 0.2 + Math.random() * 0.6, z: 0.3 + Math.random(), red: Math.random() < 0.25 };
    }
    function draw(dt) {
      ctx.clearRect(0, 0, W, H);
      tx += (mx - tx) * 0.06; ty += (my - ty) * 0.06;
      ctx.lineCap = "butt";
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        if (dt) { l.x -= l.v * dt; if (l.x + l.len < -W * 0.3) lines[i] = l = newLine(false); }
        var px = l.x + tx * 30 * l.z, py = l.y + ty * 20 * l.z;
        var x2 = px + cos * l.len, y2 = py + sin * l.len;
        var g = ctx.createLinearGradient(px, py, x2, y2);
        var col = l.red ? "255,59,48" : "255,255,255";
        g.addColorStop(0, "rgba(" + col + "," + l.a + ")"); g.addColorStop(1, "rgba(" + col + ",0)");
        ctx.strokeStyle = g; ctx.lineWidth = l.w;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x2, y2); ctx.stroke();
      }
      for (var j = 0; j < sparks.length; j++) {
        var s = sparks[j];
        if (dt) { s.y -= s.vy * dt; s.x += s.vx * dt; if (s.y < -10) sparks[j] = s = newSpark(false); }
        ctx.fillStyle = s.red ? "rgba(255,90,70," + s.a + ")" : "rgba(255,255,255," + s.a * 0.8 + ")";
        ctx.fillRect(s.x + tx * 50 * s.z, s.y + ty * 30 * s.z, s.r, s.r);
      }
    }
    var last = 0;
    function loop(t) {
      if (!running) return;
      var dt = last ? Math.min(3, (t - last) / 16.67) : 1; last = t;
      draw(dt);
      if (inner) inner.style.transform = "translate3d(" + (-tx * 10) + "px," + (-ty * 8 + scrollShift) + "px,0)";
      if (slashes) slashes.style.transform = "rotate(-14deg) translate3d(" + (tx * 24) + "px," + (ty * 14 - scrollShift * 0.6) + "px,0)";
      requestAnimationFrame(loop);
    }
    function start() { if (!running && !reduce && visible && !document.hidden) { running = true; last = 0; requestAnimationFrame(loop); } }
    function stop() { running = false; }
    var scrollShift = 0;
    window.addEventListener("scroll", function () { scrollShift = Math.min(H, window.scrollY) * 0.25; }, { passive: true });
    hero.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      mx = (e.clientX / W - 0.5) * 2; my = (e.clientY / H - 0.5) * 2;
    });
    hero.addEventListener("pointerleave", function () { mx = my = 0; });
    window.addEventListener("resize", function () { clearTimeout(resize.t); resize.t = setTimeout(resize, 120); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; if (visible) start(); else stop(); }).observe(hero);
    }
    resize();
    start();
  }

  /* ---------- lobby status ---------- */
  var box = document.getElementById("status");
  if (box) {
    var url = String(C.STATUS_URL || "").trim();
    var every = Math.max(10, +C.STATUS_REFRESH_S || 30) * 1000;
    var q = function (k) { return box.querySelector('[data-k="' + k + '"]'); };
    var pillText = box.querySelector(".status-text"), timer = null, lastOk = null;
    function set(k, v) { var el = q(k); if (el) el.textContent = v; }
    function state(s, text) { box.setAttribute("data-state", s); pillText.textContent = text; }
    function uptime(s) {
      s = Math.max(0, Math.floor(+s || 0));
      var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
      return d ? d + "d " + h + "h" : h ? h + "h " + m + "m" : m + "m";
    }
    function clock(d) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
    function count(v) { var n = Math.floor(+v); return isFinite(n) && n >= 0 ? n.toLocaleString("en-US") : "–"; }
    function flash() { box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash"); }
    if (!url) {
      state("off", "Not configured");
      set("lobby", "–");
      set("msg", "No public lobby is listed yet. Run your own with the lobby server in the repository.");
    } else if (!/^https:\/\//i.test(url) && location.protocol === "https:") {
      state("off", "Not configured");
      set("msg", "The status URL must start with https://.");
    } else {
      var poll = function () {
        if (document.hidden) return;
        if (!lastOk) state("loading", "Checking…");
        var ctl = "AbortController" in window ? new AbortController() : null;
        var to = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
        fetch(url, { cache: "no-store", mode: "cors", credentials: "omit", signal: ctl ? ctl.signal : undefined })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function (j) {
            clearTimeout(to);
            var up = j && j.up !== false;
            lastOk = new Date();
            state(up ? "up" : "down", up ? "Online" : "Offline");
            set("players", count(j.players));
            set("rooms", count(j.rooms));
            set("lobby", up ? "Up" : "Down");
            set("uptime", up && j.uptime_s != null ? uptime(j.uptime_s) : "–");
            set("version", j.version ? String(j.version).slice(0, 40) : "–");
            set("updated", clock(lastOk));
            set("msg", "");
            flash();
          })
          .catch(function () {
            clearTimeout(to);
            state("down", "Offline");
            set("lobby", "Down");
            set("players", "–"); set("rooms", "–"); set("uptime", "–");
            set("updated", lastOk ? clock(lastOk) : "never");
            set("msg", "The lobby did not answer. It may be restarting; trying again every " + every / 1000 + " s.");
          });
      };
      poll();
      timer = setInterval(poll, every);
      document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
    }
  }
})();
