import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { floats, patiently } from '../core/models.js';

// The spiders' model, made by tools/ghost_glb.py with --legs 8, which
// records for every vertex the leg it belongs to and how much it follows
// that leg, and each leg's hip. The legs walk on the graphics card, so all
// the spiders in the house are drawn together.

export const SPIDER_ART = 'art/creatures/spider.glb';
export const SPAN = 2.6; // across the legs, in units of a spider's size

// null if the model cannot be had at all
export function fetchSpider() {
  return patiently(() => new GLTFLoader().loadAsync(SPIDER_ART))
    .then((gltf) => gltf && spiderFromModel(gltf.scene))
    .catch((e) => {
      console.warn('spider model:', e);
      return null;
    });
}

// One geometry standing on the origin, facing +z, its legs spanning SPAN.
// `leg` gives each vertex its hip (x, z), how much it follows the leg
// (negative on the -x side, so that the same swing steps both sides
// forward) and the leg's place in the gait; `tail` is the hindmost point of
// the body, where a hanging spider's thread joins it.
function spiderFromModel(scene) {
  scene.updateMatrixWorld(true);
  const parts = [];
  let legs = [];
  let map = null;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.legs) legs = o.userData.legs;
    map ||= o.material.map;
    const src = o.geometry.attributes;
    const n = src.position.count;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', floats(src.position));
    g.setAttribute('normal', floats(src.normal));
    g.setAttribute('uv', src.uv ? floats(src.uv) : new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('_leg', src._leg ? floats(src._leg) : new THREE.BufferAttribute(new Float32Array(n * 4).fill(255), 4));
    if (o.geometry.index) g.setIndex(o.geometry.index);
    g.applyMatrix4(o.matrixWorld);
    parts.push(g);
  });
  const all = parts.every((g) => g.index) ? parts : parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const geo = all.length > 1 ? mergeGeometries(all, false) : all[0];
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const k = SPAN / Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  const shift = new THREE.Vector3(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.translate(shift.x, shift.y, shift.z).scale(k, k, k);
  const hips = legs.map((l) => new THREE.Vector3(...l.hip).add(shift).multiplyScalar(k));
  // the alternating tetrapod: the first and third legs on one side step
  // with the second and fourth on the other, the front a little ahead
  const phase = legs.map((l) => ((l.order + (l.side > 0 ? 1 : 0)) % 2) * Math.PI - l.order * 0.3);
  const src = geo.attributes._leg;
  const pos = geo.attributes.position;
  const leg = new Float32Array(src.count * 4);
  let tail = null;
  for (let i = 0; i < src.count; i++) {
    const n = src.getX(i);
    const w = src.getY(i) / 255;
    if (n < legs.length && w > 0) leg.set([hips[n].x, hips[n].z, -Math.sign(legs[n].side) * w, phase[n]], i * 4);
    else if (!tail || pos.getZ(i) < tail.z) tail = { y: pos.getY(i), z: pos.getZ(i) };
  }
  geo.deleteAttribute('_leg');
  geo.setAttribute('leg', new THREE.BufferAttribute(leg, 4));
  geo.computeBoundingSphere();
  return { geo, map, tail: tail || { y: 0.5, z: -1 } };
}

// The step, in the spider's own space: each leg turns about the upright
// through its hip, and lifts while it swings forward. Per spider, gait.x is
// how far through its stride it is (radians) and gait.y how hard it walks.
const GAIT = /* glsl */ `
  attribute vec4 leg;
  attribute vec2 gait;
  vec2 legSwing() {
    float ph = gait.x + leg.w;
    return vec2(sin(ph) * 0.32 * leg.z, max(0.0, cos(ph)) * 0.35 * abs(leg.z)) * gait.y;
  }
  vec2 legTurn(vec2 d, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * d.x + s * d.y, c * d.y - s * d.x);
  }
`;

// A material (or the depth material for its shadow) made to walk the legs.
export function walking(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GAIT}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal.xz = legTurn(objectNormal.xz, legSwing().x);')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  {
    vec2 sw = legSwing();
    vec2 d = legTurn(transformed.xz - leg.xy, sw.x);
    transformed = vec3(leg.x + d.x, transformed.y + sw.y * length(d), leg.y + d.y);
  }`
      );
  };
  material.customProgramCacheKey = () => 'spider-walk';
  return material;
}
