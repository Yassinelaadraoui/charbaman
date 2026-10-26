"""Convert a glTF/GLB model into a small, vertex-coloured mesh module for the game.

Usage:
  python3 scripts/convert-model.py <model.gltf|glb> <out.ts> <EXPORT_NAME> [--tris 3000] [--credit "..."]
Needs: pip install trimesh numpy pillow (plus pyfqmr scipy for --method qem)

Every vertex takes the colour of its texture at its UV (or its flat material colour), so the
textures become vertex colours. The mesh is then vertex-clustered (positions and colours
averaged per grid cell) until it is under --tris triangles.
Output is in metres, base on y=0, centred on x/z.
"""
import argparse
import json

import numpy as np
import trimesh

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('dst')
ap.add_argument('name')
ap.add_argument('--tris', type=int, default=3000)
ap.add_argument('--credit', default='')
ap.add_argument('--method', choices=['cluster', 'qem'], default='cluster',
                help='qem keeps shapes better on clean meshes; cluster is robust on messy scans')
args = ap.parse_args()


def vertex_colors(mesh):
    vis = mesh.visual
    n = len(mesh.vertices)
    if getattr(vis, 'kind', None) == 'vertex':
        return np.asarray(vis.vertex_colors, dtype=float)[:, :3] / 255.0
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
        elif tex is not None:
            base = np.array([1.0, 1.0, 1.0])
    uv = getattr(vis, 'uv', None)
    if tex is None or uv is None or len(uv) != n:
        return np.tile(base, (n, 1))
    img = np.asarray(tex.convert('RGB').resize((256, 256)), dtype=float) / 255.0
    h, w = img.shape[:2]
    c = np.asarray(uv) % 1.0
    x = np.clip((c[:, 0] * w).astype(int), 0, w - 1)
    y = np.clip(((1 - c[:, 1]) * h).astype(int), 0, h - 1)
    return img[y, x] * base


def cluster(v, col, f, cell):
    """Snap vertices to a grid and merge each cell, averaging position and colour.
    Robust on messy, non-manifold meshes where edge-collapse decimators stall."""
    keys = np.floor(v / cell).astype(np.int64)
    uniq, inverse = np.unique(keys, axis=0, return_inverse=True)
    inverse = inverse.reshape(-1)
    cnt = np.bincount(inverse, minlength=len(uniq))[:, None]
    nv = np.zeros((len(uniq), 3))
    nc = np.zeros((len(uniq), 3))
    np.add.at(nv, inverse, v)
    np.add.at(nc, inverse, col)
    nv /= cnt
    nc /= cnt
    nf = inverse[f]
    keep = (nf[:, 0] != nf[:, 1]) & (nf[:, 1] != nf[:, 2]) & (nf[:, 0] != nf[:, 2])
    nf = nf[keep]
    _, idx = np.unique(np.sort(nf, axis=1), axis=0, return_index=True)
    nf = nf[np.sort(idx)]
    used = np.unique(nf)
    remap = np.full(len(nv), -1)
    remap[used] = np.arange(len(used))
    return nv[used], nc[used], remap[nf]


scene = trimesh.load(args.src, force='scene')
meshes = [m for m in scene.dump(concatenate=False) if isinstance(m, trimesh.Trimesh) and len(m.faces)]
verts, faces, cols, off = [], [], [], 0
for m in meshes:
    verts.append(np.asarray(m.vertices))
    faces.append(np.asarray(m.faces) + off)
    cols.append(vertex_colors(m))
    off += len(m.vertices)
allv = np.vstack(verts)
allf = np.vstack(faces)
allc = np.vstack(cols)
lo, hi = allv.min(axis=0), allv.max(axis=0)
size = hi - lo
centre = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
allv = allv - centre

if args.method == 'qem':
    # Weld seams first (texture seams split vertices), then quadric-simplify the shape and give each
    # remaining vertex the colour of the nearest original vertex.
    import pyfqmr
    from scipy.spatial import cKDTree
    wv, wc, wf = cluster(allv, allc, allf, float(size.max()) / 2000)
    simp = pyfqmr.Simplify()
    simp.setMesh(wv, wf)
    simp.simplify_mesh(target_count=args.tris, aggressiveness=5, preserve_border=False, verbose=False)
    v, f, _ = simp.getMesh()
    # Each new vertex averages the original vertices closest to it, so walls get their overall
    # colour instead of whatever texel a single vertex happened to land on.
    _, owner = cKDTree(v).query(allv)
    c = np.zeros((len(v), 3))
    np.add.at(c, owner, allc)
    cnt = np.bincount(owner, minlength=len(v))[:, None]
    _, near = cKDTree(allv).query(v)
    c = np.where(cnt > 0, c / np.maximum(cnt, 1), allc[near])
else:
    # Grow the clustering grid until the model is under the triangle budget.
    cell = float(size.max()) / 150
    v, c, f = cluster(allv, allc, allf, cell)
    while len(f) > args.tris:
        cell *= 1.12
        v, c, f = cluster(allv, allc, allf, cell)

# Many scanned/stylised textures are dark once flattened; lift them so the brightest
# tenth of the model sits near white under the game's flat lighting.
lum = c.mean(axis=1)
c = np.clip(c * min(2.2, 0.92 / max(np.percentile(lum, 90), 1e-3)), 0, 1)

print(f'{args.name}: {len(allf)} -> {len(f)} tris, size {np.round(size, 2).tolist()}')
data = {
    'size': [round(float(x), 3) for x in size],
    'p': [round(float(x), 3) for x in v.reshape(-1)],
    'c': [int(x) for x in np.clip(c * 255, 0, 255).round().reshape(-1)],
    'i': [int(x) for x in f.reshape(-1)],
}
with open(args.dst, 'w') as fh:
    fh.write('// Generated by scripts/convert-model.py. Do not edit by hand.\n')
    if args.credit:
        fh.write(f'// {args.credit}\n')
    fh.write("import type { ModelData } from './types';\n\n")
    fh.write(f'export const {args.name}: ModelData = ')
    fh.write(json.dumps(data, separators=(',', ':')))
    fh.write(';\n')
