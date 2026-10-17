import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
  uniform sampler2D uShade;
  uniform float uHasShade;
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
    if (uHasShade > 0.5) {
      // a modelled figure's own light and shade: pale skin holds its shape
      // and glows, the grey gown is a veil, black hair and eyes are shadow
      float s = texture2D(uShade, vUv).r;
      float pale = smoothstep(0.3, 0.75, s);
      float black = 1.0 - smoothstep(0.1, 0.3, s);
      col = uColor * uGlow * (0.25 + 0.75 * pale + 1.3 * fres) * (0.85 + 0.3 * nz);
      a = a * (1.0 - pale) + pale * (0.24 + 0.5 * fres) * (0.75 + 0.25 * nz);
      col = mix(col, uColor * 0.45 * fres, black);
      a = mix(a, (0.5 + 0.35 * fres) * (0.8 + 0.2 * nz), black);
    }
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
    #ifdef DIRECT
      // straight to the screen: tone map the light this adds (see makeMaterial)
      gl_FragColor = vec4(col * a, a);
    #else
      gl_FragColor = vec4(col, a);
    #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #ifdef DIRECT
      gl_FragColor.rgb /= a;
    #endif
    #include <fog_fragment>
    #ifdef DIRECT
      gl_FragColor.rgb *= a;
    #endif
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
      uShade: { value: null },
      uHasShade: { value: 0 },
    },
  ]);
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  if (ctx.quality && !ctx.quality.post) {
    // Without the HDR pass (the low preset, phones) each fragment is tone
    // mapped before it is blended, so a thin bright glow adds only its
    // alpha times a colour already squeezed under white: a fifth of what
    // the HDR pass shows, and a figure that is mostly glow all but
    // vanishes. Tone map the light it adds instead and blend that
    // premultiplied, as the HDR pass would over the dark.
    m.defines = { DIRECT: '' };
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
  }
  return m;
}

// Apparitions modelled elsewhere (glTF in art/ghosts) take the place of the
// built figure of the same person. Each mesh joins the material slot of the
// first rule its name matches; scale brings the model to life size and
// height is where the top of the head comes, for sound and sight lines.
// With shade, the model's base colour texture is kept as light and shade
// for its slot (one texture per slot): a painted face, hair and gown show
// in the glow instead of one even veil.
const GHOST_ART = {
  eleanor: {
    src: 'art/ghosts/eleanor.glb',
    scale: 0.93,
    height: 1.7,
    // a pale spectral gown under the black widow's crepe that hides her face
    slots: [
      [/glow/i, 'glow'],
      [/hands/i, 'skin'],
      [/cameo/i, 'light'],
      [/crepe|bindings|lantern iron/i, 'dark'],
      [/./, 'body'],
    ],
  },
  henrietta: {
    src: 'art/ghosts/henrietta.glb',
    height: 2.0,
    // the keening woman: arms flung wide, black hair to her waist
    shade: true,
    slots: [[/./, 'body']],
  },
  walter: {
    src: 'art/ghosts/walter.glb',
    height: 1.74,
    // the caretaker in flat cap and waistcoat, lantern held out, eyes wide;
    // the lantern's glass burns warm
    shade: true,
    slots: [
      [/glow/i, 'glow'],
      [/./, 'body'],
    ],
  },
  margaret: {
    src: 'art/ghosts/margaret_ashgrove_ghost.glb',
    height: 1.5,
    // the widow in her veil and bustle, bent over the gloved hands that hide
    // her weeping
    shade: true,
    slots: [[/./, 'body']],
  },
  silas: {
    src: 'art/ghosts/silas_crowe_ghost.glb',
    height: 1.9,
    // the old groundskeeper in his wide hat and frock coat, white beard to
    // his chest, both hands on the handle of his spade
    shade: true,
    slots: [[/./, 'body']],
  },
  ezra: {
    src: 'art/ghosts/ezra_ravenmoor_ghost.glb',
    height: 1.7,
    // the old captain, bald and white-whiskered, stooped in his frock coat
    // over the cane he leans on with both hands
    shade: true,
    slots: [[/./, 'body']],
  },
  constance: {
    src: 'art/ghosts/constance_ravenmoor_ghost.glb',
    height: 1.55,
    // his wife in her lace cap and spectacles, shawl over her shoulders, a
    // small book open in her hands
    shade: true,
    slots: [[/./, 'body']],
  },
  william: {
    src: 'art/ghosts/william_holloway_ghost.glb',
    height: 1.88,
    // the butler in his tails, a decanter on the silver tray he holds out
    shade: true,
    slots: [[/./, 'body']],
  },
  bess: {
    src: 'art/ghosts/bess_pruitt_ghost.glb',
    height: 1.6,
    // the scullery maid, frightened, in her mob cap and apron, sleeves
    // rolled, her bucket in her hand
    shade: true,
    slots: [[/./, 'body']],
  },
  agnes: {
    src: 'art/ghosts/agnes_whitby_ghost.glb',
    height: 1.6,
    // the housekeeper in her dark dress and cap, her keys at her waist and
    // a candle in her hand
    shade: true,
    slots: [[/./, 'body']],
  },
  ada: {
    src: 'art/ghosts/ada_penrose_ghost.glb',
    height: 1.65,
    // the nurse in her frilled cap, cape and apron, holding out her basin
    shade: true,
    slots: [[/./, 'body']],
  },
  dorcas: {
    src: 'art/ghosts/dorcas_finch_ghost.glb',
    height: 1.67,
    // the dressmaker, hair piled high, spectacles and tape measure, a hand
    // on her hip and her shears held up in the other
    shade: true,
    slots: [[/./, 'body']],
  },
  thomas: {
    src: 'art/ghosts/thomas_ravenmoor_ghost.glb',
    height: 1.32,
    // the boy in his sailor suit and cap, his toy boat in both hands
    shade: true,
    slots: [[/./, 'body']],
  },
  clara: {
    src: 'art/ghosts/clara_ravenmoor_ghost.glb',
    height: 1.18,
    // the little girl in her white dress, long pale hair loose, clutching
    // her china doll
    shade: true,
    slots: [[/./, 'body']],
  },
  josiah: {
    // the drowned captain is only ever seen in the bedroom mirror, so a
    // picture will do: it always turns to face the glass. It stands from
    // his knees (from, metres off the floor) and is size wide and tall.
    picture: 'art/ghosts/josiah_ravenmoor_ghost.webp',
    height: 1.8,
    from: 0.42,
    size: [1.11, 1.47],
  },
};

// Models that have arrived, by person; those that could not be had at all;
// and the ghosts waiting, unseen, for theirs.
const ARRIVED = {};
const FAILED = {};
const WAITING = new Map();

// Fetching starts as loading begins; models that have arrived by the
// deadline are in the house from the start. A ghost whose model comes later
// (a slow connection) is simply not there until it does, then appears the
// first moment it is out of sight. Only a model that cannot be had at all
// (still failing after a minute of tries, or unreadable) leaves the built
// figure in its place.
export function fetchGhostArt(timeout = 8000) {
  const loader = new GLTFLoader();
  const jobs = Object.entries(GHOST_ART).map(([who, art]) => fetchModel(loader, who, art, 0));
  return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, timeout))]).then(() => ({ ...ARRIVED }));
}

// One model (or picture), tried again after 2, 4, 8, 16 and 32 seconds if
// the connection drops it.
function fetchModel(loader, who, art, tries) {
  const load = art.picture ? new THREE.TextureLoader().loadAsync(art.picture) : loader.loadAsync(art.src);
  return load
    .then(
      (got) => arrive(who, art.picture ? figureFromPicture(got, art) : figureFromModel(got.scene, art)),
      () => {
        if (tries >= 5) return arrive(who, null);
        return new Promise((r) => setTimeout(r, 2000 * 2 ** tries)).then(() => fetchModel(loader, who, art, tries + 1));
      }
    )
    .catch(() => arrive(who, null));
}

function arrive(who, fig) {
  if (fig) ARRIVED[who] = fig;
  else FAILED[who] = true;
  for (const g of WAITING.get(who) || []) g.pending = fig || figureOf(who, CAST[who]);
  WAITING.delete(who);
}

// A picture standing in for a figure, for one seen only in a mirror.
function figureFromPicture(tex, art) {
  tex.colorSpace = THREE.SRGBColorSpace;
  return { geo: {}, shade: {}, picture: tex, from: art.from ?? 0, size: art.size, height: art.height };
}

// The model's meshes merged per slot in figure space: feet on the floor at
// the origin, facing +z, with only what the ghost shader reads.
function figureFromModel(scene, art) {
  scene.updateMatrixWorld(true);
  const floor = new THREE.Box3().setFromObject(scene).min.y;
  const s = art.scale ?? 1;
  const fit = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(0, -floor, 0));
  const parts = {};
  const shade = {};
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const name = `${o.name} ${o.material ? o.material.name : ''}`;
    const slot = art.slots.find(([re]) => re.test(name))[1];
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    const src = o.geometry.attributes;
    const map = art.shade && src.uv && o.material && o.material.map;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', floats(src.position));
    g.setAttribute('normal', floats(src.normal));
    g.setAttribute('uv', map ? floats(src.uv) : new THREE.Float32BufferAttribute(new Float32Array(src.position.count * 2), 2));
    if (o.geometry.index) g.setIndex(o.geometry.index);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(fit, o.matrixWorld));
    (parts[slot] ||= []).push(g);
    if (map) {
      // plain light and shade, not colour: one channel on the graphics card
      // instead of four
      map.colorSpace = THREE.NoColorSpace;
      map.format = THREE.RedFormat;
      shade[slot] = map;
    }
  });
  const geo = {};
  for (const [slot, list] of Object.entries(parts)) {
    // corners keep sharing their vertices where every part has an index
    const all = list.every((g) => g.index) ? list : list.map((g) => (g.index ? g.toNonIndexed() : g));
    geo[slot] = mergeGeometries(all, false);
    geo[slot].computeBoundingSphere();
  }
  return { geo, shade, height: art.height };
}

// A plain float copy of an attribute, so models stored compactly (quantised
// or interleaved) can be moved and merged like any other.
function floats(attr) {
  const n = attr.itemSize;
  const a = new Float32Array(attr.count * n);
  for (let i = 0; i < attr.count; i++) for (let k = 0; k < n; k++) a[i * n + k] = attr.getComponent(i, k);
  return new THREE.BufferAttribute(a, n);
}

// Faces and figures are shared by every instance of the same person.
const FACES = new Map();
const FIGURES = new Map();
const WHITE = new THREE.Color(1, 1, 1);
const VIEW = new THREE.Frustum();
const VIEW_M = new THREE.Matrix4();
const BOUNDS = new THREE.Sphere();

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
    this.group.add(this.body);
    this.scale = o.scale ?? 1;
    this.body.scale.setScalar(this.scale);
    this.mirrorOnly = !!o.mirrorOnly;
    if (this.mirrorOnly) this.group.traverse((m) => m.layers.set(3));
    const art = GHOST_ART[who];
    const model = o.figure || (ctx.ghostArt && ctx.ghostArt[who]) || ARRIVED[who];
    this.pending = null;
    this.dressed = false;
    if (model || !art || FAILED[who]) this.dress(model || figureOf(who, spec));
    else {
      // its model is still on its way: nothing to see until it comes
      this.height = art.height * this.scale;
      if (!WAITING.has(who)) WAITING.set(who, new Set());
      WAITING.get(who).add(this);
    }
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

  // Put on a figure: its meshes in this ghost's materials, shaded by the
  // figure's own light and shade where a model brings that.
  dress(fig) {
    for (const m of [...this.body.children]) {
      this.body.remove(m);
      // each depth pass and picture has a material of its own; the others
      // are shared
      if (m.renderOrder === 7 || m.isSprite) m.material.dispose();
    }
    for (const [slot, t] of Object.entries(fig.shade || {})) {
      const u = this.mats[slot].uniforms;
      u.uShade.value = t;
      u.uHasShade.value = 1;
      // its own light and shade say what is dark (a black dress, a pale
      // face), not the look in cast.js
      u.uDark.value = 0;
    }
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
    // a picture is a cut-out that always faces whoever looks
    this.sprite = null;
    if (fig.picture) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: fig.picture, transparent: true, opacity: 0, depthWrite: false }));
      sprite.center.set(0.5, 0);
      sprite.position.y = fig.from;
      sprite.scale.set(fig.size[0], fig.size[1], 1);
      sprite.renderOrder = 8;
      this.body.add(sprite);
      this.sprite = sprite;
    }
    if (this.mirrorOnly) this.body.traverse((m) => m.layers.set(3));
    this.height = fig.height * this.scale;
    this.dressed = true;
  }

  // Whether any of it could be on screen.
  inView() {
    const cam = this.ctx.camera;
    VIEW.setFromProjectionMatrix(VIEW_M.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    BOUNDS.center.copy(this.group.position);
    BOUNDS.center.y += this.height * 0.5;
    BOUNDS.radius = this.height * 0.75;
    return VIEW.intersectsSphere(BOUNDS);
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
    // a model that came late goes on while no one is looking
    if (this.pending && (!this.group.visible || !this.inView())) {
      const fig = this.pending;
      this.pending = null;
      this.dress(fig);
    }
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
    if (this.sprite) this.sprite.material.opacity = this.opacity * flick;
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

// Hidden ghosts that count toward the "apparitions witnessed" tally. A
// glimpse is not enough, through a window or across a room: each lingers
// where it stands until the player dares to walk right up to it, and only
// then is it counted, and gone. They keep still, facing the way you come
// in; only one watching from a window with its back to the door (turnIn,
// that room's id) turns to face you while you are in its room.
export class Apparitions {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this._c = new THREE.Vector3();
    this._h = new THREE.Vector3();
    ctx.updaters.push((dt) => this.update(dt));
  }

  add(o) {
    const g = new Ghost(this.ctx, o.who, { scale: o.scale, opacity: o.opacity ?? 0.6, look: false, float: o.float });
    g.place(o.pos.x, o.pos.y, o.pos.z, o.yaw ?? 0);
    const a = {
      id: o.id,
      ghost: g,
      seen: false,
      maxDist: o.maxDist ?? 14,
      // walk within this of it (about arm's length) to count it
      near: o.near ?? 1.0,
      opacity: o.opacity ?? 0.6,
      when: o.when,
      hint: o.hint,
      turnIn: o.turnIn,
      active: false,
    };
    this.list.push(a);
    this.ctx.apparitions.list.push(a);
    return a;
  }

  update(dt) {
    const ctx = this.ctx;
    const cam = ctx.camera.position;
    for (const a of this.list) {
      const g = a.ghost;
      // counted, or its model still on its way: not here for now
      if (a.seen || !g.dressed) continue;
      if (a.turnIn) {
        // to you while you are in its room, and back to its window after
        g.look = !!ctx.room && ctx.room.id === a.turnIn;
        if (!g.look) {
          const d = g.yaw - g.group.rotation.y;
          g.group.rotation.y += Math.atan2(Math.sin(d), Math.cos(d)) * (1 - Math.exp(-1.5 * dt));
        }
      }
      const c = g.center(this._c);
      const show = (!a.when || a.when()) && c.distanceTo(cam) < a.maxDist + 6;
      if (show !== a.active) {
        a.active = show;
        if (show) g.show(a.opacity, 0.6);
        else g.hide(1);
      }
      const p = g.position;
      if (a.active && Math.hypot(p.x - cam.x, p.z - cam.z) < a.near && Math.abs(c.y - cam.y) < 1.5 && this.inSight(g, c, cam)) this.witness(a);
    }
  }

  // nothing solid between you and it: no counting through a wall or a shut
  // door (its head will do, over a chair or a table)
  inSight(g, c, cam) {
    const col = this.ctx.col;
    const head = this._h.copy(g.position).setY(g.position.y + g.height * 0.92);
    return !col.segmentBlocked(cam.x, cam.y, cam.z, c.x, c.y, c.z) || !col.segmentBlocked(cam.x, cam.y, cam.z, head.x, head.y, head.z);
  }

  witness(a) {
    const ctx = this.ctx;
    a.seen = true;
    a.active = false;
    const A = ctx.apparitions;
    A.seen++;
    ctx.hud.setCounter(A.seen, A.total);
    ctx.audio.sting('glimpse', a.ghost.center());
    ctx.director.addFear(0.2);
    ctx.flashlight.flicker(0.8);
    a.ghost.vanish(2.5);
    const n = A.seen;
    const lines = ['Did you see it too?', 'It was looking at you.', 'It was not there a moment ago.', 'You are not alone in here.'];
    ctx.hud.toast(n === A.total ? 'You have seen them all. They have seen you.' : lines[n % lines.length]);
    if (ctx.onApparition) ctx.onApparition(a, n);
  }
}
