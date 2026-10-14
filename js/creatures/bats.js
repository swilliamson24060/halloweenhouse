import * as THREE from 'three';

// Bats: instanced body + two wings. They circle the turret, roost upside
// down under the attic beams and burst into a swarm when disturbed.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

function wingGeometry() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.025);
  sh.quadraticCurveTo(0.08, 0.07, 0.15, 0.05);
  sh.lineTo(0.22, 0.01);
  sh.quadraticCurveTo(0.19, -0.015, 0.17, -0.04);
  sh.quadraticCurveTo(0.14, -0.02, 0.12, -0.055);
  sh.quadraticCurveTo(0.09, -0.03, 0.065, -0.065);
  sh.quadraticCurveTo(0.04, -0.035, 0.0, -0.04);
  sh.closePath();
  const g = new THREE.ShapeGeometry(sh, 4);
  g.rotateX(Math.PI / 2);
  return g;
}

export class Bats {
  constructor(ctx, max = 40) {
    this.ctx = ctx;
    const mat = new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: 0.8, side: THREE.DoubleSide });
    const body = new THREE.SphereGeometry(1, 8, 6);
    const wing = wingGeometry();
    this.body = new THREE.InstancedMesh(body, mat, max);
    this.wl = new THREE.InstancedMesh(wing, mat, max);
    this.wr = new THREE.InstancedMesh(wing, mat, max);
    for (const m of [this.body, this.wl, this.wr]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      ctx.scene.add(m);
    }
    this.list = [];
    this.max = max;
    this.lastSqueak = 0;
    ctx.updaters.push((dt, t) => this.update(dt, t));
  }

  add(o) {
    if (this.list.length >= this.max) return null;
    const b = {
      pos: new THREE.Vector3(...o.pos),
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2),
      mode: o.mode ?? 'orbit',
      center: o.center ? new THREE.Vector3(...o.center) : new THREE.Vector3(...o.pos),
      radius: o.radius ?? 6,
      height: o.height ?? 2,
      roost: o.roost ? new THREE.Vector3(...o.roost) : null,
      phase: Math.random() * 100,
      flap: 14 + Math.random() * 6,
      scale: o.scale ?? 1,
      group: o.group ?? 'default',
      target: new THREE.Vector3(),
      timer: 0,
      hidden: false,
    };
    this.list.push(b);
    const n = this.list.length;
    this.body.count = this.wl.count = this.wr.count = n;
    return b;
  }

  // Startle a group: they swarm past `toward`, then settle back.
  burst(group, toward, seconds = 7) {
    for (const b of this.list) {
      if (b.group !== group) continue;
      b.mode = 'swarm';
      b.timer = seconds * (0.7 + Math.random() * 0.6);
      b.target.copy(toward).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.6));
      b.vel.set((Math.random() - 0.5) * 3, -1 - Math.random(), (Math.random() - 0.5) * 3);
    }
  }

  update(dt, t) {
    const cam = this.ctx.camera.position;
    let nearest = Infinity;
    let nearPos = null;
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      let flapK = 1;
      let hangDown = false;
      if (b.mode === 'roost') {
        b.pos.lerp(b.roost, 1 - Math.exp(-3 * dt));
        b.vel.set(0, 0, 0);
        hangDown = true;
        flapK = Math.sin(t * 0.7 + b.phase) > 0.97 ? 0.4 : 0;
      } else {
        let desired;
        if (b.mode === 'orbit') {
          const a = t * 0.45 + b.phase;
          desired = _v.set(
            b.center.x + Math.cos(a) * b.radius + Math.sin(t * 1.3 + b.phase) * 1.5,
            b.center.y + Math.sin(t * 0.9 + b.phase * 2) * b.height,
            b.center.z + Math.sin(a) * b.radius + Math.cos(t * 1.1 + b.phase) * 1.5
          );
        } else if (b.mode === 'swarm') {
          b.timer -= dt;
          desired = _v.copy(b.target);
          if (b.pos.distanceTo(b.target) < 0.8) {
            b.target.copy(b.center).add(new THREE.Vector3((Math.random() - 0.5) * b.radius * 2, (Math.random() - 0.3) * b.height, (Math.random() - 0.5) * b.radius * 2));
          }
          if (b.timer <= 0) b.mode = b.roost ? 'return' : 'orbit';
        } else if (b.mode === 'return') {
          desired = _v.copy(b.roost);
          if (b.pos.distanceTo(b.roost) < 0.3) b.mode = 'roost';
        } else {
          desired = _v.copy(b.center);
        }
        const steer = _w.subVectors(desired, b.pos);
        const speed = b.mode === 'swarm' ? 6.5 : b.mode === 'return' ? 3 : 4.2;
        steer.setLength(speed).sub(b.vel).multiplyScalar(Math.min(1, dt * 3.2));
        b.vel.add(steer);
        b.vel.x += Math.sin(t * 9 + b.phase) * dt * 3;
        b.vel.y += Math.cos(t * 7 + b.phase) * dt * 2;
        b.pos.addScaledVector(b.vel, dt);
      }
      const d = b.pos.distanceTo(cam);
      if (d < nearest && b.mode !== 'roost') {
        nearest = d;
        nearPos = b.pos;
      }
      // orientation along velocity
      const sc = b.scale;
      if (hangDown) {
        _e.set(Math.PI, b.phase, 0);
        _q.setFromEuler(_e);
      } else {
        const yaw = Math.atan2(b.vel.x, b.vel.z);
        const pitch = -Math.atan2(b.vel.y, Math.hypot(b.vel.x, b.vel.z)) * 0.6;
        _e.set(pitch, yaw, Math.sin(t * 3 + b.phase) * 0.3, 'YXZ');
        _q.setFromEuler(_e);
      }
      _m.compose(b.pos, _q, _s.set(0.035 * sc, 0.03 * sc, 0.06 * sc));
      this.body.setMatrixAt(i, _m);
      const flap = flapK ? Math.sin(t * b.flap + b.phase) * 1.1 * flapK : 0;
      const fold = hangDown ? 0.25 : 1;
      for (const [mesh, side] of [
        [this.wl, -1],
        [this.wr, 1],
      ]) {
        _q2.setFromEuler(_e.set(0, 0, side * (hangDown ? 1.3 : flap)));
        _q2.premultiply(_q);
        _p.set(side * 0.015 * sc, 0.005 * sc, 0).applyQuaternion(_q).add(b.pos);
        _m.compose(_p, _q2, _s.set(side * sc * fold, sc, sc * fold));
        mesh.setMatrixAt(i, _m);
      }
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.wl.instanceMatrix.needsUpdate = true;
    this.wr.instanceMatrix.needsUpdate = true;
    if (nearPos && nearest < 4 && t - this.lastSqueak > 0.8) {
      this.lastSqueak = t + Math.random() * 1.5;
      this.ctx.audio.bat(nearPos.clone(), nearest);
    }
  }
}
