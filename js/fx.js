/* ════════════════════════════════════════════════════════════════════════
   Krav0n — background effects for every page
   Builds the ocean layers, draws rising bubbles and drifting specks,
   moves a soft light with the pointer, leaves a ripple on click/tap and
   sends a whale swimming across now and then (it speeds away from the cursor;
   click it and it spouts water and jumps).
   Stops when the tab is hidden, with "reduce motion", or when the
   accessibility menu's "stop animations" option is on.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var doc = document;
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduceMotion = !!(mq && mq.matches);
  function animationsOff() {
    return reduceMotion || (doc.body && doc.body.classList.contains('access-no-animation'));
  }

  /* 1 — ocean layers */
  var ocean = doc.getElementById('ocean');
  if (!ocean) {
    ocean = doc.createElement('div');
    ocean.id = 'ocean';
    ocean.className = 'ocean';
    ocean.setAttribute('aria-hidden', 'true');
    doc.body.insertBefore(ocean, doc.body.firstChild);
  }
  if (!ocean.querySelector('.ocean__canvas')) {
    ocean.innerHTML =
      '<div class="ocean__surface"></div>' +
      '<div class="ocean__rays"><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<canvas class="ocean__canvas"></canvas>' +
      '<div class="ocean__grain"></div>' +
      '<div class="ocean__vignette"></div>';
  }

  /* 1b — the whale (swims behind everything, see whaleStep below) */
  var whale = ocean.querySelector('.ocean__whale');
  if (!whale) {
    whale = doc.createElement('img');
    whale.className = 'ocean__whale';
    whale.src = 'images/whale.webp';
    whale.alt = '';
    whale.decoding = 'async';
    whale.draggable = false;
    ocean.insertBefore(whale, ocean.querySelector('.ocean__grain'));
  }

  /* 2 — light that follows the pointer */
  var spot = doc.getElementById('spotlight');
  if (!spot) {
    spot = doc.createElement('div');
    spot.id = 'spotlight';
    spot.className = 'spotlight';
    spot.setAttribute('aria-hidden', 'true');
    ocean.parentNode.insertBefore(spot, ocean.nextSibling);
  }

  /* 3 — bubbles and drifting specks */
  var cv = ocean.querySelector('.ocean__canvas');
  var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
  if (!ctx) return;

  var W = 0, H = 0, dpr = 1;
  var bubbles = [], specks = [];
  var running = !doc.hidden, rafId = 0, last = 0;
  var pointer = { x: -9999, y: -9999 };
  var sprites = {};

  function sprite(r) {
    if (sprites[r]) return sprites[r];
    var pad = 2;
    var px = Math.ceil((r + pad) * 2 * dpr);
    var c = doc.createElement('canvas');
    c.width = c.height = px;
    var g = c.getContext('2d');
    var cx = px / 2, cy = px / 2, R = r * dpr;
    var fill = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    fill.addColorStop(0, 'rgba(255,255,255,0.10)');
    fill.addColorStop(0.62, 'rgba(150,215,255,0.05)');
    fill.addColorStop(0.9, 'rgba(185,232,255,0.45)');
    fill.addColorStop(1, 'rgba(185,232,255,0)');
    g.fillStyle = fill;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.78)';
    g.beginPath();
    if (g.ellipse) g.ellipse(cx - R * 0.38, cy - R * 0.4, R * 0.24, R * 0.14, -0.6, 0, Math.PI * 2);
    else g.arc(cx - R * 0.38, cy - R * 0.4, R * 0.18, 0, Math.PI * 2);
    g.fill();
    sprites[r] = { c: c, size: px / dpr };
    return sprites[r];
  }

  function makeBubble(fromBottom) {
    var r = 2 + Math.floor(Math.pow(Math.random(), 2) * 7);   // mostly small, a few big
    return {
      x: Math.random() * W,
      y: fromBottom ? H + 10 + Math.random() * H * 0.25 : Math.random() * H,
      r: r,
      vy: 0.16 + r * 0.055 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2,
      wobble: 0.25 + Math.random() * 0.45,
      alpha: 0.32 + Math.random() * 0.5,
      push: 0,
      temp: false
    };
  }
  function makeSpeck() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vy: 0.04 + Math.random() * 0.12,
      vx: (Math.random() - 0.5) * 0.06,
      a: 0.10 + Math.random() * 0.28,
      s: Math.random() < 0.8 ? 1 : 1.6
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sprites = {};
    var area = W * H;
    var nB = Math.max(14, Math.min(46, Math.round(area / 32000)));
    var nS = Math.max(24, Math.min(80, Math.round(area / 16000)));
    bubbles = [];
    specks = [];
    for (var i = 0; i < nB; i++) bubbles.push(makeBubble(false));
    for (var j = 0; j < nS; j++) specks.push(makeSpeck());
  }

  function step(dt) {
    var k = dt / 16.67;
    var damp = Math.pow(0.985, k);
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      b.y -= b.vy * k;
      b.phase += 0.018 * k;
      var dx = pointer.x - (b.x + b.push), dy = pointer.y - b.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < 14400) {                       // within 120px of the pointer
        var d = Math.sqrt(d2) || 1;
        b.push -= (dx / d) * (120 - d) * 0.02 * k;
      }
      b.push *= damp;
      if (b.y < -24) {
        if (b.temp) bubbles.splice(i, 1);
        else bubbles[i] = makeBubble(true);
      }
    }
    for (var j = 0; j < specks.length; j++) {
      var s = specks[j];
      s.y += s.vy * k;
      s.x += s.vx * k;
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
      if (s.x < -4) s.x = W + 4; else if (s.x > W + 4) s.x = -4;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgb(191,239,255)';
    for (var j = 0; j < specks.length; j++) {
      var s = specks[j];
      ctx.globalAlpha = s.a;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      var sp = sprite(b.r);
      var x = b.x + b.push + Math.sin(b.phase) * b.wobble * b.r * 2;
      ctx.globalAlpha = b.alpha;
      ctx.drawImage(sp.c, x - sp.size / 2, b.y - sp.size / 2, sp.size, sp.size);
    }
    ctx.globalAlpha = 1;
  }

  /* 3b — whale: glides across, bobs, tilts with the motion, breathes out
     bubbles and swims faster away when the cursor gets close */
  var wh = { active: false, wait: 1800, x: 0, y: 0, base: 0, dir: -1, v: 0, phase: 0, w: 240, scare: 0, bubbleT: 0, boost: 0, jumpT: 0 };
  function whaleLaunch() {
    wh.w = Math.round(Math.max(150, Math.min(300, W * 0.2)));
    whale.style.width = wh.w + 'px';
    wh.dir = Math.random() < 0.5 ? -1 : 1;              // the picture faces left
    wh.x = wh.dir < 0 ? W + 30 : -wh.w - 30;
    wh.base = H * (0.16 + Math.random() * 0.6);
    wh.v = 0.55 + Math.random() * 0.4;
    wh.phase = Math.random() * Math.PI * 2;
    wh.scare = 0;
    wh.boost = 0;
    wh.jumpT = 0;
    wh.active = true;
  }
  function whaleStep(dt) {
    var k = dt / 16.67;
    if (!wh.active) {
      wh.wait -= dt;
      if (wh.wait <= 0) whaleLaunch(); else return;
    }
    var h = wh.w * 0.45;
    var dx = pointer.x - (wh.x + wh.w / 2), dy = pointer.y - (wh.y + h / 2);
    if (dx * dx + dy * dy < 25600) wh.scare = Math.min(1, wh.scare + 0.08 * k);   // within 160px
    else wh.scare *= Math.pow(0.97, k);
    wh.phase += (0.028 + wh.scare * 0.06) * k;
    wh.boost *= Math.pow(0.985, k);
    var liveFast = doc.body.classList.contains('is-live') ? 1.8 : 1;   // swims faster while live
    wh.x += wh.dir * wh.v * (1 + wh.scare * 1.6 + wh.boost * 2) * liveFast * k;
    wh.base += (dy > 0 ? -1 : 1) * wh.scare * 0.9 * k;
    wh.base = Math.max(10, Math.min(H - h - 10, wh.base));
    var jump = 0, jumpTilt = 0;
    if (wh.jumpT > 0) {
      wh.jumpT = Math.max(0, wh.jumpT - dt);
      var jp = 1 - wh.jumpT / 900;
      jump = Math.sin(jp * Math.PI) * 46;
      jumpTilt = -wh.dir * Math.cos(jp * Math.PI) * 10;   // nose up, then down
    }
    wh.y = wh.base + Math.sin(wh.phase) * 14 - jump;
    var tilt = wh.dir * Math.cos(wh.phase) * 4 + jumpTilt;
    var breathe = 1 + Math.sin(wh.phase * 2) * 0.012;
    whale.style.transform = 'translate3d(' + wh.x.toFixed(1) + 'px,' + wh.y.toFixed(1) + 'px,0) rotate(' + tilt.toFixed(2) + 'deg) scale(' + (-wh.dir) + ',' + breathe.toFixed(3) + ')';
    wh.bubbleT -= dt;
    if (wh.bubbleT <= 0) {
      wh.bubbleT = 300 + Math.random() * 700 - wh.scare * 200;
      var b = makeBubble(false);
      b.x = wh.dir < 0 ? wh.x + wh.w * 0.1 : wh.x + wh.w * 0.9;
      b.y = wh.y + h * 0.35;
      b.r = 2 + Math.floor(Math.random() * 3);
      b.vy = 0.6 + Math.random() * 0.7;
      b.alpha = 0.7;
      b.temp = true;
      bubbles.push(b);
    }
    if ((wh.dir < 0 && wh.x < -wh.w - 40) || (wh.dir > 0 && wh.x > W + 40)) {
      wh.active = false;
      wh.wait = 5000 + Math.random() * 9000;
      whale.style.transform = '';
    }
  }

  function loop(t) {
    rafId = 0;
    if (!running) return;
    var dt = last ? Math.min(50, t - last) : 16.67;
    last = t;
    if (!animationsOff()) { step(dt); whaleStep(dt); draw(); }
    rafId = requestAnimationFrame(loop);
  }
  function start() {
    if (reduceMotion) { draw(); return; }
    if (!rafId) { last = 0; rafId = requestAnimationFrame(loop); }
  }

  resize();
  draw();
  start();

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { resize(); draw(); }, 120);
  });
  doc.addEventListener('visibilitychange', function () {
    running = !doc.hidden;
    if (running) start();
  });
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function (e) { reduceMotion = e.matches; if (!reduceMotion) start(); else draw(); });
  }

  /* 4 — pointer tracking (light + bubbles drifting away from the cursor) */
  window.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    spot.style.setProperty('--x', e.clientX + 'px');
    spot.style.setProperty('--y', e.clientY + 'px');
  }, { passive: true });
  doc.addEventListener('mouseleave', function () { pointer.x = pointer.y = -9999; });

  /* 5 — ripple + a few bubbles where you click or tap */
  var layer = doc.createElement('div');
  layer.className = 'ripple-layer';
  layer.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(layer);

  function burst(x, y) {
    for (var i = 0; i < 6; i++) {
      var b = makeBubble(false);
      b.x = x + (Math.random() - 0.5) * 26;
      b.y = y + (Math.random() - 0.5) * 10;
      b.r = 2 + Math.floor(Math.random() * 3);
      b.vy = 0.9 + Math.random() * 1.1;
      b.alpha = 0.75;
      b.temp = true;
      bubbles.push(b);
    }
    var extra = bubbles.length - 110;
    if (extra > 0) {
      for (var j = bubbles.length - 1; j >= 0 && extra > 0; j--) {
        if (bubbles[j].temp) { bubbles.splice(j, 1); extra--; }
      }
    }
  }

  /* Easter egg: catch the whale (click it) — it spouts water and jumps */
  function whaleSplash() {
    if (wh.jumpT > 0) return;
    wh.jumpT = 900;
    wh.boost = 1;
    var h = wh.w * 0.45;
    var sx = wh.dir < 0 ? wh.x + wh.w * 0.36 : wh.x + wh.w * 0.64;
    var sy = wh.y + h * 0.06;
    var col = doc.createElement('span');
    col.className = 'whale-spout';
    col.style.left = sx + 'px';
    col.style.top = sy + 'px';
    col.addEventListener('animationend', function () { this.remove(); });
    layer.appendChild(col);
    for (var i = 0; i < 16; i++) {
      var d = doc.createElement('span');
      d.className = 'whale-drop';
      d.style.left = sx + 'px';
      d.style.top = sy + 'px';
      d.style.setProperty('--dx', ((Math.random() - 0.5) * 140).toFixed(0) + 'px');
      d.style.setProperty('--dy', (-70 - Math.random() * 90).toFixed(0) + 'px');
      d.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
      d.addEventListener('animationend', function () { this.remove(); });
      layer.appendChild(d);
    }
    for (var j = 0; j < 4; j++) burst(wh.x + wh.w * (0.2 + j * 0.2), wh.y + h * 0.6);
  }

  window.addEventListener('pointerdown', function (e) {
    if (animationsOff()) return;
    var t = e.target;
    if (t && t.closest && t.closest('.accessibility-panel, .g-stage, .p-board')) return; // no ripple on the canvases
    if (wh.active && !(t && t.closest && t.closest('a, button, input, textarea, select, label, .cookie-banner'))) {
      var wr = whale.getBoundingClientRect();
      var mx = wr.width * 0.12, my = wr.height * 0.15;
      if (e.clientX > wr.left + mx && e.clientX < wr.right - mx && e.clientY > wr.top + my && e.clientY < wr.bottom - my) whaleSplash();
    }
    for (var i = 0; i < 2; i++) {
      var r = doc.createElement('span');
      r.className = 'ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      r.style.animationDelay = (i * 0.12) + 's';
      r.addEventListener('animationend', function () { this.remove(); });
      layer.appendChild(r);
    }
    var rs = layer.querySelectorAll('.ripple');
    for (var q = 0; q < rs.length - 12; q++) rs[q].remove();
    burst(e.clientX, e.clientY);
  }, { passive: true });
})();
