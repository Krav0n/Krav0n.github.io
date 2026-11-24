/* ════════════════════════════════════════════════════════════════════════
   Krav0n — day & night in the ocean
   The background follows the real sun over Israel:
     dawn  → pink-peach light from the surface
     day   → bright water, strong sun rays
     dusk  → orange-purple light
     night → dark water, faint moon rays, glowing plankton and jellyfish
   Loaded in <head> so the right colours are there from the first frame.
   Preview: ?time=dawn | day | dusk | night
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var LAT = 31.78, LON = 35.22;            // Jerusalem
  var root = document.documentElement;

  function sunAltitude(date) {
    var rad = Math.PI / 180;
    var d = date.getTime() / 864e5 - 10957.5;            // days since J2000
    var g = (357.529 + 0.98560028 * d) * rad;
    var q = 280.459 + 0.98564736 * d;
    var L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    var e = (23.439 - 0.00000036 * d) * rad;
    var ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    var dec = Math.asin(Math.sin(e) * Math.sin(L));
    var gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
    var h = (gmst * 15 + LON) * rad - ra;
    return Math.asin(Math.sin(LAT * rad) * Math.sin(dec) + Math.cos(LAT * rad) * Math.cos(dec) * Math.cos(h)) / rad;
  }

  function phaseNow() {
    var now = new Date();
    var a = sunAltitude(now);
    if (a > 7) return 'day';
    if (a <= -7) return 'night';
    return sunAltitude(new Date(now.getTime() + 6e5)) > a ? 'dawn' : 'dusk';
  }

  var forced = null;
  try { forced = new URLSearchParams(location.search).get('time'); } catch (e) {}
  if (!/^(dawn|day|dusk|night)$/.test(forced || '')) forced = null;

  var PHASES = ['dawn', 'day', 'dusk', 'night'];
  function apply(p) {
    PHASES.forEach(function (x) { root.classList.toggle('tod-' + x, x === p); });
    root.setAttribute('data-tod', p);
    window.krav0nTimeOfDay = p;
    try { document.dispatchEvent(new CustomEvent('krav0n:timeofday', { detail: p })); } catch (e) {}
  }
  apply(forced || phaseNow());
  if (!forced) setInterval(function () { var p = phaseNow(); if (p !== window.krav0nTimeOfDay) apply(p); }, 60000);

  /* ── Colours ──────────────────────────────────────────────────────────── */
  var css = [
    '.ocean{transition:background 3s ease}',
    '.ocean__rays,.ocean__surface{transition:opacity 3s ease,filter 3s ease}',
    // day
    'html.tod-day .ocean{background:radial-gradient(120% 70% at 50% -12%,rgba(140,215,255,.46) 0%,rgba(40,120,210,0) 64%),linear-gradient(180deg,#155ca6 0%,#0c3b7a 32%,#062454 66%,#031533 100%)}',
    'html.tod-day .ocean__rays{opacity:1;filter:brightness(1.35)}',
    'html.tod-day .ocean__surface{opacity:.9}',
    // dawn
    'html.tod-dawn .ocean{background:radial-gradient(120% 62% at 30% -10%,rgba(255,160,170,.55) 0%,rgba(255,190,150,.18) 40%,rgba(255,170,160,0) 64%),radial-gradient(120% 65% at 70% -12%,rgba(120,190,255,.25) 0%,rgba(12,59,122,0) 62%),linear-gradient(180deg,#3a4a86 0%,#1a3366 34%,#081a40 70%,#020b1c 100%)}',
    'html.tod-dawn .ocean__rays{opacity:.8;filter:sepia(.5) hue-rotate(-25deg) saturate(1.6)}',
    // dusk
    'html.tod-dusk .ocean{background:radial-gradient(110% 60% at 70% -10%,rgba(255,140,60,.42) 0%,rgba(255,120,60,0) 58%),radial-gradient(120% 70% at 25% -12%,rgba(170,90,220,.30) 0%,rgba(90,40,150,0) 60%),linear-gradient(180deg,#2b2f6e 0%,#141f52 34%,#081236 68%,#030818 100%)}',
    'html.tod-dusk .ocean__rays{opacity:.75;filter:sepia(.8) hue-rotate(-30deg) saturate(2.2)}',
    // night
    'html.tod-night .ocean{background:radial-gradient(60% 45% at 72% -8%,rgba(190,210,255,.16) 0%,rgba(120,150,230,0) 62%),linear-gradient(180deg,#071733 0%,#040e24 38%,#020814 70%,#010409 100%)}',
    'html.tod-night .ocean__rays{opacity:.22;filter:saturate(.4)}',
    'html.tod-night .ocean__surface{opacity:.35}',
    // night life
    '.ocean__night{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity 3s ease}',
    'html.tod-night .ocean__night{opacity:1}',
    '.ocean__night canvas{position:absolute;inset:0;width:100%;height:100%}',
    '.jelly{position:absolute;bottom:-160px;left:var(--x);width:var(--w);opacity:.75;animation:jellyRise var(--d) linear var(--t) infinite;filter:drop-shadow(0 0 14px rgba(var(--c),.7))}',
    '.jelly svg{display:block;width:100%;height:auto;overflow:visible}',
    '.jelly .bell{transform-origin:50% 100%;transform-box:fill-box;animation:jellyPulse 2.4s ease-in-out infinite}',
    '.jelly .tent{transform-origin:50% 0;transform-box:fill-box;animation:jellyTent 2.4s ease-in-out infinite}',
    '@keyframes jellyRise{0%{transform:translate(0,0)}50%{transform:translate(30px,-60vh)}100%{transform:translate(-10px,-125vh)}}',
    '@keyframes jellyPulse{0%,100%{transform:scale(1,1)}40%{transform:scale(.86,1.08)}}',
    '@keyframes jellyTent{0%,100%{transform:scaleY(1) skewX(0)}40%{transform:scaleY(1.12) skewX(4deg)}70%{transform:scaleY(.94) skewX(-4deg)}}',
    '@media (prefers-reduced-motion:reduce){.jelly{display:none}}',
    'body.access-no-animation .jelly{display:none}'
  ].join('');
  var st = document.createElement('style');
  st.textContent = css;
  (document.head || root).appendChild(st);

  /* ── Night life (built once the page body exists) ────────────────────── */
  function jellySVG(c) {
    return '<svg viewBox="0 0 60 110"><defs><radialGradient id="jg' + c.replace(/\D/g, '') + '" cx="50%" cy="40%" r="60%">' +
      '<stop offset="0" stop-color="rgb(' + c + ')" stop-opacity=".95"/><stop offset="1" stop-color="rgb(' + c + ')" stop-opacity=".15"/></radialGradient></defs>' +
      '<g class="tent" fill="none" stroke="rgba(' + c + ',.55)" stroke-width="1.6" stroke-linecap="round">' +
      '<path d="M14 34 C12 54 18 70 13 94"/><path d="M24 36 C26 58 20 76 25 104"/><path d="M36 36 C34 58 40 76 35 104"/><path d="M46 34 C48 54 42 70 47 94"/></g>' +
      '<path class="bell" d="M4 34 C4 14 16 4 30 4 C44 4 56 14 56 34 C50 38 42 36 38 38 C34 40 26 40 22 38 C18 36 10 38 4 34Z" fill="url(#jg' + c.replace(/\D/g, '') + ')"/>' +
      '<ellipse cx="22" cy="16" rx="7" ry="4" fill="#fff" opacity=".35"/></svg>';
  }

  function buildNight() {
    var ocean = document.getElementById('ocean');
    if (!ocean || ocean.querySelector('.ocean__night')) return;
    var layer = document.createElement('div');
    layer.className = 'ocean__night';
    layer.setAttribute('aria-hidden', 'true');
    var JELLY = [
      { x: '8%',  w: '54px', d: '58s', t: '-12s', c: '120, 220, 255' },
      { x: '78%', w: '70px', d: '72s', t: '-40s', c: '200, 140, 255' },
      { x: '45%', w: '42px', d: '64s', t: '-5s',  c: '120, 255, 210' },
      { x: '92%', w: '38px', d: '80s', t: '-60s', c: '255, 150, 220' }
    ];
    var html = '<canvas></canvas>';
    JELLY.forEach(function (j) {
      html += '<div class="jelly" style="--x:' + j.x + ';--w:' + j.w + ';--d:' + j.d + ';--t:' + j.t + ';--c:' + j.c + '">' + jellySVG(j.c) + '</div>';
    });
    layer.innerHTML = html;
    ocean.insertBefore(layer, ocean.querySelector('.ocean__grain') || null);

    // glowing plankton
    var cv = layer.querySelector('canvas'), ctx = cv.getContext('2d');
    var W = 0, H = 0, dpr = 1, ps = [], raf = 0;
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size(); addEventListener('resize', size);
    var COLORS = ['120,230,255', '110,255,200', '170,160,255'];
    var N = W < 700 ? 40 : 80;
    for (var i = 0; i < N; i++) ps.push({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 1.8, vx: (Math.random() - 0.5) * 0.12, vy: -0.05 - Math.random() * 0.15, ph: Math.random() * 6.28, sp: 0.01 + Math.random() * 0.03, c: COLORS[(Math.random() * 3) | 0] });
    function off() {
      return (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.body.classList.contains('access-no-animation');
    }
    function frame() {
      raf = requestAnimationFrame(frame);
      if (document.hidden || window.krav0nTimeOfDay !== 'night') return;
      ctx.clearRect(0, 0, W, H);
      var still = off();
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (!still) {
          p.ph += p.sp; p.x += p.vx + Math.sin(p.ph * 0.5) * 0.08; p.y += p.vy;
          if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
          if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        }
        var a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(p.ph));
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        g.addColorStop(0, 'rgba(' + p.c + ',' + a + ')');
        g.addColorStop(1, 'rgba(' + p.c + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 6.283); ctx.fill();
      }
    }
    raf = requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(buildNight, 0); });
  else setTimeout(buildNight, 0);
})();
