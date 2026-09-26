// Driving cues: when to brake, which way the next corner goes, and how to get back on
// the road after leaving it.
//
// Everything here is read off data a race already has - the centreline, the racing line,
// and a speed profile worked out the same way the AI works out its own - so it adds
// nothing to the scene and nothing to the physics. It is a few dozen array reads a frame.
import { speedProfile } from './ai.js';

const KERB_W = 1.3;              // trackBuild's kerb width: past this, the car is off the road
const HOLD = 0.35;               // a cue stays up at least this long, so it cannot flicker

export class DrivingCoach {
  // `range` is how far ahead, in metres, a corner starts to be called out at speed.
  constructor(path, line, vehicle, { range = 120 } = {}) {
    this.path = path;
    this.car = vehicle;
    this.range = range;
    // The profile is a little more cautious than the AI's, which drives on the limit.
    // A cue that says brake a touch early teaches a circuit; one that says it late is
    // the reason somebody is in the gravel.
    this.brakeA = vehicle.brakeAccel * 0.85;
    this.profile = speedProfile(path, line, vehicle.spec.grip * 9.81 * 0.9, this.brakeA, vehicle.spec.vTop);
    this.corners = path.corners();
    this.kind = null;
    this.held = 0;
    this.offFor = 0;
    this.overspeedAt = -99;
    this.lateBrake = false;
    this.state = { cue: null, dist: 0, strength: 0, off: null };
  }

  // The first corner whose apex is still ahead of sample `i`, wrapping round the lap.
  nextCorner(i) {
    const cs = this.corners;
    if (!cs.length) return null;
    for (const c of cs) if (c.apex > i) return c;
    return cs[0];
  }

  ahead(from, to) {
    const n = this.path.n;
    return (((to - from) % n) + n) % n * this.path.spacing;
  }

  update(dt, time) {
    const car = this.car, p = this.path, n = p.n, i = car.proj.i;
    const v = Math.max(0, car.vf != null ? car.vf : car.speed);
    const st = this.state;

    // ---- off the road ----------------------------------------------------------
    const u = car.proj.u || 0;
    const off = Math.abs(u) > p.halfW + KERB_W + 0.2;
    // Remember going into a corner much faster than it can be taken, so that if the car
    // then leaves the road the reason can be named rather than just the result.
    const vt = this.profile[i];
    if (vt < car.spec.vTop * 0.85 && v > vt * 1.12 + 1) this.overspeedAt = time;
    if (off) {
      if (this.offFor === 0) this.lateBrake = time - this.overspeedAt < 2.5;
      this.offFor += dt;
    } else this.offFor = 0;

    if (this.offFor > 0.25) {
      let dir = null, dist = 0;
      if (this.offFor > 1.2) {
        // Which way the road is from where the car is pointing. The path's left is
        // (tz, -tx), so the car's own left is (cos h, -sin h); the road lies towards the
        // centreline, against the sign of the lateral offset.
        const towards = -Math.sign(u);
        const dot = towards * (car.proj.lx * Math.cos(car.h) - car.proj.lz * Math.sin(car.h));
        dir = dot > 0.35 ? 'left' : dot < -0.35 ? 'right' : 'ahead';
        dist = Math.max(1, Math.abs(u) - p.halfW);
      }
      st.off = { dir, dist, late: this.lateBrake, stuck: this.offFor > 4 && v < 3 };
    } else st.off = null;

    // ---- brake / turn ----------------------------------------------------------
    let want = null, dist = 0, strength = 0;
    if (!off && v > 12) {
      // Braking: find the first point ahead that wants a good deal less speed than the car
      // has, and say so about a second before the distance left is all it takes to shed it
      // - a second being roughly what it takes to see the call and get on the pedal.
      const reach = (v * v) / (2 * this.brakeA) + v * 1.2 + 10;
      const steps = Math.min(n - 1, Math.ceil(reach / p.spacing));
      for (let j = 1; j <= steps; j++) {
        const target = this.profile[(i + j) % n];
        if (target > v - 4) continue;
        const need = (v * v - target * target) / (2 * this.brakeA);
        const d = j * p.spacing;
        if (need + v * 1.0 >= d) { want = 'brake'; dist = d; strength = 1; break; }
      }
    }
    if (!want && !off) {
      const c = this.nextCorner(i);
      if (c) {
        const toEntry = this.ahead(i, c.entry);
        const range = Math.max(35, Math.min(this.range, v * 2.2));
        // Past the entry the car is in the corner and the call has been made.
        if (toEntry < range && toEntry < p.length / 2) {
          want = c.dir > 0 ? 'left' : 'right';
          dist = toEntry;
          strength = Math.max(0.35, 1 - toEntry / range);
        }
      }
    }

    // hysteresis: once up, a cue is not replaced by a lesser one for a moment
    this.held += dt;
    if (want !== this.kind && (this.held > HOLD || want === 'brake')) {
      this.kind = want;
      this.held = 0;
    }
    st.cue = this.kind;
    if (this.kind === want) { st.dist = dist; st.strength = strength; }
    else st.strength = Math.max(0, st.strength - dt * 3);
    return st;
  }
}
