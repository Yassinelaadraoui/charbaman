import * as THREE from 'three';
import { RIGGED_HERO } from './heroRigged';
import { base64ToBytes, bakedTexture } from './models/decode';
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
};

const BONE_OF: Record<string, string> = {
  pelvis: 'Bip001_02',
  torso: 'Bip001-Spine_04',
  neck: 'Bip001-Neck_07',
  head: 'Bip001-Head_08',
  upperArmL: 'Bip001-R-UpperArm_025',
  forearmL: 'Bip001-R-Forearm_026',
  handL: 'Bip001-R-Hand_027',
  upperArmR: 'Bip001-L-UpperArm_010',
  forearmR: 'Bip001-L-Forearm_011',
  handR: 'Bip001-L-Hand_012',
  thighL: 'Bip001-R-Thigh_051',
  shinL: 'Bip001-R-Calf_052',
  footL: 'Bip001-R-Foot_053',
  thighR: 'Bip001-L-Thigh_046',
  shinR: 'Bip001-L-Calf_047',
  footR: 'Bip001-L-Foot_048',
};
// The old rig's arms were modelled in a T-pose; this model's arms already hang about 66 degrees down.
const ARM_REST = 1.15;
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
  geo.computeVertexNormals();

  const bones = d.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.fromArray(b.t);
    bone.quaternion.fromArray(b.q);
    bone.scale.fromArray(b.s);
    return bone;
  });
  // The model faces +x; turn it to face +z like the old rig, and size it.
  const model = new THREE.Group();
  model.rotation.y = -Math.PI / 2;
  model.scale.setScalar(HERO_HEIGHT / (d.restMax[1] - d.restMin[1]));
  d.bones.forEach((b, i) => (b.parent >= 0 ? bones[b.parent] : model).add(bones[i]));
  const inverses = [];
  for (let i = 0; i < bones.length; i++) inverses.push(new THREE.Matrix4().fromArray(d.ibm, i * 16));
  const map = bakedTexture({ size: [], min: [], span: [], pos: '', uv: '', atlas: 1024, jpeg: d.jpeg });
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshLambertMaterial({ map }));
  mesh.frustumCulled = false;
  model.add(mesh);
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  body.add(model);

  // Rest orientation of each bone in the old rig's frame (model facing +z).
  const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
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
    const armRest = joint === 'upperArmL' ? ARM_REST : joint === 'upperArmR' ? -ARM_REST : 0;
    driven.push({ proxy, bone: bones[i], rest: bones[i].quaternion.clone(), w: wq.clone(), wInv: wq.clone().invert(), armRest });
  }
  const hip = d.bones.findIndex((b) => b.name === BONE_OF.pelvis);
  model.updateMatrixWorld(true);
  const hipPos = new THREE.Vector3();
  bones[hip].getWorldPosition(hipPos);
  joints.pelvis.position.y = hipPos.y;
  return { joints, skin: { model, baseY: hipPos.y, bones: driven, head: bones[d.bones.findIndex((b) => b.name === BONE_OF.head)] } };
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();

function driveSkin(rig: HeroRig) {
  const k = rig.skin!;
  for (const b of k.bones) {
    tmpE.copy(b.proxy.rotation);
    tmpE.z -= b.armRest;
    tmpQ.setFromEuler(tmpE);
    // Rotate about the rest-pose axes of the old rig: rest * (W^-1 * D * W).
    b.bone.quaternion.copy(b.rest).multiply(b.wInv.clone().multiply(tmpQ).multiply(b.w));
  }
  k.model.position.y = rig.joints.pelvis.position.y - k.baseY;
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
  if (rig.skin) driveSkin(rig);
}
