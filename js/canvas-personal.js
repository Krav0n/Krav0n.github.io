/* ════════════════════════════════════════════════════════════════════════
   Personal canvas — pixel art: every click paints one square pixel (80×80 grid).
   The drawing stays on this device (IndexedDB); download as PNG or share.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var doc = document;
  var toast = window.krav0nToast || function (m) { console.log(m); };
  var cv = doc.getElementById('pCanvas');
  if (!cv) return;
  var ctx = cv.getContext('2d');

  var N = 80;                       // pixels per side
  var CELL = cv.width / N;          // 960 / 80 = 12 screen-pixels per square
  var WHITE = 0xffffff;
  var SWATCHES = ['#ffffff', '#d4d7d9', '#898d90', '#515252', '#2f4f4f', '#000000', '#ff99aa', '#ff8c69', '#ff0000', '#ff4500', '#ffe0c2', '#f5deb3', '#ffcc99',
                  '#ffb470', '#e0a370', '#ffd635', '#ffa800', '#9c6926', '#8d5524', '#6d482f', '#fff8b8', '#ffd700', '#ffff00', '#7eed56', '#53fc18', '#556b2f',
                  '#00ff7f', '#00cc78', '#00a368', '#bfefff', '#87ceeb', '#51e9f4', '#00ccc0', '#009eaa', '#00756f', '#94b3ff', '#2e9bff', '#3690ea', '#2450a4',
                  '#0b1d51', '#6a5cff', '#493ac1', '#e4abff', '#811e9f', '#4b0082', '#c8a2c8', '#b44ac0', '#ff00ff', '#ff3881', '#de107f', '#be0039', '#6d001a'];

  function $(id) { return doc.getElementById(id); }
  function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function hexToInt(h) { return parseInt(h.slice(1), 16); }
  function intToHex(v) { return '#' + ('000000' + v.toString(16)).slice(-6); }

  var cells = new Uint32Array(N * N).fill(WHITE);
  var state = { tool: 'brush', color: '#2e9bff' };

  /* ── rendering ── */
  function paintCell(i) {
    ctx.fillStyle = intToHex(cells[i]);
    ctx.fillRect((i % N) * CELL, Math.floor(i / N) * CELL, CELL, CELL);
  }
  function paintAll() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (var i = 0; i < cells.length; i++) if (cells[i] !== WHITE) paintCell(i);
  }
  paintAll();

  /* ── storage (IndexedDB) ── */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      var r = indexedDB.open('krav0n-canvas', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('drawings', { keyPath: 'id' }); r.result.createObjectStore('draft'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), out = fn(t.objectStore(store));
        t.oncomplete = function () { res(out && 'result' in out ? out.result : out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function toBlob(c) { return new Promise(function (res) { c.toBlob(res, 'image/png'); }); }

  /* ── undo / redo ── */
  var undo = [], redo = [], MAX_UNDO = 60;
  function snapshot() {
    undo.push(cells.slice());
    if (undo.length > MAX_UNDO) undo.shift();
    redo.length = 0;
    syncUndo();
  }
  function syncUndo() { $('pUndo').disabled = !undo.length; $('pRedo').disabled = !redo.length; }
  function doUndo() { if (!undo.length) return; redo.push(cells.slice()); cells = undo.pop(); paintAll(); syncUndo(); changed(); }
  function doRedo() { if (!redo.length) return; undo.push(cells.slice()); cells = redo.pop(); paintAll(); syncUndo(); changed(); }
  $('pUndo').addEventListener('click', doUndo);
  $('pRedo').addEventListener('click', doRedo);
  syncUndo();

  /* ── tools ── */
  function setTool(t) {
    state.tool = t;
    doc.querySelectorAll('.p-tool[data-tool]').forEach(function (b) { b.classList.toggle('active', b.dataset.tool === t); });
  }
  doc.querySelectorAll('.p-tool[data-tool]').forEach(function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
  doc.addEventListener('keydown', function (e) {
    if (!$('personalView').classList.contains('active')) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); }
    else if (k === 'b') setTool('brush'); else if (k === 'e') setTool('eraser');
  });

  var colorsBox = $('pColors'), colorInput = $('pColor');
  SWATCHES.forEach(function (hex) {
    var b = el('button', 'p-sw'); b.type = 'button'; b.style.background = hex; b.dataset.c = hex; b.title = hex;
    b.setAttribute('aria-label', 'צבע ' + hex);
    b.addEventListener('click', function () { setColor(hex); });
    colorsBox.insertBefore(b, colorsBox.lastElementChild);
  });
  function setColor(hex) {
    state.color = hex; colorInput.value = hex;
    colorsBox.querySelectorAll('.p-sw').forEach(function (b) { b.classList.toggle('active', b.dataset.c.toLowerCase() === hex.toLowerCase()); });
    if (state.tool === 'eraser') setTool('brush');
    sizeDot();
  }
  colorInput.addEventListener('input', function () { setColor(colorInput.value); });

  function sizeDot() { $('pCurrent').style.background = state.color; }
  setColor(state.color);

  // grid on/off
  var board = doc.querySelector('.p-board');
  var gridBtn = $('pGrid');
  function setGrid(on) {
    board.classList.toggle('show-grid', on);
    gridBtn.classList.toggle('active', on);
    try { localStorage.setItem('krav0n-canvas-grid', on ? '1' : '0'); } catch (e) {}
  }
  gridBtn.addEventListener('click', function () { setGrid(!board.classList.contains('show-grid')); });
  setGrid((function () { try { return localStorage.getItem('krav0n-canvas-grid') !== '0'; } catch (e) { return true; } })());

  /* ── drawing ── */
  function cellAt(e) {
    var r = cv.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) / r.width * N), y = Math.floor((e.clientY - r.top) / r.height * N);
    return { x: Math.max(0, Math.min(N - 1, x)), y: Math.max(0, Math.min(N - 1, y)) };
  }
  function paintOne(c) {
    var i = c.y * N + c.x, v = state.tool === 'eraser' ? WHITE : hexToInt(state.color);
    if (cells[i] === v) return;
    snapshot();
    cells[i] = v; paintCell(i);
    changed();
  }

  // outline of the pixel under the mouse
  var cursor = $('pCursor');
  function moveCursor(c) {
    if (!c) { cursor.hidden = true; return; }
    cursor.style.left = (c.x / N * 100) + '%';
    cursor.style.top = (c.y / N * 100) + '%';
    cursor.style.width = cursor.style.height = (100 / N) + '%';
    cursor.style.background = state.tool === 'eraser' ? 'rgba(255,255,255,0.7)' : state.color;
    cursor.hidden = false;
  }

  // one click = one pixel (dragging does not paint)
  var down = null;
  cv.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  cv.addEventListener('pointerup', function (e) {
    if (!down || down.id !== e.pointerId) return;
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8;
    down = null;
    if (!moved) paintOne(cellAt(e));
  });
  cv.addEventListener('pointercancel', function () { down = null; });
  cv.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') moveCursor(cellAt(e)); });
  cv.addEventListener('pointerleave', function () { cursor.hidden = true; });

  $('pClear').addEventListener('click', function () {
    if (!confirm('לנקות את כל הציור?')) return;
    snapshot(); cells.fill(WHITE); paintAll(); changed();
  });

  /* ── autosave: the current drawing stays on this device ── */
  var draftT = 0;
  function changed() { clearTimeout(draftT); draftT = setTimeout(saveDraft, 500); }
  function saveDraft() {
    var copy = cells.slice();
    tx('draft', 'readwrite', function (s) { return s.put({ n: N, cells: copy.buffer }, 'pixels'); }).catch(function () {});
  }
  tx('draft', 'readonly', function (s) { return s.get('pixels'); }).then(function (d) {
    if (d && d.n === N && d.cells && d.cells.byteLength === N * N * 4) { cells = new Uint32Array(d.cells); paintAll(); }
  }).catch(function () {});

  $('pNew').addEventListener('click', function () {
    if (!confirm('להתחיל ציור חדש? הציור הנוכחי יימחק (אפשר להוריד אותו קודם).')) return;
    snapshot(); cells.fill(WHITE); paintAll(); saveDraft();
  });

  /* ── download / share ── */
  function fileName() { return 'krav0n-pixel-art.png'; }
  function download(blob) {
    var a = el('a'); a.href = URL.createObjectURL(blob); a.download = fileName();
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  $('pDownload').addEventListener('click', function () { toBlob(cv).then(download); });
  $('pShare').addEventListener('click', function () {
    toBlob(cv).then(function (blob) {
      var file = null;
      try { file = new File([blob], fileName(), { type: 'image/png' }); } catch (e) {}
      var data = { files: file ? [file] : [], title: 'הציור שלי', text: 'ציירתי בקנבס של Krav0n 🎨 https://krav0n.github.io/canvas.html' };
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share(data).catch(function (err) { if (err && err.name !== 'AbortError') download(blob); });
      }
      if (navigator.clipboard && window.ClipboardItem) {
        return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () {
          toast('התמונה הועתקה — הדביקו אותה בדיסקורד / וואטסאפ לחברים');
        }, function () { download(blob); toast('התמונה ירדה למחשב — אפשר לשלוח אותה לחברים'); });
      }
      download(blob); toast('התמונה ירדה למכשיר — אפשר לשלוח אותה לחברים');
    });
  });
})();
