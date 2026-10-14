// Named regions of the house. Used for the location caption, which lights
// are live, the reverb/ambience mix and scripted scares.
export class Rooms {
  constructor() {
    this.list = [];
    this.byId = new Map();
  }

  // box = [minX, minY, minZ, maxX, maxY, maxZ]
  add(id, name, box, opts = {}) {
    const r = {
      id,
      name,
      boxes: [box],
      outdoor: !!opts.outdoor,
      size: opts.size ?? 'medium', // small | medium | large | outdoor
      floor: opts.floor ?? 'ground',
      vol: (box[3] - box[0]) * (box[4] - box[1]) * (box[5] - box[2]),
      visited: false,
      quiet: !!opts.quiet,
    };
    if (this.byId.has(id)) {
      const ex = this.byId.get(id);
      ex.boxes.push(box);
      return ex;
    }
    this.list.push(r);
    this.byId.set(id, r);
    return r;
  }

  get(id) {
    return this.byId.get(id);
  }

  contains(room, p) {
    for (const b of room.boxes) {
      if (p.x >= b[0] && p.x <= b[3] && p.y >= b[1] && p.y <= b[4] && p.z >= b[2] && p.z <= b[5]) return true;
    }
    return false;
  }

  at(p) {
    let best = null;
    for (const r of this.list) {
      if (this.contains(r, p) && (!best || r.vol < best.vol)) best = r;
    }
    return best;
  }
}
