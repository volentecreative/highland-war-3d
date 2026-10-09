// Pause Lenis while a narthex menu or modal is open; opening a modal closes the mobile menu.
// 1.1.0: tracks what is open by name rather than counting events, so an open announced twice
// (or a close with no open) can never leave Lenis stopped.
(function () {
  var open = {};
  function L() { return typeof lenis !== 'undefined' ? lenis : null; }
  function sync() { var l = L(); if (!l) return; if (Object.keys(open).length) l.stop(); else l.start(); }
  function key(e, kind) { return kind + ':' + ((e.detail && e.detail.key) || ''); }
  document.addEventListener('vci:nav:open', function (e) { open[key(e, 'nav')] = 1; sync(); });
  document.addEventListener('vci:nav:close', function (e) { delete open[key(e, 'nav')]; sync(); });
  document.addEventListener('vci:modal:open', function (e) {
    if (window.vci && vci.nav && vci.nav.isOpen()) vci.nav.close();
    open[key(e, 'modal')] = 1; sync();
  });
  document.addEventListener('vci:modal:close', function (e) { delete open[key(e, 'modal')]; sync(); });
})();
