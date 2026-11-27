import * as THREE from 'three';
import { tajinePickup } from './props';
import type { Suit } from '../progression';
import { JUMP_V } from '../engine';

// Charbaman, built from three.js primitives: a chunky cartoon runner in a tracksuit with white stripes, a red fez
// with a swinging tassel, sport shades, a moustache, white gloves and sneakers, a khatam (eight-point star) on
// the chest and a cape that streams out behind him. Every limb is a joint holding one merged, vertex-coloured
// mesh, so the whole hero is about twenty draw calls and needs no decoding at load time.

export type HeroRig = {
  root: THREE.Group; // faces -z (away from the camera), feet at y=0
  joints: Record<string, THREE.Object3D>;
  tajine: THREE.Object3D;
  board: THREE.Object3D;
  body: THREE.Group;
  cape: THREE.Mesh;
  tassel: THREE.Object3D;
  meshes: THREE.Mesh[]; // the merged, vertex-coloured parts (recoloured by dressHero)
};

// ---------- Colours ----------

type Role = 'green' | 'suit' | 'suitDark' | 'trim' | 'skin' | 'skinDark' | 'hair' | 'fez' | 'gold' | 'lens' | 'shine' | 'glove' | 'shoe' | 'sole' | 'cape';
const BASE: Record<Role, number> = {
  green: 0x1f8a4c,
  suit: 0xff7a00,
  suitDark: 0xd85f00,
  trim: 0xfff4e6,
  skin: 0xc98b5e,
  skinDark: 0xa86d45,
  hair: 0x2a1a12,
  fez: 0xc8102e,
  gold: 0xffc94a,
  lens: 0x1d2230,
  shine: 0xffb347,
  glove: 0xffffff,
  shoe: 0xf6f3ee,
  sole: 0xff7a00,
  cape: 0xc8102e,
};

function palette(suit?: Suit): Record<Role, THREE.Color> {
  const out = {} as Record<Role, THREE.Color>;
  for (const k of Object.keys(BASE) as Role[]) out[k] = new THREE.Color(BASE[k]);
  if (suit && suit.id !== 'classic') {
    const [r, g, b] = suit.main;
    out.suit.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    out.suitDark.copy(out.suit).multiplyScalar(0.8);
    out.sole.copy(out.suit);
    if (suit.trim) {
      const [tr, tg, tb] = suit.trim;
      out.trim.setRGB(tr / 255, tg / 255, tb / 255, THREE.SRGBColorSpace);
      // The cape takes the trim colour (a red cape on the red suit would vanish).
      out.cape.copy(out.trim);
      out.shine.copy(out.trim);
    }
  }
  return out;
}

// Cartoon shading: three flat bands of light instead of a smooth falloff.
let toonRamp: THREE.DataTexture | undefined;
function ramp() {
  if (!toonRamp) {
    const v = [110, 190, 255];
    const data = new Uint8Array(v.length * 4);
    v.forEach((x, i) => data.set([x, x, x, 255], i * 4));
    toonRamp = new THREE.DataTexture(data, v.length, 1, THREE.RGBAFormat);
    toonRamp.minFilter = THREE.NearestFilter;
    toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}
const toon = (opts: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ gradientMap: ramp(), ...opts });

// ---------- Building blocks ----------

type Part = { geo: THREE.BufferGeometry; role: Role };
type Parts = Record<string, Part[]>;

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const S = new THREE.Vector3();
const P = new THREE.Vector3();

function place(geo: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  M.compose(P.set(...pos), Q.setFromEuler(E.set(...rot)), S.set(...scale));
  return geo.applyMatrix4(M);
}

// A tapered limb segment from the joint along -y (legs) or -x (the L arm) / +x (the R arm).
function limb(r0: number, r1: number, len: number) {
  return new THREE.CylinderGeometry(r0, r1, len, 10, 1).translate(0, -len / 2, 0);
}
const ball = (r: number) => new THREE.SphereGeometry(r, 12, 9);

// Merges one joint's parts into a single vertex-coloured mesh; userData.roles remembers which vertices take
// which colour, so a new suit only rewrites the colour buffer.
function merge(parts: Part[], colors: Record<Role, THREE.Color>, mat: THREE.Material) {
  const geos = parts.map((p) => (p.geo.index ? p.geo.toNonIndexed() : p.geo));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const roles: { start: number; count: number; role: Role }[] = [];
  let o = 0;
  geos.forEach((g, i) => {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    roles.push({ start: o, count: c, role: parts[i].role });
    o += c;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.roles = roles;
  paint(mesh, colors);
  return mesh;
}

function paint(mesh: THREE.Mesh, colors: Record<Role, THREE.Color>) {
  const col = mesh.geometry.attributes.color as THREE.BufferAttribute;
  for (const r of mesh.userData.roles as { start: number; count: number; role: Role }[]) {
    const c = colors[r.role];
    for (let i = r.start; i < r.start + r.count; i++) col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

// An eight-point star (two overlapping squares), flat on the chest.
function star(size: number, depth: number) {
  const a = new THREE.BoxGeometry(size, size, depth);
  const b = new THREE.BoxGeometry(size, size, depth).rotateZ(Math.PI / 4);
  return [a, b];
}

// ---------- The model ----------

// Sizes (metres). The hero stands 1.8 m to the top of the head, the fez adds a little more.
const HIP = 0.92;
const THIGH = 0.43;
const SHIN = 0.41;
const UPPER = 0.27;
const FORE = 0.24;
const SHOULDER_X = 0.235;
const SHOULDER_Y = 0.4;
const CAPE_COLS = 4;
const CAPE_ROWS = 8;
const CAPE_LEN = 0.6;
const CAPE_TOP = 0.36;
const CAPE_BOTTOM = 0.5;

function buildParts(): Parts {
  const parts: Parts = { pelvis: [], torso: [], neck: [], head: [], upperArmL: [], forearmL: [], handL: [], upperArmR: [], forearmR: [], handR: [], thighL: [], shinL: [], footL: [], thighR: [], shinR: [], footR: [] };
  const add = (joint: string, role: Role, ...geos: THREE.BufferGeometry[]) => geos.forEach((geo) => parts[joint].push({ geo, role }));

  // Hips: shorts-shaped block with a white belt and a gold buckle.
  const hips = new THREE.LatheGeometry([new THREE.Vector2(0.001, -0.13), new THREE.Vector2(0.13, -0.13), new THREE.Vector2(0.175, -0.06), new THREE.Vector2(0.18, 0.02), new THREE.Vector2(0.17, 0.08), new THREE.Vector2(0.001, 0.08)], 14);
  add('pelvis', 'suit', place(hips, [0, 0, 0], [0, 0, 0], [1, 1, 0.72]));
  add('pelvis', 'trim', place(new THREE.CylinderGeometry(0.183, 0.183, 0.05, 14, 1, true), [0, 0.045, 0], [0, 0, 0], [1, 1, 0.74]));
  add('pelvis', 'gold', place(new THREE.BoxGeometry(0.07, 0.05, 0.03), [0, 0.045, 0.13]));

  // Chest: a V-shaped torso, the khatam star on the front, a collar.
  const chest = new THREE.LatheGeometry(
    [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.165, 0), new THREE.Vector2(0.17, 0.1), new THREE.Vector2(0.2, 0.25), new THREE.Vector2(0.235, 0.37), new THREE.Vector2(0.22, 0.44), new THREE.Vector2(0.12, 0.5), new THREE.Vector2(0.001, 0.51)],
    20,
  );
  add('torso', 'suit', place(chest, [0, 0, 0], [0, 0, 0], [1, 1, 0.72]));
  // Side stripes down the ribs.
  for (const sx of [-1, 1]) add('torso', 'trim', place(new THREE.BoxGeometry(0.03, 0.4, 0.07), [sx * 0.2, 0.22, 0], [0, 0, sx * -0.14]));
  const [s1, s2] = star(0.12, 0.03);
  add('torso', 'trim', place(s1, [0, 0.3, 0.145], [-0.25, 0, 0]), place(s2, [0, 0.3, 0.145], [-0.25, 0, 0]));
  add('torso', 'green', place(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateX(Math.PI / 2), [0, 0.3, 0.158], [-0.25, 0, 0]));
  add('torso', 'trim', place(new THREE.TorusGeometry(0.085, 0.025, 6, 14).rotateX(Math.PI / 2), [0, 0.49, 0]));
  // Cape clasps on the shoulders.
  for (const sx of [-1, 1]) add('torso', 'gold', place(ball(0.035), [sx * 0.15, 0.44, -0.07]));

  // Neck.
  add('neck', 'skin', place(new THREE.CylinderGeometry(0.06, 0.065, 0.12, 10), [0, 0.03, 0]));

  // Head: skull and jaw, ears, nose, hair at the back, the moustache, the shades.
  add('head', 'skin', place(ball(0.135), [0, 0.13, 0], [0, 0, 0], [1, 1.08, 1.02]));
  add('head', 'skin', place(ball(0.105), [0, 0.06, 0.03], [0, 0, 0], [1.05, 0.75, 1]));
  for (const sx of [-1, 1]) add('head', 'skinDark', place(ball(0.035), [sx * 0.135, 0.12, -0.005], [0, 0, 0], [0.6, 1, 1]));
  add('head', 'skinDark', place(new THREE.ConeGeometry(0.025, 0.06, 8).rotateX(Math.PI / 2), [0, 0.1, 0.15]));
  add('head', 'hair', place(new THREE.SphereGeometry(0.142, 14, 8, Math.PI, Math.PI, 0.3, Math.PI * 0.42), [0, 0.13, -0.004], [0, 0, 0], [1, 1.08, 1.02]));
  for (const sx of [-1, 1]) add('head', 'hair', place(new THREE.CapsuleGeometry(0.02, 0.06, 3, 8), [sx * 0.04, 0.07, 0.135], [0, 0, sx * 1.1]));
  add('head', 'hair', place(new THREE.BoxGeometry(0.06, 0.014, 0.02), [-0.05, 0.188, 0.128], [0, 0, 0.12]), place(new THREE.BoxGeometry(0.06, 0.014, 0.02), [0.05, 0.188, 0.128], [0, 0, -0.12]));
  add('head', 'lens', place(new THREE.CylinderGeometry(0.143, 0.14, 0.06, 18, 1, true, -1.25, 2.5), [0, 0.15, 0.004], [0, 0, 0], [1.02, 1, 1.06]));
  add('head', 'shine', place(new THREE.CylinderGeometry(0.145, 0.145, 0.012, 18, 1, true, -1.2, 2.4), [0, 0.175, 0.004], [0, 0, 0], [1.02, 1, 1.06]));
  // The fez: a truncated cone, a little tilted back, with a button on top.
  const fez = new THREE.LatheGeometry([new THREE.Vector2(0.1, 0), new THREE.Vector2(0.095, 0.03), new THREE.Vector2(0.082, 0.15), new THREE.Vector2(0.001, 0.152)], 16);
  add('head', 'fez', place(fez, [0, 0.215, -0.01], [-0.18, 0, 0.05]));
  add('head', 'hair', place(ball(0.014), [0.007, 0.366, -0.037]));

  // Arms: L reaches along -x, R along +x (T-pose; the pose code lowers them).
  for (const [side, sx] of [['L', -1], ['R', 1]] as const) {
    add(`upperArm${side}`, 'suit', place(ball(0.088), [sx * 0.01, 0, 0]));
    add(`upperArm${side}`, 'suit', place(limb(0.068, 0.056, UPPER), [0, 0, 0], [0, 0, sx * Math.PI / 2]));
    add(`upperArm${side}`, 'trim', place(new THREE.BoxGeometry(UPPER * 0.8, 0.02, 0.03), [sx * UPPER * 0.5, 0.063, 0]));
    add(`forearm${side}`, 'suit', place(ball(0.055), [0, 0, 0]));
    add(`forearm${side}`, 'suit', place(limb(0.054, 0.046, FORE), [0, 0, 0], [0, 0, sx * Math.PI / 2]));
    add(`forearm${side}`, 'glove', place(new THREE.CylinderGeometry(0.062, 0.068, 0.07, 10), [sx * (FORE - 0.02), 0, 0], [0, 0, Math.PI / 2]));
    // A fist: knuckles forward, thumb on top.
    add(`hand${side}`, 'glove', place(ball(0.07), [sx * 0.055, 0, 0.005], [0, 0, 0], [1.15, 0.85, 1]));
    add(`hand${side}`, 'glove', place(new THREE.CapsuleGeometry(0.022, 0.03, 3, 8), [sx * 0.04, 0.04, 0.035], [0, 0, Math.PI / 2]));
  }

  // Legs, with a white stripe down the outside, white socks and chunky sneakers.
  for (const [side, sx] of [['L', -1], ['R', 1]] as const) {
    add(`thigh${side}`, 'suit', place(ball(0.1), [0, -0.01, 0]));
    add(`thigh${side}`, 'suit', place(limb(0.098, 0.074, THIGH), [0, 0, 0]));
    add(`thigh${side}`, 'trim', place(new THREE.BoxGeometry(0.025, THIGH * 0.9, 0.035), [sx * 0.088, -THIGH * 0.48, 0], [0, 0, sx * 0.05]));
    add(`shin${side}`, 'suit', place(ball(0.074), [0, 0, 0]));
    add(`shin${side}`, 'suit', place(limb(0.072, 0.056, SHIN - 0.04), [0, 0, 0]));
    add(`shin${side}`, 'trim', place(new THREE.BoxGeometry(0.022, SHIN * 0.8, 0.03), [sx * 0.066, -SHIN * 0.42, 0], [0, 0, sx * 0.035]));
    add(`shin${side}`, 'trim', place(new THREE.CylinderGeometry(0.06, 0.058, 0.06, 10), [0, -SHIN + 0.02, 0]));
    // Foot joint at the ankle, 8 cm above the street.
    add(`foot${side}`, 'shoe', place(new THREE.CapsuleGeometry(0.068, 0.15, 4, 10).rotateX(Math.PI / 2), [0, -0.035, 0.055], [0, 0, 0], [1, 0.78, 1]));
    add(`foot${side}`, 'sole', place(new THREE.BoxGeometry(0.125, 0.03, 0.29), [0, -0.068, 0.055]));
    add(`foot${side}`, 'suitDark', place(new THREE.BoxGeometry(0.07, 0.02, 0.1), [0, 0.005, 0.1], [0.35, 0, 0]));
  }
  return parts;
}

// The joints, in the frame the pose code works in: the model faces +z, the L limbs are on -x.
function buildSkeleton() {
  const j: Record<string, THREE.Object3D> = {};
  const mk = (name: string, parent: THREE.Object3D | null, x: number, y: number, z = 0) => {
    const o = new THREE.Group();
    o.name = name;
    o.position.set(x, y, z);
    parent?.add(o);
    j[name] = o;
    return o;
  };
  const pelvis = mk('pelvis', null, 0, HIP);
  const torso = mk('torso', pelvis, 0, 0.07);
  const neck = mk('neck', torso, 0, 0.49);
  mk('head', neck, 0, 0.07);
  for (const [side, sx] of [['L', -1], ['R', 1]] as const) {
    const ua = mk(`upperArm${side}`, torso, sx * SHOULDER_X, SHOULDER_Y);
    const fa = mk(`forearm${side}`, ua, sx * UPPER, 0);
    mk(`hand${side}`, fa, sx * FORE, 0);
    const th = mk(`thigh${side}`, pelvis, sx * 0.1, -0.03);
    const sh = mk(`shin${side}`, th, 0, -THIGH);
    mk(`foot${side}`, sh, 0, -SHIN);
  }
  return j;
}

function buildCape(colors: Record<Role, THREE.Color>) {
  const n = (CAPE_COLS + 1) * (CAPE_ROWS + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const idx: number[] = [];
  for (let r = 0; r < CAPE_ROWS; r++)
    for (let c = 0; c < CAPE_COLS; c++) {
      const a = r * (CAPE_COLS + 1) + c;
      const b = a + CAPE_COLS + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  geo.setIndex(idx);
  const cape = new THREE.Mesh(geo, toon({ vertexColors: true, side: THREE.DoubleSide }));
  cape.frustumCulled = false;
  cape.position.set(0, 0.45, -0.1);
  paintCape(cape, colors);
  return cape;
}

// Cape cloth with a gold hem along the bottom row.
function paintCape(cape: THREE.Mesh, colors: Record<Role, THREE.Color>) {
  const col = cape.geometry.attributes.color as THREE.BufferAttribute;
  for (let r = 0; r <= CAPE_ROWS; r++) {
    const c = r === CAPE_ROWS ? colors.gold : colors.cape;
    for (let k = 0; k <= CAPE_COLS; k++) col.setXYZ(r * (CAPE_COLS + 1) + k, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

// Lays the cape out for this frame: it hangs from the shoulders and streams back the faster he runs, rippling.
// The rows are evenly spaced except the last, a thin hem; the middle is shorter than the corners (a swallowtail).
function flowCape(cape: THREE.Mesh, clock: number, lift: number, flutter: number) {
  const pos = cape.geometry.attributes.position as THREE.BufferAttribute;
  for (let c = 0; c <= CAPE_COLS; c++) {
    const u = c / CAPE_COLS - 0.5;
    const len = CAPE_LEN * (0.8 + 0.4 * Math.abs(u));
    const seg = (len - 0.05) / (CAPE_ROWS - 1);
    let y = 0;
    let z = 0;
    for (let r = 0; r <= CAPE_ROWS; r++) {
      const v = Math.min(1, (r * seg) / len);
      const w = CAPE_TOP + (CAPE_BOTTOM - CAPE_TOP) * v;
      if (r > 0) {
        const step = r === CAPE_ROWS ? 0.05 : seg;
        const a = 0.12 + lift * (0.4 + 0.6 * v) + Math.sin(clock * 11 - v * 4.5 + u * 2.5) * flutter * v;
        y -= Math.cos(a) * step;
        z -= Math.sin(a) * step;
      }
      // The edges curl forward a little, so the cape reads as cloth rather than a board.
      const curl = u * u * 0.2 * (0.3 + v);
      pos.setXYZ(r * (CAPE_COLS + 1) + c, u * w + Math.sin(clock * 7 + v * 3) * 0.03 * v, y, z + curl);
    }
  }
  pos.needsUpdate = true;
  cape.geometry.computeVertexNormals();
}

export function buildHero(): HeroRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = Math.PI; // model faces +z; we run toward -z
  root.add(body);
  const colors = palette();
  const mat = toon({ vertexColors: true });
  const joints = buildSkeleton();
  const parts = buildParts();
  const meshes: THREE.Mesh[] = [];
  for (const [name, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const m = merge(list, colors, mat);
    joints[name].add(m);
    meshes.push(m);
  }
  body.add(joints.pelvis);

  const cape = buildCape(colors);
  joints.torso.add(cape);
  flowCape(cape, 0, 0.3, 0.1);

  // The fez tassel hangs from the button and swings on its own.
  const tassel = new THREE.Group();
  tassel.position.set(0.007, 0.366, -0.037);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 4).translate(0, -0.045, 0), toon({ color: 0x1a1a1a }));
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 8).translate(0, -0.12, 0), toon({ color: 0x1a1a1a }));
  tassel.add(cord, tuft);
  joints.head.add(tassel);

  const tajine = makeTajine();
  root.add(tajine);
  const board = makeBoard();
  root.add(board);
  return { root, joints, tajine, board, body, cape, tassel, meshes };
}

// Nothing to decode ahead of a run any more: the hero is built from primitives in a couple of milliseconds.
export const heroJobs: { key: string; run: () => void }[] = [];

export function dressHero(rig: HeroRig, suit: Suit) {
  const colors = palette(suit);
  for (const m of rig.meshes) paint(m, colors);
  paintCape(rig.cape, colors);
}

function makeTajine() {
  const tajine = tajinePickup(0.5);
  tajine.visible = false;
  return tajine;
}

function makeBoard() {
  const board = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 1.0), new THREE.MeshLambertMaterial({ color: 0xff7a00 }));
  deck.position.y = 0.1;
  board.add(deck);
  for (const z of [-0.33, 0.33]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 8), new THREE.MeshLambertMaterial({ color: 0x2b1300 }));
    w.rotation.z = Math.PI / 2;
    w.position.set(0, 0.05, z);
    board.add(w);
  }
  board.visible = false;
  return board;
}

// ---------- Animation ----------

type Pose = {
  runPhase: number;
  airborne: boolean;
  vy: number;
  sliding: boolean;
  skating: boolean;
  tajine: boolean;
  speed?: number; // m/s, streams the cape
  dt: number; // seconds since the last pose (game time)
};

// A pose as plain numbers, so poses can be blended. Angles are on the joints (model facing +z, negative
// thigh x = forward); pelY is the hip height relative to standing.
type PP = {
  thL: number; thR: number; shL: number; shR: number; footL: number; footR: number;
  armXL: number; armXR: number; armZ: number; foreL: number; foreR: number;
  torso: number; torsoY: number; head: number;
  pelX: number; pelY: number; pelYaw: number;
};
const KEYS = ['thL', 'thR', 'shL', 'shR', 'footL', 'footR', 'armXL', 'armXR', 'armZ', 'foreL', 'foreR', 'torso', 'torsoY', 'head', 'pelX', 'pelY', 'pelYaw'] as const;
const blank = (): PP => ({ thL: 0, thR: 0, shL: 0, shR: 0, footL: 0, footR: 0, armXL: 0, armXR: 0, armZ: 0, foreL: 0, foreR: 0, torso: 0, torsoY: 0, head: 0, pelX: 0, pelY: 0, pelYaw: 0 });
function mix(out: PP, a: PP, b: PP, t: number) {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
// Frame-rate independent ease toward a target: rate is roughly 1 / (time to get two thirds of the way).
const ease = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

type Anim = {
  air: number; // 0 running .. 1 jump pose
  slide: number;
  skate: number;
  land: number; // seconds since touching down (Infinity when not landing)
  landHard: number; // how hard that landing was, 0..1
  lead: number; // which leg leads the jump: 1 left, -1 right
  wasAir: boolean;
  lastVy: number;
  clock: number;
  lift: number; // how far the cape streams back
  swing: number; // the tassel's swing (angle and speed)
  swingV: number;
};
const LAND_TIME = 0.24;

// One leg's part of the run cycle at phase f (the L leg uses runPhase, the R leg runPhase + pi). The thigh swings
// forward while sin f > 0; the knee folds high as the leg comes through under the body (cos f > 0), and stays
// nearly straight while the foot is down.
function legCycle(f: number) {
  const th = -Math.sin(f) * 0.85;
  const fold = Math.max(0, Math.cos(f - 0.35));
  const sh = 0.22 + 1.45 * fold * fold;
  const foot = -0.15 + 0.55 * fold;
  return [th, sh, foot];
}

const runPose = (out: PP, phase: number) => {
  const s = Math.sin(phase);
  [out.thL, out.shL, out.footL] = legCycle(phase);
  [out.thR, out.shR, out.footR] = legCycle(phase + Math.PI);
  // Arms pump against the legs with bent elbows; the forearm swings up as its arm comes forward.
  out.armXL = s * 0.75;
  out.armXR = -s * 0.75;
  out.armZ = 1.3;
  out.foreL = 1.35 + Math.max(0, -s) * 0.35;
  out.foreR = 1.35 + Math.max(0, s) * 0.35;
  out.torso = 0.2;
  out.torsoY = s * 0.16;
  out.head = -0.14;
  out.pelX = 0;
  // Lowest as a foot passes under the body, highest in the flight between steps.
  out.pelY = Math.abs(s) * 0.07 - 0.035;
  out.pelYaw = -s * 0.12;
  return out;
};

const skatePose = (out: PP) => {
  Object.assign(out, blank());
  out.shL = out.shR = 0.55;
  out.thL = -0.3;
  out.thR = -0.05;
  out.footL = out.footR = 0.15;
  out.armZ = 0.75;
  out.armXL = -0.3;
  out.armXR = 0.25;
  out.foreL = out.foreR = 0.5;
  out.torso = 0.28;
  out.torsoY = 0.35; // surfer stance, side-on to the street
  out.pelYaw = -0.35;
  out.head = -0.18;
  out.pelY = -0.13;
  return out;
};

// The jump follows the arc: one leg drives forward off the ground with the opposite arm punching up (a superhero
// leap), both knees tuck at the top, then the legs reach down for the street and the arms spread for balance.
const airPose = (out: PP, vy: number, lead: number) => {
  const u = Math.max(-1, Math.min(1, vy / JUMP_V)); // 1 at take-off, 0 at the top, about -1 on landing
  let front: number, back: number, kneeF: number, kneeB: number, punch: number;
  if (u >= 0) {
    const tuck = smooth(1 - u);
    front = -0.7 - 0.5 * tuck;
    back = 0.5 - 0.9 * tuck;
    kneeF = 0.7 + 0.8 * tuck;
    kneeB = 1.2 + 0.4 * tuck;
    punch = 1 - tuck * 0.4;
    out.armZ = 1.35 - 0.3 * u;
    out.torso = 0.05 + 0.15 * tuck;
  } else {
    const f = smooth(-u);
    front = -1.2 + 0.85 * f;
    back = -0.5 + 0.6 * f;
    kneeF = 1.5 - 1.1 * f;
    kneeB = 1.6 - 1.0 * f;
    punch = 0.6 - 0.6 * f;
    out.armZ = 1.1 + 0.15 * f;
    out.torso = 0.2 + 0.12 * f;
  }
  out.thL = lead > 0 ? front : back;
  out.thR = lead > 0 ? back : front;
  out.shL = lead > 0 ? kneeF : kneeB;
  out.shR = lead > 0 ? kneeB : kneeF;
  out.footL = out.footR = 0.15;
  // The arm opposite the lead leg reaches forward and up; the other swings back.
  const reach = -0.9 - 0.9 * punch;
  out.armXL = lead > 0 ? 0.5 : reach;
  out.armXR = lead > 0 ? reach : 0.5;
  out.foreL = lead > 0 ? 1.2 : 0.4;
  out.foreR = lead > 0 ? 0.4 : 1.2;
  out.torsoY = 0;
  out.head = -out.torso * 0.7;
  out.pelX = 0;
  out.pelY = 0;
  out.pelYaw = 0;
  return out;
};

// Absorbing a landing: knees bend, hips drop, the body tips forward, the arms come down.
const landPose = (out: PP, hard: number) => {
  Object.assign(out, blank());
  out.thL = out.thR = -0.45 - 0.3 * hard;
  out.shL = out.shR = 0.8 + 0.6 * hard;
  out.footL = out.footR = -0.2;
  out.armXL = out.armXR = -0.35;
  out.armZ = 1.15;
  out.foreL = out.foreR = 1.0;
  out.torso = 0.35 + 0.25 * hard;
  out.head = -0.3;
  out.pelY = -0.09 - 0.12 * hard;
  return out;
};

// Feet-first slide: lie back, legs forward, one hand trailing on the street.
const slidePose = (out: PP) => {
  out.pelX = -1.2;
  out.pelY = 0.32 - HIP;
  out.pelYaw = 0;
  out.thL = -0.35;
  out.thR = -0.05;
  out.shL = 0.1;
  out.shR = 0.6;
  out.footL = out.footR = -0.2;
  out.torso = 0.15;
  out.torsoY = 0;
  out.armXL = 0.9;
  out.armXR = -0.4;
  out.armZ = 0.9;
  out.foreL = 0.3;
  out.foreR = 1.2;
  out.head = 0.75;
  return out;
};

const pose = blank();
const other = blank();
const tmpV = new THREE.Vector3();

export function poseHero(rig: HeroRig, p: Pose) {
  const j = rig.joints;
  const dt = Math.max(0, Math.min(0.1, p.dt));
  const a: Anim = (rig.root.userData.anim ??= { air: 0, slide: 0, skate: 0, land: Infinity, landHard: 0, lead: 1, wasAir: false, lastVy: 0, clock: 0, lift: 0.3, swing: 0, swingV: 0 });
  a.clock += dt;

  if (p.airborne && !a.wasAir) {
    // Take off from whichever leg was planted: the one swinging forward leads.
    a.lead = Math.sin(p.runPhase) >= 0 ? 1 : -1;
    a.land = Infinity;
  }
  if (!p.airborne && a.wasAir && !p.sliding) {
    a.land = 0;
    a.landHard = clamp01((-a.lastVy - 3) / 8);
  }
  a.wasAir = p.airborne;
  a.lastVy = p.vy;
  a.land += dt;

  a.air = ease(a.air, p.airborne ? 1 : 0, p.airborne ? 22 : 16, dt);
  a.slide = ease(a.slide, p.sliding ? 1 : 0, p.sliding ? 20 : 12, dt);
  a.skate = ease(a.skate, p.skating ? 1 : 0, 10, dt);
  const lt = a.land;
  const land = lt >= LAND_TIME ? 0 : lt < 0.05 ? smooth(lt / 0.05) : smooth(1 - (lt - 0.05) / (LAND_TIME - 0.05));

  runPose(pose, p.runPhase);
  if (a.skate > 0.001) mix(pose, pose, skatePose(other), a.skate);
  if (a.air > 0.001) mix(pose, pose, airPose(other, p.vy, a.lead), a.air);
  if (land > 0.001) mix(pose, pose, landPose(other, a.landHard), land * 0.85);
  if (a.slide > 0.001) mix(pose, pose, slidePose(other), a.slide);

  j.thighL.rotation.set(pose.thL, 0, 0);
  j.thighR.rotation.set(pose.thR, 0, 0);
  j.shinL.rotation.set(pose.shL, 0, 0);
  j.shinR.rotation.set(pose.shR, 0, 0);
  j.footL.rotation.set(pose.footL, 0, 0);
  j.footR.rotation.set(pose.footR, 0, 0);
  // Arms come down from the T-pose, then swing.
  j.upperArmL.rotation.set(pose.armXL, 0, pose.armZ);
  j.upperArmR.rotation.set(pose.armXR, 0, -pose.armZ);
  j.forearmL.rotation.set(0, pose.foreL, 0);
  j.forearmR.rotation.set(0, -pose.foreR, 0);
  j.torso.rotation.set(pose.torso, pose.torsoY, 0);
  j.head.rotation.set(pose.head, -pose.torsoY * 0.6, 0);
  j.pelvis.rotation.set(pose.pelX, pose.pelYaw, 0);
  j.pelvis.position.y = HIP + pose.pelY;

  // A little squash on a hard landing.
  const squash = land * (0.04 + 0.08 * a.landHard);
  rig.body.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);

  // Cape: streams back with speed, flies up on the way down from a jump, trails flat in a slide.
  const speed = p.speed ?? 10;
  const target = 0.45 + 0.75 * clamp01(speed / 16) + (p.airborne && p.vy < 0 ? 0.35 : 0) + a.slide * 0.5 + a.skate * 0.2;
  a.lift = ease(a.lift, target, 6, dt);
  flowCape(rig.cape, a.clock, a.lift, 0.12 + 0.18 * clamp01(speed / 16));

  // Tassel: a damped pendulum kicked by the stride and by jumps.
  const kick = Math.cos(p.runPhase * 2) * 4 * (1 - a.air) - p.vy * 0.4 * a.air;
  a.swingV += (-a.swing * 60 - a.swingV * 5 + kick) * dt;
  a.swing += a.swingV * dt;
  rig.tassel.rotation.set(-0.5 - 0.3 * clamp01(speed / 16) + a.swing * 0.5, 0, Math.sin(a.clock * 3) * 0.1);

  rig.tajine.visible = p.tajine;
  rig.board.visible = p.skating;
  rig.body.position.y = 0.15 * a.skate;
  if (p.tajine) {
    // The tajine sits on the head wherever the head goes.
    rig.root.updateMatrixWorld(true);
    j.head.getWorldPosition(tmpV);
    rig.root.worldToLocal(tmpV);
    rig.tajine.position.set(tmpV.x, tmpV.y + 0.24, tmpV.z);
  }
}
