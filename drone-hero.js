/*!
 * drone-hero.js — the heavy-lift drone model drawn as line work, on a scroll-driven camera move onto one of its motors.
 *
 *   <section class="section_hero">                       <!-- ~200vh tall: the track -->
 *     <div class="hero_sticky">                          <!-- sticky, one viewport tall -->
 *       <div id="drone" style="position:absolute;inset:0"></div>
 *       …the copy…
 *     </div>
 *   </section>
 *   <script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@<commit>/drone-hero.js"></script>
 *   <script>DroneHero.mount('#drone', { focus: 'FR', track: 'closest:.section_hero' });</script>
 *
 * The model (heavy_lift_drone_model.glb, beside this script) is drawn as lines found on screen: a first pass writes
 * each pixel's normal, depth and part, a second draws a one-pixel line wherever those jump — silhouettes and creases
 * alike, the same weight everywhere, with nothing behind showing through. The landing-gear struts, which the model
 * stops short, are carried on down to the skids. The motors' casings (base, coil, cap, shaft) draw in the primary
 * colour, with vertical ribs; everything else in the secondary. The ribs and the floor grid are drawn as screen-space
 * quads with their own coverage, so they stay antialiased at any width. The model's
 * propellers are replaced with generated blades that turn as the page scrolls, neighbours counter-rotating. A floor
 * grid fades toward the frame's edges. With `track` set, the camera dollies along a path over that section's scroll
 * (and writes its progress to a CSS custom property, so the page's copy can move with it):
 * from the whole aircraft, head-on, round and down to beneath the focused motor, looking up at it with the rest of
 * the drone above and behind. Without a track it holds the end of the path. With `inspect`, up to `breakpoint` the
 * inspection is stepped (inspect.steps): each row crossing a line in the viewport tweens the camera to its pose, the
 * canvas docks to a band at the top, and nothing follows the scroll or draws at rest. Colours come from CSS variables:
 *   --drone-primary    the motors             (falls back to --topo-label, then #f2f2f0)
 *   --drone-secondary  the rest of the drone  (falls back to --topo-label-secondary, then #9a9a96)
 *   --drone-grid       the floor grid         (falls back to --drone-secondary)
 *   --drone-face       the faces              (falls back to --topo-block, then #222322)
 *   --drone-bg         the canvas             (transparent by default)
 */
(function (global) {
  'use strict';
  const HERE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/[^/]*$/, '') : '';

  const DEFAULTS = {
    model: '',                 // URL of the GLB; '' = heavy_lift_drone_model.glb beside this script
    loader: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
    onProgress: null,          // function({ loaded, total, scripts, built }): called as the model's bytes, three.js and the loader come in and once the drone is built (total 0 = the size is not known), for a page's preloader
    focus: 'FL',               // which motor the path ends on: FR, FL, BR, BL, or with ' 2' for the lower ring of the coaxial pairs
    track: '',                 // the tall section the canvas is pinned inside ('closest:.section_hero', a selector, or an element); the camera's path runs over its scroll. '' = hold the end view
    runEnd: '',                // optional: a selector (inside the track) for the element whose top reaching the canvas's top ends the path — e.g. the section the drone is meant to arrive in — instead of the track's own end
    damping: 0.12,             // how closely the camera follows the scroll (per frame at 60fps); 1 = instantly
    fov: 30,                   // the camera's vertical field of view, degrees
    fovNarrow: null,           // on screens up to `breakpoint`: the field of view the lens widens to over the approach (from `fov` at the top of the page to this at the arrival, held after), so more of the scene shows by the split view; the camera keeps its distance, so it is a zoom out, not a change of perspective. null = `fov` throughout
    // the end of the path: beneath the focused motor and out to its side, looking up at it. Headings are about the
    // drone: 0 = from the front, positive = round to the drone's right, negative = round to its left
    azimuth: -28,              // camera heading in degrees at the end; or 'auto': side-on to the focused arm, turned by `turn`
    turn: -28,                 // (only with azimuth 'auto') degrees the side-on heading swings round
    elevation: -14,            // camera height above the horizon at the end, degrees; negative looks up from below
    zoom: 0.36,                // the focused motor's height (base to cap) as a fraction of the frame's height
    zoomNarrow: null,          // … on screens up to `breakpoint` (null = the same)
    point: { x: 0.5, y: 0.5 },         // where the ribbed casing sits in the frame at the end (fractions of width and height)
    pointNarrow: { x: 0.5, y: 0.45 },  // … on screens up to `breakpoint` wide
    startPoint: { x: 0.5, y: 0.5 },    // where the whole drone's centre sits at the start; y above 1 puts it below the frame, so only its top peeks in
    startPointNarrow: null,            // … on narrow screens (null = the same)
    breakpoint: 991,
    progressVar: '--drone-progress',   // a CSS custom property the eased, damped progress (0-1) is written to on the track and the host, so the page's own layout can follow the move; '' = none. Not written up to `breakpoint`
    flag: false,               // an American flag hung behind the drone, in the same line work, waving slowly as if in a light breeze; true = on
    flagWidth: 37,             // its width in the model's units (the drone spans about 7.5); height follows the 1:1.9 ratio
    flagBottom: 2, flagZ: -22, flagX: 0,   // where its bottom edge hangs, how far back it is, and its centre's x — all from the drone's centre
    flagSway: 0.04,            // the wave's amplitude as a share of the flag's height
    flagSeconds: 16,           // roughly one wave cycle every so many seconds
    flagOpacity: 0.85,         // the stripes' and stars' opacity (their colour is the secondary)
    flagFade: [0.5, 0.85],     // [from, to]: the window of the path's progress over which the flag fades away, so the close-up never shows its edge cut across the frame; null = never
    primaryIn: null,           // [from, to]: the window of the path's progress over which the motors go from the secondary colour to the primary (null = primary throughout)
    arriveEvent: 'drone:arrive',   // dispatched (bubbling) on the runEnd element when the path arrives there, and…
    leaveEvent: 'drone:leave',     // … when the scroll takes it back up the path; '' = none. The page's own scripts can start things on them
    scrollVar: '--drone-scroll',   // the same as progressVar but undamped — straight from the scroll position, for anything that must never lag the page (e.g. a panel that fades out before its sticky start); '' = none
    exitVar: '',               // a CSS custom property that runs 0-1 over the last viewport of the track's scroll, as the pinned canvas begins to leave with the track's end; '' = none (it costs a layout read per scroll event)
    // the inspection: once the path has arrived (the runEnd section at the top), that section's own scroll steps the
    // camera through three resting poses round the motor, each with a hotspot on the motor and a feature row made
    // active. null = none. See INSPECT for the defaults; pass any subset to change them
    inspect: null,
    // the start of the path: the whole aircraft, centred, level, from the front
    tilt: 0,                   // degrees the drone is pitched nose-down about its centre at the top of the page (negative = nose-up), as if under way; it levels out over the approach and arrives flat
    floor: 0,                  // how far the floor grid sits below the drone's lowest point, in motor heights (0 = it rests on the floor)
    startAzimuth: 0,           // camera heading at the start; 0 = the front view
    startElevation: 0,         // degrees above the horizon at the start; 0 = dead level
    margin: 1.25,              // breathing room round the whole drone at the start (1 = its silhouette touches the frame)
    propScroll: 0.35,          // propeller turns per 1000px of scrolling; 0 = the props do not follow the scroll
    propSeconds: 0,            // seconds per idle turn of every propeller; 0 = still unless scrolled
    propPhase: null,           // the heading the propellers' blades start at, in degrees (0 = a blade straight back from the camera's opening view, 90 = to its left; the same for all, so they read as a set); null = each at random
    props: 'blades',           // 'blades': generated blades in place of the model's; 'model': the model's own
    blades: 2, bladeChord: 0.2, bladeTwist: 22,   // per propeller: blade count, widest chord as a share of the radius, root twist in degrees
    grid: 1, gridFade: 0.3,    // the floor grid's cell, in motor heights (0 = none), and how far from the motor it starts fading (share of the frame's half-size; it is gone by the edges — and by the grid's own edge, in every direction)
    gridExtent: 24, gridWidth: 1,   // how far the grid reaches from the drone's centre, in motor heights, and its line width in CSS pixels
    ribs: 24, ribWidth: 1, ribOpacity: 0.8,   // vertical ribs round each motor's casing (0 = none), their width in CSS pixels and opacity
    lineWidth: 1,              // the edge lines' thickness, in screen pixels
    depthEdge: 0.012, normalEdge: 0.25,   // how big a jump in depth (relative) or in normal (1 - cos) draws a line
    normalEdgeMotor: null,     // the normal threshold on the motors alone (the focused one, the others and the copies), e.g. lower for a shell with shallow slots; null = normalEdge
    supersample: 2,            // the edge pass runs at this many times the canvas resolution and averages, so the lines are antialiased
    pixelBudget: 8e6,          // the most pixels the edge pass holds at once; a frame that needs more is rendered in tiles, so the quality never drops
    primary: 'var(--drone-primary, var(--topo-label, #f2f2f0))',
    secondary: 'var(--drone-secondary, var(--topo-label-secondary, #9a9a96))',
    gridColor: 'var(--drone-grid, var(--drone-secondary, var(--topo-label-secondary, #9a9a96)))',   // the floor grid's lines, before their fade toward the face colour
    face: 'var(--drone-face, var(--topo-block, #222322))',
    background: 'var(--drone-bg, transparent)',
    pixelRatioCap: 2,
    msaa: false,               // multisampling on the canvas itself; the lines have their own antialiasing (the edge pass's supersampling, the quads' coverage) so it changes nothing visible and costs fill on every frame
    // on touch devices (a coarse pointer) the work per frame is cut: the canvas at a lower pixel ratio, and at most this many frames a second
    pixelRatioCapCoarse: 1.5,
    fpsCoarse: 30,
    themeFade: 200,            // ms over which the colours follow a light/dark switch (the site's own html/body transition is .2s); 0 = snap
    flagFpsCoarse: 30          // on touch devices the flag's wave (rebuilt on the CPU) steps at most this many times a second; 0 = every frame
  };
  const COLOR_KEYS = ['primary', 'secondary', 'gridColor', 'face', 'background'];
  const INSPECT = {
    // the three poses: heading and height about the motor (degrees, the same convention as `azimuth`/`elevation`),
    // the housing's height as a share of the frame, and where the hotspot sits on the housing: `angle` is a heading
    // round it, `height` runs 0-1 from the bottom of the wall to the top (beyond either for the cap or the mount),
    // `radius` is a multiple of the housing's radius. The label is the hotspot's caption
    // the camera passes through each pose at `at` (of the section's scroll; the end of its window when not given, so each stage's move fills its window) on
    // one smooth curve from the arrival view: it never stops between poses, only eases to rest after the last. A pose
    // may also move the look-at point from the motor's housing toward the drone's centre (`centre`, 0-1) and put it
    // elsewhere in the frame (`point`, as the top-level one; `pointNarrow` on screens up to `breakpoint`, else the top-level
    // narrow point — a pose's `point` is for the wide layout); the anchor is the hotspot's place on the housing
    poses: [
      { azimuth: -40, elevation: -8, zoom: 0.55, zoomNarrow: 0.26, anchor: { angle: -42, height: 0.62, radius: 1 }, label: '01' },   // a touch further round and up from the arrival, and closing in, so the motor fills the frame as the rest of the drone strips away
      { azimuth: -90, elevation: 0, zoom: 0.5, zoomNarrow: 0.24, anchor: { angle: -70, height: 0.5, radius: 1 }, label: '02' },   // the profile, from the drone's left, dead level — passed through, not held
      { azimuth: -135, elevation: 35, zoom: 0.32, zoomNarrow: 0.22, anchor: { angle: -135, height: 1.14, radius: 0.55 }, label: '03' }  // from above and further round to the left, a little further out: the row of copies behind it, running off the frame
    ],
    // the heading and the height run one way through the three poses, so the curve never comes to rest between them: the
    // camera is always moving, slowest near each pose, and only settles after the last (the distance closes in to 01 and
    // opens out again for the row). Equal values in two neighbouring keys — a pose the same as the arrival, or a `hold` —
    // make it stop there. `zoomNarrow` on a pose is its zoom on screens up to `breakpoint`
    isolate: null,             // of the section's scroll: the window over which everything but the focused motor fades away, quickly at first and then slowly (the floor grid stays); null = the first pose's window, so it is that stage's move; false = never
    crossfade: true,           // how it fades: true = the frame is drawn twice, with the rest of the drone and without, and the two are blended, so its lines, its faces' cover of the grid and ribs behind them, and the motor's outline where they cross it all dissolve at one rate (costs a second render only while it fades); false = only its lines fade, and its geometry stays in the way until it is gone
    copies: { count: 6, gap: 1.3, fade: null },   // the focused motor repeated behind itself: how many (each further one dimmer, the last nearly gone), their spacing in housing diameters, and the window (of the section's scroll) over which they fade in (null = the opening 40% of the last pose's window) — they sit behind the motor along the profile's line of sight, so fading in just as the camera leaves it, they emerge from behind it as it swings on up; copies: null = none
    callouts: false,           // true: a callout on the housing in each window (a leader to a small square, the pose's `label` above)
    windows: [[0.4, 0.6], [0.6, 0.8], [0.8, 1]],   // of the section's scroll: each pose's window, where its row is active and its bar fills; the camera moves from the previous pose to this one over it, arriving as it ends (before the first is the intro)
    settle: 0.04,              // the hotspot fades in over this much scroll after its window begins, and out over as much before it ends
    easeOut: null,             // of the section's scroll: over this much before its end the camera's progress is eased out (its speed falling smoothly to nothing at the end, on top of the curve's own flat end), so the last stage comes to rest softly; null = the last pose's window; 0 = none
    rows: '[data-inspect]',    // the feature rows, numbered 1.. in that attribute; the active one gets `activeClass`
    activeClass: 'is-active',
    click: false,              // true: clicking a row scrolls the page (smoothly) to that row's window, so the camera settles on its pose
    reachEvent: 'drone:reach',     // dispatched (bubbling) on a row as the scroll reaches its window, and…
    unreachEvent: 'drone:unreach', // … on the way back up past its start; '' = none. The page's own scripts can start things on them
    fillVar: '--inspect-fill',   // a CSS custom property written on each row: 0 before its window, 0-1 through it, 1 after — for a progress bar in the row; '' = none
    activeVar: '--inspect-active',   // a CSS custom property written on each row: 1 while its window is the current one, else 0 — the row's own styles (and, as it inherits, its children's) can follow it where a class can't reach; '' = none
    hotspotClass: '',          // CSS class(es) for the hotspot labels (e.g. the site's eyebrow style)
    leader: [0, -72],          // the callout, as the topo map's: a straight leader from the anchor out by (dx, dy) px to a small square, the label above it
    dot: 6,                    // the square's side (px)
    // (the old three-value form [dx, dy, run] still reads: the run is ignored) // the leader line from the hotspot: out by (dx, dy) px, then a run of this many px (negative = leftward, the label at its end)
    inspectVar: '--drone-inspect',  // a CSS custom property the inspection's progress (0-1) is written to
    // stepped: instead of following the scroll, the inspection moves in discrete states — the arrival, then one per
    // pose — each tweened to over `tween` ms when its row crosses a line in the viewport, and still between. The copy
    // scrolls normally; nothing reads the scroll once the approach is over, and the canvas only draws while a move runs
    steps: 'narrow',           // where: 'narrow' = on screens up to `breakpoint` (the scrubbed inspection stays above it), true = everywhere, false = never
    follow: 'tween',           // how the camera moves between the states: 'tween' = a timed move when a row crosses the line, still between; 'scroll' = it follows
                               // the scroll (damped), arriving at each pose as its row's top reaches the line — a smooth scrub, in the same layout
    line: 0.68,                // a row becomes the active one when its top rises above this share of the viewport's height…
    hysteresis: 0.1,           // … and only gives it up when its top drops back below line + this much, so a row hovering on the line never flickers
    tween: 1000,               // ms for the move to a state, on a gentle ease-in-out (a jump of several states takes a third longer per extra state); prefers-reduced-motion: instant
    dock: 0.5,                 // stepped only: once the drone has arrived, the canvas docks to this share of its height at its top, at once (the view is cropped to it,
                               // never reframed, and the canvas resized to it, so it draws only what shows; pointNarrow's y wants to be about half this); 0 = no dock
    dockPixelRatio: 3,         // docked, the canvas is half the pixels, so it may draw at up to this pixel ratio (the device's own, where it is lower); null = the usual cap
    dockClass: 'is-docked',    // set on the track, the host and any [data-drone-dock] element inside the track while docked, so the page can put its copy under the band only then (e.g. z-index: -1 on the section) and over the drone before; '' = none            // docked, a pose keeps the motor's size on screen (its zoom is a share of the full canvas), up to this share of the band's height
    dockBackground: ''         // the docked band's background, so the copy scrolls under it; '' = the nearest ancestor's background colour
  };

  function resolveColor(host, v) {
    if (typeof v !== 'string') return v;
    const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+?)\s*)?\)$/);
    if (!m) return v;
    const got = getComputedStyle(host).getPropertyValue(m[1]).trim();
    const ok = got && !/var\(/.test(got) && (got === 'transparent' || (global.CSS && CSS.supports && CSS.supports('color', got)));
    return ok ? got : (m[2] ? resolveColor(host, m[2]) : 'transparent');
  }
  const loadScript = (src, ready) => { if (ready()) return Promise.resolve(); const key = '__loading_' + src; if (!global[key]) global[key] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed to load ' + src)); document.head.appendChild(s); }); return global[key]; };
  const loadThree = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', () => !!global.THREE);
  // a colour part way between two CSS colours, for the theme fade; anything three.js would not parse cleanly snaps to the end
  const mixColor = (a, b, u) => { if (u >= 1 || a === b || !global.THREE) return b; const ok = v => typeof v === 'string' && /^(#|rgb|hsl)/i.test(v.trim()); if (!ok(a) || !ok(b)) return b; const c = new global.THREE.Color(a); return '#' + c.lerp(new global.THREE.Color(b), u).getHexString(); };
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // a propeller: `n` blades about the y axis, radius R, hub radius r0. Each blade is a lofted solid: a thin lens
  // section at stations along the span, chord widest a third of the way out and tapering to the tip, pitched
  // (twisted) most at the root — so it reads as a propeller from every angle, with a sharp leading and trailing edge
  function propellerGeometry(THREE, R, r0, n, chordMax, twistDeg) {
    const pos = [], idx = [], NS = 14, NP = 10;
    for (let b = 0; b < n; b++) {
      const rot = b * Math.PI * 2 / n, base = pos.length / 3;
      for (let s = 0; s <= NS; s++) {
        const t = s / NS, r = r0 + (R - r0) * t;
        const chord = R * chordMax * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * (1 - 0.55 * Math.max(0, t - 0.6) / 0.4);
        const th = (twistDeg * (1 - 0.65 * t)) * Math.PI / 180, thick = chord * 0.09, sweep = 0.12 * chord * t;
        for (let p = 0; p < NP; p++) {
          const a = p / NP * Math.PI * 2, cx = Math.cos(a) * chord / 2 + sweep, cy = Math.sin(a) * thick / 2 * (1 - 0.35 * Math.abs(Math.cos(a)));
          const yy = cy * Math.cos(th) - cx * Math.sin(th), zz = cy * Math.sin(th) + cx * Math.cos(th);
          pos.push(r * Math.cos(rot) - zz * Math.sin(rot), yy, r * Math.sin(rot) + zz * Math.cos(rot));
        }
      }
      for (let s = 0; s < NS; s++) for (let p = 0; p < NP; p++) { const a = base + s * NP + p, b2 = base + s * NP + (p + 1) % NP, c = a + NP, d = b2 + NP; idx.push(a, c, b2, b2, c, d); }
      const rootC = pos.length / 3; pos.push(r0 * Math.cos(rot), 0, r0 * Math.sin(rot)); for (let p = 0; p < NP; p++) idx.push(rootC, base + (p + 1) % NP, base + p);
      const tipC = pos.length / 3; pos.push(R * Math.cos(rot), 0, R * Math.sin(rot)); const tb = base + NS * NP; for (let p = 0; p < NP; p++) idx.push(tipC, tb + p, tb + (p + 1) % NP);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  // the edge pass: pass one writes normal (rgb) and part (a: one id per mesh, the focused motor's casing in the top
  // range) with depth; pass two draws a line, in that part's colour, on the nearer side wherever two parts meet on
  // screen (or a part meets the background), on a part's own silhouette over itself, and along its creases
  const ID_VERT = 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const ID_FRAG = 'uniform float uId; varying vec3 vN; void main(){ gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, uId); }';
  const EDGE_FRAG = `
    uniform sampler2D tN, tD; uniform vec2 uRes; uniform vec4 uTile; uniform float uNear, uFar, uWidth, uDepthT, uNormT, uNormTM, uFlagA, uDroneA, uCopyA, uCopyP, uCopyN, uFocusMin, uMotorMin, uCopyTop; uniform vec3 uC1, uC2;
    float lin(float z){ float zn = 2.0 * z - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear)); }
    // the line at one point of the (supersampled) pass: 0 = none, 1 = a line, and which colour it takes
    float edgeAt(vec2 uv, out vec3 col){
      vec2 px = uWidth / uRes; vec4 c = texture2D(tN, uv); float d = lin(texture2D(tD, uv).x); vec3 n = c.xyz * 2.0 - 1.0;
      // ids: the drone's other parts count up from 1, the flag is 110; from 255 down: the focused motor's parts, the other motors', the motor copies (a band of uCopyP per copy, from uCopyTop down)
      col = c.a > 0.6 ? uC1 : uC2;
      float fa = c.a >= uFocusMin ? 1.0 : c.a >= uMotorMin ? uDroneA : c.a > 0.6 ? uCopyA * max(0.0, 1.0 - (floor((uCopyTop - floor(c.a * 255.0 + 0.5)) / uCopyP) + 1.0) / (uCopyN + 1.0)) : (c.a > 0.35 && c.a < 0.55) ? uFlagA : uDroneA;   // the flag, the focused motor, the copies (each further one dimmer), the rest of the drone: each fades on its own
      if (c.a < 0.002) return 0.0;                               // background (ids start at 1/255): lines are drawn from the object's side
      float e = 0.0;
      for (int i = 0; i < 2; i++) {                              // each axis: the two neighbours either side
        vec2 o = i == 0 ? vec2(px.x, 0.0) : vec2(0.0, px.y);
        vec4 c1 = texture2D(tN, uv + o), c2 = texture2D(tN, uv - o); float d1 = lin(texture2D(tD, uv + o).x), d2 = lin(texture2D(tD, uv - o).x);
        bool own1 = abs(c1.a - c.a) < 0.002, own2 = abs(c2.a - c.a) < 0.002;   // the neighbour is on this same part
        // another part, or the background: the boundary is a line, owned by whichever side is nearer
        if (!own1 && (c1.a < 0.002 || d < d1)) e = 1.0;
        if (!own2 && (c2.a < 0.002 || d < d2)) e = 1.0;
        // this part over itself: a surface seen at a grazing angle changes depth steadily, a silhouette breaks it —
        // so test the second difference, and let the nearer side of the break own the line
        if (own1 && own2) { float bend = abs(d1 + d2 - 2.0 * d) / d;
          e = max(e, smoothstep(uDepthT, uDepthT * 3.0, bend) * step(d, max(d1, d2) - uDepthT * 0.5 * d)); }
        // a crease between two faces of this part; the side with the greater normal key draws it
        for (int k = 0; k < 2; k++) { vec4 cn = k == 0 ? c1 : c2; float dn = k == 0 ? d1 : d2; bool own = k == 0 ? own1 : own2;
          if (own && abs(dn - d) / d < uDepthT * 2.0) { vec3 nn = normalize(cn.xyz * 2.0 - 1.0);
            float key = dot(n, vec3(0.3, 0.59, 0.11)), keyn = dot(nn, vec3(0.3, 0.59, 0.11));
            float nt = c.a > 0.6 ? uNormTM : uNormT; e = max(e, key >= keyn ? smoothstep(nt, nt * 2.0, 1.0 - dot(n, nn)) : 0.0); } }   // (the motors have their own threshold)
      }
      return e * fa;
    }
    void main(){
      // this canvas pixel's place in the tile's pass (uTile: the tile's origin and size in canvas pixels), then four
      // points inside the pixel, averaged: coverage, so the line is antialiased (premultiplied out)
      vec2 uv = (gl_FragCoord.xy - uTile.xy) / uTile.zw, q = 0.25 / uTile.zw; vec3 rgb = vec3(0.0), col; float a = 0.0, e;
      e = edgeAt(uv + vec2(-q.x, -q.y), col); rgb += col * e; a += e;
      e = edgeAt(uv + vec2( q.x, -q.y), col); rgb += col * e; a += e;
      e = edgeAt(uv + vec2(-q.x,  q.y), col); rgb += col * e; a += e;
      e = edgeAt(uv + vec2( q.x,  q.y), col); rgb += col * e; a += e;
      if (a < 0.02) discard;
      gl_FragColor = vec4(rgb, a) * 0.25;
    }`;

  // drawn lines (the ribs and the grid): each segment is a quad the vertex shader expands on screen to the line's width
  // plus a pixel of feather, and the fragment fades by its distance from the centreline — antialiased at any width,
  // which GL lines are not. A segment crossing the near plane is clipped to it first. The grid fades by each end's
  // distance from the focus on screen.
  const LINE_VERT = `
    uniform vec2 uRes, uFocus, uCentre; uniform float uHalf, uNear, uFade0, uFadeOn, uExtent;
    attribute vec3 pointA, pointB; attribute vec2 corner; varying vec2 vD; varying float vLen, vF;
    void main(){
      vec4 va = modelViewMatrix * vec4(pointA, 1.0), vb = modelViewMatrix * vec4(pointB, 1.0); float nz = -uNear * 1.001;
      if (va.z > nz && vb.z > nz) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vD = vec2(0.0); vLen = 0.0; vF = 1.0; return; }
      if (va.z > nz) va = mix(va, vb, (nz - va.z) / (vb.z - va.z)); else if (vb.z > nz) vb = mix(vb, va, (nz - vb.z) / (va.z - vb.z));
      vec4 ca = projectionMatrix * va, cb = projectionMatrix * vb;
      vec2 sa = ca.xy / ca.w * uRes * 0.5, sb = cb.xy / cb.w * uRes * 0.5;
      vec2 d = sb - sa; float len = max(length(d), 1e-4); d /= len; vec2 n = vec2(-d.y, d.x);
      bool B = corner.x > 0.5; vec4 c = B ? cb : ca; vec2 s = (B ? sb : sa) + (B ? d : -d) * uHalf + n * corner.y * uHalf;
      vD = vec2(corner.y * uHalf, B ? len + uHalf : -uHalf); vLen = len;
      float r = distance(c.xy / c.w, uFocus), rw = distance((B ? pointB : pointA).xz, uCentre) / uExtent;   // on screen, and on the ground
      vF = uFadeOn * max(clamp((r - uFade0) / (1.0 - uFade0), 0.0, 1.0), smoothstep(0.4, 0.95, rw));
      gl_Position = vec4(s / (uRes * 0.5) * c.w, c.z, c.w);
    }`;
  const LINE_FRAG = `
    uniform vec3 uColor, uBg; uniform float uWidth, uOpacity, uFadeOn; varying vec2 vD; varying float vLen, vF;
    void main(){
      float w = uWidth * 0.5;
      float a = (1.0 - smoothstep(w - 0.5, w + 0.5, abs(vD.x))) * (1.0 - smoothstep(w - 0.5, w + 0.5, -vD.y)) * (1.0 - smoothstep(w - 0.5, w + 0.5, vD.y - vLen));
      if (a < 0.003) discard;
      gl_FragColor = vec4(mix(uColor, uBg, uFadeOn * (0.55 + 0.45 * vF)), a * uOpacity);
    }`;

  function build(host, CONFIG, gltf) {
    const THREE = global.THREE, D2R = Math.PI / 180;
    const RAW = {}; for (const k of COLOR_KEYS) { RAW[k] = CONFIG[k]; CONFIG[k] = resolveColor(host, CONFIG[k]); }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.background = CONFIG.background; host.style.overflow = 'hidden';
    const renderer = new THREE.WebGLRenderer({ antialias: CONFIG.msaa !== false, alpha: true });   // the faces, ribs and grid get multisampling; the lines are supersampled in their own pass
    renderer.setClearColor(0x000000, 0); renderer.autoClear = false;
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    host.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextrestored', () => { sized.PR = 0; frame(); dirty = true; wake(); });   // a lost context (a phone short of memory) comes back drawn
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(+CONFIG.fov || 30, 1, 0.05, 200);
    const pivot = new THREE.Group(), rig = new THREE.Group(); pivot.add(rig); scene.add(pivot);   // the drone rides in the rig, pivoted on its centre: the tilt turns the pivot, and eases away over the approach
    const faceMat = new THREE.MeshBasicMaterial({ color: CONFIG.face, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const lineMaterial = (color, fade, opacity) => new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uFocus: { value: new THREE.Vector2() }, uHalf: { value: 1 }, uWidth: { value: 1 }, uNear: { value: 0.05 }, uFade0: { value: 0.3 }, uFadeOn: { value: fade ? 1 : 0 }, uCentre: { value: new THREE.Vector2() }, uExtent: { value: 1 }, uColor: { value: new THREE.Color(color) }, uBg: { value: new THREE.Color(CONFIG.face) }, uOpacity: { value: opacity } } });
    const ribMat = lineMaterial(CONFIG.primary, false, +CONFIG.ribOpacity), gridMat = lineMaterial(CONFIG.gridColor, true, 1), lineMats = [ribMat, gridMat];
    const lineMesh = (segs, mat) => {   // segs: ax ay az bx by bz per segment; four corners each (A-, A+, B-, B+)
      const n = segs.length / 6, A = new Float32Array(n * 12), B = new Float32Array(n * 12), C = new Float32Array(n * 8), idx = [];
      for (let i = 0; i < n; i++) { for (let k = 0; k < 4; k++) { const v = i * 4 + k; for (let j = 0; j < 3; j++) { A[v * 3 + j] = segs[i * 6 + j]; B[v * 3 + j] = segs[i * 6 + 3 + j]; } C[v * 2] = k >> 1; C[v * 2 + 1] = (k & 1) ? 1 : -1; } const b = i * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(A, 3)); g.setAttribute('pointA', new THREE.BufferAttribute(A, 3)); g.setAttribute('pointB', new THREE.BufferAttribute(B, 3)); g.setAttribute('corner', new THREE.BufferAttribute(C, 2)); g.setIndex(idx);
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.userData.isLines = true; return m; };
    const inspect = CONFIG.inspect ? Object.assign({}, INSPECT, CONFIG.inspect) : null;   // the inspection's options (used from the build on: the motor copies are geometry)
    // part ids, by kind: the rest of the drone counts up from 1, the flag is 110; from the top down, once the model is read: the
    // focused motor's parts from 255, then the other motors', then the motor copies, down to 154 (the edge pass colours ids
    // above 153 primary, and fades each kind on its own; the bands' bounds go to it as uniforms)
    const solids = []; const ids = { rest: 0, focusMin: 255, motorMin: 255, copyTop: 254 };
    const solid = (g, kind, fixedId) => { const m = new THREE.Mesh(g, faceMat); kind = kind === true ? 'motor' : kind || (fixedId ? 'flag' : 'rest'); const id = fixedId || (kind === 'rest' ? ++ids.rest : 0);
      m.userData.kind = kind; m.userData.idMat = new THREE.ShaderMaterial({ vertexShader: ID_VERT, fragmentShader: ID_FRAG, uniforms: { uId: { value: id / 255 } } }); solids.push(m); (kind === 'flag' ? scene : rig).add(m); return m; };
    // the edge pass's target and quad
    const isGL2 = renderer.capabilities.isWebGL2;
    const depthTex = new THREE.DepthTexture(1, 1); depthTex.type = isGL2 ? THREE.UnsignedIntType : THREE.UnsignedShortType;
    const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depthTex, depthBuffer: true, stencilBuffer: false });
    const edgeMat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: EDGE_FRAG,
      uniforms: { tN: { value: rt.texture }, tD: { value: depthTex }, uRes: { value: new THREE.Vector2(1, 1) }, uTile: { value: new THREE.Vector4(0, 0, 1, 1) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uWidth: { value: 1 }, uDepthT: { value: +CONFIG.depthEdge || 0.012 }, uNormT: { value: +CONFIG.normalEdge || 0.25 }, uFlagA: { value: 1 }, uDroneA: { value: 1 }, uCopyA: { value: 0 }, uCopyP: { value: 1 }, uCopyN: { value: 1 }, uFocusMin: { value: 1 }, uMotorMin: { value: 1 }, uCopyTop: { value: 254 }, uNormTM: { value: CONFIG.normalEdgeMotor == null ? (+CONFIG.normalEdge || 0.25) : +CONFIG.normalEdgeMotor }, uC1: { value: new THREE.Color(CONFIG.primary) }, uC2: { value: new THREE.Color(CONFIG.secondary) } } });
    // the quad the lines are drawn with covers one tile of the canvas at a time
    const quadGeo = new THREE.BufferGeometry(); quadGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3)); quadGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); const quad = new THREE.Mesh(quadGeo, edgeMat); quad.frustumCulled = false; quadScene.add(quad);
    const setQuad = (x0, y0, x1, y1) => { const p = quadGeo.attributes.position; p.setXYZ(0, x0, y0, 0); p.setXYZ(1, x1, y0, 0); p.setXYZ(2, x1, y1, 0); p.setXYZ(3, x0, y1, 0); p.needsUpdate = true; };   // NDC corners

    // ---- the model, baked into world space; parts are told apart by name (the loader writes spaces as underscores)
    const key = String(CONFIG.focus || 'FR').trim(), keyBase = key.replace(/ 2$/, '');
    // which part of which motor a mesh is. Two namings are read: parts named for their position ("Motor Base FL", "Arm FR",
    // "Propeller BL 2" for the lower ring of a coaxial pair), and parts grouped under an "Arm FL".. node, named as the
    // engineer's export names them: the bell (the housing), base, shaft and flux ring of an "HWI-…" motor, its bell
    // fillers, the propeller's blades, hub, washer and nut, and the arm's own pieces
    const partOf = o => { const name = o.name || '', m = /^(Motor[ _]Base|Motor[ _]Coil|Motor[ _]Cap|Motor[ _]Shaft|Prop[ _]Hub|Propeller|Arm)[ _](FR|FL|BR|BL)(?:[ _](2))?$/.exec(name); if (m) return { part: m[1].replace('_', ' '), pos: m[2] + (m[3] ? ' 2' : '') };
      let pos = null; for (let p = o.parent; p; p = p.parent) { const a = /^Arm[ _](FR|FL|BR|BL)$/.exec(p.name || ''); if (a) { pos = a[1]; break; } } if (!pos) return null;
      const part = /^Bell[ _]Filler/i.test(name) ? 'Motor Cap' : /BELL/i.test(name) ? 'Motor Base' : /SHAFT/i.test(name) ? 'Motor Shaft' : /FLUX/i.test(name) ? 'Motor Ring' : /BASE/i.test(name) ? 'Motor Coil' : /^Prop[ _]Blade/i.test(name) ? 'Propeller' : /^Prop[ _]/i.test(name) ? 'Prop Hub' : 'Arm';
      return { part, pos }; };
    const skip = name => /^mesh_\d+_instance/.test(name || '');
    const flipWinding = g => { if (g.index) { const a = g.index.array; for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; } else { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i + 2 < p.count; i += 3) for (const at of [p, n]) { if (!at) continue; const x = at.getX(i + 1), y = at.getY(i + 1), z = at.getZ(i + 1); at.setXYZ(i + 1, at.getX(i + 2), at.getY(i + 2), at.getZ(i + 2)); at.setXYZ(i + 2, x, y, z); at.needsUpdate = true; } } };
    gltf.scene.updateMatrixWorld(true);
    const motorBox = new THREE.Box3(), armBox = new THREE.Box3(), all = new THREE.Box3(); const coils = {};   // per motor: its housing (the Motor Base): box, centre, radius and the straight wall's y-range, for the ribs and rims
    const hubs = {}, propInfo = {}, props = [], modelProps = [], propPhase = {};
    const meshes = []; gltf.scene.traverse(o => { if (o.isMesh && !skip(o.name)) meshes.push(o); });
    // the tilt: the whole drone pitched about its centre (the propellers are turned with it separately, so they still spin on their own axes)
    const tiltRad = (+CONFIG.tilt || 0) * D2R;   // the rig is pivoted on the drone's centre once the parts are read (below); the tilt is set on it each frame (place)
    // a motor's mount: a "filler" that sits below the motor's base is the arm's mount, not the motor — it goes with the arm
    const baseBottom = {}; for (const o of meshes) { const info = partOf(o); if (info && info.part === 'Motor Coil') { const b = (o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox)).clone().applyMatrix4(o.matrixWorld); baseBottom[info.pos] = Math.min(baseBottom[info.pos] == null ? Infinity : baseBottom[info.pos], b.min.y); } }
    // the skids (the long tubes), so the struts can be carried down to them
    const skids = []; for (const o of meshes) if (/^Skid[ _](Left|Right)$/.test(o.name)) { const b = o.geometry.clone().applyMatrix4(o.matrixWorld); b.computeBoundingBox(); skids.push(b.boundingBox); }
    const extendLeg = (o, g) => {   // the strut is a cylinder along its local y; shear it so its lower end lands inside the nearest skid
      if (!/^Leg[ _]/.test(o.name) || !skids.length) return; const lb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
      let A = new THREE.Vector3(0, lb.max.y, 0).applyMatrix4(o.matrixWorld), B = new THREE.Vector3(0, lb.min.y, 0).applyMatrix4(o.matrixWorld); if (B.y > A.y) [A, B] = [B, A];
      const skid = skids.reduce((best, b) => { const c = b.getCenter(new THREE.Vector3()); const d = Math.abs(c.x - B.x); return d < best.d ? { d, b, c } : best; }, { d: Infinity }); if (!skid.b) return;
      const r = (skid.b.max.y - skid.b.min.y) / 2, Bn = new THREE.Vector3(skid.c.x, skid.c.y + r * 0.5, B.z);   // land a little above the tube's axis, inside it
      const u = B.clone().sub(A), L = u.length(); if (L < 1e-6) return; u.divideScalar(L); const shift = Bn.sub(B);
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const t = v.clone().sub(A).dot(u) / L; v.addScaledVector(shift, t); p.setXYZ(i, v.x, v.y, v.z); }
      p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();   // the sphere too: the tiled pass culls by it
    };
    let tris = 0;
    for (const o of meshes) {
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (o.matrixWorld.determinant() < 0) flipWinding(g); extendLeg(o, g);   // a mirrored copy (a negative scale in its transform) bakes inside-out: its triangles are turned back round if (!g.attributes.normal) g.computeVertexNormals(); g.computeBoundingBox();
      const info = partOf(o); if (info && info.part === 'Motor Cap' && baseBottom[info.pos] != null && (g.boundingBox.min.y + g.boundingBox.max.y) / 2 < baseBottom[info.pos]) info.part = 'Arm';   // the mount under the base
      const isProp = !!(info && (info.part === 'Propeller' || info.part === 'Prop Hub')); if (!isProp || CONFIG.props === 'model') all.union(g.boundingBox);
      const isFocus = !!(info && info.pos === key), inFocus = !!(info && (info.pos === keyBase || info.pos === keyBase + ' 2'));   // the ring named, for the framing; the whole stack at that position (both rings of the coaxial pair), for what stays and what is copied
      const mine = !!(info && /^Motor/.test(info.part));
      if (mine) { if (isFocus) motorBox.union(g.boundingBox);
        if (info.part === 'Motor Base') {   // the housing: its widest radius, and the y-range of the straight wall at that radius (inside any fillets at the ends)
          const b = g.boundingBox, c = new THREE.Vector3(); b.getCenter(c); const p = g.attributes.position; let r = 0; for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i) - c.x, p.getZ(i) - c.z));
          let y0 = Infinity, y1 = -Infinity; for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - c.x, p.getZ(i) - c.z) >= r * 0.995) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
          if (!(y1 > y0)) { y0 = b.min.y; y1 = b.max.y; } coils[info.pos] = { box: b.clone(), c, r, y0, y1 }; } }
      if (isFocus && info.part === 'Arm') armBox.union(g.boundingBox);
      if (info && info.part === 'Prop Hub') hubs[info.pos] = hubs[info.pos] ? hubs[info.pos].union(g.boundingBox) : g.boundingBox.clone();
      if (info && info.part === 'Propeller') { propInfo[info.pos] = g.boundingBox.clone(); if (CONFIG.props !== 'model') continue; }
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      const m = solid(g, mine ? (inFocus ? 'focus' : 'motor') : 'rest');
      if (info && CONFIG.props === 'model' && (info.part === 'Propeller' || info.part === 'Prop Hub')) modelProps.push({ m, pos: info.pos, part: info.part });   // the model's own propeller: it turns, about its hub
    }
    { const c0 = all.getCenter(new THREE.Vector3()); pivot.position.copy(c0); rig.position.copy(c0).negate(); }   // the rig turns about the drone's centre
    // the model's own propellers turn about their hubs: each part's geometry is moved so the hub's axis is its origin, and the mesh put back there
    for (const { m, pos } of modelProps) { const hb = hubs[pos] || propInfo[pos]; if (!hb) continue; const c = new THREE.Vector3(); hb.getCenter(c);
      m.geometry.translate(-c.x, 0, -c.z); m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere(); m.position.set(c.x, 0, c.z);
      let pr = props.find(p => p.mesh === m); if (!pr) { const ring = / 2$/.test(pos) ? 1 : 0, quad = /^(FR|BL)/.test(pos) ? 1 : -1; props.push({ mesh: m, pos, dir: quad * (ring ? -1 : 1), phase: propPhase[pos] == null ? (propPhase[pos] = CONFIG.propPhase == null ? Math.random() * Math.PI * 2 : +CONFIG.propPhase * D2R) : propPhase[pos] }); } }
    // a shared starting angle means the blades themselves line up: each arm is a turned copy in the model, so each propeller's blade
    // points its own way to begin with — its tip's heading (the vertex furthest from the hub) is measured, and the turn that brings
    // it to `propPhase` is that propeller's phase
    if (CONFIG.propPhase != null) { const tipAz = {}; for (const e of modelProps) if (e.part === 'Propeller') { const q = e.m.geometry.attributes.position; let best = -1, bx = 0, bz = 1; for (let i = 0; i < q.count; i++) { const x = q.getX(i), z = q.getZ(i), r = x * x + z * z; if (r > best) { best = r; bx = x; bz = z; } } tipAz[e.pos] = Math.atan2(bx, bz); }
      for (const pr of props) if (pr.pos != null && tipAz[pr.pos] != null) pr.phase = +CONFIG.propPhase * D2R - tipAz[pr.pos]; }
    { let top = 255; const setId = (m, id) => { m.userData.idMat.uniforms.uId.value = id / 255; };   // the ids from the top, now the parts are known
      for (const m of solids) if (m.userData.kind === 'focus') setId(m, top--); ids.focusMin = top + 1;
      for (const m of solids) if (m.userData.kind === 'motor') setId(m, top--); ids.motorMin = top + 1; ids.copyTop = top;
      edgeMat.uniforms.uFocusMin.value = (ids.focusMin - 0.5) / 255; edgeMat.uniforms.uMotorMin.value = (ids.motorMin - 0.5) / 255; edgeMat.uniforms.uCopyTop.value = ids.copyTop; }
    if (CONFIG.props !== 'model') for (const pos of Object.keys(propInfo)) {
      const pb = propInfo[pos], hb = hubs[pos] || pb, c = new THREE.Vector3(); hb.getCenter(c);
      const R = Math.max(pb.max.x - pb.min.x, pb.max.z - pb.min.z) / 2, r0 = Math.max(hb.max.x - hb.min.x, hb.max.z - hb.min.z) / 2 * 0.9, y = (pb.min.y + pb.max.y) / 2;
      const g = propellerGeometry(THREE, R, r0, Math.max(2, CONFIG.blades | 0), +CONFIG.bladeChord || 0.2, +CONFIG.bladeTwist || 22); tris += g.index.count / 3;
      const m = solid(g, false); m.position.set(c.x, y, c.z);
      const ring = / 2$/.test(pos) ? 1 : 0, quad = /^(FR|BL)/.test(pos) ? 1 : -1;
      props.push({ mesh: m, dir: quad * (ring ? -1 : 1), phase: CONFIG.propPhase == null ? Math.random() * Math.PI * 2 : +CONFIG.propPhase * D2R });
    }
    // the motors' ribbing: vertical lines round each one's tallest casing part, just off its surface
    // the housings' ribbing: vertical lines along each one's straight wall, just off its surface, and a rim line round
    // each end of the wall (the model rounds those edges, so the edge pass finds no crease there)
    const droneRibMat = lineMaterial(CONFIG.primary, false, +CONFIG.ribOpacity); lineMats.push(droneRibMat);
    const ribMats = new Set([ribMat, droneRibMat]); let droneRibs = null, focusRibs = [];
    if (CONFIG.ribs > 0) { const N = 96;
      for (const pos of Object.keys(coils)) { const { c, y0, y1 } = coils[pos], r = coils[pos].r * 1.004, a = [];
        for (let k = 0; k < CONFIG.ribs; k++) { const t = (k + 0.5) / CONFIG.ribs * Math.PI * 2, x = c.x + Math.cos(t) * r, z = c.z + Math.sin(t) * r; a.push(x, y0, z, x, y1, z); }
        for (const y of [y0, y1]) for (let k = 0; k < N; k++) { const t0 = k / N * Math.PI * 2, t1 = (k + 1) / N * Math.PI * 2; a.push(c.x + Math.cos(t0) * r, y, c.z + Math.sin(t0) * r, c.x + Math.cos(t1) * r, y, c.z + Math.sin(t1) * r); }
        if (pos === key) { focusRibs = a; rig.add(lineMesh(a, ribMat)); } else { droneRibs = droneRibs || []; droneRibs.push(...a); } }
      if (droneRibs) { droneRibs = lineMesh(droneRibs, droneRibMat); rig.add(droneRibs); }
    }
    // ---- the motor copies: the focused motor's parts (and ribs) repeated behind it along the profile pose's line of sight,
    // so from the profile they hide behind it and the last pose, lifting off that line, reveals the row
    const copies = { meshes: [], ribs: [], mats: [], n: 0, shown: false };
    if (inspect && inspect.copies && +inspect.copies.count > 0 && coils[key]) {
      const C = inspect.copies, parts = solids.filter(m => m.userData.kind === 'focus'), P = Math.max(1, parts.length), n = Math.max(0, Math.min(Math.floor((ids.copyTop - 153) / P), C.count | 0));   // the ids from copyTop down to 154 hold the copies: one band of P per copy
      const Pz = inspect.poses[1] || {}, az = (C.azimuth == null ? (Pz.azimuth == null ? -90 : +Pz.azimuth) : +C.azimuth) * D2R;
      const step = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az)).multiplyScalar((+C.gap || 1.3) * 2 * coils[key].r);   // behind: away from where the camera sits at that pose
      copies.n = n; edgeMat.uniforms.uCopyP.value = P; edgeMat.uniforms.uCopyN.value = Math.max(1, n);
      for (let k = 1; k <= n; k++) { const off = step.clone().multiplyScalar(k);
        parts.forEach((m, j) => { const g = m.geometry.clone().translate(off.x, off.y, off.z); const c = solid(g, 'copy', ids.copyTop - (k - 1) * P - j); c.visible = false; copies.meshes.push(c); tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3; });
        if (focusRibs.length) { const a = new Array(focusRibs.length); for (let i = 0; i < focusRibs.length; i += 3) { a[i] = focusRibs[i] + off.x; a[i + 1] = focusRibs[i + 1] + off.y; a[i + 2] = focusRibs[i + 2] + off.z; }
          const mat = lineMaterial(CONFIG.primary, false, 0); lineMats.push(mat); ribMats.add(mat); const mesh = lineMesh(a, mat); mesh.visible = false; rig.add(mesh); copies.ribs.push(mesh); copies.mats.push(mat); } }
    }
    // ---- the flag: a cloth hung from its top edge behind the drone, its faces occluding like the rest, the stripes,
    // canton and stars drawn as lines on the surface; every point is displaced each frame by a slow, soft wave
    let flag = null, flagReach = 0;   // how far the scene extends behind the drone because of the flag, for the far plane
    if (CONFIG.flag) {
      const cA = all.getCenter(new THREE.Vector3()), W = +CONFIG.flagWidth || 37, H = W / 1.9, X0 = cA.x + (+CONFIG.flagX || 0) - W / 2, Y0 = cA.y + (+CONFIG.flagBottom || 0), Z0 = cA.z + (+CONFIG.flagZ || -22), A = H * (+CONFIG.flagSway || 0.04);   // placed about the drone's centre
      flagReach = Math.abs(Z0) + Math.hypot(W, H);
      const NX = 48, NY = 26, cloth = new THREE.PlaneGeometry(W, H, NX, NY); cloth.translate(X0 + W / 2, Y0 + H / 2, Z0);
      const clothBase = Float32Array.from(cloth.attributes.position.array); const clothMesh = solid(cloth, false, 110); clothMesh.frustumCulled = false;   // id 110: the middle range the edge pass fades tris += cloth.index.count / 3;
      const seg = [], uv = [];   // the lines: base points as (u, v) on the flag, u from the hoist, v from the bottom
      const add = (u0, v0, u1, v1) => { seg.push(0, 0, 0, 0, 0, 0); uv.push(u0, v0, u1, v1); };
      const poly = (pts, n) => { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; for (let k = 0; k < n; k++) add(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n); } };
      const cw = 0.76 * H, ch = 7 / 13 * H;   // the canton
      for (let i = 1; i < 13; i++) { const v = H * i / 13, u0 = v > H - ch ? cw : 0; for (let k = 0; k < NX; k++) { const a = u0 + (W - u0) * k / NX, b = u0 + (W - u0) * (k + 1) / NX; add(a, v, b, v); } }
      for (let k = 0; k < 20; k++) add(cw * k / 20, H - ch, cw * (k + 1) / 20, H - ch);   // the canton's bottom edge…
      for (let k = 0; k < 12; k++) add(cw, H - ch + ch * k / 12, cw, H - ch + ch * (k + 1) / 12);   // … and its stripe-side edge
      poly([[0, 0], [W, 0], [W, H], [0, H]], 24);   // the outer edge
      const rs = 0.0308 * H, r2 = rs * 0.382; for (let row = 0; row < 9; row++) { const n = row % 2 ? 5 : 6; for (let col = 0; col < n; col++) {   // fifty stars, five points each
        const cx = cw * (row % 2 ? (col + 1) / 6 : (col + 0.5) / 6) , cy = H - ch + ch * (9 - row - 0.5) / 9, pts = []; for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? r2 : rs; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } poly(pts, 1); } }
      const flagMat = lineMaterial(CONFIG.secondary, false, +CONFIG.flagOpacity || 0.85); lineMats.push(flagMat); const lines = lineMesh(seg, flagMat); scene.add(lines);
      const wave = (u, v, t, out) => {   // the displacement of the point (u, v) at time t: fixed along the top edge, growing toward the bottom, slow crossing waves, and a lazy sideways sway
        const hang = 1 - v / H, w = hang * hang, ph = t * Math.PI * 2 / (+CONFIG.flagSeconds || 16);
        out[0] = A * 0.3 * Math.sin(ph * 0.37 + v / H) * hang; out[1] = 0;
        out[2] = A * (0.62 * Math.sin(u / W * 4.2 - ph + v / H * 1.3) + 0.38 * Math.sin(u / W * 7.5 + ph * 0.61 + 1.7)) * (0.15 + 0.85 * w) * (0.55 + 0.45 * u / W);
      };
      const d = [0, 0, 0];
      flag = { mat: flagMat, objects: [clothMesh, lines], shown: true, update(t) {
        const p = cloth.attributes.position; for (let i = 0; i < p.count; i++) { const bx = clothBase[i * 3], by = clothBase[i * 3 + 1]; wave(bx - X0, by - Y0, t, d); p.setXYZ(i, bx + d[0], by + d[1], clothBase[i * 3 + 2] + d[2]); } p.needsUpdate = true; cloth.computeVertexNormals();
        const A_ = lines.geometry.attributes.pointA, B_ = lines.geometry.attributes.pointB, P_ = lines.geometry.attributes.position, n = uv.length / 4;
        for (let i = 0; i < n; i++) { const u0 = uv[i * 4], v0 = uv[i * 4 + 1], u1 = uv[i * 4 + 2], v1 = uv[i * 4 + 3];
          wave(u0, v0, t, d); const ax = X0 + u0 + d[0], ay = Y0 + v0, az = Z0 + d[2] + 0.04; wave(u1, v1, t, d); const bx = X0 + u1 + d[0], by = Y0 + v1, bz = Z0 + d[2] + 0.04;
          for (let k = 0; k < 4; k++) { const j = i * 4 + k; A_.setXYZ(j, ax, ay, az); B_.setXYZ(j, bx, by, bz); P_.setXYZ(j, ax, ay, az); } }
        A_.needsUpdate = B_.needsUpdate = P_.needsUpdate = true;
      } };
      flag.update(0);
    }
    // ---- the two ends of the path
    // the camera aims at the centre of the ribbed casing (the motor's tallest part), not of the whole motor with its shaft, so the casing sits where `point` says
    const target = new THREE.Vector3(); (coils[key] ? coils[key].box : motorBox).getCenter(target);
    const motorH = Math.max(1e-3, motorBox.max.y - motorBox.min.y);
    const armDir = new THREE.Vector3(); (armBox.isEmpty() ? all : armBox).getCenter(armDir); armDir.sub(target); armDir.y = 0; if (armDir.lengthSq() < 1e-9) armDir.set(1, 0, 0); armDir.normalize();
    const azimuth = () => CONFIG.azimuth === 'auto' || CONFIG.azimuth === undefined ? Math.atan2(armDir.x, armDir.z) / D2R - 90 + (+CONFIG.turn || 0) : +CONFIG.azimuth;
    const azimuth0 = () => CONFIG.startAzimuth === 'auto' || CONFIG.startAzimuth === undefined ? azimuth() : +CONFIG.startAzimuth;
    // the opening distance: the drone's box, seen from the start heading, fitted to the frame with the margin
    const fitDistance = (azDeg, elDeg, fov, a) => { const az = azDeg * D2R, el = elDeg * D2R; const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      const cam = new THREE.PerspectiveCamera(fov / D2R, a, 0.01, 1000); cam.position.copy(droneC).add(dir); cam.lookAt(droneC); cam.updateMatrixWorld(); const inv = cam.matrixWorldInverse;
      let need = 0; for (const x of [all.min.x, all.max.x]) for (const y of [all.min.y, all.max.y]) for (const z of [all.min.z, all.max.z]) { const q = new THREE.Vector3(x, y, z).applyMatrix4(inv); const depth = -q.z;   // camera space: the point's offset from the target's depth
        need = Math.max(need, Math.abs(q.y) / Math.tan(fov / 2) + depth, Math.abs(q.x) / (Math.tan(fov / 2) * a) + depth); }   // the distance at which this corner just fits
      return need; };
    const droneC = new THREE.Vector3(); all.getCenter(droneC); const droneR = all.getSize(new THREE.Vector3()).length() / 2;
    // ---- the floor grid: centred under the drone, one segment per cell edge so its fade (by each point's distance
    // from the focus on screen and from the centre on the ground, in the shader) follows the frame and never shows an edge
    let grid = null;
    function buildGrid() {
      if (grid) { scene.remove(grid); grid.geometry.dispose(); grid = null; } const cell = motorH * (+CONFIG.grid || 0); if (!(cell > 0)) return;
      const y = all.min.y - (+CONFIG.floor || 0) * motorH, n = Math.ceil(motorH * (+CONFIG.gridExtent || 24) / cell), pos = [], cx = droneC.x, cz = droneC.z;
      for (let i = -n; i <= n; i++) { const o = i * cell; for (let j = -n; j < n; j++) { const a = j * cell, b = (j + 1) * cell; pos.push(cx + o, y, cz + a, cx + o, y, cz + b, cx + a, y, cz + o, cx + b, y, cz + o); } }
      gridMat.uniforms.uCentre.value.set(cx, cz); gridMat.uniforms.uExtent.value = n * cell;
      grid = lineMesh(pos, gridMat); scene.add(grid); fadeGrid();
    }
    let motorMix = 1;   // 0 = the motors in the secondary colour, 1 = in the primary
    function motorColor(e) {
      const w = CONFIG.primaryIn; motorMix = Array.isArray(w) && w.length === 2 && w[1] > w[0] ? Math.min(1, Math.max(0, (e - w[0]) / (w[1] - w[0]))) : 1;
      const c = new THREE.Color(CONFIG.secondary).lerp(new THREE.Color(CONFIG.primary), motorMix); for (const m of ribMats) m.uniforms.uColor.value.copy(c); edgeMat.uniforms.uC1.value.copy(c);
    }
    function fadeGrid() {   // where the focus sits on screen, and how far out the fade starts
      const t = new THREE.Vector3().copy(camTarget).project(camera); gridMat.uniforms.uFocus.value.set(t.x, t.y); gridMat.uniforms.uFade0.value = Math.max(0, Math.min(0.95, +CONFIG.gridFade || 0.3));
    }
    // ---- the path: spherical about a target that slides from the drone's centre to the motor, distance in log
    // space, heading and height easing between the two ends, the framing point too — one camera, really moving
    // pos: the approach and the inspection as one scroll value (0-2), damped as one so the hand-over never jumps
    let w = 1, h = 1, progress = 0, progressTarget = 0, insp = 0, inspTarget = 0, pos = 0, posTarget = 0, shownPos = -1, arrived = false, shownDroneA = -1, shownCopyA = -1, droneOn = true; const camTarget = droneC.clone(); const T = { nx: 1, ny: 1, w: 1, h: 1, g: 3, PR: 1, S: 1, W: 1, H: 1 };   // the edge pass's tiling
    const trackEl = (() => { const t = CONFIG.track; if (!t) return null; if (t.nodeType) return t; if (typeof t === 'string' && t.startsWith('closest:')) return host.closest(t.slice(8)); return document.querySelector(t); })();
    const endEl = trackEl && CONFIG.runEnd ? (typeof CONFIG.runEnd === 'string' ? trackEl.querySelector(CONFIG.runEnd) : CONFIG.runEnd) : null;
    const readProgress = () => { if (!trackEl) return 1; const r = trackEl.getBoundingClientRect();
      if (endEl) { const er = endEl.getBoundingClientRect(), hr = host.getBoundingClientRect(); return Math.min(1, Math.max(0, 1 - (er.top - hr.top) / Math.max(1, er.top - r.top))); }   // done when the end element reaches the canvas's top
      const run = Math.max(1, r.height - h); return Math.min(1, Math.max(0, -r.top / run)); };
    // the inspection's progress: how far the end section has scrolled past the canvas's top, over its extra height
    const readInspect = () => { if (!inspect || !endEl) return 0; const er = endEl.getBoundingClientRect(), hr = host.getBoundingClientRect(); return Math.min(1, Math.max(0, (hr.top - er.top) / Math.max(1, er.height - hr.height))); };
    // a CSS custom property on the host and the track, in steps of 0.001 and only when it changes: each write invalidates the track's
    // styles, and on phones a style change round a sticky element can make it re-sync mid-scroll — so not up to `breakpoint`
    // (a caller can pass narrowToo to write one anyway, in steps of 0.02)
    const varLast = {}; const setVar = (name, v, dp, narrowToo) => { if (!name) return; const narrow = isNarrow(); if (narrow && !narrowToo) return; const s = narrow ? (Math.round(v * 50) / 50).toFixed(2) : v.toFixed(dp || 2); if (varLast[name] === s) return; varLast[name] = s; host.style.setProperty(name, s); if (trackEl) trackEl.style.setProperty(name, s); };
    let narrowMQ = null, narrowBp = 0;   // one MediaQueryList, kept (it is read on every scroll), remade only if `breakpoint` changes
    const isNarrow = () => { const bp = +CONFIG.breakpoint || 991; if (!global.matchMedia) return false; if (bp !== narrowBp) { narrowBp = bp; narrowMQ = global.matchMedia('(max-width: ' + bp + 'px)'); } return narrowMQ.matches; };
    const endPoint = () => (isNarrow() && CONFIG.pointNarrow) || CONFIG.point || { x: 0.5, y: 0.5 };
    const zoomDist = z => motorH / (2 * Math.tan((+CONFIG.fov || 30) * D2R / 2) * Math.max(0.05, z || 0.36));   // a share of the full canvas's height, docked or not
    // the camera at a heading (radians) and distance from camTarget, with the target at (px, py) of the frame
    function aim(az, el, dist, px, py) {
      const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      camera.up.set(-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el));   // the roll stays continuous up to straight overhead
      camera.position.copy(camTarget).add(dir.multiplyScalar(dist)); camera.lookAt(camTarget);
      camera.near = Math.max(0.02, dist * 0.05); camera.far = dist + droneR * 4 + flagReach; edgeMat.uniforms.uNear.value = camera.near; edgeMat.uniforms.uFar.value = camera.far; for (const m of lineMats) m.uniforms.uNear.value = camera.near;
      // the projection is always the full canvas's: docking only crops it to the band, so neither the view nor the perspective changes
      // (the narrow point wants to sit in the band's middle, y about dock / 2)
      const F = fullH(); camera.aspect = w / F; camera.setViewOffset(w, F, (0.5 - px) * w, (0.5 - py) * F, w, h); camera.updateProjectionMatrix(); camera.updateMatrixWorld();   // framed in the band (f) when docked; the canvas shows its top h
    }
    // ---- the inspection: the camera orbits the motor through the poses, on one smooth curve, as the end section scrolls
    let hot = null;   // the hotspots' overlay: { svg, items: [{ g, dot, ring, path, label }] }
    function buildHotspots() {
      if (!inspect || !inspect.callouts) return; const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
      Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' });
      const items = inspect.poses.map(p => { const g = document.createElementNS(NS, 'g'); g.style.opacity = '0';
        const d = +inspect.dot || 6, dot = document.createElementNS(NS, 'rect'); dot.setAttribute('width', d); dot.setAttribute('height', d);   // the square at the leader's end, as the map's county marker
        const path = document.createElementNS(NS, 'line'); path.setAttribute('stroke-width', '1');
        g.append(path, dot); svg.appendChild(g);
        const label = document.createElement('div'); if (inspect.hotspotClass) label.className = inspect.hotspotClass; label.textContent = p.label || '';
        Object.assign(label.style, { position: 'absolute', left: '0', top: '0', whiteSpace: 'nowrap', pointerEvents: 'none', opacity: '0', margin: '0' }); host.appendChild(label);
        return { g, dot, path, label }; });
      host.appendChild(svg); hot = { svg, items };
    }
    const anchorOf = p => { const hs = coils[key], a = p.anchor || {}; if (!hs) return target.clone(); const ang = (+a.angle || 0) * D2R, r = hs.r * (a.radius == null ? 1 : +a.radius);
      return new THREE.Vector3(hs.c.x + Math.sin(ang) * r, hs.y0 + (a.height == null ? 0.5 : +a.height) * (hs.y1 - hs.y0), hs.c.z + Math.cos(ang) * r); };
    const rowEls = () => { if (!inspect || !inspect.rows) return []; const out = []; document.querySelectorAll(inspect.rows).forEach(el => { const n = parseInt(el.getAttribute('data-inspect'), 10); if (n > 0) out.push({ el, n }); });
      if (inspect.click) for (const r of out) { const go = () => scrollToRow(r.n); r.el.addEventListener('click', go); r.el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); }
      return out; };
    // scroll the page to the middle of a row's window (where the camera passes through its pose)
    function scrollToRow(n) { if (stepped) { const r = rows && rows.find(x => x.n === n); if (r) global.scrollTo({ top: Math.round((global.scrollY || 0) + r.el.getBoundingClientRect().top - (global.innerHeight || 0) * ((+inspect.line || 0.68) - 0.06)), behavior: reduced ? 'auto' : 'smooth' }); return; }
      const w = inspect.windows[n - 1]; if (!w || !endEl) return; const q = (w[0] + w[1]) / 2, er = endEl.getBoundingClientRect(), hr = host.getBoundingClientRect();
      global.scrollTo({ top: Math.round((global.scrollY || 0) + er.top - hr.top + q * Math.max(0, er.height - hr.height)), behavior: 'smooth' }); }
    let rows = null, activeRow = -1;
    // ---- stepped: the inspection as discrete states (0 = the arrival, k = pose k), each one tweened to when its row
    // crosses the line; the approach before it stays on the scroll. Nothing here runs per scroll event or per frame at rest
    let stepped = false, step = 0, rowStep = 0, gate = false, sq = 0, stepU = 1, tw = null, liveApproach = true, rowIOs = [], endIO = null;
    let fq = 0, fFills = [];   // follow: 'scroll' — the camera's target on the path, and the rows' bars, read from the rows' places
    const follow = () => inspect && inspect.follow === 'scroll';
    let dk = 0, docked = false, dockBg = '';   // the dock: 0 = the full canvas, 1 = the band; docked = the canvas has been resized to the band
    const hostHeight0 = host.style.height;   // the host's own inline height (e.g. the embed's height:100%), put back when it undocks
    const wantSteps = () => !!(inspect && endEl && global.IntersectionObserver && (inspect.steps === true || (inspect.steps === 'narrow' && isNarrow())));
    const dockF = () => stepped && +inspect.dock > 0 && +inspect.dock < 1 ? +inspect.dock : 1;
    const fullH = () => docked ? h / dockF() : h;                      // the canvas's height undocked
    const curPos = () => stepped ? Math.min(1, pos) + sq : pos;        // the camera's place on the one path: the approach (on the scroll) plus the state's
    const stateQ = k => { if (k <= 0) return 0; const p = inspect.poses[k - 1], wn = inspect.windows[k - 1] || [1, 1]; return Math.min(1, p.at != null ? +p.at : Array.isArray(p.hold) && p.hold.length === 2 ? +p.hold[1] : +wn[1]); };
    const easeIO = u => (1 - Math.cos(Math.PI * u)) / 2;   // sine in-out: its fastest is only 1.57 times its average, so a move never lunges
    // the active row: the last whose top is above the line, or, for one already active, still above line + hysteresis
    function readRows() {
      if (!rows) rows = rowEls(); const vh = global.innerHeight || 1, L = (+inspect.line || 0.68) * vh, Hy = (+inspect.hysteresis || 0) * vh; let s = 0;
      for (const r of rows) { const top = r.el.getBoundingClientRect().top; if (top < L || (r.n <= rowStep && top < L + Hy)) s = Math.max(s, r.n); }
      return Math.min(s, inspect.poses.length);
    }
    // the rows count only once the drone has arrived; the dock follows the arrival too
    function updateGate() {
      const g = progressTarget >= 0.999 ? true : progressTarget < 0.97 ? false : gate; gate = g;
      if (!follow()) { const k = g ? rowStep : 0; if (k !== step) goStep(k); }
      const dg = progressTarget >= 0.999 ? true : progressTarget < 0.995 ? false : dk === 1;   // its own, narrow hysteresis: a resize each way, so not on every pixel
      const d = dg && dockF() < 1 ? 1 : 0; if (d !== dk) setDock(d);
    }
    // follow: 'scroll' — how far past the line each row's top is (the arrival counts as row 0, past when the end element is above the
    // canvas's top), and so where on the path the camera should be: at pose k exactly as row k's top meets the line, in between pro rata.
    // The active row is the last one past the line, and its bar fills on the way to the next (the last one's by the time the band leaves)
    function readFollow() {
      if (!rows) rows = rowEls(); const P = inspect.poses, N = P.length, L = (+inspect.line || 0.68) * (global.innerHeight || 1);
      const a = [gate ? 1 : -1]; if (gate) { const er = endEl.getBoundingClientRect(), hr = host.getBoundingClientRect(); a[0] = hr.top - er.top; }
      for (let k = 1; k <= N; k++) { const r = rows.find(x => x.n === k); a.push(r ? L - r.el.getBoundingClientRect().top : -1e9); }
      let q = 0, st = 0; const fills = new Array(N).fill(0);
      if (gate && a[0] >= 0) { let i = 0; while (i < N && a[i + 1] >= 0) i++; st = i;
        q = i === N ? stateQ(N) : stateQ(i) + (stateQ(i + 1) - stateQ(i)) * Math.min(1, a[i] / Math.max(1, a[i] - a[i + 1]));
        const rem = trackEl ? Math.max(0, trackEl.getBoundingClientRect().bottom - host.getBoundingClientRect().bottom) : 0;   // the scroll left before the band leaves, for the last bar
        for (let k = 1; k <= N; k++) { const D = k < N ? a[k] - a[k + 1] : a[k] + rem; fills[k - 1] = a[k] < 0 ? 0 : Math.min(1, a[k] / Math.max(1, D)); } }
      const moved = q !== fq || st !== step, filled = fills.some((f, i) => Math.abs(f - (fFills[i] || 0)) > 0.004);
      fq = q; step = st; fFills = fills;
      if (moved) { shownPos = -1; wake(); }                     // the camera or the active row changed: a new frame
      else if (filled) writeFills();                            // only the bars: they are the page's CSS, so the canvas is not drawn again
    }
    function writeFills() { if (!rows || !inspect.fillVar) return; const nr = isNarrow(); for (const r of rows) { const v = fFills[r.n - 1] || 0, f = (nr ? Math.round(v * 50) / 50 : v).toFixed(2); if (r.fill !== f) { r.fill = f; r.el.style.setProperty(inspect.fillVar, f); } } }
    function goStep(k) {
      const from = sq, to = stateQ(k), jump = Math.abs(k - step); step = k;
      if (reduced || !(+inspect.tween > 0)) { sq = to; tw = null; stepU = 1; } else { tw = { from, to, t0: performance.now(), dur: +inspect.tween * (1 + (Math.max(1, jump) - 1) / 3) }; stepU = 0; }
      if (rows) for (const r of rows) r.from = r.fill == null ? 0 : +r.fill;   // each row's bar runs from where it is
      shownPos = -1; wake();
    }
    function setDock(d) {
      // at once, both ways: the view is only cropped (the camera never changes), and at the arrival the copy's top meets the band's bottom, so
      // there is nothing under the band to hide and nothing below it to show — the switch is invisible
      if (d === 1) { dk = 1; dockDone(); }
      else { dk = 0; if (docked) { docked = false; host.style.height = hostHeight0; host.style.background = CONFIG.background; dockMark(false); frame(); } }
      shownPos = -1; wake();
    }
    // the dock's move has finished: the canvas becomes the band (drawn at once, so the resize never shows a blank frame) and takes its background
    function dockDone() { if (docked || !stepped) return; docked = true; host.style.height = (dockF() * 100) + '%'; host.style.background = dockBg || CONFIG.background; dockMark(true); frame(); }
    function dockMark(on) { const c = inspect && inspect.dockClass; if (!c) return; host.classList.toggle(c, on); if (trackEl) { trackEl.classList.toggle(c, on); trackEl.querySelectorAll('[data-drone-dock]').forEach(el => el.classList.toggle(c, on)); } }   // and on any [data-drone-dock] in the track, so the page can style it as a combo class
    function enterSteps() {
      stepped = true; pos = Math.min(1, pos); posTarget = progressTarget; rowStep = 0; step = 0; sq = 0; tw = null; stepU = 1; dk = 0; docked = false; gate = false;
      if (!rows) rows = rowEls();
      const onRows = () => { if (follow()) return; const s = readRows(); if (s !== rowStep) { rowStep = s; updateGate(); } };
      const L = +inspect.line || 0.68, Hy = +inspect.hysteresis || 0;   // two lines, so a row crossing either is looked at: the line itself, and the line plus the hysteresis
      for (const m of [L, Math.min(1, L + Hy)]) { const o = new IntersectionObserver(onRows, { rootMargin: '0px 0px ' + (-(1 - m) * 100).toFixed(2) + '% 0px' }); for (const r of rows) o.observe(r.el); rowIOs.push(o); }
      // the approach is live while the end element is on screen or below it; once it is above, the scroll is not read at all
      endIO = new IntersectionObserver(en => { const e = en[en.length - 1], live = e.isIntersecting || e.boundingClientRect.top > 0; if (live !== liveApproach) { liveApproach = live; onScroll(); } }); endIO.observe(endEl);
      // entered mid-way (a load or a resize part-way down): straight to where the page is, with no move
      rowStep = readRows(); liveApproach = true; progressTarget = readProgress(); posTarget = pos = progress = progressTarget; inspTarget = 0;
      gate = progressTarget >= 0.999; step = gate ? rowStep : 0; sq = stateQ(step);
      if (gate && dockF() < 1) { dk = 1; dockDone(); }
      if (follow()) { readFollow(); sq = fq; }
      shownPos = -1;
    }
    function leaveSteps() {
      for (const o of rowIOs) o.disconnect(); rowIOs = []; if (endIO) endIO.disconnect(); endIO = null; liveApproach = true;
      pos = Math.min(1, pos) + sq; stepped = false; tw = null; dk = 0; sq = 0; stepU = 1;
      if (docked) { docked = false; host.style.height = hostHeight0; host.style.background = CONFIG.background; dockMark(false); }
      shownPos = -1;
    }
    // the band's background: the nearest ancestor's, so it reads as the page (and the copy scrolling under it is hidden)
    function readDockBg() {
      if (!inspect) return ''; if (inspect.dockBackground) return resolveColor(host, inspect.dockBackground);
      for (let el = host.parentElement; el; el = el.parentElement) { const c = getComputedStyle(el).backgroundColor; if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)) return c; }
      return '';
    }
    // a monotone cubic through (ts[i], vs[i]), flat at both ends: no overshoot, and between the knots it never stops
    function spline(ts, vs, q) {
      const n = ts.length; if (q <= ts[0]) return vs[0]; if (q >= ts[n - 1]) return vs[n - 1];
      const d = []; for (let i = 0; i + 1 < n; i++) d.push((vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i])); const m = [0];
      for (let i = 1; i + 1 < n; i++) { const a = d[i - 1], b = d[i]; if (a * b <= 0) { m.push(0); continue; } const g = (vs[i + 1] - vs[i - 1]) / (ts[i + 1] - ts[i - 1]), lim = 3 * Math.min(Math.abs(a), Math.abs(b)); m.push(Math.sign(g) * Math.min(Math.abs(g), lim)); }
      m.push(0); let i = 0; while (q > ts[i + 1]) i++;
      const hh = ts[i + 1] - ts[i], t = (q - ts[i]) / hh, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * vs[i] + (t3 - 2 * t2 + t) * hh * m[i] + (-2 * t3 + 3 * t2) * vs[i + 1] + (t3 - t2) * hh * m[i + 1];
    }
    // the whole path as one curve over pos (0 = the page's top, 1 = the arrival, 1 + at = each pose of the inspection):
    // heading, elevation, distance (log), the look-at point (0 = the motor's housing, 1 = the drone's centre) and where
    // in the frame it sits. One curve, so the approach runs straight on into the inspection without a stop
    function camAt(pos, withPoses) {
      const fov = (+CONFIG.fov || 30) * D2R, a = w / fullH();
      const nz = isNarrow(), z0 = nz && CONFIG.zoomNarrow != null ? +CONFIG.zoomNarrow : (+CONFIG.zoom || 0.36), d0 = fitDistance(azimuth0(), +CONFIG.startElevation || 0, fov, a) * (+CONFIG.margin || 1.25), d1 = zoomDist(z0);
      const pe = endPoint(), ps = (isNarrow() && CONFIG.startPointNarrow) || CONFIG.startPoint || { x: 0.5, y: 0.5 };
      const ts = [0, 1], az = [azimuth0(), azimuth()], el = [+CONFIG.startElevation || 0, +CONFIG.elevation || 0], ld = [Math.log(d0), Math.log(d1)], ce = [1, 0], px = [ps.x, pe.x], py = [ps.y, pe.y];
      if (withPoses) inspect.poses.forEach((p, k) => { const wn = inspect.windows[k] || [1, 1], at = Array.isArray(p.hold) && p.hold.length === 2 ? [1 + +p.hold[0], 1 + +p.hold[1]] : [1 + (p.at == null ? wn[1] : +p.at)];   // a hold: the camera rests on the pose over that window
        for (const t of at) { if (t <= ts[ts.length - 1]) continue;
          ts.push(t); az.push(p.azimuth == null ? azimuth() : +p.azimuth); el.push(p.elevation == null ? (+CONFIG.elevation || 0) : +p.elevation); const pz = nz && p.zoomNarrow != null ? p.zoomNarrow : p.zoom; ld.push(Math.log(zoomDist(pz == null ? z0 : +pz))); ce.push(+p.centre || 0); const pp = nz ? p.pointNarrow : p.point; px.push(pp ? +pp.x : pe.x); py.push(pp ? +pp.y : pe.y); } });
      return { az: spline(ts, az, pos), el: spline(ts, el, pos), dist: Math.exp(spline(ts, ld, pos)), centre: spline(ts, ce, pos), px: spline(ts, px, pos), py: spline(ts, py, pos) };
    }
    // at this much of the inspection: the hotspots' opacities and which feature is active
    function inspectAt(q) {
      const P = inspect.poses, W = inspect.windows, st = +inspect.settle || 0.04;
      const hots = P.map((p, k) => { const w = W[k]; if (!w || q < w[0] || q > w[1]) return 0; return Math.min(1, (q - w[0]) / st, (w[1] - q) / st); });
      let active = -1; P.forEach((p, k) => { const w = W[k]; if (w && q >= w[0] && (q < w[1] || (k === P.length - 1 && q <= w[1]))) active = k; });
      const fills = P.map((p, k) => { const w = W[k]; if (!w) return 0; return Math.min(1, Math.max(0, (q - w[0]) / Math.max(1e-6, w[1] - w[0]))); });
      return { hots, active, fills };
    }
    // the same, by state: the rows before the state full, the state's own filling with its move, the ones after empty; its hotspot fades in with the move
    function steppedAt() {
      const P = inspect.poses, u = stepU;
      if (follow()) return { hots: P.map((p, k) => k + 1 === step ? 1 : 0), active: step - 1, fills: P.map((p, k) => fFills[k] || 0) };
      const fills = P.map((p, k) => { const r = rows && rows.find(x => x.n === k + 1), f0 = r && r.from != null ? r.from : 0, goal = k + 1 < step ? 1 : k + 1 === step ? 1 : 0; return f0 + (goal - f0) * u; });
      return { hots: P.map((p, k) => k + 1 === step ? u : 0), active: step - 1, fills };
    }
    // the camera and everything that follows the scroll, for the current pos: the approach (its fades over its eased
    // progress e) running on into the inspection where there is one
    function place() {
      const P = curPos(), useInsp = !!inspect, p = Math.min(1, P), e = ease(p), q = useInsp ? Math.max(0, P - 1) : 0;
      let cpos = useInsp ? P : p; if (useInsp) { const WL = inspect.windows[inspect.windows.length - 1] || [0, 1], L = inspect.easeOut == null ? WL[1] - WL[0] : +inspect.easeOut; if (L > 0 && P > 2 - L) { const u = Math.min(1, (P - (2 - L)) / L); cpos = 2 - L + L * (u + u * u - u * u * u); } }   // the last stretch eased out: the camera's speed falls smoothly to nothing at the end (easeOut)
      const c = camAt(cpos, useInsp);
      pivot.rotation.x = tiltRad * (1 - e); pivot.updateMatrixWorld(true);   // pitched at the top of the page, level by the arrival
      camTarget.copy(target).lerp(droneC, c.centre).applyMatrix4(rig.matrixWorld);   // the look-at point, as the tilt has moved it
      const fn = CONFIG.fovNarrow != null && isNarrow() ? +CONFIG.fovNarrow : NaN, f0 = +CONFIG.fov || 30; camera.fov = fn > 0 ? f0 + (fn - f0) * e : f0;   // the lens widens over the approach on narrow screens (the distances stay those of `fov`)
      aim(c.az * D2R, c.el * D2R, c.dist, c.px, c.py);
      fadeGrid(); motorColor(e);
      if (flag) { const w = CONFIG.flagFade, f = Array.isArray(w) && w.length === 2 && w[1] > w[0] ? 1 - Math.min(1, Math.max(0, (e - w[0]) / (w[1] - w[0]))) : 1; flag.mat.uniforms.uOpacity.value = (+CONFIG.flagOpacity || 0.85) * f; edgeMat.uniforms.uFlagA.value = f;
        const show = f > 0.001; if (show !== flag.shown) { flag.shown = show; for (const o of flag.objects) o.visible = show; } }   // faded out: its cloth and lines leave the scene until it fades back
      if (rows === null && inspect) rows = rowEls();
      const s = stepped ? steppedAt() : useInsp && q > 0 ? inspectAt(q) : null;
      // the rest of the drone fades away over `isolate`, and leaves the scene once gone; the copies fade in over their window
      if (inspect) { const win = (w, v) => Array.isArray(w) && w.length === 2 && w[1] > w[0] ? Math.min(1, Math.max(0, (v - w[0]) / (w[1] - w[0]))) : 0;
        const W0 = inspect.windows[0] || [0, 1], WL = inspect.windows[inspect.windows.length - 1] || [0, 1], isoW = inspect.isolate == null ? W0 : inspect.isolate, fadeW = inspect.copies && inspect.copies.fade == null ? [WL[0], WL[0] + 0.4 * (WL[1] - WL[0])] : inspect.copies && inspect.copies.fade;
        const ti = useInsp ? win(isoW, q) : 0, droneA = (1 - ti) * (1 - ti), copyA = useInsp && inspect.copies ? win(fadeW, q) : 0;   // the drone goes quickly at first and lingers faintly, so its leaving never snaps
        if (droneA !== shownDroneA) { shownDroneA = droneA; const la = inspect.crossfade === false ? droneA : 1; edgeMat.uniforms.uDroneA.value = la; droneRibMat.uniforms.uOpacity.value = (+CONFIG.ribOpacity) * la;
          const on = droneA > 0.001; if (on !== droneOn) { droneOn = on; for (const m of solids) if (m.userData.kind === 'rest' || m.userData.kind === 'motor') m.visible = on; if (droneRibs) droneRibs.visible = on; if (grid) grid.visible = true; } }
        if (copyA !== shownCopyA) { shownCopyA = copyA; edgeMat.uniforms.uCopyA.value = copyA; copies.mats.forEach((m, i) => { m.uniforms.uOpacity.value = (+CONFIG.ribOpacity) * copyA * Math.max(0, 1 - (i + 1) / (copies.n + 1)); });
          const on = copyA > 0.001; if (on !== copies.shown) { copies.shown = on; for (const m of copies.meshes) m.visible = on; for (const m of copies.ribs) m.visible = on; } } }
      // the hotspots: the anchor projected to the frame, the leader out from it, the label at the leader's end
      if (hot && s) { const [dx, dy] = inspect.leader || [0, -72], d = +inspect.dot || 6, v = new THREE.Vector3();
        hot.shown = true; inspect.poses.forEach((p, k) => { const it = hot.items[k], o = s.hots[k], os = o.toFixed(3); if (it.shown !== os) { it.shown = os; it.g.style.opacity = os; it.label.style.opacity = os; } if (o <= 0) return;
          v.copy(anchorOf(p)).project(camera); const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h, ex = x + dx, ey = y + dy;
          it.path.setAttribute('x1', x.toFixed(1)); it.path.setAttribute('y1', y.toFixed(1)); it.path.setAttribute('x2', ex.toFixed(1)); it.path.setAttribute('y2', ey.toFixed(1));
          it.dot.setAttribute('x', (ex - d / 2).toFixed(1)); it.dot.setAttribute('y', (ey - d / 2).toFixed(1));
          // the label sits over the square when the leader runs up, under it when down, beside it when sideways
          const up = dy < 0, side = Math.abs(dx) > Math.abs(dy), gap = d / 2 + 6;
          it.label.style.transform = side ? 'translate(' + (dx < 0 ? 'calc(' + (ex - gap).toFixed(1) + 'px - 100%)' : (ex + gap).toFixed(1) + 'px') + ', calc(' + ey.toFixed(1) + 'px - 50%))'
            : 'translate(calc(' + ex.toFixed(1) + 'px - 50%), ' + (up ? 'calc(' + (ey - gap).toFixed(1) + 'px - 100%)' : (ey + gap).toFixed(1) + 'px') + ')'; }); }
      else if (hot && hot.shown) { hot.shown = false; for (const it of hot.items) { it.shown = '0.000'; it.g.style.opacity = '0'; it.label.style.opacity = '0'; } }
      // the feature rows
      const active = s ? s.active : -1;
      if (active !== activeRow && rows) { activeRow = active; for (const r of rows) { const on = r.n === active + 1; r.el.classList.toggle(inspect.activeClass || 'is-active', on); if (inspect.activeVar) r.el.style.setProperty(inspect.activeVar, on ? '1' : '0'); } }
      if (rows && inspect.fillVar) { const nr = isNarrow(); for (const r of rows) { const v = s ? s.fills[r.n - 1] || 0 : 0, f = (nr ? Math.round(v * 50) / 50 : v).toFixed(2); if (r.fill !== f) { r.fill = f; r.el.style.setProperty(inspect.fillVar, f); } } }
      if (rows) for (const r of rows) { const w = inspect.windows[r.n - 1]; if (!w) continue; const reached = stepped ? r.n <= step : q >= w[0] ? true : q < w[0] - 0.02 ? false : !!r.reached; if (reached !== !!r.reached) { r.reached = reached; const n = reached ? inspect.reachEvent : inspect.unreachEvent; if (n) r.el.dispatchEvent(new CustomEvent(n, { bubbles: true })); } }
      dirty = true; shownPos = P;
      if (endEl) { const a = P >= 0.98 ? true : P < 0.9 ? false : arrived; if (a !== arrived) { arrived = a; const n = a ? CONFIG.arriveEvent : CONFIG.leaveEvent; if (n) endEl.dispatchEvent(new CustomEvent(n, { bubbles: true })); } }
      setVar(CONFIG.progressVar, e, 3); if (inspect) setVar(inspect.inspectVar, q, 3);
    }
    const sized = { PR: 0, w: 0, h: 0 };
    function frame() {
      const ws = wantSteps(); if (ws !== stepped) { if (ws) enterSteps(); else leaveSteps(); }   // stepped up to the breakpoint: a rotation or a resize across it switches (before the size is read: leaving undocks)
      w = host.clientWidth || 1; h = host.clientHeight || 1; camera.fov = +CONFIG.fov || 30;
      // the canvas at the device's pixel ratio (capped); the edge pass at `supersample` times that, in as many tiles as
      // the pixel budget (and the largest texture) asks for, each with a guard band so the lines run across tile edges
      const PR = Math.min(devicePixelRatio || 1, docked && +inspect.dockPixelRatio > 0 ? +inspect.dockPixelRatio : coarse ? (+CONFIG.pixelRatioCapCoarse || 1.5) : (+CONFIG.pixelRatioCap || 2));   // docked: the band is half the pixels, so it can afford the device's own
      let resized = false; if (PR !== sized.PR || w !== sized.w || h !== sized.h) { sized.PR = PR; sized.w = w; sized.h = h; renderer.setPixelRatio(PR); renderer.setSize(w, h, false); resized = true; }   // only on a real change: setSize clears the canvas (a phone's toolbar fires resize on every scroll)
      const S = Math.max(1, +CONFIG.supersample || 1), W = Math.round(w * PR), H = Math.round(h * PR), maxT = Math.min(8192, renderer.capabilities.maxTextureSize || 8192), budget = +CONFIG.pixelBudget || 8e6;
      T.nx = Math.max(1, Math.ceil(W * S / maxT)); T.ny = Math.max(1, Math.ceil(H * S / maxT), Math.ceil(W * S * H * S / (budget * T.nx)));
      T.w = Math.ceil(W / T.nx); T.h = Math.ceil(H / T.ny); T.g = 3; T.PR = PR; T.S = S; T.W = W; T.H = H;
      const rw = Math.round((T.w + 2 * T.g) * S), rh = Math.round((T.h + 2 * T.g) * S); rt.setSize(rw, rh); edgeMat.uniforms.uRes.value.set(rw, rh);
      edgeMat.uniforms.uWidth.value = Math.max(0.5, (+CONFIG.lineWidth || 1) * S * PR / 1.5);
      for (const m of ribMats) m.uniforms.uWidth.value = Math.max(0.3, (+CONFIG.ribWidth || 1) * PR); gridMat.uniforms.uWidth.value = Math.max(0.3, (+CONFIG.gridWidth || 1) * PR); ribMat.uniforms.uOpacity.value = +CONFIG.ribOpacity;
      for (const m of lineMats) { if (!ribMats.has(m) && m !== gridMat) m.uniforms.uWidth.value = Math.max(0.3, (+CONFIG.gridWidth || 1) * PR); m.uniforms.uRes.value.set(W, H); m.uniforms.uHalf.value = m.uniforms.uWidth.value / 2 + 1; }
      if (!trackEl) progress = progressTarget = pos = posTarget = 1; place();
      if (resized) { dirty = false; lastRender = performance.now(); render(); }   // the cleared canvas is drawn before it can be shown
      wake();
    }
    // one frame, into a render target (null = the canvas)
    function drawFrame(target) {
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);   // the faces (occluders), ribs and grid, multisampled
      const v = camera.view, fw = v.fullWidth, fh = v.fullHeight, ox = v.offsetX, oy = v.offsetY, vw = v.width, vh = v.height;   // the framing
      for (const m of solids) { m.userData.faceMat = m.material; m.material = m.userData.idMat; }
      const lines = []; scene.traverse(o => { if (o.userData.isLines && o.visible) { lines.push(o); o.visible = false; } });   // (only the shown ones, so a hidden set stays hidden)
      const { nx, ny, w: tw, h: th, g, PR, W, H } = T;
      for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
        const x0 = tx * tw, y0 = ty * th;   // the tile, in canvas pixels from the top left
        // pass one, this tile plus its guard band: normals, part and depth, meshes only
        camera.setViewOffset(fw, fh, ox + (x0 - g) / PR, oy + (y0 - g) / PR, (tw + 2 * g) / PR, (th + 2 * g) / PR); camera.updateProjectionMatrix();
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
        // pass two: the lines, onto the tile's part of the canvas
        edgeMat.uniforms.uTile.value.set(x0 - g, H - (y0 + th) - g, tw + 2 * g, th + 2 * g);
        setQuad(x0 / W * 2 - 1, 1 - (y0 + th) / H * 2, (x0 + tw) / W * 2 - 1, 1 - y0 / H * 2);
        renderer.setRenderTarget(target); renderer.render(quadScene, quadCam);
      }
      camera.setViewOffset(fw, fh, ox, oy, vw, vh); camera.updateProjectionMatrix();
      for (const m of solids) m.material = m.userData.faceMat; for (const l of lines) l.visible = true;
    }
    // while the rest of the drone fades (crossfade), the frame is drawn twice — with it and without it — into two
    // targets, and the canvas gets their blend: everything it touches (its lines, the grid and the motor's ribs its
    // faces cover, the motor's outline where its arms cross it) goes at the one rate, and nothing pops when it leaves
    const xf = { a: null, b: null, w: 0, h: 0 }, mixMat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tA, tB; uniform float uMix; varying vec2 vUv; void main(){ gl_FragColor = mix(texture2D(tB, vUv), texture2D(tA, vUv), uMix); }',
      uniforms: { tA: { value: null }, tB: { value: null }, uMix: { value: 1 } } });
    function render() {
      const a = shownDroneA, fading = inspect && inspect.crossfade !== false && droneOn && a < 0.999;
      if (!fading) { if (xf.a) { xf.a.dispose(); xf.b.dispose(); xf.a = xf.b = null; xf.w = xf.h = 0; } drawFrame(null); return; }
      const { W, H } = T; if (!xf.a) { const o = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false }; xf.a = new THREE.WebGLRenderTarget(W, H, o); xf.b = new THREE.WebGLRenderTarget(W, H, o); }
      if (xf.w !== W || xf.h !== H) { xf.w = W; xf.h = H; xf.a.setSize(W, H); xf.b.setSize(W, H); }
      drawFrame(xf.a);   // with the rest of the drone
      const hid = []; for (const m of solids) if ((m.userData.kind === 'rest' || m.userData.kind === 'motor') && m.visible) { m.visible = false; hid.push(m); } if (droneRibs && droneRibs.visible) { droneRibs.visible = false; hid.push(droneRibs); }
      drawFrame(xf.b);   // without it
      for (const m of hid) m.visible = true;
      mixMat.uniforms.tA.value = xf.a.texture; mixMat.uniforms.tB.value = xf.b.texture; mixMat.uniforms.uMix.value = a;
      quad.material = mixMat; setQuad(-1, -1, 1, 1); renderer.setRenderTarget(null); renderer.clear(); renderer.render(quadScene, quadCam); quad.material = edgeMat;
    }
    // ---- the loop: the camera follows the scroll through the track, damped; the props turn with the scroll
    let dirty = true, alive = true, visible = true, lastT = performance.now(), spin = 0, spinTarget = 0, idle = 0, flagT = 0, flagLast = 0, raf = 0, inTick = false;
    // frames are asked for only while something moves: a scroll to follow, a state's move, the dock, the props or the flag; at rest there is no loop at all
    const wake = () => { if (raf || !alive) return; if (!inTick) lastT = performance.now(); raf = requestAnimationFrame(tick); };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, coarse = matchMedia('(pointer: coarse)').matches, frameMs = coarse && +CONFIG.fpsCoarse > 0 ? 1000 / +CONFIG.fpsCoarse : 0; let lastRender = 0;
    const onScroll = () => {
      if (stepped) {   // the approach follows the scroll until the end element has gone by; after that the scroll is not read (the props stop with it)
        if (liveApproach) { spinTarget = (global.scrollY || 0) / 1000 * (+CONFIG.propScroll || 0) * Math.PI * 2; progressTarget = readProgress(); } else progressTarget = 1;
        inspTarget = 0; posTarget = progressTarget; updateGate(); if (follow()) readFollow(); wake(); if (!liveApproach) return;
      } else { spinTarget = (global.scrollY || 0) / 1000 * (+CONFIG.propScroll || 0) * Math.PI * 2; progressTarget = trackEl ? readProgress() : 1; inspTarget = readInspect(); posTarget = progressTarget + inspTarget; }
      setVar(CONFIG.scrollVar, ease(progressTarget), 3); wake();
      if (trackEl && CONFIG.exitVar) { const tr = trackEl.getBoundingClientRect(), hr = host.getBoundingClientRect(); const ex = Math.min(1, Math.max(0, 1 - (tr.bottom - hr.top) / Math.max(1, hr.height))).toFixed(4); host.style.setProperty(CONFIG.exitVar, ex); trackEl.style.setProperty(CONFIG.exitVar, ex); } };
    addEventListener('scroll', onScroll, { passive: true }); onScroll(); spin = spinTarget; progress = progressTarget; insp = inspTarget; pos = posTarget;
    const io = new IntersectionObserver(en => { visible = en[en.length - 1].isIntersecting; if (visible) { dirty = true; wake(); } }); io.observe(host);
    function tick(now) {
      raf = 0; if (!alive) return; inTick = true;
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      // a state's move: time-based, on one ease; the scroll has no hand in it
      if (stepped && follow() && sq !== fq) { sq = reduced ? fq : sq + (fq - sq) * Math.min(1, (+CONFIG.damping || 0.12) * dt * 60); if (Math.abs(fq - sq) < 1e-5) sq = fq; shownPos = -1; }   // following: damped as the approach is
      if (tw) { const u = Math.min(1, (now - tw.t0) / tw.dur); stepU = u; sq = tw.from + (tw.to - tw.from) * easeIO(u); if (u >= 1) { sq = tw.to; tw = null; } shownPos = -1; }
      if (visible && posTarget !== pos) { pos = reduced ? posTarget : pos + (posTarget - pos) * Math.min(1, (+CONFIG.damping || 0.12) * dt * 60); if (Math.abs(posTarget - pos) < 1e-5) pos = posTarget; progress = Math.min(1, pos); insp = stepped ? sq : Math.max(0, pos - 1); }
      if (visible && curPos() !== shownPos) place();
      if (!reduced && visible) {
        if (CONFIG.propSeconds > 0 && (!stepped || liveApproach)) { idle += dt * Math.PI * 2 / CONFIG.propSeconds; if (droneOn) dirty = true; }   // stepped, the idle turn stops with the approach, so the docked canvas rests   // the propellers go with the rest of the drone: once it has gone there is nothing turning to draw
        if (Math.abs(spinTarget - spin) > 1e-4) { spin += (spinTarget - spin) * Math.min(1, dt * 6); if (Math.abs(spinTarget - spin) < 1e-4) spin = spinTarget; dirty = true; }
        for (const p of props) p.mesh.rotation.y = p.dir * (spin + idle) + p.phase;
        // the flag's wave is rebuilt on the CPU, so on touch devices it moves at flagFpsCoarse (its time still runs at full rate);
        // a scroll or a turning prop still draws every frame, the flag simply keeps its last pose between its own steps
        if (flag && flag.shown) { flagT += dt; const fs = coarse && +CONFIG.flagFpsCoarse > 0 ? 1000 / +CONFIG.flagFpsCoarse : 0; if (now - flagLast >= fs - 2) { flagLast = now; flag.update(flagT); dirty = true; } }
      }
      if (colorTw) stepColors(now);
      if (dirty && visible && now - lastRender >= frameMs - 2) { dirty = false; lastRender = now; render(); }
      inTick = false;
      const more = colorTw || tw || (stepped && follow() && sq !== fq) || (visible && (posTarget !== pos || dirty || (!reduced && ((CONFIG.propSeconds > 0 && droneOn && (!stepped || liveApproach)) || Math.abs(spinTarget - spin) > 1e-4 || (flag && flag.shown)))));
      if (more) wake();
    }
    wake();
    let lastColors = '';
    // a theme change fades the colours over themeFade ms (the page's own background and text transition with it),
    // rather than snapping; the first paint, reduced motion and colours three.js cannot parse go straight there
    let shownColors = null, colorTw = null;
    function applyColors() {
      const next = {}; for (const k of COLOR_KEYS) next[k] = resolveColor(host, RAW[k]);
      const sig = JSON.stringify(next); if (sig === lastColors) return; lastColors = sig;
      if (!shownColors || reduced || !(+CONFIG.themeFade > 0)) { colorTw = null; paintColors(next); return; }
      colorTw = { from: shownColors, to: next, t0: performance.now() }; wake();
    }
    function stepColors(now) {
      const u = Math.min(1, (now - colorTw.t0) / +CONFIG.themeFade), e = u * u * (3 - 2 * u), mix = {};
      for (const k of COLOR_KEYS) mix[k] = mixColor(colorTw.from[k], colorTw.to[k], e);
      paintColors(mix); if (u >= 1) colorTw = null;
    }
    function paintColors(c) {
      shownColors = c; Object.assign(CONFIG, c);
      host.style.background = CONFIG.background; faceMat.color.set(CONFIG.face); if (hot) for (const it of hot.items) { it.dot.setAttribute('fill', CONFIG.primary); it.path.setAttribute('stroke', CONFIG.primary); it.label.style.color = CONFIG.primary; } gridMat.uniforms.uColor.value.set(CONFIG.gridColor); for (const m of lineMats) { m.uniforms.uBg.value.set(CONFIG.face); if (!ribMats.has(m) && m !== gridMat) m.uniforms.uColor.value.set(CONFIG.secondary); } edgeMat.uniforms.uC2.value.set(CONFIG.secondary); motorColor(ease(progress)); if (!grid) buildGrid(); dirty = true; wake();
    }
    buildHotspots(); applyColors();
    const themeMO = global.MutationObserver ? new MutationObserver(() => applyColors()) : null;   // the theme toggle flips a class / data-theme on <html>: start the fade at once rather than on the next poll
    if (themeMO) themeMO.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-wf-theme'] });
    const themeWatch = setInterval(() => { if (!alive || !visible) return; applyColors(); if (inspect) { const b = readDockBg(); if (b !== dockBg) { dockBg = b; if (docked) host.style.background = b || CONFIG.background; } } }, 400);
    dockBg = readDockBg();
    const ro = global.ResizeObserver ? new ResizeObserver(frame) : null; if (ro) ro.observe(host); else addEventListener('resize', frame);
    frame();
    return {
      set(patch) { Object.assign(CONFIG, patch || {}); for (const k of COLOR_KEYS) if (patch && k in patch) { RAW[k] = patch[k]; lastColors = ''; } edgeMat.uniforms.uDepthT.value = +CONFIG.depthEdge || 0.012; edgeMat.uniforms.uNormT.value = +CONFIG.normalEdge || 0.25; edgeMat.uniforms.uNormTM.value = CONFIG.normalEdgeMotor == null ? (+CONFIG.normalEdge || 0.25) : +CONFIG.normalEdgeMotor; if (patch && ('grid' in patch || 'gridExtent' in patch)) buildGrid(); applyColors(); onScroll(); frame(); },
      setProgress(p, q) { progressTarget = progress = Math.min(1, Math.max(0, +p || 0)); inspTarget = insp = Math.min(1, Math.max(0, +q || 0)); if (stepped) { tw = null; sq = insp; posTarget = pos = progress; } else posTarget = pos = progress + insp; place(); wake(); },
      get state() { const d = camera.position.clone().sub(camTarget); return { focus: key, azimuth: azimuth(), startAzimuth: azimuth0(), progress, inspect: stepped ? sq : insp, stepped, step, docked, dock: dk, moving: !!tw, looping: !!raf, visible, heading: [Math.atan2(d.x, d.z) / D2R, Math.atan2(d.y, Math.hypot(d.x, d.z)) / D2R, d.length()], motorHeight: motorH, triangles: tris, props: props.length, pixelRatio: renderer.getPixelRatio(), edgePass: [rt.width, rt.height], tiles: T.nx * T.ny }; },
      destroy() { alive = false; if (raf) cancelAnimationFrame(raf); for (const o of rowIOs) o.disconnect(); if (endIO) endIO.disconnect(); clearInterval(themeWatch); if (themeMO) themeMO.disconnect(); io.disconnect(); removeEventListener('scroll', onScroll); if (ro) ro.disconnect(); else removeEventListener('resize', frame); rt.dispose(); renderer.dispose(); renderer.domElement.remove(); }
    };
  }

  function mount(target, config) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return Promise.reject(new Error('DroneHero: target not found'));
    const CONFIG = Object.assign({}, DEFAULTS, config || {});
    // the model is fetched at once, alongside three.js and the loader, and parsed when they are in
    const url = CONFIG.model || (HERE + 'heavy_lift_drone_model.glb');
    // onProgress: the load as it goes, for a page's preloader — { loaded, total (0 = not known), scripts (of 2), built }
    const report = typeof CONFIG.onProgress === 'function' ? CONFIG.onProgress : null, st = { loaded: 0, total: 0, scripts: 0, built: false };
    const tell = () => { if (report) try { report(Object.assign({}, st)); } catch (e) { /* the page's problem, not the drone's */ } };
    const bytes = fetch(url).then(r => {
      if (!r.ok) throw new Error('model failed to load: ' + url);
      if (!report || !r.body || !r.body.getReader) return r.arrayBuffer();
      st.total = +r.headers.get('content-length') || 0;   // a compressed transfer's length is not the body's: dropped below once the body outgrows it
      const reader = r.body.getReader(), parts = [];
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { const out = new Uint8Array(st.loaded); let o = 0; for (const c of parts) { out.set(c, o); o += c.length; } if (st.total) st.loaded = st.total; tell(); return out.buffer; }
        parts.push(value); st.loaded += value.length; if (st.total && st.loaded > st.total) st.total = 0; tell(); return pump();
      });
      return pump();
    });
    const script = () => { st.scripts++; tell(); };
    return Promise.all([loadThree().then(script).then(() => loadScript(CONFIG.loader, () => !!(global.THREE && global.THREE.GLTFLoader))).then(script), bytes])
      .then(([, buf]) => new Promise((res, rej) => new global.THREE.GLTFLoader().parse(buf, url.replace(/[^/]*$/, ''), res, rej)))
      .then(gltf => { const api = build(host, CONFIG, gltf); st.built = true; tell(); return api; });
  }
  global.DroneHero = { mount, defaults: DEFAULTS, version: '3.22.0' };
})(typeof window !== 'undefined' ? window : this);
