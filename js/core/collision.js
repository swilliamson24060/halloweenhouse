// Lightweight collision for a walking player: 2.5D colliders (rectangles,
// rotated rectangles and circles with a vertical extent) plus analytic
// "walkable" surfaces (floors, ramps for stairs, and a terrain function).

const BOX = 0;
const OBB = 1;
const CIRCLE = 2;

export class CollisionWorld {
  constructor() {
    this.colliders = [];
    this.walkables = [];
    this.cell = 4;
    this.grid = new Map();
    this.terrain = null;
    this.terrainTag = () => 'grass';
    this._stamp = 0;
    this._found = [];
    // While set, new colliders are shrunk by this much on every side. Used
    // for furniture, so the walker can brush past an edge instead of
    // snagging on it a hand's width early.
    this.inset = 0;
  }

  _shrink(h) {
    return this.inset > 0 ? Math.max(Math.min(h, 0.06), h - this.inset) : h;
  }

  _k(ix, iz) {
    return (ix + 1024) * 4096 + (iz + 1024);
  }

  _insert(c, x0, z0, x1, z1) {
    const cs = this.cell;
    const ix0 = Math.floor(x0 / cs);
    const ix1 = Math.floor(x1 / cs);
    const iz0 = Math.floor(z0 / cs);
    const iz1 = Math.floor(z1 / cs);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = this._k(ix, iz);
        let list = this.grid.get(k);
        if (!list) {
          list = [];
          this.grid.set(k, list);
        }
        list.push(c);
      }
    }
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = null) {
    let x0 = Math.min(minX, maxX);
    let x1 = Math.max(minX, maxX);
    let z0 = Math.min(minZ, maxZ);
    let z1 = Math.max(minZ, maxZ);
    if (this.inset > 0) {
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const hx = this._shrink((x1 - x0) / 2);
      const hz = this._shrink((z1 - z0) / 2);
      x0 = cx - hx;
      x1 = cx + hx;
      z0 = cz - hz;
      z1 = cz + hz;
    }
    const c = {
      type: BOX,
      minX: x0,
      maxX: x1,
      minZ: z0,
      maxZ: z1,
      minY: Math.min(minY, maxY),
      maxY: Math.max(minY, maxY),
      enabled: true,
      tag,
      _q: 0,
    };
    this.colliders.push(c);
    this._insert(c, c.minX, c.minZ, c.maxX, c.maxZ);
    return c;
  }

  // Rotated rectangle: centre, half extents along its local axes, yaw angle.
  addOBB(cx, cz, hx, hz, angle, minY, maxY, tag = null) {
    if (Math.abs(Math.sin(angle)) < 1e-6 || Math.abs(Math.cos(angle)) < 1e-6) {
      // axis aligned after all (addBox applies any inset)
      const swap = Math.abs(Math.sin(angle)) > 0.5;
      const ex = swap ? hz : hx;
      const ez = swap ? hx : hz;
      return this.addBox(cx - ex, minY, cz - ez, cx + ex, maxY, cz + ez, tag);
    }
    hx = this._shrink(hx);
    hz = this._shrink(hz);
    const c = {
      type: OBB,
      cx,
      cz,
      hx,
      hz,
      c: Math.cos(angle),
      s: Math.sin(angle),
      minY,
      maxY,
      enabled: true,
      tag,
      _q: 0,
    };
    this.colliders.push(c);
    const ex = Math.abs(hx * c.c) + Math.abs(hz * c.s);
    const ez = Math.abs(hx * c.s) + Math.abs(hz * c.c);
    this._insert(c, cx - ex, cz - ez, cx + ex, cz + ez);
    return c;
  }

  // Segment-shaped wall between two points with thickness t.
  addSegment(x1, z1, x2, z2, t, minY, maxY, tag = null) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dz, dx);
    return this.addOBB((x1 + x2) / 2, (z1 + z2) / 2, len / 2, t / 2, ang, minY, maxY, tag);
  }

  addCircle(cx, cz, r, minY, maxY, tag = null) {
    r = this._shrink(r);
    const c = { type: CIRCLE, cx, cz, r, minY, maxY, enabled: true, tag, _q: 0 };
    this.colliders.push(c);
    this._insert(c, cx - r, cz - r, cx + r, cz + r);
    return c;
  }

  // Horizontal occluder used only for line-of-sight tests (floors/ceilings).
  addSlab(minX, maxX, minZ, maxZ, y0, y1) {
    const c = this.addBox(minX, y0, minZ, maxX, y1, maxZ, 'slab');
    c.losOnly = true;
    return c;
  }

  // A circle that will move around inside `bounds` [x0, z0, x1, z1].
  addDynamicCircle(cx, cz, r, minY, maxY, bounds) {
    r = this._shrink(r);
    const c = { type: CIRCLE, cx, cz, r, minY, maxY, enabled: true, tag: 'dynamic', _q: 0 };
    this.colliders.push(c);
    this._insert(c, bounds[0] - r, bounds[1] - r, bounds[2] + r, bounds[3] + r);
    return c;
  }

  addFloor(minX, maxX, minZ, maxZ, y, tag = 'wood') {
    const w = {
      type: 'rect',
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxZ: Math.max(minZ, maxZ),
      y,
      tag,
      enabled: true,
    };
    this.walkables.push(w);
    return w;
  }

  // Ramp: height goes from y0 at coordinate a0 to y1 at a1 along axis ('x'|'z').
  addRamp(minX, maxX, minZ, maxZ, axis, a0, a1, y0, y1, tag = 'wood') {
    const w = {
      type: 'ramp',
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxZ: Math.max(minZ, maxZ),
      axis,
      a0,
      a1,
      y0,
      y1,
      tag,
      enabled: true,
    };
    this.walkables.push(w);
    return w;
  }

  addFloorCircle(cx, cz, r, y, tag = 'wood') {
    const w = { type: 'circle', cx, cz, r, y, tag, enabled: true };
    this.walkables.push(w);
    return w;
  }

  setTerrain(fn, tagFn = null) {
    this.terrain = fn;
    if (tagFn) this.terrainTag = tagFn;
  }

  // Highest walkable surface at (x,z) whose height is <= maxY.
  groundAt(x, z, maxY, out = { y: -Infinity, tag: null }) {
    out.y = -Infinity;
    out.tag = null;
    for (const w of this.walkables) {
      if (!w.enabled) continue;
      let h;
      if (w.type === 'circle') {
        const dx = x - w.cx;
        const dz = z - w.cz;
        if (dx * dx + dz * dz > w.r * w.r) continue;
        h = w.y;
      } else {
        if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
        if (w.type === 'rect') h = w.y;
        else {
          const c = w.axis === 'x' ? x : z;
          let t = (c - w.a0) / (w.a1 - w.a0);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          h = w.y0 + (w.y1 - w.y0) * t;
        }
      }
      if (h <= maxY && h > out.y) {
        out.y = h;
        out.tag = w.tag;
      }
    }
    if (this.terrain) {
      const h = this.terrain(x, z);
      if (h <= maxY && h > out.y) {
        out.y = h;
        out.tag = this.terrainTag(x, z);
      }
    }
    return out;
  }

  _query(x0, z0, x1, z1) {
    const found = this._found;
    found.length = 0;
    const stamp = ++this._stamp;
    const cs = this.cell;
    const ix0 = Math.floor(x0 / cs);
    const ix1 = Math.floor(x1 / cs);
    const iz0 = Math.floor(z0 / cs);
    const iz1 = Math.floor(z1 / cs);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const list = this.grid.get(this._k(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (c._q === stamp || !c.enabled) continue;
          c._q = stamp;
          found.push(c);
        }
      }
    }
    return found;
  }

  // Push a vertical cylinder (feet at y, height h, radius r) out of colliders.
  // pos is {x, z}; modified in place. Returns true if anything was hit.
  resolve(pos, y, h, r, step = 0.42) {
    let hit = false;
    for (let iter = 0; iter < 4; iter++) {
      const list = this._query(pos.x - r, pos.z - r, pos.x + r, pos.z + r);
      let moved = false;
      for (const c of list) {
        if (c.losOnly || c.maxY <= y + step || c.minY >= y + h) continue;
        if (c.type === CIRCLE) {
          const dx = pos.x - c.cx;
          const dz = pos.z - c.cz;
          const d = Math.hypot(dx, dz);
          const m = c.r + r;
          if (d < m) {
            if (d > 1e-6) {
              pos.x += (dx / d) * (m - d);
              pos.z += (dz / d) * (m - d);
            } else pos.x += m;
            moved = hit = true;
          }
          continue;
        }
        let lx;
        let lz;
        let hx;
        let hz;
        if (c.type === BOX) {
          hx = (c.maxX - c.minX) / 2;
          hz = (c.maxZ - c.minZ) / 2;
          lx = pos.x - (c.minX + c.maxX) / 2;
          lz = pos.z - (c.minZ + c.maxZ) / 2;
        } else {
          const dx = pos.x - c.cx;
          const dz = pos.z - c.cz;
          lx = dx * c.c + dz * c.s;
          lz = -dx * c.s + dz * c.c;
          hx = c.hx;
          hz = c.hz;
        }
        const qx = lx < -hx ? -hx : lx > hx ? hx : lx;
        const qz = lz < -hz ? -hz : lz > hz ? hz : lz;
        let px = lx - qx;
        let pz = lz - qz;
        const d2 = px * px + pz * pz;
        if (d2 >= r * r) continue;
        let mx;
        let mz;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          mx = (px / d) * (r - d);
          mz = (pz / d) * (r - d);
        } else {
          // centre inside: leave via the shallowest side
          const ox = hx - Math.abs(lx) + r;
          const oz = hz - Math.abs(lz) + r;
          if (ox < oz) {
            mx = lx >= 0 ? ox : -ox;
            mz = 0;
          } else {
            mx = 0;
            mz = lz >= 0 ? oz : -oz;
          }
        }
        if (c.type === BOX) {
          pos.x += mx;
          pos.z += mz;
        } else {
          pos.x += mx * c.c - mz * c.s;
          pos.z += mx * c.s + mz * c.c;
        }
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  // True if a straight line between two points passes through a collider.
  segmentBlocked(ax, ay, az, bx, by, bz, ignore = null) {
    const list = this._query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    for (const c of list) {
      if (c === ignore || c.see) continue;
      let t0 = 0;
      let t1 = 1;
      if (c.type === CIRCLE) {
        const dx = bx - ax;
        const dz = bz - az;
        const fx = ax - c.cx;
        const fz = az - c.cz;
        const A = dx * dx + dz * dz;
        const B = 2 * (fx * dx + fz * dz);
        const C = fx * fx + fz * fz - c.r * c.r;
        const disc = B * B - 4 * A * C;
        if (disc < 0 || A < 1e-9) continue;
        const sq = Math.sqrt(disc);
        t0 = Math.max(0, (-B - sq) / (2 * A));
        t1 = Math.min(1, (-B + sq) / (2 * A));
        if (t0 > t1) continue;
      } else {
        let sx;
        let sz;
        let ex;
        let ez;
        let hx;
        let hz;
        if (c.type === BOX) {
          const cx = (c.minX + c.maxX) / 2;
          const cz = (c.minZ + c.maxZ) / 2;
          hx = (c.maxX - c.minX) / 2;
          hz = (c.maxZ - c.minZ) / 2;
          sx = ax - cx;
          sz = az - cz;
          ex = bx - cx;
          ez = bz - cz;
        } else {
          const dax = ax - c.cx;
          const daz = az - c.cz;
          const dbx = bx - c.cx;
          const dbz = bz - c.cz;
          sx = dax * c.c + daz * c.s;
          sz = -dax * c.s + daz * c.c;
          ex = dbx * c.c + dbz * c.s;
          ez = -dbx * c.s + dbz * c.c;
          hx = c.hx;
          hz = c.hz;
        }
        const dx = ex - sx;
        const dz = ez - sz;
        // slab test
        if (Math.abs(dx) < 1e-9) {
          if (sx < -hx || sx > hx) continue;
        } else {
          let ta = (-hx - sx) / dx;
          let tb = (hx - sx) / dx;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        if (Math.abs(dz) < 1e-9) {
          if (sz < -hz || sz > hz) continue;
        } else {
          let ta = (-hz - sz) / dz;
          let tb = (hz - sz) / dz;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
      }
      // vertical overlap of the clipped segment with the collider
      const y0 = ay + (by - ay) * t0;
      const y1 = ay + (by - ay) * t1;
      const lo = Math.min(y0, y1);
      const hi = Math.max(y0, y1);
      if (hi < c.minY || lo > c.maxY) continue;
      return true;
    }
    return false;
  }
}
