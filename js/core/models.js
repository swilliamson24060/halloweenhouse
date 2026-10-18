import * as THREE from 'three';

// Shared by the models the house fetches: the ghosts and the spiders.

// load() tried again after 2, 4, 8, 16 and 32 seconds if the connection
// drops it; null if it still cannot be had.
export function patiently(load, tries = 0) {
  return load().catch(() => {
    if (tries >= 5) return null;
    return new Promise((r) => setTimeout(r, 2000 * 2 ** tries)).then(() => patiently(load, tries + 1));
  });
}

// A plain float copy of an attribute, so models stored compactly (quantised
// or interleaved) can be moved and merged like any other.
export function floats(attr) {
  const n = attr.itemSize;
  const a = new Float32Array(attr.count * n);
  for (let i = 0; i < attr.count; i++) for (let k = 0; k < n; k++) a[i * n + k] = attr.getComponent(i, k);
  return new THREE.BufferAttribute(a, n);
}
