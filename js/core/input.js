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

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.touchMove = { x: 0, y: 0 };
    this.padMove = { x: 0, y: 0 };
    this.actions = new Set();
    this.sensitivity = 1;
    this.invertY = false;
    this.locked = false;
    this.dragLook = false; // fallback when pointer lock is unavailable
    this.dragging = false;
    this.enabled = false;
    this.runToggle = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.onLockChange = null;
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
    window.addEventListener('blur', () => this.keys.clear());

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
      if (!this.enabled || this.isTouchEvent) return;
      if (this.locked) {
        if (e.button === 0) this.actions.add('interact');
        if (e.button === 2) this.actions.add('flashlight');
      } else if (this.dragLook) {
        this.dragging = true;
      }
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch: left half = movement stick, right half = look.
    this._stick = null;
    this._lookTouch = null;
    const el = this.dom;
    el.addEventListener(
      'touchstart',
      (e) => {
        if (!this.enabled) return;
        this.isTouchEvent = true;
        for (const t of e.changedTouches) {
          if (t.clientX < window.innerWidth * 0.42 && !this._stick) {
            this._stick = { id: t.identifier, ox: t.clientX, oy: t.clientY };
            if (this.onStick) this.onStick(true, t.clientX, t.clientY, 0, 0);
          } else if (!this._lookTouch) {
            this._lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now() };
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
            let dx = t.clientX - this._stick.ox;
            let dy = t.clientY - this._stick.oy;
            const r = 55;
            const d = Math.hypot(dx, dy);
            if (d > r) {
              dx *= r / d;
              dy *= r / d;
            }
            this.touchMove.x = dx / r;
            this.touchMove.y = -dy / r;
            if (this.onStick) this.onStick(true, this._stick.ox, this._stick.oy, dx, dy);
          } else if (this._lookTouch && t.identifier === this._lookTouch.id) {
            this.lookDX += (t.clientX - this._lookTouch.x) * 1.6;
            this.lookDY += (t.clientY - this._lookTouch.y) * 1.6;
            this._lookTouch.x = t.clientX;
            this._lookTouch.y = t.clientY;
          }
        }
        e.preventDefault();
      },
      { passive: false }
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this._stick && t.identifier === this._stick.id) {
          this._stick = null;
          this.touchMove.x = this.touchMove.y = 0;
          if (this.onStick) this.onStick(false);
        } else if (this._lookTouch && t.identifier === this._lookTouch.id) {
          // a quick tap on the right side interacts
          const lt = this._lookTouch;
          if (performance.now() - lt.t < 220 && Math.hypot(t.clientX - lt.sx, t.clientY - lt.sy) < 12) this.actions.add('interact');
          this._lookTouch = null;
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
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
    y += this.touchMove.y + this.padMove.y;
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

  // Gamepad polling; call once per frame.
  update(dt) {
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
  }
}
