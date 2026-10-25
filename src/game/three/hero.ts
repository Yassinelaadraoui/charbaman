import * as THREE from 'three';
import { HERO_PARTS } from './heroMesh';

// Charbaman palette: pale silver head and right arm, orange muscle suit.
const SILVER = 0xeee7e1;
const ORANGE = 0xff6a00;
const ORANGE_DARK = 0xd94f00;
const NECKLACE = 0x3f7a3a;

const PART_COLOR: Record<string, number> = {
  head: SILVER,
  neck: NECKLACE,
  torso: ORANGE,
  pelvis: ORANGE_DARK,
  upperArmR: SILVER,
  forearmR: SILVER,
  handR: SILVER,
};

type Joint = { name: string; parent: string | null; pivot: (b: THREE.Box3) => THREE.Vector3 };

const top = (b: THREE.Box3) => new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
const bottom = (b: THREE.Box3) => new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
// Arms are modelled in a T-pose, so each arm piece hinges at its end nearest the body.
const inner = (b: THREE.Box3) => {
  const x = Math.abs(b.min.x) < Math.abs(b.max.x) ? b.min.x : b.max.x;
  return new THREE.Vector3(x, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
};

const JOINTS: Joint[] = [
  { name: 'pelvis', parent: null, pivot: top },
  { name: 'torso', parent: 'pelvis', pivot: bottom },
  { name: 'neck', parent: 'torso', pivot: bottom },
  { name: 'head', parent: 'neck', pivot: bottom },
  { name: 'upperArmL', parent: 'torso', pivot: inner },
  { name: 'forearmL', parent: 'upperArmL', pivot: inner },
  { name: 'handL', parent: 'forearmL', pivot: inner },
  { name: 'upperArmR', parent: 'torso', pivot: inner },
  { name: 'forearmR', parent: 'upperArmR', pivot: inner },
  { name: 'handR', parent: 'forearmR', pivot: inner },
  { name: 'thighL', parent: 'pelvis', pivot: top },
  { name: 'shinL', parent: 'thighL', pivot: top },
  { name: 'footL', parent: 'shinL', pivot: top },
  { name: 'thighR', parent: 'pelvis', pivot: top },
  { name: 'shinR', parent: 'thighR', pivot: top },
  { name: 'footR', parent: 'shinR', pivot: top },
];

export type HeroRig = {
  root: THREE.Group; // faces -z (away from the camera), feet at y=0
  joints: Record<string, THREE.Group>;
  tajine: THREE.Object3D;
  board: THREE.Object3D;
  body: THREE.Group;
};

export function buildHero(): HeroRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = Math.PI; // model faces +z; we run toward -z
  root.add(body);
  const joints: Record<string, THREE.Group> = {};
  const pivots: Record<string, THREE.Vector3> = {};

  for (const j of JOINTS) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(HERO_PARTS[j.name], 3));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const pivot = j.pivot(geo.boundingBox!);
    pivots[j.name] = pivot;
    const mat = new THREE.MeshLambertMaterial({ color: PART_COLOR[j.name] ?? ORANGE, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pivot).negate(); // geometry is in model space; shift it so the joint is the origin
    const g = new THREE.Group();
    g.add(mesh);
    const parentPivot = j.parent ? pivots[j.parent] : new THREE.Vector3();
    g.position.copy(pivot).sub(parentPivot);
    (j.parent ? joints[j.parent] : body).add(g);
    joints[j.name] = g;
  }

  // Tajine that lands on his head (flips controls).
  const tajine = new THREE.Group();
  const lid = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 10), new THREE.MeshLambertMaterial({ color: 0xb5562c, flatShading: true }));
  lid.position.y = 0.28;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.05, 12), new THREE.MeshLambertMaterial({ color: 0x7b3f1d }));
  rim.position.y = 0.14;
  tajine.add(lid, rim);
  tajine.visible = false;
  joints.head.add(tajine);

  // Skateboard power-up.
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
  root.add(board);

  return { root, joints, tajine, board, body };
}

type Pose = { runPhase: number; airborne: boolean; vy: number; sliding: boolean; skating: boolean; tajine: boolean };

// Procedural animation: each body part is its own mesh (PS1 style), so we rotate joints directly.
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
}
