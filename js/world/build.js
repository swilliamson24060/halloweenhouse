import * as THREE from 'three';
import { mat } from '../core/geo.js';
import { INT } from './layout.js';

// Construction helpers shared by the house, the rooms and the grounds.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Wall frame: origin (x1,z1), along u, side A faces n = (-uz, ux).
export function wallFrame(x1, z1, x2, z2, t) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const L = Math.hypot(dx, dz);
  const ux = dx / L;
  const uz = dz / L;
  return { x1, z1, x2, z2, L, ux, uz, nx: -uz, nz: ux, t, ry: Math.atan2(-uz, ux), ang: Math.atan2(uz, ux) };
}

// Point on a wall: s along it, y up, k along the A normal.
export function wallPoint(W, s, y, k = 0) {
  return V(W.x1 + W.ux * s + W.nx * k, y, W.z1 + W.uz * s + W.nz * k);
}

function solidRanges(L, ops, test) {
  const res = [];
  let s = 0;
  for (const op of ops) {
    if (!test(op)) continue;
    if (op.s0 > s) res.push([s, op.s0]);
    s = Math.max(s, op.s1);
  }
  if (s < L) res.push([s, L]);
  return res;
}

/**
 * Wall with openings. o = {
 *   t, a, b, edge,              materials for side A, side B and reveals
 *   openings: [{ at, w, y0, y1, kind: 'window'|'door'|'arch'|'open' }],
 *   collide (default true), base: {a,b,h}, crown: {a,b,y}, wainscot: {a?,b?,h},
 * }
 */
export function wall(ctx, B, x1, z1, x2, z2, y0, y1, o = {}) {
  const t = o.t ?? INT;
  const W = wallFrame(x1, z1, x2, z2, t);
  const keys = {
    pz: o.a ?? null,
    nz: o.b ?? null,
    px: o.edge ?? o.a ?? o.b,
    nx: o.edge ?? o.a ?? o.b,
    py: o.edgeTop ?? o.edge ?? o.a ?? o.b,
    ny: o.edge ?? o.a ?? o.b,
  };
  const ops = (o.openings || [])
    .map((op) => ({ kind: 'window', ...op, s0: op.at - op.w / 2, s1: op.at + op.w / 2 }))
    .sort((p, q) => p.s0 - q.s0);
  const pieces = [];
  let s = 0;
  for (const op of ops) {
    if (op.s0 > s) pieces.push([s, op.s0, y0, y1]);
    if (op.y0 > y0 + 1e-4) pieces.push([op.s0, op.s1, y0, op.y0]);
    if (op.y1 < y1 - 1e-4) pieces.push([op.s0, op.s1, op.y1, y1]);
    s = op.s1;
  }
  if (s < W.L - 1e-4) pieces.push([s, W.L, y0, y1]);
  for (const [s0, s1, ya, yb] of pieces) {
    const cs = (s0 + s1) / 2;
    const cx = x1 + W.ux * cs;
    const cz = z1 + W.uz * cs;
    let k = keys;
    if (o.ends && (s0 < 1e-4 || s1 > W.L - 1e-4)) {
      k = { ...keys };
      if (s0 < 1e-4) k.nx = o.ends;
      if (s1 > W.L - 1e-4) k.px = o.ends;
    }
    B.box(k, cx, (ya + yb) / 2, cz, s1 - s0, yb - ya, t, W.ry);
    if (o.collide !== false) ctx.col.addOBB(cx, cz, (s1 - s0) / 2, t / 2, W.ang, ya, yb);
  }
  if (o.collide !== false) {
    for (const op of ops) {
      if (op.kind === 'window') {
        const c = ctx.col.addOBB(x1 + W.ux * op.at, z1 + W.uz * op.at, op.w / 2, t / 2, W.ang, op.y0, op.y1);
        c.see = true;
      }
    }
  }
  // trims along the floor / ceiling / dado
  const fy = o.floorY ?? y0;
  const floorOps = (op) => op.kind !== 'window' || op.y0 < fy + 0.25;
  for (const side of ['a', 'b']) {
    const sign = side === 'a' ? 1 : -1;
    if (o.base && o.base[side]) {
      const h = o.base.h ?? 0.2;
      for (const [r0, r1] of solidRanges(W.L, ops, floorOps)) {
        const cs = (r0 + r1) / 2;
        const p = wallPoint(W, cs, fy + h / 2, sign * (t / 2 + 0.012));
        B.box(o.base[side], p.x, p.y, p.z, r1 - r0, h, 0.024, W.ry);
      }
    }
    if (o.wainscot && o.wainscot[side]) {
      const h = o.wainscot.h ?? 1.0;
      for (const [r0, r1] of solidRanges(W.L, ops, (op) => op.kind !== 'window' || op.y0 < fy + h)) {
        const pa = wallPoint(W, r0, fy, sign * (t / 2 + 0.008));
        const pb = wallPoint(W, r1, fy, sign * (t / 2 + 0.008));
        const pc = wallPoint(W, r1, fy + h, sign * (t / 2 + 0.008));
        const pd = wallPoint(W, r0, fy + h, sign * (t / 2 + 0.008));
        if (sign > 0) B.planarQuad(o.wainscot[side], pa, pb, pc, pd);
        else B.planarQuad(o.wainscot[side], pb, pa, pd, pc);
        const pr = wallPoint(W, (r0 + r1) / 2, fy + h, sign * (t / 2 + 0.02));
        B.box(o.wainscot.rail ?? 'woodDark', pr.x, pr.y, pr.z, r1 - r0, 0.06, 0.04, W.ry);
      }
    }
    if (o.crown && o.crown[side]) {
      const yc = o.crown.y ?? y1;
      for (const [r0, r1] of solidRanges(W.L, ops, (op) => op.y1 > yc - 0.3)) {
        const cs = (r0 + r1) / 2;
        const p = wallPoint(W, cs, yc - 0.09, sign * (t / 2 + 0.05));
        B.box(o.crown[side], p.x, p.y, p.z, r1 - r0, 0.18, 0.1, W.ry);
      }
    }
  }
  W.ops = ops;
  return W;
}

// Window furniture: sashes, glass, casings, hood, shutters and curtains.
// out = 'a' | 'b' is the exterior side.
export function windowFix(ctx, B, W, op, o = {}) {
  const sOut = o.out === 'b' ? -1 : 1;
  const t = W.t;
  const w = op.w;
  const h = op.y1 - op.y0;
  const cy = (op.y0 + op.y1) / 2;
  const c = wallPoint(W, op.at, cy, 0);
  B.push(mat(c.x, c.y, c.z, W.ry));
  const ext = o.extTrim ?? 'trim';
  const int = o.intTrim ?? 'woodDark';
  const z0 = sOut * (t / 2);
  // glass
  if (o.glass !== false) {
    const g = o.glassMat ?? 'glass';
    B.quad(g, V(-w / 2, -h / 2, 0), V(w / 2, -h / 2, 0), V(w / 2, h / 2, 0), V(-w / 2, h / 2, 0));
  }
  // sashes
  const sash = o.sashMat ?? ext;
  const fw = 0.05;
  B.box(sash, -w / 2 + fw / 2, 0, 0, fw, h, 0.07);
  B.box(sash, w / 2 - fw / 2, 0, 0, fw, h, 0.07);
  B.box(sash, 0, h / 2 - fw / 2, 0, w, fw, 0.07);
  B.box(sash, 0, -h / 2 + fw / 2, 0, w, fw, 0.07);
  if (o.sashes !== false) {
    B.box(sash, 0, 0.02, 0.015, w, 0.05, 0.05);
    if (w > 0.6) B.box(sash, 0, 0, 0, 0.03, h, 0.05);
  }
  // exterior casing
  if (o.extCasing !== false) {
    const cz = z0 + sOut * 0.02;
    B.box(ext, -w / 2 - 0.06, 0, cz, 0.12, h + 0.12, 0.05);
    B.box(ext, w / 2 + 0.06, 0, cz, 0.12, h + 0.12, 0.05);
    B.box(ext, 0, h / 2 + 0.09, cz + sOut * 0.01, w + 0.34, 0.18, 0.07);
    B.box(ext, 0, -h / 2 - 0.04, z0 + sOut * 0.07, w + 0.3, 0.07, 0.18);
    if (o.hood === 'arch') {
      const g = new THREE.TorusGeometry(w / 2 + 0.1, 0.055, 6, 14, Math.PI);
      B.geom(ext, g, mat(0, h / 2 + 0.16, cz + sOut * 0.04));
      g.dispose();
      B.box(ext, 0, h / 2 + 0.16 + w / 2 + 0.1, cz + sOut * 0.05, 0.12, 0.2, 0.09);
    } else if (o.hood === 'pediment') {
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2 - 0.22, 0);
      sh.lineTo(w / 2 + 0.22, 0);
      sh.lineTo(0, 0.32);
      sh.closePath();
      B.shape({ front: ext, back: ext, side: ext }, sh, 0.08, mat(0, h / 2 + 0.18, cz - (sOut < 0 ? 0.08 : 0)));
    } else if (o.hood === 'flat') {
      B.box(ext, 0, h / 2 + 0.24, cz + sOut * 0.04, w + 0.44, 0.08, 0.16);
    }
  }
  // interior casing + stool
  if (o.intCasing !== false) {
    const iz = -z0 - sOut * 0.012;
    B.box(int, -w / 2 - 0.05, 0, iz, 0.1, h + 0.1, 0.025);
    B.box(int, w / 2 + 0.05, 0, iz, 0.1, h + 0.1, 0.025);
    B.box(int, 0, h / 2 + 0.06, iz, w + 0.2, 0.12, 0.025);
    B.box(int, 0, -h / 2 - 0.02, -z0 - sOut * 0.05, w + 0.16, 0.04, 0.12);
  }
  // shutters
  if (o.shutters) {
    const sw = w / 2 + 0.04;
    for (const side of [-1, 1]) {
      if (o.shutters === 'broken' && side > 0) continue;
      const sx = side * (w / 2 + 0.14 + sw / 2);
      const sz = z0 + sOut * 0.05;
      const tilt = o.shutters === 'crooked' && side > 0 ? 0.12 : 0;
      B.push(mat(sx, -tilt * 0.4, sz, 0, 0, tilt * side));
      const sm = o.shutterMat ?? 'trimDark';
      B.box(sm, -sw / 2 + 0.03, 0, 0, 0.06, h, 0.04);
      B.box(sm, sw / 2 - 0.03, 0, 0, 0.06, h, 0.04);
      B.box(sm, 0, h / 2 - 0.03, 0, sw, 0.06, 0.04);
      B.box(sm, 0, -h / 2 + 0.03, 0, sw, 0.06, 0.04);
      const n = Math.floor(h / 0.09);
      for (let i = 1; i < n; i++) {
        B.push(mat(0, -h / 2 + i * (h / n), 0, 0, -0.6));
        B.box(sm, 0, 0, 0, sw - 0.1, 0.075, 0.012);
        B.pop();
      }
      B.pop();
    }
  }
  // curtains
  if (o.curtains) {
    const cm = o.curtains;
    const iz = -z0 - sOut * 0.12;
    const top = h / 2 + 0.22;
    const bottom = o.curtainBottom != null ? o.curtainBottom - cy : -h / 2 - 0.25;
    const ch = top - bottom;
    B.cyl(o.rodMat ?? 'brass', 0, top + 0.03, iz, 0.015, 0.015, w + 0.7, 6, { rz: Math.PI / 2 });
    for (const side of [-1, 1]) {
      const cw = o.curtainOpen ? w * 0.32 : w * 0.55;
      const g = new THREE.PlaneGeometry(cw, ch, 14, 4);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const fold = Math.sin((x / cw) * Math.PI * 7) * 0.035 * (1 + (0.5 - y / ch) * 0.6);
        p.setZ(i, fold);
      }
      g.computeVertexNormals();
      const cx = side * (w / 2 + 0.3 - cw / 2);
      B.geom(cm, g, mat(cx, top - ch / 2, iz, sOut < 0 ? Math.PI : 0), { worldUV: true });
      g.dispose();
    }
    B.box(cm, 0, top - 0.12, iz - sOut * 0.04, w + 0.6, 0.28, 0.03);
  }
  B.pop();
  return {
    center: wallPoint(W, op.at, cy, 0),
    w,
    h,
    inward: new THREE.Vector3(-W.nx * sOut, 0, -W.nz * sOut),
  };
}

// Door casings for an opening; returns where to hang the door.
export function doorFix(ctx, B, W, op, o = {}) {
  const h = op.y1 - op.y0;
  const w = op.w;
  const c = wallPoint(W, op.at, op.y0, 0);
  B.push(mat(c.x, c.y, c.z, W.ry));
  const t = W.t;
  for (const [sign, m] of [
    [1, o.a ?? 'woodDark'],
    [-1, o.b ?? 'woodDark'],
  ]) {
    if (!m) continue;
    const z = sign * (t / 2 + 0.015);
    B.box(m, -w / 2 - 0.06, h / 2 + 0.01, z, 0.12, h + 0.02, 0.03);
    B.box(m, w / 2 + 0.06, h / 2 + 0.01, z, 0.12, h + 0.02, 0.03);
    B.box(m, 0, h + 0.08, z, w + 0.3, 0.16, 0.04);
    if (o.fancy) B.box(m, 0, h + 0.2, z + sign * 0.02, w + 0.4, 0.07, 0.08);
  }
  B.box(o.sill ?? 'woodDark', 0, 0.01, 0, w, 0.02, t + 0.02);
  B.pop();
  return {
    hingeL: wallPoint(W, op.at - w / 2, op.y0, 0),
    hingeR: wallPoint(W, op.at + w / 2, op.y0, 0),
    yaw: W.ry,
    w,
    h,
    W,
  };
}

/**
 * Straight stair. o = { x, z: bottom front-centre, dir: [dx,dz] climb direction,
 *   width, run, y0, y1, steps, tread, riser, side, rail: 'left'|'right'|'both'|null,
 *   tag, sideCollide: 'left'|'right'|'both' }
 */
export function stairs(ctx, B, o) {
  const d = new THREE.Vector2(o.dir[0], o.dir[1]).normalize();
  const ry = Math.atan2(d.x, d.y);
  const n = o.steps;
  const rise = (o.y1 - o.y0) / n;
  const run = o.run / n;
  const w = o.width;
  B.push(mat(o.x, o.y0, o.z, ry));
  const keys = { py: o.tread ?? 'fl_oak', nz: o.riser ?? 'woodDark', px: o.side ?? 'woodDark', nx: o.side ?? 'woodDark', pz: o.side ?? 'woodDark' };
  for (let i = 0; i < n; i++) {
    const top = (i + 1) * rise;
    const bot = o.solid === false ? top - rise - 0.06 : -0.02;
    B.box(keys, 0, (top + bot) / 2, (i + 0.5) * run, w, top - bot, run);
    // nosing
    B.box(o.tread ?? 'fl_oak', 0, top - 0.015, i * run + 0.015, w + 0.02, 0.035, 0.06);
  }
  // sloped stringer boards hide the stepped profile
  const slope = Math.atan2(o.y1 - o.y0, o.run);
  const len = Math.hypot(o.run, o.y1 - o.y0);
  for (const side of [-1, 1]) {
    if (o.stringers === false) continue;
    B.push(mat(side * (w / 2 + 0.03), (o.y1 - o.y0) / 2 + 0.06, o.run / 2, 0, -slope));
    B.box(o.side ?? 'woodDark', 0, 0, 0, 0.05, 0.32, len);
    B.pop();
  }
  // balustrade
  const rails = o.rail === 'both' ? [-1, 1] : o.rail === 'left' ? [-1] : o.rail === 'right' ? [1] : [];
  for (const side of rails) {
    const x = side * (w / 2 - 0.05);
    for (let i = 0; i < n; i++) {
      for (const f of [0.28, 0.72]) {
        const z = (i + f) * run;
        const yb = (i + 1) * rise;
        const hgt = 0.86 + (f * run * (o.y1 - o.y0)) / o.run;
        baluster(B, x, yb, z, hgt, o.balusterMat ?? 'woodDark');
      }
    }
    B.push(mat(x, (o.y1 - o.y0) / 2 + rise + 0.88, o.run / 2, 0, -slope));
    B.box(o.railMat ?? 'woodDark', 0, 0, 0, 0.08, 0.07, len + 0.1);
    B.pop();
    newel(B, x, rise, 0.12, o.railMat ?? 'woodDark');
    if (o.topNewel !== false) newel(B, x, o.y1 - o.y0, o.run - 0.05, o.railMat ?? 'woodDark');
  }
  B.pop();
  // walkable ramp + side colliders (world space)
  const along = (a) => ({ x: o.x + d.x * a, z: o.z + d.y * a });
  const pA = along(0);
  const pB = along(o.run);
  const lat = { x: d.y, z: -d.x }; // right-hand lateral (local +x)
  const corners = [
    [pA.x + (lat.x * w) / 2, pA.z + (lat.z * w) / 2],
    [pA.x - (lat.x * w) / 2, pA.z - (lat.z * w) / 2],
    [pB.x + (lat.x * w) / 2, pB.z + (lat.z * w) / 2],
    [pB.x - (lat.x * w) / 2, pB.z - (lat.z * w) / 2],
  ];
  const minX = Math.min(...corners.map((c) => c[0]));
  const maxX = Math.max(...corners.map((c) => c[0]));
  const minZ = Math.min(...corners.map((c) => c[1]));
  const maxZ = Math.max(...corners.map((c) => c[1]));
  const axis = Math.abs(d.x) > Math.abs(d.y) ? 'x' : 'z';
  const a0 = axis === 'x' ? pA.x : pA.z;
  const a1 = axis === 'x' ? pB.x : pB.z;
  ctx.col.addRamp(minX, maxX, minZ, maxZ, axis, a0, a1, o.y0, o.y1, o.tag ?? 'wood');
  const sc = o.sideCollide ?? o.rail;
  const sides = sc === 'both' ? [-1, 1] : sc === 'left' ? [-1] : sc === 'right' ? [1] : [];
  for (const side of sides) {
    const off = side * (w / 2 + 0.06);
    const mid = along(o.run / 2 + 0.1);
    ctx.col.addOBB(mid.x + lat.x * off, mid.z + lat.z * off, o.run / 2 + 0.12, 0.06, Math.atan2(d.y, d.x), o.y0 - 0.1, o.y1 + 1.0);
  }
  return { ramp: [minX, maxX, minZ, maxZ] };
}

const _balusters = new Map();
export function baluster(B, x, y, z, h, m = 'woodDark') {
  const key = h.toFixed(2);
  let g = _balusters.get(key);
  if (!g) {
    g = balusterGeo(h);
    _balusters.set(key, g);
  }
  B.geom(m, g, mat(x, y, z));
}

function balusterGeo(h) {
  const k = h / 0.86;
  return new THREE.LatheGeometry(
    [
      [0, 0],
      [0.03, 0],
      [0.03, 0.08 * k],
      [0.018, 0.12 * k],
      [0.024, 0.3 * k],
      [0.014, 0.5 * k],
      [0.02, 0.62 * k],
      [0.016, 0.74 * k],
      [0.026, 0.8 * k],
      [0.026, h],
      [0, h],
    ].map((p) => new THREE.Vector2(p[0], p[1])),
    6
  );
}

export function newel(B, x, y, z, m = 'woodDark') {
  B.box(m, x, y + 0.6, z, 0.16, 1.2, 0.16);
  B.box(m, x, y + 1.22, z, 0.2, 0.05, 0.2);
  B.sphere(m, x, y + 1.3, z, 0.07, 1, 1, 1, 8, 6);
}

// Horizontal balustrade between two points at floor height y.
export function railing(ctx, B, x1, z1, x2, z2, y, o = {}) {
  const W = wallFrame(x1, z1, x2, z2, 0.1);
  const h = o.h ?? 0.95;
  const m = o.mat ?? 'woodDark';
  const n = Math.max(1, Math.floor(W.L / (o.spacing ?? 0.14)));
  for (let i = 0; i <= n; i++) {
    const p = wallPoint(W, (i / n) * W.L, y, 0);
    if (o.iron) B.rod(m, p.x, y, p.z, p.x, y + h, p.z, 0.011, 0.011, 5);
    else baluster(B, p.x, y, p.z, h - 0.06, m);
  }
  const mid = wallPoint(W, W.L / 2, y + h - 0.03, 0);
  B.box(o.railMat ?? m, mid.x, mid.y, mid.z, W.L + 0.06, o.iron ? 0.035 : 0.07, o.iron ? 0.035 : 0.1, W.ry);
  if (!o.iron) {
    const bot = wallPoint(W, W.L / 2, y + 0.06, 0);
    B.box(m, bot.x, bot.y, bot.z, W.L, 0.05, 0.08, W.ry);
  } else {
    const bot = wallPoint(W, W.L / 2, y + 0.12, 0);
    B.box(m, bot.x, bot.y, bot.z, W.L, 0.03, 0.03, W.ry);
  }
  if (o.posts !== false && !o.iron) {
    for (const s of [0, W.L]) {
      const p = wallPoint(W, s, y, 0);
      B.box(m, p.x, y + h / 2 + 0.05, p.z, 0.12, h + 0.1, 0.12);
    }
  }
  if (o.collide !== false) {
    const c = ctx.col.addOBB((x1 + x2) / 2, (z1 + z2) / 2, W.L / 2, 0.08, W.ang, y - 0.05, y + h + (o.extraH ?? 0.4));
    c.see = true;
  }
  return W;
}

// Iron cresting / widow's-walk railing with spear finials.
export function cresting(ctx, B, x1, z1, x2, z2, y, o = {}) {
  const W = wallFrame(x1, z1, x2, z2, 0.1);
  const h = o.h ?? 0.9;
  const m = o.mat ?? 'iron';
  const n = Math.max(1, Math.round(W.L / 0.12));
  const spear = new THREE.ConeGeometry(0.022, 0.09, 4);
  for (let i = 0; i <= n; i++) {
    const p = wallPoint(W, (i / n) * W.L, y, 0);
    const tall = i % 4 === 0;
    const hh = tall ? h + 0.18 : h;
    B.rod(m, p.x, y, p.z, p.x, y + hh, p.z, 0.009, 0.009, 4);
    B.geom(m, spear, mat(p.x, y + hh + 0.04, p.z));
  }
  for (const yy of [0.12, h - 0.06, h * 0.55]) {
    const mid = wallPoint(W, W.L / 2, y + yy, 0);
    B.box(m, mid.x, mid.y, mid.z, W.L, 0.028, 0.028, W.ry);
  }
  // scroll ornaments between the rails
  const ring = new THREE.TorusGeometry(0.1, 0.008, 4, 12);
  for (let s = 0.3; s < W.L - 0.2; s += 0.48) {
    const p = wallPoint(W, s, y + h * 0.33, 0);
    B.geom(m, ring, mat(p.x, p.y, p.z, W.ry));
  }
  spear.dispose();
  ring.dispose();
  if (o.collide !== false) {
    const c = ctx.col.addOBB((x1 + x2) / 2, (z1 + z2) / 2, W.L / 2, 0.06, W.ang, y - 0.05, y + h + 0.5);
    c.see = true;
  }
}

export function floorRect(B, m, x0, x1, z0, z1, y) {
  B.quad(m, V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0));
}

export function ceilRect(B, m, x0, x1, z0, z1, y) {
  B.quad(m, V(x0, y, z0), V(x1, y, z0), V(x1, y, z1), V(x0, y, z1));
}

// Convex polygon (array of [x,z]) facing up or down.
export function floorPoly(B, m, pts, y, up = true) {
  const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (up) B.tri(m, V(c[0], y, c[1]), V(b[0], y, b[1]), V(a[0], y, a[1]));
    else B.tri(m, V(c[0], y, c[1]), V(a[0], y, a[1]), V(b[0], y, b[1]));
  }
}

// A corner cobweb: apex at (x, y, z) (usually a ceiling corner); the web
// spreads along directions a and b (unit horizontal vectors into the room).
export function cobweb(B, x, y, z, ax, az, bx, bz, size = 0.9, m = 'webCorner') {
  const p0 = V(x + ax * 0.02 + bx * 0.02, y - 0.02, z + az * 0.02 + bz * 0.02);
  const pa = V(x + ax * size, y - 0.05, z + az * size);
  const pb = V(x + bx * size, y - 0.05, z + bz * size);
  const pd = V(x + (ax + bx) * 0.1, y - size * 0.95, z + (az + bz) * 0.1);
  // two triangles forming a sagging sheet across the corner
  B.tri(m, p0, pa, pb, [0, 1, 1, 1, 0, 0]);
  B.tri(m, pa, pd, pb, [1, 1, 0.3, 0.3, 0, 0]);
}

export function webQuad(B, x, y, z, ry, w, h, m = 'webRound') {
  B.push(mat(x, y, z, ry));
  B.quad(m, V(-w / 2, -h / 2, 0), V(w / 2, -h / 2, 0), V(w / 2, h / 2, 0), V(-w / 2, h / 2, 0), [0, 0, 1, 0, 1, 1, 0, 1]);
  B.pop();
}
