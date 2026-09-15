// Arcade-but-believable vehicle model.
//
// Heading `h` points along (sin h, cos h); increasing h turns left. Velocity is kept in
// world space and split into forward / left components each step. Tyres remove lateral
// velocity up to a grip limit - when the limit is exceeded the car slides, which is what
// makes power-slides and lock-ups feel right.

const G = 9.81;
const CAR_HALF_WIDTH = 0.95;

// Overboost. Road EVs call it boost, Formula E calls it attack mode, the pub calls it
// nitrous: a few seconds of more than the car normally gives you. It lifts the power
// ceiling and the limiter, so it buys you a tow down a straight - it cannot buy you
// grip, and stability control still owns the corner.
const BOOST_SECONDS = 4.5;   // a full tank, held down
const BOOST_REFILL = 0.042;  // per second, always
const BOOST_REGEN = 0.055;   // per second more, braking hard from speed
const BOOST_ARM = 0.25;      // needs at least this much in the tank to light
const BOOST_POWER = 1.4;
const BOOST_VTOP = 1.09;

export const SURFACES = {
  road: { grip: 1.0, drag: 0, rumble: 0 },
  kerb: { grip: 0.93, drag: 0.6, rumble: 1 },
  grass: { grip: 0.55, drag: 4.0, rumble: 0.35 },
  pavement: { grip: 0.86, drag: 0.8, rumble: 0.1 },
  gravel: { grip: 0.5, drag: 6.5, rumble: 0.5 },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Vehicle {
  constructor(spec, world) {
    this.spec = spec;
    this.world = world;
    this.path = world.path;
    const d = spec.dims;
    this.wb = d.wb;
    this.mass = spec.mass;
    this.power = spec.power;
    this.fMax = Math.min(spec.mass * (27.78 / spec.accel) * 1.15, spec.grip * spec.mass * G * 1.05);
    this.cd = spec.power / Math.pow(spec.vTop, 3);
    this.crr = 0.011 * spec.mass;
    this.brakeAccel = 11.2 * spec.brake;
    this.latMax = spec.grip * G;

    this.x = 0; this.y = 0; this.z = 0;
    this.h = 0; this.omega = 0;
    this.vx = 0; this.vz = 0;
    this.speed = 0; this.vf = 0; this.vl = 0;
    this.slide = 0; this.steerAngle = 0; this.braking = false; this.reverse = false;
    this.surface = 'road';
    this.impact = 0; this.rumble = 0;
    this.hint = -1;
    this.proj = {};
    this.dist = 0;           // unwrapped distance travelled along the track
    this.pitch = 0; this.roll = 0;
    this.accelLong = 0; this.accelLat = 0;
    this.powerDraw = 0;
    this.stuck = 0;
    this.boostCharge = 1;    // 0..1 tank
    this.boosting = false;
  }

  placeAt(s, u, opts = {}) {
    const p = this.path;
    const f = p.pointAt(p.wrapS(s), u);
    this.x = f.x; this.z = f.z; this.y = f.y;
    this.h = Math.atan2(f.tx, f.tz);
    this.vx = this.vz = this.vf = this.vl = this.omega = 0;
    this.speed = 0;
    this.hint = -1;
    this.project();
    this.dist = this.proj.s + (opts.lapOffset || 0);
    this.lastS = this.proj.s;
  }

  project() {
    this.proj = this.path.project(this.x, this.z, this.hint, this.y, this.proj);
    this.hint = this.proj.i;
    return this.proj;
  }

  // Peak front-wheel angle at this speed: plenty of lock for parking, very little at speed.
  steerLimit(speed) { return (0.60 / (1 + speed * 0.058)) * this.spec.agility; }

  // input: {throttle 0..1, brake 0..1, steer -1..1 (+ = right), handbrake, boost bool}
  update(dt, input) {
    // Overboost lifts a power ceiling, so with the throttle shut there is nothing for it
    // to lift: it neither lights nor drains until you are actually asking for drive.
    this.boosting = !!input.boost && (input.throttle || 0) > 0.1
      && this.boostCharge > (this.boosting ? 0 : BOOST_ARM);
    const steps = Math.min(6, Math.max(1, Math.ceil(dt / 0.009)));
    const h = dt / steps;
    this.impact = 0;
    for (let i = 0; i < steps; i++) this.step(h, input);
    this.postUpdate(dt);
  }

  step(dt, input) {
    const fwdX = Math.sin(this.h), fwdZ = Math.cos(this.h);
    const lftX = fwdZ, lftZ = -fwdX;
    let vf = this.vx * fwdX + this.vz * fwdZ;
    let vl = this.vx * lftX + this.vz * lftZ;
    const speed = Math.hypot(vf, vl);

    const surf = SURFACES[this.surface] || SURFACES.road;
    const grip = surf.grip;

    // --- how much of the tyres the corner is asking for -------------------------
    // Grip is one budget shared between turning and driving. Every car here has
    // stability control, which reads the steering and the yaw rate, works out what
    // the corner needs and lets the motors have only what is left. Modelling that
    // is what keeps the quick cars steerable: a 1.1 MW motor can ask for the whole
    // contact patch at 80 km/h, and on a keyboard the throttle is only ever 0 or 1,
    // so without it holding the accelerator meant ploughing straight on.
    const steerIn = clamp(input.steer || 0, -1, 1);
    const latFull = this.latMax * grip;
    const omegaAsk = Math.abs(steerIn) * Math.min(
      (Math.abs(vf) / this.wb) * Math.tan(this.steerLimit(speed)),
      (latFull / Math.max(speed, 3.2)) * 1.08,
    );
    // the larger of what the driver is asking for and what the car is already doing
    const latUse = Math.min(1, (Math.max(Math.abs(this.omega), omegaAsk) * speed) / latFull);
    // The handbrake is also the ESC-off switch: pull it and the motors get everything
    // again, which is how you hold a power-slide on purpose.
    const driveShare = input.handbrake ? 1 : Math.max(0.3, Math.sqrt(1 - latUse * latUse));

    // --- longitudinal ---
    let force = 0;
    const throttle = input.throttle || 0;
    const brake = input.brake || 0;
    if (throttle > 0 && !(this.reverse && vf < 0)) {
      const b = this.boosting ? BOOST_POWER : 1;
      force += throttle * Math.min(this.fMax * b, (this.power * b) / Math.max(Math.abs(vf), 4));
    }
    if (brake > 0) {
      if (vf > 0.4) force -= brake * this.brakeAccel * this.mass;
      else force -= brake * this.mass * 4.2; // reverse
    }
    if (input.handbrake) force -= Math.sign(vf) * this.mass * 6.5;
    // traction limit - drive is capped by what the corner has left over, braking is not
    // (trail-braking should cost you grip, and that fall-off is handled by `circle` below)
    const tractionMax = grip * this.spec.grip * this.mass * G * 1.0;
    force = clamp(force, -tractionMax, tractionMax * driveShare);
    // resistance
    force -= Math.sign(vf) * (this.cd * vf * vf + this.crr + surf.drag * this.mass * 0.1);
    // gravity along the slope
    const tangDot = this.proj.tx ? fwdX * this.proj.tx + fwdZ * this.proj.tz : 1;
    force -= this.mass * G * (this.proj.slope || 0) * tangDot;

    const aLong = force / this.mass;
    const vfNew = vf + aLong * dt;
    // don't let braking drag the car backwards past a stop
    if (brake > 0 && vf > 0 && vfNew < 0 && !input.allowReverse) vf = 0;
    else vf = vfNew;
    if (vf < -9) vf = -9;
    const vTopLimit = this.spec.vTop * 1.02 * (this.boosting ? BOOST_VTOP : 1);
    if (vf > vTopLimit) vf = vTopLimit;

    // --- steering and yaw ---
    const sp = Math.hypot(vf, vl);
    const steerMax = this.steerLimit(sp);
    this.steerAngle = -steerIn * steerMax;
    const longUse = Math.min(1, Math.abs(aLong) / (grip * this.spec.grip * G));
    const circle = Math.sqrt(Math.max(0.15, 1 - longUse * longUse * 0.85));
    let latCap = this.latMax * grip * circle * (input.handbrake ? 0.55 : 1);
    // Steering maps linearly onto the yaw rate the car can actually achieve: at low
    // speed that is the geometric limit, at speed it is what the tyres will hold.
    const over = input.handbrake ? 1.75 : 1.08;
    const kinMax = (Math.abs(vf) / this.wb) * Math.tan(steerMax);
    const gripMax = (latCap / Math.max(sp, 3.2)) * over;
    const maxOmega = Math.min(kinMax, gripMax);
    const target = -steerIn * maxOmega;
    const response = 1 - Math.exp(-dt * 8.5 * this.spec.agility);
    this.omega += (target - this.omega) * response;
    if (sp < 0.4) this.omega *= 0.6;
    this.h += this.omega * dt;

    // --- lateral grip ---
    const maxDv = latCap * dt;
    const dv = clamp(vl, -maxDv, maxDv);
    vl -= dv;
    this.slide = Math.abs(vl);
    if (this.slide > 0.4) vf -= Math.min(Math.abs(vf), this.slide * 0.55 * dt);

    this.accelLong = aLong;
    this.accelLat = -this.omega * sp;
    this.vf = vf; this.vl = vl;
    this.vx = fwdX * vf + lftX * vl;
    this.vz = fwdZ * vf + lftZ * vl;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.speed = Math.hypot(this.vx, this.vz);
    this.reverse = vf < -0.2;
    this.braking = (input.brake || 0) > 0.05 && vf > 0.5;
    this.powerDraw = (force > 0 ? force * Math.max(vf, 0) : Math.min(0, force * Math.max(vf, 0) * 0.4)) / 1000;

    // --- track position, surface, barriers ---
    this.project();
    const p = this.proj;
    this.y = p.y;
    this.surface = this.world.surfaceAt(p.i, p.u);
    const limit = (p.u > 0 ? p.wallL : p.wallR) - CAR_HALF_WIDTH;
    if (Math.abs(p.u) > limit) {
      const side = Math.sign(p.u);
      const push = Math.abs(p.u) - limit;
      this.x -= p.lx * side * push;
      this.z -= p.lz * side * push;
      // velocity into the wall
      const nX = -p.lx * side, nZ = -p.lz * side; // inward normal
      const vn = this.vx * nX + this.vz * nZ;
      if (vn < 0) {
        const hit = -vn;
        this.impact = Math.max(this.impact, hit);
        this.vx -= nX * vn * 1.35;
        this.vz -= nZ * vn * 1.35;
        const scrub = clamp(1 - hit * 0.018, 0.62, 0.99);
        this.vx *= scrub; this.vz *= scrub;
        this.omega *= 0.55;
        this.omega += side * Math.min(0.6, hit * 0.02);
      }
    }
  }

  postUpdate(dt) {
    // lap distance (unwrapped)
    const L = this.path.length;
    let ds = this.proj.s - this.lastS;
    if (ds > L / 2) ds -= L;
    if (ds < -L / 2) ds += L;
    this.dist += ds;
    this.lastS = this.proj.s;

    // visual attitude
    const targetPitch = -Math.atan(this.proj.slope || 0) - clamp(this.accelLong * 0.004, -0.05, 0.05);
    const targetRoll = clamp(-this.accelLat * 0.009, -0.09, 0.09);
    const k = 1 - Math.exp(-dt * 6);
    this.pitch += (targetPitch - this.pitch) * k;
    this.roll += (targetRoll - this.roll) * k;
    const surf = SURFACES[this.surface] || SURFACES.road;
    this.rumble = surf.rumble * Math.min(1, this.speed / 25);

    if (this.speed < 1.2) this.stuck += dt; else this.stuck = 0;

    // The boost tank drains while it is lit and fills the rest of the time, faster
    // under braking - the same regenerated energy the power ring already shows.
    if (this.boosting) this.boostCharge = Math.max(0, this.boostCharge - dt / BOOST_SECONDS);
    else {
      const regen = this.braking && this.speed > 8 ? BOOST_REGEN : 0;
      this.boostCharge = Math.min(1, this.boostCharge + (BOOST_REFILL + regen) * dt);
    }
  }

  // Yaw rate available right now (used by the AI to convert a desired curvature
  // into a steering input).
  maxYawRate() {
    const surf = SURFACES[this.surface] || SURFACES.road;
    const sp = Math.max(this.speed, 3.2);
    const kinMax = (Math.abs(this.vf) / this.wb) * Math.tan(this.steerLimit(sp));
    const gripMax = (this.latMax * surf.grip * 1.08) / sp;
    return Math.max(0.02, Math.min(kinMax, gripMax));
  }

  respawn() {
    const s = this.proj.s;
    const before = this.dist;
    this.placeAt(s - 6, 0);
    this.dist = before;
    this.lastS = this.proj.s;
  }

  get kmh() { return Math.abs(this.speed) * 3.6; }
}

// Simple two-circle collision between cars: push apart and swap some momentum.
export function resolveCollisions(vehicles) {
  const pts = vehicles.map((v) => {
    const f = 0.95, s = Math.sin(v.h), c = Math.cos(v.h);
    return [
      { x: v.x + s * f, z: v.z + c * f },
      { x: v.x - s * f, z: v.z - c * f },
    ];
  });
  const R = 1.05;
  for (let a = 0; a < vehicles.length; a++) {
    for (let b = a + 1; b < vehicles.length; b++) {
      const va = vehicles[a], vb = vehicles[b];
      if (Math.abs(va.x - vb.x) > 8 || Math.abs(va.z - vb.z) > 8) continue;
      for (const pa of pts[a]) {
        for (const pb of pts[b]) {
          let dx = pb.x - pa.x, dz = pb.z - pa.z;
          let d = Math.hypot(dx, dz);
          if (d > R * 2 || d < 1e-4) continue;
          const nx = dx / d, nz = dz / d;
          const overlap = R * 2 - d;
          const ma = va.mass, mb = vb.mass, mt = ma + mb;
          va.x -= nx * overlap * (mb / mt); va.z -= nz * overlap * (mb / mt);
          vb.x += nx * overlap * (ma / mt); vb.z += nz * overlap * (ma / mt);
          const rvx = vb.vx - va.vx, rvz = vb.vz - va.vz;
          const vn = rvx * nx + rvz * nz;
          if (vn > 0) continue;
          const j = (-(1 + 0.25) * vn) / (1 / ma + 1 / mb);
          va.vx -= (j * nx) / ma; va.vz -= (j * nz) / ma;
          vb.vx += (j * nx) / mb; vb.vz += (j * nz) / mb;
          const hit = Math.min(12, -vn);
          va.impact = Math.max(va.impact, hit * 0.7);
          vb.impact = Math.max(vb.impact, hit * 0.7);
          va.omega -= hit * 0.012 * Math.sign(nx * Math.cos(va.h) - nz * Math.sin(va.h));
          vb.omega += hit * 0.012 * Math.sign(nx * Math.cos(vb.h) - nz * Math.sin(vb.h));
        }
      }
    }
  }
}
