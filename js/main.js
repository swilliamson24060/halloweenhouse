import { Game, autoQuality } from './game.js';
import { isTouchDevice } from './core/util.js';
import { HINTS, HINT_TIP } from './story.js';

const $ = (id) => document.getElementById(id);

// A button that tells you where the apparitions you have not seen yet are
// waiting, one per press, nearest first: distance across the ground plus
// 8 m for each floor between you (a hillside is not a floor), since each
// has to be walked up to. Returns a reset, called whenever the panel
// holding it opens.
const LEVEL = { cellar: -1, ground: 0, second: 1, attic: 2, deck: 3 };

function hinter(game, textEl, btn, first) {
  let order = [];
  let i = 0;
  btn.addEventListener('click', () => {
    if (!order.length) return;
    const a = order[i % order.length];
    i++;
    const [where, what] = HINTS[a.id] || ['Somewhere in the house', 'One more is still waiting for you.'];
    const b = document.createElement('b');
    b.textContent = `${where}. `;
    const tip = document.createElement('small');
    tip.textContent = HINT_TIP;
    textEl.replaceChildren(b, what, tip);
    textEl.hidden = false;
    // with only one left, its hint stays put; otherwise offer the next
    if (order.length === 1) btn.hidden = true;
    else btn.textContent = `Another hint (${(i % order.length) + 1} of ${order.length})`;
  });
  return () => {
    const ctx = game.ctx;
    const p = ctx.player.pos;
    const here = LEVEL[ctx.room ? ctx.room.floor : 'ground'] ?? 0;
    const far = (a) => {
      const q = a.ghost.position;
      const room = ctx.rooms.at(q.clone().setY(q.y + 1));
      const level = LEVEL[room ? room.floor : 'ground'] ?? 0;
      const floors = Math.abs(level - here);
      return Math.hypot(q.x - p.x, q.z - p.z) + 8 * floors;
    };
    order = ctx.apparitions.list.filter((a) => !a.seen).sort((x, y) => far(x) - far(y));
    i = 0;
    textEl.hidden = true;
    btn.hidden = order.length === 0;
    btn.textContent = first;
  };
}

// a toggle button's look and its state for screen readers
function setOn(el, on) {
  el.classList.toggle('on', on);
  el.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('ravenmoor-settings') || '{}');
  } catch (e) {
    return {};
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem('ravenmoor-settings', JSON.stringify(s));
  } catch (e) {
    /* storage unavailable: settings last for this visit only */
  }
}

const settings = { volume: 0.8, bright: 1, sens: 1, invert: false, vibrate: true, quality: 'auto', ...loadSettings() };
const touch = isTouchDevice();
if (touch) document.body.classList.add('touch');

// Installed to the home screen, the page already fills the screen.
const standalone =
  matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// iPhone Safari has no fullscreen for pages; a home-screen icon is the way.
if (/iPhone|iPod/.test(navigator.userAgent) && !standalone) $('ios-tip').hidden = false;

// Safari's pinch zoom would fight the touch controls.
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ------------------------------------------------------------ fullscreen
const root = document.documentElement;
const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function setFullscreen(on) {
  try {
    let p = null;
    if (on && !isFullscreen()) {
      if (root.requestFullscreen) p = root.requestFullscreen({ navigationUI: 'hide' });
      else if (root.webkitRequestFullscreen) p = root.webkitRequestFullscreen();
    } else if (!on && isFullscreen()) {
      if (document.exitFullscreen) p = document.exitFullscreen();
      else if (document.webkitExitFullscreen) p = document.webkitExitFullscreen();
    }
    if (p && p.catch) p.catch(() => {});
  } catch (e) {
    /* refused: carry on in the page */
  }
}

// ------------------------------------------- keep the phone screen awake
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
      const lock = await navigator.wakeLock.request('screen');
      wakeLock = lock;
      lock.addEventListener('release', () => {
        if (wakeLock === lock) wakeLock = null;
      });
    } else if (!on && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      await lock.release();
    }
  } catch (e) {
    wakeLock = null;
  }
}

// choosing a detail level before loading
const qSel = $('quality');
qSel.value = settings.quality || 'auto';
const resolved = settings.quality === 'auto' || !settings.quality ? autoQuality() : settings.quality;

let game;
let restarted = false;

function applySettings() {
  if (!game) return;
  const ctx = game.ctx;
  ctx.audio.setVolume(settings.volume);
  ctx.audio.haptics = touch && !!settings.vibrate;
  ctx.post.gamma = settings.bright;
  ctx.input.sensitivity = settings.sens;
  ctx.input.invertY = settings.invert;
}

async function boot() {
  const bar = $('bar');
  const status = $('status');
  const enter = $('enter');
  try {
    game = new Game(resolved);
  } catch (err) {
    status.textContent = 'This browser could not start WebGL, so the house cannot be shown.';
    console.error(err);
    return;
  }

  // Sound on or off: M, the Sound button in the corner (for a mouse, on
  // every screen) or the one in the touch controls
  const sound = $('sound');
  sound.addEventListener('click', (e) => {
    game.mute(!game.ctx.audio.muted);
    // clicked, not keyed: let go of it, or Enter in the house would press it again
    if (e.detail) sound.blur();
  });
  game.onMute = (muted) => {
    setOn(sound, !muted);
    sound.firstChild.textContent = muted ? 'Muted' : 'Sound';
    setOn($('t-mute'), !muted);
    $('t-mute').textContent = muted ? 'Muted' : 'Sound';
  };
  try {
    await game.load((p, msg) => {
      bar.style.width = `${Math.round(p * 100)}%`;
      if (msg) status.textContent = msg;
    });
  } catch (err) {
    console.error(err);
    status.textContent = 'Something went wrong while building the house. Reload the page to try again.';
    return;
  }
  applySettings();
  enter.disabled = false;
  if (!touch) enter.focus();
  status.textContent = 'The house is waiting.';

  qSel.addEventListener('change', () => {
    settings.quality = qSel.value;
    saveSettings(settings);
    status.textContent = 'Reloading with the new detail level…';
    location.reload();
  });

  enter.addEventListener('click', () => {
    // must run inside the tap itself, before anything async
    if (touch && canFullscreen && !standalone) setFullscreen(true);
    $('title').hidden = true;
    game.start();
    applySettings();
    keepAwake(true);
    if (touch) {
      $('touch').hidden = false;
      game.ctx.hud.toast('Hold Walk to walk, and drag to look around. Tap things to use them.', 7);
    }
    game.ctx.input.requestLock();
  });

  // pause menu
  const pauseEl = $('pause');
  const fsBox = $('s-fullscreen');
  const pauseHints = hinter(game, $('pause-hint'), $('pause-hint-btn'), 'Need a hint?');
  game.onPause = () => {
    const a = game.ctx.apparitions;
    $('pause-found').textContent = `You have witnessed ${a.seen} of ${a.total} apparitions.`;
    pauseHints();
    fsBox.checked = isFullscreen();
    pauseEl.hidden = false;
    pauseEl.scrollTop = 0;
    keepAwake(false);
    if (!touch) $('resume').focus();
  };
  game.ctx.input.onLockChange = (locked) => {
    if (!locked && game.state === 'playing' && !game.ctx.input.dragLook && !game.ctx.input.isTouch) game.pause();
  };
  $('resume').addEventListener('click', () => {
    pauseEl.hidden = true;
    game.resume();
    keepAwake(true);
  });
  $('restart').addEventListener('click', () => {
    if (restarted) return;
    restarted = true;
    location.reload();
  });
  const bind = (id, key, parse = Number) => {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!settings[key];
    else el.value = settings[key];
    el.addEventListener('input', () => {
      settings[key] = el.type === 'checkbox' ? el.checked : parse(el.value);
      saveSettings(settings);
      applySettings();
    });
  };
  bind('s-volume', 'volume');
  bind('s-bright', 'bright');
  bind('s-sens', 'sens');
  bind('s-invert', 'invert');
  bind('s-vibrate', 'vibrate');
  const sq = $('s-quality');
  sq.value = game.q.name;
  sq.addEventListener('change', () => {
    settings.quality = sq.value;
    saveSettings(settings);
    location.reload();
  });
  for (const el of document.querySelectorAll('[data-needs="fullscreen"]')) el.hidden = !canFullscreen;
  for (const el of document.querySelectorAll('[data-needs="vibrate"]')) el.hidden = !(touch && navigator.vibrate);
  fsBox.addEventListener('change', () => setFullscreen(fsBox.checked));
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => (fsBox.checked = isFullscreen()));

  // Switching apps, locking the phone or taking a call pauses the house;
  // "Return to the house" is then the tap that lets the sound resume.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') game.pause();
  });
  const ac = game.ctx.audio.ac;
  ac.addEventListener('statechange', () => {
    if (ac.state === 'interrupted' && game.state === 'playing') game.pause();
  });

  // ending card, with the same hints for any you missed
  game.ctx.hud.onEnding = hinter(game, $('ending-hint'), $('ending-hint-btn'), 'Where are the others?');
  $('ending-stay').addEventListener('click', () => {
    game.ctx.hud.hideEnding();
    game.resume();
  });

  // touch buttons
  if (touch) {
    const input = game.ctx.input;
    const stick = document.querySelector('#touch .stick');
    const knob = stick.firstElementChild;
    input.onStick = (on, x, y, dx, dy) => {
      stick.classList.toggle('idle', !on);
      if (!on) return; // fades out where it was
      stick.style.left = `${x}px`;
      stick.style.top = `${y}px`;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    // a brief flash confirms the press (iOS ignores :active here)
    const flash = (b) => {
      b.classList.add('pressed');
      setTimeout(() => b.classList.remove('pressed'), 160);
    };
    // movement buttons act on touch-down so they respond mid-stride
    const press = (id, fn) =>
      $(id).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        flash($(id));
        fn($(id));
      });
    input.attachWalk($('t-walk'), (on) => setOn($('t-walk'), on));
    press('t-use', () => input.trigger('interact'));
    press('t-light', () => input.trigger('flashlight'));
    press('t-centre', () => input.trigger('recenter'));
    press('t-run', (b) => {
      input.runToggle = !input.runToggle;
      setOn(b, input.runToggle);
    });
    $('t-mute').addEventListener('click', () => {
      flash($('t-mute'));
      input.trigger('mute');
    });
    $('t-menu').addEventListener('click', () => game.pause());
    game.onFlashlight = (on) => setOn($('t-light'), on);
  }
}

boot();
