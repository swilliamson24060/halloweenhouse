import { Game, autoQuality } from './game.js';

const $ = (id) => document.getElementById(id);

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

const settings = { volume: 0.8, bright: 1, sens: 1, invert: false, quality: 'auto', ...loadSettings() };
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touch) document.body.classList.add('touch');

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
  enter.focus();
  status.textContent = 'The house is waiting.';

  qSel.addEventListener('change', () => {
    settings.quality = qSel.value;
    saveSettings(settings);
    status.textContent = 'Reloading with the new detail level…';
    location.reload();
  });

  enter.addEventListener('click', () => {
    $('title').hidden = true;
    game.start();
    applySettings();
    if (touch) {
      $('touch').hidden = false;
      setTimeout(() => document.querySelector('#touch .hint').classList.add('gone'), 9000);
    }
    game.ctx.input.requestLock();
  });

  // pause menu
  const pauseEl = $('pause');
  game.onPause = () => {
    const a = game.ctx.apparitions;
    $('pause-found').textContent = `You have witnessed ${a.seen} of ${a.total} apparitions.`;
    pauseEl.hidden = false;
    $('resume').focus();
  };
  game.ctx.input.onLockChange = (locked) => {
    if (!locked && game.state === 'playing' && !game.ctx.input.dragLook && !game.ctx.input.isTouch) game.pause();
  };
  $('resume').addEventListener('click', () => {
    pauseEl.hidden = true;
    game.resume();
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
  const sq = $('s-quality');
  sq.value = game.q.name;
  sq.addEventListener('change', () => {
    settings.quality = sq.value;
    saveSettings(settings);
    location.reload();
  });

  // ending card
  $('ending-stay').addEventListener('click', () => {
    game.ctx.hud.hideEnding();
    game.resume();
  });

  // touch buttons
  if (touch) {
    const input = game.ctx.input;
    const stick = document.querySelector('#touch .stick');
    const knob = document.querySelector('#touch .knob');
    input.onStick = (on, x, y, dx, dy) => {
      stick.hidden = !on;
      if (!on) return;
      stick.style.left = `${x}px`;
      stick.style.top = `${y}px`;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const tap = (id, fn) =>
      $(id).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn($(id));
      });
    tap('t-use', () => input.trigger('interact'));
    tap('t-light', (b) => {
      input.trigger('flashlight');
      b.classList.toggle('on');
    });
    tap('t-run', (b) => {
      input.runToggle = !input.runToggle;
      b.classList.toggle('on', input.runToggle);
    });
    tap('t-mute', () => input.trigger('mute'));
    tap('t-menu', () => game.pause());
  }
}

boot();
