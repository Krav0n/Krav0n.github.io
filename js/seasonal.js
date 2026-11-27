/* ════════════════════════════════════════════════════════════════════════
   Krav0n — seasonal themes
   Picks a theme from today's date (Israel time) and dresses the site up:
   Jewish holidays (from the Hebrew calendar, so no yearly table to update)
   and Israeli national days. A greeting for the day sits in the bottom-right corner.

   Preview any theme:  ?season=hanukkah   (names: see THEMES below)
   Turn it off:        ?season=off
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var TZ = 'Asia/Jerusalem';
  var DAY = 864e5;

  /* ── Date helpers ───────────────────────────────────────────────────── */
  var hebFmt, gregFmt;
  try {
    hebFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
    gregFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'numeric', year: 'numeric', weekday: 'short', timeZone: TZ });
  } catch (e) { return; }

  function parts(fmt, d) {
    var o = {};
    fmt.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function info(d) {
    var h = parts(hebFmt, d), g = parts(gregFmt, d);
    var m = h.month;
    if (m === 'Adar II' || m === 'Adar') m = 'AdarP';  // the Adar that has Purim
    return { hm: m, hd: +h.day, hy: +h.year, gm: +g.month, gd: +g.day, gy: +g.year, wd: WD[g.weekday] };
  }

  /* A Jewish day starts in the evening, so from 17:00 the site already shows tomorrow's holiday */
  var now = new Date();
  var eff = new Date(now.getTime() + 7 * 36e5);
  var t = info(eff);

  function inHeb(month, from, to) { return t.hm === month && t.hd >= from && t.hd <= (to || from); }

  // Israeli national days move when they'd touch Shabbat
  function yomHaatzmautDay() {           // day of Iyar
    if (t.hm !== 'Iyar') return 0;
    var wd5 = ((t.wd + (5 - t.hd)) % 7 + 7) % 7;
    if (wd5 === 5) return 4;   // Fri → Thu
    if (wd5 === 6) return 3;   // Sat → Thu
    if (wd5 === 1) return 6;   // Mon → Tue
    return 5;
  }
  function yomHashoahDay() {             // day of Nisan
    if (t.hm !== 'Nisan') return 0;
    var wd27 = ((t.wd + (27 - t.hd)) % 7 + 7) % 7;
    if (wd27 === 5) return 26; // Fri → Thu
    if (wd27 === 0) return 28; // Sun → Mon
    return 27;
  }
  function hanukkahNight() {             // 1–8, or 0
    for (var i = 0; i < 8; i++) {
      var d = info(new Date(eff.getTime() - i * DAY));
      if (d.hm === 'Kislev' && d.hd === 25) return i + 1;
    }
    return 0;
  }

  /* ── Themes ─────────────────────────────────────────────────────────── */
  var THEMES = {
    'rosh-hashana':  { icon: '🍎', title: 'שנה טובה ומתוקה!', sub: 'שתהיה שנה של שידורים טובים', fx: 'emoji', emoji: ['🍎', '🍯', '🍎', '✨'], tint: '255, 196, 64' },
    'yom-kippur':    { icon: '🕊️', title: 'גמר חתימה טובה', sub: 'צום קל ומועיל', fx: 'none', calm: true, tint: '230, 240, 255' },
    'sukkot':        { icon: '🌿', title: 'חג סוכות שמח!', sub: 'מועדים לשמחה', fx: 'emoji', emoji: ['🍂', '🌿', '🍋', '🍃'], deco: 'garland', tint: '120, 220, 120' },
    'simchat-torah': { icon: '🎉', title: 'שמחת תורה שמח!', sub: 'חג שמח', fx: 'confetti', tint: '255, 210, 80' },
    'hanukkah':      { icon: '🕎', title: 'חנוכה שמח!', sub: '', fx: 'emoji', emoji: ['✨', '🍩', '✨', '🪙'], deco: 'hanukkiah', tint: '255, 190, 70' },
    'tu-bishvat':    { icon: '🌳', title: 'ט״ו בשבט שמח!', sub: 'ראש השנה לאילנות', fx: 'emoji', emoji: ['🌸', '🌱', '🌸', '🍃'], tint: '255, 170, 220' },
    'purim':         { icon: '🎭', title: 'פורים שמח!', sub: 'ונהפוך הוא', fx: 'confetti', extra: ['🎭', '🤡', '🎉'], tint: '255, 120, 220' },
    'pesach':        { icon: '🍷', title: 'חג פסח שמח!', sub: 'חג חירות שמח', fx: 'emoji', emoji: ['🌷', '🌼', '🌸', '🌿'], tint: '255, 220, 120' },
    'yom-hashoah':   { memorial: true, title: 'יום הזיכרון לשואה ולגבורה', text: 'לזכר ששת מיליוני היהודים שנרצחו בשואה, ולזכר גבורתם של הלוחמים והניצולים.', back: 'האתר יחזור לפעילות בצאת יום הזיכרון.' },
    'yom-hazikaron': { memorial: true, title: 'יום הזיכרון לחללי מערכות ישראל ולנפגעי פעולות האיבה', text: 'לזכר הנופלים במערכות ישראל ונרצחי פעולות האיבה, שבזכותם אנחנו כאן.', back: 'האתר יחזור לפעילות בצאת יום הזיכרון.' },
    'oct7':          { memorial: true, title: '7 באוקטובר · לא נשכח', text: 'לזכר הנרצחים והנופלים בטבח 7 באוקטובר ובמלחמת חרבות ברזל.', back: 'האתר יחזור לפעילות מחר.' },
    'yom-haatzmaut': { icon: '🇮🇱', title: 'יום עצמאות שמח!', sub: 'חג שמח לכל עם ישראל', fx: 'fireworks', deco: 'flags', tint: '80, 160, 255' },
    'lag-baomer':    { icon: '🔥', title: 'ל״ג בעומר שמח!', sub: '', fx: 'sparks', tint: '255, 140, 40' },
    'shavuot':       { icon: '🌾', title: 'חג שבועות שמח!', sub: 'חג ביכורים שמח', fx: 'emoji', emoji: ['🌾', '🌼', '🥛', '🌸'], tint: '255, 240, 200' }

  };

  function pickTheme() {
    var today = info(now);
    if (today.gm === 10 && today.gd === 7) return 'oct7';
    if (inHeb('Elul', 29) || inHeb('Tishri', 1, 2)) return 'rosh-hashana';
    if (inHeb('Tishri', 10)) return 'yom-kippur';
    if (inHeb('Tishri', 15, 21)) return 'sukkot';
    if (inHeb('Tishri', 22)) return 'simchat-torah';
    if (hanukkahNight()) return 'hanukkah';
    if (inHeb('Shevat', 15)) return 'tu-bishvat';
    if (inHeb('AdarP', 14, 15)) return 'purim';
    if (inHeb('Nisan', 15, 21)) return 'pesach';
    if (t.hm === 'Nisan' && t.hd === yomHashoahDay()) return 'yom-hashoah';
    if (t.hm === 'Iyar') {
      var a = yomHaatzmautDay();
      if (t.hd === a - 1) return 'yom-hazikaron';
      if (t.hd === a) return 'yom-haatzmaut';
    }
    if (inHeb('Iyar', 18)) return 'lag-baomer';
    if (inHeb('Sivan', 6)) return 'shavuot';
    return null;
  }

  var q = new URLSearchParams(location.search).get('season');
  var id = q === 'off' ? null : (q && THEMES[q] ? q : pickTheme());
  window.krav0nSeason = id;
  if (!id) return;
  var theme = THEMES[id];
  var night = id === 'hanukkah' ? (q ? 8 : hanukkahNight()) : 0;
  if (night) theme.sub = 'נר ' + ['', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני'][night] + ' של חנוכה';


  function motionOff() {
    return (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
      document.body.classList.contains('access-no-animation');
  }

  /* ── Styles ─────────────────────────────────────────────────────────── */
  var css = [
    '.season-fx{position:fixed;inset:0;width:100%;height:100%;z-index:40;pointer-events:none}',
    '.season-glow{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(90% 55% at 50% -8%,rgba(var(--season-rgb),.16),transparent 65%)}',
    'body.season-calm .ocean{filter:saturate(.55) brightness(.85)}',
    'body.season-calm .season-glow{background:radial-gradient(70% 45% at 50% -6%,rgba(var(--season-rgb),.10),transparent 65%)}',
    /* greeting in the bottom-right corner */
    '.season-corner{position:fixed;right:18px;bottom:18px;z-index:39;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;max-width:calc(100vw - 110px)}',
    '.season-greet{display:flex;align-items:center;gap:12px;padding:12px 18px 12px 15px;border-radius:16px;border-radius:14px;direction:rtl;pointer-events:auto;',
    'font-family:var(--font-body,Rubik,system-ui,sans-serif);color:#eaf6ff;background:rgba(7,22,48,.86);',
    'border:1px solid rgba(var(--season-rgb),.42);box-shadow:0 12px 30px rgba(0,6,20,.55),0 0 22px rgba(var(--season-rgb),.22);animation:seasonIn .8s cubic-bezier(.2,1.2,.4,1) both .4s}',
    '@keyframes seasonIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:none}}',
    '.season-greet__icon{font-size:28px;line-height:1;filter:drop-shadow(0 0 8px rgba(var(--season-rgb),.6))}',
    '.season-greet__t{margin:0;font-weight:700;font-size:16.5px;line-height:1.3;white-space:nowrap}',
    '.season-greet__s{margin:2px 0 0;font-size:13.5px;color:#9fb8d6;white-space:nowrap}',
    /* decorations */
    '.season-deco{position:fixed;z-index:39;pointer-events:none}',
    '.season-garland{top:0;left:0;right:0;height:46px}',
    '.season-garland svg{width:100%;height:100%;display:block}',
    '.season-garland .sw{transform-origin:top center;transform-box:fill-box;animation:seasonSwing 3.2s ease-in-out infinite alternate}',
    '.season-garland .sw:nth-of-type(2n){animation-delay:-1.6s}',
    '@keyframes seasonSwing{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}',
    '.season-corner .season-deco{position:static;filter:drop-shadow(0 0 14px rgba(var(--season-rgb),.45))}',
    '.season-hanukkiah svg{width:132px;height:auto;display:block}',
    '.season-candle svg{width:46px;height:auto;display:block}',
    '.season-flame{transform-origin:center bottom;transform-box:fill-box;animation:seasonFlicker 1.3s ease-in-out infinite alternate}',
    '.season-flame:nth-of-type(odd){animation-duration:1.05s;animation-delay:-.4s}',
    '@keyframes seasonFlicker{0%{transform:scale(1,1) rotate(-3deg);opacity:.95}50%{transform:scale(.9,1.12) rotate(2deg);opacity:1}100%{transform:scale(1.05,.94) rotate(-1deg);opacity:.9}}',
    '@media (max-width:760px){.season-corner{right:12px;bottom:14px;max-width:calc(100vw - 96px)}.season-greet{padding:9px 13px 9px 11px;gap:9px}.season-greet__icon{font-size:22px}.season-greet__t{font-size:14.5px}.season-greet__s{font-size:12px}.season-obj svg{width:76px}.season-hanukkiah svg{width:88px}.season-candle svg{width:36px}}',
    '.season-obj svg{width:100px;height:auto;display:block;overflow:visible}',
    '.season-obj [class^="o-"]{transform-box:fill-box}',
    '.o-bob{animation:oBob 3s ease-in-out infinite;transform-origin:center}',
    '@keyframes oBob{50%{transform:translateY(-4px)}}',
    '.o-sway{transform-origin:left center;animation:oSway 2.6s ease-in-out infinite alternate}',
    '@keyframes oSway{from{transform:rotate(-10deg)}to{transform:rotate(12deg)}}',
    '.o-drop{animation:oDrop 2.2s ease-in infinite;transform-origin:center top}',
    '@keyframes oDrop{0%{transform:translateY(0) scale(.3);opacity:0}25%{transform:translateY(0) scale(1);opacity:1}70%{transform:translateY(20px) scale(1);opacity:1}85%,100%{transform:translateY(24px) scale(1.3,.4);opacity:0}}',
    '.o-fly{animation:oFly 3.2s ease-in-out infinite;transform-origin:center}',
    '@keyframes oFly{0%,100%{transform:translate(0,2px) rotate(-2deg)}50%{transform:translate(0,-6px) rotate(3deg)}}',
    '.o-wing{transform-origin:center bottom;animation:oWing .55s ease-in-out infinite alternate}',
    '@keyframes oWing{from{transform:scaleY(1)}to{transform:scaleY(-.55)}}',
    '.o-shake{transform-origin:center bottom;animation:oShake 1.6s ease-in-out infinite}',
    '@keyframes oShake{0%,100%{transform:rotate(0)}10%{transform:rotate(-9deg)}20%{transform:rotate(8deg)}30%{transform:rotate(-6deg)}40%{transform:rotate(4deg)}50%{transform:rotate(0)}}',
    '.o-dance{transform-origin:center bottom;animation:oDance 1.2s ease-in-out infinite}',
    '@keyframes oDance{0%,100%{transform:rotate(-8deg) translateY(0)}50%{transform:rotate(8deg) translateY(-6px)}}',
    '.o-sway2{transform-origin:center bottom;animation:oSway2 3.4s ease-in-out infinite alternate}',
    '@keyframes oSway2{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}',
    '.o-pulse{animation:oPulse 2s ease-in-out infinite;transform-origin:center}',
    '@keyframes oPulse{50%{opacity:.55}}',
    '.o-petal{animation:oPetal 3.6s ease-in infinite}',
    '@keyframes oPetal{0%{transform:translate(0,-20px) rotate(0);opacity:0}15%{opacity:1}100%{transform:translate(18px,36px) rotate(260deg);opacity:0}}',
    '.season-obj .o-spin{transform-box:view-box;transform-origin:55px 52px;animation:oSpin 1.1s linear infinite}',
    '@keyframes oSpin{to{transform:rotate(360deg)}}',
    '.o-noise{animation:oPulse .5s ease-in-out infinite}',
    '.o-wine{animation:oWine 2.4s linear infinite}',
    '@keyframes oWine{to{transform:translateX(-40px)}}',
    '.o-flame{transform-origin:center bottom;animation:oFlame .9s ease-in-out infinite alternate}',
    '.o-flame2{transform-origin:center bottom;animation:oFlame .6s ease-in-out infinite alternate-reverse}',
    '@keyframes oFlame{0%{transform:scale(1,1) skewX(-3deg)}50%{transform:scale(.93,1.08) skewX(3deg)}100%{transform:scale(1.04,.95) skewX(-1deg)}}',
    '.o-flagwave{animation:oFlag 2.4s ease-in-out infinite}',
    '@keyframes oFlag{50%{transform:translateY(2px)}}',
    /* memorial days: the site is closed, a candle in the middle and the text at the bottom */
    '.season-memorial{position:fixed;inset:0;z-index:2147483640;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;',
    'background:radial-gradient(42% 38% at 50% 46%,rgba(255,190,90,.13),transparent 70%),#05070b;color:#e9edf3;direction:rtl;text-align:center;',
    'font-family:var(--font-body,Rubik,system-ui,sans-serif);animation:memIn 1.2s ease both}',
    '@keyframes memIn{from{opacity:0}to{opacity:1}}',
    '.season-memorial__candle{flex:1;display:flex;align-items:center;justify-content:center}',
    '.season-memorial__candle svg{width:min(150px,36vw);height:auto;filter:drop-shadow(0 0 40px rgba(255,170,60,.35))}',
    '.season-memorial__text{max-width:640px;padding-bottom:max(18px,env(safe-area-inset-bottom))}',
    '.season-memorial__title{margin:0 0 10px;font-size:clamp(20px,4.2vw,28px);font-weight:700;line-height:1.35;color:#fff}',
    '.season-memorial__body{margin:0 0 12px;font-size:clamp(15px,2.6vw,17px);line-height:1.7;color:#c9d1dc}',
    '.season-memorial__amen{margin:0 0 14px;font-size:clamp(17px,3vw,20px);font-weight:600;color:#f3d9a6}',
    '.season-memorial__back{margin:0;font-size:13px;color:#7d8794}',
    'html.season-closed,html.season-closed body{overflow:hidden!important}',
    'body.canvas-page .season-deco,body.canvas-page .season-corner{display:none}',
    '@media (prefers-reduced-motion:reduce){.season-flame,.season-garland .sw,.season-greet,.season-obj *{animation:none!important}}',
    'body.access-no-animation .season-flame,body.access-no-animation .season-garland .sw,body.access-no-animation .season-obj *{animation:none!important}'
  ].join('');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ── Animated holiday objects (shown above the greeting) ─────────────── */
  var OBJ = {
    // apple with a honey dipper dripping onto it
    'rosh-hashana':
      '<svg viewBox="0 -28 110 138"><defs><radialGradient id="oApple" cx="38%" cy="35%" r="70%"><stop offset="0" stop-color="#ff7a6b"/><stop offset=".55" stop-color="#e0262b"/><stop offset="1" stop-color="#8e0f17"/></radialGradient>' +
      '<linearGradient id="oHoney" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffd35a"/><stop offset="1" stop-color="#f29a12"/></linearGradient></defs>' +
      '<g class="o-bob"><path d="M55 44 C40 30 18 38 18 62 C18 86 36 102 50 98 C53 97 57 97 60 98 C74 102 92 86 92 62 C92 38 70 30 55 44Z" fill="url(#oApple)"/>' +
      '<ellipse cx="38" cy="56" rx="7" ry="11" fill="#fff" opacity=".25" transform="rotate(-25 38 56)"/>' +
      '<path d="M55 45 C55 38 57 33 60 29" stroke="#5b3a1c" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<path class="o-sway" d="M60 32 C66 22 80 22 84 28 C78 36 66 38 60 32Z" fill="#4ad17a"/></g>' +
      '<g transform="rotate(-28 78 14)"><rect x="70" y="2" width="16" height="16" rx="3" fill="url(#oHoney)"/><path d="M72 6 H84 M72 10 H84 M72 14 H84" stroke="#c7780b" stroke-width="1.5"/><rect x="76" y="-24" width="4" height="27" rx="2" fill="#b77a3a"/></g>' +
      '<path class="o-drop" d="M70 24 C70 24 66 30 66 33 A4 4 0 0 0 74 33 C74 30 70 24 70 24Z" fill="#ffc63d"/></svg>',
    // dove with an olive branch, flapping
    'yom-kippur':
      '<svg viewBox="0 0 120 100"><g class="o-fly"><path d="M30 58 C40 44 66 44 80 52 L100 44 L92 56 C96 60 96 66 90 70 C76 80 48 80 30 70 L14 72 L22 62Z" fill="#f4f8ff"/>' +
      '<path class="o-wing" d="M50 54 C46 34 56 16 74 10 C72 26 70 40 64 54Z" fill="#dfe9f7"/>' +
      '<circle cx="86" cy="54" r="2.2" fill="#22324a"/><path d="M98 46 l8 2 -8 3z" fill="#f2b33d"/>' +
      '<path d="M104 50 C110 56 112 62 108 68" stroke="#5f8f3a" stroke-width="2" fill="none"/><ellipse cx="110" cy="58" rx="4" ry="2" fill="#7cb84a" transform="rotate(50 110 58)"/><ellipse cx="106" cy="64" rx="4" ry="2" fill="#7cb84a" transform="rotate(-30 106 64)"/></g></svg>',
    // lulav being shaken, etrog beside it
    'sukkot':
      '<svg viewBox="0 0 110 110"><g class="o-shake"><path d="M52 104 L56 8" stroke="#6fbf4a" stroke-width="7" stroke-linecap="round"/><path d="M56 10 C50 30 50 60 52 96" stroke="#8fdc63" stroke-width="2" fill="none"/>' +
      '<path d="M46 86 C36 76 34 64 38 54" stroke="#3f8f3c" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M60 86 C72 78 74 66 70 56" stroke="#3f8f3c" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="41" cy="60" rx="5" ry="9" fill="#2f7a39"/><ellipse cx="69" cy="62" rx="5" ry="9" fill="#2f7a39"/><rect x="47" y="84" width="14" height="12" rx="3" fill="#c79a4a"/></g>' +
      '<g class="o-bob"><path d="M82 74 C92 72 102 82 100 92 C98 102 84 104 78 96 C72 88 74 76 82 74Z" fill="#ffd84a"/><path d="M78 76 l-3 -5" stroke="#6a8a2a" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="86" cy="82" rx="4" ry="6" fill="#fff" opacity=".3"/></g></svg>',
    // Torah scroll dancing
    'simchat-torah':
      '<svg viewBox="0 0 110 110"><g class="o-dance"><rect x="30" y="26" width="50" height="58" rx="3" fill="#f6ecd2"/><path d="M38 38 H72 M38 46 H72 M38 54 H72 M38 62 H72 M38 70 H66" stroke="#b9a57a" stroke-width="2"/>' +
      '<rect x="20" y="20" width="12" height="70" rx="6" fill="#8a4a1e"/><rect x="78" y="20" width="12" height="70" rx="6" fill="#8a4a1e"/>' +
      '<rect x="24" y="8" width="4" height="14" rx="2" fill="#e8c36a"/><rect x="82" y="8" width="4" height="14" rx="2" fill="#e8c36a"/><rect x="24" y="88" width="4" height="14" rx="2" fill="#e8c36a"/><rect x="82" y="88" width="4" height="14" rx="2" fill="#e8c36a"/>' +
      '<circle cx="26" cy="7" r="4" fill="#ffd24a"/><circle cx="84" cy="7" r="4" fill="#ffd24a"/></g></svg>',
    // a tree swaying with blossoms and a falling petal
    'tu-bishvat':
      '<svg viewBox="0 0 110 110"><path d="M52 104 C54 88 52 74 50 64 M54 80 C62 74 66 68 68 60 M52 72 C44 68 40 62 38 56" stroke="#7a4a24" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      '<g class="o-sway2"><circle cx="54" cy="40" r="28" fill="#3fae5a"/><circle cx="34" cy="52" r="18" fill="#4cc06a"/><circle cx="76" cy="50" r="19" fill="#36a052"/><circle cx="56" cy="22" r="16" fill="#58cc74"/>' +
      '<g class="o-pulse"><circle cx="40" cy="36" r="4" fill="#ffc2e0"/><circle cx="64" cy="30" r="4" fill="#ffb0d6"/><circle cx="72" cy="52" r="4" fill="#ffc2e0"/><circle cx="48" cy="56" r="4" fill="#ffb0d6"/><circle cx="30" cy="54" r="3.5" fill="#ffc2e0"/><circle cx="56" cy="16" r="3.5" fill="#ffb0d6"/></g></g>' +
      '<ellipse class="o-petal" cx="80" cy="66" rx="4" ry="2.5" fill="#ffb0d6"/></svg>',
    // a spinning gragger (ra'ashan)
    'purim':
      '<svg viewBox="0 0 110 110"><rect x="51" y="54" width="8" height="50" rx="4" fill="#a0612b"/><circle cx="55" cy="52" r="5" fill="#ffd24a"/>' +
      '<g class="o-spin"><rect x="55" y="30" width="44" height="30" rx="6" fill="#ff5aa8"/><rect x="60" y="35" width="34" height="20" rx="4" fill="#ffd24a"/>' +
      '<path d="M66 45 l4 -6 4 6 4 -6 4 6 4 -6" stroke="#5b2bd1" stroke-width="2.5" fill="none" stroke-linejoin="round"/><circle cx="99" cy="45" r="5" fill="#5cc8ff"/></g>' +
      '<path class="o-noise" d="M16 30 q6 6 0 12 M8 26 q10 10 0 20" stroke="#ffd24a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
    // Elijah's cup with wine swirling, matzah behind
    'pesach':
      '<svg viewBox="0 0 110 110"><g transform="rotate(-10 40 60)"><rect x="12" y="36" width="52" height="52" rx="4" fill="#e9c98a"/><g fill="#b9884a"><circle cx="22" cy="46" r="1.6"/><circle cx="32" cy="46" r="1.6"/><circle cx="42" cy="46" r="1.6"/><circle cx="52" cy="46" r="1.6"/><circle cx="22" cy="58" r="1.6"/><circle cx="32" cy="58" r="1.6"/><circle cx="42" cy="58" r="1.6"/><circle cx="52" cy="58" r="1.6"/><circle cx="22" cy="70" r="1.6"/><circle cx="32" cy="70" r="1.6"/><circle cx="42" cy="70" r="1.6"/><circle cx="52" cy="70" r="1.6"/></g><path d="M12 52 H64 M12 64 H64 M12 76 H64" stroke="#d4ab68" stroke-width="1.5"/></g>' +
      '<path d="M56 24 H96 C96 46 88 58 76 60 C64 58 56 46 56 24Z" fill="#cfe6ff" opacity=".55"/>' +
      '<clipPath id="oCup"><path d="M57 26 H95 C95 46 87 57 76 59 C65 57 57 46 57 26Z"/></clipPath>' +
      '<g clip-path="url(#oCup)"><path class="o-wine" d="M40 36 Q50 31 60 36 T80 36 T100 36 T120 36 V70 H40Z" fill="#9b1430"/></g>' +
      '<rect x="73" y="60" width="6" height="26" fill="#d8b75e"/><ellipse cx="76" cy="88" rx="16" ry="4" fill="#d8b75e"/><path d="M60 26 C60 40 64 50 70 54" stroke="#fff" stroke-width="2" opacity=".5" fill="none"/></svg>',
    // Israeli flag waving on a pole
    'yom-haatzmaut':
      '<svg viewBox="0 0 120 110"><rect x="14" y="8" width="5" height="100" rx="2.5" fill="#d9e3ef"/><circle cx="16.5" cy="7" r="4.5" fill="#ffd24a"/>' +
      '<g><path d="M19 14 C40 6 58 22 80 14 C92 10 102 12 110 16 V70 C102 66 92 64 80 68 C58 76 40 60 19 68Z" fill="#ffffff">' +
      '<animate attributeName="d" dur="2.4s" repeatCount="indefinite" values="M19 14 C40 6 58 22 80 14 C92 10 102 12 110 16 V70 C102 66 92 64 80 68 C58 76 40 60 19 68Z;M19 14 C40 22 58 6 80 16 C92 20 102 18 110 14 V68 C102 72 92 74 80 70 C58 60 40 76 19 68Z;M19 14 C40 6 58 22 80 14 C92 10 102 12 110 16 V70 C102 66 92 64 80 68 C58 76 40 60 19 68Z"/></path>' +
      '<g class="o-flagwave"><path d="M19 22 C40 14 58 30 80 22 C92 18 102 20 110 24" stroke="#2f6bff" stroke-width="5" fill="none"/><path d="M19 60 C40 52 58 68 80 60 C92 56 102 58 110 62" stroke="#2f6bff" stroke-width="5" fill="none"/>' +
      '<path d="M64 31 l8 13.5 h-16z M64 49 l8 -13.5 h-16z" fill="none" stroke="#2f6bff" stroke-width="2.6" stroke-linejoin="round"/></g></g></svg>',
    // bonfire
    'lag-baomer':
      '<svg viewBox="0 0 110 110"><defs><radialGradient id="oFire" cx="50%" cy="80%" r="70%"><stop offset="0" stop-color="#fff3b0"/><stop offset=".4" stop-color="#ffb02e"/><stop offset="1" stop-color="#ff4d1a"/></radialGradient></defs>' +
      '<ellipse cx="55" cy="96" rx="34" ry="6" fill="#ff7a2a" opacity=".25"/>' +
      '<g class="o-flame"><path d="M55 14 C66 32 80 42 76 66 C74 82 64 90 55 90 C44 90 34 82 34 66 C34 52 42 46 44 34 C50 42 52 46 55 50 C56 38 54 26 55 14Z" fill="url(#oFire)"/></g>' +
      '<g class="o-flame2"><path d="M55 46 C62 56 68 62 66 74 C64 84 60 88 55 88 C48 88 44 82 44 74 C44 66 50 62 55 46Z" fill="#fff0a0"/></g>' +
      '<rect x="20" y="84" width="70" height="9" rx="4.5" fill="#7a4520" transform="rotate(14 55 88)"/><rect x="20" y="84" width="70" height="9" rx="4.5" fill="#8f5428" transform="rotate(-14 55 88)"/></svg>',
    // sheaf of wheat swaying
    'shavuot':
      '<svg viewBox="0 0 110 110"><g class="o-sway2"><g stroke="#d9a63a" stroke-width="3" stroke-linecap="round" fill="none"><path d="M55 104 L55 30"/><path d="M55 104 C50 80 40 56 32 38"/><path d="M55 104 C60 80 70 56 78 38"/></g>' +
      '<g fill="#f2c24e"><ellipse cx="55" cy="22" rx="5" ry="12"/><ellipse cx="47" cy="32" rx="3.5" ry="7" transform="rotate(-30 47 32)"/><ellipse cx="63" cy="32" rx="3.5" ry="7" transform="rotate(30 63 32)"/>' +
      '<ellipse cx="30" cy="30" rx="4.5" ry="11" transform="rotate(-25 30 30)"/><ellipse cx="80" cy="30" rx="4.5" ry="11" transform="rotate(25 80 30)"/></g></g>' +
      '<path d="M40 74 H70" stroke="#4a8bd6" stroke-width="7" stroke-linecap="round"/></svg>'
  };

  /* ── Decorations (SVG) ──────────────────────────────────────────────── */
  function hanukkiahSVG(n) {
    var s = '<svg viewBox="0 0 180 120" aria-hidden="true"><defs>' +
      '<radialGradient id="sfl" cx="50%" cy="70%" r="60%"><stop offset="0" stop-color="#fff7c2"/><stop offset=".45" stop-color="#ffc94a"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="sgold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#c98b1d"/></linearGradient></defs>' +
      '<path d="M20 72 Q90 128 160 72" fill="none" stroke="url(#sgold)" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M90 72 V108 M70 112 H110" stroke="url(#sgold)" stroke-width="6" stroke-linecap="round"/>';
    // 8 branches + shamash (centre, taller). Candles are lit from left to right of the viewer for the newest.
    var xs = [20, 37, 54, 71, 109, 126, 143, 160];
    for (var i = 0; i < 8; i++) {
      var x = xs[i];
      s += '<rect x="' + (x - 3.5) + '" y="50" width="7" height="22" rx="2" fill="#bfefff" opacity=".9"/>';
      // lit candles: the first `n` counted from the right (as candles are placed right → left)
      if (7 - i < n) s += '<ellipse class="season-flame" cx="' + x + '" cy="42" rx="5" ry="9" fill="url(#sfl)"/>';
    }
    s += '<rect x="86" y="30" width="8" height="42" rx="2" fill="#bfefff"/>' +
      '<ellipse class="season-flame" cx="90" cy="22" rx="5.5" ry="10" fill="url(#sfl)"/></svg>';
    return s;
  }
  function candleSVG() {         // memorial (yahrzeit) candle in a glass
    return '<svg viewBox="0 0 100 170" aria-hidden="true"><defs>' +
      '<radialGradient id="scf" cx="50%" cy="72%" r="62%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffd76a"/><stop offset=".75" stop-color="#ff8a1e"/><stop offset="1" stop-color="#ff5a00" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="scg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb347" stop-opacity=".45"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="sgl" x1="0" x2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".10"/><stop offset=".3" stop-color="#ffffff" stop-opacity=".28"/><stop offset=".6" stop-color="#ffffff" stop-opacity=".06"/><stop offset="1" stop-color="#ffffff" stop-opacity=".16"/></linearGradient></defs>' +
      '<circle cx="50" cy="52" r="44" fill="url(#scg)"/>' +
      '<path class="season-flame" d="M50 14 C58 30 62 40 62 50 C62 60 56 66 50 66 C44 66 38 60 38 50 C38 40 42 30 50 14Z" fill="url(#scf)"/>' +
      '<path class="season-flame" d="M50 40 C53 46 55 50 55 55 C55 60 52.5 63 50 63 C47.5 63 45 60 45 55 C45 50 47 46 50 40Z" fill="#fffdf0" opacity=".9"/>' +
      '<path d="M50 64 V74" stroke="#2b2b2b" stroke-width="2"/>' +
      '<path d="M24 74 H76 L72 160 Q50 166 28 160Z" fill="#f2efe6"/><path d="M26 74 H74" stroke="#d6d0c0" stroke-width="2"/>' +
      '<path d="M20 70 H80 L76 164 Q50 170 24 164Z" fill="url(#sgl)" stroke="rgba(255,255,255,.25)" stroke-width="1.2"/></svg>';
  }
  function garlandSVG(kind) {
    var colors = kind === 'flags' ? ['#ffffff', '#2f6bff'] : ['#ff5a5a', '#ffd24a', '#4ad17a', '#5cc8ff', '#c77dff'];
    var n = 24, s = '<svg viewBox="0 0 1200 46" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M0 6 Q300 22 600 6 T1200 6" fill="none" stroke="rgba(220,235,255,.55)" stroke-width="1.5"/>';
    for (var i = 0; i < n; i++) {
      var x = 25 + i * 50, y = 6 + 8 * Math.sin(((x % 600) / 600) * Math.PI);  // follows the string's curve
      var c = colors[i % colors.length];
      if (kind === 'flags') {
        s += '<g class="sw"><path d="M' + (x - 14) + ' ' + y + ' H' + (x + 14) + ' L' + x + ' ' + (y + 30) + 'Z" fill="' + c + '" opacity=".92"/>' +
          (c === '#ffffff' ? '<path d="M' + (x - 5) + ' ' + (y + 9) + ' l5 8.5 l5 -8.5z M' + (x - 5) + ' ' + (y + 14.5) + ' l5 -8.5 l5 8.5z" fill="none" stroke="#2f6bff" stroke-width="1.3"/>' : '') + '</g>';
      } else {
        s += '<g class="sw"><path d="M' + x + ' ' + y + ' V' + (y + 10) + '" stroke="rgba(220,235,255,.5)"/><circle cx="' + x + '" cy="' + (y + 18) + '" r="8" fill="' + c + '"/>' +
          '<circle cx="' + (x - 2.5) + '" cy="' + (y + 15) + '" r="2.4" fill="#fff" opacity=".55"/></g>';
      }
    }
    return s + '</svg>';
  }

  /* ── Particles ──────────────────────────────────────────────────────── */
  function startFx(kind) {
    if (kind === 'none' || document.body.classList.contains('canvas-page')) return;
    var cv = document.createElement('canvas');
    cv.className = 'season-fx';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, ps = [], last = 0, nextBoom = 0, raf = 0;
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      emojiCache = {};
    }
    size(); addEventListener('resize', size);
    var small = W < 700;
    var COUNT = { snow: small ? 45 : 90, emoji: small ? 12 : 22, confetti: small ? 40 : 80, sparks: small ? 30 : 55 }[kind] || 0;
    var CONF = ['#ff5a5a', '#ffd24a', '#4ad17a', '#5cc8ff', '#c77dff', '#ff8ad8', '#ffffff'];
    function rnd(a, b) { return a + Math.random() * (b - a); }
    // Pre-drawn sprites: drawing colour emoji with fillText and glows with
    // shadowBlur on every frame was slow (mostly in Firefox and Safari).
    var emojiCache = {}, glowCache = {};
    function emojiSprite(e, size) {
      size = Math.max(8, Math.round(size));
      var key = e + '|' + size;
      if (emojiCache[key]) return emojiCache[key];
      var px = Math.ceil(size * 1.5 * dpr), c = document.createElement('canvas');
      c.width = c.height = px;
      var g = c.getContext('2d');
      g.font = (size * dpr) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(e, px / 2, px / 2);
      return (emojiCache[key] = { c: c, s: px / dpr });
    }
    function glowSprite(col, blur) {
      var key = col + '|' + blur;
      if (glowCache[key]) return glowCache[key];
      var R = 32, c = document.createElement('canvas'); c.width = c.height = R * 2;
      var g = c.getContext('2d'), core = 3 / (3 + blur);     // like a ~3px dot with shadowBlur
      var gr = g.createRadialGradient(R, R, 0, R, R, R);
      gr.addColorStop(0, col); gr.addColorStop(core, col);
      gr.addColorStop(Math.min(1, core + 0.08), col.replace(/^#(..)(..)(..)$/, function (m, r, gg, b) { return 'rgba(' + parseInt(r, 16) + ',' + parseInt(gg, 16) + ',' + parseInt(b, 16) + ',.45)'; }));
      gr.addColorStop(1, col.replace(/^#(..)(..)(..)$/, function (m, r, gg, b) { return 'rgba(' + parseInt(r, 16) + ',' + parseInt(gg, 16) + ',' + parseInt(b, 16) + ',0)'; }));
      g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2);
      return (glowCache[key] = c);
    }
    function drawGlow(col, blur, x, y, r) {
      var R = r + blur;
      ctx.drawImage(glowSprite(col, blur), x - R, y - R, R * 2, R * 2);
    }
    function spawn(initial) {
      var p = { x: rnd(0, W), y: initial ? rnd(-H, H) : rnd(-60, -10), a: rnd(0, 6.28), va: rnd(-0.02, 0.02), ph: rnd(0, 6.28) };
      if (kind === 'snow') { p.r = rnd(1, 3.4); p.vy = rnd(0.35, 1.1); p.vx = rnd(-0.25, 0.25); p.o = rnd(0.35, 0.9); }
      else if (kind === 'emoji') { var list = (theme.emoji || ['✨']); p.e = list[(Math.random() * list.length) | 0]; p.r = rnd(14, 24); p.vy = rnd(0.35, 0.85); p.vx = rnd(-0.3, 0.3); p.o = rnd(0.55, 0.9); }
      else if (kind === 'confetti') {
        if (theme.extra && Math.random() < 0.15) { p.e = theme.extra[(Math.random() * theme.extra.length) | 0]; p.r = rnd(16, 24); }
        p.c = CONF[(Math.random() * CONF.length) | 0]; p.w = rnd(5, 9); p.h = rnd(8, 14); p.vy = rnd(0.9, 2); p.vx = rnd(-0.5, 0.5); p.va = rnd(-0.08, 0.08); p.o = 0.9;
      } else if (kind === 'sparks') { p.y = initial ? rnd(0, H) : H + rnd(0, 40); p.r = rnd(1, 2.6); p.vy = -rnd(0.8, 2.2); p.vx = rnd(-0.4, 0.4); p.o = rnd(0.5, 1); p.life = rnd(0.5, 1); }
      return p;
    }
    for (var i = 0; i < COUNT; i++) ps.push(spawn(true));
    function boom() {
      var cx = rnd(W * 0.12, W * 0.88), cy = rnd(H * 0.1, H * 0.45);
      var palette = id === 'yom-haatzmaut' ? ['#ffffff', '#5aa0ff', '#2f6bff'] : ['#ffd24a', '#ff8ad8', '#5cc8ff', '#4ad17a', '#ffffff'];
      var col = palette[(Math.random() * palette.length) | 0], n = small ? 34 : 54;
      for (var k = 0; k < n; k++) {
        var ang = (k / n) * 6.283, sp = rnd(1.4, 3.4);
        ps.push({ fw: 1, x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, c: col, r: rnd(1.4, 2.4) });
      }
    }
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      var dt = Math.min(3, (ts - last) / 16.7 || 1); last = ts;
      ctx.clearRect(0, 0, W, H);
      if (kind === 'fireworks' && ts > nextBoom) { boom(); nextBoom = ts + rnd(900, 1900); }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        if (p.fw) {
          p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.035 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= 0.012 * dt;
          if (p.life <= 0) { ps.splice(i, 1); continue; }
          ctx.globalAlpha = Math.max(0, p.life); drawGlow(p.c, 8, p.x, p.y, p.r);
          continue;
        }
        p.ph += 0.02 * dt; p.a += p.va * dt;
        p.x += (p.vx + Math.sin(p.ph) * 0.35) * dt; p.y += p.vy * dt;
        if (kind === 'sparks') { p.life -= 0.004 * dt; }
        var gone = kind === 'sparks' ? (p.y < -20 || p.life <= 0) : p.y > H + 40;
        if (gone || p.x < -60 || p.x > W + 60) { ps[i] = spawn(false); continue; }
        ctx.globalAlpha = kind === 'sparks' ? p.o * Math.max(0, p.life) : p.o;
        if (p.e) {
          var es = emojiSprite(p.e, p.r);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(p.ph) * 0.4);
          ctx.drawImage(es.c, -es.s / 2, -es.s / 2, es.s, es.s); ctx.restore();
        } else if (kind === 'snow') {
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        } else if (kind === 'confetti') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(1, Math.cos(p.ph * 3));
          ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
        } else if (kind === 'sparks') {
          drawGlow(p.life > 0.5 ? '#ffd27a' : '#ff7a2a', 10, p.x, p.y, p.r);
        }
      }
      ctx.globalAlpha = 1;
    }
    raf = requestAnimationFrame(frame);
    return function stop() { cancelAnimationFrame(raf); removeEventListener('resize', size); cv.remove(); };
  }

  /* ── Go ─────────────────────────────────────────────────────────────── */
  function closeSite() {
    var root = document.documentElement;
    root.classList.add('season-closed');
    var m = document.createElement('div');
    m.className = 'season-memorial';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', theme.title);
    m.innerHTML = '<div class="season-memorial__candle">' + candleSVG() + '</div>' +
      '<div class="season-memorial__text"><h1 class="season-memorial__title"></h1><p class="season-memorial__body"></p>' +
      '<p class="season-memorial__amen">יהי זכרם ברוך</p><p class="season-memorial__back"></p></div>';
    m.querySelector('.season-memorial__title').textContent = theme.title;
    m.querySelector('.season-memorial__body').textContent = theme.text;
    m.querySelector('.season-memorial__back').textContent = theme.back;
    document.body.appendChild(m);
    // keep everything behind the page out of reach
    Array.prototype.forEach.call(document.body.children, function (el) { if (el !== m && el.tagName !== 'SCRIPT') el.setAttribute('inert', ''); });
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = '#05070b';
  }

  function run() {
    var b = document.body;
    if (theme.memorial) { closeSite(); return; }
    b.classList.add('season-' + id);
    b.style.setProperty('--season-rgb', theme.tint || '46, 155, 255');
    if (theme.calm) b.classList.add('season-calm');
    var glow = document.createElement('div');
    glow.className = 'season-glow'; glow.setAttribute('aria-hidden', 'true');
    b.appendChild(glow);

    // bottom-right corner: the holiday's object (hanukkiah / candle) and the greeting
    var corner = document.createElement('div');
    corner.className = 'season-corner';
    if (theme.deco === 'hanukkiah') {
      var d = document.createElement('div');
      d.setAttribute('aria-hidden', 'true');
      d.className = 'season-deco season-hanukkiah';
      d.innerHTML = hanukkiahSVG(night || 1);
      corner.appendChild(d);
    } else if (OBJ[id]) {
      var o = document.createElement('div');
      o.setAttribute('aria-hidden', 'true');
      o.className = 'season-deco season-obj';
      o.innerHTML = OBJ[id];
      corner.appendChild(o);
    }
    var g = document.createElement('div');
    g.className = 'season-greet';
    g.setAttribute('role', 'note');
    g.innerHTML = '<span class="season-greet__icon" aria-hidden="true">' + theme.icon + '</span><div><p class="season-greet__t"></p>' +
      (theme.sub ? '<p class="season-greet__s"></p>' : '') + '</div>';
    g.querySelector('.season-greet__t').textContent = theme.title;
    if (theme.sub) g.querySelector('.season-greet__s').textContent = theme.sub;
    corner.appendChild(g);
    b.appendChild(corner);

    if (theme.deco === 'garland' || theme.deco === 'flags') {
      var gl = document.createElement('div');
      gl.setAttribute('aria-hidden', 'true');
      gl.className = 'season-deco season-garland';
      gl.innerHTML = garlandSVG(theme.deco);
      b.appendChild(gl);
    }

    var stopFx = motionOff() ? null : startFx(theme.fx);
    // the accessibility menu can stop animations later
    new MutationObserver(function () { if (stopFx && motionOff()) { stopFx(); stopFx = null; } })
      .observe(b, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
})();
