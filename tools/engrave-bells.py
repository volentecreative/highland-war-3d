"""Rebuild the drone's motor bells: the 24 slots in the wall go, and the smooth wall that replaces them carries the
HWI mark engraved on one side and a starless American flag on the other.

    python tools/engrave-bells.py <slotted.glb> <out.glb> ['{"logoAz": -40, "flagAz": -130}']
    gltfpack -i <out.glb> -o heavy_lift_drone_model.meshopt.glb -cc -noq -kn     # gltfpack 0.22 (npm i gltfpack@0.22.0)

The input is the model as the engineer exported it, with the slots: `git show be27eae:heavy_lift_drone_model.glb`.
Needs numpy, trimesh, manifold3d, pygltflib, shapely, svgpathtools, triangle (pip).

Works in the bell's own (local) frame, where all four bells share one geometry: axis +Z, wall radius 250, the
straight wall from z 5.10 to 209.18 (the slots ran from 13.61 to 190.48). Each bell keeps its node, name and
transform; its slotted wall is replaced by a smooth one that meets the fillets above and below vertex for vertex,
and the engravings' floors and walls go in a mesh of their own, a sibling node named "Bell Filler Engraving" (the
hero draws a line wherever one mesh meets another, so the art always outlines, even seen square on; and the name
puts it with the motor in drone-hero.js's part reading, as one of the bell's fillers, so it turns primary and stays
when the rest of the drone dissolves). Only the front-right motor (the hero's focus) carries the art; the other three
get the smooth wall alone, and stay one shared mesh in the packed file.

Settings (the optional JSON): logoAz / flagAz, the camera headings the mark and the flag face on the FR motor, in
the hero's convention (0 = the front, negative = round to its left; the mark 0, straight ahead; the flag 180, straight back);
markH / flagH, their heights on the wall (the wall is 204 tall); depth (5); only ('FR', a comma list of the arms whose motors carry the art).
"""
import sys, json, struct, numpy as np, trimesh, manifold3d, pygltflib
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from svgpathtools import parse_path

SRC, OUT = sys.argv[1], sys.argv[2]
P = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

R = 250.0                       # outer wall radius
Z0, Z1 = 13.61, 190.48          # the slots' span
W0, W1 = 5.102041, 209.18367    # the straight wall's span, at R (the strips between the slots ran its full height)
DEPTH = P.get('depth', 5.0)     # engraving depth (the old slots were 2.4; the solid wall behind is 6)
SEG = 288                       # segments round the ring's hidden inner wall (the outer wall takes the original's own vertices)
MARK_H = P.get('markH', 135.0)  # the mark's height on the wall
FLAG_H = P.get('flagH', 88.0)   # the flag's height (13 stripes)
LOGO_AZ = P.get('logoAz', 0.0)     # the heading the mark faces on the FR motor, in the hero's camera convention (0 = the drone's front, negative = round to its left): straight ahead
FLAG_AZ = P.get('flagAz', 180.0)   # the flag's: straight back, opposite the mark

MARK_D = ('M46.5 0H28.66V8.5H36.07V36.82H44.58V8.5H48L51.98 11.83V4.59L46.51 0H46.5Z'
          'M76.37 2.34H71.7L51.96 18.87V64.21L60.46 71.32V22.82L67.86 16.64V64.9L76.36 57.75V9.19L80.61 5.9L76.36 2.34H76.37Z'
          'M0 5.9L4.25 9.19V57.74L12.75 64.89V16.63L20.15 22.81V71.3L28.65 64.19V18.87L8.92 2.34H4.25L0 5.9Z'
          'M44.57 44.23H36.06V67.65L26.04 76.04L31.97 80.97H48.65L54.58 76.04L44.56 67.67V44.24L44.57 44.23Z')

def mark_shape():
    """The HWI mark (the preloader's path) as polygons in (s, z): s along the wall, z up, centred on 0."""
    polys = []
    for sub in parse_path(MARK_D).continuous_subpaths():
        pts = [(seg.start.real, seg.start.imag) for seg in sub]
        poly = Polygon(pts).buffer(0)
        if not poly.is_empty: polys.append(poly)
    u = unary_union(polys)
    minx, miny, maxx, maxy = u.bounds; k = MARK_H / (maxy - miny)
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    from shapely import affinity
    u = affinity.translate(u, -cx, -cy); u = affinity.scale(u, k, -k, origin=(0, 0))   # SVG y runs down
    return u

def flag_shape():
    """A starless flag: the canton as one recess and the seven red stripes, a small gap between them."""
    h = FLAG_H / 13.0; w = FLAG_H * 1.9; cw = w * 0.4; gap = h * 0.35
    x0, y1 = -w / 2, FLAG_H / 2
    parts = [box(x0, y1 - 7 * h, x0 + cw, y1)]                                  # canton
    for i in range(0, 13, 2):                                                   # stripes 1, 3 .. 13 (the red ones)
        top = y1 - i * h; bot = top - h
        left = x0 + cw + gap if i < 7 else x0
        parts.append(box(left, bot, x0 + w, top))
    return unary_union(parts)

def cutter(shape2d, theta_c, mirror):
    """A solid that cuts shape2d into the wall, wrapped round the cylinder at angle theta_c (local), DEPTH deep.
    Each polygon is triangulated with a size limit (so its faces follow the curve) and closed into a prism by hand,
    so the solid is watertight by construction."""
    import triangle as tr
    meshes = []
    for poly in getattr(shape2d, 'geoms', [shape2d]):
        poly = poly.segmentize(P.get("seg", 10.0))
        verts, segs, holes = [], [], []
        for ring in [poly.exterior] + list(poly.interiors):
            pts = list(ring.coords)[:-1]; base = len(verts); verts += pts
            segs += [(base + k, base + (k + 1) % len(pts)) for k in range(len(pts))]
        for ring in poly.interiors: holes.append(Polygon(ring).representative_point().coords[0])
        A = dict(vertices=np.array(verts), segments=np.array(segs))
        if holes: A['holes'] = np.array(holes)
        T = tr.triangulate(A, 'pqa%f' % (P.get("area", 120.0)))
        V2, F2 = T['vertices'], T['triangles']
        # boundary edges: the triangulation's edges used by exactly one triangle
        e = np.sort(np.vstack([F2[:, [0, 1]], F2[:, [1, 2]], F2[:, [2, 0]]]), axis=1)
        uniq, cnt = np.unique(e, axis=0, return_counts=True); bnd = uniq[cnt == 1]
        n = len(V2)
        V3 = np.vstack([np.column_stack([V2, np.zeros(n)]), np.column_stack([V2, np.ones(n)])])
        faces = [F2[:, ::-1], F2 + n] + [np.array([[a_, b_, b_ + n], [a_, b_ + n, a_ + n]]) for a_, b_ in bnd]
        m = trimesh.Trimesh(V3, np.vstack(faces), process=True); m.fix_normals()
        assert m.is_watertight, 'cutter not watertight'
        s_, zz, w = m.vertices[:, 0], m.vertices[:, 1], m.vertices[:, 2]
        if mirror: s_ = -s_
        rr = (R - DEPTH) + w * (DEPTH + 2.0)                        # from the engraving's floor to 2 units outside
        th = theta_c + s_ / R
        m.vertices = np.column_stack([rr * np.cos(th), rr * np.sin(th), zz + (W0 + W1) / 2])
        m.fix_normals()
        meshes.append(m)
    return trimesh.util.concatenate(meshes)

def to_manifold(m):
    return manifold3d.Manifold(manifold3d.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))

def ring(edge):
    """The new wall: a thin solid ring, outer radius R, the straight wall's full height (W0..W1). Its outline round the
    circle is the original's own vertices at the wall's ends (edge: their angles), and only those, so it meets the
    fillets above and below edge for edge, without a crack."""
    th = np.unique(np.round(edge, 6))
    outer = np.column_stack([R * np.cos(th), R * np.sin(th)])
    t2 = np.linspace(0, 2 * np.pi, SEG, endpoint=False)[::-1]; inner = np.column_stack([(R - 6.0) * np.cos(t2), (R - 6.0) * np.sin(t2)])
    cs = manifold3d.CrossSection([outer, inner], manifold3d.FillRule.EvenOdd)
    return manifold3d.Manifold.extrude(cs, W1 - W0).translate([0, 0, W0])

# ---------------------------------------------------------------------------------------------------------------
g = pygltflib.GLTF2().load(SRC)
blob = bytearray(g.binary_blob())
parent = {c: i for i, n in enumerate(g.nodes) for c in (n.children or [])}

def node_local(n):
    if n.matrix: return np.array(n.matrix, float).reshape(4, 4).T
    t = n.translation or [0, 0, 0]; x, y, z, w = n.rotation or [0, 0, 0, 1]; s = n.scale or [1, 1, 1]
    Rm = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    T = np.eye(4); T[:3, :3] = Rm @ np.diag(s); T[:3, 3] = t; return T

def world(i):
    M = node_local(g.nodes[i]); p = parent.get(i)
    while p is not None: M = node_local(g.nodes[p]) @ M; p = parent.get(p)
    return M

def read(acc_i):
    a = g.accessors[acc_i]; bv = g.bufferViews[a.bufferView]
    n = {pygltflib.SCALAR: 1, pygltflib.VEC3: 3}[a.type]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[a.componentType]
    off = (bv.byteOffset or 0) + (a.byteOffset or 0)
    return np.frombuffer(bytes(blob[off:off + a.count * n * np.dtype(dt).itemsize]), dt).reshape(-1, n) if n > 1 else \
           np.frombuffer(bytes(blob[off:off + a.count * np.dtype(dt).itemsize]), dt)

def append(data, target):
    while len(blob) % 4: blob.append(0)
    off = len(blob); blob.extend(data)
    g.bufferViews.append(pygltflib.BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=target))
    return len(g.bufferViews) - 1

mark2d, flag2d = mark_shape(), flag_shape()
def az_dir(az): a = np.radians(az); return np.array([np.sin(a), 0.0, np.cos(a)])   # the hero's camera: (sin az, ., cos az)
logo_dir = az_dir(LOGO_AZ)
def place(L):
    """For a bell whose local-to-world rotation is L: the local angles at which the mark and the flag face their headings,
    and whether each must be mirrored to read the right way round from outside."""
    Linv = np.linalg.inv(L)
    def local_angle(d_world):
        d = Linv @ d_world; return np.arctan2(d[1], d[0])
    def mirrored(th):   # does increasing local angle run to the viewer's left, seen from outside?
        t_world = L @ np.array([-np.sin(th), np.cos(th), 0.0])
        out = L @ np.array([np.cos(th), np.sin(th), 0.0]); right = np.cross(-out, [0, 1, 0])
        return float(np.dot(t_world, right)) < 0
    a, b = local_angle(az_dir(LOGO_AZ)), local_angle(az_dir(FLAG_AZ))
    return a, mirrored(a), b, mirrored(b)

# ONLY: the motors (by arm) that carry the art, placed for the front-right motor (the one the hero inspects); the
# others get the smooth wall alone. Default: the FR motor only.
ONLY = [a.strip() for a in str(P.get('only', 'FR')).split(',') if a.strip()]
bells = [i for i, n in enumerate(g.nodes) if n.mesh is not None and 'BELL' in (n.name or '')]
def arm_of(i):   # the "Arm FR".. node above a part, as the hero reads it
    while i is not None:
        if (g.nodes[i].name or '').startswith('Arm '): return g.nodes[i].name[4:]
        i = parent.get(i)
report = []
for ni, node in enumerate(list(g.nodes)):
    if node.mesh is None or 'BELL' not in (node.name or ''): continue
    W = world(ni); L = W[:3, :3]; det = np.linalg.det(L)
    prim = g.meshes[node.mesh].primitives[0]
    pos = read(prim.attributes.POSITION).astype(float); nor = read(prim.attributes.NORMAL).astype(float)
    idx = read(prim.indices).reshape(-1, 3).astype(np.int64)
    # 1. drop the slotted wall: every face lying wholly within the wall's span, out at the wall
    zf = pos[idx][:, :, 2]; rf = np.hypot(pos[idx][:, :, 0], pos[idx][:, :, 1])
    drop = (zf.min(1) >= Z0 - 0.05) & (zf.max(1) <= Z1 + 0.05) & (rf.mean(1) > 239.0)
    drop |= (zf.min(1) >= W0 - 0.05) & (zf.max(1) <= W1 + 0.05) & (rf.min(1) >= R - 0.05)   # and the strips of wall between them
    keep = idx[~drop]
    # 2. where the mark and flag sit on the wall, and which way round they read
    th_logo, m_logo, th_flag, m_flag = place(L)
    art = arm_of(ni) in ONLY
    # 3. the new wall, engraved
    pr = np.hypot(pos[:, 0], pos[:, 1]); at_edge = (pr > R - 0.05) & ((np.abs(pos[:, 2] - W0) < 0.01) | (np.abs(pos[:, 2] - W1) < 0.01))
    wall = ring(np.arctan2(pos[at_edge, 1], pos[at_edge, 0]))
    if art: wall = wall - (to_manifold(cutter(mark2d, th_logo, m_logo)) + to_manifold(cutter(flag2d, th_flag, m_flag)))
    wm = wall.to_mesh(); band = trimesh.Trimesh(np.asarray(wm.vert_properties)[:, :3], np.asarray(wm.tri_verts), process=True)
    # the ring's inner wall and its two end faces are sealed inside the bell and never seen: drop them
    c = band.triangles_center; fn = band.face_normals; rc = np.hypot(c[:, 0], c[:, 1])
    hidden = (rc < R - DEPTH - 1.0) | ((np.abs(c[:, 2] - W0) < 0.02) | (np.abs(c[:, 2] - W1) < 0.02)) & (np.abs(fn[:, 2]) > 0.99)
    band.update_faces(~hidden); band.remove_unreferenced_vertices()
    c = band.triangles_center; fn = band.face_normals; rc = np.hypot(c[:, 0], c[:, 1])
    radial = (fn[:, 0] * c[:, 0] + fn[:, 1] * c[:, 1]) / np.maximum(rc, 1e-9)
    surface = (rc > R - 0.3) & (radial > 0.99)
    cut = band.submesh([np.nonzero(~surface)[0]], append=True) if art else None; band = band.submesh([np.nonzero(surface)[0]], append=True)
    if art: cut.unmerge_vertices()
    band.unmerge_vertices()                       # flat: each face its own normal (the wall's facets are 1.25 degrees apart)
    # 4. merge: the kept faces of the original, and the band
    used = np.unique(keep); remap = -np.ones(len(pos), np.int64); remap[used] = np.arange(len(used))
    P_ = np.vstack([pos[used], band.vertices]); N_ = np.vstack([nor[used], np.repeat(band.face_normals, 3, axis=0)])
    F_ = np.vstack([remap[keep], band.faces + len(used)])
    P_ = P_.astype(np.float32); N_ = (N_ / np.linalg.norm(N_, axis=1, keepdims=True)).astype(np.float32)
    big = len(P_) > 65535
    F_ = F_.astype(np.uint32 if big else np.uint16).ravel()
    bvP = append(P_.tobytes(), pygltflib.ARRAY_BUFFER); bvN = append(N_.tobytes(), pygltflib.ARRAY_BUFFER); bvI = append(F_.tobytes(), pygltflib.ELEMENT_ARRAY_BUFFER)
    g.accessors.append(pygltflib.Accessor(bufferView=bvP, componentType=5126, count=len(P_), type=pygltflib.VEC3, min=P_.min(0).tolist(), max=P_.max(0).tolist()))
    aP = len(g.accessors) - 1
    g.accessors.append(pygltflib.Accessor(bufferView=bvN, componentType=5126, count=len(N_), type=pygltflib.VEC3)); aN = len(g.accessors) - 1
    g.accessors.append(pygltflib.Accessor(bufferView=bvI, componentType=5125 if big else 5123, count=len(F_), type=pygltflib.SCALAR)); aI = len(g.accessors) - 1
    prim.attributes.POSITION, prim.attributes.NORMAL, prim.indices = aP, aN, aI
    if art:
        # the engravings' floors and walls: a mesh of their own beside the bell (same parent, same transform), so the hero's
        # line pass, which draws wherever one part meets another, always outlines them, even seen square on; named as one of
        # the bell's fillers, which drone-hero.js reads as part of the motor
        CP = cut.vertices.astype(np.float32); CN = np.repeat(cut.face_normals, 3, axis=0).astype(np.float32); CF = cut.faces.astype(np.uint32 if len(CP) > 65535 else np.uint16).ravel()
        b1 = append(CP.tobytes(), pygltflib.ARRAY_BUFFER); b2 = append(CN.tobytes(), pygltflib.ARRAY_BUFFER); b3 = append(CF.tobytes(), pygltflib.ELEMENT_ARRAY_BUFFER)
        g.accessors.append(pygltflib.Accessor(bufferView=b1, componentType=5126, count=len(CP), type=pygltflib.VEC3, min=CP.min(0).tolist(), max=CP.max(0).tolist()))
        g.accessors.append(pygltflib.Accessor(bufferView=b2, componentType=5126, count=len(CN), type=pygltflib.VEC3))
        g.accessors.append(pygltflib.Accessor(bufferView=b3, componentType=5125 if len(CP) > 65535 else 5123, count=len(CF), type=pygltflib.SCALAR))
        n_acc = len(g.accessors)
        g.meshes.append(pygltflib.Mesh(primitives=[pygltflib.Primitive(attributes=pygltflib.Attributes(POSITION=n_acc - 3, NORMAL=n_acc - 2), indices=n_acc - 1, mode=4)]))
        eng = pygltflib.Node(name='Bell Filler Engraving', mesh=len(g.meshes) - 1,
                             matrix=node.matrix, translation=node.translation, rotation=node.rotation, scale=node.scale)
        g.nodes.append(eng); g.nodes[parent[ni]].children.append(len(g.nodes) - 1)
    report.append(f'{node.name} ({arm_of(ni)}): mirrored={det < 0} dropped {drop.sum()} faces, wall {len(band.faces)}, engraving {len(cut.faces) if art else 0}, bell now {len(F_) // 3} (was {len(idx)})')

# compact: only the accessors still in use are kept (the old bells' data goes), each in a buffer view of its own
used = sorted({a for m in g.meshes for p in m.primitives for a in [p.indices, *[v for v in vars(p.attributes).values() if isinstance(v, int)]] if a is not None})
amap = {a: k for k, a in enumerate(used)}; nb = bytearray(); views, accs = [], []
for a in used:
    acc = g.accessors[a]; bv = g.bufferViews[acc.bufferView]
    n = {pygltflib.SCALAR: 1, pygltflib.VEC2: 2, pygltflib.VEC3: 3, pygltflib.VEC4: 4}[acc.type] * {5126: 4, 5125: 4, 5123: 2, 5121: 1}[acc.componentType]
    assert not bv.byteStride or bv.byteStride == n, 'interleaved data'
    off = (bv.byteOffset or 0) + (acc.byteOffset or 0)
    while len(nb) % 4: nb.append(0)
    views.append(pygltflib.BufferView(buffer=0, byteOffset=len(nb), byteLength=acc.count * n, target=bv.target))
    nb.extend(blob[off:off + acc.count * n]); acc.bufferView = len(views) - 1; acc.byteOffset = 0; accs.append(acc)
for m in g.meshes:
    for p in m.primitives:
        p.indices = amap[p.indices] if p.indices is not None else None
        for k, v in vars(p.attributes).items():
            if isinstance(v, int): setattr(p.attributes, k, amap[v])
g.accessors, g.bufferViews = accs, views
g.buffers[0].byteLength = len(nb)
g.set_binary_blob(bytes(nb))
g.save_binary(OUT)
print('\n'.join(report))
