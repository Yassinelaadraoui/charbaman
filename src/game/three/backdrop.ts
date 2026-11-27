import * as THREE from 'three';
import type { City } from '../cities';
import { flatten } from './props';
import { glowTexture } from './surfaces';

// The far background of a city: a medina skyline in two hazy layers (flat roofs with parapets, domes, little
// minarets, water tanks), a band of distant hills, the sun or the moon and stars, and drifting clouds. Everything
// is merged into a handful of draw calls and ignores fog (it is painted in hazy colours already).

const hash = (i: number) => {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const lambert = (color: THREE.Color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

// One skyline block: a flat-roofed house with a crenellated parapet, and now and then a dome, a minaret, a water
// tank or a satellite dish on top.
function block(g: THREE.Group, x: number, z: number, w: number, h: number, color: THREE.Color, r: number) {
  const m = lambert(color);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 9), m);
  body.position.set(x, h / 2, z);
  g.add(body);
  // Parapet teeth along the front edge.
  const teeth = Math.max(2, Math.floor(w / 2.4));
  for (let i = 0; i < teeth; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1), m);
    t.position.set(x - w / 2 + (i + 0.5) * (w / teeth), h + 0.55, z + 4);
    g.add(t);
  }
  const top = hash(Math.floor(r * 1e6));
  if (top < 0.22) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w * 0.3, 5), 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), lambert(color.clone().offsetHSL(0, 0, 0.06)));
    dome.position.set(x, h, z);
    g.add(dome);
  } else if (top < 0.36) {
    // A little minaret: square shaft, a lantern and a point.
    const tw = 2.4;
    const th = 12 + top * 30;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(tw, th, tw), m);
    shaft.position.set(x + w * 0.25, h + th / 2, z);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.6, 2.4, tw * 0.6), m);
    lantern.position.set(x + w * 0.25, h + th + 1.2, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(tw * 0.45, 2.2, 4), m);
    cap.position.set(x + w * 0.25, h + th + 3.5, z);
    cap.rotation.y = Math.PI / 4;
    g.add(shaft, lantern, cap);
  } else if (top < 0.6) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 8), m);
    tank.position.set(x - w * 0.2, h + 0.9, z - 1);
    g.add(tank);
  } else if (top < 0.75) {
    const room = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, 2.6, 4), m);
    room.position.set(x + w * 0.15, h + 1.3, z - 2);
    g.add(room);
  }
}

// A band of far hills, faded nearly to the colour of the sky.
function hills(g: THREE.Group, c: City, color: THREE.Color) {
  const N = 48;
  const pos: number[] = [];
  const ridge = (u: number) =>
    14 + 16 * (0.5 + 0.5 * Math.sin(u * 13 + c.seed)) * (0.6 + 0.4 * Math.sin(u * 5.3 + 2)) + hash(c.seed * 13 + Math.round(u * N)) * 5;
  for (let i = 0; i < N; i++) {
    const u0 = i / N;
    const u1 = (i + 1) / N;
    const x0 = -480 + u0 * 960;
    const x1 = -480 + u1 * 960;
    const y0 = ridge(u0);
    const y1 = ridge(u1);
    pos.push(x0, 0, 0, x1, 0, 0, x1, y1, 0, x0, 0, 0, x1, y1, 0, x0, y0, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  m.position.z = -300;
  g.add(m);
}

export function skylineBlocks(c: City): THREE.Group {
  const g = new THREE.Group();
  const far = new THREE.Color(c.far);
  const haze = new THREE.Color(c.skyBottom);
  // Inland cities get hills behind the rooftops; the port cities have the sea there instead.
  const hasRange = c.landmarks.includes('mountain');
  if (!c.sea && !hasRange) hills(g, c, far.clone().lerp(haze, 0.55));
  // Back row: taller, paler.
  for (let i = 0; i < 34; i++) {
    const r = hash(c.seed * 100 + i + 500);
    const w = 12 + r * 14;
    const h = 14 + hash(c.seed * 300 + i) * 22;
    block(g, -320 + i * 19 + r * 6, -262 - hash(i + 3) * 18, w, h, far.clone().lerp(haze, 0.35), r);
  }
  // Front row.
  for (let i = 0; i < 40; i++) {
    const r = hash(c.seed * 100 + i);
    const w = 10 + r * 16;
    const h = 8 + hash(c.seed * 200 + i) * 20;
    block(g, -300 + i * 15 + r * 6, -228 - hash(i + 7) * 26, w, h, far.clone().offsetHSL(0, 0, i % 2 ? 0 : -0.035), r);
  }
  return g;
}

// Sun (or moon and stars), and clouds: they ride along with the sky dome.
export type SkyExtras = { group: THREE.Group; clouds: THREE.Object3D[] };

let starGeo: THREE.BufferGeometry | undefined;
function stars() {
  if (!starGeo) {
    const n = 220;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = hash(i * 3 + 1) * Math.PI * 2;
      const e = 0.12 + hash(i * 3 + 2) * 1.2; // above the skyline
      p.set([Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380], i * 3);
    }
    starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  }
  return new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
}

function cloud(seed: number, color: THREE.Color) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const n = 4 + Math.floor(hash(seed) * 3);
  for (let i = 0; i < n; i++) {
    const r = 6 + hash(seed * 7 + i) * 7;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), m);
    puff.position.set((i - n / 2) * 8 + hash(seed + i) * 4, hash(seed * 3 + i) * 4, hash(seed * 5 + i) * 4);
    puff.scale.set(1.3, 0.65, 1);
    g.add(puff);
  }
  return flatten(g);
}

export function skyExtras(c: City): SkyExtras {
  const group = new THREE.Group();
  const glow = glowTexture();
  const noFog = (o: THREE.Object3D) =>
    o.traverse((x) => {
      const m = (x as THREE.Mesh).material as THREE.Material | undefined;
      if (m) (m as THREE.MeshBasicMaterial).fog = false;
    });
  if (c.night) {
    group.add(stars());
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xf4f1ff, fog: false, depthWrite: false }));
    moon.scale.setScalar(70);
    moon.position.set(-120, 150, -300);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0xfdfbf0, fog: false }));
    disc.position.set(-120, 150, -299);
    disc.lookAt(0, 0, 0);
    group.add(moon, disc);
  } else {
    // The sun low over the city, with a wide warm halo.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(c.sun), fog: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    halo.scale.setScalar(150);
    halo.position.set(110, 120, -320);
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, fog: false, depthWrite: false }));
    disc.scale.setScalar(34);
    disc.position.set(110, 120, -318);
    group.add(halo, disc);
  }
  const clouds: THREE.Object3D[] = [];
  const tint = new THREE.Color(c.night ? '#4a5878' : '#ffffff').lerp(new THREE.Color(c.skyBottom), c.night ? 0.3 : 0.15);
  for (let i = 0; i < 7; i++) {
    const cl = cloud(c.seed * 17 + i, tint);
    cl.position.set(-260 + i * 85 + hash(c.seed + i * 9) * 40, 70 + hash(c.seed * 5 + i) * 50, -280 - hash(i * 11) * 60);
    cl.scale.setScalar(0.8 + hash(i * 4 + c.seed) * 0.7);
    cl.userData.x = cl.position.x;
    noFog(cl);
    group.add(cl);
    clouds.push(cl);
  }
  return { group, clouds };
}

// Clouds drift slowly across, wrapping round.
export function driftClouds(extras: SkyExtras, t: number) {
  for (const [i, cl] of extras.clouds.entries()) {
    let x = cl.userData.x + t * (1.5 + (i % 3) * 0.6);
    x = ((((x + 320) % 640) + 640) % 640) - 320;
    cl.position.x = x;
  }
}
