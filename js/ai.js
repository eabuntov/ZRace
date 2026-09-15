// Racing line, speed profile and the opponent drivers.
//
// The line is found by relaxing the lateral offsets towards minimum curvature inside the
// track edges, which naturally produces late apexes and full use of the road. The speed
// profile then comes from that curvature with a backwards pass for braking zones.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function computeRacingLine(path, margin = 2.0) {
  const n = path.n;
  const u = new Float32Array(n);
  const bound = Math.max(0.5, path.halfW - margin);
  const look = Math.max(3, Math.round(12 / path.spacing));
  const px = new Float32Array(n), pz = new Float32Array(n);
  const refresh = () => {
    for (let i = 0; i < n; i++) {
      px[i] = path.x[i] + path.lx[i] * u[i];
      pz[i] = path.z[i] + path.lz[i] * u[i];
    }
  };
  refresh();
  for (let pass = 0; pass < 240; pass++) {
    for (let i = 0; i < n; i++) {
      const a = path.wrapI(i - look), b = path.wrapI(i + look);
      const mx = (px[a] + px[b]) / 2, mz = (pz[a] + pz[b]) / 2;
      const target = (mx - path.x[i]) * path.lx[i] + (mz - path.z[i]) * path.lz[i];
      u[i] += (clamp(target, -bound, bound) - u[i]) * 0.35;
      u[i] = clamp(u[i], -bound, bound);
      px[i] = path.x[i] + path.lx[i] * u[i];
      pz[i] = path.z[i] + path.lz[i] * u[i];
    }
  }
  // light smoothing
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (let k = -3; k <= 3; k++) a += u[path.wrapI(i + k)];
    out[i] = a / 7;
  }
  return out;
}

// Curvature of the racing line, sampled over a wide stencil.
export function lineCurvature(path, line) {
  const n = path.n;
  const w = Math.max(3, Math.round(11 / path.spacing));
  const k = new Float32Array(n);
  const X = (i) => path.x[i] + path.lx[i] * line[i];
  const Z = (i) => path.z[i] + path.lz[i] * line[i];
  for (let i = 0; i < n; i++) {
    const a = path.wrapI(i - w), b = path.wrapI(i + w);
    const ax = X(a), az = Z(a), bx = X(i), bz = Z(i), cx = X(b), cz = Z(b);
    const A = Math.hypot(bx - ax, bz - az), B = Math.hypot(cx - bx, cz - bz), C = Math.hypot(cx - ax, cz - az);
    const area = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
    k[i] = area < 1e-6 ? 0 : (4 * area) / (A * B * C);
  }
  return k;
}

export function speedProfile(path, line, latAccel, brakeAccel, vTop) {
  const n = path.n;
  const k = lineCurvature(path, line);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = k[i] < 1e-5 ? vTop : Math.min(vTop, Math.sqrt(latAccel / k[i]));
    // uphill/downhill tweak
    v[i] = Math.max(7, v[i]);
  }
  const ds = path.spacing;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n;
      const lim = Math.sqrt(v[j] * v[j] + 2 * brakeAccel * ds);
      if (v[i] > lim) v[i] = lim;
    }
  }
  return v;
}

const NAMES = [
  ['LIN', 'J. Lin'], ['ROS', 'M. Rossi'], ['KAI', 'K. Bergman'], ['TAN', 'W. Tan'],
  ['MOR', 'A. Moreau'], ['OKA', 'H. Okada'], ['SIL', 'R. Silva'], ['NOV', 'P. Novak'],
  ['HAY', 'C. Hayes'], ['DUB', 'L. Dubois'],
];
export const driverName = (i) => NAMES[i % NAMES.length];

export class AIDriver {
  constructor(vehicle, path, line, opts = {}) {
    this.v = vehicle;
    this.path = path;
    this.line = line;
    this.skill = opts.skill ?? 0.93;
    this.lane = 0;
    this.targetLane = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.rebuildProfile();
    this.blocked = 0;
    this.mistake = 0;
    this.mistakeTimer = 4 + Math.random() * 20;
  }

  rebuildProfile() {
    const v = this.v;
    this.profile = speedProfile(
      this.path,
      this.line,
      v.spec.grip * 9.81 * this.skill * 0.98,
      v.brakeAccel * this.skill * 0.95,
      v.spec.vTop
    );
  }

  lineAt(s) {
    const p = this.path;
    const f = p.sampleAt(p.wrapS(s));
    const off = this.line[f.i] + this.lane;
    return { x: f.x + f.lx * off, z: f.z + f.lz * off };
  }

  update(dt, cars, rubber = 0) {
    const v = this.v;
    const p = this.path;
    const proj = v.proj;
    const speed = v.speed;

    // occasional small mistake so the AI is not metronomic
    this.mistakeTimer -= dt;
    if (this.mistakeTimer <= 0) {
      this.mistakeTimer = 8 + Math.random() * 25;
      this.mistake = (Math.random() - 0.5) * 0.9;
    }
    this.mistake *= Math.exp(-dt * 0.8);

    // --- traffic ---
    this.targetLane = 0;
    let speedCap = Infinity;
    for (const other of cars) {
      if (other === v) continue;
      let ds = other.proj.s - proj.s;
      if (ds > p.length / 2) ds -= p.length;
      if (ds < -p.length / 2) ds += p.length;
      if (ds < 1 || ds > 30) continue;
      const du = other.proj.u - proj.u;
      if (Math.abs(du) > 3.4) continue;
      const room = p.halfW - 2.2;
      const side = other.proj.u > 0 ? -1 : 1;   // pass on the roomier side
      this.targetLane = clamp(other.proj.u + side * 3.6, -room, room) - this.line[proj.i];
      if (ds < 12 && Math.abs(du) < 2.4) speedCap = Math.min(speedCap, other.speed * (ds < 6 ? 0.9 : 1.0));
    }
    const laneRate = 1 - Math.exp(-dt * 1.6);
    this.lane += (this.targetLane - this.lane) * laneRate;

    // --- steering: pure pursuit onto the racing line ---
    const ld = clamp(6 + speed * 0.52, 7, 42);
    const t = this.lineAt(proj.s + ld);
    const fwdX = Math.sin(v.h), fwdZ = Math.cos(v.h);
    const lftX = fwdZ, lftZ = -fwdX;
    const dx = t.x - v.x, dz = t.z - v.z;
    const along = dx * fwdX + dz * fwdZ;
    const lat = dx * lftX + dz * lftZ;
    const alpha = Math.atan2(lat, Math.abs(along) < 1 ? 1 : along);
    const curv = (2 * Math.sin(alpha)) / Math.max(ld, 4);
    const wanted = curv * Math.max(speed, 4);
    let steer = -wanted / v.maxYawRate();
    steer += this.mistake * 0.25;
    if (along < 0) steer = Math.sign(-alpha) || 1;   // pointing the wrong way
    this.input.steer = clamp(steer, -1, 1);

    // --- pace ---
    const leadIdx = p.wrapI(proj.i + Math.round((4 + speed * 0.75) / p.spacing));
    let target = Math.min(this.profile[proj.i], this.profile[leadIdx]);
    target *= 1 + rubber + this.mistake * 0.04;
    target = Math.min(target, speedCap);

    if (speed < target - 0.4) {
      this.input.throttle = clamp((target - speed) * 0.6, 0.25, 1);
      this.input.brake = 0;
    } else if (speed > target + 0.6) {
      this.input.throttle = 0;
      this.input.brake = clamp((speed - target) * 0.22, 0.12, 1);
    } else {
      this.input.throttle = 0.4;
      this.input.brake = 0;
    }
    // don't power out of a big slide
    if (v.slide > 2.5) this.input.throttle *= 0.35;

    // Boost is saved for somewhere it pays: flat out, already moving, with a fast
    // stretch ahead. Drivers being chased down spend it sooner.
    this.input.boost = this.input.throttle > 0.9
      && v.boostCharge > (rubber > 0 ? 0.3 : 0.55)
      && target > v.spec.vTop * 0.72
      && speed > v.spec.vTop * 0.45;

    // --- recovery ---
    if (v.stuck > 3) {
      v.respawn();
      v.stuck = 0;
    }
    this.input.handbrake = false;
    return this.input;
  }
}
