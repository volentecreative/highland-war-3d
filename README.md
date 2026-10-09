# Jackson County topo turntable

Jackson County, Tennessee, in contour lines on a slowly turning stage — and, with `approach: true`, a
scroll-driven descent to it from the whole Earth. Real terrain at three levels (1-arc-second SRTM
over the county, Terrain Tiles at 1 km for the region and 5 km for the continent), the Census county
line, Natural Earth countries. One script plus a `data/` folder, no build step, embeds anywhere.

**Live demo:** open `index.html`, or after enabling GitHub Pages: `https://volentecreative.github.io/hwi-topo/`

## Embed (Webflow "Embed" element, or any HTML)

Every option, with its default. Delete the lines you are happy with — anything left out falls back
to the value shown here.

```html
<div id="topo" style="width:100%;height:600px"></div>
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@a5ecd10/topo-turntable.js"></script>
<script>
  TopoTurntable.mount('#topo', {

    // --- terrain ---------------------------------------------------------
    exaggeration:   2.5,        // vertical exaggeration; 1 = true scale, higher = more dramatic relief
    contourLevels:  2,          // 2 = the regional grid is the map everywhere (default); 3 = the county grid takes over inside its extent
    localInterval:  12.5,       // (three levels only) finest contour interval, in metres, over the county-scale grid
    regionInterval: 10,         // finest interval over the 1 km grid (600 x 500 km)
    contInterval:   100,        // finest interval over the 5 km grid (5,800 x 3,300 km)
    county:         true,       // draw the county line, draped on the relief

    // --- how the topo resolves (see "How the world is built") --------------
    intervalRevealMode: 'progressive', // 'progressive' (sets fill in between existing lines as you zoom) | 'existing' (the earlier model)
    microInterval:    10,       // progressive mode: the finest contour set ever shown, in metres
    coarseInterval:   100,      // contour sets from this interval up are the "coarse" level, drawn in coarseColor at coarseOpacity
    coarseOpacity:    0.7,
    revealStart:      550,      // view width, km, where the topo first begins to appear
    revealFull:       120,      // view width, km, where it reaches full opacity
    revealSoftness:   1,        // >1 = slower start to that reveal, <1 = quicker
    contourSpacing:   10,       // a contour set resolves in once its lines would fall this many CSS px apart
    spacingTolerance: 0.2,      // 0 = every line of a set fades together; 1 = each line by its own slope
    intervalBlend:    0.5,      // how soft each set's fade is (progressive: in log-zoom; existing: fraction of the spacing)
    minSegment:       24,       // contour lines shorter than this on screen, in px, stay out (small loops, nibs)
    localRadius:      110,      // km around the town where the topo is at full strength …
    localFeather:     1,        // … and, as a multiple of that radius, how far beyond it fades out
    handoffSoftness:  0.4,      // how gradually one terrain grid's lines give way to the next finer one

    // --- camera ----------------------------------------------------------
    tilt:          31,          // degrees above the horizon; 90 = straight down, 0 = eye level
    lens:          8,           // field of view; lower = flatter and more isometric
    startHeading:  0,           // which way it faces on the way down, in degrees; 0 = north up
    rotateSeconds: 120,         // seconds per full turn; 0 = hold still
    fitMargin:     1.1,         // breathing room around the county; 1 = edge to edge, higher = more padding
    dragToOrbit:   false,       // let visitors drag to spin it; auto-rotation resumes afterwards

    // --- highways & waterways (OpenStreetMap, draped on the terrain) ------
    roads: false,               // TN 53 / 56 / 85 / 135 / 262 — coverage ends ~10 km from town, see below
    water: false,               // the Cumberland, Roaring River and the town streams

    // --- colours (any CSS colour, or a var() that resolves on the page) ---
    // each falls back to the site palette's own variable, so defining --map-bg, --topo, --boundary, --water and
    // --label once on the page is enough
    background:    'var(--topo-bg, var(--map-bg, #222322))',
    lineColor:     'var(--topo-line, var(--topo, #525352))',        // the main contours
    coarseColor:   'var(--topo-coarse, var(--topo-muted, #3f4040))', // the coarse sets (coarseInterval and up), quieter
    lineOpacity:   1,
    mutedColor:    'var(--topo-muted, #3f4040)',                    // the graticule and the rest of the world's outlines
    boundaryColor: 'var(--topo-boundary, var(--boundary, #626362))', // country outlines
    blockColor:    'var(--topo-block, var(--map-bg, #222322))',     // the relief under the lines, and the globe
    countyColor:   'var(--topo-county, label)',                     // 'label': the same colour as the county's name
    roadColor:     'var(--topo-road, var(--boundary, #626362))',
    waterColor:    'var(--topo-water, var(--water, #3f6063))',

    // --- labels ----------------------------------------------------------
    label:       'Gainesboro',  // the anchor town: text only, from ~130 km; '' hides it
    towns: [{name:'Whitleyville',lon:-85.6719,lat:36.4453},{name:'Mayfield',lon:-85.6149,lat:36.2454}],  // reference towns, text only, from ~130 km
    cities: [{name:'Nashville',lon:-86.7816,lat:36.1627},{name:'Knoxville',lon:-83.9207,lat:35.9606},{name:'Louisville',lon:-85.7585,lat:38.2527}],  // text only, a step before the county's name; [] hides them
    cityLabelClass: '',         // style them with your own classes (see below)
    labelCityColor: 'var(--topo-label-city, var(--label-city, #c4c4c0))',  // the cities; ignored when cityLabelClass is set
    countyLabel: 'Jackson County',   // the anchored callout: a dot and leader from the county's centre, its name from halfway down; '' hides it
    countyLabelClass: '',       // style it with your own classes (see below)
    labelSecondaryColor: 'var(--topo-label-secondary, var(--label-secondary, #9a9a96))',  // the towns
    // the state names: text like the towns' (same class and size), turned with the map so the baseline follows the
    // state line, and held `offset` ems from the line (north positive), so they hug it at every zoom; from ~500 km down
    groundLabels: [{text:'Kentucky',lon:-85.65,lat:36.629,offset:0.8},{text:'Tennessee',lon:-85.65,lat:36.629,offset:-0.8}],  // [] hides them
    groundLabelClass:   '',     // defaults to labelClass
    groundLabelColor:   'var(--topo-ground-label, var(--topo-label-secondary, var(--label-secondary, #9a9a96)))',
    labelHeight: 0.45,          // how far the pin stands above the terrain, as a fraction of the county's half-extent
    labelClass:  '',            // style the text with your own classes instead (see below)
    labelColor:  'var(--topo-label, var(--label, #f2f2f0))',  // the county label and its dot and leader; ignored when countyLabelClass is set
    labelFont:   '500 15px/1 "Helvetica Neue", Helvetica, Arial, sans-serif',  // ignored when labelClass is set

    // --- approach: scroll-driven descent from the whole Earth --------------
    approach:        false,     // true = open on the globe with the county facing you and descend to the frame above
    approachScroll:  '',        // selector of the tall track the stage is stuck inside; progress follows its scroll
    approachLens:    38,        // field of view at the top; it narrows to `lens` on the way down
    approachDamping: 0.12,      // how quickly the view follows the scroll (1 = instantly)
    lazy:            1.5,       // viewports away from the screen at which the map starts loading (three.js, the terrain, the lines); null = at once
    approachTail:    0,         // viewports of that track's scroll held after the descent has landed (make the track that much taller), so the end is a rest, not the edge
    stage: null,                // let the script move the map's own box with the descent — see below; e.g.
                                // { move: '.topo-descent_map-wrapper', reveal: '.topo-descent_text-wrapper', start: 0.45, end: 0.7 }
    focus: null,                // where the county sits on the canvas at rest, as fractions of its width and height, e.g.
                                // { x: 0.75, y: 0.5 } = the centre of the right half; null = the centre (see below)
    focusFrom: null,            // where it starts (the centre by default); it moves to focus over stage.start → stage.end
    focusNarrow: null,          // the same two, for screens up to stage.breakpoint (991 px), e.g. { x: 0.5, y: 0.32 }
    focusNarrowFrom: null,
    focusStart: 0.1,            // the move from focusFrom to focus runs over this window of the descent …
    focusEnd:   0.75,           // … and is settled by here, so it reads as aiming rather than a late slide
    tiltStart:       0.35,      // progress over which the tilt comes on …
    tiltEnd:         0.72,      // … and is done
    lensStart:       0,         // progress over which the lens narrows from approachLens to lens …
    lensEnd:         1,         // … and is done
    orbitStart:      0.9,       // progress at which the turntable's turn begins, at 0 speed …
    orbitMid:        0.95,      // … reaches half speed …
    orbitEnd:        1,         // … and full speed (rotateSeconds), which it simply keeps once landed
    orbitRamp:       'smooth',  // 'smooth' | 'linear' speed ramp
    orbitAmount:     0,         // optional extra: degrees of heading turned with the scroll itself over the same window
    headingShortest: true,      // scrolling back up after a long spin unwinds by the short way round, never by whole turns
    headingReturnSeconds: 1.8,  // how long that return takes: a critically damped ease, no snap at either end

    // --- data ------------------------------------------------------------
    data: {},                   // { base, local, region, lines } — defaults to ./data/ next to the script
    aspectRatio: '16 / 10'      // used only when the container has no height of its own
  });
</script>
```

Or the no-JavaScript way — give any element `data-topo` and it mounts itself:

```html
<div data-topo data-config='{"tilt":40,"rotateSeconds":60}' style="height:500px"></div>
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@a5ecd10/topo-turntable.js"></script>
```

> The URL above is pinned to a commit, so it is permanent and served instantly. Swap the hash for a newer commit to pick up changes; `@main` also works but jsDelivr caches it for up to 24 h. The script loads its terrain from `data/` beside itself, so the pin covers the data too.

> Every script here fetches three.js from cdnjs and its own code (and, for the drone, the model) from jsDelivr, so warm both connections in the page `<head>` before the first embed is reached:
>
> ```html
> <link rel="preconnect" href="https://cdnjs.cloudflare.com">
> <link rel="preconnect" href="https://cdn.jsdelivr.net">
> <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
> ```
>
> Scripts load on the credentialed connection and the model's `fetch` on the anonymous one, which is why jsDelivr gets both hints. (On the HWI site these live in the Home page's head custom code.)

## The descent

`approach: true` opens on the whole Earth, the county facing you, and descends to the frame the
turntable would otherwise open on. Progress 0 is the globe, 1 is the landing frame. From orbit the map
is outlines only: the country outlines and a 15° graticule, the state lines (which stay, muted, all the
way down), North America in more detail until 100 km. The county is a dot from orbit, on a leader from
the county's centre; its outline and the name "Jackson County" come in about halfway down (2,000 →
1,200 km across); the town names — Gainesboro's included — are text only, from about 130 km; roads and
rivers from 90 km. There is no topo at those scales. The contours begin to resolve, quietly and broadly around the
county, from `revealStart` (550 km) and are fully there by `revealFull` (120 km) — see "How the world
is built".

The camera holds `startHeading` (north up) through the descent. The look-at point settles on the county
over the first 45%, the tilt comes on from `tiltStart` to `tiltEnd` (35% to 72%), and the lens narrows
from `approachLens` to `lens`. Over the last stretch the turntable's own turn begins: it is a turn in
time, at `rotateSeconds`, and its speed ramps up with the scroll — nothing at `orbitStart` (90%), half at
`orbitMid` (95%), full at `orbitEnd` (100%) — so the map is already turning as it arrives and simply keeps
turning once landed. Nothing is reset on landing. Scrolling back up eases the turn away by the short way round, never by
whole turns. `mount()` resolves to an instance with `set({...})` for changing any of these in place.

`stage` lets the script choreograph the layout around the map, for the case where the map should
open centred on the screen and slide aside as the copy comes in. `move` is a selector for the map's
box: on desktop it starts centred in the viewport and slides (translateX) to wherever the layout puts
it, over `start` → `end` of the progress; on screens up to `breakpoint` (991 px) it instead starts at
`heightFrom` (100%) and shrinks to `heightTo` (50%). `reveal` is a selector for the copy, which
fades from 0 to 1 over the same window. Nothing is set once the move is done, so the resting layout
is exactly what the Designer shows, and `prefers-reduced-motion` skips the move.

`focus` is the other way to share the screen with copy, for a map that fills the section as a
background: instead of moving the map's box, the camera's projection is offset so the county lands
at a chosen point of the canvas — `{ x: 0.75, y: 0.5 }` puts it in the centre of the right half. It is
an off-axis view, not a shifted canvas, so nothing is cropped and the fit still frames the whole county
in the room the tighter side leaves. It travels from `focusFrom` (the centre unless set) to `focus`
over the stage window, and `focusNarrow` / `focusNarrowFrom` take over on narrow screens, where the
county usually wants the upper part of the screen with the copy below. Fractions, so it is responsive
by construction; the labels follow.

Drive it from scroll with a tall track and a sticky stage:

```html
<section class="track" style="height:600vh;position:relative">
  <div style="position:sticky;top:0;height:100vh">
    <div id="topo" style="width:100%;height:100%"></div>
  </div>
</section>
<script>TopoTurntable.mount('#topo', { approach: true, approachScroll: '.track' });</script>
```

…or drive it yourself: `mount()` resolves to an instance with `setProgress(t)`, a `progress`
getter, and a `state` getter (`{progress, distance, viewWidth, tilt, heading, fov}`) for readouts.

## How the world is built

Everything sits on one sphere, with the town's tangent point at the origin: the globe, the country
and state lines, the regional relief, the county-scale relief and the lines draped on it. At county
scale the sphere is flat to the eye; at continental scale the curvature is real. That is what lets
the descent be one continuous camera move rather than a flat map stitched to a globe.

Terrain comes at three levels, all from the same source family: `data/local.png` is 1-arc-second
SRTM resampled to 200 m over the county and about 22 km around it; `data/region.png` is Terrain
Tiles at 1 km over 600 × 500 km; `data/cont.png` is the same at 5 km over 5,800 × 3,300 km. Each is
Gaussian-smoothed so its contours read as landform, and stored as a 16-bit PNG of heights (R the
high byte, G the low) quantised to 0.25 / 0.5 / 1 m — 8 bits terraced gentle slopes into staircases
that every contour then hugged. The metadata that turns a pixel into metres is baked into the script.

The three reliefs are nested, and each is the ground wherever it is the finest one there: the
continental relief has a hole where the regional one is, the regional a hole where the fine one is,
and each hole's edge lies in the coarser grid's blended margin, so the two surfaces meet within a few
metres, in one colour. Each is drawn opaque under its lines, so a contour behind a ridge is hidden
rather than drawn through it. The contours are cut on the relief's own triangles (marching triangles,
not squares), so a line can never fall below the surface it sits on and come out dashed. The graticule
and the country outlines are draped the same way — on the continental relief where there is land, on
the sea-level sphere elsewhere — so they ride over the terrain rather than being buried under it.

The map has two visual levels and one contour field. By default (`contourLevels: 2`) every contour
is cut from the regional grid (10 m, 1 km cells, smoothed at 1.5 km), everywhere — the county included,
so the county never reads as a higher-resolution insert — and the sets from `coarseInterval` (100 m)
up are drawn quieter, in `coarseColor`, as the backbone the main sets fill in between. The county grid
(12.5 m, 200 m cells) is only used when `contourLevels: 3`, the earlier look. The continental grid is
relief and nothing else. Every contour is drawn by one material: one width, one depth rule. Each level's segments are traced into whole polylines, and a line's opacity is a product
of things that are either the same along its whole length or vary only very gradually across the map,
so a line is always either there, complete, or not: it fades in as one piece and never draws itself on.

- **Reveal.** Nothing at all wider than `revealStart`; full by `revealFull`; `revealSoftness` shapes
  the curve between. Driven by view width, not scroll progress.
- **Mask.** A wide feathered disc around the town (`localRadius`, `localFeather`): the detail belongs
  to the destination and distant terrain never acquires it. The feather is far wider than the frame at
  the reveal, so its edge is never seen.
- **Room.** Levels nest (a 100 m line is also a 200 m, 400 m … line), so each level is tagged with the
  coarsest set it belongs to, up to 1,600 m, and a set resolves in once its lines would fall
  `contourSpacing` pixels apart at the anchor. Nothing is ever replaced, only added between what is
  already there. The slope that decides it is one number per polyline (the mean along it), pulled toward
  the region's typical slope by `spacingTolerance`. In `progressive` mode each set fades in symmetrically
  in log-zoom around that width, `intervalBlend` soft, and nothing finer than `microInterval` is ever
  shown, so the coarse structure is the backbone and finer sets fill the gaps as you approach; the
  `existing` mode keeps the earlier linear ramp.
- **Length.** A polyline shorter than `minSegment` px on screen stays out, so no small loops or nibs.
- **Grids.** The regional grid's lines wait until its smoothing scale (1.5 km) spans a few pixels. With
  three levels, inside the county grid's extent they give way, over `handoffSoftness`, to the county
  grid's lines (same levels, from nearly the same heights) as *its* scale (250 m) does. Each grid's outer margin is
  blended toward the next coarser field and its lines fade across it, so no level ends where its data does.

All of this is by pixels per metre, not by scroll progress, so it stays right if the track or the lens
changes. `debug: 'intervals'` colours every contour set differently and `debug: 'grids'` colours the
three reliefs and their lines by grid, for tuning only.
first frame, so the globe is on screen while it happens, and the pixel ratio is capped at 1.5.

There are no index lines; the state lines stay, in the muted colour, at every scale, with the state names either side of the line, turned with the map, from about 500 km down. Nashville, Knoxville and Louisville come in a step before the county's name, so the county arrives with its neighbours already placed.

## Styling the labels with your own classes

`labelClass` puts your classes on the town labels, `cityLabelClass` on the cities and
`countyLabelClass` on the county's name, so the type is styled once in your stylesheet rather
than repeated in every embed:

```js
TopoTurntable.mount('#topo', {
  labelClass: 'text-size-tiny text-weight-bold text-style-allcaps text-color-alternate'
});
```

The classes own the label completely — the script writes no inline font or colour that could
override them (a colour option passed explicitly alongside a class is the one exception: it is
still written, for a colour the class list cannot express), and its own defaults (letter-spacing, padding) sit at zero specificity so any
class beats them. The county's dot, leader and outline read their colour back off the styled
name, so a theme switch moves the mark with the type. (`countyColor` set to anything but
`'label'` breaks that link and colours the outline on its own.)

The state names are labels like the towns' (`groundLabelClass`, which defaults to `labelClass`),
but rotated on screen so their baseline follows the state line as the map turns, the way a name
printed on a paper map would; they never flip upside down. They sit a fixed distance from the
line in ems, so they hug it from the first time it is legible down to the landing.

In Webflow, those need to be real classes in the site stylesheet: style them on any element in
the Designer (a hidden one is fine) so they survive publishing, then name them here.

## Sizing in Webflow

The script fills whatever box the container is given, and re-fits whenever that box changes. It
only needs the page to give the container a width. Inside a horizontal flex row, that means
setting the **Embed** element to `flex: 1` (grow if possible, shrink if needed) or giving it a
width — a flex child left at the default `flex: 0 1 auto` is sized by its content, and the
container has none of its own. Without that the script falls back to a width derived from
`aspectRatio`, capped at the nearest ancestor that has one, which renders correctly but cannot
follow the layout as closely.

## Highways and waterways

`roads: true` and `water: true` add the state highways and the rivers, draped on the terrain.
**Coverage ends about 10 km from Gainesboro** — the OpenStreetMap extract was made for the old
12-mile view and does not reach the county line. Extending it needs a machine that can reach the
Overpass API; the query is the bounding box of `data/local.png` (lon −86.10 to −85.25, lat 36.01
to 36.72) for `highway=primary|secondary|trunk` and `waterway=river|stream`, projected to local
metres about 36.35972, −85.65472 and densified to ~80 m. Until then they are off by default.

## Notes

- ~75 KB script; `data/` is ~1.1 MB (cont.png 476 KB, region.png 274 KB, local.png 153 KB, lines.json 218 KB, ~120 KB gzipped) — the PNGs are already compressed. The globe is on screen as soon as the script and `cont.png` are in; the rest is cut after the first frame. three.js r128 loads from cdnjs automatically if the page doesn't already have `THREE`.
- Pauses rendering when scrolled out of view; honours `prefers-reduced-motion` (stays still, and the descent follows the scroll without damping).
- Performance: a standard depth buffer (the logarithmic one writes gl_FragDepth, which disables early-Z and hidden-surface removal on tile-based mobile GPUs), reliefs cut into tiles so the camera frustum culls what is off screen (about 1.3 M triangles a frame from orbit, 0.5 M at the landing frame), the continental relief drawn at 10 km since it carries no contours, a frame rendered only when something changed (a stopped scroll costs nothing), and on touch devices no MSAA and a 1.25 pixel-ratio cap (1.5 elsewhere).
- Terrain: SRTM 1-arc-second (NASA) and Terrain Tiles (Mapzen / AWS Open Data). County: Census cartographic boundary, 1:500k. Countries: Natural Earth 1:110M world, 1:50M North America. The county outline follows the river; the elevation is the true large-scale shape of the terrain, not survey-grade detail.

## iso-marks.js: the flag, the conveyor and the shield

A second, much smaller script for the little line-work objects in the ethos cards. Same stack, same
look: an orthographic camera at an isometric angle, flat faces in one colour, edges drawn as lines,
colours from CSS variables so they follow the theme. The camera never moves; each object is framed
once so that every state of its animation fits its box.

```html
<div id="flag" class="ethos-card_mark"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@22d3c1c/iso-marks.js"></script>
<script>
  IsoMarks.flag('#flag', { hover: 'closest:.ethos-card' });       // the mark, extruded; on hover it splits into three flags
  IsoMarks.conveyor('#belt', { hover: 'closest:.ethos-card' });   // a belt out of a gate; every hover runs it one box along
  IsoMarks.shield('#shield', { hover: 'closest:.ethos-card' });   // the shield mark; its bands step forward on hover
</script>
```

Both take `hover` (the element whose hover drives them: a selector, `closest:.card` for an ancestor of the
host, or an element; the host by default; keyboard focus counts, and on touch a tap stands in),
`seconds` (0.7: every hover animation runs this long, on one cubic ease-in-out curve), `azimuth` and
`elevation` (45 and 30 by default; 35.264 is true isometric), `margin`, `shade` (0 keeps every face
the same colour, 0.08 lightens the tops), and the colours `faceColor`, `lineColor`, `background`,
which default to `--iso-face`, `--iso-line` and `--iso-bg` and fall back to the map's own
`--topo-block` and `--topo-label`, so an embed that defines the map's variables gets the map's
colours: faces in the page background (only the edges show, and near faces hide far ones, as the
relief hides contours), lines in the label colour.

**The flag** lies flat and is extruded up into a block (`depth`, 0.7 of its width). On hover the block
becomes `slices` (3) flags, each `plate` (0.045 of the width, about the conveyor belt's thickness), at
the bottom, the top and evenly between; the lower ones slide out toward the viewer, on the axis the
shield's bands step along (`slide`, 0.35 of the width for the bottom one, proportionally less above,
the top stays put). Each slice travels straight
between its two transforms, thinning as it goes, so the block's silhouette is there throughout the
return and the last stretch is gap-closing; the lines along the cuts fade with the gaps they border,
so the slices fuse rather than stack. `stagger` (0.85) is each layer's share of the run: 1 moves every
layer together, less lets the top lead on the way apart. The mark's polygons are
traced from the reference render; pass `mark: { polys, width, height }` (polygons in flag units, u
across from the hoist, v down from the top) to use the real SVG's shapes.

**The conveyor** shows `boxes` (2) on the belt: one nosing out of the gate, then one per `pitch`
(1.45 belt widths), with lines across the belt every `dividers` (0.36) that travel with it, and a row of
little roller squares along its near side every `rollers` (0.3); each box wears a strip of `tape` (0.16 wide)
along the belt direction, folded down its ends. Every hover advances the belt one box: the front box is clipped away at the end of
the belt, shortening to nothing as it passes, and the next comes through the gate. It never runs
backwards, and hovers queue, so a second hover mid-cycle runs it a second box along.

**The shield** is `shield.svg` (four nested chevron bands, baked into the script) standing upright like
a badge and extruded back (`depth`, 0.22 of its width). On hover the bands step forward one after
another, outer band first (`stagger`, 0.55), the innermost standing `rise` (0.5 of the width) proud,
and step back flush when the pointer leaves. Pass `mark: { polys, width, height }` for another mark.

## drone-hero.js: the drone, on a scroll-driven camera move onto a motor

The heavy-lift drone model (`heavy_lift_drone_model.glb`, in this repo: HWI's own, with the HWI-2207 motor
shell, ~2.6 MB, 95k triangles) for the hero. It is drawn as
lines found on screen: a first pass writes each pixel's normal, depth and part, a second draws a
one-pixel line wherever those jump — silhouettes and creases alike, the same weight everywhere, with
nothing behind showing through; each mesh carries its own id, so where two parts meet on screen the
nearer one draws the line, however close their depths. The landing-gear struts, which the model
stops short, are carried on down to the skids. The motors' casings (base, coil, cap, shaft) draw in the
primary colour with vertical ribs round them; everything else in the secondary. The ribs and the floor
grid are drawn as screen-space quads with their own coverage, so they stay antialiased at any width. The model's propellers
are replaced with generated blades (tapered, twisted, a real section), which turn as the page
scrolls, neighbours counter-rotating. A floor grid fades toward the frame's edges.

With `inspect` set, an inspection follows the arrival: the `runEnd` section's own scroll (make it four or
five viewports tall, with its content sticky inside) carries the camera through three poses. The whole path
is one curve — from the page's top, through the arrival and the poses — so the approach runs straight on into
the inspection without a stop, and the camera only eases to rest after the last pose. By default the first
pose is a touch further round and up from the arrival, and closes in until the motor fills the frame, so the
camera drifts on while everything but the focused motor fades away (`isolate`, a window of the section's scroll; null = the first pose's window, so it is that stage's move; the floor grid stays — with `crossfade`,
the default, the frame is drawn twice while it fades, with the rest of the drone and without, and the two are
blended, so its lines, its faces' cover of the grid and ribs behind them, and the motor's outline where its arms
cross it all dissolve at the one rate and nothing pops when it leaves; `crossfade: false` fades only its lines
and leaves its geometry in the way until it is gone), the second is
the motor's profile from the drone's left, dead level, passed through rather than held, and the third lifts up
and further round to the left to reveal a row of copies of the motor behind it (`copies`: how many, their
spacing in housing diameters, and the window over which they fade in, null = the opening 40% of the last
pose's window; they sit exactly behind the motor along the profile's line of sight and fade in just as the
camera leaves it, so they emerge from behind it as it swings on up, and each further one is dimmer, so the
row fades into the distance). The heading and the
height of the default poses run one way (the heading keeps turning, the height keeps rising), which is what
keeps the curve moving: two neighbouring keys with the same value — a pose equal to the arrival, or a `hold`
— bring the camera to rest there. The focused motor is the whole stack at `focus`'s position — both rings of
a coaxial pair — so what is drawn in the primary colour under the housing stays and is copied with it; the
ring named is the one the framing, the ribs and the callouts are about. A pose's `zoomNarrow` is its zoom on
screens up to `breakpoint` (the top-level `zoomNarrow` likewise for the arrival), where the frame is tall and
narrow and the copy sits below the motor. Each pose has a window of that scroll (`windows`; the first window's start is the end
of the intro) in which its feature row is active (`[data-inspect="1"]`.. rows get `is-active`, each row gets
`--inspect-fill`, 0-1 through its window, for a progress bar, and `--inspect-active`, 1 while it is the
active one — it inherits, so a child's styles can follow it where the class can't reach — and a `drone:reach` event as the scroll reaches
its window, `drone:unreach` on the way back up past it; with `click` a click on a row scrolls the page to its
window); the camera moves from the previous pose to this one over its window, arriving as the window ends
(or at the pose's `at`; or it rests on the pose over the pose's `hold` window, if one should be held), so each
stage's move begins and ends with its row's bar; over the last window (`easeOut`, of the section's scroll)
the camera's progress is eased out on top of the curve's own flat end, so the last stage comes to rest
softly, and a pose can
shift the look-at point toward the drone's centre (`centre`) or elsewhere in the frame (`point`, and
`pointNarrow` up to `breakpoint`; without one, a pose on a narrow screen uses the top-level narrow point,
since its `point` is for the wide layout); a pose value of null is the arrival's. With `callouts`, each window also shows a callout on the housing (a straight
leader to a small square with the pose's `label` above it, as the topo map's county marker; `leader`, `dot`,
`hotspotClass`). The poses, the windows, `settle` and the rows selector are all in `inspect`; see `INSPECT`
in the source for the defaults. The inspection runs on every screen size; up to `breakpoint` the fill is written in steps of 0.02.

**On phones and tablets (up to `breakpoint`, 991px) the inspection is stepped** (`inspect.steps`: `'narrow'` by
default, `true` for every screen, `false` for the scrubbed inspection everywhere). The approach still follows the
scroll; once the drone has arrived, the copy scrolls normally under a docked band and the camera moves in discrete
states — the arrival, then pose 01, 02, 03, the same poses as the scrub — each tweened to (`tween`, 1000 ms, on a
sine ease-in-out; a jump of several states takes a third longer per extra state) when its row's top rises above `line` (0.68 of the
viewport's height), and back when it drops below `line + hysteresis` (0.1), so a row hovering on the line never
flickers. Rows are watched with IntersectionObservers: nothing reads the scroll once the end element has gone by (the
props stop turning with it), and there is no animation loop at all while nothing moves — frames are asked for only
while the approach catches up with the scroll, a state or the dock moves, or the props or the flag turn. With `follow: 'scroll'` the camera instead follows the
scroll between the states (damped, as the approach is): it is at pose k exactly as row k's top meets the line and
moves on pro rata towards the next, the last row past the line is the active one and its bar fills on the way to the
next — a smooth scrub in the same layout (the rows' places are read on each scroll event then, and the canvas draws
while the scroll moves); `'tween'`, the default, is the stepped behaviour above. The rows get
the same classes, custom properties and events as in the scrub: `is-active` and `--inspect-active` on the state's row,
`--inspect-fill` filling with its move (full on the rows before), `drone:reach` / `drone:unreach` as states are
reached and left. As the drone arrives the canvas docks to the top `dock` (0.5) of its height: the view is cropped to
the band at once (the camera and its projection never change, so neither does the perspective, and at the arrival
the copy's top meets the band's bottom, so the switch is invisible; `pointNarrow`'s y wants to be about half of
`dock` to sit in the band's middle), the canvas is resized to it (it draws only what shows) and takes a background
(`dockBackground`; by default the nearest ancestor's background colour) so the copy disappears under it; while
docked the track, the host and any `[data-drone-dock]` element inside the track carry `dockClass` (`is-docked`,
so e.g. labels over the band can be styled as a combo class), and the canvas may draw at up to `dockPixelRatio` (3)
— the band is half the pixels. The props'
idle turn (`propSeconds`) stops with the approach, so the docked canvas is at rest between moves. With `prefers-reduced-motion` the states
and the dock switch instantly. The page's side, up to the breakpoint: the sticky holder only the band's height (the canvas inside it
still the full height, so the hero is full-screen; the holder then stays pinned until the section's end has passed
under it, and leaves with it), the end element at the top of its section, the copy padded down by the band's height
with a background of its own, and the section over the canvas until docked and under it after
(`.is-docked .section { z-index: -1 }`), so the copy covers the drone as it rises and slides under the band once
docked; the sticky holder `pointer-events: none` so the copy stays tappable.

The camera is a real one and moves: with `track` set, it dollies along a path over that section's
scroll, from the whole aircraft centred, dead level and head-on, round and down to beneath the front-left
motor, looking up at it from its outer side with the rest of the drone above and behind. The target slides from the drone's centre to the
motor, the distance eases in log space, the heading and height ease between the two ends, and the
framing point with them, so it reads as one continuous move rather than a zoom. The scroll is
damped, so a fast flick cannot expose an intermediate frame. Without a track it holds the end view.

```html
<section class="section_hero">                  <!-- ~200svh tall: the track -->
  <div class="hero_sticky">                     <!-- sticky, one viewport tall -->
    <div id="drone" class="hero_drone"></div>   <!-- absolute, inset 0, behind the copy -->
    …the copy…
  </div>
</section>
<script src="https://cdn.jsdelivr.net/gh/volentecreative/hwi-topo@075786c/drone-hero.js"></script>
<script>DroneHero.mount('#drone', { track: 'closest:.section_hero' });</script>
```

Options: `focus` (the motor the path ends on: FL by default; FR, BR, BL, or `'FL 2'` for the lower ring of
a coaxial pair. The script reads two namings from the model: parts named for their position — "Motor Base
FL", "Arm FR", "Propeller BL 2" — and parts grouped under an "Arm FL".. node and named as the engineer's
export names them: the bell (the housing the ribs go round), base, shaft and flux ring of an "HWI-…"
motor, its bell fillers (a filler that sits below the base is the arm's mount, and goes with the arm), and
the propeller's blades, hub, washer and nut. A part whose transform mirrors it — a negative scale, as two
of HWI's arms have, being mirrored copies — is turned right side out as it is read, so it draws like the
others rather than inside-out. In HWI's model the positions are named from the pilot's seat,
so the motor on the drone's front-right as the camera sees it from the front is `'FR'`); `tilt` (degrees the
drone is pitched nose-down about its centre at the top of the page, 0, as if under way; it levels out over
the approach and arrives flat — the drone rides in a group pivoted on its centre, so the propellers keep
spinning on their own axes) and `floor`
(how far the floor grid sits below the drone's lowest point, in motor heights, 0 = resting on it — lift the
drone if a low arrival elevation would take the camera under the floor);
`track`, `runEnd` (a selector inside the track for the element whose top reaching the canvas ends the
path, e.g. the section the drone arrives in, so the canvas can stay pinned across more than one section)
and `damping` (0.12); `fov` (30°) and `fovNarrow` (null: on screens up to `breakpoint`, the field of view the lens widens
to over the approach, from `fov` at the top of the page to this at the arrival, and holds after; the camera keeps its
distance, so more of the scene shows rather than the perspective changing). Headings are about the drone: 0 = from the front, positive
= round to its right, negative = round to its left. The end of the path: `azimuth` (−28°; or
`'auto'` = side-on to the focused arm, swung round by `turn`), `elevation` (−14°, from below),
`zoom` (the motor's height as a fraction of the frame's, 0.36), `point` and `pointNarrow` (where the
ribbed casing sits in the frame at the end; the narrow one up to `breakpoint`, 991px), `startPoint` and
`startPointNarrow` (where the whole drone's centre sits at the start; a y above 1 puts it below the frame so
only its top peeks in). `progressVar` (`--drone-progress`) names a CSS custom property the eased, damped
progress (0-1) is written to on the track and the host, so the page's own copy can move with the camera
from the style panel, e.g. `left: calc(50% + var(--drone-progress, 0) * 25%)`. `scrollVar` (`--drone-scroll`) is the same as `progressVar` but undamped, straight from the scroll position, for
anything that must never lag the page. `arriveEvent` (`drone:arrive`) and `leaveEvent` (`drone:leave`) are DOM events dispatched on the `runEnd` element
as the path arrives there and as the scroll takes it back up, for the page's own scripts to start on. `exitVar` (off by default; e.g. `--drone-exit`) is a second
property that runs 0-1 over the last viewport of the track's scroll, as the pinned canvas begins to leave with
the track's end, for fading the canvas out before the next section: e.g. `opacity: calc(1 - var(--drone-exit, 0) * 2.5)`. The start: `startAzimuth` (0,
the front), `startElevation` (0°, level), `margin` (1.25 round the whole drone, which
is fitted to the frame from that heading). Also
`propScroll` (turns per 1000px scrolled, 0.35), `propSeconds` (idle turn, 0 = still) and `propPhase` (the propellers' starting angle in degrees, the same for all so they read as a set; null = each at random — a three-blade seen from the front with a blade pointing at the camera shows that blade's pitch as a twisted stub over the hub, so a shared angle keeps the set looking alike); `props`
(`'blades'`: two blades generated in place of the model's, or `'model'`: the model's own propellers, turning about their hubs), `blades`, `bladeChord`, `bladeTwist`; `depthEdge` (0.012), `normalEdge` (0.25, as 1 − cos of the angle between neighbouring normals that draws a crease) and `normalEdgeMotor` (the same on the motors alone, the focused one, the others and the copies; null = normalEdge. HWI's motor bell has shallow slots with rounded edges that only show from about 0.08, and the motors are the only place that low a threshold is wanted); `grid` (cell in motor heights, 1)
and `gridFade` (0.3; the grid also fades out toward its own edge, all round), `gridExtent` (24 motor
heights from the drone's centre) and `gridWidth` (1px); `ribs`
(24 per motor housing, along its straight wall, with a rim line round each end of the wall), `ribWidth` (1px)
and `ribOpacity` (0.8); `primaryIn` (`[from, to]`: the window of the path's progress
over which the motors go from the secondary colour to the primary; null = primary throughout);
`flag` (false: an American flag hung behind the drone in the same line work, its cloth occluding like the
rest and its stripes, canton and stars drawn on the surface, waving slowly as if in a light breeze and moving
in perspective with the camera), with `flagWidth` (37 model units), `flagBottom` (2), `flagZ` (−22), `flagX`
(0), `flagSway` (0.04 of its height), `flagSeconds` (16 per wave), `flagOpacity` (0.85) and `flagFade` (`[0.5, 0.85]`: the window of the path's
progress over which the flag fades away, so the close-up never shows its edge cut across the frame; null = never); `lineWidth` (1px), `depthEdge` (0.012) and
`normalEdge` (0.25);
`supersample` (2: the edge pass runs at twice the canvas resolution and averages, so the lines are
antialiased; the faces, ribs and grid are multisampled), `pixelBudget` (8 million pixels: the most the
edge pass holds at once; a bigger frame is rendered in tiles, so the quality never drops) and
`pixelRatioCap` (2), `msaa` (false: the lines carry their own antialiasing, so multisampling the canvas only costs fill), and on touch devices `pixelRatioCapCoarse` (1.5) and `fpsCoarse` (30: at most this many
frames a second, so the page's own scrolling keeps its frames). The canvas is only resized when its size really changes, the hotspots and CSS custom properties are only written when
they change, and the custom properties are not written at all up to `breakpoint`: on phones, style changes round a sticky
element can make it re-sync mid-scroll; and
the colours `primary`, `secondary`, `gridColor` (the floor grid, falling back to the secondary), `face`,
`background`, from `--drone-primary`, `--drone-secondary`, `--drone-grid`,
`--drone-face`, `--drone-bg` with the map's `--topo-label`, `--topo-label-secondary` and
`--topo-block` as fallbacks. The model loads from beside the script (`model` overrides), and the
GLTF loader from jsDelivr's copy of three r128 (`loader` overrides). `onProgress` (null) is called as the load goes, with
`{ loaded, total, scripts, built }`: the model's bytes so far and its size (0 when the server does not say, or
the transfer is compressed), how many of the two scripts (three.js, the loader) are in, and `built` once the drone
is drawn, so a page's preloader can show real progress; `mount()` itself resolves once the drone is built.

## webflow/: the home-draft page's own code

Readable copies of the custom code on the Webflow page `home-draft`, kept here so changes can be reviewed. They
are pasted into Webflow by hand (or through the Webflow API); Webflow holds the live copies.

- `home-draft-head.html`: Page settings, custom code, head. The CDN preconnects, the docked-band styles, the
  rule that hides the band's labels while the mobile menu is open, and the first-visit preloader
  (`window.hwPreloader`: the drone embed reports its load to it, and the scramble embed waits on `hwPreloader.done`).
- `embed-hero-drone.html`: the Embed in `.hero-drone_canvas` (drone-hero.js, with `onProgress` wired to the preloader).
- `embed-scramble.html`: the Embed at the end of the page (scramble.js 2.5, whose runs wait for the preloader).

- `contact-footer.html`: Page settings, custom code, footer, on `contact`: opens the contact modal on arrival.

### The contact modal

The contact form is the `contact-modal` component, placed at the end of `.page-wrapper` on every page with the navbar
(Home Draft, Contact, Privacy Policy, Terms of Use). It is a narthex modal (`vci-modal="dialog"`, key `contact`,
`vci-modal-enter="rise"`): a centred dialog at every width, phones included, never a bottom sheet. The navbar's two
Contact buttons, the footer's Contact links and the Contact page's button carry `vci-modal="open" vci-modal-key="contact"`
and keep `href="/contact"` as the fallback without JavaScript; `?modal=contact` on any of those pages opens it on load.
`data-lenis-prevent` on the host lets the wheel scroll the dialog while Lenis is stopped.

The form inside is the original Contact form (moved, not rebuilt), validated by narthex's `form` module (v0.6.0+):
each `.form_field-wrapper` is `vci-form="field"` with a `.form_field-message` (`vci-form="message"`). A field turns
`is-valid` as soon as its value is good: white border and outline (`.form_input.is-valid`, text-01, so it inverts
in the light theme) and its field's call sign in the message (`vci-form-valid-text`: Copy that / Comms confirmed /
Roger / Ready to transmit). It turns `is-invalid` (dashed border, the browser's reason as the message) only once it
has been edited and left, or a send was tried; a send with anything invalid never reaches Webflow.

Cloudflare Turnstile (site key `0x4AAAAAAFSaJhdnoR4pxeKS`, action `contact`) renders in `.form_turnstile`
(`vci-form="turnstile"`) the first time the dialog opens, and Send waits for its token. It follows the site's theme
toggle through `vci-form-theme` on `<html>` (set by the theme script in Site settings, head).
`vci-form-response-field="false"` keeps the token out of Webflow's submission data, because Webflow's form handler
cannot check it: the widget stops bots that drive the page, but one that posts straight to Webflow's form endpoint is
not stopped until a server verifies the token (a Worker in front of the submission, with the widget's secret).

The site-wide code (Lenis, the theme toggle, the navbar height variable, image focus points and the older
scramble.js v6) is in Site settings, custom code, and the nav comes from the `narthex` repo.
