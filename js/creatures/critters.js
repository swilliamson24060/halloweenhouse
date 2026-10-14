import * as THREE from 'three';
import { damp } from '../core/util.js';

// Crows on the fence, the raven on the weathervane, and rats.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function crowMesh(ctx, scale = 1) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 0.32, metalness: 0.15, envMap: ctx.env, envMapIntensity: 0.9 });
  const g = new THREE.Group();
  const add = (geo, pos, sc, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    if (sc) m.scale.copy(sc);
    if (rot) m.rotation.copy(rot);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const sphere = new THREE.SphereGeometry(1, 12, 9);
  add(sphere, V(0, 0.12, 0), V(0.085, 0.075, 0.16), new THREE.Euler(-0.25, 0, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.11);
  g.add(head);
  const hm = new THREE.Mesh(sphere, mat);
  hm.scale.set(0.052, 0.05, 0.06);
  head.add(hm);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.075, 6), mat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.006, 0.085);
  head.add(beak);
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.05, envMap: ctx.env, envMapIntensity: 3 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), eyeM);
    e.position.set(s * 0.04, 0.012, 0.03);
    head.add(e);
  }
  add(new THREE.BoxGeometry(0.075, 0.012, 0.15), V(0, 0.085, -0.2), null, new THREE.Euler(0.45, 0, 0));
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.05);
  wingShape.quadraticCurveTo(0.22, 0.06, 0.32, -0.02);
  wingShape.lineTo(0.28, -0.06);
  wingShape.lineTo(0.22, -0.05);
  wingShape.lineTo(0.18, -0.09);
  wingShape.lineTo(0.1, -0.08);
  wingShape.lineTo(0.0, -0.09);
  wingShape.closePath();
  const wg = new THREE.ShapeGeometry(wingShape, 3);
  wg.rotateX(Math.PI / 2);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.05, 0.16, 0.02);
    const w = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.4, side: THREE.DoubleSide }));
    w.scale.set(s, 1, 1);
    pivot.add(w);
    g.add(pivot);
    wings.push(pivot);
  }
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 4), V(s * 0.025, 0.03, 0.0));
  g.scale.setScalar(scale);
  g.userData = { head, wings };
  return g;
}

function foldWings(c, k) {
  // k = 0 folded along the body, 1 spread
  const [l, r] = c.userData.wings;
  l.rotation.set(0, -0.15 * (1 - k), 1.35 * (1 - k));
  r.rotation.set(0, 0.15 * (1 - k), -1.35 * (1 - k));
  l.scale.setScalar(0.5 + 0.5 * k);
  r.scale.setScalar(0.5 + 0.5 * k);
}

export class Crows {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    ctx.updaters.push((dt, t) => this.update(dt, t));
  }

  add(pos, yaw = 0, o = {}) {
    const mesh = crowMesh(this.ctx, o.scale ?? 1);
    mesh.position.copy(pos);
    mesh.rotation.y = yaw;
    foldWings(mesh, 0);
    this.ctx.scene.add(mesh);
    const c = { mesh, home: pos.clone(), yaw, state: 'perch', vel: new THREE.Vector3(), timer: Math.random() * 5, gone: 0, look: 0, scare: o.scare ?? 6, phase: Math.random() * 10 };
    this.list.push(c);
    return c;
  }

  flyAll(from) {
    this.list.forEach((c, i) => setTimeout(() => this.fly(c, from), i * 160 + Math.random() * 200));
  }

  fly(c, from) {
    if (c.state !== 'perch') return;
    c.state = 'fly';
    const away = c.mesh.position.clone().sub(from || this.ctx.player.pos).setY(0).normalize();
    if (!isFinite(away.x)) away.set(0, 0, -1);
    c.vel.copy(away).multiplyScalar(3 + Math.random() * 2).add(V((Math.random() - 0.5) * 2, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 2));
    c.timer = 6;
    this.ctx.audio.wings(c.mesh.position.clone());
    if (Math.random() < 0.7) this.ctx.audio.caw(c.mesh.position.clone(), { count: 1 + Math.floor(Math.random() * 3) });
  }

  update(dt, t) {
    const pl = this.ctx.player.pos;
    for (const c of this.list) {
      const m = c.mesh;
      if (c.state === 'perch') {
        // idle: head turns and the odd caw
        c.timer -= dt;
        if (c.timer <= 0) {
          c.look = (Math.random() - 0.5) * 2.2;
          c.timer = 1.5 + Math.random() * 4;
          const dd = m.position.distanceTo(pl);
          if (Math.random() < 0.18 && dd < 30) {
            this.ctx.audio.caw(m.position.clone(), { count: 1 + Math.floor(Math.random() * 2) });
            m.userData.head.rotation.x = -0.4;
          }
        }
        m.userData.head.rotation.y = damp(m.userData.head.rotation.y, c.look, 8, dt);
        m.userData.head.rotation.x = damp(m.userData.head.rotation.x, 0, 4, dt);
        if (Math.hypot(pl.x - m.position.x, pl.z - m.position.z) < c.scare) this.fly(c, pl);
      } else if (c.state === 'fly') {
        c.timer -= dt;
        c.vel.y += dt * 0.6;
        m.position.addScaledVector(c.vel, dt);
        m.rotation.y = Math.atan2(c.vel.x, c.vel.z);
        m.rotation.x = -0.3;
        const k = 0.5 + 0.5 * Math.sin(t * 22 + c.phase);
        const [l, r] = m.userData.wings;
        l.rotation.set(0, 0, (k - 0.5) * 1.6);
        r.rotation.set(0, 0, -(k - 0.5) * 1.6);
        l.scale.setScalar(1);
        r.scale.setScalar(1);
        if (c.timer <= 0) {
          c.state = 'gone';
          m.visible = false;
          c.gone = 40 + Math.random() * 30;
        }
      } else if (c.state === 'gone') {
        c.gone -= dt;
        if (c.gone <= 0 && m.position.distanceTo(pl) > 0 && c.home.distanceTo(pl) > 16) {
          c.state = 'perch';
          m.position.copy(c.home);
          m.rotation.set(0, c.yaw, 0);
          foldWings(m, 0);
          m.visible = true;
        }
      }
    }
  }
}

// The weathervane on the turret, with a raven riding it.
export function weathervane(ctx, base) {
  const g = new THREE.Group();
  g.position.copy(base);
  const iron = ctx.mat.ironBlack;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.2, 6), iron);
  rod.position.y = 0.6;
  g.add(rod);
  // fixed compass arms
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.015), iron);
    arm.position.set(Math.cos(a) * 0.21, 0.35, Math.sin(a) * 0.21);
    arm.rotation.y = -a;
    g.add(arm);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.01), iron);
    plate.position.set(Math.cos(a) * 0.44, 0.35, Math.sin(a) * 0.44);
    plate.rotation.y = -a + Math.PI / 2;
    g.add(plate);
  }
  // the turning arrow
  const vane = new THREE.Group();
  vane.position.y = 0.75;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.9), iron);
  vane.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), iron);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.5;
  vane.add(tip);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.16, 0.22), iron);
  fin.position.z = -0.42;
  vane.add(fin);
  g.add(vane);
  const raven = crowMesh(ctx, 1.6);
  raven.position.set(0, 1.2, 0);
  foldWings(raven, 0);
  g.add(raven);
  ctx.scene.add(g);
  const state = { vane, raven, yaw: 0.6, next: 8 };
  ctx.updaters.push((dt, t) => {
    const want = 0.6 + Math.sin(t * 0.07) * 0.8 + Math.sin(t * 0.31) * 0.25;
    const before = state.yaw;
    state.yaw = damp(state.yaw, want, 0.8, dt);
    vane.rotation.y = state.yaw;
    if (Math.abs(state.yaw - before) > 0.002 && Math.random() < 0.004) ctx.audio.creak(base.clone().add(V(0, 0.8, 0)), { short: true, metal: true, gain: 0.4, pitch: 1.6 });
    // the raven watches the player
    const pl = ctx.camera.position;
    const look = Math.atan2(pl.x - base.x, pl.z - base.z);
    raven.rotation.y = damp(raven.rotation.y, look * 0.5, 0.5, dt);
    raven.userData.head.rotation.y = damp(raven.userData.head.rotation.y, Math.max(-1, Math.min(1, look - raven.rotation.y)), 2, dt);
    state.next -= dt;
    if (state.next <= 0) {
      state.next = 14 + Math.random() * 20;
      const d = pl.distanceTo(base);
      if (d < 40) {
        ctx.audio.caw(base.clone().add(V(0, 1.4, 0)), { count: 2 + Math.floor(Math.random() * 2), big: true });
        raven.userData.head.rotation.x = -0.5;
        setTimeout(() => (raven.userData.head.rotation.x = 0), 700);
      }
    }
  });
  return state;
}

export class Rats {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.mat = new THREE.MeshStandardMaterial({ color: 0x2a231e, roughness: 0.85 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x5a4640, roughness: 0.6 });
    ctx.updaters.push((dt, t) => this.update(dt, t));
  }

  mesh() {
    const g = new THREE.Group();
    const s = new THREE.SphereGeometry(1, 10, 8);
    const body = new THREE.Mesh(s, this.mat);
    body.scale.set(0.045, 0.04, 0.1);
    body.position.y = 0.045;
    g.add(body);
    const head = new THREE.Mesh(s, this.mat);
    head.scale.set(0.028, 0.026, 0.05);
    head.position.set(0, 0.05, 0.11);
    g.add(head);
    for (const k of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CircleGeometry(0.014, 8), this.tailMat);
      ear.position.set(k * 0.018, 0.078, 0.095);
      ear.rotation.y = k * 0.5;
      g.add(ear);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.007, 0.16, 4), this.tailMat);
    tail.rotation.x = Math.PI / 2 - 0.15;
    tail.position.set(0, 0.03, -0.17);
    g.add(tail);
    g.traverse((o) => (o.castShadow = true));
    return g;
  }

  // points: list of [x,z] the rat runs between, at floor height y
  add(points, y) {
    const m = this.mesh();
    const pts = points.map(([x, z]) => V(x, y, z));
    m.position.copy(pts[0]);
    this.ctx.scene.add(m);
    const r = { mesh: m, pts, i: 0, next: 1, state: 'pause', timer: Math.random() * 4, speed: 0, y, phase: Math.random() * 10 };
    this.list.push(r);
    return r;
  }

  update(dt, t) {
    const pl = this.ctx.player.pos;
    for (const r of this.list) {
      const m = r.mesh;
      const d = Math.hypot(pl.x - m.position.x, pl.z - m.position.z);
      const near = Math.abs(pl.y - r.y) < 3 && d < 20;
      m.visible = near;
      if (!near) continue;
      r.timer -= dt;
      if (d < 2.4 && r.state === 'pause') {
        r.state = 'run';
        r.timer = 0;
        if (Math.random() < 0.6) this.ctx.audio.squeak(m.position.clone());
      }
      if (r.state === 'pause') {
        m.rotation.x = Math.sin(t * 14 + r.phase) * 0.04;
        if (r.timer <= 0) {
          r.state = 'run';
          if (Math.random() < 0.2) this.ctx.audio.squeak(m.position.clone(), 0.5);
        }
      } else {
        const tgt = r.pts[r.next];
        const dx = tgt.x - m.position.x;
        const dz = tgt.z - m.position.z;
        const dist = Math.hypot(dx, dz);
        r.speed = damp(r.speed, 1.8, 6, dt);
        const step = Math.min(dist, r.speed * dt);
        m.position.x += (dx / (dist || 1)) * step;
        m.position.z += (dz / (dist || 1)) * step;
        m.rotation.y = Math.atan2(dx, dz);
        m.position.y = r.y + Math.abs(Math.sin(t * 30)) * 0.006;
        if (dist < 0.05) {
          r.i = r.next;
          r.next = (r.next + 1) % r.pts.length;
          r.state = 'pause';
          r.timer = 0.6 + Math.random() * 3.5;
          r.speed = 0;
        }
      }
    }
  }
}
