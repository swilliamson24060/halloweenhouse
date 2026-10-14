import * as THREE from 'three';

export const MOON_DIR = new THREE.Vector3(-0.42, 0.46, -0.78).normalize();

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;

const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  uniform vec3 uMoonDir;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0; float a = 0.5;
    for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -0.2, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
    vec2 cp = d.xz / (max(d.y, 0.0) + 0.12) * 0.9 + vec2(uTime * 0.012, uTime * 0.005);
    float c = fbm(cp);
    float c2 = fbm(cp * 2.2 + 4.0);
    float cloud = smoothstep(0.36, 0.72, c) * smoothstep(-0.02, 0.15, d.y);
    float md = max(dot(d, uMoonDir), 0.0);
    float disc = smoothstep(0.99935, 0.9996, md);
    float halo = pow(md, 220.0) * 0.8 + pow(md, 22.0) * 0.12 + pow(md, 4.0) * 0.02;
    vec3 moonCol = vec3(0.92, 0.92, 0.86);
    // craters on the disc
    float crater = 0.85 + 0.15 * noise((d.xy - uMoonDir.xy) * 900.0);
    col += moonCol * halo * (1.0 - cloud * 0.6);
    col = mix(col, moonCol * 1.8 * crater, disc * (1.0 - cloud * 0.9));
    float lit = pow(md, 5.0);
    vec3 cloudCol = mix(vec3(0.018, 0.02, 0.026), vec3(0.16, 0.165, 0.18), lit) * (0.6 + 0.6 * c2);
    // silver lining around the moon
    cloudCol += moonCol * pow(md, 60.0) * smoothstep(0.75, 0.45, c) * 0.6;
    col = mix(col, cloudCol, cloud);
    // lightning lights up the cloud deck from inside
    col += uFlash * vec3(0.55, 0.58, 0.75) * (0.25 + c * c * 1.6) * smoothstep(-0.1, 0.35, d.y);
    // a few stars in the gaps
    vec2 sp = d.xz / (d.y + 0.3) * 160.0;
    float st = step(0.9965, hash(floor(sp))) * (1.0 - cloud) * smoothstep(0.15, 0.5, d.y);
    col += vec3(0.6, 0.62, 0.7) * st * 0.35;
    col = mix(uHorizon, col, smoothstep(-0.12, 0.03, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Sky {
  constructor(ctx) {
    this.ctx = ctx;
    this.uniforms = {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uMoonDir: { value: MOON_DIR.clone() },
      uHorizon: { value: new THREE.Color(0x0b0d12) },
      uZenith: { value: new THREE.Color(0x020306) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    ctx.scene.add(this.mesh);

    // lightning
    this.flash = 0;
    this.flashes = [];
    this.next = 14 + Math.random() * 10;
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4.2, 6), fog: false, transparent: true, depthWrite: false });
    this.bolt = null;
    this.boltT = 0;
    this.onStrike = null;
  }

  makeBolt() {
    if (this.bolt) {
      this.ctx.scene.remove(this.bolt);
      this.bolt.geometry.dispose();
    }
    const ang = Math.PI * (0.65 + Math.random() * 0.7);
    const dist = 170 + Math.random() * 90;
    const base = new THREE.Vector3(Math.cos(ang) * dist, 0, -Math.abs(Math.sin(ang)) * dist - 40);
    const geos = [];
    const branch = (start, dir, len, r, depth) => {
      const pts = [start.clone()];
      let p = start.clone();
      const segs = 9;
      for (let i = 0; i < segs; i++) {
        p = p.clone().addScaledVector(dir, len / segs);
        p.x += (Math.random() - 0.5) * len * 0.12;
        p.z += (Math.random() - 0.5) * len * 0.08;
        pts.push(p);
        if (depth > 0 && Math.random() < 0.22) {
          const d2 = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 0.6)).normalize();
          branch(p, d2, len * 0.4, r * 0.55, depth - 1);
        }
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      geos.push(new THREE.TubeGeometry(curve, segs * 3, r, 4, false));
    };
    const top = base.clone().add(new THREE.Vector3(0, 115, 0));
    branch(top, new THREE.Vector3(0.05, -1, 0).normalize(), 118, 0.55, 2);
    const group = new THREE.Group();
    for (const g of geos) group.add(new THREE.Mesh(g, this.boltMat));
    group.renderOrder = -5;
    this.bolt = group;
    this.ctx.scene.add(group);
    return dist;
  }

  // Schedule a lightning strike. Returns the delay until thunder.
  strike({ strength = 1, bolt = true, close = false } = {}) {
    const now = this.ctx.director ? this.ctx.director.time : 0;
    this.flashes.push({ t: now, d: 0.07, a: 1.0 * strength });
    this.flashes.push({ t: now + 0.13, d: 0.06, a: 0.55 * strength });
    this.flashes.push({ t: now + 0.27, d: 0.2, a: 0.9 * strength });
    let dist = close ? 80 : 220;
    if (bolt && this.ctx.quality.bolts !== false) {
      dist = this.makeBolt();
      this.boltT = 0.45;
    }
    const delay = close ? 0.25 : Math.min(4, dist / 120 + Math.random() * 0.8);
    if (this.onStrike) this.onStrike(strength, delay, close);
    return delay;
  }

  update(dt, t, camPos) {
    this.mesh.position.copy(camPos);
    this.uniforms.uTime.value = t;
    const now = this.ctx.director ? this.ctx.director.time : t;
    let f = 0;
    this.flashes = this.flashes.filter((fl) => now < fl.t + fl.d + 0.6);
    for (const fl of this.flashes) {
      const k = now - fl.t;
      if (k < 0) continue;
      const v = k < fl.d ? 1 : Math.exp(-(k - fl.d) * 9);
      f = Math.max(f, v * fl.a);
    }
    this.flash = f;
    this.uniforms.uFlash.value = f;
    if (this.bolt) {
      this.boltT -= dt;
      this.bolt.visible = this.boltT > 0 && f > 0.25;
      this.boltMat.opacity = Math.min(1, f * 1.2);
      if (this.boltT <= 0) {
        this.ctx.scene.remove(this.bolt);
        this.bolt.traverse((o) => o.geometry && o.geometry.dispose());
        this.bolt = null;
      }
    }
    this.next -= dt;
    if (this.next <= 0) {
      this.strike({ strength: 0.6 + Math.random() * 0.5 });
      this.next = 20 + Math.random() * 30;
    }
  }
}
