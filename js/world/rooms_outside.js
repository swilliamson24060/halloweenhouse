import * as THREE from 'three';
import { Y } from './layout.js';
import { Ghost } from '../creatures/ghost.js';
import { Snake } from '../creatures/snakes.js';
import { weathervane } from '../creatures/critters.js';
import { terrainHeight } from './exterior.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function outside(ctx) {
  const K = ctx.kit;
  const D = ctx.director;
  const H = ctx.house;

  // crows on the fence and the gate piers, the raven on the vane
  for (const [x, y, ry] of [
    [-3.3, 2.28, 0.4],
    [-2.5, 2.28, -0.3],
    [2.9, 2.28, 2.6],
    [4.6, 2.28, 0.1],
    [-1.38, 2.84, 0.8],
    [1.38, 2.84, -2.2],
  ]) {
    ctx.crows.add(V(x, y, 16.6), ry, { scare: 3.2 });
  }
  for (const t of ctx.trees.slice(0, 3)) ctx.crows.add(t.clone().add(V(0.6, 4.2, 0.3)), Math.random() * 6, { scare: 7 });
  weathervane(ctx, H.vaneBase);
  for (let i = 0; i < 11; i++) {
    ctx.bats.add({ pos: [7 + Math.random() * 4, 14 + Math.random() * 3, 6 + Math.random() * 4], mode: 'orbit', center: [7, 13.5, 4.5], radius: 4 + Math.random() * 4, height: 2.5, group: 'turret', scale: 1.15 });
  }

  // porch lantern
  const lampFlame = ctx.flames.add(H.porchLamp.clone(), 0.06, true);
  const lamp = ctx.lights.add({ pos: H.porchLamp.clone().add(V(0, -0.1, 0)), color: 0xffb060, intensity: 3.5, distance: 8, flicker: 'gas', room: 'outdoor' });

  // the gate opens by itself as you reach it
  D.zone({
    id: 'gate',
    sphere: [0, 1, 18.4, 2.6],
    onEnter: async () => {
      await K.wait(0.4);
      ctx.gate.openGate(0.38);
      ctx.crows.flyAll(V(0, 0, 18));
      ctx.director.addFear(0.1);
    },
  });

  // a woman at the bedroom window who is gone when you look again
  const watcher = new Ghost(ctx, 'lady', { opacity: 0.85, look: false, color: 0xd6e2f2 });
  watcher.place(3.5, Y.f2, 5.55, 0);
  let watchT = 0;
  D.zone({
    id: 'watcher',
    box: [-3, -1, 10.5, 4, 4, 15.8],
    onEnter: () => {
      watcher.show(0.8, 1.5);
      watchT = 7;
    },
  });
  ctx.updaters.push((dt) => {
    if (watchT <= 0) return;
    watchT -= dt;
    const c = watcher.center();
    if (watchT < 6 && K.seen(c, 0.3)) {
      watcher.vanish(2.5);
      ctx.audio.sting('glimpse');
      ctx.director.addFear(0.15);
      watchT = 0;
    } else if (watchT <= 0) watcher.hide(1);
  });

  // stepping onto the porch: the lamp dies and the door swings open
  D.zone({
    id: 'porch',
    box: [-2.0, 0.5, 6.2, 4.9, 3, 9.0],
    exclusive: true,
    onEnter: async () => {
      await K.wait(0.5);
      for (let i = 0; i < 6; i++) {
        lamp.on = i % 2 === 1;
        ctx.flames.set(lampFlame, i % 2 === 1);
        await K.wait(0.08 + Math.random() * 0.12);
      }
      lamp.on = false;
      ctx.flames.set(lampFlame, false);
      ctx.audio.whisper(V(0, 2.2, 8.2), { gain: 0.6, dur: 1.6 });
      await K.wait(1.2);
      if (!H.doors.frontL.isOpen()) H.doors.frontL.open(1, 0.55);
      await K.wait(0.6);
      if (!H.doors.frontR.isOpen()) H.doors.frontR.open(0.8, 0.5);
      ctx.director.addFear(0.15);
      ctx.director.run(async () => {
        await K.wait(40);
        lamp.on = true;
        ctx.flames.set(lampFlame, true);
      });
    },
  });

  // graveyard: Eleanor rises from behind her stone and walks to the tomb
  const g0 = ctx.graves[0];
  const risen = new Ghost(ctx, 'bride', { opacity: 0.9, color: 0xdbe6f4, look: true });
  risen.place(g0.x, g0.y - 1.7, g0.z - 0.5, 0);
  D.zone({
    id: 'risen',
    box: [11.2, -2, -20, 30, 10, 14],
    exclusive: true,
    onEnter: async () => {
      await K.wait(1.0);
      risen.show(0.85, 0.5);
      ctx.audio.moan(V(g0.x, g0.y + 1, g0.z), { gain: 0.6, dur: 4, pitch: 0.9 });
      await risen.moveTo(V(g0.x, g0.y, g0.z - 0.5), 0.55);
      await K.wait(2.0);
      risen.look = false;
      const door = ctx.mausoleumDoor;
      risen.group.rotation.y = Math.atan2(door.x - risen.position.x, door.z - risen.position.z);
      await risen.moveTo(V(door.x, terrainHeight(door.x, door.z + 0.6), door.z + 0.6), 1.1);
      risen.vanish(1.5);
      ctx.audio.slam(door, { metal: true, gain: 0.6 });
      await K.wait(1.0);
      ctx.audio.knock(door, 3, 1.1, 0.4);
      ctx.director.addFear(0.2);
    },
  });
  D.zone({
    id: 'mausoleum',
    sphere: [ctx.mausoleumDoor.x, ctx.mausoleumDoor.y, ctx.mausoleumDoor.z + 1.5, 2.4],
    once: false,
    cooldown: 30,
    onEnter: () => ctx.audio.knock(ctx.mausoleumDoor, 3, 1.2, 0.5),
  });
  D.zone({
    id: 'fresh-grave',
    sphere: [ctx.freshGrave.x, ctx.freshGrave.y + 1, ctx.freshGrave.z, 2.2],
    onEnter: async () => {
      await K.wait(0.8);
      ctx.audio.knock(ctx.freshGrave.clone().add(V(0, -0.8, 0)), 3, 0.7, 0.55);
      await K.wait(2.2);
      ctx.audio.scratch(ctx.freshGrave.clone().add(V(0, -0.6, 0)), 2);
      ctx.director.addFear(0.2);
    },
  });
  ctx.ghosts.add({ id: 'mourner', type: 'veiled', dark: true, pos: V(21.5, terrainHeight(21.5, -3.5), -3.5), yaw: -Math.PI / 2, opacity: 0.75, maxDist: 20, look: false });
  const ab = ctx.arbours[2];
  ctx.ghosts.add({ id: 'garden', type: 'gent', pos: V(ab.x, ab.y, ab.z), yaw: 0.9, opacity: 0.6, maxDist: 18 });
  // snakes in the long grass
  new Snake(ctx, { x: 17, y: terrainHeight(17, 6), z: 6, region: [13, 1, 23, 10], length: 1.6 });
  new Snake(ctx, { x: -17, y: terrainHeight(-17, -2), z: -2, region: [-21, -6, -13, 2], length: 1.4 });
}
