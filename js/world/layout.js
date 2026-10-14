// Shared dimensions of Ravenmoor House (metres). x = east, z = toward the
// street, y = up. The front door is at x = 0, z = 6.
export const Y = {
  cellar: -2.0,
  cellarTop: 0.55,
  g: 0.9,
  gCeil: 4.4,
  f2: 4.7,
  f2Ceil: 8.0,
  attic: 8.3,
  atticTop: 11.0,
  deck: 11.15,
  porch: 0.85,
};

export const EXT = 0.3;
export const INT = 0.14;

export const TURRET = { cx: 7, cz: 6, R: 2.3 };

// Octagon vertices (angle 22.5 + 45k from +x toward +z).
export function turretVerts(R = TURRET.R, cx = TURRET.cx, cz = TURRET.cz) {
  const v = [];
  for (let k = 0; k < 8; k++) {
    const a = ((22.5 + 45 * k) * Math.PI) / 180;
    v.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]);
  }
  return v;
}

// The turret boundary outside the main block (x <= 7 && z <= 6 is inside).
export function turretOuterSegments() {
  const v = turretVerts();
  const inside = (p) => p[0] <= 7 + 1e-6 && p[1] <= 6 + 1e-6;
  const segs = [];
  for (let k = 0; k < 8; k++) {
    const a = v[k];
    const b = v[(k + 1) % 8];
    // clip [a,b] against the quadrant; keep outside pieces
    let t0 = 0;
    let t1 = 1;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    // inside interval of x <= 7 and z <= 6
    const clip = (p, q) => {
      // p * t <= q
      if (Math.abs(p) < 1e-9) return q >= 0;
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      return true;
    };
    const okX = clip(dx, 7 - a[0]);
    const okZ = clip(dz, 6 - a[1]);
    const lerpP = (t) => [a[0] + dx * t, a[1] + dz * t];
    if (!okX || !okZ || t0 >= t1) {
      if (!inside(lerpP(0.5))) segs.push([a, b]);
      continue;
    }
    if (t0 > 1e-6) segs.push([a, lerpP(t0)]);
    if (t1 < 1 - 1e-6) segs.push([lerpP(t1), b]);
  }
  // order: walk counter-clockwise from the front wall junction
  return segs;
}
