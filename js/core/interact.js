import * as THREE from 'three';

// Look-at interaction: the item nearest the centre of the view, within reach
// and line of sight, gets a prompt; E / click / tap uses it. A tap on the
// screen uses the item under the finger instead.
export class Interactions {
  constructor(ctx) {
    this.ctx = ctx;
    this.items = [];
    this.current = null;
    this._cam = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._ray = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  // item: { pos | obj, radius, range, prompt (string|fn), enabled (bool|fn), onUse, los, ignore }
  add(item) {
    const it = {
      radius: 0.35,
      range: 2.3,
      los: true,
      enabled: true,
      ...item,
    };
    this.items.push(it);
    return it;
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    if (this.current === item) this.current = null;
  }

  _pos(it, out) {
    if (it.obj) {
      it.obj.getWorldPosition(out);
      if (it.offset) out.add(it.offset);
      return out;
    }
    return out.copy(it.pos);
  }

  // Best usable item along the ray from cam in direction dir; slack widens
  // the aim tolerance (fingers are less precise than a crosshair).
  _find(cam, dir, slack = 0) {
    let best = null;
    let bestScore = Infinity;
    for (const it of this.items) {
      const en = typeof it.enabled === 'function' ? it.enabled() : it.enabled;
      if (!en) continue;
      const p = this._pos(it, this._p);
      const d = this._d.subVectors(p, cam);
      const dist = d.length();
      if (dist > it.range + it.radius) continue;
      const t = d.dot(dir);
      if (t < 0.05) continue;
      const perp = Math.sqrt(Math.max(0, dist * dist - t * t));
      const allowed = it.radius + 0.04 + slack + dist * (0.06 + slack);
      if (perp > allowed) continue;
      if (it.los) {
        const back = Math.min(it.radius * 0.9, dist * 0.5);
        const ex = p.x - (d.x / dist) * back;
        const ey = p.y - (d.y / dist) * back;
        const ez = p.z - (d.z / dist) * back;
        if (this.ctx.col.segmentBlocked(cam.x, cam.y, cam.z, ex, ey, ez, it.ignore)) continue;
      }
      const score = perp / allowed + dist * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  update(camera) {
    const cam = camera.getWorldPosition(this._cam);
    this.current = this._find(cam, camera.getWorldDirection(this._fwd));
    return this.current;
  }

  promptText() {
    const it = this.current;
    if (!it) return '';
    return typeof it.prompt === 'function' ? it.prompt() : it.prompt;
  }

  use() {
    if (this.current && this.current.onUse) this.current.onUse(this.current);
  }

  // Use the item under a screen point (normalised device coordinates),
  // falling back to the one in the centre of the view.
  useAt(camera, nx, ny) {
    const cam = camera.getWorldPosition(this._cam);
    const dir = this._ray.set(nx, ny, 0.5).unproject(camera).sub(cam).normalize();
    const it = this._find(cam, dir, 0.06) || this.current;
    if (it && it.onUse) it.onUse(it);
  }
}
