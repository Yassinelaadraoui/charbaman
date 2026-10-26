"""Bake a glTF/GLB model into a small textured mesh module for the game.

Usage:
  python3 scripts/bake-model.py <model.gltf|glb> <out.ts> <EXPORT_NAME> [--tris 2500] [--atlas 512] [--credit "..."]
Needs: pip install trimesh numpy pillow pyfqmr scipy

The shape is quadric-simplified to --tris triangles. Then every triangle gets its own patch of a
texture atlas, filled by looking up the colour of the original, full-detail model at each texel
(its textures or flat material colours). So windows, liveries and carvings survive even though
the mesh is tiny. Bigger triangles get bigger patches.

Output (all base64): positions as uint16 within the bounding box, UVs as uint16, and the atlas as
a JPEG. Metres, base on y=0, centred on x/z.
"""
import argparse
import base64
import json
import io

import numpy as np
import pyfqmr
import trimesh
from PIL import Image
from scipy.spatial import cKDTree

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('dst')
ap.add_argument('name')
ap.add_argument('--tris', type=int, default=2500)
ap.add_argument('--atlas', type=int, default=512)
ap.add_argument('--samples', type=int, default=3_000_000)
ap.add_argument('--quality', type=int, default=80)
ap.add_argument('--credit', default='')
args = ap.parse_args()
rng = np.random.default_rng(1)


def material_source(mesh):
    """(texture as float array or None, base colour 0..1) for a mesh."""
    vis = mesh.visual
    mat = getattr(vis, 'material', None)
    base = np.array([0.8, 0.8, 0.8])
    tex = None
    if mat is not None:
        tex = getattr(mat, 'baseColorTexture', None)
        if tex is None:
            tex = getattr(mat, 'image', None)
        factor = getattr(mat, 'baseColorFactor', None)
        if factor is None:
            factor = getattr(mat, 'main_color', None)
        if factor is not None:
            f = np.array(factor[:3], dtype=float)
            base = f / 255.0 if f.max() > 1.0 else f
    if getattr(vis, 'kind', None) == 'vertex':
        return None, None
    uv = getattr(vis, 'uv', None)
    if tex is None or uv is None or len(uv) != len(mesh.vertices):
        return None, base
    tex = tex.convert('RGB')
    if max(tex.size) > 1024:
        tex = tex.resize((1024, 1024))
    return np.asarray(tex, dtype=np.float32) / 255.0, base


# 1. Dense colour samples on the original surface.
scene = trimesh.load(args.src, force='scene')
meshes = [m for m in scene.dump(concatenate=False) if isinstance(m, trimesh.Trimesh) and len(m.faces)]
areas = np.array([m.area for m in meshes])
pts, cols, nrms = [], [], []
for m, a in zip(meshes, areas):
    n = max(200, int(args.samples * a / areas.sum()))
    p, fi = trimesh.sample.sample_surface(m, n, seed=int(rng.integers(1 << 30)))
    tex, base = material_source(m)
    if tex is None and base is None:  # vertex colours
        vc = np.asarray(m.visual.vertex_colors, dtype=float)[:, :3] / 255.0
        c = vc[m.faces[fi]].mean(axis=1)
    elif tex is None:
        c = np.tile(base, (len(p), 1))
    else:
        bary = trimesh.triangles.points_to_barycentric(m.triangles[fi], p)
        uv = (np.asarray(m.visual.uv)[m.faces[fi]] * bary[:, :, None]).sum(axis=1) % 1.0
        h, w = tex.shape[:2]
        x = np.clip((uv[:, 0] * w).astype(int), 0, w - 1)
        y = np.clip(((1 - uv[:, 1]) * h).astype(int), 0, h - 1)
        c = tex[y, x] * base
    pts.append(p)
    cols.append(c)
    nrms.append(m.face_normals[fi])
pts = np.vstack(pts)
cols = np.vstack(cols)
nrms = np.vstack(nrms)

# 2. Simplify the shape (pre-cluster huge meshes so the simplifier stays quick).
allv = np.vstack([m.vertices for m in meshes])
off = np.cumsum([0] + [len(m.vertices) for m in meshes[:-1]])
allf = np.vstack([m.faces + o for m, o in zip(meshes, off)])
lo, hi = allv.min(axis=0), allv.max(axis=0)
size = hi - lo
centre = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
allv = allv - centre
pts = pts - centre


def weld(v, f, cell):
    keys = np.floor(v / cell).astype(np.int64)
    uniq, inv = np.unique(keys, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    nv = np.zeros((len(uniq), 3))
    np.add.at(nv, inv, v)
    nv /= np.bincount(inv)[:, None]
    nf = inv[f]
    keep = (nf[:, 0] != nf[:, 1]) & (nf[:, 1] != nf[:, 2]) & (nf[:, 0] != nf[:, 2])
    return nv, nf[keep]


cell = float(size.max()) / 4000
v, f = weld(allv, allf, cell)
while len(f) > 400_000:
    cell *= 1.4
    v, f = weld(allv, allf, cell)
simp = pyfqmr.Simplify()
simp.setMesh(v, f)
simp.simplify_mesh(target_count=args.tris, aggressiveness=5, preserve_border=False, verbose=False)
v, f, _ = simp.getMesh()
T = v[f]  # (n, 3, 3)
n = len(T)
fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
farea = np.linalg.norm(fn, axis=1) / 2
fn = fn / (np.linalg.norm(fn, axis=1)[:, None] + 1e-12)

# 3. Pack: pair triangles of similar size into square cells, cell side ~ sqrt(area), shelf-packed.
A = args.atlas
order = np.argsort(-farea)
pairs = [order[i:i + 2] for i in range(0, n, 2)]
want = np.array([np.sqrt(farea[p].max()) for p in pairs])


def pack(scale):
    sides = np.maximum(3, np.round(want * scale)).astype(int)
    x = y = row = 0
    pos = []
    for s in sides:
        if x + s > A:
            x, y, row = 0, y + row, 0
        pos.append((x, y, s))
        x += s
        row = max(row, s)
    return pos, y + row


lo_s, hi_s = 0.0, A / max(want.min(), 1e-9)
for _ in range(40):
    mid = (lo_s + hi_s) / 2
    if pack(mid)[1] <= A:
        lo_s = mid
    else:
        hi_s = mid
cells, _ = pack(lo_s)

# 4. Bake: every texel of a cell maps back to a point on its triangle(s); take the colour of the
# nearest original surface sample that faces the same way.
uvs = np.zeros((n, 3, 2))
tex_pts, tex_n, tex_xy = [], [], []
for (cx, cy, s), p in zip(cells, pairs):
    jj, ii = np.mgrid[0:s, 0:s]
    a = (ii.ravel() + 0.5) / s
    b = (jj.ravel() + 0.5) / s
    upper = a + b > 1
    for k, t in enumerate(p):
        if k == 0:
            sel = ~upper if len(p) == 2 else np.ones_like(upper)
            aa, bb = a[sel], b[sel]
            uvs[t] = [(cx + 0.5, cy + 0.5), (cx + s - 0.5, cy + 0.5), (cx + 0.5, cy + s - 0.5)]
        else:
            sel = upper
            aa, bb = 1 - a[sel], 1 - b[sel]
            uvs[t] = [(cx + s - 0.5, cy + s - 0.5), (cx + 0.5, cy + s - 0.5), (cx + s - 0.5, cy + 0.5)]
        P = T[t, 0] + aa[:, None] * (T[t, 1] - T[t, 0]) + bb[:, None] * (T[t, 2] - T[t, 0])
        tex_pts.append(P)
        tex_n.append(np.tile(fn[t], (len(P), 1)))
        tex_xy.append(np.stack([cx + ii.ravel()[sel], cy + jj.ravel()[sel]], axis=1))
tex_pts = np.vstack(tex_pts)
tex_n = np.vstack(tex_n)
tex_xy = np.vstack(tex_xy)
K = 8
_, idx = cKDTree(pts).query(tex_pts, k=K)
facing = np.abs((nrms[idx] * tex_n[:, None, :]).sum(axis=2)) > 0.3
best = np.where(facing.any(axis=1), facing.argmax(axis=1), 0)
colour = cols[idx[np.arange(len(idx)), best]]
# Many of these textures are dark once lit flatly; lift them so the brightest tenth sits near white.
lum = colour.mean(axis=1)
colour = np.clip(colour * min(1.8, 0.85 / max(np.percentile(lum, 90), 1e-3)), 0, 1)
atlas = np.zeros((A, A, 3))
atlas[tex_xy[:, 1], tex_xy[:, 0]] = colour
img = Image.fromarray((atlas * 255).round().astype(np.uint8))
jpg = io.BytesIO()
img.save(jpg, 'JPEG', quality=args.quality)

# 5. Write.
b64 = lambda a: base64.b64encode(a.tobytes()).decode()
span = np.maximum(T.reshape(-1, 3).max(axis=0) - T.reshape(-1, 3).min(axis=0), 1e-6)
pmin = T.reshape(-1, 3).min(axis=0)
qp = np.round((T.reshape(-1, 3) - pmin) / span * 65535).astype('<u2')
quv = np.round(uvs.reshape(-1, 2) / A * 65535).astype('<u2')
data = {
    'size': [round(float(x), 3) for x in size],
    'min': [round(float(x), 5) for x in pmin],
    'span': [round(float(x), 5) for x in span],
    'pos': b64(qp),
    'uv': b64(quv),
    'atlas': A,
    'jpeg': base64.b64encode(jpg.getvalue()).decode(),
}
print(f'{args.name}: {len(allf)} -> {n} tris, size {np.round(size, 2).tolist()}, '
      f'{sum(len(x) for x in data.values() if isinstance(x, str)) // 1024} KB')
with open(args.dst, 'w') as fh:
    fh.write('// Generated by scripts/bake-model.py. Do not edit by hand.\n')
    if args.credit:
        fh.write(f'// {args.credit}\n')
    fh.write("import type { BakedModel } from './types';\n\n")
    fh.write(f'export const {args.name}: BakedModel = ')
    fh.write(json.dumps(data, separators=(',', ':')))
    fh.write(';\n')
