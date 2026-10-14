import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Film grain, vignette, chromatic fringe and "fear" distortion, applied
// after tone mapping so it works on display values.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.07 },
    uVignette: { value: 0.55 },
    uFear: { value: 0 },
    uFlash: { value: 0 },
    uGamma: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uFear, uFlash, uGamma;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // fear: slow breathing warp
      uv += c * r2 * uFear * 0.12 * sin(uTime * 2.3);
      uv.x += sin(uv.y * 40.0 + uTime * 9.0) * 0.0012 * uFear * uFear;
      float ca = (0.0012 + uFear * 0.007) * (0.3 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      col = pow(max(col, 0.0), vec3(1.0 / uGamma));
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), 0.12 + uFear * 0.4);
      // cold shadows, faintly warm highlights
      col *= mix(vec3(0.92, 0.97, 1.08), vec3(1.04, 1.0, 0.94), smoothstep(0.05, 0.6, l));
      float vig = smoothstep(0.95, 0.25, length(c * vec2(1.0, 0.9)));
      col *= mix(1.0, vig, clamp(uVignette + uFear * 0.35, 0.0, 1.0));
      float g = hash(floor(vUv * uRes) + fract(uTime * 13.17) * 91.7) - 0.5;
      col += g * uGrain * (0.35 + (1.0 - l) * 0.9);
      col = mix(col, vec3(0.92, 0.95, 1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = quality.post;
    this.fear = 0;
    this.flash = 0;
    this.gamma = 1;
    if (!this.enabled) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.aa ? 4 : 0 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(renderer.getSize(new THREE.Vector2()), 0.6, 0.5, 1.15);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    composer.addPass(this.final);
    this.composer = composer;
  }

  setSize(w, h, pr) {
    if (!this.composer) return;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.final.uniforms.uRes.value.set(w * pr, h * pr);
  }

  render(dt, t) {
    if (!this.composer) {
      this.renderer.toneMappingExposure = 1.15 * this.gamma * (1 + this.flash * 3);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const u = this.final.uniforms;
    u.uTime.value = t;
    u.uFear.value = this.fear;
    u.uFlash.value = this.flash;
    u.uGamma.value = this.gamma;
    this.composer.render(dt);
  }
}
