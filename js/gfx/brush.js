// Small canvas-painting toolkit shared by the portraits and the ghost faces:
// seeded randomness, soft (blurred) shapes, brush strokes, and the surface
// effects of old oil paint (canvas weave, grain, craquelure, varnish).

export function seeded(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  return r;
}

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Fill a path softly: the shape is drawn far off the canvas and only its
// blurred shadow lands on it. Works in every browser (no ctx.filter).
const OFF = 4000;
export function soft(g, color, blur, path) {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.shadowOffsetX = OFF;
  g.shadowOffsetY = 0;
  g.translate(-OFF, 0);
  g.fillStyle = '#000';
  g.beginPath();
  path(g);
  g.fill();
  g.restore();
}

export function softEllipse(g, x, y, rx, ry, color, blur, rot = 0) {
  soft(g, color, blur, (q) => q.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2));
}

// A soft stroke along a polyline or bezier path.
export function softStroke(g, color, blur, width, path) {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.shadowOffsetX = OFF;
  g.translate(-OFF, 0);
  g.strokeStyle = '#000';
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  path(g);
  g.stroke();
  g.restore();
}

export function stroke(g, color, width, path) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  path(g);
  g.stroke();
}

export function fill(g, style, path) {
  g.fillStyle = style;
  g.beginPath();
  path(g);
  g.fill();
}

// Draw inside a clipping path.
export function clipped(g, path, draw) {
  g.save();
  g.beginPath();
  path(g);
  g.clip();
  draw();
  g.restore();
}

// Smooth closed curve through points (Catmull-Rom converted to beziers).
export function smoothPath(q, pts, closed = true) {
  const n = pts.length;
  const at = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  q.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    q.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) q.closePath();
}

// Many thin strokes following a flow: hair, fur, fabric grain.
// path(t, k) returns [x0,y0, cx,cy, x1,y1] for strand k of n (t random).
export function strands(g, n, rng, color, width, alpha, path) {
  g.save();
  g.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const p = path(rng, k, n);
    if (!p) continue;
    g.strokeStyle = typeof color === 'function' ? color(rng, k) : color;
    g.globalAlpha = alpha * (0.5 + rng() * 0.5);
    g.lineWidth = width * (0.6 + rng() * 0.8);
    g.beginPath();
    g.moveTo(p[0], p[1]);
    if (p.length === 8) g.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
    else g.quadraticCurveTo(p[2], p[3], p[4], p[5]);
    g.stroke();
  }
  g.restore();
}

// ---------------------------------------------------------------- surfaces

let NOISE = null;
function noiseTile() {
  if (NOISE) return NOISE;
  const S = 128;
  const c = canvas(S);
  const g = c.getContext('2d');
  const id = g.createImageData(S, S);
  const rng = seeded(4242);
  // value noise at two scales, tiled
  const grid = (n) => {
    const v = [];
    for (let i = 0; i < n * n; i++) v.push(rng());
    return (x, y) => {
      const fx = (x / S) * n;
      const fy = (y / S) * n;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = v[(y0 % n) * n + (x0 % n)];
      const b = v[(y0 % n) * n + ((x0 + 1) % n)];
      const c2 = v[((y0 + 1) % n) * n + (x0 % n)];
      const d = v[((y0 + 1) % n) * n + ((x0 + 1) % n)];
      return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy;
    };
  };
  const n1 = grid(8);
  const n2 = grid(32);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = n1(x, y) * 0.55 + n2(x, y) * 0.3 + rng() * 0.15;
      const i = (y * S + x) * 4;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v * 255;
      id.data[i + 3] = 255;
    }
  }
  g.putImageData(id, 0, 0);
  NOISE = c;
  return c;
}

let WEAVE = null;
function weaveTile() {
  if (WEAVE) return WEAVE;
  const c = canvas(4);
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 4, 4);
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 2, 1);
  g.fillRect(2, 2, 2, 1);
  g.fillRect(0, 1, 1, 1);
  g.fillRect(2, 3, 1, 1);
  g.fillStyle = '#666';
  g.fillRect(2, 0, 1, 2);
  g.fillRect(0, 2, 1, 2);
  WEAVE = c;
  return c;
}

// Mottled paint texture over a region (overlay keeps colour, adds variation).
export function grain(g, x, y, w, h, alpha = 0.18, scale = 1) {
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = alpha;
  const p = g.createPattern(noiseTile(), 'repeat');
  if (scale !== 1 && p.setTransform) p.setTransform(new DOMMatrix().scale(scale));
  g.fillStyle = p;
  g.fillRect(x, y, w, h);
  g.restore();
}

// The full "old oil painting" finish: weave, grain, craquelure, yellowed
// varnish and a darkened edge.
export function agePainting(g, W, H, rng, o = {}) {
  g.save();
  // canvas weave
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = o.weave ?? 0.16;
  g.fillStyle = g.createPattern(weaveTile(), 'repeat');
  g.fillRect(0, 0, W, H);
  g.restore();
  grain(g, 0, 0, W, H, o.grain ?? 0.1, 1.5);
  grain(g, 0, 0, W, H, 0.06, 0.6);
  // craquelure: a loose net of fine cracks with a lit lip on one side
  const cracks = o.cracks ?? 45;
  for (let k = 0; k < cracks; k++) {
    let x = rng() * W;
    let y = rng() * H;
    let a = rng() * Math.PI * 2;
    const segs = 3 + Math.floor(rng() * 7);
    const pts = [[x, y]];
    for (let i = 0; i < segs; i++) {
      a += (rng() - 0.5) * 1.3;
      const len = 4 + rng() * 7;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      pts.push([x, y]);
      if (rng() < 0.12) {
        // a short branch
        const b = a + (rng() < 0.5 ? 1 : -1) * (0.8 + rng() * 0.8);
        pts.push([x + Math.cos(b) * len, y + Math.sin(b) * len], [x, y]);
      }
    }
    const draw = (q, dx, dy) => {
      q.moveTo(pts[0][0] + dx, pts[0][1] + dy);
      for (const p of pts) q.lineTo(p[0] + dx, p[1] + dy);
    };
    stroke(g, 'rgba(255,240,210,0.05)', 0.8, (q) => draw(q, -0.7, -0.7));
    stroke(g, `rgba(18,10,4,${0.08 + rng() * 0.1})`, 0.6 + rng() * 0.4, (q) => draw(q, 0, 0));
  }
  // yellowed varnish
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = o.varnish ?? 'rgb(236,214,170)';
  g.fillRect(0, 0, W, H);
  // darkened, dirtier edges
  const vg = g.createRadialGradient(W / 2, H * 0.44, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgb(255,255,255)');
  vg.addColorStop(1, o.edge ?? 'rgb(120,100,80)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  g.restore();
  // faint grime streaks
  g.save();
  g.globalAlpha = 0.05;
  for (let k = 0; k < 14; k++) {
    const x = rng() * W;
    stroke(g, 'rgb(40,30,15)', 1 + rng() * 3, (q) => {
      q.moveTo(x, rng() * H * 0.3);
      q.lineTo(x + (rng() - 0.5) * 8, H * (0.6 + rng() * 0.4));
    });
  }
  g.restore();
}
