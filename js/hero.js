/* Hero: speed lines, sparks, parallax, nav shadow (from the original site). */
(function () {
  "use strict";
  var nav = document.querySelector(".nav");
  function onScrollNav() { nav.classList.toggle("scrolled", window.scrollY > 40); }
  onScrollNav();
  window.addEventListener("scroll", onScrollNav, { passive: true });
  /* ---------- hero: speed lines, sparks, parallax ---------- */
  var hero = document.querySelector(".hero"), canvas = document.querySelector(".hero-canvas");
  var inner = document.querySelector(".hero-inner"), slashes = document.querySelector(".hero-slashes");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d"), W = 0, H = 0, dpr = 1, lines = [], sparks = [], running = false, visible = true,
        reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
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
})();
