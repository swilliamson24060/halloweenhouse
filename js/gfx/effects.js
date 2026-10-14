import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
                   mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                   mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise3(p); p *= 2.02; a *= 0.5; } return s; }
`;
export { NOISE_GLSL };

// ------------------------------------------------------------------ flames
// Every candle flame in the world is one instance of a camera-facing quad.
export class Flames {
  constructor(scene, max = 160) {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 4);
    geo.translate(0, 0.5, 0);
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = geo.index;
    inst.attributes.position = geo.attributes.position;
    inst.attributes.uv = geo.attributes.uv;
    this.offsets = new Float32Array(max * 3);
    this.params = new Float32Array(max * 3); // scale, phase, on
    this.aOffset = new THREE.InstancedBufferAttribute(this.offsets, 3);
    this.aParams = new THREE.InstancedBufferAttribute(this.params, 3);
    this.aOffset.setUsage(THREE.DynamicDrawUsage);
    this.aParams.setUsage(THREE.DynamicDrawUsage);
    inst.setAttribute('aOffset', this.aOffset);
    inst.setAttribute('aParams', this.aParams);
    inst.instanceCount = 0;
    this.uniforms = { uTime: { value: 0 }, uGain: { value: 5.0 }, uWind: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aOffset;
        attribute vec3 aParams;
        uniform float uTime;
        uniform float uWind;
        varying vec2 vUv;
        varying float vOn;
        void main() {
          float sc = aParams.x;
          float ph = aParams.y;
          float flick = 1.0 + 0.13 * sin(uTime * 13.0 + ph * 7.0) + 0.07 * sin(uTime * 31.0 + ph * 3.0);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          float sway = (sin(uTime * 3.3 + ph * 5.0) * 0.12 + uWind * sin(uTime * 17.0 + ph)) * position.y * position.y;
          vec3 wp = aOffset + right * (position.x + sway) * sc * 0.55 + vec3(0.0, 1.0, 0.0) * position.y * sc * flick;
          vUv = uv;
          vOn = aParams.z;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGain;
        varying vec2 vUv;
        varying float vOn;
        void main() {
          float y = vUv.y;
          float x = vUv.x * 2.0 - 1.0;
          float width = 0.95 * sin(3.14159 * pow(clamp(y, 0.0, 1.0), 0.62)) * (1.0 - y * 0.25);
          float d = abs(x) / max(width, 0.001);
          float a = smoothstep(1.0, 0.25, d) * smoothstep(0.0, 0.06, y) * smoothstep(1.0, 0.7, y);
          vec3 col = mix(vec3(1.0, 0.38, 0.06), vec3(1.0, 0.86, 0.6), smoothstep(0.9, 0.0, d) * smoothstep(0.95, 0.15, y));
          col += vec3(0.15, 0.25, 1.0) * smoothstep(0.28, 0.0, y) * smoothstep(0.7, 0.0, d) * 0.7;
          if (vOn < 0.01) discard;
          gl_FragColor = vec4(col * uGain, a * vOn);
        }`,
    });
    this.mesh = new THREE.Mesh(inst, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.count = 0;
    this.max = max;
    this.levels = [];
    this.targets = [];
    scene.add(this.mesh);
  }

  add(pos, scale = 0.05, on = true) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    this.offsets.set([pos.x, pos.y, pos.z], i * 3);
    this.params.set([scale, Math.random() * 100, on ? 1 : 0], i * 3);
    this.levels[i] = on ? 1 : 0;
    this.targets[i] = on ? 1 : 0;
    this.mesh.geometry.instanceCount = this.count;
    this.aOffset.needsUpdate = true;
    this.aParams.needsUpdate = true;
    return i;
  }

  set(i, on) {
    if (i >= 0) this.targets[i] = on ? 1 : 0;
  }

  move(i, pos) {
    this.offsets.set([pos.x, pos.y, pos.z], i * 3);
    this.aOffset.needsUpdate = true;
  }

  update(dt, t) {
    this.uniforms.uTime.value = t;
    let dirty = false;
    for (let i = 0; i < this.count; i++) {
      const l = this.levels[i];
      const tg = this.targets[i];
      if (l !== tg) {
        const nl = tg > l ? Math.min(tg, l + dt * 3) : Math.max(tg, l - dt * 6);
        this.levels[i] = nl;
        this.params[i * 3 + 2] = nl;
        dirty = true;
      }
    }
    if (dirty) this.aParams.needsUpdate = true;
  }
}

// --------------------------------------------------------------------- fire
export function makeFireMaterial(ghostly = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uGhost: { value: ghostly ? 1 : 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader:
      NOISE_GLSL +
      /* glsl */ `
      uniform float uTime;
      uniform float uLevel;
      uniform float uGhost;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        float n = fbm3(vec3(uv.x * 4.0, uv.y * 2.5 - uTime * 1.6, uTime * 0.4));
        float n2 = fbm3(vec3(uv.x * 9.0, uv.y * 5.0 - uTime * 2.7, uTime * 0.7));
        float shape = smoothstep(0.5, 0.05, abs(uv.x - 0.5)) * (1.0 - uv.y);
        float f = shape * (n * 1.3 + n2 * 0.5) - uv.y * 0.55;
        f = clamp(f * 2.2 * uLevel, 0.0, 1.0);
        vec3 hot = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.85, 0.45), smoothstep(0.35, 0.9, f));
        vec3 ghost = mix(vec3(0.05, 0.25, 1.0), vec3(0.6, 0.9, 1.0), smoothstep(0.35, 0.9, f));
        vec3 col = mix(hot, ghost, uGhost) * 3.2;
        gl_FragColor = vec4(col * f, f);
      }`,
  });
}

export function makeFire(width = 0.7, height = 0.6, ghostly = false) {
  const mat = makeFireMaterial(ghostly);
  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    m.position.y = height / 2;
    m.rotation.y = (i / 3) * Math.PI;
    m.renderOrder = 6;
    group.add(m);
  }
  group.userData.material = mat;
  return group;
}

// --------------------------------------------------------------------- dust
// Motes that wrap around the camera and only show inside the torch beam.
export class Dust {
  constructor(scene, count = 700, radius = 6) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * radius;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * radius;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * radius;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.uniforms = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uR: { value: radius },
      uLightPos: { value: new THREE.Vector3() },
      uLightDir: { value: new THREE.Vector3(0, 0, -1) },
      uCos: { value: Math.cos(0.42) },
      uLevel: { value: 1 },
      uSize: { value: 0.012 },
      uPR: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uR, uCos, uLevel, uSize, uPR;
        uniform vec3 uCam, uLightPos, uLightDir;
        varying float vLit;
        void main() {
          vec3 p = position;
          p += vec3(sin(uTime * 0.11 + position.y * 1.7) * 0.4, sin(uTime * 0.07 + position.x) * 0.25 - uTime * 0.015, cos(uTime * 0.13 + position.z * 1.3) * 0.4);
          vec3 rel = mod(p - uCam + uR, 2.0 * uR) - uR;
          vec3 wp = uCam + rel;
          vec3 L = wp - uLightPos;
          float dl = length(L);
          float c = dot(L / max(dl, 0.001), uLightDir);
          vLit = smoothstep(uCos, uCos + 0.06, c) * (1.2 / (1.0 + dl * dl * 0.12)) * uLevel * smoothstep(0.3, 0.9, dl);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_PointSize = uSize * uPR * 900.0 / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLit;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(d));
          if (vLit < 0.003) discard;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.85), a * vLit * 0.45);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  update(t, camera, flashlight, pr) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uCam.value.copy(camera.position);
    u.uLightPos.value.copy(flashlight.light.position);
    u.uLightDir.value.copy(flashlight.dir);
    u.uLevel.value = flashlight.level;
    u.uPR.value = pr;
  }
}

// ---------------------------------------------------------------- ground fog
export class GroundFog {
  constructor(scene, { size = 90, center = [4, 0, 2], layers = [0.25, 0.65, 1.1], exclude = [] } = {}) {
    this.uniforms = {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(0.045, 0.05, 0.062) },
      uExclude: { value: exclude.map((r) => new THREE.Vector4(...r)) },
      uLayer: { value: 0 },
    };
    this.meshes = [];
    layers.forEach((h, i) => {
      const uniforms = THREE.UniformsUtils.clone(this.uniforms);
      uniforms.uColor = this.uniforms.uColor;
      uniforms.uTime = this.uniforms.uTime;
      uniforms.uFlash = this.uniforms.uFlash;
      uniforms.uCam = this.uniforms.uCam;
      uniforms.uExclude = this.uniforms.uExclude;
      uniforms.uLayer = { value: i };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        defines: { NEX: Math.max(1, exclude.length) },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader:
          NOISE_GLSL +
          /* glsl */ `
          uniform float uTime, uFlash, uLayer;
          uniform vec3 uCam, uColor;
          uniform vec4 uExclude[NEX];
          varying vec3 vW;
          void main() {
            vec2 p = vW.xz * 0.11 + vec2(uTime * 0.025 + uLayer * 3.1, uTime * 0.012);
            float n = fbm3(vec3(p, uTime * 0.03 + uLayer));
            float a = smoothstep(0.35, 0.8, n);
            float d = distance(vW, uCam);
            a *= smoothstep(1.5, 7.0, d) * smoothstep(70.0, 25.0, d);
            for (int i = 0; i < NEX; i++) {
              vec4 r = uExclude[i];
              vec2 q = smoothstep(vec2(0.0), vec2(1.2), min(vW.xz - r.xy, r.zw - vW.xz));
              a *= 1.0 - q.x * q.y;
            }
            vec3 col = uColor * (1.0 + uFlash * 6.0);
            gl_FragColor = vec4(col, a * (0.3 - uLayer * 0.07));
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(center[0], h, center[2]);
      m.renderOrder = 3;
      scene.add(m);
      this.meshes.push(m);
    });
  }

  update(t, camPos, flash) {
    this.uniforms.uTime.value = t;
    this.uniforms.uCam.value.copy(camPos);
    this.uniforms.uFlash.value = flash;
  }

  setVisible(v) {
    for (const m of this.meshes) m.visible = v;
  }
}

// ---------------------------------------------------------- torch beam haze
export class Beam {
  constructor(scene) {
    const len = 7;
    const geo = new THREE.CylinderGeometry(0.03, 2.6, len, 24, 8, true);
    geo.translate(0, -len / 2, 0);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = { uLevel: { value: 1 }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying float vZ;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vZ = position.z / ${len.toFixed(1)};
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLevel;
        varying float vZ;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float edge = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.5);
          float z = clamp(vZ, 0.0, 1.0);
          float a = edge * smoothstep(0.0, 0.18, z) * pow(1.0 - z, 1.6) * 0.05 * uLevel;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.85), a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
  }

  update(flashlight) {
    this.mesh.position.copy(flashlight.light.position);
    this.mesh.lookAt(this.mesh.position.clone().add(flashlight.dir));
    this.uniforms.uLevel.value = flashlight.level;
  }
}

// ------------------------------------------------------------ moonlight shafts
export class Shafts {
  constructor(scene, moonDir) {
    this.scene = scene;
    this.moonDir = moonDir.clone().normalize();
    this.uniforms = { uTime: { value: 0 }, uFlash: { value: 0 }, uLevel: { value: 1 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aT;
        varying float vT;
        varying vec3 vW;
        varying vec3 vN;
        void main() {
          vT = aT;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader:
        NOISE_GLSL +
        /* glsl */ `
        uniform float uTime, uFlash, uLevel;
        varying float vT;
        varying vec3 vW;
        varying vec3 vN;
        void main() {
          vec3 v = normalize(cameraPosition - vW);
          float face = pow(clamp(abs(dot(normalize(vN), v)), 0.0, 1.0), 2.0);
          float n = noise3(vW * 2.5 + vec3(0.0, uTime * 0.05, uTime * 0.03));
          float tt = clamp(vT, 0.0, 1.0);
          float a = (1.0 - tt) * (1.0 - tt) * smoothstep(0.0, 0.12, tt) * (0.5 + 0.5 * n) * 0.016 * face * uLevel;
          a *= smoothstep(0.4, 1.6, distance(cameraPosition, vW));
          gl_FragColor = vec4(vec3(0.6, 0.68, 0.95) * (1.0 + uFlash * 6.0), a);
        }`,
    });
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  // Window given by its centre, width/height and inward normal (unit, horizontal).
  add(center, width, height, inward, length = 5) {
    const d = this.moonDir.clone().negate(); // light travel direction
    if (d.dot(inward) < 0.15) return;
    const right = new THREE.Vector3(0, 1, 0).cross(inward).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const corners = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([a, b]) => center.clone().addScaledVector(right, a * width).addScaledVector(up, b * height));
    const far = corners.map((c) => c.clone().addScaledVector(d, length));
    const pos = [];
    const t = [];
    const idx = [];
    const all = [...corners, ...far];
    for (const p of all) pos.push(p.x, p.y, p.z);
    t.push(0, 0, 0, 0, 1, 1, 1, 1);
    const quads = [
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ];
    for (const [a, b, c, e] of quads) idx.push(a, b, c, a, c, e);
    // non-indexed so every side gets its own flat normal
    const flat = [];
    const flatT = [];
    for (const i of idx) {
      flat.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      flatT.push(t[i]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(flatT, 1));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.mat);
    m.renderOrder = 4;
    this.group.add(m);
  }

  update(t, flash) {
    this.uniforms.uTime.value = t;
    this.uniforms.uFlash.value = flash;
  }
}
