import * as THREE from 'three';
import { damp } from '../core/util.js';

// Snakes: a tube whose rings are placed on the GPU along a spine that
// follows the head's trail, so the body naturally takes S-curves.

const SPINE = 24;
const RINGS = 56;
const SIDES = 10;

function snakeGeometry(length, radius) {
  const pos = [];
  const uv = [];
  const aT = [];
  const aRing = [];
  const idx = [];
  const profile = (t) => {
    if (t < 0.02) return 0.35 + (t / 0.02) * 0.5;
    if (t < 0.055) return 0.85 + ((t - 0.02) / 0.035) * 0.2;
    if (t < 0.09) return 1.05 - ((t - 0.055) / 0.035) * 0.35;
    if (t < 0.16) return 0.7 + ((t - 0.09) / 0.07) * 0.3;
    if (t < 0.68) return 1.0;
    return Math.max(0.04, 1.0 - ((t - 0.68) / 0.32) * 0.96);
  };
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS;
    const rad = radius * profile(t);
    for (let s = 0; s <= SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      pos.push(0, 0, 0);
      aT.push(t);
      aRing.push(Math.cos(a) * rad, Math.sin(a) * rad * (t < 0.06 ? 0.75 : 1));
      uv.push(s / SIDES, (t * length) / 0.6);
    }
  }
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SIDES; s++) {
      const a = r * (SIDES + 1) + s;
      const b = a + SIDES + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.slice(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute('aRing', new THREE.Float32BufferAttribute(aRing, 2));
  g.setIndex(idx);
  return g;
}

function snakeMaterial(ctx, spine) {
  const m = new THREE.MeshStandardMaterial({ map: ctx.tex.snake, roughness: 0.42, metalness: 0.05, envMap: ctx.env, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSpine = { value: spine };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aT;
        attribute vec2 aRing;
        uniform vec3 uSpine[${SPINE}];`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `float sf = aT * ${(SPINE - 1).toFixed(1)};
        int si = int(min(floor(sf), ${(SPINE - 2).toFixed(1)}));
        float sk = sf - float(si);
        vec3 sa = uSpine[si];
        vec3 sb = uSpine[si + 1];
        vec3 sP = mix(sa, sb, sk);
        vec3 sT = sb - sa;
        sT = length(sT) > 1e-5 ? normalize(sT) : vec3(0.0, 0.0, 1.0);
        vec3 sS = normalize(cross(vec3(0.0, 1.0, 0.0), sT) + vec3(1e-5, 0.0, 0.0));
        vec3 sU = normalize(cross(sT, sS));
        vec3 objectNormal = normalize(sS * aRing.x + sU * aRing.y);
        #ifdef USE_TANGENT
        vec3 objectTangent = sT;
        #endif`
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = sP + sS * aRing.x + sU * aRing.y * 0.8;');
  };
  return m;
}

export class Snake {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.length = o.length ?? 1.4;
    this.radius = o.radius ?? 0.028;
    this.y = o.y;
    this.region = o.region; // [x0, z0, x1, z1]
    this.spine = Array.from({ length: SPINE }, () => new THREE.Vector3());
    const geo = snakeGeometry(this.length, this.radius);
    this.mesh = new THREE.Mesh(geo, snakeMaterial(ctx, this.spine));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    ctx.scene.add(this.mesh);
    // eyes and tongue
    const eyeG = new THREE.SphereGeometry(this.radius * 0.22, 6, 5);
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.1, envMap: ctx.env, envMapIntensity: 2 });
    this.eyes = [new THREE.Mesh(eyeG, eyeM), new THREE.Mesh(eyeG, eyeM)];
    for (const e of this.eyes) ctx.scene.add(e);
    this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.002, 0.06), new THREE.MeshStandardMaterial({ color: 0x5a1416, roughness: 0.5 }));
    ctx.scene.add(this.tongue);
    // head state
    this.head = new THREE.Vector3(o.x, o.y + this.radius * 0.8, o.z);
    this.heading = o.heading ?? Math.random() * Math.PI * 2;
    this.travel = 0;
    this.speed = 0;
    this.target = null;
    this.state = 'rest';
    this.timer = 1 + Math.random() * 3;
    this.rear = 0;
    this.lunge = 0;
    this.hissed = 0;
    this.trail = [];
    const seg = this.length / (SPINE - 1);
    for (let i = 0; i < SPINE * 2; i++) {
      this.trail.push(new THREE.Vector3(this.head.x - Math.sin(this.heading) * seg * i * 0.5, this.head.y, this.head.z - Math.cos(this.heading) * seg * i * 0.5));
    }
    this._lay();
    ctx.updaters.push((dt, t) => this.update(dt, t));
  }

  // sample the trail polyline at even spacing to place the spine
  _lay() {
    const seg = this.length / (SPINE - 1);
    const pts = [this.head, ...this.trail];
    let i = 0;
    let acc = 0;
    let a = pts[0];
    this.spine[0].copy(a);
    for (let k = 1; k < SPINE; k++) {
      let need = seg;
      while (true) {
        const b = pts[i + 1];
        if (!b) {
          this.spine[k].copy(pts[pts.length - 1]);
          break;
        }
        const d = a.distanceTo(b) - acc;
        if (d >= need) {
          acc += need;
          const t = acc / Math.max(1e-6, a.distanceTo(b));
          this.spine[k].copy(a).lerp(b, t);
          break;
        }
        need -= d;
        i++;
        a = pts[i];
        acc = 0;
      }
    }
  }

  update(dt, t) {
    const ctx = this.ctx;
    const cam = ctx.camera.position;
    const pl = ctx.player.pos;
    const dist = Math.hypot(pl.x - this.head.x, pl.z - this.head.z);
    const near = Math.abs(cam.y - this.y) < 3.5 && dist < 18;
    this.mesh.visible = near;
    for (const e of this.eyes) e.visible = near;
    this.tongue.visible = false;
    if (!near) return;

    const R = this.region;
    this.timer -= dt;
    if (dist < 2.3 && this.state !== 'flee') {
      if (this.state !== 'threat') {
        this.state = 'threat';
        this.timer = 1.6;
        if (t - this.hissed > 4) {
          ctx.audio.hiss(this.head);
          ctx.director.addFear(0.12);
          this.hissed = t;
        }
      }
    }
    let want = 0;
    if (this.state === 'rest') {
      if (this.timer <= 0) {
        this.state = 'move';
        this.target = new THREE.Vector3(R[0] + Math.random() * (R[2] - R[0]), 0, R[1] + Math.random() * (R[3] - R[1]));
        this.timer = 6 + Math.random() * 6;
      }
    } else if (this.state === 'move' || this.state === 'flee') {
      const tgt = this.target;
      const ang = Math.atan2(tgt.x - this.head.x, tgt.z - this.head.z);
      let diff = Math.atan2(Math.sin(ang - this.heading), Math.cos(ang - this.heading));
      this.heading += diff * Math.min(1, dt * 1.6);
      want = this.state === 'flee' ? 0.75 : 0.28;
      if (Math.hypot(tgt.x - this.head.x, tgt.z - this.head.z) < 0.2 || this.timer <= 0) {
        this.state = 'rest';
        this.timer = 2 + Math.random() * 5;
      }
    } else if (this.state === 'threat') {
      // face the intruder, rear up, feint a strike, then flee
      const ang = Math.atan2(pl.x - this.head.x, pl.z - this.head.z);
      let diff = Math.atan2(Math.sin(ang - this.heading), Math.cos(ang - this.heading));
      this.heading += diff * Math.min(1, dt * 3);
      if (this.timer < 0.6 && this.lunge === 0) this.lunge = 0.001;
      if (this.timer <= 0) {
        this.state = 'flee';
        const away = Math.atan2(this.head.x - pl.x, this.head.z - pl.z);
        this.target = new THREE.Vector3(
          Math.max(R[0], Math.min(R[2], this.head.x + Math.sin(away) * 3)),
          0,
          Math.max(R[1], Math.min(R[3], this.head.z + Math.cos(away) * 3))
        );
        this.timer = 4;
      }
    }
    this.rear = damp(this.rear, this.state === 'threat' ? 1 : 0, 4, dt);
    if (this.lunge > 0) {
      this.lunge += dt * 3;
      if (this.lunge > 1) this.lunge = 0;
    }
    this.speed = damp(this.speed, want, 3, dt);
    if (this.speed > 0.01) {
      const wiggle = Math.sin(this.travel * 6.5) * 0.75;
      const dir = this.heading + wiggle;
      const step = this.speed * dt;
      this.head.x += Math.sin(dir) * step;
      this.head.z += Math.cos(dir) * step;
      this.head.x = Math.max(R[0], Math.min(R[2], this.head.x));
      this.head.z = Math.max(R[1], Math.min(R[3], this.head.z));
      this.travel += step;
      const seg = this.length / (SPINE - 1) / 2;
      if (this.head.distanceTo(this.trail[0]) > seg) {
        this.trail.pop();
        this.trail.unshift(this.head.clone());
      }
    }
    this._lay();
    // rear up the front of the body
    const lift = this.rear * 0.32;
    const reach = this.lunge > 0 ? Math.sin(this.lunge * Math.PI) * 0.3 : 0;
    for (let k = 0; k < 7; k++) {
      const f = 1 - k / 7;
      this.spine[k].y = this.y + this.radius * 0.8 + lift * f * f;
      if (k < 3 && reach) {
        this.spine[k].x += Math.sin(this.heading) * reach * (1 - k / 3);
        this.spine[k].z += Math.cos(this.heading) * reach * (1 - k / 3);
      }
    }
    for (let k = 7; k < SPINE; k++) this.spine[k].y = this.y + this.radius * 0.8;
    // head ornaments
    const h0 = this.spine[0];
    const h1 = this.spine[2];
    const fwd = new THREE.Vector3().subVectors(h0, h1).normalize();
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      this.eyes[i].position.copy(h0).addScaledVector(fwd, -this.radius * 0.6).addScaledVector(side, s * this.radius * 0.62).add(new THREE.Vector3(0, this.radius * 0.35, 0));
    }
    if (Math.sin(t * 9 + this.length * 10) > 0.6 || this.state === 'threat') {
      this.tongue.visible = true;
      this.tongue.position.copy(h0).addScaledVector(fwd, 0.035);
      this.tongue.lookAt(this.tongue.position.clone().add(fwd));
    }
  }
}
