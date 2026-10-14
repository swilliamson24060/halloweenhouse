import * as THREE from 'three';
import { mulberry32, clamp } from '../core/util.js';

// Every sound is synthesised with the Web Audio API: no audio files.
// Positional sounds go through HRTF panners driven by the camera listener
// (cheaper equal-power panning on the low detail preset).

const MIDI = (n) => 440 * Math.pow(2, (n - 69) / 12);
// An original lullaby for the music box (A minor, lilting).
const LULLABY = [
  [76, 1], [81, 1], [84, 1], [83, 2], [81, 1],
  [76, 1], [77, 1], [81, 1], [86, 2], [84, 1],
  [83, 1], [80, 1], [81, 1], [76, 2], [72, 1],
  [71, 1], [72, 1], [74, 1], [69, 3],
];

export class AudioEngine {
  constructor(ctx) {
    this.ctx = ctx;
    this.listener = new THREE.AudioListener();
    ctx.camera.add(this.listener);
    const ac = this.listener.context;
    this.ac = ac;
    this.muted = false;
    this.volume = 0.8;
    this.started = false;
    this.haptics = false; // phone vibration on the biggest frights
    this.panning = ctx.quality && ctx.quality.name === 'low' ? 'equalpower' : 'HRTF';
    this.gcList = [];
    this.indoor = 0;
    this.fear = 0;
    this.heartT = 0;
    this.nextAmbience = 8;
    this.nextCreak = 5;

    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    // a brick-wall limiter after the glue compressor keeps scares from clipping
    this.limiter = ac.createDynamicsCompressor();
    this.limiter.threshold.value = -2.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.12;
    this.comp.connect(this.limiter);
    this.limiter.connect(this.listener.getInput());
    this.master = ac.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.comp);
    this.sfx = ac.createGain();
    this.sfx.connect(this.master);
    this.amb = ac.createGain();
    this.amb.connect(this.master);
    this.music = ac.createGain();
    this.music.gain.value = 0.9;
    this.music.connect(this.master);
    this.reverb = ac.createConvolver();
    this.reverb.buffer = this._impulse(3.4, 2.6);
    this.reverbOut = ac.createGain();
    this.reverbOut.gain.value = 0.9;
    this.reverb.connect(this.reverbOut);
    this.reverbOut.connect(this.master);
    this.wetK = 0.35;

    this.white = this._noise(2.5, 'white');
    this.brown = this._noise(4, 'brown');
    this.pink = this._noise(3, 'pink');
    this.creaks = [this._creakBuffer(1.9, 22, 75, 1, 1100), this._creakBuffer(2.6, 15, 55, 2, 900), this._creakBuffer(0.45, 40, 90, 3, 1300)];
    this.metalCreak = this._creakBuffer(2.8, 60, 160, 4, 620, 0.004);
    this.crackle = this._crackleBuffer(4);
  }

  // ------------------------------------------------------------ plumbing
  _noise(seconds, type) {
    const ac = this.ac;
    const len = Math.floor(seconds * ac.sampleRate);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    const r = mulberry32(type.length * 977);
    let last = 0;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    }
    return buf;
  }

  _impulse(seconds, decay) {
    const ac = this.ac;
    const len = Math.floor(seconds * ac.sampleRate);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    const r = mulberry32(5);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (r() * 2 - 1) * Math.pow(1 - t, decay) * (i < ac.sampleRate * 0.01 ? i / (ac.sampleRate * 0.01) : 1);
      }
    }
    return buf;
  }

  // stick-slip impulses exciting a resonance: the sound of a hinge
  _creakBuffer(seconds, r0, r1, seed, res, ring = 0.0016) {
    const ac = this.ac;
    const sr = ac.sampleRate;
    const len = Math.floor(seconds * sr);
    const buf = ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const r = mulberry32(seed * 131);
    let phase = 0;
    const kLen = Math.floor(sr * ring * 5);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const rate = r0 + (r1 - r0) * Math.sin(Math.PI * Math.pow(x, 0.8)) + (r() - 0.5) * 10 + Math.sin(x * 37) * 6;
      phase += Math.max(5, rate) / sr;
      if (phase >= 1) {
        phase -= 1;
        const env = Math.pow(Math.sin(Math.PI * x), 0.6);
        const amp = (0.35 + 0.65 * r()) * env;
        const f = res * (0.85 + r() * 0.3);
        for (let k = 0; k < kLen && i + k < len; k++) {
          d[i + k] += amp * Math.sin((2 * Math.PI * f * k) / sr) * Math.exp(-k / (sr * ring));
        }
      }
    }
    let mx = 0;
    for (let i = 0; i < len; i++) mx = Math.max(mx, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] /= mx || 1;
    return buf;
  }

  _crackleBuffer(seconds) {
    const ac = this.ac;
    const sr = ac.sampleRate;
    const len = Math.floor(seconds * sr);
    const buf = ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const r = mulberry32(77);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (r() * 2 - 1)) / 1.02;
      d[i] = last * 0.8;
      if (r() < 0.0009) {
        const a = 0.3 + r() * 0.7;
        const n = Math.floor(sr * (0.002 + r() * 0.006));
        for (let k = 0; k < n && i + k < len; k++) d[i + k] += (r() * 2 - 1) * a * (1 - k / n);
      }
    }
    return buf;
  }

  get now() {
    return this.ac.currentTime;
  }

  // Input node for a sound: through a panner if pos is given, plus reverb.
  out(pos, { wet = 1, ref = 1.6, roll = 1.25, dur = 4, bus = null } = {}) {
    const ac = this.ac;
    const input = ac.createGain();
    let tail = input;
    if (pos) {
      const p = ac.createPanner();
      p.panningModel = this.panning;
      p.distanceModel = 'inverse';
      p.refDistance = ref;
      p.rolloffFactor = roll;
      p.maxDistance = 80;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      input.connect(p);
      tail = p;
    }
    tail.connect(bus || this.sfx);
    const send = ac.createGain();
    send.gain.value = this.wetK * wet;
    tail.connect(send);
    send.connect(this.reverb);
    this.gcList.push({ t: this.now + dur + 1, nodes: [input, tail, send] });
    return input;
  }

  env(param, t0, peak, a, hold, rel) {
    param.setValueAtTime(0.0001, t0);
    param.linearRampToValueAtTime(peak, t0 + a);
    param.setValueAtTime(peak, t0 + a + hold);
    param.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
  }

  src(buf, t0, dur, { loop = true, rate = 1, offset = null } = {}) {
    const s = this.ac.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    s.playbackRate.value = rate;
    s.start(t0, offset ?? Math.random() * Math.max(0, buf.duration - dur - 0.1));
    if (dur < 3000) s.stop(t0 + dur + 0.05);
    return s;
  }

  filt(type, f, q = 1) {
    const b = this.ac.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  osc(type, f, t0, dur) {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    o.start(t0);
    if (dur < 3000) o.stop(t0 + dur + 0.05);
    return o;
  }

  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  }

  // -------------------------------------------------------------- control
  start() {
    // On iPhone, play through the ring/silent switch like a video would;
    // the in-game Sound button still mutes.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) {
      /* not supported */
    }
    if (this.started) {
      this.ac.resume();
      return;
    }
    this.started = true;
    this.ac.resume();
    const t = this.now;
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : this.volume, t + 2.5);
    this._ambience();
  }

  setVolume(v) {
    this.volume = v;
    if (!this.started) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.now, 0.1);
  }

  setMuted(m) {
    this.muted = m;
    if (this.started) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.now, 0.1);
  }

  pause(p) {
    if (!this.started) return;
    if (p) this.ac.suspend();
    else this.ac.resume();
  }

  // Vibration where the browser supports it (Android); silently nothing elsewhere.
  buzz(pattern) {
    if (!this.haptics || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      /* blocked until the page has been tapped */
    }
  }

  _ambience() {
    const ac = this.ac;
    const t = this.now;
    // wind: rumbling body + whistling howl
    this.windBus = ac.createGain();
    this.windBus.gain.value = 0.55;
    this.windLP = this.filt('lowpass', 6000, 0.5);
    this.chain(this.windBus, this.windLP, this.amb);
    const body = this.src(this.brown, t, 3600, { offset: 0 });
    this.windBodyF = this.filt('lowpass', 500, 0.7);
    this.windBodyG = ac.createGain();
    this.windBodyG.gain.value = 0.5;
    this.chain(body, this.windBodyF, this.windBodyG, this.windBus);
    const howl = this.src(this.white, t, 3600, { offset: 0 });
    this.howlF = this.filt('bandpass', 600, 14);
    this.howlG = ac.createGain();
    this.howlG.gain.value = 0.0;
    this.chain(howl, this.howlF, this.howlG, this.windBus);
    const howl2 = this.src(this.pink, t, 3600, { offset: 0 });
    this.howl2F = this.filt('bandpass', 900, 18);
    this.howl2G = ac.createGain();
    this.howl2G.gain.value = 0.0;
    this.chain(howl2, this.howl2F, this.howl2G, this.windBus);
    this.gust = 0.5;
    this.gustT = 0;
    // room tone indoors
    const tone = this.src(this.brown, t, 3600, { offset: 0 });
    this.toneG = ac.createGain();
    this.toneG.gain.value = 0;
    this.chain(tone, this.filt('lowpass', 140, 0.7), this.toneG, this.amb);
    // dread drone
    this.droneF = this.filt('lowpass', 240, 2);
    this.droneG = ac.createGain();
    this.droneG.gain.value = 0.0;
    this.chain(this.droneF, this.droneG, this.music);
    for (const [f, type, det] of [
      [55, 'sawtooth', -6],
      [55.4, 'sawtooth', 4],
      [65.4, 'triangle', 0],
      [82.4, 'sawtooth', 7],
    ]) {
      const o = this.osc(type, f, t, 3600);
      o.detune.value = det;
      const g = ac.createGain();
      g.gain.value = 0.25;
      this.chain(o, g, this.droneF);
    }
    const lfo = this.osc('sine', 0.05, t, 3600);
    const lfoG = ac.createGain();
    lfoG.gain.value = 90;
    this.chain(lfo, lfoG, this.droneF.frequency);
  }

  update(dt, { indoor = 0, room = null, fear = 0 } = {}) {
    if (!this.started) return;
    const t = this.now;
    this.indoor = indoor;
    this.fear = fear;
    // gusting wind, muffled indoors
    this.gustT -= dt;
    if (this.gustT <= 0) {
      this.gustT = 1.2 + Math.random() * 2.8;
      this.gust = Math.random() < 0.25 ? 0.9 + Math.random() * 0.4 : 0.3 + Math.random() * 0.4;
      const tc = 0.6 + Math.random();
      this.windBodyG.gain.setTargetAtTime(0.25 + this.gust * 0.55, t, tc);
      this.windBodyF.frequency.setTargetAtTime(300 + this.gust * 700, t, tc);
      this.howlG.gain.setTargetAtTime(this.gust > 0.85 ? 0.22 : 0.05, t, tc);
      this.howlF.frequency.setTargetAtTime(420 + Math.random() * 380, t, tc * 1.4);
      this.howl2G.gain.setTargetAtTime(this.gust > 1 ? 0.12 : 0.02, t, tc);
      this.howl2F.frequency.setTargetAtTime(700 + Math.random() * 500, t, tc * 1.4);
    }
    const out = 1 - indoor;
    this.windBus.gain.setTargetAtTime(0.18 + out * 0.45, t, 0.4);
    this.windLP.frequency.setTargetAtTime(500 + out * 6000, t, 0.4);
    this.toneG.gain.setTargetAtTime(indoor * 0.18, t, 0.5);
    const size = room ? room.size : 'outdoor';
    const wet = room && !room.outdoor ? (size === 'large' ? 0.55 : size === 'small' ? 0.28 : 0.42) : 0.14;
    this.wetK += (wet - this.wetK) * Math.min(1, dt * 2);
    this.droneG.gain.setTargetAtTime(0.012 + fear * 0.1 + indoor * 0.012, t, 0.8);
    this.droneF.frequency.setTargetAtTime(160 + fear * 700, t, 0.8);
    // heartbeat when frightened
    if (fear > 0.4) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartbeat(0.35 + (fear - 0.4) * 1.1);
        this.heartT = 60 / (62 + fear * 70);
      }
    }
    // the house settles
    this.nextCreak -= dt;
    if (this.nextCreak <= 0) {
      this.nextCreak = 5 + Math.random() * 12;
      if (indoor > 0.5) {
        const c = this.ctx.camera.position;
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 5;
        this.creak(new THREE.Vector3(c.x + Math.cos(a) * r, c.y + (Math.random() < 0.4 ? 2.5 : -0.5), c.z + Math.sin(a) * r), { short: Math.random() < 0.6, gain: 0.25, pitch: 0.7 + Math.random() * 0.6 });
      }
    }
    // distant night sounds outdoors
    this.nextAmbience -= dt;
    if (this.nextAmbience <= 0) {
      this.nextAmbience = 14 + Math.random() * 22;
      if (indoor < 0.5) {
        const c = this.ctx.camera.position;
        const a = Math.random() * Math.PI * 2;
        const p = new THREE.Vector3(c.x + Math.cos(a) * 30, c.y + 6, c.z + Math.sin(a) * 30);
        if (Math.random() < 0.6) this.owl(p);
        else this.howl(p);
      }
    }
    // free finished nodes
    if (this.gcList.length > 40 || Math.random() < 0.05) {
      const keep = [];
      for (const g of this.gcList) {
        if (g.t < t) {
          for (const n of g.nodes) {
            try {
              n.disconnect();
            } catch (e) {
              /* already gone */
            }
          }
        } else keep.push(g);
      }
      this.gcList = keep;
    }
  }

  // ----------------------------------------------------------- one-shots
  click(on = true) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(null, { wet: 0.2, dur: 0.1 });
    const s = this.src(this.white, t, 0.02);
    const g = this.ac.createGain();
    this.env(g.gain, t, on ? 0.35 : 0.25, 0.001, 0.004, 0.02);
    this.chain(s, this.filt('highpass', on ? 2600 : 1800, 1), g, o);
  }

  footstep(tag, running) {
    if (!this.started) return;
    const t = this.now;
    const vol = (running ? 1 : 0.7) * (0.85 + Math.random() * 0.3);
    const o = this.out(null, { wet: 0.5, dur: 0.6 });
    const add = (node, gain, a, rel) => {
      const g = this.ac.createGain();
      this.env(g.gain, t, gain * vol, a, 0.0, rel);
      node.connect(g);
      g.connect(o);
    };
    if (tag === 'wood' || tag === 'dirt' || tag === 'rug') {
      const th = this.osc('sine', tag === 'dirt' ? 70 : 95, t, 0.15);
      th.frequency.exponentialRampToValueAtTime(48, t + 0.1);
      add(th, 0.5, 0.004, 0.09);
      const n = this.src(this.white, t, 0.08);
      add(this.chain(n, this.filt('bandpass', tag === 'dirt' ? 700 : 1500, 0.8)), tag === 'dirt' ? 0.15 : 0.22, 0.002, 0.05);
      if (tag === 'wood' && Math.random() < 0.13) this.creak(null, { short: true, gain: 0.18, pitch: 1.4 + Math.random() * 0.6 });
    } else if (tag === 'tile' || tag === 'stone') {
      const n = this.src(this.white, t, 0.08);
      add(this.chain(n, this.filt('bandpass', tag === 'tile' ? 2800 : 2000, tag === 'tile' ? 3 : 0.9)), 0.3, 0.001, 0.045);
      const th = this.osc('sine', 120, t, 0.08);
      th.frequency.exponentialRampToValueAtTime(60, t + 0.06);
      add(th, 0.22, 0.002, 0.05);
      const g2 = this.src(this.white, t, 0.1);
      add(this.chain(g2, this.filt('highpass', 4500, 0.7)), 0.06, 0.004, 0.06);
    } else {
      // grass and leaves
      const n = this.src(this.pink, t, 0.25);
      add(this.chain(n, this.filt('bandpass', 2400 + Math.random() * 1500, 0.6)), 0.35, 0.03, 0.14);
      const th = this.osc('sine', 80, t, 0.1);
      th.frequency.exponentialRampToValueAtTime(45, t + 0.08);
      add(th, 0.18, 0.005, 0.07);
    }
  }

  creak(pos, { long = false, short = false, pitch = 1, metal = false, gain = 1.3 } = {}) {
    if (!this.started) return;
    const t = this.now;
    const buf = metal ? this.metalCreak : short ? this.creaks[2] : long ? this.creaks[1] : this.creaks[0];
    const rate = pitch * (0.9 + Math.random() * 0.2);
    const dur = buf.duration / rate;
    const o = this.out(pos, { wet: 0.8, dur });
    const s = this.ac.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    s.start(t);
    const g = this.ac.createGain();
    g.gain.value = gain;
    const peak = this.filt('peaking', metal ? 700 : 1300, 1.5);
    peak.gain.value = 7;
    this.chain(s, this.filt('highpass', metal ? 250 : 350, 0.7), peak, g, o);
  }

  slam(pos, { metal = false, gain = 1 } = {}) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(pos, { wet: 1.2, dur: 2.5, ref: 3 });
    const b = this.osc('sine', 75, t, 0.7);
    b.frequency.exponentialRampToValueAtTime(36, t + 0.5);
    const bg = this.ac.createGain();
    this.env(bg.gain, t, 1.1 * gain, 0.002, 0.02, 0.5);
    this.chain(b, bg, o);
    const n = this.src(this.white, t, 0.4);
    const ng = this.ac.createGain();
    this.env(ng.gain, t, 0.7 * gain, 0.001, 0.01, 0.25);
    this.chain(n, this.filt('lowpass', metal ? 2400 : 1100, 0.7), ng, o);
    if (metal) {
      for (const f of [212, 339, 515, 707, 1130]) {
        const m = this.osc('sine', f, t, 1.8);
        const mg = this.ac.createGain();
        this.env(mg.gain, t, 0.08 * gain, 0.002, 0, 1.5);
        this.chain(m, mg, o);
      }
    }
    // rattle in the frame
    for (let i = 0; i < 4; i++) {
      const tt = t + 0.08 + i * 0.05 + Math.random() * 0.02;
      const c = this.src(this.white, tt, 0.03);
      const cg = this.ac.createGain();
      this.env(cg.gain, tt, 0.2 * gain * (1 - i * 0.2), 0.001, 0, 0.02);
      this.chain(c, this.filt('bandpass', 1400, 2), cg, o);
    }
  }

  rattle(pos) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 0.6, dur: 1.2 });
    const n = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.06 + Math.random() * 0.04);
      const c = this.src(this.white, t, 0.03);
      const g = this.ac.createGain();
      this.env(g.gain, t, 0.45, 0.001, 0, 0.025);
      this.chain(c, this.filt('bandpass', 1000 + Math.random() * 900, 3), g, o);
      const th = this.osc('sine', 130, t, 0.06);
      const tg = this.ac.createGain();
      this.env(tg.gain, t, 0.3, 0.002, 0, 0.04);
      this.chain(th, tg, o);
    }
  }

  knock(pos, count = 3, gain = 1, gap = 0.32) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 1, dur: count * gap + 1, ref: 2.5 });
    for (let i = 0; i < count; i++) {
      const t = t0 + i * gap + (Math.random() - 0.5) * 0.03;
      const n = this.src(this.white, t, 0.12);
      const g = this.ac.createGain();
      this.env(g.gain, t, 0.9 * gain, 0.001, 0.005, 0.09);
      this.chain(n, this.filt('lowpass', 520, 1.2), g, o);
      const th = this.osc('sine', 95, t, 0.12);
      th.frequency.exponentialRampToValueAtTime(55, t + 0.1);
      const tg = this.ac.createGain();
      this.env(tg.gain, t, 0.8 * gain, 0.001, 0.005, 0.1);
      this.chain(th, tg, o);
    }
  }

  thunder(strength = 1, delay = 0, close = false) {
    if (!this.started) return;
    const t0 = this.now + delay;
    const dur = 3.5 + strength * 4.5;
    const o = this.out(null, { wet: 0.6, dur: dur + delay, bus: this.amb });
    const muff = 1 - this.indoor * 0.6;
    if (close) {
      const c = this.src(this.white, t0, 0.5);
      const cg = this.ac.createGain();
      this.env(cg.gain, t0, 0.6 * muff, 0.003, 0.03, 0.4);
      this.chain(c, this.filt('highpass', 900, 0.7), cg, o);
    }
    const r = this.src(this.brown, t0, dur);
    const lp = this.filt('lowpass', close ? 1600 : 650, 0.8);
    lp.frequency.setValueAtTime(close ? 1600 : 650, t0);
    lp.frequency.exponentialRampToValueAtTime(90, t0 + dur);
    const g = this.ac.createGain();
    const peak = (close ? 1.2 : 0.9) * strength * muff;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + (close ? 0.06 : 0.5));
    for (let k = 1; k < 9; k++) g.gain.setTargetAtTime(peak * (0.25 + Math.random() * 0.75) * (1 - k / 10), t0 + (k * dur) / 10, 0.12);
    g.gain.setTargetAtTime(0.0001, t0 + dur * 0.9, 0.3);
    this.chain(r, lp, g, o);
    const sub = this.osc('sine', 42, t0, dur);
    sub.frequency.exponentialRampToValueAtTime(28, t0 + dur * 0.6);
    const sg = this.ac.createGain();
    this.env(sg.gain, t0, 0.6 * strength * muff, 0.2, 0.3, dur * 0.6);
    this.chain(sub, sg, o);
  }

  whisper(pos, { gain = 0.8, dur = 2.2 } = {}) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 0.9, dur, ref: 1.2 });
    const n = this.src(this.white, t0, dur);
    const hp = this.filt('highpass', 650, 0.7);
    n.connect(hp);
    const sum = this.ac.createGain();
    const fs = [this.filt('bandpass', 600, 6), this.filt('bandpass', 1600, 8), this.filt('bandpass', 2900, 9)];
    for (const f of fs) {
      hp.connect(f);
      f.connect(sum);
    }
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    let t = t0 + 0.05;
    while (t < t0 + dur - 0.1) {
      const len = 0.07 + Math.random() * 0.12;
      fs[0].frequency.setTargetAtTime(300 + Math.random() * 600, t, 0.02);
      fs[1].frequency.setTargetAtTime(1100 + Math.random() * 1500, t, 0.02);
      fs[2].frequency.setTargetAtTime(2500 + Math.random() * 1100, t, 0.02);
      const a = gain * (0.35 + Math.random() * 0.65) * 3;
      g.gain.setTargetAtTime(a, t, 0.015);
      g.gain.setTargetAtTime(a * 0.08, t + len * 0.7, 0.025);
      t += len + (Math.random() < 0.15 ? 0.15 : 0.02);
    }
    g.gain.setTargetAtTime(0.0001, t0 + dur - 0.05, 0.05);
    this.chain(sum, g, o);
  }

  moan(pos, { gain = 0.6, dur = 3.5, pitch = 1 } = {}) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 1.3, dur, ref: 2 });
    const f = 170 * pitch;
    const s = this.osc('sawtooth', f, t0, dur);
    s.frequency.linearRampToValueAtTime(f * 1.32, t0 + dur * 0.4);
    s.frequency.linearRampToValueAtTime(f * 0.78, t0 + dur);
    const lfo = this.osc('sine', 5.2, t0, dur);
    const lg = this.ac.createGain();
    lg.gain.value = f * 0.025;
    this.chain(lfo, lg, s.frequency);
    const sum = this.ac.createGain();
    for (const [ff, q, a] of [
      [380, 6, 1],
      [760, 7, 0.5],
      [2600, 10, 0.08],
    ]) {
      const b = this.filt('bandpass', ff, q);
      const bg = this.ac.createGain();
      bg.gain.value = a;
      this.chain(s, b, bg, sum);
    }
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain * 1.6, t0 + dur * 0.3);
    g.gain.linearRampToValueAtTime(gain * 1.2, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    this.chain(sum, g, o);
  }

  sting(type = 'hit', pos = null) {
    if (!this.started) return;
    const t = this.now;
    if (type === 'glimpse') {
      const o = this.out(null, { wet: 1.2, dur: 4, bus: this.music });
      for (const [f, a] of [
        [880, 0.07],
        [932.3, 0.06],
        [1318.5, 0.04],
        [110, 0.12],
      ]) {
        const s = this.osc(f < 200 ? 'triangle' : 'sine', f, t, 3.5);
        const g = this.ac.createGain();
        this.env(g.gain, t, a, f < 200 ? 0.6 : 0.12, 0.3, 2.6);
        const trem = this.osc('sine', 6 + Math.random() * 3, t, 3.5);
        const tg = this.ac.createGain();
        tg.gain.value = a * 0.4;
        this.chain(trem, tg, g.gain);
        this.chain(s, g, o);
      }
      if (pos) this.whisper(pos, { gain: 0.4, dur: 1.4 });
      return;
    }
    if (type === 'low') {
      setTimeout(() => this.buzz(150), 1500);
      const o = this.out(null, { wet: 1, dur: 4, bus: this.music });
      const n = this.src(this.white, t, 1.8);
      const hp = this.filt('bandpass', 300, 1.2);
      hp.frequency.setValueAtTime(250, t);
      hp.frequency.exponentialRampToValueAtTime(3500, t + 1.5);
      const g = this.ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 1.5);
      g.gain.linearRampToValueAtTime(0.0001, t + 1.56);
      this.chain(n, hp, g, o);
      const b = this.osc('sine', 60, t + 1.5, 1.6);
      b.frequency.setValueAtTime(60, t + 1.5);
      b.frequency.exponentialRampToValueAtTime(30, t + 2.8);
      const bg = this.ac.createGain();
      this.env(bg.gain, t + 1.5, 1.2, 0.005, 0.05, 1.3);
      this.chain(b, bg, o);
      return;
    }
    // jump scare: dissonant string screech + boom
    this.buzz([40, 30, 120]);
    const o = this.out(null, { wet: 0.7, dur: 3, bus: this.music });
    for (const f of [1245, 1318, 1397, 1480, 1567]) {
      const s = this.osc('sawtooth', f, t, 1.6);
      s.frequency.exponentialRampToValueAtTime(f * 0.94, t + 1.4);
      const vib = this.osc('sine', 7 + Math.random() * 3, t, 1.6);
      const vg = this.ac.createGain();
      vg.gain.value = f * 0.012;
      this.chain(vib, vg, s.frequency);
      const g = this.ac.createGain();
      this.env(g.gain, t, 0.055, 0.008, 0.25, 1.1);
      this.chain(s, this.filt('highpass', 700, 0.7), g, o);
    }
    const n = this.src(this.white, t, 0.7);
    const ng = this.ac.createGain();
    this.env(ng.gain, t, 0.45, 0.003, 0.05, 0.5);
    this.chain(n, this.filt('bandpass', 2200, 0.8), ng, o);
    const b = this.osc('sine', 58, t, 1.4);
    b.frequency.exponentialRampToValueAtTime(30, t + 1.0);
    const bg = this.ac.createGain();
    this.env(bg.gain, t, 1.0, 0.003, 0.06, 1.1);
    this.chain(b, bg, o);
  }

  heartbeat(gain = 0.5) {
    if (!this.started) return;
    if (gain > 0.55) this.buzz([14, 226, 10]);
    const t = this.now;
    const o = this.out(null, { wet: 0.1, dur: 0.6, bus: this.music });
    for (const [dt, f, a] of [
      [0, 62, 1],
      [0.24, 52, 0.65],
    ]) {
      const s = this.osc('sine', f, t + dt, 0.2);
      s.frequency.exponentialRampToValueAtTime(f * 0.6, t + dt + 0.12);
      const g = this.ac.createGain();
      this.env(g.gain, t + dt, gain * a, 0.008, 0.02, 0.13);
      this.chain(s, g, o);
    }
  }

  // ------------------------------------------------------------- music
  musicBox(pos, { loops = 2, gain = 0.5, slow = true } = {}) {
    const ctl = { stopped: false, stop: () => (ctl.stopped = true) };
    if (!this.started) return ctl;
    const o = this.out(pos, { wet: 0.9, dur: 40, ref: 1.2 });
    let i = 0;
    let step = 0.3;
    const total = LULLABY.length * loops;
    const next = () => {
      if (ctl.stopped || i >= total) return;
      const [n, len] = LULLABY[i % LULLABY.length];
      const t = this.now + 0.02;
      const f = MIDI(n) * Math.pow(2, ((Math.random() - 0.5) * 18) / 1200);
      for (const [mul, a, dec] of [
        [1, 1, 1.5],
        [2, 0.35, 0.8],
        [3, 0.12, 0.5],
        [5.04, 0.06, 0.25],
      ]) {
        const s = this.osc('sine', f * mul, t, dec + 0.1);
        const g = this.ac.createGain();
        this.env(g.gain, t, gain * a * 0.35, 0.003, 0, dec);
        this.chain(s, g, o);
      }
      i++;
      if (slow && i > total - 10) step *= 1.12;
      setTimeout(next, step * len * 1000);
    };
    next();
    return ctl;
  }

  pianoNote(pos, midi, { gain = 0.5, dur = 3 } = {}) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(pos, { wet: 1, dur, ref: 2 });
    const f = MIDI(midi);
    const Bk = 0.0004;
    for (let n = 1; n <= 6; n++) {
      const fn = f * n * Math.sqrt(1 + Bk * n * n);
      const s = this.osc(n === 1 ? 'triangle' : 'sine', fn, t, dur);
      const g = this.ac.createGain();
      this.env(g.gain, t, (gain * 0.35) / n, 0.004, 0.02, dur * (1.2 - n * 0.12));
      this.chain(s, g, o);
    }
    const h = this.src(this.white, t, 0.03);
    const hg = this.ac.createGain();
    this.env(hg.gain, t, gain * 0.15, 0.001, 0, 0.02);
    this.chain(h, this.filt('bandpass', 2500, 1), hg, o);
  }

  piano(pos, notes, { gain = 0.5, tempo = 0.6 } = {}) {
    notes.forEach((n, i) => {
      const chord = Array.isArray(n) ? n : [n];
      setTimeout(() => chord.forEach((m) => this.pianoNote(pos, m, { gain })), i * tempo * 1000);
    });
  }

  chime(pos, count = 3, gain = 0.6, gap = 2.1) {
    if (!this.started) return;
    for (let k = 0; k < count; k++) {
      setTimeout(() => {
        const t = this.now;
        const o = this.out(pos, { wet: 1.1, dur: 5, ref: 3 });
        for (const [m, a, d] of [
          [0.5, 0.5, 4],
          [1, 1, 3.5],
          [1.19, 0.4, 2.5],
          [1.5, 0.3, 2],
          [2.0, 0.35, 1.6],
          [2.74, 0.2, 1.2],
          [3.76, 0.1, 0.8],
        ]) {
          const s = this.osc('sine', 196 * m, t, d);
          const g = this.ac.createGain();
          this.env(g.gain, t, gain * a * 0.3, 0.002, 0, d);
          this.chain(s, g, o);
        }
      }, k * gap * 1000);
    }
  }

  paper() {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(null, { wet: 0.2, dur: 0.6 });
    const n = this.src(this.pink, t, 0.4);
    const g = this.ac.createGain();
    this.env(g.gain, t, 0.25, 0.03, 0.08, 0.2);
    this.chain(n, this.filt('highpass', 2500, 0.7), g, o);
  }

  whoosh(pos, gain = 0.8) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(pos, { wet: 0.8, dur: 2, ref: 2 });
    const n = this.src(this.brown, t, 1.6);
    const f = this.filt('bandpass', 200, 0.8);
    f.frequency.setValueAtTime(150, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
    f.frequency.exponentialRampToValueAtTime(300, t + 1.4);
    const g = this.ac.createGain();
    this.env(g.gain, t, gain * 2.5, 0.25, 0.2, 1.0);
    this.chain(n, f, g, o);
  }

  tick(pos, tock = false) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(pos, { wet: 0.5, dur: 0.2, ref: 1 });
    const n = this.src(this.white, t, 0.02);
    const g = this.ac.createGain();
    this.env(g.gain, t, 0.35, 0.001, 0, 0.018);
    this.chain(n, this.filt('bandpass', tock ? 2300 : 3100, 9), g, o);
  }

  hum(pos, { gain = 0.5 } = {}) {
    if (!this.started) return;
    const o = this.out(pos, { wet: 1.4, dur: 30, ref: 1.5 });
    let t = this.now + 0.1;
    for (const [n, len] of LULLABY.slice(0, 15)) {
      const f = MIDI(n - 12);
      const d = len * 0.55;
      const s = this.osc('triangle', f, t, d + 0.3);
      const vib = this.osc('sine', 5, t, d + 0.3);
      const vg = this.ac.createGain();
      vg.gain.value = f * 0.012;
      this.chain(vib, vg, s.frequency);
      const g = this.ac.createGain();
      this.env(g.gain, t, gain * 0.5, 0.12, d * 0.5, d * 0.6);
      this.chain(s, this.filt('lowpass', 700, 1), g, o);
      t += d;
    }
  }

  choir(gain = 0.5, dur = 9) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(null, { wet: 1.5, dur, bus: this.music });
    for (const n of [57, 60, 64, 69, 72]) {
      for (const det of [-8, 7]) {
        const s = this.osc('sawtooth', MIDI(n), t, dur);
        s.detune.value = det;
        const vib = this.osc('sine', 4.5 + Math.random(), t, dur);
        const vg = this.ac.createGain();
        vg.gain.value = MIDI(n) * 0.01;
        this.chain(vib, vg, s.frequency);
        const sum = this.ac.createGain();
        for (const [f, q, a] of [
          [700, 5, 1],
          [1150, 6, 0.6],
          [2700, 8, 0.15],
        ]) {
          const b = this.filt('bandpass', f, q);
          const bg = this.ac.createGain();
          bg.gain.value = a;
          this.chain(s, b, bg, sum);
        }
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain * 0.07, t + dur * 0.35);
        g.gain.linearRampToValueAtTime(gain * 0.05, t + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        this.chain(sum, g, o);
      }
    }
  }

  // ------------------------------------------------------------ creatures
  hiss(pos) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(pos, { wet: 0.4, dur: 1.6, ref: 1 });
    const n = this.src(this.white, t, 1.5);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7, t + 0.12);
    g.gain.setValueAtTime(0.6, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    this.chain(n, this.filt('highpass', 2600, 0.7), this.filt('peaking', 6000, 1), g, o);
  }

  bat(pos, dist = 3) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(pos, { wet: 0.5, dur: 0.8, ref: 0.8 });
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const tt = t + i * 0.08;
      const s = this.osc('sine', 7200, tt, 0.06);
      s.frequency.exponentialRampToValueAtTime(4600, tt + 0.045);
      const g = this.ac.createGain();
      this.env(g.gain, tt, 0.08, 0.004, 0, 0.04);
      this.chain(s, g, o);
    }
    const n = this.src(this.white, t, 0.4);
    const am = this.osc('square', 22, t, 0.4);
    const ag = this.ac.createGain();
    ag.gain.value = 0.5;
    const g = this.ac.createGain();
    this.env(g.gain, t, 0.2 / Math.max(1, dist * 0.5), 0.02, 0.2, 0.15);
    this.chain(am, ag, g.gain);
    this.chain(n, this.filt('bandpass', 1600, 1.2), g, o);
  }

  wings(pos) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(pos, { wet: 0.4, dur: 1.2, ref: 2 });
    for (let i = 0; i < 7; i++) {
      const tt = t + i * 0.11;
      const n = this.src(this.white, tt, 0.08);
      const g = this.ac.createGain();
      this.env(g.gain, tt, 0.4 * (1 - i * 0.1), 0.01, 0, 0.06);
      this.chain(n, this.filt('lowpass', 1400, 0.7), g, o);
    }
  }

  caw(pos, { count = 2, big = false } = {}) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 0.8, dur: count * 0.5 + 0.5, ref: 3 });
    for (let i = 0; i < count; i++) {
      const t = t0 + i * (0.38 + Math.random() * 0.1);
      const f = (big ? 360 : 500) * (0.92 + Math.random() * 0.16);
      const s = this.osc('sawtooth', f, t, 0.4);
      s.frequency.linearRampToValueAtTime(f * 1.22, t + 0.06);
      s.frequency.exponentialRampToValueAtTime(f * 0.78, t + 0.32);
      const sum = this.ac.createGain();
      for (const [ff, q, a] of [
        [1050, 3, 1],
        [2100, 4, 0.5],
      ]) {
        const b = this.filt('bandpass', ff * (big ? 0.85 : 1), q);
        const bg = this.ac.createGain();
        bg.gain.value = a;
        this.chain(s, b, bg, sum);
      }
      const rasp = this.osc('square', 68, t, 0.4);
      const rg = this.ac.createGain();
      rg.gain.value = 0.5;
      const g = this.ac.createGain();
      this.env(g.gain, t, 0.55, 0.025, 0.12, 0.18);
      this.chain(rasp, rg, g.gain);
      this.chain(sum, g, o);
    }
  }

  squeak(pos, gain = 0.8) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 0.4, dur: 0.5, ref: 0.8 });
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * 0.14;
      const s = this.osc('sine', 3100, t, 0.12);
      s.frequency.linearRampToValueAtTime(3800, t + 0.04);
      s.frequency.linearRampToValueAtTime(2900, t + 0.1);
      const g = this.ac.createGain();
      this.env(g.gain, t, 0.12 * gain, 0.01, 0.03, 0.06);
      this.chain(s, g, o);
    }
  }

  skitter(pos, dur = 0.9) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 0.3, dur, ref: 0.6 });
    let t = t0;
    while (t < t0 + dur) {
      const c = this.src(this.white, t, 0.01);
      const g = this.ac.createGain();
      this.env(g.gain, t, 0.12 + Math.random() * 0.1, 0.0005, 0, 0.006);
      this.chain(c, this.filt('bandpass', 4200 + Math.random() * 1500, 4), g, o);
      t += 0.015 + Math.random() * 0.05;
    }
  }

  scratch(pos, dur = 2.2) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 0.7, dur, ref: 1.5 });
    let t = t0;
    while (t < t0 + dur) {
      const len = 0.12 + Math.random() * 0.25;
      const n = this.src(this.white, t, len);
      const g = this.ac.createGain();
      this.env(g.gain, t, 0.25 + Math.random() * 0.2, 0.02, len * 0.5, len * 0.4);
      const am = this.osc('sawtooth', 30 + Math.random() * 40, t, len);
      const ag = this.ac.createGain();
      ag.gain.value = 0.12;
      this.chain(am, ag, g.gain);
      this.chain(n, this.filt('bandpass', 2200 + Math.random() * 1600, 2), g, o);
      t += len + Math.random() * 0.25;
    }
  }

  drip(pos) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(pos, { wet: 1.4, dur: 0.6, ref: 1 });
    const s = this.osc('sine', 1100, t, 0.08);
    s.frequency.exponentialRampToValueAtTime(2400, t + 0.03);
    const g = this.ac.createGain();
    this.env(g.gain, t, 0.18, 0.001, 0, 0.05);
    this.chain(s, g, o);
  }

  glass(pos, n = 3) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 0.8, dur: 1.5, ref: 1.5 });
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.28;
      const s = this.osc('sine', 2700 + Math.random() * 300, t, 0.1);
      const g = this.ac.createGain();
      this.env(g.gain, t, 0.15, 0.001, 0, 0.08);
      this.chain(s, g, o);
      const c = this.src(this.white, t, 0.015);
      const cg = this.ac.createGain();
      this.env(cg.gain, t, 0.25, 0.001, 0, 0.01);
      this.chain(c, this.filt('highpass', 2000), cg, o);
    }
  }

  laugh(pos, gain = 0.5) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 1.5, dur: 1.8, ref: 1.5 });
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * 0.2;
      const f = 540 - i * 18;
      const s = this.osc('sawtooth', f, t, 0.16);
      s.frequency.linearRampToValueAtTime(f * 1.08, t + 0.03);
      s.frequency.exponentialRampToValueAtTime(f * 0.86, t + 0.13);
      const sum = this.ac.createGain();
      for (const [ff, q, a] of [
        [340, 6, 0.7],
        [2300, 9, 1],
        [3100, 10, 0.5],
      ]) {
        const b = this.filt('bandpass', ff, q);
        const bg = this.ac.createGain();
        bg.gain.value = a;
        this.chain(s, b, bg, sum);
      }
      const n = this.src(this.white, t, 0.14);
      const ng = this.ac.createGain();
      ng.gain.value = 0.08;
      this.chain(n, this.filt('bandpass', 3000, 1.2), ng, sum);
      const g = this.ac.createGain();
      this.env(g.gain, t, gain * 0.7 * (1 - i * 0.12), 0.012, 0.04, 0.08);
      this.chain(sum, g, o);
    }
  }

  breath(pos) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(pos, { wet: 0.3, dur: 3.2, ref: 0.6 });
    const n = this.src(this.pink, t, 3);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 1.1);
    g.gain.linearRampToValueAtTime(0.05, t + 1.3);
    g.gain.linearRampToValueAtTime(0.6, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    this.chain(n, this.filt('bandpass', 750, 0.9), g, o);
  }

  stoneGrind(pos, dur = 1.6) {
    if (!this.started) return;
    const t = this.now;
    const o = this.out(pos, { wet: 0.9, dur, ref: 2 });
    const n = this.src(this.brown, t, dur);
    const am = this.osc('sawtooth', 16, t, dur);
    const ag = this.ac.createGain();
    ag.gain.value = 0.4;
    const g = this.ac.createGain();
    this.env(g.gain, t, 1.2, 0.08, dur - 0.4, 0.3);
    this.chain(am, ag, g.gain);
    this.chain(n, this.filt('bandpass', 260, 1.5), g, o);
  }

  owl(pos) {
    if (!this.started) return;
    const t0 = this.now;
    const o = this.out(pos, { wet: 1.2, dur: 2.5, ref: 6 });
    for (const [dt, len] of [
      [0, 0.25],
      [0.45, 0.18],
      [0.68, 0.5],
    ]) {
      const t = t0 + dt;
      const s = this.osc('sine', 390, t, len + 0.05);
      s.frequency.linearRampToValueAtTime(360, t + len);
      const g = this.ac.createGain();
      this.env(g.gain, t, 0.12, 0.04, len * 0.4, len * 0.5);
      this.chain(s, this.filt('lowpass', 900), g, o);
    }
  }

  howl(pos) {
    if (!this.started) return;
    const t = this.now;
    const dur = 3.5;
    const o = this.out(pos, { wet: 1.5, dur, ref: 8 });
    const s = this.osc('sawtooth', 420, t, dur);
    s.frequency.linearRampToValueAtTime(640, t + 1.0);
    s.frequency.linearRampToValueAtTime(600, t + 2.4);
    s.frequency.linearRampToValueAtTime(380, t + dur);
    const vib = this.osc('sine', 5.5, t, dur);
    const vg = this.ac.createGain();
    vg.gain.value = 9;
    this.chain(vib, vg, s.frequency);
    const g = this.ac.createGain();
    this.env(g.gain, t, 0.07, 0.7, 1.6, 1.1);
    this.chain(s, this.filt('lowpass', 1100, 1), this.filt('bandpass', 700, 2), g, o);
  }

  // looping crackle for a fire; returns a gain node to fade
  fire(pos, gain = 0.5) {
    if (!this.started) return null;
    const t = this.now;
    const o = this.out(pos, { wet: 0.4, dur: 3600, ref: 1.5 });
    const s = this.ac.createBufferSource();
    s.buffer = this.crackle;
    s.loop = true;
    s.start(t);
    const g = this.ac.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(gain, t, 0.5);
    this.chain(s, this.filt('highpass', 120), g, o);
    return g;
  }
}
