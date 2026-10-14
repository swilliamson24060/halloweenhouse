import * as THREE from 'three';
import { seeded, canvas, rgba, mix, shade, soft, softEllipse, softStroke, stroke, fill, clipped, smoothPath, strands, grain, agePainting } from './brush.js';
import { SKIN, paintFace, paintNeck, paintEars, headWidth, faceOutline } from './face.js';

// The family portraits of Ravenmoor House, each painted once at load time.
// Every sitter is a person from the house's story; the same people walk the
// halls as apparitions.

const W = 512;
const H = 672;
const FONT = '"IM Fell English SC", "IM Fell English", Georgia, serif';

const HAIR = {
  black: [28, 22, 20],
  darkBrown: [52, 36, 26],
  brown: [92, 62, 40],
  chestnut: [120, 70, 42],
  blonde: [196, 160, 104],
  grey: [150, 144, 138],
  white: [214, 210, 202],
};

// ------------------------------------------------------------ backgrounds

function background(g, bg, rng) {
  const base = bg.color || [52, 40, 30];
  const gr = g.createRadialGradient(W * 0.36, H * 0.3, 20, W * 0.5, H * 0.5, W * 0.95);
  gr.addColorStop(0, rgba(mix(base, [255, 230, 190], 0.18), 1));
  gr.addColorStop(0.55, rgba(base, 1));
  gr.addColorStop(1, rgba(shade(base, 0.35), 1));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // loose brushwork in the ground
  for (let i = 0; i < 90; i++) {
    const x = rng() * W;
    const y = rng() * H;
    softStroke(g, rgba(shade(base, 0.6 + rng() * 0.8), 0.12), 6, 8 + rng() * 18, (q) => {
      q.moveTo(x, y);
      q.quadraticCurveTo(x + (rng() - 0.5) * 60, y + (rng() - 0.5) * 30, x + (rng() - 0.5) * 90, y + (rng() - 0.5) * 50);
    });
  }
  if (bg.drape) drape(g, bg.drape, rng);
  if (bg.window) windowView(g, bg.window, rng);
  if (bg.garden) gardenView(g, bg.garden, rng);
  if (bg.column) column(g, bg.column, rng);
  if (bg.globe) globe(g, bg.globe, rng);
  // light behind the sitter's lit side
  softEllipse(g, W * 0.32, H * 0.34, W * 0.3, H * 0.28, rgba(mix(base, [255, 225, 180], 0.35), 0.35), 90);
}

function drape(g, d, rng) {
  const x0 = d.side === 'left' ? 0 : W * (1 - d.width);
  const w = W * d.width;
  const c = d.color;
  const gr = g.createLinearGradient(x0, 0, x0 + w, 0);
  gr.addColorStop(0, rgba(shade(c, 0.5), 1));
  gr.addColorStop(0.5, rgba(c, 1));
  gr.addColorStop(1, rgba(shade(c, 0.45), 1));
  fill(g, gr, (q) => {
    if (d.side === 'left') {
      q.moveTo(0, 0);
      q.lineTo(w, 0);
      q.bezierCurveTo(w * 0.7, H * 0.35, w * 0.4, H * 0.45, w * 0.55, H);
      q.lineTo(0, H);
    } else {
      q.moveTo(W, 0);
      q.lineTo(x0, 0);
      q.bezierCurveTo(x0 + w * 0.3, H * 0.35, x0 + w * 0.6, H * 0.45, x0 + w * 0.45, H);
      q.lineTo(W, H);
    }
    q.closePath();
  });
  // folds: alternating light and shadow troughs
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + w * t;
    const lit = i % 2 === 0;
    softStroke(g, rgba(lit ? mix(c, [255, 230, 200], 0.25) : shade(c, 0.35), lit ? 0.35 : 0.55), 10, w / n * 0.5, (q) => {
      q.moveTo(x + (rng() - 0.5) * 6, -10);
      q.bezierCurveTo(x + (rng() - 0.5) * 14, H * 0.3, x + (d.side === 'left' ? -1 : 1) * w * 0.15 * t, H * 0.55, x + (d.side === 'left' ? -1 : 1) * w * 0.05, H + 10);
    });
  }
  // gold tassel cord
  const tx = d.side === 'left' ? w * 0.62 : x0 + w * 0.38;
  softStroke(g, 'rgba(190,150,70,0.7)', 2, 4, (q) => {
    q.moveTo(tx - 20, H * 0.5);
    q.quadraticCurveTo(tx, H * 0.56, tx + 20, H * 0.5);
  });
  softEllipse(g, tx, H * 0.6, 7, 16, 'rgba(180,140,60,0.75)', 3);
}

function windowView(g, w, rng) {
  const { x, y, wd, ht } = w;
  // frame shadow and reveal
  fill(g, 'rgb(28,22,18)', (q) => q.rect(x - 10, y - 10, wd + 20, ht + 20));
  clipped(g, (q) => q.rect(x, y, wd, ht), () => {
    const sky = g.createLinearGradient(0, y, 0, y + ht);
    sky.addColorStop(0, rgba(w.sky || [34, 44, 62], 1));
    sky.addColorStop(0.6, rgba(mix(w.sky || [34, 44, 62], [150, 150, 140], 0.25), 1));
    sky.addColorStop(1, rgba(shade(w.sky || [34, 44, 62], 0.6), 1));
    g.fillStyle = sky;
    g.fillRect(x, y, wd, ht);
    // clouds
    for (let i = 0; i < 9; i++) softEllipse(g, x + rng() * wd, y + rng() * ht * 0.5, 30 + rng() * 40, 8 + rng() * 10, `rgba(${w.storm ? '60,64,70' : '150,150,150'},${0.25 + rng() * 0.2})`, 14);
    if (w.moon) {
      softEllipse(g, x + wd * 0.7, y + ht * 0.2, 26, 26, 'rgba(230,226,200,0.25)', 30);
      fill(g, 'rgba(236,232,210,0.9)', (q) => q.arc(x + wd * 0.7, y + ht * 0.2, 9, 0, Math.PI * 2));
    }
    const hy = y + ht * (w.horizon ?? 0.62);
    if (w.sea) {
      const sea = g.createLinearGradient(0, hy, 0, y + ht);
      sea.addColorStop(0, rgba(w.storm ? [40, 50, 58] : [44, 56, 70], 1));
      sea.addColorStop(1, 'rgb(12,16,22)');
      g.fillStyle = sea;
      g.fillRect(x, hy, wd, ht);
      for (let i = 0; i < 40; i++) {
        const yy = hy + Math.pow(rng(), 1.5) * (y + ht - hy);
        const xx = x + rng() * wd;
        stroke(g, `rgba(200,210,215,${0.08 + rng() * (w.storm ? 0.3 : 0.15)})`, 1, (q) => {
          q.moveTo(xx, yy);
          q.lineTo(xx + 6 + rng() * 16, yy - rng() * 2);
        });
      }
      if (w.ship) {
        // a barque heeling under shortened sail
        const sx = x + wd * 0.35;
        const sy = hy + 4;
        fill(g, 'rgba(20,18,16,0.9)', (q) => {
          q.moveTo(sx - 22, sy);
          q.lineTo(sx + 26, sy - 2);
          q.lineTo(sx + 20, sy + 6);
          q.lineTo(sx - 18, sy + 6);
          q.closePath();
        });
        for (const [mx, mh] of [
          [-10, 40],
          [4, 48],
          [16, 36],
        ]) {
          stroke(g, 'rgba(20,18,16,0.9)', 1.2, (q) => {
            q.moveTo(sx + mx, sy);
            q.lineTo(sx + mx + 4, sy - mh);
          });
          for (let k = 0; k < 3; k++) fill(g, 'rgba(190,186,170,0.55)', (q) => q.rect(sx + mx - 7 + k * 1.3, sy - mh + 6 + k * 11, 14 - k * 2, 8));
        }
      }
      if (w.lighthouse) {
        fill(g, 'rgba(20,20,22,1)', (q) => q.rect(x + wd * 0.85, hy - 26, 5, 26));
        softEllipse(g, x + wd * 0.85 + 2, hy - 26, 5, 5, 'rgba(255,230,160,0.9)', 6);
        soft(g, 'rgba(255,230,160,0.12)', 10, (q) => {
          q.moveTo(x + wd * 0.85 + 2, hy - 26);
          q.lineTo(x, hy - 50);
          q.lineTo(x, hy - 30);
          q.closePath();
        });
      }
    }
  });
  // glazing bars
  stroke(g, 'rgb(36,28,22)', 5, (q) => {
    q.moveTo(x + wd / 2, y);
    q.lineTo(x + wd / 2, y + ht);
    q.moveTo(x, y + ht * 0.45);
    q.lineTo(x + wd, y + ht * 0.45);
  });
  stroke(g, 'rgba(200,180,150,0.25)', 1, (q) => q.rect(x + 1, y + 1, wd - 2, ht - 2));
}

function gardenView(g, gd, rng) {
  const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
  sky.addColorStop(0, rgba(gd.sky, 1));
  sky.addColorStop(1, rgba(mix(gd.sky, [240, 210, 170], 0.45), 1));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H * 0.7);
  // distant trees and a church spire
  for (let i = 0; i < 14; i++) {
    const x = rng() * W;
    softEllipse(g, x, H * (0.5 + rng() * 0.08), 40 + rng() * 50, 50 + rng() * 40, rgba(shade(gd.trees, 0.8 + rng() * 0.4), 0.85), 16);
  }
  if (gd.spire) {
    fill(g, rgba(shade(gd.trees, 0.7), 0.9), (q) => {
      q.moveTo(gd.spire, H * 0.24);
      q.lineTo(gd.spire + 9, H * 0.42);
      q.lineTo(gd.spire - 9, H * 0.42);
      q.closePath();
      q.rect(gd.spire - 12, H * 0.42, 24, 60);
    });
  }
  // nearer foliage and a stone balustrade
  for (let i = 0; i < 26; i++) softEllipse(g, rng() * W, H * (0.62 + rng() * 0.2), 30 + rng() * 40, 24 + rng() * 30, rgba(shade(gd.trees, 0.45 + rng() * 0.3), 0.9), 10);
  if (gd.roses) for (let i = 0; i < 22; i++) softEllipse(g, rng() * W, H * (0.6 + rng() * 0.2), 4, 4, rgba(gd.roses, 0.8), 3);
  const by = H * 0.7;
  fill(g, rgba([150, 140, 120], 1), (q) => q.rect(0, by, W, 18));
  for (let x = 8; x < W; x += 30) fill(g, rgba([120, 110, 95], 1), (q) => q.ellipse(x, by + 40, 8, 24, 0, 0, Math.PI * 2));
  fill(g, rgba([60, 55, 45], 1), (q) => q.rect(0, by + 60, W, H));
}

function column(g, c, rng) {
  const x = c.x;
  const gr = g.createLinearGradient(x - 40, 0, x + 40, 0);
  gr.addColorStop(0, rgba(shade(c.color, 0.5), 1));
  gr.addColorStop(0.35, rgba(mix(c.color, [255, 240, 220], 0.2), 1));
  gr.addColorStop(1, rgba(shade(c.color, 0.4), 1));
  fill(g, gr, (q) => q.rect(x - 40, 0, 80, H));
  for (let i = -3; i <= 3; i++) stroke(g, rgba(shade(c.color, 0.55), 0.35), 2, (q) => {
    q.moveTo(x + i * 11, 0);
    q.lineTo(x + i * 11, H);
  });
  fill(g, rgba(shade(c.color, 0.7), 1), (q) => q.rect(x - 50, H * 0.62, 100, 22));
  grain(g, x - 50, 0, 100, H, 0.2);
}

function globe(g, gl, rng) {
  const { x, y, r } = gl;
  fill(g, 'rgb(40,28,16)', (q) => q.rect(x - 4, y + r, 8, H - y - r));
  const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, 'rgb(196,170,120)');
  gr.addColorStop(1, 'rgb(70,52,30)');
  fill(g, gr, (q) => q.arc(x, y, r, 0, Math.PI * 2));
  clipped(g, (q) => q.arc(x, y, r, 0, Math.PI * 2), () => {
    for (let i = 0; i < 6; i++) softEllipse(g, x + (rng() - 0.5) * r * 1.6, y + (rng() - 0.5) * r * 1.4, r * (0.2 + rng() * 0.3), r * (0.15 + rng() * 0.25), 'rgba(90,110,70,0.5)', 6);
    for (let i = -3; i <= 3; i++) stroke(g, 'rgba(60,40,20,0.35)', 1, (q) => q.ellipse(x, y, Math.abs(i) < 0.1 ? 0.1 : r * Math.abs(Math.sin(i * 0.4)), r, 0, 0, Math.PI * 2));
  });
  stroke(g, 'rgb(150,116,60)', 4, (q) => q.arc(x, y, r + 5, Math.PI * 0.7, Math.PI * 2.3));
}

// ------------------------------------------------------------------- hair

function hairStrands(g, rng, n, col, w, a, fn) {
  strands(g, n, rng, (r) => rgba(shade(col, 0.6 + r() * 0.9), 1), w, a, fn);
}

function hairBack(g, h, f, hair, rng) {
  const s = h.s;
  const R = headWidth(h, f);
  const col = hair.color;
  if (hair.style === 'bald') {
    softEllipse(g, R * 0.1, s * 0.05, R * 1.05, s * 0.16, rgba(shade(col, 0.6), 0.9), 8);
    return;
  }
  if (hair.style === 'loose') {
    // long hair falling behind the shoulders
    fill(g, rgba(shade(col, 0.55), 1), (q) => {
      q.moveTo(-R * 1.15, -s * 0.2);
      q.bezierCurveTo(-R * 1.6, s * 0.6, -R * 1.9, s * 1.3, -R * 1.5, s * 2.2);
      q.lineTo(R * 1.6, s * 2.2);
      q.bezierCurveTo(R * 1.95, s * 1.3, R * 1.6, s * 0.6, R * 1.15, -s * 0.2);
      q.closePath();
    });
    return;
  }
  // the mass of the head of hair behind the face
  fill(g, rgba(shade(col, 0.5), 1), (q) => q.ellipse(R * 0.05, -s * 0.12, R * 1.18, s * 0.47, 0, 0, Math.PI * 2));
  if (hair.style === 'bun') softEllipse(g, R * 0.75, s * 0.25, R * 0.5, s * 0.2, rgba(shade(col, 0.45), 1), 6);
  if (hair.style === 'ringlets') {
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const x = sd * R * (1.05 + k * 0.08);
        ringlet(g, x, s * (0.0 + k * 0.05), s * (0.75 - k * 0.08), R * 0.13, col, rng);
      }
    }
  }
}

function ringlet(g, x, y, len, r, col, rng) {
  const turns = Math.round(len / (r * 1.3));
  for (let i = 0; i < turns; i++) {
    const yy = y + (i / turns) * len;
    const sw = Math.sin(i * 0.9) * r * 0.25;
    const gr = g.createLinearGradient(x - r, 0, x + r, 0);
    gr.addColorStop(0, rgba(mix(col, [255, 240, 210], 0.25), 1));
    gr.addColorStop(0.5, rgba(col, 1));
    gr.addColorStop(1, rgba(shade(col, 0.45), 1));
    fill(g, gr, (q) => q.ellipse(x + sw, yy, r * (1 - i / turns * 0.3), r * 0.75, 0.25, 0, Math.PI * 2));
    stroke(g, rgba(shade(col, 0.4), 0.6), 1, (q) => q.ellipse(x + sw, yy + r * 0.25, r * 0.8, r * 0.35, 0.25, 0, Math.PI));
  }
}

function hairFront(g, h, f, hair, rng) {
  const s = h.s;
  const R = headWidth(h, f);
  const col = hair.color;
  const t = h.turn || 0;
  const part = hair.part ?? 0; // -1..1 position of the parting
  const px = part * R * 0.4 - t * R * 0.4;
  if (hair.style === 'bald') {
    // a shining dome with a fringe of hair round the sides
    softEllipse(g, -R * 0.2, -s * 0.36, R * 0.5, s * 0.08, 'rgba(255,245,230,0.35)', 18);
    for (const sd of [-1, 1]) {
      fill(g, rgba(col, 1), (q) => {
        q.moveTo(sd * R * 0.98, -s * 0.24);
        q.bezierCurveTo(sd * R * 1.25, -s * 0.15, sd * R * 1.22, s * 0.05, sd * R * 1.02, s * 0.1);
        q.bezierCurveTo(sd * R * 1.08, -s * 0.02, sd * R * 1.02, -s * 0.12, sd * R * 0.9, -s * 0.18);
        q.closePath();
      });
      hairStrands(g, rng, 60, col, 1.2, 0.6, (r) => {
        const y = -s * (0.22 - r() * 0.3);
        return [sd * R * 0.95, y, sd * R * 1.25, y + s * 0.05, sd * R * (1.0 + r() * 0.18), y + s * 0.12];
      });
    }
    hairStrands(g, rng, 8, col, 0.8, 0.5, (r) => [-R * 0.9, -s * (0.3 + r() * 0.1), 0, -s * (0.5 + r() * 0.05), R * 0.8, -s * (0.32 + r() * 0.1)]);
    return;
  }
  if (hair.style === 'short') {
    fill(g, rgba(col, 1), (q) => {
      q.moveTo(-R * 1.02, -s * 0.05);
      q.bezierCurveTo(-R * 1.2, -s * 0.78, R * 1.2, -s * 0.84, R * 1.03, -s * 0.05);
      q.bezierCurveTo(R * 0.95, -s * 0.2, R * 0.6, -s * 0.33, px, -s * 0.36);
      q.bezierCurveTo(-R * 0.5, -s * 0.36, -R * 0.9, -s * 0.24, -R * 1.02, -s * 0.05);
    });
    // sweep away from the parting, sideburns
    hairStrands(g, rng, 140, col, 1.3, 0.55, (r) => {
      const sd = r() < 0.6 ? 1 : -1;
      const x0 = px + (r() - 0.5) * 8;
      const y0 = -s * (0.5 + r() * 0.04);
      return [x0, y0, x0 + sd * R * 0.6, y0 - s * 0.02, x0 + sd * R * (0.7 + r() * 0.4), -s * (0.3 - r() * 0.1)];
    });
    softEllipse(g, -R * 0.4, -s * 0.45, R * 0.4, s * 0.05, rgba(mix(col, [255, 240, 210], 0.4), 0.4), 10);
    // tufts over the top and a feathered hairline on the brow
    hairStrands(g, rng, 70, col, 1.4, 0.6, (r) => {
      const a = Math.PI * (1.1 + r() * 0.8);
      const x0 = Math.cos(a) * R * 1.0;
      const y0 = -s * 0.22 + Math.sin(a) * s * 0.3;
      return [x0, y0, x0 + Math.cos(a) * 6, y0 + Math.sin(a) * 8, x0 + Math.cos(a) * 10 + (r() - 0.5) * 6, y0 + Math.sin(a) * 12];
    });
    hairStrands(g, rng, 40, col, 1, 0.45, (r) => {
      const x0 = (r() - 0.5) * R * 1.4;
      const y0 = -s * 0.36 + Math.abs(x0) * 0.12;
      return [x0, y0 - 6, x0 + 2, y0, x0 + (r() - 0.5) * 4, y0 + 4 + r() * 5];
    });
    for (const sd of [-1, 1]) {
      fill(g, rgba(shade(col, 0.85), 1), (q) => {
        q.moveTo(sd * R * 0.92, -s * 0.2);
        q.lineTo(sd * R * 1.02, -s * 0.18);
        q.lineTo(sd * R * 1.0, s * 0.04);
        q.lineTo(sd * R * 0.93, s * 0.04);
        q.closePath();
      });
    }
    return;
  }
  if (hair.style === 'loose') {
    // centre parting, then long hair framing the face and falling forward
    for (const sd of [-1, 1]) {
      fill(g, rgba(col, 1), (q) => {
        q.moveTo(px, -s * 0.52);
        q.bezierCurveTo(sd * R * 0.9, -s * 0.55, sd * R * 1.15, -s * 0.2, sd * R * 0.98, s * 0.2);
        q.bezierCurveTo(sd * R * 1.05, s * 0.8, sd * R * 1.35, s * 1.4, sd * R * 1.2, s * 2.1);
        q.lineTo(sd * R * 1.7, s * 2.1);
        q.bezierCurveTo(sd * R * 1.7, s * 1.2, sd * R * 1.45, s * 0.3, sd * R * 1.25, -s * 0.2);
        q.bezierCurveTo(sd * R * 1.1, -s * 0.5, sd * R * 0.4, -s * 0.6, px, -s * 0.52);
      });
      hairStrands(g, rng, 120, col, 1.2, 0.5, (r) => {
        const x0 = px + sd * r() * R * 0.3;
        const x1 = sd * R * (1.05 + r() * 0.45);
        return [x0, -s * 0.52, sd * R * (1.2 + r() * 0.2), s * 0.2, x1, s * (1.0 + r() * 1.1)];
      });
    }
    // stray strands across the face
    for (let k = 0; k < 6; k++) {
      const sd = k % 2 ? 1 : -1;
      stroke(g, rgba(shade(col, 0.8), 0.5), 1, (q) => {
        q.moveTo(px + sd * R * 0.1, -s * 0.5);
        q.bezierCurveTo(sd * R * 0.7, -s * 0.2, sd * R * (0.55 + rng() * 0.2), s * 0.2, sd * R * (0.7 + rng() * 0.2), s * 0.55);
      });
    }
    return;
  }
  // parted styles (bun, ringlets, cap, veil): smooth bands from the parting,
  // puffed out over the ears and drawn back to the nape
  for (const sd of [-1, 1]) softEllipse(g, sd * R * 0.62, -s * 0.28, R * 0.42, s * 0.1, rgba(shade(f.skin, 0.45), 0.35), R * 0.15, sd * 0.5);
  for (const sd of [-1, 1]) {
    const gr = g.createLinearGradient(-R * 1.2, 0, R * 1.2, 0);
    gr.addColorStop(0, rgba(mix(col, [255, 240, 215], 0.12), 1));
    gr.addColorStop(0.5, rgba(col, 1));
    gr.addColorStop(1, rgba(shade(col, 0.6), 1));
    fill(g, gr, (q) => {
      q.moveTo(px, -s * 0.52);
      q.bezierCurveTo(sd * R * 0.8, -s * 0.54, sd * R * 1.18, -s * 0.34, sd * R * 1.2, -s * 0.08);
      q.bezierCurveTo(sd * R * 1.24, s * 0.06, sd * R * 1.14, s * 0.15, sd * R * 0.98, s * 0.16);
      q.bezierCurveTo(sd * R * 1.02, s * 0.06, sd * R * 0.98, -s * 0.06, sd * R * 0.9, -s * 0.12);
      q.bezierCurveTo(sd * R * 0.8, -s * 0.28, sd * R * 0.45, -s * 0.37, px + sd * R * 0.05, -s * 0.37);
      q.closePath();
    });
    hairStrands(g, rng, 120, col, 1.1, 0.45, (r) => {
      const y0 = -s * (0.51 - r() * 0.04);
      const out = 1.0 + r() * 0.18;
      return [px + sd * 2, y0, sd * R * (0.9 + r() * 0.2), -s * (0.42 - r() * 0.06), sd * R * out, s * (0.1 - r() * 0.2)];
    });
    // a few loose hairs breaking the outline
    for (let k = 0; k < 6; k++) stroke(g, rgba(col, 0.5), 0.8, (q) => {
      const y = -s * (0.4 - k * 0.07);
      q.moveTo(sd * R * 1.12, y);
      q.quadraticCurveTo(sd * R * (1.25 + rng() * 0.08), y + s * 0.03, sd * R * (1.2 + rng() * 0.1), y + s * 0.08);
    });
  }
  // the sheen band where the light catches smooth hair
  softStroke(g, rgba(mix(col, [255, 240, 215], 0.45), 0.45), 6, 6, (q) => {
    q.moveTo(-R * 0.75, -s * 0.36);
    q.quadraticCurveTo(-R * 0.35, -s * 0.5, px, -s * 0.48);
  });
  stroke(g, rgba(shade(f.skin, 0.7), 0.35), 1, (q) => {
    q.moveTo(px, -s * 0.52);
    q.lineTo(px, -s * 0.45);
  });
}

function beard(g, h, f, b, rng) {
  const s = h.s;
  const R = headWidth(h, f);
  const col = b.color;
  const t = h.turn || 0;
  const ox = -t * R * 0.2;
  if (b.style === 'muttonchops') {
    for (const sd of [-1, 1]) {
      fill(g, rgba(col, 1), (q) => {
        q.moveTo(ox + sd * R * 1.0, -s * 0.06);
        q.bezierCurveTo(ox + sd * R * 1.12, s * 0.18, ox + sd * R * 0.98, s * 0.36, ox + sd * R * 0.62, s * 0.36);
        q.bezierCurveTo(ox + sd * R * 0.42, s * 0.33, ox + sd * R * 0.4, s * 0.25, ox + sd * R * 0.48, s * 0.2);
        q.bezierCurveTo(ox + sd * R * 0.72, s * 0.12, ox + sd * R * 0.82, s * 0.02, ox + sd * R * 0.82, -s * 0.06);
        q.closePath();
      });
      hairStrands(g, rng, 90, col, 1.2, 0.55, (r) => {
        const y0 = -s * 0.04 + r() * s * 0.25;
        return [ox + sd * R * (0.85 + r() * 0.15), y0, ox + sd * R * (1.05 + r() * 0.1), y0 + s * 0.08, ox + sd * R * (0.55 + r() * 0.4), y0 + s * 0.15];
      });
    }
    // moustache joining them
    fill(g, rgba(col, 1), (q) => {
      q.moveTo(ox - R * 0.5, s * 0.3);
      q.bezierCurveTo(ox - R * 0.35, s * 0.22, ox - R * 0.05, s * 0.24, ox, s * 0.27);
      q.bezierCurveTo(ox + R * 0.05, s * 0.24, ox + R * 0.35, s * 0.22, ox + R * 0.5, s * 0.3);
      q.bezierCurveTo(ox + R * 0.3, s * 0.3, ox + R * 0.1, s * 0.29, ox, s * 0.3);
      q.bezierCurveTo(ox - R * 0.1, s * 0.29, ox - R * 0.3, s * 0.3, ox - R * 0.5, s * 0.3);
    });
    hairStrands(g, rng, 50, col, 1, 0.6, (r) => {
      const sd = r() < 0.5 ? -1 : 1;
      const x0 = ox + sd * R * r() * 0.1;
      return [x0, s * 0.25, x0 + sd * R * 0.25, s * 0.25, x0 + sd * R * (0.4 + r() * 0.1), s * (0.29 + r() * 0.02)];
    });
    return;
  }
  // full trimmed beard round the jaw and chin, with a moustache
  const out = faceOutline(h, f).filter((p) => p[1] > s * 0.05);
  fill(g, rgba(col, 1), (q) => {
    q.moveTo(ox + R * 1.0, -s * 0.05);
    q.bezierCurveTo(ox + R * 1.1, s * 0.3, ox + R * 0.65, s * 0.6, ox, s * 0.64);
    q.bezierCurveTo(ox - R * 0.65, s * 0.6, ox - R * 1.1, s * 0.3, ox - R * 1.0, -s * 0.05);
    q.bezierCurveTo(ox - R * 0.92, s * 0.15, ox - R * 0.7, s * 0.22, ox - R * 0.55, s * 0.36);
    q.bezierCurveTo(ox - R * 0.3, s * 0.43, ox + R * 0.3, s * 0.43, ox + R * 0.55, s * 0.36);
    q.bezierCurveTo(ox + R * 0.7, s * 0.22, ox + R * 0.92, s * 0.15, ox + R * 1.0, -s * 0.05);
  });
  void out;
  hairStrands(g, rng, 260, col, 1.2, 0.45, (r) => {
    const a = (r() - 0.5) * Math.PI * 0.95;
    const x0 = ox + Math.sin(a) * R * 0.95;
    const y0 = s * (0.15 + Math.cos(a) * 0.25 + r() * 0.1);
    return [x0, y0, x0 + Math.sin(a) * 4, y0 + 10, x0 + Math.sin(a) * 6, y0 + 16 + r() * 8];
  });
  softEllipse(g, ox - R * 0.3, s * 0.45, R * 0.3, s * 0.06, rgba(mix(col, [255, 240, 210], 0.3), 0.3), 8);
  // moustache over the upper lip, mouth left visible beneath
  fill(g, rgba(shade(col, 0.9), 1), (q) => {
    q.moveTo(ox - R * 0.55, s * 0.32);
    q.bezierCurveTo(ox - R * 0.4, s * 0.22, ox - R * 0.1, s * 0.23, ox, s * 0.26);
    q.bezierCurveTo(ox + R * 0.1, s * 0.23, ox + R * 0.4, s * 0.22, ox + R * 0.55, s * 0.32);
    q.bezierCurveTo(ox + R * 0.3, s * 0.31, ox, s * 0.3, ox - R * 0.55, s * 0.32);
  });
}

function capLace(g, h, f, cap, rng) {
  const s = h.s;
  const R = headWidth(h, f);
  const c = cap.color || [236, 230, 218];
  // crown of the cap
  const gr = g.createLinearGradient(-R, 0, R, 0);
  gr.addColorStop(0, rgba(c, 1));
  gr.addColorStop(1, rgba(shade(c, 0.65), 1));
  fill(g, gr, (q) => {
    q.moveTo(-R * 1.15, -s * 0.18);
    q.bezierCurveTo(-R * 1.3, -s * 0.72, R * 1.3, -s * 0.72, R * 1.15, -s * 0.18);
    q.bezierCurveTo(R * 0.6, -s * 0.42, -R * 0.6, -s * 0.42, -R * 1.15, -s * 0.18);
  });
  // scalloped lace frill round the face
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI * (1.08 + (i / 26) * 0.84);
    const x = Math.cos(a) * R * 1.12;
    const y = -s * 0.2 + Math.sin(a) * s * 0.36;
    fill(g, rgba(shade(c, 0.9 + rng() * 0.15), 0.95), (q) => q.arc(x, y, R * 0.11, 0, Math.PI * 2));
    stroke(g, rgba(shade(c, 0.55), 0.6), 0.8, (q) => q.arc(x, y, R * 0.08, 0, Math.PI * 2));
    fill(g, rgba(shade(c, 0.5), 0.6), (q) => q.arc(x, y, R * 0.025, 0, Math.PI * 2));
  }
  if (cap.lappets) {
    for (const sd of [-1, 1]) {
      fill(g, rgba(shade(c, sd > 0 ? 0.75 : 0.95), 0.95), (q) => {
        q.moveTo(sd * R * 1.08, -s * 0.15);
        q.bezierCurveTo(sd * R * 1.25, s * 0.2, sd * R * 1.2, s * 0.6, sd * R * 1.05, s * 0.85);
        q.lineTo(sd * R * 0.88, s * 0.82);
        q.bezierCurveTo(sd * R * 1.0, s * 0.5, sd * R * 1.02, s * 0.2, sd * R * 0.95, -s * 0.12);
        q.closePath();
      });
      for (let k = 0; k < 9; k++) stroke(g, rgba(shade(c, 0.55), 0.5), 0.8, (q) => q.arc(sd * R * (1.05 + k * 0.005), -s * 0.05 + k * s * 0.1, R * 0.06, 0, Math.PI * 2));
    }
  }
}

function wreathVeil(g, h, f, rng, layer) {
  const s = h.s;
  const R = headWidth(h, f);
  if (layer === 'back') {
    // the veil falls from the crown behind the shoulders
    soft(g, 'rgba(236,236,230,0.55)', 14, (q) => {
      q.moveTo(-R * 0.9, -s * 0.45);
      q.bezierCurveTo(-R * 2.4, s * 0.4, -R * 2.6, s * 1.6, -R * 2.9, s * 2.5);
      q.lineTo(R * 2.9, s * 2.5);
      q.bezierCurveTo(R * 2.6, s * 1.6, R * 2.4, s * 0.4, R * 0.9, -s * 0.45);
      q.closePath();
    });
    for (let i = 0; i < 16; i++) {
      const sd = i % 2 ? 1 : -1;
      softStroke(g, `rgba(255,255,250,${0.12 + rng() * 0.12})`, 6, 3, (q) => {
        q.moveTo(sd * R * 0.8, -s * 0.4);
        q.bezierCurveTo(sd * R * (1.6 + rng()), s * 0.4, sd * R * (2.0 + rng() * 0.6), s * 1.4, sd * R * (2.2 + rng() * 0.6), s * 2.5);
      });
    }
    return;
  }
  // orange blossom wreath, a few blooms already browning
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI * (1.05 + (i / 18) * 0.9);
    const x = Math.cos(a) * R * 1.0;
    const y = -s * 0.18 + Math.sin(a) * s * 0.34;
    const dead = rng() < 0.18;
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2;
      fill(g, dead ? 'rgba(170,140,100,0.9)' : 'rgba(246,242,228,0.95)', (q) => q.ellipse(x + Math.cos(pa) * 4, y + Math.sin(pa) * 4, 3.4, 2.4, pa, 0, Math.PI * 2));
    }
    fill(g, 'rgba(210,180,90,0.9)', (q) => q.arc(x, y, 1.8, 0, Math.PI * 2));
    if (i % 3 === 0) fill(g, 'rgba(70,90,50,0.8)', (q) => q.ellipse(x + 6, y + 3, 5, 2, 0.6, 0, Math.PI * 2));
  }
  // a thin veil edge over the forehead and the sides of the face
  soft(g, 'rgba(240,240,236,0.18)', 6, (q) => {
    q.moveTo(-R * 1.05, -s * 0.3);
    q.bezierCurveTo(-R * 1.35, s * 0.3, -R * 1.25, s * 0.8, -R * 1.45, s * 1.2);
    q.lineTo(-R * 1.1, s * 1.2);
    q.bezierCurveTo(-R * 1.05, s * 0.6, -R * 1.05, s * 0.2, -R * 0.95, -s * 0.25);
    q.closePath();
  });
}

// --------------------------------------------------------------- clothing

// Coordinates here are in the head frame too (origin at the eye line).
function shoulders(h, f, wide = 1) {
  const R = headWidth(h, f);
  const sw = R * (f.child ? 1.95 : f.sex === 'm' ? 2.55 : 2.25) * wide;
  return { R, sw, neckY: h.s * (f.sex === 'f' && !f.child ? 0.58 : 0.62), shY: h.s * (f.child ? 0.78 : 0.85) };
}

function torsoPath(q, h, f, o, bottom) {
  const { sw, neckY, shY } = o;
  const nw = o.R * (f.sex === 'm' ? 0.75 : 0.6);
  q.moveTo(-nw, neckY);
  q.bezierCurveTo(-sw * 0.55, neckY + 4, -sw * 0.92, shY - 6, -sw, shY + 22);
  q.bezierCurveTo(-sw * 1.08, shY + 120, -sw * 1.15, bottom * 0.7, -sw * 1.2, bottom);
  q.lineTo(sw * 1.2, bottom);
  q.bezierCurveTo(sw * 1.15, bottom * 0.7, sw * 1.08, shY + 120, sw, shY + 22);
  q.bezierCurveTo(sw * 0.92, shY - 6, sw * 0.55, neckY + 4, nw, neckY);
  q.closePath();
}

function fabric(g, h, f, o, bottom, col, rng, sheen = 0.3) {
  const gr = g.createLinearGradient(-o.sw * 1.2, 0, o.sw * 1.2, 0);
  gr.addColorStop(0, rgba(mix(col, [255, 245, 230], 0.12), 1));
  gr.addColorStop(0.45, rgba(col, 1));
  gr.addColorStop(1, rgba(shade(col, 0.45), 1));
  fill(g, gr, (q) => torsoPath(q, h, f, o, bottom));
  clipped(
    g,
    (q) => torsoPath(q, h, f, o, bottom),
    () => {
      // folds from the shoulders and the waist
      for (let i = 0; i < 18; i++) {
        const sd = i % 2 ? 1 : -1;
        const x0 = sd * o.sw * (0.25 + rng() * 0.75);
        const lit = rng() < 0.5;
        softStroke(g, lit ? rgba(mix(col, [255, 248, 235], 0.45), sheen * (sd < 0 ? 1 : 0.4)) : rgba(shade(col, 0.4), 0.45), 6, 3 + rng() * 7, (q) => {
          q.moveTo(x0, o.shY + rng() * 40);
          q.bezierCurveTo(x0 + (rng() - 0.5) * 30, o.shY + 120, x0 + (rng() - 0.5) * 40, bottom * 0.75, x0 + (rng() - 0.5) * 50, bottom + 10);
        });
      }
      softEllipse(g, -o.sw * 0.6, o.shY + 30, o.sw * 0.35, 30, rgba(mix(col, [255, 245, 230], 0.4), sheen), 24);
      softEllipse(g, o.sw * 0.95, o.shY + 160, o.sw * 0.35, 220, rgba(shade(col, 0.3), 0.5), 40);
      grain(g, -o.sw * 1.3, o.neckY, o.sw * 2.6, bottom, 0.12);
    }
  );
}

function buttons(g, x, y0, n, gap, r, col) {
  for (let i = 0; i < n; i++) {
    const y = y0 + i * gap;
    softEllipse(g, x + 1, y + 1.5, r, r, 'rgba(0,0,0,0.5)', 2);
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, rgba(mix(col, [255, 255, 255], 0.6), 1));
    gr.addColorStop(1, rgba(shade(col, 0.5), 1));
    fill(g, gr, (q) => q.arc(x, y, r, 0, Math.PI * 2));
  }
}

function laceCollar(g, o, col, width, rng, dark = false) {
  const y = o.neckY + 2;
  for (let row = 0; row < 2; row++) {
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = Math.PI * (0.05 + t * 0.9);
      const x = -Math.cos(a) * o.sw * width * (0.65 + row * 0.25);
      const yy = y + Math.sin(a) * (22 + row * 22);
      const r = 9 - row * 1.5;
      fill(g, rgba(shade(col, 0.85 + rng() * 0.2), dark ? 0.9 : 0.93), (q) => q.arc(x, yy, r, 0, Math.PI * 2));
      stroke(g, rgba(dark ? [90, 90, 100] : shade(col, 0.5), 0.55), 0.8, (q) => q.arc(x, yy, r * 0.65, 0, Math.PI * 2));
      for (let k = 0; k < 4; k++) fill(g, rgba(dark ? [150, 150, 160] : shade(col, 0.55), 0.5), (q) => q.arc(x + Math.cos(k * 1.6) * r * 0.4, yy + Math.sin(k * 1.6) * r * 0.4, 0.9, 0, Math.PI * 2));
    }
  }
}

function clothing(g, h, f, c, rng, bottom) {
  const o = shoulders(h, f, c.wide ?? 1);
  const col = c.color;
  if (c.style === 'coat') {
    fabric(g, h, f, o, bottom, col, rng, 0.18);
    // shirt front, collar and stock
    fill(g, 'rgb(226,222,210)', (q) => {
      q.moveTo(-o.R * 0.5, o.neckY - 6);
      q.lineTo(o.R * 0.5, o.neckY - 6);
      q.lineTo(o.R * 0.45, o.shY + 120);
      q.lineTo(-o.R * 0.45, o.shY + 120);
      q.closePath();
    });
    softEllipse(g, o.R * 0.3, o.shY + 50, o.R * 0.3, 60, 'rgba(120,110,100,0.4)', 14);
    if (c.wing) {
      for (const sd of [-1, 1]) {
        fill(g, 'rgb(236,232,222)', (q) => {
          q.moveTo(sd * o.R * 0.15, o.neckY - 12);
          q.lineTo(sd * o.R * 0.7, o.neckY - 22);
          q.lineTo(sd * o.R * 0.6, o.neckY + 8);
          q.closePath();
        });
      }
    }
    // the stock or cravat
    const tie = c.tie || [20, 18, 20];
    fill(g, rgba(tie, 1), (q) => {
      q.moveTo(-o.R * 0.55, o.neckY);
      q.bezierCurveTo(-o.R * 0.2, o.neckY + 12, o.R * 0.2, o.neckY + 12, o.R * 0.55, o.neckY);
      q.lineTo(o.R * 0.25, o.neckY + 48);
      q.lineTo(-o.R * 0.25, o.neckY + 48);
      q.closePath();
    });
    softEllipse(g, -o.R * 0.15, o.neckY + 18, o.R * 0.15, 8, 'rgba(255,255,255,0.15)', 6);
    if (c.waistcoat) {
      fill(g, rgba(c.waistcoat, 1), (q) => {
        q.moveTo(-o.R * 0.55, o.shY + 30);
        q.lineTo(o.R * 0.55, o.shY + 30);
        q.lineTo(o.R * 0.75, bottom);
        q.lineTo(-o.R * 0.75, bottom);
        q.closePath();
      });
      buttons(g, 0, o.shY + 140, 4, 34, 4, [60, 50, 40]);
      // gold watch chain
      stroke(g, 'rgba(210,170,80,0.9)', 2, (q) => {
        q.moveTo(-o.R * 0.6, o.shY + 230);
        q.quadraticCurveTo(0, o.shY + 270, o.R * 0.65, o.shY + 220);
      });
    }
    // lapels
    for (const sd of [-1, 1]) {
      fill(g, rgba(sd < 0 ? mix(col, [255, 245, 230], 0.08) : shade(col, 0.7), 1), (q) => {
        q.moveTo(sd * o.R * 0.55, o.neckY + 2);
        q.lineTo(sd * o.R * 1.25, o.shY + 6);
        q.lineTo(sd * o.R * 1.05, o.shY + 70);
        q.lineTo(sd * o.R * 1.35, o.shY + 82);
        q.lineTo(sd * o.R * 0.55, o.shY + 230);
        q.closePath();
      });
      stroke(g, rgba(shade(col, 0.3), 0.8), 1.2, (q) => {
        q.moveTo(sd * o.R * 1.05, o.shY + 70);
        q.lineTo(sd * o.R * 0.55, o.shY + 230);
      });
    }
    if (c.brass) {
      // double-breasted, brass buttons
      for (const sd of [-1, 1]) buttons(g, sd * o.R * 0.95, o.shY + 140, 4, 46, 6.5, [200, 160, 70]);
    }
    return o;
  }
  if (c.style === 'sailor') {
    fabric(g, h, f, o, bottom, col, rng, 0.2);
    // white V and the big square collar with its stripes
    fill(g, 'rgb(228,226,218)', (q) => {
      q.moveTo(-o.R * 0.6, o.neckY);
      q.lineTo(o.R * 0.6, o.neckY);
      q.lineTo(0, o.shY + 100);
      q.closePath();
    });
    for (let i = 0; i < 4; i++) stroke(g, 'rgba(40,50,90,0.7)', 2, (q) => {
      q.moveTo(-o.R * 0.4 + i * 3, o.neckY + 10 + i * 12);
      q.lineTo(o.R * 0.4 - i * 3, o.neckY + 10 + i * 12);
    });
    for (const sd of [-1, 1]) {
      fill(g, rgba(shade(col, sd > 0 ? 0.75 : 1.05), 1), (q) => {
        q.moveTo(sd * o.R * 0.6, o.neckY);
        q.lineTo(sd * o.sw * 1.0, o.shY + 12);
        q.lineTo(sd * o.sw * 0.95, o.shY + 70);
        q.lineTo(0, o.shY + 110);
        q.closePath();
      });
      for (let k = 0; k < 3; k++) stroke(g, 'rgba(236,234,226,0.9)', 2, (q) => {
        q.moveTo(sd * (o.R * 0.6 + 6 + k * 5), o.neckY + 4 + k * 4);
        q.lineTo(sd * (o.sw - 6 - k * 5), o.shY + 14 + k * 4);
      });
    }
    // knotted neckerchief
    fill(g, 'rgb(20,20,28)', (q) => {
      q.moveTo(-10, o.shY + 96);
      q.lineTo(10, o.shY + 96);
      q.lineTo(6, o.shY + 116);
      q.lineTo(-6, o.shY + 116);
      q.closePath();
    });
    for (const sd of [-1, 1]) fill(g, 'rgb(24,24,32)', (q) => {
      q.moveTo(sd * 5, o.shY + 112);
      q.lineTo(sd * 22, o.shY + 175);
      q.lineTo(sd * 8, o.shY + 178);
      q.closePath();
    });
    return o;
  }
  // dresses
  fabric(g, h, f, o, bottom, col, rng, c.sheen ?? 0.35);
  if (c.apron) {
    // bib and straps of a white apron
    fill(g, 'rgb(222,218,206)', (q) => {
      q.moveTo(-o.R * 0.9, o.shY + 100);
      q.lineTo(o.R * 0.9, o.shY + 100);
      q.lineTo(o.R * 1.0, bottom);
      q.lineTo(-o.R * 1.0, bottom);
      q.closePath();
    });
    for (const sd of [-1, 1]) fill(g, 'rgb(214,210,198)', (q) => q.rect(sd > 0 ? o.R * 0.75 : -o.R * 0.95, o.shY + 8, o.R * 0.2, 96));
    softEllipse(g, o.R * 0.6, o.shY + 200, o.R * 0.5, 80, 'rgba(120,110,100,0.35)', 20);
  }
  if (c.yoke) {
    // a lace yoke and puffed sleeves on a child's frock
    for (let i = 0; i < 40; i++) {
      const x = (rng() - 0.5) * o.sw * 1.2;
      const y = o.neckY + 10 + rng() * 60;
      stroke(g, 'rgba(255,255,255,0.35)', 1, (q) => q.arc(x, y, 3 + rng() * 3, 0, Math.PI * 2));
    }
    for (const sd of [-1, 1]) softEllipse(g, sd * o.sw * 0.95, o.shY + 30, o.sw * 0.3, 50, sd < 0 ? 'rgba(255,255,255,0.35)' : 'rgba(120,120,130,0.3)', 18);
  }
  if (c.sash) fill(g, rgba(c.sash, 0.95), (q) => q.rect(-o.sw * 1.2, bottom - 70, o.sw * 2.4, 30));
  if (c.tucks) for (let i = -6; i <= 6; i++) stroke(g, 'rgba(160,160,165,0.35)', 1, (q) => {
    q.moveTo(i * 7, o.neckY + 40);
    q.lineTo(i * 8, bottom);
  });
  if (c.collar === 'lace') laceCollar(g, o, [238, 234, 222], 0.95, rng);
  if (c.collar === 'blacklace') {
    laceCollar(g, o, [40, 38, 44], 0.75, rng, true);
    // jet beads glinting on the bodice
    for (let i = 0; i < 70; i++) {
      const x = (rng() - 0.5) * o.sw * 1.4;
      const y = o.shY + 20 + rng() * 140;
      fill(g, 'rgba(10,10,12,0.9)', (q) => q.arc(x, y, 2, 0, Math.PI * 2));
      fill(g, 'rgba(220,220,230,0.7)', (q) => q.arc(x - 0.6, y - 0.6, 0.7, 0, Math.PI * 2));
    }
  }
  if (c.collar === 'band') {
    fill(g, 'rgb(230,226,214)', (q) => {
      q.moveTo(-o.R * 0.62, o.neckY - 16);
      q.lineTo(o.R * 0.62, o.neckY - 16);
      q.lineTo(o.R * 0.7, o.neckY + 6);
      q.lineTo(-o.R * 0.7, o.neckY + 6);
      q.closePath();
    });
  }
  if (c.collar === 'high') {
    // a high lace neck up to the jaw
    fill(g, rgba(col, 1), (q) => q.rect(-o.R * 0.55, o.neckY - 40, o.R * 1.1, 46));
    for (let i = 0; i < 5; i++) stroke(g, 'rgba(150,150,150,0.45)', 1, (q) => {
      q.moveTo(-o.R * 0.55, o.neckY - 36 + i * 9);
      q.lineTo(o.R * 0.55, o.neckY - 36 + i * 9);
    });
    softEllipse(g, o.R * 0.35, o.neckY - 18, o.R * 0.2, 20, 'rgba(110,110,120,0.35)', 10);
  }
  if (c.buttons) buttons(g, 0, o.shY + 40, c.buttons, 26, 3.5, c.buttonCol || [30, 28, 30]);
  if (c.brooch === 'cameo') {
    const y = o.neckY + 34;
    fill(g, 'rgb(170,130,60)', (q) => q.ellipse(0, y, 15, 19, 0, 0, Math.PI * 2));
    fill(g, 'rgb(150,90,70)', (q) => q.ellipse(0, y, 12, 16, 0, 0, Math.PI * 2));
    // the carved profile in white
    fill(g, 'rgb(236,226,210)', (q) => {
      q.moveTo(-3, -10 + y);
      q.bezierCurveTo(5, -11 + y, 7, -3 + y, 3, 1 + y);
      q.lineTo(5, 4 + y);
      q.bezierCurveTo(2, 8 + y, -2, 11 + y, -6, 12 + y);
      q.bezierCurveTo(-8, 4 + y, -8, -6 + y, -3, -10 + y);
    });
  }
  if (c.brooch === 'locket') {
    const y = o.neckY + 40;
    fill(g, 'rgb(20,18,20)', (q) => q.ellipse(0, y, 14, 18, 0, 0, Math.PI * 2));
    fill(g, 'rgb(140,110,60)', (q) => q.ellipse(0, y, 10, 13, 0, 0, Math.PI * 2));
    // plaited hair under glass
    for (let i = 0; i < 8; i++) stroke(g, 'rgba(60,40,30,0.9)', 1.2, (q) => {
      q.moveTo(-6, y - 9 + i * 2.3);
      q.lineTo(6, y - 7 + i * 2.3);
    });
    softEllipse(g, -3, y - 5, 3, 4, 'rgba(255,255,255,0.5)', 2);
  }
  return o;
}

// ------------------------------------------------------------ hands, props

// A life-size hand seen from the back: wrist at (x, y), fingers pointing
// along `ang` (0 = straight down, turning clockwise), L from wrist to the
// tip of the middle finger. curl folds the fingers away from the viewer;
// mirror puts the thumb on the other side. Light stays on the upper left.
function hand(g, x, y, L, ang, skin, o = {}) {
  const curl = o.curl ?? 0.3;
  const m = o.mirror ? -1 : 1;
  const lit = rgba(mix(skin, [255, 244, 232], 0.22), 1);
  const mid = rgba(skin, 1);
  const dark = rgba(shade(skin, 0.62), 1);
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.scale(m, 1);
  // canvas-left in local x, whatever the rotation (for the light)
  const lx = -Math.cos(ang) * m;
  const across = (w) => {
    const gr = g.createLinearGradient(-w * lx, 0, w * lx, 0);
    gr.addColorStop(0, lit);
    gr.addColorStop(0.5, mid);
    gr.addColorStop(1, dark);
    return gr;
  };
  const digit = (bx, by, a, len, w, nail) => {
    g.save();
    g.translate(bx, by);
    g.rotate(a);
    const tip = w * 0.42;
    fill(g, across(w * 0.6), (q) => {
      q.moveTo(-w / 2, 0);
      q.lineTo(-tip, len - tip);
      q.arc(0, len - tip, tip, Math.PI, 0, true);
      q.lineTo(w / 2, 0);
      q.closePath();
    });
    // joint creases and the shadow down the far side
    for (const t of [0.42, 0.72]) {
      if (t * len > len - tip) continue;
      stroke(g, rgba(shade(skin, 0.5), 0.45), Math.max(0.6, w * 0.06), (q) => {
        q.moveTo(-w * 0.3, t * len);
        q.quadraticCurveTo(0, t * len + w * 0.12, w * 0.3, t * len);
      });
    }
    softStroke(g, rgba(shade(skin, 0.45), 0.35), w * 0.3, w * 0.2, (q) => {
      q.moveTo(w * 0.42 * lx * -1, 2);
      q.lineTo(w * 0.36 * lx * -1, len - tip);
    });
    if (nail) {
      fill(g, rgba(mix(skin, [255, 232, 225], 0.45), 0.9), (q) => q.ellipse(0, len - tip * 1.25, w * 0.3, tip * 0.95, 0, 0, Math.PI * 2));
      stroke(g, rgba(shade(skin, 0.6), 0.5), 0.6, (q) => q.ellipse(0, len - tip * 1.25, w * 0.3, tip * 0.95, 0, 0, Math.PI * 2));
    }
    softEllipse(g, -w * 0.1 * lx, w * 0.3, w * 0.28, w * 0.22, 'rgba(255,248,240,0.35)', w * 0.25);
    g.restore();
  };
  // thumb, tucked behind the edge of the hand
  digit(-0.13 * L, 0.1 * L, 0.62, 0.4 * L * (1 - curl * 0.35), 0.105 * L, curl < 0.6);
  // the back of the hand
  fill(g, across(0.22 * L), (q) => {
    q.moveTo(-0.15 * L, -0.02 * L);
    q.lineTo(0.14 * L, -0.02 * L);
    q.bezierCurveTo(0.2 * L, 0.12 * L, 0.22 * L, 0.3 * L, 0.2 * L, 0.42 * L);
    q.bezierCurveTo(0.1 * L, 0.48 * L, -0.08 * L, 0.5 * L, -0.2 * L, 0.45 * L);
    q.bezierCurveTo(-0.22 * L, 0.3 * L, -0.2 * L, 0.12 * L, -0.15 * L, -0.02 * L);
  });
  // tendons fanning to the knuckles
  for (let i = 0; i < 4; i++) {
    softStroke(g, rgba(mix(skin, [255, 248, 240], 0.3), 0.3), 0.012 * L, 0.012 * L, (q) => {
      q.moveTo(-0.04 * L + i * 0.03 * L, 0.06 * L);
      q.lineTo(-0.16 * L + i * 0.11 * L, 0.42 * L);
    });
  }
  // fingers (curled ones are shorter: we see them bending away)
  const F = [
    [-0.155, 0.44, -0.07, 0.48, 0.088],
    [-0.05, 0.47, -0.02, 0.53, 0.092],
    [0.055, 0.46, 0.03, 0.5, 0.086],
    [0.155, 0.42, 0.09, 0.39, 0.076],
  ];
  const spread = o.spread ?? 1;
  for (const [fx, fy, fa, fl, fw] of F) {
    digit(fx * L, fy * L, fa * spread, fl * L * (1 - curl * 0.62), fw * L, curl < 0.55);
    softEllipse(g, fx * L - 0.01 * L, fy * L, 0.035 * L, 0.025 * L, 'rgba(255,246,236,0.45)', 0.02 * L);
  }
  // shadow where the hand turns away
  softEllipse(g, 0.12 * L * -lx, 0.25 * L, 0.12 * L, 0.2 * L, rgba(shade(skin, 0.5), 0.25), 0.1 * L);
  g.restore();
}

function sleeveEnd(g, x, y, w, ang, col, lace) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const gr = g.createLinearGradient(-w, 0, w, 0);
  gr.addColorStop(0, rgba(mix(col, [255, 245, 230], 0.15), 1));
  gr.addColorStop(1, rgba(shade(col, 0.5), 1));
  fill(g, gr, (q) => {
    q.moveTo(-w * 1.1, -320);
    q.lineTo(w * 1.1, -320);
    q.lineTo(w * 0.8, 0);
    q.lineTo(-w * 0.8, 0);
    q.closePath();
  });
  if (lace) for (let i = -4; i <= 4; i++) fill(g, rgba(lace, 0.95), (q) => q.arc(i * w * 0.2, 2, w * 0.18, 0, Math.PI * 2));
  g.restore();
}

function propDoll(g, x, y, rng) {
  // a porcelain doll in a dark dress with painted eyes
  fill(g, 'rgb(48,30,46)', (q) => {
    q.moveTo(x - 16, y);
    q.lineTo(x + 16, y);
    q.lineTo(x + 34, y + 90);
    q.lineTo(x - 34, y + 90);
    q.closePath();
  });
  for (let i = 0; i < 6; i++) stroke(g, 'rgba(200,200,210,0.6)', 1, (q) => q.arc(x - 30 + i * 12, y + 88, 5, 0, Math.PI));
  const gr = g.createRadialGradient(x - 5, y - 30, 2, x, y - 22, 22);
  gr.addColorStop(0, 'rgb(246,236,226)');
  gr.addColorStop(1, 'rgb(190,170,160)');
  fill(g, gr, (q) => q.ellipse(x, y - 22, 17, 20, 0, 0, Math.PI * 2));
  fill(g, 'rgb(60,36,24)', (q) => q.ellipse(x, y - 34, 19, 12, 0, Math.PI, Math.PI * 2));
  for (const sd of [-1, 1]) {
    fill(g, 'rgb(40,60,110)', (q) => q.arc(x + sd * 6, y - 22, 2.6, 0, Math.PI * 2));
    fill(g, 'rgb(250,250,250)', (q) => q.arc(x + sd * 6 - 0.8, y - 23, 0.8, 0, Math.PI * 2));
  }
  fill(g, 'rgb(190,70,70)', (q) => q.ellipse(x, y - 12, 3, 1.6, 0, 0, Math.PI * 2));
  softEllipse(g, x - 8, y - 16, 4, 3, 'rgba(220,120,120,0.5)', 3);
  // a hairline crack across one cheek
  stroke(g, 'rgba(60,40,40,0.7)', 0.8, (q) => {
    q.moveTo(x + 4, y - 30);
    q.lineTo(x + 9, y - 22);
    q.lineTo(x + 7, y - 14);
  });
}

function propBoat(g, x, y) {
  // toy barque: red hull, white sails, a little brass
  fill(g, 'rgb(150,40,30)', (q) => {
    q.moveTo(x - 70, y);
    q.lineTo(x + 70, y - 6);
    q.lineTo(x + 52, y + 26);
    q.lineTo(x - 56, y + 26);
    q.closePath();
  });
  stroke(g, 'rgb(220,200,140)', 3, (q) => {
    q.moveTo(x - 66, y + 4);
    q.lineTo(x + 66, y - 2);
  });
  softEllipse(g, x - 20, y + 6, 40, 6, 'rgba(255,200,180,0.3)', 6);
  for (const [mx, mh] of [
    [-25, 130],
    [20, 150],
  ]) {
    stroke(g, 'rgb(90,60,30)', 3, (q) => {
      q.moveTo(x + mx, y);
      q.lineTo(x + mx, y - mh);
    });
    for (let k = 0; k < 3; k++) {
      const sy = y - mh + 10 + k * 38;
      const gr = g.createLinearGradient(x + mx - 30, 0, x + mx + 30, 0);
      gr.addColorStop(0, 'rgb(246,242,228)');
      gr.addColorStop(1, 'rgb(170,166,150)');
      fill(g, gr, (q) => {
        q.moveTo(x + mx - 26 + k * 3, sy);
        q.quadraticCurveTo(x + mx, sy - 6, x + mx + 26 - k * 3, sy);
        q.quadraticCurveTo(x + mx + 30, sy + 16, x + mx + 28 - k * 3, sy + 32);
        q.lineTo(x + mx - 28 + k * 3, sy + 32);
        q.quadraticCurveTo(x + mx - 22, sy + 16, x + mx - 26 + k * 3, sy);
      });
    }
  }
  fill(g, 'rgb(150,40,30)', (q) => {
    q.moveTo(x + 20, y - 150);
    q.lineTo(x + 46, y - 144);
    q.lineTo(x + 20, y - 138);
    q.closePath();
  });
}

function propSpyglass(g, x0, y0, x1, y1) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  g.save();
  g.translate(x0, y0);
  g.rotate(ang);
  for (const [a, b, r] of [
    [0, 0.42, 13],
    [0.42, 0.72, 11],
    [0.72, 1, 9],
  ]) {
    const gr = g.createLinearGradient(0, -r, 0, r);
    gr.addColorStop(0, 'rgb(240,210,130)');
    gr.addColorStop(0.4, 'rgb(190,140,60)');
    gr.addColorStop(1, 'rgb(90,60,25)');
    fill(g, gr, (q) => q.rect(a * len, -r, (b - a) * len, r * 2));
    fill(g, 'rgb(120,80,30)', (q) => q.rect(b * len - 4, -r - 1, 4, r * 2 + 2));
  }
  fill(g, 'rgb(40,28,20)', (q) => q.rect(len * 0.08, -14, len * 0.2, 28));
  g.restore();
}

function propBook(g, x, y, w, ht, ang, col) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  fill(g, rgba(col, 1), (q) => q.rect(-w / 2, -ht / 2, w, ht));
  fill(g, 'rgb(220,210,180)', (q) => q.rect(w / 2 - 4, -ht / 2 + 3, 4, ht - 6));
  stroke(g, 'rgba(210,170,80,0.9)', 2, (q) => {
    q.moveTo(0, -ht * 0.25);
    q.lineTo(0, ht * 0.2);
    q.moveTo(-ht * 0.12, -ht * 0.1);
    q.lineTo(ht * 0.12, -ht * 0.1);
  });
  softEllipse(g, -w * 0.2, -ht * 0.2, w * 0.2, ht * 0.2, 'rgba(255,255,255,0.12)', 10);
  g.restore();
}

function propLetter(g, x, y, ang) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  fill(g, 'rgb(226,218,196)', (q) => q.rect(-60, -38, 120, 76));
  stroke(g, 'rgb(14,12,12)', 5, (q) => q.rect(-58, -36, 116, 72));
  for (let i = 0; i < 5; i++) stroke(g, 'rgba(60,50,60,0.55)', 1, (q) => {
    q.moveTo(-44, -18 + i * 9);
    q.lineTo(30 - (i % 2) * 18, -18 + i * 9);
  });
  g.restore();
}

function propBouquet(g, x, y, rng) {
  for (let i = 0; i < 14; i++) stroke(g, 'rgba(60,80,40,0.9)', 2, (q) => {
    q.moveTo(x + (rng() - 0.5) * 10, y + 20);
    q.lineTo(x + (rng() - 0.5) * 30, y + 110);
  });
  fill(g, 'rgb(236,232,220)', (q) => {
    q.moveTo(x - 20, y + 36);
    q.lineTo(x + 20, y + 36);
    q.lineTo(x + 12, y + 70);
    q.lineTo(x - 12, y + 70);
    q.closePath();
  });
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 52;
    const bx = x + Math.cos(a) * r;
    const by = y + Math.sin(a) * r * 0.65;
    const dead = rng() < 0.2;
    const c = dead ? [150, 120, 90] : rng() < 0.7 ? [244, 240, 230] : [236, 214, 200];
    const gr = g.createRadialGradient(bx - 3, by - 3, 1, bx, by, 11);
    gr.addColorStop(0, rgba(c, 1));
    gr.addColorStop(1, rgba(shade(c, 0.6), 1));
    fill(g, gr, (q) => q.arc(bx, by, 10, 0, Math.PI * 2));
    stroke(g, rgba(shade(c, 0.55), 0.7), 1, (q) => q.arc(bx + 1, by + 1, 5, 0.3, 4.5));
  }
  for (let i = 0; i < 10; i++) fill(g, 'rgba(60,90,50,0.85)', (q) => q.ellipse(x + (rng() - 0.5) * 110, y + (rng() - 0.3) * 60, 9, 4, rng() * 3, 0, Math.PI * 2));
}

function propCane(g, x, y) {
  fill(g, 'rgb(30,20,14)', (q) => q.rect(x - 5, y, 10, H - y));
  const gr = g.createRadialGradient(x - 6, y - 8, 2, x, y, 20);
  gr.addColorStop(0, 'rgb(250,248,240)');
  gr.addColorStop(1, 'rgb(110,110,115)');
  fill(g, gr, (q) => q.ellipse(x, y, 20, 13, 0, 0, Math.PI * 2));
}

function propKeys(g, x, y) {
  stroke(g, 'rgb(170,140,70)', 3, (q) => q.arc(x, y, 14, 0, Math.PI * 2));
  for (let i = 0; i < 6; i++) {
    const a = 1.1 + i * 0.22;
    const kx = x + Math.cos(a) * 14;
    const ky = y + Math.sin(a) * 14;
    stroke(g, `rgb(${160 + i * 8},${130 + i * 5},70)`, 2.5, (q) => {
      q.moveTo(kx, ky);
      q.lineTo(kx + Math.cos(a) * 46, ky + Math.sin(a) * 46);
    });
    stroke(g, 'rgb(160,130,70)', 2, (q) => q.arc(kx + Math.cos(a) * 52, ky + Math.sin(a) * 52, 6, 0, Math.PI * 2));
  }
}

// -------------------------------------------------------------- the sitters

export const PORTRAITS = {
  constance: {
    title: ['CONSTANCE RAVENMOOR', '1801 – 1869'],
    seed: 11,
    bg: { color: [58, 28, 26], drape: { side: 'right', width: 0.42, color: [92, 26, 30] } },
    head: { cx: 250, cy: 236, s: 168, turn: -0.18 },
    face: { sex: 'f', age: 68, skin: SKIN.aged, eyeColor: [80, 90, 100], browColor: [150, 145, 140], expr: { stern: 0.55 }, jaw: 1.02, lines: 1.2 },
    hair: { style: 'bun', color: HAIR.grey },
    cap: { lappets: true },
    clothes: { style: 'dress', color: [26, 24, 28], collar: 'lace', brooch: 'cameo', buttons: 5, sheen: 0.45 },
    hands: 'book',
  },
  josiah: {
    title: ['CAPT. JOSIAH RAVENMOOR', '1841 – 1888'],
    seed: 22,
    bg: { color: [40, 38, 40], window: { x: 300, y: 70, wd: 180, ht: 230, sea: true, ship: true, storm: true, sky: [44, 50, 60], horizon: 0.64 }, drape: { side: 'left', width: 0.28, color: [40, 54, 70] } },
    chair: true,
    head: { cx: 236, cy: 246, s: 172, turn: 0.2 },
    face: { sex: 'm', age: 44, skin: SKIN.weathered, eyeColor: [70, 90, 110], browColor: [50, 34, 24], browWeight: 1.2, expr: { stern: 0.15 }, jaw: 1.05, noseLen: 1.05 },
    hair: { style: 'short', color: HAIR.darkBrown, part: -0.6 },
    beard: { style: 'full', color: [56, 38, 28] },
    clothes: { style: 'coat', color: [26, 34, 56], brass: true, tie: [16, 16, 20], wide: 1.05 },
    hands: 'spyglass',
  },
  clara: {
    title: ['CLARA RAVENMOOR', 'AGED SEVEN'],
    seed: 33,
    bg: { color: [70, 70, 60], garden: { sky: [120, 130, 150], trees: [60, 74, 50], roses: [190, 110, 120], spire: 380 } },
    head: { cx: 256, cy: 236, s: 150, turn: 0.08 },
    face: { sex: 'f', child: true, age: 7, skin: SKIN.child, eyeColor: [80, 110, 150], browColor: [150, 120, 80], blush: 0.7, expr: { sad: 0.15 }, eyeSize: 1.05 },
    hair: { style: 'ringlets', color: HAIR.blonde, ribbon: [200, 120, 140] },
    clothes: { style: 'dress', color: [236, 232, 224], yoke: true, sash: [210, 140, 150], sheen: 0.15 },
    hands: 'doll',
  },
  thomas: {
    title: ['THOMAS RAVENMOOR', 'AGED TEN'],
    seed: 44,
    bg: { color: [36, 48, 52], drape: { side: 'right', width: 0.35, color: [30, 56, 60] } },
    head: { cx: 250, cy: 232, s: 152, turn: -0.12 },
    face: { sex: 'm', child: true, age: 10, skin: SKIN.child, eyeColor: [90, 120, 140], browColor: [110, 74, 46], freckles: 0.8, blush: 0.6, expr: { smile: 0.15 } },
    hair: { style: 'short', color: HAIR.chestnut, part: 0.5 },
    clothes: { style: 'sailor', color: [30, 40, 72] },
    hands: 'boat',
  },
  ezra: {
    title: ['CAPT. EZRA RAVENMOOR', 'BUILDER OF THIS HOUSE · 1871'],
    seed: 55,
    bg: { color: [34, 40, 30], drape: { side: 'right', width: 0.36, color: [34, 58, 40] }, globe: { x: 90, y: 470, r: 60 } },
    head: { cx: 262, cy: 236, s: 170, turn: -0.15 },
    face: { sex: 'm', age: 74, skin: [214, 160, 130], eyeColor: [70, 80, 80], browColor: [222, 218, 210], browWeight: 1.6, expr: { stern: 0.7 }, noseLen: 1.12, noseW: 1.15, lines: 1.3, blush: 0.4 },
    hair: { style: 'bald', color: HAIR.white },
    beard: { style: 'muttonchops', color: [226, 222, 214] },
    clothes: { style: 'coat', color: [18, 18, 20], waistcoat: [40, 30, 28], wing: true, tie: [12, 12, 14] },
    hands: 'cane',
  },
  eleanor: {
    title: ['ELEANOR RAVENMOOR', 'IN MOURNING · 1888'],
    seed: 66,
    bg: { color: [42, 42, 52], window: { x: 36, y: 56, wd: 150, ht: 200, sea: true, moon: true, lighthouse: true, sky: [30, 38, 58], horizon: 0.66 }, drape: { side: 'right', width: 0.3, color: [52, 44, 62] } },
    head: { cx: 270, cy: 240, s: 164, turn: -0.22 },
    face: { sex: 'f', age: 39, skin: SKIN.pale, eyeColor: [70, 60, 50], browColor: [40, 30, 26], expr: { sad: 0.7, weep: 0.6, tired: 0.4 }, pallor: 0.35, look: [-0.3, 0.1] },
    hair: { style: 'bun', color: HAIR.darkBrown },
    clothes: { style: 'dress', color: [16, 15, 18], collar: 'blacklace', brooch: 'locket', buttons: 6, sheen: 0.5 },
    hands: 'letter',
  },
  lucy: {
    title: ['LUCY ASHGROVE', 'A BRIDE · 1869'],
    seed: 77,
    bg: { color: [110, 108, 96], garden: { sky: [170, 160, 150], trees: [80, 92, 70], spire: 120 } },
    veil: true,
    head: { cx: 256, cy: 238, s: 160, turn: 0.1 },
    face: { sex: 'f', age: 18, skin: SKIN.fair, eyeColor: [90, 110, 90], browColor: [120, 80, 50], expr: { smile: 0.25, sad: 0.25 }, lips: 1.1 },
    hair: { style: 'bun', color: HAIR.chestnut },
    clothes: { style: 'dress', color: [236, 234, 226], collar: 'high', tucks: true, sheen: 0.2 },
    hands: 'bouquet',
  },
  agnes: {
    title: ['MISS AGNES WHITBY', 'HOUSEKEEPER · TWENTY YEARS IN SERVICE'],
    seed: 88,
    bg: { color: [62, 48, 34] },
    head: { cx: 256, cy: 240, s: 168, turn: 0.12 },
    face: { sex: 'f', age: 58, skin: SKIN.aged, eyeColor: [60, 70, 60], browColor: [100, 90, 80], expr: { stern: 0.35, smile: 0.1 }, lines: 1.0, jaw: 1.05 },
    hair: { style: 'bun', color: [120, 110, 100] },
    cap: {},
    clothes: { style: 'dress', color: [24, 22, 24], collar: 'band', apron: true, sheen: 0.2 },
    hands: 'keys',
  },
  henrietta: {
    // her sockets line up with the follow-eyes set into the frame
    title: ['HENRIETTA VALE', '1830 – 1879'],
    scratched: true,
    seed: 99,
    bg: { color: [34, 40, 36] },
    head: { cx: 256, cy: 269, s: 188, turn: 0 },
    face: { sex: 'f', age: 42, skin: SKIN.pale, hollowEyes: true, browColor: [30, 24, 22], expr: { sad: 0.4, open: 0.18 }, pallor: 0.6, wide: 0.92, jaw: 0.92, cheek: 0.95 },
    hair: { style: 'loose', color: HAIR.black },
    clothes: { style: 'dress', color: [56, 66, 58], collar: 'band', buttons: 7, sheen: 0.25, wide: 0.92 },
  },
};

// ------------------------------------------------------------------ paint

function paintSitter(g, P, rng, empty) {
  const h = P.head;
  const f = { ...P.face, skin: P.face.skin };
  if (P.chair) {
    // carved chair back seen behind the sitter
    const cx = h.cx + 10;
    fill(g, 'rgb(46,22,16)', (q) => {
      q.moveTo(cx - 150, H);
      q.lineTo(cx - 150, 380);
      q.bezierCurveTo(cx - 150, 300, cx - 90, 285, cx, 290);
      q.bezierCurveTo(cx + 90, 285, cx + 150, 300, cx + 150, 380);
      q.lineTo(cx + 150, H);
      q.closePath();
    });
    fill(g, 'rgb(96,30,32)', (q) => q.rect(cx - 125, 320, 250, H));
    for (let i = 0; i < 40; i++) softEllipse(g, cx - 120 + rng() * 240, 330 + rng() * 300, 4, 4, 'rgba(200,150,90,0.25)', 4);
    stroke(g, 'rgba(210,160,90,0.5)', 3, (q) => {
      q.moveTo(cx - 150, 380);
      q.bezierCurveTo(cx - 150, 300, cx - 90, 285, cx, 290);
      q.bezierCurveTo(cx + 90, 285, cx + 150, 300, cx + 150, 380);
    });
  }
  if (empty) {
    // where he sat the paint is damp and paler, and something has run
    softEllipse(g, h.cx, 470, 120, 200, 'rgba(160,170,175,0.12)', 50);
    for (let i = 0; i < 10; i++) {
      const x = h.cx - 80 + rng() * 160;
      softStroke(g, 'rgba(20,28,32,0.35)', 3, 2 + rng() * 2, (q) => {
        q.moveTo(x, 420 + rng() * 60);
        q.lineTo(x + (rng() - 0.5) * 6, H);
      });
    }
    softEllipse(g, h.cx, 560, 90, 40, 'rgba(12,18,22,0.45)', 30);
    return;
  }
  g.save();
  g.translate(h.cx, h.cy);
  if (P.veil) wreathVeil(g, h, f, rng, 'back');
  if (P.hair) hairBack(g, h, f, P.hair, rng);
  paintNeck(g, h, f, h.s * 0.8);
  const o = clothing(g, h, f, P.clothes, rng, H - h.cy + 10);
  g.save();
  g.rotate(h.tilt || 0);
  if (P.hair && (P.hair.style === 'short' || P.hair.style === 'bald')) paintEars(g, h, f);
  paintFace(g, h, f, P.seed);
  if (P.beard) beard(g, h, f, P.beard, rng);
  if (P.hair) hairFront(g, h, f, P.hair, rng);
  if (P.cap) capLace(g, h, f, P.cap, rng);
  if (P.veil) wreathVeil(g, h, f, rng, 'front');
  if (P.hair && P.hair.ribbon) {
    const R = headWidth(h, f);
    for (const sd of [-1, 1]) fill(g, rgba(P.hair.ribbon, 0.95), (q) => q.ellipse(R * 0.7 + sd * 16, -h.s * 0.42, 18, 10, sd * 0.5, 0, Math.PI * 2));
    fill(g, rgba(shade(P.hair.ribbon, 0.7), 1), (q) => q.arc(R * 0.7, -h.s * 0.42, 6, 0, Math.PI * 2));
  }
  g.restore();
  g.restore();
  hands(g, P, h, f, o, rng);
}

function hands(g, P, h, f, o, rng) {
  const skin = mix(f.skin, [200, 150, 130], 0.12);
  const sleeve = P.clothes.color;
  const cx = h.cx;
  const L = h.s * (f.child ? 0.58 : 0.7);
  // forearm, cuff and hand, all aimed the same way
  const arm = (x, y, ang, opts = {}) => {
    sleeveEnd(g, x, y, opts.sleeveW ?? L * 0.3, ang, opts.sleeve ?? sleeve, opts.lace);
    hand(g, x, y, L * (opts.k ?? 1), ang, skin, opts);
  };
  switch (P.hands) {
    case 'book':
      propBook(g, cx + 6, H - 120, 150, 104, -0.1, [24, 18, 18]);
      arm(cx - 120, H - 70, -1.75, { curl: 0.15, lace: [236, 232, 220] });
      break;
    case 'spyglass':
      propSpyglass(g, cx - 170, H - 20, cx + 160, H - 200);
      arm(cx + 80, H - 30, 2.55, { curl: 0.75 });
      break;
    case 'doll':
      propDoll(g, cx, H - 150, rng);
      arm(cx - 92, H - 40, -2.3, { curl: 0.55, sleeve: [236, 232, 224], lace: [250, 248, 240] });
      arm(cx + 92, H - 36, 2.3, { curl: 0.55, mirror: true, sleeve: [236, 232, 224], lace: [250, 248, 240] });
      break;
    case 'boat':
      propBoat(g, cx + 5, H - 110);
      arm(cx - 95, H - 30, -2.55, { curl: 0.5 });
      arm(cx + 100, H - 28, 2.55, { curl: 0.5, mirror: true });
      break;
    case 'cane':
      propCane(g, cx + 6, H - 150);
      arm(cx - 110, H - 80, -2.0, { curl: 0.7, lace: [236, 232, 222] });
      arm(cx + 120, H - 100, 1.9, { curl: 0.35, mirror: true, lace: [236, 232, 222] });
      break;
    case 'letter':
      propLetter(g, cx - 4, H - 140, -0.18);
      arm(cx - 120, H - 60, -2.45, { curl: 0.35, lace: [34, 32, 36] });
      break;
    case 'bouquet':
      propBouquet(g, cx, H - 200, rng);
      arm(cx - 82, H - 40, -2.15, { curl: 0.7, sleeve: [236, 234, 226], lace: [250, 250, 244] });
      arm(cx + 84, H - 30, 2.15, { curl: 0.7, mirror: true, sleeve: [236, 234, 226], lace: [250, 250, 244] });
      break;
    case 'keys':
      propKeys(g, cx + 60, H - 150);
      arm(cx + 150, H - 50, 2.35, { curl: 0.65, mirror: true, lace: [222, 218, 206] });
      break;
    default:
  }
}

function inscription(g, lines, scratched, rng) {
  const y = H - 46;
  const gr = g.createLinearGradient(0, y - 8, 0, H);
  gr.addColorStop(0, 'rgba(10,8,6,0)');
  gr.addColorStop(0.4, 'rgba(10,8,6,0.55)');
  gr.addColorStop(1, 'rgba(10,8,6,0.75)');
  g.fillStyle = gr;
  g.fillRect(0, y - 8, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `22px ${FONT}`;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillText(lines[0], W / 2 + 1, y + 9);
  g.fillStyle = 'rgb(200,160,90)';
  g.fillText(lines[0], W / 2, y + 8);
  if (lines[1]) {
    g.font = `14px ${FONT}`;
    g.fillStyle = 'rgba(190,150,85,0.85)';
    g.fillText(lines[1], W / 2, y + 30);
  }
  if (scratched) {
    // the name gouged out, the gouges fresher than the paint
    for (let i = 0; i < 26; i++) {
      const x = W / 2 - 110 + rng() * 220;
      stroke(g, `rgba(${200 + rng() * 40},${180 + rng() * 30},150,0.75)`, 1 + rng() * 1.5, (q) => {
        q.moveTo(x, y - 4 + rng() * 6);
        q.lineTo(x + 20 + rng() * 40, y + 14 + rng() * 8);
      });
    }
  }
}

function scratchEyes(g, P, rng) {
  // the sitter's eyes were scraped out by somebody, long ago
  const h = P.head;
  const R = headWidth(h, P.face);
  for (const sd of [-1, 1]) {
    const ex = h.cx + sd * 0.42 * R;
    const ey = h.cy;
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2;
      const r0 = 9 + rng() * 4;
      const r1 = r0 + 6 + rng() * 22;
      stroke(g, `rgba(${210 + rng() * 30},${196 + rng() * 20},160,${0.35 + rng() * 0.4})`, 0.8 + rng(), (q) => {
        q.moveTo(ex + Math.cos(a) * r0, ey + Math.sin(a) * r0);
        q.lineTo(ex + Math.cos(a + (rng() - 0.5) * 0.4) * r1, ey + Math.sin(a + (rng() - 0.5) * 0.4) * r1);
      });
    }
    softEllipse(g, ex, ey, 12, 10, 'rgba(0,0,0,0.85)', 6);
  }
  // and a second, darker shape standing just behind her
  softEllipse(g, h.cx + 120, h.cy + 40, 70, 180, 'rgba(10,12,10,0.35)', 50);
  softEllipse(g, h.cx + 112, h.cy - 60, 40, 50, 'rgba(10,12,10,0.35)', 30);
}

export function paintPortrait(key) {
  const empty = key.endsWith('_empty');
  const P = PORTRAITS[empty ? key.slice(0, -6) : key];
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const rng = seeded(P.seed * 7919);
  background(g, P.bg, seeded(P.seed));
  paintSitter(g, P, rng, empty);
  if (P.scratched) scratchEyes(g, P, rng);
  inscription(g, P.title, P.scratched, rng);
  agePainting(g, W, H, seeded(P.seed + 5), { cracks: 80 });
  return c;
}

export function buildPortraits(renderer) {
  const out = {};
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const key of [...Object.keys(PORTRAITS), 'josiah_empty']) {
    const t = new THREE.CanvasTexture(paintPortrait(key));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    out[key] = t;
  }
  return out;
}
