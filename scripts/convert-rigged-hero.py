"""Convert a rigged glTF/GLB character into the game's skinned hero module, repainted as Charbaman.

Usage:
  python3 scripts/convert-rigged-hero.py <hero.glb> src/game/three/heroRigged.ts [--credit "..."]
Needs: pip install numpy pillow

Keeps the mesh, UVs and skin weights (up to 4 bones per vertex) as they are, packs the material
textures into one 1024 px atlas and recolours it: dark suit -> orange, red -> silver, gold trims
stay gold. Bones are written with their rest transforms and inverse bind matrices; everything
above the first joint is folded into the root bone. The game animates the bones in code.
"""
import argparse
import base64
import colorsys
import io
import json
import struct

import numpy as np
from PIL import Image, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('dst')
ap.add_argument('--credit', default='')
ap.add_argument('--erase', nargs='*', default=[], help='x0,y0,x1,y1 atlas rectangles to paint plain suit orange '
                '(for logos you do not want)')
args = ap.parse_args()

raw = open(args.src, 'rb').read()
jlen = struct.unpack('<I', raw[12:16])[0]
gl = json.loads(raw[20:20 + jlen])
blen = struct.unpack('<I', raw[20 + jlen:24 + jlen])[0]
binbuf = raw[28 + jlen:28 + jlen + blen]
COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def accessor(i):
    a = gl['accessors'][i]
    bv = gl['bufferViews'][a['bufferView']]
    dt = np.dtype(COMP[a['componentType']])
    n = NCOMP[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', dt.itemsize * n)
    out = np.empty((a['count'], n), dt)
    for k in range(a['count']):
        out[k] = np.frombuffer(binbuf, dt, n, off + k * stride)
    if a.get('normalized') and dt != np.float32:
        out = out.astype(np.float32) / np.iinfo(dt).max
    return out


def image(i):
    bv = gl['bufferViews'][gl['images'][i]['bufferView']]
    o = bv.get('byteOffset', 0)
    return Image.open(io.BytesIO(binbuf[o:o + bv['byteLength']])).convert('RGB')


def local(node):
    if 'matrix' in node:
        return np.array(node['matrix']).reshape(4, 4).T
    t = np.array(node.get('translation', [0, 0, 0]))
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    s = np.array(node.get('scale', [1, 1, 1]))
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4)
    m[:3, :3] = r * s
    m[:3, 3] = t
    return m


nodes = gl['nodes']
parent = {}
for i, nd in enumerate(nodes):
    for c in nd.get('children', []):
        parent[c] = i


def world(i):
    m = local(nodes[i])
    while i in parent:
        i = parent[i]
        m = local(nodes[i]) @ m
    return m


def decompose(m):
    t = m[:3, 3]
    s = np.linalg.norm(m[:3, :3], axis=0)
    r = m[:3, :3] / s
    w = np.sqrt(max(1e-9, 1 + r[0, 0] + r[1, 1] + r[2, 2])) / 2
    q = [(r[2, 1] - r[1, 2]) / (4 * w), (r[0, 2] - r[2, 0]) / (4 * w), (r[1, 0] - r[0, 1]) / (4 * w), w]
    return t, np.array(q), s


skin = gl['skins'][0]
joints = skin['joints']
jindex = {n: k for k, n in enumerate(joints)}
ibm = accessor(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major -> row-major
bones = []
for k, n in enumerate(joints):
    p = parent.get(n)
    if p in jindex:
        m, par = local(nodes[n]), jindex[p]
    else:
        m, par = world(n), -1  # fold everything above the skeleton into the root bone
    t, q, s = decompose(m)
    bones.append({'name': nodes[n].get('name', f'b{k}'), 'parent': par,
                  't': [round(float(x), 6) for x in t], 'q': [round(float(x), 6) for x in q], 's': [round(float(x), 6) for x in s]})

# Mesh: all primitives of skinned mesh nodes, textures packed into a 2x2 atlas.
ATLAS = 1024
cell = ATLAS // 2
atlas = Image.new('RGB', (ATLAS, ATLAS))
pos, uv, ji, jw, idx = [], [], [], [], []
slot = 0
for nd in nodes:
    if 'mesh' not in nd or 'skin' not in nd:
        continue
    for prim in gl['meshes'][nd['mesh']]['primitives']:
        a = prim['attributes']
        p = accessor(a['POSITION']).astype(np.float64)
        t = accessor(a['TEXCOORD_0']).astype(np.float64) % 1.0
        mat = gl['materials'][prim['material']]
        tex = mat['pbrMetallicRoughness']['baseColorTexture']['index']
        img = image(gl['textures'][tex]['source']).resize((cell, cell), Image.LANCZOS)
        cx, cy = (slot % 2) * cell, (slot // 2) * cell
        atlas.paste(img, (cx, cy))
        # Atlas rows run top-down and v = row / size (DataTexture, flipY off): glTF v is already top-down.
        t = np.stack([(cx + t[:, 0] * (cell - 1) + 0.5) / ATLAS, (cy + t[:, 1] * (cell - 1) + 0.5) / ATLAS], axis=1)
        base = sum(len(x) for x in pos)
        pos.append(p)
        uv.append(t)
        ji.append(accessor(a['JOINTS_0']).astype(np.int64))
        jw.append(accessor(a['WEIGHTS_0']).astype(np.float64))
        idx.append(accessor(prim['indices']).reshape(-1) + base)
        slot += 1
pos, uv, ji, jw, idx = np.vstack(pos), np.vstack(uv), np.vstack(ji), np.vstack(jw), np.concatenate(idx)
jw = jw / np.maximum(jw.sum(axis=1, keepdims=True), 1e-9)

# Rest-pose skinned positions, to measure height and facing.
jworld = {}
for k, b in enumerate(bones):
    m = np.eye(4)
    tq = b['q']
    m = local({'translation': b['t'], 'rotation': tq, 'scale': b['s']})
    jworld[k] = (jworld[b['parent']] @ m) if b['parent'] >= 0 else m
skinmats = np.array([jworld[k] @ ibm[k] for k in range(len(bones))])
ph = np.c_[pos, np.ones(len(pos))]
rest = np.zeros((len(pos), 3))
for c in range(4):
    rest += jw[:, c:c + 1] * np.einsum('nij,nj->ni', skinmats[ji[:, c]], ph)[:, :3]
lo, hi = rest.min(axis=0), rest.max(axis=0)
print('rest bounds', np.round(lo, 3), np.round(hi, 3))

# Repaint: dark suit -> orange, red -> silver, gold stays. Smooth away fine pattern lines.
px = np.asarray(atlas, dtype=np.float64) / 255
soft = np.asarray(atlas.filter(ImageFilter.MedianFilter(7)), dtype=np.float64) / 255
hsv = np.array([colorsys.rgb_to_hsv(*c) for c in soft.reshape(-1, 3)]).reshape(soft.shape)
h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
out = px.copy()
red = ((h < 0.04) | (h > 0.93)) & (s > 0.45) & (v > 0.18)
gold = (h > 0.06) & (h < 0.17) & (s > 0.3) & (v > 0.3)
dark = ~red & ~gold
shade = np.clip(0.55 + 1.6 * soft.mean(axis=2), 0.55, 1.1)[..., None]
out[dark] = (np.array([1.0, 0.42, 0.0]) * shade)[dark]
out[red] = (np.array([0.88, 0.89, 0.92]) * np.clip(0.75 + v, 0.75, 1.1)[..., None])[red]
for r in args.erase:
    x0, y0, x1, y1 = map(int, r.split(','))
    out[y0:y1, x0:x1] = np.array([1.0, 0.42, 0.0]) * shade[y0:y1, x0:x1]
out = np.clip(out, 0, 1)
img = Image.fromarray((out * 255).round().astype(np.uint8))
img.save(args.dst + '.png')
jpg = io.BytesIO()
img.save(jpg, 'JPEG', quality=85)

b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
pmin = pos.min(axis=0)
span = np.maximum(pos.max(axis=0) - pmin, 1e-9)
wq = np.round(jw * 255).astype(np.int64)
wq[np.arange(len(wq)), wq.argmax(axis=1)] += 255 - wq.sum(axis=1)  # weights still sum to 1
data = {
    'min': [float(x) for x in pmin],
    'span': [float(x) for x in span],
    'pos': b64(np.round((pos - pmin) / span * 65535).astype('<u2')),
    'uv': b64(np.round(np.clip(uv, 0, 1) * 65535).astype('<u2')),
    'joints': b64(ji.astype(np.uint8)),
    'weights': b64(wq.astype(np.uint8)),
    'index': b64(idx.astype('<u2')),
    'bones': bones,
    'ibm': [round(float(x), 6) for x in ibm.transpose(0, 2, 1).reshape(-1)],  # column-major like three
    'restMin': [round(float(x), 4) for x in lo],
    'restMax': [round(float(x), 4) for x in hi],
    'jpeg': base64.b64encode(jpg.getvalue()).decode(),
}
assert len(pos) < 65536 and len(bones) < 256
print(f'{len(idx) // 3} tris, {len(pos)} verts, {len(bones)} bones, {sum(len(x) for x in data.values() if isinstance(x, str)) // 1024} KB')
with open(args.dst, 'w') as fh:
    fh.write('// Generated by scripts/convert-rigged-hero.py. Do not edit by hand.\n')
    if args.credit:
        fh.write(f'// {args.credit}\n')
    fh.write('export type RiggedHeroData = {\n  min: number[];\n  span: number[];\n  pos: string;\n  uv: string;\n'
             '  joints: string;\n  weights: string;\n  index: string;\n'
             '  bones: { name: string; parent: number; t: number[]; q: number[]; s: number[] }[];\n'
             '  ibm: number[];\n  restMin: number[];\n  restMax: number[];\n  jpeg: string;\n};\n\n')
    fh.write('export const RIGGED_HERO: RiggedHeroData = ')
    fh.write(json.dumps(data, separators=(',', ':')))
    fh.write(';\n')
