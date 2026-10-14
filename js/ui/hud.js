// DOM overlays: prompt, room captions, toasts, the apparition counter,
// the note reader, screen fades and the ending card.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.el = {
      prompt: $('prompt'),
      cross: $('crosshair'),
      caption: $('caption'),
      toast: $('toast'),
      seen: $('seen'),
      total: $('total'),
      counter: $('counter'),
      fade: $('fade'),
      note: $('note'),
      noteTitle: $('note-title'),
      noteMeta: $('note-meta'),
      noteBody: $('note-body'),
      ending: $('ending'),
      endingText: $('ending-text'),
      use: $('t-use'),
    };
    this.captionT = 0;
    this.toastT = 0;
    this.lastPrompt = '';
    this.noteOpen = false;
    this._noteResolve = null;
    this.touch = false;
    // close on a click that started on the note (not the press that opened
    // it), so a long note can still be scrolled by touch
    this.el.note.addEventListener('pointerdown', () => (this._notePress = true));
    this.el.note.addEventListener('click', () => {
      if (this._notePress) this.closeNote();
      this._notePress = false;
    });
  }

  show(on) {
    this.root.hidden = !on;
  }

  prompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    const p = this.el.prompt;
    // the on-screen Use button lights up while something can be used
    if (this.el.use) this.el.use.classList.toggle('ready', !!text);
    if (text) {
      p.innerHTML = this.touch ? '' : '<kbd>E</kbd>';
      p.appendChild(document.createTextNode(text));
      p.classList.add('on');
      this.el.cross.classList.add('on');
    } else {
      p.classList.remove('on');
      this.el.cross.classList.remove('on');
    }
  }

  caption(text, seconds = 3.2) {
    if (!text) return;
    this.el.caption.textContent = text;
    this.el.caption.classList.add('on');
    this.captionT = seconds;
  }

  toast(text, seconds = 3) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('on');
    this.toastT = seconds;
  }

  setCounter(seen, total) {
    this.el.seen.textContent = seen;
    this.el.total.textContent = total;
    this.el.counter.classList.add('pulse');
    clearTimeout(this._pulse);
    this._pulse = setTimeout(() => this.el.counter.classList.remove('pulse'), 2500);
  }

  note(def) {
    this.el.noteTitle.textContent = def.title;
    this.el.noteMeta.textContent = def.meta || '';
    this.el.noteBody.innerHTML = '';
    for (const para of def.body) {
      const p = document.createElement('p');
      p.textContent = para;
      this.el.noteBody.appendChild(p);
    }
    this.el.note.hidden = false;
    this.el.note.querySelector('.paper').scrollTop = 0;
    this._notePress = false;
    this.noteOpen = true;
    this._noteOpenedAt = performance.now();
    return new Promise((res) => (this._noteResolve = res));
  }

  closeNote() {
    if (!this.noteOpen || performance.now() - this._noteOpenedAt < 250) return;
    this.el.note.hidden = true;
    this.noteOpen = false;
    if (this._noteResolve) {
      const r = this._noteResolve;
      this._noteResolve = null;
      r();
    }
  }

  fade(on, ms = 600) {
    this.el.fade.style.transitionDuration = `${ms}ms`;
    this.el.fade.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, ms));
  }

  ending(text) {
    this.el.endingText.textContent = text;
    if (this.onEnding) this.onEnding();
    this.el.ending.hidden = false;
    requestAnimationFrame(() => this.el.ending.classList.add('on'));
  }

  hideEnding() {
    this.el.ending.classList.remove('on');
    this.el.ending.hidden = true;
  }

  update(dt) {
    if (this.captionT > 0) {
      this.captionT -= dt;
      if (this.captionT <= 0) this.el.caption.classList.remove('on');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.el.toast.classList.remove('on');
    }
  }
}
