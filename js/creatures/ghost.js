import * as THREE from 'three';
import { damp, clamp } from '../core/util.js';
import { NOISE_GLSL } from '../gfx/effects.js';

// Translucent apparitions drawn with a fresnel shader: a pale rim, a body
// that fades into wisps at the hem, and a hollow-eyed face.

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uWave;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vW;
  varying vec2 vUv;
  varying float vY;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec3 p = position;
    float low = clamp(1.0 - p.y / 1.35, 0.0, 1.0);
    float w = uWave * low * low;
    p.x += sin(uTime * 2.1 + p.y * 5.0 + p.z * 4.0) * 0.08 * w;
    p.z += cos(uTime * 1.7 + p.y * 4.0 + p.x * 5.0) * 0.08 * w;
    vY = p.y;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAG =
  NOISE_GLSL +
  /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uDark;
  uniform float uGlow;
  uniform float uHem;
  uniform float uDistort;
  uniform sampler2D uMap;
  uniform float uHasMap;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vW;
  varying vec2 vUv;
  varying float vY;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float ndv = clamp(abs(dot(n, normalize(vV))), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 1.7);
    float nz = noise3(vW * 3.0 + vec3(0.0, uTime * 0.7, 0.0));
    float hem = uHem > 0.001 ? smoothstep(0.0, uHem, vY + (nz - 0.5) * 0.4) : 1.0;
    vec3 col = uColor * (0.3 + fres * 1.7) * uGlow;
    float a = mix(0.06, 0.74, fres) * (0.6 + 0.4 * nz);
    // faint vertical folds, like a gown seen through water
    a *= 0.72 + 0.28 * noise3(vec3(vW.x * 11.0, vW.y * 1.4 - uTime * 0.25, vW.z * 11.0));
    if (uHasMap > 0.5) {
      vec4 t = texture2D(uMap, vUv);
      col = t.rgb * uColor * 1.15 * uGlow;
      a = 0.92 * t.a;
    }
    vec3 dark = mix(vec3(0.0), uColor * 0.45, fres);
    col = mix(col, dark, uDark);
    a = mix(a, (0.6 + 0.35 * fres) * (0.8 + 0.2 * nz), uDark);
    // scan-line shimmer when it is coming apart
    a *= 1.0 - uDistort * (0.5 + 0.5 * sin(vW.y * 90.0 + uTime * 40.0));
    a *= hem * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

function makeMaterial(ctx, o) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uWave: { value: 1 },
      uColor: { value: new THREE.Color(o.color ?? 0xbfd0e6) },
      uOpacity: { value: 0 },
      uDark: { value: o.dark ? 1 : 0 },
      uGlow: { value: o.glow ?? 1 },
      uHem: { value: o.hem ?? 0.55 },
      uDistort: { value: 0 },
      uMap: { value: null },
      uHasMap: { value: 0 },
    },
  ]);
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

const L = (pts) => pts.map((p) => new THREE.Vector2(p[0], p[1]));
const GOWN = L([
  [0.0, 0.0],
  [0.46, 0.0],
  [0.42, 0.18],
  [0.34, 0.5],
  [0.25, 0.8],
  [0.16, 1.02],
  [0.18, 1.14],
  [0.21, 1.27],
  [0.2, 1.37],
  [0.17, 1.44],
  [0.07, 1.5],
  [0.055, 1.57],
  [0.0, 1.58],
]);
const COAT = L([
  [0.0, 0.0],
  [0.3, 0.0],
  [0.28, 0.5],
  [0.22, 1.0],
  [0.22, 1.2],
  [0.25, 1.38],
  [0.24, 1.5],
  [0.08, 1.58],
  [0.06, 1.66],
  [0.0, 1.67],
]);

let FACE_TEX = null;

function buildBody(ctx, type, mats) {
  const g = new THREE.Group();
  // transforms are baked into each geometry so the shader's object-space
  // height runs from the hem (0) to the crown for every part
  const add = (geo, m, pos, scale, rot) => {
    const geom = geo.clone();
    const mtx = new THREE.Matrix4().compose(
      pos || new THREE.Vector3(),
      new THREE.Quaternion().setFromEuler(rot || new THREE.Euler()),
      scale || new THREE.Vector3(1, 1, 1)
    );
    geom.applyMatrix4(mtx);
    const mesh = new THREE.Mesh(geom, m);
    mesh.renderOrder = 8;
    g.add(mesh);
    return mesh;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const body = mats.body;
  const face = mats.face;
  const gent = type === 'gent' || type === 'butler';
  const profile = gent ? COAT : GOWN;
  add(new THREE.LatheGeometry(profile, 20), body, null, V(1.25, 1, 0.85));
  const headY = gent ? 1.79 : 1.69;
  add(new THREE.SphereGeometry(0.118, 16, 12), body, V(0, headY, 0), V(0.92, 1.12, 0.96));
  // face plane
  const fp = add(new THREE.PlaneGeometry(0.23, 0.29), face, V(0, headY - 0.01, 0.105));
  fp.renderOrder = 9;
  // arms hanging slightly forward
  const armGeo = new THREE.CylinderGeometry(0.022, 0.042, 0.64, 8, 1, true);
  for (const s of [-1, 1]) {
    const sy = gent ? 1.48 : 1.38;
    add(armGeo, body, V(s * 0.235, sy - 0.31, 0.05), null, new THREE.Euler(0.14, 0, s * 0.08));
    // long thin fingers rather than mittens
    add(new THREE.SphereGeometry(0.03, 8, 6), body, V(s * 0.258, sy - 0.66, 0.1), V(0.7, 2.2, 0.45));
  }
  if (!gent) {
    // long hair falling down the back
    const hair = new THREE.CylinderGeometry(0.12, 0.2, 0.75, 14, 1, true, Math.PI * 0.55, Math.PI * 0.9);
    add(hair, mats.hair, V(0, headY - 0.3, -0.02), V(1, 1, 0.9));
    add(new THREE.SphereGeometry(0.125, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.hair, V(0, headY + 0.01, -0.01), V(0.95, 1.1, 1.0));
  } else {
    add(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), mats.hair, V(0, headY + 0.01, -0.01));
  }
  if (type === 'gent') {
    add(new THREE.CylinderGeometry(0.105, 0.11, 0.24, 14), mats.hair, V(0, headY + 0.2, 0));
    add(new THREE.CylinderGeometry(0.19, 0.19, 0.015, 16), mats.hair, V(0, headY + 0.09, 0));
  }
  if (type === 'veiled' || type === 'bride') {
    const veil = new THREE.CylinderGeometry(0.13, 0.5, 1.6, 18, 1, true);
    add(veil, mats.hair, V(0, headY - 0.7, -0.03), V(1, 1, 0.75));
  }
  if (type === 'maid') {
    add(new THREE.PlaneGeometry(0.34, 0.75), mats.body, V(0, 0.75, 0.31), null, new THREE.Euler(-0.18, 0, 0));
  }
  return g;
}

export class Ghost {
  constructor(ctx, type = 'lady', o = {}) {
    this.ctx = ctx;
    this.type = type;
    if (!FACE_TEX) FACE_TEX = ctx.tex.ghostFace;
    const color = o.color ?? (o.dark ? 0x8fa6c8 : 0xc8d6ea);
    this.mats = {
      body: makeMaterial(ctx, { color, dark: o.dark, glow: o.glow, hem: o.hem }),
      hair: makeMaterial(ctx, { color: o.dark ? 0x40506a : 0x6a7890, dark: true, glow: 0.6, hem: 0.3 }),
      face: makeMaterial(ctx, { color: o.dark ? 0xc4d0e2 : 0xdce6f2, glow: o.dark ? 0.95 : 1.15, hem: 0.0 }),
    };
    this.mats.face.uniforms.uMap.value = FACE_TEX;
    this.mats.face.uniforms.uHasMap.value = 1;
    this.mats.face.uniforms.uWave.value = 0;
    this.mats.hair.uniforms.uWave.value = 0.4;
    this.group = new THREE.Group();
    this.body = buildBody(ctx, type, this.mats);
    this.group.add(this.body);
    const scale = o.scale ?? (type === 'child' ? 0.62 : 1);
    this.body.scale.setScalar(scale);
    this.height = 1.7 * scale;
    if (o.mirrorOnly) this.group.traverse((m) => m.layers.set(3));
    this.group.visible = false;
    ctx.scene.add(this.group);
    this.opacity = 0;
    this.target = 0;
    this.speed = 1.5;
    this.maxOpacity = o.opacity ?? 0.85;
    this.floatAmp = o.float ?? 0.05;
    this.phase = Math.random() * 10;
    this.look = o.look ?? true;
    this.yaw = o.yaw ?? 0;
    this.distort = 0;
    this.baseY = 0;
    this.move = null;
    this._fadeRes = null;
    this._v = new THREE.Vector3();
    ctx.updaters.push((dt, t) => this.update(dt, t));
  }

  get position() {
    return this.group.position;
  }

  place(x, y, z, yaw = this.yaw) {
    this.group.position.set(x, y, z);
    this.baseY = y;
    this.yaw = yaw;
    this.group.rotation.y = yaw;
    return this;
  }

  center(out = new THREE.Vector3()) {
    return out.copy(this.group.position).add(new THREE.Vector3(0, this.height * 0.75, 0));
  }

  fadeTo(op, speed = 1.5) {
    this.target = op;
    this.speed = speed;
    return new Promise((res) => {
      if (this._fadeRes) this._fadeRes();
      this._fadeRes = res;
    });
  }

  show(op = this.maxOpacity, speed = 1.2) {
    this.distort = 0;
    return this.fadeTo(op, speed);
  }

  hide(speed = 2) {
    return this.fadeTo(0, speed);
  }

  // Tear apart and vanish.
  vanish(speed = 3.5) {
    this.distort = 1;
    return this.fadeTo(0, speed);
  }

  moveTo(p, speed = 1.0) {
    return new Promise((res) => {
      if (this.move && this.move.res) this.move.res();
      this.move = { to: p.clone(), speed, res };
    });
  }

  update(dt, t) {
    const d = this.target - this.opacity;
    if (Math.abs(d) > 0.002) {
      this.opacity += Math.sign(d) * Math.min(Math.abs(d), this.speed * dt);
    } else {
      this.opacity = this.target;
      if (this._fadeRes) {
        const r = this._fadeRes;
        this._fadeRes = null;
        r();
      }
    }
    this.group.visible = this.opacity > 0.004;
    if (!this.group.visible && !this.move) return;
    this.distort = damp(this.distort, 0, 1.2, dt);
    const flick = 0.92 + 0.08 * Math.sin(t * 31.0 + this.phase) * Math.sin(t * 7.3);
    for (const m of [this.mats.body, this.mats.hair, this.mats.face]) {
      m.uniforms.uTime.value = t + this.phase;
      m.uniforms.uOpacity.value = this.opacity * flick;
      m.uniforms.uDistort.value = this.distort;
    }
    if (this.move) {
      const p = this.group.position;
      const to = this.move.to;
      const dx = to.x - p.x;
      const dy = to.y - this.baseY;
      const dz = to.z - p.z;
      const dist = Math.hypot(dx, dy, dz);
      const step = this.move.speed * dt;
      if (dist <= step) {
        p.x = to.x;
        p.z = to.z;
        this.baseY = to.y;
        const r = this.move.res;
        this.move = null;
        if (r) r();
      } else {
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        this.baseY += (dy / dist) * step;
      }
    }
    this.group.position.y = this.baseY + Math.sin(t * 1.3 + this.phase) * this.floatAmp + this.floatAmp;
    if (this.look) {
      const cam = this.ctx.camera.position;
      const want = Math.atan2(cam.x - this.group.position.x, cam.z - this.group.position.z);
      let diff = want - this.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.group.rotation.y += diff * (1 - Math.exp(-2.5 * dt));
    }
  }
}

// Hidden ghosts that count toward the "apparitions witnessed" tally when the
// player actually looks at them. Walk into one without looking and it slips
// away, returning a while later.
export class Apparitions {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this._c = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this.check = 0;
    ctx.updaters.push((dt) => this.update(dt));
  }

  add(o) {
    const g = new Ghost(this.ctx, o.type ?? 'lady', { dark: o.dark, scale: o.scale, opacity: o.opacity ?? 0.6, look: o.look ?? true, color: o.color, float: o.float });
    g.place(o.pos.x, o.pos.y, o.pos.z, o.yaw ?? 0);
    const a = {
      id: o.id,
      ghost: g,
      seen: false,
      gaze: 0,
      maxDist: o.maxDist ?? 14,
      near: o.near ?? 1.6,
      opacity: o.opacity ?? 0.6,
      when: o.when,
      away: 0,
      hint: o.hint,
      active: false,
    };
    this.list.push(a);
    this.ctx.apparitions.list.push(a);
    return a;
  }

  update(dt) {
    const ctx = this.ctx;
    const cam = ctx.camera.position;
    const fwd = ctx.camera.getWorldDirection(this._f);
    for (const a of this.list) {
      if (a.seen) continue;
      const g = a.ghost;
      const c = g.center(this._c);
      const dist = c.distanceTo(cam);
      const allowed = !a.when || a.when();
      if (a.away > 0) {
        a.away -= dt;
        if (a.away <= 0 && dist < 7) a.away = 4;
        continue;
      }
      const shouldShow = allowed && dist < a.maxDist + 6;
      if (shouldShow && !a.active) {
        a.active = true;
        g.show(a.opacity, 0.6);
      } else if (!shouldShow && a.active) {
        a.active = false;
        g.hide(1);
      }
      if (!a.active || dist > a.maxDist) {
        a.gaze = 0;
        continue;
      }
      const d = this._d.subVectors(c, cam).divideScalar(dist);
      const cos = d.dot(fwd);
      const cone = Math.max(0.94, 0.985 - 0.06 / Math.max(dist, 1));
      const looking = cos > cone;
      if (looking) {
        if (!ctx.col.segmentBlocked(cam.x, cam.y, cam.z, c.x, c.y, c.z)) a.gaze += dt;
        else a.gaze = 0;
      } else a.gaze = Math.max(0, a.gaze - dt * 2);
      if (a.gaze > 0.35) {
        this.witness(a);
        continue;
      }
      if (dist < a.near && !looking) {
        // brushed past without looking: it slips away for now
        g.vanish(2);
        a.active = false;
        a.away = 25;
        ctx.audio.whisper(c, { gain: 0.5 });
      }
    }
  }

  witness(a) {
    const ctx = this.ctx;
    a.seen = true;
    const A = ctx.apparitions;
    A.seen++;
    ctx.hud.setCounter(A.seen, A.total);
    ctx.audio.sting('glimpse', a.ghost.center());
    ctx.director.addFear(0.2);
    ctx.flashlight.flicker(0.8);
    setTimeout(() => a.ghost.vanish(2.5), 450);
    const n = A.seen;
    const lines = ['Did you see it too?', 'It was looking at you.', 'It was not there a moment ago.', 'You are not alone in here.'];
    ctx.hud.toast(n === A.total ? 'You have seen them all. They have seen you.' : lines[n % lines.length]);
    if (ctx.onApparition) ctx.onApparition(a, n);
  }
}
