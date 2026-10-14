import * as THREE from 'three';
import { GeoBuilder, mat } from '../core/geo.js';
import { Y } from './layout.js';
import * as P from './props.js';
import { Ghost } from '../creatures/ghost.js';
import { Snake } from '../creatures/snakes.js';
import { Swing, Rocker, FollowEyes } from './dynamic.js';
import { makeFire } from '../gfx/effects.js';
import { cobweb, webQuad } from './build.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GF = Y.g;
const GC = Y.gCeil;

export function groundRooms(ctx) {
  foyer(ctx);
  rearHall(ctx);
  parlor(ctx);
  library(ctx);
  seance(ctx);
  dining(ctx);
  kitchen(ctx);
}

// ---------------------------------------------------------------- shared
export function chandelier(ctx, x, yTop, z, o = {}) {
  const drop = o.drop ?? 0.9;
  const B = new GeoBuilder('chandelier');
  B.rod('brass', 0, 0, 0, 0, -drop + 0.25, 0, 0.008, 0.008, 4);
  B.lathe(
    'brass',
    [
      [0, -drop + 0.25],
      [0.04, -drop + 0.22],
      [0.025, -drop + 0.05],
      [0.08, -drop - 0.02],
      [0.05, -drop - 0.12],
      [0.015, -drop - 0.25],
      [0, -drop - 0.3],
    ],
    10
  );
  const arms = o.arms ?? 6;
  const r = o.r ?? 0.42;
  const locals = [];
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2;
    const ax = Math.cos(a) * r;
    const az = Math.sin(a) * r;
    B.rod('brass', 0, -drop - 0.05, 0, ax * 0.6, -drop - 0.12, az * 0.6, 0.012, 0.012, 5);
    B.rod('brass', ax * 0.6, -drop - 0.12, az * 0.6, ax, -drop + 0.02, az, 0.012, 0.012, 5);
    B.cyl('brass', ax, -drop + 0.035, az, 0.035, 0.015, 0.03, 8);
    B.cyl('candle', ax, -drop + 0.1, az, 0.014, 0.015, 0.12, 6);
    locals.push(V(ax, -drop + 0.168, az));
    B.sphere('glass', ax, -drop - 0.08, az, 0.02, 0.7, 1.5, 0.7, 6, 5);
  }
  const ring = new THREE.TorusGeometry(r * 0.6, 0.01, 4, 24);
  B.geom('brass', ring, mat(0, -drop - 0.12, 0, 0, Math.PI / 2));
  ring.dispose();
  if (o.webs) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      webQuad(B, Math.cos(a) * r * 0.55, -drop + 0.1, Math.sin(a) * r * 0.55, a + Math.PI / 2, 0.5, 0.35);
    }
  }
  const group = B.build(ctx.mat, { castShadow: false });
  const pivot = new THREE.Group();
  pivot.position.set(x, yTop, z);
  pivot.add(group);
  ctx.scene.add(pivot);
  const swing = new Swing(ctx, pivot, { amp: o.amp ?? 0.012, speed: 0.8 });
  const lit = o.lit ?? false;
  const flames = locals.map((p) => ctx.flames.add(p.clone().add(pivot.position), 0.05, lit));
  const emitter = ctx.lights.add({ pos: V(x, yTop - drop, z), color: 0xffaa60, intensity: o.intensity ?? 5, distance: o.distance ?? 8, flicker: 'candle', room: o.room, on: lit });
  const tmp = new THREE.Vector3();
  ctx.updaters.push(() => {
    pivot.updateMatrixWorld();
    for (let i = 0; i < locals.length; i++) {
      tmp.copy(locals[i]).applyMatrix4(pivot.matrixWorld);
      ctx.flames.move(flames[i], tmp);
    }
    emitter.pos.set(x + Math.sin(pivot.rotation.z) * drop, yTop - drop, z);
  });
  return {
    pivot,
    swing,
    emitter,
    set(on) {
      for (const f of flames) ctx.flames.set(f, on);
      emitter.on = on;
    },
  };
}

// A picture whose canvas can be swapped (for portraits that change).
export function swapPortrait(ctx, B, x, y, z, ry, key, w = 0.6, h = 0.78) {
  P.at(B, x, y, z, ry, () => P.painting(B, w, h, 'woodDark'));
  const m = ctx.mat[key].clone();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.translateZ(0.014);
  ctx.scene.add(mesh);
  return {
    mesh,
    set(k) {
      m.map = ctx.mat[k].map;
      m.needsUpdate = true;
    },
  };
}

function writingDecal(ctx, tex, x, y, z, rx, ry, w, h) {
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, 0, 'YXZ');
  mesh.visible = false;
  mesh.renderOrder = 3;
  ctx.scene.add(mesh);
  return mesh;
}

// ------------------------------------------------------------------ foyer
function foyer(ctx) {
  const B = ctx.B.g;
  const K = ctx.kit;
  const D = ctx.director;
  const H = ctx.house;
  P.rug(B, 0.65, 1.4, GF + 0.004, 1.05, 6.4, 'rug1');
  // hall table: candelabra, dead flowers, the calling card
  P.at(B, 1.7, GF, 1.6, -Math.PI / 2, () => P.table(B, { w: 1.0, d: 0.42, h: 0.8 }));
  ctx.col.addBox(1.45, GF, 1.05, 1.95, GF + 0.85, 2.15);
  const cpos = P.at(B, 1.72, GF + 0.8, 1.32, 0, () => P.candelabra(B, { arms: 3 }));
  const hallCandles = K.candles(cpos, 'foyer', { intensity: 2.4, distance: 6.5 });
  P.at(B, 1.72, GF + 0.8, 1.95, 0, () => P.vase(B));
  K.note(B, 1.62, GF + 0.806, 1.66, 0.4, 'card');
  // grandfather clock
  const clk = P.at(B, 1.72, GF, 0.4, -Math.PI / 2, () => P.clock(B));
  ctx.col.addBox(1.45, GF, 0.08, 2.0, GF + 2.8, 0.72);
  const pend = new THREE.Group();
  pend.position.copy(clk.pendulum);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.62, 0.01), ctx.mat.brass);
  rod.position.y = -0.31;
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 18), ctx.mat.brass);
  bob.rotation.z = Math.PI / 2;
  bob.position.y = -0.62;
  pend.add(rod, bob);
  ctx.scene.add(pend);
  const clockState = { running: true, last: 0, ticks: 0 };
  ctx.updaters.push((dt, t) => {
    if (!clockState.running) return;
    const a = Math.sin(t * Math.PI);
    pend.rotation.x = a * 0.16;
    const s = Math.sign(a);
    if (s !== clockState.last) {
      clockState.last = s;
      if (ctx.player.pos.distanceTo(clk.face) < 11) ctx.audio.tick(clk.face, s > 0);
    }
  });
  // the coat on the rack looks like a man waiting by the door
  P.at(B, 1.5, GF, 5.3, -2.4, () => P.coatRack(B, { coat: true }));
  ctx.col.addCircle(1.5, 5.3, 0.25, GF, GF + 2);
  B.cyl('castIron', 1.55, GF + 0.28, 4.6, 0.12, 0.1, 0.56, 10, { open: true });
  for (let i = 0; i < 2; i++) B.rod('woodDark', 1.55 + i * 0.05, GF + 0.05, 4.6, 1.5 + i * 0.12, GF + 0.95, 4.55 - i * 0.05, 0.012, 0.012, 5);
  // portraits up the stair wall
  P.at(B, -1.91, 3.25, 3.25, Math.PI / 2, () => P.painting(B, 0.55, 0.72, 'portrait_matriarch'));
  const josiah = swapPortrait(ctx, B, -1.91, 3.9, 1.75, Math.PI / 2, 'portrait_patriarch', 0.6, 0.8);
  P.at(B, -1.91, 6.0, 0.2, Math.PI / 2, () => P.painting(B, 0.5, 0.64, 'portrait_girl'));
  P.at(B, -1.91, 6.5, -1.2, Math.PI / 2, () => P.painting(B, 0.5, 0.64, 'portrait_boy'));
  P.at(B, 1.91, 2.6, -3.45, -Math.PI / 2, () => P.painting(B, 0.42, 0.55, 'portrait_oldman'));
  // chandelier, lit by someone expecting company
  const ch = chandelier(ctx, 0.65, GC, 1.6, { lit: true, room: 'foyer', intensity: 4.5, webs: true });
  K.corners(B, -1.93, 1.93, -2.93, 5.85, GC, 0.8);
  cobweb(B, -0.7, GC, -1.8, 0, 1, -1, 0, 0.6);
  // spiders on the walls
  const S = ctx.spiders;
  S.add(S.surface([1.92, GF + 1.2, -2.8], [0, 0, 1], [0, 1, 0], 2.4, 2.8), { size: 0.035 });
  S.add(S.surface([-1.92, GF + 0.6, 5.7], [0, 0, -1], [0, 1, 0], 1.0, 2.5), { size: 0.028 });
  S.add(S.floor(-0.6, 1.8, -2.8, 4.8, GF + 0.002), { size: 0.03 });

  // writing that appears later on the floor by the door
  const writing = writingDecal(ctx, ctx.tex.writingHall, 0.5, GF + 0.006, 3.4, -Math.PI / 2, 0, 2.4, 0.6);

  // --- scares
  // 1. the doors slam behind you
  D.zone({
    id: 'foyer-slam',
    box: [-1.9, 0.5, -2.9, 1.9, 4, 3.6],
    exclusive: true,
    when: () => H.doors.frontL.isOpen() || H.doors.frontR.isOpen(),
    onEnter: async () => {
      await K.wait(0.8);
      H.doors.frontL.slam();
      await K.wait(0.07);
      H.doors.frontR.slam();
      await K.wait(0.25);
      ch.swing.kick(0.12);
      hallCandles.set(false);
      ch.set(false);
      ctx.flashlight.flicker(1.4, 1);
      ctx.audio.whisper(V(0.4, 2.2, 5.4), { gain: 0.9, dur: 2.2 });
      ctx.director.addFear(0.35);
      await K.wait(2.6);
      ch.set(true);
      await hallCandles.relight(0.5);
    },
  });
  // 2. the clock strikes thirteen when you set foot on the stairs
  D.zone({
    id: 'clock13',
    box: [-2, 0.5, -1.8, -0.7, 5, 3.6],
    onEnter: async () => {
      await K.wait(0.6);
      clockState.running = false;
      ctx.audio.chime(clk.face, 13, 0.75, 1.5);
      ctx.director.addFear(0.15);
      await K.wait(20);
      clockState.running = true;
    },
  });
  // 3. knocking from the little door under the stairs
  D.zone({
    id: 'understair',
    sphere: [-1.35, 1.9, -2.6, 1.5],
    once: false,
    cooldown: 35,
    onEnter: async () => {
      await K.wait(0.4);
      ctx.audio.knock(V(-1.35, 1.6, -1.6), 3, 1.1);
      await K.wait(1.6);
      H.doors.understair.rattle(0.8);
      ctx.director.addFear(0.1);
    },
  });
  H.doors.understair.onLocked = () => {
    ctx.hud.toast('Something on the other side is holding it shut.');
    setTimeout(() => ctx.audio.knock(V(-1.35, 1.6, -1.6), 2, 1.2, 0.25), 900);
  };
  // 4. later: words on the floor, and Josiah steps out of his portrait
  ctx.updaters.push(() => {
    const f = ctx.flags;
    if (!f.welcome && f.roomsVisited >= 5 && ctx.room && ctx.room.id !== 'foyer') {
      f.welcome = true;
      writing.visible = true;
      josiah.set('portrait_empty');
    }
    if (f.welcome && !f.welcomeSeen && ctx.room && ctx.room.id === 'foyer' && K.seen(writing.position, 0.6)) {
      f.welcomeSeen = true;
      ctx.audio.sting('low');
      ctx.audio.whisper(V(0.5, 1.6, 3.4), { gain: 0.8 });
      ctx.director.addFear(0.3);
    }
  });
  ctx.flags.roomsVisited = 0;
  const visited = new Set();
  const prevOnRoom = ctx.onRoom;
  ctx.onRoom = (room, prev) => {
    if (room && !room.outdoor && !visited.has(room.id)) {
      visited.add(room.id);
      ctx.flags.roomsVisited = visited.size;
    }
    if (prevOnRoom) prevOnRoom(room, prev);
  };
  ctx.foyerChandelier = ch;
}

// -------------------------------------------------------------- rear hall
function rearHall(ctx) {
  const B = ctx.B.g;
  const K = ctx.kit;
  // hall tree with coats
  P.at(B, -1.82, GF, -5.6, Math.PI / 2, () => {
    B.box('woodDark', 0, 1.1, -0.04, 1.0, 2.2, 0.06);
    B.box('glassDark', 0, 1.45, 0.0, 0.5, 0.6, 0.01);
    P.bench(B, { w: 0.95 });
    for (const x of [-0.38, 0.38]) {
      B.sphere('brass', x, 1.9, 0.06, 0.025);
      B.lathe(
        'blackCloth',
        [
          [0.02, 1.88],
          [0.12, 1.75],
          [0.15, 1.3],
          [0.17, 0.9],
        ],
        10,
        mat(x, 0, 0.12, 0, 0, 0, 1, 1, 0.6)
      );
    }
  });
  ctx.col.addBox(-1.93, GF, -6.15, -1.5, GF + 2.2, -5.05);
  P.at(B, 1.7, GF, -7.2, -Math.PI / 2, () => P.table(B, { w: 0.6, d: 0.4, h: 0.78 }));
  ctx.col.addBox(1.45, GF, -7.55, 1.93, GF + 0.8, -6.85);
  P.at(B, 1.7, GF + 0.78, -7.25, 0, () => P.oilLamp(B));
  P.at(B, -1.91, 2.7, -3.9, Math.PI / 2, () => P.painting(B, 0.4, 0.52, 'portrait_widow'));
  B.cyl('castIron', 1.0, GF + 0.28, -7.6, 0.1, 0.09, 0.56, 10, { open: true });
  K.corners(B, -1.93, 1.93, -7.85, -3.07, GC, 0.7);
  ctx.rats.add(
    [
      [-1.75, -7.7],
      [1.7, -7.7],
      [1.75, -3.4],
      [-1.0, -3.3],
    ],
    GF
  );
}

// ----------------------------------------------------------------- parlour
function parlor(ctx) {
  const B = ctx.B.g;
  const K = ctx.kit;
  const D = ctx.director;
  const R = ctx.rng;
  P.rug(B, 4.9, 2.7, GF + 0.004, 3.2, 4.2, 'rug0');
  // fireplace on the right wall
  const fp = P.at(B, 6.85, GF, 1.9, -Math.PI / 2, () => P.fireplace(B, { w: 1.6, h: 1.3, breast: 'wp_parlor', breastH: GC - GF }));
  ctx.col.addBox(6.25, GF, 0.85, 6.9, GC, 2.95);
  // portrait over the mantel whose eyes follow you
  const pf = new THREE.Group();
  pf.position.set(6.85 - 0.46, GF + 2.35, 1.9);
  pf.rotation.y = -Math.PI / 2;
  ctx.scene.add(pf);
  P.at(B, 6.85 - 0.45, GF + 2.35, 1.9, -Math.PI / 2, () => P.painting(B, 0.62, 0.82, 'portrait_eyeless', { fw: 0.09 }));
  pf.updateMatrixWorld();
  new FollowEyes(ctx, pf, [V(-0.034, 0.082, 0.016), V(0.034, 0.082, 0.016)], { r: 0.013, spread: 0.006 });
  // mantel ornaments
  const mantel = P.at(B, 6.85 - 0.55, GF + fp.mantelY, 1.9, -Math.PI / 2, () => {
    B.push(mat(-0.3, 0, 0));
    const a = P.candlestick(B);
    B.pop();
    B.push(mat(0.45, 0, 0));
    const b = P.candlestick(B);
    B.pop();
    B.push(mat(-0.62, 0, 0));
    P.bellJarBird(B);
    B.pop();
    B.push(mat(0.08, 0, 0.02));
    B.box('woodDark', 0, 0.14, 0, 0.26, 0.28, 0.12);
    B.cyl('clock', 0, 0.16, 0.065, 0.08, 0.08, 0.01, 16, { rx: Math.PI / 2 });
    B.pop();
    return [a, b];
  });
  const mantelCandles = K.candles(mantel, 'parlor', { on: false, intensity: 1.6 });
  // ghostly blue fire waiting to light itself
  const fire = makeFire(0.55, 0.5, true);
  fire.position.copy(fp.fire);
  fire.rotation.y = -Math.PI / 2;
  fire.userData.material.uniforms.uLevel.value = 0;
  ctx.scene.add(fire);
  const fireLight = ctx.lights.add({ pos: fp.fire.clone().add(V(-0.6, 0.4, 0)), color: 0x6f8fff, intensity: 5, distance: 7, flicker: 'fire', room: 'parlor', on: false });
  ctx.updaters.push((dt, t) => (fire.userData.material.uniforms.uTime.value = t));
  // piano against the back wall
  const sconces = P.at(B, 5.25, GF, 0.42, 0, () => P.piano(B));
  ctx.col.addBox(4.45, GF, 0.07, 6.05, GF + 1.35, 0.78);
  P.at(B, 5.25, GF, 1.02, 0, () => {
    B.cyl('uphRed', 0, 0.48, 0, 0.2, 0.2, 0.08, 14);
    B.cyl('woodDark', 0, 0.24, 0, 0.06, 0.1, 0.44, 8);
  });
  P.at(B, 5.6, GF + 1.3, 0.25, 0.4, () => P.vase(B, { mat: 'porcelain' }));
  // seating around the hearth
  P.at(B, 4.75, GF, 1.95, Math.PI / 2, () => P.sofa(B, { w: 1.9 }));
  ctx.col.addBox(4.3, GF, 0.95, 5.2, GF + 0.95, 2.95);
  P.at(B, 5.75, GF, 0.7, 0.35, () => P.armchair(B));
  ctx.col.addCircle(5.75, 0.7, 0.42, GF, GF + 1.2);
  // set back far enough to leave a way in to the hearth
  P.at(B, 5.5, GF, 3.65, Math.PI - 0.5, () => P.armchair(B, { mat: 'uphGreen' }));
  ctx.col.addCircle(5.5, 3.65, 0.42, GF, GF + 1.2);
  P.at(B, 5.45, GF, 1.95, 0, () => {
    P.table(B, { w: 0.45, d: 0.8, h: 0.45 });
    for (const [x, z] of [
      [-0.12, -0.2],
      [0.12, 0.15],
    ]) {
      B.cyl('porcelain', x, 0.47, z, 0.045, 0.035, 0.05, 10);
      B.cyl('porcelain', x, 0.452, z, 0.07, 0.07, 0.006, 12);
    }
    B.lathe(
      'porcelain',
      [
        [0, 0],
        [0.07, 0.0],
        [0.09, 0.06],
        [0.07, 0.13],
        [0.03, 0.15],
        [0.035, 0.17],
        [0, 0.18],
      ],
      12,
      mat(0.05, 0.45, -0.02)
    );
  });
  ctx.col.addBox(5.2, GF, 1.5, 5.7, GF + 0.5, 2.4);
  // lamp in the corner by the foyer
  P.at(B, 2.6, GF, 5.35, 0, () => P.table(B, { w: 0.5, d: 0.5, h: 0.72 }));
  ctx.col.addBox(2.3, GF, 5.05, 2.9, GF + 0.75, 5.65);
  const lamp = P.at(B, 2.6, GF + 0.72, 5.35, 0, () => P.oilLamp(B));
  K.candles([lamp], 'parlor', { intensity: 2.4, distance: 6, scale: 0.035 });
  // turret alcove: birdcage and the rocking chair
  P.at(B, 6.35, GF, 7.2, 0, () => P.birdcage(B));
  ctx.col.addCircle(6.35, 7.2, 0.22, GF, GF + 1.8);
  const rcB = new GeoBuilder('rocker');
  rockingChair(rcB);
  const rc = rcB.build(ctx.mat);
  const rcPivot = new THREE.Group();
  rcPivot.position.set(7.55, GF, 6.5);
  rcPivot.rotation.y = -2.45;
  rcPivot.add(rc);
  ctx.scene.add(rcPivot);
  ctx.col.addCircle(7.55, 6.5, 0.42, GF, GF + 1.2);
  const rocker = new Rocker(ctx, rc, { amp: 0.2, speed: 1.7, active: false });
  // cobwebs and spiders
  K.corners(B, 2.07, 6.85, 0.07, 5.85, GC, 0.9, [3]);
  const S = ctx.spiders;
  S.add(S.surface([2.08, GF + 1.5, 0.3], [0, 0, 1], [0, 1, 0], 2.2, 2.4), { size: 0.04 });
  S.add(S.floor(2.3, 6.2, 0.3, 5.6, GF + 0.006), { size: 0.03 });
  ctx.ghosts.add({ id: 'parlour', type: 'gent', pos: V(8.2, GF, 6.9), yaw: -2.3, opacity: 0.55, maxDist: 9 });

  // --- scares
  D.zone({
    id: 'parlour-fire',
    room: 'parlor',
    exclusive: true,
    onEnter: async () => {
      await K.wait(2.2);
      ctx.audio.whoosh(fp.fire, 1);
      fireLight.on = true;
      const u = fire.userData.material.uniforms.uLevel;
      for (let i = 0; i <= 20; i++) {
        u.value = i / 20;
        await K.wait(0.03);
      }
      ctx.audio.fire(fp.fire, 0.35);
      ctx.director.addFear(0.2);
      await K.wait(1.2);
      mantelCandles.relight(0.6);
    },
  });
  D.zone({
    id: 'piano',
    sphere: [5.25, GF + 1, 1.3, 2.3],
    onEnter: async () => {
      await K.wait(0.8);
      ctx.audio.piano(sconces[0], [57, 60, 63, 66, 69, 66, 63, [45, 46, 52, 53]], { gain: 0.6, tempo: 0.55 });
      ctx.director.addFear(0.15);
    },
  });
  // the rocking chair starts the first time you look away from it
  ctx.updaters.push(() => {
    if (ctx.room && ctx.room.id === 'parlor' && !rocker.active && !K.seen(rcPivot.position.clone().add(V(0, 0.6, 0)), 0.5)) {
      if (!ctx.flags.rockerArmed) {
        ctx.flags.rockerArmed = true;
        setTimeout(() => (rocker.active = true), 1500);
      }
    }
  });
}

export function rockingChair(B) {
  // built around the rocker's contact point so rotation.x rocks it
  for (const sx of [-0.24, 0.24]) {
    const g = new THREE.TorusGeometry(1.1, 0.02, 4, 24, 0.75);
    B.geom('woodDark', g, mat(sx, 1.1, 0, Math.PI / 2, 0, Math.PI + 1.2, 1, 1, 1));
    g.dispose();
    B.box('woodDark', sx, 0.24, 0.18, 0.04, 0.42, 0.04);
    B.box('woodDark', sx, 0.24, -0.2, 0.04, 0.42, 0.04);
    B.push(mat(sx, 0.45, -0.24, 0, -0.25));
    B.box('woodDark', 0, 0.5, 0, 0.045, 1.0, 0.045);
    B.pop();
  }
  B.box('woodDark', 0, 0.45, -0.02, 0.52, 0.04, 0.46);
  B.box('uphRed', 0, 0.48, -0.02, 0.44, 0.05, 0.4);
  B.push(mat(0, 0.45, -0.25, 0, -0.25));
  for (let i = -3; i <= 3; i++) B.box('woodDark', i * 0.06, 0.45, 0, 0.02, 0.7, 0.02);
  B.box('woodDark', 0, 0.9, 0, 0.5, 0.08, 0.04);
  B.pop();
  for (const sx of [-0.27, 0.27]) B.box('woodDark', sx, 0.66, 0.02, 0.05, 0.04, 0.42);
}

// ----------------------------------------------------------------- library
function library(ctx) {
  const B = ctx.B.g;
  const K = ctx.kit;
  const D = ctx.director;
  const R = ctx.rng;
  const shelf = (x, z, ry, w, h = 3.1) => {
    P.at(B, x, GF, z, ry, () => P.bookshelf(B, { w, h, rows: 8, rng: R }));
  };
  for (const x of [2.72, 3.86, 5.0, 6.14]) shelf(x, -3.72, 0, 1.12);
  ctx.col.addBox(2.1, GF, -3.93, 6.8, GF + 3.2, -3.5);
  shelf(6.64, -3.1, -Math.PI / 2, 0.9);
  shelf(6.64, -0.8, -Math.PI / 2, 1.15);
  ctx.col.addBox(6.42, GF, -3.6, 6.85, GF + 3.2, -2.6);
  ctx.col.addBox(6.42, GF, -1.4, 6.85, GF + 3.2, -0.15);
  shelf(2.28, -3.05, Math.PI / 2, 1.45);
  shelf(2.28, -0.62, Math.PI / 2, 0.9);
  ctx.col.addBox(2.07, GF, -3.85, 2.5, GF + 3.2, -2.3);
  ctx.col.addBox(2.07, GF, -1.1, 2.5, GF + 3.2, -0.15);
  for (const x of [4.35, 5.85]) {
    P.at(B, x, GF, -0.28, Math.PI, () => P.bookshelf(B, { w: 1.4, h: 2.4, rows: 6, rng: R }));
  }
  ctx.col.addBox(3.6, GF, -0.5, 6.6, GF + 2.5, -0.07);
  // rolling ladder against the back shelves
  P.at(B, 4.4, GF, -3.35, 0, () => {
    for (const sx of [-0.22, 0.22]) {
      B.push(mat(sx, 0, 0, 0, 0.12));
      B.box('woodLight', 0, 1.5, 0, 0.05, 3.0, 0.05);
      B.pop();
    }
    for (let i = 1; i < 10; i++) B.box('woodLight', 0, i * 0.3, -0.18 + i * 0.03 - 0.12, 0.44, 0.03, 0.05);
  });
  // desk, lamp, chair, globe
  P.at(B, 4.5, GF, -2.0, Math.PI, () => P.desk(B, { w: 1.5 }));
  ctx.col.addBox(3.7, GF, -2.4, 5.3, GF + 0.8, -1.6);
  const lampPos = P.at(B, 5.0, GF + 0.78, -2.05, 0, () => {
    B.cyl('brass', 0, 0.02, 0, 0.08, 0.09, 0.04, 12);
    B.cyl('brass', 0, 0.2, 0, 0.012, 0.012, 0.36, 6);
    B.lathe(
      'jarGreen',
      [
        [0.02, 0.32],
        [0.16, 0.36],
        [0.18, 0.4],
        [0.02, 0.44],
      ],
      14
    );
    return P.worldOf(B, 0, 0.33, 0);
  });
  K.candles([lampPos], 'library', { color: 0xffc070, intensity: 3.2, distance: 6, scale: 0.03 });
  P.at(B, 4.5, GF, -2.75, 0, () => P.chair(B, { seat: 'uphGreen' }));
  ctx.col.addCircle(4.5, -2.75, 0.3, GF, GF + 1);
  // globe in the corner and the armchair tucked against the shelves, so
  // the way between the two doors and round the desk stays open
  P.at(B, 2.95, GF, -3.05, 0, () => P.globe(B));
  ctx.col.addCircle(2.95, -3.05, 0.3, GF, GF + 1.3);
  P.at(B, 6.0, GF, -0.95, -2.4, () => P.armchair(B, { mat: 'uphGreen' }));
  ctx.col.addCircle(6.0, -0.95, 0.42, GF, GF + 1.2);
  K.note(B, 4.2, GF + 0.785, -2.0, 0.2, 'diary', {
    onRead: () => setTimeout(() => ctx.audio.whisper(V(6.0, 1.8, -0.95), { gain: 0.7 }), 600),
  });
  for (const [x, z, n] of [
    [3.55, -3.25, 5],
    [5.6, -3.2, 3],
    [2.9, -0.55, 4],
  ]) {
    P.at(B, x, GF, z, R.float(0, 3), () => P.bookPile(B, R, n));
  }
  K.corners(B, 2.07, 6.85, -3.93, -0.07, GC, 1.0);
  const S = ctx.spiders;
  S.add(S.surface([2.4, GF + 3.25, -3.6], [1, 0, 0], [0, 0, 1], 4.2, 0.3), { size: 0.04 });
  S.add(S.floor(2.5, 6.3, -3.4, -0.6, GF + 0.006), { size: 0.035 });
  S.add(S.floor(2.5, 6.3, -3.4, -0.6, GF + 0.006), { size: 0.025 });
  ctx.ghosts.add({ id: 'library', type: 'lady', dark: true, pos: V(6.35, GF, -3.15), yaw: -0.7, opacity: 0.7, maxDist: 8 });

  // a book flies off the shelf when you pass the desk
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.05), ctx.mat.velvet);
  book.position.set(3.86, GF + 1.9, -3.55);
  book.visible = false;
  book.castShadow = true;
  ctx.scene.add(book);
  const fly = { v: new THREE.Vector3(), w: new THREE.Vector3(), on: false };
  ctx.updaters.push((dt) => {
    if (!fly.on) return;
    fly.v.y -= 9.8 * dt;
    book.position.addScaledVector(fly.v, dt);
    book.rotation.x += fly.w.x * dt;
    book.rotation.y += fly.w.y * dt;
    if (book.position.y < GF + 0.025) {
      book.position.y = GF + 0.025;
      if (Math.abs(fly.v.y) > 1.2) ctx.audio.knock(book.position.clone(), 1, 0.7);
      fly.v.y *= -0.25;
      fly.v.x *= 0.5;
      fly.v.z *= 0.5;
      fly.w.multiplyScalar(0.4);
      book.rotation.x = Math.round(book.rotation.x / Math.PI) * Math.PI + Math.PI / 2;
      if (fly.v.length() < 0.3) fly.on = false;
    }
  });
  D.zone({
    id: 'flying-book',
    box: [3.4, 0.5, -3.2, 5.6, 3, -1.0],
    onEnter: async () => {
      await K.wait(0.6);
      ctx.audio.whisper(V(3.86, 2.0, -3.5), { gain: 0.6, dur: 1.2 });
      await K.wait(0.9);
      book.visible = true;
      const to = ctx.camera.position.clone().sub(book.position).normalize();
      fly.v.copy(to).multiplyScalar(5.5).add(V(0, 1.2, 0));
      fly.w.set(8, 5, 0);
      fly.on = true;
      ctx.audio.whoosh(book.position.clone(), 0.5);
      ctx.director.addFear(0.25);
      ctx.player.shake = 0.4;
    },
  });
}

// ------------------------------------------------------------ séance room
const OUIJA_W = 0.52;
const OUIJA_H = 0.345;
function ouijaPoint(cx, cy) {
  return [(cx / 512 - 0.5) * OUIJA_W, (cy / 340 - 0.5) * OUIJA_H];
}
function ouijaLetter(ch) {
  const a1 = 'ABCDEFGHIJKLM';
  const a2 = 'NOPQRSTUVWXYZ';
  let i = a1.indexOf(ch);
  if (i >= 0) {
    const a = Math.PI + (Math.PI * (i + 0.5)) / 13;
    return ouijaPoint(256 + Math.cos(a) * 210, 220 + Math.sin(a) * 210 * 0.55);
  }
  i = a2.indexOf(ch);
  const a = Math.PI + (Math.PI * (i + 0.5)) / 13;
  return ouijaPoint(256 + Math.cos(a) * 170, 260 + Math.sin(a) * 170 * 0.55);
}

function seance(ctx) {
  const B = ctx.B.g;
  const K = ctx.kit;
  const D = ctx.director;
  const cx = 4.55;
  const cz = -6.0;
  const tableTop = GF + 0.74;
  P.at(B, cx, GF, cz, 0, () => P.roundTable(B, { r: 0.68, cloth: 'blackCloth' }));
  ctx.col.addCircle(cx, cz, 0.8, GF, GF + 0.8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = cx + Math.sin(a) * 1.0;
    const z = cz + Math.cos(a) * 1.0;
    P.at(B, x, GF, z, a + Math.PI, () => P.chair(B, { seat: 'velvet', tall: true }));
    ctx.col.addCircle(x, z, 0.28, GF, GF + 1);
  }
  // the board, faced toward the door
  P.at(B, cx, tableTop + 0.008, cz, -Math.PI / 2, () => {
    B.box('woodDark', 0, -0.004, 0, OUIJA_W + 0.02, 0.008, OUIJA_H + 0.02);
    B.quad('ouija', V(-OUIJA_W / 2, 0.001, OUIJA_H / 2), V(OUIJA_W / 2, 0.001, OUIJA_H / 2), V(OUIJA_W / 2, 0.001, -OUIJA_H / 2), V(-OUIJA_W / 2, 0.001, -OUIJA_H / 2), [0, 0, 1, 0, 1, 1, 0, 1]);
  });
  // planchette
  const pl = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.07);
  shape.bezierCurveTo(0.05, 0.05, 0.06, -0.02, 0.0, -0.06);
  shape.bezierCurveTo(-0.06, -0.02, -0.05, 0.05, 0, 0.07);
  const hole = new THREE.Path();
  hole.absarc(0, 0.01, 0.017, 0, Math.PI * 2, false);
  shape.holes.push(hole);
  const pg = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  pg.rotateX(-Math.PI / 2);
  const pm = new THREE.Mesh(pg, ctx.mat.woodLight);
  pm.castShadow = true;
  pl.add(pm);
  const board = new THREE.Group();
  board.position.set(cx, tableTop + 0.012, cz);
  board.rotation.y = -Math.PI / 2;
  board.add(pl);
  ctx.scene.add(board);
  const home = ouijaPoint(256, 300);
  pl.position.set(home[0], 0, home[1]);
  // crystal ball and tarot cards
  B.cyl('brass', cx - 0.32, tableTop + 0.03, cz + 0.22, 0.05, 0.06, 0.06, 10);
  B.sphere('glass', cx - 0.32, tableTop + 0.13, cz + 0.22, 0.075, 1, 1, 1, 16, 12);
  for (let i = 0; i < 5; i++) {
    P.at(B, cx + 0.25 + i * 0.03, tableTop + 0.004 + i * 0.001, cz - 0.3 + i * 0.05, 0.3 + i * 0.4, () => B.box('parchment', 0, 0, 0, 0.07, 0.002, 0.12));
  }
  // candles on the table and a ring on the floor
  const tableCandles = [];
  for (const [dx, dz] of [
    [0.4, -0.2],
    [0.38, 0.25],
    [-0.15, -0.42],
  ]) {
    tableCandles.push(P.at(B, cx + dx, tableTop, cz + dz, 0, () => P.candle(B, 0.16 + Math.random() * 0.06, 0.02)));
  }
  const floorCandles = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const x = cx + Math.sin(a) * 1.65;
    const z = cz + Math.cos(a) * 1.65;
    if (x < 2.3 || x > 6.7 || z < -7.7 || z > -4.2) continue;
    floorCandles.push(P.at(B, x, GF, z, 0, () => P.candle(B, 0.1 + Math.random() * 0.12, 0.025)));
  }
  const candA = K.candles(tableCandles, 'seance', { intensity: 2.2, distance: 5.5 });
  const candB = K.candles(floorCandles, 'seance', { intensity: 2.0, distance: 6, scale: 0.05 });
  // wax drippings on the floor between them
  for (const p of floorCandles) B.cyl('candle', p.x, GF + 0.004, p.z, 0.07, 0.08, 0.008, 10);
  // heavy drapes on the walls
  for (const [x, z, ry, w] of [
    [2.12, -6.2, Math.PI / 2, 3.4],
    [4.6, -4.12, Math.PI, 4.4],
  ]) {
    P.at(B, x, GF, z, ry, () => {
      const g = new THREE.PlaneGeometry(w, GC - GF - 0.1, 36, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.05 + 0.06);
      g.computeVertexNormals();
      B.geom('velvet', g, mat(0, (GC - GF) / 2, 0), { worldUV: true });
      g.dispose();
    });
  }
  P.at(B, 6.4, GF, -4.6, -Math.PI / 2 - 0.3, () => P.table(B, { w: 0.5, d: 0.4, h: 0.7 }));
  ctx.col.addCircle(6.4, -4.6, 0.35, GF, GF + 0.75);
  K.note(B, 6.4, GF + 0.705, -4.6, 0.8, 'seance');
  K.corners(B, 2.07, 6.85, -7.85, -4.07, GC, 0.8);

  // --- the board spells its word
  D.zone({
    id: 'seance',
    room: 'seance',
    exclusive: true,
    onEnter: async () => {
      await K.wait(2.5);
      ctx.flashlight.flicker(2, 0);
      const word = 'STAY';
      const bp = board.position.clone();
      for (const ch of word) {
        const [x, z] = ouijaLetter(ch);
        const from = pl.position.clone();
        const to = V(x, 0, z);
        const steps = 30;
        for (let i = 1; i <= steps; i++) {
          const k = i / steps;
          const e = k * k * (3 - 2 * k);
          pl.position.lerpVectors(from, to, e);
          await K.wait(0.022);
        }
        ctx.audio.knock(bp, 1, 0.35, 0.1);
        ctx.audio.whisper(bp.clone().add(V(0, 0.5, 0)), { gain: 0.45, dur: 0.6 });
        await K.wait(0.65);
      }
      await K.wait(0.6);
      candA.set(false);
      candB.set(false);
      ctx.flashlight.die(1.6);
      ctx.audio.sting('low');
      ctx.director.addFear(0.4);
      await K.wait(1.6);
      ctx.audio.knock(V(4.6, 2.5, -7.9), 3, 1.2, 0.45);
      await K.wait(3);
      const [hx, hz] = home;
      pl.position.set(hx, 0, hz);
      candB.relight(0.3);
      await K.wait(1.5);
      candA.relight(0.4);
    },
  });
}

// ------------------------------------------------------------------ dining
function dining(ctx) {
  const B = ctx.B.g;
  const K = ctx.kit;
  const D = ctx.director;
  const tx = -4.5;
  const tz = 4.4;
  const top = GF + 0.76;
  P.rug(B, tx, tz, GF + 0.004, 3.0, 5.6, 'rug2');
  P.at(B, tx, GF, tz, 0, () => P.table(B, { w: 1.15, d: 3.6, h: 0.76, cloth: 'linen' }));
  ctx.col.addBox(tx - 0.72, GF, tz - 1.95, tx + 0.72, GF + 0.8, tz + 1.95);
  const seats = [];
  for (const z of [-1.2, 0, 1.2]) {
    seats.push([tx - 0.85, tz + z, Math.PI / 2]);
    seats.push([tx + 0.85, tz + z, -Math.PI / 2]);
  }
  seats.push([tx, tz - 2.15, 0]);
  seats.push([tx, tz + 2.15, Math.PI]);
  seats.forEach(([x, z, ry], i) => {
    const tilt = i === 3 ? 0.4 : 0;
    P.at(B, x, GF, z, ry + tilt, () => P.chair(B, { seat: 'uphGreen', tall: true }));
    ctx.col.addCircle(x, z, 0.27, GF, GF + 1.1);
    // place setting
    const px = x + Math.sin(ry) * 0.42;
    const pz = z + Math.cos(ry) * 0.42;
    P.plate(B, px, top + 0.006, pz);
    P.goblet(B, px + Math.cos(ry) * 0.18, top + 0.006, pz - Math.sin(ry) * 0.18);
    B.box('silver', px - Math.cos(ry) * 0.16, top + 0.008, pz + Math.sin(ry) * 0.16, 0.02, 0.004, 0.18, ry);
  });
  // a cake left to rot under its cobwebs
  P.at(B, tx, top + 0.006, tz, 0, () => {
    B.cyl('porcelain', 0, 0.02, 0, 0.22, 0.2, 0.04, 18);
    B.cyl('linen', 0, 0.12, 0, 0.17, 0.17, 0.16, 18);
    B.cyl('linen', 0, 0.26, 0, 0.12, 0.12, 0.13, 18);
    B.cyl('linen', 0, 0.37, 0, 0.07, 0.07, 0.1, 16);
    webQuad(B, 0, 0.3, 0, 0.6, 0.5, 0.45);
    webQuad(B, 0, 0.3, 0, -0.9, 0.45, 0.4);
  });
  const candles = [];
  for (const dz of [-1.3, 1.3]) candles.push(...P.at(B, tx, top + 0.006, tz + dz, 0, () => P.candelabra(B, { arms: 5 })));
  const tableCandles = K.candles(candles, 'dining', { on: false, intensity: 4, distance: 7 });
  const ch = chandelier(ctx, tx, GC, tz, { lit: false, room: 'dining', webs: true, intensity: 4 });
  // sideboard with a mirror, china cabinet
  P.at(B, -6.55, GF, 4.0, Math.PI / 2, () => P.sideboard(B, { w: 1.9, mirror: true }));
  ctx.col.addBox(-6.85, GF, 3.0, -6.25, GF + 1.0, 5.0);
  P.at(B, -6.55, GF + 0.96, 3.35, Math.PI / 2, () => P.vase(B));
  P.at(B, -5.5, GF, 0.85, 0, () => {
    P.wardrobe(B, { w: 1.4, h: 2.1, d: 0.45 });
    for (let s = 0; s < 3; s++) for (let i = 0; i < 5; i++) P.plate(B, -0.5 + i * 0.25, 0.85 + s * 0.45, 0.05);
  });
  ctx.col.addBox(-6.25, GF, 0.57, -4.75, GF + 2.3, 1.1);
  K.corners(B, -6.85, -2.07, 0.57, 8.35, GC, 0.9);
  const S = ctx.spiders;
  S.add(S.floor(tx - 0.5, tx + 0.5, tz - 1.7, tz + 1.7, top + 0.012), { size: 0.03 });
  S.add(S.floor(tx - 0.5, tx + 0.5, tz - 1.7, tz + 1.7, top + 0.012), { size: 0.022 });
  S.add(S.surface([-2.09, GF + 0.8, 1.0], [0, 0, 1], [0, 1, 0], 3.2, 2.5), { size: 0.04 });
  ctx.ghosts.add({ id: 'dining', type: 'butler', pos: V(tx, GF, tz + 3.4), yaw: Math.PI, opacity: 0.55, maxDist: 10 });

  // ghost diners only visible in a lightning flash
  const diners = [];
  seats.forEach(([x, z, ry], i) => {
    if (i === 6) return;
    const g = new Ghost(ctx, i % 2 ? 'gent' : 'lady', { opacity: 1, look: false, float: 0, color: 0xd4e0f0 });
    g.place(x, GF - 0.5, z, ry);
    g.mats.body.uniforms.uHem.value = 1.55;
    g.mats.hair.uniforms.uHem.value = 1.35;
    diners.push(g);
  });
  let party = 0;
  ctx.updaters.push((dt) => {
    if (party <= 0) return;
    party -= dt;
    const f = ctx.sky.flash;
    for (const g of diners) {
      g.opacity = f > 0.25 ? Math.min(0.9, f * 1.2) : 0;
      g.target = g.opacity;
    }
  });
  D.zone({
    id: 'dinner-party',
    box: [-6.8, 0.5, 1.0, -2.2, 4, 7.9],
    exclusive: true,
    onEnter: async () => {
      await K.wait(2.8);
      party = 4;
      ctx.audio.moan(V(tx, 1.8, tz), { gain: 0.3, dur: 2.5 });
      const delay = ctx.sky.strike({ strength: 1.5, close: true });
      void delay;
      ctx.director.addFear(0.35);
      await K.wait(1.0);
      ctx.sky.strike({ strength: 1.1, bolt: false, close: true });
      await K.wait(1.6);
      for (const g of diners) g.target = g.opacity = 0;
      party = 0;
      ctx.audio.sting('glimpse');
      tableCandles.relight(0.15);
      await K.wait(1.0);
      ch.set(true);
    },
  });
}

// ----------------------------------------------------------------- kitchen
function kitchen(ctx) {
  const B = ctx.B.g;
  const K = ctx.kit;
  const D = ctx.director;
  const R = ctx.rng;
  P.at(B, -6.42, GF, -4.25, Math.PI / 2, () => P.stove(B));
  ctx.col.addBox(-6.85, GF, -4.95, -6.0, GF + 1.7, -3.55);
  ctx.lights.add({ pos: V(-6.0, GF + 0.5, -4.25), color: 0xff4a18, intensity: 0.8, distance: 3, flicker: 'fire', room: 'kitchen' });
  B.box('ember', -6.04, GF + 0.48, -4.6, 0.02, 0.16, 0.3);
  P.at(B, -6.55, GF, -2.45, Math.PI / 2, () => P.sink(B));
  ctx.col.addBox(-6.85, GF, -2.95, -6.25, GF + 1.0, -1.95);
  // work table with the ledger
  P.at(B, -4.85, GF, -3.6, 0, () => {
    P.table(B, { w: 1.7, d: 0.85, h: 0.82, mat: 'woodRough' });
    B.cyl('porcelain', -0.5, 0.86, 0.1, 0.16, 0.1, 0.08, 14, { open: true });
    B.rod('woodLight', 0.1, 0.86, -0.2, 0.45, 0.86, -0.1, 0.025, 0.025, 8);
    B.sphere('straw', 0.55, 0.88, 0.2, 0.12, 1.1, 0.6, 0.9);
  });
  ctx.col.addBox(-5.75, GF, -4.08, -3.95, GF + 0.85, -3.12);
  K.note(B, -4.4, GF + 0.826, -3.75, -0.3, 'ledger');
  // pot rack overhead
  B.box('castIron', -4.85, GC - 0.75, -3.6, 1.5, 0.04, 0.04);
  for (const sx of [-0.7, 0.7]) B.rod('castIron', -4.85 + sx, GC, -3.6, -4.85 + sx, GC - 0.75, -3.6, 0.008, 0.008, 4);
  for (let i = 0; i < 6; i++) {
    const x = -5.45 + i * 0.24;
    const r = 0.08 + (i % 3) * 0.03;
    B.rod('castIron', x, GC - 0.75, -3.6, x, GC - 0.88, -3.6, 0.004, 0.004, 3);
    B.cyl(i % 2 ? 'brass' : 'castIron', x, GC - 0.88 - r * 0.6, -3.6, r, r * 0.9, r * 1.1, 12);
  }
  // dresser with plates
  P.at(B, -5.6, GF, 0.2, Math.PI, () => {
    P.dresser(B, { w: 1.5, h: 0.95, d: 0.5, mat: 'woodRough', rows: 2 });
    B.box('woodRough', 0, 1.7, -0.16, 1.5, 1.3, 0.04);
    for (const y of [1.3, 1.7, 2.1]) {
      B.box('woodRough', 0, y, -0.06, 1.46, 0.03, 0.2);
      for (let i = 0; i < 6; i++) B.cyl('porcelain', -0.6 + i * 0.24, y + 0.12, -0.1, 0.1, 0.1, 0.012, 14, { rx: Math.PI / 2 - 0.2 });
    }
  });
  ctx.col.addBox(-6.4, GF, -0.1, -4.8, GF + 2.3, 0.43);
  // shelves of preserves, barrels, a broom
  P.at(B, -3.9, GF, -7.66, 0, () => P.shelfJars(B, R, { w: 1.4, h: 2.0, rows: 4 }));
  ctx.col.addBox(-4.65, GF, -7.85, -3.15, GF + 2.0, -7.45);
  P.at(B, -6.4, GF, -7.35, 0, () => P.barrel(B));
  P.at(B, -5.75, GF, -7.5, 0, () => P.barrel(B, { h: 0.75 }));
  ctx.col.addCircle(-6.4, -7.35, 0.33, GF, GF + 1);
  ctx.col.addCircle(-5.75, -7.5, 0.33, GF, GF + 1);
  B.rod('woodLight', -6.75, GF, -1.3, -6.82, GF + 1.4, -1.25, 0.015, 0.015, 5);
  B.cyl('straw', -6.76, GF + 0.15, -1.3, 0.03, 0.12, 0.3, 8);
  // wall cupboard whose doors fly open
  const cup = new THREE.Group();
  cup.position.set(-3.2, GF + 1.6, -4.6);
  cup.rotation.y = -Math.PI / 2;
  ctx.scene.add(cup);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.32), ctx.mat.woodRough);
  box.position.z = 0.16;
  cup.add(box);
  const doors = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * 0.5, 0, 0.33);
    const dm = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.66, 0.02), ctx.mat.woodRough);
    dm.position.x = -s * 0.24;
    hinge.add(dm);
    cup.add(hinge);
    doors.push({ hinge, s, a: 0, target: 0 });
  }
  ctx.updaters.push((dt) => {
    for (const d of doors) {
      d.a += (d.target - d.a) * Math.min(1, dt * 14);
      d.hinge.rotation.y = d.a * d.s;
    }
  });
  K.corners(B, -6.85, -3.12, -7.85, 0.43, GC, 0.9);
  const S = ctx.spiders;
  S.add(S.surface([-3.13, GF + 2.2, -7.5], [0, 0, 1], [0, 1, 0], 4.5, 1.8), { size: 0.05 });
  S.add(S.floor(-6.6, -3.4, -7.6, -0.2, GF + 0.006), { size: 0.035 });
  ctx.rats.add(
    [
      [-6.7, -7.7],
      [-3.3, -7.7],
      [-3.3, -5.2],
      [-6.6, -5.3],
    ],
    GF
  );
  ctx.ghosts.add({ id: 'kitchen', type: 'maid', pos: V(-6.3, GF, -6.6), yaw: 0.7, opacity: 0.55, maxDist: 9 });
  new Snake(ctx, { x: -5.0, y: GF, z: -6.0, region: [-6.5, -7.4, -3.4, -1.3], length: 1.5 });

  D.zone({
    id: 'cupboard',
    box: [-6.8, 0.5, -6.0, -3.2, 4, -2.7],
    onEnter: async () => {
      await K.wait(1.2);
      for (const d of doors) d.target = 1.9;
      ctx.audio.slam(cup.position, { gain: 0.6 });
      ctx.player.shake = 0.3;
      ctx.director.addFear(0.2);
      await K.wait(0.3);
      // a tin cup falls out and rolls
      ctx.audio.slam(V(-3.4, 1.0, -4.6), { metal: true, gain: 0.3 });
      await K.wait(3.5);
      for (const d of doors) d.target = 0.25;
      ctx.audio.creak(cup.position, { short: true, gain: 0.4 });
    },
  });
}
