import { seeded, rgba, mix, shade, soft, softEllipse, softStroke, stroke, fill, clipped, smoothPath, strands } from './brush.js';

// A head painted in the manner of a Victorian oil portrait: one warm key
// light from the upper left, soft modelling, and features built up in
// layers (sockets, lids, irises, catchlights, nose planes, lips, age).
//
// h = { cx, cy, s, turn, tilt }   cy is the eye line, s the crown-to-chin height
// f = face description (see PORTRAITS in portraits.js)

export const SKIN = {
  fair: [232, 200, 178],
  rosy: [236, 196, 170],
  pale: [222, 206, 196],
  olive: [206, 170, 132],
  weathered: [198, 150, 118],
  aged: [214, 184, 160],
  child: [240, 206, 186],
};

// Map a point given across the face (xn: -1 left edge .. 1 right edge, at
// depth d in front of the face's curve) to canvas x, for a head turned by
// `turn` radians around a vertical axis.
function makeProj(h, R) {
  const t = h.turn || 0;
  return (xn, d = 0) => {
    const a = Math.asin(Math.max(-1, Math.min(1, xn))) + t;
    return Math.sin(a) * R * (1 + d) - Math.sin(t) * R * 0.15;
  };
}

export function headWidth(h, f) {
  const ratio = f.child ? 0.43 : f.sex === 'm' ? 0.4 : 0.38;
  return h.s * ratio * (f.wide ?? 1);
}

// The head outline as canvas points in the head's local frame (origin at the
// middle of the eye line).
export function faceOutline(h, f) {
  const s = h.s;
  const R = headWidth(h, f);
  const P = makeProj(h, R);
  const jaw = f.jaw ?? 1;
  const cheek = f.cheek ?? 1;
  const chinW = (f.chin ?? 1) * (f.child ? 0.5 : 0.4);
  const pts = [
    [0, -0.52 * s],
    [0.62, -0.45 * s],
    [0.97, -0.25 * s],
    [1.0 * cheek, -0.02 * s],
    [0.97 * cheek, 0.12 * s],
    [0.86 * jaw, 0.29 * s],
    [chinW + 0.06, 0.44 * s],
    [0, 0.5 * s],
  ];
  const right = pts.map(([x, y]) => [P(x), y]);
  const left = pts
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [P(-x), y]);
  return [...right, ...left];
}

function eye(g, f, ex, ey, ew, side, rng, lightSide) {
  const ex2 = f.expr || {};
  const open = Math.max(0.15, (f.eyeOpen ?? 1) * (1 - (ex2.stern || 0) * 0.25 + (ex2.fear || 0) * 0.35 - (ex2.tired || 0) * 0.2));
  const eh = ew * (f.child ? 0.44 : 0.36) * open;
  const inner = side > 0 ? -1 : 1; // inner corner is toward the nose
  const ix = ex + (inner * ew) / 2;
  const ox = ex - (inner * ew) / 2;
  const droop = (ex2.sad || 0) * eh * 0.35;
  const peak = ex + inner * ew * 0.12;
  const upper = (q) => {
    q.moveTo(ix, ey);
    q.bezierCurveTo(ix - inner * ew * 0.12, ey - eh * 0.9, peak - inner * ew * 0.25, ey - eh * 1.05, ox + inner * ew * 0.12, ey - eh * 0.35 + droop);
    q.lineTo(ox, ey + droop * 0.4);
  };
  const lower = (q) => {
    q.bezierCurveTo(ox + inner * ew * 0.2, ey + eh * 0.55, ix - inner * ew * 0.25, ey + eh * 0.6, ix, ey);
  };
  const almond = (q) => {
    upper(q);
    lower(q);
    q.closePath();
  };
  const skin = f.skin;
  // socket and lid modelling
  softEllipse(g, ex + inner * ew * 0.05, ey - eh * 0.35, ew * 0.72, eh * 1.4, rgba(shade(skin, 0.5), lightSide ? 0.4 : 0.6), ew * 0.35);
  softEllipse(g, ex, ey - eh * 1.05, ew * 0.55, eh * 0.45, rgba(mix(skin, [250, 235, 220], 0.4), lightSide ? 0.35 : 0.15), ew * 0.2);
  if (f.age > 35 || (ex2.tired || 0) > 0) {
    const k = Math.min(1, (f.age - 30) / 45 + (ex2.tired || 0));
    softStroke(g, rgba(shade(skin, 0.5), 0.35 * k), ew * 0.12, ew * 0.08, (q) => {
      q.moveTo(ix - inner * ew * 0.05, ey + eh * 0.9);
      q.quadraticCurveTo(ex, ey + eh * 1.6, ox + inner * ew * 0.1, ey + eh * 0.8);
    });
  }
  if (f.hollowEyes) {
    // scraped-out sockets: dark holes with a scratched rim
    fill(g, 'rgb(12,8,6)', (q) => q.ellipse(ex, ey, ew * 0.42, ew * 0.36, 0, 0, Math.PI * 2));
    softEllipse(g, ex, ey, ew * 0.55, ew * 0.48, 'rgba(10,6,4,0.7)', ew * 0.25);
    return;
  }
  // eyeball
  clipped(g, almond, () => {
    const sg = g.createLinearGradient(0, ey - eh, 0, ey + eh * 0.6);
    sg.addColorStop(0, rgba([118, 100, 90], 1));
    sg.addColorStop(0.5, rgba([208, 196, 184], 1));
    sg.addColorStop(1, rgba([184, 170, 160], 1));
    g.fillStyle = sg;
    g.fillRect(ex - ew, ey - eh * 1.5, ew * 2, eh * 3);
    softEllipse(g, ox, ey, ew * 0.25, eh, 'rgba(120,90,80,0.45)', ew * 0.15);
    softEllipse(g, ix, ey, ew * 0.18, eh * 0.8, 'rgba(170,110,100,0.4)', ew * 0.12);
    // iris
    const look = f.look || [0, 0];
    const ir = ew * (f.child ? 0.27 : 0.235);
    const icx = ex + look[0] * ew * 0.18;
    const icy = ey + eh * 0.08 + look[1] * eh * 0.3 - (ex2.fear || 0) * eh * 0.1;
    const ic = f.eyeColor || [90, 70, 50];
    const igr = g.createRadialGradient(icx, icy, ir * 0.2, icx, icy, ir);
    igr.addColorStop(0, rgba(shade(ic, 0.6), 1));
    igr.addColorStop(0.55, rgba(mix(ic, [255, 255, 255], 0.12), 1));
    igr.addColorStop(0.85, rgba(ic, 1));
    igr.addColorStop(1, rgba(shade(ic, 0.35), 1));
    fill(g, igr, (q) => q.arc(icx, icy, ir, 0, Math.PI * 2));
    // fibres of the iris
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2 + rng() * 0.2;
      const c = rng() < 0.5 ? rgba(shade(ic, 0.5), 0.5) : rgba(mix(ic, [255, 240, 200], 0.4), 0.35);
      stroke(g, c, Math.max(0.6, ir * 0.06), (q) => {
        q.moveTo(icx + Math.cos(a) * ir * 0.45, icy + Math.sin(a) * ir * 0.45);
        q.lineTo(icx + Math.cos(a) * ir * 0.92, icy + Math.sin(a) * ir * 0.92);
      });
    }
    fill(g, 'rgb(14,10,9)', (q) => q.arc(icx, icy, ir * (f.child ? 0.44 : 0.4), 0, Math.PI * 2));
    // the upper lid shades the top of the eyeball
    const lg = g.createLinearGradient(0, ey - eh, 0, ey + eh * 0.1);
    lg.addColorStop(0, 'rgba(40,24,18,0.7)');
    lg.addColorStop(1, 'rgba(40,24,18,0)');
    g.fillStyle = lg;
    g.fillRect(ex - ew, ey - eh * 1.2, ew * 2, eh * 1.4);
    // catchlight
    softEllipse(g, icx - ir * 0.32, icy - ir * 0.38, ir * 0.16, ir * 0.13, 'rgba(255,250,240,0.95)', ir * 0.12);
    softEllipse(g, icx + ir * 0.35, icy + ir * 0.3, ir * 0.07, ir * 0.06, 'rgba(255,250,240,0.4)', ir * 0.08);
  });
  // lid crease, lash line, lower lid
  const lidC = shade(skin, 0.45);
  softStroke(g, rgba(lidC, 0.5), ew * 0.08, ew * 0.05, (q) => {
    q.moveTo(ix - inner * ew * 0.02, ey - eh * 0.55);
    q.bezierCurveTo(ix - inner * ew * 0.2, ey - eh * 1.55, ox + inner * ew * 0.35, ey - eh * 1.65 + droop, ox - inner * ew * 0.02, ey - eh * 0.6 + droop);
  });
  stroke(g, 'rgba(26,16,12,0.95)', Math.max(1, ew * (f.sex === 'f' ? 0.075 : 0.06)), upper);
  if (f.sex === 'f' && !f.child) {
    // lashes at the outer half
    for (let k = 0; k < 7; k++) {
      const t = 0.5 + k * 0.075;
      const x = ix + (ox - ix) * t;
      const y = ey - eh * (0.95 - Math.pow(t - 0.35, 2) * 2.4) + droop * t;
      stroke(g, 'rgba(20,12,10,0.7)', Math.max(0.6, ew * 0.025), (q) => {
        q.moveTo(x, y);
        q.lineTo(x - inner * ew * 0.08 * t, y - ew * 0.07);
      });
    }
  }
  stroke(g, rgba(shade(skin, 0.6), 0.6), Math.max(0.7, ew * 0.03), (q) => {
    q.moveTo(ox, ey + droop * 0.4);
    lower(q);
  });
  stroke(g, 'rgba(255,235,220,0.25)', Math.max(0.6, ew * 0.02), (q) => {
    q.moveTo(ox - inner * ew * 0.08, ey + eh * 0.5);
    q.quadraticCurveTo(ex, ey + eh * 0.82, ix - inner * ew * 0.1, ey + eh * 0.35);
  });
  if ((ex2.weep || 0) > 0) {
    // a tear track down the cheek
    softStroke(g, `rgba(255,250,245,${0.35 * ex2.weep})`, ew * 0.05, ew * 0.05, (q) => {
      q.moveTo(ix, ey + eh * 0.5);
      q.bezierCurveTo(ix - inner * ew * 0.05, ey + ew * 0.8, ix + inner * ew * 0.05, ey + ew * 1.4, ix - inner * ew * 0.08, ey + ew * 2.0);
    });
  }
}

function brow(g, f, ex, ey, ew, side, rng) {
  const ex2 = f.expr || {};
  const inner = side > 0 ? -1 : 1;
  const col = f.browColor || [60, 40, 28];
  const w = (f.browWeight ?? 1) * (f.sex === 'm' ? 1.25 : 0.85) * (f.child ? 0.7 : 1);
  const raiseIn = ((ex2.sad || 0) * 0.55 - (ex2.stern || 0) * 0.45 + (ex2.fear || 0) * 0.5) * ew;
  const raiseOut = ((ex2.fear || 0) * 0.3 - (ex2.sad || 0) * 0.1) * ew;
  const base = ey - ew * (f.child ? 0.62 : 0.55);
  const p0 = [ex + inner * ew * 0.62, base + ew * 0.06 - raiseIn];
  const p1 = [ex - inner * ew * 0.05, base - ew * (0.18 + (f.browArch ?? 0.1)) - (raiseIn + raiseOut) * 0.5];
  const p2 = [ex - inner * ew * 0.72, base + ew * 0.08 - raiseOut];
  const n = Math.round(46 * w);
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const a = 1 - t;
    const x = a * a * p0[0] + 2 * a * t * p1[0] + t * t * p2[0] + (rng() - 0.5) * ew * 0.05;
    const y = a * a * p0[1] + 2 * a * t * p1[1] + t * t * p2[1] + (rng() - 0.5) * ew * 0.08 * (1 - t * 0.5);
    const thick = (1 - t * 0.7) * ew * 0.12 * w;
    const ang = -inner * (0.9 - t * 0.9) - Math.PI / 2;
    const len = thick * (1.2 + rng());
    stroke(g, rgba(shade(col, 0.8 + rng() * 0.4), 0.35 + rng() * 0.3), Math.max(0.6, ew * 0.025), (q) => {
      q.moveTo(x, y + thick * 0.4);
      q.lineTo(x + Math.cos(ang) * len * 0.6, y + Math.sin(ang) * len * 0.6);
    });
  }
}

// Paint the face (skin, features, age) in the head's local frame; the caller
// has already translated to (cx, cy) and drawn the neck and hair behind.
export function paintFace(g, h, f, seed = 1) {
  const rng = seeded(seed);
  const s = h.s;
  const R = headWidth(h, f);
  const P = makeProj(h, R);
  const skin = f.skin;
  const ex2 = f.expr || {};
  const outline = faceOutline(h, f);
  const facePath = (q) => smoothPath(q, outline);

  // base flesh, lit from the upper left
  const lin = g.createLinearGradient(-R * 1.1, -s * 0.3, R * 1.1, s * 0.3);
  lin.addColorStop(0, rgba(mix(skin, [255, 240, 225], 0.15), 1));
  lin.addColorStop(0.45, rgba(skin, 1));
  lin.addColorStop(0.75, rgba(shade(skin, 0.66), 1));
  lin.addColorStop(1, rgba(shade(skin, 0.44), 1));
  fill(g, lin, facePath);

  clipped(g, facePath, () => {
    // form shadows, and the soft edge where light turns to shadow
    softEllipse(g, R * 0.95, s * 0.1, R * 0.5, s * 0.55, rgba(shade(skin, 0.4), 0.65), R * 0.35);
    softStroke(g, rgba(shade(skin, 0.5), 0.35), R * 0.18, R * 0.16, (q) => {
      q.moveTo(P(0.7), -s * 0.3);
      q.bezierCurveTo(P(0.78), -s * 0.05, P(0.62), s * 0.2, P(0.35), s * 0.42);
    });
    // temples and the hollow under the cheekbone
    softEllipse(g, P(-0.85), -s * 0.18, R * 0.18, s * 0.12, rgba(shade(skin, 0.7), 0.3), R * 0.12);
    softEllipse(g, P(0.62), s * 0.2, R * 0.2, s * 0.08, rgba(shade(skin, 0.55), 0.3), R * 0.12);
    softEllipse(g, 0, s * 0.48, R * 0.9, s * 0.12, rgba(shade(skin, 0.5), 0.45), R * 0.25);
    // light on the brow, cheek and chin
    softEllipse(g, P(-0.3), -s * 0.3, R * 0.7, s * 0.14, rgba(mix(skin, [255, 248, 236], 0.45), 0.55), R * 0.3);
    softEllipse(g, P(-0.55), s * 0.12, R * 0.32, s * 0.1, rgba(mix(skin, [255, 246, 232], 0.35), 0.45), R * 0.25);
    softEllipse(g, P(-0.05), s * 0.42, R * 0.22, s * 0.05, rgba(mix(skin, [255, 246, 232], 0.3), 0.4), R * 0.15);
    // the lit triangle on the shadow cheek
    soft(g, rgba(mix(skin, [255, 240, 220], 0.15), 0.4), R * 0.12, (q) => {
      q.moveTo(P(0.25), s * 0.05);
      q.lineTo(P(0.62), s * 0.06);
      q.lineTo(P(0.3), s * 0.2);
      q.closePath();
    });
    // warmth in the cheeks, nose and ears
    const blush = (f.blush ?? (f.child ? 0.5 : f.sex === 'f' ? 0.25 : 0.12)) * (f.pallor ? 0.2 : 1);
    softEllipse(g, P(-0.55), s * 0.14, R * 0.28, s * 0.08, `rgba(205,85,75,${0.22 * blush})`, R * 0.25);
    softEllipse(g, P(0.55), s * 0.14, R * 0.25, s * 0.08, `rgba(190,80,70,${0.18 * blush})`, R * 0.25);
    softEllipse(g, P(0, 0.3), s * 0.19, R * 0.12, s * 0.05, `rgba(200,90,80,${0.15 * blush})`, R * 0.1);
    if (f.pallor) {
      // grey, bloodless
      g.save();
      g.globalCompositeOperation = 'saturation';
      g.fillStyle = `rgba(128,128,128,${f.pallor})`;
      g.fillRect(-R * 1.5, -s * 0.6, R * 3, s * 1.2);
      g.restore();
    }
  });

  // eyes and brows
  const ew = (f.child ? 0.18 : 0.158) * s * (f.eyeSize ?? 1);
  const eyX = 0.42;
  const L = [P(-eyX), 0];
  const Rr = [P(eyX), 0];
  eye(g, f, L[0], L[1], ew * (1 + (h.turn || 0) * 0.25), -1, rng, true);
  eye(g, f, Rr[0], Rr[1], ew * (1 - (h.turn || 0) * 0.25), 1, rng, false);
  if (!f.noBrows) {
    brow(g, f, L[0], L[1], ew, -1, rng);
    brow(g, f, Rr[0], Rr[1], ew, 1, rng);
  }

  // nose
  const nl = (f.noseLen ?? 1) * (f.child ? 0.17 : 0.22) * s;
  const nw = (f.noseW ?? 1) * (f.child ? 0.13 : 0.16) * R * 2 * 0.5;
  const tipX = P(0, 0.32);
  const bridgeX = P(0, 0.12);
  softStroke(g, rgba(shade(skin, 0.45), 0.7), R * 0.08, R * 0.09, (q) => {
    q.moveTo(bridgeX + R * 0.1, s * 0.0);
    q.quadraticCurveTo(tipX + R * 0.16, nl * 0.6, tipX + nw * 0.55, nl * 0.95);
  });
  softStroke(g, rgba(mix(skin, [255, 248, 238], 0.5), 0.5), R * 0.05, R * 0.045, (q) => {
    q.moveTo(bridgeX - R * 0.04, s * 0.03);
    q.lineTo(tipX - R * 0.02, nl * 0.8);
  });
  softEllipse(g, tipX - nw * 0.1, nl * 0.86, nw * 0.35, nl * 0.08, rgba(mix(skin, [255, 250, 240], 0.55), 0.6), R * 0.06);
  // nostrils and wings
  for (const sd of [-1, 1]) {
    const nx = tipX + sd * nw * 0.55;
    softEllipse(g, nx, nl * 1.0, nw * 0.22, nl * 0.06, `rgba(60,30,25,${sd > 0 ? 0.75 : 0.6})`, R * 0.025);
    softStroke(g, rgba(shade(skin, 0.55), 0.45), R * 0.04, R * 0.035, (q) => {
      q.moveTo(nx + sd * nw * 0.15, nl * 0.82);
      q.quadraticCurveTo(nx + sd * nw * 0.45, nl * 0.95, nx + sd * nw * 0.1, nl * 1.06);
    });
  }
  softEllipse(g, tipX + R * 0.12, nl * 1.15, nw * 0.9, nl * 0.08, rgba(shade(skin, 0.42), 0.55), R * 0.08);

  // mouth
  const my = s * 0.315 * (f.child ? 0.97 : 1);
  const mw = R * (f.mouthW ?? (f.child ? 0.4 : 0.5));
  const lh = s * (f.lips ?? 1) * (f.sex === 'f' ? 0.055 : 0.04);
  const smile = (ex2.smile || 0) - (ex2.sad || 0) * 0.6 - (ex2.stern || 0) * 0.4;
  const open = ex2.open || 0;
  const mx = P(0, 0.18);
  const cornerY = my - smile * lh * 0.6;
  const lipCol = f.lipColor || mix(skin, [168, 82, 74], f.sex === 'f' ? 0.34 : 0.22);
  // philtrum and the shadow below the lower lip
  softEllipse(g, mx, my - lh * 1.4, mw * 0.12, lh * 0.7, rgba(shade(skin, 0.7), 0.3), R * 0.05);
  softEllipse(g, mx + R * 0.05, my + lh * 1.6 + open * lh * 2, mw * 0.55, lh * 0.45, rgba(shade(skin, 0.5), 0.45), R * 0.08);
  // upper lip (a soft under-layer keeps the edges painterly)
  soft(g, rgba(shade(lipCol, 0.8), 0.6), lh * 0.5, (q) => q.ellipse(mx, my, mw * 0.95, lh * 1.1, 0, 0, Math.PI * 2));
  fill(g, rgba(shade(lipCol, 0.78), 0.8), (q) => {
    q.moveTo(mx - mw, cornerY);
    q.bezierCurveTo(mx - mw * 0.55, my - lh * 0.5, mx - mw * 0.25, my - lh * 1.05, mx, my - lh * 0.72);
    q.bezierCurveTo(mx + mw * 0.25, my - lh * 1.05, mx + mw * 0.55, my - lh * 0.5, mx + mw, cornerY);
    q.quadraticCurveTo(mx, my + lh * 0.15 + open * lh * 0.3, mx - mw, cornerY);
  });
  // lower lip
  const lo = my + open * lh * 2.2;
  const lg = g.createLinearGradient(0, lo, 0, lo + lh * 1.4);
  lg.addColorStop(0, rgba(lipCol, 0.95));
  lg.addColorStop(1, rgba(shade(lipCol, 0.75), 0.9));
  g.globalAlpha = 0.85;
  fill(g, lg, (q) => {
    q.moveTo(mx - mw * 0.95, cornerY + open * lh);
    q.quadraticCurveTo(mx, lo - lh * 0.1, mx + mw * 0.95, cornerY + open * lh);
    q.bezierCurveTo(mx + mw * 0.6, lo + lh * 1.25, mx - mw * 0.6, lo + lh * 1.25, mx - mw * 0.95, cornerY + open * lh);
  });
  g.globalAlpha = 1;
  softEllipse(g, mx - mw * 0.15, lo + lh * 0.55, mw * 0.3, lh * 0.18, 'rgba(255,240,230,0.3)', lh * 0.3);
  if (open > 0.05) {
    fill(g, 'rgb(28,12,12)', (q) => {
      q.moveTo(mx - mw * 0.85, cornerY + open * lh * 0.4);
      q.quadraticCurveTo(mx, my - lh * 0.1 + open * lh * 0.2, mx + mw * 0.85, cornerY + open * lh * 0.4);
      q.quadraticCurveTo(mx, lo + lh * 0.1, mx - mw * 0.85, cornerY + open * lh * 0.4);
    });
  }
  stroke(g, 'rgba(56,26,22,0.7)', Math.max(0.8, lh * 0.1), (q) => {
    q.moveTo(mx - mw, cornerY);
    q.quadraticCurveTo(mx, my + lh * 0.12 + open * lh * 0.5, mx + mw, cornerY);
  });
  for (const sd of [-1, 1]) softEllipse(g, mx + sd * mw * 1.02, cornerY, lh * 0.25, lh * 0.25, 'rgba(60,30,26,0.45)', lh * 0.3);

  // age: folds, lines, bags
  const age = f.age || 30;
  if (age > 32 && !f.child) {
    const k = Math.min(1, (age - 32) / 40) * (f.lines ?? 1);
    for (const sd of [-1, 1]) {
      softStroke(g, rgba(shade(skin, 0.5), 0.45 * k), R * 0.05, R * 0.05, (q) => {
        q.moveTo(tipX + sd * nw * 0.9, nl * 0.95);
        q.quadraticCurveTo(mx + sd * mw * 1.25, my - lh * 0.4, mx + sd * mw * 1.15, my + lh * 1.6);
      });
      softStroke(g, rgba(mix(skin, [255, 245, 235], 0.3), 0.3 * k), R * 0.04, R * 0.03, (q) => {
        q.moveTo(tipX + sd * nw * 1.05, nl * 0.98);
        q.quadraticCurveTo(mx + sd * mw * 1.38, my - lh * 0.3, mx + sd * mw * 1.25, my + lh * 1.5);
      });
    }
    if (age > 45) {
      // crow's feet and forehead lines
      for (const [x0, sd] of [
        [L[0], -1],
        [Rr[0], 1],
      ]) {
        for (let i = 0; i < 3; i++) {
          stroke(g, rgba(shade(skin, 0.55), 0.25 * k), 0.8, (q) => {
            const ox = x0 + sd * ew * 0.62;
            q.moveTo(ox, -ew * 0.05 + i * ew * 0.12);
            q.lineTo(ox + sd * ew * 0.3, -ew * 0.15 + i * ew * 0.2);
          });
        }
      }
      for (let i = 0; i < 3; i++) {
        softStroke(g, rgba(shade(skin, 0.6), 0.3 * k), R * 0.03, R * 0.025, (q) => {
          const y = -s * (0.22 + i * 0.055);
          q.moveTo(P(-0.55), y + R * 0.02);
          q.quadraticCurveTo(P(0), y - R * 0.04, P(0.55), y + R * 0.02);
        });
      }
    }
    if (age > 60) {
      // jowls and a slackened jaw
      for (const sd of [-1, 1]) softEllipse(g, mx + sd * mw * 1.5, my + lh * 2.5, R * 0.18, s * 0.06, rgba(shade(skin, 0.6), 0.35 * k), R * 0.1);
      for (let i = 0; i < 10; i++) softEllipse(g, P(rng() * 1.4 - 0.7), -s * (0.1 + rng() * 0.3), R * 0.03, R * 0.025, 'rgba(140,90,60,0.18)', R * 0.03);
    }
  }
  if (f.freckles) {
    for (let i = 0; i < 60 * f.freckles; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng());
      softEllipse(g, P(0, 0.2) + Math.cos(a) * r * R * 0.7, s * 0.1 + Math.sin(a) * r * s * 0.09, 1.2, 1.1, 'rgba(150,80,50,0.45)', 1.2);
    }
  }
  if (f.stubble) {
    clipped(g, facePath, () => {
      softEllipse(g, mx, my + lh, R * 0.85, s * 0.2, `rgba(60,45,40,${0.18 * f.stubble})`, R * 0.2);
    });
  }
}

// The neck and the shadow the jaw casts on it.
export function paintNeck(g, h, f, bottom) {
  const s = h.s;
  const R = headWidth(h, f);
  const nw = R * (f.child ? 0.5 : f.sex === 'm' ? 0.6 : 0.44);
  const x = (h.turn || 0) * -R * 0.15;
  const skin = f.skin;
  const gr = g.createLinearGradient(x - nw, 0, x + nw, 0);
  gr.addColorStop(0, rgba(shade(skin, 0.85), 1));
  gr.addColorStop(0.6, rgba(shade(skin, 0.72), 1));
  gr.addColorStop(1, rgba(shade(skin, 0.5), 1));
  fill(g, gr, (q) => {
    q.moveTo(x - nw, s * 0.25);
    q.quadraticCurveTo(x - nw * 0.9, bottom * 0.7, x - nw * 1.12, bottom);
    q.lineTo(x + nw * 1.12, bottom);
    q.quadraticCurveTo(x + nw * 0.9, bottom * 0.7, x + nw, s * 0.25);
    q.closePath();
  });
  softEllipse(g, x + R * 0.1, s * 0.52, nw * 1.1, s * 0.07, rgba(shade(skin, 0.4), 0.7), R * 0.12);
  if (f.age > 55) {
    for (const sd of [-1, 1]) {
      softStroke(g, rgba(shade(skin, 0.55), 0.4), R * 0.05, R * 0.05, (q) => {
        q.moveTo(x + sd * nw * 0.35, s * 0.52);
        q.lineTo(x + sd * nw * 0.5, bottom);
      });
    }
  }
}

// Ears, for heads whose hair leaves them showing. Drawn before the face.
export function paintEars(g, h, f) {
  const s = h.s;
  const R = headWidth(h, f);
  const P = makeProj(h, R);
  const skin = f.skin;
  for (const sd of [-1, 1]) {
    const x = P(sd * 0.98);
    const far = sd * (h.turn || 0) > 0;
    const w = R * (far ? 0.14 : 0.2);
    const gr = g.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, rgba(shade(skin, sd < 0 ? 0.95 : 0.6), 1));
    gr.addColorStop(1, rgba(shade(skin, sd < 0 ? 0.75 : 0.45), 1));
    fill(g, gr, (q) => {
      q.moveTo(x, -s * 0.07);
      q.bezierCurveTo(x + sd * w * 1.6, -s * 0.1, x + sd * w * 1.5, s * 0.12, x + sd * w * 0.6, s * 0.2);
      q.bezierCurveTo(x + sd * w * 0.2, s * 0.23, x, s * 0.18, x, s * 0.12);
      q.closePath();
    });
    stroke(g, rgba(shade(skin, 0.45), 0.7), Math.max(0.8, w * 0.12), (q) => {
      q.moveTo(x + sd * w * 0.3, -s * 0.04);
      q.bezierCurveTo(x + sd * w * 1.1, -s * 0.05, x + sd * w * 1.05, s * 0.09, x + sd * w * 0.45, s * 0.12);
    });
    softEllipse(g, x + sd * w * 0.55, s * 0.05, w * 0.35, s * 0.05, `rgba(190,80,70,0.25)`, w * 0.3);
  }
}
