import * as THREE from 'three';
import { RIGGED_HERO } from './heroRigged';
import { base64ToBytes, bakedTexture, normals } from './models/decode';
import { tajinePickup } from './props';

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
  bones: { bone: THREE.Bone; rest: THREE.Quaternion; frames: THREE.Quaternion[] }[];
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

function buildSkinned(body: THREE.Group): { joints: Record<string, THREE.Object3D>; skin: SkinDriver } {
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
  const map = bakedTexture({ size: [], min: [], span: [], pos: '', uv: '', atlas: d.atlas ?? 1024, jpeg: d.jpeg });
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
      r.bone.quaternion.slerp(clipQ, w);
    }
    for (const r of run.moved) {
      clipV.lerpVectors(r.frames[a], r.frames[b], t);
      r.bone.position.lerpVectors(r.rest, clipV, w);
    }
  } else if (run) for (const r of run.moved) r.bone.position.copy(r.rest);
  // The clip bobs the hips itself, so the code poses' hip height fades out as it takes over.
  k.model.position.y = (rig.joints.pelvis.position.y - k.baseY) * (1 - w);
  // The tajine sits on the head wherever the head goes.
  k.model.updateMatrixWorld(true);
  k.head.getWorldPosition(tmpV);
  rig.root.worldToLocal(tmpV);
  rig.tajine.position.set(tmpV.x, tmpV.y + 0.12, tmpV.z);
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

type Pose = { runPhase: number; airborne: boolean; vy: number; sliding: boolean; skating: boolean; tajine: boolean };

// Procedural animation: rotations are written on stand-in joints (old part-rig frame, model facing +z)
// and driveSkin turns them into bone rotations.
export function poseHero(rig: HeroRig, p: Pose) {
  const j = rig.joints;
  const s = Math.sin(p.runPhase);
  const c = Math.cos(p.runPhase);
  let legSwing = s * 0.9;
  let armSwing = s * 0.8;
  let lean = 0.18;
  let bob = Math.abs(c) * 0.06;
  let kneeL = Math.max(0, -s) * 1.3 + 0.15;
  let kneeR = Math.max(0, s) * 1.3 + 0.15;
  let armDown = 1.25;

  if (p.skating) {
    legSwing = 0;
    armSwing = 0;
    kneeL = kneeR = 0.45;
    lean = 0.25;
    bob = 0;
    armDown = 0.9;
  }
  if (p.airborne) {
    legSwing = p.vy > 0 ? 0.6 : 0.2;
    kneeL = kneeR = 1.4;
    armSwing = 0;
    armDown = p.vy > 0 ? -0.3 : 0.5; // arms up on the way up, like the original
    bob = 0;
  }

  // Thighs swing opposite each other; model faces +z so negative x-rotation is forward.
  j.thighL.rotation.set(-legSwing, 0, 0);
  j.thighR.rotation.set(legSwing, 0, 0);
  j.shinL.rotation.set(kneeL, 0, 0);
  j.shinR.rotation.set(kneeR, 0, 0);
  j.footL.rotation.set(-0.2, 0, 0);
  j.footR.rotation.set(-0.2, 0, 0);

  // Arms come down from the T-pose, then swing.
  j.upperArmL.rotation.set(armSwing, 0, armDown);
  j.upperArmR.rotation.set(-armSwing, 0, -armDown);
  j.forearmL.rotation.set(0, p.airborne ? 0 : 1.1, 0);
  j.forearmR.rotation.set(0, p.airborne ? 0 : -1.1, 0);

  j.torso.rotation.set(lean, s * 0.15, 0);
  j.head.rotation.set(-lean * 0.6, 0, 0);
  j.pelvis.rotation.set(0, -s * 0.12, 0);
  j.pelvis.position.y = rig.joints.pelvis.userData.baseY ?? (rig.joints.pelvis.userData.baseY = j.pelvis.position.y);
  j.pelvis.position.y += bob;

  if (p.sliding) {
    // Feet-first slide: lie back, legs forward.
    rig.body.rotation.x = 0;
    j.pelvis.rotation.set(-1.25, 0, 0);
    j.pelvis.position.y = 0.35;
    j.thighL.rotation.set(-0.3, 0, 0);
    j.thighR.rotation.set(-0.1, 0, 0);
    j.shinL.rotation.set(0.1, 0, 0);
    j.shinR.rotation.set(0.4, 0, 0);
    j.torso.rotation.set(0.1, 0, 0);
    j.upperArmL.rotation.set(0.6, 0, 1.0);
    j.upperArmR.rotation.set(0.6, 0, -1.0);
    j.head.rotation.set(0.7, 0, 0);
  }

  rig.tajine.visible = p.tajine;
  rig.board.visible = p.skating;
  rig.body.position.y = p.skating ? 0.15 : 0;
  if (rig.skin) {
    // Plain running plays the model's own run; jumps, slides and skating use the code poses. Ease between.
    const target = p.airborne || p.sliding || p.skating ? 0 : 1;
    rig.skin.runWeight += (target - rig.skin.runWeight) * 0.25;
    driveSkin(rig, p.runPhase);
  }
}
