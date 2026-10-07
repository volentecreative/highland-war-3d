/* ============================================================
   scramble.js — v3.0.0
   Loaded from this repo (jsDelivr, pinned to a commit) by the pages that
   use it: <script src=".../hwi-topo@<commit>/scramble.js"></script>
   Text decode on scroll-into-view (or on a DOM event). No dependencies.
   No Webflow Interactions.

   v3.0.0: one cursor per block. Every run of text inside an attributed
   element is read as one stream, in reading order, and a cursor sweeps
   it left to right at a steady number of characters a second (eased in
   and out), so the lines and paragraphs resolve one after the other and
   a long block simply takes longer than a short one (per glyph, not one
   duration for everything). Behind the cursor the real text; just ahead
   of it a short flicker of random letters (re-rolled every 60ms, not
   every frame); beyond that the cipher sits still. A replacement is a
   letter of the same case (a digit for a digit) and of about the same
   width as the one it stands for, centred in its cell, and spaces and
   punctuation never change, so the word shapes hold. The cells are
   measured afresh at the moment the run starts (and the waiting cipher
   is rebuilt if the block's width changes), so nothing jumps when the
   real text comes back. On phones (up to 767px) the sweep is quicker and
   the flicker shorter, so the effect stays light. A block waiting off
   screen is only dimmed (its class); it is split into cipher letters as
   it comes within a screen of view, so the page's load never pays for
   every block at once.

   MARKUP CONTRACT (attributes only — classes stay for styling)

     data-scramble                 on a text element or a wrapper: every
                                   run of text inside runs, as one stream.
                                   (A value, e.g. "1200, 0.9, 0.28", from
                                   v2 is accepted and ignored: the timing
                                   is per character now.)
     data-scramble-rate="420"      characters a second (default 420; 560
                                   up to 767px)
     data-scramble-delay="200"     ms before it starts
     data-scramble-repeat          re-run every time it re-enters view
                                   (or every time the -on event fires)
     data-scramble-on-load         start on load instead of on scroll
     data-scramble-cipher          start as dim cipher letters and carry
                                   the class `is-scrambled` until the run
                                   starts — style the dim on that class
                                   (each unresolved letter keeps that
                                   opacity until the cursor reaches it).
                                   The real copy stays in the Designer and
                                   the DOM until the page has its fonts
     data-scramble-on="name"       start when this DOM event reaches the
                                   element or an ancestor, not on scroll
     data-scramble-off="name"      with -repeat and -cipher: back to the
                                   cipher when this event reaches it (the
                                   cursor runs back, right to left)

   The element's authored text IS the target, so the Designer canvas,
   SEO, and screen readers all see the real copy, and a run always lands
   back on the clean text.
   ============================================================ */
(function () {
  'use strict';

  var STATE = 'is-scrambled';
  var CASCADE = 120;   // ms between blocks that come into view together (page order)
  var TICK = 60;       // ms between re-rolls of the flicker
  var MIN = 300;       // ms: the shortest run
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PHONE = window.matchMedia ? window.matchMedia('(max-width: 767px)') : { matches: false };
  var UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', LOWER = 'abcdefghijklmnopqrstuvwxyz', DIGIT = '0123456789';

  function rate(src) { var r = parseFloat(src.getAttribute('data-scramble-rate')); return r > 0 ? r : PHONE.matches ? 560 : 420; }
  function band() { return PHONE.matches ? 5 : 9; }   // characters of flicker ahead of the cursor
  var ease = function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; };   // sine in-out

  /* ---- letters of about the same width: each font's A-Z, a-z and 0-9 measured once ---- */
  var ctx = null, fonts = {};
  function metrics(el) {
    var cs = getComputedStyle(el);
    var key = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    if (fonts[key]) return fonts[key];
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    ctx.font = key;
    var m = {};
    [UPPER, LOWER, DIGIT].forEach(function (set) {
      m[set] = set.split('').map(function (c) { return { c: c, w: ctx.measureText(c).width }; });
    });
    return (fonts[key] = m);
  }
  /* the letters of the same kind as ch (other than itself) within ~15% of its width (at least the nearest four) */
  function poolFor(m, ch, upper, w) {
    var set = /[0-9]/.test(ch) ? DIGIT : (upper || ch !== ch.toLowerCase()) ? UPPER : /[a-z]/.test(ch) ? LOWER : null;
    if (!set) return null;
    var self = upper ? ch.toUpperCase() : ch, all = m[set].filter(function (g) { return g.c !== self; }), tol = Math.max(0.6, w * 0.15);   // never the letter itself
    var near = all.filter(function (g) { return Math.abs(g.w - w) <= tol; });
    if (near.length < 4) near = all.slice().sort(function (a, b) { return Math.abs(a.w - w) - Math.abs(b.w - w); }).slice(0, 4);
    return near.map(function (g) { return g.c; }).join('');
  }
  var pick = function (pool) { return pool.charAt(Math.floor(Math.random() * pool.length)); };

  /* ---- one run of text (a leaf): its characters in width-locked cells ---- */
  function Leaf(el) { this.el = el; this.target = el.textContent; this.cells = null; }

  /* Each character in an inline-block cell sized to its advance in the real, shaped run (measured with a Range
     before the text is touched, so kerning and letter-spacing are kept): the cells tile exactly where the letters
     land, so nothing moves while the glyphs change or when the plain text comes back. Words stay together (nowrap)
     so the lines break where they did. */
  Leaf.prototype.build = function () {
    var el = this.el, text = this.target;
    if (this.cells) el.textContent = text;   // measure the real text, never stale cells
    var adv = [], node = el.firstChild;
    if (node && node.nodeType === 3 && document.createRange) {
      var range = document.createRange(), boxes = [];
      for (var i = 0; i < text.length; i++) { range.setStart(node, i); range.setEnd(node, i + 1); var r = range.getBoundingClientRect(); boxes.push({ l: r.left, r: r.right, t: r.top }); }
      for (var j = 0; j < text.length; j++) { var b = boxes[j], n = boxes[j + 1]; adv.push(n && Math.abs(n.t - b.t) < 1 && n.l >= b.l ? n.l - b.l : b.r - b.l); }
    }
    var m = metrics(el), upper = getComputedStyle(el).textTransform === 'uppercase';
    el.textContent = '';
    var frag = document.createDocumentFragment(), cells = [], gaps = [], word = null;
    for (var k = 0; k < text.length; k++) {
      var ch = text[k];
      if (/\s/.test(ch)) {   // a space stays a real space (a line can still break there), padded to its advance below
        word = null; var g = document.createElement('span'); g.textContent = ch; g.__adv = adv[k]; frag.appendChild(g); gaps.push(g); continue;
      }
      if (!word) { word = document.createElement('span'); word.style.display = 'inline-block'; word.style.whiteSpace = 'nowrap'; frag.appendChild(word); }
      var c = document.createElement('span');
      c.style.cssText = 'display:inline-block;text-align:center;letter-spacing:0';
      c.textContent = ch; word.appendChild(c);
      var w = adv[k] > 0 ? adv[k] : 0;
      cells.push({ el: c, ch: ch, w: w, pool: poolFor(m, ch, upper, w), g: ch, o: '' });
    }
    el.appendChild(frag);
    cells.forEach(function (x) { if (!(x.w > 0)) x.w = x.el.getBoundingClientRect().width; x.el.style.width = x.w + 'px'; });
    gaps.forEach(function (g) {
      if (!(g.__adv > 0) || !g.firstChild) return;
      var rg = document.createRange(); rg.selectNodeContents(g);
      var d = g.__adv - rg.getBoundingClientRect().width;
      if (Math.abs(d) > 0.01) g.style.letterSpacing = (d + (parseFloat(getComputedStyle(g).letterSpacing) || 0)) + 'px';
    });
    this.cells = cells;
    return cells;
  };
  Leaf.prototype.restore = function () { if (this.cells) { this.cells = null; this.el.textContent = this.target; } };

  /* ---- one attributed element = one stream ---- */
  function Group(src) {
    this.src = src;
    var leaves = [], texts = [], n;
    var walker = document.createTreeWalker(src, NodeFilter.SHOW_TEXT, null, false);
    while ((n = walker.nextNode())) if (n.nodeValue.trim()) texts.push(n);
    texts.forEach(function (t) {   // a run beside a <br> or another element gets its own plain <span>
      var p = t.parentNode;
      if (p.childNodes.length === 1) { leaves.push(p); return; }
      var span = document.createElement('span'); p.insertBefore(span, t); span.appendChild(t); leaves.push(span);
    });
    this.leaves = leaves.map(function (l) { return new Leaf(l); });
    this.cipher = src.hasAttribute('data-scramble-cipher');
    this.repeat = src.hasAttribute('data-scramble-repeat');
    this.delay = parseFloat(src.getAttribute('data-scramble-delay')) || 0;
    this.cells = null; this.raf = null; this.timer = null; this.dim = null; this.out = false; this.width = 0;
    this._tick = this.tick.bind(this);
  }
  Group.prototype.build = function () {
    var all = []; this.leaves.forEach(function (l) { all.push.apply(all, l.build()); });
    this.width = this.src.getBoundingClientRect().width;
    return (this.cells = all);
  };
  Group.prototype.restore = function () { this.leaves.forEach(function (l) { l.restore(); }); this.cells = null; };
  Group.prototype.stop = function () { if (this.raf) cancelAnimationFrame(this.raf); if (this.timer) clearTimeout(this.timer); this.raf = this.timer = null; };

  /* paint every cell for a cursor at `at` (characters resolved); only the cells whose glyph or opacity changed are written */
  Group.prototype.paint = function (at, roll) {
    var cells = this.cells, B = band(), dim = this.out ? null : this.dim;
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i], g, lit;
      if (i < at || !x.pool) { g = x.ch; lit = i < at || !x.pool; }   // resolved, or punctuation (never scrambled)
      else { lit = false; g = (roll && i < at + B) || x.g === x.ch ? pick(x.pool) : x.g; }
      if (x.g !== g) { x.g = g; x.el.textContent = g; }
      if (dim != null) { var o = lit && i < at ? '' : String(dim); if (x.o !== o) { x.o = o; x.el.style.opacity = o; } }
    }
  };

  /* the waiting cipher: every letter a still, random one of its width */
  Group.prototype.showCipher = function () {
    if (REDUCED) return;
    this.stop(); this.src.classList.add(STATE);
    this.build(); this.out = true; this.paint(0, false); this.out = false;
  };

  /* offset: ms before it starts (the cascade across groups) */
  Group.prototype.start = function (offset) {
    if (this.raf || this.timer) { if (!this.out) return; this.stop(); }
    if (REDUCED) { this.restore(); this.src.classList.remove(STATE); return; }
    if (this.cipher && this.dim == null && this.src.classList.contains(STATE)) {   // the Designer's dim for the cipher state, read before the class comes off
      var o = parseFloat(getComputedStyle(this.src).opacity); this.dim = o < 1 ? o : null;
    }
    var wasCipher = !!this.cells, keep = wasCipher && this.cells.map(function (x) { return x.g; });
    this.build();   // measured now, at the page's current layout
    if (keep && keep.length === this.cells.length) this.cells.forEach(function (x, i) { if (x.pool) x.g = x.el.textContent = keep[i]; });
    else this.cells.forEach(function (x) { if (x.pool) x.g = x.el.textContent = pick(x.pool); });
    this.src.classList.remove(STATE);
    this.out = false; this.at = 0; this.paint(0, false);
    this.dur = Math.max(MIN, this.cells.length / rate(this.src) * 1000);
    var self = this, wait = this.delay + (offset || 0);
    this.t0 = null; this.last = -1;
    if (wait > 0) this.timer = setTimeout(function () { self.timer = null; self.raf = requestAnimationFrame(self._tick); }, wait);
    else this.raf = requestAnimationFrame(this._tick);
  };

  /* the run in reverse: the cursor runs back and the real text goes back to a still cipher */
  Group.prototype.hide = function () {
    if (REDUCED) return;
    this.stop(); this.src.classList.add(STATE);
    if (!this.cells) this.build();
    this.cells.forEach(function (x) { x.o = ''; x.el.style.opacity = ''; });   // the wrapper's class takes the dim back
    this.out = true; this.dur = Math.max(MIN, this.cells.length / rate(this.src) * 1000); this.t0 = null; this.last = -1;
    this.raf = requestAnimationFrame(this._tick);
  };

  Group.prototype.tick = function (now) {
    if (this.t0 == null) this.t0 = now;
    var t = Math.min(1, (now - this.t0) / this.dur), N = this.cells.length;
    var at = Math.round(ease(this.out ? 1 - t : t) * N);
    var step = Math.floor((now - this.t0) / TICK), roll = step !== this.last; this.last = step;
    this.paint(at, roll);
    if (t < 1) { this.raf = requestAnimationFrame(this._tick); return; }
    this.raf = null;
    if (!this.out) this.restore();   // always land on the clean, real text
  };

  function init() {
    var nodes = document.querySelectorAll('[data-scramble]');
    if (!nodes.length) return;
    var gate = (window.hwPreloader && window.hwPreloader.done) || Promise.resolve();   // nothing runs under the preloader

    var observer = 'IntersectionObserver' in window
      ? new IntersectionObserver(function (entries) {
          var hits = entries.filter(function (e) { return e.isIntersecting && e.target.__scramble; })
            .sort(function (a, b) { return a.target.compareDocumentPosition(b.target) & 4 ? -1 : 1; });
          hits.forEach(function (entry, i) {
            var inst = entry.target.__scramble;
            inst.started = true;
            inst.start(i * CASCADE);
            if (!inst.repeat) observer.unobserve(entry.target);
          });
        }, { threshold: 0, rootMargin: '0px 0px -6% 0px' })   // as soon as its top is a little way into the screen
      : null;

    var near = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (!e.isIntersecting) return; var g = e.target.__scramble; near.unobserve(e.target); if (g && !g.started && !g.raf) { g.showCipher(); if (ro) ro.observe(e.target); } });
    }, { rootMargin: '100% 0px 100% 0px' }) : null;

    /* a waiting cipher whose block changes width (a resize, the scrollbar coming back after the preloader) is rebuilt at the new layout */
    var ro = window.ResizeObserver ? new ResizeObserver(function (es) {
      es.forEach(function (e) { var g = e.target.__scramble; if (!g || g.started || !g.cells || g.raf) return; if (Math.abs(e.contentRect.width - g.width) > 0.5) { g.restore(); g.showCipher(); } });
    }) : null;

    [].forEach.call(nodes, function (el) {
      if (el.__scramble) return;
      var inst = new Group(el);
      el.__scramble = inst;
      var on = el.getAttribute('data-scramble-on'), off = el.getAttribute('data-scramble-off');
      var reaches = function (e) { return e.target && e.target.nodeType === 1 && e.target.contains(el); };

      if (inst.cipher && !REDUCED) {
        /* the dim comes at once (the class), the cipher letters only once the block is within about a screen of view:
           splitting text into cells is DOM work, so it is never done for the whole page at load */
        el.classList.add(STATE);
        var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
        ready.then(function () { if (near) near.observe(el); else if (!inst.started) inst.showCipher(); });
      }
      if (on) {
        document.addEventListener(on, function (e) { if (reaches(e)) gate.then(function () { inst.started = true; inst.start(); }); });
        if (off && inst.repeat && inst.cipher) document.addEventListener(off, function (e) { if (reaches(e)) { inst.started = false; inst.hide(); } });
      } else if (el.hasAttribute('data-scramble-on-load') || !observer) {
        gate.then(function () { inst.started = true; inst.start(); });
      } else {
        gate.then(function () { observer.observe(el); });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.hwScrambleRefresh = init;   // re-scan after CMS swaps or nodes added later
})();
