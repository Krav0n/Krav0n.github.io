/* ════════════════════════════════════════════════════════════════════════
   Group canvas — a shared pixel board, live over WebSocket
   Server: Cloudflare Worker (code kept on the PC: D:\LIVE\krav0n-canvas-worker). Set its URL in js/config.js → canvasApi
   Admin:  open canvas.html#admin and log in with the ADMIN_KEY
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var doc = document;
  var cfg = window.KRAV0N_CONFIG || {};
  var API = String(cfg.canvasApi || '').trim().replace(/\/+$/, '');
  var toast = window.krav0nToast || function (m) { console.log(m); };

  // 52 colors, sorted by shade: grays, reds/oranges/browns, yellows, greens, blues, purples, pinks
  var PALETTE = ['#ffffff', '#d4d7d9', '#898d90', '#515252', '#2f4f4f', '#000000', '#ff99aa', '#ff8c69', '#ff0000', '#ff4500', '#ffe0c2', '#f5deb3', '#ffcc99',
                 '#ffb470', '#e0a370', '#ffd635', '#ffa800', '#9c6926', '#8d5524', '#6d482f', '#fff8b8', '#ffd700', '#ffff00', '#7eed56', '#53fc18', '#556b2f',
                 '#00ff7f', '#00cc78', '#00a368', '#bfefff', '#87ceeb', '#51e9f4', '#00ccc0', '#009eaa', '#00756f', '#94b3ff', '#2e9bff', '#3690ea', '#2450a4',
                 '#0b1d51', '#6a5cff', '#493ac1', '#e4abff', '#811e9f', '#4b0082', '#c8a2c8', '#b44ac0', '#ff00ff', '#ff3881', '#de107f', '#be0039', '#6d001a'];
  // Pixels are stored as 0xRRGGBB, so any color works (the palette is just shortcuts)
  var WHITE = 0xffffff;
  function hexToInt(h) { return parseInt(String(h).slice(1, 7), 16); }
  function intToHex(v) { return '#' + ('000000' + (v >>> 0).toString(16)).slice(-6); }

  function $(id) { return doc.getElementById(id); }
  function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }

  var stage = $('gStage'), canvas = $('gCanvas');
  if (!stage || !canvas) return;
  var ctx = canvas.getContext('2d');

  /* ── identity ── */
  var uid = lsGet('krav0n-canvas-uid');
  if (!uid || !/^[a-zA-Z0-9_-]{16,64}$/.test(uid)) {
    var bytes = new Uint8Array(18);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    uid = btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    lsSet('krav0n-canvas-uid', uid);
  }
  var myName = lsGet('krav0n-canvas-name') || '';

  /* ── state ── */
  var W = 256, H = 256;
  var board = null;
  var off = doc.createElement('canvas');
  var offCtx = off.getContext('2d');
  var img = null;
  var color = parseInt(lsGet('krav0n-canvas-color3') || '', 16);
  if (!(color >= 0 && color <= WHITE)) color = 0x000000;
  var view = { s: 4, x: 0, y: 0 };
  var hover = null;          // {x, y}
  var areaSel = null;        // admin area rectangle {x0,y0,x1,y1}
  var mark = null;           // admin inspected pixel
  var ws = null, wsOpen = false, retry = 0, retryTimer = 0;
  var clockOffset = 0;       // serverNow - Date.now()
  var nextAt = 0, cooldown = 5, locked = false;
  var myStatus = null;       // {kind, until}
  var pendingPlace = null;
  var isAdmin = false, isMod = false, adminKey = ssGet('krav0n-canvas-admin');
  var tool = 'paint';
  var imgPlace = null;
  var access = { gate: false, openUntil: 0, openBy: '' };   // Kick shop: canvas open for everyone
  var myGrant = 0, myCode = '';                               // Kick shop: personal drawing time
  var erasing = false;       // eraser = paint the pixel white
  var gridOn = lsGet('krav0n-canvas-ggrid') === '1';       // admin: picture waiting to be placed {w,h,x,y,data,canvas}

  /* ── palette ── */
  var pal = $('gPalette');
  PALETTE.forEach(function (hex, i) {
    var b = el('button', 'p-sw g-swatch');
    b.type = 'button';
    b.style.background = hex;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', 'צבע ' + hex);
    b.title = hex;
    b.dataset.c = hex;
    b.addEventListener('click', function () { setColor(hexToInt(hex)); });
    pal.appendChild(b);
  });
  // free color picker — any color the viewer wants
  var pick = $('gColor');
  if (pick) {
    pal.appendChild(pick.parentNode);
    pick.addEventListener('input', function () { setColor(hexToInt(pick.value)); });
  }
  function setColor(v) {
    color = v;
    var hex = intToHex(v);
    lsSet('krav0n-canvas-color3', hex.slice(1));
    var sw = pal.querySelectorAll('.g-swatch');
    for (var k = 0; k < sw.length; k++) { var on = sw[k].dataset.c === hex; sw[k].classList.toggle('active', on); sw[k].setAttribute('aria-checked', on ? 'true' : 'false'); }
    if (pick) pick.value = hex;
    var cur = $('gCurrent'); if (cur) cur.style.background = hex;
    if (typeof setGTool === 'function' && erasing) setGTool('paint');
    draw();
  }
  setColor(color);

  /* ── drawing ── */
  function resize() {
    var r = stage.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    draw();
  }
  function fit() {
    var r = stage.getBoundingClientRect();
    var s = Math.max(1, Math.floor(Math.min(r.width / W, r.height / H) * 0.94 * 10) / 10);
    view.s = s;
    view.x = (r.width - W * s) / 2;
    view.y = (r.height - H * s) / 2;
    draw();
  }
  var drawQueued = false;
  function draw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(function () { drawQueued = false; paint(); });
  }
  function paint() {
    var dpr = canvas.width / Math.max(1, stage.clientWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!board) return;
    ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.x, dpr * view.y);
    ctx.imageSmoothingEnabled = false;
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 0;
    ctx.drawImage(off, 0, 0);
    var lw = 1 / view.s;
    // grid when zoomed in
    if (view.s >= 14 || (gridOn && view.s >= 3)) {
      ctx.strokeStyle = gridOn ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.08)'; ctx.lineWidth = lw;
      ctx.beginPath();
      for (var gx = 0; gx <= W; gx++) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
      for (var gy = 0; gy <= H; gy++) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(92,200,255,0.5)'; ctx.lineWidth = 2 * lw; ctx.strokeRect(0, 0, W, H);
    if (hover && tool !== 'area' && !imgPlace) {
      ctx.fillStyle = tool === 'paint' ? intToHex(erasing ? WHITE : color) : 'rgba(250,204,21,0.25)';
      ctx.globalAlpha = tool === 'paint' ? 0.75 : 1;
      ctx.fillRect(hover.x, hover.y, 1, 1);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * lw; ctx.strokeRect(hover.x, hover.y, 1, 1);
      ctx.strokeStyle = '#000000'; ctx.lineWidth = lw; ctx.strokeRect(hover.x - lw, hover.y - lw, 1 + 2 * lw, 1 + 2 * lw);
    }
    if (mark) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3 * lw; ctx.strokeRect(mark.x, mark.y, 1, 1); }
    if (imgPlace && imgPlace.canvas) {
      ctx.globalAlpha = 0.88;
      ctx.drawImage(imgPlace.canvas, imgPlace.x, imgPlace.y);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2 * lw; ctx.setLineDash([4 * lw, 3 * lw]);
      ctx.strokeRect(imgPlace.x, imgPlace.y, imgPlace.w, imgPlace.h); ctx.setLineDash([]);
    }
    if (areaSel) {
      var a = normArea(areaSel);
      ctx.fillStyle = 'rgba(250,204,21,0.14)'; ctx.fillRect(a.x0, a.y0, a.x1 - a.x0 + 1, a.y1 - a.y0 + 1);
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2 * lw; ctx.setLineDash([4 * lw, 3 * lw]);
      ctx.strokeRect(a.x0, a.y0, a.x1 - a.x0 + 1, a.y1 - a.y0 + 1); ctx.setLineDash([]);
    }
  }
  function normArea(a) { return { x0: Math.min(a.x0, a.x1), y0: Math.min(a.y0, a.y1), x1: Math.max(a.x0, a.x1), y1: Math.max(a.y0, a.y1) }; }

  function setBoard(b64, w, h) {
    W = w; H = h;
    var bin = atob(b64);          // 3 bytes (R, G, B) per pixel
    board = new Uint32Array(W * H);
    for (var i = 0; i < W * H; i++) board[i] = (bin.charCodeAt(i * 3) << 16) | (bin.charCodeAt(i * 3 + 1) << 8) | bin.charCodeAt(i * 3 + 2);
    off.width = W; off.height = H;
    img = offCtx.createImageData(W, H);
    for (var k = 0; k < board.length; k++) putPx(k, board[k], true);
    offCtx.putImageData(img, 0, 0);
    if (!setBoard.fitted) { setBoard.fitted = true; fit(); } else draw();
  }
  function putPx(i, c, noFlush) {
    if (!board) return;
    board[i] = c;
    var o = i * 4;
    img.data[o] = (c >> 16) & 255; img.data[o + 1] = (c >> 8) & 255; img.data[o + 2] = c & 255; img.data[o + 3] = 255;
    if (!noFlush) { offCtx.putImageData(img, 0, 0, i % W, Math.floor(i / W), 1, 1); draw(); }
  }

  /* ── view: pan / zoom ── */
  function cellAt(clientX, clientY) {
    var r = stage.getBoundingClientRect();
    var x = Math.floor((clientX - r.left - view.x) / view.s), y = Math.floor((clientY - r.top - view.y) / view.s);
    return (x >= 0 && y >= 0 && x < W && y < H) ? { x: x, y: y } : null;
  }
  function zoomAt(factor, cx, cy) {
    var r = stage.getBoundingClientRect();
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    var px = cx - r.left, py = cy - r.top;
    userMoved = true;
    var ns = Math.max(1, Math.min(60, view.s * factor));
    var k = ns / view.s;
    view.x = px - (px - view.x) * k;
    view.y = py - (py - view.y) * k;
    view.s = ns;
    draw();
  }
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
  }, { passive: false });
  $('gZoomIn').addEventListener('click', function () { zoomAt(1.4); });
  $('gZoomOut').addEventListener('click', function () { zoomAt(1 / 1.4); });
  $('gZoomFit').addEventListener('click', function () { userMoved = false; fit(); });

  var pointers = new Map();
  var gesture = null; // {type:'pan'|'pinch'|'area', ...}
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.g-zoom, .g-quiet')) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      var p = [...pointers.values()];
      gesture = { type: 'pinch', d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2 };
      return;
    }
    if (isAdmin && imgPlace && e.button === 0) {
      var ci = cellAt(e.clientX, e.clientY);
      if (ci && ci.x >= imgPlace.x && ci.y >= imgPlace.y && ci.x < imgPlace.x + imgPlace.w && ci.y < imgPlace.y + imgPlace.h) {
        gesture = { type: 'move', ox: ci.x - imgPlace.x, oy: ci.y - imgPlace.y }; stage.classList.add('is-placing'); return;
      }
    }
    if (isAdmin && tool === 'area' && e.button === 0) {
      var c = cellAt(e.clientX, e.clientY);
      if (c) { gesture = { type: 'area' }; areaSel = { x0: c.x, y0: c.y, x1: c.x, y1: c.y }; draw(); return; }
    }
    gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, button: e.button };
  });
  stage.addEventListener('pointermove', function (e) {
    var c = cellAt(e.clientX, e.clientY);
    if (e.pointerType === 'mouse' || !pointers.size) {
      if ((c && (!hover || c.x !== hover.x || c.y !== hover.y)) || (!c && hover)) { hover = c; draw(); }
      $('gCoords').textContent = c ? (c.x + ', ' + c.y) : '–, –';
    }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      var p = [...pointers.values()];
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      var mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
      view.x += mx - gesture.mx; view.y += my - gesture.my;
      zoomAt(d / (gesture.d || d), mx, my);
      gesture.d = d; gesture.mx = mx; gesture.my = my;
    } else if (gesture.type === 'pan') {
      var dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
      if (!gesture.moved && Math.hypot(dx, dy) > 6) { gesture.moved = true; stage.classList.add('is-panning'); }
      if (gesture.moved) { userMoved = true; view.x = gesture.vx + dx; view.y = gesture.vy + dy; draw(); }
    } else if (gesture.type === 'move' && c) {
      imgPlace.x = clampX(c.x - gesture.ox); imgPlace.y = clampY(c.y - gesture.oy); draw(); imgInfo();
    } else if (gesture.type === 'area' && c) {
      areaSel.x1 = c.x; areaSel.y1 = c.y; draw();
    }
  });
  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    stage.classList.remove('is-panning');
    if (!gesture) return;
    var g = gesture;
    if (g.type === 'pinch') { if (pointers.size === 0) gesture = null; return; }
    gesture = null;
    if (e.type === 'pointercancel') return;
    if (g.type === 'move') { stage.classList.remove('is-placing'); return; }
    if (g.type === 'area') { adminAreaQuery(); return; }
    if (g.type === 'pan' && !g.moved && g.button === 0) {
      var c = cellAt(e.clientX, e.clientY);
      if (!c) return;
      if (isAdmin && imgPlace) { imgPlace.x = clampX(c.x - Math.floor(imgPlace.w / 2)); imgPlace.y = clampY(c.y - Math.floor(imgPlace.h / 2)); draw(); imgInfo(); return; }
      if (isAdmin && tool === 'inspect') { adminWho(c.x, c.y); return; }
      place(c.x, c.y);
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !pointers.size) { hover = null; draw(); $('gCoords').textContent = '–, –'; } });

  var userMoved = false;
  if (typeof ResizeObserver === 'function') new ResizeObserver(function () { resize(); if (!userMoved && board) fit(); }).observe(stage);
  else window.addEventListener('resize', resize);
  doc.addEventListener('cv:view', function (e) {
    if (e.detail === 'group') { resize(); setTimeout(maybeAskName, 50); }
    else if (!nameModal.hidden) nameModal.hidden = true;
  });

  /* ── banner / cooldown UI ── */
  var banner = $('gBanner');
  function serverNow() { return Date.now() + clockOffset; }
  function fmtLeft(ms) {
    var s = Math.ceil(ms / 1000);
    if (s < 60) return s + ' שניות';
    var m = Math.ceil(s / 60);
    if (m < 60) return m + ' דקות';
    var h = Math.floor(m / 60), mm = m % 60;
    if (h < 24) return h + ' שעות' + (mm ? ' ו-' + mm + ' דק׳' : '');
    return Math.ceil(h / 24) + ' ימים';
  }
  function updateBanner() {
    var text = '', cls = '';
    if (!API) { text = 'הקנבס הקבוצתי עוד לא מחובר לשרת. בינתיים אפשר לצייר בקנבס האישי!'; cls = 'is-warn'; }
    else if (myStatus && !isAdmin) {
      if (myStatus.kind === 'ban') { text = 'נחסמת מהציור בקנבס הקבוצתי.'; cls = 'is-bad'; }
      else {
        var left = myStatus.until - serverNow();
        if (left <= 0) { myStatus = null; return updateBanner(); }
        text = 'קיבלת טיימאוט — אפשר לצייר שוב בעוד ' + fmtLeft(left); cls = 'is-bad';
      }
    } else if (locked && !isAdmin) { text = 'הקנבס נעול כרגע 🔒'; cls = 'is-warn'; }
    banner.hidden = !text;
    banner.textContent = text;
    banner.className = 'g-banner' + (cls ? ' ' + cls : '');
  }
  function updateCooldown() {
    var cd = $('gCd'), fill = $('gCdFill'), txt = $('gCdText');
    var left = nextAt ? nextAt - serverNow() : 0;
    if (left > 0 && !isAdmin) {
      cd.classList.add('is-wait');
      fill.style.width = Math.max(0, 100 - (left / (cooldown * 1000)) * 100) + '%';
      txt.textContent = 'הפיקסל הבא בעוד ' + Math.ceil(left / 1000) + ' שנ׳';
    } else {
      cd.classList.remove('is-wait');
      fill.style.width = '100%';
      txt.textContent = !wsOpen ? 'לא מחובר' : (!(myName && serverKnowsMe) ? 'בחרו כינוי כדי לצייר' : (canDrawNow() ? 'אפשר לצייר!' : 'הקנבס נעול 🔒'));
    }
  }
  setInterval(function () { updateCooldown(); if (myStatus) updateBanner(); }, 250);

  function setConn(stateName, text) {
    var c = $('gConn');
    c.classList.toggle('is-on', stateName === 'on');
    c.classList.toggle('is-off', stateName === 'off');
    $('gConnText').textContent = text;
  }

  /* ── name ── */
  var nameModal = $('nameModal'), nameInput = $('nameInput'), nameErr = $('nameErr'), nameRules = $('nameRules');
  var nameBtn = $('gNameBtn');
  var serverKnowsMe = false;
  function renderName() {
    $('gNameText').textContent = myName ? myName : 'בחירת כינוי';
    nameBtn.classList.toggle('is-locked', !!(myName && serverKnowsMe));
    nameBtn.title = myName && serverKnowsMe ? 'הכינוי שלך נשמר לתמיד' : 'בחירת כינוי';
  }
  renderName();
  function groupActive() { var v = $('groupView'); return v && v.classList.contains('active'); }
  function needName() { return API && wsOpen && !(myName && serverKnowsMe); }
  function maybeAskName() { if (needName() && groupActive() && !isAdmin && adminModal.hidden) askName(); }
  $('nameToPersonal').addEventListener('click', function () {
    nameModal.hidden = true;
    var t = doc.querySelector('.cv-tab[data-view="personal"]'); if (t) t.click();
  });
  function askName() {
    nameInput.value = serverKnowsMe ? myName : '';
    nameRules.checked = false;
    nameErr.hidden = true;
    nameModal.hidden = false;
    setTimeout(function () { nameInput.focus(); }, 30);
  }
  nameBtn.addEventListener('click', function () { if (myName && serverKnowsMe) { toast('הכינוי שלך הוא ' + myName + ' — הוא נשמר לתמיד'); return; } askName(); });
  $('nameForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = nameInput.value.replace(/\s+/g, ' ').trim();
    if (n.length < 2 || n.length > 20) { nameErr.textContent = 'הכינוי צריך להיות 2–20 תווים'; nameErr.hidden = false; return; }
    if (/\d[\d\s\-.]{5,}\d/.test(n)) { nameErr.textContent = 'בלי מספרי טלפון בכינוי 🙂'; nameErr.hidden = false; return; }
    if (!wsOpen) { nameErr.textContent = 'אין חיבור לשרת כרגע, נסו שוב עוד רגע'; nameErr.hidden = false; return; }
    send({ t: 'hello', uid: uid, name: n, pick: true });
  });
  var nameForm = $('nameForm');

  /* ── placing ── */
  function place(x, y) {
    if (!API) { toast('הקנבס הקבוצתי עוד לא מחובר לשרת'); return; }
    if (!wsOpen) { toast('אין חיבור לשרת, מתחבר מחדש…'); return; }
    if (!(myName && serverKnowsMe)) { pendingPlace = { x: x, y: y }; askName(); return; }
    if (myStatus && !isAdmin) { updateBanner(); toast(banner.textContent); return; }
    if (locked && !isAdmin) { toast('הקנבס נעול כרגע'); return; }
    if (!canDrawNow()) { toast('הקנבס נעול — אפשר לפתוח אותו דרך החנות בקיק'); flashAccess(); return; }
    var left = nextAt - serverNow();
    if (left > 0 && !isAdmin) { toast('עוד ' + Math.ceil(left / 1000) + ' שניות לפיקסל הבא'); return; }
    var c = erasing ? WHITE : color;
    if (board[y * W + x] === c) return;
    send({ t: 'place', x: x, y: y, c: c });
    putPx(y * W + x, c);         // optimistic; the server echoes the real value
  }

  /* ── socket ── */
  function send(o) { if (ws && wsOpen) ws.send(JSON.stringify(o)); }
  function connect() {
    if (!API) { setConn('off', 'לא מחובר'); updateBanner(); updateCooldown(); return; }
    clearTimeout(retryTimer);
    setConn('', 'מתחבר…');
    try { ws = new WebSocket(API.replace(/^http/, 'ws') + '/ws'); } catch (e) { return scheduleRetry(); }
    ws.onopen = function () {
      wsOpen = true; retry = 0;
      setConn('on', 'מחובר');
      if (adminKey) send({ t: 'auth', key: adminKey });
      send(myName ? { t: 'hello', uid: uid, name: myName } : { t: 'hello', uid: uid });
      updateCooldown();
    };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.now) clockOffset = m.now - Date.now();
      onMessage(m);
    };
    ws.onclose = function () {
      var was = wsOpen;
      wsOpen = false; ws = null;
      setConn('off', 'מנותק');
      updateCooldown();
      if (was) toast('החיבור לקנבס נותק, מתחבר מחדש…');
      scheduleRetry();
    };
    ws.onerror = function () {};
  }
  function scheduleRetry() {
    retry = Math.min(retry + 1, 6);
    retryTimer = setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, retry)));
  }
  doc.addEventListener('visibilitychange', function () { if (!doc.hidden && !ws && API) connect(); });
  setInterval(function () { if (wsOpen && !doc.hidden) send({ t: 'ping' }); }, 25000);

  function onMessage(m) {
    switch (m.t) {
      case 'init':
        setBoard(m.board, m.w, m.h);
        cooldown = m.cooldown; locked = !!m.locked;
        if (m.access) access = m.access;
        renderAccess();
        updateBanner();
        break;
      case 'p': putPx(m.i, m.c); break;
      case 'ps':
        for (var k = 0; k < m.d.length; k += 2) putPx(m.d[k], m.d[k + 1], true);
        offCtx.putImageData(img, 0, 0); draw();
        break;
      case 'online': $('gOnline').textContent = String(m.n); break;
      case 'name':
        if (m.ok) {
          myName = m.name; serverKnowsMe = true; lsSet('krav0n-canvas-name', myName); renderName();
          if (!nameModal.hidden) { nameModal.hidden = true; toast('היי ' + myName + ', אפשר לצייר!'); }
          if (pendingPlace) { var pp = pendingPlace; pendingPlace = null; setTimeout(function () { place(pp.x, pp.y); }, 50); }
        } else {
          if (!serverKnowsMe) { myName = ''; lsSet('krav0n-canvas-name', ''); renderName(); }
          if (nameModal.hidden && groupActive()) askName();
          nameErr.textContent = m.msg || 'הכינוי לא תקין'; nameErr.hidden = false;
        }
        break;
      case 'access':
        var wasOpen = access.openUntil > serverNow();
        access = { gate: m.gate, openUntil: m.openUntil, openBy: m.openBy };
        if (!wasOpen && access.openUntil > serverNow()) toast('🌍 הקנבס נפתח לכולם' + (access.openBy ? ' בזכות ' + access.openBy : '') + '!');
        renderAccess();
        if (isAdmin) send({ t: 'a:access' });
        break;
      case 'shop': if (isAdmin) { send({ t: 'a:access' }); refreshUsers(); } break;
      case 'grant':
        if (m.until > myGrant && m.until > serverNow()) toast('🎨 יש לך גישה אישית לציור!');
        myGrant = m.until || 0; renderAccess();
        break;
      case 'me':
        myStatus = m.status; if (m.next) nextAt = m.next;
        if (m.code) myCode = m.code;
        myGrant = m.grant || 0;
        renderAccess();
        if (m.name) { myName = m.name; serverKnowsMe = true; lsSet('krav0n-canvas-name', myName); renderName(); if (!nameModal.hidden) nameModal.hidden = true; }
        else {
          if (serverKnowsMe) { myName = ''; lsSet('krav0n-canvas-name', ''); toast('צריך לבחור כינוי חדש'); }
          serverKnowsMe = false; renderName(); if (!myName) maybeAskName();
        }
        updateBanner();
        break;
      case 'status':
        var was = myStatus;
        myStatus = m.status;
        updateBanner();
        if (!myStatus && was) toast('אפשר לצייר שוב 🎨');
        break;
      case 'cd': nextAt = m.next; updateCooldown(); break;
      case 'deny':
        if (m.why === 'name') askName();
        if (m.why === 'gate') { toast('הקנבס נעול — אפשר לפתוח אותו דרך החנות בקיק'); flashAccess(); }
        if (m.why === 'locked') toast('הקנבס נעול כרגע');
        break;
      case 'settings':
        cooldown = m.cooldown; locked = !!m.locked; updateBanner();
        if (isAdmin) fillSettings();
        break;
      case 'auth': onAuth(m); break;
      default:
        if (m.t && m.t.indexOf('a:') === 0) onAdminReply(m);
    }
  }

  /* ── download the board as a picture ── */
  $('gDownload').addEventListener('click', function () {
    if (!board) return;
    var k = 8, c = doc.createElement('canvas');
    c.width = W * k; c.height = H * k;
    var cx = c.getContext('2d'); cx.imageSmoothingEnabled = false; cx.drawImage(off, 0, 0, c.width, c.height);
    c.toBlob(function (blob) {
      var a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'krav0n-group-canvas.png';
      doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  });

  /* ════════════════════ ADMIN ════════════════════ */
  var adminBox = $('gAdmin'), adminModal = $('adminModal'), layout = doc.querySelector('.g-layout');
  if ((location.hash === '#admin' || location.hash === '#mod') && !adminKey) { adminModal.hidden = false; setTimeout(function () { $('adminKey').focus(); }, 50); }
  window.addEventListener('hashchange', function () { if ((location.hash === '#admin' || location.hash === '#mod') && !isAdmin) adminModal.hidden = false; });

  $('adminForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var key = $('adminKey').value.trim();
    if (!key) return;
    if (!wsOpen) { $('adminErr').textContent = 'אין חיבור לשרת'; $('adminErr').hidden = false; return; }
    adminKey = key;
    send({ t: 'auth', key: key });
  });
  function onAuth(m) {
    if (m.ok) {
      isAdmin = true;
      isMod = m.role === 'mod';
      applyRole();
      ssSet('krav0n-canvas-admin', adminKey);
      adminModal.hidden = true; $('adminKey').value = '';
      adminBox.hidden = false; layout.classList.add('has-admin'); $('gAdminTag').hidden = false;
      if ($('gAdminOpen')) $('gAdminOpen').hidden = true;
      if (m.settings) { cooldown = m.settings.cooldown; locked = !!m.settings.locked; }
      fillSettings(); updateBanner(); resize();
      refreshUsers(); refreshBans(); send({ t: 'a:access' });
      if (!(myName && serverKnowsMe)) setTimeout(function () { if (!(myName && serverKnowsMe)) askName(); }, 400);
    } else if (m.revoked) {
      ssSet('krav0n-canvas-admin', null);
      alert('מפתח המודים הוחלף — צריך להתחבר מחדש עם המפתח החדש.');
      location.hash = ''; location.reload();
    } else {
      adminKey = null; ssSet('krav0n-canvas-admin', null);
      $('adminErr').textContent = 'מפתח שגוי'; $('adminErr').hidden = false;
      if (location.hash === '#admin') adminModal.hidden = false;
    }
  }
  // moderators see only: tools, open/lock, users, bans, cooldown + full lock
  function applyRole() {
    doc.querySelectorAll('[data-admin-only]').forEach(function (n) { n.hidden = isMod; });
    $('gaTitle').textContent = isMod ? 'פאנל מודים' : 'פאנל ניהול';
    $('gAdminTag').lastChild.textContent = isMod ? ' MOD' : ' ADMIN';
  }
  $('gaLogout').addEventListener('click', function () {
    ssSet('krav0n-canvas-admin', null); adminKey = null;
    location.hash = ''; location.reload();
  });

  // tools
  var help = { paint: 'צביעה רגילה (בלי זמן המתנה למנהל).', inspect: 'לחצו על פיקסל כדי לראות מי צייר אותו.', area: 'גררו מלבן על הקנבס כדי לראות את כל מי שצייר בתוכו (למשל מספר טלפון).' };
  doc.querySelectorAll('.ga-tool').forEach(function (b) {
    b.addEventListener('click', function () {
      tool = b.dataset.tool;
      doc.querySelectorAll('.ga-tool').forEach(function (x) { x.classList.toggle('active', x === b); });
      $('gaHelp').textContent = help[tool];
      if (tool !== 'area') areaSel = null;
      if (tool !== 'inspect') mark = null;
      stage.style.cursor = tool === 'inspect' ? 'help' : (tool === 'area' ? 'cell' : '');
      draw();
    });
  });
  doc.querySelectorAll('.ga-tab').forEach(function (b) {
    b.addEventListener('click', function () {
      doc.querySelectorAll('.ga-tab').forEach(function (x) { x.classList.toggle('active', x === b); });
      doc.querySelectorAll('.ga-pane').forEach(function (p) { p.classList.toggle('active', p.dataset.pane === b.dataset.tab); });
      if (b.dataset.tab === 'users') refreshUsers();
      if (b.dataset.tab === 'bans') refreshBans();
      if (b.dataset.tab === 'log') send({ t: 'a:log' });
    });
  });
  var eraseCb = $('gaEraseToo');
  if (eraseCb) { eraseCb.checked = lsGet('krav0n-mod-erase') !== '0'; eraseCb.addEventListener('change', function () { lsSet('krav0n-mod-erase', eraseCb.checked ? '1' : '0'); }); }
  var searchT = 0;
  $('gaSearch').addEventListener('input', function () { clearTimeout(searchT); searchT = setTimeout(refreshUsers, 250); });

  function refreshUsers() { send({ t: 'a:users', q: $('gaSearch').value }); }
  function refreshBans() { send({ t: 'a:bans' }); }
  function adminWho(x, y) { mark = { x: x, y: y }; draw(); send({ t: 'a:who', x: x, y: y }); }
  function adminAreaQuery() { if (!areaSel) return; var a = normArea(areaSel); send({ t: 'a:area', x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 }); }

  function fillSettings() { $('gaCooldown').value = cooldown; $('gaLocked').checked = !!locked; $('gaGate').checked = !!access.gate; }
  $('gaSaveSettings').addEventListener('click', function () {
    send({ t: 'a:settings', cooldown: Number($('gaCooldown').value) || 0, locked: $('gaLocked').checked, gate: $('gaGate').checked });
  });

  /* admin: Kick shop access */
  var shop = { grants: [], botKey: '' };
  function renderShopState() {
    var now = serverNow(), el2 = $('gaShopState');
    if (!el2) return;
    var parts = [];
    if (locked) parts.push('⚠️ נעילה מלאה פעילה: אף צופה לא יכול לצייר, גם אחרי קנייה (בטלו אותה בהגדרות)');
    if (!access.gate) parts.push('הקנבס פתוח לכולם תמיד (בלי קנייה) — אפשר לשנות בהגדרות');
    else parts.push(access.openUntil > now ? '🌍 פתוח לכולם עוד ' + mmss(access.openUntil - now) + (access.openBy ? ' (' + access.openBy + ')' : '') : '🔒 סגור לכולם');
    var act = shop.grants.filter(function (g) { return g.grant > now; });
    if (!isMod) parts.push(act.length ? '🎨 ' + act.length + ' עם גישה אישית' : 'אין גישות אישיות פעילות');
    el2.textContent = parts.join(' · ');
  }
  function renderShop() {
    var list = $('gaGrants'), now = serverNow();
    var act = shop.grants.filter(function (g) { return g.grant > now; });
    list.replaceChildren.apply(list, act.map(function (u) {
      var row = el('div', 'ga-user');
      var top = el('div', 'ga-user-top');
      var nm = el('span', 'ga-user-name', u.name + (u.kick ? ' · קיק: ' + u.kick : '')); nm.setAttribute('dir', 'auto');
      top.appendChild(nm);
      top.appendChild(el('span', 'ga-badge ga-badge--area', 'עד ' + fmtTime(u.grant)));
      row.appendChild(top);
      var acts = el('div', 'ga-actions');
      var more = el('button', 'cv-btn cv-btn--ghost cv-btn--sm', '+20 דק׳'); more.type = 'button';
      more.addEventListener('click', function () { send({ t: 'a:access', n: u.n, grant: 20 }); });
      var stop = el('button', 'cv-btn cv-btn--danger cv-btn--sm', 'ביטול גישה'); stop.type = 'button';
      stop.addEventListener('click', function () { send({ t: 'a:access', n: u.n, grant: 0 }); });
      acts.appendChild(more); acts.appendChild(stop); row.appendChild(acts);
      return row;
    }));
    var base = API + '/api/redeem?key=' + shop.botKey;
    $('gaUrlPersonal').textContent = base + '&type=personal&minutes=20&user=%user%&code=%rawInputUrlEncoded%';
    $('gaUrlAll').textContent = base + '&type=all&minutes=20&user=%user%';
    renderShopState();
  }
  $('gaOpen30').addEventListener('click', function () { send({ t: 'a:access', open: 20 }); });
  $('gaClose').addEventListener('click', function () { send({ t: 'a:access', open: 0 }); });
  $('gaUnbanAll').addEventListener('click', function () { if (confirm('להסיר את כל הבאנים והטיימאוטים?')) send({ t: 'a:unbanAll' }); });
  $('gaClearAll').addEventListener('click', function () {
    if (confirm('לנקות את כל הקנבס? כל הציורים יימחקו לכולם.') && confirm('בטוח? אי אפשר לבטל את זה.')) send({ t: 'a:clearAll' });
  });
  $('gaRegenModKey').addEventListener('click', function () {
    if (confirm('ליצור מפתח מודים חדש? כל המודים יתנתקו ויצטרכו את המפתח החדש.')) send({ t: 'a:access', regenModKey: true });
  });
  $('gaRegenKey').addEventListener('click', function () {
    if (confirm('ליצור מפתח חדש? הכתובות הישנות ב-Streamer.bot יפסיקו לעבוד ותצטרך להדביק את החדשות.')) send({ t: 'a:access', regenKey: true });
  });
  doc.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = $(b.dataset.copy).textContent;
      (window.krav0nCopy || function () { return Promise.resolve(false); })(t).then(function (ok) { toast(ok ? 'הכתובת הועתקה' : 'לא הצלחתי להעתיק — סמן והעתק ידנית'); });
    });
  });

  function fmtTime(ms) {
    if (!ms) return '';
    var d = new Date(ms - clockOffset);
    var now = new Date();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return d.toDateString() === now.toDateString() ? hm : d.getDate() + '.' + (d.getMonth() + 1) + ' ' + hm;
  }
  function statusOf(u) { return u.ban || u.ipBan || null; }

  var DURATIONS = [[5, '5 דקות'], [10, '10 דקות'], [30, '30 דקות'], [60, 'שעה'], [360, '6 שעות'], [1440, '24 שעות'], [10080, 'שבוע']];

  // Quick moderation: one click = timeout / ban, one click = undo.
  var QUICK = [[5, '5 דק׳'], [30, '30 דק׳'], [60, 'שעה'], [1440, 'יום']];
  function eraseToo() { var cb = $('gaEraseToo'); return !cb || cb.checked; }
  function leftText(until) { var l = until - serverNow(); return l > 0 ? fmtLeft(l) : 'עוד רגע'; }
  function statusChip(st, u) {
    if (!st) return null;
    var viaNet = u && st.ofN && st.ofN !== u.n;   // blocked because another account on the same network got it
    var txt = st.kind === 'ban' ? '🚫 באן' : '⏱ טיימאוט · עוד ' + leftText(st.until);
    if (viaNet) txt += ' · דרך הרשת של ' + (st.of || '?');
    return el('span', 'mod-chip ' + (st.kind === 'ban' ? 'mod-chip--ban' : 'mod-chip--to'), txt);
  }
  function userCard(u, extraBadge) {
    var st = statusOf(u);
    var card = el('div', 'mod-card' + (st ? (st.kind === 'ban' ? ' is-banned' : ' is-timeout') : ''));
    var top = el('div', 'mod-top');
    var dot = el('span', 'mod-dot' + (u.online ? ' on' : '')); dot.title = u.online ? 'מחובר עכשיו' : 'לא מחובר';
    top.appendChild(dot);
    var nm = el('span', 'mod-name', u.name || ('#' + u.n)); nm.setAttribute('dir', 'auto'); top.appendChild(nm);
    if (extraBadge) top.appendChild(el('span', 'mod-chip', extraBadge));
    var chip = statusChip(st, u); if (chip) top.appendChild(chip);
    card.appendChild(top);
    var meta = u.placed + ' פיקסלים · פעיל לאחרונה ' + fmtTime(u.last);
    if (!isMod) meta += ' · קוד ' + (u.code || '—') + (u.grant > serverNow() ? ' · 🎨 גישה עד ' + fmtTime(u.grant) : '');
    card.appendChild(el('div', 'mod-meta', meta));

    if (st) {
      var viaNet = st.ofN && st.ofN !== u.n;
      var undo = el('button', 'mod-undo', '✓ ביטול ה' + (st.kind === 'ban' ? 'באן' : 'טיימאוט') + (viaNet ? ' (לכל הרשת)' : '')); undo.type = 'button';
      undo.addEventListener('click', function () { undo.disabled = true; send({ t: 'a:unban', n: viaNet ? st.ofN : u.n }); });
      card.appendChild(undo);
    } else {
      var row = el('div', 'mod-quick');
      QUICK.forEach(function (q) {
        var b = el('button', 'mod-btn mod-btn--to', '⏱ ' + q[1]); b.type = 'button'; b.title = 'טיימאוט ל-' + q[1];
        b.addEventListener('click', function () { b.disabled = true; send({ t: 'a:punish', n: u.n, kind: 'timeout', minutes: q[0], ip: true, erase: eraseToo() }); });
        row.appendChild(b);
      });
      var ban = el('button', 'mod-btn mod-btn--ban', '🚫 באן'); ban.type = 'button';
      ban.addEventListener('click', function () {
        if (!confirm('לתת באן ל-' + u.name + '? (אפשר לבטל אחר כך בלחיצה אחת)')) return;
        ban.disabled = true; send({ t: 'a:punish', n: u.n, kind: 'ban', ip: true, erase: eraseToo() });
      });
      row.appendChild(ban);
      card.appendChild(row);
    }
    var extra = el('div', 'mod-extra');
    var er = el('button', 'mod-link', '🧹 מחיקת הציורים שלו'); er.type = 'button';
    er.addEventListener('click', function () { if (confirm('למחוק את כל הפיקסלים ש-' + u.name + ' צייר/ה?')) send({ t: 'a:erase', n: u.n }); });
    extra.appendChild(er);
    if (!isMod) {
      var gr = el('button', 'mod-link', u.grant > serverNow() ? '🎨 +20 דק׳ גישה' : '🎨 גישה 20 דק׳'); gr.type = 'button';
      gr.addEventListener('click', function () { send({ t: 'a:access', n: u.n, grant: 20 }); setTimeout(refreshUsers, 300); });
      extra.appendChild(gr);
      var rn = el('button', 'mod-link', '✏️ שינוי שם'); rn.type = 'button';
      rn.addEventListener('click', function () { var nn = prompt('כינוי חדש ל-' + u.name + ':', u.name); if (nn && nn.trim()) send({ t: 'a:rename', n: u.n, name: nn.trim() }); });
      var fr = el('button', 'mod-link', '🔓 שחרור השם'); fr.type = 'button';
      fr.addEventListener('click', function () { if (confirm('לשחרר את השם "' + u.name + '"? השם יתפנה לאחרים, והמשתמש יבחר כינוי חדש.')) send({ t: 'a:freeName', n: u.n }); });
      var nc = el('button', 'mod-link', '🔑 קוד חנות חדש'); nc.type = 'button';
      nc.addEventListener('click', function () { send({ t: 'a:newCode', n: u.n }); });
      var del = el('button', 'mod-link mod-link--danger', '🗑️ מחיקת משתמש'); del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm('למחוק את המשתמש "' + u.name + '" לגמרי? השם שלו יתפנה, והגישות שלו יימחקו.')) return;
        send({ t: 'a:deleteUser', n: u.n, erase: confirm('למחוק גם את כל הפיקסלים שהוא צייר?') });
      });
      extra.appendChild(rn); extra.appendChild(fr); extra.appendChild(nc); extra.appendChild(del);
    }
    card.appendChild(extra);
    return card;
  }

  function emptyRow(text) { return el('div', 'ga-empty', text); }

  var resultBox = $('gaResult');
  var lastResult = null; // re-run after actions
  function showResult(nodes) { resultBox.replaceChildren.apply(resultBox, nodes); resultBox.hidden = false; }

  function onAdminReply(m) {
    switch (m.t) {
      case 'a:who': {
        lastResult = { t: 'a:who', x: m.x, y: m.y };
        var h = el('h3');
        var sw = el('span', 'ga-swatch-mini'); sw.style.background = intToHex(m.c);
        h.appendChild(sw);
        h.appendChild(doc.createTextNode('פיקסל ' + m.x + ', ' + m.y + (m.at ? ' · ' + fmtTime(m.at) : '')));
        showResult([h, m.user ? userCard(m.user) : emptyRow('אף אחד לא צייר כאן (או שזה נמחק)')]);
        break;
      }
      case 'a:area': {
        lastResult = { t: 'a:area', x0: m.area.x0, y0: m.area.y0, x1: m.area.x1, y1: m.area.y1 };
        var hh = el('h3', null, 'אזור ' + m.area.x0 + ',' + m.area.y0 + ' → ' + m.area.x1 + ',' + m.area.y1 + ' · ' + m.users.length + ' משתמשים');
        var clr = el('button', 'cv-btn cv-btn--danger cv-btn--sm', 'ניקוי כל האזור'); clr.type = 'button';
        clr.addEventListener('click', function () {
          if (confirm('לנקות את כל האזור שנבחר?')) send({ t: 'a:clear', x0: m.area.x0, y0: m.area.y0, x1: m.area.x1, y1: m.area.y1 });
        });
        var nodes = [hh, clr];
        if (!m.users.length) nodes.push(emptyRow('אין פיקסלים של משתמשים באזור הזה'));
        m.users.forEach(function (u) { nodes.push(userCard(u, u.inArea + ' באזור')); });
        showResult(nodes);
        break;
      }
      case 'a:users': {
        var list = $('gaUsers');
        if (!m.users.length) list.replaceChildren(emptyRow('עוד אין משתמשים'));
        else list.replaceChildren.apply(list, m.users.map(function (u) { return userCard(u); }));
        break;
      }
      case 'a:bans': {
        var bl = $('gaBans');
        // the same person can have a ban by account and by network — show them once
        var people = {}, order = [];
        m.bans.forEach(function (bn) {
          var k = bn.n ? 'n' + bn.n : bn.key;
          if (!people[k]) { people[k] = { n: bn.n, key: bn.key, name: bn.name, kind: bn.kind, until: bn.until, at: bn.at, reason: bn.reason, others: [] }; order.push(k); }
          else if (bn.kind === 'ban') people[k].kind = 'ban';
          if (bn.others && bn.others.length) people[k].others = bn.others;
        });
        if (!order.length) { bl.replaceChildren(emptyRow('אין חסומים כרגע 👌')); break; }
        bl.replaceChildren.apply(bl, order.map(function (k) {
          var p = people[k];
          var card = el('div', 'mod-card ' + (p.kind === 'ban' ? 'is-banned' : 'is-timeout'));
          var top = el('div', 'mod-top');
          var nm = el('span', 'mod-name', p.name || '?'); nm.setAttribute('dir', 'auto'); top.appendChild(nm);
          top.appendChild(p.kind === 'ban' ? el('span', 'mod-chip mod-chip--ban', '🚫 באן') : el('span', 'mod-chip mod-chip--to', '⏱ עוד ' + leftText(p.until)));
          card.appendChild(top);
          card.appendChild(el('div', 'mod-meta', 'מ-' + fmtTime(p.at) + (p.until ? ' עד ' + fmtTime(p.until) : ' · לצמיתות')));
          if (p.others.length) card.appendChild(el('div', 'mod-meta', '🌐 חסומים איתו באותה רשת: ' + p.others.join(', ')));
          var undo = el('button', 'mod-undo', '✓ ביטול ה' + (p.kind === 'ban' ? 'באן' : 'טיימאוט')); undo.type = 'button';
          undo.addEventListener('click', function () { undo.disabled = true; send(p.n ? { t: 'a:unban', n: p.n } : { t: 'a:unban', key: p.key }); });
          card.appendChild(undo);
          return card;
        }));
        break;
      }
      case 'a:log': {
        var names = { ban: 'באן', timeout: 'טיימאוט', unban: 'הסרת חסימה', erase: 'מחיקת ציורים', clear: 'ניקוי אזור', image: 'הוספת תמונה',
          'shop-all': '🌍 קנייה: פתוח לכולם', 'shop-personal': '🎨 קנייה: ציור אישי', 'shop-badcode': '⚠️ קנייה עם קוד שגוי', 'admin-open': 'פתיחה/סגירה ידנית', 'admin-grant': 'גישה ידנית', rename: 'שינוי שם', 'free-name': 'שחרור שם', 'delete-user': 'מחיקת משתמש', 'unban-all': 'הסרת כל החסימות', 'clear-all': 'ניקוי כל הקנבס' };
        var lg = $('gaLog');
        if (!m.log.length) { lg.replaceChildren(emptyRow('היומן ריק')); break; }
        lg.replaceChildren.apply(lg, m.log.map(function (r) {
          var d = {}; try { d = JSON.parse(r.detail || '{}'); } catch (e) {}
          var row = el('div', 'ga-logrow');
          row.appendChild(el('time', null, fmtTime(r.at)));
          var txt = (names[r.action] || r.action) + (d.by ? ' · ע״י ' + d.by : '') + (d.to ? ' → ' + d.to : '') + (d.kick ? ' · קיק: ' + d.kick : '') + (d.code ? ' · קוד ' + d.code : '') + (d.name ? ' · ' + d.name : '') + (d.minutes ? ' · ' + d.minutes + ' דק׳' : '') +
            (d.erased != null ? ' · ' + d.erased + ' פיקסלים' : '') + (d.n && (r.action === 'clear' || r.action === 'image') ? ' · ' + d.n + ' פיקסלים' : '');
          row.appendChild(doc.createTextNode(txt));
          return row;
        }));
        break;
      }
      case 'a:punish':
        if (m.ok) toast((m.user && m.user.ban && m.user.ban.kind === 'ban' ? 'נחסם: ' : 'טיימאוט: ') + (m.user ? m.user.name : '') + (m.erased ? ' · נמחקו ' + m.erased + ' פיקסלים' : ''));
        else toast(m.msg || 'הפעולה נכשלה');
        afterAction();
        break;
      case 'a:unban': toast(m.removed ? 'החסימה הוסרה ✔' : 'לא נמצאה חסימה'); afterAction(); break;
      case 'a:erase': toast('נמחקו ' + m.erased + ' פיקסלים'); afterAction(); break;
      case 'a:clear': toast('נוקו ' + m.cleared + ' פיקסלים'); afterAction(); break;
      case 'a:settings': toast('ההגדרות נשמרו'); break;
      case 'a:rename': case 'a:freeName': case 'a:newCode': case 'a:deleteUser': case 'a:unbanAll': case 'a:clearAll':
        toast(m.msg || (m.ok ? 'בוצע' : 'נכשל')); afterAction(); break;
      case 'a:access':
        shop.grants = m.grants || []; shop.botKey = m.botKey || shop.botKey;
        if (m.modKey) $('gaModKey').textContent = m.modKey;
        access = { gate: m.gate, openUntil: m.openUntil, openBy: m.openBy };
        renderShop(); renderAccess();
        break;
      case 'a:image':
        if (m.ok) { toast('התמונה נוספה לקנבס ✔ (' + m.placed + ' פיקסלים)'); clearImage(); }
        else toast(m.msg || 'הוספת התמונה נכשלה');
        break;
    }
  }
  function afterAction() {
    refreshUsers(); refreshBans();
    if (lastResult && !resultBox.hidden) send(lastResult);
  }

  /* ── Kick shop access (personal / everyone) ── */
  var accessBox = $('gAccess');
  function canDrawNow() {
    if (isAdmin) return true;
    if (locked) return false;
    if (!access.gate) return true;
    var now = serverNow();
    return access.openUntil > now || myGrant > now;
  }
  function mmss(ms) {
    var t = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(t / 60), s2 = t % 60;
    return m + ':' + (s2 < 10 ? '0' : '') + s2;
  }
  var accessKey = '';
  function renderAccess() {
    if (!accessBox) return;
    var now = serverNow();
    var html = '', cls = '';
    if (!API || !access.gate || locked || isAdmin) { html = ''; }
    else if (myGrant > now) {
      cls = 'is-mine';
      html = '<span class="ga-ico">🎨</span><span>הגישה האישית שלך לציור: <b dir="ltr">' + mmss(myGrant - now) + '</b></span>';
    } else if (access.openUntil > now) {
      cls = 'is-open';
      html = '<span class="ga-ico">🌍</span><span>הקנבס פתוח לכולם עוד <b dir="ltr">' + mmss(access.openUntil - now) + '</b>' +
        (access.openBy ? ' · בזכות <b>' + escapeHtml(access.openBy) + '</b>' : '') + '</span>';
    } else {
      cls = 'is-locked';
      html = '<span class="ga-ico">🔒</span><span class="g-access-text">הקנבס נעול. כדי לצייר, קנו בחנות הנקודות של <b>Krav0n</b> בקיק:' +
        '<br>• <b>ציור אישי</b>: רק אתם מציירים 20 דקות. כתבו בפרס את הקוד שלכם' +
        (myCode ? ': <button type="button" class="g-code" id="gCodeBtn" title="העתקת הקוד">' + myCode + '</button>' : ' (בחרו כינוי כדי לקבל קוד)') +
        '<br>• <b>קנבס פתוח לכולם</b>: כל הצופים מציירים 20 דקות</span>';
    }
    var key = cls + '|' + (cls === 'is-locked' ? myCode : '');
    if (cls === 'is-locked' && key === accessKey) { /* nothing ticks while locked */ }
    else { accessBox.innerHTML = html; accessKey = key; }
    accessBox.className = 'g-access ' + cls;
    accessBox.hidden = !html;
    var cb = $('gCodeBtn');
    if (cb && !cb.dataset.wired) {
      cb.dataset.wired = '1';
      cb.addEventListener('click', function () { (window.krav0nCopy || function () { return Promise.resolve(false); })(myCode).then(function (ok) { toast(ok ? 'הקוד הועתק: ' + myCode : 'הקוד שלך: ' + myCode); }); });
    }
  }
  function flashAccess() { if (!accessBox) return; accessBox.classList.remove('flash'); void accessBox.offsetWidth; accessBox.classList.add('flash'); }
  function escapeHtml(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var lastAccessState = '';
  setInterval(function () {
    var st = (myGrant > serverNow()) + '|' + (access.openUntil > serverNow());
    if (st !== lastAccessState && lastAccessState) {
      if (myGrant && myGrant <= serverNow()) toast('הזמן האישי שלך לציור נגמר');
      else if (access.openUntil && access.openUntil <= serverNow() && access.gate) toast('הקנבס נסגר');
    }
    lastAccessState = st;
    renderAccess();
    if (isAdmin) renderShopState();
  }, 1000);
  setInterval(function () { if (isAdmin && !doc.hidden) { refreshBans(); } }, 30000);

  /* ── brush / eraser / grid (same panel as the personal canvas) ── */
  function setGTool(t) {
    erasing = t === 'erase';
    doc.querySelectorAll('.p-tool[data-gtool]').forEach(function (b) { b.classList.toggle('active', b.dataset.gtool === t); });
    draw();
  }
  doc.querySelectorAll('.p-tool[data-gtool]').forEach(function (b) { b.addEventListener('click', function () { setGTool(b.dataset.gtool); }); });
  var gridBtn = $('gGrid');
  function syncGrid() { if (gridBtn) gridBtn.classList.toggle('active', gridOn); draw(); }
  if (gridBtn) gridBtn.addEventListener('click', function () { gridOn = !gridOn; lsSet('krav0n-canvas-ggrid', gridOn ? '1' : '0'); syncGrid(); });
  syncGrid();

  /* ── quiet admin login button (lock in the corner of the canvas) ── */
  var quiet = $('gAdminOpen');
  if (quiet) quiet.addEventListener('click', function () {
    if (isAdmin) return;
    $('adminErr').hidden = true;
    adminModal.hidden = false;
    setTimeout(function () { $('adminKey').focus(); }, 30);
  });

  /* ── admin: put a picture on the canvas ── */
  var imgSrc = null;
  function clampX(x) { return imgPlace ? Math.max(0, Math.min(W - imgPlace.w, x)) : x; }
  function clampY(y) { return imgPlace ? Math.max(0, Math.min(H - imgPlace.h, y)) : y; }
  function buildImage(size) {
    if (!imgSrc) return;
    var w = Math.max(1, Math.min(W, size));
    var h = Math.max(1, Math.min(H, Math.round(w * imgSrc.naturalHeight / imgSrc.naturalWidth)));
    if (h >= H) { h = H; w = Math.max(1, Math.round(h * imgSrc.naturalWidth / imgSrc.naturalHeight)); }
    var tmp = doc.createElement('canvas'); tmp.width = w; tmp.height = h;
    var tc = tmp.getContext('2d'); tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
    tc.drawImage(imgSrc, 0, 0, w, h);
    var src = tc.getImageData(0, 0, w, h).data;
    var data = new Array(w * h);
    var out = tc.createImageData(w, h);
    for (var i = 0; i < w * h; i++) {
      var o = i * 4;
      if (src[o + 3] < 128) { data[i] = -1; continue; }   // transparent
      data[i] = (src[o] << 16) | (src[o + 1] << 8) | src[o + 2];
      out.data[o] = src[o]; out.data[o + 1] = src[o + 1]; out.data[o + 2] = src[o + 2]; out.data[o + 3] = 255;
    }
    tc.clearRect(0, 0, w, h); tc.putImageData(out, 0, 0);
    var cx = imgPlace ? imgPlace.x + imgPlace.w / 2 : null, cy = imgPlace ? imgPlace.y + imgPlace.h / 2 : null;
    if (cx == null) {
      var r = stage.getBoundingClientRect();
      cx = (r.width / 2 - view.x) / view.s; cy = (r.height / 2 - view.y) / view.s;
    }
    imgPlace = { w: w, h: h, data: data, canvas: tmp, x: 0, y: 0 };
    imgPlace.x = clampX(Math.round(cx - w / 2)); imgPlace.y = clampY(Math.round(cy - h / 2));
    $('gaImgSize').value = w;
    draw(); imgInfo();
  }
  function imgInfo() {
    if (!imgPlace) return;
    var n = imgPlace.data.filter(function (c) { return c >= 0; }).length;
    $('gaImgInfo').textContent = imgPlace.w + ' × ' + imgPlace.h + ' פיקסלים (' + n + ' צבועים) · מיקום ' + imgPlace.x + ', ' + imgPlace.y;
  }
  function clearImage() {
    imgPlace = null; imgSrc = null;
    $('gaImageCtrl').hidden = true; $('gaImageFile').value = '';
    stage.classList.remove('is-placing'); draw();
  }
  $('gaImageFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var url = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      imgSrc = im; imgPlace = null;
      $('gaImageCtrl').hidden = false;
      var start = Math.min(48, Math.max(8, Math.round(Math.min(W, H) / 3)));
      buildImage(start);
      URL.revokeObjectURL(url);
    };
    im.onerror = function () { toast('לא הצלחתי לפתוח את התמונה'); URL.revokeObjectURL(url); };
    im.src = url;
  });
  $('gaImgSize').addEventListener('input', function () { buildImage(Number(this.value)); });
  $('gaImgSmaller').addEventListener('click', function () { if (imgPlace) buildImage(imgPlace.w - 2); });
  $('gaImgBigger').addEventListener('click', function () { if (imgPlace) buildImage(imgPlace.w + 2); });
  $('gaImgCancel').addEventListener('click', clearImage);
  $('gaImgPlace').addEventListener('click', function () {
    if (!imgPlace || !wsOpen) return;
    send({ t: 'a:image', x: imgPlace.x, y: imgPlace.y, w: imgPlace.w, h: imgPlace.h, d: imgPlace.data });
  });

  /* ── go ── */
  resize();
  updateBanner();
  updateCooldown();
  connect();
})();
