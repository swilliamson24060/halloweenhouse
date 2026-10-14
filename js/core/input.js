import { isTouchDevice } from './util.js';

// Keyboard + mouse (pointer lock, with drag-to-look fallback), touch and
// gamepad input, normalised into look deltas, a movement axis and actions.

const MOVE_KEYS = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const STICK_R = 55; // px of thumb travel for full speed
const STICK_DEAD = 0.12; // fraction of travel ignored around the centre
const TOUCH_LOOK = 1.6; // touch drag is scaled up relative to mouse movement
const TAP_MS = 220;
const TAP_PX = 12;
const EDGE_PX = 36; // a walking finger this close to the side of the screen keeps turning
const EDGE_TURN = 560; // look units per second at the very edge

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.touchMove = { x: 0, y: 0 };
    this.padMove = { x: 0, y: 0 };
    this.actions = new Set();
    this.tap = null; // screen point of the last tap / click-to-use
    this.sensitivity = 1;
    this.invertY = false;
    this.locked = false;
    this.dragLook = false; // fallback when pointer lock is unavailable
    this.dragging = false;
    this.enabled = false;
    this.runToggle = false;
    this.walkHeld = false; // on-screen Walk button is being held
    this.isTouch = isTouchDevice();
    this.onLockChange = null;
    this.onStick = null;
    this._lastTouch = -1e9;
    this._padPrev = [];
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code in MOVE_KEYS || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter') this.actions.add('interact');
      if (e.code === 'KeyF') this.actions.add('flashlight');
      if (e.code === 'KeyM') this.actions.add('mute');
      if (e.code === 'Escape' || e.code === 'KeyP') this.actions.add('pause');
      if (e.code === 'CapsLock') this.runToggle = !this.runToggle;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.release());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.dragLook = true;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || (this.dragLook && this.dragging)) {
        // ignore the occasional huge jump some browsers report on lock
        if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
    this.dom.addEventListener('mousedown', (e) => {
      // skip the compatibility mouse events some browsers send after a touch
      if (!this.enabled || performance.now() - this._lastTouch < 800) return;
      if (this.locked) {
        if (e.button === 0) this.actions.add('interact');
        if (e.button === 2) this.actions.add('flashlight');
      } else if (this.dragLook) {
        this.dragging = true;
        this._down = { x: e.clientX, y: e.clientY, t: performance.now() };
      }
    });
    window.addEventListener('mouseup', (e) => {
      // without pointer lock, a click that does not drag uses what is under the cursor
      const d = this._down;
      if (this.dragging && d && e.button === 0 && performance.now() - d.t < 300 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) {
        this._tapAt(e.clientX, e.clientY);
      }
      this.dragging = false;
      this._down = null;
    });
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch: a floating stick on the left, drag-to-look on the right, and a
    // quick tap anywhere uses whatever is under the finger.
    this._stick = null;
    this._lookTouch = null;
    const el = this.dom;
    el.addEventListener(
      'touchstart',
      (e) => {
        this._lastTouch = performance.now();
        if (!this.enabled) return;
        for (const t of e.changedTouches) {
          const tt = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now() };
          if (t.clientX < window.innerWidth * 0.42 && !this._stick) {
            this._stick = tt;
            if (this.onStick) this.onStick(true, t.clientX, t.clientY, 0, 0);
          } else if (!this._lookTouch) {
            this._lookTouch = tt;
          }
        }
        e.preventDefault();
      },
      { passive: false }
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        if (!this.enabled) return;
        for (const t of e.changedTouches) {
          if (this._stick && t.identifier === this._stick.id) {
            let dx = t.clientX - this._stick.sx;
            let dy = t.clientY - this._stick.sy;
            const d = Math.hypot(dx, dy);
            if (d > STICK_R) {
              dx *= STICK_R / d;
              dy *= STICK_R / d;
            }
            // rescale past the dead zone so the stick still reaches full speed
            const m = Math.min(d, STICK_R) / STICK_R;
            const k = m <= STICK_DEAD ? 0 : (m - STICK_DEAD) / (1 - STICK_DEAD) / m;
            this.touchMove.x = (dx / STICK_R) * k;
            this.touchMove.y = (-dy / STICK_R) * k;
            if (this.onStick) this.onStick(true, this._stick.sx, this._stick.sy, dx, dy);
          } else if (this._lookTouch && t.identifier === this._lookTouch.id) {
            this.lookDX += (t.clientX - this._lookTouch.x) * TOUCH_LOOK;
            this.lookDY += (t.clientY - this._lookTouch.y) * TOUCH_LOOK;
            this._lookTouch.x = t.clientX;
            this._lookTouch.y = t.clientY;
          }
        }
        e.preventDefault();
      },
      { passive: false }
    );
    const end = (e) => {
      this._lastTouch = performance.now();
      const cancelled = e.type === 'touchcancel';
      for (const t of e.changedTouches) {
        let tt = null;
        if (this._stick && t.identifier === this._stick.id) {
          tt = this._stick;
          this._stick = null;
          this.touchMove.x = this.touchMove.y = 0;
          if (this.onStick) this.onStick(false);
        } else if (this._lookTouch && t.identifier === this._lookTouch.id) {
          tt = this._lookTouch;
          this._lookTouch = null;
        }
        if (tt && !cancelled && this.enabled && performance.now() - tt.t < TAP_MS && Math.hypot(t.clientX - tt.sx, t.clientY - tt.sy) < TAP_PX) {
          this._tapAt(t.clientX, t.clientY);
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  _tapAt(x, y) {
    this.tap = { x, y };
    this.actions.add('interact');
  }

  // On-screen "hold to walk" button: walks forward while held. The finger
  // holding it also looks around as it slides, so a single thumb can walk
  // and steer, and pressing it against the side of the screen keeps turning.
  attachWalk(el, onChange) {
    this._walkChange = onChange;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled || this._walk) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        /* touch pointers are captured implicitly anyway */
      }
      this._walk = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX };
      this._setWalk(true);
    });
    // listen on window so the finger is followed wherever it slides
    window.addEventListener('pointermove', (e) => {
      const w = this._walk;
      if (!w || e.pointerId !== w.id) return;
      const dx = e.clientX - w.x;
      const dy = e.clientY - w.y;
      this.lookDX += dx * TOUCH_LOOK;
      this.lookDY += dy * TOUCH_LOOK;
      w.x = e.clientX;
      w.y = e.clientY;
    });
    const up = (e) => {
      if (this._walk && e.pointerId === this._walk.id) this._setWalk(false);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  _setWalk(on) {
    if (!on) this._walk = null;
    if (this.walkHeld === on) return;
    this.walkHeld = on;
    if (this._walkChange) this._walkChange(on);
  }

  // Forget held keys and fingers (window blur, pausing, app switch).
  release() {
    this.keys.clear();
    this.dragging = false;
    this._down = null;
    if (this._stick && this.onStick) this.onStick(false);
    this._stick = null;
    this._lookTouch = null;
    this.touchMove.x = this.touchMove.y = 0;
    this._setWalk(false);
  }

  requestLock() {
    if (this.isTouch) return;
    try {
      const p = this.dom.requestPointerLock();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          this.dragLook = true;
        });
      }
    } catch (err) {
      this.dragLook = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  trigger(action) {
    this.actions.add(action);
  }

  consumeLook() {
    const dx = this.lookDX;
    const dy = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
    return { dx, dy };
  }

  take(action) {
    if (this.actions.has(action)) {
      this.actions.delete(action);
      return true;
    }
    return false;
  }

  // Screen point of the tap behind the current 'interact', if it came from one.
  takeTap() {
    const t = this.tap;
    this.tap = null;
    return t;
  }

  axis() {
    let x = 0;
    let y = 0;
    for (const k of this.keys) {
      const m = MOVE_KEYS[k];
      if (m) {
        x += m[0];
        y += m[1];
      }
    }
    x += this.touchMove.x + this.padMove.x;
    y += this.touchMove.y + this.padMove.y + (this.walkHeld ? 1 : 0);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  running() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.runToggle || this._padRun;
  }

  // Per-frame polling: edge turning for the Walk finger, then gamepads.
  update(dt) {
    // only once the finger has slid towards that edge, not where it pressed
    const w = this._walk;
    if (w) {
      const left = EDGE_PX - w.x;
      const right = w.x - (window.innerWidth - EDGE_PX);
      if (left > 0 && w.x < w.sx - TAP_PX) this.lookDX -= Math.min(1, left / EDGE_PX) * EDGE_TURN * dt;
      else if (right > 0 && w.x > w.sx + TAP_PX) this.lookDX += Math.min(1, right / EDGE_PX) * EDGE_TURN * dt;
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) {
      this.padMove.x = this.padMove.y = 0;
      this._padRun = false;
      return;
    }
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    this.padMove.x = dz(pad.axes[0] || 0);
    this.padMove.y = -dz(pad.axes[1] || 0);
    this.lookDX += dz(pad.axes[2] || 0) * 900 * dt;
    this.lookDY += dz(pad.axes[3] || 0) * 700 * dt;
    const pressed = (i) => pad.buttons[i] && pad.buttons[i].pressed;
    const edge = (i) => pressed(i) && !this._padPrev[i];
    if (edge(0)) this.actions.add('interact');
    if (edge(3) || edge(2)) this.actions.add('flashlight');
    if (edge(9)) this.actions.add('pause');
    this._padRun = pressed(10) || pressed(4) || pressed(6);
    this._padPrev = pad.buttons.map((b) => b.pressed);
  }

  clearFrame() {
    this.actions.clear();
    this.tap = null;
  }
}
