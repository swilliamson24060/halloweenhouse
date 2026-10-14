import * as THREE from 'three';
import { buildTextures } from './gfx/textures.js';
import { buildMaterials, makeEnvironment } from './gfx/materials.js';
import { GeoBuilder } from './core/geo.js';
import { CollisionWorld } from './core/collision.js';
import { Input } from './core/input.js';
import { Player } from './core/player.js';
import { Interactions } from './core/interact.js';
import { Director } from './core/director.js';
import { Rooms } from './core/rooms.js';
import { LightPool, Flashlight } from './core/lights.js';
import { damp, nextFrame, isTouchDevice } from './core/util.js';
import { Sky, MOON_DIR } from './gfx/sky.js';
import { Post } from './gfx/post.js';
import { Flames, Dust, GroundFog, Beam, Shafts } from './gfx/effects.js';
import { buildHouse } from './world/house.js';
import { buildExterior } from './world/exterior.js';
import { furnish } from './world/rooms.js';
import { AudioEngine } from './audio/audio.js';
import { Hud } from './ui/hud.js';

export const QUALITY = {
  low: { name: 'low', pr: 1, aa: false, shadows: false, moonShadow: false, flashShadow: false, post: false, bloom: false, lights: 3, grass: 1800, dust: 260, shafts: false, beam: false, mirror: false, groundFog: true },
  medium: { name: 'medium', pr: 1.25, aa: true, shadows: true, moonShadow: true, moonMap: 1024, flashShadow: true, flashMap: 512, post: true, bloom: false, lights: 4, grass: 4500, dust: 520, shafts: true, beam: true, mirror: true, mirrorRes: 320, groundFog: true },
  high: { name: 'high', pr: 2, aa: true, shadows: true, moonShadow: true, moonMap: 2048, flashShadow: true, flashMap: 1024, post: true, bloom: true, lights: 6, grass: 9000, dust: 800, shafts: true, beam: true, mirror: true, mirrorRes: 768, groundFog: true },
};

export function autoQuality() {
  if (isTouchDevice()) return 'low';
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'high' : 'medium';
}

const FOG_OUT = new THREE.Color(0x0b0d12);
const FOG_IN = new THREE.Color(0x040405);
const FOV = 70;
const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

export class Game {
  constructor(qualityName) {
    this.q = QUALITY[qualityName] || QUALITY.medium;
    this.touch = isTouchDevice();
    const canvas = document.getElementById('scene');
    // phone GPUs resolve MSAA on-chip, so even the low preset keeps it there
    const antialias = (this.q.aa || this.touch) && !this.q.post;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
    // Adaptive resolution: render fewer pixels when frames run slow, and on
    // phones climb back towards the screen's sharpness when there is headroom.
    const dpr = window.devicePixelRatio || 1;
    const pr = Math.min(dpr, this.q.pr);
    const max = this.touch && this.q.name === 'low' ? Math.min(dpr, 1.6) : pr;
    this.res = { pr, min: Math.min(pr, this.touch ? 0.6 : 0.75), ceiling: max, acc: 0, n: 0, cool: 2 };
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = this.q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(FOG_OUT.clone(), 0.03);
    this.camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.05, 520);
    this.scene.add(this.camera);
    this.clock = new THREE.Clock(false);
    this.state = 'loading';
    this.time = 0;
    this.indoorK = 0;
    this.roomTimer = new Map();
    this.ctx = {
      THREE,
      game: this,
      scene: this.scene,
      camera: this.camera,
      renderer,
      quality: this.q,
      updaters: [],
      room: null,
      time: 0,
    };
    // phones report the new size late after a rotation, so check again
    window.addEventListener('resize', () => {
      this.resize();
      clearTimeout(this._resizeT);
      this._resizeT = setTimeout(() => this.resize(), 350);
    });
    // Mobile browsers may drop the GPU context (memory pressure, app switch).
    // three.js rebuilds its resources when it comes back; pause meanwhile.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.pause();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.restoreGPU();
    });
  }

  // Textures painted on canvases re-upload by themselves after a lost
  // context, but anything rendered once into a target comes back blank:
  // rebuild the reflection map and ask for fresh moon shadows.
  restoreGPU() {
    const ctx = this.ctx;
    const old = ctx.env;
    if (old) {
      const env = makeEnvironment(this.renderer);
      const swap = (m) => {
        if (m && m.isMaterial && m.envMap === old) {
          m.envMap = env;
          m.needsUpdate = true;
        }
      };
      this.scene.traverse((o) => {
        if (Array.isArray(o.material)) o.material.forEach(swap);
        else swap(o.material);
      });
      for (const m of Object.values(ctx.mat || {})) swap(m);
      ctx.env = env;
    }
    if (this.moon && this.moon.castShadow) this.moon.shadow.needsUpdate = true;
    this.resize();
  }

  async load(progress) {
    const ctx = this.ctx;
    const r = this.renderer;
    progress(0.02, 'Painting the wallpaper…');
    await nextFrame();
    ctx.tex = await buildTextures(r, (p) => progress(0.02 + p * 0.4, 'Painting the wallpaper…'));
    progress(0.44, 'Polishing the brass…');
    await nextFrame();
    ctx.env = makeEnvironment(r);
    ctx.mat = buildMaterials(ctx.tex, ctx.env);

    ctx.col = new CollisionWorld();
    ctx.rooms = new Rooms();
    ctx.input = new Input(r.domElement);
    ctx.interact = new Interactions(ctx);
    ctx.director = new Director(ctx);
    ctx.hud = new Hud(this);
    ctx.audio = new AudioEngine(ctx);
    ctx.player = new Player(ctx);
    ctx.player.onStep = (tag, running) => ctx.audio.footstep(tag, running);
    ctx.player.onLand = (tag) => ctx.audio.footstep(tag, true);
    ctx.apparitions = { seen: 0, total: 13, list: [] };
    ctx.B = {
      g: new GeoBuilder('ground'),
      f2: new GeoBuilder('second'),
      at: new GeoBuilder('attic'),
      cel: new GeoBuilder('cellar'),
      ext: new GeoBuilder('exterior'),
      yard: new GeoBuilder('yard'),
      garden: new GeoBuilder('garden'),
      grave: new GeoBuilder('graveyard'),
      decal: new GeoBuilder('decals'),
    };

    // lights
    const hemi = new THREE.HemisphereLight(0x48577a, 0x17130f, 0.5);
    this.scene.add(hemi);
    this.hemi = hemi;
    const moon = new THREE.DirectionalLight(0xa9b8e0, 0.75);
    moon.position.copy(MOON_DIR).multiplyScalar(70).add(new THREE.Vector3(2, 0, 0));
    moon.target.position.set(2, 0, 0);
    this.scene.add(moon, moon.target);
    if (this.q.moonShadow) {
      moon.castShadow = true;
      const s = moon.shadow;
      s.mapSize.set(this.q.moonMap, this.q.moonMap);
      s.camera.left = -30;
      s.camera.right = 30;
      s.camera.top = 30;
      s.camera.bottom = -30;
      s.camera.near = 10;
      s.camera.far = 150;
      s.bias = -0.0006;
      s.normalBias = 0.05;
      s.autoUpdate = false;
      s.needsUpdate = true;
    }
    this.moon = moon;
    ctx.moon = moon;
    // soft fill from the lane side so the facade reads; only used outdoors
    const fill = new THREE.DirectionalLight(0x8496c4, 0.4);
    fill.position.set(14, 18, 40);
    fill.target.position.set(0, 3, 0);
    this.scene.add(fill, fill.target);
    this.fill = fill;
    ctx.lights = new LightPool(this.scene, this.q.lights);
    ctx.flashlight = new Flashlight(ctx, { shadows: this.q.flashShadow, mapSize: this.q.flashMap || 512, cookie: ctx.tex.cookie });
    ctx.sky = new Sky(ctx);
    ctx.flames = new Flames(this.scene, 200);
    ctx.dust = new Dust(this.scene, this.q.dust, 6);
    if (this.q.beam) ctx.beam = new Beam(this.scene);
    ctx.shafts = new Shafts(this.scene, MOON_DIR);
    ctx.shafts.group.visible = this.q.shafts;
    if (this.q.groundFog) {
      ctx.groundFog = new GroundFog(this.scene, {
        size: 96,
        center: [2, 0, 0],
        layers: [0.3, 0.75, 1.25],
        exclude: [[-9.6, -8.6, 9.6, 9.3]],
      });
    }

    progress(0.5, 'Raising the walls…');
    await nextFrame();
    buildHouse(ctx);
    progress(0.6, 'Digging the graves…');
    await nextFrame();
    buildExterior(ctx);
    progress(0.72, 'Furnishing the rooms…');
    await nextFrame();
    await furnish(ctx, (p) => progress(0.72 + p * 0.14, 'Furnishing the rooms…'));

    progress(0.87, 'Waking the dead…');
    await nextFrame();
    for (const [, b] of Object.entries(ctx.B)) {
      if (b.isEmpty()) continue;
      this.scene.add(b.build(ctx.mat));
    }
    if (this.q.shafts) {
      for (const w of ctx.house.windows) {
        if (w.level === 'cellar') continue;
        ctx.shafts.add(w.center, w.w, w.h, w.inward, w.level === 'attic' ? 4 : 5.5);
      }
    }
    ctx.col._stamp = 0;

    progress(0.93, 'Lighting the candles…');
    await nextFrame();
    this.ctx.player.teleport(0.6, 0, 21.5, 0.05, 0.08);
    this.resize();
    try {
      if (r.compileAsync) await r.compileAsync(this.scene, this.camera);
      else r.compile(this.scene, this.camera);
    } catch (e) {
      r.compile(this.scene, this.camera);
    }
    ctx.post = new Post(r, this.scene, this.camera, this.q);
    this.resize();
    // warm-up frame so the first real frame does not hitch
    ctx.post.render(0.016, 0);
    progress(1, 'The house is waiting.');
    this.state = 'ready';
    this.exposeDebug();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    // On tall portrait screens widen the vertical view so the sides are not
    // cut to a sliver: hold the horizontal view of a 4:5 screen, up to 90°.
    let fov = FOV;
    if (aspect < 0.8) fov = Math.min(90, THREE.MathUtils.radToDeg(2 * Math.atan((TAN_HALF_FOV * 0.8) / aspect)));
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.ctx.post) this.ctx.post.setSize(w, h, this.renderer.getPixelRatio());
  }

  start() {
    const ctx = this.ctx;
    ctx.audio.start();
    ctx.hud.show(true);
    ctx.input.enabled = true;
    ctx.hud.touch = ctx.input.isTouch;
    this.state = 'playing';
    if (!this.clock.running) this.clock.start();
    if (!this._looping) {
      this._looping = true;
      this.renderer.setAnimationLoop(() => this.frame());
    }
    if (ctx.onStart) ctx.onStart();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ctx.audio.pause(true);
    this.ctx.input.exitLock();
    this.ctx.input.release();
    if (this.onPause) this.onPause();
  }

  resume() {
    if (this.state !== 'paused' && this.state !== 'ending') return;
    this.state = 'playing';
    this.ctx.audio.pause(false);
    this.ctx.input.requestLock();
  }

  frame() {
    const ctx = this.ctx;
    const raw = this.clock.getDelta();
    let dt = raw;
    if (dt > 0.05) dt = 0.05;
    if (!this._fixedDt) this.adaptResolution(raw);
    if (this._fixedDt) dt = this._fixedDt;
    ctx.input.update(dt);
    if (ctx.input.take('pause')) {
      if (ctx.hud.noteOpen) ctx.hud.closeNote();
      else if (this.state === 'playing') this.pause();
    }
    if (this.state === 'playing') this.step(dt);
    ctx.input.clearFrame();
    ctx.post.fear = ctx.director.fear * 0.8;
    ctx.post.flash = ctx.flashFX || 0;
    ctx.post.render(dt, this.time);
    if (this._fps) this._fps(dt);
  }

  step(dt) {
    const ctx = this.ctx;
    this.time += dt;
    ctx.time = this.time;
    const t = this.time;
    const input = ctx.input;
    const player = ctx.player;

    if (ctx.hud.noteOpen) {
      player.frozen = true;
      if (input.take('interact')) ctx.hud.closeNote();
    } else if (!ctx.cutscene) {
      player.frozen = false;
      if (input.take('interact')) {
        const tap = input.takeTap();
        if (tap) ctx.interact.useAt(this.camera, (tap.x / window.innerWidth) * 2 - 1, 1 - (tap.y / window.innerHeight) * 2);
        else ctx.interact.use();
      }
      if (input.take('flashlight')) {
        const on = ctx.flashlight.toggle();
        ctx.audio.click(on);
        if (this.onFlashlight) this.onFlashlight(on);
      }
    }
    if (input.take('mute')) {
      ctx.audio.setMuted(!ctx.audio.muted);
      ctx.hud.toast(ctx.audio.muted ? 'Sound off' : 'Sound on', 1.5);
      if (this.onMute) this.onMute(ctx.audio.muted);
    }

    player.update(dt);
    ctx.director.update(dt);

    // room tracking
    const probe = player.pos.clone();
    probe.y += 1.0;
    const room = ctx.rooms.at(probe);
    if (room !== ctx.room) {
      const prev = ctx.room;
      ctx.room = room;
      if (room && room.name) {
        const last = this.roomTimer.get(room.id) ?? -1e9;
        if (!room.visited || t - last > 40) ctx.hud.caption(room.name);
        room.visited = true;
        this.roomTimer.set(room.id, t);
      } else if (!room && prev && !prev.outdoor) {
        ctx.hud.caption(ctx.yardName ? ctx.yardName(player.pos) : '');
      }
      if (ctx.onRoom) ctx.onRoom(room, prev);
    }
    const indoor = room && !room.outdoor ? 1 : 0;
    this.indoorK = damp(this.indoorK, indoor, 2.5, dt);

    // atmosphere
    const k = this.indoorK;
    const flash = ctx.sky.flash;
    this.scene.fog.color.copy(FOG_OUT).lerp(FOG_IN, k);
    this.scene.fog.density = 0.028 + k * 0.012;
    this.hemi.intensity = (0.7 - k * 0.57) * (1 + flash * 6) * (this.debugBright || 1);
    this.fill.intensity = 0.45 * (1 - k) * (1 + flash * 2);
    this.moon.intensity = 0.75 + flash * 9;
    if (this.q.moonShadow) {
      this._shadowT = (this._shadowT || 0) - dt;
      if (this._shadowT <= 0 || ctx.shadowDirty) {
        this.moon.shadow.needsUpdate = true;
        this._shadowT = 1.0;
        ctx.shadowDirty = false;
      }
    }

    ctx.interact.update(this.camera);
    ctx.hud.prompt(ctx.cutscene ? '' : ctx.interact.promptText());

    for (const fn of ctx.updaters) fn(dt, t);

    ctx.flashlight.update(dt, this.camera, t);
    ctx.lights.update(dt, t, this.camera.position, room ? room.id : 'outdoor', !room || room.outdoor);
    ctx.sky.update(dt, t, this.camera.position);
    ctx.flames.update(dt, t);
    ctx.dust.update(t, this.camera, ctx.flashlight, this.renderer.getPixelRatio());
    if (ctx.beam) ctx.beam.update(ctx.flashlight);
    ctx.shafts.update(t, flash);
    if (ctx.groundFog) ctx.groundFog.update(t, this.camera.position, flash);
    ctx.audio.update(dt, { indoor: k, room, fear: ctx.director.fear });
    ctx.hud.update(dt);
  }

  // Two-second windows of frame rate decide the render scale. Drops happen
  // below ~27 fps (so a 30 fps low-power cap is left alone); a level that
  // struggled is never climbed back to.
  adaptResolution(dt) {
    const r = this.res;
    if (this.state !== 'playing' || this.contextLost || dt > 0.25) return;
    r.acc += dt;
    r.n++;
    if (r.acc < 2) return;
    const fps = r.n / r.acc;
    r.acc = 0;
    r.n = 0;
    if (r.cool > 0) {
      r.cool--;
      return;
    }
    let pr = r.pr;
    if (fps < 27 && pr > r.min) {
      pr = Math.max(r.min, pr * (fps < 20 ? 0.75 : 0.87));
      r.ceiling = Math.max(r.min, r.pr * 0.95);
    } else if (fps > 52 && pr < r.ceiling) {
      pr = Math.min(r.ceiling, pr * 1.1);
    }
    if (Math.abs(pr - r.pr) < 0.01) return;
    r.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.resize();
    r.cool = 1;
  }

  exposeDebug() {
    const ctx = this.ctx;
    window.__rm = {
      game: this,
      ctx,
      tp: (x, y, z, yaw = ctx.player.yaw, pitch = 0) => ctx.player.teleport(x, y, z, yaw, pitch),
      // render a few frames by hand (used when the tab is in the background)
      shot: (x, y, z, yaw, pitch = 0, frames = 3) => {
        if (x !== undefined) ctx.player.teleport(x, y, z, yaw, pitch);
        if (this.state === 'ready') this.start();
        this._fixedDt = 1 / 30;
        for (let i = 0; i < frames; i++) {
          this.frame();
          this.camera.getWorldDirection(ctx.flashlight.dir);
        }
        this.frame();
        this._fixedDt = 0;
        return true;
      },
      bright: (k = 1) => (this.debugBright = k),
      // capture a view from (x,y,z) [feet] looking at (tx,ty,tz)
      look: (name, x, y, z, tx, ty, tz, frames = 30) => {
        const ex = x;
        const ey = y + 1.62;
        const ez = z;
        const dx = tx - ex;
        const dy = ty - ey;
        const dz = tz - ez;
        const yaw = Math.atan2(-dx, -dz);
        const pitch = Math.atan2(dy, Math.hypot(dx, dz));
        return window.__rm.snap(name, x, y, z, yaw, pitch, frames);
      },
      // render a view and upload it to the local test server (debug only)
      snap: async (name, x, y, z, yaw, pitch = 0, frames = 30) => {
        window.__rm.shot(x, y, z, yaw, pitch, frames);
        this.frame();
        const url = this.renderer.domElement.toDataURL('image/jpeg', 0.85);
        const blob = await (await fetch(url)).blob();
        await fetch('/shot?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
        return name;
      },
      where: () => ({ x: +ctx.player.pos.x.toFixed(2), y: +ctx.player.pos.y.toFixed(2), z: +ctx.player.pos.z.toFixed(2), yaw: +ctx.player.yaw.toFixed(2), room: ctx.room && ctx.room.id }),
    };
    if (/[?&]fps/.test(location.search)) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;color:#9f9;font:12px monospace;z-index:9;pointer-events:none';
      document.body.appendChild(el);
      let acc = 0;
      let n = 0;
      this._fps = (dt) => {
        acc += dt;
        n++;
        if (acc > 0.5) {
          const info = this.renderer.info.render;
          el.textContent = `${Math.round(n / acc)} fps  ${info.calls} calls  ${Math.round(info.triangles / 1000)}k tris`;
          acc = 0;
          n = 0;
        }
      };
    }
  }
}
