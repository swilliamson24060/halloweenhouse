import { canvas, seeded, soft, softEllipse, softStroke, stroke } from '../gfx/brush.js';
import { paintFace } from '../gfx/face.js';

// Each apparition's own face, painted with the portrait painter in a
// bloodless palette and laid out for the face cap on its sculpted head
// (figure.js FACE_CAP): x runs round the head from 20 to 160 degrees, y down
// from 45 to 155 degrees, so the eyes sit at (0.5 +/- 0.126, 0.389).

const S = 256;
const EYE_Y = 0.389;
const EYE_X = 0.126;

// A moustache over the upper lip, from under the nostrils to the mouth's
// corners: plain ones droop at the ends, a waxed one turns up and curls.
function moustache(g, cx, cy, w, h, droop, color, curled, rng) {
  soft(g, color, h * 0.25, (q) => {
    q.moveTo(cx, cy - h * 0.45);
    q.bezierCurveTo(cx + w * 0.35, cy - h * 0.7, cx + w * 0.8, cy - h * 0.25, cx + w, cy + droop);
    q.bezierCurveTo(cx + w * 0.75, cy + h * 0.2, cx + w * 0.35, cy + h * 0.45, cx, cy + h * 0.25);
    q.bezierCurveTo(cx - w * 0.35, cy + h * 0.45, cx - w * 0.75, cy + h * 0.2, cx - w, cy + droop);
    q.bezierCurveTo(cx - w * 0.8, cy - h * 0.25, cx - w * 0.35, cy - h * 0.7, cx, cy - h * 0.45);
    q.closePath();
  });
  if (curled) {
    for (const sd of [-1, 1]) {
      softStroke(g, color, h * 0.1, h * 0.16, (q) => {
        q.moveTo(cx + sd * w * 0.9, cy + droop);
        q.quadraticCurveTo(cx + sd * w * 1.3, cy + droop, cx + sd * w * 1.22, cy + droop - h * 0.6);
      });
    }
  }
  // hairs combed out from the parting
  for (let i = 0; i < 14; i++) {
    const sd = i % 2 ? 1 : -1;
    const t = 0.15 + (i >> 1) * 0.12;
    stroke(g, `rgba(255,255,255,${0.08 + rng() * 0.1})`, 0.8, (q) => {
      q.moveTo(cx + sd * w * t * 0.5, cy - h * 0.3);
      q.quadraticCurveTo(cx + sd * w * t, cy, cx + sd * w * Math.min(1, t + 0.15), cy + droop * t + h * 0.15);
    });
  }
}

export function paintGhostFace(spec, seed = 1) {
  const f = spec.face || {};
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const age = f.age ?? (spec.child ? 9 : 40);
  const tone = spec.child ? [196, 202, 214] : age > 60 ? [168, 172, 182] : spec.sex === 'm' ? [178, 184, 196] : [188, 194, 206];
  // expressions read a little stronger on the dead
  const expr = {};
  for (const [k, v] of Object.entries(f.expr || {})) expr[k] = Math.min(1, v * 1.3);
  const face = {
    sex: spec.sex,
    child: !!spec.child,
    age,
    skin: f.skin || tone,
    eyeColor: f.eyeColor || [96, 112, 130],
    browColor: f.browColor || (age > 60 ? [222, 222, 228] : [52, 54, 66]),
    lipColor: f.lipColor || [128, 112, 126],
    lines: age > 55 ? 1.7 : 1.2,
    pallor: 1,
    blush: 0,
    ...f,
    expr,
  };
  g.save();
  g.translate(S / 2, S * EYE_Y);
  g.scale(0.72, 1);
  paintFace(g, { s: S * 1.094, turn: 0 }, face, seed);
  g.restore();
  const rng = seeded(seed * 31);
  // facial hair is painted on the face as well as sculpted on the head, in
  // the colour of the brows (white on the old)
  const fh = spec.facialHair;
  const hc = face.browColor;
  const hair = (a) => `rgba(${hc[0]},${hc[1]},${hc[2]},${a})`;
  if (f.stubble || (spec.sex === 'm' && !fh)) softEllipse(g, S * 0.5, S * 0.8, S * 0.22, S * 0.12, `rgba(60,64,74,${0.12 + (f.stubble || 0) * 0.2})`, S * 0.05);
  if (fh === 'full' || fh === 'beard' || fh === 'long') {
    softEllipse(g, S * 0.5, S * 0.88, S * 0.27, S * 0.15, hair(0.7), S * 0.04);
    // the beard climbs the jaw to meet the sideburns
    for (const sd of [-1, 1]) softEllipse(g, S * (0.5 + sd * 0.38), S * 0.72, S * 0.07, S * 0.15, hair(0.5), S * 0.04);
  } else if (fh === 'muttonchops') {
    for (const sd of [-1, 1]) {
      const X = (u) => S * (0.5 + sd * u);
      soft(g, hair(0.72), S * 0.025, (q) => {
        q.moveTo(X(0.45), S * 0.32);
        q.quadraticCurveTo(X(0.49), S * 0.62, X(0.43), S * 0.8);
        q.quadraticCurveTo(X(0.32), S * 0.84, X(0.18), S * 0.74);
        q.quadraticCurveTo(X(0.3), S * 0.68, X(0.36), S * 0.56);
        q.quadraticCurveTo(X(0.38), S * 0.44, X(0.37), S * 0.32);
        q.closePath();
      });
      // combed strands
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        stroke(g, `rgba(255,255,255,${0.12 + rng() * 0.12})`, 1, (q) => {
          q.moveTo(X(0.44 - t * 0.05), S * (0.36 + t * 0.3));
          q.quadraticCurveTo(X(0.42 - t * 0.08), S * (0.5 + t * 0.25), X(0.3 - t * 0.08), S * (0.76 - t * 0.02));
        });
      }
    }
  }
  if (fh) moustache(g, S * 0.5, S * 0.685, S * (fh === 'curled' ? 0.19 : 0.17), S * 0.09, fh === 'curled' ? -S * 0.02 : S * 0.045, hair(0.85), fh === 'curled', rng);
  // the dead look out of shadow: deepen the sockets, hollow the cheeks
  const gaunt = 0.6 + (f.gaunt ?? 0) + (face.age > 60 ? 0.2 : 0);
  for (const sd of [-1, 1]) {
    softEllipse(g, S * (0.5 + sd * EYE_X), S * (EYE_Y - 0.01), S * 0.07, S * 0.05, `rgba(30,34,44,${0.35 * gaunt})`, S * 0.04);
    softEllipse(g, S * (0.5 + sd * 0.2), S * 0.6, S * 0.05, S * 0.08, `rgba(40,44,54,${0.25 * gaunt})`, S * 0.05);
  }
  if (f.wet) {
    // water running from the hair down the face
    for (let i = 0; i < 14; i++) {
      const x = S * (0.3 + rng() * 0.4);
      softStroke(g, `rgba(235,245,250,${0.25 + rng() * 0.25})`, 2, 1.5, (q) => {
        q.moveTo(x, S * 0.12);
        q.bezierCurveTo(x + (rng() - 0.5) * 8, S * 0.4, x + (rng() - 0.5) * 10, S * 0.6, x + (rng() - 0.5) * 12, S * (0.7 + rng() * 0.25));
      });
    }
    // hair plastered to the brow
    for (let i = 0; i < 9; i++) {
      const x = S * (0.32 + i * 0.045);
      softStroke(g, 'rgba(40,52,58,0.55)', 2, 3, (q) => {
        q.moveTo(x, S * 0.05);
        q.quadraticCurveTo(x + (rng() - 0.5) * 12, S * 0.14, x + (rng() - 0.5) * 16, S * (0.2 + rng() * 0.06));
      });
    }
  }
  // features stay solid while the skin between them turns to mist
  const id = g.getImageData(0, 0, S, S);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const L = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    const k = Math.max(0.42, Math.min(1, 0.5 + (0.72 - L) * 2.2));
    d[i + 3] = d[i + 3] * k;
  }
  g.putImageData(id, 0, 0);
  // melt the edge of the face into the head
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createRadialGradient(S / 2, S * 0.5, S * 0.2, S / 2, S * 0.48, S * 0.48);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(0.7, 'rgba(0,0,0,0.85)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}
