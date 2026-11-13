/* ════════════════════════════════════════════════════════════════════════
   Krav0n — shared page behavior (all pages)
   1. Copy / dev-tools shortcut blocking (as on the original site)
   2. Accessibility menu
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var doc = document;

  /* ── 1. Copy / dev-tools shortcut blocking ─────────────────────────── */
  doc.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  doc.addEventListener('copy', function (e) { e.preventDefault(); });
  doc.addEventListener('selectstart', function (e) { e.preventDefault(); });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'F12' || e.keyCode === 123) e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && [73, 74, 67].indexOf(e.keyCode) !== -1) e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && [85, 67, 65, 83].indexOf(e.keyCode) !== -1) e.preventDefault();
  });

  /* ── 2. Accessibility menu ─────────────────────────────────────────── */
  var openButton  = doc.getElementById('accessibilityOpen');
  var closeButton = doc.getElementById('accessibilityClose');
  var panel       = doc.getElementById('accessibilityPanel');
  if (!openButton || !closeButton || !panel) return;

  function ensureHelper(id, className, text) {
    var el = doc.getElementById(id);
    if (!el) {
      el = doc.createElement('div');
      el.id = id;
      if (className) el.className = className;
      if (text) el.textContent = text;
      doc.body.appendChild(el);
    }
    return el;
  }
  var readingGuide = ensureHelper('reading-guide');
  var readingMask  = ensureHelper('reading-mask');
  var speechStatus = ensureHelper('speechStatus', 'speech-status', '🔊 הקראת טקסט פעילה');
  var items = panel.querySelectorAll('.accessibility-item');
  var synth = window.speechSynthesis || null;

  openButton.setAttribute('aria-expanded', 'false');
  openButton.setAttribute('aria-controls', 'accessibilityPanel');
  panel.setAttribute('role', 'dialog');

  function openPanel() {
    panel.classList.add('open');
    openButton.setAttribute('aria-expanded', 'true');
    setTimeout(function () { closeButton.focus(); }, 60);
  }
  function closePanel(returnFocus) {
    if (!panel.classList.contains('open')) return;
    panel.classList.remove('open');
    openButton.setAttribute('aria-expanded', 'false');
    if (returnFocus) openButton.focus();
  }

  openButton.addEventListener('click', openPanel);
  closeButton.addEventListener('click', function () { closePanel(true); });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closePanel(true);
      if (synth) synth.cancel();
    }
  });

  var BODY_TOGGLES = {
    'large-text':     'access-large-text',
    'line-spacing':   'access-line-spacing',
    'readable-font':  'access-readable-font',
    'letter-spacing': 'access-letter-spacing',
    'headings':       'access-headings',
    'links':          'access-links',
    'contrast':       'access-high-contrast',
    'invert':         'access-invert',
    'grayscale':      'access-grayscale',
    'saturation':     'access-saturation',
    'hide-images':    'access-hide-images',
    'big-cursor':     'access-big-cursor',
    'no-animation':   'access-no-animation',
    'focus':          'access-focus'
  };

  var textToSpeechEnabled = false;
  var guideEnabled = false;
  var maskEnabled = false;
  var currentAlignment = 0;

  function setPressed(item, on) {
    item.classList.toggle('active', on);
    item.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function handleAction(action, item) {
    if (BODY_TOGGLES[action]) {
      var on = doc.body.classList.toggle(BODY_TOGGLES[action]);
      setPressed(item, on);
      return;
    }
    switch (action) {
      case 'text-to-speech':
        textToSpeechEnabled = !textToSpeechEnabled;
        setPressed(item, textToSpeechEnabled);
        speechStatus.style.display = textToSpeechEnabled ? 'block' : 'none';
        if (!textToSpeechEnabled && synth) synth.cancel();
        break;
      case 'reading-guide':
        guideEnabled = !guideEnabled;
        readingGuide.style.display = guideEnabled ? 'block' : 'none';
        setPressed(item, guideEnabled);
        break;
      case 'reading-mask':
        maskEnabled = !maskEnabled;
        readingMask.style.display = maskEnabled ? 'block' : 'none';
        setPressed(item, maskEnabled);
        break;
      case 'align':
        currentAlignment = (currentAlignment + 1) % 4;
        doc.body.style.textAlign = ['', 'right', 'center', 'left'][currentAlignment];
        setPressed(item, currentAlignment !== 0);
        break;
    }
  }

  for (var i = 0; i < items.length; i++) {
    (function (item) {
      item.setAttribute('aria-pressed', 'false');
      item.addEventListener('click', function () { handleAction(item.getAttribute('data-action'), item); });
    })(items[i]);
  }

  function speakText(text) {
    if (!synth || !text || !text.trim()) return;
    synth.cancel();
    var u = new SpeechSynthesisUtterance(text.trim());
    u.lang = 'he-IL'; u.rate = 0.9; u.pitch = 1; u.volume = 1;
    synth.speak(u);
  }
  doc.addEventListener('click', function (e) {
    if (!textToSpeechEnabled) return;
    var t = e.target;
    if (!t || !t.closest || t.closest('.accessibility-panel') || t.closest('.accessibility-open')) return;
    var text = (t.innerText || t.textContent || '').trim();
    if (text.length > 0) speakText(text);
  }, true);
  doc.addEventListener('mouseup', function () {
    if (!textToSpeechEnabled) return;
    var sel = window.getSelection ? window.getSelection() : null;
    var t = sel ? sel.toString().trim() : '';
    if (t.length > 0) speakText(t);
  });

  doc.addEventListener('mousemove', function (e) {
    if (guideEnabled) readingGuide.style.top = (e.clientY - 2) + 'px';
    if (maskEnabled)  readingMask.style.top  = (e.clientY - 40) + 'px';
  });

  var resetButton = doc.getElementById('accessibilityReset');
  if (resetButton) {
    resetButton.addEventListener('click', function () {
      Object.keys(BODY_TOGGLES).forEach(function (k) { doc.body.classList.remove(BODY_TOGGLES[k]); });
      currentAlignment = 0;
      doc.body.style.textAlign = '';
      guideEnabled = false; readingGuide.style.display = 'none';
      maskEnabled = false;  readingMask.style.display = 'none';
      textToSpeechEnabled = false; speechStatus.style.display = 'none';
      if (synth) synth.cancel();
      for (var j = 0; j < items.length; j++) setPressed(items[j], false);
    });
  }
})();
