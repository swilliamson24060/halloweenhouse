// Small math / random / noise helpers shared by every module.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential smoothing.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

// Phones and tablets: a coarse primary pointer. Touch-screen laptops keep
// their mouse controls because their primary pointer is fine.
export const isTouchDevice = () =>
  matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic RNG so the house is laid out the same way on every visit.
export class RNG {
  constructor(seed = 1) {
    this.next = mulberry32(seed);
  }
  float(a = 0, b = 1) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.float(a, b + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

// Periodic 2D gradient noise. Periods are in lattice cells so textures tile.
export function makeNoise(seed = 7) {
  const r = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = r() * TAU;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  function noise(x, y, px = 256, py = 256) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % px) + px) % px & 255;
    const y0 = ((yi % py) + py) % py & 255;
    const x1 = ((x0 + 1) % px) & 255;
    const y1 = ((y0 + 1) % py) & 255;
    const g00 = perm[perm[x0] + y0];
    const g10 = perm[perm[x1] + y0];
    const g01 = perm[perm[x0] + y1];
    const g11 = perm[perm[x1] + y1];
    const d00 = gx[g00] * xf + gy[g00] * yf;
    const d10 = gx[g10] * (xf - 1) + gy[g10] * yf;
    const d01 = gx[g01] * xf + gy[g01] * (yf - 1);
    const d11 = gx[g11] * (xf - 1) + gy[g11] * (yf - 1);
    const u = fade(xf);
    const v = fade(yf);
    const a = d00 + (d10 - d00) * u;
    const b = d01 + (d11 - d01) * u;
    return (a + (b - a) * v) * 1.414; // roughly -1..1
  }

  function fbm(x, y, oct = 4, px = 256, py = 256, gain = 0.5) {
    let amp = 1;
    let f = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise(x * f, y * f, px * f, py * f);
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }

  return { noise, fbm };
}

// A pre-computed tileable fbm field (0..1) that textures sample cheaply.
export class NoiseField {
  constructor(size, period, octaves, seed) {
    this.size = size;
    this.data = new Float32Array(size * size);
    const { fbm } = makeNoise(seed);
    let mn = Infinity;
    let mx = -Infinity;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = fbm((x / size) * period, (y / size) * period, octaves, period, period);
        this.data[y * size + x] = v;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    const k = 1 / (mx - mn);
    for (let i = 0; i < this.data.length; i++) this.data[i] = (this.data[i] - mn) * k;
  }
  // u, v in texture space (any real number, wraps). Bilinear.
  sample(u, v) {
    const s = this.size;
    let x = u * s - 0.5;
    let y = v * s - 0.5;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const x0 = ((xi % s) + s) % s;
    const y0 = ((yi % s) + s) % s;
    const x1 = (x0 + 1) % s;
    const y1 = (y0 + 1) % s;
    const d = this.data;
    const a = d[y0 * s + x0] + (d[y0 * s + x1] - d[y0 * s + x0]) * fx;
    const b = d[y1 * s + x0] + (d[y1 * s + x1] - d[y1 * s + x0]) * fx;
    return a + (b - a) * fy;
  }
}

// Promise that resolves on the next animation frame; used to keep the
// loading bar alive while the world is generated.
export const nextFrame = () =>
  document.hidden
    ? Promise.resolve()
    : new Promise((r) => {
    let done = false;
    const f = () => {
      if (!done) {
        done = true;
        r();
      }
    };
    requestAnimationFrame(f);
    setTimeout(f, 60);
  });

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
