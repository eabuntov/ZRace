// Keyboard, gamepad and touch controls rolled into one analogue-ish input state.

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'handbrake',
  ShiftLeft: 'boost', ShiftRight: 'boost',
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { up: false, down: false, left: false, right: false, handbrake: false, boost: false };
    this.steer = 0;
    // allowReverse marks this as a human at the controls: holding the brake at a
    // standstill is meant to select reverse. The AI's inputs carry no such flag.
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, allowReverse: true };
    this.actions = new Map();
    this.enabled = true;

    // A focused menu control keeps its own keys: Space presses a button and arrows move
    // through a list. The driving keys are still recorded - nothing reads them in a menu
    // - but only the page itself, with nothing focused, has their defaults suppressed.
    const inControl = (e) => e.target instanceof Element && !!e.target.closest('button, input, select, textarea');
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = KEYMAP[e.code];
      if (k) { this.keys.add(k); if (!inControl(e)) e.preventDefault(); }
      const cb = this.actions.get(e.code);
      if (cb) { cb(); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) { this.keys.delete(k); e.preventDefault(); }
    });
    window.addEventListener('blur', () => { this.keys.clear(); });
  }

  on(code, cb) { this.actions.set(code, cb); }

  bindTouchControls(root) {
    const press = (name, on) => { this.touch[name] = on; };
    root.querySelectorAll('[data-touch]').forEach((el) => {
      const name = el.dataset.touch;
      const down = (e) => { e.preventDefault(); press(name, true); el.classList.add('on'); };
      const up = (e) => { e.preventDefault(); press(name, false); el.classList.remove('on'); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    });
  }

  update(dt) {
    const held = (n) => this.keys.has(n) || this.touch[n];
    let throttle = held('up') ? 1 : 0;
    let brake = held('down') ? 1 : 0;
    let steerTarget = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    let handbrake = held('handbrake');
    let boost = held('boost');

    // gamepad (first connected pad)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.12) steerTarget = ax;
      const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
      const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      if (rt > 0.04) throttle = rt;
      if (lt > 0.04) brake = lt;
      if (pad.buttons[0] && pad.buttons[0].pressed) handbrake = true;
      // B / circle, or either shoulder button
      for (const i of [1, 4, 5]) if (pad.buttons[i] && pad.buttons[i].pressed) boost = true;
      break;
    }

    // Smooth the digital steering so it feels analogue - but only just. Taking a quarter
    // of a second to reach full lock stacked on top of the car's own yaw response, and
    // the two together were felt as a car that would not answer the wheel.
    const rate = steerTarget === 0 ? 11 : 9;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * rate);
    if (Math.abs(this.steer) < 0.004) this.steer = 0;

    const s = this.state;
    s.throttle = this.enabled ? throttle : 0;
    s.brake = this.enabled ? brake : 0;
    s.steer = this.enabled ? this.steer : 0;
    s.handbrake = this.enabled ? handbrake : false;
    s.boost = this.enabled ? boost : false;
    return s;
  }

  clear() {
    this.keys.clear();
    for (const k of Object.keys(this.touch)) this.touch[k] = false;
    this.steer = 0;
  }
}
