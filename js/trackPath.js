// Track centreline maths (no three.js dependency, so it can be checked in Node).
//
// A circuit is authored as a closed list of control points [x, y, opts?] drawn like a
// map (x to the right, y downwards, in the order cars drive). A centripetal
// Catmull-Rom spline runs through them; the loop is scaled to the requested length,
// given elevation and resampled at an even spacing.
//
// World mapping: map x -> world X, map y -> world Z, world Y is up.
// Heading: forward = (sin th, cos th); lateral offset `u` is positive to the LEFT,
// and signed curvature `k` is positive for LEFT turns.

export const SPACING = 2; // metres between samples (approx.)

function catmullRomLoop(pts, step) {
  const n = pts.length;
  const xs = [], zs = [], seg = [];
  const P = (i) => pts[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-3, 0.5);
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const span = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(2, Math.ceil(span / step));
    for (let k = 0; k < m; k++) {
      const t = t1 + ((t2 - t1) * k) / m;
      const out = [0, 0];
      for (let c = 0; c < 2; c++) {
        const a1 = ((t1 - t) / (t1 - t0)) * p0[c] + ((t - t0) / (t1 - t0)) * p1[c];
        const a2 = ((t2 - t) / (t2 - t1)) * p1[c] + ((t - t1) / (t2 - t1)) * p2[c];
        const a3 = ((t3 - t) / (t3 - t2)) * p2[c] + ((t - t2) / (t3 - t2)) * p3[c];
        const b1 = ((t2 - t) / (t2 - t0)) * a1 + ((t - t0) / (t2 - t0)) * a2;
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
        out[c] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
      }
      xs.push(out[0]); zs.push(out[1]); seg.push(i);
    }
  }
  return { xs, zs, seg };
}

const smoothstep = (t) => t * t * (3 - 2 * t);

export class TrackPath {
  constructor(def) {
    this.def = def;
    const pts = def.points;
    this.pointOpts = pts.map((p) => p[2] || {});

    // Dense spline (~1 map unit), cumulative distance, uniform scale to the lap length.
    const w = catmullRomLoop(pts, 1);
    const nD = w.xs.length;
    const dist = new Float64Array(nD + 1);
    for (let i = 1; i <= nD; i++) {
      const j = i % nD;
      dist[i] = dist[i - 1] + Math.hypot(w.xs[j] - w.xs[i - 1], w.zs[j] - w.zs[i - 1]);
    }
    const k = def.length / dist[nD];
    for (let i = 0; i < nD; i++) { w.xs[i] *= k; w.zs[i] *= k; }
    for (let i = 0; i <= nD; i++) dist[i] *= k;
    const L = dist[nD];

    // Elevation keys at control points that specify `h`.
    const keys = [];
    let lastSeg = -1;
    for (let i = 0; i < nD; i++) {
      if (w.seg[i] !== lastSeg) {
        lastSeg = w.seg[i];
        const o = this.pointOpts[lastSeg];
        if (o.h !== undefined) keys.push([dist[i], o.h]);
      }
    }
    const h0 = def.startHeight || 0;
    if (!keys.length || keys[0][0] > 0) keys.unshift([0, keys.length ? keys[keys.length - 1][1] : h0]);
    keys.push([L, keys[0][1]]);
    const heightAt = (d) => {
      for (let j = 0; j < keys.length - 1; j++) {
        if (d <= keys[j + 1][0]) {
          const span = keys[j + 1][0] - keys[j][0];
          const t = span > 0 ? (d - keys[j][0]) / span : 0;
          return keys[j][1] + (keys[j + 1][1] - keys[j][1]) * smoothstep(Math.min(1, Math.max(0, t)));
        }
      }
      return keys[keys.length - 1][1];
    };

    // Resample evenly.
    const n = Math.max(64, Math.round(L / SPACING));
    const sp = L / n;
    this.n = n; this.spacing = sp; this.length = L;
    const x = (this.x = new Float32Array(n));
    const y = (this.y = new Float32Array(n));
    const z = (this.z = new Float32Array(n));
    const seg = (this.seg = new Int16Array(n));
    let j = 0;
    for (let i = 0; i < n; i++) {
      const d = i * sp;
      while (j < nD - 1 && dist[j + 1] < d) j++;
      const j1 = (j + 1) % nD;
      const f = (d - dist[j]) / Math.max(1e-6, dist[j + 1] - dist[j]);
      x[i] = w.xs[j] + (w.xs[j1] - w.xs[j]) * f;
      z[i] = w.zs[j] + (w.zs[j1] - w.zs[j]) * f;
      y[i] = heightAt(d);
      seg[i] = w.seg[j];
    }

    this.flags = { tunnel: new Uint8Array(n), bridge: new Uint8Array(n) };
    for (let i = 0; i < n; i++) if (this.opt(i).tunnel) this.flags.tunnel[i] = 1;

    if (def.figure8) this._addBridge();
    this._smoothHeights(8);
    this._computeFrames();
    this._computeWalls();
  }

  opt(i) { return this.pointOpts[this.seg[i]]; }
  wrapI(i) { const n = this.n; return ((i % n) + n) % n; }
  wrapS(s) { const L = this.length; return ((s % L) + L) % L; }

  _smoothHeights(r) {
    const n = this.n, src = Float32Array.from(this.y);
    for (let i = 0; i < n; i++) {
      let a = 0;
      for (let kk = -r; kk <= r; kk++) a += src[this.wrapI(i + kk)];
      this.y[i] = a / (2 * r + 1);
    }
  }

  // Figure-8: find where the loop crosses itself and lift the later branch over it.
  _addBridge() {
    const { n, x, z } = this;
    let hit = null;
    const step = 2;
    for (let i = 0; i < n && !hit; i += step) {
      const a0 = i, a1 = this.wrapI(i + step);
      for (let j = i + 40; j < n; j += step) {
        if (n - j + i < 40) break;
        const b0 = j, b1 = this.wrapI(j + step);
        const d1x = x[a1] - x[a0], d1z = z[a1] - z[a0], d2x = x[b1] - x[b0], d2z = z[b1] - z[b0];
        const den = d1x * d2z - d1z * d2x;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((x[b0] - x[a0]) * d2z - (z[b0] - z[a0]) * d2x) / den;
        const u = ((x[b0] - x[a0]) * d1z - (z[b0] - z[a0]) * d1x) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) hit = { i: a0 + t * step, j: b0 + u * step };
      }
    }
    if (!hit) return;
    this.crossing = hit;
    const centre = this.def.bridgeBranch === 'first' ? hit.i : hit.j;
    const H = this.def.bridgeHeight || 8;
    const R = (this.def.bridgeRamp || 120) / this.spacing;
    for (let kk = -Math.ceil(R); kk <= Math.ceil(R); kk++) {
      const i = this.wrapI(Math.round(centre) + kk);
      const t = Math.abs(kk) / R;
      if (t >= 1) continue;
      const b = t < 0.25 ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (t - 0.25)) / 0.75);
      this.y[i] += H * b;
      if (H * b > 1.2) this.flags.bridge[i] = 1;
    }
    this.bridgeCentre = Math.round(centre);
  }

  _computeFrames() {
    const { n, x, y, z, spacing } = this;
    this.tx = new Float32Array(n); this.tz = new Float32Array(n);
    this.lx = new Float32Array(n); this.lz = new Float32Array(n);
    this.k = new Float32Array(n); this.slope = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = this.wrapI(i - 1), b = this.wrapI(i + 1);
      let dx = x[b] - x[a], dz = z[b] - z[a];
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      this.tx[i] = dx; this.tz[i] = dz;
      this.lx[i] = dz; this.lz[i] = -dx;
      this.slope[i] = (y[b] - y[a]) / (2 * spacing);
    }
    const w = 3;
    for (let i = 0; i < n; i++) {
      const a = this.wrapI(i - w), b = this.wrapI(i + w);
      const cr = this.tx[a] * this.tz[b] - this.tz[a] * this.tx[b];
      this.k[i] = -Math.asin(Math.max(-1, Math.min(1, cr))) / (2 * w * spacing);
    }
  }

  _computeWalls() {
    const { n, def } = this;
    const halfW = def.width / 2;
    const base = def.runoff || [6, 6];
    const extra = def.extraOutside ?? 10;
    const rawL = new Float32Array(n), rawR = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = this.opt(i);
      let l = o.runoffL ?? o.runoff ?? base[0];
      let r = o.runoffR ?? o.runoff ?? base[1];
      if (this.flags.bridge[i] || this.flags.tunnel[i]) { l = Math.min(l, 1.5); r = Math.min(r, 1.5); }
      const kk = this.k[i];
      const ex = Math.min(extra, Math.abs(kk) * 2200);
      if (kk > 0) r += ex; else l += ex; // outside of a corner gets more room
      rawL[i] = l; rawR[i] = r;
    }
    const smooth = (src, rad) => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let m = Infinity, a = 0;
        for (let kk = -rad; kk <= rad; kk++) { const v = src[this.wrapI(i + kk)]; a += v; if (v < m) m = v; }
        out[i] = Math.min(a / (2 * rad + 1), m + 6);
      }
      return out;
    };
    const sl = smooth(rawL, 18), sr = smooth(rawR, 18);
    this.halfW = halfW;
    this.wallL = new Float32Array(n); this.wallR = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.wallL[i] = halfW + sl[i]; this.wallR[i] = halfW + sr[i]; }

    // Kerbs through corners, extended a little either side.
    this.kerb = new Uint8Array(n);
    if (def.noKerbs) return;
    const ext = Math.round(14 / this.spacing);
    for (let i = 0; i < n; i++) {
      if (Math.abs(this.k[i]) > 1 / 240 && !this.flags.bridge[i] && !this.flags.tunnel[i]) {
        for (let kk = -ext; kk <= ext; kk++) this.kerb[this.wrapI(i + kk)] = 1;
      }
    }
  }

  // Interpolated frame at distance s.
  sampleAt(s, out = {}) {
    s = this.wrapS(s);
    const f0 = s / this.spacing;
    const i = Math.floor(f0) % this.n, j = (i + 1) % this.n, f = f0 - Math.floor(f0);
    out.i = i; out.f = f;
    out.x = this.x[i] + (this.x[j] - this.x[i]) * f;
    out.y = this.y[i] + (this.y[j] - this.y[i]) * f;
    out.z = this.z[i] + (this.z[j] - this.z[i]) * f;
    const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * f, tz = this.tz[i] + (this.tz[j] - this.tz[i]) * f;
    const d = Math.hypot(tx, tz) || 1;
    out.tx = tx / d; out.tz = tz / d; out.lx = out.tz; out.lz = -out.tx;
    return out;
  }

  pointAt(s, u, out = {}) {
    this.sampleAt(s, out);
    out.x += out.lx * u; out.z += out.lz * u;
    return out;
  }

  // Nearest point on the centreline. `hint` = previous index for a local search, or -1.
  project(px, pz, hint = -1, yRef = null, out = {}) {
    const { n, x, z } = this;
    let best = -1, bestD = Infinity, bestT = 0;
    const test = (i) => {
      const j = i + 1 === n ? 0 : i + 1;
      const ax = x[i], az = z[i], bx = x[j] - ax, bz = z[j] - az;
      let t = ((px - ax) * bx + (pz - az) * bz) / (bx * bx + bz * bz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + bx * t - px, qz = az + bz * t - pz;
      let d = qx * qx + qz * qz;
      if (yRef !== null) { const dy = this.y[i] + (this.y[j] - this.y[i]) * t - yRef; d += dy * dy * 4; }
      if (d < bestD) { bestD = d; best = i; bestT = t; }
    };
    if (hint < 0) {
      for (let i = 0; i < n; i++) test(i);
    } else {
      const W = 24;
      let lo = hint - W, hi = hint + W;
      for (let pass = 0; pass < 12; pass++) {
        for (let kk = lo; kk <= hi; kk++) test(this.wrapI(kk));
        const rel = ((best - hint + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
        if (rel <= lo - hint + 1) { hi = lo; lo -= W * 2; }
        else if (rel >= hi - hint - 1) { lo = hi; hi += W * 2; }
        else break;
      }
    }
    const i = best, j = (i + 1) % n, t = bestT;
    const cx = x[i] + (x[j] - x[i]) * t, cz = z[i] + (z[j] - z[i]) * t;
    const lx = this.lx[i] + (this.lx[j] - this.lx[i]) * t, lz = this.lz[i] + (this.lz[j] - this.lz[i]) * t;
    const ll = Math.hypot(lx, lz) || 1;
    out.i = i; out.t = t;
    out.s = (i + t) * this.spacing;
    out.u = ((px - cx) * lx + (pz - cz) * lz) / ll;
    out.y = this.y[i] + (this.y[j] - this.y[i]) * t;
    out.lx = lx / ll; out.lz = lz / ll; out.tx = -out.lz; out.tz = out.lx;
    out.wallL = this.wallL[i] + (this.wallL[j] - this.wallL[i]) * t;
    out.wallR = this.wallR[i] + (this.wallR[j] - this.wallR[i]) * t;
    out.slope = this.slope[i];
    return out;
  }

  // Distinct corners (for the menu): runs of curvature that turn more than ~20 degrees.
  cornerCount() {
    let c = 0, inC = false, turn = 0, sign = 0;
    for (let i = 0; i < this.n; i++) {
      const kk = this.k[i];
      const on = Math.abs(kk) > 1 / 300;
      const sg = Math.sign(kk);
      if (on && (!inC || sg !== sign)) {
        if (inC && Math.abs(turn) > 0.35) c++;
        inC = true; turn = 0; sign = sg;
      }
      if (on) turn += kk * this.spacing;
      if (!on && inC) { inC = false; if (Math.abs(turn) > 0.35) c++; }
    }
    return c;
  }

  bounds(margin = 0) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < this.n; i++) {
      minX = Math.min(minX, this.x[i]); maxX = Math.max(maxX, this.x[i]);
      minZ = Math.min(minZ, this.z[i]); maxZ = Math.max(maxZ, this.z[i]);
      minY = Math.min(minY, this.y[i]); maxY = Math.max(maxY, this.y[i]);
    }
    return { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin, minY, maxY };
  }
}
