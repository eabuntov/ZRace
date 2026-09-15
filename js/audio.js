// All sound is synthesised with the Web Audio API - an EV whine rather than an engine,
// plus wind, tyre scrub, kerb rumble, impacts and the start-light beeps.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.running = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const master = (this.master = ctx.createGain());
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // noise source shared by wind / tyres / rumble
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    noise.start();
    this.noise = noise;

    const mk = (type, freq, q, gain) => {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      f.connect(g).connect(master);
      noise.connect(f);
      return g;
    };
    this.wind = mk('bandpass', 700, 0.6, 0);
    this.tyres = mk('bandpass', 1750, 4.5, 0);
    this.rumble = mk('lowpass', 130, 1.2, 0);
    this.boost = mk('bandpass', 1250, 0.8, 0);

    // motor: two saws plus a high inverter whine
    const motorGain = (this.motorGain = ctx.createGain());
    motorGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    motorGain.connect(lp).connect(master);
    this.osc = [];
    for (const [type, mul, gain] of [['sawtooth', 1, 0.5], ['sawtooth', 2.02, 0.22], ['triangle', 0.5, 0.3]]) {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(motorGain);
      o.start();
      this.osc.push({ o, mul });
    }
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    const wg = ctx.createGain();
    wg.gain.value = 0;
    whine.connect(wg).connect(master);
    whine.start();
    this.whine = whine;
    this.whineGain = wg;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  start() { this.resume(); this.running = true; }

  stop() {
    this.running = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const g of [this.motorGain, this.wind, this.tyres, this.rumble, this.boost, this.whineGain]) {
      g.gain.setTargetAtTime(0, t, 0.08);
    }
  }

  // state: { speed (m/s), vTop, throttle, slide, rumble, boosting, inTunnel }
  update(dt, s) {
    if (!this.ctx || !this.running) return;
    const t = this.ctx.currentTime;
    const ratio = Math.min(1.6, s.speed / Math.max(12, s.vTop));
    const base = 58 + ratio * 210;
    for (const { o, mul } of this.osc) o.frequency.setTargetAtTime(base * mul, t, 0.05);
    const load = 0.1 + 0.5 * (s.throttle || 0) + 0.35 * ratio;
    this.motorGain.gain.setTargetAtTime(0.16 * load, t, 0.06);
    this.whine.frequency.setTargetAtTime((420 + ratio * 1600) * (s.boosting ? 1.22 : 1), t, 0.05);
    this.whineGain.gain.setTargetAtTime(0.012 + 0.02 * ratio, t, 0.08);
    this.wind.gain.setTargetAtTime(Math.min(0.16, ratio * ratio * 0.2), t, 0.1);
    this.tyres.gain.setTargetAtTime(Math.min(0.2, Math.max(0, (s.slide - 0.8) * 0.05)), t, 0.05);
    this.rumble.gain.setTargetAtTime(Math.min(0.25, (s.rumble || 0) * 0.3), t, 0.05);
    this.boost.gain.setTargetAtTime(s.boosting ? 0.11 : 0, t, s.boosting ? 0.05 : 0.25);
  }

  hit(strength) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const len = (ctx.sampleRate * 0.25) | 0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320 + strength * 40;
    const g = ctx.createGain();
    g.gain.value = Math.min(0.7, 0.06 + strength * 0.045);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  beep(freq = 440, dur = 0.18, vol = 0.18) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  click() { this.beep(760, 0.05, 0.06); }
}
