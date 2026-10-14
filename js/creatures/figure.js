import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Builds a spectral figure from a description in cast.js: a sculpted head
// with a painted face, a body dressed for its period, hands, hair, headwear,
// a pose and whatever it carries. Every part is baked into figure space
// (feet at y = 0, facing +z) and merged per material, so the ghost shader's
// object-space height runs from the hem to the crown.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const DEG = Math.PI / 180;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Material slots a figure is made of.
export const SLOTS = ['body', 'light', 'dark', 'skin', 'face', 'glow'];

function clean(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  return g;
}

const mtx = (pos = V(0, 0, 0), rot = null, scale = null) =>
  new THREE.Matrix4().compose(pos, rot instanceof THREE.Quaternion ? rot : new THREE.Quaternion().setFromEuler(rot || new THREE.Euler()), scale || V(1, 1, 1));

class Parts {
  constructor() {
    this.slots = {};
    for (const s of SLOTS) this.slots[s] = [];
    this.stack = [new THREE.Matrix4()];
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }
  push(m) {
    this.stack.push(this.top.clone().multiply(m));
  }
  pop() {
    this.stack.pop();
  }
  add(slot, geo, m = null) {
    const g = geo.clone();
    g.applyMatrix4(m ? this.top.clone().multiply(m) : this.top);
    this.slots[slot].push(clean(g));
  }
  // world point of a local point under the current transform
  at(p) {
    return p.clone().applyMatrix4(this.top);
  }
  merged() {
    const out = {};
    for (const s of SLOTS) {
      if (!this.slots[s].length) continue;
      const g = mergeGeometries(this.slots[s], false);
      g.computeBoundingSphere();
      out[s] = g;
    }
    return out;
  }
}

// ------------------------------------------------------------- primitives

const sphere = (w = 14, h = 10) => new THREE.SphereGeometry(1, w, h);

function ell(P, slot, c, r, rot = null, seg = [14, 10]) {
  P.add(slot, sphere(seg[0], seg[1]), mtx(c, rot, r));
}

// Tapered tube from a to b.
function tube(P, slot, a, b, r0, r1, seg = 10, open = false) {
  const len = a.distanceTo(b);
  if (len < 1e-4) return;
  const geo = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
  P.add(slot, geo, mtx(a.clone().add(b).multiplyScalar(0.5), q));
}

// A chain of tubes through points (with ball joints).
function chain(P, slot, pts, r0, r1, seg = 8) {
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1);
    const t1 = (i + 1) / (pts.length - 1);
    tube(P, slot, pts[i], pts[i + 1], r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, seg);
    if (i > 0) ell(P, slot, pts[i], V(1, 1, 1).multiplyScalar(r0 + (r1 - r0) * t0), null, [8, 6]);
  }
}

// Surface of revolution from [radius, height] pairs, with folds, a bustle,
// a train and a front-to-back squash that can change with height.
function lathe(points, o = {}) {
  const seg = o.seg ?? 28;
  const geo = new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)),
    seg,
    o.phiStart ?? Math.PI,
    o.phiLength ?? Math.PI * 2
  );
  const pos = geo.attributes.position;
  const ph = o.phase ?? 0.7;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(x, z);
    let k = 1;
    if (o.folds) k += (o.foldAmp ? o.foldAmp(y) : 0.04) * Math.sin(a * o.folds + ph) * (0.6 + 0.4 * Math.sin(a * 3.1 + y * 7));
    if (o.ragged) k += o.ragged * smooth(0.25, 0, y) * Math.sin(a * 23 + ph * 5) * Math.sin(a * 7.3);
    const zs = typeof o.zScale === 'function' ? o.zScale(y) : o.zScale ?? 0.8;
    let nx = x * k;
    let nz = z * k * zs;
    if (o.bustle && nz < 0) {
      const t = smooth(o.bustle.y0, o.bustle.yMid, y) * smooth(o.bustle.y1, o.bustle.yMid, y);
      nz -= o.bustle.amp * t * Math.pow(Math.max(0, -Math.cos(a)), 1.5);
    }
    if (o.train && nz < 0) nz -= o.train * smooth(0.45, 0, y) * Math.pow(Math.max(0, -Math.cos(a)), 2);
    if (o.front && nz > 0) nz += o.front(y) * Math.max(0, Math.cos(a));
    pos.setXYZ(i, nx + (o.dx ?? 0), y, nz + (o.dz ?? 0));
  }
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ head

// Features of the painted face, in the angles of the face cap (see
// ghostfaces.js): phi round the head (90 = front), theta down from the crown.
export const FACE_CAP = { phi0: 20, phi1: 160, th0: 45, th1: 155 };
const EYE = { dphi: 17.6, th: 87.8 };

function bump(dphi, th, f) {
  const g = (x, s) => Math.exp(-(x * x) / (s * s));
  const child = f.child ? 1 : 0;
  const old = (f.age || 30) > 60 ? 1 : 0;
  let r = 0;
  // nose: a ridge from between the eyes to the tip
  const noseAmp = (child ? 0.09 : 0.16) * (f.noseLen ?? 1);
  if (th > 86 && th < 116) {
    const t = smooth(86, 110, th);
    const w = 5.5 + t * 4;
    r += (0.03 + t * noseAmp) * g(dphi, w) * (th > 110.5 ? g(th - 110.5, 2.5) : 1);
  }
  r += 0.035 * g(th - 80, 5) * g(dphi, 30);
  for (const sd of [-1, 1]) {
    r -= 0.055 * g(dphi - sd * EYE.dphi, 8) * g(th - 88, 6);
    r += (0.025 + child * 0.03) * g(dphi - sd * 32, 10) * g(th - 99, 8);
    r -= old * 0.035 * g(dphi - sd * 27, 9) * g(th - 113, 7);
  }
  r += 0.04 * g(dphi, 12) * g(th - 125.7, 4);
  r += (child ? 0.03 : 0.06) * g(dphi, 10) * g(th - 148, 7);
  return r;
}

function deformHead(geo, f, rad, inflate = 0) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const th = Math.acos(Math.max(-1, Math.min(1, y / len))) / DEG;
    const phi = Math.atan2(z, -x) / DEG;
    const dphi = phi - 90;
    const k = 1 + bump(dphi, th, f) + inflate;
    // the jaw narrows towards the chin
    const jaw = 1 - (f.child ? 0.08 : 0.16) * smooth(110, 170, th) * (f.jaw ?? 1);
    pos.setXYZ(i, (x / len) * k * rad.x * jaw, (y / len) * k * rad.y, (z / len) * k * rad.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function headGeometry(P, f, rad) {
  P.add('skin', deformHead(new THREE.SphereGeometry(1, 40, 30), f, rad));
  const c = FACE_CAP;
  const cap = new THREE.SphereGeometry(1, 44, 40, c.phi0 * DEG, (c.phi1 - c.phi0) * DEG, c.th0 * DEG, (c.th1 - c.th0) * DEG);
  P.add('face', deformHead(cap, f, rad, 0.012));
}

// --------------------------------------------------------------- hands

// A hand at `wrist`, fingers along `dir`, palm facing `palm`. curl bends the
// fingers toward the palm; side is +1 for the right hand.
function hand(P, slot, wrist, dir, palm, size, curl, side) {
  const y = dir.clone().normalize();
  const z = palm.clone().sub(y.clone().multiplyScalar(palm.dot(y))).normalize();
  const x = y.clone().cross(z).normalize();
  const basis = new THREE.Matrix4().makeBasis(x, y, z);
  const s = size;
  const local = (lx, ly, lz) => V(lx, ly, lz).applyMatrix4(basis).add(wrist);
  // palm: a flattened ovoid
  P.add(slot, sphere(12, 8), new THREE.Matrix4().makeBasis(x, y, z).setPosition(local(0, 0.045 * s, 0)).multiply(new THREE.Matrix4().makeScale(0.042 * s, 0.05 * s, 0.017 * s)));
  const fingers = [
    [-0.03, 0.088, 0.045],
    [-0.01, 0.094, 0.05],
    [0.01, 0.092, 0.047],
    [0.029, 0.084, 0.037],
  ];
  for (const [fx, fy, fl] of fingers) {
    const bend = curl * 1.5;
    const p0 = local(fx * s * side, fy * s, 0);
    const d1 = y.clone().multiplyScalar(Math.cos(bend * 0.5)).add(z.clone().multiplyScalar(Math.sin(bend * 0.5)));
    const p1 = p0.clone().add(d1.clone().multiplyScalar(fl * s * 0.55));
    const d2 = y.clone().multiplyScalar(Math.cos(bend * 1.2)).add(z.clone().multiplyScalar(Math.sin(bend * 1.2)));
    const p2 = p1.clone().add(d2.clone().multiplyScalar(fl * s * 0.5));
    chain(P, slot, [p0, p1, p2], 0.0095 * s, 0.0075 * s, 6);
  }
  // thumb, opposed across the palm
  const t0 = local(-0.035 * s * side, 0.025 * s, 0.01 * s);
  const td = y.clone().multiplyScalar(0.6).add(x.clone().multiplyScalar(-0.55 * side)).add(z.clone().multiplyScalar(0.3 + curl * 0.5)).normalize();
  const t1 = t0.clone().add(td.clone().multiplyScalar(0.035 * s));
  const t2 = t1.clone().add(td.clone().add(z.clone().multiplyScalar(curl * 0.6)).normalize().multiplyScalar(0.03 * s));
  chain(P, slot, [t0, t1, t2], 0.011 * s, 0.008 * s, 6);
}

// ----------------------------------------------------------------- props

function prop(P, kind, at, o) {
  const s = o.scale;
  switch (kind) {
    case 'candle': {
      const base = at.clone().add(V(0, 0.01, 0));
      P.add('light', new THREE.CylinderGeometry(0.05, 0.055, 0.012, 16), mtx(base));
      P.add('light', new THREE.TorusGeometry(0.02, 0.005, 6, 12, Math.PI), mtx(base.clone().add(V(0.055, 0.02, 0)), new THREE.Euler(0, 0, -Math.PI / 2)));
      tube(P, 'light', base, base.clone().add(V(0, 0.17, 0)), 0.014, 0.013, 12);
      // a wax drip and the flame
      ell(P, 'light', base.clone().add(V(0.012, 0.13, 0.006)), V(0.006, 0.02, 0.006));
      ell(P, 'glow', base.clone().add(V(0, 0.205, 0)), V(0.013, 0.032, 0.013));
      return base.clone().add(V(0, 0.2, 0));
    }
    case 'lantern': {
      // a ship's lantern hanging from the hand by its bail
      const top = at.clone();
      P.add('dark', new THREE.TorusGeometry(0.04, 0.004, 6, 16, Math.PI), mtx(top.clone().add(V(0, -0.04, 0))));
      const c = top.clone().add(V(0, -0.17, 0));
      P.add('dark', new THREE.ConeGeometry(0.07, 0.06, 8), mtx(c.clone().add(V(0, 0.1, 0))));
      P.add('dark', new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), mtx(c.clone().add(V(0, 0.065, 0))));
      P.add('dark', new THREE.CylinderGeometry(0.065, 0.06, 0.03, 12), mtx(c.clone().add(V(0, -0.085, 0))));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        tube(P, 'dark', c.clone().add(V(Math.cos(a) * 0.055, -0.07, Math.sin(a) * 0.055)), c.clone().add(V(Math.cos(a) * 0.055, 0.06, Math.sin(a) * 0.055)), 0.004, 0.004, 4);
      }
      P.add('glow', new THREE.CylinderGeometry(0.05, 0.05, 0.13, 14, 1, true), mtx(c));
      ell(P, 'glow', c.clone().add(V(0, -0.01, 0)), V(0.018, 0.04, 0.018));
      return c;
    }
    case 'book': {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.0, 0, 0));
      P.add('dark', new THREE.BoxGeometry(0.16, 0.012, 0.22), mtx(at.clone().add(V(-0.082, 0, 0)), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.18)))));
      P.add('dark', new THREE.BoxGeometry(0.16, 0.012, 0.22), mtx(at.clone().add(V(0.082, 0, 0)), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.18)))));
      P.add('light', new THREE.BoxGeometry(0.3, 0.02, 0.2), mtx(at.clone().add(V(0, 0.012, 0.004)), q));
      return at;
    }
    case 'doll': {
      const c = at.clone();
      P.add('dark', new THREE.ConeGeometry(0.06, 0.16, 12, 1, true), mtx(c.clone().add(V(0, -0.02, 0))));
      ell(P, 'light', c.clone().add(V(0, 0.09, 0)), V(0.032, 0.036, 0.032));
      ell(P, 'dark', c.clone().add(V(0, 0.105, -0.005)), V(0.035, 0.03, 0.035));
      for (const sd of [-1, 1]) tube(P, 'light', c.clone().add(V(sd * 0.03, 0.04, 0)), c.clone().add(V(sd * 0.05, -0.03, 0.01)), 0.008, 0.007, 5);
      for (const sd of [-1, 1]) tube(P, 'light', c.clone().add(V(sd * 0.02, -0.1, 0)), c.clone().add(V(sd * 0.022, -0.17, 0.01)), 0.009, 0.008, 5);
      return c;
    }
    case 'boat': {
      const c = at.clone();
      const hull = new THREE.LatheGeometry([new THREE.Vector2(0.001, -0.04), new THREE.Vector2(0.03, -0.035), new THREE.Vector2(0.045, 0), new THREE.Vector2(0.001, 0.0)], 14);
      P.add('body', hull, mtx(c, new THREE.Euler(0, 0, Math.PI / 2), V(1, 4.2, 1)));
      for (const [mx, mh] of [
        [-0.05, 0.22],
        [0.06, 0.26],
      ]) {
        const b = c.clone().add(V(mx, 0, 0));
        tube(P, 'dark', b, b.clone().add(V(0, mh, 0)), 0.003, 0.002, 4);
        for (let k = 0; k < 3; k++) P.add('light', new THREE.PlaneGeometry(0.09 - k * 0.012, 0.055), mtx(b.clone().add(V(0, mh - 0.05 - k * 0.065, 0.004)), new THREE.Euler(0, 0.15, 0)));
      }
      return c;
    }
    case 'spade': {
      const b = o.bottom;
      const t = o.top;
      tube(P, 'dark', b.clone().add(V(0, 0.22, 0)), t, 0.013, 0.012, 8);
      P.add('dark', new THREE.TorusGeometry(0.04, 0.009, 6, 12, Math.PI), mtx(t.clone().add(V(0, 0.035, 0)), new THREE.Euler(0, 0.4, 0)));
      P.add('light', new THREE.BoxGeometry(0.17, 0.25, 0.012), mtx(b.clone().add(V(0, 0.11, 0)), new THREE.Euler(0.08, 0.4, 0)));
      return at;
    }
    case 'cane': {
      tube(P, 'dark', o.bottom, at, 0.011, 0.012, 8);
      ell(P, 'light', at.clone().add(V(0, 0.02, 0)), V(0.026, 0.02, 0.026));
      return at;
    }
    case 'salver': {
      const c = at.clone().add(V(0, 0.015, 0));
      P.add('light', new THREE.CylinderGeometry(0.17, 0.165, 0.014, 26), mtx(c));
      P.add('light', new THREE.TorusGeometry(0.17, 0.006, 6, 28), mtx(c.clone().add(V(0, 0.007, 0)), new THREE.Euler(Math.PI / 2, 0, 0)));
      // a decanter and a glass
      const d = c.clone().add(V(-0.04, 0.007, 0.02));
      P.add('light', new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.05, 0.005), new THREE.Vector2(0.055, 0.06), new THREE.Vector2(0.03, 0.12), new THREE.Vector2(0.016, 0.2), new THREE.Vector2(0.02, 0.215), new THREE.Vector2(0.001, 0.22)], 14), mtx(d));
      P.add('light', new THREE.LatheGeometry([new THREE.Vector2(0.03, 0), new THREE.Vector2(0.004, 0.01), new THREE.Vector2(0.004, 0.06), new THREE.Vector2(0.03, 0.08), new THREE.Vector2(0.034, 0.12)], 12), mtx(c.clone().add(V(0.07, 0.007, -0.02))));
      return c;
    }
    case 'bucket': {
      const c = at.clone().add(V(0, -0.22, 0));
      P.add('dark', new THREE.CylinderGeometry(0.12, 0.095, 0.22, 16, 1, true), mtx(c));
      P.add('dark', new THREE.CircleGeometry(0.095, 16), mtx(c.clone().add(V(0, -0.11, 0)), new THREE.Euler(-Math.PI / 2, 0, 0)));
      for (const yy of [-0.08, 0.08]) P.add('dark', new THREE.TorusGeometry(0.11 + yy * 0.12, 0.005, 4, 20), mtx(c.clone().add(V(0, yy, 0)), new THREE.Euler(Math.PI / 2, 0, 0)));
      P.add('dark', new THREE.TorusGeometry(0.12, 0.004, 4, 16, Math.PI), mtx(c.clone().add(V(0, 0.1, 0)), new THREE.Euler(0, 0.3, 0)));
      return c;
    }
    case 'basin': {
      const c = at.clone();
      P.add('light', new THREE.LatheGeometry([new THREE.Vector2(0.001, -0.05), new THREE.Vector2(0.08, -0.05), new THREE.Vector2(0.15, 0.02), new THREE.Vector2(0.17, 0.03)], 22), mtx(c));
      // a folded cloth over the rim
      P.add('light', new THREE.BoxGeometry(0.08, 0.01, 0.14), mtx(c.clone().add(V(0.1, 0.03, 0)), new THREE.Euler(0, 0, -0.3)));
      return c;
    }
    case 'scissors': {
      const c = at.clone();
      for (const sd of [-1, 1]) {
        tube(P, 'light', c, c.clone().add(V(sd * 0.02, 0.14, 0.02)), 0.004, 0.002, 4);
        P.add('light', new THREE.TorusGeometry(0.014, 0.004, 4, 10), mtx(c.clone().add(V(sd * 0.018, -0.02, 0))));
      }
      return c;
    }
    case 'crystal': {
      const c = at.clone();
      P.add('dark', new THREE.CylinderGeometry(0.05, 0.065, 0.04, 12), mtx(c.clone().add(V(0, -0.075, 0))));
      ell(P, 'glow', c, V(0.07, 0.07, 0.07), null, [18, 14]);
      ell(P, 'glow', c, V(0.03, 0.03, 0.03));
      return c;
    }
    case 'bouquet': {
      const c = at.clone();
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const r = 0.02 + (i % 3) * 0.022;
        tube(P, 'body', c.clone().add(V(Math.cos(a) * r * 0.5, -0.04, Math.sin(a) * r * 0.5)), c.clone().add(V(Math.cos(a) * 0.01, -0.3, Math.sin(a) * 0.01)), 0.003, 0.002, 4);
      }
      for (let i = 0; i < 16; i++) {
        const a = i * 2.39996;
        const r = Math.sqrt(i / 16) * 0.075;
        ell(P, 'light', c.clone().add(V(Math.cos(a) * r, 0.02 - r * 0.5, Math.sin(a) * r)), V(0.022, 0.018, 0.022), null, [8, 6]);
      }
      // ribbon streamers
      for (const sd of [-1, 1]) P.add('light', new THREE.PlaneGeometry(0.02, 0.32), mtx(c.clone().add(V(sd * 0.02, -0.25, 0.02)), new THREE.Euler(0, 0, sd * 0.12)));
      return c;
    }
    case 'handkerchief': {
      P.add('light', new THREE.PlaneGeometry(0.18, 0.18, 4, 4), mtx(at.clone().add(V(0, -0.06, 0.02)), new THREE.Euler(0.2, 0.3, 0.6)));
      return at;
    }
    case 'keys': {
      const c = at.clone();
      P.add('light', new THREE.TorusGeometry(0.03, 0.004, 5, 14), mtx(c));
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.25;
        const k0 = c.clone().add(V(Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0));
        const k1 = k0.clone().add(V(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.004));
        tube(P, 'light', k0, k1, 0.003, 0.003, 4);
        P.add('light', new THREE.BoxGeometry(0.012, 0.016, 0.003), mtx(k1, new THREE.Euler(0, 0, a)));
      }
      return c;
    }
    case 'letter': {
      P.add('light', new THREE.PlaneGeometry(0.2, 0.13), mtx(at, new THREE.Euler(-0.4, 0.2, 0.1)));
      return at;
    }
    case 'fan': {
      const g = new THREE.CircleGeometry(0.17, 16, Math.PI * 0.25, Math.PI * 0.5);
      P.add('light', g, mtx(at, new THREE.Euler(-0.5, 0, 0.6)));
      return at;
    }
    default:
      return at;
  }
}

// ----------------------------------------------------------- the figure

// Proportions for a figure of the given height and build.
function body(spec) {
  const H = spec.height ?? (spec.child ? 1.22 : spec.sex === 'm' ? 1.78 : 1.66);
  const k = H / (spec.child ? 1.22 : spec.sex === 'm' ? 1.78 : 1.66);
  const child = !!spec.child;
  const headR = child ? V(0.09, 0.105, 0.098) : spec.sex === 'm' ? V(0.083, 0.115, 0.1) : V(0.078, 0.108, 0.094);
  const headY = H - headR.y * 1.02;
  const chinY = headY - headR.y * 0.93;
  const neckTop = chinY + 0.02;
  const neckBase = headY - (child ? 0.15 : 0.19);
  const shY = neckBase - (child ? 0.02 : 0.03);
  const shX = (child ? 0.13 : spec.sex === 'm' ? 0.2 : 0.175) * (spec.build ?? 1);
  const chestY = shY - (child ? 0.12 : 0.16) * k;
  const waistY = shY - (child ? 0.26 : 0.36) * k;
  const hipY = waistY - (child ? 0.08 : 0.12) * k;
  const arm = (child ? 0.42 : 0.56) * k;
  return { H, k, child, headR, headY, chinY, neckTop, neckBase, shY, shX, chestY, waistY, hipY, upper: arm * 0.52, fore: arm * 0.48, hand: child ? 0.75 : spec.sex === 'm' ? 1.08 : 0.95 };
}

// Elbow and wrist for each arm, palm direction, and where props sit.
function poseArms(spec, b) {
  const { shX, shY, chestY, waistY, hipY, headY, chinY } = b;
  const pose = spec.pose || 'hang';
  const A = { R: null, L: null };
  const arm = (side, elbow, wrist, palm, curl = 0.35) => ({ side, sh: V(side * shX, shY - 0.03, 0), elbow, wrist, palm, curl });
  const hang = (side, fwd = 0.04) =>
    arm(side, V(side * (shX + 0.03), shY - b.upper, 0.02), V(side * (shX + 0.035), shY - b.upper - b.fore, fwd), V(-side, 0, 0.2), 0.3);
  const front = (side, x, y, z, palm = V(-side, 0, 0), curl = 0.45, ex = 0.06, ez = 0.05) =>
    arm(side, V(side * (shX + ex), shY - b.upper * 0.92, ez), V(side * x, y, z), palm, curl);
  const out = { props: [] };
  switch (pose) {
    case 'clasp':
      A.R = front(1, 0.03, waistY - 0.02, 0.17, V(-1, 0, 0.3), 0.6);
      A.L = front(-1, 0.03, waistY - 0.03, 0.16, V(1, 0, 0.3), 0.6);
      break;
    case 'candle':
      A.R = front(1, 0.07, chestY - 0.06, 0.27, V(-0.3, 1, 0), 0.75, 0.04, 0.12);
      A.L = front(-1, 0.04, chestY - 0.02, 0.29, V(0.6, 0.1, 0.4), 0.15, 0.04, 0.12);
      out.props.push({ kind: 'candle', at: 'R', off: V(-0.02, 0.0, 0.02) });
      break;
    case 'lantern':
      A.R = arm(1, V(shX + 0.06, shY - b.upper, 0.07), V(shX + 0.08, hipY + 0.02, 0.2), V(-1, 0, 0), 0.8);
      A.L = hang(-1);
      out.props.push({ kind: 'lantern', at: 'R', off: V(0, -0.04, 0) });
      break;
    case 'lanternHigh':
      A.R = arm(1, V(shX + 0.16, shY - 0.1, 0.1), V(shX + 0.3, shY + 0.06, 0.24), V(-1, 0, 0), 0.8);
      A.L = front(-1, 0.06, chestY - 0.04, 0.12, V(1, 0, 0.4), 0.3);
      out.props.push({ kind: 'lantern', at: 'R', off: V(0, -0.02, 0) });
      break;
    case 'book':
      A.R = front(1, 0.12, chestY - 0.13, 0.25, V(-0.3, 1, 0.2), 0.3, 0.06, 0.1);
      A.L = front(-1, 0.12, chestY - 0.13, 0.25, V(0.3, 1, 0.2), 0.3, 0.06, 0.1);
      out.props.push({ kind: 'book', pos: V(0, chestY - 0.1, 0.28) });
      break;
    case 'salver':
      A.R = arm(1, V(shX + 0.03, shY - b.upper, 0.05), V(0.1, chestY - 0.12, 0.33), V(0, 1, 0), 0.2);
      A.L = arm(-1, V(-shX - 0.02, shY - b.upper, -0.08), V(-0.05, waistY - 0.02, -0.17), V(0, 0, -1), 0.5);
      out.props.push({ kind: 'salver', at: 'R', off: V(-0.04, 0.02, 0.04) });
      break;
    case 'bucket':
      A.R = arm(1, V(shX + 0.05, shY - b.upper, 0.0), V(shX + 0.09, shY - b.upper - b.fore + 0.02, 0.03), V(-1, 0, 0), 0.85);
      A.L = hang(-1);
      out.props.push({ kind: 'bucket', at: 'R', off: V(0, 0, 0) });
      break;
    case 'spade':
      A.R = front(1, 0.16, waistY + 0.12, 0.24, V(-1, 0, 0), 0.85);
      A.L = front(-1, -0.12, waistY - 0.12, 0.28, V(1, 0, 0), 0.85, 0.02, 0.1);
      out.props.push({ kind: 'spade', pos: V(0.16, waistY + 0.12, 0.24), bottom: V(0.24, 0, 0.36), top: V(0.15, waistY + 0.2, 0.23) });
      break;
    case 'cane':
      A.R = front(1, shX + 0.04, hipY - 0.02, 0.2, V(-0.2, -1, 0), 0.9);
      A.L = hang(-1);
      out.props.push({ kind: 'cane', pos: V(shX + 0.05, hipY - 0.04, 0.22), bottom: V(shX + 0.1, 0, 0.3) });
      break;
    case 'face':
      A.R = front(1, 0.05, chinY - 0.03, 0.13, V(-0.3, 0.2, -1), 0.4, 0.1, 0.15);
      A.L = front(-1, 0.05, chinY - 0.04, 0.13, V(0.3, 0.2, -1), 0.4, 0.1, 0.15);
      out.props.push({ kind: 'handkerchief', at: 'R', off: V(-0.02, 0.02, 0.02) });
      break;
    case 'doll':
      A.R = front(1, 0.07, chestY - 0.08, 0.12, V(-1, 0, -0.3), 0.6);
      A.L = front(-1, 0.07, chestY - 0.05, 0.13, V(1, 0, -0.3), 0.6);
      out.props.push({ kind: 'doll', pos: V(0.01, chestY - 0.03, 0.15) });
      break;
    case 'boat':
      A.R = front(1, 0.1, waistY + 0.05, 0.2, V(-0.6, 1, 0), 0.5);
      A.L = front(-1, 0.1, waistY + 0.05, 0.2, V(0.6, 1, 0), 0.5);
      out.props.push({ kind: 'boat', pos: V(0, waistY + 0.1, 0.22) });
      break;
    case 'basin':
      A.R = front(1, 0.15, waistY + 0.02, 0.22, V(-0.4, 1, 0), 0.5);
      A.L = front(-1, 0.15, waistY + 0.02, 0.22, V(0.4, 1, 0), 0.5);
      out.props.push({ kind: 'basin', pos: V(0, waistY + 0.06, 0.25) });
      break;
    case 'scissors':
      A.R = front(1, 0.13, chestY - 0.02, 0.24, V(-1, 0, 0.2), 0.7, 0.05, 0.1);
      A.L = front(-1, 0.1, waistY + 0.08, 0.2, V(1, 0, 0.2), 0.5);
      out.props.push({ kind: 'scissors', at: 'R', off: V(-0.01, 0.04, 0.02) });
      break;
    case 'crystal':
      A.R = front(1, 0.08, chestY - 0.14, 0.24, V(-1, 0.4, 0), 0.5);
      A.L = front(-1, 0.08, chestY - 0.14, 0.24, V(1, 0.4, 0), 0.5);
      out.props.push({ kind: 'crystal', pos: V(0, chestY - 0.07, 0.26) });
      break;
    case 'bouquet':
      A.R = front(1, 0.05, waistY + 0.03, 0.2, V(-1, 0, 0), 0.75);
      A.L = front(-1, 0.05, waistY + 0.0, 0.2, V(1, 0, 0), 0.75);
      out.props.push({ kind: 'bouquet', pos: V(0, waistY + 0.12, 0.23) });
      break;
    case 'keys':
      A.R = front(1, 0.08, waistY - 0.04, 0.17, V(-1, 0, 0.2), 0.6);
      A.L = front(-1, 0.05, waistY - 0.05, 0.16, V(1, 0, 0.2), 0.5);
      break;
    case 'letter':
      A.R = front(1, 0.1, chestY - 0.06, 0.26, V(-0.4, 0.3, 1), 0.3, 0.05, 0.1);
      A.L = hang(-1);
      out.props.push({ kind: 'letter', at: 'R', off: V(-0.06, 0.04, 0.05) });
      break;
    case 'fan':
      A.R = front(1, 0.1, chestY + 0.02, 0.2, V(-1, 0, 0.3), 0.5, 0.06, 0.1);
      A.L = front(-1, 0.06, waistY + 0.06, 0.2, V(1, 0, 0.3), 0.4);
      out.props.push({ kind: 'fan', at: 'R', off: V(0.02, 0.06, 0.02) });
      break;
    case 'reach':
      A.R = arm(1, V(shX + 0.03, shY - 0.08, 0.24), V(shX - 0.02, shY - 0.04, 0.55), V(0, -0.3, 1), 0.15);
      A.L = arm(-1, V(-shX - 0.03, shY - 0.1, 0.22), V(-shX + 0.03, shY - 0.1, 0.52), V(0, -0.3, 1), 0.25);
      break;
    case 'sing':
      A.R = arm(1, V(shX + 0.12, shY - b.upper * 0.9, 0.05), V(shX + 0.22, hipY + 0.04, 0.14), V(-0.4, 0, 1), 0.1);
      A.L = arm(-1, V(-shX - 0.12, shY - b.upper * 0.9, 0.05), V(-shX - 0.24, hipY + 0.02, 0.12), V(0.4, 0, 1), 0.1);
      break;
    case 'table':
      // seated at dinner: forearms resting forward on the cloth
      A.R = arm(1, V(shX + 0.04, shY - b.upper * 0.95, 0.08), V(0.14, waistY + 0.12, 0.34), V(0, -1, 0), 0.3);
      A.L = arm(-1, V(-shX - 0.04, shY - b.upper * 0.95, 0.08), V(-0.16, waistY + 0.12, 0.32), V(0, -1, 0), 0.25);
      break;
    default:
      A.R = hang(1);
      A.L = hang(-1);
  }
  out.arms = A;
  return out;
}

// Build the figure. Returns merged geometry per material slot, plus the
// heights the Ghost class needs.
export function buildFigure(spec) {
  const P = new Parts();
  const b = body(spec);
  const male = spec.sex === 'm';
  const D = spec.dress || {};
  const s = b.k;

  // the upper body may stoop forward from the hips
  const hunch = spec.hunch ?? 0;
  const spine = mtx(V(0, b.hipY, 0), new THREE.Euler(hunch, 0, 0)).multiply(mtx(V(0, -b.hipY, 0)));

  // ---------------------------------------------------------------- lower
  if (male && !D.gown) {
    if (spec.seated) {
      // hidden below the table; a little skirt of coat for the lower edge
    } else {
      // trousers, boots
      for (const sd of [-1, 1]) {
        const hip = V(sd * 0.09 * s, b.hipY - 0.02, 0);
        const knee = V(sd * 0.095 * s, b.hipY * 0.52, 0.03);
        const ankle = V(sd * 0.09 * s, 0.09, 0.0);
        tube(P, D.legs || 'dark', hip, knee, 0.07 * s, 0.058 * s, 12);
        tube(P, D.legs || 'dark', knee, ankle, 0.058 * s, 0.05 * s, 12);
        if (D.shorts) {
          tube(P, 'light', knee.clone().add(V(0, -0.02, 0)), ankle, 0.045 * s, 0.04 * s, 10);
        }
        ell(P, 'dark', V(sd * 0.09 * s, 0.045, 0.05), V(0.045 * s, 0.045, 0.12 * s));
      }
    }
    // coat skirts: frock coats to the knee, tails at the back, short jackets
    const coatLen = D.coat === 'frock' ? 0.45 : D.coat === 'tails' ? 0.55 : D.coat === 'pea' ? 0.18 : D.coat === 'jacket' ? 0.12 : 0;
    if (coatLen > 0) {
      const y0 = b.waistY;
      const y1 = y0 - coatLen * s;
      const pts = [
        [0.2 * s, y1],
        [0.19 * s, (y0 + y1) / 2],
        [0.17 * s, y0],
      ];
      if (D.coat === 'tails') P.add(D.coatSlot || 'dark', lathe(pts, { phiStart: Math.PI * 0.6, phiLength: Math.PI * 0.8, zScale: 0.75, folds: 5, foldAmp: () => 0.03 }));
      else P.add(D.coatSlot || 'dark', lathe(pts, { phiStart: Math.PI * 0.12, phiLength: Math.PI * 1.76, zScale: 0.78, folds: 7, foldAmp: () => 0.03 }));
    }
  } else {
    // a gown from the hem to the waist
    const hem = (D.hem ?? (b.child ? 0.3 : 0.46)) * s;
    const w = (D.waist ?? (b.child ? 0.12 : 0.135)) * s;
    const top = b.waistY + 0.02;
    const pts = D.straight
      ? [
          [hem * 0.75, 0],
          [hem * 0.72, top * 0.3],
          [w * 1.35, top * 0.75],
          [w * 1.15, top],
        ]
      : [
          [hem, 0],
          [hem * 0.95, top * 0.15],
          [hem * 0.8, top * 0.42],
          [w * 1.75, top * 0.72],
          [w * 1.1, top * 0.94],
          [w, top],
        ];
    P.add(D.slot || 'body', lathe(pts, { zScale: 0.86, folds: D.folds ?? 11, foldAmp: (y) => 0.05 * smooth(top, 0, y) + 0.008, bustle: D.bustle ? { y0: top * 0.35, yMid: top * 0.8, y1: top + 0.05, amp: D.bustle * s } : null, train: (D.train ?? 0) * s, ragged: D.ragged ?? 0, phase: spec.seed ?? 1 }));
    if (D.apron) {
      const ap = lathe(
        [
          [hem * 0.86, top * 0.18],
          [hem * 0.7, top * 0.5],
          [w * 1.25, top * 0.9],
          [w * 1.08, top],
        ],
        { phiStart: -Math.PI * 0.32, phiLength: Math.PI * 0.64, zScale: 0.88, dz: 0.004 }
      );
      P.add('light', ap);
    }
    if (D.sash) P.add(D.sash, new THREE.TorusGeometry(w * 1.02, 0.018 * s, 6, 24), mtx(V(0, top - 0.01, 0), new THREE.Euler(Math.PI / 2, 0, 0), V(1, 0.66, 1)));
  }

  P.push(spine);
  // ---------------------------------------------------------------- torso
  {
    const w = (male ? 0.155 : D.waist ?? (b.child ? 0.12 : 0.135)) * s;
    const ch = (male ? 0.19 : b.child ? 0.13 : 0.165) * s * (spec.build ?? 1);
    const pts = [
      [w, b.waistY - 0.02],
      [ch * 0.95, b.chestY - 0.06],
      [Math.max(ch, b.shX * 0.86), b.chestY + 0.03],
      [b.shX * 0.97, b.shY - 0.07],
      [b.shX * 0.99, b.shY - 0.035],
      [b.shX * 0.8, b.shY + 0.004],
      [0.075 * s, b.neckBase + 0.005],
      [0.05 * s, b.neckBase + 0.02],
    ];
    const zs = male ? 0.62 : 0.6;
    const bust = (y) => (!male && !b.child ? 0.02 * Math.exp(-((y - b.chestY) ** 2) / 0.004) : 0);
    P.add(D.top || (male ? 'dark' : D.slot || 'body'), lathe(pts, { zScale: zs, front: bust }));
    // the front of the torso at height y, for things worn on it
    const fz = (y) => {
      let r = pts[0][0];
      for (let i = 0; i < pts.length - 1; i++) {
        const [r0, y0] = pts[i];
        const [r1, y1] = pts[i + 1];
        if (y >= y0 && y <= y1) r = r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
      }
      if (y > pts[pts.length - 1][1]) r = pts[pts.length - 1][0];
      return r * zs + bust(y) + 0.008;
    };
    if (D.waistcoat) {
      const wc = lathe(
        [
          [w * 1.02, b.waistY - 0.06],
          [ch * 0.97, b.chestY],
          [ch * 0.7, b.shY - 0.08],
        ],
        { phiStart: -Math.PI * 0.22, phiLength: Math.PI * 0.44, zScale: 0.66, dz: 0.004 }
      );
      P.add(D.waistcoat, wc);
      for (let i = 0; i < 5; i++) {
        const y = b.waistY + 0.02 + i * 0.05;
        ell(P, 'light', V(0, y, fz(y) + 0.004), V(0.007, 0.007, 0.005), null, [6, 4]);
      }
      // watch chain
      const y0 = b.waistY + 0.06;
      chain(P, 'light', [V(-0.07, y0, fz(y0)), V(0, b.waistY + 0.035, fz(b.waistY + 0.035) + 0.004), V(0.07, y0 + 0.01, fz(y0))], 0.003, 0.003, 4);
    }
    if (D.shirtFront) {
      P.add('light', new THREE.PlaneGeometry(0.07 * s, 0.17 * s), mtx(V(0, b.shY - 0.11, fz(b.shY - 0.11))));
    }
    if (D.lapels) {
      for (const sd of [-1, 1]) {
        P.add(D.top || 'dark', new THREE.BoxGeometry(0.05 * s, 0.24 * s, 0.012), mtx(V(sd * 0.06 * s, b.shY - 0.13, fz(b.shY - 0.13) - 0.004), new THREE.Euler(0.05, sd * 0.35, sd * 0.32)));
      }
    }
    if (D.buttons) {
      const n = D.buttons;
      for (let i = 0; i < n; i++) {
        const y = b.shY - 0.08 - i * ((b.shY - b.waistY) / (n + 0.5));
        for (const sd of D.double ? [-1, 1] : [0]) ell(P, D.buttonSlot || 'light', V(sd * 0.055 * s, y, fz(y) - Math.abs(sd) * 0.01), V(0.008, 0.008, 0.005), null, [6, 4]);
      }
    }
    if (D.epaulettes) for (const sd of [-1, 1]) {
      ell(P, 'light', V(sd * (b.shX - 0.02), b.shY - 0.005, 0), V(0.05, 0.016, 0.045));
      for (let i = 0; i < 7; i++) tube(P, 'light', V(sd * (b.shX + 0.02), b.shY - 0.01, -0.04 + i * 0.013), V(sd * (b.shX + 0.03), b.shY - 0.06, -0.04 + i * 0.013), 0.004, 0.003, 4);
    }
    if (D.medals) for (let i = 0; i < 3; i++) ell(P, 'light', V(-0.06 + i * 0.022, b.chestY + 0.02, fz(b.chestY + 0.02) - 0.006), V(0.008, 0.012, 0.004), null, [6, 4]);
    if (D.sashAcross) P.add(D.sashAcross, new THREE.TorusGeometry(0.2 * s, 0.022, 4, 24), mtx(V(0, b.chestY - 0.02, 0.0), new THREE.Euler(Math.PI / 2, 0.75, 0), V(0.82, 1, 0.62)));
    if (D.apron && D.bib) P.add('light', new THREE.PlaneGeometry(0.15 * s, 0.2 * s), mtx(V(0, b.chestY - 0.03, fz(b.chestY - 0.03) + 0.008), new THREE.Euler(-0.08, 0, 0)));
    if (D.chatelaine) {
      const c = V(0.06, b.waistY - 0.02, fz(b.waistY) + 0.01);
      ell(P, 'light', c, V(0.018, 0.014, 0.006), null, [8, 6]);
      for (let i = 0; i < 5; i++) {
        const a = -0.6 + i * 0.3;
        const e = c.clone().add(V(Math.sin(a) * 0.04, -0.13 - (i % 2) * 0.03, 0.01));
        tube(P, 'light', c, e, 0.0025, 0.0025, 4);
        P.add('light', new THREE.BoxGeometry(0.008, 0.025, 0.004), mtx(e));
      }
    }
    if (D.tape) {
      // a dressmaker's tape hung round the neck
      for (const sd of [-1, 1]) {
        P.add('light', new THREE.PlaneGeometry(0.018, 0.34 * s), mtx(V(sd * 0.075, b.chestY - 0.06, fz(b.chestY - 0.06) + 0.006), new THREE.Euler(-0.15, 0, sd * 0.06)));
      }
    }
    if (D.shawl) {
      const sh = lathe(
        [
          [0.07 * s, b.neckBase + 0.01],
          [b.shX * 1.05, b.shY - 0.04],
          [b.shX * 1.18, b.shY - 0.2],
          [b.shX * 0.95, b.chestY - 0.16],
        ],
        { zScale: 0.7, folds: 9, foldAmp: () => 0.03, phase: 2.1 }
      );
      P.add(D.shawl, sh);
      if (D.fringe) for (let i = 0; i < 28; i++) {
        const a = Math.PI + (i / 27 - 0.5) * Math.PI * 1.6;
        const x = Math.sin(a) * b.shX * 0.95;
        const z = Math.cos(a) * b.shX * 0.95 * 0.7;
        tube(P, D.shawl, V(x, b.chestY - 0.16, z), V(x * 1.02, b.chestY - 0.26, z * 1.02), 0.003, 0.002, 3);
      }
    }
    if (D.cape) {
      const cp = lathe(
        [
          [0.07 * s, b.neckBase + 0.01],
          [b.shX * 1.08, b.shY - 0.03],
          [b.shX * 1.3, b.chestY - 0.12],
        ],
        { zScale: 0.72, folds: 8, foldAmp: () => 0.02 }
      );
      P.add(D.cape, cp);
    }
    // collars
    if (D.collar === 'lace' || D.collar === 'wide') {
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = D.collar === 'wide' ? 0.12 * s : 0.075 * s;
        ell(P, 'light', V(Math.sin(a) * r, b.neckBase - 0.01 - (D.collar === 'wide' ? 0.03 : 0), Math.cos(a) * r * 0.72), V(0.022, 0.016, 0.022), null, [6, 4]);
      }
    } else if (D.collar === 'high') {
      tube(P, 'light', V(0, b.neckBase - 0.01, 0), V(0, b.neckTop - 0.01, 0), 0.052 * s, 0.047 * s, 14, true);
    } else if (D.collar === 'band' || D.collar === 'wing' || D.collar === 'clerical') {
      tube(P, 'light', V(0, b.neckBase, 0), V(0, b.neckBase + 0.04, 0), 0.056 * s, 0.053 * s, 14, true);
      if (D.collar === 'wing') for (const sd of [-1, 1]) P.add('light', new THREE.PlaneGeometry(0.03, 0.03), mtx(V(sd * 0.02, b.neckBase + 0.015, 0.06 * s), new THREE.Euler(0, 0, sd * 0.8)));
    } else if (D.collar === 'sailor') {
      P.add('body', new THREE.BoxGeometry(0.26 * s, 0.16 * s, 0.01), mtx(V(0, b.shY - 0.05, -0.085 * s), new THREE.Euler(0.12, 0, 0)));
      for (const sd of [-1, 1]) P.add('body', new THREE.BoxGeometry(0.06 * s, 0.17 * s, 0.01), mtx(V(sd * 0.05 * s, b.shY - 0.08, 0.075 * s), new THREE.Euler(-0.2, 0, sd * 0.45)));
      P.add('dark', new THREE.ConeGeometry(0.02, 0.09, 6), mtx(V(0, b.chestY - 0.01, 0.1 * s), new THREE.Euler(Math.PI, 0, 0)));
    }
    if (D.cravat) {
      ell(P, D.cravat, V(0, b.neckBase + 0.005, 0.055 * s), V(0.025, 0.02, 0.015));
      P.add(D.cravat, new THREE.ConeGeometry(0.03, 0.09, 6), mtx(V(0, b.neckBase - 0.045, 0.06 * s), new THREE.Euler(Math.PI, 0, 0), V(1, 1, 0.4)));
    }
    if (D.beads) for (let i = 0; i < 26; i++) {
      const a = Math.PI * 0.2 + (i / 25) * Math.PI * 1.6;
      ell(P, 'dark', V(Math.sin(a + Math.PI) * 0.07 * s, b.neckBase - 0.02 - Math.sin(i / 25 * Math.PI) * 0.07, Math.cos(a + Math.PI) * -0.065 * s), V(0.006, 0.006, 0.006), null, [6, 4]);
    }
    if (D.brooch) ell(P, 'light', V(0, b.neckBase - 0.04, fz(b.neckBase - 0.04) + 0.006), V(0.012, 0.015, 0.006), null, [8, 6]);
    if (D.seaweed) {
      // weed and wrack trailing from a drowned man's shoulders and sleeves
      for (let i = 0; i < 9; i++) {
        const sd = i % 2 ? 1 : -1;
        const x = sd * (0.05 + (i * 0.037) % 0.16);
        const pts = [];
        for (let k = 0; k < 6; k++) pts.push(V(x + Math.sin(k * 1.3 + i) * 0.02, b.shY - 0.02 - k * 0.09, 0.09 + Math.cos(k + i) * 0.03));
        chain(P, 'dark', pts, 0.008, 0.003, 4);
      }
    }
  }

  // ------------------------------------------------------------------ arms
  const arms = poseArms(spec, b);
  const sleeveSlot = D.sleeves || (male ? 'dark' : D.slot || 'body');
  const handPos = {};
  for (const key of ['R', 'L']) {
    const a = arms.arms[key];
    if (!a) continue;
    const sh = a.sh.clone().add(V(-a.side * 0.035, -0.02, 0));
    const elbow = a.elbow;
    const wrist = a.wrist;
    const rolled = D.rolled;
    const ur = (male ? 0.056 : 0.05) * s * (D.puff ? 1.4 : 1);
    tube(P, sleeveSlot, sh, elbow, ur, 0.042 * s, 12);
    if (rolled) {
      // shirt sleeves rolled to the elbow, bare forearms
      P.add('light', new THREE.TorusGeometry(0.042 * s, 0.012 * s, 6, 12), mtx(elbow, new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), wrist.clone().sub(elbow).normalize())));
      tube(P, 'skin', elbow, wrist, 0.032 * s, 0.026 * s, 8);
    } else {
      tube(P, sleeveSlot, elbow.clone().add(wrist.clone().sub(elbow).normalize().multiplyScalar(-0.02)), wrist, 0.043 * s, (D.bell ? 0.062 : 0.035) * s, 12);
      if (D.cuffs) P.add(D.cuffs, new THREE.TorusGeometry((D.bell ? 0.058 : 0.034) * s, 0.009 * s, 6, 12), mtx(wrist, new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), wrist.clone().sub(elbow).normalize())));
    }
    if (D.pincushion && key === 'L') ell(P, 'body', wrist.clone().add(V(0, 0.03, 0)), V(0.03, 0.02, 0.03));
    const dir = wrist.clone().sub(elbow).normalize();
    hand(P, D.gloves ? 'light' : 'skin', wrist, dir, a.palm.clone().normalize(), b.hand, a.curl, key === 'R' ? 1 : -1);
    handPos[key] = wrist.clone().add(dir.clone().multiplyScalar(0.07 * b.hand));
  }

  // ------------------------------------------------------------------ head
  const head = mtx(V(0, b.neckBase, 0), new THREE.Euler(spec.headBow ?? 0, spec.headTurn ?? 0, spec.headTilt ?? 0)).multiply(mtx(V(0, -b.neckBase, 0)));
  P.push(head);
  tube(P, 'skin', V(0, b.neckBase - 0.02, -0.005), V(0, b.chinY + 0.03, -0.02), 0.047 * s, 0.043 * s, 12);
  P.push(mtx(V(0, b.headY, 0)));
  headGeometry(P, { ...spec.face, child: b.child, sex: spec.sex }, b.headR);
  const hr = b.headR;
  hair(P, spec, hr, b);
  hat(P, spec, hr, b);
  if (spec.spectacles) spectacles(P, hr);
  P.pop();
  P.pop();
  P.pop(); // spine

  // ----------------------------------------------------------------- props
  for (const pr of arms.props) {
    const at = pr.pos ? pr.pos.clone().applyMatrix4(spine) : handPos[pr.at].clone().applyMatrix4(spine).add(pr.off || V(0, 0, 0));
    const o = { scale: s, bottom: pr.bottom, top: pr.top ? pr.top.clone().applyMatrix4(spine) : null };
    prop(P, pr.kind, at, o);
  }
  return { geo: P.merged(), height: b.H, headY: b.headY };
}

// ----------------------------------------------------------------- hair

function hair(P, spec, r, b) {
  const H = spec.hair || {};
  const slot = H.slot || 'dark';
  const style = H.style || (spec.sex === 'm' ? 'short' : 'bun');
  const cap = (scale = 1.04, cut = 0.55, y = 0.012) =>
    P.add(slot, new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI * cut), mtx(V(0, y, -0.006), null, V(r.x * scale, r.y * scale, r.z * scale)));
  switch (style) {
    case 'bald':
      // a fringe round the back and sides
      P.add(slot, new THREE.TorusGeometry(r.x * 0.98, 0.022, 6, 20, Math.PI * 1.3), mtx(V(0, -0.005, -0.012), new THREE.Euler(Math.PI / 2 - 0.25, 0, Math.PI * 0.85), V(1, r.z / r.x, 1)));
      break;
    case 'short':
      cap(1.05, 0.42, 0.012);
      for (const sd of [-1, 1]) ell(P, slot, V(sd * r.x * 0.94, -0.02, 0.0), V(0.012, 0.035, 0.022));
      break;
    case 'slick':
      cap(1.03, 0.4, 0.008);
      break;
    case 'bun':
      cap(1.05, 0.5, 0.01);
      // hair smoothed over the tops of the ears and gathered behind
      for (const sd of [-1, 1]) ell(P, slot, V(sd * r.x * 0.86, r.y * 0.12, -0.03), V(0.02, 0.04, 0.045));
      ell(P, slot, V(0, H.high ? r.y * 0.75 : -r.y * 0.25, -r.z * 1.0), V(0.05, 0.045, 0.045));
      break;
    case 'ringlets':
      cap(1.05, 0.52, 0.01);
      for (const sd of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const x = sd * r.x * (1.0 + k * 0.08);
          const z = -0.02 - k * 0.02;
          for (let i = 0; i < 6; i++) ell(P, slot, V(x + Math.sin(i * 1.7) * 0.006, -0.02 - i * 0.03, z), V(0.014, 0.017, 0.014), null, [6, 5]);
        }
      }
      break;
    case 'loose':
    case 'wild': {
      cap(1.06, 0.55, 0.01);
      const len = (H.len ?? 0.55) * (b.child ? 0.7 : 1);
      const wild = style === 'wild' ? 1 : 0;
      // a curtain of hair down the back and over the shoulders
      const sheet = new THREE.CylinderGeometry(r.x * 1.05, r.x * (1.5 + wild * 0.6), len, 18, 6, true, Math.PI * 0.42, Math.PI * 1.16);
      const pos = sheet.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const a = Math.atan2(pos.getX(i), pos.getZ(i));
        const t = (len / 2 - y) / len;
        const n = Math.sin(a * 9 + y * 13) * (0.008 + wild * 0.03) * t;
        pos.setX(i, pos.getX(i) * (1 + n * 3));
        pos.setZ(i, pos.getZ(i) * (1 + n * 3) * 0.9);
      }
      sheet.computeVertexNormals();
      P.add(slot, sheet, mtx(V(0, -len / 2 + r.y * 0.3, -0.01)));
      if (style === 'wild') for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + 0.17;
        const back = Math.cos(a) < 0.2;
        const y0 = r.y * (0.15 + ((i * 0.37) % 0.5));
        const p0 = V(Math.sin(a) * r.x * 0.95, y0, Math.cos(a) * r.z * 0.85);
        const out = V(Math.sin(a), 0, Math.cos(a) * (back ? 1 : 0.4));
        const p1 = p0.clone().add(out.clone().multiplyScalar(0.07)).add(V(0, -0.02, 0));
        const p2 = p1.clone().add(out.clone().multiplyScalar(0.06)).add(V(0, -0.09 - (i % 3) * 0.04, 0));
        chain(P, slot, [p0, p1, p2], 0.012, 0.003, 4);
      }
      break;
    }
    case 'none':
      break;
    default:
      cap();
  }
  // facial hair
  const F = spec.facialHair;
  if (F) {
    const fs = spec.facialSlot || slot;
    if (F === 'beard' || F === 'full' || F === 'long') {
      const long = F === 'long' ? 1 : 0;
      // round the jaw and chin, leaving the mouth clear
      P.add(fs, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI * 0.74, Math.PI * 0.26), mtx(V(0, -r.y * 0.06, 0.006), null, V(r.x * 1.06, r.y * (1.0 + long * 1.1), r.z * 1.08)));
      // sideburns from the temples down to the beard
      for (const sd of [-1, 1]) onHead(P, fs, r, spec.face, sd, [[80, 4, 0.011, 0.02], [78, -10, 0.013, 0.022], [74, -24, 0.016, 0.024], [68, -36, 0.02, 0.024]], 0.01);
      if (long) ell(P, fs, V(0, -r.y * 1.45, r.z * 0.55), V(0.05, 0.09, 0.035));
    }
    // side whiskers: narrow at the temple, broad along the jaw, then swept
    // forward into the moustache, leaving the chin shaved
    if (F === 'muttonchops') for (const sd of [-1, 1]) onHead(P, fs, r, spec.face, sd, [[80, 6, 0.011, 0.02], [79, -8, 0.013, 0.022], [76, -21, 0.017, 0.024], [70, -32, 0.021, 0.025], [62, -39, 0.022, 0.023], [53, -41, 0.02, 0.02], [45, -39, 0.016, 0.016]], 0.012);
    if (F === 'beard' || F === 'full' || F === 'muttonchops' || F === 'moustache' || F === 'long' || F === 'curled') {
      // two wings over the upper lip, following the face round: plain ones
      // droop at the ends, a waxed one turns up into curls
      const curl = F === 'curled' ? 1 : 0;
      for (const sd of [-1, 1]) {
        P.add(fs, sphere(10, 6), mtx(V(sd * 0.024, -r.y * 0.53, r.z * 0.94), new THREE.Euler(0, sd * 0.45, -sd * (0.32 - curl * 0.42)), V(0.028, 0.01, 0.012)));
        if (curl) ell(P, fs, V(sd * 0.05, -r.y * 0.47, r.z * 0.82), V(0.008, 0.008, 0.008), null, [6, 4]);
      }
    }
  }
}

// Hair lying flat on the head: blobs at [azimuth from the front, latitude
// from the eye line (degrees), width, height], pressed against the skin.
function onHead(P, slot, r, f = {}, sd, pts, depth) {
  const Z = V(0, 0, 1);
  // three blobs per span so they merge into one band
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < 3; k++) dense.push(pts[i].map((v, j) => v + (pts[i + 1][j] - v) * (k / 3)));
  }
  dense.push(pts[pts.length - 1]);
  for (const [az, lat, w, h] of dense) {
    const a = az * DEG;
    const l = lat * DEG;
    const jaw = 1 - (f.child ? 0.08 : 0.16) * smooth(110, 170, 90 - lat) * (f.jaw ?? 1);
    const rx = r.x * jaw;
    const p = V(sd * Math.sin(a) * Math.cos(l) * rx, Math.sin(l) * r.y, Math.cos(a) * Math.cos(l) * r.z);
    const n = V(p.x / (rx * rx), p.y / (r.y * r.y), p.z / (r.z * r.z)).normalize();
    P.add(slot, sphere(10, 8), mtx(p.add(n.clone().multiplyScalar(depth * 0.35)), new THREE.Quaternion().setFromUnitVectors(Z, n), V(w, h, depth)));
  }
}

// ----------------------------------------------------------------- hats

function hat(P, spec, r, b) {
  const h = spec.hat;
  if (!h) return;
  const top = r.y * 0.88;
  switch (h) {
    case 'top':
      P.add('dark', new THREE.CylinderGeometry(r.x * 1.05, r.x * 0.98, 0.2, 20), mtx(V(0, top + 0.1, -0.005)));
      P.add('dark', new THREE.CylinderGeometry(r.x * 1.75, r.x * 1.75, 0.012, 24), mtx(V(0, top - 0.005, -0.005), null, V(1, 1, 0.85)));
      break;
    case 'flatcap':
      P.add('dark', sphere(18, 8), mtx(V(0, top - 0.005, 0.01), null, V(r.x * 1.18, 0.04, r.z * 1.25)));
      P.add('dark', new THREE.CylinderGeometry(0.07, 0.07, 0.008, 14, 1, false, -Math.PI * 0.5, Math.PI), mtx(V(0, top - 0.035, r.z * 0.95), new THREE.Euler(0.15, 0, 0), V(1, 1, 0.65)));
      break;
    case 'wide':
      // a battered slouch hat: low round crown, wide drooping brim
      P.add('dark', new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mtx(V(0, top - 0.005, 0), null, V(r.x * 1.12, 0.085, r.z * 1.1)));
      P.add('dark', new THREE.CylinderGeometry(r.x * 2.3, r.x * 2.3, 0.01, 24), mtx(V(0, top - 0.01, 0), new THREE.Euler(0.12, 0, 0.06)));
      break;
    case 'bowler':
      P.add('dark', new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mtx(V(0, top - 0.01, 0), null, V(r.x * 1.12, 0.1, r.z * 1.15)));
      P.add('dark', new THREE.CylinderGeometry(r.x * 1.6, r.x * 1.6, 0.008, 22), mtx(V(0, top - 0.012, 0)));
      break;
    case 'lacecap':
    case 'mobcap':
    case 'housekeeper': {
      const puff = h === 'mobcap' ? 1.25 : 1.1;
      P.add('light', new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mtx(V(0, r.y * 0.25, -0.02), null, V(r.x * puff, r.y * 0.85, r.z * puff)));
      for (let i = 0; i < 20; i++) {
        const a = Math.PI * (0.55 + (i / 19) * 0.9) * (i % 2 ? 1 : 1);
        ell(P, 'light', V(Math.cos(a) * r.x * 1.05, r.y * 0.3 + Math.sin(a) * 0.01, Math.sin(a) * -r.z * 0.2 + r.z * 0.55), V(0.017, 0.014, 0.01), null, [6, 4]);
      }
      if (h === 'lacecap') for (const sd of [-1, 1]) P.add('light', new THREE.PlaneGeometry(0.04, 0.22), mtx(V(sd * r.x * 1.02, -r.y * 0.3, 0.0), new THREE.Euler(0, sd * Math.PI / 2, 0)));
      break;
    }
    case 'nurse': {
      // a frilled cap set on the back of the head, streamers behind
      const M = mtx(V(0, r.y * 0.16, -0.035), new THREE.Euler(-0.55, 0, 0), V(r.x * 1.12, r.y * 0.86, r.z * 1.1));
      P.add('light', new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), M);
      const rim = Math.PI * 0.42;
      for (let i = 0; i < 19; i++) {
        const ph = (i / 18) * Math.PI;
        const e = V(Math.sin(rim) * Math.cos(ph), Math.cos(rim), Math.sin(rim) * Math.sin(ph)).applyMatrix4(M);
        ell(P, 'light', e, V(0.016, 0.013 + (i % 2) * 0.004, 0.009), new THREE.Euler(-0.55, 0, 0), [6, 4]);
      }
      for (const sd of [-1, 1]) P.add('light', new THREE.PlaneGeometry(0.035, 0.24), mtx(V(sd * 0.025, -r.y * 0.55, -r.z * 1.05), new THREE.Euler(0.12, 0, sd * 0.07)));
      break;
    }
    case 'sailor':
      P.add('light', new THREE.CylinderGeometry(r.x * 1.25, r.x * 1.0, 0.03, 20), mtx(V(0, top + 0.01, 0), new THREE.Euler(-0.2, 0, 0)));
      P.add('dark', new THREE.CylinderGeometry(r.x * 1.01, r.x * 1.01, 0.02, 20, 1, true), mtx(V(0, top - 0.01, 0), new THREE.Euler(-0.2, 0, 0)));
      for (const sd of [-1, 1]) P.add('dark', new THREE.PlaneGeometry(0.012, 0.08), mtx(V(sd * 0.012, top - 0.05, -r.z * 1.0)));
      break;
    case 'captain':
      P.add('dark', new THREE.CylinderGeometry(r.x * 1.12, r.x * 1.0, 0.06, 20), mtx(V(0, top + 0.01, 0)));
      P.add('dark', new THREE.CylinderGeometry(0.06, 0.06, 0.006, 14, 1, false, -Math.PI * 0.5, Math.PI), mtx(V(0, top - 0.02, r.z * 0.95), new THREE.Euler(0.3, 0, 0), V(1.2, 1, 0.6)));
      ell(P, 'light', V(0, top + 0.01, r.z * 1.08), V(0.012, 0.012, 0.004), null, [6, 4]);
      break;
    case 'turban':
      for (let i = 0; i < 4; i++) P.add('body', new THREE.TorusGeometry(r.x * (1.02 - i * 0.12), 0.03 - i * 0.004, 8, 20), mtx(V(0, r.y * (0.45 + i * 0.13), -0.01), new THREE.Euler(Math.PI / 2 + 0.12 * (i % 2 ? 1 : -1), 0, 0), V(1, r.z / r.x, 1)));
      ell(P, 'glow', V(0, r.y * 0.62, r.z * 1.05), V(0.016, 0.02, 0.008), null, [8, 6]);
      tube(P, 'light', V(0, r.y * 0.65, r.z * 1.06), V(0.02, r.y * 1.15, r.z * 0.9), 0.006, 0.002, 4);
      break;
    case 'tiara':
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.3 + (i / 8) * 0.4);
        const p = V(-Math.cos(a) * r.x * 0.95, r.y * 0.58 + Math.sin(a) * 0.02, Math.sin(a) * r.z * 0.6);
        ell(P, 'light', p, V(0.006, i === 4 ? 0.022 : 0.012, 0.006), null, [6, 4]);
      }
      break;
    case 'wreath':
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        ell(P, 'light', V(Math.sin(a) * r.x * 1.0, r.y * 0.5, Math.cos(a) * r.z * 0.95), V(0.014, 0.012, 0.014), null, [6, 4]);
      }
      break;
    case 'flowers':
      for (let i = 0; i < 6; i++) ell(P, 'light', V(r.x * 0.8 + (i % 2) * 0.012, r.y * (0.2 + i * 0.07), -0.02 - i * 0.008), V(0.016, 0.014, 0.014), null, [6, 4]);
      break;
    default:
  }
  const veil = spec.veil;
  if (veil) {
    // a veil hung from the crown: bridal (long, open in front), widow's
    // (long, thrown back), or mourning (down over the face)
    const len = veil === 'mourning' ? 0.95 : veil === 'bridal' ? 1.45 : 1.25;
    const slot = veil === 'bridal' ? 'light' : 'dark';
    const front = veil === 'mourning';
    const top = front ? Math.max(r.x, r.z) * 1.42 : r.x * 1.12;
    const g = new THREE.CylinderGeometry(top, r.x * (front ? 2.4 : 3.0), len, 22, 6, true, front ? 0 : Math.PI * 0.35, front ? Math.PI * 2 : Math.PI * 1.3);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const a = Math.atan2(pos.getX(i), pos.getZ(i));
      const t = (len / 2 - y) / len;
      const n = 1 + Math.sin(a * 11 + y * 6) * 0.05 * t;
      pos.setX(i, pos.getX(i) * n);
      pos.setZ(i, pos.getZ(i) * n * (front ? 1.0 : 0.8));
    }
    g.computeVertexNormals();
    P.add(slot, g, mtx(V(0, r.y * (front ? 1.02 : 0.65) - len / 2, front ? 0.012 : -0.03)));
    if (front) P.add(slot, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mtx(V(0, r.y * 1.0, 0.012), null, V(top, r.y * 0.45, top)));
  }
}

// Wire spectacles on the bridge of the nose, temples back to the ears.
function spectacles(P, r) {
  for (const sd of [-1, 1]) {
    const c = V(sd * 0.302 * r.x, 0.038 * r.y, r.z * 0.99 + 0.006);
    P.add('light', new THREE.TorusGeometry(0.014, 0.0012, 4, 16), mtx(c, null, V(1.15, 1, 1)));
    tube(P, 'light', c.clone().add(V(sd * 0.016, 0.002, -0.004)), V(sd * r.x * 1.0, 0.04 * r.y, 0.0), 0.0012, 0.0012, 3);
  }
  tube(P, 'light', V(-0.012, 0.045 * r.y, r.z * 1.03), V(0.012, 0.045 * r.y, r.z * 1.03), 0.0012, 0.0012, 3);
}
