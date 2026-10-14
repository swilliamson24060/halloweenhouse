import * as THREE from 'three';
import { RNG, NoiseField, clamp, smoothstep, nextFrame } from '../core/util.js';
import { buildPortraits } from './portraits.js';

// Every surface texture is painted procedurally on canvases at load time, so
// the project ships without image assets. Textures that tile use world-space
// UVs in metres; `tile` is the real-world size one copy of the texture covers.

let ANISO = 4;
let F1;
let F2;
let F3;
const DISPLAY_FONT = '"IM Fell English SC", "IM Fell English", Georgia, "Times New Roman", serif';
const BODY_FONT = '"IM Fell English", Georgia, "Times New Roman", serif';

function cv(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, { tile = 1, tileV = tile, srgb = true, wrap = true, aniso = ANISO } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / tile, 1 / tileV);
  } else {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  }
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Run fn(u, v, x, y) for every pixel; fn writes [r,g,b,(a)] into px and
// optionally a height value (0..255) into px[4].
function paint(c, hc, fn, keep = false) {
  const w = c.width;
  const h = c.height;
  const g = c.getContext('2d');
  const id = keep ? g.getImageData(0, 0, w, h) : g.createImageData(w, h);
  const d = id.data;
  let hd = null;
  let hid = null;
  if (hc) {
    hid = hc.getContext('2d').createImageData(w, h);
    hd = hid.data;
  }
  const px = [0, 0, 0, 255, 128];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[0] = d[i];
      px[1] = d[i + 1];
      px[2] = d[i + 2];
      px[3] = keep ? d[i + 3] : 255;
      px[4] = 128;
      fn(x / w, y / h, x, y, px);
      d[i] = px[0];
      d[i + 1] = px[1];
      d[i + 2] = px[2];
      d[i + 3] = px[3];
      if (hd) {
        hd[i] = hd[i + 1] = hd[i + 2] = px[4];
        hd[i + 3] = 255;
      }
    }
  }
  g.putImageData(id, 0, 0);
  if (hc) hc.getContext('2d').putImageData(hid, 0, 0);
}

// Draw something at all 9 wrap offsets so it tiles.
function wrapDraw(w, h, fn) {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy);
}

// --------------------------------------------------------------- exterior

function siding() {
  const S = 512;
  const rows = 11;
  const bh = S / rows;
  const c = cv(S);
  const hc = cv(S);
  const rng = new RNG(5);
  const tint = [];
  const joints = [];
  for (let r = 0; r < rows; r++) {
    tint.push(rng.float(-12, 12));
    joints.push([rng.float(0, S), rng.float(0, S)]);
  }
  paint(c, hc, (u, v, x, y, px) => {
    const r = Math.min(rows - 1, Math.floor(y / bh));
    const fy = (y - r * bh) / bh;
    const grain = F3.sample(u * 2, v * 16 + r * 0.31);
    const n = F1.sample(u, v);
    const peel = F2.sample(u + 0.37, v + 0.11);
    let shade = fy < 0.13 ? 0.5 + (fy / 0.13) * 0.42 : 0.96 - (fy - 0.13) * 0.12;
    if (fy > 0.93) shade *= 1.12;
    const base = 118 + tint[r] + (grain - 0.5) * 36 + (n - 0.5) * 44;
    let R = base * 0.95;
    let G = base * 0.98;
    let B = base;
    let hgt = 50 + fy * 160 + (grain - 0.5) * 30;
    if (peel > 0.67) {
      const wd = 66 + grain * 44;
      R = wd * 1.05;
      G = wd * 0.95;
      B = wd * 0.84;
      hgt -= 22;
    } else if (peel > 0.64) {
      R *= 1.2;
      G *= 1.2;
      B *= 1.16;
    }
    const streak = F2.sample(u * 8, v);
    const dirt = 1 - Math.max(0, streak - 0.55) * 0.9;
    let jd = 1;
    for (const j of joints[r]) if (Math.abs(x - j) < 1.3) jd = 0.42;
    if (jd < 1) hgt -= 50;
    const k = shade * dirt * jd;
    px[0] = R * k;
    px[1] = G * k;
    px[2] = B * k;
    px[4] = hgt;
  });
  return { map: finish(c, { tile: 2 }), bump: finish(hc, { tile: 2, srgb: false }) };
}

function trim() {
  const S = 256;
  const c = cv(S);
  const hc = cv(S);
  paint(c, hc, (u, v, x, y, px) => {
    const n = F1.sample(u * 2, v * 2);
    const f = F2.sample(u * 2, v * 2);
    const g3 = F3.sample(u * 4, v * 4);
    let b = 150 + (n - 0.5) * 50 + (g3 - 0.5) * 20;
    const crack = Math.abs(f - 0.5) < 0.012;
    if (crack) b *= 0.55;
    const grime = Math.max(0, F2.sample(u * 4, v) - 0.6) * 1.4;
    b *= 1 - grime;
    px[0] = b * 0.98;
    px[1] = b * 0.97;
    px[2] = b * 0.92;
    px[4] = 128 + (g3 - 0.5) * 40 - (crack ? 60 : 0);
  });
  return { map: finish(c, { tile: 1 }), bump: finish(hc, { tile: 1, srgb: false }) };
}

function shingles(kind = 'fish') {
  const S = 512;
  const rows = 10;
  const cols = 8;
  const rh = S / rows;
  const cw = S / cols;
  const c = cv(S);
  const hc = cv(S);
  const g = c.getContext('2d');
  const gh = hc.getContext('2d');
  g.fillStyle = '#1a1b1c';
  g.fillRect(0, 0, S, S);
  gh.fillStyle = '#000';
  gh.fillRect(0, 0, S, S);
  const rng = new RNG(kind === 'fish' ? 21 : 33);
  // bottom row first so upper courses overlap lower ones
  for (let r = rows - 1; r >= -1; r--) {
    const off = (((r % 2) + 2) % 2) * (cw / 2);
    for (let k = -1; k <= cols; k++) {
      const x0 = k * cw + off;
      const y0 = r * rh;
      const tone = rng.float(58, 92);
      const tint = rng.float(-6, 6);
      const draw = (ox, oy, ctx, isH) => {
        ctx.beginPath();
        const top = y0 - rh * 0.6 + oy;
        const bot = y0 + rh + oy;
        if (kind === 'fish') {
          const rad = cw / 2 - 1;
          ctx.moveTo(x0 + ox + 1, top);
          ctx.lineTo(x0 + ox + cw - 1, top);
          ctx.lineTo(x0 + ox + cw - 1, bot - rad);
          ctx.arc(x0 + ox + cw / 2, bot - rad, rad, 0, Math.PI, false);
          ctx.closePath();
        } else {
          ctx.rect(x0 + ox + 1, top, cw - 2, bot - top - 1);
        }
        if (isH) {
          const gr = ctx.createLinearGradient(0, top, 0, bot);
          gr.addColorStop(0, '#202020');
          gr.addColorStop(1, '#e0e0e0');
          ctx.fillStyle = gr;
          ctx.fill();
        } else {
          ctx.fillStyle = `rgb(${tone + tint},${tone + tint * 0.5 + 3},${tone + 6})`;
          ctx.fill();
          ctx.strokeStyle = 'rgba(10,10,10,0.85)';
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }
      };
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          draw(ox, oy, g, false);
          draw(ox, oy, gh, true);
        }
      }
    }
  }
  paint(
    c,
    null,
    (u, v, x, y, px) => {
      const n = F1.sample(u * 2, v * 2);
      const moss = F2.sample(u * 2 + 0.5, v * 2);
      const fine = F3.sample(u * 4, v * 4);
      let k = 0.8 + (n - 0.5) * 0.6 + (fine - 0.5) * 0.25;
      px[0] *= k;
      px[1] *= k;
      px[2] *= k;
      if (moss > 0.62) {
        const m = Math.min(1, (moss - 0.62) * 5);
        px[0] = px[0] * (1 - m) + 52 * m * k;
        px[1] = px[1] * (1 - m) + 66 * m * k;
        px[2] = px[2] * (1 - m) + 34 * m * k;
      }
    },
    true
  );
  return { map: finish(c, { tile: 1.6 }), bump: finish(hc, { tile: 1.6, srgb: false }) };
}

function stoneBlocks() {
  const S = 512;
  const c = cv(S);
  const hc = cv(S);
  const g = c.getContext('2d');
  const gh = hc.getContext('2d');
  g.fillStyle = '#5d5952';
  g.fillRect(0, 0, S, S);
  gh.fillStyle = '#202020';
  gh.fillRect(0, 0, S, S);
  const rng = new RNG(8);
  const rowHeights = [];
  let tot = 0;
  while (tot < S) {
    const h = rng.int(56, 96);
    rowHeights.push(h);
    tot += h;
  }
  const scale = S / tot;
  let y = 0;
  for (const rhRaw of rowHeights) {
    const rh = rhRaw * scale;
    let x = rng.float(0, 80);
    const startX = x;
    while (x < startX + S) {
      const w = rng.float(90, 190);
      const tone = rng.float(85, 128);
      wrapDraw(S, S, (ox, oy) => {
        g.fillStyle = `rgb(${tone + 4},${tone},${tone - 6})`;
        g.beginPath();
        g.roundRect(x + 3 + ox, y + 3 + oy, Math.min(w, startX + S - x) - 6, rh - 6, 7);
        g.fill();
        gh.fillStyle = '#c8c8c8';
        gh.beginPath();
        gh.roundRect(x + 3 + ox, y + 3 + oy, Math.min(w, startX + S - x) - 6, rh - 6, 7);
        gh.fill();
      });
      x += w;
    }
    y += rh;
  }
  paint(
    c,
    null,
    (u, v, X, Y, px) => {
      const n = F1.sample(u * 2, v * 2);
      const f = F3.sample(u * 4, v * 4);
      const k = 0.75 + (n - 0.5) * 0.5 + (f - 0.5) * 0.4;
      const moss = F2.sample(u * 2, v * 2 + 0.3);
      px[0] *= k;
      px[1] *= k;
      px[2] *= k;
      if (moss > 0.66) {
        px[0] *= 0.8;
        px[1] *= 0.95;
        px[2] *= 0.7;
      }
    },
    true
  );
  paint(
    hc,
    null,
    (u, v, X, Y, px) => {
      const f = F3.sample(u * 4, v * 4);
      px[0] = px[1] = px[2] = px[0] * (0.8 + f * 0.4);
    },
    true
  );
  return { map: finish(c, { tile: 2 }), bump: finish(hc, { tile: 2, srgb: false }) };
}

// Tileable voronoi used by flagstones and fieldstone walls.
function voronoi(S, count, seed) {
  const rng = new RNG(seed);
  const pts = [];
  for (let i = 0; i < count; i++) pts.push([rng.float(0, 1), rng.float(0, 1), rng.float(0, 1)]);
  const cells = new Int16Array(S * S);
  const edge = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      let d1 = 9;
      let d2 = 9;
      let id = 0;
      for (let i = 0; i < count; i++) {
        let dx = Math.abs(u - pts[i][0]);
        let dy = Math.abs(v - pts[i][1]);
        if (dx > 0.5) dx = 1 - dx;
        if (dy > 0.5) dy = 1 - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = i;
        } else if (d < d2) d2 = d;
      }
      cells[y * S + x] = id;
      edge[y * S + x] = Math.sqrt(d2) - Math.sqrt(d1);
    }
  }
  return { pts, cells, edge };
}

function flagstone() {
  const S = 512;
  const c = cv(S);
  const hc = cv(S);
  const vo = voronoi(S, 26, 44);
  const tones = vo.pts.map((p) => 92 + p[2] * 50);
  paint(c, hc, (u, v, x, y, px) => {
    const i = y * S + x;
    const e = vo.edge[i];
    const id = vo.cells[i];
    const n = F1.sample(u * 2, v * 2);
    const f = F3.sample(u * 4, v * 4);
    const crack = Math.abs(F2.sample(u * 2, v * 2) - 0.5) < 0.008;
    if (e < 0.012) {
      // moss / dirt in the joints
      const m = F2.sample(u * 4, v * 4);
      px[0] = 38 + m * 20;
      px[1] = 48 + m * 26;
      px[2] = 26 + m * 10;
      px[4] = 30;
    } else {
      const t = tones[id] * (0.8 + (n - 0.5) * 0.5 + (f - 0.5) * 0.3);
      px[0] = t;
      px[1] = t * 0.98;
      px[2] = t * 0.93;
      px[4] = 120 + Math.min(80, e * 2500) + (f - 0.5) * 30;
      if (e < 0.022) {
        const m = (0.022 - e) / 0.01;
        px[0] = px[0] * (1 - m * 0.5) + 40 * m * 0.5;
        px[1] = px[1] * (1 - m * 0.4) + 56 * m * 0.4;
        px[2] = px[2] * (1 - m * 0.5) + 30 * m * 0.5;
      }
      if (crack) {
        px[0] *= 0.4;
        px[1] *= 0.4;
        px[2] *= 0.4;
        px[4] = 50;
      }
    }
  });
  return { map: finish(c, { tile: 2.4 }), bump: finish(hc, { tile: 2.4, srgb: false }) };
}

function concrete() {
  const S = 512;
  const c = cv(S);
  const hc = cv(S);
  paint(c, hc, (u, v, x, y, px) => {
    const n = F1.sample(u * 2, v * 2);
    const f = F3.sample(u * 8, v * 8);
    const b = 112 + (n - 0.5) * 50 + (f - 0.5) * 26;
    px[0] = b;
    px[1] = b * 0.99;
    px[2] = b * 0.95;
    px[4] = 140 + (f - 0.5) * 30;
    const jx = Math.min(x % 256, 256 - (x % 256));
    const jy = Math.min(y % 256, 256 - (y % 256));
    if (jx < 3 || jy < 3) {
      px[0] = 40;
      px[1] = 46;
      px[2] = 34;
      px[4] = 30;
    } else if (jx < 9 || jy < 9) {
      px[0] *= 0.75;
      px[1] *= 0.85;
      px[2] *= 0.7;
    }
    const stain = F2.sample(u * 2 + 0.4, v * 2);
    if (stain > 0.66) {
      px[0] *= 0.82;
      px[1] *= 0.84;
      px[2] *= 0.8;
    }
  });
  // cracks
  const g = c.getContext('2d');
  const gh = hc.getContext('2d');
  const rng = new RNG(77);
  for (let k = 0; k < 9; k++) {
    let x = rng.float(0, S);
    let y = rng.float(0, S);
    let a = rng.float(0, Math.PI * 2);
    const pts = [[x, y]];
    for (let s = 0; s < 18; s++) {
      a += rng.float(-0.6, 0.6);
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      pts.push([x, y]);
    }
    wrapDraw(S, S, (ox, oy) => {
      for (const [ctx, col, w] of [
        [g, 'rgba(30,34,26,0.9)', 2],
        [gh, '#101010', 2.5],
      ]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
        ctx.stroke();
      }
    });
  }
  return { map: finish(c, { tile: 3 }), bump: finish(hc, { tile: 3, srgb: false }) };
}

function groundTex() {
  const S = 512;
  const c = cv(S);
  const hc = cv(S);
  paint(c, hc, (u, v, x, y, px) => {
    const n = F1.sample(u * 2, v * 2);
    const m = F2.sample(u * 2, v * 2);
    const f = F3.sample(u * 8, v * 8);
    // soil
    let r = 52;
    let g = 44;
    let b = 34;
    // dead grass
    const dg = smoothstep(0.35, 0.65, n);
    r += (78 - r) * dg;
    g += (74 - g) * dg;
    b += (46 - b) * dg;
    // moss
    const mo = smoothstep(0.55, 0.75, m);
    r += (40 - r) * mo;
    g += (58 - g) * mo;
    b += (32 - b) * mo;
    const k = 0.8 + (f - 0.5) * 0.5;
    px[0] = r * k;
    px[1] = g * k;
    px[2] = b * k;
    px[4] = 128 + (f - 0.5) * 70 + (n - 0.5) * 40;
  });
  // fallen leaves and pebbles
  const g = c.getContext('2d');
  const rng = new RNG(3);
  for (let i = 0; i < 900; i++) {
    const x = rng.float(0, S);
    const y = rng.float(0, S);
    const s = rng.float(1.5, 4.5);
    const t = rng.float(0, 1);
    g.fillStyle = t < 0.5 ? `rgba(${rng.int(70, 110)},${rng.int(50, 70)},${rng.int(25, 40)},0.8)` : `rgba(${rng.int(80, 120)},${rng.int(80, 115)},${rng.int(75, 105)},0.7)`;
    wrapDraw(S, S, (ox, oy) => {
      g.beginPath();
      g.ellipse(x + ox, y + oy, s, s * rng.float(0.5, 1), rng.float(0, 3), 0, Math.PI * 2);
      g.fill();
    });
  }
  return { map: finish(c, { tile: 5 }), bump: finish(hc, { tile: 5, srgb: false }) };
}

function asphalt() {
  const S = 512;
  const c = cv(S);
  const rc = cv(S);
  paint(c, rc, (u, v, x, y, px) => {
    const n = F1.sample(u * 2, v * 2);
    const f = F3.sample(u * 16, v * 16);
    const speck = f > 0.72 ? 1.5 : 1;
    const b = (30 + (n - 0.5) * 16) * speck;
    px[0] = b;
    px[1] = b;
    px[2] = b * 1.06;
    const wet = smoothstep(0.55, 0.62, F2.sample(u * 2, v * 2));
    px[0] *= 1 - wet * 0.35;
    px[1] *= 1 - wet * 0.35;
    px[2] *= 1 - wet * 0.3;
    px[4] = 235 - wet * 200;
  });
  return { map: finish(c, { tile: 6 }), rough: finish(rc, { tile: 6, srgb: false }) };
}

function bark() {
  const S = 256;
  const c = cv(S);
  const hc = cv(S);
  paint(c, hc, (u, v, x, y, px) => {
    const fis = F2.sample(u * 8, v * 2);
    const n = F1.sample(u * 4, v * 2);
    const f = F3.sample(u * 8, v * 8);
    const crack = smoothstep(0.42, 0.5, fis);
    const b = (44 + n * 30 + f * 14) * (0.45 + 0.55 * crack);
    px[0] = b;
    px[1] = b * 0.94;
    px[2] = b * 0.86;
    px[4] = 40 + crack * 180 + f * 30;
  });
  return { map: finish(c, { tile: 1, tileV: 2 }), bump: finish(hc, { tile: 1, tileV: 2, srgb: false }) };
}

function hedge() {
  const S = 256;
  const c = cv(S);
  const g = c.getContext('2d');
  g.fillStyle = '#0f150d';
  g.fillRect(0, 0, S, S);
  const rng = new RNG(19);
  for (let i = 0; i < 2600; i++) {
    const x = rng.float(0, S);
    const y = rng.float(0, S);
    const s = rng.float(2, 6);
    const l = rng.float(0, 1);
    const dead = rng.chance(0.18);
    g.fillStyle = dead
      ? `rgb(${60 + l * 40},${52 + l * 30},${30 + l * 15})`
      : `rgb(${22 + l * 30},${34 + l * 40},${18 + l * 20})`;
    wrapDraw(S, S, (ox, oy) => {
      g.beginPath();
      g.ellipse(x + ox, y + oy, s, s * 0.55, rng.float(0, 3.14), 0, Math.PI * 2);
      g.fill();
    });
  }
  return { map: finish(c, { tile: 1.2 }) };
}

function rust() {
  const S = 256;
  const c = cv(S);
  paint(c, null, (u, v, x, y, px) => {
    const n = F1.sample(u * 2, v * 2);
    const f = F3.sample(u * 8, v * 8);
    const r = smoothstep(0.45, 0.7, n * 0.7 + f * 0.3);
    px[0] = 36 + r * 70 + f * 10;
    px[1] = 32 + r * 30 + f * 6;
    px[2] = 30 + r * 10;
  });
  return { map: finish(c, { tile: 1 }) };
}

function brick() {
  const S = 512;
  const c = cv(S);
  const hc = cv(S);
  const g = c.getContext('2d');
  const gh = hc.getContext('2d');
  g.fillStyle = '#4a4440';
  g.fillRect(0, 0, S, S);
  gh.fillStyle = '#222';
  gh.fillRect(0, 0, S, S);
  const rows = 12;
  const rh = S / rows;
  const bw = S / 4;
  const rng = new RNG(12);
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (bw / 2);
    for (let k = -1; k < 5; k++) {
      const t = rng.float(0.75, 1.1);
      g.fillStyle = `rgb(${110 * t},${52 * t},${40 * t})`;
      gh.fillStyle = '#ccc';
      for (const ox of [-S, 0, S]) {
        g.fillRect(k * bw + off + 3 + ox, r * rh + 3, bw - 6, rh - 6);
        gh.fillRect(k * bw + off + 3 + ox, r * rh + 3, bw - 6, rh - 6);
      }
    }
  }
  paint(
    c,
    null,
    (u, v, x, y, px) => {
      const n = F1.sample(u * 2, v * 2);
      const f = F3.sample(u * 8, v * 8);
      const soot = smoothstep(0.5, 0.8, F2.sample(u * 2, v * 2));
      const k = (0.75 + (n - 0.5) * 0.4 + (f - 0.5) * 0.3) * (1 - soot * 0.6);
      px[0] *= k;
      px[1] *= k;
      px[2] *= k;
    },
    true
  );
  return { map: finish(c, { tile: 1 }), bump: finish(hc, { tile: 1, srgb: false }) };
}

// --------------------------------------------------------------- interior

function damaskMotif(g, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  for (const side of [-1, 1]) {
    g.save();
    g.scale(side, 1);
    g.beginPath();
    g.moveTo(0, -s * 0.5);
    g.bezierCurveTo(s * 0.12, -s * 0.32, s * 0.2, -s * 0.1, s * 0.08, s * 0.1);
    g.bezierCurveTo(s * 0.03, s * 0.2, s * 0.05, s * 0.35, 0, s * 0.5);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(s * 0.07, -s * 0.06);
    g.bezierCurveTo(s * 0.36, -s * 0.27, s * 0.46, s * 0.06, s * 0.3, s * 0.19);
    g.bezierCurveTo(s * 0.21, s * 0.26, s * 0.13, s * 0.15, s * 0.21, s * 0.08);
    g.bezierCurveTo(s * 0.27, s * 0.03, s * 0.2, -s * 0.07, s * 0.08, s * 0.03);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(s * 0.02, -s * 0.3);
    g.bezierCurveTo(s * 0.2, -s * 0.46, s * 0.33, -s * 0.38, s * 0.37, -s * 0.49);
    g.bezierCurveTo(s * 0.31, -s * 0.3, s * 0.18, -s * 0.27, s * 0.04, -s * 0.21);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(s * 0.03, s * 0.25);
    g.bezierCurveTo(s * 0.21, s * 0.28, s * 0.31, s * 0.43, s * 0.18, s * 0.49);
    g.bezierCurveTo(s * 0.2, s * 0.4, s * 0.12, s * 0.33, s * 0.02, s * 0.34);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.beginPath();
  g.ellipse(0, 0, s * 0.035, s * 0.06, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function star(g, x, y, r, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

const WALLPAPER = {
  parlor: { base: [88, 22, 26], motif: [126, 44, 40], kind: 'damask' },
  dining: { base: [30, 50, 38], motif: [56, 82, 58], kind: 'damask' },
  hall: { base: [66, 54, 38], motif: [92, 76, 50], kind: 'damask' },
  library: { base: [26, 44, 48], motif: [44, 66, 66], kind: 'damask' },
  master: { base: [50, 58, 80], motif: [72, 82, 104], kind: 'stripe' },
  nursery: { base: [168, 148, 138], motif: [102, 122, 152], kind: 'stars' },
  yellow: { base: [168, 148, 80], motif: [122, 102, 46], kind: 'yellow' },
  sewing: { base: [104, 90, 110], motif: [134, 118, 138], kind: 'floral' },
  seance: { base: [40, 22, 44], motif: [64, 40, 70], kind: 'damask' },
  bath: { base: [120, 130, 120], motif: [90, 104, 96], kind: 'stripe' },
};

function wallpaper(style) {
  const P = WALLPAPER[style];
  const S = 512;
  const c = cv(S);
  const hc = cv(S);
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${P.base.join(',')})`;
  g.fillRect(0, 0, S, S);
  g.fillStyle = `rgb(${P.motif.join(',')})`;
  g.strokeStyle = `rgb(${P.motif.join(',')})`;
  const rng = new RNG(style.length * 31);
  if (P.kind === 'damask') {
    wrapDraw(S, S, (ox, oy) => {
      damaskMotif(g, 128 + ox, 128 + oy, 230);
      damaskMotif(g, 384 + ox, 384 + oy, 230);
      g.beginPath();
      for (const [x, y] of [
        [384, 128],
        [128, 384],
      ]) {
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          g.ellipse(x + ox + Math.cos(a) * 14, y + oy + Math.sin(a) * 14, 12, 6, a, 0, Math.PI * 2);
        }
      }
      g.fill();
    });
  } else if (P.kind === 'stripe') {
    for (let x = 0; x < S; x += 64) {
      g.globalAlpha = 0.55;
      g.fillRect(x, 0, 22, S);
      g.globalAlpha = 1;
      g.fillRect(x + 26, 0, 3, S);
      for (let y = 0; y < S; y += 64) {
        g.beginPath();
        g.ellipse(x + 46, y + 32, 5, 9, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (P.kind === 'stars') {
    for (let y = 0; y < S; y += 64) {
      for (let x = 0; x < S; x += 64) {
        const ox = (y / 64) % 2 ? 32 : 0;
        if ((x / 64 + y / 64) % 3 === 0) {
          g.beginPath();
          g.arc(x + ox + 20, y + 22, 13, 0.3, Math.PI * 1.7);
          g.arc(x + ox + 25, y + 20, 10, Math.PI * 1.65, 0.35, true);
          g.fill();
        } else star(g, x + ox + 22, y + 24, 9);
      }
    }
  } else if (P.kind === 'yellow') {
    g.lineWidth = 6;
    for (let k = 0; k < 26; k++) {
      const pts = [];
      let x = rng.float(0, S);
      let y = rng.float(0, S);
      let a = rng.float(0, 6.28);
      for (let s = 0; s < 6; s++) {
        a += rng.float(-1.4, 1.4);
        pts.push([x, y]);
        x += Math.cos(a) * 60;
        y += Math.sin(a) * 60;
      }
      wrapDraw(S, S, (ox, oy) => {
        g.beginPath();
        g.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          g.quadraticCurveTo(pts[i][0] + ox, pts[i][1] + oy, mx + ox, my + oy);
        }
        g.stroke();
        for (const p of pts) {
          g.beginPath();
          g.arc(p[0] + ox, p[1] + oy, 7, 0, Math.PI * 2);
          g.fill();
        }
      });
    }
  } else if (P.kind === 'floral') {
    for (let y = 0; y < S; y += 128) {
      for (let x = 0; x < S; x += 128) {
        const ox = (y / 128) % 2 ? 64 : 0;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.beginPath();
          g.ellipse(x + ox + 40 + Math.cos(a) * 16, y + 50 + Math.sin(a) * 16, 13, 7, a, 0, Math.PI * 2);
          g.fill();
        }
        g.fillRect(x + ox + 39, y + 66, 3, 40);
      }
    }
  }
  const offs = rng.float(0, 1);
  paint(
    c,
    hc,
    (u, v, x, y, px) => {
      const n = F1.sample(u + offs, v);
      const stain = F1.sample(u * 2 + 0.33 + offs, v * 2 + 0.71);
      const mold = F3.sample(u * 8, v * 8);
      const peel = F2.sample(u * 2 + offs, v * 2 + 0.5);
      const fine = F3.sample(u * 16, v * 16);
      let k = 0.82 + (n - 0.5) * 0.4 + (fine - 0.5) * 0.08;
      let r = px[0];
      let gg = px[1];
      let b = px[2];
      px[4] = 128 + (fine - 0.5) * 20;
      if (stain > 0.66) {
        const s = Math.min(1, (stain - 0.66) * 4);
        r = r * (1 - s * 0.35) + 92 * s * 0.35;
        gg = gg * (1 - s * 0.45) + 70 * s * 0.45;
        b = b * (1 - s * 0.6) + 40 * s * 0.6;
        if (stain < 0.68) k *= 0.72;
      }
      if (mold > 0.8) k *= 0.55;
      if (peel > 0.76) {
        r = 136;
        gg = 130;
        b = 120;
        k *= 0.9 + (fine - 0.5) * 0.2;
        px[4] = 90;
      } else if (peel > 0.74) {
        k *= 0.5;
        px[4] = 170;
      }
      // fade toward grey with age
      const lum = (r + gg + b) / 3;
      r = r * 0.82 + lum * 0.18;
      gg = gg * 0.82 + lum * 0.18;
      b = b * 0.82 + lum * 0.18;
      px[0] = r * k;
      px[1] = gg * k;
      px[2] = b * k;
    },
    true
  );
  return { map: finish(c, { tile: 1.1 }), bump: finish(hc, { tile: 1.1, srgb: false }) };
}

const WOODS = {
  oak: [80, 52, 34],
  dark: [50, 30, 22],
  pine: [112, 86, 58],
  porch: [92, 88, 82],
  cellar: [70, 56, 40],
};

function floorboards(style) {
  const base = WOODS[style];
  const S = 512;
  const planks = 16;
  const ph = S / planks;
  const c = cv(S);
  const hc = cv(S);
  const rng = new RNG(style.length * 7 + 2);
  const tone = [];
  const joints = [];
  for (let r = 0; r < planks; r++) {
    tone.push(rng.float(0.78, 1.18));
    joints.push(rng.float(0, S));
  }
  const weathered = style === 'porch';
  paint(c, hc, (u, v, x, y, px) => {
    const r = Math.min(planks - 1, Math.floor(y / ph));
    const fy = (y - r * ph) / ph;
    const grain = F2.sample(u * 2 + r * 0.17, v * 32);
    const fiber = F3.sample(u * 4, v * 64);
    const n = F1.sample(u, v);
    const ring = 0.5 + 0.5 * Math.sin((v * 16 + grain * 3 + r * 0.7) * 38);
    let k = tone[r] * (0.82 + (grain - 0.5) * 0.36 + (fiber - 0.5) * 0.16 + ring * 0.06);
    k *= 0.85 + (n - 0.5) * 0.4;
    let R = base[0] * k;
    let G = base[1] * k;
    let B = base[2] * k;
    // dust in low traffic areas
    const dust = smoothstep(0.5, 0.8, F2.sample(u * 2 + 0.6, v * 2));
    R += (118 - R) * dust * 0.35;
    G += (108 - G) * dust * 0.35;
    B += (96 - B) * dust * 0.35;
    if (weathered) {
      const rot = smoothstep(0.62, 0.7, F1.sample(u * 2 + 0.2, v * 2));
      R *= 1 - rot * 0.5;
      G *= 1 - rot * 0.45;
      B *= 1 - rot * 0.5;
    }
    let h = 150 + (grain - 0.5) * 40;
    if (fy < 0.06 || fy > 0.94) {
      R *= 0.35;
      G *= 0.35;
      B *= 0.35;
      h = 40;
    }
    if (Math.abs(x - joints[r]) < 1.2) {
      R *= 0.4;
      G *= 0.4;
      B *= 0.4;
      h = 50;
    }
    px[0] = R;
    px[1] = G;
    px[2] = B;
    px[4] = h;
  });
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(190,170,150,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const x = rng.float(0, S);
    const y = rng.float(0, S);
    const a = rng.float(-0.4, 0.4);
    const l = rng.float(10, 60);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return { map: finish(c, { tile: 2 }), bump: finish(hc, { tile: 2, srgb: false }) };
}

function furnitureWood(dark = true) {
  const S = 256;
  const c = cv(S);
  const base = dark ? [62, 30, 22] : [96, 64, 40];
  paint(c, null, (u, v, x, y, px) => {
    const grain = F2.sample(u * 2, v * 16);
    const fiber = F3.sample(u * 4, v * 32);
    const ring = 0.5 + 0.5 * Math.sin((v * 8 + grain * 2.5) * 30);
    const k = 0.75 + (grain - 0.5) * 0.4 + (fiber - 0.5) * 0.2 + ring * 0.1;
    px[0] = base[0] * k;
    px[1] = base[1] * k;
    px[2] = base[2] * k;
  });
  return { map: finish(c, { tile: 1 }) };
}

function plaster() {
  const S = 512;
  const c = cv(S);
  const hc = cv(S);
  paint(c, hc, (u, v, x, y, px) => {
    const n = F1.sample(u * 2, v * 2);
    const f = F3.sample(u * 8, v * 8);
    const stain = F1.sample(u * 2 + 0.51, v * 2 + 0.23);
    let b = 132 + (n - 0.5) * 40 + (f - 0.5) * 10;
    let r = b;
    let g = b * 0.97;
    let bb = b * 0.92;
    if (stain > 0.64) {
      const s = Math.min(1, (stain - 0.64) * 5);
      r = r * (1 - s * 0.3) + 100 * s * 0.3;
      g = g * (1 - s * 0.4) + 80 * s * 0.4;
      bb = bb * (1 - s * 0.55) + 52 * s * 0.55;
      if (stain < 0.66) {
        r *= 0.75;
        g *= 0.75;
        bb *= 0.75;
      }
    }
    const crack = Math.abs(F2.sample(u * 2, v * 2) - 0.5) < 0.006;
    if (crack) {
      r *= 0.45;
      g *= 0.45;
      bb *= 0.45;
    }
    px[0] = r;
    px[1] = g;
    px[2] = bb;
    px[4] = 128 + (f - 0.5) * 30 - (crack ? 70 : 0);
  });
  return { map: finish(c, { tile: 3 }), bump: finish(hc, { tile: 3, srgb: false }) };
}

function tiles(kind) {
  const S = 512;
  const c = cv(S);
  const hc = cv(S);
  const g = c.getContext('2d');
  const gh = hc.getContext('2d');
  let tile = 2;
  if (kind === 'checker') {
    const n = 8;
    const s = S / n;
    gh.fillStyle = '#333';
    gh.fillRect(0, 0, S, S);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? '#1c1b1a' : '#b9b3a6';
        g.fillRect(x * s, y * s, s, s);
        gh.fillStyle = '#ccc';
        gh.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      }
    }
    tile = 2.4;
  } else if (kind === 'hex') {
    g.fillStyle = '#6d6d68';
    g.fillRect(0, 0, S, S);
    gh.fillStyle = '#333';
    gh.fillRect(0, 0, S, S);
    const r = 16;
    const w = Math.sqrt(3) * r;
    const cols = Math.round(S / w);
    const ww = S / cols;
    const rr = ww / Math.sqrt(3);
    const rows = Math.round(S / (rr * 1.5));
    const hh = S / rows;
    for (let row = -1; row <= rows; row++) {
      for (let col = -1; col <= cols; col++) {
        const cx = col * ww + (row % 2 ? ww / 2 : 0);
        const cy = row * hh;
        for (const [ctx, col2] of [
          [g, (row * 7 + col * 3) % 23 === 0 ? '#2a2a2a' : '#d6d3c8'],
          [gh, '#d0d0d0'],
        ]) {
          ctx.fillStyle = col2;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            ctx.lineTo(cx + Math.cos(a) * (rr - 1.6), cy + Math.sin(a) * (rr - 1.6));
          }
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    tile = 1;
  } else {
    // encaustic: circles quartered across tiles
    const n = 8;
    const s = S / n;
    gh.fillStyle = '#333';
    gh.fillRect(0, 0, S, S);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const x0 = x * s;
        const y0 = y * s;
        g.fillStyle = '#7a3a24';
        g.fillRect(x0, y0, s, s);
        g.fillStyle = '#c9b48f';
        for (const [cx, cy] of [
          [x0, y0],
          [x0 + s, y0],
          [x0, y0 + s],
          [x0 + s, y0 + s],
        ]) {
          g.beginPath();
          g.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#1e1a18';
        g.beginPath();
        g.moveTo(x0 + s / 2, y0 + s * 0.18);
        g.lineTo(x0 + s * 0.82, y0 + s / 2);
        g.lineTo(x0 + s / 2, y0 + s * 0.82);
        g.lineTo(x0 + s * 0.18, y0 + s / 2);
        g.closePath();
        g.fill();
        g.fillStyle = '#c9b48f';
        g.beginPath();
        g.arc(x0 + s / 2, y0 + s / 2, s * 0.1, 0, Math.PI * 2);
        g.fill();
        gh.fillStyle = '#ccc';
        gh.fillRect(x0 + 1.5, y0 + 1.5, s - 3, s - 3);
      }
    }
    tile = 1.6;
  }
  paint(
    c,
    null,
    (u, v, x, y, px) => {
      const n = F1.sample(u * 2, v * 2);
      const f = F3.sample(u * 8, v * 8);
      const dirt = smoothstep(0.5, 0.85, F2.sample(u * 2, v * 2));
      const k = (0.8 + (n - 0.5) * 0.35 + (f - 0.5) * 0.15) * (1 - dirt * 0.45);
      px[0] *= k;
      px[1] *= k;
      px[2] *= k;
    },
    true
  );
  return { map: finish(c, { tile }), bump: finish(hc, { tile, srgb: false }) };
}

function fieldstone() {
  const S = 512;
  const c = cv(S);
  const hc = cv(S);
  const vo = voronoi(S, 40, 91);
  const tones = vo.pts.map((p) => 70 + p[2] * 45);
  paint(c, hc, (u, v, x, y, px) => {
    const i = y * S + x;
    const e = vo.edge[i];
    const n = F1.sample(u * 2, v * 2);
    const f = F3.sample(u * 8, v * 8);
    if (e < 0.016) {
      const b = 34 + f * 16;
      px[0] = b;
      px[1] = b * 0.95;
      px[2] = b * 0.88;
      px[4] = 20;
    } else {
      const round = Math.min(1, e / 0.05);
      const t = tones[vo.cells[i]] * (0.75 + (n - 0.5) * 0.4 + (f - 0.5) * 0.3) * (0.7 + round * 0.3);
      const damp = smoothstep(0.55, 0.75, F2.sample(u * 2, v * 2));
      px[0] = t * (1 - damp * 0.35);
      px[1] = t * (0.97 - damp * 0.3);
      px[2] = t * (0.9 - damp * 0.3);
      px[4] = 60 + Math.sqrt(round) * 170 + (f - 0.5) * 30;
    }
  });
  return { map: finish(c, { tile: 2.5 }), bump: finish(hc, { tile: 2.5, srgb: false }) };
}

function dirt() {
  const S = 512;
  const c = cv(S);
  const hc = cv(S);
  paint(c, hc, (u, v, x, y, px) => {
    const n = F1.sample(u * 2, v * 2);
    const f = F3.sample(u * 16, v * 16);
    const wet = smoothstep(0.6, 0.72, F2.sample(u * 2, v * 2));
    const b = (58 + (n - 0.5) * 30 + (f - 0.5) * 18) * (1 - wet * 0.45);
    px[0] = b;
    px[1] = b * 0.86;
    px[2] = b * 0.7;
    px[4] = 128 + (f - 0.5) * 60 - wet * 30;
  });
  return { map: finish(c, { tile: 4 }), bump: finish(hc, { tile: 4, srgb: false }) };
}

function marble() {
  const S = 256;
  const c = cv(S);
  paint(c, null, (u, v, x, y, px) => {
    const t = F1.sample(u * 2, v * 2) * 6 + F2.sample(u * 2, v * 2) * 2;
    const vein = Math.pow(Math.abs(Math.sin((u + v) * Math.PI * 4 + t)), 0.25);
    const b = 120 + vein * 90;
    px[0] = b;
    px[1] = b * 0.98;
    px[2] = b * 0.95;
  });
  return { map: finish(c, { tile: 1 }) };
}

function fabric(base, { fold = 0, weave = true } = {}) {
  const S = 256;
  const c = cv(S);
  paint(c, null, (u, v, x, y, px) => {
    const n = F1.sample(u * 2, v * 2);
    const f = F3.sample(u * 8, v * 8);
    const w = weave ? ((x % 3 === 0) !== (y % 3 === 0) ? 0.94 : 1.02) : 1;
    const fo = fold ? 0.72 + 0.28 * Math.pow(0.5 + 0.5 * Math.sin(u * Math.PI * 2 * fold + f * 0.8), 1.5) : 1;
    const stain = smoothstep(0.62, 0.75, F2.sample(u * 2, v * 2));
    const k = (0.85 + (n - 0.5) * 0.3 + (f - 0.5) * 0.1) * w * fo;
    px[0] = (base[0] * (1 - stain * 0.2) + 90 * stain * 0.2) * k;
    px[1] = (base[1] * (1 - stain * 0.25) + 80 * stain * 0.25) * k;
    px[2] = (base[2] * (1 - stain * 0.35) + 50 * stain * 0.35) * k;
  });
  return { map: finish(c, { tile: 1 }) };
}

function upholstery(base) {
  const S = 256;
  const c = cv(S);
  const hc = cv(S);
  paint(c, hc, (u, v, x, y, px) => {
    // diamond tufting
    const a = (u + v) * 4;
    const b = (u - v) * 4;
    const da = Math.abs(a - Math.round(a));
    const db = Math.abs(b - Math.round(b));
    const crease = Math.min(da, db);
    const pillow = smoothstep(0.0, 0.25, crease);
    const n = F1.sample(u * 2, v * 2);
    const f = F3.sample(u * 8, v * 8);
    const k = (0.45 + pillow * 0.6) * (0.85 + (n - 0.5) * 0.3 + (f - 0.5) * 0.15);
    px[0] = base[0] * k;
    px[1] = base[1] * k;
    px[2] = base[2] * k;
    px[4] = 40 + pillow * 200;
    // buttons at crease intersections
    if (da < 0.035 && db < 0.035) {
      px[0] = base[0] * 0.3;
      px[1] = base[1] * 0.3;
      px[2] = base[2] * 0.3;
      px[4] = 60;
    }
  });
  return { map: finish(c, { tile: 0.7 }), bump: finish(hc, { tile: 0.7, srgb: false }) };
}

function wainscot() {
  const W = 256;
  const H = 512;
  const c = cv(W, H);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(58,34,24)';
  g.fillRect(0, 0, W, H);
  // stiles/rails lighter, raised panel inset
  g.fillStyle = 'rgb(44,25,18)';
  g.fillRect(28, 50, W - 56, H - 100);
  g.fillStyle = 'rgb(66,40,28)';
  g.fillRect(44, 70, W - 88, H - 140);
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 3;
  g.strokeRect(28, 50, W - 56, H - 100);
  g.strokeStyle = 'rgba(150,110,80,0.25)';
  g.strokeRect(44, 70, W - 88, H - 140);
  paint(
    c,
    null,
    (u, v, x, y, px) => {
      const grain = F2.sample(u * 1, v * 8);
      const n = F1.sample(u, v);
      const k = 0.8 + (grain - 0.5) * 0.4 + (n - 0.5) * 0.3;
      px[0] *= k;
      px[1] *= k;
      px[2] *= k;
    },
    true
  );
  return { map: finish(c, { tile: 0.6, tileV: 1.2 }) };
}

function doorPanel(color = [52, 30, 22]) {
  const W = 256;
  const H = 512;
  const c = cv(W, H);
  const hc = cv(W, H);
  const g = c.getContext('2d');
  const gh = hc.getContext('2d');
  g.fillStyle = `rgb(${color.join(',')})`;
  g.fillRect(0, 0, W, H);
  gh.fillStyle = '#909090';
  gh.fillRect(0, 0, W, H);
  const panels = [
    [30, 30, 90, 200],
    [136, 30, 90, 200],
    [30, 262, 90, 220],
    [136, 262, 90, 220],
  ];
  for (const [x, y, w, h] of panels) {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(x, y, w, h);
    g.fillStyle = `rgb(${color.map((c2) => c2 * 1.18).join(',')})`;
    g.fillRect(x + 10, y + 10, w - 20, h - 20);
    gh.fillStyle = '#404040';
    gh.fillRect(x, y, w, h);
    gh.fillStyle = '#d0d0d0';
    gh.fillRect(x + 10, y + 10, w - 20, h - 20);
  }
  paint(
    c,
    null,
    (u, v, x, y, px) => {
      const grain = F2.sample(u * 1, v * 8);
      const n = F1.sample(u, v);
      const k = 0.78 + (grain - 0.5) * 0.35 + (n - 0.5) * 0.35;
      px[0] *= k;
      px[1] *= k;
      px[2] *= k;
    },
    true
  );
  return { map: finish(c, { wrap: false }), bump: finish(hc, { wrap: false, srgb: false }) };
}

function rug(seed, pal) {
  const W = 512;
  const H = 768;
  const c = cv(W, H);
  const g = c.getContext('2d');
  const [field, border, light, accent] = pal;
  g.fillStyle = field;
  g.fillRect(0, 0, W, H);
  // borders
  g.fillStyle = border;
  g.fillRect(0, 0, W, 64);
  g.fillRect(0, H - 64, W, 64);
  g.fillRect(0, 0, 64, H);
  g.fillRect(W - 64, 0, 64, H);
  g.fillStyle = light;
  g.fillRect(64, 64, W - 128, 8);
  g.fillRect(64, H - 72, W - 128, 8);
  g.fillRect(64, 64, 8, H - 128);
  g.fillRect(W - 72, 64, 8, H - 128);
  // border diamonds
  g.fillStyle = accent;
  const dia = (x, y, s) => {
    g.beginPath();
    g.moveTo(x, y - s);
    g.lineTo(x + s, y);
    g.lineTo(x, y + s);
    g.lineTo(x - s, y);
    g.closePath();
    g.fill();
  };
  for (let x = 40; x < W; x += 48) {
    dia(x, 32, 14);
    dia(x, H - 32, 14);
  }
  for (let y = 40; y < H; y += 48) {
    dia(32, y, 14);
    dia(W - 32, y, 14);
  }
  // medallion with stepped layers
  const cx = W / 2;
  const cy = H / 2;
  const layers = [
    [170, border],
    [140, light],
    [118, accent],
    [90, field],
    [64, border],
    [34, light],
  ];
  for (const [s, col] of layers) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx, cy - s * 1.35);
    g.lineTo(cx + s, cy);
    g.lineTo(cx, cy + s * 1.35);
    g.lineTo(cx - s, cy);
    g.closePath();
    g.fill();
  }
  // corner spandrels
  g.fillStyle = border;
  for (const [x, y] of [
    [72, 72],
    [W - 72, 72],
    [72, H - 72],
    [W - 72, H - 72],
  ]) {
    g.beginPath();
    g.arc(x, y, 90, 0, Math.PI * 2);
    g.fill();
  }
  // scattered field stars
  g.fillStyle = light;
  const rng = new RNG(seed);
  for (let i = 0; i < 40; i++) {
    const x = rng.float(90, W - 90);
    const y = rng.float(90, H - 90);
    if (Math.abs(x - cx) / 180 + Math.abs(y - cy) / 240 < 1) continue;
    star(g, x, y, 7, 8);
  }
  paint(
    c,
    null,
    (u, v, x, y, px) => {
      const n = F1.sample(u * 2, v * 2);
      const wear = smoothstep(0.55, 0.8, F2.sample(u * 2, v * 2));
      const f = F3.sample(u * 16, v * 16);
      const k = 0.78 + (n - 0.5) * 0.3 + (f - 0.5) * 0.2;
      px[0] = (px[0] * (1 - wear) + 120 * wear) * k;
      px[1] = (px[1] * (1 - wear) + 100 * wear) * k;
      px[2] = (px[2] * (1 - wear) + 80 * wear) * k;
    },
    true
  );
  return { map: finish(c, { wrap: false }) };
}

function bookSpines() {
  const S = 512;
  const c = cv(S);
  const g = c.getContext('2d');
  g.fillStyle = '#0c0907';
  g.fillRect(0, 0, S, S);
  const cols = ['#5a1c18', '#1f3a26', '#2b2440', '#4a3420', '#151515', '#6b5a3a', '#3c1a2c', '#203040', '#5e4b2a'];
  const rng = new RNG(4);
  for (let row = 0; row < 4; row++) {
    let x = 0;
    const y0 = row * 128;
    while (x < S) {
      const w = rng.int(10, 26);
      const h = rng.int(78, 122);
      const col = rng.pick(cols);
      g.fillStyle = col;
      g.fillRect(x, y0 + 128 - h, w - 1, h);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + w - 4, y0 + 128 - h, 3, h);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(x + 1, y0 + 128 - h, 2, h);
      g.fillStyle = 'rgba(190,150,70,0.65)';
      g.fillRect(x + 1, y0 + 128 - h + 8, w - 3, 2);
      g.fillRect(x + 1, y0 + 128 - 10, w - 3, 2);
      if (rng.chance(0.6)) g.fillRect(x + 3, y0 + 128 - h + 22, w - 7, rng.int(6, 16));
      x += w;
    }
  }
  paint(
    c,
    null,
    (u, v, x, y, px) => {
      const k = 0.75 + (F1.sample(u * 2, v * 2) - 0.5) * 0.5;
      px[0] *= k;
      px[1] *= k;
      px[2] *= k;
    },
    true
  );
  const t = finish(c, { tile: 1 });
  return { map: t };
}

function pianoKeys() {
  const W = 1024;
  const H = 64;
  const c = cv(W, H);
  const g = c.getContext('2d');
  const white = 52;
  const kw = W / white;
  g.fillStyle = '#0b0a09';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < white; i++) {
    g.fillStyle = `rgb(${200 - (i % 5) * 4},${188 - (i % 7) * 3},${160})`;
    g.fillRect(i * kw + 1, 0, kw - 2, H);
  }
  const pattern = [1, 1, 0, 1, 1, 1, 0];
  for (let i = 0; i < white - 1; i++) {
    if (pattern[(i + 5) % 7]) {
      g.fillStyle = '#121010';
      g.fillRect(i * kw + kw * 0.68, 0, kw * 0.64, H * 0.62);
    }
  }
  return { map: finish(c, { wrap: false }) };
}

function parchment() {
  const S = 256;
  const c = cv(S);
  paint(c, null, (u, v, x, y, px) => {
    const n = F1.sample(u * 2, v * 2);
    const f = F3.sample(u * 8, v * 8);
    const edge = Math.min(u, v, 1 - u, 1 - v);
    const burn = 1 - smoothstep(0.0, 0.12, edge) * 0.35;
    const k = (0.85 + (n - 0.5) * 0.35 + (f - 0.5) * 0.15) * (1.05 - burn * 0.4);
    px[0] = 196 * k;
    px[1] = 172 * k;
    px[2] = 128 * k;
  });
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(40,28,20,0.55)';
  g.lineWidth = 1.2;
  const rng = new RNG(9);
  for (let y = 36; y < S - 30; y += 14) {
    g.beginPath();
    let x = 26;
    g.moveTo(x, y);
    while (x < S - 30 - rng.float(0, 60)) {
      x += rng.float(4, 9);
      g.lineTo(x, y + rng.float(-2.5, 2.5));
    }
    g.stroke();
  }
  return { map: finish(c, { wrap: false }) };
}

// ----------------------------------------------------------- characters


function cobweb(corner = true) {
  const S = 256;
  const c = cv(S);
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const rng = new RNG(corner ? 5 : 6);
  const ox = corner ? 2 : S / 2;
  const oy = corner ? 2 : S / 2;
  const a0 = corner ? 0.02 : 0;
  const a1 = corner ? Math.PI / 2 - 0.02 : Math.PI * 2;
  const n = corner ? 9 : 14;
  const spokes = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (corner ? n - 1 : n) + rng.float(-0.05, 0.05);
    const len = corner ? rng.float(200, 250) : rng.float(100, 124);
    spokes.push([a, len]);
  }
  g.strokeStyle = 'rgba(235,235,230,0.55)';
  g.lineWidth = 1.1;
  for (const [a, len] of spokes) {
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len);
    g.stroke();
  }
  g.lineWidth = 0.9;
  for (let r = 14; r < (corner ? 240 : 120); r += rng.float(9, 15)) {
    for (let i = 0; i < spokes.length - (corner ? 1 : 0); i++) {
      if (rng.chance(0.1)) continue;
      const [aa, la] = spokes[i];
      const [ab, lb] = spokes[(i + 1) % spokes.length];
      if (r > la || r > lb) continue;
      const x1 = ox + Math.cos(aa) * r;
      const y1 = oy + Math.sin(aa) * r;
      const x2 = ox + Math.cos(ab) * r;
      const y2 = oy + Math.sin(ab) * r;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const sag = 0.82;
      g.beginPath();
      g.moveTo(x1, y1);
      g.quadraticCurveTo(ox + (mx - ox) * sag, oy + (my - oy) * sag, x2, y2);
      g.stroke();
    }
  }
  // dust clumps
  for (let i = 0; i < 18; i++) {
    const [a, len] = rng.pick(spokes);
    const r = rng.float(10, len);
    const x = ox + Math.cos(a) * r;
    const y = oy + Math.sin(a) * r;
    const gr = g.createRadialGradient(x, y, 0, x, y, 6);
    gr.addColorStop(0, 'rgba(220,215,205,0.5)');
    gr.addColorStop(1, 'rgba(220,215,205,0)');
    g.fillStyle = gr;
    g.fillRect(x - 6, y - 6, 12, 12);
  }
  return finish(c, { wrap: false });
}

function flashlightCookie() {
  const S = 256;
  const c = cv(S);
  paint(c, null, (u, v, x, y, px) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    let val = 0;
    if (r < 1) {
      val = smoothstep(1.0, 0.72, r) * (0.62 + 0.38 * smoothstep(0.62, 0.0, r));
      val += 0.32 * Math.exp(-r * r * 22);
      val += 0.05 * Math.sin(r * 46) * smoothstep(0.15, 0.6, r);
      val -= 0.08 * Math.exp(-((r - 0.46) * (r - 0.46)) / 0.0025);
      val *= 0.94 + 0.06 * F3.sample(u * 4, v * 4);
    }
    val = clamp(val, 0, 1) * 255;
    px[0] = val;
    px[1] = val * 0.97;
    px[2] = val * 0.9;
  });
  return finish(c, { wrap: false });
}

function leaf() {
  const S = 64;
  const c = cv(S);
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#2b3f1f';
  g.beginPath();
  g.moveTo(32, 60);
  g.bezierCurveTo(6, 50, 0, 26, 14, 18);
  g.bezierCurveTo(20, 24, 24, 24, 26, 20);
  g.bezierCurveTo(26, 8, 32, 2, 32, 2);
  g.bezierCurveTo(32, 2, 38, 8, 38, 20);
  g.bezierCurveTo(40, 24, 44, 24, 50, 18);
  g.bezierCurveTo(64, 26, 58, 50, 32, 60);
  g.fill();
  g.strokeStyle = 'rgba(120,140,90,0.5)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(32, 58);
  g.lineTo(32, 8);
  g.moveTo(32, 40);
  g.lineTo(16, 24);
  g.moveTo(32, 40);
  g.lineTo(48, 24);
  g.stroke();
  return finish(c, { wrap: false });
}

function footprint() {
  const W = 64;
  const H = 128;
  const c = cv(W, H);
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(20,24,28,0.85)';
  g.beginPath();
  g.ellipse(32, 78, 17, 32, 0.05, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(32, 112, 13, 13, 0, 0, Math.PI * 2);
  g.fill();
  const toes = [
    [22, 36, 6],
    [31, 32, 5.5],
    [39, 33, 5],
    [46, 37, 4.5],
    [51, 43, 4],
  ];
  for (const [x, y, r] of toes) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c, { wrap: false });
}

function handprint() {
  const S = 128;
  const c = cv(S);
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(220,226,232,0.55)';
  g.beginPath();
  g.ellipse(64, 86, 24, 28, 0, 0, Math.PI * 2);
  g.fill();
  const fingers = [
    [38, 52, 0.45, 26],
    [52, 38, 0.12, 32],
    [66, 34, 0, 34],
    [80, 38, -0.12, 31],
    [92, 58, -0.5, 24],
  ];
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(220,226,232,0.55)';
  for (const [x, y, a, l] of fingers) {
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(x + Math.sin(a) * l * 0.2, y + 22);
    g.lineTo(x - Math.sin(a) * l * 0.6, y - l * 0.55);
    g.stroke();
  }
  return finish(c, { wrap: false });
}

function scrawl(text, { w = 1024, h = 256, color = 'rgba(18,16,16,0.92)', size = 120 } = {}) {
  const c = cv(w, h);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const rng = new RNG(text.length * 13);
  g.font = `${size}px ${DISPLAY_FONT}`;
  const total = g.measureText(text).width;
  let x = w / 2 - total / 2;
  for (const ch of text) {
    const cw = g.measureText(ch).width;
    for (let k = 0; k < 3; k++) {
      g.save();
      g.translate(x + cw / 2 + rng.float(-2, 2), h / 2 + rng.float(-6, 6));
      g.rotate(rng.float(-0.12, 0.12));
      g.globalAlpha = 0.45;
      g.fillText(ch, 0, 0);
      g.restore();
    }
    x += cw;
  }
  return finish(c, { wrap: false });
}

function clockFace() {
  const S = 256;
  const c = cv(S);
  const g = c.getContext('2d');
  g.fillStyle = '#1a1410';
  g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 120);
  gr.addColorStop(0, '#d8ccb0');
  gr.addColorStop(1, '#8a7c62');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(128, 128, 118, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1b1612';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 22px ${DISPLAY_FONT}`;
  const nums = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  nums.forEach((n, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(n, 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
  });
  g.strokeStyle = '#1b1612';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    g.lineWidth = i % 5 ? 1 : 2.5;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110);
    g.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116);
    g.stroke();
  }
  return finish(c, { wrap: false });
}

function ouija() {
  const W = 512;
  const H = 340;
  const c = cv(W, H);
  const g = c.getContext('2d');
  paint(c, null, (u, v, x, y, px) => {
    const grain = F2.sample(u * 2, v * 8);
    const k = 0.8 + (grain - 0.5) * 0.4;
    const e = Math.min(u, v, 1 - u, 1 - v);
    const dark = 1 - smoothstep(0, 0.08, e) * 0.4;
    px[0] = 168 * k * (1.2 - dark * 0.5);
    px[1] = 128 * k * (1.2 - dark * 0.5);
    px[2] = 82 * k * (1.2 - dark * 0.5);
  });
  g.fillStyle = '#2a1a10';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `34px ${DISPLAY_FONT}`;
  const arc = (letters, r, cy) => {
    const n = letters.length;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (Math.PI * (i + 0.5)) / n;
      g.save();
      g.translate(256 + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55);
      g.rotate(a + Math.PI / 2);
      g.fillText(letters[i], 0, 0);
      g.restore();
    }
  };
  arc('ABCDEFGHIJKLM', 210, 220);
  arc('NOPQRSTUVWXYZ', 170, 260);
  g.font = `28px ${DISPLAY_FONT}`;
  g.fillText('1 2 3 4 5 6 7 8 9 0', 256, 268);
  g.fillText('GOOD BYE', 256, 312);
  g.font = `30px ${DISPLAY_FONT}`;
  g.fillText('YES', 70, 40);
  g.fillText('NO', 446, 40);
  g.beginPath();
  g.arc(130, 44, 14, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(386, 44, 14, 0.6, Math.PI * 1.75);
  g.arc(392, 40, 11, Math.PI * 1.7, 0.65, true);
  g.fill();
  return finish(c, { wrap: false });
}

// A 4x4 atlas of headstone faces with names and dates.
function tombAtlas(entries) {
  const S = 1024;
  const cell = 256;
  const c = cv(S);
  const g = c.getContext('2d');
  paint(c, null, (u, v, x, y, px) => {
    const n = F1.sample(u * 4, v * 4);
    const f = F3.sample(u * 16, v * 16);
    const lich = F2.sample(u * 4 + 0.3, v * 4);
    const tone = 112 + ((Math.floor(u * 4) * 7 + Math.floor(v * 4) * 3) % 5) * 7;
    let b = tone * (0.78 + (n - 0.5) * 0.4 + (f - 0.5) * 0.25);
    px[0] = b;
    px[1] = b * 0.98;
    px[2] = b * 0.93;
    if (lich > 0.7) {
      px[0] = px[0] * 0.6 + 120 * 0.4;
      px[1] = px[1] * 0.6 + 118 * 0.4;
      px[2] = px[2] * 0.6 + 60 * 0.4;
    } else if (lich < 0.22) {
      px[0] *= 0.6;
      px[1] *= 0.66;
      px[2] *= 0.55;
    }
  });
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  entries.forEach((lines, i) => {
    const cx = (i % 4) * cell + cell / 2;
    const cy = Math.floor(i / 4) * cell;
    let y = cy + 70;
    lines.forEach((line, li) => {
      const size = li === 0 ? 24 : li === 1 ? 18 : 16;
      g.font = `${li === 0 ? '' : 'italic '}${size}px ${li === 0 ? DISPLAY_FONT : BODY_FONT}`;
      g.fillStyle = 'rgba(220,214,200,0.35)';
      g.fillText(line, cx + 1, y + 1.2);
      g.fillStyle = 'rgba(28,26,24,0.88)';
      g.fillText(line, cx, y);
      y += size + 12;
    });
  });
  return finish(c, { wrap: false });
}

function snakeSkin() {
  const W = 128;
  const H = 512;
  const c = cv(W, H);
  paint(c, null, (u, v, x, y, px) => {
    // u around the body (0.25 = back, 0.75 = belly), v along
    const back = Math.cos((u - 0.25) * Math.PI * 2);
    const belly = smoothstep(-0.3, -0.75, back);
    const dv = (v * 24) % 1;
    const diamond = Math.abs(dv - 0.5) * 2 + Math.abs(back) * 0.0 + Math.abs(((u + 0.75) % 0.5) - 0.25) * 2.4;
    const blotch = smoothstep(0.75, 0.62, diamond) * smoothstep(0.1, 0.6, back);
    const edge = smoothstep(0.85, 0.76, diamond) - blotch;
    const scale = 0.85 + 0.15 * Math.sin(x * 1.6) * Math.sin(y * 0.8);
    let r = 70;
    let g = 72;
    let b = 40;
    r = r * (1 - blotch) + 40 * blotch;
    g = g * (1 - blotch) + 30 * blotch;
    b = b * (1 - blotch) + 18 * blotch;
    r *= 1 - edge * 0.7;
    g *= 1 - edge * 0.7;
    b *= 1 - edge * 0.7;
    r = r * (1 - belly) + 150 * belly;
    g = g * (1 - belly) + 140 * belly;
    b = b * (1 - belly) + 100 * belly;
    px[0] = r * scale;
    px[1] = g * scale;
    px[2] = b * scale;
  });
  const t = finish(c, { wrap: true });
  t.repeat.set(1, 1);
  return t;
}

function noteTex() {
  const S = 128;
  const c = cv(S);
  paint(c, null, (u, v, x, y, px) => {
    const n = F1.sample(u * 2, v * 2);
    const k = 0.85 + (n - 0.5) * 0.3;
    px[0] = 205 * k;
    px[1] = 190 * k;
    px[2] = 150 * k;
  });
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(30,24,40,0.7)';
  g.lineWidth = 1;
  const rng = new RNG(31);
  for (let y = 18; y < S - 12; y += 9) {
    g.beginPath();
    let x = 12;
    g.moveTo(x, y);
    const end = S - 14 - rng.float(0, 40);
    while (x < end) {
      x += rng.float(2, 5);
      g.lineTo(x, y + rng.float(-1.6, 1.6));
    }
    g.stroke();
  }
  return finish(c, { wrap: false });
}

// --------------------------------------------------------------- entry

export async function buildTextures(renderer, onProgress = () => {}) {
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`24px ${DISPLAY_FONT}`), document.fonts.load(`italic 18px ${BODY_FONT}`)]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (e) {
    /* fall back to serif fonts */
  }
  F1 = new NoiseField(256, 4, 5, 11);
  F2 = new NoiseField(256, 8, 4, 23);
  F3 = new NoiseField(128, 16, 2, 37);
  const T = {};
  const steps = [
    () => (T.siding = siding()),
    () => (T.trim = trim()),
    () => (T.shingle = shingles('fish')),
    () => (T.shingleRect = shingles('rect')),
    () => (T.stone = stoneBlocks()),
    () => (T.flag = flagstone()),
    () => (T.concrete = concrete()),
    () => (T.ground = groundTex()),
    () => (T.asphalt = asphalt()),
    () => (T.bark = bark()),
    () => (T.hedge = hedge()),
    () => (T.rust = rust()),
    () => (T.brick = brick()),
    () => {
      T.wp = {};
      for (const k of Object.keys(WALLPAPER)) T.wp[k] = wallpaper(k);
    },
    () => {
      T.floor = {};
      for (const k of Object.keys(WOODS)) T.floor[k] = floorboards(k);
    },
    () => {
      T.woodDark = furnitureWood(true);
      T.woodLight = furnitureWood(false);
      T.plaster = plaster();
      T.marble = marble();
    },
    () => {
      T.tileChecker = tiles('checker');
      T.tileHex = tiles('hex');
      T.tileFoyer = tiles('encaustic');
    },
    () => {
      T.fieldstone = fieldstone();
      T.dirt = dirt();
    },
    () => {
      T.sheet = fabric([196, 190, 176]);
      T.velvet = fabric([92, 16, 22], { fold: 9, weave: false });
      T.velvetGreen = fabric([24, 50, 34], { fold: 9, weave: false });
      T.linen = fabric([170, 160, 140]);
      T.uphRed = upholstery([110, 26, 30]);
      T.uphGreen = upholstery([34, 62, 44]);
      T.wainscot = wainscot();
      T.door = doorPanel();
      T.doorRed = doorPanel([120, 18, 16]);
    },
    () => {
      T.rugs = [
        rug(1, ['#6b1c1c', '#1c2240', '#b8a07a', '#3b5a6a']),
        rug(2, ['#1d2a3a', '#5a1a1a', '#b39a72', '#6a5a2a']),
        rug(3, ['#4a2a1a', '#1a1a1a', '#a08a62', '#7a2a1a']),
      ];
      T.books = bookSpines();
      T.keys = pianoKeys();
      T.parchment = parchment();
      T.note = noteTex();
    },
    () => {
      T.portraits = buildPortraits(renderer);
    },
    () => {
      T.webCorner = cobweb(true);
      T.webRound = cobweb(false);
      T.cookie = flashlightCookie();
      T.leaf = leaf();
      T.footprint = footprint();
      T.handprint = handprint();
      T.clock = clockFace();
      T.ouija = ouija();
      T.snake = snakeSkin();
      T.writingHall = scrawl('WELCOME HOME');
      T.writingMirror = scrawl('SHE IS STILL WAITING', { color: 'rgba(225,232,238,0.9)', size: 92 });
    },
  ];
  for (let i = 0; i < steps.length; i++) {
    steps[i]();
    onProgress((i + 1) / steps.length);
    await nextFrame();
  }
  T.makeTomb = tombAtlas;
  return T;
}
