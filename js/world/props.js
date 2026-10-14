import * as THREE from 'three';
import { mat } from '../core/geo.js';

// Victorian furniture, built from primitives into a GeoBuilder. Every
// function works in the builder's current frame: push a transform, call
// the prop at the local origin, pop. Props that hold candles return the
// world positions of their flames.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _lathe = new Map();

function latheGeo(key, pts, seg) {
  const k = key + seg;
  let g = _lathe.get(k);
  if (!g) {
    g = new THREE.LatheGeometry(
      pts.map((p) => new THREE.Vector2(p[0], p[1])),
      seg
    );
    _lathe.set(k, g);
  }
  return g;
}

// world position of a local point in the builder's current frame
export function worldOf(B, x, y, z) {
  return V(x, y, z).applyMatrix4(B.M);
}

export function at(B, x, y, z, ry, fn) {
  B.push(mat(x, y, z, ry));
  const r = fn();
  B.pop();
  return r;
}

const TURNED = [
  [0, 0],
  [0.03, 0],
  [0.028, 0.05],
  [0.02, 0.12],
  [0.026, 0.3],
  [0.017, 0.45],
  [0.024, 0.58],
  [0.03, 0.66],
  [0.03, 0.72],
  [0, 0.72],
];

export function turnedLeg(B, m, x, y, z, h) {
  B.geom(m, latheGeo('leg', TURNED, 8), mat(x, y, z, 0, 0, 0, 1, h / 0.72, 1));
}

// Box seen from the inside, open toward +z.
export function hollow(B, key, x, y, z, w, h, d) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const y0 = y - h / 2;
  const y1 = y + h / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  B.quad(key, V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0));
  B.quad(key, V(x0, y0, z1), V(x0, y0, z0), V(x0, y1, z0), V(x0, y1, z1));
  B.quad(key, V(x1, y0, z0), V(x1, y0, z1), V(x1, y1, z1), V(x1, y1, z0));
  B.quad(key, V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1));
  B.quad(key, V(x0, y0, z1), V(x1, y0, z1), V(x1, y0, z0), V(x0, y0, z0));
}

// --------------------------------------------------------------- tables
export function table(B, o = {}) {
  const w = o.w ?? 1.2;
  const d = o.d ?? 0.7;
  const h = o.h ?? 0.76;
  const m = o.mat ?? 'woodDark';
  B.box(m, 0, h - 0.025, 0, w, 0.05, d);
  B.box(m, 0, h - 0.11, 0, w - 0.12, 0.12, d - 0.12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) turnedLeg(B, m, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), h - 0.05);
  if (o.cloth) {
    B.box(o.cloth, 0, h + 0.003, 0, w + 0.24, 0.006, d + 0.24);
    for (const sz of [-1, 1]) B.box(o.cloth, 0, h - 0.14, sz * (d / 2 + 0.12), w + 0.24, 0.28, 0.006);
    for (const sx of [-1, 1]) B.box(o.cloth, sx * (w / 2 + 0.12), h - 0.14, 0, 0.006, 0.28, d + 0.24);
  }
  return h;
}

export function roundTable(B, o = {}) {
  const r = o.r ?? 0.6;
  const h = o.h ?? 0.74;
  const m = o.mat ?? 'woodDark';
  B.cyl(m, 0, h - 0.025, 0, r, r, 0.05, 24);
  B.cyl(m, 0, h - 0.08, 0, r * 0.85, r * 0.85, 0.06, 20);
  B.lathe(
    m,
    [
      [0, 0.12],
      [0.09, 0.14],
      [0.05, 0.3],
      [0.07, 0.42],
      [0.045, 0.6],
      [0.08, h - 0.08],
      [0, h - 0.08],
    ],
    10
  );
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    B.push(mat(0, 0.08, 0, a));
    B.box(m, 0.22, 0.04, 0, 0.42, 0.07, 0.07);
    B.pop();
  }
  if (o.cloth) {
    B.cyl(o.cloth, 0, h + 0.003, 0, r + 0.15, r + 0.15, 0.006, 24);
    B.cyl(o.cloth, 0, h - 0.18, 0, r + 0.16, r + 0.22, 0.36, 24, { open: true });
  }
  return h;
}

// ---------------------------------------------------------------- seats
export function chair(B, o = {}) {
  const wood = o.wood ?? 'woodDark';
  const seat = o.seat ?? 'uphRed';
  const sh = 0.46;
  B.box(wood, 0, sh - 0.04, 0, 0.46, 0.06, 0.44);
  B.box(seat, 0, sh + 0.02, 0.01, 0.42, 0.07, 0.4);
  for (const sx of [-1, 1]) {
    turnedLeg(B, wood, sx * 0.19, 0, 0.18, sh - 0.05);
    B.box(wood, sx * 0.19, (sh - 0.05) / 2, -0.18, 0.04, sh - 0.05, 0.04);
    B.push(mat(sx * 0.19, sh, -0.2, 0, -0.1));
    B.box(wood, 0, 0.5, 0, 0.045, 1.0, 0.045);
    B.sphere(wood, 0, 1.02, 0, 0.03);
    B.pop();
  }
  B.push(mat(0, sh, -0.21, 0, -0.1));
  B.box(wood, 0, 0.9, 0, 0.4, 0.09, 0.04);
  B.box(wood, 0, 0.5, 0, 0.12, 0.7, 0.025);
  if (o.tall) B.box(seat, 0, 0.62, 0.01, 0.32, 0.5, 0.03);
  B.box(wood, 0, 0.18, 0, 0.38, 0.04, 0.03);
  B.pop();
}

export function armchair(B, o = {}) {
  const u = o.mat ?? 'uphRed';
  const wood = o.wood ?? 'woodDark';
  B.box(u, 0, 0.3, 0.02, 0.78, 0.22, 0.72);
  B.box(u, 0, 0.45, 0.06, 0.62, 0.1, 0.6);
  B.box(u, 0, 0.78, -0.31, 0.76, 0.86, 0.16);
  B.sphere(u, 0, 1.2, -0.31, 0.38, 1, 0.32, 0.22);
  for (const sx of [-1, 1]) {
    B.box(u, sx * 0.36, 0.52, 0.04, 0.12, 0.26, 0.66);
    B.cyl(u, sx * 0.36, 0.66, 0.04, 0.075, 0.075, 0.66, 10, { rx: Math.PI / 2 });
    for (const sz of [-1, 1]) B.cyl(wood, sx * 0.32, 0.1, sz * 0.28, 0.025, 0.035, 0.2, 6);
  }
}

export function sofa(B, o = {}) {
  const w = o.w ?? 1.9;
  const u = o.mat ?? 'uphRed';
  const wood = o.wood ?? 'woodDark';
  B.box(u, 0, 0.3, 0.03, w, 0.22, 0.78);
  for (let i = 0; i < 3; i++) B.box(u, (i - 1) * (w - 0.3) / 3, 0.46, 0.07, (w - 0.36) / 3 - 0.02, 0.11, 0.62);
  B.box(u, 0, 0.75, -0.33, w, 0.72, 0.16);
  // camel back
  B.sphere(u, 0, 1.08, -0.33, w * 0.42, 1, 0.22, 0.2);
  for (const sx of [-1, 1]) {
    B.box(u, sx * (w / 2 - 0.08), 0.52, 0.03, 0.16, 0.3, 0.74);
    B.cyl(u, sx * (w / 2 - 0.08), 0.68, 0.03, 0.1, 0.1, 0.74, 10, { rx: Math.PI / 2 });
    for (const sz of [-1, 1]) B.cyl(wood, sx * (w / 2 - 0.12), 0.1, sz * 0.32, 0.025, 0.035, 0.2, 6);
  }
}

export function bench(B, o = {}) {
  const w = o.w ?? 1.2;
  const m = o.mat ?? 'woodDark';
  B.box(m, 0, 0.44, 0, w, 0.05, 0.36);
  for (const sx of [-1, 1]) {
    B.box(m, sx * (w / 2 - 0.06), 0.22, 0, 0.05, 0.44, 0.32);
  }
  B.box(m, 0, 0.12, 0, w - 0.1, 0.04, 0.04);
  if (o.back) {
    B.box(m, 0, 0.82, -0.16, w, 0.5, 0.04);
  }
}

// ----------------------------------------------------------------- beds
export function bed(B, o = {}) {
  const w = o.w ?? 1.45;
  const l = o.l ?? 2.05;
  const wood = o.wood ?? 'woodDark';
  const sheet = o.sheet ?? 'linen';
  const iron = o.iron;
  const frameMat = iron ? 'ironBlack' : wood;
  // frame
  B.box(frameMat, 0, 0.32, l / 2, w, 0.18, l - 0.1);
  B.box(sheet, 0, 0.5, l / 2 + 0.02, w - 0.06, 0.2, l - 0.18);
  // blanket and pillows
  B.box(o.blanket ?? 'velvet', 0, 0.62, l / 2 + 0.28, w - 0.02, 0.06, l - 0.7);
  for (const s of [-1, 1]) {
    if (w < 1 && s > 0) continue;
    B.sphere(sheet, w < 1 ? 0 : s * w * 0.24, 0.66, 0.32, 0.3, 1, 0.26, 0.55);
  }
  if (iron) {
    for (const [z, h] of [
      [0.02, 1.35],
      [l - 0.02, 0.95],
    ]) {
      for (const sx of [-1, 1]) {
        B.rod('ironBlack', sx * (w / 2), 0, z, sx * (w / 2), h, z, 0.02, 0.02, 6);
        B.sphere('brass', sx * (w / 2), h + 0.02, z, 0.035);
      }
      B.rod('ironBlack', -w / 2, h - 0.08, z, w / 2, h - 0.08, z, 0.015, 0.015, 5);
      B.rod('ironBlack', -w / 2, 0.45, z, w / 2, 0.45, z, 0.015, 0.015, 5);
      for (let i = 1; i < 8; i++) {
        const x = -w / 2 + (i / 8) * w;
        B.rod('ironBlack', x, 0.45, z, x, h - 0.08, z, 0.008, 0.008, 4);
      }
    }
    return;
  }
  // headboard and footboard
  const hb = new THREE.Shape();
  hb.moveTo(-w / 2, 0);
  hb.lineTo(w / 2, 0);
  hb.lineTo(w / 2, 1.2);
  hb.quadraticCurveTo(w / 4, 1.45, 0, 1.62);
  hb.quadraticCurveTo(-w / 4, 1.45, -w / 2, 1.2);
  hb.closePath();
  B.shape({ front: wood, back: wood, side: wood }, hb, 0.06, mat(0, 0.2, 0.0));
  B.box(wood, 0, 0.55, l - 0.03, w, 0.7, 0.05);
  if (o.posts) {
    const ph = o.canopy ? 2.35 : 1.4;
    for (const [sx, z] of [
      [-1, 0.03],
      [1, 0.03],
      [-1, l - 0.03],
      [1, l - 0.03],
    ]) {
      B.lathe(
        wood,
        [
          [0, 0],
          [0.06, 0],
          [0.06, 0.55],
          [0.04, 0.65],
          [0.035, ph - 0.2],
          [0.05, ph - 0.1],
          [0.03, ph],
          [0, ph + 0.05],
        ],
        8,
        mat(sx * (w / 2 + 0.03), 0, z)
      );
    }
    if (o.canopy) {
      const ch = 2.3;
      B.box(wood, 0, ch, 0.03, w + 0.1, 0.12, 0.06);
      B.box(wood, 0, ch, l - 0.03, w + 0.1, 0.12, 0.06);
      B.box(wood, -w / 2 - 0.03, ch, l / 2, 0.06, 0.12, l);
      B.box(wood, w / 2 + 0.03, ch, l / 2, 0.06, 0.12, l);
      B.box(o.canopy, 0, ch + 0.07, l / 2, w + 0.1, 0.02, l);
      // drapes gathered at the posts
      for (const [sx, z] of [
        [-1, 0.1],
        [1, 0.1],
        [-1, l - 0.1],
        [1, l - 0.1],
      ]) {
        const g = new THREE.CylinderGeometry(0.12, 0.2, ch - 0.1, 10, 1, true);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const a = Math.atan2(p.getZ(i), p.getX(i));
          const k = 1 + Math.sin(a * 6) * 0.12;
          p.setX(i, p.getX(i) * k);
          p.setZ(i, p.getZ(i) * k);
        }
        g.computeVertexNormals();
        B.geom(o.canopy, g, mat(sx * (w / 2 + 0.06), (ch - 0.1) / 2 + 0.05, z), { worldUV: true });
        g.dispose();
      }
    }
  }
}

export function crib(B, o = {}) {
  const m = o.mat ?? 'woodLight';
  const w = 0.7;
  const l = 1.25;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) B.box(m, sx * w / 2, 0.5, sz * l / 2, 0.05, 1.0, 0.05);
  }
  for (const y of [0.35, 0.95]) {
    B.box(m, 0, y, -l / 2, w, 0.04, 0.03);
    B.box(m, 0, y, l / 2, w, 0.04, 0.03);
    B.box(m, -w / 2, y, 0, 0.03, 0.04, l);
    B.box(m, w / 2, y, 0, 0.03, 0.04, l);
  }
  for (let i = 1; i < 12; i++) {
    const z = -l / 2 + (i / 12) * l;
    for (const sx of [-1, 1]) B.box(m, sx * w / 2, 0.65, z, 0.02, 0.6, 0.02);
  }
  B.box(o.sheet ?? 'linen', 0, 0.4, 0, w - 0.06, 0.08, l - 0.06);
}

// --------------------------------------------------------------- storage
export function wardrobe(B, o = {}) {
  const w = o.w ?? 1.2;
  const h = o.h ?? 2.2;
  const d = o.d ?? 0.6;
  const m = o.mat ?? 'woodDark';
  B.box(m, 0, h / 2 + 0.1, 0, w, h, d);
  B.box(m, 0, h + 0.16, 0.02, w + 0.1, 0.12, d + 0.08);
  B.box(m, 0, 0.05, 0, w + 0.04, 0.1, d + 0.04);
  for (const sx of [-1, 1]) {
    B.box(m, sx * (w / 4), h / 2 + 0.25, d / 2 + 0.01, w / 2 - 0.08, h - 0.5, 0.02);
    B.sphere('brass', sx * 0.06, h / 2 + 0.1, d / 2 + 0.03, 0.022);
  }
  B.box(m, 0, 0.32, d / 2 + 0.01, w - 0.1, 0.32, 0.02);
}

export function dresser(B, o = {}) {
  const w = o.w ?? 1.1;
  const h = o.h ?? 0.95;
  const d = o.d ?? 0.5;
  const m = o.mat ?? 'woodDark';
  B.box(m, 0, h / 2 + 0.06, 0, w, h - 0.06, d);
  B.box(o.top ?? m, 0, h + 0.02, 0.01, w + 0.06, 0.04, d + 0.04);
  const rows = o.rows ?? 4;
  for (let i = 0; i < rows; i++) {
    const y = 0.16 + ((i + 0.5) * (h - 0.2)) / rows;
    B.box(m, 0, y, d / 2 + 0.01, w - 0.08, (h - 0.2) / rows - 0.03, 0.015);
    for (const sx of [-1, 1]) B.sphere('brass', sx * w * 0.25, y, d / 2 + 0.03, 0.018);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl(m, sx * (w / 2 - 0.05), 0.04, sz * (d / 2 - 0.05), 0.03, 0.025, 0.08, 6);
  return h + 0.04;
}

export function sideboard(B, o = {}) {
  const top = dresser(B, { w: o.w ?? 1.8, h: 0.92, d: 0.55, rows: 2, top: o.top ?? 'marble' });
  if (o.mirror) {
    const mw = (o.w ?? 1.8) * 0.8;
    B.box('woodDark', 0, top + 0.65, -0.24, mw + 0.12, 1.3, 0.05);
    B.box('glassDark', 0, top + 0.65, -0.21, mw - 0.06, 1.12, 0.01);
  }
  return top;
}

export function bookshelf(B, o = {}) {
  const w = o.w ?? 1.2;
  const h = o.h ?? 2.4;
  const d = o.d ?? 0.38;
  const m = o.mat ?? 'woodDark';
  const rows = o.rows ?? 6;
  B.box(m, -w / 2 + 0.02, h / 2, 0, 0.04, h, d);
  B.box(m, w / 2 - 0.02, h / 2, 0, 0.04, h, d);
  B.box(m, 0, h / 2, -d / 2 + 0.01, w, h, 0.02);
  B.box(m, 0, h + 0.05, 0.02, w + 0.08, 0.1, d + 0.06);
  const sh = (h - 0.12) / rows;
  const rng = o.rng;
  for (let i = 0; i <= rows; i++) {
    const y = 0.1 + i * sh;
    B.box(m, 0, y, 0, w - 0.06, 0.03, d - 0.02);
    if (i === rows) break;
    // books as a block whose front shows the spines texture
    const bh = sh * (rng ? rng.float(0.7, 0.9) : 0.8);
    const gap = rng && rng.chance(0.3) ? rng.float(0.1, 0.35) : 0;
    const bw = w - 0.1 - gap;
    const u0 = rng ? rng.float(0, 1) : 0;
    const row = rng ? rng.int(0, 3) : i % 4;
    const v0 = 1 - (row + 1) / 4;
    const uv = [u0, v0, u0 + bw / 1.2, v0, u0 + bw / 1.2, v0 + 0.24, u0, v0 + 0.24];
    if (o.empty && rng && rng.chance(0.5)) continue;
    B.box({ pz: 'books', all: 'woodDark' }, -gap / 2, y + 0.015 + bh / 2, 0.02, bw, bh, d - 0.08, 0, { uv: { pz: uv } });
    if (gap > 0.15) {
      // a few books leaning in the gap
      B.push(mat(w / 2 - 0.05 - gap / 2, y + 0.015, 0.02, 0, 0, 0.35));
      B.box({ all: 'woodDark', px: 'books', nx: 'books' }, 0, bh / 2, 0, 0.04, bh, d - 0.12);
      B.pop();
    }
  }
}

export function chest(B, o = {}) {
  const w = o.w ?? 0.9;
  const d = o.d ?? 0.5;
  const h = o.h ?? 0.45;
  const m = o.mat ?? 'woodDark';
  B.box(m, 0, h / 2, 0, w, h, d);
  B.cyl(m, 0, h, 0, d / 2, d / 2, w, 12, { rz: Math.PI / 2, thetaLength: Math.PI });
  for (const x of [-w * 0.32, w * 0.32]) {
    B.box('ironBlack', x, h / 2, 0, 0.05, h + 0.005, d + 0.01);
    B.cyl('ironBlack', x, h, 0, d / 2 + 0.006, d / 2 + 0.006, 0.05, 12, { rz: Math.PI / 2 });
  }
  B.box('brass', 0, h - 0.04, d / 2 + 0.01, 0.08, 0.1, 0.02);
}

export function crate(B, o = {}) {
  const s = o.s ?? 0.6;
  const m = o.mat ?? 'woodRough';
  B.box(m, 0, s / 2, 0, s, s, s);
  for (const y of [0.06, s - 0.06]) {
    B.box(m, 0, y, s / 2 + 0.01, s, 0.08, 0.02);
    B.box(m, 0, y, -s / 2 - 0.01, s, 0.08, 0.02);
  }
}

export function barrel(B, o = {}) {
  const h = o.h ?? 0.9;
  const m = o.mat ?? 'woodRough';
  B.lathe(
    m,
    [
      [0, 0],
      [0.25, 0],
      [0.3, h * 0.3],
      [0.31, h * 0.5],
      [0.3, h * 0.7],
      [0.25, h],
      [0, h],
    ],
    14
  );
  for (const y of [0.1, h * 0.35, h * 0.65, h - 0.1]) B.cyl('ironBlack', 0, y, 0, 0.3 * (y > 0.2 && y < h - 0.2 ? 1.02 : 0.88), 0.3 * (y > 0.2 && y < h - 0.2 ? 1.02 : 0.88), 0.04, 14, { open: true });
}

// --------------------------------------------------------------- fixtures
export function fireplace(B, o = {}) {
  // local z = 0 is the wall surface; +z points into the room
  const w = o.w ?? 1.7;
  const h = o.h ?? 1.3;
  const m = o.mat ?? 'marble';
  const ow = w * 0.52;
  const oh = h * 0.68;
  const bd = o.breast ? 0.45 : 0.42;
  if (o.breast) {
    const bw = w + 0.5;
    const bh = o.breastH;
    B.box(o.breast, -(bw / 2 + ow / 2) / 2, bh / 2, bd / 2, bw / 2 - ow / 2, bh, bd);
    B.box(o.breast, (bw / 2 + ow / 2) / 2, bh / 2, bd / 2, bw / 2 - ow / 2, bh, bd);
    B.box(o.breast, 0, (oh + bh) / 2, bd / 2, ow, bh - oh, bd);
  }
  // surround with an arched opening
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(w / 2, h);
  sh.lineTo(-w / 2, h);
  sh.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-ow / 2, 0);
  hole.lineTo(ow / 2, 0);
  hole.lineTo(ow / 2, oh - ow / 2 + 0.12);
  hole.absarc(0, oh - ow / 2 + 0.12, ow / 2, 0, Math.PI, false);
  hole.lineTo(-ow / 2, 0);
  sh.holes.push(hole);
  B.shape({ front: m, back: null, side: m }, sh, 0.12, mat(0, 0, bd), { curveSegments: 14 });
  // firebox (faces point inward)
  hollow(B, 'blackMatte', 0, oh / 2, bd - 0.2, ow, oh, 0.4);
  B.box('brick', 0, 0.02, bd - 0.2, ow, 0.04, 0.38);
  // mantel shelf
  B.box(m, 0, h + 0.04, bd + 0.06, w + 0.2, 0.08, 0.32);
  B.box(m, 0, h - 0.08, bd + 0.1, w + 0.06, 0.12, 0.08);
  // hearth
  B.box(o.hearth ?? 'tileChecker', 0, 0.015, bd + 0.4, w + 0.3, 0.03, 0.55);
  // grate with coals
  for (let i = 0; i < 6; i++) B.cyl('castIron', -0.3 + i * 0.12, 0.18, bd - 0.12, 0.012, 0.012, 0.3, 4);
  B.box('castIron', 0, 0.06, bd - 0.12, 0.7, 0.05, 0.3);
  B.box('coal', 0, 0.12, bd - 0.14, 0.6, 0.08, 0.24);
  return { fire: worldOf(B, 0, 0.12, bd - 0.14), mantelY: h + 0.08, front: bd + 0.12, local: { fireZ: bd - 0.14 } };
}

export function piano(B, o = {}) {
  const m = o.mat ?? 'lacquer';
  B.box(m, 0, 0.65, -0.12, 1.5, 1.3, 0.34);
  B.box(m, 0, 0.73, 0.15, 1.5, 0.06, 0.32);
  B.box(m, 0, 0.62, 0.15, 1.42, 0.16, 0.3);
  B.box({ py: 'keys', all: m }, 0, 0.77, 0.16, 1.24, 0.03, 0.17, 0, { uv: { py: [0, 0, 1, 0, 1, 1, 0, 1] } });
  for (const sx of [-1, 1]) {
    B.box(m, sx * 0.72, 0.8, 0.16, 0.06, 0.12, 0.32);
    B.lathe(
      m,
      [
        [0, 0],
        [0.035, 0],
        [0.03, 0.2],
        [0.045, 0.35],
        [0.03, 0.55],
        [0, 0.55],
      ],
      8,
      mat(sx * 0.66, 0, 0.27)
    );
  }
  B.box(m, 0, 0.95, 0.03, 1.42, 0.3, 0.04);
  B.box(m, 0, 0.12, 0.08, 1.4, 0.06, 0.2);
  for (const x of [-0.12, 0.0, 0.12]) B.box('brass', x, 0.11, 0.2, 0.03, 0.01, 0.06);
  // candle sconces on the front
  return [worldOf(B, -0.55, 1.1, 0.12), worldOf(B, 0.55, 1.1, 0.12)];
}

export function clock(B, o = {}) {
  const m = o.mat ?? 'woodDark';
  B.box(m, 0, 0.25, 0, 0.6, 0.5, 0.36);
  B.box(m, 0, 1.15, -0.02, 0.48, 1.3, 0.3);
  B.box('glass', 0, 1.15, 0.135, 0.3, 1.0, 0.01);
  B.box(m, 0, 2.05, 0, 0.58, 0.55, 0.36);
  B.box({ pz: 'clock', all: m }, 0, 2.05, 0.185, 0.38, 0.38, 0.01, 0, { uv: { pz: [0, 0, 1, 0, 1, 1, 0, 1] } });
  const hood = new THREE.Shape();
  hood.moveTo(-0.32, 0);
  hood.lineTo(0.32, 0);
  hood.quadraticCurveTo(0.2, 0.32, 0, 0.3);
  hood.quadraticCurveTo(-0.2, 0.32, -0.32, 0);
  B.shape({ front: m, back: m, side: m }, hood, 0.38, mat(0, 2.32, -0.19));
  for (const sx of [-0.2, 0, 0.2]) B.sphere('brass', sx, 2.66 - Math.abs(sx) * 0.4, 0, 0.03);
  return {
    face: worldOf(B, 0, 2.05, 0.2),
    pendulum: worldOf(B, 0, 1.62, 0.04),
  };
}

export function candle(B, h = 0.18, r = 0.018) {
  B.cyl('candle', 0, h / 2, 0, r, r * 1.05, h, 8);
  return worldOf(B, 0, h + 0.008, 0);
}

export function candlestick(B, o = {}) {
  const m = o.mat ?? 'brass';
  B.lathe(
    m,
    [
      [0, 0],
      [0.06, 0],
      [0.055, 0.02],
      [0.02, 0.05],
      [0.015, 0.16],
      [0.025, 0.2],
      [0.012, 0.24],
      [0.03, 0.25],
      [0, 0.25],
    ],
    10
  );
  B.push(mat(0, 0.25, 0));
  const p = candle(B, o.h ?? 0.16);
  B.pop();
  return p;
}

export function candelabra(B, o = {}) {
  const m = o.mat ?? 'brass';
  const arms = o.arms ?? 5;
  B.lathe(
    m,
    [
      [0, 0],
      [0.09, 0],
      [0.08, 0.03],
      [0.025, 0.08],
      [0.018, 0.3],
      [0.03, 0.34],
      [0.015, 0.38],
      [0, 0.38],
    ],
    10
  );
  const out = [];
  const r = 0.17;
  for (let i = 0; i < arms - 1; i++) {
    const a = (i / (arms - 1)) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    B.rod(m, 0, 0.3, 0, x, 0.36, z, 0.008, 0.008, 4);
    B.cyl(m, x, 0.37, z, 0.022, 0.012, 0.03, 8);
    B.push(mat(x, 0.385, z));
    out.push(candle(B, 0.12 + (i % 2) * 0.03, 0.014));
    B.pop();
  }
  B.push(mat(0, 0.39, 0));
  out.push(candle(B, 0.17, 0.016));
  B.pop();
  return out;
}

export function oilLamp(B, o = {}) {
  B.lathe(
    o.mat ?? 'brass',
    [
      [0, 0],
      [0.07, 0],
      [0.03, 0.06],
      [0.025, 0.14],
      [0.08, 0.2],
      [0.06, 0.26],
      [0.025, 0.28],
      [0, 0.28],
    ],
    12
  );
  B.lathe(
    'glass',
    [
      [0.025, 0.28],
      [0.045, 0.34],
      [0.03, 0.42],
      [0.025, 0.5],
    ],
    10
  );
  return worldOf(B, 0, 0.32, 0);
}

export function rug(B, x, z, y, w, l, key, ry = 0) {
  B.push(mat(x, y, z, ry));
  B.quad(key, V(-w / 2, 0, l / 2), V(w / 2, 0, l / 2), V(w / 2, 0, -l / 2), V(-w / 2, 0, -l / 2), [0, 0, 1, 0, 1, 1, 0, 1]);
  B.pop();
}

// Framed picture. Uses explicit 0..1 UVs for the canvas.
export function painting(B, w, h, key, o = {}) {
  const f = o.frame ?? 'gilt';
  const fw = o.fw ?? 0.07;
  B.quad(key, V(-w / 2, -h / 2, 0.012), V(w / 2, -h / 2, 0.012), V(w / 2, h / 2, 0.012), V(-w / 2, h / 2, 0.012), [0, 0, 1, 0, 1, 1, 0, 1]);
  B.box(f, 0, h / 2 + fw / 2, 0.02, w + fw * 2, fw, 0.05);
  B.box(f, 0, -h / 2 - fw / 2, 0.02, w + fw * 2, fw, 0.05);
  B.box(f, -w / 2 - fw / 2, 0, 0.02, fw, h, 0.05);
  B.box(f, w / 2 + fw / 2, 0, 0.02, fw, h, 0.05);
  B.box('woodDark', 0, 0, 0.004, w, h, 0.008);
}

export function coatRack(B, o = {}) {
  B.lathe(
    'woodDark',
    [
      [0, 0],
      [0.2, 0],
      [0.2, 0.04],
      [0.04, 0.08],
      [0.025, 1.7],
      [0.04, 1.76],
      [0, 1.8],
    ],
    8
  );
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    B.rod('woodDark', 0, 1.62, 0, Math.cos(a) * 0.18, 1.72, Math.sin(a) * 0.18, 0.012, 0.012, 4);
  }
  if (o.coat) {
    // a long dark coat and hat: from a distance it reads as a person
    B.lathe(
      'blackCloth',
      [
        [0.04, 1.72],
        [0.17, 1.6],
        [0.21, 1.4],
        [0.2, 1.0],
        [0.24, 0.45],
        [0.26, 0.4],
      ],
      12,
      mat(0, 0, 0.05, 0, 0, 0, 1, 1, 0.75)
    );
    B.cyl('blackCloth', 0, 1.84, 0.02, 0.11, 0.11, 0.18, 12);
    B.cyl('blackCloth', 0, 1.76, 0.02, 0.2, 0.2, 0.015, 14);
  }
}

export function vase(B, o = {}) {
  B.lathe(
    o.mat ?? 'porcelain',
    [
      [0, 0],
      [0.06, 0],
      [0.1, 0.1],
      [0.08, 0.22],
      [0.04, 0.3],
      [0.055, 0.34],
      [0, 0.34],
    ],
    12
  );
  if (o.flowers !== false) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const x = Math.cos(a) * 0.12;
      const z = Math.sin(a) * 0.12;
      B.rod('bark', 0, 0.3, 0, x * 1.4, 0.62 + (i % 3) * 0.05, z * 1.4, 0.004, 0.003, 3);
      B.sphere('straw', x * 1.4, 0.64 + (i % 3) * 0.05, z * 1.4, 0.025, 1, 0.6, 1, 6, 4);
    }
  }
}

export function plate(B, x, y, z) {
  B.cyl('porcelain', x, y + 0.008, z, 0.12, 0.09, 0.016, 16);
}

export function goblet(B, x, y, z) {
  B.lathe(
    'silver',
    [
      [0, 0],
      [0.035, 0],
      [0.006, 0.02],
      [0.005, 0.09],
      [0.035, 0.12],
      [0.04, 0.18],
      [0.0, 0.17],
    ],
    10,
    mat(x, y, z)
  );
}

export function globe(B) {
  B.lathe(
    'woodDark',
    [
      [0, 0],
      [0.22, 0],
      [0.05, 0.08],
      [0.04, 0.7],
      [0, 0.72],
    ],
    10
  );
  B.sphere('parchment', 0, 1.02, 0, 0.26, 1, 1, 1, 18, 12);
  const ring = new THREE.TorusGeometry(0.29, 0.012, 5, 28);
  B.geom('brass', ring, mat(0, 1.02, 0, 0, 0, 0.4));
  ring.dispose();
}

export function desk(B, o = {}) {
  const w = o.w ?? 1.4;
  const m = o.mat ?? 'woodDark';
  B.box(m, 0, 0.75, 0, w, 0.05, 0.7);
  for (const sx of [-1, 1]) {
    B.box(m, sx * (w / 2 - 0.22), 0.37, 0, 0.42, 0.72, 0.64);
    for (let i = 0; i < 3; i++) {
      B.box(m, sx * (w / 2 - 0.22), 0.14 + i * 0.22, 0.325, 0.36, 0.18, 0.015);
      B.sphere('brass', sx * (w / 2 - 0.22), 0.14 + i * 0.22, 0.34, 0.015);
    }
  }
  B.box({ py: 'velvetGreen', all: m }, 0, 0.778, 0.02, w - 0.2, 0.006, 0.5);
}

export function dressForm(B, o = {}) {
  B.lathe(
    'woodDark',
    [
      [0, 0],
      [0.22, 0],
      [0.22, 0.03],
      [0.03, 0.06],
      [0.02, 0.9],
      [0, 0.9],
    ],
    8
  );
  B.lathe(
    o.mat ?? 'dressForm',
    [
      [0, 0.85],
      [0.12, 0.88],
      [0.16, 1.0],
      [0.13, 1.18],
      [0.17, 1.33],
      [0.16, 1.45],
      [0.07, 1.52],
      [0.04, 1.58],
      [0.05, 1.62],
      [0, 1.64],
    ],
    14,
    mat(0, 0, 0, 0, 0, 0, 1.25, 1, 0.8)
  );
  if (o.skirt) {
    B.lathe(
      o.skirt,
      [
        [0.16, 1.02],
        [0.24, 0.8],
        [0.36, 0.4],
        [0.42, 0.12],
      ],
      16,
      mat(0, 0, 0, 0, 0, 0, 1.1, 1, 0.9),
      { worldUV: true }
    );
  }
}

// A sheet thrown over furniture: soft top, folds down the sides, pooling at the floor.
export function covered(B, w, h, d, rng, key = 'sheet') {
  const g = new THREE.BoxGeometry(w, h, d, 10, 6, 10);
  const p = g.attributes.position;
  const ph = rng.float(0, 6);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const top = (y + h / 2) / h;
    // round off the top edges
    const ex = Math.abs(x) / (w / 2);
    const ez = Math.abs(z) / (d / 2);
    const corner = Math.max(ex, ez);
    if (top > 0.85) y -= Math.pow(Math.max(0, corner - 0.6), 2) * 0.35 * h;
    // sag between the hidden furniture's corners
    if (top > 0.95) y -= (1 - Math.abs(Math.cos(x * 4 + ph))) * 0.04 + Math.sin(z * 6) * 0.015;
    // vertical folds and a flared hem
    const a = Math.atan2(z, x);
    const fold = Math.sin(a * 9 + ph) * 0.035 * (1 - top);
    const flare = 1 + Math.pow(1 - top, 3) * 0.22;
    x = x * flare + Math.cos(a) * fold;
    z = z * flare + Math.sin(a) * fold;
    p.setXYZ(i, x, y + h / 2, z);
  }
  g.computeVertexNormals();
  B.geom(key, g, null, { worldUV: true });
  g.dispose();
}

export function stove(B) {
  const m = 'castIron';
  B.box(m, 0, 0.45, 0, 1.3, 0.75, 0.7);
  B.box(m, 0, 0.85, 0, 1.38, 0.06, 0.76);
  for (const x of [-0.35, 0.25]) {
    B.box(m, x, 0.48, 0.36, 0.42, 0.36, 0.03);
    B.box('brass', x + 0.15, 0.48, 0.385, 0.06, 0.02, 0.02);
  }
  for (const [x, z] of [
    [-0.4, -0.15],
    [0, -0.15],
    [0.4, -0.15],
    [-0.2, 0.15],
    [0.2, 0.15],
  ]) {
    B.cyl(m, x, 0.885, z, 0.12, 0.12, 0.015, 12);
  }
  B.box(m, 0, 1.25, -0.3, 1.3, 0.7, 0.12);
  B.box(m, 0, 1.6, -0.15, 1.36, 0.05, 0.4);
  B.cyl(m, 0.45, 2.6, -0.3, 0.09, 0.09, 2.0, 10);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl(m, sx * 0.58, 0.04, sz * 0.28, 0.04, 0.05, 0.1, 6);
  // a pot and a kettle
  B.cyl('castIron', -0.4, 0.98, -0.15, 0.16, 0.14, 0.2, 14);
  B.lathe(
    'brass',
    [
      [0, 0],
      [0.13, 0],
      [0.15, 0.08],
      [0.12, 0.17],
      [0.03, 0.22],
      [0, 0.22],
    ],
    12,
    mat(0.2, 0.89, 0.15)
  );
}

export function sink(B) {
  B.box('woodDark', 0, 0.42, 0, 1.0, 0.84, 0.55);
  B.box('porcelain', 0, 0.88, 0, 0.9, 0.08, 0.5);
  B.box({ all: 'porcelain', py: 'water' }, 0, 0.86, 0.02, 0.7, 0.04, 0.36);
  B.cyl('castIron', 0.32, 1.08, -0.18, 0.04, 0.05, 0.4, 8);
  B.rod('castIron', 0.32, 1.25, -0.18, 0.32, 1.2, 0.0, 0.015, 0.015, 5);
  B.rod('castIron', 0.32, 1.28, -0.18, 0.55, 1.38, -0.18, 0.012, 0.012, 5);
}

export function tub(B) {
  const g = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  B.geom('porcelain', g, mat(0, 0.58, 0, 0, 0, 0, 0.4, 0.42, 0.85));
  g.dispose();
  const rim = new THREE.TorusGeometry(1, 0.05, 6, 28);
  B.geom('porcelain', rim, mat(0, 0.58, 0, 0, Math.PI / 2, 0, 0.4, 0.85, 1));
  rim.dispose();
  // dark still water
  B.cyl('water', 0, 0.42, 0, 0.36, 0.36, 0.002, 20, { m: mat(0, 0.42, 0, 0, 0, 0, 1, 1, 2.1) });
  for (const [x, z] of [
    [-0.25, -0.6],
    [0.25, -0.6],
    [-0.25, 0.6],
    [0.25, 0.6],
  ]) {
    B.sphere('brass', x, 0.08, z, 0.06, 1, 1.3, 1);
  }
  B.rod('brass', 0, 0.58, -0.82, 0, 0.82, -0.82, 0.015, 0.015, 6);
  B.rod('brass', 0, 0.82, -0.82, 0, 0.78, -0.68, 0.015, 0.012, 6);
}

export function washstand(B) {
  B.box('woodDark', 0, 0.4, 0, 0.9, 0.8, 0.45);
  B.box('marble', 0, 0.82, 0, 0.94, 0.04, 0.48);
  B.lathe(
    'porcelain',
    [
      [0, 0],
      [0.12, 0],
      [0.2, 0.1],
      [0.22, 0.12],
      [0, 0.04],
    ],
    16,
    mat(0, 0.84, 0.02)
  );
  B.lathe(
    'porcelain',
    [
      [0, 0],
      [0.07, 0],
      [0.09, 0.12],
      [0.06, 0.24],
      [0.08, 0.3],
      [0, 0.3],
    ],
    12,
    mat(0.3, 0.84, -0.05)
  );
}

export function toilet(B) {
  B.lathe(
    'porcelain',
    [
      [0, 0],
      [0.14, 0],
      [0.11, 0.2],
      [0.2, 0.38],
      [0.21, 0.42],
      [0, 0.42],
    ],
    14,
    mat(0, 0, 0.1, 0, 0, 0, 1, 1, 1.25)
  );
  B.box('woodDark', 0, 0.44, 0.12, 0.42, 0.03, 0.5);
  B.box('woodDark', 0, 1.9, -0.18, 0.45, 0.28, 0.22);
  B.rod('castIron', 0.12, 1.75, -0.12, 0.12, 0.6, -0.12, 0.015, 0.015, 5);
  B.rod('brass', -0.2, 1.88, -0.08, -0.2, 1.3, -0.04, 0.004, 0.004, 3);
}

export function rockingHorse() {
  // returns a THREE.Group (it moves)
  return null;
}

export function shelfJars(B, rng, o = {}) {
  const w = o.w ?? 1.6;
  const rows = o.rows ?? 4;
  bookshelfFrame(B, w, o.h ?? 1.9, 0.35, rows, o.mat ?? 'woodRough');
  const sh = ((o.h ?? 1.9) - 0.12) / rows;
  for (let r = 0; r < rows; r++) {
    const y = 0.115 + r * sh;
    let x = -w / 2 + 0.12;
    while (x < w / 2 - 0.12) {
      const rr = rng.float(0.05, 0.09);
      const hh = rng.float(0.14, sh - 0.08);
      if (rng.chance(0.82)) {
        const key = rng.pick(['jarGreen', 'jarAmber', 'jarDark']);
        B.cyl(key, x + rr, y + hh / 2, 0, rr, rr, hh, 10);
        B.cyl('blackMatte', x + rr, y + hh + 0.01, 0, rr * 0.7, rr * 0.7, 0.02, 8);
      }
      x += rr * 2 + rng.float(0.01, 0.05);
    }
  }
}

function bookshelfFrame(B, w, h, d, rows, m) {
  B.box(m, -w / 2 + 0.02, h / 2, 0, 0.04, h, d);
  B.box(m, w / 2 - 0.02, h / 2, 0, 0.04, h, d);
  const sh = (h - 0.12) / rows;
  for (let i = 0; i <= rows; i++) B.box(m, 0, 0.1 + i * sh, 0, w - 0.04, 0.03, d);
}

export function wineRack(B, rng, o = {}) {
  const w = o.w ?? 1.8;
  const h = o.h ?? 1.9;
  const cols = Math.floor(w / 0.18);
  const rows = Math.floor(h / 0.18);
  B.box('woodRough', 0, h / 2, -0.2, w, h, 0.03);
  for (let i = 0; i <= cols; i++) B.box('woodRough', -w / 2 + (i * w) / cols, h / 2, 0, 0.02, h, 0.4);
  for (let j = 0; j <= rows; j++) B.box('woodRough', 0, (j * h) / rows, 0, w, 0.02, 0.4);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (!rng.chance(0.62)) continue;
      const x = -w / 2 + ((i + 0.5) * w) / cols;
      const y = ((j + 0.5) * h) / rows;
      B.cyl('jarDark', x, y, 0.05, 0.037, 0.037, 0.3, 8, { rx: Math.PI / 2 });
    }
  }
}

export function coffin(B, key = 'woodDark') {
  // classic six-sided coffin, lid separate
  const sh = new THREE.Shape();
  sh.moveTo(-0.22, 0);
  sh.lineTo(0.22, 0);
  sh.lineTo(0.32, 1.45);
  sh.lineTo(0.26, 2.0);
  sh.lineTo(-0.26, 2.0);
  sh.lineTo(-0.32, 1.45);
  sh.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.18, 0.05);
  hole.lineTo(0.18, 0.05);
  hole.lineTo(0.27, 1.45);
  hole.lineTo(0.22, 1.95);
  hole.lineTo(-0.22, 1.95);
  hole.lineTo(-0.27, 1.45);
  hole.closePath();
  const ring = sh.clone ? sh : sh;
  ring.holes.push(hole);
  B.shape({ front: key, back: key, side: key }, ring, 0.5, mat(0, 0, 1.0, 0, -Math.PI / 2));
  const base = new THREE.Shape();
  base.moveTo(-0.22, 0);
  base.lineTo(0.22, 0);
  base.lineTo(0.32, 1.45);
  base.lineTo(0.26, 2.0);
  base.lineTo(-0.26, 2.0);
  base.lineTo(-0.32, 1.45);
  base.closePath();
  B.shape({ front: 'blackCloth', back: key, side: key }, base, 0.04, mat(0, 0, 1.0, 0, -Math.PI / 2));
}

export function lidShape() {
  const base = new THREE.Shape();
  base.moveTo(-0.23, 0);
  base.lineTo(0.23, 0);
  base.lineTo(0.33, 1.45);
  base.lineTo(0.27, 2.0);
  base.lineTo(-0.27, 2.0);
  base.lineTo(-0.33, 1.45);
  base.closePath();
  return base;
}

export function trestle(B) {
  for (const sx of [-1, 1]) {
    B.push(mat(0, 0, sx * 0.6));
    for (const s of [-1, 1]) {
      B.push(mat(s * 0.18, 0.28, 0, 0, 0, s * 0.3));
      B.box('woodRough', 0, 0, 0, 0.05, 0.6, 0.05);
      B.pop();
    }
    B.box('woodRough', 0, 0.55, 0, 0.6, 0.06, 0.08);
    B.pop();
  }
}

export function furnace(B) {
  B.lathe(
    'castIron',
    [
      [0, 0],
      [0.75, 0],
      [0.78, 0.1],
      [0.72, 0.2],
      [0.72, 1.4],
      [0.6, 1.62],
      [0.3, 1.75],
      [0, 1.78],
    ],
    20
  );
  // ducts spreading to the ceiling
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 2.4;
    const z = Math.sin(a) * 2.4;
    B.rod('castIron', 0, 1.6, 0, x * 0.4, 2.25, z * 0.4, 0.1, 0.09, 10);
    B.rod('castIron', x * 0.4, 2.25, z * 0.4, x, 2.35, z, 0.09, 0.08, 10);
  }
  B.box('castIron', 0, 0.55, 0.72, 0.5, 0.45, 0.08);
  return worldOf(B, 0, 0.5, 0.78);
}

export function workbench(B) {
  B.box('woodRough', 0, 0.86, 0, 2.2, 0.08, 0.75);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('woodRough', sx * 1.0, 0.42, sz * 0.3, 0.08, 0.84, 0.08);
  B.box('woodRough', 0, 0.2, 0, 2.0, 0.04, 0.6);
  B.box('woodRough', 0, 1.4, -0.36, 2.2, 1.0, 0.03);
  // hanging tools
  for (let i = 0; i < 7; i++) {
    const x = -0.9 + i * 0.3;
    B.box('castIron', x, 1.45 - (i % 3) * 0.08, -0.33, 0.04, 0.3 + (i % 2) * 0.12, 0.02);
  }
  B.box('castIron', 0.6, 0.95, 0.1, 0.3, 0.1, 0.12);
  B.cyl('castIron', -0.5, 0.95, 0.05, 0.08, 0.08, 0.12, 10);
}

export function spinningWheel(B) {
  B.box('woodLight', 0, 0.5, 0, 0.8, 0.06, 0.2);
  for (const [x, z] of [
    [-0.35, -0.08],
    [-0.35, 0.08],
    [0.35, 0],
  ]) {
    B.rod('woodLight', x, 0.5, z, x * 1.2, 0, z * 1.6, 0.02, 0.02, 5);
  }
  B.rod('woodLight', -0.15, 0.5, 0, -0.15, 0.95, 0, 0.02, 0.02, 5);
  const wheel = new THREE.TorusGeometry(0.35, 0.02, 5, 26);
  B.geom('woodLight', wheel, mat(-0.15, 0.95, 0, Math.PI / 2));
  wheel.dispose();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    B.rod('woodLight', -0.15, 0.95 - Math.cos(a) * 0.34, -Math.sin(a) * 0.34 * 0, -0.15, 0.95 + Math.cos(a) * 0.34, 0, 0.008, 0.008, 3);
    B.rod('woodLight', -0.15, 0.95 - Math.sin(a) * 0.34, Math.cos(a) * 0.34, -0.15, 0.95 + Math.sin(a) * 0.34, -Math.cos(a) * 0.34, 0.008, 0.008, 3);
  }
  B.rod('woodLight', 0.3, 0.5, 0, 0.32, 0.9, 0, 0.018, 0.018, 5);
}

export function sewingMachine(B) {
  B.box('woodDark', 0, 0.75, 0, 0.9, 0.04, 0.45);
  for (const sx of [-1, 1]) {
    B.box('castIron', sx * 0.38, 0.37, 0, 0.04, 0.74, 0.4);
  }
  const wheel = new THREE.TorusGeometry(0.2, 0.02, 5, 20);
  B.geom('castIron', wheel, mat(0.38, 0.3, 0, Math.PI / 2));
  wheel.dispose();
  B.box('castIron', 0, 0.12, 0, 0.6, 0.03, 0.25);
  B.box('lacquer', -0.05, 0.86, 0, 0.36, 0.16, 0.12);
  B.box('lacquer', 0.15, 0.95, 0, 0.12, 0.3, 0.12);
  B.box('lacquer', -0.12, 1.05, 0, 0.4, 0.1, 0.1);
  B.box('lacquer', -0.3, 0.92, 0, 0.06, 0.2, 0.08);
}

export function birdcage(B) {
  B.lathe(
    'brass',
    [
      [0, 0],
      [0.2, 0],
      [0.03, 0.06],
      [0.02, 1.2],
      [0, 1.2],
    ],
    8
  );
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * 0.2;
    const z = Math.sin(a) * 0.2;
    B.rod('brass', x, 1.2, z, x, 1.55, z, 0.004, 0.004, 3);
    B.rod('brass', x, 1.55, z, x * 0.3, 1.72, z * 0.3, 0.004, 0.004, 3);
  }
  const ring = new THREE.TorusGeometry(0.2, 0.008, 4, 20);
  for (const y of [1.2, 1.38, 1.55]) B.geom('brass', ring, mat(0, y, 0, 0, Math.PI / 2));
  ring.dispose();
  B.sphere('brass', 0, 1.74, 0, 0.03);
}

export function deerHead(B) {
  B.box('woodDark', 0, 0, 0, 0.36, 0.46, 0.05);
  B.sphere('dressForm', 0, 0.02, 0.18, 0.12, 0.9, 1.1, 1.4);
  B.sphere('dressForm', 0, -0.08, 0.36, 0.07, 0.8, 0.8, 1.6);
  for (const s of [-1, 1]) {
    B.sphere('lacquer', s * 0.07, 0.07, 0.3, 0.018);
    B.rod('bone', s * 0.06, 0.14, 0.14, s * 0.26, 0.44, 0.08, 0.018, 0.01, 4);
    B.rod('bone', s * 0.18, 0.32, 0.11, s * 0.12, 0.52, 0.14, 0.012, 0.006, 4);
    B.rod('bone', s * 0.24, 0.42, 0.09, s * 0.36, 0.56, 0.05, 0.01, 0.005, 4);
    B.sphere('dressForm', s * 0.11, 0.12, 0.1, 0.04, 0.5, 1, 0.3);
  }
}

export function bellJarBird(B) {
  B.cyl('woodDark', 0, 0.03, 0, 0.16, 0.18, 0.06, 16);
  B.lathe(
    'glass',
    [
      [0.15, 0.06],
      [0.15, 0.42],
      [0.1, 0.52],
      [0, 0.55],
    ],
    16
  );
  B.rod('bark', -0.08, 0.06, 0, 0.06, 0.2, 0.02, 0.01, 0.006, 4);
  B.sphere('blackMatte', 0.0, 0.25, 0, 0.055, 1.5, 1, 1);
  B.sphere('blackMatte', 0.07, 0.31, 0, 0.035);
  B.cyl('blackMatte', 0.11, 0.31, 0, 0.0, 0.012, 0.05, 4, { rz: Math.PI / 2 });
}

export function bookPile(B, rng, n = 4) {
  let y = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.float(0.18, 0.28);
    const d = rng.float(0.13, 0.2);
    const h = rng.float(0.03, 0.07);
    B.push(mat(rng.float(-0.03, 0.03), y, rng.float(-0.03, 0.03), rng.float(-0.4, 0.4)));
    B.box(rng.pick(['books', 'woodDark', 'velvet', 'velvetGreen']), 0, h / 2, 0, w, h, d);
    B.box('paperWhite', 0.004, h / 2, 0, w - 0.02, h - 0.012, d + 0.002);
    B.pop();
    y += h;
  }
}

export function hatbox(B, rng) {
  B.cyl(rng.pick(['velvet', 'linen', 'velvetGreen']), 0, 0.12, 0, 0.2, 0.2, 0.24, 14);
  B.cyl('paperWhite', 0, 0.25, 0, 0.21, 0.21, 0.03, 14);
}

export function frameStack(B, rng) {
  for (let i = 0; i < 4; i++) {
    const w = rng.float(0.5, 0.9);
    const h = rng.float(0.6, 1.0);
    B.push(mat(0, 0, i * 0.06, 0, -0.18));
    B.box('gilt', 0, h / 2, 0, w, h, 0.05);
    B.pop();
  }
}
