import * as THREE from 'three';
import { mat } from '../core/geo.js';
import { RNG, nextFrame } from '../core/util.js';
import { Spiders } from '../creatures/spiders.js';
import { Bats } from '../creatures/bats.js';
import { Crows, Rats } from '../creatures/critters.js';
import { Apparitions } from '../creatures/ghost.js';
import { NOTES } from '../story.js';
import { cobweb } from './build.js';
import { groundRooms } from './rooms_ground.js';
import { upperRooms } from './rooms_upper.js';
import { atticRooms } from './rooms_attic.js';
import { cellarRooms } from './rooms_cellar.js';
import { outside } from './rooms_outside.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Helpers every room module uses.
function makeKit(ctx) {
  const frustum = new THREE.Frustum();
  const pm = new THREE.Matrix4();
  const sph = new THREE.Sphere();
  ctx.updaters.unshift(() => {
    ctx.camera.updateMatrixWorld();
    pm.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
  });
  const K = {
    // can the player currently see this point?
    seen(pos, r = 0.3) {
      sph.center.copy(pos);
      sph.radius = r;
      if (!frustum.intersectsSphere(sph)) return false;
      const c = ctx.camera.position;
      return !ctx.col.segmentBlocked(c.x, c.y, c.z, pos.x, pos.y, pos.z);
    },
    near(pos, r) {
      return ctx.player.pos.distanceTo(pos) < r;
    },
    // a sheet of paper that can be read
    note(B, x, y, z, ry, key, o = {}) {
      B.push(mat(x, y, z, ry, o.wall ? 0 : -Math.PI / 2, o.tilt ?? 0));
      B.quad('note', V(-0.1, -0.13, 0.003), V(0.1, -0.13, 0.003), V(0.1, 0.13, 0.003), V(-0.1, 0.13, 0.003), [0, 0, 1, 0, 1, 1, 0, 1]);
      B.pop();
      const state = { read: false };
      ctx.interact.add({
        pos: V(x, y + 0.04, z),
        radius: 0.28,
        range: 2.1,
        los: false,
        prompt: 'Read',
        onUse: async () => {
          ctx.audio.paper && ctx.audio.paper();
          await ctx.hud.note(NOTES[key]);
          if (!state.read) {
            state.read = true;
            if (o.onRead) o.onRead();
          }
        },
      });
      return state;
    },
    // a group of candle flames sharing one real light
    candles(points, room, o = {}) {
      const on = o.on ?? true;
      const g = { flames: [], on, emitter: null };
      for (const p of points) g.flames.push(ctx.flames.add(p, o.scale ?? 0.045, on));
      if (points.length && o.light !== false) {
        const c = points.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / points.length);
        c.y += 0.1;
        g.emitter = ctx.lights.add({ pos: c, color: o.color ?? 0xffa05a, intensity: o.intensity ?? 1.4 + points.length * 0.25, distance: o.distance ?? 6, flicker: 'candle', room, on });
      }
      g.set = (v) => {
        g.on = v;
        for (const f of g.flames) ctx.flames.set(f, v);
        if (g.emitter) g.emitter.on = v;
      };
      // relight one at a time
      g.relight = async (gap = 0.35) => {
        for (const f of g.flames) {
          ctx.flames.set(f, true);
          await ctx.director.wait(gap);
        }
        if (g.emitter) g.emitter.on = true;
        g.on = true;
      };
      return g;
    },
    // cobwebs in all four top corners of a room
    corners(B, x0, x1, z0, z1, y, size = 0.8, skip = []) {
      const c = [
        [x0, z0, 1, 0, 0, 1],
        [x1, z0, -1, 0, 0, 1],
        [x0, z1, 1, 0, 0, -1],
        [x1, z1, -1, 0, 0, -1],
      ];
      c.forEach(([x, z, ax, az, bx, bz], i) => {
        if (skip.includes(i)) return;
        cobweb(B, x, y, z, ax, az, bx, bz, size * (0.8 + Math.random() * 0.5));
      });
    },
    // play a sound as a positional event, then wait
    wait: (s) => ctx.director.wait(s),
  };
  return K;
}

export async function furnish(ctx, progress) {
  ctx.rng = new RNG(1888);
  ctx.kit = makeKit(ctx);
  ctx.spiders = new Spiders(ctx, 120);
  ctx.bats = new Bats(ctx, 40);
  ctx.crows = new Crows(ctx);
  ctx.rats = new Rats(ctx);
  ctx.ghosts = new Apparitions(ctx);
  ctx.flags = ctx.director.flags;

  groundRooms(ctx);
  progress(0.3);
  await nextFrame();
  upperRooms(ctx);
  progress(0.5);
  await nextFrame();
  atticRooms(ctx);
  progress(0.65);
  await nextFrame();
  cellarRooms(ctx);
  progress(0.8);
  await nextFrame();
  outside(ctx);
  ambient(ctx);
  ctx.apparitions.total = ctx.apparitions.list.length;
  ctx.hud.setCounter(0, ctx.apparitions.total);
  progress(1);
}

// Random unsettling events that fill the quiet between scripted scares.
function ambient(ctx) {
  const D = ctx.director;
  const A = ctx.audio;
  const behind = (dist = 2.5, up = 0) => {
    const p = ctx.player.pos;
    const yaw = ctx.player.yaw;
    return V(p.x + Math.sin(yaw) * dist, p.y + 1.5 + up, p.z + Math.cos(yaw) * dist);
  };
  const around = (r = 5, up = 0) => {
    const p = ctx.player.pos;
    const a = Math.random() * Math.PI * 2;
    return V(p.x + Math.cos(a) * r, p.y + 1.2 + up, p.z + Math.sin(a) * r);
  };
  D.ambientEvent({ indoor: true, weight: 2, cooldown: 40, fn: () => A.whisper(behind(1.6), { gain: 0.55, dur: 2.4 }) });
  D.ambientEvent({ indoor: true, weight: 1.5, cooldown: 60, fn: () => footstepsOverhead(ctx) });
  D.ambientEvent({ indoor: true, weight: 1.2, cooldown: 45, fn: () => A.knock(around(4), 2 + Math.floor(Math.random() * 3), 0.6) });
  D.ambientEvent({ indoor: true, weight: 0.8, cooldown: 80, fn: () => A.laugh(around(7, 1), 0.3) });
  D.ambientEvent({ indoor: true, weight: 1, cooldown: 70, fn: () => A.breath(behind(0.7, 0.1)) });
  D.ambientEvent({ indoor: true, weight: 1, cooldown: 50, fn: () => A.scratch(around(2.5, -0.6)) });
  D.ambientEvent({
    indoor: true,
    weight: 1.2,
    cooldown: 35,
    fn: async () => {
      ctx.flashlight.flicker(1.2, 1);
      A.moan(around(6), { gain: 0.35, dur: 3 });
    },
  });
  D.ambientEvent({ indoor: true, weight: 0.7, cooldown: 90, fn: () => A.slam(around(12, 2), { gain: 0.45 }) });
  D.ambientEvent({ indoor: true, weight: 0.6, cooldown: 120, fn: () => A.musicBox(around(9, 3), { loops: 1, gain: 0.18 }) });
  D.ambientEvent({ outdoor: true, weight: 1, cooldown: 40, fn: () => A.whisper(behind(2), { gain: 0.35, dur: 2 }) });
  D.ambientEvent({ outdoor: true, weight: 1, cooldown: 30, fn: () => ctx.sky.strike({ strength: 0.9 }) });
  D.ambientEvent({ outdoor: true, weight: 0.8, cooldown: 60, fn: () => A.moan(around(14, 1), { gain: 0.3, dur: 4 }) });

  // thunder follows every lightning flash
  ctx.sky.onStrike = (strength, delay, close) => {
    A.thunder(strength, delay, close);
    ctx.shadowDirty = true;
  };
}

async function footstepsOverhead(ctx) {
  const p = ctx.player.pos;
  const yaw = Math.random() * Math.PI * 2;
  const start = V(p.x + Math.cos(yaw) * 3, p.y + 3.8, p.z + Math.sin(yaw) * 3);
  for (let i = 0; i < 7; i++) {
    const q = start.clone().add(V(Math.cos(yaw + Math.PI) * i * 0.6, 0, Math.sin(yaw + Math.PI) * i * 0.6));
    ctx.audio.knock(q, 1, 0.35, 0.1);
    await ctx.director.wait(0.62);
  }
}
