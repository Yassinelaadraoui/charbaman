import * as THREE from 'three';
import { RIGGED_HERO } from './heroRigged';
import { base64ToBytes, bakedTexture, normals } from './models/decode';
import { tajinePickup } from './props';
import type { Suit } from '../progression';
import { JUMP_V } from '../engine';

export type HeroRig = {
  root: THREE.Group; // faces -z (away from the camera), feet at y=0
  joints: Record<string, THREE.Object3D>;
  tajine: THREE.Object3D;
  board: THREE.Object3D;
  body: THREE.Group;
  skin?: SkinDriver;
};

// The skinned hero: poseHero writes joint rotations on stand-in objects in the same frame as the old
// part-based rig (model facing +z), and the driver turns them into bone rotations.
type SkinDriver = {
  model: THREE.Group;
  baseY: number; // hip height at rest
  bones: { proxy: THREE.Object3D; bone: THREE.Bone; rest: THREE.Quaternion; w: THREE.Quaternion; wInv: THREE.Quaternion; armRest: number }[];
  head: THREE.Bone;
  run?: RunClip;
  runWeight: number; // 0 = code poses only, 1 = the running clip only
};

// The model's own running loop, one stride per 2 pi of runPhase.
type RunClip = {
  bones: { bone: THREE.Bone; rest: THREE.Quaternion; frames: THREE.Quaternion[]; finger: boolean }[];
  moved: { bone: THREE.Bone; rest: THREE.Vector3; frames: THREE.Vector3[] }[];
};

// Stand-in joint -> bone. The stand-ins' left is the model's right (the old part rig was mirrored).
const BONE_OF: Record<string, string> = {
  pelvis: 'bip_01',
  torso: 'bip Spine_03',
  neck: 'bip Neck_05',
  head: 'bip Head_06',
  upperArmL: 'bip R UpperArm_019',
  forearmL: 'bip R Forearm_020',
  handL: 'bip R Hand_021',
  upperArmR: 'bip L UpperArm_09',
  forearmR: 'bip L Forearm_010',
  handR: 'bip L Hand_011',
  thighL: 'bip R Thigh_032',
  shinL: 'bip R Calf_033',
  footL: 'bip R Foot_034',
  thighR: 'bip L Thigh_027',
  shinR: 'bip L Calf_028',
  footR: 'bip L Foot_029',
};
const HERO_HEIGHT = 1.8;

function uint16(s: string) {
  const b = base64ToBytes(s);
  const out = new Uint16Array(b.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = b[i * 2] | (b[i * 2 + 1] << 8);
  return out;
}

// The hero's mesh and classic-suit atlas take a while to decode, and every run uses the same ones, so they are
// built once (in the background, from the menus) and shared by every run's rig.
let heroGeo: THREE.BufferGeometry | undefined;
let heroMap: THREE.Texture | undefined;

function heroGeometry() {
  if (heroGeo) return heroGeo;
  const d = RIGGED_HERO;
  const q = uint16(d.pos);
  const pos = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = d.min[i % 3] + (q[i] / 65535) * d.span[i % 3];
  const qu = uint16(d.uv);
  const uv = new Float32Array(qu.length);
  for (let i = 0; i < qu.length; i++) uv[i] = qu[i] / 65535;
  const ji = base64ToBytes(d.joints);
  const jw = base64ToBytes(d.weights);
  const w = new Float32Array(jw.length);
  for (let i = 0; i < jw.length; i++) w[i] = jw[i] / 255;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(ji), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
  geo.setIndex(new THREE.BufferAttribute(uint16(d.index), 1));
  // Every triangle has its own corners (its own atlas patch), so average normals by position: smooth skin.
  geo.setAttribute('normal', new THREE.BufferAttribute(normals(pos, q, true), 3));
  heroGeo = geo;
  return geo;
}

function heroAtlas() {
  heroMap ??= bakedTexture({ size: [], min: [], span: [], pos: '', uv: '', atlas: RIGGED_HERO.atlas ?? 1024, jpeg: RIGGED_HERO.jpeg });
  return heroMap;
}

export const heroJobs: { key: string; run: () => void }[] = [
  { key: 'hero:geo', run: heroGeometry },
  { key: 'hero:tex', run: heroAtlas },
];

function buildSkinned(body: THREE.Group): { joints: Record<string, THREE.Object3D>; skin: SkinDriver } {
  const d = RIGGED_HERO;
  const geo = heroGeometry();

  const bones = d.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.fromArray(b.t);
    bone.quaternion.fromArray(b.q);
    bone.scale.fromArray(b.s);
    return bone;
  });
  // Turn the model to face +z like the old rig, and size it.
  const yaw = d.yaw ?? Math.PI / 2; // the first hero model faced +x
  const armRestAngle = d.armRest ?? 1.15; // and its arms hung about 66 degrees below a T-pose
  const model = new THREE.Group();
  model.rotation.y = -yaw;
  model.scale.setScalar(HERO_HEIGHT / (d.restMax[1] - d.restMin[1]));
  d.bones.forEach((b, i) => (b.parent >= 0 ? bones[b.parent] : model).add(bones[i]));
  const inverses = [];
  for (let i = 0; i < bones.length; i++) inverses.push(new THREE.Matrix4().fromArray(d.ibm, i * 16));
  const map = heroAtlas();
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshLambertMaterial({ map }));
  mesh.frustumCulled = false;
  model.add(mesh);
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  body.add(model);

  // Rest orientation of each bone in the old rig's frame (model facing +z).
  const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  const restWorld: THREE.Quaternion[] = [];
  d.bones.forEach((b, i) => {
    const local = new THREE.Quaternion().fromArray(b.q);
    restWorld[i] = (b.parent >= 0 ? restWorld[b.parent].clone() : facing.clone()).multiply(local);
  });
  const joints: Record<string, THREE.Object3D> = {};
  const driven: SkinDriver['bones'] = [];
  for (const [joint, boneName] of Object.entries(BONE_OF)) {
    const i = d.bones.findIndex((b) => b.name === boneName);
    const proxy = new THREE.Object3D();
    joints[joint] = proxy;
    const wq = restWorld[i];
    const armRest = joint === 'upperArmL' ? armRestAngle : joint === 'upperArmR' ? -armRestAngle : 0;
    driven.push({ proxy, bone: bones[i], rest: bones[i].quaternion.clone(), w: wq.clone(), wInv: wq.clone().invert(), armRest });
  }
  const hip = d.bones.findIndex((b) => b.name === BONE_OF.pelvis);
  model.updateMatrixWorld(true);
  const hipPos = new THREE.Vector3();
  bones[hip].getWorldPosition(hipPos);
  joints.pelvis.position.y = hipPos.y;
  let run: RunClip | undefined;
  if (d.run) {
    const r = d.run;
    run = {
      bones: r.bones.map((bi, k) => ({
        bone: bones[bi],
        rest: bones[bi].quaternion.clone(),
        finger: bones[bi].name.includes('Finger'),
        frames: r.q.map((f) => new THREE.Quaternion(f[k * 4], f[k * 4 + 1], f[k * 4 + 2], f[k * 4 + 3])),
      })),
      moved: r.tBones.map((bi, k) => ({
        bone: bones[bi],
        rest: bones[bi].position.clone(),
        frames: r.t.map((f) => new THREE.Vector3(f[k * 3], f[k * 3 + 1], f[k * 3 + 2])),
      })),
    };
  }
  const head = bones[d.bones.findIndex((b) => b.name === BONE_OF.head)];
  return { joints, skin: { model, baseY: hipPos.y, bones: driven, head, run, runWeight: 0 } };
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();

const clipQ = new THREE.Quaternion();
const clipV = new THREE.Vector3();

function driveSkin(rig: HeroRig, runPhase: number) {
  const k = rig.skin!;
  const run = k.run;
  const w = run ? k.runWeight : 0;
  // Bones the code poses leave alone go back to rest before the clip is blended in.
  if (run) for (const b of run.bones) b.bone.quaternion.copy(b.rest);
  for (const b of k.bones) {
    tmpE.copy(b.proxy.rotation);
    tmpE.z -= b.armRest;
    tmpQ.setFromEuler(tmpE);
    // Rotate about the rest-pose axes of the old rig: rest * (W^-1 * D * W).
    b.bone.quaternion.copy(b.rest).multiply(b.wInv.clone().multiply(tmpQ).multiply(b.w));
  }
  if (run && w > 0.001) {
    const n = run.bones[0].frames.length;
    const f = ((((runPhase / (Math.PI * 2)) * n) % n) + n) % n;
    const a = Math.floor(f);
    const b = (a + 1) % n;
    const t = f - a;
    for (const r of run.bones) {
      clipQ.slerpQuaternions(r.frames[a], r.frames[b], t);
      // Fingers keep the clip's curled fists whatever the body is doing: at rest the hands are flat and open.
      r.bone.quaternion.slerp(clipQ, r.finger ? 1 : w);
    }
    for (const r of run.moved) {
      clipV.lerpVectors(r.frames[a], r.frames[b], t);
      r.bone.position.lerpVectors(r.rest, clipV, w);
    }
  } else if (run) {
    for (const r of run.moved) r.bone.position.copy(r.rest);
    for (const r of run.bones) if (r.finger) r.bone.quaternion.copy(r.frames[0]);
  }
  // The clip bobs the hips itself, so the code poses' hip height fades out as it takes over.
  k.model.position.y = (rig.joints.pelvis.position.y - k.baseY) * (1 - w);
  // The tajine sits on the head wherever the head goes.
  k.model.updateMatrixWorld(true);
  k.head.getWorldPosition(tmpV);
  rig.root.worldToLocal(tmpV);
  rig.tajine.position.set(tmpV.x, tmpV.y + 0.12, tmpV.z);
}

// Re-dyes the suit: the atlas is flat colours (orange suit, white trim, grey shading, navy), so orange pixels
// take the suit's main colour and, for suits that have one, white pixels take its trim, each keeping their
// brightness so the anti-aliased edges still blend.
const suitMaps = new Map<string, THREE.Texture>();
export function dressHero(rig: HeroRig, suit: Suit) {
  if (suit.id === 'classic') return; // a new rig already wears the classic suit
  const map = suitMap(suit);
  rig.body.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) {
      (m.material as THREE.MeshLambertMaterial).map = map;
      (m.material as THREE.MeshLambertMaterial).needsUpdate = true;
    }
  });
}

// A suit's atlas, painted once and kept. The classic suit is the model's own atlas.
export function suitMap(suit: Suit) {
  if (suit.id === 'classic') return heroAtlas();
  let map = suitMaps.get(suit.id);
  if (!map) {
    const [mr, mg, mb] = suit.main;
    const trim = suit.trim;
    map = bakedTexture({ size: [], min: [], span: [], pos: '', uv: '', atlas: RIGGED_HERO.atlas ?? 1024, jpeg: RIGGED_HERO.jpeg }, (px, i) => {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const orange = r - b; // 255 for the suit, about 0 for white, grey and navy
      if (orange > 60) {
        const k = Math.min(1, orange / 255);
        const lum = r / 255;
        px[i] = Math.round((mr * lum) * k + r * (1 - k));
        px[i + 1] = Math.round((mg * lum) * k + g * (1 - k));
        px[i + 2] = Math.round((mb * lum) * k + b * (1 - k));
      } else if (trim && r > 225 && g > 225 && b > 215) {
        const lum = (r + g + b) / 765;
        px[i] = Math.round(trim[0] * lum);
        px[i + 1] = Math.round(trim[1] * lum);
        px[i + 2] = Math.round(trim[2] * lum);
      }
    });
    suitMaps.set(suit.id, map);
  }
  return map;
}

export function buildHero(): HeroRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = Math.PI; // model faces +z; we run toward -z
  root.add(body);
  const { joints, skin } = buildSkinned(body);
  const tajine = makeTajine();
  root.add(tajine);
  const board = makeBoard();
  root.add(board);
  return { root, joints, tajine, board, body, skin };
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

type Pose = {
  runPhase: number;
  airborne: boolean;
  vy: number;
  sliding: boolean;
  skating: boolean;
  tajine: boolean;
  dt: number; // seconds since the last pose (game time)
};

// A pose as plain numbers, so poses can be blended. Angles are on the stand-in joints (model facing +z, negative
// thigh x = forward); pelY is the hip height relative to standing.
type P = {
  thL: number; thR: number; shL: number; shR: number; foot: number;
  armXL: number; armXR: number; armZ: number; fore: number;
  torso: number; torsoY: number; head: number;
  pelX: number; pelY: number; pelYaw: number;
};
const KEYS = ['thL', 'thR', 'shL', 'shR', 'foot', 'armXL', 'armXR', 'armZ', 'fore', 'torso', 'torsoY', 'head', 'pelX', 'pelY', 'pelYaw'] as const;
const blank = (): P => ({ thL: 0, thR: 0, shL: 0, shR: 0, foot: 0, armXL: 0, armXR: 0, armZ: 0, fore: 0, torso: 0, torsoY: 0, head: 0, pelX: 0, pelY: 0, pelYaw: 0 });
function mix(out: P, a: P, b: P, t: number) {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
// Frame-rate independent ease toward a target: rate is roughly 1 / (time to get two thirds of the way).
const ease = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

// What the hero's body is doing between frames: how far into each move he is, so every change of pose eases in
// instead of snapping.
type Anim = {
  air: number; // 0 running .. 1 jump pose
  slide: number;
  skate: number;
  land: number; // seconds since touching down (Infinity when not landing)
  landHard: number; // how hard that landing was, 0..1
  lead: number; // which leg leads the jump: 1 left, -1 right
  wasAir: boolean;
  lastVy: number;
};
const LAND_TIME = 0.24;

const runPose = (out: P, phase: number) => {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  out.thL = -s * 0.9;
  out.thR = s * 0.9;
  out.shL = Math.max(0, -s) * 1.3 + 0.15;
  out.shR = Math.max(0, s) * 1.3 + 0.15;
  out.foot = -0.2;
  out.armXL = s * 0.8;
  out.armXR = -s * 0.8;
  out.armZ = 1.25;
  out.fore = 1.1;
  out.torso = 0.18;
  out.torsoY = s * 0.15;
  out.head = -0.11;
  out.pelX = 0;
  out.pelY = Math.abs(c) * 0.06;
  out.pelYaw = -s * 0.12;
  return out;
};

const skatePose = (out: P) => {
  Object.assign(out, blank());
  out.shL = out.shR = 0.45;
  out.thL = out.thR = -0.15;
  out.foot = -0.1;
  out.armZ = 0.9;
  out.armXL = 0.15;
  out.armXR = -0.15;
  out.fore = 0.5;
  out.torso = 0.25;
  out.head = -0.15;
  out.pelY = -0.12;
  return out;
};

// The jump follows the arc: one leg drives forward off the ground with the arms swinging forward, both knees tuck at
// the top, then the legs reach down for the street and the arms spread for balance.
const airPose = (out: P, vy: number, lead: number) => {
  const u = Math.max(-1, Math.min(1, vy / JUMP_V)); // 1 at take-off, 0 at the top, about -1 on landing
  let front: number, back: number, kneeF: number, kneeB: number;
  if (u >= 0) {
    const tuck = smooth(1 - u);
    front = -0.55 - 0.55 * tuck;
    back = 0.45 - 0.95 * tuck;
    kneeF = 0.6 + 0.8 * tuck;
    kneeB = 1.1 + 0.4 * tuck;
    out.armZ = 1.45 - 0.25 * u; // arms lift a little on the way up (not out in a T: that read as a scarecrow from behind)
    out.torso = 0.05 + 0.1 * tuck;
  } else {
    const f = smooth(-u);
    front = -1.1 + 0.8 * f;
    back = -0.5 + 0.6 * f;
    kneeF = 1.4 - 1.05 * f;
    kneeB = 1.5 - 0.95 * f;
    out.armZ = 1.45 - 0.2 * f; // and stay a touch out on the way down, for balance
    out.torso = 0.15 + 0.15 * f;
  }
  out.thL = lead > 0 ? front : back;
  out.thR = lead > 0 ? back : front;
  out.shL = lead > 0 ? kneeF : kneeB;
  out.shR = lead > 0 ? kneeB : kneeF;
  out.foot = -0.1;
  // The arm opposite the lead leg swings forward, as in a stride.
  out.armXL = -0.35 + lead * 0.3; // negative swings an arm forward
  out.armXR = -0.35 - lead * 0.3;
  out.fore = 1.0; // elbows stay bent, as in the run
  out.torsoY = 0;
  out.head = -out.torso * 0.6;
  out.pelX = 0;
  out.pelY = 0;
  out.pelYaw = 0;
  return out;
};

// Absorbing a landing: knees bend, hips drop, the body tips forward, the arms come down.
const landPose = (out: P, hard: number) => {
  Object.assign(out, blank());
  out.thL = out.thR = -0.35 - 0.3 * hard;
  out.shL = out.shR = 0.6 + 0.6 * hard;
  out.foot = 0.15;
  out.armXL = out.armXR = -0.25;
  out.armZ = 1.3;
  out.fore = 1.0;
  out.torso = 0.3 + 0.25 * hard;
  out.head = -0.25;
  out.pelY = -0.07 - 0.12 * hard;
  return out;
};

// Feet-first slide: lie back, legs forward.
const slidePose = (out: P, base: number) => {
  out.pelX = -1.25;
  out.pelY = 0.35 - base;
  out.pelYaw = 0;
  out.thL = -0.3;
  out.thR = -0.1;
  out.shL = 0.1;
  out.shR = 0.4;
  out.foot = -0.1;
  out.torso = 0.1;
  out.torsoY = 0;
  out.armXL = 0.6;
  out.armXR = -0.6;
  out.armZ = 1.0;
  out.fore = 0.6;
  out.head = 0.7;
  return out;
};

const pose = blank();
const other = blank();

// Procedural animation: rotations are written on stand-in joints (old part-rig frame, model facing +z)
// and driveSkin turns them into bone rotations. Plain running plays the model's own run clip; jumps, landings,
// slides and skating are code poses blended over it.
export function poseHero(rig: HeroRig, p: Pose) {
  const j = rig.joints;
  const dt = Math.max(0, Math.min(0.1, p.dt));
  const base = j.pelvis.userData.baseY ?? (j.pelvis.userData.baseY = j.pelvis.position.y);
  const a: Anim = (rig.root.userData.anim ??= { air: 0, slide: 0, skate: 0, land: Infinity, landHard: 0, lead: 1, wasAir: false, lastVy: 0 });

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

  // Into the air fast (the body has to keep up with the launch), out of it through the landing.
  a.air = ease(a.air, p.airborne ? 1 : 0, p.airborne ? 22 : 16, dt);
  a.slide = ease(a.slide, p.sliding ? 1 : 0, p.sliding ? 20 : 12, dt);
  a.skate = ease(a.skate, p.skating ? 1 : 0, 10, dt);
  // Landing: a quick dip, then a slower rise back into the run.
  const lt = a.land;
  const land = lt >= LAND_TIME ? 0 : lt < 0.05 ? smooth(lt / 0.05) : smooth(1 - (lt - 0.05) / (LAND_TIME - 0.05));

  runPose(pose, p.runPhase);
  if (a.skate > 0.001) mix(pose, pose, skatePose(other), a.skate);
  if (a.air > 0.001) mix(pose, pose, airPose(other, p.vy, a.lead), a.air);
  if (land > 0.001) mix(pose, pose, landPose(other, a.landHard), land * 0.85);
  if (a.slide > 0.001) mix(pose, pose, slidePose(other, base), a.slide);

  j.thighL.rotation.set(pose.thL, 0, 0);
  j.thighR.rotation.set(pose.thR, 0, 0);
  j.shinL.rotation.set(pose.shL, 0, 0);
  j.shinR.rotation.set(pose.shR, 0, 0);
  j.footL.rotation.set(pose.foot, 0, 0);
  j.footR.rotation.set(pose.foot, 0, 0);
  // Arms come down from the T-pose, then swing.
  j.upperArmL.rotation.set(pose.armXL, 0, pose.armZ);
  j.upperArmR.rotation.set(pose.armXR, 0, -pose.armZ);
  j.forearmL.rotation.set(0, pose.fore, 0);
  j.forearmR.rotation.set(0, -pose.fore, 0);
  j.torso.rotation.set(pose.torso, pose.torsoY, 0);
  j.head.rotation.set(pose.head, 0, 0);
  j.pelvis.rotation.set(pose.pelX, pose.pelYaw, 0);
  j.pelvis.position.y = base + pose.pelY;

  rig.tajine.visible = p.tajine;
  rig.board.visible = p.skating;
  rig.body.position.y = 0.15 * a.skate;
  if (rig.skin) {
    // The run clip plays only while nothing else is going on; it fades as the other poses fade in.
    rig.skin.runWeight = 1 - Math.max(a.air, a.slide, a.skate, land * 0.85);
    driveSkin(rig, p.runPhase);
  }
}
