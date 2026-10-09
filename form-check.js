/* ============================================================
   form-check.js — v1.2.0
   Loaded site-wide from this repo (jsDelivr, pinned to a commit), as a
   registered script in Site settings: the contact form sits in the
   contact-modal component on every page with the navbar.
   Live field validation and Cloudflare Turnstile for a Webflow form.
   No dependencies.

   MARKUP CONTRACT (attributes; the look is the classes, in the Designer)

     data-hw-form="form"        on the Form Block (or the <form>). Every
                                input, select and textarea in it with a
                                name is checked by the browser's own rules
                                (required, type, minlength…), plus: a
                                required field of only spaces is empty, and
                                an email needs a dot in its domain
                                (name@host.tld; the browser takes name@host).
     data-hw-form="field"       the wrapper of one control, its label and
                                its message. Gets the state class too.
     data-hw-form="message"     inside a field: says why the value is not
                                valid (or the valid text, if one is set);
                                empty otherwise.
     data-hw-form="mark"        inside a field: a marker that only takes the
                                state classes (the square that lights up
                                beside the label). aria-hidden.
     data-hw-form="turnstile"   where the Turnstile widget renders, inside a
                                field of its own (its message says why Send
                                is waiting). Needs data-hw-sitekey; takes
                                data-hw-action.
     data-hw-autofocus          on a control: focused when the narthex modal
                                it sits in opens (vci:modal:open), on desktop
                                only: at least 992px wide, with a mouse or
                                trackpad. Never on touch screens.
     data-hw-valid-text="…"     what a message says when its field is good.
                                Read from the field, else from the form.
                                Default: nothing.

   STATES: is-valid / is-invalid on the control, its field, its message and
   its mark.
   Valid shows as soon as the value is good, while typing. Invalid waits
   until the field has been edited and left, or Send was pressed, so a
   half-typed address is never scolded; after that it follows the typing.
   An empty optional field shows neither.

   SEND: the form gets novalidate (the messages replace the browser's
   bubbles). A send with anything invalid is stopped before Webflow's own
   handler sees it, every field shows its state and focus goes to the first
   bad one. A send before Turnstile's token has arrived waits, and goes by
   itself when it does. A token is good once, so the next send (a retry
   after Webflow's error message) fetches a fresh one first.

   v1.2.0: a valid field lights its mark (data-hw-form="mark", the square
   across from the label) instead of saying anything; valid text is now
   opt-in (data-hw-valid-text), and error messages are unchanged. A control
   with data-hw-autofocus is focused when its modal opens, on desktop only
   (a phone or tablet would throw its keyboard up over the form).

   v1.1.0: Turnstile is invisible: it renders with appearance
   "interaction-only", so nothing shows unless Cloudflare asks a visitor to
   click (set the widget's mode to Invisible in the Cloudflare dashboard and
   it never shows at all). It starts when the form comes into view, not the
   widget's own spot, which may be below the fold.

   TURNSTILE: loaded from Cloudflare the first time the form comes into
   view, so a form in a closed modal costs nothing until it is opened. Its
   theme follows data-theme on <html> (the site's light/dark toggle), and it
   is drawn again if that changed while it was out of view. The token is
   not added to the form (no cf-turnstile-response field): Webflow's form
   handler cannot check it, and would only store it as one more field. So
   this stops bots that drive the page, not one that posts straight to
   Webflow's form endpoint.
   ============================================================ */
(function () {
  'use strict';
  if (window.hwFormCheck) return;
  var d = document, w = window;
  var VALID = 'is-valid', INVALID = 'is-invalid';
  var API = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  var EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;
  var SKIP = { hidden: 1, submit: 1, button: 1, reset: 1, image: 1 };
  var WAIT_TEXT = 'Verifying…';
  var ERROR_TEXT = 'The security check did not pass. Reload the page and try again.';

  var dirty = new WeakMap(), touched = new WeakMap(), shown = new WeakMap();
  var widgets = new WeakMap(), waiting = new WeakMap(), ready = new WeakMap();
  var uid = 0;

  function role(el) { return el && el.getAttribute ? el.getAttribute('data-hw-form') : null; }
  function closestRole(el, r) { return el && el.closest ? el.closest('[data-hw-form="' + r + '"]') : null; }

  /* ---------- lookups ---------- */
  function formOf(el) {
    if (!el || !el.closest) return null;
    if (el.tagName !== 'FORM' && role(el) === 'form') el = el.querySelector('form') || el;
    var f = el.tagName === 'FORM' ? el : el.closest('form');
    return f && closestRole(f, 'form') ? f : null;
  }
  function isControl(el) {
    if (!el || !el.name || el.disabled) return false;
    var tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return false;
    if (tag === 'INPUT' && SKIP[el.type]) return false;
    return !closestRole(el, 'turnstile');
  }
  function controls(f) { return Array.prototype.filter.call(f.elements, isControl); }
  function fieldOf(el) { return closestRole(el, 'field'); }
  function messageOf(el) {
    var fld = fieldOf(el);
    return fld ? fld.querySelector('[data-hw-form="message"]') : null;
  }
  function turnstileOf(f) {
    var host = closestRole(f, 'form') || f;
    return host.querySelector('[data-hw-form="turnstile"]');
  }
  function validText(c) {
    var holder = c.closest('[data-hw-valid-text]');
    return holder ? holder.getAttribute('data-hw-valid-text') : '';
  }

  /* ---------- validation ---------- */
  function isEmpty(c) {
    if (c.type === 'radio' && c.form) {
      return !Array.prototype.some.call(c.form.elements, function (o) { return o.type === 'radio' && o.name === c.name && o.checked; });
    }
    if (c.type === 'checkbox') return !c.checked;
    return !String(c.value || '').trim();
  }
  function check(c) {
    c.setCustomValidity('');
    var v = typeof c.value === 'string' ? c.value : '';
    if (c.required && v && !v.trim()) c.setCustomValidity('Please fill out this field.');
    else if (c.type === 'email' && v && c.validity.valid && !EMAIL.test(v.trim())) {
      c.setCustomValidity('Please enter an email address like name@example.com.');
    }
    return c.validity.valid;
  }
  function setText(m, t) { if (m && m.textContent !== t) m.textContent = t; }

  // force: a send was tried, so a bad value shows now whatever happened before.
  function paint(c, force) {
    var valid = check(c), st;
    if (force) touched.set(c, true);
    if (valid) st = isEmpty(c) ? '' : 'valid';
    else st = (touched.get(c) || shown.get(c) === 'invalid') ? 'invalid' : '';
    var fld = fieldOf(c), msg = messageOf(c), mark = fld && fld.querySelector('[data-hw-form="mark"]');
    [c, fld, msg, mark].forEach(function (el) {
      if (!el) return;
      el.classList.toggle(VALID, st === 'valid');
      el.classList.toggle(INVALID, st === 'invalid');
    });
    if (st === 'invalid') c.setAttribute('aria-invalid', 'true');
    else c.removeAttribute('aria-invalid');
    setText(msg, st === 'valid' ? validText(c) : st === 'invalid' ? c.validationMessage : '');
    shown.set(c, st);
    return valid;
  }

  function prepare(f) {
    if (!f || ready.has(f)) return;
    ready.set(f, true);
    f.noValidate = true;
    controls(f).forEach(function (c) {
      var fld = fieldOf(c), mark = fld && fld.querySelector('[data-hw-form="mark"]');
      if (mark) mark.setAttribute('aria-hidden', 'true');
      var msg = messageOf(c);
      if (msg) {
        if (!msg.id) msg.id = 'hw-form-msg-' + (++uid);
        msg.setAttribute('aria-live', 'polite');
        var by = (c.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (by.indexOf(msg.id) < 0) { by.push(msg.id); c.setAttribute('aria-describedby', by.join(' ')); }
      }
      if (!isEmpty(c)) paint(c);   // autofill or back navigation counts as typed
    });
    var t = turnstileOf(f);
    if (t) {
      var m = messageOf(t);
      if (m) m.setAttribute('aria-live', 'polite');
      watchTurnstile(t);
    }
  }

  /* ---------- Turnstile ---------- */
  var loading = false, queue = [];
  function withApi(cb) {
    if (w.turnstile && w.turnstile.render) { cb(w.turnstile); return; }
    queue.push(cb);
    if (loading) return;
    loading = true;
    var done = function (ts) { var q = queue; queue = []; loading = false; q.forEach(function (fn) { fn(ts); }); };
    w.hwTurnstileOnload = function () { done(w.turnstile); };
    var s = d.createElement('script');
    s.src = API + '?render=explicit&onload=hwTurnstileOnload';
    s.async = true;
    s.addEventListener('error', function () { done(null); });
    d.head.appendChild(s);
  }
  function theme() {
    var t = d.documentElement.getAttribute('data-theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  }
  function tsMessage(t, text, bad) {
    var m = messageOf(t), fld = fieldOf(t);
    setText(m, text);
    if (m) m.classList.toggle(INVALID, !!bad);
    if (fld) fld.classList.toggle(INVALID, !!bad);
  }
  function failed(t) {
    tsMessage(t, ERROR_TEXT, true);
  }

  function render(t) {
    var st = widgets.get(t), th = theme();
    // Drawn already in this theme, on its way, or holding a token still good: leave it.
    if (st && (st.pending || st.theme === th || (st.token && !st.spent))) return;
    var key = t.getAttribute('data-hw-sitekey');
    if (!key) return;
    var old = st;
    st = { id: null, theme: th, token: null, spent: false, pending: true };
    widgets.set(t, st);
    withApi(function (ts) {
      st.pending = false;
      if (!ts) { failed(t); return; }
      if (old && old.id != null) { try { ts.remove(old.id); } catch (x) {} }
      var opts = {
        sitekey: key,
        theme: th,
        size: 'flexible',
        appearance: 'interaction-only',
        'response-field': false,
        callback: function (tok) { st.token = tok; st.spent = false; verified(t); },
        'expired-callback': function () { st.token = null; },
        'timeout-callback': function () { st.token = null; },
        'error-callback': function () { st.token = null; failed(t); }
      };
      var action = t.getAttribute('data-hw-action');
      if (action) opts.action = action;
      try { st.id = ts.render(t, opts); } catch (x) { failed(t); }
    });
  }
  function verified(t) {
    tsMessage(t, '', false);
    var f = formOf(t);
    if (!f || !waiting.has(f)) return;
    var sub = waiting.get(f);
    waiting['delete'](f);
    if (f.requestSubmit) f.requestSubmit(sub && sub.form === f ? sub : undefined);
    else { var b = sub || f.querySelector('[type="submit"]'); if (b) b.click(); }
  }
  // Watch the form, not the widget: an invisible widget has no size of its own,
  // and its spot can sit below the fold of a long form.
  function watchTurnstile(t) {
    var f = formOf(t);
    if (!f || !('IntersectionObserver' in w)) { render(t); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) render(t); });
    }).observe(f);
  }
  function tokenOf(f) {
    var t = turnstileOf(f), st = t && widgets.get(t);
    return st && st.token && !st.spent ? st.token : null;
  }

  /* ---------- events ---------- */
  // A field left by pressing something (Send, most often) is painted once the
  // press is over: a message appearing on blur could push the button out from
  // under the pointer between mousedown and mouseup, and the click would be lost.
  var pressing = false, deferred = [];
  d.addEventListener('pointerdown', function () { pressing = true; }, true);
  function released() {
    if (!pressing) return;
    pressing = false;
    setTimeout(function () { var q = deferred; deferred = []; q.forEach(function (c) { paint(c); }); }, 0);
  }
  d.addEventListener('pointerup', released, true);
  d.addEventListener('pointercancel', released, true);

  function onControl(e) {
    var c = e.target;
    if (!isControl(c) || !formOf(c)) return;
    prepare(c.form);
    if (e.type === 'focusout') {
      if (dirty.get(c)) touched.set(c, true);
      if (pressing) { if (deferred.indexOf(c) < 0) deferred.push(c); return; }
    } else dirty.set(c, true);
    paint(c);
    if (c.type === 'radio') controls(c.form).forEach(function (o) { if (o !== c && o.name === c.name) paint(o); });
  }
  d.addEventListener('input', onControl);
  d.addEventListener('change', onControl);
  d.addEventListener('focusout', onControl);
  d.addEventListener('focusin', function (e) { var f = formOf(e.target); if (f) prepare(f); });

  // Capture on the document: runs before the form's own listeners, so a
  // stopped send never reaches Webflow's handler.
  d.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM' || !formOf(f)) return;
    prepare(f);
    var bad = controls(f).filter(function (c) { return !paint(c, true); });
    if (bad.length) {
      e.preventDefault();
      e.stopImmediatePropagation();
      bad[0].focus();
      return;
    }
    var t = turnstileOf(f);
    if (!t) return;
    var st = widgets.get(t);
    if (!tokenOf(f)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      waiting.set(f, e.submitter || null);
      if (st && st.spent && st.id != null && w.turnstile) { st.spent = false; st.token = null; w.turnstile.reset(st.id); }
      else if (!st) render(t);
      tsMessage(t, WAIT_TEXT, false);
      return;
    }
    st.spent = true;   // good for this send only; the next one fetches a fresh token
  }, true);

  d.addEventListener('reset', function (e) {
    var f = formOf(e.target);
    if (!f) return;
    setTimeout(function () {
      controls(f).forEach(function (c) { dirty['delete'](c); touched['delete'](c); shown['delete'](c); paint(c); });
    }, 0);
  });

  // Autofocus on desktop. narthex focuses the dialog's close button as it
  // opens, after this event; so this waits a tick and then moves focus on
  // (narthex's own retry leaves focus alone once it is inside the dialog).
  var DESKTOP = '(min-width: 992px) and (hover: hover) and (pointer: fine)';
  d.addEventListener('vci:modal:open', function (e) {
    var host = e.target, c = host && host.querySelector && host.querySelector('[data-hw-autofocus]');
    if (!c || !w.matchMedia || !w.matchMedia(DESKTOP).matches) return;
    setTimeout(function () {
      if (!host.contains(c)) return;
      try { c.focus({ preventScroll: true }); } catch (x) { c.focus(); }
    }, 0);
  });

  function init() {
    Array.prototype.forEach.call(d.querySelectorAll('[data-hw-form="form"]'), function (h) { prepare(formOf(h)); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();

  w.hwFormCheck = {
    validate: function (el) { var f = formOf(el); return !f || controls(f).filter(function (c) { return !paint(c, true); }).length === 0; },
    token: function (el) { var f = formOf(el); return f ? tokenOf(f) : null; }
  };
})();
