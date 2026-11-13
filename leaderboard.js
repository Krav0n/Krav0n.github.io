/* ════════════════════════════════════════════════════════════
   Leaderboard – auto-refreshing Top 10 tables
   ────────────────────────────────────────────────────────────
   Pulls CONFIG.dataUrl every CONFIG.refreshMs and re-renders the
   three tables in the background (no page reload).

   JSON format (see data/leaderboard.json):
   {
     "demo": true,                       // remove / set false for real data
     "updatedAt": "2026-11-13T10:00:00Z",// when the DATA was generated (ISO)
     "watchTime": [{ "user": "Name", "hours": 123.5 }, ...],
     "gifted":    [{ "user": "Name", "gifts": 50 }, ...],
     "kicks":     [{ "user": "Name", "kicks": 1200 }, ...]
   }
   To use another source (Google Sheets, Worker/API…) just change
   CONFIG.dataUrl – it only has to return JSON in the shape above.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CONFIG = {
    dataUrl:   'data/leaderboard.json',
    refreshMs: 3 * 60 * 1000,   // how often to re-fetch (3 minutes)
    topN:      10
  };

  const BOARDS = [
    { el: 'lbWatch',  key: 'watchTime', field: 'hours', unit: 'h',      decimals: 1 },
    { el: 'lbGifted', key: 'gifted',    field: 'gifts', unit: 'Gifted', decimals: 0 },
    { el: 'lbKicks',  key: 'kicks',     field: 'kicks', unit: 'Kicks',  decimals: 0 }
  ];

  /* Shown only if the JSON can't be loaded (e.g. opening index.html from disk) */
  const FALLBACK = {
    demo: true, updatedAt: null,
    watchTime: [1284.5,1102,967.5,842,731.5,655,590.5,512,468.5,421].map((v,i)=>({user:['ShadowWolf','NeonViper','PixelKnight','TurboFox','GhostRider99','LunaStrike','CyberPanda','IronMike','FrostByte','RogueSpark'][i],hours:v})),
    gifted:    [250,180,145,120,96,75,60,42,30,18].map((v,i)=>({user:['NeonViper','ShadowWolf','LunaStrike','TurboFox','PixelKnight','CyberPanda','GhostRider99','RogueSpark','IronMike','FrostByte'][i],gifts:v})),
    kicks:     [48200,41750,36400,29900,24150,19800,15300,11250,8700,5400].map((v,i)=>({user:['PixelKnight','ShadowWolf','TurboFox','NeonViper','CyberPanda','LunaStrike','IronMike','GhostRider99','RogueSpark','FrostByte'][i],kicks:v}))
  };

  const $ = id => document.getElementById(id);
  const statusBox = $('lbStatus'), updatedEl = $('lbUpdated'), demoTag = $('lbDemoTag'), refreshBtn = $('lbRefresh');
  if (!statusBox || !updatedEl) return;

  const prev = {};            // previous values, to flash rows that changed
  let dataTime = null;        // Date of the data currently shown
  let lastFetch = 0, loading = false, rendered = false;

  /* ── helpers ── */
  const nf = d => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });

  function timeAgo(date) {
    const s = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (s < 45)  return 'לפני כמה שניות';
    const m = Math.round(s / 60);
    if (m < 60)  return m <= 1 ? 'לפני דקה' : 'לפני ' + m + ' דקות';
    const h = Math.round(m / 60);
    if (h < 24)  return h === 1 ? 'לפני שעה' : 'לפני ' + h + ' שעות';
    const d = Math.round(h / 24);
    return d === 1 ? 'לפני יום' : 'לפני ' + d + ' ימים';
  }
  function paintUpdated() {
    if (!dataTime) return;
    updatedEl.textContent = 'עודכן לאחרונה ' + timeAgo(dataTime);
    // data older than 2 refresh cycles → orange dot
    statusBox.classList.toggle('stale', Date.now() - dataTime.getTime() > CONFIG.refreshMs * 2 + 60000);
  }

  /* ── rendering ── */
  function rowHTML(i, user, valueText, unit, skeleton) {
    const li = document.createElement('li');
    li.className = 'lb-row' + (i < 3 ? ' rank-' + (i + 1) : '') + (skeleton ? ' skeleton' : '');
    li.style.setProperty('--i', i);

    const rank = document.createElement('span');
    rank.className = 'lb-rank';
    if (i === 0 && !skeleton) { const ic = document.createElement('i'); ic.className = 'fa-solid fa-crown'; rank.appendChild(ic); }
    else rank.textContent = i + 1;

    const name = document.createElement('span');
    name.className = 'lb-name';
    name.textContent = user;                       // textContent → safe against injected HTML

    const val = document.createElement('span');
    val.className = 'lb-value';
    val.textContent = valueText;
    if (unit) { const u = document.createElement('small'); u.textContent = unit; val.appendChild(u); }

    li.append(rank, name, val);
    return li;
  }

  function renderSkeleton() {
    BOARDS.forEach(b => {
      const ol = $(b.el); if (!ol) return;
      ol.replaceChildren(...Array.from({ length: CONFIG.topN }, (_, i) => rowHTML(i, '·', '·', '', true)));
    });
  }

  function render(data) {
    BOARDS.forEach(b => {
      const ol = $(b.el); if (!ol) return;
      const list = (Array.isArray(data[b.key]) ? data[b.key] : [])
        .map(r => ({ user: String(r && r.user != null ? r.user : '—'), v: Number(r && r[b.field]) || 0 }))
        .sort((a, c) => c.v - a.v)
        .slice(0, CONFIG.topN);

      if (!list.length) { ol.innerHTML = '<li class="lb-empty">אין נתונים עדיין</li>'; return; }

      const old = prev[b.key] || {};
      const next = {};
      const rows = list.map((r, i) => {
        next[r.user] = r.v;
        const li = rowHTML(i, r.user, nf(b.decimals).format(r.v), b.unit, false);
        if (rendered && old[r.user] !== undefined && old[r.user] !== r.v) {
          li.classList.add('lb-changed');
          li.style.animationDelay = '0s';
          li.addEventListener('animationend', () => li.classList.remove('lb-changed'), { once: true });
        } else if (rendered) {
          li.style.animation = 'none';             // no re-entrance animation on background refresh
        }
        return li;
      });
      prev[b.key] = next;
      ol.replaceChildren(...rows);
    });
    rendered = true;
  }

  /* ── loading ── */
  async function load(manual) {
    if (loading) return;
    loading = true;
    refreshBtn && refreshBtn.classList.add('spin');
    let data = null, ok = false;
    try {
      const url = CONFIG.dataUrl + (CONFIG.dataUrl.includes('?') ? '&' : '?') + 't=' + Date.now();   // bypass CDN/browser cache
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
      ok = true;
    } catch (err) {
      console.warn('Leaderboard fetch failed:', err);
    }
    lastFetch = Date.now();

    if (ok || !rendered) {                         // on failure keep showing the last good data
      data = data || FALLBACK;
      render(data);
      const t = data.updatedAt ? new Date(data.updatedAt) : null;
      dataTime = (t && !isNaN(t)) ? t : new Date();
      demoTag.hidden = !data.demo;
      paintUpdated();
    } else if (manual) {
      updatedEl.textContent = 'אין חיבור – מוצגים הנתונים האחרונים';
      statusBox.classList.add('stale');
    }
    refreshBtn && refreshBtn.classList.remove('spin');
    loading = false;
  }

  /* ── wiring ── */
  renderSkeleton();
  load(false);
  setInterval(() => { if (!document.hidden) load(false); }, CONFIG.refreshMs);   // background auto-refresh
  setInterval(paintUpdated, 20000);                                              // keep "לפני X" ticking
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastFetch > CONFIG.refreshMs) load(false);
  });
  refreshBtn && refreshBtn.addEventListener('click', () => load(true));
  document.querySelectorAll('.nav-tab[data-target="leaderboardView"]').forEach(t =>
    t.addEventListener('click', () => { if (Date.now() - lastFetch > 30000) load(false); }));
})();
