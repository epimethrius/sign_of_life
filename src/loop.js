export class Loop {
  constructor(onTick) {
    this.onTick = onTick;
    this.auto = false;
    this.delay = 500;
    this._timer = null;
  }

  step() {
    this.onTick();
  }

  setAuto(enabled) {
    this.auto = enabled;
    if (enabled) {
      this._schedule();
    } else {
      this._clear();
    }
  }

  setDelay(ms) {
    this.delay = ms;
    if (this.auto) {
      this._clear();
      this._schedule();
    }
  }

  stop() {
    this.auto = false;
    this._clear();
  }

  _schedule() {
    this._timer = setTimeout(() => {
      if (!this.auto) return;
      this.onTick();
      this._schedule();
    }, this.delay);
  }

  _clear() {
    clearTimeout(this._timer);
    this._timer = null;
  }
}
