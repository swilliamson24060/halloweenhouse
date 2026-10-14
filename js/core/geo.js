import * as THREE from 'three';

// GeoBuilder collects static geometry into one bucket per material and
// produces a single merged mesh per bucket. Every UV produced here is in
// metres (world-projected) unless explicit UVs are given, so a material's
// texture.repeat decides the real-world tile size and neighbouring pieces
// line up seamlessly.

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _uv = [0, 0];
const _corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

export function worldUV(p, nx, ny, nz, out) {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ay > ax && ay > az) {
    out[0] = p.x;
    out[1] = ny > 0 ? -p.z : p.z;
  } else {
    const len = Math.hypot(nx, nz) || 1;
    const tx = nz / len;
    const tz = -nx / len;
    out[0] = p.x * tx + p.z * tz;
    out[1] = p.y;
  }
  return out;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
export function mat(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Faces of a unit box (-0.5..0.5) in CCW order as seen from outside.
const BOX_FACES = {
  px: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]],
  nx: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]],
  py: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]],
  ny: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]],
  pz: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
  nz: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
};
const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

function faceKey(keys, name) {
  if (keys == null) return null;
  if (typeof keys === 'string') return keys;
  if (name in keys) return keys[name];
  return keys.all ?? null;
}

export class GeoBuilder {
  constructor(name = 'geo') {
    this.name = name;
    this.buckets = new Map();
    this.stack = [new THREE.Matrix4()];
  }

  get M() {
    return this.stack[this.stack.length - 1];
  }

  push(m) {
    this.stack.push(this.M.clone().multiply(m));
    return this;
  }

  // Shorthand: translate + yaw (+ optional uniform scale).
  at(x, y, z, ry = 0, s = 1) {
    return this.push(mat(x, y, z, ry, 0, 0, s));
  }

  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  bucket(key) {
    let b = this.buckets.get(key);
    if (!b) {
      b = { pos: [], nor: [], uv: [], idx: [], count: 0 };
      this.buckets.set(key, b);
    }
    return b;
  }

  // Quad from 4 points (already in the builder's local space), CCW from front.
  quad(key, p0, p1, p2, p3, uvs = null, uvo = null) {
    if (!key) return;
    const M = this.M;
    _corners[0].copy(p0).applyMatrix4(M);
    _corners[1].copy(p1).applyMatrix4(M);
    _corners[2].copy(p2).applyMatrix4(M);
    _corners[3].copy(p3).applyMatrix4(M);
    this._emitQuad(key, _corners, uvs, uvo, M.determinant() < 0);
  }

  // Quad with UVs laid out on its own plane: u along p0->p1, v along p0->p3 (metres).
  planarQuad(key, p0, p1, p2, p3, uvo = null) {
    const ux = _a.copy(p1).sub(p0);
    const len = ux.length();
    ux.divideScalar(len || 1);
    const vy = _b.copy(p3).sub(p0);
    // remove the u component so v is perpendicular
    vy.addScaledVector(ux, -vy.dot(ux));
    const vlen = vy.length();
    vy.divideScalar(vlen || 1);
    const pts = [p0, p1, p2, p3];
    const uvs = [];
    for (const p of pts) {
      const dx = _c.copy(p).sub(p0);
      uvs.push(dx.dot(ux), dx.dot(vy));
    }
    this.quad(key, p0, p1, p2, p3, uvs, uvo);
  }

  tri(key, p0, p1, p2, uvs = null) {
    if (!key) return;
    const M = this.M;
    const a = _corners[0].copy(p0).applyMatrix4(M);
    const b = _corners[1].copy(p1).applyMatrix4(M);
    const c = _corners[2].copy(p2).applyMatrix4(M);
    let flip = M.determinant() < 0;
    const B = this.bucket(key);
    _a.subVectors(b, a);
    _b.subVectors(c, a);
    _n.crossVectors(_a, _b).normalize();
    const base = B.count;
    const pts = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const p = pts[i];
      B.pos.push(p.x, p.y, p.z);
      B.nor.push(flip ? -_n.x : _n.x, flip ? -_n.y : _n.y, flip ? -_n.z : _n.z);
      if (uvs) B.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      else {
        worldUV(p, _n.x, _n.y, _n.z, _uv);
        B.uv.push(_uv[0], _uv[1]);
      }
    }
    if (flip) B.idx.push(base, base + 2, base + 1);
    else B.idx.push(base, base + 1, base + 2);
    B.count += 3;
  }

  _emitQuad(key, c, uvs, uvo, flip) {
    const B = this.bucket(key);
    let p0 = c[0];
    let p1 = c[1];
    let p2 = c[2];
    let p3 = c[3];
    let uvl = uvs;
    if (flip) {
      // mirrored transform: reverse winding so the face still points outward
      const t = p1;
      p1 = p3;
      p3 = t;
      if (uvs) uvl = [uvs[0], uvs[1], uvs[6], uvs[7], uvs[4], uvs[5], uvs[2], uvs[3]];
    }
    _a.subVectors(p1, p0);
    _b.subVectors(p3, p0);
    _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-14) {
      _a.subVectors(p2, p1);
      _b.subVectors(p0, p1);
      _n.crossVectors(_a, _b);
    }
    _n.normalize();
    const base = B.count;
    const pts = [p0, p1, p2, p3];
    const ou = uvo ? uvo[0] : 0;
    const ov = uvo ? uvo[1] : 0;
    for (let i = 0; i < 4; i++) {
      const p = pts[i];
      B.pos.push(p.x, p.y, p.z);
      B.nor.push(_n.x, _n.y, _n.z);
      if (uvl) B.uv.push(uvl[i * 2] + ou, uvl[i * 2 + 1] + ov);
      else {
        worldUV(p, _n.x, _n.y, _n.z, _uv);
        B.uv.push(_uv[0] + ou, _uv[1] + ov);
      }
    }
    B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    B.count += 4;
  }

  // Box centred at (x,y,z) with size (sx,sy,sz) rotated by ry about Y.
  box(keys, x, y, z, sx, sy, sz, ry = 0, opts = null) {
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_d.set(0, 1, 0), ry), _s.set(sx, sy, sz));
    this.boxM(keys, _m, opts);
  }

  // Box from min/max corners (axis aligned in builder space).
  boxMM(keys, x0, y0, z0, x1, y1, z1, opts = null) {
    this.box(keys, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 0, opts);
  }

  // Unit box transformed by matrix m (m includes the scale).
  boxM(keys, m, opts = null) {
    const full = _nmM.multiplyMatrices(this.M, m);
    const flip = full.determinant() < 0;
    const uvo = opts && opts.uvo;
    const explicit = opts && opts.uv;
    for (const name of FACE_NAMES) {
      const key = faceKey(keys, name);
      if (!key) continue;
      const f = BOX_FACES[name];
      for (let i = 0; i < 4; i++) _corners[i].set(f[i][0], f[i][1], f[i][2]).applyMatrix4(full);
      const uvs = explicit && explicit[name] ? explicit[name] : null;
      this._emitQuad(key, _corners, uvs, uvo, flip);
    }
  }

  // Append an arbitrary BufferGeometry, transformed by the stack and m.
  geom(key, geometry, m = null, opts = {}) {
    if (!key) return;
    const g = geometry.index ? geometry : geometry; // indexed or not, both handled
    const full = m ? _nmM.multiplyMatrices(this.M, m) : _nmM.copy(this.M);
    _nm.getNormalMatrix(full);
    const flip = full.determinant() < 0;
    const B = this.bucket(key);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const base = B.count;
    const su = opts.uvScale ? opts.uvScale[0] : 1;
    const sv = opts.uvScale ? opts.uvScale[1] : 1;
    const ou = opts.uvo ? opts.uvo[0] : 0;
    const ov = opts.uvo ? opts.uvo[1] : 0;
    for (let i = 0; i < pos.count; i++) {
      _a.fromBufferAttribute(pos, i).applyMatrix4(full);
      B.pos.push(_a.x, _a.y, _a.z);
      if (nor) {
        _b.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
      } else _b.set(0, 1, 0);
      B.nor.push(_b.x, _b.y, _b.z);
      if (opts.worldUV || !uv) {
        worldUV(_a, _b.x, _b.y, _b.z, _uv);
        B.uv.push(_uv[0] + ou, _uv[1] + ov);
      } else {
        B.uv.push(uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
      }
    }
    if (g.index) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) {
        if (flip) B.idx.push(base + ix[i], base + ix[i + 2], base + ix[i + 1]);
        else B.idx.push(base + ix[i], base + ix[i + 1], base + ix[i + 2]);
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        if (flip) B.idx.push(base + i, base + i + 2, base + i + 1);
        else B.idx.push(base + i, base + i + 1, base + i + 2);
      }
    }
    B.count += pos.count;
  }

  // Extrude a 2D shape (in the XY plane, metres) by depth along +Z, then place
  // it with matrix m. keys: { front, back, side }.
  shape(keys, shape, depth, m = null, opts = {}) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: opts.curveSegments ?? 10,
    });
    const full = m ? _nmM2.multiplyMatrices(this.M, m) : _nmM2.copy(this.M);
    _nm.getNormalMatrix(full);
    const flip = full.determinant() < 0;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const groups = geo.groups;
    for (const grp of groups) {
      for (let t = grp.start; t < grp.start + grp.count; t += 3) {
        const lnz = nor.getZ(t);
        let key;
        if (grp.materialIndex === 0) key = lnz > 0 ? keys.front : keys.back;
        else key = keys.side;
        if (!key) continue;
        const B = this.bucket(key);
        const base = B.count;
        for (let k = 0; k < 3; k++) {
          const i = t + k;
          _a.fromBufferAttribute(pos, i).applyMatrix4(full);
          _b.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
          B.pos.push(_a.x, _a.y, _a.z);
          B.nor.push(_b.x, _b.y, _b.z);
          if (grp.materialIndex === 0 && !opts.worldUV) {
            // caps: shape coordinates are already metres
            const u = pos.getX(i);
            const v = pos.getY(i);
            if (opts.capUV && lnz > 0) {
              const r = opts.capUV(u, v);
              B.uv.push(r[0], r[1]);
            } else B.uv.push(lnz > 0 ? u : -u, v);
          } else {
            worldUV(_a, _b.x, _b.y, _b.z, _uv);
            B.uv.push(_uv[0], _uv[1]);
          }
        }
        if (flip) B.idx.push(base, base + 2, base + 1);
        else B.idx.push(base, base + 1, base + 2);
        B.count += 3;
      }
    }
    geo.dispose();
    void uv;
  }

  lathe(key, points, segments, m = null, opts = {}) {
    const pts = points.map((p) => new THREE.Vector2(p[0], p[1]));
    const g = new THREE.LatheGeometry(pts, segments, opts.phiStart ?? 0, opts.phiLength ?? Math.PI * 2);
    this.geom(key, g, m, opts);
    g.dispose();
  }

  cyl(key, x, y, z, rTop, rBot, h, seg = 8, opts = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, opts.open ?? false);
    const m = opts.m ?? mat(x, y, z, opts.ry ?? 0, opts.rx ?? 0, opts.rz ?? 0);
    const circ = Math.PI * (rTop + rBot);
    this.geom(key, g, m, { uvScale: [circ, h], ...opts });
    g.dispose();
  }

  // Cylinder (frustum) between two points, written straight into the bucket.
  rod(key, ax, ay, az, bx, by, bz, r0, r1 = r0, seg = 6, opts = {}) {
    if (!key) return;
    const M = this.M;
    const A = _rA.set(ax, ay, az).applyMatrix4(M);
    const Bp = _rB.set(bx, by, bz).applyMatrix4(M);
    const sc = Math.cbrt(Math.abs(M.determinant())) || 1;
    const d = _rD.subVectors(Bp, A);
    const len = d.length();
    if (len < 1e-5) return;
    d.divideScalar(len);
    const up = Math.abs(d.y) < 0.9 ? _rU.set(0, 1, 0) : _rU.set(1, 0, 0);
    const u = _rX.crossVectors(d, up).normalize();
    const v = _rY.crossVectors(d, u);
    const R0 = r0 * sc;
    const R1 = r1 * sc;
    const slope = (R0 - R1) / len;
    const Bk = this.bucket(key);
    const base = Bk.count;
    const circ = Math.PI * (R0 + R1);
    for (let i = 0; i <= seg; i++) {
      const ang = (i / seg) * Math.PI * 2;
      const c = Math.cos(ang);
      const s2 = Math.sin(ang);
      const nx = u.x * c + v.x * s2;
      const ny = u.y * c + v.y * s2;
      const nz = u.z * c + v.z * s2;
      Bk.pos.push(A.x + nx * R0, A.y + ny * R0, A.z + nz * R0, Bp.x + nx * R1, Bp.y + ny * R1, Bp.z + nz * R1);
      let mx = nx + d.x * slope;
      let my = ny + d.y * slope;
      let mz = nz + d.z * slope;
      const ml = Math.hypot(mx, my, mz) || 1;
      mx /= ml;
      my /= ml;
      mz /= ml;
      Bk.nor.push(mx, my, mz, mx, my, mz);
      const uu = (i / seg) * circ;
      Bk.uv.push(uu, 0, uu, len);
    }
    for (let i = 0; i < seg; i++) {
      const i0 = base + i * 2;
      Bk.idx.push(i0, i0 + 2, i0 + 1, i0 + 2, i0 + 3, i0 + 1);
    }
    Bk.count += (seg + 1) * 2;
    if (opts.open === false) {
      // flat caps
      for (const [P, R, sgn] of [
        [A, R0, -1],
        [Bp, R1, 1],
      ]) {
        const cb = Bk.count;
        Bk.pos.push(P.x, P.y, P.z);
        Bk.nor.push(d.x * sgn, d.y * sgn, d.z * sgn);
        Bk.uv.push(0, 0);
        for (let i = 0; i <= seg; i++) {
          const ang = (i / seg) * Math.PI * 2;
          const c = Math.cos(ang);
          const s2 = Math.sin(ang);
          Bk.pos.push(P.x + (u.x * c + v.x * s2) * R, P.y + (u.y * c + v.y * s2) * R, P.z + (u.z * c + v.z * s2) * R);
          Bk.nor.push(d.x * sgn, d.y * sgn, d.z * sgn);
          Bk.uv.push(c * R, s2 * R);
        }
        for (let i = 0; i < seg; i++) {
          if (sgn > 0) Bk.idx.push(cb, cb + 1 + i, cb + 2 + i);
          else Bk.idx.push(cb, cb + 2 + i, cb + 1 + i);
        }
        Bk.count += seg + 2;
      }
    }
  }

  sphere(key, x, y, z, r, sx = 1, sy = 1, sz = 1, wSeg = 10, hSeg = 8, opts = {}) {
    const g = new THREE.SphereGeometry(r, wSeg, hSeg, 0, Math.PI * 2, 0, opts.thetaLength ?? Math.PI);
    const m = mat(x, y, z, opts.ry ?? 0, opts.rx ?? 0, opts.rz ?? 0, sx, sy, sz);
    this.geom(key, g, m, { uvScale: [Math.PI * 2 * r, Math.PI * r], ...opts });
    g.dispose();
  }

  isEmpty() {
    for (const b of this.buckets.values()) if (b.count) return false;
    return true;
  }

  // Produce a THREE.Group with one mesh per material bucket.
  build(materials, opts = {}) {
    const group = new THREE.Group();
    group.name = this.name;
    for (const [key, B] of this.buckets) {
      if (!B.count) continue;
      const material = materials[key];
      if (!material) {
        console.warn('GeoBuilder: missing material', key);
        continue;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      geo.setIndex(B.count > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `${this.name}:${key}`;
      const ud = material.userData || {};
      mesh.castShadow = opts.castShadow !== false && !ud.noCast;
      mesh.receiveShadow = opts.receiveShadow !== false && !ud.noReceive;
      if (ud.renderOrder) mesh.renderOrder = ud.renderOrder;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}

const _nmM = new THREE.Matrix4();
const _rA = new THREE.Vector3();
const _rB = new THREE.Vector3();
const _rD = new THREE.Vector3();
const _rU = new THREE.Vector3();
const _rX = new THREE.Vector3();
const _rY = new THREE.Vector3();
const _nmM2 = new THREE.Matrix4();
