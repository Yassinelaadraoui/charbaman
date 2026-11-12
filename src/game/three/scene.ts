import * as THREE from 'three';
import type { City } from '../cities';
import { Entity, GameState, ROAD_HALF, chaseStart, city as cityOf } from '../engine';
import { buildHero, dressHero, HeroRig, poseHero } from './hero';
import type { Suit } from '../progression';
import { maskTexture } from './models/decode';
import { PARTICLES } from './particleTextures';
import { asphaltTexture, blobTexture, glowTexture, paverTexture } from './surfaces';
import { entityObject, flatten, flag, giantBottle, policeChaser, hasModelHouses, house, lamp, landmark, maple, mat, modelHouse, palm, shadeHex, walkingKid, KID_CYCLE, zebra, manhole, teaTable, warmModels, fruitStall, chickens, busStop, oldMan, pigeons, seagull, dangerSign, animate, OLD_MAN_CYCLE, GULL_CYCLE, DONKEY_CYCLE, cat, CAT_CYCLE, spiceMarket } from './props';

// Engine space: x lateral, z forward along the street, y up.
// Three space: the hero stays at the origin and runs toward -z, so world z = -(engineZ - s.z).

const MAX_D = 110;
const DECOR_D = 80;
const SEG = 3;
const DECOR_STEP = 7;
const ROAD_STRIPS = 4; // curb L/R, road, centre dash
const GROUND_STRIPS = 2; // pavement L/R

// Pavement decor per city; maples line the streets in the cooler north.
const DECOR: Record<string, string[]> = {
  default: ['palm', 'lamp', 'lamp', 'flag'],
  marrakech: ['palm', 'stall', 'lamp', 'spice', 'flag', 'stall'],
  fes: ['maple', 'lamp', 'stall', 'spice', 'flag'],
  tangier: ['maple', 'lamp', 'palm', 'flag'],
  rabat: ['palm', 'lamp', 'lamp', 'flag'],
  agadir: ['palm', 'palm', 'lamp', 'flag'],
  chefchaouen: ['maple', 'lamp', 'flag', 'lamp'],
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
  road: THREE.Mesh; // asphalt, kerbs and markings
  ground: THREE.Mesh; // paved pavements out to the houses and beyond
  blobMat: THREE.MeshBasicMaterial; // soft contact shadows under cars, carts and crates
  sky: THREE.Mesh;
  skyline = new THREE.Group();
  sea: THREE.Mesh;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  giant: THREE.Group;
  police: THREE.Group;
  bubble: THREE.Mesh; // the shield, a faint green bubble round the hero
  private dustAt = 0;
  pool = new Map<string, Pooled>();
  particles: Particle[] = [];
  spriteMats = new Map<string, THREE.SpriteMaterial>();
  lastTime = 0;
  frame = 0;
  cityId = '';
  camDist = 5.2;
  camHeight = 3.9;
  fovKick = 0; // degrees added to the field of view at speed (skateboard, chase)
  onFrameEnd?: () => void;
  debugCamera?: { pos: [number, number, number]; look: [number, number, number] }; // for automated playtests
  heroX = 0; // last frame's hero position and lean, for leaning into turns
  heroLean = 0;
  lite = false; // Fast graphics: no pedestrians, animals or small street furniture, fewer particles

  constructor(gl: WebGLRenderingContext, width: number, height: number, onFrameEnd?: () => void) {
    this.onFrameEnd = onFrameEnd;
    // expo-gl's context is WebGL1-shaped, so three is pinned to r162 (the last release that accepts WebGL1).
    const g = gl as WebGLRenderingContext & { getContextAttributes?: () => WebGLContextAttributes | null };
    if (typeof g.getContextAttributes !== 'function') {
      g.getContextAttributes = () => ({ alpha: true, antialias: false, depth: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
      // expo-gl only takes these two pixelStorei settings and logs a complaint for the rest, which three
      // sets on every texture upload. None of the others matter for the game's raw-pixel textures.
      const pixelStorei = gl.pixelStorei.bind(gl);
      gl.pixelStorei = (pname: number, param: number | boolean) => {
        if (pname === 0x9240 || pname === 0x0cf5) pixelStorei(pname, param as number); // UNPACK_FLIP_Y_WEBGL, UNPACK_ALIGNMENT
      };
      // three asks for float colour buffers whenever it uploads a float texture (the morph-target poses) and
      // warns when they are missing; it only needs them to draw into float buffers, which the game never does.
      const getExtension = gl.getExtension.bind(gl);
      gl.getExtension = ((name: string) => getExtension(name) ?? (name === 'EXT_color_buffer_float' ? {} : null)) as typeof gl.getExtension;
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

    // Road and pavement ribbons, rebuilt every frame (6 verts per quad), each with its own tiling texture.
    const segs = Math.ceil(MAX_D / SEG) + 2;
    const ribbon = (strips: number, map: THREE.Texture) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs * strips * 18), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(segs * strips * 18), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(segs * strips * 12), 2));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, map }));
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.ground = ribbon(GROUND_STRIPS, paverTexture());
    this.road = ribbon(ROAD_STRIPS, asphaltTexture());

    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.5, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), this.blobMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.04;
    this.scene.add(this.shadow);

    this.hero = buildHero();
    this.scene.add(this.hero.root);

    this.giant = giantBottle();
    this.giant.visible = false;
    this.scene.add(this.giant);
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x7dffc0, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.bubble.visible = false;
    this.scene.add(this.bubble);
    this.police = policeChaser();
    this.police.visible = false;
    this.scene.add(this.police);
  }

  dress(suit: Suit) {
    dressHero(this.hero, suit);
  }

  burst(kind: BurstKind, x: number, y: number, z: number) {
    const b = BURSTS[kind];
    const key = `${b.tex}|${b.color}`;
    let m = this.spriteMats.get(key);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: maskTexture(PARTICLES[b.tex]), color: b.color, transparent: true, depthWrite: false });
      this.spriteMats.set(key, m);
    }
    const count = this.lite ? Math.ceil(b.n / 2) : b.n;
    for (let i = 0; i < count && this.particles.length < (this.lite ? 30 : 80); i++) {
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
    // Keep about 4.9 m of street visible across at the hero on wide phones; tall ones cap the field of view
    // and see a little less, rather than a sliver of street between a lot of sky and a lot of road. The camera
    // follows the hero sideways, so the kerbs come into view as he steers toward them.
    const halfWidth = 2.45;
    const hfov = 2 * Math.atan(halfWidth / this.camDist);
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
    this.camera.fov = Math.min(78, Math.max(50, THREE.MathUtils.radToDeg(vfov))) + this.fovKick;
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
    // Night: the street lit by its lamps under a dark sky.
    this.hemi.intensity = c.night ? 0.75 : 1.6;
    this.sun.intensity = c.night ? 0.55 : 1.6;
    this.sea.visible = !!c.sea;
    if (c.sea) (this.sea.material as THREE.MeshBasicMaterial).color = color(c.sea);

    // Rebuild the skyline for this city: a ring of far blocks plus landmarks.
    this.skyline.clear();
    for (let i = 0; i < 40; i++) {
      const r = hash(c.seed * 100 + i);
      const w = 10 + r * 16;
      const h = 8 + hash(c.seed * 200 + i) * 22;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 10), mat(i % 2 ? c.far : '#' + shadeHex(c.far, -8).toString(16).padStart(6, '0')));
      b.position.set(-300 + i * 15 + r * 6, h / 2, -225 - hash(i + 7) * 30); // behind the landmarks
      this.skyline.add(b);
    }
    c.landmarks.forEach((lm, j) => {
      const l = landmark(lm, c);
      if (lm !== 'mosque' && lm !== 'mountain') l.scale.setScalar(1.4); // further back than before, so a little bigger
      // A gate is low and wide: as a city's signature it stands bigger and dead ahead, over the rooftops.
      if (lm === 'bab' && j === 0) l.scale.setScalar(2.4);
      // The first landmark is the city's signature one, so it stands straight ahead.
      // Far enough back that even the tallest (the Hassan II minaret) fits under the HUD with the camera
      // looking down the street.
      l.position.set([-4, -85, 85, -160][j % 4] + (lm === 'bab' && j === 0 ? 4 : hash(c.seed + j) * (j ? 20 : 8)), 0, -195 - (j % 2) * 15);
      this.skyline.add(l);
    });
    // One draw call for all the far blocks instead of forty.
    const merged = flatten(this.skyline);
    this.skyline.clear();
    this.skyline.add(...merged.children);
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

  // Grounds cars, carts and crates with a soft contact shadow, so they no longer seem to float on the road.
  private blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private withShadow(o: THREE.Object3D, e: Entity) {
    const sized: Partial<Record<Entity['kind'], [number, number]>> = {
      taxi: [e.w * 2.5, e.depth * 1.15],
      scooter: [0.9, 1.7],
      donkey: [e.w * 2.3, e.depth * 1.1],
      crate: [e.w * 2.1, e.depth * 1.8],
    };
    const size = sized[e.kind];
    if (!size || this.lite) return o;
    const b = new THREE.Mesh(this.blobGeo, this.blobMat);
    b.scale.set(size[0], 1, size[1]);
    b.position.y = 0.035;
    b.renderOrder = -1;
    o.add(b);
    return o;
  }

  // At night each street lamp gets a warm halo round its lantern.
  private glowMat?: THREE.SpriteMaterial;
  private litLamp(c: City) {
    const l = lamp();
    if (!c.night) return l;
    this.glowMat ??= new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc46b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 });
    const halo = new THREE.Sprite(this.glowMat);
    halo.position.set(-1.2, 4.2, 0);
    halo.scale.setScalar(2.4);
    l.add(halo);
    return l;
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

    // Camera: behind and above, looking down the street so the hero runs in the lower third and the road ahead
    // fills the screen. Follows the hero sideways and a little up on jumps. Pulls back in the chase.
    const chase = s.phase === 'chase';
    const targetDist = chase ? 8.4 : 5.2;
    // As the giant bottle closes in, lift the camera so you can still see over it.
    const targetHeight = chase ? 4.9 + (1 - s.chaseGap / 12) * 2.2 : 3.9;
    this.camDist += (targetDist - this.camDist) * 0.05;
    this.camHeight += (targetHeight - this.camHeight) * 0.05;
    // A wider view at speed sells the rush of the skateboard and the chase.
    this.fovKick += ((s.skate > 0 ? 7 : 0) + (chase ? 3 : 0) - this.fovKick) * 0.06;
    const camX = s.x * 0.6;
    // In the chase the ground rumbles, harder as the chaser closes in.
    const rumble = chase ? 0.04 + Math.max(0, 1 - s.chaseGap / 12) * 0.12 : 0;
    const shakeX = (s.shake > 0 ? Math.sin(t * 90) * s.shake * 0.25 : 0) + Math.sin(t * 53) * rumble;
    const shakeY = (s.shake > 0 ? Math.cos(t * 70) * s.shake * 0.15 : 0) + Math.cos(t * 61) * rumble * 0.7;
    this.camera.position.set(camX + shakeX, this.camHeight + s.y * 0.3 + shakeY, this.camDist);
    this.camera.lookAt(camX * 0.6 + bend(12) * 0.5, s.y * 0.2, -10);
    this.fitCamera(this.camera.aspect);
    if (this.debugCamera) {
      this.camera.position.set(...this.debugCamera.pos);
      this.camera.lookAt(...this.debugCamera.look);
    }

    // Sky and skyline turn with the street.
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    // Gently, so the city's landmark stays in view down the street as the road bends.
    this.skyline.position.x = -curveIntegral(s.z) * 45 - camX * 0.3;
    this.skyline.position.z = this.camera.position.z;

    this.buildRoad(s, c, bend);

    // Hero.
    this.hero.root.position.set(s.x, s.y, 0);
    // Lean into the turn (smoothed so a twitchy finger doesn't make him wobble).
    const frameDt = Math.max(1 / 120, Math.min(0.05, s.time - this.lastTime));
    const lean = Math.max(-0.3, Math.min(0.3, ((s.x - this.heroX) / frameDt) * 0.035));
    this.heroX = s.x;
    this.heroLean += (lean - this.heroLean) * (1 - Math.exp(-frameDt * 18));
    this.hero.root.rotation.set(0, -this.heroLean * 0.5, -this.heroLean);
    poseHero(this.hero, {
      runPhase: s.runPhase,
      airborne: s.y > 0.05,
      vy: s.vy,
      sliding: s.slide > 0,
      skating: s.skate > 0,
      tajine: s.tajine > 0,
      dt: s.time - this.lastTime,
    });
    this.bubble.visible = s.shield > 0 && (s.shield > 2 || Math.floor(t * 8) % 2 === 0); // blinks as it runs out
    if (this.bubble.visible) {
      this.bubble.position.set(s.x, s.y + (s.slide > 0 ? 0.55 : 0.95), 0);
      this.bubble.scale.setScalar(1 + Math.sin(t * 6) * 0.04);
    }
    this.hero.root.visible = !(s.invuln > 0 && Math.floor(s.time * 12) % 2 === 0);
    this.shadow.position.x = s.x;
    this.shadow.scale.setScalar(Math.max(0.4, 1 - s.y * 0.25));

    // Entities.
    for (const e of s.entities) {
      const d = e.z - s.z;
      if (d < -camBack || d > MAX_D) continue;
      const pickup = e.kind === 'can' || e.kind === 'cash' || e.kind === 'skate' || e.kind === 'tajine' || e.kind === 'magnet' || e.kind === 'shield';
      if (e.done && pickup) continue;
      const o = this.use(`e${e.id}`, () => this.withShadow(entityObject(e, c), e));
      o.position.set(e.x + bend(d), pickup ? e.y + Math.sin(t * 4 + e.id) * 0.08 : 0, -d);
      if (pickup && e.kind !== 'tajine') o.rotation.y = t * 3 + e.id;
      if (e.kind === 'scooter') o.rotation.y = e.vx > 0 ? 1.1 : -1.1; // the moped heads across the street, a little toward you
      if (e.kind === 'taxi') {
        // Police lights flash in turn; moving cars rock a little on their springs.
        const on = Math.floor(t * 6 + e.id) % 2 === 0;
        const red = o.getObjectByName('sirenR');
        const blue = o.getObjectByName('sirenB');
        if (red && blue) {
          red.visible = on;
          blue.visible = !on;
        }
        if (e.vz) o.position.y = Math.sin(t * 13 + e.id) * 0.015;
      }
      if (e.kind === 'donkey') {
        o.rotation.y = 0; // plods toward you
        const dk = o.getObjectByName('donkey');
        if (dk) animate(dk, ((t + e.id * 0.3) / DONKEY_CYCLE.seconds) * DONKEY_CYCLE.poses); // plodding
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
      // A zebra crossing every so often (never under the chase's danger signs), and manhole covers.
      if (i % 17 === 5) this.use(`zb${i}`, () => zebra(c)).position.set(bend(d), 0, -d);
      else if (hash(i * 11 + 5) < 0.18) {
        const x = (hash(i * 19) - 0.5) * 3.6;
        this.use(`mh${i}`, manhole).position.set(x + bend(d), 0, -d);
      }
      for (const side of [-1, 1]) {
        const r = hash(i * 2 + (side > 0 ? 1 : 0));
        const r2 = hash(i * 7 + (side > 0 ? 3 : 5));
        const r3 = hash(i * 13 + (side > 0 ? 11 : 17));
        const slotZ = i * DECOR_STEP;
        // Skull-and-crossbones signs line the last stretch before the giant Charba comes rolling.
        const warn = s.mode === 'stage' && slotZ > chaseStart(s) - 70 && slotZ < chaseStart(s) - 4 && ((i + (side > 0 ? 1 : 0)) & 1) === 0;
        const kinds = DECOR[c.id] ?? DECOR.default;
        const kind = kinds[Math.floor(r * kinds.length)];
        const shelter = !warn && r3 < 0.07 && kind !== 'spice';
        const clear = !shelter && kind !== 'spice' && !this.lite; // room on the pavement for small props
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
        // People going about their day on the pavement, some coming toward you, some walking the same way.
        // Each sets off from where he was when he came into view.
        const walker = (key: string, make: () => THREE.Object3D, cycle: { poses: number; seconds: number; speed: number }, lane: number, dz: number) => {
          const dir = hash(i * 31 + (side > 0 ? 7 : 3) + key.length) < 0.6 ? 1 : -1;
          const o = this.use(key, () => Object.assign(make(), { userData: { born: t } }));
          const walked = t - o.userData.born;
          const dd = d + dz - dir * walked * cycle.speed;
          o.position.set(side * (ROAD_HALF + lane) + bend(dd), 0, -dd);
          o.rotation.y = dir > 0 ? 0 : Math.PI;
          animate(o, (walked / cycle.seconds) * cycle.poses);
        };
        if (r2 > 0.8 && clear) walker(`k${i}${side}`, walkingKid, KID_CYCLE, 1.0 + hash(i * 5 + 1) * 0.6, -3);
        const p = this.use(`d${i}${side}`, () =>
          kind === 'palm' ? palm() : kind === 'lamp' ? this.litLamp(c) : kind === 'maple' ? maple() : kind === 'stall' ? fruitStall(side) : kind === 'spice' ? spiceMarket() : flag(),
        );
        p.position.set(side * (ROAD_HALF + (kind === 'stall' ? 1.9 : kind === 'spice' ? 2.1 : 1.3)) + bend(d), 0, -d);
        if (kind === 'flag') p.rotation.y = side > 0 ? Math.PI : 0;
        if (kind === 'lamp') p.rotation.y = side > 0 ? 0 : Math.PI; // arm over the road
        // Chickens wander the pavement here and there.
        if (r2 > 0.62 && r2 < 0.72 && clear) {
          const ch = this.use(`c${i}${side}`, () => chickens(i));
          ch.position.set(side * (ROAD_HALF + 1.9) + bend(d - 1.5), 0, -(d - 1.5));
          ch.children.forEach((h, k) => animate(h, t * 6 + k * 3.1 + i, false)); // head down, peck, head up
        }
        // A tea table on the pavement here and there.
        if (r2 > 0.5 && r2 < 0.62 && clear) {
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
        if (r3 > 0.07 && r3 < 0.15 && !this.lite) walker(`om${i}${side}`, oldMan, OLD_MAN_CYCLE, 0.8 + hash(i * 3 + 2) * 0.5, 1);
        // Now and then a cat pads along the foot of the houses.
        if (r3 > 0.25 && r3 < 0.32 && clear) {
          const ct = this.use(`ct${i}${side}`, () => {
            const o = cat(i * 3 + (side > 0 ? 1 : 0));
            o.userData.born = t;
            return o;
          });
          const walked = t - ct.userData.born;
          const dd = d + 2 - walked * CAT_CYCLE.speed;
          ct.position.set(side * (ROAD_HALF + 2.7) + bend(dd), 0, -dd);
          animate(ct, (walked / CAT_CYCLE.seconds) * CAT_CYCLE.poses);
        }
        // Pigeons bob about on the pavement.
        if (r3 > 0.15 && r3 < 0.25 && clear) {
          const pg = this.use(`pg${i}${side}`, () => pigeons(i));
          pg.position.set(side * (ROAD_HALF + 1.7) + bend(d + 4.5), 0, -(d + 4.5));
          pg.children.forEach((h, k) => animate(h, t * 9 + k * 2.7 + i, false)); // a bob every ~0.9 s
        }
        // Gulls wheel over the port cities.
        if (c.sea && r3 > 0.92 && !this.lite) {
          const gu = this.use(`gu${i}${side}`, () => seagull());
          const a = t * 0.7 + i * 1.3;
          const dd = d + Math.sin(a) * 4;
          gu.position.set(side * 2.5 + Math.cos(a) * 4 + bend(dd), 6.5 + Math.sin(t * 1.3 + i) * 0.6, -dd);
          gu.rotation.set(0, Math.atan2(-Math.sin(a), -Math.cos(a)), 0.35); // along the circle, banking in
          animate(gu, ((t + i * 0.37) / GULL_CYCLE.seconds) * GULL_CYCLE.poses);
        }
      }
    }

    this.updateParticles(s, bend);

    // The chaser: the giant Charba rolling after you, or in Marrakech a police van, kicking up dust.
    const police = c.chaser === 'police';
    this.giant.visible = chase && !police;
    this.police.visible = chase && police;
    if (chase) {
      // Close enough behind that it looms at the bottom of the screen, nearer as the gap closes.
      const gap = police ? 4.4 + s.chaseGap * 0.2 : 1.3 + this.giant.userData.radius + s.chaseGap * 0.2;
      if (police) {
        this.police.position.set(Math.sin(t * 1.3) * 0.4, Math.sin(t * 17) * 0.02, gap);
        this.police.rotation.y = Math.sin(t * 1.3 + 0.6) * 0.06;
        const on = Math.floor(t * 7) % 2 === 0;
        this.police.getObjectByName('sirenR')!.visible = on;
        this.police.getObjectByName('sirenB')!.visible = !on;
      } else {
        this.giant.position.set(0, this.giant.userData.radius, gap);
        this.giant.getObjectByName('spin')!.rotation.x = -t * 8;
      }
      if (t - this.dustAt > (this.lite ? 0.25 : 0.1)) {
        this.dustAt = t;
        const x = (Math.random() * 2 - 1) * (police ? 1.2 : 2.6);
        this.burst('land', s.x + x, 0.1, s.z - gap + 0.8);
      }
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
    const ground = [color(c.ground[0])];
    const road = [color(c.road[0]), color(c.road[1])];
    const curb = [color(c.curb[0]), color(c.curb[1])];
    const line = color(c.line);
    const first = Math.floor((s.z - this.camDist - 2) / SEG);
    const CURB = 0.45;
    const GROUND = 40;
    // Writes quads into one ribbon. UVs follow the street (unbent x, absolute z) so the texture stays put on
    // the ground as you run over it; `scale` is metres per texture tile.
    const writer = (mesh: THREE.Mesh, su: number, sv: number) => {
      const g = mesh.geometry;
      const pos = g.attributes.position.array as Float32Array;
      const col = g.attributes.color.array as Float32Array;
      const uv = g.attributes.uv.array as Float32Array;
      let v = 0;
      const quad = (x0: number, x1: number, ba: number, bb: number, za: number, zb: number, wa: number, wb: number, cl: THREE.Color, y = 0) => {
        const p = [x0 + ba, y, za, x1 + ba, y, za, x1 + bb, y, zb, x0 + ba, y, za, x1 + bb, y, zb, x0 + bb, y, zb];
        const t = [x0 / su, wa / sv, x1 / su, wa / sv, x1 / su, wb / sv, x0 / su, wa / sv, x1 / su, wb / sv, x0 / su, wb / sv];
        pos.set(p, v * 3);
        uv.set(t, v * 2);
        for (let i = 0; i < 6; i++) {
          col[(v + i) * 3] = cl.r;
          col[(v + i) * 3 + 1] = cl.g;
          col[(v + i) * 3 + 2] = cl.b;
        }
        v += 6;
      };
      const done = () => {
        g.attributes.position.needsUpdate = true;
        g.attributes.color.needsUpdate = true;
        g.attributes.uv.needsUpdate = true;
      };
      return { quad, done, segs: pos.length / 18 / (mesh === this.road ? ROAD_STRIPS : GROUND_STRIPS) };
    };
    const gw = writer(this.ground, 1, 1);
    // Asphalt tiles span the road (6 m) so the tyre tracks line up with the lanes.
    const rw = writer(this.road, ROAD_HALF * 2, ROAD_HALF * 2);
    for (let n = 0; n < gw.segs; n++) {
      const i = first + n;
      const da = i * SEG - s.z;
      const db = da + SEG;
      const ba = bend(da);
      const bb = bend(db);
      const za = -da;
      const zb = -db;
      const wa = i * SEG;
      const wb = wa + SEG;
      const alt = ((i % 2) + 2) % 2;
      gw.quad(-GROUND, -ROAD_HALF - CURB, ba, bb, za, zb, wa, wb, ground[0]);
      gw.quad(ROAD_HALF + CURB, GROUND, ba, bb, za, zb, wa, wb, ground[0]);
      rw.quad(-ROAD_HALF - CURB, -ROAD_HALF, ba, bb, za, zb, wa, wb, curb[alt], 0.03);
      rw.quad(ROAD_HALF, ROAD_HALF + CURB, ba, bb, za, zb, wa, wb, curb[alt], 0.03);
      rw.quad(-ROAD_HALF, ROAD_HALF, ba, bb, za, zb, wa, wb, road[alt]);
      // centre dash on every other segment (a zero-width quad otherwise)
      const dw = alt ? 0.08 : 0;
      rw.quad(-dw, dw, ba, bb, za - 0.4, zb + 0.4, wa, wb, line, 0.02);
    }
    gw.done();
    rw.done();
  }
}
