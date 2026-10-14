import { clamp } from './util.js';

// Runs the scares: trigger zones, timers on the game clock (so pausing
// freezes every script), a fear level, and ambient random events.
export class Director {
  constructor(ctx) {
    this.ctx = ctx;
    this.time = 0;
    this.zones = [];
    this.timers = [];
    this.watchers = [];
    this.ambient = [];
    this.fear = 0;
    this.fearTarget = 0;
    this.flags = Object.create(null);
    this.nextAmbient = 25;
    this.busy = 0; // >0 while a big scripted scare is playing
    this._p = { x: 0, y: 0, z: 0 };
  }

  wait(sec) {
    return new Promise((res) => this.timers.push({ t: this.time + sec, res }));
  }

  // Resolves once predicate() is true (checked every frame) or after timeout.
  until(predicate, timeout = Infinity) {
    return new Promise((res) => this.watchers.push({ predicate, res, end: this.time + timeout }));
  }

  run(fn) {
    Promise.resolve()
      .then(fn)
      .catch((err) => console.error('[scare]', err));
  }

  // Exclusive scripted sequence: skipped if another big scare is running.
  scene(fn) {
    if (this.busy > 0) return false;
    this.busy++;
    this.run(async () => {
      try {
        await fn();
      } finally {
        this.busy--;
      }
    });
    return true;
  }

  // def: { id, box | sphere | room | test, once, cooldown, chance, when, onEnter, onExit, onStay, delay }
  zone(def) {
    const z = { once: true, cooldown: 0, chance: 1, inside: false, fired: 0, last: -1e9, ...def };
    this.zones.push(z);
    return z;
  }

  ambientEvent(def) {
    this.ambient.push({ weight: 1, cooldown: 60, last: -1e9, ...def });
  }

  addFear(v) {
    this.fear = clamp(this.fear + v, 0, 1);
  }

  _inZone(z, p) {
    if (z.box) {
      const b = z.box;
      return p.x >= b[0] && p.x <= b[3] && p.y >= b[1] && p.y <= b[4] && p.z >= b[2] && p.z <= b[5];
    }
    if (z.sphere) {
      const s = z.sphere;
      const dx = p.x - s[0];
      const dy = p.y - s[1];
      const dz = p.z - s[2];
      return dx * dx + dy * dy + dz * dz <= s[3] * s[3];
    }
    if (z.room) return this.ctx.room && this.ctx.room.id === z.room;
    if (z.test) return z.test(p);
    return false;
  }

  update(dt) {
    this.time += dt;
    const now = this.time;

    if (this.timers.length) {
      const due = this.timers.filter((t) => t.t <= now);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.t > now);
        for (const t of due) t.res();
      }
    }
    if (this.watchers.length) {
      const keep = [];
      for (const w of this.watchers) {
        let ok = false;
        try {
          ok = w.predicate();
        } catch (e) {
          ok = true;
        }
        if (ok || now >= w.end) w.res(ok);
        else keep.push(w);
      }
      this.watchers = keep;
    }

    const pl = this.ctx.player;
    const p = this._p;
    p.x = pl.pos.x;
    p.y = pl.pos.y + 1.0;
    p.z = pl.pos.z;
    for (const z of this.zones) {
      if (z.once && z.fired > 0 && !z.onExit && !z.onStay) continue;
      const inside = this._inZone(z, p);
      if (inside && !z.inside) {
        z.inside = true;
        const allowed =
          (!z.once || z.fired === 0) && now - z.last >= z.cooldown && (!z.when || z.when()) && Math.random() < z.chance;
        if (allowed && z.onEnter) {
          if (z.exclusive && this.busy > 0) {
            // another big scare is playing: try again next frame
            z.inside = false;
          } else {
            z.fired++;
            z.last = now;
            if (z.exclusive) this.scene(() => z.onEnter(z));
            else this.run(() => z.onEnter(z));
          }
        }
      } else if (!inside && z.inside) {
        z.inside = false;
        if (z.onExit) z.onExit(z);
      }
      if (inside && z.onStay) z.onStay(dt, z);
    }

    // fear relaxes slowly
    this.fear = Math.max(0, this.fear - dt * 0.035);

    // ambient events: spaced out, only when nothing else is happening
    this.nextAmbient -= dt;
    if (this.nextAmbient <= 0 && this.busy === 0) {
      const room = this.ctx.room;
      const outdoor = !room || room.outdoor;
      const pool = this.ambient.filter(
        (a) => (outdoor ? a.outdoor : a.indoor) && now - a.last > a.cooldown && (!a.when || a.when())
      );
      if (pool.length) {
        let total = 0;
        for (const a of pool) total += a.weight;
        let r = Math.random() * total;
        for (const a of pool) {
          r -= a.weight;
          if (r <= 0) {
            a.last = now;
            this.run(a.fn);
            break;
          }
        }
      }
      this.nextAmbient = 18 + Math.random() * 26;
    }
  }
}
