import * as THREE from 'three';
import { damp } from '../core/util.js';

// Moving set pieces. Each one registers an update function with ctx.

// ------------------------------------------------------------------- doors
export class Door {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.name = o.name || 'door';
    this.locked = !!o.locked;
    this.width = o.width;
    this.height = o.height;
    const th = o.thickness ?? 0.05;
    const hingeLeft = o.side !== 'R';
    this.dirSign = (hingeLeft ? -1 : 1) * (o.swing ?? 1);
    this.maxOpen = o.maxOpen ?? 1.62;
    this.pivot = new THREE.Group();
    this.pivot.position.copy(o.hinge);
    this.baseYaw = o.yaw;
    this.pivot.rotation.y = o.yaw;
    const geo = new THREE.BoxGeometry(o.width - 0.01, o.height - 0.01, th);
    const mat = ctx.mat[o.mat ?? 'door'];
    this.panel = new THREE.Mesh(geo, mat);
    const sx = hingeLeft ? 1 : -1;
    this.panel.position.set((sx * o.width) / 2, o.height / 2, 0);
    if (!hingeLeft) this.panel.scale.x = -1;
    this.panel.castShadow = true;
    this.panel.receiveShadow = true;
    this.pivot.add(this.panel);
    if (o.knob !== false) {
      const kg = new THREE.SphereGeometry(0.032, 10, 8);
      for (const z of [th / 2 + 0.03, -th / 2 - 0.03]) {
        const k = new THREE.Mesh(kg, ctx.mat.brass);
        k.position.set(sx * (o.width - 0.08), 1.0, z);
        this.pivot.add(k);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.01), ctx.mat.brass);
        plate.position.set(sx * (o.width - 0.08), 0.96, z * 0.75);
        this.pivot.add(plate);
      }
    }
    if (o.glassPanel) {
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(o.width * 0.5, o.height * 0.35), ctx.mat.glass);
      gp.position.set((sx * o.width) / 2, o.height * 0.7, th / 2 + 0.002);
      this.pivot.add(gp);
    }
    this.focus = new THREE.Object3D();
    this.focus.position.set(sx * (o.width * 0.6), 1.05, 0);
    this.pivot.add(this.focus);
    ctx.scene.add(this.pivot);

    this.angle = (o.open ?? 0) * this.maxOpen;
    this.target = this.angle;
    this.speed = 1.4;
    this.slamming = false;
    this.rattleT = 0;
    // closed collider across the opening
    const W = o.wallFrame;
    const mid = o.hinge.clone().add(new THREE.Vector3(Math.cos(o.yaw) * sx * (o.width / 2), 0, -Math.sin(o.yaw) * sx * (o.width / 2)));
    const inset = ctx.col.inset;
    ctx.col.inset = 0; // a closed door fills its whole opening
    this.col = ctx.col.addOBB(mid.x, mid.z, o.width / 2, 0.06, W ? W.ang : -o.yaw, o.hinge.y, o.hinge.y + o.height);
    ctx.col.inset = inset;
    this.col.door = this;
    this.mid = mid;
    this._apply();

    if (o.interact !== false) {
      this.item = ctx.interact.add({
        obj: this.focus,
        radius: 0.45,
        range: 2.0,
        ignore: this.col,
        prompt: () => (this.locked ? 'Try the door' : this.isOpen() ? 'Close' : 'Open'),
        onUse: () => this.use(),
      });
    }
    this.onOpen = o.onOpen || null;
    this.onLocked = o.onLocked || null;
    ctx.updaters.push((dt) => this.update(dt));
  }

  isOpen() {
    return Math.abs(this.target) > 0.3;
  }

  worldCenter() {
    return this.mid.clone().setY(this.pivot.position.y + 1.2);
  }

  use() {
    if (this.locked) {
      this.rattle();
      if (this.onLocked) this.onLocked(this);
      else this.ctx.hud.toast('It is locked.');
      return;
    }
    if (this.isOpen()) this.close();
    else this.open();
  }

  open(frac = 1, speed = 1.5, sound = true) {
    if (this.locked) return;
    this.target = this.dirSign * this.maxOpen * frac;
    this.speed = speed;
    this.slamming = false;
    if (sound) this.ctx.audio.creak(this.worldCenter(), { long: speed < 1, pitch: 0.8 + Math.random() * 0.4 });
    if (this.onOpen) {
      const f = this.onOpen;
      this.onOpen = null;
      f(this);
    }
  }

  close(speed = 1.6, sound = true) {
    this.target = 0;
    this.speed = speed;
    this.slamming = false;
    if (sound) this.ctx.audio.creak(this.worldCenter(), { pitch: 1.1 });
  }

  slam() {
    this.target = 0;
    this.speed = 9;
    this.slamming = true;
  }

  rattle(t = 0.6) {
    this.rattleT = t;
    this.ctx.audio.rattle(this.worldCenter());
  }

  _apply() {
    let wob = 0;
    if (this.rattleT > 0) wob = Math.sin(performance.now() * 0.09) * 0.02;
    this.pivot.rotation.y = this.baseYaw + this.angle + wob;
    this.col.enabled = Math.abs(this.angle) < 0.45;
  }

  update(dt) {
    if (this.rattleT > 0) this.rattleT -= dt;
    const diff = this.target - this.angle;
    if (Math.abs(diff) > 1e-4) {
      this.ctx.shadowDirty = true;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), this.speed * dt * (0.35 + Math.min(1, Math.abs(diff) * 2)));
      this.angle += step;
      if (this.slamming && Math.abs(this.target - this.angle) < 1e-3) {
        this.slamming = false;
        this.ctx.audio.slam(this.worldCenter());
        this.ctx.director.addFear(0.15);
        if (this.ctx.player.pos.distanceTo(this.mid) < 6) this.ctx.player.shake = 0.6;
      }
    }
    this._apply();
  }
}

// --------------------------------------------------------- generic motions
// Rocking chair / cradle / horse: rocks about local X while `active`.
export class Rocker {
  constructor(ctx, obj, { amp = 0.22, speed = 1.6, active = false, creak = true } = {}) {
    this.ctx = ctx;
    this.obj = obj;
    this.amp = amp;
    this.speed = speed;
    this.level = active ? 1 : 0;
    this.active = active;
    this.t = 0;
    this.creak = creak;
    this._lastSign = 0;
    ctx.updaters.push((dt) => this.update(dt));
  }

  update(dt) {
    this.level = damp(this.level, this.active ? 1 : 0, this.active ? 1.2 : 0.35, dt);
    this.t += dt * this.speed;
    const a = Math.sin(this.t) * this.amp * this.level;
    this.obj.rotation.x = a;
    const s = Math.sign(Math.cos(this.t));
    if (this.creak && this.level > 0.3 && s !== this._lastSign) {
      const p = this.obj.getWorldPosition(new THREE.Vector3());
      if (p.distanceTo(this.ctx.player.pos) < 12) this.ctx.audio.creak(p, { short: true, gain: 0.35 * this.level, pitch: 1.3 });
    }
    this._lastSign = s;
  }
}

// Something that swings like a pendulum (chandelier, hanging lamp).
export class Swing {
  constructor(ctx, obj, { amp = 0.03, speed = 0.9 } = {}) {
    this.obj = obj;
    this.amp = amp;
    this.base = amp;
    this.speed = speed;
    this.t = Math.random() * 10;
    ctx.updaters.push((dt) => {
      this.t += dt * this.speed;
      this.amp = damp(this.amp, this.base, 0.4, dt);
      obj.rotation.z = Math.sin(this.t) * this.amp;
      obj.rotation.x = Math.sin(this.t * 0.73 + 1) * this.amp * 0.6;
    });
  }

  kick(a = 0.25) {
    this.amp = a;
  }
}

// Eyes in a painting that follow the viewer.
export class FollowEyes {
  constructor(ctx, parent, positions, { r = 0.012, spread = 0.006 } = {}) {
    this.ctx = ctx;
    this.pupils = [];
    const white = new THREE.MeshStandardMaterial({ color: 0x7a7060, roughness: 0.5 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x050302 });
    for (const p of positions) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(r, 12), white);
      e.position.copy(p);
      parent.add(e);
      const pu = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 10), dark);
      pu.position.copy(p).add(new THREE.Vector3(0, 0, 0.002));
      parent.add(pu);
      this.pupils.push({ mesh: pu, base: pu.position.clone() });
    }
    this.parent = parent;
    this.spread = spread;
    this._v = new THREE.Vector3();
    ctx.updaters.push(() => this.update());
  }

  update() {
    const cam = this.ctx.camera.position;
    const local = this.parent.worldToLocal(this._v.copy(cam));
    const d = Math.hypot(local.x, local.y, local.z) || 1;
    for (const p of this.pupils) {
      p.mesh.position.x = p.base.x + (local.x / d) * this.spread;
      p.mesh.position.y = p.base.y + (local.y / d) * this.spread;
    }
  }
}

// Fade an object's materials (clones materials so it fades alone).
export function makeFadable(obj) {
  const mats = [];
  obj.traverse((o) => {
    if (o.material) {
      o.material = o.material.clone();
      o.material.transparent = true;
      mats.push(o.material);
    }
  });
  return (v) => {
    for (const m of mats) m.opacity = v;
    obj.visible = v > 0.01;
  };
}
