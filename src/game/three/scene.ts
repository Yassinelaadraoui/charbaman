import * as THREE from 'three';
import type { City } from '../cities';
import { GameState, ROAD_HALF, chaseStart, city as cityOf } from '../engine';
import { buildHero, HeroRig, poseHero } from './hero';
import { maskTexture } from './models/decode';
import { PARTICLES } from './particleTextures';
import { entityObject, flag, giantBottle, hasModelHouses, house, lamp, landmark, maple, mat, modelHouse, palm, shadeHex, spectator, teaTable, warmModels, fruitStall, chickens, busStop, oldMan, pigeons, seagull, dangerSign, showFrame } from './props';

// Engine space: x lateral, z forward along the street, y up.
// Three space: the hero stays at the origin and runs toward -z, so world z = -(engineZ - s.z).

const MAX_D = 110;
const DECOR_D = 80;
const SEG = 3;
const DECOR_STEP = 7;
const STRIPS = 6; // ground L/R, curb L/R, road, centre dash

// Pavement decor per city; maples line the streets in the cooler north.
const DECOR: Record<string, string[]> = {
  default: ['palm', 'lamp', 'lamp', 'flag'],
  marrakech: ['palm', 'stall', 'lamp', 'flag', 'stall'],
  fes: ['maple', 'lamp', 'stall', 'flag'],
  tangier: ['maple', 'lamp', 'palm', 'flag'],
};

const curvature = (z: number) => 0.0028 * Math.sin(z / 150 + 1.3) + 0.0013 * Math.sin(z / 61);
const curveIntegral = (z: number) => -0.0028 * 150 * Math.cos(z / 150 + 1.3) - 0.0013 * 61 * Math.cos(z / 61);

const hash = (i: number) => {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const color = (hex: string) => new THREE.Color(hex);

type Pooled = { obj: THREE.Object3D; seen: number };

// Short-lived sprite bursts (pickups, hits, landings). Positions are in engine space (x, y, z along the street).
export type BurstKind = 'bottle' | 'cash' | 'hit' | 'land' | 'skate';
type Particle = { sprite: THREE.Sprite; x: number; y: number; z: number; vx: number; vy: number; vz: number; born: number; life: number; size: number; grow: number; gravity: number };
const BURSTS: Record<BurstKind, { tex: keyof typeof PARTICLES; color: number; n: number; speed: number; up: number; size: number; grow: number; life: number; gravity: number }> = {
  bottle: { tex: 'star', color: 0xffc94a, n: 7, speed: 2.2, up: 2.5, size: 0.35, grow: -0.2, life: 0.45, gravity: 4 },
  cash: { tex: 'star', color: 0x7cd992, n: 12, speed: 3, up: 3.5, size: 0.45, grow: -0.2, life: 0.7, gravity: 4 },
  skate: { tex: 'spark', color: 0xff9a2e, n: 10, speed: 3, up: 2, size: 0.5, grow: 0, life: 0.5, gravity: 2 },
  hit: { tex: 'smoke', color: 0xd8cfc4, n: 8, speed: 1.6, up: 1.2, size: 0.6, grow: 1.4, life: 0.7, gravity: -0.5 },
  land: { tex: 'dirt', color: 0xc9b39a, n: 5, speed: 1.2, up: 0.4, size: 0.35, grow: 0.8, life: 0.4, gravity: 0 },
};

export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  hero: HeroRig;
  shadow: THREE.Mesh;
  road: THREE.Mesh;
  roadPos: Float32Array;
  roadCol: Float32Array;
  sky: THREE.Mesh;
  skyline = new THREE.Group();
  sea: THREE.Mesh;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  giant: THREE.Group;
  pool = new Map<string, Pooled>();
  particles: Particle[] = [];
  spriteMats = new Map<string, THREE.SpriteMaterial>();
  lastTime = 0;
  frame = 0;
  cityId = '';
  camDist = 6.2;
  camHeight = 3.2;
  onFrameEnd?: () => void;
  debugCamera?: { pos: [number, number, number]; look: [number, number, number] }; // for automated playtests

  constructor(gl: WebGLRenderingContext, width: number, height: number, onFrameEnd?: () => void) {
    this.onFrameEnd = onFrameEnd;
    // expo-gl's context is WebGL1-shaped, so three is pinned to r162 (the last release that accepts WebGL1).
    const g = gl as WebGLRenderingContext & { getContextAttributes?: () => WebGLContextAttributes | null };
    if (typeof g.getContextAttributes !== 'function') {
      g.getContextAttributes = () => ({ alpha: true, antialias: false, depth: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    }
    // expo-gl gives a bare GL context; three only needs a canvas-shaped object around it.
    const canvas = {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      clientHeight: height,
      getContext: () => gl,
    } as unknown as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl as WebGL2RenderingContext, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 600);
    this.fitCamera(width / height);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a6a50, 1.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(-4, 10, 6);
    this.scene.add(this.hemi, this.sun);

    // Gradient sky dome.
    const skyGeo = new THREE.SphereGeometry(400, 16, 12);
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    this.scene.add(this.sky);

    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 260), new THREE.MeshBasicMaterial({ color: 0x2e86c1 }));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.set(0, -0.05, -300);
    this.scene.add(this.sea, this.skyline);

    // Road + ground ribbon, rebuilt every frame (STRIPS quads per segment, 6 verts per quad).
    const segs = Math.ceil(MAX_D / SEG) + 2;
    this.roadPos = new Float32Array(segs * STRIPS * 6 * 3);
    this.roadCol = new Float32Array(segs * STRIPS * 6 * 3);
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.BufferAttribute(this.roadPos, 3));
    roadGeo.setAttribute('color', new THREE.BufferAttribute(this.roadCol, 3));
    this.road = new THREE.Mesh(roadGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.road.frustumCulled = false;
    this.scene.add(this.road);

    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.scene.add(this.shadow);

    this.hero = buildHero();
    this.scene.add(this.hero.root);

    this.giant = giantBottle();
    this.giant.visible = false;
    this.scene.add(this.giant);
  }

  burst(kind: BurstKind, x: number, y: number, z: number) {
    const b = BURSTS[kind];
    const key = `${b.tex}|${b.color}`;
    let m = this.spriteMats.get(key);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: maskTexture(PARTICLES[b.tex]), color: b.color, transparent: true, depthWrite: false });
      this.spriteMats.set(key, m);
    }
    for (let i = 0; i < b.n && this.particles.length < 80; i++) {
      const a = (i / b.n) * Math.PI * 2 + Math.random() * 0.6;
      const sprite = new THREE.Sprite(m.clone());
      this.scene.add(sprite);
      this.particles.push({
        sprite,
        x, y, z,
        vx: Math.cos(a) * b.speed * (0.6 + Math.random() * 0.6),
        vy: b.up * (0.5 + Math.random() * 0.7),
        vz: Math.sin(a) * b.speed * (0.6 + Math.random() * 0.6),
        born: this.lastTime,
        life: b.life * (0.8 + Math.random() * 0.4),
        size: b.size,
        grow: b.grow,
        gravity: b.gravity,
      });
    }
  }

  private updateParticles(s: GameState, bend: (d: number) => number) {
    const dt = Math.min(0.05, Math.max(0, s.time - this.lastTime));
    this.lastTime = s.time;
    this.particles = this.particles.filter((p) => {
      const age = s.time - p.born;
      if (age > p.life || age < 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        return false;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= p.gravity * dt;
      const d = p.z - s.z;
      p.sprite.position.set(p.x + bend(d), Math.max(0.05, p.y), -d);
      const k = age / p.life;
      p.sprite.scale.setScalar(Math.max(0.01, p.size * (1 + p.grow * k)));
      p.sprite.material.opacity = 1 - k * k;
      return true;
    });
  }

  fitCamera(aspect: number) {
    // Keep about 5.6 m of street visible across at the hero, whatever the phone shape.
    const halfWidth = 2.9;
    const hfov = 2 * Math.atan(halfWidth / this.camDist);
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
    this.camera.fov = Math.min(95, Math.max(50, THREE.MathUtils.radToDeg(vfov)));
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setCity(c: City) {
    if (c.id === this.cityId) return;
    this.cityId = c.id;
    const top = color(c.skyTop);
    const bottom = color(c.skyBottom);
    const pos = this.sky.geometry.attributes.position;
    const col = this.sky.geometry.attributes.color as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, pos.getY(i) / 160));
      tmp.copy(bottom).lerp(top, Math.sqrt(t));
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
    this.scene.fog = new THREE.Fog(bottom.getHex(), 45, MAX_D + 10);
    this.hemi.color = color(c.skyBottom).lerp(new THREE.Color(0xffffff), 0.5);
    this.hemi.groundColor = color(c.ground[1]);
    this.sun.color = color(c.sun);
    this.sea.visible = !!c.sea;
    if (c.sea) (this.sea.material as THREE.MeshBasicMaterial).color = color(c.sea);

    // Rebuild the skyline for this city: a ring of far blocks plus landmarks.
    this.skyline.clear();
    for (let i = 0; i < 40; i++) {
      const r = hash(c.seed * 100 + i);
      const w = 10 + r * 16;
      const h = 8 + hash(c.seed * 200 + i) * 22;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 10), mat(i % 2 ? c.far : '#' + shadeHex(c.far, -8).toString(16).padStart(6, '0')));
      b.position.set(-300 + i * 15 + r * 6, h / 2, -150 - hash(i + 7) * 30);
      this.skyline.add(b);
    }
    c.landmarks.forEach((lm, j) => {
      const l = landmark(lm, c);
      // The first landmark is the city's signature one, so it stands straight ahead.
      l.position.set([0, -80, 80, -160][j % 4] + hash(c.seed + j) * 20, 0, -135 - (j % 2) * 15);
      this.skyline.add(l);
    });
    // The skyline sits beyond the fog; it is already painted in hazy colours, so let it ignore fog.
    const noFog = new Map<THREE.Material, THREE.Material>();
    this.skyline.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.Material;
      let clone = noFog.get(src);
      if (!clone) {
        clone = src.clone();
        (clone as THREE.MeshLambertMaterial).fog = false;
        noFog.set(src, clone);
      }
      m.material = clone;
    });
    warmModels(c);
    // City change: drop pooled props so they are rebuilt in the new colours.
    for (const [, p] of this.pool) this.scene.remove(p.obj);
    this.pool.clear();
  }

  private use(key: string, make: () => THREE.Object3D) {
    let p = this.pool.get(key);
    if (!p) {
      p = { obj: make(), seen: 0 };
      this.pool.set(key, p);
      this.scene.add(p.obj);
    }
    p.seen = this.frame;
    p.obj.visible = true;
    return p.obj;
  }

  render(s: GameState) {
    this.frame++;
    const c = cityOf(s);
    this.setCity(c);
    const k = curvature(s.z);
    const camBack = this.camDist;
    // Bend the street: things further ahead slide sideways (OutRun-style curves).
    const bend = (d: number) => {
      const dd = d + camBack;
      return 0.5 * k * dd * dd;
    };
    const t = s.time;

    // Camera: behind and above, following the hero sideways a little. Pulls back in the chase.
    const chase = s.phase === 'chase';
    const targetDist = chase ? 9 : 6.2;
    // As the giant bottle closes in, lift the camera so you can still see over it.
    const targetHeight = chase ? 4.8 + (1 - s.chaseGap / 12) * 2.4 : 3.2;
    this.camDist += (targetDist - this.camDist) * 0.05;
    this.camHeight += (targetHeight - this.camHeight) * 0.05;
    const camX = s.x * 0.55;
    const shakeX = s.shake > 0 ? Math.sin(t * 90) * s.shake * 0.25 : 0;
    const shakeY = s.shake > 0 ? Math.cos(t * 70) * s.shake * 0.15 : 0;
    this.camera.position.set(camX + shakeX, this.camHeight + shakeY, this.camDist);
    this.camera.lookAt(camX * 0.6 + bend(14) * 0.5, 0.9, -14);
    this.fitCamera(this.camera.aspect);
    if (this.debugCamera) {
      this.camera.position.set(...this.debugCamera.pos);
      this.camera.lookAt(...this.debugCamera.look);
    }

    // Sky and skyline turn with the street.
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.skyline.position.x = -curveIntegral(s.z) * 120 - camX * 0.3;
    this.skyline.position.z = this.camera.position.z;

    this.buildRoad(s, c, bend);

    // Hero.
    this.hero.root.position.set(s.x, s.y, 0);
    poseHero(this.hero, {
      runPhase: s.runPhase,
      airborne: s.y > 0.05,
      vy: s.vy,
      sliding: s.slide > 0,
      skating: s.skate > 0,
      tajine: s.tajine > 0,
    });
    this.hero.root.visible = !(s.invuln > 0 && Math.floor(s.time * 12) % 2 === 0);
    this.shadow.position.x = s.x;
    this.shadow.scale.setScalar(Math.max(0.4, 1 - s.y * 0.25));

    // Entities.
    for (const e of s.entities) {
      const d = e.z - s.z;
      if (d < -camBack || d > MAX_D) continue;
      if (e.done && (e.kind === 'can' || e.kind === 'cash' || e.kind === 'skate' || e.kind === 'tajine')) continue;
      const o = this.use(`e${e.id}`, () => entityObject(e, c));
      o.position.set(e.x + bend(d), e.kind === 'can' || e.kind === 'cash' || e.kind === 'skate' || e.kind === 'tajine' ? e.y + Math.sin(t * 4 + e.id) * 0.08 : 0, -d);
      if (e.kind === 'can' || e.kind === 'cash' || e.kind === 'skate') o.rotation.y = t * 3 + e.id;
      if (e.kind === 'scooter') o.rotation.y = e.vx > 0 ? -0.5 : 0.5;
      if (e.kind === 'donkey') {
        o.rotation.y = e.vx > 0 ? -0.25 : 0.25;
        const dk = o.getObjectByName('donkey');
        if (dk) dk.position.y = Math.abs(Math.sin(t * 7 + e.id)) * 0.05; // plodding
      }
      const spin = o.getObjectByName('spin');
      if (spin) {
        spin.rotation.y = e.done ? 0 : t * 4;
        spin.visible = !e.done;
      }
    }

    // Roadside scenery.
    for (let i = Math.floor((s.z - camBack) / DECOR_STEP); i * DECOR_STEP < s.z + DECOR_D; i++) {
      const d = i * DECOR_STEP - s.z;
      for (const side of [-1, 1]) {
        const r = hash(i * 2 + (side > 0 ? 1 : 0));
        const r2 = hash(i * 7 + (side > 0 ? 3 : 5));
        const r3 = hash(i * 13 + (side > 0 ? 11 : 17));
        const slotZ = i * DECOR_STEP;
        // Skull-and-crossbones signs line the last stretch before the giant Charba comes rolling.
        const warn = s.mode === 'stage' && slotZ > chaseStart(s) - 70 && slotZ < chaseStart(s) - 4 && ((i + (side > 0 ? 1 : 0)) & 1) === 0;
        const shelter = !warn && r3 < 0.07;
        const variant = Math.floor(r * 6);
        if (hasModelHouses(c) && r2 < 0.6) {
          // Facade on the pavement line, the rest of the house behind it.
          const h = this.use(`m${i}${side}`, () => {
            const mh = modelHouse(c, variant, side);
            mh.obj.userData.depth = mh.depth;
            return mh.obj;
          });
          h.position.set(side * (ROAD_HALF + 3.4 + h.userData.depth / 2) + bend(d), 0, -d);
        } else {
          const h = this.use(`h${i}${side}`, () => house(c, variant, side));
          h.position.set(side * (ROAD_HALF + 5.4) + bend(d), 0, -d);
        }
        // Now and then a kid cheers you on from the pavement.
        if (r2 > 0.78 && !shelter) {
          const b = this.use(`b${i}${side}`, () => spectator(side));
          b.position.set(side * (ROAD_HALF + 0.95) + bend(d - 3), 0, -(d - 3));
          b.getObjectByName('bob')!.position.y = Math.abs(Math.sin(t * 7 + i * 1.7)) * 0.25;
        }
        const kinds = DECOR[c.id] ?? DECOR.default;
        const kind = kinds[Math.floor(r * kinds.length)];
        const p = this.use(`d${i}${side}`, () =>
          kind === 'palm' ? palm() : kind === 'lamp' ? lamp() : kind === 'maple' ? maple() : kind === 'stall' ? fruitStall(side) : flag(),
        );
        p.position.set(side * (ROAD_HALF + (kind === 'stall' ? 1.9 : 1.3)) + bend(d), 0, -d);
        if (kind === 'flag') p.rotation.y = side > 0 ? Math.PI : 0;
        if (kind === 'lamp') p.rotation.y = side > 0 ? 0 : Math.PI; // arm over the road
        // Chickens wander the pavement here and there.
        if (r2 > 0.62 && r2 < 0.72 && !shelter) {
          const ch = this.use(`c${i}${side}`, () => chickens(i));
          ch.position.set(side * (ROAD_HALF + 1.9) + bend(d - 1.5), 0, -(d - 1.5));
          ch.children.forEach((h, k) => (h.rotation.x = Math.max(0, Math.sin(t * 6 + k * 2 + i)) * 0.6));
        }
        // A tea table on the pavement here and there.
        if (r2 > 0.5 && r2 < 0.62 && !shelter) {
          const tt = this.use(`t${i}${side}`, () => teaTable());
          tt.position.set(side * (ROAD_HALF + 2.3) + bend(d + 2.5), 0, -(d + 2.5));
        }
        if (shelter) {
          const bs = this.use(`bs${i}${side}`, () => busStop(side));
          bs.position.set(side * (ROAD_HALF + 2.2) + bend(d + 3), 0, -(d + 3));
        }
        if (warn) {
          const ds = this.use(`ds${i}${side}`, () => dangerSign(side));
          ds.position.set(side * (ROAD_HALF + 0.75) + bend(d + 1), 0, -(d + 1));
        }
        // An old man strolls toward you, from where he was when he came into view.
        if (r3 > 0.07 && r3 < 0.15) {
          const om = this.use(`om${i}${side}`, () => Object.assign(oldMan(), { userData: { born: t } }));
          const walked = t - om.userData.born;
          const dd = d + 1 - walked * 1.1;
          om.position.set(side * (ROAD_HALF + 0.8) + bend(dd), 0, -dd);
          showFrame(om, Math.floor(walked * 2.8));
        }
        // Pigeons bob about on the pavement.
        if (r3 > 0.15 && r3 < 0.25 && !shelter) {
          const pg = this.use(`pg${i}${side}`, () => pigeons(i));
          pg.position.set(side * (ROAD_HALF + 1.7) + bend(d + 4.5), 0, -(d + 4.5));
          pg.children.forEach((h, k) => showFrame(h, Math.floor(t * 3 + k * 0.7 + i)));
        }
        // Gulls wheel over the port cities.
        if (c.sea && r3 > 0.92) {
          const gu = this.use(`gu${i}${side}`, () => seagull());
          const a = t * 0.7 + i * 1.3;
          const dd = d + Math.sin(a) * 4;
          gu.position.set(side * 2.5 + Math.cos(a) * 4 + bend(dd), 6.5 + Math.sin(t * 1.3 + i) * 0.6, -dd);
          gu.rotation.set(0, Math.atan2(-Math.sin(a), -Math.cos(a)), 0.35); // along the circle, banking in
          showFrame(gu, Math.floor(t * 4.5 + i));
        }
      }
    }

    this.updateParticles(s, bend);

    // The giant Charba rolling after you.
    this.giant.visible = chase;
    if (chase) {
      const gap = 2.4 + s.chaseGap * 0.25;
      this.giant.position.set(0, this.giant.userData.radius, gap);
      this.giant.getObjectByName('spin')!.rotation.x = -t * 8;
    }

    // Drop pooled objects not used this frame (behind us or no longer needed).
    for (const [key, p] of this.pool) {
      if (p.seen !== this.frame) {
        if (key.startsWith('e')) {
          this.scene.remove(p.obj);
          this.pool.delete(key);
        } else if (p.seen < this.frame - 2) {
          this.scene.remove(p.obj);
          this.pool.delete(key);
        } else {
          p.obj.visible = false;
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.onFrameEnd?.();
  }

  private buildRoad(s: GameState, c: City, bend: (d: number) => number) {
    const pos = this.roadPos;
    const col = this.roadCol;
    let v = 0;
    const ground = [color(c.ground[0]), color(c.ground[1])];
    const road = [color(c.road[0]), color(c.road[1])];
    const curb = [color(c.curb[0]), color(c.curb[1])];
    const line = color(c.line);
    const first = Math.floor((s.z - this.camDist - 2) / SEG);
    const segs = this.roadPos.length / (STRIPS * 6 * 3);
    const CURB = 0.45;
    const GROUND = 40;
    const quad = (x0a: number, x1a: number, za: number, x0b: number, x1b: number, zb: number, cl: THREE.Color, y = 0) => {
      const p = [x0a, y, za, x1a, y, za, x1b, y, zb, x0a, y, za, x1b, y, zb, x0b, y, zb];
      for (let i = 0; i < 18; i++) pos[v * 3 + i] = p[i];
      for (let i = 0; i < 6; i++) {
        col[(v + i) * 3] = cl.r;
        col[(v + i) * 3 + 1] = cl.g;
        col[(v + i) * 3 + 2] = cl.b;
      }
      v += 6;
    };
    for (let n = 0; n < segs; n++) {
      const i = first + n;
      const da = i * SEG - s.z;
      const db = da + SEG;
      const ba = bend(da);
      const bb = bend(db);
      const za = -da;
      const zb = -db;
      const alt = ((i % 2) + 2) % 2;
      quad(-GROUND + ba, -ROAD_HALF - CURB + ba, za, -GROUND + bb, -ROAD_HALF - CURB + bb, zb, ground[alt]);
      quad(ROAD_HALF + CURB + ba, GROUND + ba, za, ROAD_HALF + CURB + bb, GROUND + bb, zb, ground[alt]);
      quad(-ROAD_HALF - CURB + ba, -ROAD_HALF + ba, za, -ROAD_HALF - CURB + bb, -ROAD_HALF + bb, zb, curb[alt], 0.03);
      quad(ROAD_HALF + ba, ROAD_HALF + CURB + ba, za, ROAD_HALF + bb, ROAD_HALF + CURB + bb, zb, curb[alt], 0.03);
      quad(-ROAD_HALF + ba, ROAD_HALF + ba, za, -ROAD_HALF + bb, ROAD_HALF + bb, zb, road[alt]);
      // centre dash on every other segment (a zero-width quad otherwise)
      const dw = alt ? 0.08 : 0;
      quad(-dw + ba, dw + ba, za - 0.4, -dw + bb, dw + bb, zb + 0.4, line, 0.02);
    }
    this.road.geometry.attributes.position.needsUpdate = true;
    this.road.geometry.attributes.color.needsUpdate = true;
  }
}
