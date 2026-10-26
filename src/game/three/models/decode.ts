import * as THREE from 'three';
// The decoder alone: the package index also pulls in the encoder, which needs Node's Buffer.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const decodeJpeg: (data: Uint8Array, opts: { useTArray: boolean; formatAsRGBA: boolean }) => { width: number; height: number; data: Uint8Array<ArrayBuffer> } = require('jpeg-js/lib/decoder');
import type { BakedModel } from './types';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;

export function base64ToBytes(s: string) {
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length * 3) / 4 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (LOOKUP[s.charCodeAt(i)] << 18) | (LOOKUP[s.charCodeAt(i + 1)] << 12) | (LOOKUP[s.charCodeAt(i + 2)] << 6) | LOOKUP[s.charCodeAt(i + 3)];
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

const uint16 = (s: string) => {
  const b = base64ToBytes(s);
  const out = new Uint16Array(b.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = b[i * 2] | (b[i * 2 + 1] << 8);
  return out;
};

export function bakedGeometry(m: BakedModel) {
  const q = uint16(m.pos);
  const pos = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = m.min[i % 3] + (q[i] / 65535) * m.span[i % 3];
  const qu = uint16(m.uv);
  const uv = new Float32Array(qu.length);
  for (let i = 0; i < qu.length; i++) uv[i] = qu[i] / 65535;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals(); // one normal per triangle corner: flat shading without derivatives
  return g;
}

// Returns RGBA pixels, row 0 at the top of the atlas (which is v = 0 in the baked UVs).
export function bakedTexture(m: BakedModel, recolor?: (px: Uint8Array, i: number) => void) {
  const img = decodeJpeg(base64ToBytes(m.jpeg), { useTArray: true, formatAsRGBA: true });
  if (recolor) for (let i = 0; i < img.data.length; i += 4) recolor(img.data, i);
  if (m.alpha) {
    const a = decodeJpeg(base64ToBytes(m.alpha), { useTArray: true, formatAsRGBA: true });
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = a.data[i - 3];
  }
  const t = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// A white sprite whose alpha comes from a greyscale JPEG (for particles).
export function maskTexture(jpeg: string) {
  const img = decodeJpeg(base64ToBytes(jpeg), { useTArray: true, formatAsRGBA: true });
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i + 3] = img.data[i];
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
  }
  const t = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
