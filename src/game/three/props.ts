import * as THREE from 'three';
import type { City, Landmark } from '../cities';
import type { Entity } from '../engine';
import { TAXI_PARTS } from './taxiMesh';
import type { BakedModel } from './models/types';
import { bakedGeometry, bakedPositions, bakedTexture, posedGeometry } from './models/decode';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APPLE_BOX } from './models/appleBox';
import { BANKNOTE } from './models/banknote';
import { BOY } from './models/boy';
import { BUS_STOP } from './models/busStop';
import { CHICKEN } from './models/chicken';
import { DONKEY } from './models/donkey';
import { FRUIT_STALL } from './models/fruitStall';
import { MAJMAR } from './models/majmar';
import { MINE_SIGN } from './models/mineSign';
import { OLD_MAN } from './models/oldMan';
import { TAGINE } from './models/tagine';
import { SPICE_MARKET } from './models/spiceMarket';
import { JUICE_BOTTLE } from './models/juiceBottle';
import { MAPLE_TREE } from './models/mapleTree';
import { PALM_TREE } from './models/palmTree';
import { TEA_TABLE } from './models/teaTable';
import { CITY_GATE } from './models/cityGate';
import { DACIA } from './models/dacia';
import { DERBY_HOUSE } from './models/derbyHouse';
import { HASSAN_MOSQUE } from './models/hassanMosque';
import { HASSAN_TOWER } from './models/hassanTower';
import { MIXED_FACADE } from './models/mixedFacade';
import { MOROCCO_HOUSE } from './models/moroccoHouse';
import { OLD_HOUSE } from './models/oldHouse';
import { POLICE_CAR } from './models/policeCar';
import { POPULAR_HOUSE } from './models/popularHouse';
import { RAMPARTS } from './models/ramparts';

// Low-poly, flat-shaded props in the spirit of the PS1 original.
// Geometries and materials are shared and cached so pooled objects are cheap.

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

export function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

export function mat(color: number | string, opts: { emissive?: boolean; transparent?: number } = {}) {
  const key = `${color}|${opts.emissive ? 1 : 0}|${opts.transparent ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = opts.emissive
      ? new THREE.MeshBasicMaterial({ color, transparent: opts.transparent !== undefined, opacity: opts.transparent ?? 1 })
      : new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: opts.transparent !== undefined, opacity: opts.transparent ?? 1 });
    matCache.set(key, m);
  }
  return m;
}

const box = (w: number, h: number, d: number, color: number | string, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat(color));
  m.position.set(x, y, z);
  return m;
};
const cyl = (rt: number, rb: number, h: number, seg: number, color: number | string, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat(color));
  m.position.set(x, y, z);
  return m;
};
const sphere = (r: number, color: number | string, x = 0, y = 0, z = 0, seg = 8) => {
  const m = new THREE.Mesh(geo(`sph${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2))), mat(color));
  m.position.set(x, y, z);
  return m;
};

// Draw calls are what phones choke on, and a lamp built from nine boxes costs nine of them. flat() builds a
// prop once, merges its plain coloured parts into one vertex-coloured mesh per material kind, and hands out
// cheap clones that share it. Named parts (spinning stars, police lights) and textured models stay separate.
const flatCache = new Map<string, THREE.Object3D>();
const flatMats = new Map<string, THREE.Material>();

export function flat(key: string, build: () => THREE.Object3D): THREE.Object3D {
  let t = flatCache.get(key);
  if (!t) {
    t = flatten(build());
    flatCache.set(key, t);
  }
  return t.clone();
}

function flatMat(basic: boolean, side: THREE.Side) {
  const key = `${basic ? 'b' : 'l'}${side}`;
  let m = flatMats.get(key);
  if (!m) {
    m = basic ? new THREE.MeshBasicMaterial({ vertexColors: true, side }) : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side });
    flatMats.set(key, m);
  }
  return m;
}

export function flatten(root: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  const out = new THREE.Group();
  out.name = root.name;
  out.userData = { ...root.userData };
  out.position.copy(root.position);
  out.quaternion.copy(root.quaternion);
  out.scale.copy(root.scale);
  const buckets = new Map<string, { basic: boolean; side: THREE.Side; geos: THREE.BufferGeometry[] }>();
  const walk = (o: THREE.Object3D) => {
    const m = o as THREE.Mesh;
    const material = m.isMesh ? (m.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial) : null;
    const plain =
      !!material &&
      !Array.isArray(material) &&
      (material.type === 'MeshLambertMaterial' || material.type === 'MeshBasicMaterial') &&
      !material.map &&
      !material.transparent &&
      !m.morphTargetInfluences;
    if (o !== root && (o.name || o.userData.animate || (m.isMesh && !plain))) {
      // Keep it whole, placed where it sat inside the prop.
      const keep = o.clone();
      rel.multiplyMatrices(inv, o.matrixWorld).decompose(keep.position, keep.quaternion, keep.scale);
      out.add(keep);
      return;
    }
    if (plain) {
      const src = m.geometry;
      const g = new THREE.BufferGeometry();
      const pos = (src.index ? src.toNonIndexed() : src).attributes.position.clone();
      g.setAttribute('position', pos);
      g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
      g.computeVertexNormals();
      const c = material!.color;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const basic = material!.type === 'MeshBasicMaterial';
      const key = `${basic}${material!.side}`;
      const b = buckets.get(key) ?? { basic, side: material!.side, geos: [] };
      b.geos.push(g);
      buckets.set(key, b);
    }
    o.children.forEach(walk);
  };
  walk(root);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos);
    if (merged) out.add(new THREE.Mesh(merged, flatMat(b.basic, b.side)));
  }
  return out;
}

// Models baked by scripts/bake-model.py (base at y=0, centred on x/z), each with its own texture atlas.
const bakedMats = new Map<string, THREE.Material>();

// People and animals get smooth normals; everything else keeps flat PS1 facets.
const SMOOTH = new Set(['boy', 'chicken', 'donkey', 'oldman']);

// Decoding an atlas (pure-JS JPEG) is the slow part of building a model, so each atlas is decoded once and
// shared by every model key that uses it unpainted (the police car and the chaser van, the two bottles).
const bakedTextures = new Map<BakedModel, THREE.Texture>();
type Recolor = (px: Uint8Array, i: number) => void;

function bakedMaterial(key: string, data: BakedModel, recolor?: Recolor) {
  let material = bakedMats.get(key);
  if (!material) {
    let map = recolor ? undefined : bakedTextures.get(data);
    if (!map) {
      map = bakedTexture(data, recolor);
      if (!recolor) bakedTextures.set(data, map);
    }
    // Cut-out textures (palm fronds) use alpha testing: no sorting, cheap on phones.
    material = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide, alphaTest: data.alpha ? 0.5 : 0 });
    bakedMats.set(key, material);
  }
  return material;
}

const bakedGeo = (key: string, data: BakedModel) => geo(`model-${key}`, () => bakedGeometry(data, SMOOTH.has(key)));

export function model(key: string, data: BakedModel, fit: { height?: number; length?: number; maxSide?: number }, recolor?: Recolor) {
  const m = new THREE.Mesh(bakedGeo(key, data), bakedMaterial(key, data, recolor));
  const [w, h, d] = data.size;
  let k = fit.length !== undefined ? fit.length / Math.max(w, d) : (fit.height ?? 1) / h;
  if (fit.maxSide !== undefined) k = Math.min(k, fit.maxSide / Math.max(w, d));
  m.scale.setScalar(k);
  return m;
}

// Models baked with poses (bake-model.py --frames) blend between them with morph targets.
// `phase` counts poses: 2.5 is halfway from the third pose to the fourth. Looping wraps the last pose
// back to the first; otherwise it plays forward and back (for motions that are not a cycle).
export function animate(o: THREE.Object3D, phase: number, loop = true) {
  o.traverse((c) => {
    // Models built in code move their own parts.
    const own = c.userData.animate as ((phase: number, loop: boolean) => void) | undefined;
    if (own) own(phase, loop);
    const infl = (c as THREE.Mesh).morphTargetInfluences;
    if (!infl) return;
    const n = infl.length + 1;
    let f: number;
    if (loop) f = ((phase % n) + n) % n;
    else {
      const p = ((phase % (2 * n - 2)) + 2 * n - 2) % (2 * n - 2);
      f = p <= n - 1 ? p : 2 * n - 2 - p;
    }
    const a = Math.floor(f);
    const w = f - a;
    const b = loop ? (a + 1) % n : Math.min(a + 1, n - 1);
    infl.fill(0);
    if (a > 0) infl[a - 1] += 1 - w;
    if (b > 0) infl[b - 1] += w;
  });
}

const ORANGE = 0xff7a00;
const ORANGE_DEEP = 0xe85d04;
const GOLD = 0xffd23f;
const WHITE = 0xffffff;

export function charbaBottle(scale = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.16, 0.42, 10, ORANGE, 0, 0.21));
  g.add(cyl(0.165, 0.165, 0.12, 10, WHITE, 0, 0.22));
  g.add(cyl(0.06, 0.15, 0.14, 10, ORANGE, 0, 0.49));
  g.add(cyl(0.05, 0.05, 0.12, 8, ORANGE, 0, 0.62));
  g.add(cyl(0.065, 0.065, 0.05, 8, GOLD, 0, 0.7));
  g.scale.setScalar(scale);
  return g;
}

// In Safi, the pottery capital, the jump obstacles are stacks of glazed pots instead of crates.
function build_pots(e: Entity) {
  const g = new THREE.Group();
  const n = Math.max(2, Math.round(e.w * 2.5));
  const step = (e.w * 2) / n;
  for (let i = 0; i < n; i++) {
    const x = -e.w + step * (i + 0.5);
    const glaze = [0x2e7d32, 0x1565c0, 0xb5562c][i % 3];
    g.add(cyl(step * 0.32, step * 0.42, e.h * 0.75, 10, glaze, x, e.h * 0.375));
    g.add(cyl(step * 0.2, step * 0.3, e.h * 0.25, 10, 0xb5562c, x, e.h * 0.875));
    g.add(cyl(step * 0.26, step * 0.26, 0.05, 10, 0xf3e9da, x, e.h * 0.55));
  }
  return g;
}

function build_awning(e: Entity, c: City) {
  const g = new THREE.Group();
  const H = e.y + e.h;
  g.add(box(0.14, H, 0.14, 0x5c3a1e, -e.w - 0.1, H / 2));
  g.add(box(0.14, H, 0.14, 0x5c3a1e, e.w + 0.1, H / 2));
  const stripes = 8;
  const sw = (e.w * 2) / stripes;
  for (let i = 0; i < stripes; i++) {
    g.add(box(sw, e.h, 0.12, i % 2 ? WHITE : c.accent, -e.w + sw * (i + 0.5), e.y + e.h / 2));
  }
  g.add(box(1.8, 0.45, 0.14, ORANGE, 0, e.y + e.h * 0.55, 0.05));
  return g;
}

const TAXI_COLORS: Record<string, number> = {
  dark: 0x1a1a1a,
  tyre: 0x111111,
  glass: 0x22313f,
  chrome: 0xb8bcc2,
  rim: 0x8a8f96,
  headlight: 0xfff4d0,
  taillight: 0xff2e2e,
  sign: 0xffffff,
};

// Double-sided: the decimated shell has some thin panels whose back faces we can see.
const taxiMats = new Map<string, THREE.Material>();
function taxiMat(part: string, color: number | string) {
  const key = `${part}|${color}`;
  let m = taxiMats.get(key);
  if (!m) {
    m =
      part === 'headlight' || part === 'taillight'
        ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
        : new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });
    taxiMats.set(key, m);
  }
  return m;
}

// The Dacia is bright green; repaint it cream like a grand taxi.
const grandTaxiPaint = (px: Uint8Array, i: number) => {
  const r = px[i];
  const g = px[i + 1];
  const b = px[i + 2];
  if (g > r * 1.25 && g > b * 1.25) {
    const k = Math.min(1, 0.45 + (0.7 * g) / 255);
    px[i] = 242 * k;
    px[i + 1] = 232 * k;
    px[i + 2] = 204 * k;
  }
};

// Traffic mixes petit taxis, Dacia grand taxis and plenty of police vans. Oncoming cars (vz < 0) face you.
function car(e: Entity, c: City) {
  const r = ((Math.imul(e.id + 1, 2654435761) >>> 0) % 100) / 100;
  const g = new THREE.Group();
  if (r < 0.45) g.add(taxi(c));
  else if (r < 0.7) {
    const m = model('dacia', DACIA, { length: 4.0 }, grandTaxiPaint);
    m.rotation.y = Math.PI; // front is +z; drive away from the camera
    g.add(m);
  } else {
    const m = model('police', POLICE_CAR, { length: 4.0 });
    m.rotation.y = -Math.PI / 2; // modelled lengthwise along x, nose at -x
    g.add(m);
    // A light bar on the roof; the scene flashes it red and blue.
    const roof = POLICE_CAR.size[1] * m.scale.y;
    g.add(box(0.9, 0.12, 0.28, 0x222222, 0, roof + 0.02, 0.3));
    for (const [name, x, color] of [['sirenR', -0.24, 0xff2b2b], ['sirenB', 0.24, 0x2b6bff]] as const) {
      const light = new THREE.Mesh(geo('siren', () => new THREE.BoxGeometry(0.36, 0.14, 0.3)), mat(color, { emissive: true }));
      light.position.set(x, roof + 0.12, 0.3);
      light.name = name;
      g.add(light);
    }
  }
  if (e.vz < 0) g.rotation.y = Math.PI; // coming at you
  return g;
}

// Petit taxi built from the decimated taxi model; only the body takes the city colour.
function build_taxi(c: City) {
  const g = new THREE.Group();
  for (const [name, part] of Object.entries(TAXI_PARTS)) {
    const geom = geo(`taxi-${name}`, () => {
      const b = new THREE.BufferGeometry();
      b.setAttribute('position', new THREE.Float32BufferAttribute(part.p, 3));
      b.setIndex(part.i);
      b.computeVertexNormals();
      return b;
    });
    g.add(new THREE.Mesh(geom, taxiMat(name, name === 'body' ? c.taxi : TAXI_COLORS[name])));
  }
  g.rotation.y = Math.PI; // model faces +z; traffic drives away from the camera like the hero
  return g;
}

function build_scooter() {
  // A little moped, the kind every Moroccan medina is full of, with a helmeted rider. Faces +z.
  const g = new THREE.Group();
  const BODY = 0x2a9d8f;
  const wheel = (z: number) => {
    const tyre = cyl(0.24, 0.24, 0.1, 12, 0x161616, 0, 0.24, z);
    tyre.rotation.z = Math.PI / 2;
    const hub = cyl(0.12, 0.12, 0.11, 8, 0xb0b6bb, 0, 0.24, z);
    hub.rotation.z = Math.PI / 2;
    g.add(tyre, hub);
  };
  wheel(0.62);
  wheel(-0.6);
  g.add(box(0.36, 0.12, 0.9, 0x333333, 0, 0.36, 0)); // floorboard
  g.add(box(0.42, 0.42, 0.62, BODY, 0, 0.62, -0.38)); // rear body over the engine
  g.add(box(0.36, 0.1, 0.58, 0x1b1b1b, 0, 0.88, -0.34)); // seat
  g.add(box(0.4, 0.22, 0.3, BODY, 0, 0.42, 0.62)); // front mudguard
  const stem = box(0.12, 0.85, 0.14, BODY, 0, 0.88, 0.5);
  stem.rotation.x = -0.25;
  g.add(stem);
  g.add(box(0.62, 0.06, 0.06, 0x222222, 0, 1.28, 0.42)); // handlebars
  g.add(box(0.22, 0.16, 0.08, 0xfff3b0, 0, 1.12, 0.6)); // headlight
  g.add(box(0.3, 0.26, 0.3, 0x8d6e63, 0, 1.0, -0.82)); // a crate of bread on the rack
  // Rider: jacket, jeans, arms to the bars, and a helmet.
  g.add(box(0.42, 0.55, 0.3, 0x3a5a40, 0, 1.22, -0.25)); // torso
  for (const sx of [-1, 1]) {
    const thigh = box(0.15, 0.15, 0.42, 0x2f4b7c, sx * 0.12, 0.95, -0.08);
    g.add(thigh);
    g.add(box(0.14, 0.42, 0.14, 0x2f4b7c, sx * 0.13, 0.66, 0.12)); // shin
    g.add(box(0.15, 0.08, 0.24, 0x2b2b2b, sx * 0.13, 0.44, 0.18)); // foot on the board
    const arm = box(0.11, 0.11, 0.55, 0x3a5a40, sx * 0.24, 1.3, 0.1);
    arm.rotation.x = 0.25;
    g.add(arm);
  }
  g.add(box(0.2, 0.22, 0.2, 0xc68a5a, 0, 1.6, -0.22)); // face
  g.add(sphere(0.19, 0xe63946, 0, 1.72, -0.25, 10)); // helmet
  g.add(box(0.3, 0.07, 0.1, 0x1a1a1a, 0, 1.64, -0.08)); // visor
  return g;
}

// The donkey's walk: 8 poses of a 1.07 s cycle.
export const DONKEY_CYCLE = { poses: 8, seconds: 1.0667 };

// A donkey pulling a fruit cart down the street toward you, an old man on the bench holding the reins.
// Faces +z (toward the player); about 3.6 m from the donkey's nose to the tailboard.
function donkeyCart() {
  const g = new THREE.Group();
  const donkey = model('donkey', DONKEY, { length: 1.9 });
  donkey.rotation.y = -Math.PI / 2; // the model faces +x
  donkey.position.z = 0.95;
  donkey.name = 'donkey';
  g.add(donkey);
  g.add(flat('fruitcart', buildFruitCart));
  const driver = model('oldman', OLD_MAN, { height: 1.7 });
  driver.geometry = geo('oldman-seated', seatedOldMan);
  driver.morphTargetInfluences = undefined;
  driver.position.set(0, 0.88 - 0.88 * driver.scale.y, -0.55); // hips on the bench
  g.add(driver);
  return g;
}

function buildFruitCart() {
  const g = new THREE.Group();
  const WOOD = 0x8b5a2b;
  const WOOD_DARK = 0x5c3a1e;
  const CZ = -1.05; // cart centre
  // Bed, slatted sides and tailboard.
  g.add(box(1.4, 0.1, 1.5, WOOD_DARK, 0, 0.72, CZ));
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) g.add(box(0.05, 0.1, 1.5, k % 2 ? WOOD : 0xa0703c, sx * 0.68, 0.83 + k * 0.12, CZ));
  for (let k = 0; k < 3; k++) g.add(box(1.4, 0.1, 0.05, k % 2 ? WOOD : 0xa0703c, 0, 0.83 + k * 0.12, CZ - 0.74));
  g.add(box(1.4, 0.08, 0.32, 0xa0703c, 0, 0.84, CZ + 0.62)); // driver's bench
  // Shafts out to the donkey's harness, and the axle.
  for (const sx of [-1, 1]) {
    const shaft = box(0.07, 0.07, 1.9, WOOD_DARK, sx * 0.34, 0.86, 0.15);
    shaft.rotation.x = -0.08;
    g.add(shaft);
  }
  g.add(box(0.75, 0.12, 0.12, 0x3a2a1a, 0, 0.98, 0.95)); // yoke across the donkey's back
  g.add(cyl(0.04, 0.04, 1.75, 6, 0x3a3a3a, 0, 0.45, CZ).rotateZ(Math.PI / 2));
  // Big spoked wheels.
  for (const sx of [-1, 1]) {
    const x = sx * 0.85;
    const rim = cyl(0.45, 0.45, 0.07, 14, 0x3e2723, x, 0.45, CZ);
    rim.rotation.z = Math.PI / 2;
    const inner = cyl(0.37, 0.37, 0.075, 14, 0x6b4a2b, x, 0.45, CZ);
    inner.rotation.z = Math.PI / 2;
    g.add(rim, inner);
    for (let k = 0; k < 4; k++) {
      const spoke = box(0.085, 0.8, 0.05, 0x3e2723, x, 0.45, CZ);
      spoke.rotation.x = (k * Math.PI) / 4;
      g.add(spoke);
    }
    g.add(cyl(0.09, 0.09, 0.1, 8, 0x2a2a2a, x, 0.45, CZ).rotateZ(Math.PI / 2));
  }
  // The load: a heap of oranges, green melons, and a crate of apples at the back.
  const fruit = (r: number, color: number, x: number, y: number, z: number, sy = 1) => {
    const f = sphere(r, color, x, y, z, 7);
    f.scale.y = sy;
    g.add(f);
  };
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 5 - row; k++) fruit(0.11, k % 3 === 1 ? 0xff9500 : 0xff7a00, -0.48 + row * 0.12 + k * 0.24, 0.88 + row * 0.17, CZ + 0.15 - row * 0.05);
  for (const [x, z] of [[-0.35, CZ - 0.35], [0.05, CZ - 0.42], [0.42, CZ - 0.3]]) fruit(0.21, 0x2d6a2f, x, 0.98, z, 0.85);
  fruit(0.18, 0x3d8b3d, -0.12, 1.25, CZ - 0.35, 0.85);
  g.add(box(0.5, 0.3, 0.38, 0xc49a6c, 0.3, 0.92, CZ + 0.4));
  for (let k = 0; k < 4; k++) fruit(0.08, 0xc1272d, 0.18 + (k % 2) * 0.22, 1.11, CZ + 0.32 + Math.floor(k / 2) * 0.17);
  return g;
}

// The strolling old man, sat down: from the walk frame with his feet closest together, his legs fold at the
// hips (thighs forward along +z) and at the knees (shins down). Model space: hips y 0.88, knees y 0.46.
function seatedOldMan() {
  let best = -1;
  let spread = Infinity;
  for (let f = -1; f < (OLD_MAN.frames?.length ?? 0); f++) {
    const p = bakedPositions(OLD_MAN, f);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i + 1] >= 0.2) continue;
      lo = Math.min(lo, p[i + 2]);
      hi = Math.max(hi, p[i + 2]);
    }
    if (hi - lo < spread) {
      spread = hi - lo;
      best = f;
    }
  }
  const HIP = 0.88;
  const KNEE = 0.46;
  const rot = (y: number, z: number, py: number, pz: number, th: number): [number, number] => {
    const ry = y - py;
    const rz = z - pz;
    return [py + ry * Math.cos(th) - rz * Math.sin(th), pz + ry * Math.sin(th) + rz * Math.cos(th)];
  };
  const sit = (base: Float32Array) => {
    const out = new Float32Array(base);
    for (let i = 0; i < out.length; i += 3) {
      let y = out[i + 1];
      let z = out[i + 2];
      if (y >= HIP) continue;
      const knee = smoothstep(KNEE + 0.05, KNEE - 0.05, y); // 1 for the shin, 0 for the thigh
      [y, z] = rot(y, z, KNEE, 0, (Math.PI / 2) * knee);
      const hip = smoothstep(HIP + 0.02, HIP - 0.08, out[i + 1]);
      [y, z] = rot(y, z, HIP, 0, (-Math.PI / 2) * hip);
      out[i + 1] = y;
      out[i + 2] = z;
    }
    return out;
  };
  return posedGeometry(OLD_MAN, 1, sit, true, best);
}


function build_arch(e: Entity, finish: boolean) {
  const g = new THREE.Group();
  const H = e.h;
  g.add(box(0.3, H, 0.3, ORANGE_DEEP, -e.w - 0.3, H / 2));
  g.add(box(0.3, H, 0.3, ORANGE_DEEP, e.w + 0.3, H / 2));
  if (finish) {
    const n = 12;
    const cw = (e.w * 2 + 0.9) / n;
    for (let i = 0; i < n; i++) {
      g.add(box(cw, 0.35, 0.2, i % 2 ? 0x111111 : WHITE, -e.w - 0.45 + cw * (i + 0.5), H - 0.2));
      g.add(box(cw, 0.35, 0.2, i % 2 ? WHITE : 0x111111, -e.w - 0.45 + cw * (i + 0.5), H - 0.55));
    }
  } else {
    g.add(box(e.w * 2 + 0.9, 0.7, 0.25, ORANGE, 0, H - 0.35));
    g.add(box(e.w * 2 + 0.9, 0.08, 0.27, GOLD, 0, H - 0.72));
    const star = box(0.5, 0.5, 0.12, GOLD, 0, H - 1.3);
    star.rotation.z = Math.PI / 4;
    star.name = 'spin';
    g.add(star);
  }
  return g;
}

export function tajinePickup(width = 0.6) {
  const g = new THREE.Group();
  g.add(model('tagine', TAGINE, { length: width }));
  return g;
}

function build_skatePickup() {
  const g = new THREE.Group();
  g.add(box(0.34, 0.05, 1.0, ORANGE, 0, 0.12));
  g.add(box(0.34, 0.02, 0.96, GOLD, 0, 0.155));
  return g;
}

// Power-up: a red horseshoe magnet with silver tips, standing up so it reads from behind.
function build_magnetPickup() {
  const g = new THREE.Group();
  const R = 0.26;
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * Math.PI; // the bend, bottom half of a ring
    const seg = box(0.13, 0.13, 0.16, 0xd62828, Math.cos(a) * R, 0.55 - Math.sin(a) * R, 0);
    seg.rotation.z = a;
    g.add(seg);
  }
  for (const sx of [-1, 1]) {
    g.add(box(0.14, 0.22, 0.16, 0xd62828, sx * R, 0.66, 0));
    g.add(box(0.15, 0.12, 0.17, 0xdfe6ec, sx * R, 0.82, 0));
  }
  return g;
}

// Power-up: a round shield badge, green zellige star on a white rim.
function build_shieldPickup() {
  const g = new THREE.Group();
  const rim = cyl(0.36, 0.36, 0.08, 16, 0xf1faee, 0, 0.6, 0);
  rim.rotation.x = Math.PI / 2;
  const face = cyl(0.3, 0.3, 0.1, 16, 0x1d7a46, 0, 0.6, 0);
  face.rotation.x = Math.PI / 2;
  g.add(rim, face);
  for (const r of [0, Math.PI / 4]) {
    const star = box(0.28, 0.28, 0.12, GOLD, 0, 0.6, 0);
    star.rotation.z = r;
    g.add(star);
  }
  return g;
}

// The collectible Charba: an orange juice bottle.
function juice() {
  const g = new THREE.Group();
  g.add(model('juice', JUICE_BOTTLE, { height: 0.8 }));
  return g;
}

// A rare 200 dirham note bundle.
function cash() {
  const g = new THREE.Group();
  const m = model('cash', BANKNOTE, { length: 0.9 });
  m.rotation.x = -0.5; // tilted toward the camera so the note shows
  g.add(m);
  return g;
}

// Jump obstacle: a row of apple crates across the street.
function appleCrates(e: Entity) {
  const g = new THREE.Group();
  const n = Math.max(1, Math.round(e.w / 1.5));
  const cw = (e.w * 2) / n;
  for (let i = 0; i < n; i++) {
    const m = model('apples', APPLE_BOX, { length: cw * 0.98 });
    m.position.x = -e.w + cw * (i + 0.5);
    if (i % 2) m.rotation.y = Math.PI;
    g.add(m);
  }
  return g;
}

export function entityObject(e: Entity, c: City): THREE.Object3D {
  if (e.kind === 'crate' && c.id === 'safi') return pots(e);
  switch (e.kind) {
    case 'can':
      return juice();
    case 'cash':
      return cash();
    case 'crate':
      return appleCrates(e);
    case 'awning':
      return awning(e, c);
    case 'taxi':
      return car(e, c);
    case 'scooter':
      return scooter();
    case 'donkey':
      return donkeyCart();
    case 'checkpoint':
      return arch(e, false);
    case 'finish':
      return arch(e, true);
    case 'tajine':
      return tajinePickup();
    case 'skate':
      return skatePickup();
    case 'magnet':
      return flat('magnet', build_magnetPickup);
    case 'shield':
      return flat('shield', build_shieldPickup);
  }
}

// Roadside scenery: house facades, palms, lamps and flags.
function build_house(c: City, variant: number, side: number) {
  // A Moroccan town house, 2 or 3 storeys: shops or a carved door on the ground floor, framed windows with
  // shutters and the odd balcony above, a parapet roof with a satellite dish or a water tank. Built from
  // boxes, then merged by flat() into one or two meshes.
  const g = new THREE.Group();
  const W = 6.6; // along the street
  const D = 4; // away from it
  const v = (k: number) => Math.floor(hashN(variant * 7 + side * 3 + k) * 1000);
  const floors = 2 + (variant % 2); // 2 or 3 storeys, low enough to leave the skyline landmarks in view
  const GROUND = 3.2;
  const STOREY = 2.9;
  const H = GROUND + (floors - 1) * STOREY;
  const tones = [c.near, '#' + hex6(shadeHex(c.near, -10)), '#' + hex6(shadeHex(c.near, 5)), '#' + hex6(shadeHex(c.near, -18))];
  const tone = tones[(variant + (side > 0 ? 1 : 0)) % tones.length];
  const dark = shadeHex(tone, -22);
  const fx = -side * (D / 2); // facade plane, facing the road
  // A box on the facade: `wz` along the street, `t` thick, standing `out` proud of the wall.
  const f = (wz: number, h: number, t: number, color: number | string, y: number, z: number, out = 0) =>
    g.add(box(t, h, wz, color, fx - side * (t / 2 + out), y, z));

  g.add(box(D, H, W, tone, 0, H / 2));
  f(W, 0.55, 0.06, dark, 0.27, 0); // plinth
  // Ground floor: two bays, each a shop (dark opening, half-raised shutter, striped awning) or a door.
  // Shop awnings: mostly glazed green tile like the city's trims, now and then canvas.
  const AWNINGS = [c.accent, c.accent, 0x2d6a4f, c.accent, 0xc1272d, 0xe9c46a];
  for (const [k, z] of [[0, -1.65], [1, 1.65]] as const) {
    if (v(k) % 3 !== 0) {
      f(2.4, 2.5, 0.04, 0x2a2420, 1.35, z);
      f(2.4, 0.8, 0.07, 0x9aa0a6, 2.2, z); // rolled-up shutter
      const aw = box(0.9, 0.08, 2.6, AWNINGS[v(k + 4) % AWNINGS.length], fx - side * 0.45, 2.75, z);
      aw.rotation.z = side * 0.28;
      g.add(aw);
    } else {
      f(1.6, 2.7, 0.03, c.accent, 1.35, z); // tiled surround
      f(1.1, 2.3, 0.06, 0x6b3e1f, 1.15, z); // carved wooden door
      f(0.08, 0.08, 0.1, 0xd4a017, 1.2, z + 0.35); // knocker
      // A little roof of green glazed tiles over the door, on carved beams.
      const canopy = box(0.75, 0.14, 2.1, c.accent, fx - side * 0.36, 2.95, z);
      canopy.rotation.z = side * 0.35;
      g.add(canopy);
      for (const bz of [-0.8, 0.8]) f(0.1, 0.1, 0.55, 0x5c3a1e, 2.8, z + bz);
    }
  }
  // Upper storeys.
  const frame = v(9) % 2 ? 0xffffff : shadeHex(tone, 18);
  for (let fl = 1; fl < floors; fl++) {
    const y0 = GROUND + (fl - 1) * STOREY;
    f(W, 0.14, 0.08, dark, y0, 0); // floor band
    const balcony = v(10 + fl) % 4 === 0;
    for (const z of [-1.9, 0, 1.9]) {
      if (z === 0 && !balcony && v(20 + fl) % 2) continue;
      f(1.0, 1.45, 0.04, frame, y0 + 1.45, z);
      if (c.night && v(50 + fl * 3 + Math.round(z)) % 3 !== 0) {
        // A lit window at night.
        const lit = new THREE.Mesh(geo('box0.07,1.22,0.78', () => new THREE.BoxGeometry(0.07, 1.22, 0.78)), mat(0xffcf7a, { emissive: true }));
        lit.position.set(fx - side * 0.035, y0 + 1.45, z);
        g.add(lit);
      } else f(0.78, 1.22, 0.07, 0x2f3b45, y0 + 1.45, z); // glass
      if (v(30 + fl) % 2) for (const sz of [-1, 1]) f(0.36, 1.25, 0.06, c.accent, y0 + 1.45, z + sz * 0.62, 0.02); // shutters
    }
    if (balcony) {
      f(2.4, 0.12, 0.75, dark, y0 + 0.62, 0);
      f(2.4, 0.75, 0.05, 0x2b2b2b, y0 + 1.0, 0, 0.7); // wrought-iron rail
    }
  }
  // Roof: a parapet capped with the city's coloured tiles, a tiled eave under it, and what Moroccan roofs
  // always carry.
  f(W, 0.5, 0.28, tone, H + 0.25, 0);
  g.add(box(D + 0.12, 0.3, W + 0.12, c.accent, 0, H + 0.62)); // tiled cap all round
  const eave = box(0.6, 0.12, W, c.accent, fx - side * 0.28, H - 0.12, 0);
  eave.rotation.z = side * 0.4;
  g.add(eave);
  if (v(40) % 2) {
    const post = box(0.06, 0.6, 0.06, 0x888888, side * 0.4, H + 0.3, v(41) % 2 ? -1.8 : 1.8);
    const dish = cyl(0.42, 0.42, 0.05, 10, 0xeeeeee, side * 0.3, H + 0.7, post.position.z);
    dish.rotation.z = -side * 1.1;
    g.add(post, dish);
  }
  if (v(42) % 3 === 0) g.add(cyl(0.45, 0.45, 0.9, 8, v(43) % 2 ? 0xf2f2f2 : 0x1d6fb8, side * 0.9, H + 0.45, v(44) % 2 ? 1 : -1)); // water tank
  return g;
}

const hashN = (i: number) => {
  let x = Math.imul(i ^ 0x2c1b3c6d, 0x297a2d39);
  x ^= x >>> 15;
  return ((Math.imul(x, 0x85ebca6b) ^ (x >>> 13)) >>> 0) / 4294967296;
};
const hex6 = (n: number) => n.toString(16).padStart(6, '0');

// Real Moroccan houses from the asset pack, picked per city. `front` is the axis the facade faces.
type HouseModel = { key: string; data: BakedModel; front: 1 | -1 };
const POPULAR: HouseModel = { key: 'popular', data: POPULAR_HOUSE, front: 1 };
const DERBY: HouseModel = { key: 'derby', data: DERBY_HOUSE, front: 1 };
const OLD: HouseModel = { key: 'old', data: OLD_HOUSE, front: 1 };
const MIXED: HouseModel = { key: 'mixed', data: MIXED_FACADE, front: -1 };
const RIAD: HouseModel = { key: 'riad', data: MOROCCO_HOUSE, front: 1 };
const CITY_HOUSES: Record<string, HouseModel[]> = {
  casablanca: [POPULAR, DERBY, POPULAR],
  safi: [OLD, MIXED],
  marrakech: [OLD, RIAD, MIXED],
  fes: [OLD, MIXED, RIAD],
  tangier: [POPULAR, RIAD],
  rabat: [POPULAR, RIAD, MIXED],
  agadir: [POPULAR, POPULAR, MIXED],
  // Chefchaouen is all blue-washed walls: only the town houses built in code, in the city's blues.
};

export const hasModelHouses = (c: City) => !!CITY_HOUSES[c.id];

// Returns the house and how deep it is, so the scene can put its facade on the pavement line.
export function modelHouse(c: City, variant: number, side: number) {
  const list = CITY_HOUSES[c.id] ?? [POPULAR];
  const hm = list[variant % list.length];
  const m = model(hm.key, hm.data, { height: 7.5 + (variant % 3) * 0.8, maxSide: 7.5 });
  // Rotate so the facade looks across the street (+x for the left side, -x for the right side).
  m.rotation.y = -side * (Math.PI / 2) + (hm.front < 0 ? Math.PI : 0);
  const g = new THREE.Group();
  g.add(m);
  return { obj: g, depth: hm.data.size[2] * m.scale.x };
}

// Every baked model a run can show, keyed as model() keys them, so they can be decoded ahead of time.
const STREET_MODELS: [string, BakedModel, Recolor?][] = [
  ['dacia', DACIA, grandTaxiPaint],
  ['police', POLICE_CAR],
  ['police-chaser', POLICE_CAR],
  ['boy', BOY],
  ['juice', JUICE_BOTTLE],
  ['juice-giant', JUICE_BOTTLE],
  ['cash', BANKNOTE],
  ['apples', APPLE_BOX],
  ['palm', PALM_TREE],
  ['maple', MAPLE_TREE],
  ['teatable', TEA_TABLE],
  ['tagine', TAGINE],
  ['majmar', MAJMAR],
  ['stall', FRUIT_STALL],
  ['spice', SPICE_MARKET],
  ['donkey', DONKEY],
  ['chicken', CHICKEN],
  ['busstop', BUS_STOP],
  ['minesign', MINE_SIGN],
  ['oldman', OLD_MAN],
];
const LANDMARK_MODELS: Partial<Record<Landmark, [string, BakedModel]>> = {
  mosque: ['mosque', HASSAN_MOSQUE],
  koutoubia: ['koutoubia', HASSAN_TOWER],
  bab: ['bab', CITY_GATE],
  ramparts: ['ramparts', RAMPARTS],
};

// One small piece of up-front work. Running a job twice is harmless: everything it builds is cached.
export type WarmJob = { key: string; run: () => void };

// The decoding a city needs before its first frame (no city: every city, for the endless run), split into
// small jobs so a loader can keep moving between them and the menus can do them in the background.
export function warmJobs(c?: City): WarmJob[] {
  const jobs: WarmJob[] = [];
  const add = (key: string, data: BakedModel, recolor?: Recolor) => {
    jobs.push({ key: `tex:${key}`, run: () => bakedMaterial(key, data, recolor) });
    jobs.push({ key: `geo:${key}`, run: () => bakedGeo(key, data) });
  };
  const houses = c ? (CITY_HOUSES[c.id] ?? []) : Object.values(CITY_HOUSES).flat();
  for (const hm of houses) add(hm.key, hm.data);
  for (const lm of new Set(c ? c.landmarks : (Object.keys(LANDMARK_MODELS) as Landmark[]))) {
    const m = LANDMARK_MODELS[lm];
    if (m) add(m[0], m[1]);
  }
  for (const [key, data, recolor] of STREET_MODELS) add(key, data, recolor);
  jobs.push({ key: 'geo:boy-walk', run: () => geo('boy-walk', () => posedGeometry(BOY, KID_CYCLE.poses, kidPose, true)) });
  jobs.push({ key: 'geo:oldman-seated', run: () => geo('oldman-seated', seatedOldMan) });
  return jobs;
}

// Decode a city's models up front (at the start screen) so nothing stutters mid-run.
export function warmModels(c: City) {
  for (const j of warmJobs(c)) j.run();
}

// The decoded atlas of a model key, so the renderer can upload it to the GPU before the run, not mid-run.
export const bakedMap = (key: string) => (bakedMats.get(key) as THREE.MeshLambertMaterial | undefined)?.map ?? undefined;

// A bus shelter on the pavement, open side to the street.
export function busStop(side: number) {
  const g = new THREE.Group();
  const m = model('busstop', BUS_STOP, { height: 2.6 });
  m.rotation.y = -side * (Math.PI / 2);
  g.add(m);
  return g;
}

// An old man in a djellaba strolling down the pavement toward you: 8 poses of one 1.44 s walk cycle
// that covers 2 m, so walk him at 1.4 m/s or his feet slide.
export const OLD_MAN_CYCLE = { poses: 8, seconds: 1.44, speed: 1.4 };
export function oldMan() {
  const g = new THREE.Group();
  g.add(model('oldman', OLD_MAN, { height: 1.7 }));
  return g;
}

// The little animals are built from simple shapes, PS1 style, and move their parts in code. Their phases
// follow the same pose counts as the baked models (animate()), so the scene drives them the same way.
const ellipsoid = (r: number, sx: number, sy: number, sz: number, color: number, x = 0, y = 0, z = 0, seg = 8) => {
  const m = sphere(r, color, x, y, z, seg);
  m.scale.set(sx, sy, sz);
  return m;
};

// A street cat padding along the foot of the houses toward you (faces +z). One walk cycle is 8 "poses".
export const CAT_CYCLE = { poses: 8, seconds: 0.767, speed: 0.8 };
const CAT_COATS = [0xd98a3a, 0x2a2a2a, 0xe6e1d6, 0x8c8378, 0xc9a27a];
export function cat(seed = 0) {
  const coat = CAT_COATS[Math.abs(Math.floor(seed)) % CAT_COATS.length];
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(ellipsoid(0.1, 0.8, 0.72, 2.0, coat, 0, 0.2, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.28, 0.24);
  head.add(sphere(0.075, coat, 0, 0, 0, 7));
  for (const sx of [-1, 1]) {
    const ear = cyl(0, 0.03, 0.06, 4, coat, sx * 0.04, 0.07, -0.01);
    ear.rotation.z = -sx * 0.25;
    head.add(ear, sphere(0.012, 0xc8d64a, sx * 0.028, 0.012, 0.065, 5));
  }
  head.add(sphere(0.01, 0xe58a8a, 0, -0.01, 0.075, 4));
  body.add(head);
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.05, 0.13], [0.05, 0.13], [-0.05, -0.13], [0.05, -0.13]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.17, z);
    hip.add(cyl(0.018, 0.016, 0.17, 5, coat, 0, -0.085, 0));
    legs.push(hip);
    body.add(hip);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.24, -0.19);
  const t1 = cyl(0.016, 0.014, 0.14, 5, coat, 0, 0.07, 0);
  tail.add(t1);
  tail.rotation.x = -0.9;
  body.add(tail);
  g.add(body);
  g.userData.animate = (phase: number) => {
    const a = (phase / CAT_CYCLE.poses) * Math.PI * 2;
    const sw = Math.sin(a) * 0.45;
    legs[0].rotation.x = legs[3].rotation.x = sw; // diagonal pairs move together
    legs[1].rotation.x = legs[2].rotation.x = -sw;
    body.position.y = Math.abs(Math.cos(a)) * 0.012;
    tail.rotation.z = Math.sin(a / 2) * 0.35;
    head.rotation.y = Math.sin(a / 4) * 0.15;
  };
  return g;
}

// Three pigeons bobbing their heads on the pavement. Each faces +x; the head thrusts forward and back.
// Built once, merged into a body and a head mesh, and cloned: three pigeons cost six draw calls, not forty.
function buildPigeon() {
  const g = new THREE.Group();
  g.add(ellipsoid(0.09, 1.5, 1, 1, 0x8f9bab, 0, 0.13, 0));
  g.add(ellipsoid(0.091, 1.2, 0.72, 1.03, 0x707c8a, -0.025, 0.14, 0)); // folded wings
  const tail = box(0.12, 0.02, 0.07, 0x4d5560, -0.15, 0.12, 0);
  tail.rotation.z = 0.25;
  g.add(tail);
  const head = new THREE.Group();
  head.position.set(0.1, 0.18, 0);
  head.add(sphere(0.045, 0x5f7f78, 0, 0, 0, 6)); // the green sheen of the neck
  head.add(sphere(0.04, 0x5c6878, 0.03, 0.045, 0, 6));
  const beak = cyl(0, 0.012, 0.035, 4, 0x3a3a3a, 0.08, 0.04, 0);
  beak.rotation.z = -Math.PI / 2;
  head.add(beak);
  for (const sz of [-1, 1]) head.add(sphere(0.008, 0xe8a03a, 0.055, 0.055, sz * 0.03, 4));
  head.name = 'head';
  g.add(flatten(head));
  for (const sz of [-1, 1]) g.add(cyl(0.006, 0.006, 0.08, 4, 0xd9726b, 0, 0.04, sz * 0.025));
  return g;
}

function pigeon() {
  const g = flat('pigeon', buildPigeon);
  const head = g.getObjectByName('head')!;
  g.userData.animate = (phase: number) => {
    const u = ((phase % 8) + 8) % 8;
    const f = u <= 4 ? u / 4 : (8 - u) / 4; // forward and back
    head.position.set(0.1 + f * 0.035, 0.18 - f * 0.012, 0);
  };
  return g;
}

export function pigeons(seed: number) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const holder = new THREE.Group();
    holder.position.set(Math.cos(seed + i * 2.1) * 0.45, 0, Math.sin(seed * 1.7 + i * 2.1) * 0.6);
    holder.rotation.y = seed * 1.9 + i * 2.4;
    holder.add(pigeon());
    g.add(holder);
  }
  return g;
}

// A seagull for the port cities, wings flapping with the tips trailing. Faces +z, body at the origin.
// Merged like the pigeons: a body, and an inner and outer mesh per wing.
export const GULL_CYCLE = { poses: 8, seconds: 1.2 };
function buildGull() {
  const g = new THREE.Group();
  g.add(ellipsoid(0.1, 0.9, 0.85, 2.2, 0xf2f2f0));
  g.add(sphere(0.07, 0xf2f2f0, 0, 0.05, 0.22, 7));
  const beak = cyl(0, 0.016, 0.07, 4, 0xf2c12e, 0, 0.04, 0.31);
  beak.rotation.x = Math.PI / 2;
  g.add(beak, box(0.14, 0.02, 0.14, 0xd0d4d8, 0, 0, -0.27));
  for (const side of [-1, 1]) {
    const outer = new THREE.Group();
    outer.position.x = side * 0.32;
    outer.add(box(0.26, 0.016, 0.15, 0xb9c3cc, side * 0.13, 0, -0.01));
    outer.add(box(0.09, 0.017, 0.12, 0x222222, side * 0.3, 0, -0.02)); // black wingtips
    outer.name = `outer${side}`;
    const inner = new THREE.Group();
    inner.position.set(side * 0.07, 0.03, 0.02);
    inner.add(box(0.32, 0.02, 0.2, 0xb9c3cc, side * 0.16, 0, 0));
    inner.add(flatten(outer));
    inner.name = `inner${side}`;
    g.add(flatten(inner));
  }
  return g;
}

export function seagull() {
  const g = flat('gull', buildGull);
  const joints = [-1, 1].map((side) => ({ inner: g.getObjectByName(`inner${side}`)!, outer: g.getObjectByName(`outer${side}`)!, side }));
  g.userData.animate = (phase: number) => {
    const a = Math.sin((phase / GULL_CYCLE.poses) * Math.PI * 2);
    const lag = Math.sin((phase / GULL_CYCLE.poses) * Math.PI * 2 - 0.8);
    for (const j of joints) {
      j.inner.rotation.z = j.side * a * 0.45;
      j.outer.rotation.z = j.side * lag * 0.35;
    }
  };
  return g;
}

// A red skull-and-crossbones danger sign on a post, turned toward the oncoming runner.
export function dangerSign(side: number) {
  const g = new THREE.Group();
  const m = model('minesign', MINE_SIGN, { height: 1.4 });
  m.rotation.y = -side * 0.5;
  g.add(m);
  return g;
}

// A couple of chickens pecking about on the pavement (5 poses, played forward and back).
export function chickens(seed: number) {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const m = model('chicken', CHICKEN, { height: 0.42 });
    const holder = new THREE.Group();
    holder.position.set((i - 0.5) * 0.7, 0, i * 0.5);
    holder.rotation.y = seed * 2.3 + i * 2.1;
    holder.add(m);
    g.add(holder);
  }
  return g;
}

// A boy walking along the pavement. The model was baked standing in a T-pose, so the walk is made here:
// the arms are lowered to his sides, and arms and legs swing about the shoulders and hips (model space:
// front +z, hips at y 0.6, shoulders at y 0.77, x 0.14). 8 poses to a stride.
export const KID_CYCLE = { poses: 8, seconds: 0.86, speed: 1.25 };
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function kidPose(base: Float32Array, k: number) {
  const out = new Float32Array(base.length);
  const a = (k / KID_CYCLE.poses) * Math.PI * 2;
  const swing = Math.sin(a) * 0.42;
  const HIP = 0.6;
  const SHOULDER = 0.77;
  for (let i = 0; i < base.length; i += 3) {
    let x = base[i];
    let y = base[i + 1];
    let z = base[i + 2];
    const side = x < 0 ? -1 : 1;
    // Arms: everything out past the shoulder, above the waist.
    const arm = y > 0.64 ? smoothstep(0.12, 0.18, Math.abs(x)) : 0;
    if (arm > 0) {
      const px = side * 0.14;
      const down = side * -1.32 * arm; // from straight out to hanging by the side
      const dx = x - px;
      const dy = y - SHOULDER;
      x = px + dx * Math.cos(down) - dy * Math.sin(down);
      y = SHOULDER + dx * Math.sin(down) + dy * Math.cos(down);
      const th = side * swing * 0.7 * arm; // swings against the leg on the same side
      const ry = y - SHOULDER;
      y = SHOULDER + ry * Math.cos(th) - z * Math.sin(th);
      z = ry * Math.sin(th) + z * Math.cos(th);
    }
    // Legs: below the hips, split down the middle.
    const leg = smoothstep(HIP + 0.02, HIP - 0.06, y);
    if (leg > 0) {
      const th = -side * swing * leg;
      const ry = y - HIP;
      y = HIP + ry * Math.cos(th) - z * Math.sin(th);
      z = ry * Math.sin(th) + z * Math.cos(th);
    }
    out[i] = x;
    out[i + 1] = y + Math.abs(Math.cos(a)) * 0.012; // a slight bob in the step
    out[i + 2] = z;
  }
  return out;
}

export function walkingKid() {
  const m = model('boy', BOY, { height: 1.3 });
  m.geometry = geo('boy-walk', () => posedGeometry(BOY, KID_CYCLE.poses, kidPose, true));
  m.updateMorphTargets();
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function palm() {
  const g = new THREE.Group();
  const m = model('palm', PALM_TREE, { height: 5.6 });
  g.add(m);
  return g;
}

// Street lamp: a dark green pole on the pavement with an arm reaching over the road (-x before turning) and
// a lantern hanging from it.
function build_lamp() {
  const g = new THREE.Group();
  const POLE = 0x1f2d26;
  g.add(cyl(0.17, 0.2, 0.45, 8, POLE, 0, 0.22));
  g.add(cyl(0.06, 0.1, 4.3, 8, POLE, 0, 2.6));
  g.add(sphere(0.09, POLE, 0, 4.78, 0, 6));
  g.add(box(1.25, 0.06, 0.06, POLE, -0.6, 4.6, 0));
  const brace = cyl(0.025, 0.025, 0.75, 5, POLE, -0.3, 4.32, 0);
  brace.rotation.z = -0.95;
  g.add(brace);
  g.add(cyl(0.012, 0.012, 0.16, 4, POLE, -1.2, 4.52, 0));
  g.add(cyl(0.05, 0.17, 0.13, 6, POLE, -1.2, 4.38, 0)); // lantern cap
  const bulb = new THREE.Mesh(geo('bulb', () => new THREE.SphereGeometry(0.14, 8, 6)), mat(0xfff1b8, { emissive: true }));
  bulb.position.set(-1.2, 4.24, 0);
  g.add(bulb);
  return g;
}

export function maple() {
  const g = new THREE.Group();
  g.add(model('maple', MAPLE_TREE, { height: 6.5 }));
  return g;
}

// A carved Moroccan tea table on the pavement, with a bottle of Charba on it and an incense burner beside it.
export function teaTable() {
  const g = new THREE.Group();
  g.add(model('teatable', TEA_TABLE, { height: 0.6 }));
  const b = model('juice', JUICE_BOTTLE, { height: 0.3 });
  b.position.set(0.1, 0.6, 0);
  g.add(b);
  const m = model('majmar', MAJMAR, { height: 0.3 });
  m.position.set(0, 0, 0.75);
  g.add(m);
  return g;
}

// Souk fruit stall on the pavement; its counter faces the street.
export function fruitStall(side: number) {
  const g = new THREE.Group();
  const m = model('stall', FRUIT_STALL, { height: 2.3 });
  m.rotation.y = -side * (Math.PI / 2) + Math.PI; // front is -z
  g.add(m);
  return g;
}

// A souk spice seller's row of burlap sacks heaped with spice cones, lengthwise along the pavement.
export function spiceMarket() {
  const g = new THREE.Group();
  g.name = 'spice';
  g.add(model('spice', SPICE_MARKET, { length: 4.5 }));
  return g;
}

function build_flag() {
  const g = new THREE.Group();
  g.add(cyl(0.04, 0.04, 4, 6, 0x555555, 0, 2));
  g.add(box(0.04, 0.8, 1.2, 0xc1272d, 0, 3.5, 0.62));
  g.add(box(0.05, 0.25, 0.25, 0x006233, 0, 3.5, 0.62));
  return g;
}

// Skyline landmarks far away, faded by fog.
export function landmark(kind: Landmark, c: City) {
  const g = new THREE.Group();
  const col = shadeHex(c.far, -14);
  switch (kind) {
    case 'minaret':
      g.add(box(6, 34, 6, col, 0, 17));
      g.add(box(6.4, 1.6, 6.4, c.accent, 0, 34));
      g.add(box(2.8, 5, 2.8, col, 0, 37.5));
      g.add(sphere(1.4, c.accent, 0, 40.5));
      break;
    case 'dome':
      g.add(box(16, 9, 16, col, 0, 4.5));
      {
        const d = new THREE.Mesh(geo('dome', () => new THREE.SphereGeometry(7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat(c.accent));
        d.position.y = 9;
        g.add(d);
      }
      break;
    case 'gate':
      g.add(box(8, 18, 4, c.accent, -8, 9));
      g.add(box(8, 18, 4, c.accent, 8, 9));
      g.add(box(24, 6, 4, c.accent, 0, 21));
      g.add(box(26, 1.2, 4.4, col, 0, 24.5));
      break;
    case 'lighthouse':
      g.add(cyl(1.6, 2.4, 26, 10, WHITE, 0, 13));
      g.add(cyl(2.5, 2.5, 2, 10, 0xe63946, 0, 9));
      g.add(cyl(2.0, 2.0, 2, 10, 0xe63946, 0, 18));
      {
        const l = new THREE.Mesh(geo('lhlight', () => new THREE.CylinderGeometry(1.4, 1.4, 2.4, 8)), mat(0xffe066, { emissive: true }));
        l.position.y = 27.2;
        g.add(l);
      }
      break;
    case 'palm':
      g.add(cyl(0.6, 0.9, 18, 6, col, 0, 9));
      g.add(sphere(4.5, col, 0, 19, 0, 6));
      break;
    case 'fortress':
      // Ksar el Bahr: the Portuguese sea castle, square bastions with battlements.
      g.add(box(34, 12, 14, col, 0, 6));
      for (const x of [-17, 17]) g.add(box(9, 17, 9, col, x, 8.5));
      for (let i = 0; i < 9; i++) g.add(box(2, 2, 14.4, col, -16 + i * 4, 13));
      for (const x of [-17, 17]) for (const dx of [-3, 3]) g.add(box(2, 2, 9.4, col, x + dx, 18));
      break;
    case 'kiln':
      // Pottery kilns on the potters' hill, beehive domes with a smoke stack.
      g.add(box(18, 6, 10, col, 0, 3));
      for (const x of [-5, 5]) {
        const k = new THREE.Mesh(geo('kiln', () => new THREE.SphereGeometry(4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0xb5562c));
        k.position.set(x, 6, 0);
        g.add(k);
      }
      g.add(cyl(0.8, 1, 8, 6, 0x7b3f1d, 0, 10));
      break;
    case 'mosque':
      g.add(model('mosque', HASSAN_MOSQUE, { height: 62 }));
      break;
    case 'koutoubia':
      g.add(model('koutoubia', HASSAN_TOWER, { height: 44 }));
      break;
    case 'bab':
      g.add(model('bab', CITY_GATE, { height: 22 }));
      break;
    case 'ramparts': {
      const m = model('ramparts', RAMPARTS, { height: 12 });
      m.rotation.y = Math.PI / 2; // the long side runs along the horizon
      g.add(m);
      break;
    }
    case 'mountain': {
      // A mountain range: a jagged ridge line with rocky facets falling toward the city, not lone cones.
      const geom = geo(`range${c.seed}`, () => {
        const N = 22;
        const rows = 4;
        const pts: number[][][] = [];
        for (let r = 0; r <= rows; r++) {
          const row: number[][] = [];
          const k = r / rows; // 0 at the foot, 1 on the ridge
          for (let i = 0; i <= N; i++) {
            const u = i / N;
            const peaks = 0.55 + 0.45 * Math.sin(u * 9.1 + c.seed) * Math.sin(u * 3.7 + 1.3) + (hashN(c.seed * 31 + i) - 0.5) * 0.35;
            const ridge = 22 + 58 * Math.max(0.15, peaks) * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.02)) ** 0.6;
            const jit = (hashN(c.seed * 97 + r * 41 + i) - 0.5) * (r && r < rows ? 9 : 0);
            row.push([-210 + u * 420 + jit, ridge * Math.pow(k, 1.25) + jit * 0.4 * k, 45 - k * 50]);
          }
          pts.push(row);
        }
        const pos: number[] = [];
        for (let r = 0; r < rows; r++)
          for (let i = 0; i < N; i++) {
            const [a, b, c2, d] = [pts[r][i], pts[r][i + 1], pts[r + 1][i + 1], pts[r + 1][i]];
            pos.push(...a, ...b, ...c2, ...a, ...c2, ...d);
          }
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g2.computeVertexNormals();
        return g2;
      });
      g.add(new THREE.Mesh(geom, mat(shadeHex(c.far, -4))));
      break;
    }
    case 'tower':
      g.add(box(12, 40, 12, col, 0, 20));
      g.add(box(12.4, 1.2, 12.4, c.accent, 0, 40));
      break;
  }
  return g;
}

export function shadeHex(hex: string, pct: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255)));
  return (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255);
}

// The giant rolling Charba bottle from the end-of-city chase, lying on its side.
// Marrakech's chaser: a police van, big and close behind, lights going. Faces -z (it chases you).
export function policeChaser() {
  const g = new THREE.Group();
  const m = model('police-chaser', POLICE_CAR, { length: 4.3 });
  m.rotation.y = Math.PI / 2; // modelled nose at -x; nose toward -z, down the street after you
  g.add(m);
  const roof = POLICE_CAR.size[1] * m.scale.y;
  g.add(box(1.2, 0.12, 0.32, 0x222222, 0, roof + 0.02, 0));
  for (const [name, x, color] of [['sirenR', -0.3, 0xff2b2b], ['sirenB', 0.3, 0x2b6bff]] as const) {
    const light = new THREE.Mesh(geo('siren-big', () => new THREE.BoxGeometry(0.5, 0.16, 0.34)), mat(color, { emissive: true }));
    light.position.set(x, roof + 0.12, 0);
    light.name = name;
    g.add(light);
  }
  // Headlights glaring at you.
  for (const x of [-0.7, 0.7]) {
    const h = new THREE.Mesh(geo('headlight', () => new THREE.BoxGeometry(0.35, 0.2, 0.05)), mat(0xfff6c8, { emissive: true }));
    h.position.set(x, 0.6, -2.17);
    g.add(h);
  }
  return g;
}

export function giantBottle() {
  const g = new THREE.Group();
  const roll = new THREE.Group();
  roll.name = 'roll';
  const m = model('juice-giant', JUICE_BOTTLE, { height: 6.2 });
  const r = (JUICE_BOTTLE.size[0] * m.scale.x) / 2;
  m.position.y = -6.2 / 2; // centre the bottle on its axis
  roll.add(m);
  roll.rotation.z = Math.PI / 2; // bottle axis across the street
  const spin = new THREE.Group();
  spin.name = 'spin';
  spin.add(roll);
  g.add(spin);
  g.userData.radius = r;
  return g;
}

function pots(e: Entity) {
  return flat(`pots|${e.w}|${e.h}`, () => build_pots(e));
}

function awning(e: Entity, c: City) {
  return flat(`awning|${c.id}|${e.w}|${e.y}|${e.h}`, () => build_awning(e, c));
}

function scooter() {
  return flat('scooter', () => build_scooter());
}

function arch(e: Entity, finish: boolean) {
  return flat(`arch|${finish}|${e.w}|${e.h}`, () => build_arch(e, finish));
}

function skatePickup() {
  return flat('skate', () => build_skatePickup());
}

function taxi(c: City) {
  return flat(`taxi|${c.taxi}`, () => build_taxi(c));
}

export function house(c: City, variant: number, side: number) {
  return flat(`house|${c.id}|${variant}|${side}`, () => build_house(c, variant, side));
}

export function lamp() {
  return flat('lamp', () => build_lamp());
}

export function flag() {
  return flat('flag', () => build_flag());
}

// A zebra crossing across the street, and a manhole cover: painted and cast details on the asphalt.
export function zebra(c: City) {
  return flat(`zebra|${c.line}`, () => {
    const g = new THREE.Group();
    for (let k = 0; k < 9; k++) g.add(box(0.42, 0.01, 2.6, c.line, -2.6 + k * 0.65, 0.025, 0));
    g.add(box(6, 0.01, 0.22, c.line, 0, 0.025, -1.75)); // stop line
    return g;
  });
}

export function manhole() {
  return flat('manhole', () => {
    const g = new THREE.Group();
    g.add(cyl(0.38, 0.38, 0.02, 12, 0x3a3a3a, 0, 0.022));
    g.add(cyl(0.3, 0.3, 0.025, 12, 0x4a4a4a, 0, 0.024));
    return g;
  });
}
