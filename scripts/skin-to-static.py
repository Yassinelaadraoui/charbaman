"""Bake a skinned GLB into a static one in its rest pose (for scripts/bake-model.py).

Usage: python3 scripts/skin-to-static.py in.glb out.glb [animation index]
Skinned vertices are stored in bind space and only make sense through their bones; this applies the
skin once (joint world matrix x inverse bind matrix, weighted) and writes the result as plain meshes.
"""
import json
import struct
import sys

import numpy as np

src, dst = sys.argv[1], sys.argv[2]
anim = int(sys.argv[3]) if len(sys.argv) > 3 else None
raw = open(src, 'rb').read()
jlen = struct.unpack('<I', raw[12:16])[0]
gl = json.loads(raw[20:20 + jlen])
blen = struct.unpack('<I', raw[20 + jlen:24 + jlen])[0]
binbuf = bytearray(raw[28 + jlen:28 + jlen + blen])
COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def accessor(i):
    a = gl['accessors'][i]
    bv = gl['bufferViews'][a['bufferView']]
    dt = np.dtype(COMP[a['componentType']])
    n = NCOMP[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', dt.itemsize * n)
    rows = np.lib.stride_tricks.as_strided(np.frombuffer(bytes(binbuf), np.uint8, offset=off),
                                           shape=(a['count'], dt.itemsize * n), strides=(stride, 1))
    out = np.frombuffer(rows.copy().tobytes(), dt).reshape(a['count'], n)
    if a.get('normalized') and dt != np.float32:
        out = out.astype(np.float32) / np.iinfo(dt).max
    return out.astype(np.float64) if dt == np.float32 else out


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


# Optionally pose the skeleton with the first frame of an animation (some rest poses are odd).
if anim is not None:
    a = gl['animations'][anim]
    for ch in a['channels']:
        smp = a['samplers'][ch['sampler']]
        path = ch['target']['path']
        if path in ('translation', 'rotation', 'scale'):
            node = gl['nodes'][ch['target']['node']]
            node.pop('matrix', None)
            node[path] = [float(x) for x in accessor(smp['output'])[0]]

parent = {c: i for i, nd in enumerate(gl['nodes']) for c in nd.get('children', [])}


def world(i):
    m = local(gl['nodes'][i])
    while i in parent:
        i = parent[i]
        m = local(gl['nodes'][i]) @ m
    return m


done = set()
for ni, nd in enumerate(gl['nodes']):
    if 'mesh' not in nd or 'skin' not in nd or nd['mesh'] in done:
        continue
    done.add(nd['mesh'])
    skin = gl['skins'][nd['skin']]
    ibm = accessor(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    mats = np.array([world(j) @ ibm[k] for k, j in enumerate(skin['joints'])])
    for prim in gl['meshes'][nd['mesh']]['primitives']:
        a = prim['attributes']
        p = accessor(a['POSITION'])
        ji = accessor(a['JOINTS_0']).astype(np.int64)
        jw = accessor(a['WEIGHTS_0'])
        jw = jw / np.maximum(jw.sum(axis=1, keepdims=True), 1e-9)
        ph = np.c_[p, np.ones(len(p))]
        out = np.zeros((len(p), 3))
        for c in range(4):
            out += jw[:, c:c + 1] * np.einsum('nij,nj->ni', mats[ji[:, c]], ph)[:, :3]
        # Append the posed positions as a new accessor.
        while len(binbuf) % 4:
            binbuf.append(0)
        data = out.astype('<f4').tobytes()
        gl['bufferViews'].append({'buffer': 0, 'byteOffset': len(binbuf), 'byteLength': len(data)})
        binbuf.extend(data)
        gl['accessors'].append({'bufferView': len(gl['bufferViews']) - 1, 'componentType': 5126, 'count': len(out),
                                'type': 'VEC3', 'min': out.min(axis=0).tolist(), 'max': out.max(axis=0).tolist()})
        a['POSITION'] = len(gl['accessors']) - 1
        for k in ('JOINTS_0', 'WEIGHTS_0', 'NORMAL', 'TANGENT'):
            a.pop(k, None)

# Posed meshes are already in world space: hang every mesh node off a fresh root with no transform.
meshnodes = [i for i, nd in enumerate(gl['nodes']) if 'mesh' in nd]
for i in meshnodes:
    gl['nodes'][i].pop('skin', None)
    for key in ('matrix', 'translation', 'rotation', 'scale', 'children'):
        gl['nodes'][i].pop(key, None)
gl['scenes'] = [{'nodes': meshnodes}]
gl['scene'] = 0
gl.pop('skins', None)
gl.pop('animations', None)
while len(binbuf) % 4:
    binbuf.append(0)
gl['buffers'][0]['byteLength'] = len(binbuf)
js = json.dumps(gl).encode()
while len(js) % 4:
    js += b' '
total = 12 + 8 + len(js) + 8 + len(binbuf)
with open(dst, 'wb') as fh:
    fh.write(struct.pack('<III', 0x46546C67, 2, total))
    fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
    fh.write(struct.pack('<II', len(binbuf), 0x004E4942) + bytes(binbuf))
