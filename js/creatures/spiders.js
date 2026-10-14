import * as THREE from 'three';
import { damp } from '../core/util.js';

// Instanced spiders that walk on floors, walls and ceilings with an
// alternating eight-leg gait, scatter from the torch, and big ones that
// drop on a thread from the ceiling.

const LEGS = 8;
const SEGS = LEGS * 2;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _k = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HIP_Z = [0.32, 0.14, -0.04, -0.2];

export class Spiders {
  constructor(ctx, max = 90) {
    this.ctx = ctx;
    this.max = max;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b1511, roughness: 0.45, metalness: 0.1 });
    const sphere = new THREE.SphereGeometry(1, 10, 8);
    const leg = new THREE.CylinderGeometry(1, 0.7, 1, 5, 1, true);
    leg.translate(0, 0.5, 0);
    this.abd = new THREE.InstancedMesh(sphere, mat, max);
    this.head = new THREE.InstancedMesh(sphere, mat, max);
    this.legs = new THREE.InstancedMesh(leg, mat, max * SEGS);
    for (const m of [this.abd, this.head, this.legs]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      ctx.scene.add(m);
    }
    this.list = [];
    // silk threads for hanging spiders
    this.silkPos = new Float32Array(max * 6);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.silkPos, 3));
    sg.setDrawRange(0, 0);
    this.silk = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xbfbfbf, transparent: true, opacity: 0.35 }));
    this.silk.frustumCulled = false;
    ctx.scene.add(this.silk);
    this.hanging = [];
    ctx.updaters.push((dt, t) => this.update(dt, t));
  }

  // surface: { o:[x,y,z], u:[...], v:[...], w, h }  (u,v unit vectors in-plane)
  surface(o, u, v, w, h) {
    const U = new THREE.Vector3(...u).normalize();
    const Vv = new THREE.Vector3(...v).normalize();
    return { o: new THREE.Vector3(...o), u: U, v: Vv, n: new THREE.Vector3().crossVectors(U, Vv).normalize(), w, h };
  }

  floor(x0, x1, z0, z1, y) {
    return this.surface([x0, y, z1], [1, 0, 0], [0, 0, -1], x1 - x0, z1 - z0);
  }

  add(surf, o = {}) {
    if (this.list.length >= this.max) return null;
    const sp = {
      surf,
      a: o.a ?? Math.random() * surf.w,
      b: o.b ?? Math.random() * surf.h,
      heading: Math.random() * Math.PI * 2,
      size: o.size ?? 0.025 + Math.random() * 0.03,
      speed: 0,
      state: o.still ? 'still' : 'pause',
      timer: Math.random() * 3,
      phase: Math.random() * 10,
      ta: 0,
      tb: 0,
      idx: this.list.length,
      hidden: false,
      bold: !!o.bold,
    };
    sp.max = (o.speed ?? 0.12) * (0.6 + sp.size * 12);
    this.list.push(sp);
    this.abd.count = this.head.count = this.list.length;
    this.legs.count = this.list.length * SEGS;
    this._pose(sp, 0, 0);
    return sp;
  }

  // a cluster that pours out of a point on a surface and scatters
  swarm(surf, a, b, n = 16, size = 0.03) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const sp = this.add(surf, { a: a + (Math.random() - 0.5) * 0.2, b: b + (Math.random() - 0.5) * 0.2, size: size * (0.7 + Math.random() * 0.8), speed: 0.3 });
      if (!sp) break;
      sp.state = 'flee';
      sp.timer = 2 + Math.random() * 3;
      sp.heading = Math.random() * Math.PI * 2;
      out.push(sp);
    }
    return out;
  }

  // A big spider waiting near the ceiling; drop() lowers it to face height.
  hang(x, yTop, z, size = 0.09) {
    const surf = this.surface([x, yTop, z], [1, 0, 0], [0, 0, 1], 0.001, 0.001);
    const sp = this.add(surf, { a: 0, b: 0, size, still: true });
    if (!sp) return null;
    sp.hang = { x, yTop, z, len: 0.15, target: 0.15, speed: 0, sway: Math.random() * 10 };
    this.hanging.push(sp);
    return sp;
  }

  drop(sp, toY, speed = 4) {
    if (!sp || !sp.hang) return;
    sp.hang.target = Math.max(0.15, sp.hang.yTop - toY);
    sp.hang.speed = speed;
  }

  raise(sp, speed = 0.35) {
    if (!sp || !sp.hang) return;
    sp.hang.target = 0.15;
    sp.hang.speed = speed;
  }

  _world(sp, out) {
    const s = sp.surf;
    return out.copy(s.o).addScaledVector(s.u, sp.a).addScaledVector(s.v, sp.b);
  }

  _pose(sp, t, moving) {
    const s = sp.size;
    let base;
    if (sp.hang) {
      const h = sp.hang;
      const sw = Math.sin(t * 1.3 + h.sway) * 0.02 * Math.min(1, h.len);
      base = _p.set(h.x + sw, h.yTop - h.len, h.z);
      // hanging head-down, back turned toward +z
      _f.set(0, -1, 0);
      _n.set(0, 0, 1);
      _r.crossVectors(_n, _f);
    } else {
      base = this._world(sp, _p);
      const surf = sp.surf;
      const c = Math.cos(sp.heading);
      const si = Math.sin(sp.heading);
      _f.copy(surf.u).multiplyScalar(c).addScaledVector(surf.v, si);
      _n.copy(surf.n);
      _r.crossVectors(_n, _f).normalize();
    }
    // basis: x = right, y = normal, z = forward
    _m.makeBasis(_r, _n, _f);
    _q.setFromRotationMatrix(_m);
    const L = (x, y, z, out) => out.set(x * s, y * s, z * s).applyQuaternion(_q).add(base);
    const set = (mesh, i, pos, sx, sy, sz) => {
      _m.compose(pos, _q, _s.set(sx, sy, sz));
      mesh.setMatrixAt(i, _m);
    };
    set(this.abd, sp.idx, L(0, 0.45, -0.55, _a), s * 0.48, s * 0.4, s * 0.62);
    set(this.head, sp.idx, L(0, 0.38, 0.16, _a), s * 0.32, s * 0.25, s * 0.36);
    const qBody = _q.clone();
    let li = sp.idx * SEGS;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const phase = t * (6 + sp.max * 30) + sp.phase + ((i + (side > 0 ? 1 : 0)) % 2) * Math.PI;
        const swing = moving ? Math.sin(phase) * 0.3 : 0;
        const lift = moving ? Math.max(0, Math.cos(phase)) * 0.3 : 0;
        const hz = HIP_Z[i];
        const spread = 1.15 + (i === 0 || i === 3 ? 0.15 : 0);
        _q.copy(qBody);
        const hip = L(side * 0.16, 0.38, hz, new THREE.Vector3());
        const foot = L(side * spread, sp.hang ? -0.2 : 0, hz * 2.4 + swing, new THREE.Vector3());
        const knee = L(side * spread * 0.62, 0.95 + lift, hz * 1.7 + swing * 0.5, new THREE.Vector3());
        this._seg(li++, hip, knee, s * 0.045);
        this._seg(li++, knee, foot, s * 0.035);
      }
    }
    _q.copy(qBody);
  }

  _seg(i, a, b, r) {
    _k.subVectors(b, a);
    const len = _k.length();
    _k.divideScalar(len || 1);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, _k);
    _m.compose(a, q, _s.set(r, len, r));
    this.legs.setMatrixAt(i, _m);
  }

  update(dt, t) {
    const ctx = this.ctx;
    const cam = ctx.camera.position;
    const fl = ctx.flashlight;
    let silkN = 0;
    let dirty = false;
    for (const sp of this.list) {
      const wp = sp.hang ? _b.set(sp.hang.x, sp.hang.yTop - sp.hang.len, sp.hang.z) : this._world(sp, _b);
      const dist = wp.distanceTo(cam);
      if (sp.hang) {
        const h = sp.hang;
        if (h.speed > 0) {
          const d = h.target - h.len;
          h.len += Math.sign(d) * Math.min(Math.abs(d), h.speed * dt);
          if (Math.abs(d) < 1e-3) h.speed = 0;
        }
        this.silkPos.set([h.x, h.yTop, h.z, h.x, h.yTop - h.len + sp.size * 0.4, h.z], silkN * 6);
        silkN++;
      }
      if (dist > 16 || Math.abs(wp.y - cam.y) > 4.5) continue;
      dirty = true;
      let moving = 0;
      if (!sp.hang && sp.state !== 'still') {
        const surf = sp.surf;
        // torch makes them bolt
        const lit = fl.level > 0.3 && dist < 3.2 && _r.subVectors(wp, fl.light.position).normalize().dot(fl.dir) > Math.cos(0.4);
        if (lit && sp.state !== 'flee' && !sp.bold) {
          sp.state = 'flee';
          sp.timer = 1.5 + Math.random();
          const away = Math.atan2(_r.dot(surf.v), _r.dot(surf.u));
          sp.heading = away;
          if (Math.random() < 0.3) ctx.audio.skitter(wp);
        }
        sp.timer -= dt;
        if (sp.state === 'pause') {
          if (sp.timer <= 0) {
            sp.state = 'walk';
            sp.ta = Math.random() * surf.w;
            sp.tb = Math.random() * surf.h;
            sp.timer = 2 + Math.random() * 5;
          }
        } else {
          let target;
          if (sp.state === 'walk') target = Math.atan2(sp.tb - sp.b, sp.ta - sp.a);
          else target = sp.heading;
          let diff = Math.atan2(Math.sin(target - sp.heading), Math.cos(target - sp.heading));
          sp.heading += diff * Math.min(1, dt * 6) + Math.sin(t * 7 + sp.phase) * dt * 0.8;
          const speed = sp.state === 'flee' ? sp.max * 3.2 : sp.max;
          sp.speed = damp(sp.speed, speed, 10, dt);
          sp.a += Math.cos(sp.heading) * sp.speed * dt;
          sp.b += Math.sin(sp.heading) * sp.speed * dt;
          if (sp.a < 0 || sp.a > surf.w) {
            sp.a = Math.max(0, Math.min(surf.w, sp.a));
            sp.heading = Math.PI - sp.heading;
          }
          if (sp.b < 0 || sp.b > surf.h) {
            sp.b = Math.max(0, Math.min(surf.h, sp.b));
            sp.heading = -sp.heading;
          }
          moving = 1;
          const arrived = sp.state === 'walk' && Math.hypot(sp.ta - sp.a, sp.tb - sp.b) < 0.05;
          if (sp.timer <= 0 || arrived) {
            sp.state = 'pause';
            sp.timer = 0.8 + Math.random() * 4;
          }
        }
      }
      this._pose(sp, t, moving);
    }
    if (dirty) {
      this.abd.instanceMatrix.needsUpdate = true;
      this.head.instanceMatrix.needsUpdate = true;
      this.legs.instanceMatrix.needsUpdate = true;
    }
    this.silk.geometry.setDrawRange(0, silkN * 2);
    this.silk.geometry.attributes.position.needsUpdate = true;
  }
}
