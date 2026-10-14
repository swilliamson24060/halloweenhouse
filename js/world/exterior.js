import * as THREE from 'three';
import { GeoBuilder, mat } from '../core/geo.js';
import { RNG, makeNoise, smoothstep, clamp, lerp } from '../core/util.js';
import { stairs, cresting, wallFrame, wallPoint } from './build.js';

// The grounds: terrain, street, fence and gate, path, graveyard, the hill
// garden with its arbours, dead trees, grass, ivy and the cellar bulkhead.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const N = makeNoise(1871);

const CELLAR_HOLE = [-7, -8, 7, 6];
const PIT_HOLE = [7, -2, 11, 1];
const inRect = (x, z, r) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

export function terrainHeight(x, z) {
  let h = N.fbm(x * 0.045 + 3.1, z * 0.045 - 1.7, 3) * 0.32;
  // flatten around the house and the front walk
  const dx = Math.max(0, Math.abs(x - 1) - 11);
  const dz = Math.max(0, z > 0 ? z - 11 : -z - 10);
  h *= smoothstep(0, 7, Math.hypot(dx, dz));
  // the garden hill rising to the back left
  const r = Math.hypot((x + 25) / 1.15, z + 19);
  h += 6.2 * smoothstep(27, 3, r);
  // a low rise behind the graveyard
  const g = Math.hypot((x - 24) / 1.6, z + 24);
  h += 1.2 * smoothstep(14, 2, g);
  // street side is level
  h = lerp(h, 0, smoothstep(14.5, 16.4, z));
  if (z > 20.3) h = -0.13;
  return h;
}

function walkHeight(x, z) {
  if (inRect(x, z, CELLAR_HOLE) || inRect(x, z, PIT_HOLE)) return -Infinity;
  if (x < -36 || x > 36 || z < -36 || z > 27) return -Infinity;
  return terrainHeight(x, z);
}

export function buildExterior(ctx) {
  const rng = new RNG(1871);
  ctx.col.setTerrain(walkHeight, (x, z) => {
    if (Math.abs(x) < 0.9 && z > 10.6 && z < 16.7) return 'stone';
    if (z > 16.6) return 'stone';
    return 'grass';
  });
  // invisible bounds along the street
  ctx.col.addBox(-37, -5, 25.5, 37, 20, 27);
  ctx.col.addBox(-37, -5, 16.4, -33, 20, 27);
  ctx.col.addBox(33, -5, 16.4, 37, 20, 27);

  terrain(ctx);
  street(ctx, rng);
  fence(ctx, rng);
  gate(ctx);
  frontPath(ctx);
  graveyard(ctx, rng);
  garden(ctx, rng);
  trees(ctx, rng);
  brambles(ctx, rng);
  bulkhead(ctx);
  streetLamp(ctx);
  grass(ctx, rng);
  ivy(ctx, rng);

  ctx.yardName = (p) => {
    if (p.z > 16.6) return 'Ashgrove Lane';
    if (p.x > 10.5) return 'The Family Plot';
    if (p.x < -10 || p.z < -11) return 'The Old Garden';
    return 'Ravenmoor House';
  };
}

// ------------------------------------------------------------------ terrain
function terrain(ctx) {
  const size = 180;
  const seg = 180;
  const geo = new THREE.BufferGeometry();
  const pos = [];
  const uv = [];
  const idx = [];
  const half = size / 2;
  const step = size / seg;
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const x = -half + i * step;
      const z = -half + j * step;
      pos.push(x, terrainHeight(x, z), z);
      uv.push(x, -z);
    }
  }
  const row = seg + 1;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const cx = -half + (i + 0.5) * step;
      const cz = -half + (j + 0.5) * step;
      if (inRect(cx, cz, CELLAR_HOLE) || inRect(cx, cz, PIT_HOLE)) continue;
      if (cz > 20.5) continue; // street geometry covers this
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, ctx.mat.ground);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  ctx.scene.add(mesh);
  ctx.terrainMesh = mesh;
}

// ---------------------------------------------------------- street & walk
function street(ctx, rng) {
  const B = ctx.B.yard;
  B.planarQuad('asphalt', V(-90, -0.13, 40), V(90, -0.13, 40), V(90, -0.13, 20.3), V(-90, -0.13, 20.3));
  B.boxMM({ all: 'stone', ny: null }, -90, -0.2, 20.15, 90, 0.05, 20.45);
  // far kerb and verge
  B.boxMM({ all: 'stone', ny: null }, -90, -0.2, 30.6, 90, 0.05, 30.9);
  B.planarQuad('ground', V(-90, 0.04, 40), V(90, 0.04, 40), V(90, 0.04, 30.9), V(-90, 0.04, 30.9));
  // sidewalk slabs, a few tilted by roots
  for (let x = -60; x < 60; x += 1.5) {
    const tilt = Math.abs(x) < 34 && rng.chance(0.12) ? rng.float(-0.04, 0.04) : 0;
    const dy = tilt ? rng.float(0, 0.04) : 0;
    B.push(mat(x + 0.75, 0.0 + dy, 18.58, 0, tilt, rng.float(-0.01, 0.01)));
    B.box({ py: 'concrete', all: 'concrete', ny: null }, 0, 0, 0, 1.48, 0.08, 3.12, 0, { uvo: [rng.float(0, 3), rng.float(0, 3)] });
    B.pop();
  }
  ctx.col.addFloor(-36, 36, 16.95, 20.2, 0.04, 'stone');
  // stone kerb wall under the front fence
  B.boxMM({ all: 'stone', ny: null }, -32.3, -0.2, 16.35, -1.35, 0.42, 16.85);
  B.boxMM({ all: 'stone', ny: null }, 1.35, -0.2, 16.35, 32.3, 0.42, 16.85);
}

// ----------------------------------------------------------------- fence
function bars(B, rng, x1, z1, x2, z2, h, o = {}) {
  const W = wallFrame(x1, z1, x2, z2, 0.05);
  const n = Math.max(1, Math.round(W.L / 0.14));
  const spear = new THREE.ConeGeometry(0.024, 0.11, 4);
  const yAt = (s) => (o.base != null ? o.base : terrainHeight(x1 + W.ux * s, z1 + W.uz * s) - 0.05);
  for (let i = 0; i <= n; i++) {
    if (rng.chance(o.missing ?? 0.025)) continue;
    const s = (i / n) * W.L;
    const p = wallPoint(W, s, 0, 0);
    const y = yAt(s);
    const lean = rng.chance(0.06) ? rng.float(-0.12, 0.12) : 0;
    const hh = h + (i % 2 ? 0 : 0.06);
    B.push(mat(p.x, y, p.z, W.ry, 0, lean));
    B.rod('iron', 0, 0, 0, 0, hh, 0, 0.011, 0.011, 4);
    B.geom('iron', spear, mat(0, hh + 0.05, 0));
    B.pop();
  }
  spear.dispose();
  // rails, piecewise so they follow the ground
  const segs = Math.max(1, Math.round(W.L / 2.5));
  for (let k = 0; k < segs; k++) {
    const s0 = (k / segs) * W.L;
    const s1 = ((k + 1) / segs) * W.L;
    for (const ry of [0.22, h - 0.12]) {
      const a = wallPoint(W, s0, yAt(s0) + ry, 0);
      const b = wallPoint(W, s1, yAt(s1) + ry, 0);
      B.rod('iron', a.x, a.y, a.z, b.x, b.y, b.z, 0.016, 0.016, 4, { open: false });
    }
  }
  return W;
}

function pier(B, x, z, y, h = 2.0, w = 0.5) {
  B.boxMM({ all: 'stone', ny: null }, x - w / 2, y - 0.3, z - w / 2, x + w / 2, y + h, z + w / 2);
  B.boxMM('stone', x - w / 2 - 0.06, y + h, z - w / 2 - 0.06, x + w / 2 + 0.06, y + h + 0.1, z + w / 2 + 0.06);
  B.box('stone', x, y + h + 0.2, z, w * 0.6, 0.18, w * 0.6);
  B.sphere('stone', x, y + h + 0.42, z, w * 0.3, 1, 0.85, 1, 10, 7);
}

function fence(ctx, rng) {
  const B = ctx.B.yard;
  const H = 1.75;
  const col = ctx.col;
  // front, either side of the gate
  bars(B, rng, -32, 16.6, -1.4, 16.6, H, { base: 0.42 });
  bars(B, rng, 1.4, 16.6, 32, 16.6, H, { base: 0.42 });
  col.addBox(-32.2, -1, 16.45, -1.3, 3, 16.8);
  col.addBox(1.3, -1, 16.45, 32.2, 3, 16.8);
  for (let x = -32; x <= 32; x += 7.6) {
    if (Math.abs(x) < 2) continue;
    pier(B, x, 16.6, 0.4, 1.65, 0.42);
  }
  pier(B, -1.38, 16.6, 0.0, 2.25, 0.55);
  pier(B, 1.38, 16.6, 0.0, 2.25, 0.55);
  col.addBox(-1.7, -1, 16.3, -1.1, 3, 16.9);
  col.addBox(1.1, -1, 16.3, 1.7, 3, 16.9);
  // sides and back follow the slope
  const G = ctx.B.garden;
  bars(G, rng, -32, 16.6, -32, -32, H, { missing: 0.05 });
  bars(B, rng, 32, 16.6, 32, -32, H, { missing: 0.04 });
  bars(G, rng, -32, -32, 32, -32, H, { missing: 0.05 });
  col.addBox(-32.2, -5, -32.2, -31.8, 20, 16.8);
  col.addBox(31.8, -5, -32.2, 32.2, 20, 16.8);
  col.addBox(-32.2, -5, -32.2, 32.2, 20, -31.8);
}

// ------------------------------------------------------------------ gate
function gateLeaf(ctx, side) {
  const B = new GeoBuilder('gate');
  const w = 1.08;
  const n = 8;
  const spear = new THREE.ConeGeometry(0.026, 0.12, 4);
  for (let i = 0; i <= n; i++) {
    const x = side * (0.04 + (i / n) * (w - 0.06));
    const t = i / n;
    const h = 1.75 + Math.sin(t * Math.PI * 0.5) * 0.35;
    B.rod('iron', x, 0, 0, x, h, 0, 0.013, 0.013, 5);
    B.geom('iron', spear, mat(x, h + 0.05, 0));
  }
  for (const y of [0.15, 0.95, 1.6]) B.box('iron', (side * w) / 2, y, 0, w, 0.04, 0.035);
  B.box('iron', side * 0.03, 0.95, 0, 0.06, 1.9, 0.05);
  const ring = new THREE.TorusGeometry(0.16, 0.012, 4, 14);
  for (const x of [0.3, 0.72]) B.geom('iron', ring, mat(side * x, 1.28, 0));
  spear.dispose();
  ring.dispose();
  const g = B.build(ctx.mat);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

function gate(ctx) {
  const leaves = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(-side * 1.1, 0.0, 16.6);
    pivot.add(gateLeaf(ctx, side));
    ctx.scene.add(pivot);
    leaves.push({ pivot, side, angle: 0.06 * side, target: 0.06 * side });
  }
  const colGate = ctx.col.addBox(-1.1, -1, 16.5, 1.1, 3, 16.7);
  colGate.see = true;
  const G = {
    leaves,
    open: false,
    openGate(speed = 0.5) {
      if (G.open) return;
      G.open = true;
      for (const l of leaves) {
        l.target = l.side * 1.35;
        l.speed = speed;
      }
      ctx.audio.creak(V(0, 1.2, 16.6), { long: true, pitch: 0.55, metal: true, gain: 1.2 });
    },
    close() {
      G.open = false;
      for (const l of leaves) {
        l.target = 0.02 * l.side;
        l.speed = 3;
      }
    },
  };
  ctx.gate = G;
  ctx.interact.add({
    pos: V(0, 1.1, 16.6),
    radius: 0.8,
    range: 2.6,
    prompt: () => (G.open ? '' : 'Push the gate'),
    enabled: () => !G.open,
    onUse: () => G.openGate(0.9),
  });
  ctx.updaters.push((dt) => {
    let moving = false;
    for (const l of leaves) {
      const d = l.target - l.angle;
      if (Math.abs(d) > 1e-3) {
        l.angle += Math.sign(d) * Math.min(Math.abs(d), (l.speed || 0.5) * dt * (0.3 + Math.min(1, Math.abs(d))));
        moving = true;
      }
      l.pivot.rotation.y = l.angle;
    }
    colGate.enabled = !G.open || Math.abs(leaves[0].angle) < 0.5;
    if (moving) ctx.shadowDirty = true;
  });
}

function frontPath(ctx) {
  const B = ctx.B.yard;
  // flagstones from the gate to the porch steps, some heaved and cracked
  const rng = new RNG(51);
  for (let z = 10.75; z < 16.6; z += 0.62) {
    for (const x of [-0.42, 0.38]) {
      if (rng.chance(0.06)) continue;
      const w = rng.float(0.7, 0.86);
      const d = rng.float(0.52, 0.6);
      B.push(mat(x + rng.float(-0.05, 0.05), 0.02 + rng.float(0, 0.03), z + 0.3, rng.float(-0.12, 0.12), rng.float(-0.03, 0.03), rng.float(-0.03, 0.03)));
      B.box({ py: 'flag', all: 'flag', ny: null }, 0, 0, 0, w, 0.08, d, 0, { uvo: [rng.float(0, 2), rng.float(0, 2)] });
      B.pop();
    }
  }
  ctx.col.addFloor(-0.85, 0.85, 10.7, 16.65, 0.05, 'stone');
  // stepping stones toward the graveyard and around the side
  for (let i = 0; i < 14; i++) {
    const x = 2 + i * 0.75;
    const z = 13.2 - i * 0.55 + Math.sin(i) * 0.3;
    const y = terrainHeight(x, z);
    B.push(mat(x, y + 0.02, z, rng.float(0, 3)));
    B.cyl('flag', 0, 0, 0, 0.32, 0.34, 0.08, 9);
    B.pop();
  }
}

// -------------------------------------------------------------- graveyard
const EPITAPHS = [
  ['ELEANOR', 'RAVENMOOR', '1849 – 1889', 'She keeps watch'],
  ['JOSIAH', 'RAVENMOOR', '1841 – 1888', 'Lost at sea. No body lies here.'],
  ['CLARA', 'beloved daughter', '1880 – 1889', 'Gone to play'],
  ['THOMAS', 'beloved son', '1878 – 1889', 'He was not afraid'],
  ['AGNES WHITBY', 'housekeeper', '1822 – 1890', 'Faithful past the end'],
  ['SILAS CROWE', 'groundskeeper', '1799 – 1866', 'He listened at doors'],
  ['HENRIETTA VALE', '1830 – 1879', 'Asleep, not gone'],
  ['MOTHER', '', '', 'Do not wake her'],
  ['EDGAR PELL', '1802 – 1871', 'First to fall', 'from the roof'],
  ['IN MEMORY OF', 'AN INFANT', '1884', 'Unnamed'],
  ['R . I . P', '', '', ''],
  ['MARGARET', 'ASHGROVE', '1811 – 1870', 'Weep not'],
  ['WILLIAM', 'HOLLOWAY', '1838 – 1873', 'Called home'],
  ['UNKNOWN', 'found on the', 'lane, 1891', ''],
  ['', '', '', ''],
  ['YOU', '', '', 'Not yet'],
];

function tombstone(B, shape, x, y, z, ry, w, h, cell, rng) {
  const lean = rng.float(-0.14, 0.14);
  const tip = rng.float(-0.08, 0.08);
  B.push(mat(x, y - 0.12, z, ry, tip, lean));
  const col = cell % 4;
  const row = Math.floor(cell / 4);
  const u0 = col / 4;
  const v0 = 1 - (row + 1) / 4;
  const capUV = (u, v) => [u0 + ((u + w / 2) / w) * 0.25, v0 + clamp(v / h, 0, 1) * 0.25];
  const keys = { front: 'tomb', back: 'tombStone', side: 'tombStone' };
  if (shape === 'round' || shape === 'gothic' || shape === 'slab') {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, 0);
    sh.lineTo(w / 2, 0);
    if (shape === 'round') {
      sh.lineTo(w / 2, h - w / 2);
      sh.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    } else if (shape === 'gothic') {
      sh.lineTo(w / 2, h * 0.7);
      sh.quadraticCurveTo(w / 2, h * 0.92, 0, h);
      sh.quadraticCurveTo(-w / 2, h * 0.92, -w / 2, h * 0.7);
    } else {
      sh.lineTo(w / 2, h * 0.86);
      sh.lineTo(w * 0.36, h * 0.86);
      sh.lineTo(w * 0.36, h);
      sh.lineTo(-w * 0.36, h);
      sh.lineTo(-w * 0.36, h * 0.86);
      sh.lineTo(-w / 2, h * 0.86);
    }
    sh.closePath();
    B.shape(keys, sh, 0.13, mat(0, 0, -0.065), { capUV, curveSegments: 12 });
    B.boxMM('tombStone', -w / 2 - 0.06, -0.05, -0.12, w / 2 + 0.06, 0.12, 0.12);
  } else if (shape === 'cross') {
    B.boxMM('tombStone', -0.32, -0.05, -0.2, 0.32, 0.22, 0.2);
    B.box('tombStone', 0, 0.22 + h / 2, 0, 0.13, h, 0.12);
    B.box('tombStone', 0, 0.22 + h * 0.72, 0, 0.52, 0.12, 0.12);
  } else if (shape === 'obelisk') {
    B.boxMM('tombStone', -0.38, -0.05, -0.38, 0.38, 0.35, 0.38);
    B.boxMM({ pz: 'tomb', all: 'tombStone' }, -0.26, 0.35, -0.26, 0.26, 0.85, 0.26, { uv: { pz: [u0, v0, u0 + 0.25, v0, u0 + 0.25, v0 + 0.25, u0, v0 + 0.25] } });
    B.cyl('tombStone', 0, 0.85 + h / 2, 0, 0.09, 0.18, h, 4, { ry: Math.PI / 4 });
    B.cyl('tombStone', 0, 0.85 + h + 0.1, 0, 0, 0.13, 0.2, 4, { ry: Math.PI / 4 });
  }
  B.pop();
}

function graveyard(ctx, rng) {
  const B = ctx.B.grave;
  const atlas = ctx.tex.makeTomb(EPITAPHS);
  ctx.mat.tomb = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.95 });
  ctx.mat.tombStone = new THREE.MeshStandardMaterial({ map: ctx.tex.stone.map, bumpMap: ctx.tex.stone.bump, bumpScale: 1.4, roughness: 0.96, color: 0x9a9890 });
  const shapes = ['round', 'gothic', 'slab', 'round', 'cross', 'round', 'slab', 'obelisk', 'gothic', 'round', 'cross', 'slab', 'round', 'gothic', 'round', 'slab'];
  const spots = [];
  const R2 = new RNG(77);
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k < 5; k++) {
      const x = 13 + k * 3.2 + R2.float(-0.6, 0.6);
      const z = 11 - row * 5.5 + R2.float(-0.8, 0.8);
      if (x > 21 && z < -9) continue; // mausoleum
      if (R2.chance(0.12)) continue;
      spots.push([x, z]);
    }
  }
  ctx.graves = [];
  spots.forEach(([x, z], i) => {
    const cell = i % 16;
    const shape = shapes[i % shapes.length];
    const w = R2.float(0.55, 0.78);
    const h = shape === 'cross' ? R2.float(0.9, 1.2) : shape === 'obelisk' ? R2.float(1.2, 1.7) : R2.float(0.75, 1.15);
    const y = terrainHeight(x, z);
    const ry = R2.float(-0.2, 0.2) + (R2.chance(0.15) ? Math.PI : 0);
    tombstone(B, shape, x, y, z, ry, w, h, cell, R2);
    ctx.col.addOBB(x, z, w / 2 + 0.08, 0.14, -ry, y - 0.5, y + h);
    ctx.graves.push(V(x, y, z));
    // sunken grave plot in front
    B.push(mat(x, y + 0.01, z + 1.0, ry));
    B.box({ py: 'dirt', all: 'dirt', ny: null }, 0, -0.02, 0, 0.8, 0.06, 1.7);
    B.pop();
  });
  // a fresh grave with a shovel and a blank stone
  const fx = 16.2;
  const fz = 2.6;
  const fy = terrainHeight(fx, fz);
  B.sphere('dirt', fx, fy - 0.1, fz + 1.0, 0.9, 0.75, 0.38, 1.25);
  B.push(mat(fx + 0.5, fy + 0.5, fz + 1.4, 0.4, 0.2, 0.15));
  B.cyl('woodRough', 0, 0.3, 0, 0.02, 0.02, 1.0, 5);
  B.box('iron', 0, -0.32, 0, 0.22, 0.3, 0.02);
  B.pop();
  ctx.freshGrave = V(fx, fy, fz + 1);
  // mausoleum
  mausoleum(ctx, B, 23.5, -15.5);
  // family plot railing
  const py = terrainHeight(17, -5);
  for (const [a, b, c, d] of [
    [14.2, -8.2, 20.2, -8.2],
    [20.2, -8.2, 20.2, -2.0],
    [14.2, -2.0, 14.2, -8.2],
    [14.2, -2.0, 16.4, -2.0],
    [18.0, -2.0, 20.2, -2.0],
  ]) {
    cresting(ctx, B, a, b, c, d, py - 0.05, { h: 0.75, mat: 'iron' });
  }
  // weeping angel
  angel(ctx, B, 19.5, 8.5, rng);
}

function mausoleum(ctx, B, x, z) {
  const y = terrainHeight(x, z) - 0.2;
  B.push(mat(x, y, z));
  B.boxMM({ all: 'tombStone', ny: null }, -1.9, -0.3, -2.4, 1.9, 0.35, 2.4);
  B.boxMM({ all: 'tombStone', ny: null }, -1.6, 0.35, -2.2, 1.6, 3.2, 1.6);
  // columns and porch
  for (const cx of [-1.3, 1.3]) {
    B.lathe(
      'tombStone',
      [
        [0, 0],
        [0.2, 0],
        [0.2, 0.12],
        [0.15, 0.2],
        [0.13, 2.5],
        [0.18, 2.62],
        [0.2, 2.75],
        [0, 2.75],
      ],
      10,
      mat(cx, 0.35, 2.05)
    );
  }
  B.boxMM('tombStone', -1.75, 3.1, -2.3, 1.75, 3.35, 2.35);
  const ped = new THREE.Shape();
  ped.moveTo(-1.85, 0);
  ped.lineTo(1.85, 0);
  ped.lineTo(0, 0.9);
  ped.closePath();
  B.shape({ front: 'tombStone', back: 'tombStone', side: 'tombStone' }, ped, 4.6, mat(0, 3.35, -2.3));
  // name plate
  B.boxMM({ pz: 'tomb', all: 'tombStone' }, -0.75, 2.62, 1.6, 0.75, 2.98, 1.66, { uv: { pz: [0.03, 0.882, 0.22, 0.882, 0.22, 0.912, 0.03, 0.912] } });
  // iron door
  B.boxMM('ironBlack', -0.62, 0.35, 1.58, 0.62, 2.45, 1.64);
  for (let i = 0; i < 6; i++) B.cyl('iron', -0.5 + i * 0.2, 1.4, 1.66, 0.012, 0.012, 2.0, 4);
  B.pop();
  ctx.col.addBox(x - 1.95, y - 1, z - 2.45, x + 1.95, y + 4.5, z + 2.45);
  ctx.mausoleumDoor = V(x, y + 1.4, z + 1.7);
}

function angel(ctx, B, x, z, rng) {
  const y = terrainHeight(x, z);
  B.push(mat(x, y, z, Math.PI + 0.3));
  B.boxMM('tombStone', -0.4, -0.2, -0.4, 0.4, 0.55, 0.4);
  B.lathe(
    'tombStone',
    [
      [0, 0],
      [0.32, 0],
      [0.3, 0.3],
      [0.22, 0.9],
      [0.16, 1.25],
      [0.18, 1.38],
      [0.06, 1.48],
      [0, 1.5],
    ],
    12,
    mat(0, 0.55, 0, 0, 0, 0, 1, 1, 0.8)
  );
  // bowed head with hands over the face
  B.sphere('tombStone', 0, 2.16, 0.08, 0.12, 1, 1.15, 1);
  B.sphere('tombStone', 0, 2.08, 0.18, 0.09, 1.3, 0.8, 0.7);
  for (const s of [-1, 1]) {
    B.push(mat(s * 0.14, 1.75, -0.08, s * 0.35, -0.3, s * 0.2));
    const wing = new THREE.Shape();
    wing.moveTo(0, 0);
    wing.quadraticCurveTo(0.5, 0.35, 0.35, 0.95);
    wing.quadraticCurveTo(0.25, 0.4, 0.1, -0.7);
    wing.closePath();
    B.shape({ front: 'tombStone', back: 'tombStone', side: 'tombStone' }, wing, 0.05, mat(0, 0, 0, 0, 0, 0, s, 1, 1));
    B.pop();
  }
  B.pop();
  ctx.col.addCircle(x, z, 0.5, y - 1, y + 2.5);
  ctx.angel = V(x, y, z);
}

// ----------------------------------------------------------------- garden
function blob(rng, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const n2 = makeNoise(rng.int(1, 9999));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + n2.noise(x * 2.1 + 3, z * 2.1 + y * 1.7) * 0.22 + n2.noise(x * 5.3, y * 5.1) * 0.08;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function garden(ctx, rng) {
  const G = ctx.B.garden;
  // hedges: rows of overgrown shrub masses terraced on the hill
  const bushes = [];
  const rows = [
    { cx: -25, cz: -19, r: 9, a0: -0.2, a1: 2.6, n: 14 },
    { cx: -25, cz: -19, r: 14, a0: -0.5, a1: 2.9, n: 20 },
    { cx: -25, cz: -19, r: 19, a0: -0.7, a1: 2.4, n: 22 },
  ];
  for (const R of rows) {
    for (let i = 0; i < R.n; i++) {
      const a = lerp(R.a0, R.a1, i / (R.n - 1)) + rng.float(-0.04, 0.04);
      const x = R.cx + Math.cos(a) * R.r;
      const z = R.cz + Math.sin(a) * R.r;
      if (x > -11 && z > -12) continue;
      if (x < -31 || z < -31 || x > 31) continue;
      if (rng.chance(0.1)) continue;
      bushes.push([x, z, rng.float(0.9, 1.5), rng.float(0.8, 1.2)]);
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = rng.float(-30, -12);
    const z = rng.float(-30, 10);
    bushes.push([x, z, rng.float(0.6, 1.3), rng.float(0.6, 1.1)]);
  }
  // shrubs along the house
  for (const [x, z] of [
    [-9.8, -6],
    [-9.9, -3.2],
    [-10.2, 7.5],
    [-6.5, 9.6],
    [-4, 9.8],
    [3.5, 9.9],
    [9.8, 9.2],
    [10.4, -5],
    [6, -9.8],
    [-3, -9.9],
  ]) {
    bushes.push([x, z, rng.float(0.6, 1.0), rng.float(0.55, 0.9)]);
  }
  const geos = [blob(rng), blob(rng), blob(rng)];
  for (let gi = 0; gi < geos.length; gi++) {
    const mine = bushes.filter((_, i) => i % geos.length === gi);
    const mesh = new THREE.InstancedMesh(geos[gi], ctx.mat.hedge, mine.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    mine.forEach(([x, z, s, hs], i) => {
      const y = terrainHeight(x, z);
      q.setFromEuler(new THREE.Euler(0, rng.float(0, 6.28), 0));
      m.compose(V(x, y + hs * 0.55, z), q, V(s, hs, s * rng.float(0.8, 1.2)));
      mesh.setMatrixAt(i, m);
      ctx.col.addCircle(x, z, s * 0.8, y - 1, y + hs * 1.4);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ctx.scene.add(mesh);
  }
  // arbours / pergolas along the old garden walk
  const arbours = [
    [-14, -4, 0.3],
    [-16.5, -9.5, 0.6],
    [-19, -15, 0.9],
    [-23, -9, 1.6],
    [-27, -4.5, 1.2],
    [-12.5, 2.5, -0.2],
  ];
  ctx.arbours = [];
  for (const [x, z, ry] of arbours) {
    arbour(ctx, G, x, z, ry, rng);
    ctx.arbours.push(V(x, terrainHeight(x, z), z));
  }
  // stepping stones up the hill
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const x = lerp(-10, -26, t) + Math.sin(t * 7) * 1.2;
    const z = lerp(1, -14, t) + Math.cos(t * 5) * 1.5;
    const y = terrainHeight(x, z);
    G.push(mat(x, y + 0.03, z, rng.float(0, 3)));
    G.cyl('flag', 0, 0, 0, 0.36, 0.4, 0.1, 9);
    G.pop();
  }
  // dry fountain near the side porch
  const fx = -13.5;
  const fz = 4.5;
  const fy = terrainHeight(fx, fz);
  G.lathe(
    'tombStone',
    [
      [0, 0],
      [1.4, 0],
      [1.45, 0.45],
      [1.3, 0.5],
      [1.25, 0.15],
      [0.3, 0.12],
      [0.2, 0.9],
      [0.55, 1.05],
      [0.6, 1.2],
      [0.15, 1.15],
      [0.1, 1.6],
      [0.18, 1.75],
      [0, 1.8],
    ],
    20,
    mat(fx, fy - 0.05, fz)
  );
  ctx.col.addCircle(fx, fz, 1.45, fy - 1, fy + 0.5);
  // urns on pedestals
  for (const [x, z] of [
    [-11.5, -1],
    [-11.5, 10],
  ]) {
    const y = terrainHeight(x, z);
    G.boxMM('tombStone', x - 0.25, y - 0.1, z - 0.25, x + 0.25, y + 0.9, z + 0.25);
    G.lathe(
      'tombStone',
      [
        [0, 0],
        [0.14, 0],
        [0.1, 0.1],
        [0.28, 0.35],
        [0.3, 0.5],
        [0.22, 0.6],
        [0.26, 0.66],
        [0, 0.66],
      ],
      12,
      mat(x, y + 0.9, z)
    );
    ctx.col.addBox(x - 0.3, y - 1, z - 0.3, x + 0.3, y + 1.6, z + 0.3);
  }
}

function arbour(ctx, B, x, z, ry, rng) {
  const y = terrainHeight(x, z);
  B.push(mat(x, y, z, ry));
  const w = 1.6;
  const d = 0.9;
  const h = 2.4;
  for (const sx of [-w / 2, w / 2]) {
    for (const sz of [-d / 2, d / 2]) {
      B.box('woodRough', sx, h / 2 - 0.2, sz, 0.09, h + 0.4, 0.09);
    }
    // lattice sides
    for (let i = -3; i <= 3; i++) {
      B.push(mat(sx, h * 0.5, i * 0.12, 0, 0.7));
      B.box('woodRough', 0, 0, 0, 0.025, 2.3, 0.025);
      B.pop();
      B.push(mat(sx, h * 0.5, i * 0.12, 0, -0.7));
      B.box('woodRough', 0, 0, 0, 0.025, 2.3, 0.025);
      B.pop();
    }
  }
  // arched top made of short segments
  for (const sz of [-d / 2, d / 2]) {
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI;
      const a1 = ((i + 1) / 8) * Math.PI;
      B.rod('woodRough', Math.cos(a0) * (w / 2), h + Math.sin(a0) * 0.6, sz, Math.cos(a1) * (w / 2), h + Math.sin(a1) * 0.6, sz, 0.045, 0.045, 4, { open: false });
    }
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI;
    B.box('woodRough', Math.cos(a) * (w / 2), h + Math.sin(a) * 0.6, 0, 0.05, 0.05, d + 0.25);
  }
  B.pop();
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const sx of [-w / 2, w / 2]) {
    ctx.col.addCircle(x + c * sx, z - s * sx, 0.12, y - 1, y + 3);
  }
}

// ------------------------------------------------------------------ trees
function growTree(B, rng, x, y, z, scale, key = 'bark', levels = 5) {
  const tmp = new THREE.Vector3();
  const branch = (p, dir, len, r, depth) => {
    const segs = depth >= 4 ? 4 : 3;
    let cur = p.clone();
    const d = dir.clone();
    for (let s = 0; s < segs; s++) {
      const next = cur.clone().addScaledVector(d, len / segs);
      const r0 = r * (1 - (s / segs) * 0.4);
      const r1 = r * (1 - ((s + 1) / segs) * 0.4);
      B.rod(key, cur.x, cur.y, cur.z, next.x, next.y, next.z, r0, r1, depth >= 4 ? 8 : depth >= 2 ? 6 : 4);
      cur = next;
      d.add(tmp.set(rng.float(-0.32, 0.32), rng.float(-0.12, 0.16), rng.float(-0.32, 0.32))).normalize();
    }
    if (depth <= 0 || r < 0.012) return;
    const n = depth >= 4 ? 2 + (rng.chance(0.4) ? 1 : 0) : rng.chance(0.55) ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const nd = d.clone().add(tmp.set(rng.float(-1, 1), rng.float(-0.15, 0.55), rng.float(-1, 1))).normalize();
      if (nd.y < -0.25) {
        nd.y = -0.25;
        nd.normalize();
      }
      branch(cur, nd, len * rng.float(0.58, 0.8), r * rng.float(0.5, 0.68), depth - 1);
    }
  };
  // roots
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.float(-0.3, 0.3);
    B.rod(key, x, y + 0.5 * scale, z, x + Math.cos(a) * 1.1 * scale, y - 0.15, z + Math.sin(a) * 1.1 * scale, 0.16 * scale, 0.04 * scale, 5);
  }
  branch(V(x, y - 0.3, z), V(rng.float(-0.12, 0.12), 1, rng.float(-0.12, 0.12)).normalize(), 4.2 * scale, 0.36 * scale, levels);
}

function trees(ctx, rng) {
  const spots = [
    [-6.5, 13.5, 1.15, 'yard'],
    [9.5, 12.8, 1.0, 'yard'],
    [-14, 13, 1.3, 'garden'],
    [27, 4, 1.25, 'grave'],
    [14, -13, 1.1, 'grave'],
    [-20, -4, 1.35, 'garden'],
    [-28, -22, 1.4, 'garden'],
    [6, -16, 1.2, 'garden'],
    [-6, -18, 1.0, 'garden'],
    [27, -25, 1.3, 'grave'],
    [-30, 9, 1.1, 'garden'],
  ];
  ctx.trees = [];
  for (const [x, z, s, b] of spots) {
    const y = terrainHeight(x, z);
    growTree(ctx.B[b], rng, x, y, z, s);
    ctx.col.addCircle(x, z, 0.38 * s, y - 1, y + 6);
    ctx.trees.push(V(x, y, z));
  }
  // a ring of silhouettes beyond the fence
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = rng.float(46, 62);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.9 - 6;
    if (z > 22) continue;
    growTree(ctx.B.garden, rng, x, terrainHeight(x, z), z, rng.float(1.2, 1.8), 'bark', 4);
  }
}

function brambles(ctx, rng) {
  const B = ctx.B.yard;
  const spots = [
    [-2.4, 9.3],
    [2.0, 9.4],
    [4.4, 9.3],
    [-6.0, 9.1],
    [9.6, 3.0],
    [9.4, -3.2],
    [-7.9, -4],
    [-7.8, 9.0],
    [1.6, 15.8],
    [-2.8, 15.9],
    [5.2, -8.9],
    [-1.5, -8.8],
  ];
  for (const [x, z] of spots) {
    const y = terrainHeight(x, z);
    for (let i = 0; i < 9; i++) {
      let p = V(x + rng.float(-0.3, 0.3), y, z + rng.float(-0.3, 0.3));
      let d = V(rng.float(-0.8, 0.8), 1, rng.float(-0.8, 0.8)).normalize();
      for (let s = 0; s < 4; s++) {
        const n = p.clone().addScaledVector(d, rng.float(0.2, 0.38));
        B.rod('bark', p.x, p.y, p.z, n.x, n.y, n.z, 0.014, 0.008, 3);
        p = n;
        d.add(V(rng.float(-0.6, 0.6), rng.float(-0.4, 0.2), rng.float(-0.6, 0.6))).normalize();
      }
    }
  }
}

// --------------------------------------------------------------- bulkhead
function bulkhead(ctx) {
  const B = ctx.B.yard;
  // apron that covers the hole in the lawn
  B.boxMM({ py: 'concrete', all: 'concrete', ny: null }, 7.15, -0.1, -2.1, 11.1, 0.22, -1.45);
  B.boxMM({ py: 'concrete', all: 'concrete', ny: null }, 7.15, -0.1, 0.65, 11.1, 0.22, 1.1);
  B.boxMM({ py: 'concrete', all: 'concrete', ny: null }, 10.2, -0.1, -1.45, 11.1, 0.22, 0.65);
  ctx.col.addFloor(7.15, 11.1, -2.1, -1.45, 0.22, 'stone');
  ctx.col.addFloor(7.15, 11.1, 0.65, 1.1, 0.22, 'stone');
  ctx.col.addFloor(10.2, 11.1, -1.45, 0.65, 0.22, 'stone');
  // pit walls
  B.boxMM({ all: 'concrete' }, 7.2, -2.0, -1.62, 10.2, 0.22, -1.45);
  B.boxMM({ all: 'concrete' }, 7.2, -2.0, 0.65, 10.2, 0.22, 0.82);
  ctx.col.addBox(7.2, -2.5, -1.62, 10.2, 1.2, -1.45);
  ctx.col.addBox(7.2, -2.5, 0.65, 10.2, 1.2, 0.82);
  // steps down into the cellar
  stairs(ctx, B, { x: 7.45, z: -0.4, dir: [1, 0], width: 2.08, run: 2.65, y0: -2.0, y1: 0.0, steps: 11, rail: null, tread: 'concrete', riser: 'concrete', side: 'concrete', stringers: false, tag: 'stone' });
  ctx.col.addFloor(6.85, 7.45, -1.45, 0.65, -2.0, 'stone');
  // sloped door frame
  const top = 1.0;
  const bot = 0.3;
  const x0 = 7.2;
  const x1 = 10.2;
  const slope = Math.atan2(top - bot, x1 - x0);
  const len = Math.hypot(x1 - x0, top - bot);
  for (const zz of [-1.53, 0.73]) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(x1 - x0, 0);
    sh.lineTo(x1 - x0, bot - 0.22);
    sh.lineTo(0, top - 0.22);
    sh.closePath();
    B.shape({ front: 'concrete', back: 'concrete', side: 'concrete' }, sh, 0.17, mat(x0, 0.22, zz - 0.085));
  }
  // the two rusted leaves
  const leaves = [];
  const axis = V(x1 - x0, bot - top, 0).normalize();
  for (const [hz, sign] of [
    [-1.45, 1],
    [0.65, -1],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x0, top + 0.03, hz);
    pivot.quaternion.setFromUnitVectors(V(1, 0, 0), axis);
    const hinge = new THREE.Group();
    pivot.add(hinge);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 1.05), ctx.mat.iron);
    leaf.position.set(len / 2, 0, sign * 0.525);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    hinge.add(leaf);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 10, Math.PI), ctx.mat.ironBlack);
    handle.position.set(len * 0.6, 0.03, sign * 0.88);
    handle.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    hinge.add(handle);
    for (let k = 0; k < 4; k++) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.0), ctx.mat.ironBlack);
      strap.position.set(0.3 + k * (len - 0.6) / 3, 0.02, sign * 0.52);
      hinge.add(strap);
    }
    ctx.scene.add(pivot);
    leaves.push({ hinge, sign, angle: 0, target: 0 });
  }
  void slope;
  const blocker = ctx.col.addBox(7.15, -2.5, -1.45, 10.3, 1.3, 0.65);
  const BK = {
    open: false,
    openDoors() {
      if (BK.open) return;
      BK.open = true;
      leaves.forEach((l, i) => {
        l.target = -l.sign * 2.05;
        l.delay = i * 0.5;
      });
      ctx.audio.creak(V(8.7, 0.6, -0.4), { long: true, metal: true, pitch: 0.5, gain: 1.3 });
      setTimeout(() => ctx.audio.slam(V(8.7, 0.3, -0.4), { metal: true, gain: 0.7 }), 1300);
    },
  };
  ctx.bulkhead = BK;
  ctx.interact.add({
    pos: V(8.7, 0.7, -0.4),
    radius: 0.9,
    range: 2.4,
    prompt: 'Haul open the cellar doors',
    enabled: () => !BK.open,
    onUse: () => BK.openDoors(),
  });
  ctx.updaters.push((dt) => {
    for (const l of leaves) {
      if (l.delay > 0) {
        l.delay -= dt;
        continue;
      }
      const d = l.target - l.angle;
      if (Math.abs(d) > 1e-3) {
        l.angle += Math.sign(d) * Math.min(Math.abs(d), dt * 1.1);
        ctx.shadowDirty = true;
      }
      l.hinge.rotation.x = l.angle;
    }
    blocker.enabled = !BK.open;
  });
}

// ------------------------------------------------------------- street lamp
function streetLamp(ctx) {
  const B = ctx.B.yard;
  const x = 3.3;
  const z = 19.7;
  B.lathe(
    'ironBlack',
    [
      [0, 0],
      [0.16, 0],
      [0.16, 0.12],
      [0.11, 0.2],
      [0.1, 0.6],
      [0.065, 0.75],
      [0.05, 3.1],
      [0.08, 3.2],
      [0.08, 3.28],
      [0, 3.28],
    ],
    10,
    mat(x, 0.02, z)
  );
  B.box('ironBlack', x, 3.2, z, 0.7, 0.04, 0.04);
  B.box('ironBlack', x, 3.3, z, 0.34, 0.04, 0.34);
  for (const [dx, dz] of [
    [-0.15, -0.15],
    [0.15, -0.15],
    [-0.15, 0.15],
    [0.15, 0.15],
  ]) {
    B.box('ironBlack', x + dx, 3.55, z + dz, 0.025, 0.5, 0.025);
  }
  B.box('glassLit', x, 3.55, z, 0.27, 0.46, 0.27);
  B.cyl('ironBlack', x, 3.88, z, 0.02, 0.24, 0.2, 4, { ry: Math.PI / 4 });
  B.sphere('ironBlack', x, 4.02, z, 0.04);
  ctx.col.addCircle(x, z, 0.18, -1, 4);
  const lampPos = V(x, 3.5, z);
  ctx.streetLamp = {
    emitter: ctx.lights.add({ pos: lampPos, color: 0xffb46a, intensity: 9, distance: 14, flicker: 'gas', room: 'outdoor' }),
    flame: ctx.flames.add(lampPos.clone().add(V(0, -0.1, 0)), 0.1),
    pos: lampPos,
  };
  ctx.mat.glassLit.emissiveIntensity = 0.9;
}

// ------------------------------------------------------------------ grass
function grass(ctx, rng) {
  const count = ctx.quality.grass;
  // one clump = 7 bent blades
  const pos = [];
  const colr = [];
  const idx = [];
  const blades = 7;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rng.float(-0.3, 0.3);
    const lean = rng.float(0.15, 0.45);
    const h = rng.float(0.35, 0.75);
    const w = rng.float(0.025, 0.04);
    const ox = Math.cos(a) * rng.float(0.02, 0.08);
    const oz = Math.sin(a) * rng.float(0.02, 0.08);
    const base = pos.length / 3;
    const segs = 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const cx = ox + Math.cos(a) * lean * t * t;
      const cz = oz + Math.sin(a) * lean * t * t;
      const ww = w * (1 - t * 0.85);
      const px = -Math.sin(a) * ww;
      const pz = Math.cos(a) * ww;
      pos.push(cx - px, h * t, cz - pz, cx + px, h * t, cz + pz);
      const c = 0.35 + t * 0.65;
      colr.push(c, c, c, c, c, c);
    }
    for (let s = 0; s < segs; s++) {
      const i0 = base + s * 2;
      idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const uTime = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 });
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec4 ip = instanceMatrix[3];
        float sw = sin(uTime * 1.3 + ip.x * 0.35 + ip.z * 0.27) * 0.6 + sin(uTime * 2.9 + ip.x * 1.3) * 0.25;
        transformed.x += sw * 0.14 * position.y * position.y;
        transformed.z += sw * 0.07 * position.y * position.y;
        #endif`
      );
  };
  const mesh = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const live = new THREE.Color();
  let n = 0;
  const blocked = (x, z) =>
    (x > -9.6 && x < 9.8 && z > -8.6 && z < 11.0) ||
    (Math.abs(x) < 1.0 && z > 10 && z < 17) ||
    (x > 7 && x < 11.3 && z > -2.3 && z < 1.3) ||
    (x > 21 && x < 26 && z > -18.5 && z < -12.5) ||
    Math.hypot(x + 13.5, z - 4.5) < 1.6;
  let guard = 0;
  while (n < count && guard++ < count * 6) {
    const x = rng.float(-31.5, 31.5);
    const z = rng.float(-31.5, 16.3);
    if (blocked(x, z)) continue;
    const grave = x > 11;
    if (!grave && x > -9 && x < 10 && rng.chance(0.35)) continue;
    if (grave && ctx.graves && ctx.graves.some((g) => Math.abs(g.x - x) < 0.75 && z - g.z > -0.45 && z - g.z < 0.35)) continue;
    const y = terrainHeight(x, z);
    e.set(0, rng.float(0, 6.28), 0);
    q.setFromEuler(e);
    const s = rng.float(0.7, 1.35) * (grave ? 0.72 : 1);
    m.compose(V(x, y - 0.02, z), q, V(s, s * rng.float(0.8, 1.3), s));
    mesh.setMatrixAt(n, m);
    const dead = grave ? rng.chance(0.8) : rng.chance(0.45);
    if (dead) live.setRGB(rng.float(0.32, 0.42), rng.float(0.27, 0.33), rng.float(0.12, 0.17));
    else live.setRGB(rng.float(0.09, 0.14), rng.float(0.15, 0.21), rng.float(0.06, 0.09));
    mesh.setColorAt(n, live);
    n++;
  }
  mesh.count = n;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  ctx.scene.add(mesh);
  ctx.updaters.push((dt, t) => (uTime.value = t));
}

// -------------------------------------------------------------------- ivy
function ivy(ctx, rng) {
  const spots = [];
  // fence sections near the gate and the corners
  const along = (x0, x1, z, y0, y1, n) => {
    for (let i = 0; i < n; i++) spots.push([rng.float(x0, x1), rng.float(y0, y1), z + rng.float(-0.06, 0.06), rng.float(0, 6.28), 0, 0]);
  };
  along(-9.5, -3.5, 16.6, 0.4, 2.0, 420);
  along(3.0, 7.5, 16.6, 0.4, 1.9, 300);
  along(-26, -20, 16.6, 0.4, 2.0, 260);
  along(17, 22, 16.6, 0.4, 1.8, 200);
  for (const x of [-1.38, 1.38]) {
    for (let i = 0; i < 160; i++) {
      const a = rng.float(0, 6.28);
      spots.push([x + Math.cos(a) * 0.3, rng.float(0, 2.4), 16.6 + Math.sin(a) * 0.3, a, 0, 0]);
    }
  }
  // climbing the porch columns and the house's left corner
  for (const x of [-1.85, 4.2]) {
    for (let i = 0; i < 120; i++) {
      const a = rng.float(0, 6.28);
      spots.push([x + Math.cos(a) * 0.14, Y0 + rng.float(0, 2.7), 8.72 + Math.sin(a) * 0.14, a, 0, 0]);
    }
  }
  for (let i = 0; i < 700; i++) {
    const z = rng.float(-7.5, 3.0);
    const y = rng.float(0.6, Math.max(0.8, 5.5 - Math.abs(z + 2) * 0.9));
    spots.push([-7.18, y, z, -Math.PI / 2, 0, 0]);
  }
  const geo = new THREE.PlaneGeometry(0.13, 0.13);
  geo.translate(0, 0.05, 0);
  const mesh = new THREE.InstancedMesh(geo, ctx.mat.leaf, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  spots.forEach(([x, y, z, ry], i) => {
    e.set(rng.float(-0.7, 0.4), ry + rng.float(-0.6, 0.6), rng.float(-1.2, 1.2));
    q.setFromEuler(e);
    const s = rng.float(0.6, 1.25);
    m.compose(V(x, y, z), q, V(s, s, s));
    mesh.setMatrixAt(i, m);
    const k = rng.float(0.6, 1.3);
    c.setRGB(k * (rng.chance(0.15) ? 1.4 : 1), k, k * 0.9);
    mesh.setColorAt(i, c);
  });
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
}

const Y0 = 0.85;
