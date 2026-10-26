import * as THREE from 'three';
import type { City, Landmark } from '../cities';
import type { Entity } from '../engine';
import { TAXI_PARTS } from './taxiMesh';
import type { BakedModel } from './models/types';
import { bakedGeometry, bakedTexture } from './models/decode';
import { APPLE_BOX } from './models/appleBox';
import { BANKNOTE } from './models/banknote';
import { BOY } from './models/boy';
import { CHICKEN } from './models/chicken';
import { DONKEY } from './models/donkey';
import { FRUIT_STALL } from './models/fruitStall';
import { MAJMAR } from './models/majmar';
import { TAGINE } from './models/tagine';
import { JUICE_BOTTLE } from './models/juiceBottle';
import { LAMPPOST } from './models/lamppost';
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

// Models baked by scripts/bake-model.py (base at y=0, centred on x/z), each with its own texture atlas.
const bakedMats = new Map<string, THREE.Material>();

export function model(key: string, data: BakedModel, fit: { height?: number; length?: number; maxSide?: number }, recolor?: (px: Uint8Array, i: number) => void) {
  let material = bakedMats.get(key);
  if (!material) {
    // Cut-out textures (palm fronds) use alpha testing: no sorting, cheap on phones.
    material = new THREE.MeshLambertMaterial({ map: bakedTexture(data, recolor), side: THREE.DoubleSide, alphaTest: data.alpha ? 0.5 : 0 });
    bakedMats.set(key, material);
  }
  const m = new THREE.Mesh(geo(`model-${key}`, () => bakedGeometry(data)), material);
  const [w, h, d] = data.size;
  let k = fit.length !== undefined ? fit.length / Math.max(w, d) : (fit.height ?? 1) / h;
  if (fit.maxSide !== undefined) k = Math.min(k, fit.maxSide / Math.max(w, d));
  m.scale.setScalar(k);
  return m;
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
function pots(e: Entity) {
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

function crates(e: Entity) {
  const g = new THREE.Group();
  const n = Math.max(1, Math.round(e.w * 2));
  const cw = (e.w * 2) / n;
  for (let i = 0; i < n; i++) {
    const x = -e.w + cw * (i + 0.5);
    g.add(box(cw * 0.94, e.h, e.depth, i % 2 ? 0xb07a45 : 0xa06a38, x, e.h / 2));
    g.add(box(cw * 0.96, 0.06, e.depth * 1.02, 0x6b4423, x, e.h * 0.35));
    for (let k = -1; k <= 1; k++) g.add(sphere(0.13, ORANGE, x + k * cw * 0.28, e.h + 0.08, 0, 6));
  }
  return g;
}

function awning(e: Entity, c: City) {
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

// Traffic mixes petit taxis (most), Dacia grand taxis and the odd police car.
function car(e: Entity, c: City) {
  const r = ((Math.imul(e.id + 1, 2654435761) >>> 0) % 100) / 100;
  if (r < 0.6) return taxi(c);
  const g = new THREE.Group();
  if (r < 0.88) {
    const m = model('dacia', DACIA, { length: 4.0 }, grandTaxiPaint);
    m.rotation.y = Math.PI; // front is +z; drive away from the camera
    g.add(m);
  } else {
    const m = model('police', POLICE_CAR, { length: 4.0 });
    m.rotation.y = -Math.PI / 2; // modelled lengthwise along x, nose at -x
    g.add(m);
  }
  return g;
}

// Petit taxi built from the decimated taxi model; only the body takes the city colour.
function taxi(c: City) {
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

function scooter() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.35, 1.3, 0x2a9d8f, 0, 0.45));
  g.add(box(0.45, 0.6, 0.35, 0xe9c46a, 0, 0.95, 0.15));
  g.add(sphere(0.2, 0x264653, 0, 1.42, 0.15));
  const w1 = cyl(0.22, 0.22, 0.12, 10, 0x111111, 0, 0.22, -0.5);
  const w2 = cyl(0.22, 0.22, 0.12, 10, 0x111111, 0, 0.22, 0.5);
  w1.rotation.z = w2.rotation.z = Math.PI / 2;
  g.add(w1, w2);
  return g;
}

function donkeyCart(e: Entity) {
  const g = new THREE.Group();
  const w = e.w * 2;
  // donkey in front (further away from the player); the model faces +x
  const donkey = model('donkey', DONKEY, { length: 1.9 });
  donkey.rotation.y = Math.PI / 2;
  donkey.position.z = -1.5;
  donkey.name = 'donkey';
  g.add(donkey);
  // cart full of fruit
  g.add(box(w, 0.5, 1.4, 0x8b5a2b, 0, 0.75, 0.3));
  for (let i = 0; i < 6; i++) g.add(sphere(0.18, i % 2 ? ORANGE : 0x7cb518, -w / 2 + 0.25 + (i % 3) * (w / 3), 1.1, 0.0 + Math.floor(i / 3) * 0.6, 6));
  for (const sx of [-1, 1]) {
    const wh = cyl(0.42, 0.42, 0.1, 10, 0x3e2723, sx * (w / 2 + 0.05), 0.42, 0.3);
    wh.rotation.z = Math.PI / 2;
    g.add(wh);
  }
  return g;
}

function arch(e: Entity, finish: boolean) {
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

function skatePickup() {
  const g = new THREE.Group();
  g.add(box(0.34, 0.05, 1.0, ORANGE, 0, 0.12));
  g.add(box(0.34, 0.02, 0.96, GOLD, 0, 0.155));
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
      return donkeyCart(e);
    case 'checkpoint':
      return arch(e, false);
    case 'finish':
      return arch(e, true);
    case 'tajine':
      return tajinePickup();
    case 'skate':
      return skatePickup();
  }
}

// Roadside scenery: house facades, palms, lamps and flags.
export function house(c: City, variant: number, side: number) {
  const g = new THREE.Group();
  const h = 5 + (variant % 3) * 2.2;
  const w = 6.6;
  const tone = variant % 2 ? c.near : shadeHex(c.near, -14);
  g.add(box(4, h, w, tone, 0, h / 2));
  g.add(box(4.1, 0.35, w + 0.1, c.accent, 0, h + 0.17));
  const face = -side * 2.01; // facade faces the road
  for (const z of [-2, 0, 2]) {
    const win = box(0.05, 1.1, 0.75, z === 0 ? c.accent : 0x3a2e2a, face, h - 1.8, z);
    g.add(win);
  }
  g.add(box(0.06, 2.4, 1.3, c.accent, face, 1.2, (variant % 3) - 1));
  return g;
}

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

// Decode a city's textures up front (at the start screen) so nothing stutters mid-run.
export function warmModels(c: City) {
  for (const hm of CITY_HOUSES[c.id] ?? []) model(hm.key, hm.data, {});
  model('dacia', DACIA, {}, grandTaxiPaint);
  model('police', POLICE_CAR, {});
  model('boy', BOY, {});
  for (const [key, data] of [['juice', JUICE_BOTTLE], ['juice-giant', JUICE_BOTTLE], ['cash', BANKNOTE], ['apples', APPLE_BOX], ['palm', PALM_TREE], ['lamppost', LAMPPOST], ['maple', MAPLE_TREE], ['teatable', TEA_TABLE], ['tagine', TAGINE], ['majmar', MAJMAR], ['stall', FRUIT_STALL], ['donkey', DONKEY], ['chicken', CHICKEN]] as const) model(key, data, {});
}

// A couple of chickens pecking about on the pavement.
export function chickens(seed: number) {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const m = model('chicken', CHICKEN, { height: 0.42 });
    const holder = new THREE.Group();
    holder.position.set((i - 0.5) * 0.7, 0, i * 0.5);
    holder.rotation.y = seed * 2.3 + i * 2.1;
    holder.name = 'peck';
    holder.rotation.order = 'YXZ'; // peck about the chicken's own axis
    holder.add(m);
    g.add(holder);
  }
  return g;
}

// A boy cheering from the pavement, arms out.
export function spectator(side: number) {
  const g = new THREE.Group();
  const m = model('boy', BOY, { height: 1.35 });
  m.rotation.y = -side * (Math.PI / 2);
  m.name = 'bob';
  g.add(m);
  return g;
}

export function palm() {
  const g = new THREE.Group();
  const m = model('palm', PALM_TREE, { height: 5.6 });
  g.add(m);
  return g;
}

// Street lamp: the pole stands on the pavement and the arm reaches over the road (-x before turning).
export function lamp() {
  const g = new THREE.Group();
  const m = model('lamppost', LAMPPOST, { height: 4.6 });
  const k = m.scale.x;
  m.position.x = -1.36 * k; // pole base to the origin
  g.add(m);
  const bulb = new THREE.Mesh(geo('bulb', () => new THREE.SphereGeometry(0.2, 8, 6)), mat(0xfff1b8, { emissive: true }));
  bulb.position.set((-1.58 - 1.36) * k, 9.45 * k, 0);
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

export function flag() {
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
export function giantBottle() {
  const g = new THREE.Group();
  const roll = new THREE.Group();
  roll.name = 'roll';
  const m = model('juice-giant', JUICE_BOTTLE, { height: 5.2 });
  const r = (JUICE_BOTTLE.size[0] * m.scale.x) / 2;
  m.position.y = -5.2 / 2; // centre the bottle on its axis
  roll.add(m);
  roll.rotation.z = Math.PI / 2; // bottle axis across the street
  const spin = new THREE.Group();
  spin.name = 'spin';
  spin.add(roll);
  g.add(spin);
  g.userData.radius = r;
  return g;
}
