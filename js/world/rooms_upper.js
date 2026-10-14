import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GeoBuilder, mat } from '../core/geo.js';
import { Y } from './layout.js';
import * as P from './props.js';
import { Ghost } from '../creatures/ghost.js';
import { Rocker } from './dynamic.js';
import { cobweb } from './build.js';
import { chandelier } from './rooms_ground.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FF = Y.f2;
const FC = Y.f2Ceil;

export function upperRooms(ctx) {
  upperHall(ctx);
  nursery(ctx);
  bathroom(ctx);
  guestRoom(ctx);
  master(ctx);
  sewing(ctx);
}

function upperHall(ctx) {
  const B = ctx.B.f2;
  const K = ctx.kit;
  const D = ctx.director;
  P.rug(B, 0.62, 1.2, FF + 0.004, 0.9, 5.6, 'rug1');
  P.rug(B, -0.45, -4.8, FF + 0.004, 0.9, 5.4, 'rug1');
  P.at(B, 1.72, FF, 3.2, -Math.PI / 2, () => P.table(B, { w: 0.9, d: 0.4, h: 0.8 }));
  ctx.col.addBox(1.45, FF, 2.7, 1.93, FF + 0.85, 3.7);
  const c = P.at(B, 1.72, FF + 0.8, 3.0, 0, () => P.candlestick(B));
  K.candles([c], 'upperhall', { intensity: 2.0, distance: 6 });
  P.at(B, 1.72, FF + 0.8, 3.45, 0, () => P.vase(B));
  P.at(B, 1.45, FF, 5.35, -2.6, () => P.chair(B, { seat: 'velvet', tall: true }));
  ctx.col.addCircle(1.45, 5.35, 0.28, FF, FF + 1);
  // portraits on the bare wall between doors, clear of their frames
  P.at(B, 1.91, FF + 1.75, 0.0, -Math.PI / 2, () => P.painting(B, 0.5, 0.66, 'portrait_widow'));
  P.at(B, -1.91, FF + 1.7, -6.5, Math.PI / 2, () => P.painting(B, 0.55, 0.7, 'portrait_oldman'));
  K.corners(B, -1.93, 0.93, -7.85, -1.8, FC, 0.8);
  cobweb(B, 1.93, FC, 5.85, -1, 0, 0, -1, 0.9);
  cobweb(B, -1.93, FC, 5.85, 1, 0, 0, -1, 0.7);
  const S = ctx.spiders;
  S.add(S.floor(-1.6, 0.8, -7.6, -2.0, FF + 0.006), { size: 0.03 });
  ctx.spiders.add(S.surface([0.92, FF + 1.0, -7.7], [0, 0, 1], [0, 1, 0], 4.5, 2.2), { size: 0.045 });
  const hanger = ctx.spiders.hang(0.6, FC - 0.02, 2.2, 0.085);
  // the lady watching over the stairwell, and the child at the end of the hall
  ctx.ghosts.add({ id: 'gallery', type: 'lady', pos: V(-1.35, FF, 4.9), yaw: Math.PI, opacity: 0.6, maxDist: 13 });
  ctx.ghosts.add({ id: 'hall-child', type: 'child', pos: V(-0.3, FF, -7.35), yaw: 0, opacity: 0.6, maxDist: 12 });

  // a spider drops in front of your face
  D.zone({
    id: 'spider-drop',
    box: [-0.7, FF - 0.2, 1.5, 1.93, FF + 3, 3.0],
    onEnter: async () => {
      ctx.spiders.drop(hanger, ctx.camera.position.y + 0.05, 5);
      ctx.audio.skitter(V(0.6, FF + 2, 2.2), 0.4);
      ctx.director.addFear(0.18);
      await K.wait(6);
      ctx.spiders.raise(hanger, 0.3);
    },
  });
  // a ball rolls out of the dark toward you, then a child laughs
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: 0x7a2420, roughness: 0.6 }));
  ball.visible = false;
  ball.castShadow = true;
  ctx.scene.add(ball);
  const roll = { on: false, v: 0 };
  ctx.updaters.push((dt) => {
    if (!roll.on) return;
    roll.v = Math.max(0, roll.v - dt * 0.12);
    ball.position.z += roll.v * dt;
    ball.rotation.x += (roll.v * dt) / 0.09;
    if (roll.v <= 0.01 || ball.position.z > -2.4) roll.on = false;
  });
  D.zone({
    id: 'ball',
    box: [-1.93, FF - 0.2, -4.0, 0.93, FF + 3, -1.8],
    exclusive: true,
    onEnter: async () => {
      await K.wait(1.2);
      ball.position.set(-0.4, FF + 0.09, -7.4);
      ball.visible = true;
      roll.v = 1.1;
      roll.on = true;
      for (let i = 0; i < 6; i++) {
        ctx.audio.knock(ball.position.clone(), 1, 0.12, 0.1);
        await K.wait(0.5);
      }
      await K.wait(1.5);
      ctx.audio.laugh(V(-0.4, FF + 1.2, -7.6), 0.55);
      ctx.director.addFear(0.25);
    },
  });
  // the rushing woman: after the nursery, she comes for you down the hall
  const rusher = new Ghost(ctx, 'lady', { opacity: 1, color: 0xdfe8f4, look: true });
  D.zone({
    id: 'rush',
    box: [-0.7, FF - 0.2, -1.5, 1.93, FF + 3, 1.6],
    exclusive: true,
    when: () => ctx.flags.nurseryDone,
    onEnter: async () => {
      await K.wait(0.6);
      rusher.place(0.6, FF, 5.3, Math.PI);
      ctx.flashlight.flicker(0.5, 1);
      await rusher.show(0.95, 4);
      ctx.audio.moan(rusher.center(), { gain: 0.4, dur: 1.0, pitch: 1.4 });
      await K.wait(0.6);
      const cam = ctx.camera.position;
      const to = V(cam.x, FF, cam.z);
      const d = to.clone().sub(rusher.position);
      d.y = 0;
      const dist = d.length();
      to.copy(rusher.position).addScaledVector(d.normalize(), Math.max(0, dist - 0.45));
      ctx.audio.sting('hit');
      ctx.flashFX = 0.0;
      await rusher.moveTo(to, 9);
      ctx.player.shake = 1;
      ctx.director.addFear(0.6);
      rusher.vanish(6);
      flashScreen(ctx, 0.35);
    },
  });
}

export function flashScreen(ctx, amount = 0.4) {
  ctx.flashFX = amount;
  const step = () => {
    ctx.flashFX = Math.max(0, (ctx.flashFX || 0) - 0.04);
    if (ctx.flashFX > 0) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ----------------------------------------------------------------- nursery
function nursery(ctx) {
  const B = ctx.B.f2;
  const K = ctx.kit;
  const D = ctx.director;
  const R = ctx.rng;
  P.rug(B, -4.5, 4.4, FF + 0.004, 2.6, 3.6, 'rug2');
  for (const z of [1.9, 3.95]) {
    P.at(B, -6.8, FF, z, Math.PI / 2, () => P.bed(B, { w: 0.92, l: 1.75, sheet: 'linen', blanket: 'velvetGreen' }));
    ctx.col.addBox(-6.85, FF, z - 0.52, -5.0, FF + 0.9, z + 0.52);
  }
  P.at(B, -6.1, FF, 7.4, 0.2, () => P.crib(B));
  ctx.col.addBox(-6.55, FF, 6.7, -5.65, FF + 1.1, 8.1);
  // small table with a music box and the child's drawing
  P.at(B, -3.6, FF, 4.2, 0, () => P.table(B, { w: 0.7, d: 0.55, h: 0.55, mat: 'woodLight' }));
  ctx.col.addBox(-4.0, FF, 3.9, -3.2, FF + 0.6, 4.5);
  for (const [x, z, ry] of [
    [-3.6, 3.65, 0],
    [-3.6, 4.75, Math.PI],
  ]) {
    P.at(B, x, FF, z, ry, () => {
      B.box('woodLight', 0, 0.3, 0, 0.32, 0.03, 0.3);
      for (const sx of [-0.13, 0.13]) for (const sz of [-0.12, 0.12]) B.box('woodLight', sx, 0.15, sz, 0.03, 0.3, 0.03);
      B.box('woodLight', 0, 0.55, -0.14, 0.32, 0.5, 0.03);
    });
  }
  K.note(B, -3.75, FF + 0.556, 4.32, 0.5, 'drawing', { onRead: () => setTimeout(() => ctx.audio.laugh(V(-6.1, FF + 1.0, 7.4), 0.4), 1500) });
  const mb = new THREE.Group();
  mb.position.set(-3.42, FF + 0.55, 4.1);
  mb.rotation.y = 0.4;
  const mbBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.11), ctx.mat.woodDark);
  mbBox.position.y = 0.04;
  const lid = new THREE.Group();
  lid.position.set(0, 0.08, -0.055);
  const lidM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.11), ctx.mat.woodDark);
  lidM.position.z = 0.055;
  lid.add(lidM);
  const dancer = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 8), ctx.mat.porcelain);
  dancer.position.set(0, 0.1, 0);
  mb.add(mbBox, lid, dancer);
  ctx.scene.add(mb);
  const mbState = { open: 0, target: 0, ctl: null };
  ctx.updaters.push((dt) => {
    mbState.open += (mbState.target - mbState.open) * Math.min(1, dt * 3);
    lid.rotation.x = -mbState.open * 1.7;
    dancer.visible = mbState.open > 0.5;
    if (dancer.visible) dancer.rotation.y += dt * 2;
  });
  const playBox = () => {
    if (mbState.ctl && !mbState.ctl.stopped) return;
    mbState.target = 1;
    ctx.audio.creak(mb.position, { short: true, gain: 0.3, pitch: 2 });
    mbState.ctl = ctx.audio.musicBox(mb.position.clone().add(V(0, 0.1, 0)), { loops: 2, gain: 0.55 });
    setTimeout(() => (mbState.target = 0), 30000);
  };
  ctx.interact.add({ pos: mb.position.clone().add(V(0, 0.08, 0)), radius: 0.2, range: 1.8, los: false, prompt: 'Wind the music box', onUse: playBox });
  // a nightlight someone keeps burning
  const nl = P.at(B, -3.85, FF + 0.55, 4.05, 0, () => {
    B.cyl('glass', 0, 0.05, 0, 0.045, 0.04, 0.1, 10, { open: true });
    return P.candle(B, 0.05, 0.02);
  });
  K.candles([nl], 'nursery', { intensity: 1.3, distance: 4.5, scale: 0.03 });
  // rocking horse
  const rhB = new GeoBuilder('horse');
  rockingHorse(rhB);
  const rh = rhB.build(ctx.mat);
  const rhPivot = new THREE.Group();
  rhPivot.position.set(-3.3, FF, 6.9);
  rhPivot.rotation.y = -Math.PI / 2 + 0.4;
  rhPivot.add(rh);
  ctx.scene.add(rhPivot);
  ctx.col.addCircle(-3.3, 6.9, 0.45, FF, FF + 1);
  const horse = new Rocker(ctx, rh, { amp: 0.16, speed: 2.1, active: false });
  // dolls on a shelf whose heads turn when you are not looking
  B.box('woodLight', -4.6, FF + 1.15, 0.73, 1.6, 0.04, 0.28);
  for (const sx of [-0.7, 0.7]) B.box('woodLight', -4.6 + sx, FF + 1.05, 0.7, 0.04, 0.2, 0.2);
  const dolls = [];
  for (let i = 0; i < 4; i++) {
    const x = -5.15 + i * 0.37;
    const body = new THREE.Group();
    body.position.set(x, FF + 1.17, 0.74);
    const dress = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10), i % 2 ? ctx.mat.velvet : ctx.mat.linen);
    dress.position.y = 0.1;
    const head = new THREE.Group();
    head.position.y = 0.25;
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), ctx.mat.porcelain);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), ctx.mat.woodDark);
    hair.rotation.x = -0.5;
    head.add(hm, hair);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), ctx.mat.lacquer);
      e.position.set(s * 0.02, 0.008, 0.05);
      head.add(e);
    }
    body.add(dress, head);
    ctx.scene.add(body);
    dolls.push({ head, body, yaw: (Math.random() - 0.5) * 0.6 });
  }
  ctx.updaters.push(() => {
    if (!ctx.room || ctx.room.id !== 'nursery') return;
    for (const d of dolls) {
      const wp = d.body.position;
      if (!K.seen(wp.clone().add(V(0, 0.25, 0)), 0.1)) {
        const look = Math.atan2(ctx.camera.position.x - wp.x, ctx.camera.position.z - wp.z);
        d.head.rotation.y = Math.max(-1.3, Math.min(1.3, look));
        d.head.rotation.x = 0.2;
      }
    }
  });
  // toys: blocks, a ball, a bear
  for (let i = 0; i < 7; i++) {
    const x = -4.9 + R.float(-0.6, 0.6);
    const z = 5.9 + R.float(-0.5, 0.5);
    B.box(R.pick(['woodLight', 'velvet', 'velvetGreen', 'linen']), x, FF + 0.04 + (i === 6 ? 0.08 : 0), z, 0.08, 0.08, 0.08, R.float(0, 3));
  }
  P.at(B, -2.6, FF, 6.3, -2.2, () => {
    B.sphere('straw', 0, 0.12, 0, 0.12, 1, 1.1, 0.9);
    B.sphere('straw', 0, 0.3, 0.02, 0.08);
    for (const s of [-1, 1]) {
      B.sphere('straw', s * 0.06, 0.37, 0.0, 0.03);
      B.sphere('straw', s * 0.11, 0.17, 0.05, 0.04, 1, 1.4, 1);
      B.sphere('straw', s * 0.07, 0.03, 0.09, 0.045, 1, 0.8, 1.3);
      B.sphere('lacquer', s * 0.03, 0.32, 0.075, 0.01);
    }
  });
  // a dolls' house that is a perfect copy of this one
  P.at(B, -2.45, FF, 2.4, -Math.PI / 2, () => {
    B.box('woodLight', 0, 0.3, 0, 0.9, 0.6, 0.5);
    B.box('siding', 0, 0.85, 0, 0.82, 0.5, 0.46);
    B.box('shingle', 0, 1.18, 0, 0.9, 0.16, 0.52);
    B.box('shingle', 0.3, 1.36, 0.14, 0.2, 0.36, 0.2);
    B.cyl('shingle', 0.36, 1.58, 0.2, 0, 0.14, 0.32, 8);
    for (const x of [-0.25, 0, 0.22]) for (const y of [0.72, 0.98]) B.box('glassDark', x, y, 0.235, 0.08, 0.13, 0.01);
  });
  ctx.col.addBox(-2.75, FF, 1.9, -2.07, FF + 1.2, 2.9);
  K.corners(B, -6.85, -2.07, 0.57, 8.35, FC, 0.8);
  const S = ctx.spiders;
  S.add(S.floor(-6.5, -2.4, 0.9, 8.0, FF + 0.006), { size: 0.03 });
  ctx.ghosts.add({ id: 'window', type: 'child', pos: V(-5.6, FF, 8.0), yaw: 0, opacity: 0.65, maxDist: 24, look: false });

  D.zone({
    id: 'nursery',
    room: 'nursery',
    exclusive: true,
    onEnter: async () => {
      await K.wait(1.5);
      playBox();
      await K.wait(2.5);
      horse.active = true;
      ctx.director.addFear(0.15);
      await K.wait(9);
      ctx.flags.nurseryDone = true;
      ctx.director.run(async () => {
        await K.wait(6);
        horse.active = false;
      });
    },
  });
}

function rockingHorse(B) {
  for (const sx of [-0.2, 0.2]) {
    const g = new THREE.TorusGeometry(1.3, 0.025, 4, 24, 0.7);
    B.geom('woodLight', g, mat(sx, 1.3, 0, Math.PI / 2, 0, Math.PI + 1.22));
    g.dispose();
  }
  for (const [x, z] of [
    [-0.12, 0.3],
    [0.12, 0.3],
    [-0.12, -0.3],
    [0.12, -0.3],
  ]) {
    B.rod('woodLight', x * 1.4, 0.05, z * 1.1, x, 0.42, z * 0.8, 0.025, 0.025, 6);
  }
  B.sphere('woodLight', 0, 0.55, 0, 0.17, 1, 0.85, 2.1);
  B.push(mat(0, 0.7, 0.33, 0, -0.7));
  B.cyl('woodLight', 0, 0.12, 0, 0.07, 0.09, 0.28, 8);
  B.pop();
  B.sphere('woodLight', 0, 0.86, 0.47, 0.09, 0.8, 0.9, 1.5);
  B.sphere('lacquer', 0.05, 0.9, 0.52, 0.015);
  B.sphere('lacquer', -0.05, 0.9, 0.52, 0.015);
  for (let i = 0; i < 6; i++) B.box('blackCloth', 0, 0.86 - i * 0.04, 0.38 - i * 0.04, 0.03, 0.07, 0.05);
  B.box('velvet', 0, 0.71, -0.02, 0.22, 0.03, 0.3);
}

// ---------------------------------------------------------------- bathroom
function bathroom(ctx) {
  const B = ctx.B.f2;
  const K = ctx.kit;
  const D = ctx.director;
  P.at(B, -6.3, FF, -1.5, 0, () => P.tub(B));
  ctx.col.addBox(-6.85, FF, -2.45, -5.85, FF + 0.7, -0.55);
  P.at(B, -3.4, FF, 0.18, Math.PI, () => P.washstand(B));
  ctx.col.addBox(-3.9, FF, -0.1, -2.9, FF + 0.9, 0.43);
  // the mirror over the basin
  B.box('woodDark', -3.4, FF + 1.6, 0.41, 0.66, 0.86, 0.03);
  B.box('glassDark', -3.4, FF + 1.6, 0.39, 0.56, 0.76, 0.01);
  const writing = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.16), new THREE.MeshBasicMaterial({ map: ctx.tex.writingMirror, transparent: true, opacity: 0, depthWrite: false }));
  writing.position.set(-3.4, FF + 1.65, 0.38);
  writing.rotation.y = Math.PI;
  ctx.scene.add(writing);
  P.at(B, -5.0, FF, 0.15, Math.PI, () => P.toilet(B));
  ctx.col.addBox(-5.3, FF, -0.4, -4.7, FF + 1, 0.43);
  B.rod('brass', -2.12, FF + 1.2, -1.2, -2.12, FF + 1.2, -0.3, 0.012, 0.012, 6);
  B.box('linen', -2.15, FF + 1.0, -0.75, 0.02, 0.45, 0.5);
  K.corners(B, -6.85, -2.07, -2.93, 0.43, FC, 0.6);
  const S = ctx.spiders;
  S.add(S.surface([-6.84, FF + 0.8, 0.3], [0, 0, -1], [0, 1, 0], 3.0, 2.0), { size: 0.035 });
  // dripping tap
  let dripT = 0;
  ctx.updaters.push((dt) => {
    if (!ctx.room || ctx.room.id !== 'bath') return;
    dripT -= dt;
    if (dripT <= 0) {
      dripT = 1.1 + Math.random() * 1.6;
      ctx.audio.drip(V(-6.3, FF + 0.6, -2.3));
    }
  });
  // wet footprints walk from the tub toward you
  const prints = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.25), ctx.mat.footprint.clone());
    m.material.opacity = 0;
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    ctx.scene.add(m);
    prints.push(m);
  }
  D.zone({
    id: 'footprints',
    room: 'bath',
    exclusive: true,
    onEnter: async () => {
      await K.wait(2.0);
      const from = V(-5.8, FF + 0.004, -1.5);
      const p = ctx.player.pos;
      const to = V(p.x, FF + 0.004, p.z);
      const dir = to.clone().sub(from);
      const len = dir.length();
      dir.normalize();
      const side = V(-dir.z, 0, dir.x);
      const n = Math.min(prints.length, Math.floor((len - 0.6) / 0.32));
      const yaw = Math.atan2(dir.x, dir.z);
      for (let i = 0; i < n; i++) {
        const m = prints[i];
        m.position.copy(from).addScaledVector(dir, 0.3 + i * 0.32).addScaledVector(side, i % 2 ? 0.09 : -0.09);
        m.rotation.set(-Math.PI / 2, 0, Math.PI + yaw, 'YXZ');
        m.material.opacity = 0.85;
        ctx.audio.footstep('tile', false);
        ctx.audio.drip(m.position);
        await K.wait(0.55);
      }
      ctx.audio.breath(ctx.camera.position.clone().add(V(0, 0.1, 0)));
      ctx.director.addFear(0.35);
      await K.wait(2.5);
      writing.material.opacity = 0.0;
      for (let i = 0; i <= 30; i++) {
        writing.material.opacity = (i / 30) * 0.85;
        await K.wait(0.08);
      }
      ctx.director.run(async () => {
        await K.wait(25);
        for (const m of prints) m.material.opacity = 0;
      });
    },
  });
  ctx.updaters.push(() => {
    if (writing.material.opacity > 0.5 && !ctx.flags.mirrorWritingSeen && K.seen(writing.position, 0.2)) {
      ctx.flags.mirrorWritingSeen = true;
      ctx.audio.sting('low');
    }
  });
}

// -------------------------------------------------------------- guest room
function guestRoom(ctx) {
  const B = ctx.B.f2;
  const K = ctx.kit;
  const D = ctx.director;
  P.at(B, -4.6, FF, -7.8, 0, () => P.bed(B, { w: 1.3, l: 2.0, iron: true, sheet: 'linen', blanket: 'linen' }));
  ctx.col.addBox(-5.3, FF, -7.85, -3.9, FF + 0.9, -5.75);
  P.at(B, -6.4, FF, -5.5, Math.PI / 2, () => P.desk(B, { w: 1.0 }));
  ctx.col.addBox(-6.85, FF, -6.05, -6.0, FF + 0.8, -4.95);
  P.at(B, -5.75, FF, -5.5, -Math.PI / 2, () => P.chair(B, { seat: 'linen' }));
  ctx.col.addCircle(-5.75, -5.5, 0.28, FF, FF + 1);
  const lampP = P.at(B, -6.5, FF + 0.78, -5.1, 0, () => P.oilLamp(B));
  void lampP;
  P.at(B, -2.45, FF, -6.5, -Math.PI / 2, () => P.wardrobe(B, { w: 1.2, h: 2.2 }));
  ctx.col.addBox(-2.75, FF, -7.15, -2.07, FF + 2.4, -5.85);
  P.at(B, -3.4, FF, -7.5, 0, () => P.dresser(B, { w: 0.6, h: 0.75, rows: 3 }));
  P.rug(B, -4.6, -4.8, FF + 0.004, 2.0, 1.4, 'rug0');
  K.corners(B, -6.85, -2.07, -7.85, -3.07, FC, 0.9);
  // wardrobe doors creaking open by themselves
  const wd = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(-2.45 + 0.31, FF + 0.35, -6.5 + s * 0.6);
    hinge.rotation.y = -Math.PI / 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.9, 0.025), ctx.mat.woodDark);
    m.position.set(-s * 0.29, 0.95, 0);
    hinge.add(m);
    ctx.scene.add(hinge);
    wd.push({ hinge, s, a: 0, target: 0 });
  }
  ctx.updaters.push((dt) => {
    for (const d of wd) {
      d.a += (d.target - d.a) * Math.min(1, dt * 0.8);
      d.hinge.rotation.y = -Math.PI / 2 - d.a * d.s;
    }
  });
  D.zone({
    id: 'wardrobe',
    room: 'guest',
    onEnter: async () => {
      await K.wait(3);
      for (const d of wd) d.target = 1.2;
      ctx.audio.creak(V(-2.2, FF + 1.2, -6.5), { long: true, gain: 0.7 });
      await K.wait(1.5);
      ctx.audio.whisper(V(-2.3, FF + 1.5, -6.5), { gain: 0.7 });
      ctx.director.addFear(0.2);
    },
  });
}

// ------------------------------------------------------- master bedroom
function master(ctx) {
  const B = ctx.B.f2;
  const K = ctx.kit;
  const D = ctx.director;
  P.rug(B, 4.6, 2.6, FF + 0.004, 3.0, 3.6, 'rug0');
  P.at(B, 4.6, FF, 0.12, 0, () => P.bed(B, { w: 1.55, l: 2.1, posts: true, canopy: 'velvet', sheet: 'linen', blanket: 'velvet' }));
  ctx.col.addBox(3.75, FF, 0.07, 5.45, FF + 1.0, 2.3);
  for (const x of [3.79, 5.41]) for (const z of [0.15, 2.19]) ctx.col.addCircle(x, z, 0.08, FF, FF + 2.4);
  // a mourning gown laid out on the bed
  P.at(B, 4.6, FF + 0.7, 1.3, 0.2, () => {
    B.lathe(
      'blackCloth',
      [
        [0.05, 0],
        [0.3, 0.05],
        [0.36, 0.5],
        [0.2, 0.9],
        [0.12, 1.1],
      ],
      12,
      mat(0, 0.02, -0.5, 0, Math.PI / 2, 0, 1, 1, 0.25)
    );
  });
  P.at(B, 6.55, FF, 3.4, -Math.PI / 2, () => P.wardrobe(B, { w: 1.3, h: 2.3 }));
  ctx.col.addBox(6.25, FF, 2.7, 6.85, FF + 2.5, 4.1);
  // chaise in the turret
  P.at(B, 7.6, FF, 6.6, -2.35, () => P.sofa(B, { w: 1.3, mat: 'uphRed' }));
  ctx.col.addCircle(7.6, 6.6, 0.6, FF, FF + 1);
  // vanity with the mirror
  P.at(B, 2.4, FF, 4.3, Math.PI / 2, () => P.dresser(B, { w: 1.1, h: 0.78, rows: 2 }));
  ctx.col.addBox(2.07, FF, 3.7, 2.7, FF + 0.85, 4.9);
  const vc = P.at(B, 2.4, FF + 0.8, 3.85, 0, () => P.candlestick(B));
  const vc2 = P.at(B, 2.4, FF + 0.8, 4.75, 0, () => P.candlestick(B));
  const vanityCandles = K.candles([vc, vc2], 'master', { intensity: 2.2, distance: 6 });
  K.note(B, 2.45, FF + 0.805, 4.3, 1.3, 'mirror');
  B.box('gilt', 2.11, FF + 1.75, 4.3, 0.04, 1.0, 0.8);
  const mirrorPos = V(2.135, FF + 1.75, 4.3);
  let mirror = null;
  if (ctx.quality.mirror) {
    mirror = new Reflector(new THREE.PlaneGeometry(0.66, 0.86), { textureWidth: ctx.quality.mirrorRes, textureHeight: Math.round(ctx.quality.mirrorRes * 1.3), color: 0x8d9299, clipBias: 0.003 });
    mirror.position.copy(mirrorPos);
    mirror.rotation.y = Math.PI / 2;
    mirror.camera.layers.enable(3);
    ctx.scene.add(mirror);
    ctx.updaters.push(() => (mirror.visible = !!ctx.room && ctx.room.id === 'master'));
  } else {
    B.box('glassDark', 2.13, FF + 1.75, 4.3, 0.01, 0.86, 0.66);
  }
  K.corners(B, 2.07, 6.85, 0.07, 5.85, FC, 0.9, [2]);
  const S = ctx.spiders;
  S.add(S.floor(2.4, 6.5, 2.5, 5.6, FF + 0.006), { size: 0.04 });
  ctx.ghosts.add({ id: 'master', type: 'veiled', dark: true, pos: V(6.1, FF, 5.1), yaw: -2.4, opacity: 0.7, maxDist: 10 });

  // the husband who is only in the glass
  const husband = new Ghost(ctx, 'gent', { mirrorOnly: !!mirror, opacity: 0.85, look: true, color: 0xc4d4e8 });
  husband.place(4.9, FF, 4.2, -Math.PI / 2);
  const fwd = new THREE.Vector3();
  let state = 'idle';
  let t0 = 0;
  ctx.updaters.push((dt) => {
    if (!ctx.room || ctx.room.id !== 'master') {
      if (state === 'shown') husband.hide(3);
      state = state === 'done' ? 'done' : 'idle';
      return;
    }
    const cam = ctx.camera.position;
    const d = cam.distanceTo(mirrorPos);
    ctx.camera.getWorldDirection(fwd);
    const toM = mirrorPos.clone().sub(cam).normalize();
    const facing = fwd.dot(toM) > 0.86;
    if (state === 'idle' && d < 2.2 && facing && !ctx.flags.mirrorDone) {
      state = 'shown';
      t0 = ctx.director.time;
      // stand behind the viewer, in the reflection
      const back = V(cam.x - toM.x * 1.6, FF, cam.z - toM.z * 1.6);
      back.x = Math.min(6.4, Math.max(2.9, back.x));
      back.z = Math.min(5.5, Math.max(0.6, back.z));
      husband.place(back.x, FF, back.z);
      husband.show(0.8, 0.9);
      ctx.audio.sting('glimpse');
      vanityCandles.set(true);
      if (!mirror) setTimeout(() => husband.vanish(3), 900);
    } else if (state === 'shown' && (!facing || ctx.director.time - t0 > 6)) {
      state = 'done';
      ctx.flags.mirrorDone = true;
      husband.vanish(3);
      ctx.audio.whisper(cam.clone().add(V(-toM.x * 0.6, 0, -toM.z * 0.6)), { gain: 0.9, dur: 1.6 });
      ctx.director.addFear(0.45);
      ctx.flashlight.flicker(1.2, 1);
    }
  });
}

// ------------------------------------------------------------ sewing room
function sewing(ctx) {
  const B = ctx.B.f2;
  const K = ctx.kit;
  const D = ctx.director;
  const H = ctx.house;
  P.at(B, 6.45, FF, -2.0, -Math.PI / 2, () => P.sewingMachine(B));
  ctx.col.addBox(6.2, FF, -2.5, 6.85, FF + 1.1, -1.5);
  // cutting table against the south wall, clear of the door
  P.at(B, 4.0, FF, -0.45, 0, () => {
    P.table(B, { w: 1.3, d: 0.7, h: 0.76 });
    for (let i = 0; i < 3; i++) B.cyl(i % 2 ? 'velvet' : 'linen', -0.35 + i * 0.3, 0.84, 0.05, 0.08, 0.08, 0.6, 12, { rx: Math.PI / 2 });
  });
  ctx.col.addBox(3.3, FF, -0.85, 4.7, FF + 0.8, -0.07);
  P.at(B, 2.65, FF, -3.4, 0.6, () => P.spinningWheel(B));
  ctx.col.addCircle(2.65, -3.4, 0.45, FF, FF + 1.3);
  for (let i = 0; i < 8; i++) B.box(i % 2 ? 'velvetGreen' : 'velvet', 6.7, FF + 0.05 + i * 0.06, -3.5 + (i % 3) * 0.05, 0.25, 0.05, 0.6, 0.1 * i);
  K.corners(B, 2.07, 6.85, -3.93, -0.07, FC, 0.8);
  // red light leaking under the red door
  B.box('redGlow', 4.5, FF + 0.012, -3.95, 0.88, 0.012, 0.04);
  const red = ctx.lights.add({ pos: V(4.5, FF + 0.25, -3.6), color: 0xff2010, intensity: 1.2, distance: 3.5, flicker: 'pulse', room: 'sewing' });
  void red;
  // dress forms that creep closer when you look away; they keep a metre
  // clear of the door and never bunch up into a wall
  const forms = [];
  const bounds = [3.0, -3.6, 6.4, -0.4];
  const spots = [
    [3.6, -3.2],
    [5.6, -3.3],
    [6.2, -0.7],
    [3.9, -2.1],
    [5.4, -1.1],
  ];
  spots.forEach(([x, z], i) => {
    const fb = new GeoBuilder('form');
    P.dressForm(fb, { skirt: i % 2 ? 'blackCloth' : i === 2 ? 'velvet' : null });
    const g = fb.build(ctx.mat);
    g.position.set(x, FF, z);
    g.rotation.y = Math.random() * 6;
    ctx.scene.add(g);
    const c = ctx.col.addDynamicCircle(x, z, 0.28, FF, FF + 1.7, bounds);
    forms.push({ g, c, moves: 0, last: 0 });
  });
  ctx.ghosts.add({ id: 'sewing', type: 'lady', pos: V(4.6, FF, -2.9), yaw: 0.3, opacity: 0.5, maxDist: 9 });
  ctx.updaters.push(() => {
    if (!ctx.room || ctx.room.id !== 'sewing') return;
    const now = ctx.director.time;
    const pl = ctx.player.pos;
    for (const f of forms) {
      if (f.moves > 7 || now - f.last < 1.4) continue;
      const p = f.g.position;
      const dx = pl.x - p.x;
      const dz = pl.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.3) continue;
      if (K.seen(p.clone().add(V(0, 1.2, 0)), 0.35)) continue;
      const step = Math.min(0.4, dist - 1.2);
      const nx = Math.min(bounds[2], Math.max(bounds[0], p.x + (dx / dist) * step));
      const nz = Math.min(bounds[3], Math.max(bounds[1], p.z + (dz / dist) * step));
      if (forms.some((o) => o !== f && Math.hypot(o.g.position.x - nx, o.g.position.z - nz) < 0.9)) continue;
      p.set(nx, FF, nz);
      f.g.rotation.y = Math.atan2(dx, dz);
      f.c.cx = nx;
      f.c.cz = nz;
      f.moves++;
      f.last = now;
      if (Math.random() < 0.35) ctx.audio.creak(p.clone().add(V(0, 0.3, 0)), { short: true, gain: 0.2, pitch: 1.8 });
    }
  });
  H.doors.red.onLocked = () => {
    ctx.hud.toast('The red door will not open. Something behind it is breathing.');
    ctx.audio.knock(V(4.5, FF + 1.4, -4.2), 2, 1.1, 0.3);
  };
  D.zone({
    id: 'red-door',
    sphere: [4.5, FF + 1, -3.5, 1.7],
    exclusive: true,
    onEnter: async () => {
      await K.wait(0.5);
      ctx.audio.heartbeat(0.8);
      await K.wait(0.6);
      ctx.audio.heartbeat(0.9);
      await K.wait(0.5);
      for (let i = 0; i < 4; i++) {
        H.doors.red.rattle(0.35);
        ctx.audio.slam(V(4.5, FF + 1.2, -4.1), { gain: 0.55 });
        ctx.player.shake = 0.35;
        await K.wait(0.42);
      }
      ctx.director.addFear(0.45);
      await K.wait(1.0);
      ctx.audio.whisper(V(4.5, FF + 1.5, -4.3), { gain: 1, dur: 2.5 });
    },
  });
}
