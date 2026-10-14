import * as THREE from 'three';
import { damp } from '../core/util.js';
import { NOISE_GLSL } from '../gfx/effects.js';
import { buildFigure, SLOTS } from './figure.js';
import { CAST } from './cast.js';
import { paintGhostFace } from './ghostfaces.js';

// Translucent apparitions drawn with a fresnel shader: a pale rim, a body
// that fades into wisps at the hem, and a painted face. Each one is a
// particular person from cast.js, built by figure.js.

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
  uniform float uWet;
  uniform float uSolid;
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
      a = 0.86 * t.a;
    }
    if (uWet > 0.0) {
      float drip = smoothstep(0.72, 0.98, noise3(vec3(vW.x * 34.0, vW.y * 2.2 + uTime * 1.3, vW.z * 34.0)));
      a += drip * 0.3 * uWet;
      col += vec3(0.55, 0.75, 0.8) * drip * uWet * 0.7;
    }
    col = mix(col, uColor * uGlow * (0.8 + 0.4 * nz), uSolid);
    a = mix(a, 0.9, uSolid);
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

// Depth-only pass drawn just before a ghost, so only its nearest surface is
// shaded: no inner limbs and seams showing through the body. Discards where
// the colour pass would be invisible (the faded hem, the face cap's margin).
const DEPTH_FRAG =
  NOISE_GLSL +
  /* glsl */ `
  uniform float uTime;
  uniform float uHem;
  uniform float uOpacity;
  uniform sampler2D uMap;
  uniform float uHasMap;
  varying vec3 vW;
  varying vec2 vUv;
  varying float vY;
  void main() {
    float nz = noise3(vW * 3.0 + vec3(0.0, uTime * 0.7, 0.0));
    float hem = uHem > 0.001 ? smoothstep(0.0, uHem, vY + (nz - 0.5) * 0.4) : 1.0;
    if (hem * uOpacity < 0.06) discard;
    if (uHasMap > 0.5 && texture2D(uMap, vUv).a < 0.35) discard;
    gl_FragColor = vec4(0.0);
  }`;

function depthMaterial(m) {
  return new THREE.ShaderMaterial({
    uniforms: m.uniforms,
    vertexShader: VERT,
    fragmentShader: DEPTH_FRAG,
    transparent: true,
    colorWrite: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    fog: true,
  });
}

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
      uWet: { value: o.wet ? 1 : 0 },
      uSolid: { value: o.solid ? 1 : 0 },
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

// Faces and figures are shared by every instance of the same person.
const FACES = new Map();
const FIGURES = new Map();
const WHITE = new THREE.Color(1, 1, 1);

function faceOf(who, spec) {
  if (!FACES.has(who)) {
    let h = 7;
    for (const ch of who) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const t = new THREE.CanvasTexture(paintGhostFace(spec, h % 9973));
    t.colorSpace = THREE.SRGBColorSpace;
    FACES.set(who, t);
  }
  return FACES.get(who);
}

function figureOf(who, spec) {
  if (!FIGURES.has(who)) FIGURES.set(who, buildFigure(spec));
  return FIGURES.get(who);
}

export class Ghost {
  constructor(ctx, who, o = {}) {
    this.ctx = ctx;
    const spec = CAST[who];
    if (!spec) throw new Error(`No such apparition: ${who}`);
    this.who = who;
    this.spec = spec;
    const L = spec.look || {};
    const base = new THREE.Color(o.color ?? L.color ?? 0xc8d6ea);
    const glow = o.glow ?? L.glow ?? 1;
    const hem = o.hem ?? L.hem ?? 0.55;
    const wet = !!L.wet;
    this.mats = {
      body: makeMaterial(ctx, { color: base, dark: o.dark ?? L.dark, glow, hem, wet }),
      light: makeMaterial(ctx, { color: base.clone().lerp(WHITE, 0.4), glow: glow * 1.2, hem, wet }),
      dark: makeMaterial(ctx, { color: base.clone().multiplyScalar(0.5), dark: true, glow: glow * 0.7, hem: hem * 0.7, wet }),
      skin: makeMaterial(ctx, { color: base.clone().lerp(WHITE, 0.3), glow: glow * 1.05, hem: 0 }),
      face: makeMaterial(ctx, { color: base.clone().lerp(WHITE, 0.3), glow: glow * 1.0, hem: 0 }),
      glow: makeMaterial(ctx, { color: L.glowColor ?? 0xffe4b0, glow: 1.6, hem: 0, solid: true }),
    };
    this.mats.face.uniforms.uMap.value = faceOf(who, spec);
    this.mats.face.uniforms.uHasMap.value = 1;
    for (const k of ['face', 'skin', 'glow']) this.mats[k].uniforms.uWave.value = 0;
    this.mats.dark.uniforms.uWave.value = 0.5;
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    const fig = figureOf(who, spec);
    for (const slot of SLOTS) {
      if (!fig.geo[slot]) continue;
      if (slot !== 'glow') {
        // lights (flames, gilt, the crystal) stay visible through the shell
        const pre = new THREE.Mesh(fig.geo[slot], depthMaterial(this.mats[slot]));
        pre.renderOrder = 7;
        pre.frustumCulled = false;
        this.body.add(pre);
      }
      const mesh = new THREE.Mesh(fig.geo[slot], this.mats[slot]);
      mesh.renderOrder = slot === 'face' ? 9 : slot === 'glow' ? 10 : 8;
      mesh.frustumCulled = false;
      this.body.add(mesh);
    }
    this.group.add(this.body);
    const scale = o.scale ?? 1;
    this.body.scale.setScalar(scale);
    this.height = fig.height * scale;
    if (o.mirrorOnly) this.group.traverse((m) => m.layers.set(3));
    this.group.visible = false;
    ctx.scene.add(this.group);
    this.opacity = 0;
    this.target = 0;
    this.speed = 1.5;
    this.maxOpacity = o.opacity ?? 0.85;
    this.floatAmp = o.float ?? (spec.seated ? 0 : 0.05);
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

  // Fade the figure out below `y` (object space), e.g. diners at a table.
  setHem(y) {
    for (const k of ['body', 'light', 'dark']) this.mats[k].uniforms.uHem.value = y;
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
    for (const k in this.mats) {
      const m = this.mats[k];
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
    this._h = new THREE.Vector3();
    this.check = 0;
    ctx.updaters.push((dt) => this.update(dt));
  }

  add(o) {
    const g = new Ghost(this.ctx, o.who, { scale: o.scale, opacity: o.opacity ?? 0.6, look: o.look ?? true, float: o.float });
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
        // a figure at a window shows only its head above the sill
        const head = this._h.copy(g.position).setY(g.position.y + g.height * 0.92);
        const clear = !ctx.col.segmentBlocked(cam.x, cam.y, cam.z, c.x, c.y, c.z) || !ctx.col.segmentBlocked(cam.x, cam.y, cam.z, head.x, head.y, head.z);
        if (clear) a.gaze += dt;
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
