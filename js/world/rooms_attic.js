import * as THREE from 'three';
import { GeoBuilder, mat } from '../core/geo.js';
import { Y } from './layout.js';
import * as P from './props.js';
import { Ghost } from '../creatures/ghost.js';
import { Rocker } from './dynamic.js';
import { cobweb, webQuad } from './build.js';
import { rockingChair } from './rooms_ground.js';
import { flashScreen } from './rooms_upper.js';
import { ENDING } from '../story.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const AF = Y.attic;
const AT = Y.atticTop;
const DK = Y.deck;
// where the widow keeps watch at the front edge of the roof
const WIDOW = V(-2.4, DK, 4.75);

export function atticRooms(ctx) {
  attic(ctx);
  widowsWalk(ctx);
}

async function travel(ctx, to, yaw) {
  ctx.cutscene = true;
  ctx.audio.creak(ctx.camera.position.clone(), { short: false, gain: 0.5, pitch: 1.2 });
  await ctx.hud.fade(true, 500);
  ctx.player.teleport(to.x, to.y, to.z, yaw, 0);
  ctx.audio.creak(to.clone().add(V(0, 1, 0)), { long: true, gain: 0.6, metal: true, pitch: 0.8 });
  await new Promise((r) => setTimeout(r, 450));
  await ctx.hud.fade(false, 700);
  ctx.cutscene = false;
}

function attic(ctx) {
  const B = ctx.B.at;
  const K = ctx.kit;
  const D = ctx.director;
  const R = ctx.rng;
  // lantern left burning on a trunk by the stairs
  P.at(B, 2.75, AF, -2.35, 0.2, () => P.chest(B, { w: 0.9, d: 0.5, h: 0.45 }));
  ctx.col.addBox(2.25, AF, -2.7, 3.25, AF + 0.75, -2.0);
  const lan = P.at(B, 2.6, AF + 0.7, -2.3, 0, () => {
    B.box('ironBlack', 0, 0.01, 0, 0.14, 0.02, 0.14);
    B.box('glass', 0, 0.12, 0, 0.11, 0.2, 0.11);
    for (const [dx, dz] of [
      [-0.06, -0.06],
      [0.06, -0.06],
      [-0.06, 0.06],
      [0.06, 0.06],
    ]) {
      B.box('ironBlack', dx, 0.12, dz, 0.012, 0.22, 0.012);
    }
    B.cyl('ironBlack', 0, 0.26, 0, 0.0, 0.09, 0.08, 4, { ry: Math.PI / 4 });
    B.rod('ironBlack', 0, 0.28, 0, 0, 0.36, 0, 0.004, 0.004, 3);
    return P.worldOf(B, 0, 0.1, 0);
  });
  K.candles([lan], 'attic', { intensity: 2.6, distance: 7, scale: 0.035 });
  // trunks, hatboxes, crates, stacked frames
  for (const [x, z, ry, w] of [
    [-5.6, -6.6, 0.1, 1.0],
    [-4.2, -6.9, -0.2, 0.8],
    [5.4, -6.5, 0.3, 0.9],
    [-6.0, 1.2, 1.6, 0.85],
    [4.6, 2.0, -1.4, 0.95],
  ]) {
    P.at(B, x, AF, z, ry, () => P.chest(B, { w, d: 0.5, h: 0.42 }));
    ctx.col.addCircle(x, z, w * 0.5, AF, AF + 0.7);
  }
  for (const [x, z] of [
    [-5.4, -5.8],
    [-4.0, -6.1],
    [5.8, -5.6],
  ]) {
    P.at(B, x, AF + (x < 0 ? 0.42 : 0), z, R.float(0, 3), () => P.hatbox(B, R));
  }
  for (const [x, z, s] of [
    [3.6, -6.8, 0.6],
    [4.3, -6.9, 0.5],
    [3.9, -6.85, 0.45],
    [-1.8, -6.9, 0.6],
  ]) {
    P.at(B, x, AF + (s === 0.45 ? 0.6 : 0), z, R.float(-0.3, 0.3), () => P.crate(B, { s }));
    ctx.col.addCircle(x, z, s * 0.6, AF, AF + 1.2);
  }
  P.at(B, -6.1, AF, -3.3, Math.PI / 2, () => P.frameStack(B, R));
  P.at(B, 6.0, AF, -2.6, -Math.PI / 2, () => P.frameStack(B, R));
  P.at(B, -3.0, AF, -5.0, 0.4, () => P.crib(B));
  ctx.col.addBox(-3.6, AF, -5.7, -2.4, AF + 1.1, -4.3);
  P.at(B, 3.2, AF, 3.6, 0, () => P.birdcage(B));
  P.at(B, -5.0, AF, -2.0, 1.2, () => P.dressForm(B, { skirt: 'linen' }));
  ctx.col.addCircle(-5.0, -2.0, 0.3, AF, AF + 1.7);
  P.at(B, 5.6, AF, -4.2, -1.0, () => P.spinningWheel(B));
  // a tall cracked mirror leaning on the wall
  P.at(B, 6.2, AF, -0.4, -Math.PI / 2 + 0.3, () => {
    B.push(mat(0, 0, 0, 0, -0.12));
    B.box('woodDark', 0, 0.85, 0, 0.7, 1.7, 0.05);
    B.box('glassDark', 0, 0.85, 0.03, 0.58, 1.55, 0.01);
    B.pop();
  });
  // sheet-covered furniture
  const lumps = [
    [-2.2, -1.4, 1.2, 0.9, 0.7],
    [-4.0, 2.6, 1.8, 0.85, 0.8],
    [2.5, 1.2, 1.0, 1.4, 0.7],
    [-1.5, 3.4, 0.8, 1.1, 0.8],
    [4.6, -1.5, 1.5, 0.75, 0.9],
  ];
  for (const [x, z, w, h, d] of lumps) {
    P.at(B, x, AF, z, R.float(-0.4, 0.4), () => P.covered(B, w, h, d, R));
    ctx.col.addBox(x - w / 2 - 0.05, AF, z - d / 2 - 0.05, x + w / 2 + 0.05, AF + h, z + d / 2 + 0.05);
  }
  // ladder up to the roof hatch
  P.at(B, -0.5, AF, 0.15, 0, () => {
    for (const sx of [-0.22, 0.22]) {
      B.push(mat(sx, 0, 0, 0, 0.12));
      B.box('woodRough', 0, 1.4, 0, 0.06, 2.85, 0.06);
      B.pop();
    }
    for (let i = 1; i < 9; i++) B.box('woodRough', 0, i * 0.3, i * 0.036, 0.44, 0.035, 0.05);
  });
  ctx.col.addBox(-0.8, AF, 0.0, -0.2, AT, 0.5);
  B.boxMM('woodRough', -1.0, AT - 0.02, -0.5, 0.0, AT, 0.5);
  ctx.interact.add({
    pos: V(-0.5, AF + 1.6, 0.4),
    radius: 0.5,
    range: 2.2,
    prompt: 'Climb to the roof',
    // come up facing her, so the first thing on the roof is her back and
    // the lantern held up against the sky
    onUse: () => {
      const to = ctx.house.hatch.deck;
      travel(ctx, to, Math.atan2(to.x - WIDOW.x, to.z - WIDOW.z));
    },
  });
  ctx.interact.add({
    pos: V(-0.5, DK + 0.3, 0.0),
    radius: 0.6,
    range: 2.2,
    prompt: 'Climb back down',
    onUse: () => travel(ctx, ctx.house.hatch.attic, 0),
  });
  ctx.col.addBox(-1.0, DK, -0.5, 0.0, DK + 0.3, 0.5);
  // the note pinned to a beam
  K.note(B, -0.1, AF + 1.65, -1.04, 0, 'hymnal', { wall: true });
  // webs between the beams and in the corners
  for (let x = -4.9; x <= 5; x += 2.8) {
    for (const z of [-5.5, -1.5, 2.5]) webQuad(B, x, AT - 0.5, z + R.float(-0.4, 0.4), R.float(-0.3, 0.3), 1.2, 0.9);
  }
  for (const [x, z, ax, az, bx, bz] of [
    [-6.2, -7.1, 1, 0, 0, 1],
    [6.2, -7.1, -1, 0, 0, 1],
    [-6.2, 5.1, 1, 0, 0, -1],
    [4.8, 5.1, -1, 0, 0, -1],
  ]) {
    cobweb(B, x, AT, z, ax, az, bx, bz, 1.2);
  }
  // spiders everywhere
  const S = ctx.spiders;
  for (let i = 0; i < 6; i++) S.add(S.floor(-6, 6, -7, 5, AF + 0.006), { size: 0.03 + Math.random() * 0.03 });
  for (let i = 0; i < 3; i++) S.add(S.surface([-6, AT - 0.01, -7], [1, 0, 0], [0, 0, 1], 12, 12), { size: 0.04 });
  const big = S.hang(1.6, AT - 0.25, -1.4, 0.1);
  // bats roosting under the beams
  for (let i = 0; i < 16; i++) {
    const x = -5.6 + (i % 8) * 1.4 + 0.08;
    const z = i < 8 ? -4.2 + Math.random() * 0.3 : 1.6 + Math.random() * 0.3;
    ctx.bats.add({ pos: [x, AT - 0.35, z], roost: [x, AT - 0.38, z], mode: 'roost', center: [0, AF + 1.6, -1], radius: 4.5, height: 0.8, group: 'attic', scale: 1.1 });
  }
  // the widow's chair in the gable, facing the round window
  const rcB = new GeoBuilder('widow-chair');
  rockingChair(rcB);
  const rc = rcB.build(ctx.mat);
  const rcPivot = new THREE.Group();
  rcPivot.position.set(-4.5, AF, 7.3);
  rcPivot.rotation.y = 0.15;
  rcPivot.add(rc);
  ctx.scene.add(rcPivot);
  ctx.col.addCircle(-4.5, 7.3, 0.42, AF, AF + 1.2);
  const rocker = new Rocker(ctx, rc, { amp: 0.17, speed: 1.4, active: true });
  // she stands right at the glass so the lawn, far below, can see her face,
  // turned a little toward the path, her arms flung out to the frame
  ctx.ghosts.add({ id: 'attic', who: 'henrietta', pos: V(-4.68, AF - 0.15, 8.1), yaw: 0.3, opacity: 0.6, maxDist: 18, look: false });

  // the sheet that stands up
  const sheetGeo = new THREE.CylinderGeometry(0.22, 0.5, 1.7, 18, 8, true);
  const sp = sheetGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i);
    const a = Math.atan2(sp.getZ(i), sp.getX(i));
    const k = 1 + Math.sin(a * 5 + y * 3) * 0.08 * (0.85 - y);
    sp.setX(i, sp.getX(i) * k);
    sp.setZ(i, sp.getZ(i) * k);
  }
  sheetGeo.translate(0, 0.85, 0);
  sheetGeo.computeVertexNormals();
  const sheet = new THREE.Group();
  const sheetBody = new THREE.Mesh(sheetGeo, ctx.mat.sheet);
  const sheetHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), ctx.mat.sheet);
  sheetHead.position.y = 1.68;
  sheet.add(sheetBody, sheetHead);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), ctx.mat.blackMatte);
    e.position.set(s * 0.08, 1.78, 0.22);
    sheet.add(e);
  }
  sheet.position.set(1.0, AF, 2.6);
  sheet.scale.set(1, 0.05, 1);
  sheet.traverse((o) => (o.castShadow = true));
  ctx.scene.add(sheet);
  const sheetState = { k: 0.05, target: 0.05 };
  ctx.updaters.push((dt, t) => {
    sheetState.k += (sheetState.target - sheetState.k) * Math.min(1, dt * 1.6);
    sheet.scale.y = sheetState.k;
    sheet.rotation.z = Math.sin(t * 2.3) * 0.02 * sheetState.k;
    sheet.lookAt(ctx.camera.position.x, sheet.position.y, ctx.camera.position.z);
  });

  D.zone({
    id: 'attic-bats',
    box: [-0.5, AF - 0.2, -4.5, 3.0, AF + 3, -1.2],
    exclusive: true,
    onEnter: async () => {
      await K.wait(1.0);
      ctx.audio.wings(V(0, AT - 0.5, -2));
      ctx.bats.burst('attic', ctx.camera.position.clone(), 7);
      ctx.director.addFear(0.4);
      ctx.player.shake = 0.5;
      ctx.flashlight.flicker(1.2, 0);
      await K.wait(1.2);
      ctx.spiders.drop(big, AF + 1.75, 3);
      ctx.director.run(async () => {
        await K.wait(8);
        ctx.spiders.raise(big, 0.25);
      });
    },
  });
  D.zone({
    id: 'sheet',
    sphere: [1.0, AF + 1, 2.6, 3.0],
    exclusive: true,
    when: () => ctx.director.zones.find((z) => z.id === 'attic-bats').fired > 0,
    onEnter: async () => {
      await K.wait(0.5);
      sheetState.target = 1;
      ctx.audio.moan(V(1.0, AF + 1.4, 2.6), { gain: 0.6, dur: 2.5, pitch: 0.8 });
      ctx.director.addFear(0.3);
      await K.wait(3.0);
      ctx.audio.sting('hit');
      flashScreen(ctx, 0.3);
      sheetState.target = 0.05;
      ctx.player.shake = 0.7;
    },
  });
  // humming from the gable when you come near the chair
  D.zone({
    id: 'widow-hum',
    sphere: [-4.5, AF + 1, 6.4, 3.2],
    onEnter: () => {
      ctx.audio.hum(V(-4.5, AF + 1.3, 7.4), { gain: 0.45 });
      rocker.active = true;
    },
  });
}

function widowsWalk(ctx) {
  const B = ctx.B.ext;
  const K = ctx.kit;
  const D = ctx.director;
  // a brass telescope aimed at the sea that never brought anyone home
  P.at(B, 2.6, DK, 4.4, 0.3, () => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      B.rod('woodDark', 0, 1.1, 0, Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35, 0.015, 0.015, 5);
    }
    B.push(mat(0, 1.15, 0, 0, 0.25));
    B.cyl('brass', 0, 0, 0.2, 0.045, 0.06, 0.9, 12, { rx: Math.PI / 2 });
    B.cyl('brass', 0, 0, 0.7, 0.065, 0.065, 0.12, 12, { rx: Math.PI / 2 });
    B.pop();
  });
  ctx.col.addCircle(2.6, 4.4, 0.35, DK, DK + 1.5);
  P.at(B, -4.6, DK, 3.2, 2.6, () => P.chair(B, { seat: 'velvet' }));
  ctx.col.addCircle(-4.6, 3.2, 0.3, DK, DK + 1);

  const widow = new Ghost(ctx, 'eleanor', { opacity: 0.9, look: false });
  widow.place(WIDOW.x, WIDOW.y, WIDOW.z, 0);
  ctx.widow = widow;
  let stage = 0;
  ctx.updaters.push(() => {
    if (!ctx.room || ctx.room.id !== 'deck') return;
    if (stage === 0) {
      stage = 1;
      widow.show(0.85, 0.6);
      ctx.sky.next = 3;
    }
  });
  D.zone({
    id: 'finale',
    // you have to walk up to her: the hatch lets you out 3.9 m away
    sphere: [WIDOW.x, DK + 1, WIDOW.z - 0.15, 2.6],
    exclusive: true,
    onEnter: async () => {
      stage = 2;
      ctx.audio.choir(0.9, 12);
      await K.wait(1.5);
      widow.look = true;
      ctx.audio.moan(widow.center(), { gain: 0.5, dur: 4, pitch: 0.85 });
      await K.wait(2.5);
      ctx.sky.strike({ strength: 1.6, close: true });
      const cam = ctx.camera.position;
      const to = V(cam.x, DK, cam.z);
      // she comes right up to you (measure before normalising, or she only
      // ever moved 0.4 m)
      const d = to.clone().sub(widow.position);
      const reach = Math.max(0, d.length() - 0.6);
      to.copy(widow.position).addScaledVector(d.normalize(), reach);
      await widow.moveTo(to, 1.4);
      flashScreen(ctx, 0.6);
      ctx.audio.sting('glimpse');
      widow.vanish(2);
      await ctx.hud.fade(true, 1600);
      const A = ctx.apparitions;
      ctx.game.state = 'ending';
      ctx.input.exitLock();
      ctx.hud.ending(ENDING(A.seen, A.total));
      await ctx.hud.fade(false, 800);
    },
  });
}
