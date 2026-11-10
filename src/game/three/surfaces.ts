import * as THREE from 'three';

// Procedural textures for the street, made once at start-up (no image files to ship or decode).
// They are greyscale multipliers over the per-city vertex colours, so one texture serves every city.

const hash2 = (x: number, y: number, seed: number) => {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed * 2246822519, 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Tileable value noise on a `cells`-wide lattice over a `size`-pixel square.
function valueNoise(size: number, cells: number, seed: number) {
  const out = new Float32Array(size * size);
  const step = size / cells;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / step;
      const gy = y / step;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const v = (i: number, j: number) => hash2(((x0 + i) % cells + cells) % cells, ((y0 + j) % cells + cells) % cells, seed);
      const a = v(0, 0) + (v(1, 0) - v(0, 0)) * sx;
      const b = v(0, 1) + (v(1, 1) - v(0, 1)) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  }
  return out;
}

function toTexture(size: number, shade: (x: number, y: number) => number) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.max(0, Math.min(255, Math.round(shade(x, y) * 255)));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  // Power-of-two squares, so even WebGL1 phones can mipmap them: no shimmer far down the street.
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// Asphalt: one tile spans the whole road width (u = x / 6 m, centred on the road) and 6 m along it. Grain, patches of
// newer tar, and darker tyre tracks where the cars drive.
export function asphaltTexture() {
  const S = 128;
  const coarse = valueNoise(S, 4, 1);
  const mid = valueNoise(S, 16, 2);
  const patch = valueNoise(S, 3, 3);
  return toTexture(S, (x, y) => {
    const i = y * S + x;
    let v = 0.84 + (coarse[i] - 0.5) * 0.16 + (mid[i] - 0.5) * 0.12;
    const g = hash2(x, y, 4);
    if (g < 0.08) v -= 0.16; // dark grit
    else if (g > 0.96) v += 0.14; // light stones
    if (patch[i] > 0.66) v -= 0.08; // a patch of fresher, darker tar
    // Tyre tracks under each lane's wheels: cars drive at x = ±1.95 m, so wheels at about ±1.35 and ±2.55,
    // and u = x / 6 wraps the left half of the road round to u > 0.5.
    const u = x / S;
    for (const c of [0.225, 0.425, 0.575, 0.775]) v -= Math.max(0, 1 - Math.abs(u - c) / 0.04) * 0.1;
    return v;
  });
}

// Pavement: square paving slabs, 2 x 2 to a 1 m tile, each a slightly different shade, with grout between.
export function paverTexture() {
  const S = 64;
  const grain = valueNoise(S, 16, 7);
  return toTexture(S, (x, y) => {
    const half = S / 2;
    const tx = Math.floor(x / half);
    const ty = Math.floor(y / half);
    const lx = x % half;
    const ly = y % half;
    if (lx < 2 || ly < 2) return 0.72; // grout
    let v = 0.9 + (hash2(tx, ty, 9) - 0.5) * 0.12 + (grain[y * S + x] - 0.5) * 0.08;
    if (lx < 4 || ly < 4) v += 0.04; // a lit bevel on the slab's edge
    if (lx > half - 3 || ly > half - 3) v -= 0.05; // and a shaded one opposite
    return v;
  });
}

// A soft round shadow, dark in the middle and fading out at the edge, for cars, carts and crates.
export function blobTexture() {
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5;
      const dy = (y + 0.5) / S - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(Math.min(1, (1 - r) / 0.55), 1.5); // a solid core that fades out over the rim
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// A soft white glow, for lamp halos at night (drawn additively, tinted by the material).
export function glowTexture() {
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = Math.min(1, Math.hypot((x + 0.5) / S - 0.5, (y + 0.5) / S - 0.5) * 2);
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(Math.pow(1 - r, 2) * 255);
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
