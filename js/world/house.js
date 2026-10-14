import * as THREE from 'three';
import { mat } from '../core/geo.js';
import { Y, EXT, INT, TURRET, turretVerts, turretOuterSegments } from './layout.js';
import { wall, windowFix, doorFix, stairs, railing, cresting, floorRect, ceilRect, floorPoly, wallFrame, wallPoint } from './build.js';
import { Door } from './dynamic.js';

// The shell of Ravenmoor House: walls, floors, stairs, roofs, porch, turret.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Quad whose normal is forced to point along `dir` (flips winding if needed).
function quadToward(B, key, a, b, c, d, dir, planar = true) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
  if (n.dot(dir) < 0) {
    if (planar) B.planarQuad(key, a, d, c, b);
    else B.quad(key, a, d, c, b);
  } else if (planar) B.planarQuad(key, a, b, c, d);
  else B.quad(key, a, b, c, d);
}

function triToward(B, key, a, b, c, dir) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (n.dot(dir) < 0) B.tri(key, a, c, b);
  else B.tri(key, a, b, c);
}

function hang(ctx, info, o = {}) {
  const hinge = o.side === 'R' ? info.hingeR : info.hingeL;
  return new Door(ctx, {
    hinge,
    yaw: info.yaw,
    width: o.width ?? info.w,
    height: o.height ?? info.h - 0.02,
    side: o.side ?? 'L',
    swing: o.swing ?? -1,
    mat: o.mat,
    locked: o.locked,
    open: o.open,
    name: o.name,
    wallFrame: info.W,
    glassPanel: o.glassPanel,
    maxOpen: o.maxOpen,
    interact: o.interact,
  });
}

function archSpandrel(B, W, at, w, yTop, t, m = 'woodDark') {
  const r = w / 2;
  const rise = 0.42;
  const sh = new THREE.Shape();
  sh.moveTo(-r, 0);
  sh.lineTo(-r, rise);
  sh.lineTo(r, rise);
  sh.lineTo(r, 0);
  sh.absellipse(0, 0, r, rise - 0.04, 0, Math.PI, false);
  const c = wallPoint(W, at, yTop - rise, 0);
  B.push(mat(c.x, c.y, c.z, W.ry));
  B.shape({ front: m, back: m, side: m }, sh, t + 0.03, mat(0, 0, -(t + 0.03) / 2), { curveSegments: 16 });
  B.pop();
}

export function buildHouse(ctx) {
  const H = { windows: [], doors: {} };
  ctx.house = H;
  registerRooms(ctx);
  groundFloor(ctx, H);
  secondFloor(ctx, H);
  atticFloor(ctx, H);
  cellar(ctx, H);
  shell(ctx, H);
  return H;
}

function registerRooms(ctx) {
  const R = ctx.rooms;
  const g0 = 0.6;
  const g1 = 4.45;
  R.add('foyer', 'The Grand Hall', [-2, g0, -3, 2, g1, 6], { size: 'large' });
  R.add('rearhall', 'The Back Passage', [-2, g0, -8, 2, g1, -3], { size: 'small' });
  R.add('parlor', 'The Front Parlour', [2, g0, 0, 7.01, g1, 6]);
  R.add('parlor', '', [4.8, g0, 3.8, 9.2, g1, 8.2]);
  R.add('library', 'The Library', [2, g0, -4, 7, g1, 0]);
  R.add('seance', 'The Séance Room', [2, g0, -8, 7, g1, -4], { size: 'small' });
  R.add('dining', 'The Dining Room', [-7, g0, 0.5, -2, g1, 8.5]);
  R.add('kitchen', 'The Kitchen', [-7, g0, -8, -2, g1, 0.5]);
  const s0 = 4.45;
  const s1 = 8.25;
  R.add('upperhall', 'The Upper Landing', [-2, s0, -8, 1, s1, 6], { floor: 'second' });
  R.add('upperhall', '', [1, s0, -2.8, 2, s1, 6], { floor: 'second' });
  R.add('atticstair', 'The Attic Stair', [1, s0, -8, 2, s1 + 0.2, -2.8], { floor: 'second', size: 'small' });
  R.add('nursery', 'The Nursery', [-7, s0, 0.5, -2, s1, 8.5], { floor: 'second' });
  R.add('bath', 'The Bathroom', [-7, s0, -3, -2, s1, 0.5], { floor: 'second', size: 'small' });
  R.add('guest', 'The Yellow Room', [-7, s0, -8, -2, s1, -3], { floor: 'second' });
  R.add('master', 'The Master Bedroom', [2, s0, 0, 7.01, s1, 6], { floor: 'second' });
  R.add('master', '', [4.8, s0, 3.8, 9.2, s1, 8.2], { floor: 'second' });
  R.add('sewing', 'The Sewing Room', [2, s0, -4, 7, s1, 0], { floor: 'second' });
  R.add('attic', 'The Attic', [-7, 8.25, -8, 7, 11.05, 6], { floor: 'attic', size: 'large' });
  R.add('attic', '', [-7, 8.25, 6, -2, 11.05, 8.5], { floor: 'attic' });
  R.add('deck', "The Widow's Walk", [-6.3, 11.05, -7.3, 6.3, 15, 5.3], { outdoor: true, floor: 'deck' });
  R.add('cellar', 'The Cellar', [-7, -2.3, -8, 7, 0.6, 6], { floor: 'cellar' });
  R.add('crypt', 'The Crypt', [-7, -2.3, 2, -3, 0.6, 6], { floor: 'cellar', size: 'small' });
  R.add('wine', 'The Wine Cellar', [3, -2.3, -8, 7, 0.6, -4], { floor: 'cellar', size: 'small' });
  R.add('cellarstair', '', [-3.05, -2.3, -7.9, -2, 0.95, -2.6], { floor: 'cellar', size: 'small' });
  R.add('porch', 'The Porch', [-2.05, 0, 6.15, 4.9, 4.3, 10.8], { outdoor: true });
  R.add('sideporch', 'The Side Porch', [-9.4, 0, 0.6, -7.15, 4.2, 6.2], { outdoor: true });
  R.add('bulkhead', 'The Cellar Steps', [7.15, -2.2, -1.45, 10.3, 2, 0.65], { outdoor: true });
}

// ------------------------------------------------------------- ground floor
function groundFloor(ctx, H) {
  const Bg = ctx.B.g;
  const GF = Y.g;
  const GC = Y.gCeil;
  const y0 = 0.75;
  const y1 = Y.f2;
  const gwin = (at, w = 1.0) => ({ at, w, y0: 1.55, y1: 3.8, kind: 'window' });
  const ext = (x1, z1, x2, z2, inner, openings, extra = {}) =>
    wall(ctx, Bg, x1, z1, x2, z2, y0, y1, {
      t: EXT,
      a: 'siding',
      b: inner,
      edge: 'trim',
      ends: inner,
      openings,
      floorY: GF,
      base: { b: 'woodDark', h: 0.24 },
      crown: { b: 'trim', y: GC },
      ...extra,
    });
  const fix = (W, o = {}) => {
    for (const op of W.ops) {
      if (op.kind !== 'window') continue;
      H.windows.push({ ...windowFix(ctx, Bg, W, op, { out: 'a', ...o }), level: 'g' });
    }
  };

  // front of the hall with the entrance
  let W = ext(-2, 6, 2, 6, 'wp_hall', [
    { at: 2.0, w: 1.7, y0: GF, y1: 4.15, kind: 'door' },
    { at: 0.72, w: 0.34, y0: 1.25, y1: 3.45 },
    { at: 3.28, w: 0.34, y0: 1.25, y1: 3.45 },
  ]);
  fix(W, { sashes: false, extCasing: true, hood: null });
  const front = doorFix(ctx, Bg, W, W.ops.find((o) => o.kind === 'door'), { a: 'trim', b: 'woodDark', fancy: true });
  {
    const c = wallPoint(W, 2.0, 3.86, 0);
    Bg.push(mat(c.x, c.y, c.z, W.ry));
    Bg.quad('glass', V(-0.85, -0.27, 0), V(0.85, -0.27, 0), V(0.85, 0.27, 0), V(-0.85, 0.27, 0));
    Bg.box('trim', 0, -0.3, 0, 1.7, 0.07, EXT + 0.02);
    Bg.box('trim', 0, 0, 0, 0.04, 0.54, 0.06);
    Bg.pop();
  }
  H.doors.frontL = hang(ctx, front, { side: 'L', width: 0.85, height: 2.63, swing: -1, mat: 'doorBlue', name: 'front' });
  H.doors.frontR = hang(ctx, front, { side: 'R', width: 0.85, height: 2.63, swing: -1, mat: 'doorBlue', name: 'front' });

  W = ext(2, 6, 4.875, 6, 'wp_parlor', [gwin(1.5, 0.95)]);
  fix(W, { hood: 'flat', shutters: 'crooked', curtains: 'velvet' });
  W = ext(-7, 8.5, -2, 8.5, 'wp_dining', [gwin(1.4), gwin(3.6)]);
  fix(W, { hood: 'flat', shutters: true, curtains: 'velvetGreen' });
  W = ext(-2, 8.5, -2, 6, 'wp_dining', [gwin(1.25, 0.8)]);
  fix(W, { hood: 'flat', curtains: 'velvetGreen' });
  W = ext(-7, -8, -7, 0.5, 'plaster', [gwin(2.0), gwin(5.5)], { wainscot: { b: 'wainscot', h: 1.1 } });
  fix(W, { hood: 'flat', shutters: 'broken', curtains: 'linen', curtainOpen: true });
  W = ext(-7, 0.5, -7, 8.5, 'wp_dining', [gwin(1.9), gwin(5.1)]);
  fix(W, { hood: 'flat', shutters: true, curtains: 'velvetGreen' });
  W = ext(7, -8, 2, -8, 'wp_seance', [gwin(2.5)]);
  fix(W, { hood: 'flat', curtains: 'velvet', curtainBottom: GF + 0.05 });
  W = ext(2, -8, -2, -8, 'wp_hall', [{ at: 2.0, w: 1.0, y0: GF, y1: 3.45, kind: 'door' }]);
  const back = doorFix(ctx, Bg, W, W.ops[0], { a: 'trim', b: 'woodDark' });
  H.doors.back = hang(ctx, back, { side: 'L', swing: -1, name: 'back', glassPanel: true });
  W = ext(-2, -8, -7, -8, 'plaster', [gwin(3.2, 0.9)], { wainscot: { b: 'wainscot', h: 1.1 } });
  fix(W, { hood: 'flat', curtains: 'linen', curtainOpen: true });
  ext(7, 3.875, 7, 0, 'wp_parlor', []);
  W = ext(7, 0, 7, -4, 'wp_library', [gwin(2.0)]);
  fix(W, { hood: 'flat', shutters: true, curtains: 'velvetGreen' });
  W = ext(7, -4, 7, -8, 'wp_seance', [gwin(2.0)]);
  fix(W, { hood: 'flat', curtains: 'velvet', curtainBottom: GF + 0.05 });
  for (const [p, q] of turretOuterSegments()) {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const W2 = ext(q[0], q[1], p[0], p[1], 'wp_parlor', L > 1.5 ? [gwin(L / 2, 0.78)] : []);
    fix(W2, { hood: 'arch', curtains: 'velvet' });
  }

  // interior partitions
  const iw = (x1, z1, x2, z2, a, b, openings = [], extra = {}) =>
    wall(ctx, Bg, x1, z1, x2, z2, GF, GC, {
      t: INT,
      a,
      b,
      edge: 'woodDark',
      openings,
      base: { a: 'woodDark', b: 'woodDark', h: 0.24 },
      crown: { a: 'trim', b: 'trim', y: GC },
      ...extra,
    });
  const dop = (at, w = 0.95, h = 2.4) => ({ at, w, y0: GF, y1: GF + h, kind: 'door' });
  iw(-2, -8, -2, -3, 'plaster', 'wp_hall');
  iw(-2, -3, -2, 0.5, 'plaster', 'wp_hall', [], { wainscot: { a: 'wainscot', h: 1.1 } });
  W = iw(-2, 0.5, -2, 6, 'wp_dining', 'wp_hall', [dop(4.6, 1.1, 2.5)]);
  let d = doorFix(ctx, Bg, W, W.ops[0], { fancy: true });
  H.doors.dining = hang(ctx, d, { side: 'L', swing: 1, name: 'dining' });
  W = iw(-7, 0.5, -2, 0.5, 'wp_dining', 'plaster', [dop(3.8, 0.9, 2.3)], { wainscot: { b: 'wainscot', h: 1.1 } });
  d = doorFix(ctx, Bg, W, W.ops[0]);
  H.doors.pantry = hang(ctx, d, { side: 'R', swing: -1, name: 'pantry', open: 0.55 });
  W = iw(2, -8, 2, -4, 'wp_hall', 'wp_seance', [dop(2.8)]);
  d = doorFix(ctx, Bg, W, W.ops[0]);
  H.doors.seance = hang(ctx, d, { side: 'L', swing: -1, name: 'seance' });
  iw(2, -4, 2, -3, 'wp_hall', 'wp_library');
  W = iw(2, -3, 2, 0, 'wp_hall', 'wp_library', [dop(1.3, 1.0, 2.5)]);
  d = doorFix(ctx, Bg, W, W.ops[0], { fancy: true });
  H.doors.library = hang(ctx, d, { side: 'R', swing: -1, name: 'library' });
  W = iw(2, 0, 2, 6, 'wp_hall', 'wp_parlor', [{ at: 3.6, w: 1.8, y0: GF, y1: GF + 2.65, kind: 'open' }]);
  doorFix(ctx, Bg, W, W.ops[0], { fancy: true });
  W = iw(-2, -3, 2, -3, 'wp_hall', 'wp_hall', [{ at: 2.6, w: 2.0, y0: GF, y1: GF + 2.85, kind: 'arch' }]);
  archSpandrel(Bg, W, 2.6, 2.0, GF + 2.85, INT);
  W = iw(2, 0, 7, 0, 'wp_parlor', 'wp_library', [dop(1.0)]);
  d = doorFix(ctx, Bg, W, W.ops[0]);
  H.doors.parlorLib = hang(ctx, d, { side: 'L', swing: -1, name: 'parlorLib', open: 0.12 });
  iw(2, -4, 7, -4, 'wp_library', 'wp_seance');
  iw(-3.05, -8, -3.05, -2.6, 'plaster', 'plaster', [], { wainscot: { a: 'wainscot', h: 1.1 } });
  W = iw(-3.05, -2.6, -2, -2.6, 'plaster', 'plaster', [dop(0.53, 0.8, 2.2)], { wainscot: { a: 'wainscot', h: 1.1 } });
  d = doorFix(ctx, Bg, W, W.ops[0]);
  H.doors.cellar = hang(ctx, d, { side: 'L', swing: 1, name: 'cellar' });

  // floors & ceilings
  const fl = (m, x0, x1, z0, z1, tag = 'wood') => {
    floorRect(Bg, m, x0, x1, z0, z1, GF);
    ctx.col.addFloor(x0, x1, z0, z1, GF, tag);
  };
  fl('tileFoyer', -2, 2, -3, 6, 'tile');
  fl('fl_oak', -2, 2, -8, -3);
  fl('fl_oak', 2, 7, 0, 6);
  floorPoly(Bg, 'fl_oak', turretVerts(), GF + 0.002);
  ctx.col.addFloorCircle(TURRET.cx, TURRET.cz, 2.12, GF, 'wood');
  fl('fl_dark', 2, 7, -4, 0);
  fl('fl_dark', 2, 7, -8, -4);
  fl('fl_oak', -7, -2, 0.5, 8.5);
  fl('tileChecker', -7, -3.05, -8, 0.5, 'tile');
  fl('tileChecker', -3.05, -2, -2.9, 0.5, 'tile');
  const ce = (x0, x1, z0, z1) => {
    ceilRect(Bg, 'plaster', x0, x1, z0, z1, GC);
    ctx.col.addSlab(x0, x1, z0, z1, GC, Y.f2);
  };
  ce(-7, -2, -8, 8.5);
  ce(-2, -0.7, -8, -1.8);
  ce(-2, -0.7, 4.2, 6);
  ce(-0.7, 7, -8, 6);
  floorPoly(Bg, 'plaster', turretVerts(), GC - 0.002, false);
  Bg.quad('plaster', V(-0.7, GC, -1.8), V(-0.7, GC, 4.2), V(-0.7, Y.f2, 4.2), V(-0.7, Y.f2, -1.8));
  Bg.quad('plaster', V(-0.7, GC, 4.2), V(-2, GC, 4.2), V(-2, Y.f2, 4.2), V(-0.7, Y.f2, 4.2));
  // cellar stair opening edges in the kitchen floor
  Bg.quad('woodDark', V(-3.05, GF, -2.9), V(-2, GF, -2.9), V(-2, 0.55, -2.9), V(-3.05, 0.55, -2.9));
  Bg.quad('woodDark', V(-2.98, 0.55, -2.9), V(-2.98, 0.55, -7.85), V(-2.98, GF, -7.85), V(-2.98, GF, -2.9));
  Bg.quad('woodDark', V(-2.07, 0.55, -7.85), V(-2.07, 0.55, -2.9), V(-2.07, GF, -2.9), V(-2.07, GF, -7.85));
  // the stairwell wall between the ceiling and the floor above
  Bg.quad('wp_hall', V(-1.93, GC - 0.02, 4.2), V(-1.93, GC - 0.02, -1.8), V(-1.93, Y.f2 + 0.02, -1.8), V(-1.93, Y.f2 + 0.02, 4.2));

  // grand staircase
  const run = 6.0 / 21;
  const rise = (Y.f2 - GF) / 21;
  stairs(ctx, Bg, { x: -1.36, z: 4.2, dir: [0, -1], width: 1.22, run: 6.0, y0: GF, y1: Y.f2, steps: 21, rail: 'left', sideCollide: 'left', tag: 'wood' });
  for (let i = 0; i < 21; i++) {
    const z = 4.2 - (i + 0.5) * run;
    const y = GF + (i + 1) * rise;
    Bg.box('velvet', -1.36, y + 0.004, z, 0.74, 0.008, run);
    Bg.box('velvet', -1.36, y - rise / 2, 4.2 - i * run + 0.004, 0.74, rise, 0.008);
  }
  // brass stair rods
  for (let i = 0; i < 21; i++) Bg.cyl('brass', -1.36, GF + (i + 1) * rise + 0.012, 4.2 - (i + 1) * run + 0.03, 0.007, 0.007, 0.8, 5, { rz: Math.PI / 2 });
  // little door under the stairs (never opens)
  const uf = wallFrame(-1.72, -1.83, -0.98, -1.83, 0.05);
  H.doors.understair = new Door(ctx, {
    hinge: V(-1.72, GF, -1.83),
    yaw: uf.ry,
    width: 0.74,
    height: 1.9,
    side: 'L',
    swing: -1,
    locked: true,
    name: 'understair',
    wallFrame: uf,
  });
}

// ------------------------------------------------------------- second floor
function secondFloor(ctx, H) {
  const B2 = ctx.B.f2;
  const FF = Y.f2;
  const FC = Y.f2Ceil;
  const fwin = (at, w = 0.95) => ({ at, w, y0: 5.35, y1: 7.45, kind: 'window' });
  const ext = (x1, z1, x2, z2, inner, openings, extra = {}) =>
    wall(ctx, B2, x1, z1, x2, z2, FF, Y.attic, {
      t: EXT,
      a: 'siding',
      b: inner,
      edge: 'trim',
      ends: inner,
      openings,
      floorY: FF,
      base: { b: 'woodDark', h: 0.22 },
      crown: { b: 'trim', y: FC },
      ...extra,
    });
  const fix = (W, o = {}) => {
    for (const op of W.ops) {
      if (op.kind !== 'window') continue;
      H.windows.push({ ...windowFix(ctx, B2, W, op, { out: 'a', ...o }), level: 'f2' });
    }
  };
  let W = ext(-2, 6, 2, 6, 'wp_hall', [{ at: 2.0, w: 1.25, y0: 5.2, y1: 7.55, kind: 'window' }]);
  fix(W, { hood: 'arch', curtains: 'velvet', curtainOpen: true });
  W = ext(2, 6, 4.875, 6, 'wp_master', [fwin(1.5)]);
  fix(W, { hood: 'arch', shutters: true, curtains: 'velvet' });
  W = ext(-7, 8.5, -2, 8.5, 'wp_nursery', [fwin(1.4), fwin(3.6)]);
  fix(W, { hood: 'arch', shutters: 'crooked', curtains: 'linen' });
  W = ext(-2, 8.5, -2, 6, 'wp_nursery', [fwin(1.25, 0.8)]);
  fix(W, { hood: 'arch', curtains: 'linen' });
  W = ext(-7, -8, -7, -3, 'wp_yellow', [fwin(2.5)]);
  fix(W, { hood: 'flat', shutters: true, curtains: 'linen' });
  W = ext(-7, -3, -7, 0.5, 'wp_bath', [{ at: 1.8, w: 0.7, y0: 5.75, y1: 7.2, kind: 'window' }]);
  fix(W, { hood: 'flat' });
  W = ext(-7, 0.5, -7, 8.5, 'wp_nursery', [fwin(1.9), fwin(5.1)]);
  fix(W, { hood: 'flat', shutters: true, curtains: 'linen' });
  W = ext(7, -8, 2, -8, 'plaster', [fwin(2.5)]);
  fix(W, { hood: 'flat', shutters: true, intCasing: false });
  W = ext(2, -8, -2, -8, 'wp_hall', [fwin(2.5, 0.85)]);
  fix(W, { hood: 'flat', curtains: 'linen' });
  W = ext(-2, -8, -7, -8, 'wp_yellow', [fwin(2.5)]);
  fix(W, { hood: 'flat', shutters: 'broken', curtains: 'linen' });
  ext(7, 3.875, 7, 0, 'wp_master', []);
  W = ext(7, 0, 7, -4, 'wp_sewing', [fwin(2.0)]);
  fix(W, { hood: 'flat', shutters: true, curtains: 'linen' });
  W = ext(7, -4, 7, -8, 'plaster', [fwin(2.0)]);
  fix(W, { hood: 'flat', shutters: true, intCasing: false });
  for (const [p, q] of turretOuterSegments()) {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const W2 = ext(q[0], q[1], p[0], p[1], 'wp_master', L > 1.5 ? [fwin(L / 2, 0.75)] : []);
    fix(W2, { hood: 'arch', curtains: 'velvet' });
  }

  const iw = (x1, z1, x2, z2, a, b, openings = [], extra = {}) =>
    wall(ctx, B2, x1, z1, x2, z2, FF, FC, {
      t: INT,
      a,
      b,
      edge: 'woodDark',
      openings,
      base: { a: 'woodDark', b: 'woodDark', h: 0.22 },
      crown: { a: 'trim', b: 'trim', y: FC },
      ...extra,
    });
  const dop = (at, w = 0.9, h = 2.35) => ({ at, w, y0: FF, y1: FF + h, kind: 'door' });
  W = iw(-2, -8, -2, -3, 'wp_yellow', 'wp_hall', [dop(3.4)]);
  let d = doorFix(ctx, B2, W, W.ops[0]);
  H.doors.guest = hang(ctx, d, { side: 'R', swing: 1, name: 'guest' });
  W = iw(-2, -3, -2, 0.5, 'wp_bath', 'wp_hall', [dop(0.62, 0.85)]);
  d = doorFix(ctx, B2, W, W.ops[0]);
  H.doors.bath = hang(ctx, d, { side: 'L', swing: 1, name: 'bath' });
  W = iw(-2, 0.5, -2, 6, 'wp_nursery', 'wp_hall', [dop(4.6, 0.95)]);
  d = doorFix(ctx, B2, W, W.ops[0]);
  H.doors.nursery = hang(ctx, d, { side: 'L', swing: 1, name: 'nursery' });
  iw(-7, -3, -2, -3, 'wp_bath', 'wp_yellow');
  iw(-7, 0.5, -2, 0.5, 'wp_nursery', 'wp_bath');
  iw(2, -8, 2, -4, 'plaster', 'plaster');
  iw(2, -4, 2, -2.8, 'plaster', 'wp_sewing');
  W = iw(2, -2.8, 2, 0, 'wp_hall', 'wp_sewing', [dop(1.6)]);
  d = doorFix(ctx, B2, W, W.ops[0]);
  H.doors.sewing = hang(ctx, d, { side: 'R', swing: -1, name: 'sewing' });
  W = iw(2, 0, 2, 6, 'wp_hall', 'wp_master', [dop(1.2, 0.95)]);
  d = doorFix(ctx, B2, W, W.ops[0], { fancy: true });
  H.doors.master = hang(ctx, d, { side: 'L', swing: -1, name: 'master' });
  iw(2, 0, 7, 0, 'wp_master', 'wp_sewing');
  W = iw(2, -4, 7, -4, 'wp_sewing', 'plaster', [dop(2.5, 0.95)]);
  d = doorFix(ctx, B2, W, W.ops[0], { a: 'woodDark', b: null });
  H.doors.red = hang(ctx, d, { side: 'R', swing: -1, mat: 'doorRed', locked: true, name: 'red' });
  W = iw(1, -8, 1, -2.8, 'wp_hall', 'plaster', [dop(0.55, 0.8, 2.2)]);
  d = doorFix(ctx, B2, W, W.ops[0]);
  H.doors.attic = hang(ctx, d, { side: 'L', swing: 1, name: 'attic' });
  iw(1, -2.8, 2, -2.8, 'wp_hall', 'plaster');

  const fl = (m, x0, x1, z0, z1) => {
    floorRect(B2, m, x0, x1, z0, z1, FF);
    ctx.col.addFloor(x0, x1, z0, z1, FF, 'wood');
  };
  fl('fl_oak', -7, -2, 0.5, 8.5);
  fl('tileHex', -7, -2, -3, 0.5);
  fl('fl_oak', -7, -2, -8, -3);
  fl('fl_oak', -2, -0.7, -8, -1.8);
  fl('fl_oak', -2, -0.7, 4.2, 6);
  fl('fl_oak', -0.7, 1, -8, 6);
  fl('fl_pine', 1, 2, -8, -2.8);
  fl('fl_oak', 1, 2, -2.8, 6);
  fl('fl_oak', 2, 7, 0, 6);
  fl('fl_oak', 2, 7, -4, 0);
  fl('fl_dark', 2, 7, -8, -4);
  floorPoly(B2, 'fl_oak', turretVerts(), FF + 0.002);
  ctx.col.addFloorCircle(TURRET.cx, TURRET.cz, 2.12, FF, 'wood');
  const ce = (x0, x1, z0, z1) => {
    ceilRect(B2, 'plaster', x0, x1, z0, z1, FC);
    ctx.col.addSlab(x0, x1, z0, z1, FC, Y.attic);
  };
  ce(-7, -2, -8, 8.5);
  ce(-2, 1, -8, 6);
  ce(1, 2, -8, -6);
  ce(1, 2, -2.9, 6);
  ce(2, 7, -8, 6);
  floorPoly(B2, 'plaster', turretVerts(), FC - 0.002, false);
  // gallery around the stairwell
  railing(ctx, B2, -0.7, -1.8, -0.7, 4.2, FF, { mat: 'woodDark' });
  railing(ctx, B2, -2, 4.2, -0.7, 4.2, FF, { mat: 'woodDark' });
  // attic stair
  stairs(ctx, B2, { x: 1.5, z: -7.0, dir: [0, 1], width: 0.84, run: 4.1, y0: FF, y1: Y.attic, steps: 20, rail: null, tread: 'fl_pine', riser: 'woodRough', side: 'woodRough', tag: 'wood', stringers: false });
  // hole edges seen from the stair
  B2.quad('woodRough', V(1, FC, -6), V(2, FC, -6), V(2, Y.attic, -6), V(1, Y.attic, -6));
}

// -------------------------------------------------------------------- attic
function mansardFrame(o) {
  const L = Math.hypot(o.bx - o.ax, o.bz - o.az);
  return { ...o, L, ux: (o.bx - o.ax) / L, uz: (o.bz - o.az) / L };
}

const MANSARD = { yb: 8.45, top: 11.0, inset: 1.2 };

function slopeFrames() {
  const yb = MANSARD.yb;
  const ht = MANSARD.top - yb;
  const ins = MANSARD.inset;
  const f = (ax, az, bx, bz, mx, mz, hipA, hipB, dormers) => mansardFrame({ ax, az, bx, bz, mx, mz, yb, ht, inset: ins, hipA, hipB, dormers });
  return {
    front: f(-2, 6.4, 4.875, 6.4, 0, -1, false, false, [{ s: 2.0, arch: true }, { s: 5.0 }]),
    right: f(7.4, 3.875, 7.4, -8.4, -1, 0, false, true, [{ s: 4.875 }, { s: 9.375 }]),
    back: f(7.4, -8.4, -7.4, -8.4, 0, 1, true, true, [{ s: 3.4 }, { s: 7.4 }, { s: 11.4 }]),
    left: f(-7.4, -8.4, -7.4, 5.2, 1, 0, true, false, [{ s: 2.9 }, { s: 7.4 }, { s: 10.9 }]),
  };
}

const DORMER = { w: 1.3, h: 1.75, r: 0.55 };

// One face of the mansard with holes for its dormers.
function mansardSlope(ctx, Bout, Bin, S) {
  const k = S.inset / S.ht;
  const P = (s, h, off = 0) => V(S.ax + S.ux * s + S.mx * (h * k + off), S.yb + h, S.az + S.uz * s + S.mz * (h * k + off));
  const sL = (h) => (S.hipA ? h * k : 0);
  const sR = (h) => (S.hipB ? S.L - h * k : S.L);
  const cuts = new Set([0, S.L]);
  const ds = S.dormers.map((d) => ({ ...d, s0: d.s - DORMER.w / 2, s1: d.s + DORMER.w / 2 }));
  for (const d of ds) {
    cuts.add(d.s0);
    cuts.add(d.s1);
  }
  const cs = [...cuts].sort((a, b) => a - b);
  const outDir = V(-S.mx, 0.4, -S.mz);
  for (let i = 0; i < cs.length - 1; i++) {
    const s0 = cs[i];
    const s1 = cs[i + 1];
    const dm = ds.find((d) => d.s0 <= s0 + 1e-6 && d.s1 >= s1 - 1e-6);
    const h0 = dm ? DORMER.h + DORMER.r : 0;
    const h1 = S.ht;
    const a0 = Math.max(s0, sL(h0));
    const b0 = Math.min(s1, sR(h0));
    const a1 = Math.max(s0, sL(h1));
    const b1 = Math.min(s1, sR(h1));
    if (b0 - a0 < 1e-3 && b1 - a1 < 1e-3) continue;
    quadToward(Bout, 'shingle', P(a0, h0), P(b0, h0), P(b1, h1), P(a1, h1), outDir);
    // inner face (attic side) only above the knee wall
    const hk = Math.max(h0, 0.6);
    const ia0 = Math.max(s0, sL(hk));
    const ib0 = Math.min(s1, sR(hk));
    quadToward(Bin, 'woodRough', P(ia0, hk, 0.2), P(ib0, hk, 0.2), P(b1, h1, 0.2), P(a1, h1, 0.2), V(S.mx, -0.4, S.mz));
  }
  for (const d of ds) dormer(ctx, Bout, Bin, S, d);
}

function dormer(ctx, Bout, Bin, S, d) {
  const { w, h, r } = DORMER;
  const k = S.inset / S.ht;
  const base = (s, y = 0, off = 0) => V(S.ax + S.ux * s + S.mx * off, S.yb + y, S.az + S.uz * s + S.mz * off);
  const s0 = d.s - w / 2;
  const s1 = d.s + w / 2;
  const pA = base(s0);
  const pB = base(s1);
  const W = wall(ctx, Bout, pA.x, pA.z, pB.x, pB.z, S.yb - 0.05, S.yb + h, {
    t: 0.12,
    a: 'siding',
    b: 'woodRough',
    edge: 'trim',
    collide: false,
    openings: [{ at: w / 2, w: w * 0.56, y0: S.yb + 0.42, y1: S.yb + h - 0.2, kind: 'window' }],
  });
  windowFix(ctx, Bout, W, W.ops[0], { out: 'a', hood: d.arch ? 'arch' : 'flat', intTrim: 'woodRough', sashMat: 'trim' });
  const outDir = V(-S.mx, 0, -S.mz);
  const uDir = V(S.ux, 0, S.uz);
  // side cheeks
  for (const [s, dir] of [
    [s0, uDir.clone().negate()],
    [s1, uDir],
  ]) {
    const a = base(s, 0);
    const b = base(s, h);
    const c = base(s, h, h * k + 0.02);
    triToward(Bout, 'siding', a, b, c, dir);
    triToward(Bin, 'woodRough', a.clone().addScaledVector(dir, -0.06), b.clone().addScaledVector(dir, -0.06), c.clone().addScaledVector(dir, -0.06), dir.clone().negate());
  }
  // little gable roof
  const ov = 0.12;
  const e0f = base(s0 - 0.08, h, -ov);
  const e1f = base(s1 + 0.08, h, -ov);
  const rf = base(d.s, h + r, -ov);
  const e0b = base(s0 - 0.08, h, h * k + 0.05);
  const e1b = base(s1 + 0.08, h, h * k + 0.05);
  const rb = base(d.s, h + r, (h + r) * k + 0.05);
  const up = V(0, 1, 0);
  quadToward(Bout, 'shingle', e0f, rf, rb, e0b, up.clone().addScaledVector(uDir, -0.5));
  quadToward(Bout, 'shingle', rf, e1f, e1b, rb, up.clone().addScaledVector(uDir, 0.5));
  const dn = V(0, -1, 0);
  const lo = (p) => p.clone().add(V(0, -0.08, 0));
  quadToward(Bin, 'woodRough', lo(e0f), lo(rf), lo(rb), lo(e0b), dn);
  quadToward(Bin, 'woodRough', lo(rf), lo(e1f), lo(e1b), lo(rb), dn);
  // front gable and barge boards
  const g0 = base(s0, h, -0.03);
  const g1 = base(s1, h, -0.03);
  const g2 = base(d.s, h + r - 0.05, -0.03);
  triToward(Bout, 'siding', g0, g1, g2, outDir);
  Bout.box('trim', (e0f.x + rf.x) / 2, (e0f.y + rf.y) / 2 - 0.04, (e0f.z + rf.z) / 2, 0.01, 0.01, 0.01);
  for (const [a, b] of [
    [e0f, rf],
    [rf, e1f],
  ]) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const m = new THREE.Matrix4().lookAt(a, b, V(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const mm = new THREE.Matrix4().compose(mid.clone().addScaledVector(outDir, 0.01).add(V(0, -0.05, 0)), q, V(0.05, 0.16, len));
    Bout.boxM('trim', mm);
  }
  // finial
  Bout.cyl('trim', rf.x, rf.y + 0.15, rf.z, 0.02, 0.03, 0.35, 6);
}

function atticFloor(ctx, H) {
  const Ba = ctx.B.at;
  const AF = Y.attic;
  const fl = (x0, x1, z0, z1) => {
    floorRect(Ba, 'fl_pine', x0, x1, z0, z1, AF);
    ctx.col.addFloor(x0, x1, z0, z1, AF, 'wood');
  };
  fl(-7, 1, -8, 6);
  fl(1, 2, -8, -6);
  fl(1, 2, -2.9, 6);
  fl(2, 7, -8, 6);
  fl(-7, -2, 6, 8.5);
  // knee walls
  const kw = (x1, z1, x2, z2) => wall(ctx, Ba, x1, z1, x2, z2, AF, 9.15, { t: 0.1, a: 'woodRough', b: null, edge: 'woodRough' });
  kw(-6.88, -7.88, -6.88, 8.4);
  kw(6.88, 3.9, 6.88, -7.88);
  kw(6.88, -7.88, -6.88, -7.88);
  kw(-2, 5.92, 4.85, 5.92);
  kw(-2.08, 8.4, -2.08, 5.92);
  // keep the player off the steep slopes
  const S = slopeFrames();
  ctx.col.addBox(-7.4, 9.0, -8.4, -6.25, 11.2, 5.2);
  ctx.col.addBox(6.25, 9.0, -8.4, 7.4, 11.2, 3.9);
  ctx.col.addBox(-7.4, 9.0, -8.4, 7.4, 11.2, -7.25);
  ctx.col.addBox(-2, 9.0, 5.25, 4.9, 11.2, 6.4);
  for (const k of Object.keys(S)) mansardSlope(ctx, ctx.B.ext, Ba, S[k]);
  // ceiling under the deck, with beams
  ceilRect(Ba, 'woodRough', -6.2, 6.2, -7.2, 5.2, Y.atticTop);
  ctx.col.addSlab(-6.2, 6.2, -7.2, 5.2, Y.atticTop, Y.deck);
  for (let x = -5.6; x <= 5.7; x += 1.4) Ba.box('woodRough', x, Y.atticTop - 0.11, -1, 0.16, 0.22, 12.4);
  for (const z of [-4.2, 1.6]) Ba.box('woodRough', 0, Y.atticTop - 0.3, z, 12.4, 0.2, 0.2);
  for (const [x, z] of [
    [-3.5, -4.2],
    [3.5, -4.2],
    [-3.5, 1.6],
    [3.5, 1.6],
  ]) {
    Ba.box('woodRough', x, (AF + Y.atticTop) / 2, z, 0.18, Y.atticTop - AF, 0.18);
    ctx.col.addBox(x - 0.09, AF, z - 0.09, x + 0.09, Y.atticTop, z + 0.09);
  }
  // hole for the stair
  Ba.quad('woodRough', V(1, Y.f2Ceil, -6), V(1, AF, -6), V(1, AF, -2.9), V(1, Y.f2Ceil, -2.9));
  Ba.quad('woodRough', V(2, Y.f2Ceil, -2.9), V(2, AF, -2.9), V(2, AF, -6), V(2, Y.f2Ceil, -6));
  railing(ctx, Ba, 1, -6, 1, -2.9, AF, { mat: 'woodRough' });
  railing(ctx, Ba, 2, -6, 2, -2.9, AF, { mat: 'woodRough' });
  railing(ctx, Ba, 1, -6, 2, -6, AF, { mat: 'woodRough' });
}

// ------------------------------------------------------------------- cellar
function cellar(ctx, H) {
  const Bc = ctx.B.cel;
  const CF = Y.cellar;
  const CT = Y.cellarTop;
  const cwin = (at) => ({ at, w: 0.7, y0: 0.08, y1: 0.5, kind: 'window' });
  const cw = (x1, z1, x2, z2, openings) => {
    const W = wall(ctx, Bc, x1, z1, x2, z2, CF, 0.75, { t: 0.3, a: 'fieldstone', b: null, edge: 'fieldstone', openings });
    for (const op of W.ops) {
      if (op.kind !== 'window') continue;
      H.windows.push({ ...windowFix(ctx, Bc, W, op, { out: 'b', extCasing: false, intCasing: false, sashes: false, glassMat: 'glass' }), level: 'cellar' });
      // iron bars
      for (let i = 1; i < 5; i++) {
        const p = wallPoint(W, op.at - op.w / 2 + (i * op.w) / 5, (op.y0 + op.y1) / 2, -0.1);
        Bc.cyl('ironBlack', p.x, p.y, p.z, 0.01, 0.01, op.y1 - op.y0, 4);
      }
    }
    return W;
  };
  H.cellarWalls = {
    right: cw(7, -8, 7, 6, [cwin(2.0), { at: 7.4, w: 2.0, y0: CF, y1: 0.25, kind: 'door' }]),
    left: cw(-7, 6, -7, -8, [cwin(6.0), cwin(10.0)]),
    back: cw(-7, -8, 7, -8, [cwin(2.0), cwin(12.0)]),
    front: cw(7, 6, -7, 6, []),
  };
  ctx.col.addFloor(-6.85, 6.85, -7.85, 5.85, CF, 'dirt');
  floorRect(Bc, 'dirt', -6.85, 6.85, -7.85, 5.85, CF);
  // ceiling boards with a hole for the kitchen stair
  const ce = (x0, x1, z0, z1) => {
    ceilRect(Bc, 'woodRough', x0, x1, z0, z1, CT);
    ctx.col.addSlab(x0, x1, z0, z1, CT, Y.g);
  };
  ce(-6.85, -3.05, -7.85, 5.85);
  ce(-3.05, -2, -2.9, 5.85);
  ce(-2, 6.85, -7.85, 5.85);
  for (let x = -6.4; x < 6.8; x += 0.6) {
    if (x > -3.1 && x < -1.95) continue;
    Bc.box('woodRough', x, CT - 0.11, -1, 0.1, 0.22, 13.7);
  }
  for (const z of [-2.5, 2.5]) Bc.box('woodRough', 0, CT - 0.34, z, 13.7, 0.26, 0.24);
  for (const x of [-4.5, -1.2, 2.2, 5.0]) {
    for (const z of [-2.5, 2.5]) {
      if (x === -4.5 && z === 2.5) continue;
      Bc.box('woodRough', x, (CF + CT - 0.34) / 2, z, 0.2, CT - 0.34 - CF, 0.2);
      ctx.col.addBox(x - 0.1, CF, z - 0.1, x + 0.1, CT, z + 0.1);
    }
  }
  // crypt partition (brick) with an arch
  const bw = (x1, z1, x2, z2, openings = []) => wall(ctx, Bc, x1, z1, x2, z2, CF, CT, { t: 0.24, a: 'brick', b: 'brick', edge: 'brick', openings });
  let W = bw(-7, 2, -3, 2, [{ at: 2.0, w: 1.3, y0: CF, y1: CF + 1.95, kind: 'arch' }]);
  archSpandrel(Bc, W, 2.0, 1.3, CF + 1.95, 0.24, 'brick');
  bw(-3, 2, -3, 6);
  // wine cellar partition with a gate
  W = bw(3, -4, 7, -4, [{ at: 1.5, w: 1.0, y0: CF, y1: CF + 2.0, kind: 'door' }]);
  H.wineGate = doorFix(ctx, Bc, W, W.ops[0], { a: 'brick', b: 'brick' });
  bw(3, -8, 3, -4);
  // kitchen stair down, ending a metre short of the back wall so there is a
  // landing to step off onto before turning into the cellar
  stairs(ctx, Bc, { x: -2.53, z: -6.8, dir: [0, 1], width: 0.86, run: 3.9, y0: CF, y1: Y.g, steps: 16, rail: 'both', sideCollide: 'both', tread: 'fl_cellar', riser: 'woodRough', side: 'woodRough', tag: 'wood', topNewel: false });
  Bc.quad('woodRough', V(-2, CT, -7.85), V(-3.05, CT, -7.85), V(-3.05, Y.g, -7.85), V(-2, Y.g, -7.85));
}

// -------------------------------------------------------------- the outside
function shell(ctx, H) {
  const Be = ctx.B.ext;
  // foundation band (stone) just proud of the siding
  const fnd = (x1, z1, x2, z2, openings = []) => {
    const W0 = wallFrame(x1, z1, x2, z2, 0.12);
    const ox = W0.nx * 0.15;
    const oz = W0.nz * 0.15;
    const W = wall(ctx, Be, x1 + ox, z1 + oz, x2 + ox, z2 + oz, -0.45, 0.78, { t: 0.12, a: 'stone', b: null, edge: 'stone', openings, collide: false });
    const mid = wallPoint(W, W.L / 2, 0.8, 0.05);
    Be.box('trim', mid.x, mid.y, mid.z, W.L + 0.1, 0.06, 0.14, W.ry);
    return W;
  };
  const cwin = (at) => ({ at, w: 0.7, y0: 0.08, y1: 0.5, kind: 'window' });
  fnd(-7, -8, -7, 8.5, [cwin(2.0), cwin(6.0)]);
  fnd(-7, 8.5, -2, 8.5);
  fnd(7, -8, -7, -8, [cwin(2.0), cwin(12.0)]);
  fnd(7, 3.875, 7, -0.9, []);
  fnd(7, -2.05, 7, -8, [cwin(4.0)]);
  for (const [p, q] of turretOuterSegments()) fnd(q[0], q[1], p[0], p[1]);
  // cornice with brackets around the main block
  const cornice = (x1, z1, x2, z2) => {
    const W = wallFrame(x1, z1, x2, z2, 0.1);
    const c = wallPoint(W, W.L / 2, 8.25, 0.3);
    Be.box({ all: 'trim', py: 'trimDark' }, c.x, c.y, c.z, W.L + 0.5, 0.36, 0.5, W.ry);
    const f = wallPoint(W, W.L / 2, 8.03, 0.17);
    Be.box('trim', f.x, f.y, f.z, W.L, 0.28, 0.06, W.ry);
    const br = new THREE.Shape();
    br.moveTo(0, 0);
    br.lineTo(0.42, 0);
    br.quadraticCurveTo(0.42, -0.12, 0.3, -0.14);
    br.quadraticCurveTo(0.1, -0.16, 0.12, -0.36);
    br.lineTo(0, -0.38);
    br.closePath();
    for (let s = 0.45; s < W.L - 0.2; s += 0.95) {
      for (const off of [-0.06, 0.06]) {
        const p = wallPoint(W, s + off, 8.07, 0.15);
        Be.push(mat(p.x, p.y, p.z, W.ry - Math.PI / 2));
        Be.shape({ front: 'trim', back: 'trim', side: 'trim' }, br, 0.05, mat(0, 0, -0.025));
        Be.pop();
      }
    }
  };
  cornice(-2, 6, 4.875, 6);
  cornice(7, 3.875, 7, -8);
  cornice(7, -8, -7, -8);
  cornice(-7, -8, -7, 6);
  // roof deck (widow's walk)
  const D = Y.deck;
  Be.boxMM({ py: 'fl_porch', ny: null, all: 'trim' }, -6.2, Y.atticTop, -7.2, 4.875, D, 5.2);
  Be.boxMM({ py: 'fl_porch', ny: null, all: 'trim' }, 4.875, Y.atticTop, -7.2, 6.2, D, 3.875);
  ctx.col.addFloor(-6.15, 4.875, -7.15, 5.15, D, 'wood');
  ctx.col.addFloor(4.875, 6.15, -7.15, 3.875, D, 'wood');
  for (const [x1, z1, x2, z2] of [
    [-6.3, 5.3, 4.8, 5.3],
    [6.3, 3.8, 6.3, -7.3],
    [6.3, -7.3, -6.3, -7.3],
    [-6.3, -7.3, -6.3, 5.3],
  ]) {
    const W = wallFrame(x1, z1, x2, z2, 0.1);
    const c = wallPoint(W, W.L / 2, D - 0.05, 0);
    Be.box('trim', c.x, c.y, c.z, W.L + 0.2, 0.22, 0.24, W.ry);
    cresting(ctx, Be, x1, z1, x2, z2, D, { h: 0.95 });
  }
  // roof hatch
  Be.boxMM({ all: 'woodRough', py: 'woodDark' }, -1.0, D, -0.5, 0.0, D + 0.25, 0.5);
  H.hatch = { deck: V(-0.5, D, 1.2), attic: V(-0.5, Y.attic, 1.0) };
  // gable wing roof and front gable
  gableWing(ctx, Be);
  // turret top storey and cone roof
  turretTop(ctx, Be, H);
  // chimneys
  chimney(Be, 7.15, 7.85, 1.3, 2.5, -0.3, 13.0, true);
  chimney(Be, -4.6, -3.8, -2.4, -1.6, Y.atticTop, 13.1);
  chimney(Be, 3.0, 3.8, -6.4, -5.6, Y.atticTop, 12.8);
  ctx.col.addBox(-4.6, D, -2.4, -3.8, 13.1, -1.6);
  ctx.col.addBox(3.0, D, -6.4, 3.8, 12.8, -5.6);
  // fillers where the gable roof meets the mansard
  triToward(Be, 'shingle', V(-7.4, 8.4, 5.2), V(-6.2, 11.0, 5.2), V(-4.5, 11.0, 5.2), V(0, 0, 1));
  triToward(Be, 'shingle', V(-4.5, 11.0, 5.2), V(-2.0, 11.0, 5.2), V(-2.0, 8.62, 5.2), V(0, 0, 1));
  triToward(Be, 'shingle', V(-2.0, 8.45, 6.4), V(-2.0, 11.0, 5.2), V(-2.0, 8.62, 5.2), V(-1, 0, 0));
  porch(ctx, Be, H);
  sidePorch(ctx, Be);
}

function chimney(Be, x0, x1, z0, z1, y0, y1, base = false) {
  if (base) Be.boxMM('stone', x0 - 0.08, y0, z0 - 0.08, x1 + 0.08, 0.85, z1 + 0.08);
  Be.boxMM('brick', x0, base ? 0.85 : y0, z0, x1, y1, z1);
  Be.boxMM('brick', x0 - 0.1, y1 - 0.12, z0 - 0.1, x1 + 0.1, y1 + 0.14, z1 + 0.1);
  Be.boxMM('brick', x0 - 0.05, y1 - 0.5, z0 - 0.05, x1 + 0.05, y1 - 0.38, z1 + 0.05);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  for (const dx of [-0.16, 0.16]) Be.cyl('brick', cx + dx, y1 + 0.38, cz, 0.08, 0.11, 0.48, 8, { open: true });
}

function gableWing(ctx, Be) {
  const x0 = -7.4;
  const x1 = -1.6;
  const xr = -4.5;
  const ye = 8.3;
  const yr = 11.0;
  const zf = 9.0;
  const zb = 5.2;
  const Ba = ctx.B.at;
  const L = [V(x0, ye, zb), V(x0, ye, zf), V(xr, yr, zf), V(xr, yr, zb)];
  const R = [V(x1, ye, zf), V(x1, ye, zb), V(xr, yr, zb), V(xr, yr, zf)];
  quadToward(Be, 'shingle', ...L, V(-1, 1, 0));
  quadToward(Be, 'shingle', ...R, V(1, 1, 0));
  const dn = (p) => p.clone().add(V(0, -0.16, 0));
  quadToward(Ba, 'woodRough', ...L.map(dn), V(1, -1, 0));
  quadToward(Ba, 'woodRough', ...R.map(dn), V(-1, -1, 0));
  // fascia along the eaves
  Be.boxMM('trim', x0 - 0.04, ye - 0.22, zb, x0 + 0.04, ye + 0.02, zf);
  Be.boxMM('trim', x1 - 0.04, ye - 0.22, zb, x1 + 0.04, ye + 0.02, zf);
  // gable wall with an arched attic window
  const sh = new THREE.Shape();
  sh.moveTo(-7.15, 8.3);
  sh.lineTo(-1.85, 8.3);
  sh.lineTo(-1.85, 8.55);
  sh.lineTo(-4.5, 10.85);
  sh.lineTo(-7.15, 8.55);
  sh.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-5.0, 8.8);
  hole.lineTo(-4.0, 8.8);
  hole.lineTo(-4.0, 9.7);
  hole.absarc(-4.5, 9.7, 0.5, 0, Math.PI, false);
  hole.lineTo(-5.0, 8.8);
  sh.holes.push(hole);
  Be.shape({ front: 'siding', back: null, side: 'trim' }, sh, 0.15, mat(0, 0, 8.5), { curveSegments: 14 });
  Ba.shape({ front: null, back: 'woodRough', side: null }, sh, 0.15, mat(0, 0, 8.36), { curveSegments: 14 });
  // arched glass + frame
  const gs = new THREE.Shape();
  gs.moveTo(-5.0, 8.8);
  gs.lineTo(-4.0, 8.8);
  gs.lineTo(-4.0, 9.7);
  gs.absarc(-4.5, 9.7, 0.5, 0, Math.PI, false);
  gs.closePath();
  const gg = new THREE.ShapeGeometry(gs, 14);
  Be.geom('glass', gg, mat(0, 0, 8.57), { worldUV: true });
  gg.dispose();
  Be.box('trim', -4.5, 9.4, 8.6, 0.04, 1.2, 0.05);
  Be.box('trim', -4.5, 9.45, 8.6, 1.0, 0.04, 0.05);
  const ring = new THREE.TorusGeometry(0.53, 0.05, 6, 16, Math.PI);
  Be.geom('trim', ring, mat(-4.5, 9.7, 8.66));
  ring.dispose();
  Be.box('trim', -4.5, 8.74, 8.7, 1.25, 0.06, 0.16);
  ctx.house.windows.push({ center: V(-4.5, 9.4, 8.5), w: 1.0, h: 1.3, inward: V(0, 0, -1), level: 'attic' });
  // scalloped barge boards
  const rake = (xa, ya, xb, yb) => {
    const len = Math.hypot(xb - xa, yb - ya);
    const bs = new THREE.Shape();
    bs.moveTo(0, 0);
    bs.lineTo(len, 0);
    const n = Math.floor(len / 0.3);
    bs.lineTo(len, -0.12);
    for (let i = n; i > 0; i--) {
      const x = (i / n) * len;
      const xm = ((i - 0.5) / n) * len;
      bs.quadraticCurveTo(x - 0.02, -0.32, xm, -0.32);
      bs.quadraticCurveTo(((i - 1) / n) * len + 0.02, -0.32, ((i - 1) / n) * len, -0.12);
    }
    bs.lineTo(0, 0);
    for (let i = 0; i < n; i++) {
      const hp = new THREE.Path();
      hp.absarc(((i + 0.5) / n) * len, -0.17, 0.045, 0, Math.PI * 2, false);
      bs.holes.push(hp);
    }
    const ang = Math.atan2(yb - ya, xb - xa);
    Be.shape({ front: 'trim', back: 'trim', side: 'trim' }, bs, 0.05, mat(xa, ya + 0.02, zf - 0.08, 0, 0, ang));
  };
  rake(x0, ye, xr, yr);
  rake(xr, yr, x1, ye);
  // king post with a sunburst in the peak
  Be.box('trim', xr, yr - 0.5, zf - 0.06, 0.12, 1.4, 0.1);
  Be.cyl('trim', xr, yr + 0.55, zf - 0.06, 0.02, 0.05, 0.7, 6);
  Be.sphere('trim', xr, yr + 0.92, zf - 0.06, 0.06);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (Math.PI * (i + 0.5)) / 9;
    Be.push(mat(xr, yr - 0.35, zf - 0.1, 0, 0, a + Math.PI / 2));
    Be.box('trim', 0, -0.45, 0, 0.035, 0.9, 0.03);
    Be.pop();
  }
  Be.box('trim', xr, yr - 1.05, zf - 0.1, 2.7, 0.07, 0.06);
}

function turretTop(ctx, Be, H) {
  const v = turretVerts();
  const y0 = Y.attic;
  const y1 = 11.8;
  for (let k = 0; k < 8; k++) {
    const p = v[k];
    const q = v[(k + 1) % 8];
    const openings = k === 1 || k === 7 ? [{ at: 0.88, w: 0.7, y0: 9.5, y1: 10.2, kind: 'window' }] : [];
    const W = wall(ctx, Be, q[0], q[1], p[0], p[1], y0, y1, { t: EXT, a: 'siding', b: 'plaster', edge: 'trim', openings });
    if (openings.length) {
      // round oculus look: a ring over a square opening
      const c = wallPoint(W, 0.88, 9.85, EXT / 2 + 0.03);
      const ring = new THREE.TorusGeometry(0.42, 0.06, 6, 20);
      Be.geom('trim', ring, mat(c.x, c.y, c.z, W.ry));
      ring.dispose();
      const g = wallPoint(W, 0.88, 9.85, 0);
      Be.push(mat(g.x, g.y, g.z, W.ry));
      Be.quad('glass', V(-0.35, -0.35, 0), V(0.35, -0.35, 0), V(0.35, 0.35, 0), V(-0.35, 0.35, 0));
      Be.box('trim', 0, 0, 0, 0.7, 0.04, 0.05);
      Be.box('trim', 0, 0, 0, 0.04, 0.7, 0.05);
      Be.pop();
    }
    // cornice band
    const c = wallPoint(W, W.L / 2, y1 - 0.12, EXT / 2 + 0.15);
    Be.box('trim', c.x, c.y, c.z, W.L + 0.32, 0.26, 0.32, W.ry);
    const c2 = wallPoint(W, W.L / 2, Y.attic - 0.1, EXT / 2 + 0.2);
    Be.box('trim', c2.x, c2.y, c2.z, W.L + 0.36, 0.3, 0.4, W.ry);
  }
  floorPoly(Be, 'plaster', v, y1 - 0.02, false);
  floorPoly(Be, 'woodRough', v, y0 + 0.01, true);
  // conical roof
  const h = 4.7;
  const cone = new THREE.ConeGeometry(TURRET.R + 0.45, h, 8, 6, true, (67.5 * Math.PI) / 180);
  Be.geom('shingle', cone, mat(TURRET.cx, y1 + h / 2, TURRET.cz), { uvScale: [Math.PI * 2 * (TURRET.R + 0.45), Math.hypot(h, TURRET.R + 0.45)] });
  cone.dispose();
  const under = new THREE.ConeGeometry(TURRET.R + 0.45, 0.4, 8, 1, true, (67.5 * Math.PI) / 180);
  Be.geom('trim', under, mat(TURRET.cx, y1 - 0.02, TURRET.cz, 0, Math.PI));
  under.dispose();
  const ty = y1 + h;
  Be.lathe(
    'iron',
    [
      [0, -0.1],
      [0.09, -0.1],
      [0.06, 0.1],
      [0.03, 0.25],
      [0.07, 0.35],
      [0.03, 0.45],
      [0.012, 0.95],
      [0, 1.0],
    ],
    8,
    mat(TURRET.cx, ty, TURRET.cz)
  );
  H.vaneBase = V(TURRET.cx, ty + 0.62, TURRET.cz);
}

function porch(ctx, Be, H) {
  const P = Y.porch;
  const zf = 8.95;
  // deck
  Be.boxMM({ py: 'fl_porch', all: 'trimDark' }, -2.0, P - 0.15, 6.15, 4.95, P, zf);
  ctx.col.addFloor(-2.0, 4.95, 6.15, zf, P, 'wood');
  // missing boards
  for (const [x, z, w, d] of [
    [2.3, 7.4, 0.9, 0.14],
    [2.6, 7.6, 0.6, 0.14],
    [-1.4, 8.3, 0.5, 0.14],
    [3.8, 6.9, 0.7, 0.14],
  ]) {
    Be.box('blackMatte', x, P + 0.003, z, w, 0.004, d);
  }
  // lattice skirt
  for (let x = -1.95; x < 4.95; x += 0.32) {
    Be.push(mat(x, P / 2 - 0.08, zf - 0.02, 0, 0, 0.75));
    Be.box('trimDark', 0, 0, 0, 0.03, 1.1, 0.02);
    Be.pop();
    Be.push(mat(x, P / 2 - 0.08, zf - 0.04, 0, 0, -0.75));
    Be.box('trimDark', 0, 0, 0, 0.03, 1.1, 0.02);
    Be.pop();
  }
  Be.box('trimDark', 1.48, 0.02, zf - 0.03, 6.95, 0.06, 0.04);
  // steps
  stairs(ctx, Be, { x: 0, z: 10.75, dir: [0, -1], width: 2.4, run: 1.8, y0: 0, y1: P, steps: 5, rail: null, tread: 'fl_porch', riser: 'trimDark', side: 'trimDark', tag: 'wood', stringers: false });
  // turned columns
  const colAt = [-1.85, -1.0, 1.0, 2.6, 4.2];
  for (const x of colAt) {
    Be.lathe(
      'trim',
      [
        [0, 0],
        [0.12, 0],
        [0.12, 0.25],
        [0.08, 0.32],
        [0.07, 1.1],
        [0.095, 1.25],
        [0.06, 1.4],
        [0.07, 2.4],
        [0.1, 2.6],
        [0.1, 2.75],
        [0, 2.75],
      ],
      8,
      mat(x, P, 8.72)
    );
    ctx.col.addCircle(x, 8.72, 0.13, P, P + 3);
    // brackets
    for (const s of [-1, 1]) {
      const br = new THREE.Shape();
      br.moveTo(0, 0);
      br.lineTo(0.45, 0);
      br.quadraticCurveTo(0.12, -0.08, 0.04, -0.45);
      br.lineTo(0, -0.45);
      br.closePath();
      const hp = new THREE.Path();
      hp.absarc(0.13, -0.12, 0.05, 0, Math.PI * 2, false);
      br.holes.push(hp);
      Be.push(mat(x, P + 2.75, 8.72, s > 0 ? 0 : Math.PI));
      Be.shape({ front: 'trim', back: 'trim', side: 'trim' }, br, 0.04, mat(0.06, 0, -0.02));
      Be.pop();
    }
  }
  // frieze beam
  Be.boxMM('trim', -2.0, P + 2.75, 8.6, 4.95, P + 3.05, 8.86);
  Be.boxMM('trim', -2.0, P + 3.0, 6.15, -1.9, P + 3.05, 8.86);
  // shed roof
  const ry0 = 4.5;
  const ry1 = P + 3.1;
  quadToward(Be, 'shingleRect', V(-2.0, ry0, 6.15), V(4.95, ry0, 6.15), V(4.95, ry1, 9.15), V(-2.0, ry1, 9.15), V(0, 1, 0.3));
  quadToward(Be, 'trim', V(-2.0, ry0 - 0.12, 6.15), V(4.95, ry0 - 0.12, 6.15), V(4.95, ry1 - 0.12, 9.15), V(-2.0, ry1 - 0.12, 9.15), V(0, -1, 0));
  Be.boxMM('trim', -2.0, ry1 - 0.2, 9.1, 4.95, ry1 + 0.02, 9.2);
  // entry pediment over the steps
  const pz0 = 7.4;
  const pz1 = 9.35;
  const pw = 1.45;
  const ph = 4.95;
  const pe = ry1 + 0.05;
  quadToward(Be, 'shingleRect', V(-pw, pe, pz0), V(-pw, pe, pz1), V(0, ph, pz1), V(0, ph, pz0), V(-1, 1, 0));
  quadToward(Be, 'shingleRect', V(pw, pe, pz1), V(pw, pe, pz0), V(0, ph, pz0), V(0, ph, pz1), V(1, 1, 0));
  quadToward(Be, 'trim', V(-pw, pe - 0.1, pz0), V(-pw, pe - 0.1, pz1), V(0, ph - 0.1, pz1), V(0, ph - 0.1, pz0), V(1, -1, 0));
  quadToward(Be, 'trim', V(pw, pe - 0.1, pz1), V(pw, pe - 0.1, pz0), V(0, ph - 0.1, pz0), V(0, ph - 0.1, pz1), V(-1, -1, 0));
  const tri = new THREE.Shape();
  tri.moveTo(-pw + 0.1, 0);
  tri.lineTo(pw - 0.1, 0);
  tri.lineTo(0, ph - pe - 0.12);
  tri.closePath();
  Be.shape({ front: 'trim', back: 'trim', side: 'trim' }, tri, 0.12, mat(0, pe, pz1 - 0.2));
  // relief ornament: a fan in the pediment
  for (let i = 0; i < 7; i++) {
    const a = (Math.PI * (i + 0.5)) / 7;
    Be.push(mat(0, pe + 0.05, pz1 - 0.06, 0, 0, a - Math.PI / 2));
    Be.box('trimDark', 0, 0.28, 0, 0.04, 0.5, 0.03);
    Be.pop();
  }
  Be.sphere('trimDark', 0, pe + 0.06, pz1 - 0.06, 0.09, 1, 1, 0.4);
  // railings between columns (not across the steps)
  const rails = [
    [-1.85, -1.0],
    [1.0, 2.6],
    [2.6, 4.2],
    [4.2, 4.85],
  ];
  for (const [a, b] of rails) railing(ctx, Be, a, 8.72, b, 8.72, P, { mat: 'trim', h: 0.85, posts: false });
  railing(ctx, Be, -1.95, 6.2, -1.95, 8.72, P, { mat: 'trim', h: 0.85, posts: false, collide: false });
  // hanging lantern
  H.porchLamp = V(0, P + 2.55, 8.1);
  Be.cyl('ironBlack', 0, P + 2.88, 8.1, 0.008, 0.008, 0.5, 4);
  Be.box('ironBlack', 0, P + 2.62, 8.1, 0.2, 0.03, 0.2);
  Be.box('ironBlack', 0, P + 2.38, 8.1, 0.16, 0.03, 0.16);
  for (const [dx, dz] of [
    [-0.08, -0.08],
    [0.08, -0.08],
    [-0.08, 0.08],
    [0.08, 0.08],
  ]) {
    Be.box('ironBlack', dx, P + 2.5, 8.1 + dz, 0.015, 0.24, 0.015);
  }
  Be.box('glass', 0, P + 2.5, 8.1, 0.15, 0.22, 0.15);
}

function sidePorch(ctx, Be) {
  const P = Y.porch;
  Be.boxMM({ py: 'fl_porch', all: 'trimDark' }, -9.3, P - 0.15, 0.8, -7.15, P, 6.0);
  ctx.col.addFloor(-9.3, -7.15, 0.8, 6.0, P, 'wood');
  for (let z = 0.85; z < 6.0; z += 0.32) {
    Be.push(mat(-9.31, P / 2 - 0.08, z, Math.PI / 2, 0, 0.75));
    Be.box('trimDark', 0, 0, 0, 0.03, 1.1, 0.02);
    Be.pop();
  }
  stairs(ctx, Be, { x: -8.25, z: 7.6, dir: [0, -1], width: 1.6, run: 1.6, y0: 0, y1: P, steps: 5, rail: null, tread: 'fl_porch', riser: 'trimDark', side: 'trimDark', stringers: false });
  for (const z of [1.0, 3.4, 5.8]) {
    Be.lathe(
      'trim',
      [
        [0, 0],
        [0.1, 0],
        [0.1, 0.2],
        [0.06, 0.3],
        [0.06, 2.3],
        [0.09, 2.5],
        [0, 2.5],
      ],
      8,
      mat(-9.15, P, z)
    );
    ctx.col.addCircle(-9.15, z, 0.11, P, P + 3);
  }
  railing(ctx, Be, -9.15, 1.0, -9.15, 3.4, P, { mat: 'trim', h: 0.85, posts: false });
  railing(ctx, Be, -9.15, 3.4, -9.15, 5.8, P, { mat: 'trim', h: 0.85, posts: false });
  railing(ctx, Be, -9.15, 0.85, -7.2, 0.85, P, { mat: 'trim', h: 0.85, posts: false });
  railing(ctx, Be, -9.15, 5.95, -8.95, 5.95, P, { mat: 'trim', h: 0.85, posts: false });
  Be.boxMM('trim', -9.3, P + 2.5, 0.8, -9.0, P + 2.75, 6.0);
  quadToward(Be, 'shingleRect', V(-7.15, 4.3, 0.8), V(-7.15, 4.3, 6.05), V(-9.5, 3.55, 6.05), V(-9.5, 3.55, 0.8), V(-0.3, 1, 0));
  quadToward(Be, 'trim', V(-7.15, 4.18, 0.8), V(-7.15, 4.18, 6.05), V(-9.5, 3.43, 6.05), V(-9.5, 3.43, 0.8), V(0, -1, 0));
}
