"""Build the game's skinned hero from a rigged body, a running clip and the Charbaman skin of an earlier hero.

Usage:
  python3 scripts/reskin-hero.py <body.glb> <run.glb> <skin.ts> src/game/three/heroRigged.ts [--credit "..."]
Needs: pip install numpy pillow scipy trimesh rtree

body.glb   a rigged character in a T-pose (Biped-style bone names such as "bip L Thigh")
run.glb    the same rig with a looping run; it is sampled into frames and matched to the body by bone name
skin.ts    a hero module made earlier (by this script or scripts/convert-rigged-hero.py) whose painted
           Charbaman suit is transferred onto the new body

Skin transfer: the new skeleton is bent into the old hero's rest pose (limb by limb, so the arms hang the
same way), both bodies are lined up and scaled to the same height, and every triangle of the new body gets
its own patch of a fresh atlas filled with the colour of the nearest point on the old hero, looking only at
the same body part (left arm to left arm and so on) so limbs never borrow the torso's colours.
"""
import argparse
import base64
import io
import json
import re
import struct

import numpy as np
import trimesh
from PIL import Image
from scipy.spatial import cKDTree

ap = argparse.ArgumentParser()
ap.add_argument('body')
ap.add_argument('run')
ap.add_argument('skin')
ap.add_argument('dst')
ap.add_argument('--frames', type=int, default=20, help='frames sampled from one loop of the run')
ap.add_argument('--atlas', type=int, default=1024)
ap.add_argument('--credit', default='')
args = ap.parse_args()
rng = np.random.default_rng(1)
COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load_glb(path):
    raw = open(path, 'rb').read()
    jlen = struct.unpack('<I', raw[12:16])[0]
    gl = json.loads(raw[20:20 + jlen])
    blen = struct.unpack('<I', raw[20 + jlen:24 + jlen])[0]
    return gl, raw[28 + jlen:28 + jlen + blen]


def accessor(gl, buf, i):
    a = gl['accessors'][i]
    bv = gl['bufferViews'][a['bufferView']]
    dt = np.dtype(COMP[a['componentType']])
    n = NCOMP[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', dt.itemsize * n)
    rows = np.lib.stride_tricks.as_strided(np.frombuffer(buf, np.uint8, offset=off),
                                           shape=(a['count'], dt.itemsize * n), strides=(stride, 1))
    out = np.frombuffer(rows.copy().tobytes(), dt).reshape(a['count'], n)
    if a.get('normalized') and dt != np.float32:
        out = out.astype(np.float32) / np.iinfo(dt).max
    return out.astype(np.float64) if dt == np.float32 else out


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def trs(t, q, s):
    m = np.eye(4)
    m[:3, :3] = quat_mat(q) * np.asarray(s)
    m[:3, 3] = t
    return m


def node_trs(node):
    if 'matrix' in node:
        return decompose(np.array(node['matrix']).reshape(4, 4).T)
    return np.array(node.get('translation', [0, 0, 0]), float), np.array(node.get('rotation', [0, 0, 0, 1]), float), \
        np.array(node.get('scale', [1, 1, 1]), float)


def mat_quat(r):
    w = np.sqrt(max(1e-9, 1 + r[0, 0] + r[1, 1] + r[2, 2])) / 2
    if w > 0.1:
        return np.array([(r[2, 1] - r[1, 2]) / (4 * w), (r[0, 2] - r[2, 0]) / (4 * w), (r[1, 0] - r[0, 1]) / (4 * w), w])
    # Near 180 degrees: take the largest diagonal term instead.
    i = int(np.argmax(np.diag(r)))
    j, k = (i + 1) % 3, (i + 2) % 3
    s = np.sqrt(max(1e-9, 1 + r[i, i] - r[j, j] - r[k, k])) * 2
    q = np.zeros(4)
    q[i] = s / 4
    q[j] = (r[j, i] + r[i, j]) / s
    q[k] = (r[k, i] + r[i, k]) / s
    q[3] = (r[k, j] - r[j, k]) / s
    return q / np.linalg.norm(q)


def decompose(m):
    s = np.linalg.norm(m[:3, :3], axis=0)
    return m[:3, 3].copy(), mat_quat(m[:3, :3] / s), s


def parents(gl):
    return {c: i for i, nd in enumerate(gl['nodes']) for c in nd.get('children', [])}


def world_of(gl, par, i, local):
    m = local(i)
    while i in par:
        i = par[i]
        m = local(i) @ m
    return m


bare = lambda name: re.sub(r'_\d+$', '', name or '')

# 1. The body: bones (everything above the skeleton folded into the root bone), mesh and skin weights.
gl, buf = load_glb(args.body)
par = parents(gl)
skin = gl['skins'][0]
joints = skin['joints']
jindex = {n: k for k, n in enumerate(joints)}
ibm = accessor(gl, buf, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
names = [gl['nodes'][n].get('name', f'b{k}') for k, n in enumerate(joints)]
bparent, rest = [], []
for k, n in enumerate(joints):
    p = par.get(n)
    if p in jindex:
        bparent.append(jindex[p])
        rest.append(node_trs(gl['nodes'][n]))
    else:
        bparent.append(-1)
        rest.append(decompose(world_of(gl, par, n, lambda i: trs(*node_trs(gl['nodes'][i])))))

pos, uv0, ji, jw, idx = [], [], [], [], []
for nd in gl['nodes']:
    if 'mesh' not in nd or 'skin' not in nd:
        continue
    for prim in gl['meshes'][nd['mesh']]['primitives']:
        a = prim['attributes']
        base = sum(len(x) for x in pos)
        pos.append(accessor(gl, buf, a['POSITION']))
        ji.append(accessor(gl, buf, a['JOINTS_0']).astype(np.int64))
        jw.append(accessor(gl, buf, a['WEIGHTS_0']))
        idx.append(accessor(gl, buf, prim['indices']).reshape(-1) + base)
pos, ji, jw, idx = np.vstack(pos), np.vstack(ji), np.vstack(jw), np.concatenate(idx)
jw = jw / np.maximum(jw.sum(axis=1, keepdims=True), 1e-9)
tri = idx.reshape(-1, 3)


def bone_worlds(locals_, parent):
    out = [None] * len(locals_)
    for k, m in enumerate(locals_):  # parents always come before children in these skins
        out[k] = m if parent[k] < 0 else out[parent[k]] @ m
    return out


def skin_positions(worlds, ibm_, p, ji_, jw_):
    mats = np.array([w @ b for w, b in zip(worlds, ibm_)])
    ph = np.c_[p, np.ones(len(p))]
    out = np.zeros((len(p), 3))
    for c in range(4):
        out += jw_[:, c:c + 1] * np.einsum('nij,nj->ni', mats[ji_[:, c]], ph)[:, :3]
    return out


rest_local = [trs(*r) for r in rest]
rest_world = bone_worlds(rest_local, bparent)
rest_pos = skin_positions(rest_world, ibm, pos, ji, jw)
lo, hi = rest_pos.min(axis=0), rest_pos.max(axis=0)
print('body rest bounds', np.round(lo, 3), np.round(hi, 3))


def facing_yaw(world, nm):
    """Turn (about y) that makes this skeleton face +z, judged by heel-to-toe direction."""
    find = lambda pat: next(k for k, n in enumerate(nm) if re.search(pat, n))
    d = np.zeros(3)
    for side in ('L', 'R'):
        d += world[find(rf'[ -]{side}[ -]Toe0(?!.*(Nub|end))')][:3, 3] - world[find(rf'[ -]{side}[ -]Foot')][:3, 3]
    return float(np.arctan2(d[0], d[2]))


yaw = facing_yaw(rest_world, names)
print('body faces', round(np.degrees(yaw)), 'degrees from +z')

# 2. The run: sample one loop and read every body bone's local transform by name.
rg, rbuf = load_glb(args.run)
anim = rg['animations'][0]
by_name = {bare(nd.get('name')): i for i, nd in enumerate(rg['nodes'])}
tracks = {}
for ch in anim['channels']:
    s = anim['samplers'][ch['sampler']]
    tracks[(ch['target']['node'], ch['target']['path'])] = (accessor(rg, rbuf, s['input'])[:, 0], accessor(rg, rbuf, s['output']),
                                                            s.get('interpolation', 'LINEAR'))
duration = max(v[0][-1] for v in tracks.values())


def sample(node, path, t, default):
    tr = tracks.get((node, path))
    if tr is None:
        return default
    times, out, interp = tr
    if interp == 'CUBICSPLINE':
        out = out[1::3]
    i = int(np.clip(np.searchsorted(times, t, side='right') - 1, 0, len(times) - 1))
    if i + 1 >= len(times) or interp == 'STEP':
        return out[i]
    f = float(np.clip((t - times[i]) / max(times[i + 1] - times[i], 1e-9), 0, 1))
    a, b = out[i], out[i + 1]
    if path == 'rotation':
        if np.dot(a, b) < 0:
            b = -b
        q = a * (1 - f) + b * f
        return q / np.linalg.norm(q)
    return a * (1 - f) + b * f


moving = [k for k, n in enumerate(names) if bparent[k] >= 0 and bare(n) in by_name]
clip_q, clip_t = [], []
hip = next(k for k, n in enumerate(names) if re.search(r'Pelvis', n))
for f in range(args.frames):
    t = duration * f / args.frames
    qs, ts = [], []
    for k in moving:
        node = by_name[bare(names[k])]
        r_t, r_q, _ = node_trs(rg['nodes'][node])
        q = sample(node, 'rotation', t, r_q)
        qs.append(q * (1 if q[3] >= 0 else -1))
        ts.append(sample(node, 'translation', t, r_t))
    clip_q.append(qs)
    clip_t.append(ts)
clip_q, clip_t = np.array(clip_q), np.array(clip_t)
# Only bones whose translation actually moves keep a translation track (the hips bob); drift along the
# ground is cancelled so the run stays on the spot.
moves_t = [j for j in range(len(moving)) if np.ptp(clip_t[:, j], axis=0).max() > 1e-4]
for j in moves_t:
    drift = np.linspace(0, 1, args.frames, endpoint=False)[:, None] * (clip_t[-1, j] - clip_t[0, j]) * args.frames / (args.frames - 1)
    clip_t[:, j, 0] -= drift[:, 0] - drift[:, 0].mean()
    clip_t[:, j, 2] -= drift[:, 2] - drift[:, 2].mean()
frame0 = list(rest_local)
for j, k in enumerate(moving):
    frame0[k] = trs(clip_t[0, j] if j in moves_t else rest[k][0], clip_q[0, j], rest[k][2])
p0 = skin_positions(bone_worlds(frame0, bparent), ibm, pos, ji, jw)
print(f'run: {duration:.3f} s, {len(moving)} bones, translation on {[names[moving[j]] for j in moves_t]}, '
      f'first frame size {np.round(p0.max(axis=0) - p0.min(axis=0), 3)}')

# 3. The old hero: its mesh in its rest pose, turned to face the same way as the body.
src = open(args.skin).read()
old = json.loads(src[src.index('RIGGED_HERO: RiggedHeroData = ') + 30:src.rindex(';')])
u16 = lambda s: np.frombuffer(base64.b64decode(s), '<u2')
opos = u16(old['pos']).reshape(-1, 3) / 65535 * np.array(old['span']) + np.array(old['min'])
ouv = u16(old['uv']).reshape(-1, 2) / 65535
oji = np.frombuffer(base64.b64decode(old['joints']), np.uint8).reshape(-1, 4).astype(np.int64)
ojw = np.frombuffer(base64.b64decode(old['weights']), np.uint8).reshape(-1, 4) / 255
otri = u16(old['index']).reshape(-1, 3)
onames = [b['name'] for b in old['bones']]
oparent = [b['parent'] for b in old['bones']]
oibm = np.array(old['ibm']).reshape(-1, 4, 4).transpose(0, 2, 1)
oworld = bone_worlds([trs(b['t'], b['q'], b['s']) for b in old['bones']], oparent)
oyaw = old.get('yaw', facing_yaw(oworld, onames))
turn = np.eye(4)
turn[:3, :3] = quat_mat([0, np.sin((yaw - oyaw) / 2), 0, np.cos((yaw - oyaw) / 2)])
oworld = [turn @ w for w in oworld]
orest = skin_positions(oworld, oibm, opos, oji, ojw)
oimg = np.asarray(Image.open(io.BytesIO(base64.b64decode(old['jpeg']))).convert('RGB'), dtype=np.float64) / 255


# Body parts, by bone name (both rigs are Biped-style: "bip L Forearm" or "Bip001-L-Forearm").
def part(name):
    for side in ('L', 'R'):
        s = rf'(^|[ \-_]){side}[ \-_]'
        if re.search(s + r'(Hand|Finger)', name):
            return 'hand' + side
        if re.search(s + r'(UpperArm|Forearm|ForeTwist)', name) or re.search(rf'Bone_(U{side}|A_{side})', name):
            return 'arm' + side
        if re.search(s + r'(Foot|Toe)', name):
            return 'foot' + side
        if re.search(s + r'(Thigh|Calf)', name) or re.search(rf'Bone_({side}_Knee|T{side})', name):
            return 'leg' + side
    if re.search(r'Head|Neck', name):
        return 'head'
    return 'torso'


def tri_parts(ji_, jw_, t, nm):
    vp = np.array([part(nm[j]) for j in ji_[np.arange(len(ji_)), jw_.argmax(axis=1)]])
    tp = vp[t]
    # Majority of the three corners (ties go to the first corner).
    return np.where(tp[:, 1] == tp[:, 2], tp[:, 1], tp[:, 0])


# 4. Bend the body's limbs into the old hero's rest pose, then line the two up.
def bone(nm, pat):
    return next(k for k, n in enumerate(nm) if re.search(pat, n) and not re.search(r'Nub|end', n))


chains = []
for side in ('L', 'R'):
    s = rf'[ \-]{side}[ \-]'
    chains += [(s + 'Clavicle', s + 'UpperArm'), (s + 'UpperArm', s + 'Forearm'), (s + 'Forearm', s + 'Hand'),
               (s + 'Thigh', s + 'Calf'), (s + 'Calf', s + 'Foot')]
posed_local = list(rest_local)
for a_pat, b_pat in chains:
    wl = bone_worlds(posed_local, bparent)
    a, b = bone(names, a_pat), bone(names, b_pat)
    oa, ob = bone(onames, a_pat), bone(onames, b_pat)
    cur = wl[b][:3, 3] - wl[a][:3, 3]
    want = oworld[ob][:3, 3] - oworld[oa][:3, 3]
    cur, want = cur / np.linalg.norm(cur), want / np.linalg.norm(want)
    axis = np.cross(cur, want)
    ang = np.arctan2(np.linalg.norm(axis), np.dot(cur, want))
    if np.linalg.norm(axis) < 1e-8:
        continue
    axis /= np.linalg.norm(axis)
    rot = np.eye(4)
    rot[:3, :3] = quat_mat(np.r_[axis * np.sin(ang / 2), np.cos(ang / 2)])
    new_world = wl[a].copy()
    new_world[:3, :3] = rot[:3, :3] @ wl[a][:3, :3]
    parent_world = wl[bparent[a]] if bparent[a] >= 0 else np.eye(4)
    posed_local[a] = np.linalg.inv(parent_world) @ new_world
bent = skin_positions(bone_worlds(posed_local, bparent), ibm, pos, ji, jw)
k = (bent[:, 1].max() - bent[:, 1].min()) / (orest[:, 1].max() - orest[:, 1].min())
oc = oworld[bone(onames, r'Pelvis')][:3, 3]
nc = bone_worlds(posed_local, bparent)[bone(names, r'Pelvis')][:3, 3]
orest = (orest - [oc[0], orest[:, 1].min(), oc[2]]) * k + [nc[0], bent[:, 1].min(), nc[2]]
for pat in (r'[ \-]L[ \-]Hand', r'[ \-]R[ \-]Hand'):
    i = bone(names, pat)
    h = bone_worlds(posed_local, bparent)[i][:3, 3]
    oh = (oworld[bone(onames, pat)][:3, 3] - [oc[0], 0, oc[2]]) * k + [nc[0], 0, nc[2]]
    print(f'{pat[-4:]} at {np.round(h, 2)}, old hero\'s at {np.round(oh, 2)}')

# 5. Colour samples on the old hero, labelled by body part.
omesh = trimesh.Trimesh(orest, otri, process=False)
spts, sfi = trimesh.sample.sample_surface(omesh, 400_000, seed=1)
bary = trimesh.triangles.points_to_barycentric(omesh.triangles[sfi], spts)
suv = (ouv[otri[sfi]] * bary[:, :, None]).sum(axis=1)
H, W = oimg.shape[:2]
scol = oimg[np.clip((suv[:, 1] * H).astype(int), 0, H - 1), np.clip((suv[:, 0] * W).astype(int), 0, W - 1)]
snrm = omesh.face_normals[sfi]
spart = tri_parts(oji, ojw, otri, onames)[sfi]
trees = {p: (cKDTree(spts[spart == p]), np.flatnonzero(spart == p)) for p in np.unique(spart)}
npart = tri_parts(ji, jw, tri, names)
print('parts', {p: int((npart == p).sum()) for p in np.unique(npart)})

# 6. One atlas patch per triangle of the body (pairs of similar size share a square), shelf-packed.
T = bent[tri]
n = len(T)
fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
farea = np.linalg.norm(fn, axis=1) / 2
fn = fn / (np.linalg.norm(fn, axis=1)[:, None] + 1e-12)
A = args.atlas
order = np.argsort(-farea)
pairs = [order[i:i + 2] for i in range(0, n, 2)]
want = np.array([np.sqrt(farea[p].max()) for p in pairs])


def pack(scale):
    sides = np.maximum(3, np.round(want * scale)).astype(int)
    x = y = row = 0
    out = []
    for sd in sides:
        if x + sd > A:
            x, y, row = 0, y + row, 0
        out.append((x, y, sd))
        x += sd
        row = max(row, sd)
    return out, (y + row if sides.max() <= A else A + 1)


lo_s, hi_s = 0.0, A / max(want.min(), 1e-9)
for _ in range(40):
    mid = (lo_s + hi_s) / 2
    if pack(mid)[1] <= A:
        lo_s = mid
    else:
        hi_s = mid
cells, _ = pack(lo_s)
uvs = np.zeros((n, 3, 2))
atlas = np.zeros((A, A, 3))
for (cx, cy, sd), pr in zip(cells, pairs):
    jj, ii = np.mgrid[0:sd, 0:sd]
    a = (ii.ravel() + 0.5) / sd
    b = (jj.ravel() + 0.5) / sd
    upper = a + b > 1
    for kk, t in enumerate(pr):
        if kk == 0:
            sel = ~upper if len(pr) == 2 else np.ones_like(upper)
            aa, bb = a[sel], b[sel]
            uvs[t] = [(cx + 0.5, cy + 0.5), (cx + sd - 0.5, cy + 0.5), (cx + 0.5, cy + sd - 0.5)]
        else:
            sel = upper
            aa, bb = 1 - a[sel], 1 - b[sel]
            uvs[t] = [(cx + sd - 0.5, cy + sd - 0.5), (cx + 0.5, cy + sd - 0.5), (cx + sd - 0.5, cy + 0.5)]
        P = T[t, 0] + aa[:, None] * (T[t, 1] - T[t, 0]) + bb[:, None] * (T[t, 2] - T[t, 0])
        tree, ids = trees.get(npart[t], trees['torso'])
        _, nn = tree.query(P, k=8)
        cand = ids[nn]
        facing = (snrm[cand] @ fn[t]) > 0.2
        best = np.where(facing.any(axis=1), facing.argmax(axis=1), 0)
        atlas[cy + jj.ravel()[sel], cx + ii.ravel()[sel]] = scol[cand[np.arange(len(cand)), best]]
img = Image.fromarray((np.clip(atlas, 0, 1) * 255).round().astype(np.uint8))
jpg = io.BytesIO()
img.save(jpg, 'JPEG', quality=90)

# 7. Write: one vertex per triangle corner (each corner has its own atlas spot), the bind-space positions
# and skin weights of the body, the T-pose bones and the sampled run.
cpos, cji, cjw = pos[tri].reshape(-1, 3), ji[tri].reshape(-1, 4), jw[tri].reshape(-1, 4)
b64 = lambda x: base64.b64encode(np.ascontiguousarray(x).tobytes()).decode()
pmin = cpos.min(axis=0)
span = np.maximum(cpos.max(axis=0) - pmin, 1e-9)
wq = np.round(cjw * 255).astype(np.int64)
wq[np.arange(len(wq)), wq.argmax(axis=1)] += 255 - wq.sum(axis=1)  # weights still sum to 1
r6 = lambda v: [round(float(x), 6) for x in v]
data = {
    'min': [float(x) for x in pmin],
    'span': [float(x) for x in span],
    'pos': b64(np.round((cpos - pmin) / span * 65535).astype('<u2')),
    'uv': b64(np.round(np.clip(uvs.reshape(-1, 2) / A, 0, 1) * 65535).astype('<u2')),
    'joints': b64(cji.astype(np.uint8)),
    'weights': b64(wq.astype(np.uint8)),
    'index': b64(np.arange(len(cpos)).astype('<u2')),
    'bones': [{'name': nm, 'parent': p, 't': r6(t), 'q': r6(q), 's': r6(s)} for nm, p, (t, q, s) in zip(names, bparent, rest)],
    'ibm': r6(ibm.transpose(0, 2, 1).reshape(-1)),
    'restMin': [round(float(x), 4) for x in lo],
    'restMax': [round(float(x), 4) for x in hi],
    'jpeg': base64.b64encode(jpg.getvalue()).decode(),
    'atlas': A,
    'yaw': round(yaw, 5),
    'armRest': 0,
    'run': {
        'seconds': round(float(duration), 5),
        'bones': moving,
        'q': [[round(float(x), 4) for x in fr.reshape(-1)] for fr in clip_q],
        'tBones': [moving[j] for j in moves_t],
        't': [[round(float(x), 5) for x in clip_t[f, moves_t].reshape(-1)] for f in range(args.frames)],
    },
}
assert len(cpos) < 65536 and len(names) < 256
print(f'{n} tris, {len(cpos)} verts, {len(names)} bones, {len(data["jpeg"]) * 3 // 4 // 1024} KB atlas')
with open(args.dst, 'w') as fh:
    fh.write('// Generated by scripts/reskin-hero.py. Do not edit by hand.\n')
    if args.credit:
        fh.write(f'// {args.credit}\n')
    fh.write('export type RiggedHeroData = {\n  min: number[];\n  span: number[];\n  pos: string;\n  uv: string;\n'
             '  joints: string;\n  weights: string;\n  index: string;\n'
             '  bones: { name: string; parent: number; t: number[]; q: number[]; s: number[] }[];\n'
             '  ibm: number[];\n  restMin: number[];\n  restMax: number[];\n  jpeg: string;\n'
             '  atlas?: number;\n  yaw?: number; // which way the model faces: radians about y from +z\n'
             '  armRest?: number; // how far the rest pose\'s arms hang below a T-pose\n'
             '  // A looping run: per frame, local quaternions of `bones` and translations of `tBones`.\n'
             '  run?: { seconds: number; bones: number[]; q: number[][]; tBones: number[]; t: number[][] };\n};\n\n')
    fh.write('export const RIGGED_HERO: RiggedHeroData = ')
    fh.write(json.dumps(data, separators=(',', ':')))
    fh.write(';\n')
