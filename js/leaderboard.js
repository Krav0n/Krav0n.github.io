/* ════════════════════════════════════════════════════════════════════════
   Leaderboard — live Top 10 tables with real data from the Kick channel.
   Data comes from the Krav0n API (kick-api-worker), which is configured in
   js/config.js. There is no demo or sample data: if a table has no real
   entries yet, it shows an empty state with a message.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var doc = document;
  var cfg = window.KRAV0N_CONFIG || {};
  var API = String(cfg.apiBase || '').trim().replace(/\/+$/, '');

  var POLL_LIVE_MS = 15000;   // while the stream is live
  var POLL_IDLE_MS = 60000;   // while offline
  var RETRY_MS     = 20000;   // after a failed request
  var TIMEOUT_MS   = 10000;
  var TOP_N        = 10;

  var BOARDS = [
    { id: 'lbWatch',  key: 'watch',  unit: null,    icon: '<i class="fa-solid fa-eye"></i>' },
    { id: 'lbGifted', key: 'gifted', unit: 'סאבים', icon: '<i class="fa-solid fa-gift"></i>' },
    { id: 'lbKicks',  key: 'kicks',  unit: 'Kicks', icon: '<svg class="kick-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z"/></svg>' }
  ];
  var PERIODS = ['week', 'month', 'all'];
  var PERIOD_SUFFIX = { week: ' השבוע', month: ' החודש', all: '' };

  var EMPTY_TEXT = {
    watch:  { title: 'עוד אין זמן צפייה',           hint: 'הזמן נספר לצופים שכותבים בצ׳אט בזמן לייב.' },
    gifted: { title: 'עוד לא נשלחו סאבים במתנה',    hint: 'כל סאב שנשלח במתנה בערוץ יופיע כאן אוטומטית.' },
    kicks:  { title: 'עוד לא נשלחו Kicks',           hint: 'הנתונים מגיעים ישירות מ-Kick.' }
  };
  var WAITING_TEXT = { title: 'אין עדיין נתונים', hint: 'הטבלה תתמלא אוטומטית ברגע שיגיעו נתונים מ-Kick.' };
  var ERROR_TEXT   = { title: 'הטעינה נכשלה',     hint: 'אין חיבור לשרת הנתונים. מנסה שוב אוטומטית.' };

  var $ = function (id) { return doc.getElementById(id); };
  var statusBox = $('lbStatus'), updatedEl = $('lbUpdated'), refreshBtn = $('lbRefresh'), view = $('leaderboardView');
  if (!statusBox || !updatedEl) return;

  var state = {
    data: null,          // last good API response
    mode: 'loading',     // loading | waiting | error | ok
    period: { lbWatch: 'all', lbGifted: 'all', lbKicks: 'all' },
    lastFetch: 0,
    lastOk: 0,
    loading: false,
    timer: 0,
    prev: {}             // last rendered values, for the change flash
  };

  var nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

  /* ── helpers ───────────────────────────────────────────────────────── */
  function el(tag, className, text) {
    var n = doc.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function timeAgo(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 45) return 'לפני כמה שניות';
    var m = Math.round(s / 60);
    if (m < 60) return m <= 1 ? 'לפני דקה' : 'לפני ' + m + ' דקות';
    var h = Math.round(m / 60);
    if (h < 24) return h === 1 ? 'לפני שעה' : 'לפני ' + h + ' שעות';
    var d = Math.round(h / 24);
    return d === 1 ? 'לפני יום' : 'לפני ' + d + ' ימים';
  }

  function shortDate(ms) {
    var d = new Date(ms);
    if (isNaN(d)) return '';
    return d.getDate() + '.' + (d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(-2);
  }

  function formatValue(boardKey, v) {
    if (boardKey === 'watch') {
      if (v < 3600) return { text: nf0.format(Math.max(1, Math.round(v / 60))), unit: 'דק׳' };
      var h = v / 3600;
      return { text: h >= 100 ? nf0.format(h) : nf1.format(h), unit: 'שעות' };
    }
    return { text: nf0.format(v), unit: null };
  }

  function cleanList(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length && out.length < TOP_N; i++) {
      var r = list[i] || {};
      var user = r.user != null ? String(r.user) : '';
      var v = Number(r.value);
      if (!user || !isFinite(v) || v <= 0) continue;
      out.push({ user: user, value: v });
    }
    out.sort(function (a, b) { return b.value - a.value; });
    return out;
  }

  /* ── rendering ─────────────────────────────────────────────────────── */
  function rowNode(i, b, r, changed) {
    var li = el('li', 'lb-row' + (i < 3 ? ' rank-' + (i + 1) : ''));
    li.style.setProperty('--i', i);

    var right = el('div', 'lb-col-right');
    var rank = el('span', 'lb-rank');
    if (i === 0)      { rank.classList.add('rank-gold');   rank.title = 'מקום 1'; rank.innerHTML = '<i class="fa-solid fa-trophy" aria-hidden="true"></i><span class="sr-only">1</span>'; }
    else if (i === 1) { rank.classList.add('rank-silver'); rank.title = 'מקום 2'; rank.innerHTML = '<i class="fa-solid fa-star" aria-hidden="true"></i><span class="sr-only">2</span>'; }
    else if (i === 2) { rank.classList.add('rank-bronze'); rank.title = 'מקום 3'; rank.innerHTML = '<i class="fa-solid fa-star" aria-hidden="true"></i><span class="sr-only">3</span>'; }
    else rank.textContent = String(i + 1);

    var name = el('span', 'lb-name', r.user);
    name.title = r.user;
    name.setAttribute('dir', 'auto');
    right.appendChild(rank);
    right.appendChild(name);

    var left = el('div', 'lb-col-left');
    var f = formatValue(b.key, r.value);
    var val = el('span', 'lb-value', f.text);
    var unit = f.unit || b.unit;
    if (unit) val.appendChild(el('small', 'lb-unit' + (b.key === 'kicks' ? ' lb-kick-unit' : ''), unit));
    left.appendChild(val);

    li.appendChild(right);
    li.appendChild(left);

    if (changed) {
      li.classList.add('lb-changed');
      li.addEventListener('animationend', function () { li.classList.remove('lb-changed'); }, { once: true });
    }
    return li;
  }

  function emptyNode(b, text) {
    var li = el('li', 'lb-empty');
    var icon = el('span', 'lb-empty__icon');
    icon.innerHTML = b.icon;
    icon.setAttribute('aria-hidden', 'true');
    li.appendChild(icon);
    li.appendChild(el('strong', 'lb-empty__title', text.title));
    li.appendChild(el('span', 'lb-empty__hint', text.hint));
    return li;
  }

  function noteFor(b) {
    var d = state.data;
    if (!d || state.mode !== 'ok') return '';
    var board = (d.boards && d.boards[b.key]) || {};
    var since = d.tracking_since ? shortDate(d.tracking_since) : '';
    if (b.key === 'kicks') {
      if (board.source === 'kick') return 'נתונים רשמיים מ-Kick';
      return since ? 'נספר מאז ' + since : '';
    }
    if (b.key === 'watch') return 'נספר לפי פעילות בצ׳אט בזמן לייב' + (since ? ', מאז ' + since : '');
    return since ? 'נספר מאז ' + since : '';
  }

  function renderBoard(b) {
    var ol = $(b.id);
    if (!ol) return;
    var period = state.period[b.id] || 'all';
    var note = $(b.id + 'Note');

    if (state.mode === 'loading') { renderSkeleton(ol); if (note) note.textContent = ''; return; }

    if (state.mode !== 'ok') {
      ol.replaceChildren(emptyNode(b, state.mode === 'error' ? ERROR_TEXT : WAITING_TEXT));
      ol.setAttribute('aria-busy', 'false');
      if (note) note.textContent = '';
      return;
    }

    var board = (state.data.boards && state.data.boards[b.key]) || {};
    var list = cleanList(board[period]);
    var key = b.id + ':' + period;
    var old = state.prev[key];
    var next = {};

    if (!list.length) {
      var t = EMPTY_TEXT[b.key];
      ol.replaceChildren(emptyNode(b, { title: t.title + PERIOD_SUFFIX[period], hint: t.hint }));
    } else {
      var rows = list.map(function (r, i) {
        next[r.user] = r.value;
        var changed = !!old && old[r.user] !== undefined && old[r.user] !== r.value;
        return rowNode(i, b, r, changed);
      });
      // Rows slide in when a period is shown for the first time; refreshes stay still
      ol.classList.toggle('lb-list--settled', !!old);
      ol.replaceChildren.apply(ol, rows);
    }
    state.prev[key] = next;
    ol.setAttribute('aria-busy', 'false');
    if (note) note.textContent = noteFor(b);
  }

  function renderSkeleton(ol) {
    var rows = [];
    for (var i = 0; i < 5; i++) {
      var li = el('li', 'lb-row skeleton');
      li.style.setProperty('--i', i);
      var right = el('div', 'lb-col-right');
      right.appendChild(el('span', 'lb-rank', String(i + 1)));
      right.appendChild(el('span', 'lb-name', ' '));
      var left = el('div', 'lb-col-left');
      left.appendChild(el('span', 'lb-value', ' '));
      li.appendChild(right);
      li.appendChild(left);
      rows.push(li);
    }
    ol.replaceChildren.apply(ol, rows);
    ol.setAttribute('aria-busy', 'true');
  }

  function renderAll() { BOARDS.forEach(renderBoard); }

  function paintStatus() {
    statusBox.classList.remove('is-live', 'is-stale', 'is-error', 'is-waiting');
    if (state.mode === 'loading') { updatedEl.textContent = 'טוען נתונים…'; return; }
    if (state.mode === 'waiting') { statusBox.classList.add('is-waiting'); updatedEl.textContent = 'ממתין לחיבור ל-Kick'; return; }
    if (state.mode === 'error') {
      statusBox.classList.add('is-error');
      updatedEl.textContent = state.data ? 'החיבור נותק, מוצגים הנתונים האחרונים' : 'אין חיבור לשרת הנתונים, מנסה שוב…';
      return;
    }
    var d = state.data;
    if (d.live) {
      statusBox.classList.add('is-live');
      updatedEl.textContent = 'בלייב עכשיו, הטבלאות מתעדכנות בזמן אמת';
    } else {
      var at = d.updated_at || state.lastOk;
      updatedEl.textContent = 'עודכן ' + timeAgo(at);
      if (Date.now() - at > 15 * 60 * 1000) statusBox.classList.add('is-stale');
    }
  }

  /* ── tabs (week / month / all time) ────────────────────────────────── */
  function selectPeriod(btn, focus) {
    var boardId = btn.getAttribute('data-board');
    var period = btn.getAttribute('data-time');
    if (!boardId || PERIODS.indexOf(period) === -1) return;
    var group = btn.closest('.lb-time-tabs');
    if (group) {
      var all = group.querySelectorAll('.lb-time-btn');
      for (var i = 0; i < all.length; i++) {
        var on = all[i] === btn;
        all[i].classList.toggle('active', on);
        all[i].setAttribute('aria-selected', on ? 'true' : 'false');
        all[i].tabIndex = on ? 0 : -1;
      }
    }
    if (focus) btn.focus();
    state.period[boardId] = period;
    var b = BOARDS.filter(function (x) { return x.id === boardId; })[0];
    if (b) renderBoard(b);
  }

  function setupTabs() {
    var groups = doc.querySelectorAll('.lb-time-tabs');
    for (var g = 0; g < groups.length; g++) {
      (function (group) {
        var btns = group.querySelectorAll('.lb-time-btn');
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          b.setAttribute('role', 'tab');
          var isActive = b.classList.contains('active');
          b.setAttribute('aria-selected', isActive ? 'true' : 'false');
          b.tabIndex = isActive ? 0 : -1;
          if (isActive) state.period[b.getAttribute('data-board')] = b.getAttribute('data-time');
        }
        group.addEventListener('click', function (e) {
          var btn = e.target.closest ? e.target.closest('.lb-time-btn') : null;
          if (btn && group.contains(btn)) selectPeriod(btn, false);
        });
        group.addEventListener('keydown', function (e) {
          var list = Array.prototype.slice.call(group.querySelectorAll('.lb-time-btn'));
          var idx = list.indexOf(doc.activeElement);
          if (idx === -1) return;
          var next = -1;
          // Right-to-left: ArrowLeft moves forward, ArrowRight moves back
          if (e.key === 'ArrowLeft')  next = (idx + 1) % list.length;
          if (e.key === 'ArrowRight') next = (idx - 1 + list.length) % list.length;
          if (e.key === 'Home') next = 0;
          if (e.key === 'End')  next = list.length - 1;
          if (next !== -1) { e.preventDefault(); selectPeriod(list[next], true); }
        });
      })(groups[g]);
    }
  }

  /* ── loading ───────────────────────────────────────────────────────── */
  function viewActive() { return !view || view.classList.contains('active'); }

  function schedule(ms) {
    clearTimeout(state.timer);
    state.timer = 0;
    if (doc.hidden || !viewActive() || !API) return;
    state.timer = setTimeout(load, ms);
  }

  function nextDelay() {
    if (state.mode === 'error') return RETRY_MS;
    return state.data && state.data.live ? POLL_LIVE_MS : POLL_IDLE_MS;
  }

  function fetchJSON(url) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : 0;
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined, headers: { 'Accept': 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .finally(function () { clearTimeout(t); });
  }

  function load() {
    if (state.loading) return;
    if (!API) {
      state.mode = 'waiting';
      renderAll();
      paintStatus();
      return;
    }
    state.loading = true;
    state.lastFetch = Date.now();
    if (refreshBtn) refreshBtn.classList.add('spin');

    fetchJSON(API + '/api/leaderboard?t=' + Date.now())
      .then(function (d) {
        if (!d || typeof d !== 'object' || !d.boards) throw new Error('bad response');
        state.data = d;
        state.lastOk = Date.now();
        state.mode = d.connected === false ? 'waiting' : 'ok';
        try { doc.dispatchEvent(new CustomEvent('krav0n:status', { detail: { live: !!d.live, connected: d.connected !== false } })); } catch (e) {}
      })
      .catch(function (err) {
        console.warn('Leaderboard: loading failed', err);
        state.mode = 'error';
      })
      .then(function () {
        state.loading = false;
        if (refreshBtn) refreshBtn.classList.remove('spin');
        if (state.mode === 'error' && state.data) {
          // keep the last good tables on screen
          state.mode = 'ok';
          renderAll();
          state.mode = 'error';
        } else {
          renderAll();
        }
        paintStatus();
        schedule(nextDelay());
      });
  }

  function wake() {
    if (doc.hidden || !viewActive()) { clearTimeout(state.timer); state.timer = 0; return; }
    if (Date.now() - state.lastFetch > 8000) load();
    else if (!state.timer) schedule(nextDelay());
  }

  /* ── wiring ────────────────────────────────────────────────────────── */
  setupTabs();
  renderAll();
  paintStatus();
  load();

  doc.addEventListener('visibilitychange', wake);
  if (view && typeof MutationObserver === 'function') {
    new MutationObserver(wake).observe(view, { attributes: true, attributeFilter: ['class'] });
  }
  if (refreshBtn) refreshBtn.addEventListener('click', function () { load(); });
  setInterval(function () { if (state.mode === 'ok' && !doc.hidden) paintStatus(); }, 20000);
})();
