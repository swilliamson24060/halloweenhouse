import * as THREE from 'three';
import { damp } from './util.js';

// A fixed pool of point lights shared by every candle, lamp and fire in the
// house. Each frame the nearest emitters in the player's current room get
// the real lights; the rest only glow (flame sprites + bloom). Keeping the
// light count constant avoids shader recompiles.
export class LightPool {
  constructor(scene, count) {
    this.lights = [];
    this.emitters = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffaa66, 0, 6, 2);
      l.castShadow = false;
      l.visible = true;
      scene.add(l);
      this.lights.push(l);
    }
  }

  add(opts) {
    const e = {
      pos: opts.pos.clone ? opts.pos.clone() : new THREE.Vector3(...opts.pos),
      color: new THREE.Color(opts.color ?? 0xffa860),
      intensity: opts.intensity ?? 2,
      distance: opts.distance ?? 6,
      decay: opts.decay ?? 2,
      flicker: opts.flicker ?? 'candle',
      room: opts.room ?? null,
      on: opts.on ?? true,
      level: opts.on === false ? 0 : 1,
      phase: Math.random() * 100,
      w: 0,
      _d: 0,
    };
    this.emitters.push(e);
    return e;
  }

  static flickerValue(kind, t, phase) {
    const x = t + phase;
    switch (kind) {
      case 'fire':
        return 0.72 + 0.16 * Math.sin(x * 9.1) + 0.09 * Math.sin(x * 23.7 + 1.3) + 0.05 * Math.sin(x * 51.1);
      case 'candle':
        return 0.86 + 0.07 * Math.sin(x * 11.3) + 0.05 * Math.sin(x * 27.1 + 2.1) + 0.03 * Math.sin(x * 63.7);
      case 'gas': {
        const dip = Math.sin(x * 0.7) > 0.97 ? 0.5 : 1;
        return dip * (0.95 + 0.05 * Math.sin(x * 37.0));
      }
      case 'pulse':
        return 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(x * 2.2), 2);
      default:
        return 1;
    }
  }

  update(dt, t, camPos, roomId, outdoor) {
    const cands = [];
    for (const e of this.emitters) {
      e.level = damp(e.level, e.on ? 1 : 0, e.on ? 6 : 10, dt);
      if (e.level < 0.01) {
        e.w = damp(e.w, 0, 10, dt);
        continue;
      }
      const sameRoom = e.room === roomId || e.room === '*' || (outdoor && e.room === 'outdoor');
      e._d = e.pos.distanceTo(camPos);
      if (sameRoom && e._d < 22) cands.push(e);
    }
    cands.sort((a, b) => a._d - b._d);
    const n = this.lights.length;
    const chosen = new Set(cands.slice(0, n));
    for (const e of this.emitters) e.w = damp(e.w, chosen.has(e) ? 1 : 0, 7, dt);
    const active = this.emitters.filter((e) => e.w > 0.01).sort((a, b) => b.w - a.w);
    for (let i = 0; i < n; i++) {
      const l = this.lights[i];
      const e = active[i];
      if (!e) {
        l.intensity = 0;
        continue;
      }
      l.position.copy(e.pos);
      l.color.copy(e.color);
      l.distance = e.distance;
      l.decay = e.decay;
      l.intensity = e.intensity * e.level * e.w * LightPool.flickerValue(e.flicker, t, e.phase);
    }
  }
}

// Hand-held torch: a shadow-casting spotlight with a projected cookie that
// trails the view slightly, plus scripted flicker/dropouts near ghosts.
export class Flashlight {
  constructor(ctx, { shadows = true, mapSize = 1024, cookie = null } = {}) {
    this.ctx = ctx;
    const l = new THREE.SpotLight(0xfff0d8, 0, 32, 0.44, 0.6, 1.3);
    l.castShadow = shadows;
    l.shadow.mapSize.set(mapSize, mapSize);
    l.shadow.camera.near = 0.12;
    l.shadow.camera.far = 32;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.025;
    if (cookie) l.map = cookie;
    this.light = l;
    ctx.scene.add(l);
    ctx.scene.add(l.target);
    this.on = true;
    this.base = 22;
    this.level = 1;
    this.dir = new THREE.Vector3(0, 0, -1);
    this.flickerT = 0;
    this.flickerHard = 0;
    this.deadT = 0;
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
  }

  toggle(force) {
    this.on = force ?? !this.on;
    return this.on;
  }

  // Unsteady light for `seconds`; hard > 0 adds full dropouts.
  flicker(seconds = 1.5, hard = 0) {
    this.flickerT = Math.max(this.flickerT, seconds);
    this.flickerHard = Math.max(this.flickerHard, hard);
  }

  die(seconds = 2) {
    this.deadT = Math.max(this.deadT, seconds);
  }

  update(dt, camera, t) {
    const f = camera.getWorldDirection(this._f);
    this._r.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this._u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.dir.lerp(f, 1 - Math.exp(-16 * dt)).normalize();
    const p = this.light.position;
    p.copy(camera.position).addScaledVector(this._r, 0.16).addScaledVector(this._u, -0.14).addScaledVector(f, 0.05);
    this.light.target.position.copy(p).addScaledVector(this.dir, 6);
    this.light.target.updateMatrixWorld();

    let k = 1;
    if (this.flickerT > 0) {
      this.flickerT -= dt;
      const n = Math.sin(t * 61.7) * Math.sin(t * 23.3 + 1.1);
      k = 0.55 + 0.45 * n * n;
      if (this.flickerHard > 0 && Math.sin(t * 13.1) > 0.55) k *= 0.05;
      if (this.flickerT <= 0) this.flickerHard = 0;
    }
    if (this.deadT > 0) {
      this.deadT -= dt;
      k = this.deadT < 0.25 ? k * (Math.random() < 0.5 ? 0.2 : 1) : 0;
    }
    this.level = damp(this.level, this.on ? k : 0, this.on ? 22 : 30, dt);
    this.light.intensity = this.base * this.level;
  }
}
