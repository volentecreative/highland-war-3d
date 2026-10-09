/*!
 * iso-marks.js — small isometric line-work objects for the HWI site: the flag mark, a conveyor, and the shield.
 *
 *   <div id="flag" style="width:6rem;height:6rem"></div>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
 *   <script src="https://cdn.jsdelivr.net/gh/volentecreative/highland-war-3d@<commit>/iso-marks.js"></script>
 *   <script>
 *     IsoMarks.flag('#flag', { hover: '.card' });          // splits into three flags on hover, closes on leave
 *     IsoMarks.conveyor('#belt', { hover: '.card' });      // every hover runs the belt one box along
 *     IsoMarks.shield('#shield', { hover: '.card' });      // its bands step forward on hover, back flush on leave
 *   </script>
 *
 * Faces are one flat colour, edges are lines, both from CSS variables so the objects follow the site's theme:
 *   --iso-face  the faces   (falls back to --topo-block, then #3a3a3a)
 *   --iso-line  the edges   (falls back to --topo-label, then #f2f2f0)
 *   --iso-bg    the canvas  (transparent by default)
 * The camera is orthographic and never moves; each object is framed once so that every state of its animation fits.
 */
(function (global) {
  'use strict';

  const SHARED = {
    azimuth: 45,           // camera heading, degrees; 45 = true isometric, looking from the front-left
    elevation: 30,         // camera height, degrees above the ground; 35.264 = true isometric, 30 sits a little lower
    margin: 1.06,          // breathing room around the animation's extremes, which the frame is fitted to
    hover: '',             // the element whose hover drives it: a selector, 'closest:.card' (an ancestor of the host), or an element; '' = the host
    seconds: 0.7,          // every hover animation runs this long, on the same ease-in-out curve
    shade: 0,              // 0 = every face the same colour; 0.08 lightens the tops a little
    faceColor: 'var(--iso-face, var(--topo-block, #3a3a3a))',
    lineColor: 'var(--iso-line, var(--topo-label, #f2f2f0))',
    background: 'var(--iso-bg, transparent)',
    pixelRatioCap: 2
  };
  const COLOR_KEYS = ['faceColor', 'lineColor', 'background'];

  function resolveColor(host, v) {
    if (typeof v !== 'string') return v;
    const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+?)\s*)?\)$/);
    if (!m) return v;
    const got = getComputedStyle(host).getPropertyValue(m[1]).trim();
    const ok = got && !/var\(/.test(got) && (got === 'transparent' || (global.CSS && CSS.supports && CSS.supports('color', got)));
    return ok ? got : (m[2] ? resolveColor(host, m[2]) : 'transparent');
  }
  function loadThree() {   // one load shared by every mount on the page, however many copies of this script there are
    if (global.THREE) return Promise.resolve();
    if (!global.__threeLoading) global.__threeLoading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'; s.onload = res; s.onerror = () => rej(new Error('three.js failed to load')); document.head.appendChild(s); });
    return global.__threeLoading;
  }
  // the one curve every animation runs on: cubic ease-in-out over a linear progress, so a reversal mid-way retraces it
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const toward = (p, target, seconds, dt) => p < target ? Math.min(target, p + dt / seconds) : Math.max(target, p - dt / seconds);

  // ---- the stage every object shares: renderer, fixed orthographic camera, theme colours, hover, the loop
  function stage(host, CONFIG, makeScene) {
    const THREE = global.THREE, D2R = Math.PI / 180;
    const RAW = {}; for (const k of COLOR_KEYS) { RAW[k] = CONFIG[k]; CONFIG[k] = resolveColor(host, CONFIG[k]); }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.background = CONFIG.background;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, CONFIG.pixelRatioCap)); renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const faceMat = new THREE.MeshBasicMaterial({ color: CONFIG.faceColor, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const capMat = faceMat.clone();
    const lineMat = new THREE.LineBasicMaterial({ color: CONFIG.lineColor, transparent: true });
    const mats = [];   // every material in use, for recolouring: {m, kind:'face'|'cap'|'line'}
    mats.push({ m: faceMat, kind: 'face' }, { m: capMat, kind: 'cap' }, { m: lineMat, kind: 'line' });
    // a solid drawn the house way: flat faces (caps may be a touch lighter) and its edges as lines
    const solid = (geometry, own) => { const fm = own ? faceMat.clone() : faceMat, cm = own ? capMat.clone() : capMat, lm = own ? lineMat.clone() : lineMat;
      if (own) { fm.transparent = cm.transparent = true; mats.push({ m: fm, kind: 'face' }, { m: cm, kind: 'cap' }, { m: lm, kind: 'line' }); }
      const n = geometry.groups ? geometry.groups.length : 0, mat = n === 2 ? [cm, fm] : n === 6 ? [fm, fm, cm, cm, fm, fm] : fm;   // an extrusion: caps + sides; a box: its top and bottom are the caps
      if (n !== 2 && n !== 6) geometry.clearGroups();
      const g = new THREE.Group(); g.add(new THREE.Mesh(geometry, mat)); const ls = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), lm); ls.renderOrder = 1; g.add(ls);   // lines after faces, so a box's back edges stay behind its front
      g.userData.mats = [fm, cm, lm]; return g; };
    const dispose = g => { scene.remove(g); g.children.forEach(c => c.geometry.dispose()); };
    let dirty = true;
    const lineMaterial = () => { const m = lineMat.clone(); mats.push({ m, kind: 'line' }); return m; };
    const S = makeScene({ THREE, scene, solid, dispose, lineMaterial, CONFIG, redraw: () => { dirty = true; }, worldPerPx: () => (camera.right - camera.left) / Math.max(1, host.clientWidth) });

    function placeCam() {
      const c = S.center(); const el = CONFIG.elevation, az = CONFIG.azimuth;
      const dir = new THREE.Vector3(-Math.cos(el * D2R) * Math.sin(az * D2R), Math.sin(el * D2R), Math.cos(el * D2R) * Math.cos(az * D2R));
      camera.position.copy(dir.multiplyScalar(20)).add(c); camera.lookAt(c); camera.updateMatrixWorld();
    }
    function fit() {
      const w = host.clientWidth || 1, h = host.clientHeight || 1; renderer.setSize(w, h, false); placeCam();
      const inv = camera.matrixWorldInverse; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of S.bounds()) { const q = p.clone().applyMatrix4(inv); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = w / h, ext = Math.max((x1 - x0) / a, y1 - y0) / 2 * CONFIG.margin;
      camera.left = cx - ext * a; camera.right = cx + ext * a; camera.top = cy + ext; camera.bottom = cy - ext; camera.updateProjectionMatrix(); dirty = true;
    }
    let alive = true, lastT = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function frame(now) {
      if (!alive) return; requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (S.update(dt, reduced)) dirty = true;
      if (!dirty) return; dirty = false; renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    // hover on the target (or the host), keyboard focus too; on touch a tap stands in for a hover
    // 'closest:.card' walks up from the host; any other string is a selector; an element is taken as is
    const hs = CONFIG.hover, hov = (hs && hs.nodeType ? hs : typeof hs === 'string' && hs.startsWith('closest:') ? host.closest(hs.slice(8)) : hs ? document.querySelector(hs) : null) || host;
    hov.addEventListener('pointerenter', ev => { if (ev.pointerType !== 'touch') S.enter(); });
    hov.addEventListener('pointerleave', ev => { if (ev.pointerType !== 'touch') S.leave(); });
    hov.addEventListener('pointerdown', ev => { if (ev.pointerType === 'touch') S.tap(); });
    hov.addEventListener('focusin', () => S.enter()); hov.addEventListener('focusout', () => S.leave());
    let lastColors = '';
    function applyColors() {
      const next = {}; for (const k of COLOR_KEYS) next[k] = resolveColor(host, RAW[k]);
      const sig = JSON.stringify(next) + CONFIG.shade; if (sig === lastColors) return; lastColors = sig; Object.assign(CONFIG, next);
      host.style.background = CONFIG.background; const cap = new THREE.Color(CONFIG.faceColor); if (CONFIG.shade) cap.lerp(new THREE.Color('#ffffff'), CONFIG.shade);
      for (const { m, kind } of mats) m.color.set(kind === 'line' ? CONFIG.lineColor : kind === 'cap' ? cap : CONFIG.faceColor); dirty = true;
    }
    applyColors();
    const themeWatch = setInterval(() => { if (alive) applyColors(); }, 400);
    const ro = global.ResizeObserver ? new ResizeObserver(fit) : null; if (ro) ro.observe(host); else addEventListener('resize', fit);
    fit();
    return {
      set(patch) { Object.assign(CONFIG, patch || {}); for (const k of COLOR_KEYS) if (patch && k in patch) { RAW[k] = patch[k]; lastColors = ''; } if (S.set) S.set(patch || {}); applyColors(); fit(); },
      get state() { return S.state(); },
      trigger() { S.enter(); }, release() { S.leave(); },
      destroy() { alive = false; clearInterval(themeWatch); if (ro) ro.disconnect(); else removeEventListener('resize', fit); renderer.dispose(); renderer.domElement.remove(); }
    };
  }

  // ======== the flag: the mark lying flat, extruded up into a block; on hover it splits into flags that lift apart
  // the mark, as polygons in flag units: u across (0 = hoist, 1 = the fly at the bottom), v down (0 = top).
  // The hoist is straight; the fly leans out so the flag is wider at the bottom; the canton narrows toward its
  // foot; nine equal bands, stripes on the odd ones, the short stripes beside the canton, the long ones under it.
  // Traced from the reference render — replace with the polygons of the real SVG when it is to hand.
  function defaultMark() {
    const H = 0.5, h = H / 9, gap = 0.06;
    const fly = v => 0.80 + 0.20 * (v / H), cin = v => 0.42 - 0.06 * (v / (5 * h));
    const polys = [[[0, 0], [cin(0), 0], [cin(5 * h), 5 * h], [0, 5 * h]]];
    for (const k of [0, 2, 4]) { const v0 = k * h, v1 = v0 + h; polys.push([[cin(v0) + gap, v0], [fly(v0), v0], [fly(v1), v1], [cin(v1) + gap, v1]]); }
    for (const k of [6, 8]) { const v0 = k * h, v1 = v0 + h; polys.push([[0, v0], [fly(v0), v0], [fly(v1), v1], [0, v1]]); }
    return { polys, width: 1, height: H };
  }
  const FLAG = Object.assign({}, SHARED, {
    mark: null,            // { polys:[[[u,v],...],...], width, height } — the default is the traced HWI mark
    depth: 0.7,            // the block's height as a fraction of the mark's width
    slices: 3,             // how many flags it turns into
    plate: 0.045,          // how thick each flag is when split, as a fraction of the mark's width (about the conveyor belt's)
    slide: 0.35,           // how far the bottom flag slides out toward the viewer when split (the axis the shield's bands step on), as a fraction of the width; the ones above slide proportionally less, the top stays
    stagger: 0.85          // each layer's share of the animation: 1 moves every layer together, less lets the top lead on the way apart
  });
  function flagScene({ THREE, scene, solid, dispose, lineMaterial, CONFIG, worldPerPx }) {
    // the block is N stacked slices of the whole mark. Each slice has one transform as a flag — a plate at its level:
    // the bottom of the block, the top, and evenly between — and one as a slice of the block, and it travels straight
    // between the two, thinning as it goes, so the block's silhouette is there throughout and the last stretch is
    // gap-closing. The lines along the cuts fade with the gaps they border, so the slices fuse rather than stack:
    // each slice draws its own vertical edges, and its top and bottom outlines separately
    let W, Hm, D, N, sliceH; const slices = [];
    const extrude = (shapes, depth) => { const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g; };   // shape plane → the ground, extrusion → up
    function rebuild() {
      for (const s of slices) dispose(s.grp); slices.length = 0;
      const mark = CONFIG.mark || defaultMark(); W = mark.width; Hm = mark.height; D = W * CONFIG.depth; N = Math.max(2, CONFIG.slices | 0); sliceH = D / N;
      const shapes = mark.polys.map(poly => { const s = new THREE.Shape(); poly.forEach(([u, v], i) => { const x = u - W / 2, y = -(v - Hm / 2); i ? s.lineTo(x, y) : s.moveTo(x, y); }); s.closePath(); return s; });
      const loop = y => { const a = []; for (const poly of mark.polys) for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a.push(p[0] - W / 2, y, p[1] - Hm / 2, q[0] - W / 2, y, q[1] - Hm / 2); } return a; };
      const posts = () => { const a = []; for (const poly of mark.polys) for (const p of poly) a.push(p[0] - W / 2, 0, p[1] - Hm / 2, p[0] - W / 2, sliceH, p[1] - Hm / 2); return a; };
      const lines = (arr, mat) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const l = new THREE.LineSegments(g, mat); l.renderOrder = 1; return l; };
      for (let k = 0; k < N; k++) {
        const grp = solid(extrude(shapes, sliceH)); const auto = grp.children[1]; grp.remove(auto); auto.geometry.dispose();
        const capB = lines(loop(0), lineMaterial()), capT = lines(loop(sliceH), lineMaterial()), verts = lines(posts(), auto.material);
        grp.add(verts); grp.add(capB); grp.add(capT); grp.position.y = k * sliceH; scene.add(grp); slices.push({ grp, k, capB, capT });
      }
    }
    rebuild();
    let target = 0, p = 0, shown = -1;
    return {
      center() { return new THREE.Vector3(0, D / 2, 0); },
      bounds() { const pts = []; for (const x of [-W / 2, W / 2]) for (const z of [-Hm / 2, Hm / 2 + W * (+CONFIG.slide || 0)]) pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, D, z)); return pts; },
      enter() { target = 1; }, leave() { target = 0; }, tap() { target = target ? 0 : 1; },
      set(o) { if ('depth' in o || 'slices' in o || 'mark' in o) rebuild(); shown = -1; },
      state() { return { split: p }; },
      update(dt, reduced) {
        if (p === target && shown === p) return false;
        p = reduced ? target : toward(p, target, CONFIG.seconds, dt);
        const t1 = Math.min(sliceH, Math.max(0.002, W * (+CONFIG.plate || 0.045)));   // a plate's thickness
        const L = Math.min(1, Math.max(0.2, +CONFIG.stagger || 1)), clamp = v => Math.min(1, Math.max(0, v));
        for (const s of slices) {
          const w0 = (N - 1 - s.k) * (1 - L) / Math.max(1, N - 1), e = ease(clamp((p - w0) / L));   // one direct path per slice: plate ↔ slice of the block
          s.th = sliceH + (t1 - sliceH) * e; s.y0 = s.k * sliceH + (s.k * (D - t1) / (N - 1) - s.k * sliceH) * e;
          s.grp.scale.y = s.th / sliceH; s.grp.position.y = s.y0; s.grp.position.z = W * (+CONFIG.slide || 0) * (N - 1 - s.k) / Math.max(1, N - 1) * e;   // the lower flags slide out toward the viewer
        }
        for (const s of slices) {   // the cut lines fade with the gap they border, over the last quarter of a slice
          const below = s.k > 0 ? s.y0 - (slices[s.k - 1].y0 + slices[s.k - 1].th) : 1, above = s.k < N - 1 ? slices[s.k + 1].y0 - (s.y0 + s.th) : 1;
          s.capB.material.opacity = clamp(below / (0.25 * sliceH)); s.capT.material.opacity = clamp(above / (0.25 * sliceH));
        }
        shown = p; return true;
      }
    };
  }

  // ======== the conveyor: a belt out of a gate, boxes on it; every hover runs it one box along — the front box
  // goes off the end and drops away, the next comes through the gate. Never reversed: the belt only runs forward.
  const CONVEYOR = Object.assign({}, SHARED, {
    boxes: 2,              // boxes on the belt at rest (one in the gate, then one per pitch)
    box: 0.72,             // box size, in belt widths
    pitch: 1.45,           // spacing along the belt, in belt widths
    tape: 0.16,            // width of the strip of tape over each box, in belt widths; it runs along the belt and folds down the ends. 0 = none
    dividers: 0.36,        // spacing of the lines across the belt, in belt widths; they travel with it. 0 = none
    rollers: 0.3           // spacing of the little roller squares along the belt's near side, in belt widths. 0 = none
  });
  function conveyorScene({ THREE, scene, solid, dispose, lineMaterial, CONFIG }) {
    // belt units: width 1 (x), along the belt is +z (toward the viewer); the gate stands at the back
    const BW = 1, BT = 0.08, Z0 = -0.7, Z1 = 1.85, BX = 0.15;            // belt: x centred on BX, from just behind the gate's back face to the front end
    const G = { x0: -0.66, x1: 0.96, y1: 1.6, z0: -0.65, z1: -0.25, ox0: -0.36, ox1: 0.66, oy0: BT, oy1: 0.98 };   // the gate and its opening; the posts either side are the same width
    const belt = solid(new THREE.BoxGeometry(BW, BT, Z1 - Z0)); belt.position.set(BX, BT / 2, (Z0 + Z1) / 2); scene.add(belt);
    { const s = new THREE.Shape(); s.moveTo(G.x0, 0); s.lineTo(G.x1, 0); s.lineTo(G.x1, G.y1); s.lineTo(G.x0, G.y1); s.closePath();
      const hole = new THREE.Path(); hole.moveTo(G.ox0, G.oy0); hole.lineTo(G.ox1, G.oy0); hole.lineTo(G.ox1, G.oy1); hole.lineTo(G.ox0, G.oy1); hole.closePath(); s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: G.z1 - G.z0, bevelEnabled: false }); g.translate(0, 0, G.z0); const gate = solid(g); scene.add(gate); }
    // the belt's own detail: lines across its top every `dividers` (they move with the boxes, wrapping), and a row of
    // small squares along its near side, like rollers, which stay where they are
    const lineMat = lineMaterial(); let dividers = null, rollers = null, nDiv = 0;
    { const sp = +CONFIG.dividers || 0; if (sp > 0) { nDiv = Math.ceil((Z1 - Z0) / sp) + 1; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(nDiv * 6), 3)); dividers = new THREE.LineSegments(g, lineMat); dividers.renderOrder = 1; scene.add(dividers); }
      const rp = +CONFIG.rollers || 0; if (rp > 0) { const a = [], x = BX - BW / 2, h = BT * 0.6, y0 = BT * 0.2, y1 = y0 + h; for (let z = G.z1 + rp * 0.6; z < Z1 - h; z += rp) { const z0 = z - h / 2, z1 = z + h / 2; a.push(x, y0, z0, x, y0, z1, x, y0, z1, x, y1, z1, x, y1, z1, x, y1, z0, x, y1, z0, x, y0, z0); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); rollers = new THREE.LineSegments(g, lineMat); rollers.renderOrder = 1; scene.add(rollers); } }
    function placeDividers(travel) { if (!dividers) return; const sp = +CONFIG.dividers, len = Z1 - Z0, a = dividers.geometry.attributes.position.array; let n = 0;
      for (let k = 0; k < nDiv; k++) { const z = Z0 + (((k * sp + travel) % len) + len) % len; if (z > Z1 - 0.01) continue; a[n++] = BX - BW / 2; a[n++] = BT; a[n++] = z; a[n++] = BX + BW / 2; a[n++] = BT; a[n++] = z; }
      for (; n < a.length; n++) a[n] = 0; dividers.geometry.attributes.position.needsUpdate = true; }
    let boxes = [], B, P, M;
    function rebuild() { for (const b of boxes) dispose(b); boxes = []; B = CONFIG.box; P = CONFIG.pitch; M = Math.max(1, CONFIG.boxes | 0) + 2;   // +1 waiting behind the gate, +1 on its way off
      for (let j = 0; j < M; j++) { const b = solid(new THREE.BoxGeometry(B, B, B)); if (CONFIG.tape > 0) b.add(tape(B, CONFIG.tape)); scene.add(b); boxes.push(b); } placeDividers(0); }
    // a strip of tape over a box: two lines along the top, folding a little way down each end (box-local units)
    function tape(B, tw) { const a = [], h = B / 2, x0 = -tw / 2, x1 = tw / 2, d = B * 0.24, seg = (...p) => a.push(...p);
      for (const x of [x0, x1]) { seg(x, h, -h, x, h, h); seg(x, h, h, x, h - d, h); seg(x, h, -h, x, h - d, -h); }   // along the top, then down the front and back faces
      seg(x0, h - d, h, x1, h - d, h); seg(x0, h - d, -h, x1, h - d, -h);   // the tape's ends
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); const l = new THREE.LineSegments(g, lineMat); l.renderOrder = 1; return l; }
    rebuild();
    const ZM = G.z1 + B * 0.5 - 0.36;   // slot 0: the box in the mouth of the gate, nosing out of it
    let cycles = 0, queued = 0, p = 0, shown = -1;   // cycles done, cycles still to run, progress through the current one
    const slotOf = (j, ph) => ((j + ph) % M + M) % M - 1;   // slot -1 waits behind the gate, 0 is in the gate, then one per pitch; the last slot is off the end
    function place(b, s) {
      const z = ZM + s * P, zb = z - B / 2, zf = Math.min(z + B / 2, Z1), len = zf - zb;   // clipped at the end of the belt: the box keeps its nose on the end and shortens to nothing
      b.visible = s > -0.3 && len > 0.002; if (!b.visible) return;   // hidden until it is fully behind the gate's face
      b.scale.z = len / B; b.position.set(BX, BT + B / 2, (zb + zf) / 2);
    }
    return {
      center() { return new THREE.Vector3(BX - 0.1, 0.55, (G.z0 + Z1) / 2 + 0.1); },
      bounds() { const pts = []; const add = (x, y, z) => pts.push(new THREE.Vector3(x, y, z));
        for (const x of [G.x0, G.x1]) for (const y of [0, G.y1]) for (const z of [G.z0, G.z1]) add(x, y, z);
        for (const x of [BX - BW / 2, BX + BW / 2]) for (const z of [G.z0, Z1]) add(x, 0, z), add(x, BT, z);
        for (const s of [0, M - 2]) { const z = ZM + s * P; for (const dx of [-B / 2, B / 2]) for (const dy of [0, B]) for (const dz of [-B / 2, B / 2]) add(BX + dx, BT + dy, Math.min(z + dz, Z1)); }
        return pts; },
      enter() { queued += 1; }, leave() {}, tap() { queued += 1; },
      set(o) { if ('boxes' in o || 'box' in o || 'pitch' in o || 'tape' in o) rebuild(); shown = -1; },
      state() { return { phase: cycles + ease(p), queued }; },
      update(dt, reduced) {
        if (p === 0 && queued === 0 && shown === cycles) return false;
        if (queued > 0 || p > 0) { p = reduced ? 1 : Math.min(1, p + dt / CONFIG.seconds); if (p >= 1) { p = 0; cycles += 1; queued = Math.max(0, queued - 1); } }
        const ph = cycles + ease(p); for (let j = 0; j < M; j++) place(boxes[j], slotOf(j, ph)); placeDividers(ph * P);
        shown = p === 0 ? cycles : -1; return true;
      }
    };
  }

  // ======== the shield: the mark standing upright like a badge, extruded back; on hover its bands step forward,
  // outer band first, so the layers of it show — and step back flush when the pointer leaves
  const SHIELD_MARK = {"polys":[[[1,0],[1,0.7288],[0.6157,1.0507],[0.3844,1.0507],[0.0001,0.7288],[0.0001,0.5751],[0.4273,0.9329],[0.5729,0.9329],[0.8822,0.6738],[0.8822,0],[1,0]],[[0.7796,0],[0.7796,0.6257],[0.6142,0.7643],[0.5354,0.8303],[0.4646,0.8303],[0.3473,0.732],[0,0.4411],[0,0.2874],[0.4999,0.7061],[0.6617,0.5706],[0.6617,0],[0.7796,0]],[[0.559,0],[0.559,0.5228],[0.4999,0.5723],[0.4411,0.5231],[0.0001,0.1536],[0,0.0646],[0,0],[0.0647,0.0542],[0.4411,0.3693],[0.4411,0],[0.559,0]],[[0.3386,0],[0.3386,0.1496],[0.16,0],[0.3386,0]]],"width":1,"height":1.0507};   // shield.svg: four nested chevron bands, outermost first, in units of the mark's width
  const SHIELD = Object.assign({}, SHARED, {
    mark: null,            // { polys, width, height } — the default is shield.svg
    depth: 0.22,           // the plate's thickness as a fraction of the mark's width
    rise: 0.5,             // how far the innermost band stands proud when stepped, as a fraction of the width
    stagger: 0.55          // each band's share of the animation; the bands' windows overlap, outer first
  });
  function shieldScene({ THREE, scene, solid, dispose, CONFIG }) {
    let W, Hm, D, N; const bands = [];
    function rebuild() {
      for (const b of bands) dispose(b.grp); bands.length = 0;
      const mark = CONFIG.mark || SHIELD_MARK; W = mark.width; Hm = mark.height; D = W * CONFIG.depth; N = mark.polys.length;
      mark.polys.forEach((poly, k) => { const sh = new THREE.Shape(); poly.forEach(([u, v], i) => { const x = u - W / 2, y = Hm - v; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }); sh.closePath();   // upright: u across, v down from the top, the foot on the ground
        const g = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false }); const grp = solid(g); scene.add(grp); bands.push({ grp, k }); });
    }
    rebuild();
    let target = 0, p = 0, shown = -1;
    const step = k => N > 1 ? k / (N - 1) * W * CONFIG.rise : 0;
    return {
      center() { return new THREE.Vector3(0, Hm / 2, D / 2); },
      bounds() { const pts = []; for (const x of [-W / 2, W / 2]) for (const y of [0, Hm]) for (const z of [0, D + step(N - 1)]) pts.push(new THREE.Vector3(x, y, z)); return pts; },
      enter() { target = 1; }, leave() { target = 0; }, tap() { target = target ? 0 : 1; },
      set(o) { if ('depth' in o || 'mark' in o) rebuild(); shown = -1; },
      state() { return { stepped: p }; },
      update(dt, reduced) {
        if (p === target && shown === p) return false;
        p = reduced ? target : toward(p, target, CONFIG.seconds, dt);
        const L = CONFIG.stagger, clamp = v => Math.min(1, Math.max(0, v));
        for (const b of bands) { const w0 = b.k * (1 - L) / Math.max(1, N - 1), u = ease(clamp((p - w0) / L)); b.grp.position.z = step(b.k) * u; }
        shown = p; return true;
      }
    };
  }

  function mount(target, config, DEF, sceneFn) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return Promise.reject(new Error('IsoMarks: target not found'));
    const CONFIG = Object.assign({}, DEF, config || {});
    return loadThree().then(() => stage(host, CONFIG, sceneFn));
  }
  global.IsoMarks = {
    flag: (t, c) => mount(t, c, FLAG, flagScene),
    conveyor: (t, c) => mount(t, c, CONVEYOR, conveyorScene),
    shield: (t, c) => mount(t, c, SHIELD, shieldScene),
    defaults: { flag: FLAG, conveyor: CONVEYOR, shield: SHIELD }, defaultMark, shieldMark: SHIELD_MARK, version: '1.1.0'
  };
})(typeof window !== 'undefined' ? window : this);
