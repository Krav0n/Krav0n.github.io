/* ════════════════════════════════════════════════════════════════════════
   INFO page extras
   1. Channel Emotes + Subscriber Badges — loaded live from Kick, so when an
      emote or badge is added, removed or replaced the site follows by itself.
   2. Business Inquiries — Discord + email, copied with one click.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var doc = document;
  var cfg = window.KRAV0N_CONFIG || {};
  var SLUG = String(cfg.kickSlug || 'krav0n').toLowerCase();
  var CANVAS_API = String(cfg.canvasApi || '').trim().replace(/\/+$/, '');
  var CACHE_KEY = 'krav0n-emotes-v1';

  function $(id) { return doc.getElementById(id); }
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ── small toast ── */
  var toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = el('div', 'k-toast');
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      doc.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }
  window.krav0nToast = toast;

  /* ── copy to clipboard (the site blocks normal copying, so allow it for this one call) ── */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return Promise.resolve(fallback());
    function fallback() {
      var ta = el('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      doc.body.appendChild(ta);
      ta.select();
      var ok = false;
      window.__krav0nAllowCopy = true;
      try { ok = doc.execCommand('copy'); } catch (e) {}
      window.__krav0nAllowCopy = false;
      ta.remove();
      return ok;
    }
  }
  window.krav0nCopy = copyText;

  /* ════════════ 1. EMOTES ════════════ */
  var grid = $('emotesGrid'), note = $('emotesNote');

  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; } }
  function writeCache(list) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list: list })); } catch (e) {} }

  // Kick returns a list of emote sets: the channel's own set, plus "Global" and "Emojis".
  function pickChannelEmotes(data) {
    var sets = Array.isArray(data) ? data : (data && Array.isArray(data.emotes) ? [data] : []);
    var out = [], seen = {};
    sets.forEach(function (set) {
      if (!set || !Array.isArray(set.emotes)) return;
      var id = String(set.id == null ? '' : set.id).toLowerCase();
      var name = String(set.name || '').toLowerCase();
      if (id === 'global' || id === 'emoji' || name === 'global' || name === 'emojis') return;
      var slug = String(set.slug || (set.user && set.user.username) || '').toLowerCase();
      if (slug && slug !== SLUG) return;
      set.emotes.forEach(function (e) {
        if (!e || e.id == null || seen[e.id]) return;
        seen[e.id] = 1;
        out.push({ id: String(e.id), name: String(e.name || ''), sub: !!e.subscribers_only });
      });
    });
    return out;
  }

  function fetchJSON(url) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, 10000) : 0;
    return fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(function () { clearTimeout(t); });
  }

  function loadEmotes() {
    // 1) straight from Kick  2) through the canvas server (if Kick blocks the browser)
    return fetchJSON('https://kick.com/emotes/' + encodeURIComponent(SLUG) + '?t=' + Date.now())
      .catch(function (err) {
        if (!CANVAS_API) throw err;
        return fetchJSON(CANVAS_API + '/emotes');
      })
      .then(pickChannelEmotes);
  }

  var emoteKey = '';
  function renderEmotes(list, fromCache) {
    if (!grid) return;
    var key = (list || []).map(function (e) { return e.id + ':' + e.name + ':' + e.sub; }).join('|');
    if (key && key === emoteKey) return;
    emoteKey = key;
    if (!list || !list.length) {
      grid.replaceChildren(el('div', 'emotes-empty', fromCache === 'error' ? 'לא הצלחתי לטעון את המדבקות כרגע. מנסה שוב בקרוב.' : 'עוד אין מדבקות בערוץ.'));
      return;
    }
    var nodes = list.map(function (e) {
      var b = el('div', 'emote-item');
      b.title = e.name + (e.sub ? ' · למנויים' : '');
      var img = el('img', 'emote-img');
      img.src = 'https://files.kick.com/emotes/' + encodeURIComponent(e.id) + '/fullsize';
      img.alt = e.name;
      img.loading = 'lazy';
      img.draggable = false;
      img.addEventListener('error', function () { b.classList.add('is-broken'); });
      b.appendChild(img);
      b.appendChild(el('span', 'emote-name', e.name));
      if (e.sub) b.appendChild(el('span', 'emote-sub', 'SUB'));
      return b;
    });
    grid.replaceChildren.apply(grid, nodes);
  }

  function refreshEmotes() {
    if (!grid) return;
    loadEmotes().then(function (list) {
      renderEmotes(list);
      writeCache(list);
      if (note) note.textContent = 'מתעדכן אוטומטית מהערוץ ב-Kick';
    }).catch(function (err) {
      console.warn('Emotes: loading failed', err);
      var c = readCache();
      if (c && c.list && c.list.length) {
        renderEmotes(c.list, true);
        if (note) note.textContent = 'מוצגות המדבקות האחרונות שנטענו';
      } else {
        renderEmotes([], 'error');
      }
    });
  }

  if (grid) {
    var cached = readCache();
    if (cached && cached.list && cached.list.length) renderEmotes(cached.list, true);
    refreshEmotes();
  }


  /* ════════════ 1b. SUBSCRIBER BADGES ════════════ */
  // Kick keeps the same picture address when a badge is replaced, so every
  // check asks Kick for a fresh copy of each picture and swaps it in quietly.
  var badgesGrid = $('badgesGrid'), badgesNote = $('badgesNote');
  var BADGE_CACHE = 'krav0n-badges-v3';
  var badgeKey = '';
  function badgeLabel(m) {
    if (m <= 1) return 'Base';
    if (m % 12 === 0) return (m / 12) + (m === 12 ? ' Year' : ' Years');
    if (m > 12 && m % 6 === 0) return (m / 12) + ' Years';
    return m + ' Months';
  }
  function freshSrc(src) { return src + (src.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now(); }
  function renderBadges(list, fresh) {
    if (!badgesGrid || !list || !list.length) return;
    var key = list.map(function (b) { return b.months + ':' + b.src; }).join('|');
    if (key !== badgeKey) {
      badgeKey = key;
      badgesGrid.replaceChildren.apply(badgesGrid, list.map(function (b) {
        var item = el('div', 'emote-item badge-card');
        var img = el('img', 'emote-img');
        img.src = b.src; img.alt = badgeLabel(b.months); img.draggable = false;
        img.addEventListener('error', function () { item.classList.add('is-broken'); });
        item.dataset.src = b.src;
        item.appendChild(img);
        item.appendChild(el('span', 'emote-name', badgeLabel(b.months)));
        return item;
      }));
    }
    if (!fresh) return;
    // swap in a fresh copy of every picture (only after it has loaded — no flicker)
    var cards = badgesGrid.querySelectorAll('.badge-card');
    for (var i = 0; i < cards.length; i++) (function (card) {
      var url = freshSrc(card.dataset.src), pre = new Image();
      pre.onload = function () { var im = card.querySelector('img'); if (im) im.src = url; card.classList.remove('is-broken'); };
      pre.src = url;
    })(cards[i]);
  }
  function refreshBadges() {
    return fetchJSON('https://kick.com/api/v2/channels/' + encodeURIComponent(SLUG) + '?t=' + Date.now()).then(function (d) {
      var raw = (d && d.subscriber_badges) || [];
      var list = raw.map(function (b) {
        var im = b && b.badge_image;
        return { months: Number(b && b.months) || 0, src: im && (im.src || (String(im.srcset || '').split(' ')[0])) };
      }).filter(function (b) { return b.src; }).sort(function (a, b) { return a.months - b.months; });
      if (!list.length) return;
      renderBadges(list, true);
      if (badgesNote) badgesNote.textContent = 'מתעדכן אוטומטית מהערוץ ב-Kick';
      try { localStorage.setItem(BADGE_CACHE, JSON.stringify(list)); } catch (e) {}
    }).catch(function (err) { console.warn('Badges: loading failed', err); });
  }
  if (badgesGrid) {
    try { var cb = JSON.parse(localStorage.getItem(BADGE_CACHE) || 'null'); if (cb && cb.length) renderBadges(cb, false); } catch (e) {}
    refreshBadges();
  }

  /* ── keep emotes + badges live: every minute while the page is open,
        right away when the tab comes back, and when a panel is opened ── */
  var LIVE_MS = 60 * 1000, lastLive = Date.now();
  function refreshLive() { lastLive = Date.now(); if (grid) refreshEmotes(); if (badgesGrid) refreshBadges(); }
  setInterval(function () { if (!doc.hidden) refreshLive(); }, LIVE_MS);
  doc.addEventListener('visibilitychange', function () { if (!doc.hidden && Date.now() - lastLive > 15000) refreshLive(); });
  ['acc-emotes', 'acc-badges'].forEach(function (id) {
    var h = doc.querySelector('#' + id + ' .acc-header');
    if (h) h.addEventListener('click', function () { if (Date.now() - lastLive > 10000) refreshLive(); });
  });

  /* ════════════ 2. BUSINESS INQUIRIES ════════════ */
  var contact = cfg.contact || {};
  var discord = String(contact.discord || '').trim();
  var email = String(contact.email || '').trim();
  var box = $('acc-business');
  if (box) {
    if (!discord && !email) {
      box.hidden = true;
    } else {
      setupRow('contactDiscord', discord, 'שם המשתמש בדיסקורד הועתק');
      setupRow('contactEmail', email, 'כתובת האימייל הועתקה');
      var mail = $('contactMailto');
      var dl = $('contactDiscordLink'), did = String(contact.discordUserId || '').replace(/\D/g, '');
      if (dl && did) { dl.href = 'https://discord.com/users/' + did; dl.hidden = false; }
      if (mail && email) mail.href = 'mailto:' + email + '?subject=' + encodeURIComponent('Business Inquiry — Krav0n');
    }
  }
  function setupRow(id, value, okMsg) {
    var row = $(id);
    if (!row) return;
    if (!value) { row.hidden = true; return; }
    var v = row.querySelector('.contact-value');
    if (v) v.textContent = value;
    var btn = row.querySelector('.contact-copy');
    if (!btn) return;
    btn.addEventListener('click', function () {
      copyText(value).then(function (ok) {
        if (!ok) { toast(value); return; }
        toast(okMsg);
        btn.classList.add('done');
        setTimeout(function () { btn.classList.remove('done'); }, 1600);
      });
    });
  }
})();
