import * as THREE from 'three';
import { clamp, damp } from './util.js';

// First-person walker: yaw/pitch look, acceleration, stairs via walkable
// ramps, collision against the CollisionWorld, head bob and footsteps.
export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.camera = ctx.camera;
    this.col = ctx.col;
    this.input = ctx.input;
    this.pos = new THREE.Vector3(0, 0, 19);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.28;
    this.height = 1.72;
    this.eye = 1.62;
    this.walkSpeed = 2.0;
    this.runSpeed = 3.8;
    this.speedMul = 1;
    this.vy = 0;
    this.eyeY = this.pos.y + this.eye;
    this.bob = 0;
    this.bobAmt = 0;
    this.groundTag = 'stone';
    this.frozen = false;
    this.shake = 0;
    this.roll = 0;
    this.onStep = null;
    this.onLand = null;
    this.moving = false;
    this._g = { y: 0, tag: null };
    this._prev = new THREE.Vector3();
    this._lastBobSign = 1;
    this.camera.rotation.order = 'YXZ';
  }

  teleport(x, y, z, yaw = this.yaw, pitch = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.yaw = yaw;
    this.pitch = pitch;
    this.eyeY = y + this.eye;
    this.updateCamera(0);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  update(dt) {
    const input = this.input;
    const look = input.consumeLook();
    if (!this.frozen) {
      const sens = 0.0021 * input.sensitivity;
      this.yaw -= look.dx * sens;
      this.pitch -= look.dy * sens * (input.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.48, 1.48);
    }

    const ax = this.frozen ? { x: 0, y: 0 } : input.axis();
    const running = input.running() && ax.y > 0.2;
    const speed = (running ? this.runSpeed : this.walkSpeed) * this.speedMul;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    let wx = -sy * ax.y + cy * ax.x;
    let wz = -cy * ax.y - sy * ax.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const accel = wl > 0.05 ? 9 : 11;
    this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, wz * speed, accel, dt);

    const mx = this.vel.x * dt;
    const mz = this.vel.z * dt;
    const dist = Math.hypot(mx, mz);
    const steps = Math.max(1, Math.ceil(dist / 0.08));
    const stepUp = 0.45;
    for (let i = 0; i < steps; i++) {
      this._prev.copy(this.pos);
      this.pos.x += mx / steps;
      this.pos.z += mz / steps;
      this.col.resolve(this.pos, this.pos.y, this.height, this.radius);
      const g = this.col.groundAt(this.pos.x, this.pos.z, this.pos.y + stepUp, this._g);
      if (g.y === -Infinity) {
        // nothing to stand on: refuse the move
        this.pos.x = this._prev.x;
        this.pos.z = this._prev.z;
        continue;
      }
      if (g.y >= this.pos.y - 0.45 && this.vy <= 0) {
        // walk up/down stairs and small drops without falling
        this.pos.y = g.y;
        this.groundTag = g.tag;
      }
    }

    // gravity for real drops
    const g = this.col.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.05, this._g);
    if (g.y < this.pos.y - 0.001) {
      this.vy -= 18 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g.y) {
        if (this.vy < -3.5 && this.onLand) this.onLand(g.tag, -this.vy);
        this.pos.y = g.y;
        this.vy = 0;
        this.groundTag = g.tag;
      }
    } else {
      this.vy = 0;
    }

    // head bob + footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.moving = hs > 0.25;
    this.bobAmt = damp(this.bobAmt, this.moving ? Math.min(1, hs / 3) : 0, 8, dt);
    if (this.moving) {
      this.bob += dt * (running ? 10.5 : 7.4);
      const s = Math.sin(this.bob);
      const sign = s >= 0 ? 1 : -1;
      if (sign !== this._lastBobSign && this.vy === 0) {
        if (this.onStep) this.onStep(this.groundTag, running);
      }
      this._lastBobSign = sign;
    }

    this.roll = damp(this.roll, -ax.x * 0.012, 6, dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const target = this.pos.y + this.eye;
    this.eyeY = dt > 0 ? damp(this.eyeY, target, 16, dt) : target;
    const bobY = Math.abs(Math.sin(this.bob)) * 0.045 * this.bobAmt - 0.02 * this.bobAmt;
    const bobX = Math.cos(this.bob) * 0.025 * this.bobAmt;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    this.camera.position.set(this.pos.x + cy * bobX, this.eyeY + bobY, this.pos.z - sy * bobX);
    let sx = 0;
    let syy = 0;
    if (this.shake > 0) {
      const t = performance.now() * 0.001;
      const k = this.shake * this.shake * 0.05;
      sx = (Math.sin(t * 47.3) + Math.sin(t * 31.1)) * k;
      syy = (Math.sin(t * 41.7) + Math.sin(t * 27.9)) * k;
    }
    this.camera.rotation.set(this.pitch + sx, this.yaw + syy, this.roll);
  }
}
