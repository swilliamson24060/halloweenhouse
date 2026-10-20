import * as THREE from 'three';
import { mat } from '../core/geo.js';
import { Y } from './layout.js';
import * as P from './props.js';
import { Snake } from '../creatures/snakes.js';
import { fetchSkeleton } from '../creatures/skeleton.js';
import { Door } from './dynamic.js';
import { cobweb, webQuad } from './build.js';
import { flashScreen } from './rooms_upper.js';
import { makeFire } from '../gfx/effects.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CF = Y.cellar;
const CT = Y.cellarTop;

export function cellarRooms(ctx) {
  const B = ctx.B.cel;
  const K = ctx.kit;
  const D = ctx.director;
  const R = ctx.rng;
  // the furnace, still warm
  const door = P.at(B, 0.6, CF, -3.6, 0, () => P.furnace(B));
  ctx.col.addCircle(0.6, -3.6, 0.8, CF, CT);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), ctx.mat.ember);
  glow.position.copy(door).add(V(0, 0.02, 0.012));
  ctx.scene.add(glow);
  const fire = makeFire(0.3, 0.22, false);
  fire.position.copy(door).add(V(0, -0.1, -0.05));
  ctx.scene.add(fire);
  ctx.updaters.push((dt, t) => (fire.userData.material.uniforms.uTime.value = t));
  const furnaceLight = ctx.lights.add({ pos: door.clone().add(V(0, 0.2, 0.6)), color: 0xff6a20, intensity: 4, distance: 7, flicker: 'fire', room: 'cellar' });
  ctx.lights.add({ pos: door.clone().add(V(0, 0.2, 0.6)), color: 0xff6a20, intensity: 2, distance: 6, flicker: 'fire', room: 'cellarstair' });
  void furnaceLight;
  // coal heap
  for (let i = 0; i < 26; i++) {
    const a = R.float(0, Math.PI * 2);
    const r = R.float(0, 0.9);
    B.sphere('coal', 3.1 + Math.cos(a) * r, CF + 0.1 + (0.9 - r) * 0.35, 4.3 + Math.sin(a) * r, R.float(0.12, 0.25), 1, 0.6, 1, 6, 4);
  }
  ctx.col.addCircle(3.1, 4.3, 1.0, CF, CF + 0.6);
  B.boxMM('woodRough', 1.9, CF, 3.0, 4.3, CF + 0.9, 3.08);
  // shelves of preserves along the left wall
  for (const z of [-5.6, -3.8]) {
    P.at(B, -6.62, CF, z, Math.PI / 2, () => P.shelfJars(B, R, { w: 1.6, h: 2.2, rows: 5 }));
    ctx.col.addBox(-6.85, CF, z - 0.8, -6.4, CF + 2.2, z + 0.8);
  }
  // workbench by the back wall
  P.at(B, 0.6, CF, -7.45, 0, () => P.workbench(B));
  ctx.col.addBox(-0.5, CF, -7.85, 1.7, CF + 1.0, -7.05);
  // crates and barrels
  for (const [x, z, s] of [
    [-5.5, -1.4, 0.6],
    [-4.9, -1.2, 0.5],
    [-5.3, -0.7, 0.55],
    [5.5, 1.8, 0.7],
  ]) {
    P.at(B, x, CF, z, R.float(-0.4, 0.4), () => P.crate(B, { s }));
    ctx.col.addCircle(x, z, s * 0.6, CF, CF + 1);
  }
  P.at(B, -5.25, CF + 0.6, -1.3, 0.3, () => P.crate(B, { s: 0.45 }));
  for (const [x, z] of [
    [-1.4, 1.2],
    [-0.8, 1.6],
    [5.9, -2.6],
  ]) {
    P.at(B, x, CF, z, 0, () => P.barrel(B));
    ctx.col.addCircle(x, z, 0.33, CF, CF + 1);
  }
  // puddles
  for (const [x, z, w, d] of [
    [2.0, -0.5, 1.4, 0.9],
    [-3.6, -4.5, 1.0, 1.6],
    [4.8, -2.4, 0.8, 0.6],
  ]) {
    B.planarQuad('water', V(x - w / 2, CF + 0.004, z + d / 2), V(x + w / 2, CF + 0.004, z + d / 2), V(x + w / 2, CF + 0.004, z - d / 2), V(x - w / 2, CF + 0.004, z - d / 2));
  }
  // boarded-up doorway in the front wall, scratched from the inside
  B.box('blackMatte', 1.5, CF + 1.0, 5.86, 1.0, 2.0, 0.02);
  for (let i = 0; i < 5; i++) {
    P.at(B, 1.5, CF + 0.35 + i * 0.38, 5.8, 0, () => {
      B.push(mat(0, 0, 0, 0, 0, (i % 2 ? 1 : -1) * 0.12));
      B.box('woodRough', 0, 0, 0, 1.3, 0.16, 0.04);
      B.pop();
    });
  }
  B.box('woodRough', 1.5, CF + 1.0, 5.82, 1.15, 2.1, 0.02);
  // wine cellar behind its iron gate
  for (const [x, z, ry, w] of [
    [5.0, -7.62, 0, 3.4],
    [6.62, -5.9, -Math.PI / 2, 2.8],
  ]) {
    P.at(B, x, CF, z, ry, () => P.wineRack(B, R, { w, h: 2.2 }));
  }
  ctx.col.addBox(3.2, CF, -7.85, 6.85, CF + 2.3, -7.4);
  ctx.col.addBox(6.4, CF, -7.4, 6.85, CF + 2.3, -4.4);
  P.at(B, 4.2, CF, -5.8, 0, () => P.barrel(B, { h: 1.0 }));
  ctx.col.addCircle(4.2, -5.8, 0.34, CF, CF + 1);
  const g = ctx.house.wineGate;
  new Door(ctx, { hinge: g.hingeL, yaw: g.yaw, width: g.w, height: g.h - 0.02, side: 'L', swing: 1, mat: 'iron', name: 'wine', wallFrame: g.W, knob: true });
  // webs and spiders
  for (let i = 0; i < 9; i++) {
    const x = R.float(-6, 6);
    const z = R.float(-7, 5);
    webQuad(B, x, CT - 0.4, z, R.float(0, 3), 1.0, 0.7);
  }
  K.corners(B, -6.85, 6.85, -7.85, 5.85, CT, 1.1);
  const S = ctx.spiders;
  for (let i = 0; i < 8; i++) S.add(S.floor(-6.5, 6.5, -7.5, 5.5, CF + 0.006), { size: 0.035 + Math.random() * 0.04, speed: 0.18 });
  S.add(S.surface([-6.84, CF + 0.3, 5.6], [0, 0, -1], [0, 1, 0], 12.5, 2.2), { size: 0.06 });
  S.add(S.surface([6.84, CF + 0.3, -7.6], [0, 0, 1], [0, 1, 0], 6, 2.2), { size: 0.06 });
  const dropper = S.hang(-2.5, CT - 0.1, -6.2, 0.11);
  // rats and snakes
  ctx.rats.add(
    [
      [-6.6, 5.6],
      [-6.6, 2.2],
      [-3.3, 2.2],
      [-2.2, -1.0],
      [-6.5, -1.2],
    ],
    CF
  );
  ctx.rats.add(
    [
      [6.6, 5.6],
      [2.4, 5.6],
      [2.2, 2.0],
      [6.5, 2.4],
    ],
    CF
  );
  ctx.rats.add(
    [
      [-1.8, -7.6],
      [2.6, -7.6],
      [2.6, -4.6],
      [-1.0, -4.6],
    ],
    CF
  );
  new Snake(ctx, { x: 1.5, y: CF, z: 1.5, region: [-2.0, -1.5, 6.0, 5.4], length: 1.8, radius: 0.033 });
  new Snake(ctx, { x: -4.5, y: CF, z: -3.5, region: [-6.2, -7.2, -2.5, 1.2], length: 1.3 });
  // out from the row of posts, so his lantern clears them whichever way he turns
  ctx.ghosts.add({ id: 'cellar', who: 'walter', pos: V(1.9, CF, -1.75), yaw: 2.6, opacity: 0.7, maxDist: 9 });

  crypt(ctx);

  // furnace bangs and a spider drops near the bottom of the stairs
  D.zone({
    id: 'cellar-arrive',
    room: 'cellar',
    exclusive: true,
    onEnter: async () => {
      ctx.audio.fire(door, 0.3);
      await K.wait(2.5);
      ctx.audio.slam(door, { metal: true, gain: 0.8 });
      ctx.player.shake = 0.3;
      ctx.director.addFear(0.2);
    },
  });
  D.zone({
    id: 'cellar-spider',
    sphere: [-2.5, CF + 1, -6.2, 1.4],
    onEnter: () => {
      ctx.spiders.drop(dropper, CF + 1.6, 4);
      ctx.audio.skitter(V(-2.5, CF + 1.8, -6.2), 0.5);
      setTimeout(() => ctx.spiders.raise(dropper, 0.3), 7000);
    },
  });
  D.zone({
    id: 'boarded',
    sphere: [1.5, CF + 1, 5.0, 2.0],
    once: false,
    cooldown: 25,
    onEnter: () => {
      ctx.audio.scratch(V(1.5, CF + 1.0, 6.2), 2.6);
      setTimeout(() => ctx.audio.knock(V(1.5, CF + 1.2, 6.2), 2, 0.8), 2600);
    },
  });
}

function crypt(ctx) {
  const B = ctx.B.cel;
  const K = ctx.kit;
  const D = ctx.director;
  // coffin on trestles, lying along z
  const cx = -5.0;
  const cz = 4.0;
  const top = CF + 0.62;
  P.at(B, cx, CF, cz, 0, () => P.trestle(B));
  P.at(B, cx, CF + 0.58, cz, 0, () => P.coffin(B));
  ctx.col.addBox(cx - 0.4, CF, cz - 1.1, cx + 0.4, CF + 1.1, cz + 1.1);
  // lid
  const lidG = new THREE.ExtrudeGeometry(P.lidShape(), { depth: 0.05, bevelEnabled: false });
  lidG.rotateX(-Math.PI / 2);
  lidG.translate(0, 0, 1.0);
  const lid = new THREE.Mesh(lidG, ctx.mat.woodDark);
  lid.position.set(cx, top + 0.46, cz);
  lid.castShadow = true;
  ctx.scene.add(lid);
  // the one inside, lying face up with its head toward -z like the coffin:
  // the skeleton model (with the lid on, nobody sees it arrive), or, if it
  // cannot be had, a picture of it that does not move
  let bones = null;
  fetchSkeleton().then((sk) => {
    if (!sk) return;
    // feet at the foot of the coffin, its back on the bottom
    sk.root.position.set(cx, top + 0.145, cz + 0.87);
    sk.root.rotation.x = -Math.PI / 2;
    ctx.scene.add(sk.root);
    bones = sk;
  });
  // candles around the coffin
  const pts = [];
  for (const [dx, dz] of [
    [-0.75, -0.9],
    [0.75, -0.9],
    [-0.75, 0.9],
    [0.75, 0.9],
  ]) {
    pts.push(
      P.at(B, cx + dx, CF, cz + dz, 0, () => {
        B.lathe(
          'castIron',
          [
            [0, 0],
            [0.14, 0],
            [0.03, 0.08],
            [0.02, 0.9],
            [0.07, 0.95],
            [0, 0.95],
          ],
          8
        );
        B.push(mat(0, 0.95, 0));
        const p = P.candle(B, 0.2, 0.03);
        B.pop();
        return p;
      })
    );
    ctx.col.addCircle(cx + dx, cz + dz, 0.15, CF, CF + 1.2);
  }
  const candles = K.candles(pts, 'crypt', { on: false, intensity: 1.4, distance: 5 });
  // a cross on the wall and the caretaker's notes
  B.box('woodDark', cx, CF + 1.6, 5.83, 0.08, 0.9, 0.04);
  B.box('woodDark', cx, CF + 1.75, 5.83, 0.5, 0.08, 0.04);
  P.at(B, -3.5, CF, 2.6, 0.3, () => P.crate(B, { s: 0.55 }));
  ctx.col.addCircle(-3.5, 2.6, 0.35, CF, CF + 0.6);
  K.note(B, -3.5, CF + 0.556, 2.6, 0.5, 'caretaker');
  K.corners(B, -6.85, -3.12, 2.12, 5.85, CT, 0.9);

  const st = { lidK: 0, lidT: 0, sit: 0, sitT: 0, jaw: 0 };
  ctx.updaters.push((dt, t) => {
    st.lidK += (st.lidT - st.lidK) * Math.min(1, dt * 1.2);
    lid.position.set(cx + st.lidK * 0.75, top + 0.46 - st.lidK * 0.4, cz + st.lidK * 0.2);
    lid.rotation.z = -st.lidK * 0.6;
    st.sit += (st.sitT - st.sit) * Math.min(1, dt * (st.sitT > 0.5 ? 2.2 : 0.6));
    if (bones) bones.pose(st.sit, st.jaw, t, dt, ctx.camera.position);
  });
  D.zone({
    id: 'coffin',
    sphere: [cx, CF + 1, cz, 2.3],
    exclusive: true,
    onEnter: async () => {
      await K.wait(1.0);
      ctx.audio.knock(V(cx, top + 0.3, cz), 3, 0.8, 0.5);
      await K.wait(2.0);
      ctx.audio.stoneGrind(V(cx, top + 0.4, cz), 1.6);
      st.lidT = 1;
      await K.wait(1.6);
      ctx.audio.slam(V(cx + 0.8, CF + 0.1, cz), { gain: 0.7 });
      await K.wait(0.6);
      candles.set(true);
      st.sitT = 1;
      st.jaw = 1;
      ctx.audio.sting('hit');
      flashScreen(ctx, 0.25);
      ctx.player.shake = 0.8;
      ctx.director.addFear(0.6);
      await K.wait(1.2);
      st.jaw = 0;
      ctx.director.run(async () => {
        await K.wait(5);
        st.sitT = 0;
        ctx.audio.creak(V(cx, top + 0.3, cz), { gain: 0.5, pitch: 0.7 });
      });
    },
  });
}
