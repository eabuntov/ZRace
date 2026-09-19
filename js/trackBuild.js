// Turns a TrackPath plus a theme into the 3D world: road surface, kerbs, run-off,
// barriers, terrain, water, scenery and sky.
import * as THREE from 'three';
import * as TEX from './textures.js';

const KERB_W = 1.3;
const UP = new THREE.Vector3(0, 1, 0);

// --- geometry helpers --------------------------------------------------------

// A ribbon following the track: `aFn`/`bFn` give the lateral offsets of the two edges.
function ribbon(path, idx, aFn, bFn, yOff, uv, closed) {
  const m = idx.length;
  const pos = new Float32Array(m * 6);
  const uvs = new Float32Array(m * 4);
  const [acrossM, alongM] = uv;
  for (let k = 0; k < m; k++) {
    const i = idx[k];
    const a = aFn(i), b = bFn(i);
    const y = path.y[i] + (typeof yOff === 'function' ? yOff(i) : yOff);
    pos[k * 6 + 0] = path.x[i] + path.lx[i] * a;
    pos[k * 6 + 1] = y;
    pos[k * 6 + 2] = path.z[i] + path.lz[i] * a;
    pos[k * 6 + 3] = path.x[i] + path.lx[i] * b;
    pos[k * 6 + 4] = y;
    pos[k * 6 + 5] = path.z[i] + path.lz[i] * b;
    const s = i * path.spacing;
    uvs[k * 4 + 0] = acrossM ? a / acrossM : 0;
    uvs[k * 4 + 1] = s / alongM;
    uvs[k * 4 + 2] = acrossM ? b / acrossM : 1;
    uvs[k * 4 + 3] = s / alongM;
  }
  const quads = closed ? m : m - 1;
  const index = new Uint32Array(Math.max(0, quads) * 6);
  for (let k = 0; k < quads; k++) {
    const k2 = (k + 1) % m;
    const a0 = k * 2, b0 = k * 2 + 1, a1 = k2 * 2, b1 = k2 * 2 + 1;
    index.set([a0, b0, a1, a1, b0, b1], k * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  return g;
}

// A vertical wall following the track at lateral offset `uFn`.
function wallStrip(path, idx, uFn, yBottom, yTop, alongM, closed, flip = false) {
  const m = idx.length;
  const pos = new Float32Array(m * 6);
  const uvs = new Float32Array(m * 4);
  for (let k = 0; k < m; k++) {
    const i = idx[k];
    const u = typeof uFn === 'function' ? uFn(i) : uFn;
    const x = path.x[i] + path.lx[i] * u, z = path.z[i] + path.lz[i] * u;
    const yb = path.y[i] + yBottom, yt = path.y[i] + yTop;
    pos.set([x, yb, z, x, yt, z], k * 6);
    const s = i * path.spacing;
    uvs.set([s / alongM, 0, s / alongM, 1], k * 4);
  }
  const quads = closed ? m : m - 1;
  const index = new Uint32Array(Math.max(0, quads) * 6);
  for (let k = 0; k < quads; k++) {
    const k2 = (k + 1) % m;
    const b0 = k * 2, t0 = k * 2 + 1, b1 = k2 * 2, t1 = k2 * 2 + 1;
    if (flip) index.set([b0, t0, b1, b1, t0, t1], k * 6);
    else index.set([b0, b1, t0, t0, b1, t1], k * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  return g;
}

// Contiguous runs of a flag around the loop.
function runsOf(flags, n) {
  const runs = [];
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (flags[i] && start < 0) start = i;
    if (!flags[i] && start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) {
    if (runs.length && runs[0][0] === 0) { runs[0][0] = start - n; }
    else runs.push([start, n - 1]);
  }
  return runs.map(([a, b]) => {
    const idx = [];
    for (let i = a; i <= b; i++) idx.push(((i % n) + n) % n);
    return idx;
  });
}

const allIdx = (n) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = i; return a; };

// --- the world ---------------------------------------------------------------

export class TrackWorld {
  constructor(scene, path, def) {
    this.scene = scene;
    this.path = path;
    this.def = def;
    this.theme = def.theme;
    this.group = new THREE.Group();
    this.disposables = [];
    this.rnd = TEX.mulberry(0x5eed ^ def.id.length * 7919);
    scene.add(this.group);

    this._hash();
    this._lights();
    this._sky();
    this._terrain();
    this._road();
    this._barriers();
    this._structures();
    this._scenery();
  }

  track(mesh, cast = false, receive = true) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    this.group.add(mesh);
    this.disposables.push(mesh);
    return mesh;
  }

  // Spatial hash over centreline samples, used for terrain and scenery placement.
  _hash() {
    const p = this.path;
    const cell = (this.hashCell = 24);
    const map = (this.hashMap = new Map());
    const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
    this.hashKey = key;
    for (let i = 0; i < p.n; i++) {
      const cx = Math.floor(p.x[i] / cell), cz = Math.floor(p.z[i] / cell);
      const k = key(cx, cz);
      let arr = map.get(k);
      if (!arr) map.set(k, (arr = []));
      arr.push(i);
    }
  }

  // Nearest centreline sample within `maxR`; returns null when there is none.
  nearestSample(x, z, maxR = 120, skipBridge = false) {
    const p = this.path, cell = this.hashCell;
    const r = Math.ceil(maxR / cell);
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let best = -1, bestD = maxR * maxR;
    for (let a = -r; a <= r; a++) {
      for (let b = -r; b <= r; b++) {
        const arr = this.hashMap.get(this.hashKey(cx + a, cz + b));
        if (!arr) continue;
        for (const i of arr) {
          if (skipBridge && p.flags.bridge[i]) continue;
          const dx = p.x[i] - x, dz = p.z[i] - z;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    return best < 0 ? null : { i: best, d: Math.sqrt(bestD) };
  }

  _lights() {
    const t = this.theme;
    const hemi = new THREE.HemisphereLight(t.hemi.sky, t.hemi.ground, t.hemi.intensity);
    this.group.add(hemi);
    const el = (t.sun.elevation * Math.PI) / 180, az = (t.sun.azimuth * Math.PI) / 180;
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const sun = new THREE.DirectionalLight(t.sun.color, t.sun.intensity);
    sun.position.copy(this.sunDir).multiplyScalar(220);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 95;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 520 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.05;
    sun.shadow.camera.updateProjectionMatrix();
    this.group.add(sun, sun.target);
    this.sun = sun;
    this.scene.fog = new THREE.FogExp2(new THREE.Color(t.fog.color), t.fog.density);
  }

  updateShadow(target) {
    this.sun.position.copy(target).addScaledVector(this.sunDir, 170);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
  }

  _sky() {
    const t = this.theme;
    const geo = new THREE.SphereGeometry(7000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(t.sky.top) },
        horizon: { value: new THREE.Color(t.sky.horizon) },
        sunDir: { value: this.sunDir.clone() },
        sunColor: { value: new THREE.Color(t.sun.color) },
      },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
        varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y*1.35+0.05, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.72));
          float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunColor * (pow(d, 220.0)*1.6 + pow(d, 9.0)*0.22);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    this.group.add(sky);
    this.disposables.push(sky);

    if (t.mountains) this._mountains(t.mountains);
    if (t.skyline) this._skyline(t.skyline);
  }

  _mountains(cfg) {
    const b = this.path.bounds();
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const verts = [], colors = [];
    const base = new THREE.Color(cfg.color);
    for (let i = 0; i < cfg.count; i++) {
      // each "mountain" is a small cluster of peaks so the horizon reads as a ridge
      const ang = (i / cfg.count) * Math.PI * 2 + (this.rnd() - 0.5) * 0.5;
      const dist = cfg.dist * (0.75 + this.rnd() * 0.55);
      const peaks = 2 + ((this.rnd() * 3) | 0);
      for (let q = 0; q < peaks; q++) {
        const a2 = ang + (q - peaks / 2) * 0.075;
        const d2 = dist * (0.94 + this.rnd() * 0.12);
        const h = (cfg.height[0] + this.rnd() * (cfg.height[1] - cfg.height[0])) * (q === 0 ? 1 : 0.6 + this.rnd() * 0.5);
        const w = h * (1.1 + this.rnd() * 0.8);
        const px = cx + Math.sin(a2) * d2, pz = cz + Math.cos(a2) * d2;
        const sides = 7;
        const peak = new THREE.Color(cfg.snow ? '#eef3f8' : cfg.color).lerp(base, cfg.snow ? 0.45 : 0.85);
        // one radius per corner, shared by the two faces that meet there, otherwise
        // neighbouring faces do not line up and the slope shows gaps
        const radii = [];
        for (let sd = 0; sd < sides; sd++) radii.push(w * (0.65 + this.rnd() * 0.6));
        for (let sd = 0; sd < sides; sd++) {
          const a0 = (sd / sides) * Math.PI * 2, a1 = ((sd + 1) / sides) * Math.PI * 2;
          const r0 = radii[sd], r1 = radii[(sd + 1) % sides];
          verts.push(px + Math.cos(a0) * r0, -20, pz + Math.sin(a0) * r0);
          verts.push(px + Math.cos(a1) * r1, -20, pz + Math.sin(a1) * r1);
          verts.push(px, h, pz);
          const shade = 0.72 + this.rnd() * 0.22;
          const dark = base.clone().multiplyScalar(shade);
          colors.push(dark.r, dark.g, dark.b, dark.r, dark.g, dark.b, peak.r, peak.g, peak.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    this.track(mesh, false, false);
  }

  _skyline(cfg) {
    const b = this.path.bounds();
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const dusk = this.theme.sun.elevation < 20;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      map: TEX.repeated(TEX.facadeTexture('#9aa3b0', dusk, 9), 2, 4),
      emissiveMap: dusk ? TEX.facadeEmissive(9) : null,
      emissive: new THREE.Color(dusk ? '#ffbb66' : '#000000'),
      emissiveIntensity: dusk ? 1.1 : 0,
      roughness: 0.85,
    });
    const inst = new THREE.InstancedMesh(geo, mat, cfg.count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < cfg.count; i++) {
      const ang = this.rnd() * Math.PI * 2;
      const dist = cfg.dist[0] + this.rnd() * (cfg.dist[1] - cfg.dist[0]);
      const h = cfg.height[0] + this.rnd() * (cfg.height[1] - cfg.height[0]);
      const w = 26 + this.rnd() * 46;
      pos.set(cx + Math.sin(ang) * dist, h / 2, cz + Math.cos(ang) * dist);
      q.setFromAxisAngle(UP, this.rnd() * Math.PI);
      sc.set(w, h, w * (0.7 + this.rnd() * 0.6));
      inst.setMatrixAt(i, m.compose(pos, q, sc));
      inst.setColorAt(i, col.set(cfg.palette[(this.rnd() * cfg.palette.length) | 0]));
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    this.track(inst, false, false);

    if (cfg.tower) {
      const g = new THREE.Group();
      const colMat = new THREE.MeshStandardMaterial({ color: '#c9ccd4', roughness: 0.6, metalness: 0.1 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, 300, 12), colMat);
      shaft.position.y = 150;
      const ball1 = new THREE.Mesh(new THREE.SphereGeometry(34, 16, 12), new THREE.MeshStandardMaterial({ color: '#e0616b', roughness: 0.4, emissive: '#732026', emissiveIntensity: dusk ? 0.6 : 0 }));
      ball1.position.y = 120;
      const ball2 = ball1.clone();
      ball2.scale.setScalar(0.62);
      ball2.position.y = 240;
      g.add(shaft, ball1, ball2);
      const ang = this.rnd() * Math.PI * 2;
      g.position.set(cx + Math.sin(ang) * 1500, 0, cz + Math.cos(ang) * 1500);
      this.group.add(g);
      this.disposables.push(g);
    }
  }

  // --- terrain ---------------------------------------------------------------
  _terrain() {
    const p = this.path, t = this.theme;
    const margin = 620;
    const b = p.bounds(margin);
    const cell = 11;
    const nx = Math.ceil((b.maxX - b.minX) / cell) + 1;
    const nz = Math.ceil((b.maxZ - b.minZ) / cell) + 1;
    const heights = new Float32Array(nx * nz);
    this.terrain = { minX: b.minX, minZ: b.minZ, cell, nx, nz, heights };

    // Coarse "background" height field: Gaussian blur of the road heights.
    const coarseCell = 70;
    const cnx = Math.ceil((b.maxX - b.minX) / coarseCell) + 1;
    const cnz = Math.ceil((b.maxZ - b.minZ) / coarseCell) + 1;
    const coarse = new Float32Array(cnx * cnz);
    const step = Math.max(1, Math.round(18 / p.spacing));
    const sigma2 = 2 * 150 * 150;
    for (let j = 0; j < cnz; j++) {
      for (let i = 0; i < cnx; i++) {
        const x = b.minX + i * coarseCell, z = b.minZ + j * coarseCell;
        let wsum = 0, hsum = 0;
        for (let k = 0; k < p.n; k += step) {
          if (p.flags.bridge[k]) continue;
          const dx = p.x[k] - x, dz = p.z[k] - z;
          const w = Math.exp(-(dx * dx + dz * dz) / sigma2);
          wsum += w; hsum += w * p.y[k];
        }
        coarse[j * cnx + i] = wsum > 1e-6 ? hsum / wsum : 0;
      }
    }
    const coarseAt = (x, z) => {
      const fx = Math.min(cnx - 1.001, Math.max(0, (x - b.minX) / coarseCell));
      const fz = Math.min(cnz - 1.001, Math.max(0, (z - b.minZ) / coarseCell));
      const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
      const a = coarse[j * cnx + i], c = coarse[j * cnx + i + 1];
      const d = coarse[(j + 1) * cnx + i], e = coarse[(j + 1) * cnx + i + 1];
      return (a * (1 - tx) + c * tx) * (1 - tz) + (d * (1 - tx) + e * tx) * tz;
    };

    // Water-flagged samples (decimated) for harbour / sea regions.
    const waterPts = [];
    if (t.water) {
      for (let i = 0; i < p.n; i += Math.max(1, Math.round(10 / p.spacing))) {
        const o = p.opt(i);
        if (o.waterL || o.waterR) waterPts.push({ i, side: o.waterL ? 1 : -1 });
      }
    }
    const waterLevel = t.water ? t.water.level : -9999;

    const noise = (x, z) => {
      const s = t.hills.scale;
      return (
        Math.sin(x / s) * Math.cos(z / (s * 0.83)) * 0.6 +
        Math.sin((x + z) / (s * 0.41)) * 0.3 +
        Math.sin(x / (s * 0.21) + 1.7) * Math.sin(z / (s * 0.19)) * 0.18
      );
    };

    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = b.minX + i * cell, z = b.minZ + j * cell;
        let h = coarseAt(x, z) + noise(x, z) * t.hills.amp;
        const near = this.nearestSample(x, z, 150, true);
        if (near) {
          const s = near.i;
          const corridor = Math.max(p.wallL[s], p.wallR[s]) + 2;
          const blend = Math.min(1, Math.max(0, (near.d - corridor) / 55));
          const bs = blend * blend * (3 - 2 * blend);
          h = (p.y[s] - 0.45) * (1 - bs) + h * bs;
        }
        if (waterPts.length) {
          let bd = Infinity, bw = null;
          for (const w of waterPts) {
            const dx = p.x[w.i] - x, dz = p.z[w.i] - z;
            const d = dx * dx + dz * dz;
            if (d < bd) { bd = d; bw = w; }
          }
          if (bw && bd < 900 * 900) {
            const u = (x - p.x[bw.i]) * p.lx[bw.i] + (z - p.z[bw.i]) * p.lz[bw.i];
            const beyond = u * bw.side - (Math.max(p.wallL[bw.i], p.wallR[bw.i]) + 7);
            if (beyond > 0) h = Math.min(h, waterLevel - 3 - Math.min(6, beyond * 0.06));
          }
        }
        heights[j * nx + i] = h;
      }
    }

    // Mesh
    const geo = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ, nx - 1, nz - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const tint = new THREE.Color(t.groundTint);
    const c = new THREE.Color();
    for (let idx = 0; idx < pos.count; idx++) {
      const i = idx % nx, j = (idx / nx) | 0;
      const h = heights[j * nx + i];
      pos.setY(idx, h);
      const v = 0.82 + 0.36 * (0.5 + 0.5 * noise(b.minX + i * cell, b.minZ + j * cell));
      c.copy(tint).multiplyScalar(v);
      colors[idx * 3] = c.r; colors[idx * 3 + 1] = c.g; colors[idx * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const map = t.ground === 'urban' ? TEX.pavementTexture() : TEX.grassTexture(t.groundTint, t.ground === 'dry');
    map.repeat.set((b.maxX - b.minX) / 16, (b.maxZ - b.minZ) / 16);
    const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.track(mesh, false, true);

    if (t.water) {
      const wmap = TEX.waterTexture();
      wmap.repeat.set(240, 240);
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(14000, 14000),
        new THREE.MeshStandardMaterial({ map: wmap, color: t.water.color, roughness: 0.14, metalness: 0.55, transparent: true, opacity: 0.94 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set((b.minX + b.maxX) / 2, t.water.level, (b.minZ + b.maxZ) / 2);
      this.waterMap = wmap;
      this.track(water, false, false);
    }
  }

  terrainHeight(x, z) {
    const t = this.terrain;
    const fx = (x - t.minX) / t.cell, fz = (z - t.minZ) / t.cell;
    if (fx < 0 || fz < 0 || fx >= t.nx - 1 || fz >= t.nz - 1) return 0;
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
    const a = t.heights[j * t.nx + i], b = t.heights[j * t.nx + i + 1];
    const c = t.heights[(j + 1) * t.nx + i], d = t.heights[(j + 1) * t.nx + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  // --- road surface ----------------------------------------------------------
  _road() {
    const p = this.path, t = this.theme;
    const n = p.n, idx = allIdx(n);
    const halfW = p.halfW;

    // gravel traps on the outside of quick corners
    this.gravelL = new Uint8Array(n);
    this.gravelR = new Uint8Array(n);
    if (t.gravel) {
      for (let i = 0; i < n; i++) {
        const k = p.k[i];
        if (Math.abs(k) < 1 / 700) continue;
        if (k > 0 && p.wallR[i] - halfW > 7) this.gravelR[i] = 1;
        if (k < 0 && p.wallL[i] - halfW > 7) this.gravelL[i] = 1;
      }
      const sm = (arr) => {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          let any = 0;
          for (let d = -12; d <= 12; d++) any |= arr[p.wrapI(i + d)];
          out[i] = any;
        }
        return out;
      };
      this.gravelL = sm(this.gravelL);
      this.gravelR = sm(this.gravelR);
    }

    // run-off (grass / asphalt / pavement) from the road edge to the barrier
    const runoffMap = t.runoff === 'asphalt' ? TEX.asphaltTexture('runoff')
      : t.runoff === 'pavement' ? TEX.pavementTexture()
        : TEX.grassTexture(t.groundTint, t.ground === 'dry');
    runoffMap.repeat.set(1, 1);
    const roMat = new THREE.MeshStandardMaterial({ map: runoffMap, roughness: 1 });
    const leftRo = new THREE.Mesh(ribbon(p, idx, (i) => p.wallL[i] + 0.6, () => halfW, 0.02, [6, 6], true), roMat);
    this.track(leftRo, false, true);
    const rightRo = new THREE.Mesh(ribbon(p, idx, () => -halfW, (i) => -p.wallR[i] - 0.6, 0.02, [6, 6], true), roMat);
    this.track(rightRo, false, true);

    // gravel traps
    if (t.gravel) {
      const gMat = new THREE.MeshStandardMaterial({ map: TEX.gravelTexture(), roughness: 1 });
      const gm = TEX.gravelTexture(); gm.repeat.set(1, 1);
      for (const [flags, sign] of [[this.gravelL, 1], [this.gravelR, -1]]) {
        for (const run of runsOf(flags, n)) {
          if (run.length < 6) continue;
          const inner = (i) => sign * (halfW + 3.2);
          const outer = (i) => sign * ((sign > 0 ? p.wallL[i] : p.wallR[i]) - 0.4);
          const g = sign > 0 ? ribbon(p, run, outer, inner, 0.03, [5, 5], false)
            : ribbon(p, run, inner, outer, 0.03, [5, 5], false);
          this.track(new THREE.Mesh(g, gMat), false, true);
        }
      }
    }

    // asphalt
    const roadMap = TEX.asphaltTexture('road');
    const roadMat = new THREE.MeshStandardMaterial({ map: roadMap, roughness: 0.92, metalness: 0.0 });
    const road = new THREE.Mesh(ribbon(p, idx, () => halfW, () => -halfW, 0.05, [7, 7], true), roadMat);
    this.track(road, false, true);

    // white edge lines
    const lineMat = new THREE.MeshStandardMaterial({ color: '#eceff2', roughness: 0.8 });
    this.track(new THREE.Mesh(ribbon(p, idx, () => halfW - 0.08, () => halfW - 0.3, 0.075, [0, 4], true), lineMat), false, false);
    this.track(new THREE.Mesh(ribbon(p, idx, () => -halfW + 0.3, () => -halfW + 0.08, 0.075, [0, 4], true), lineMat), false, false);

    // kerbs
    const kerbMat = new THREE.MeshStandardMaterial({ map: TEX.kerbTexture(t.kerb), roughness: 0.75 });
    for (const run of runsOf(p.kerb, n)) {
      if (run.length < 4) continue;
      this.track(new THREE.Mesh(ribbon(p, run, () => halfW + KERB_W, () => halfW, 0.09, [0, 2], false), kerbMat), false, true);
      this.track(new THREE.Mesh(ribbon(p, run, () => -halfW, () => -halfW - KERB_W, 0.09, [0, 2], false), kerbMat), false, true);
    }

    // start / finish line and grid boxes
    const lineIdx = [];
    for (let i = -1; i <= 1; i++) lineIdx.push(p.wrapI(i));
    const checker = TEX.checkerTexture(10);
    checker.repeat.set(1, 1);
    this.track(new THREE.Mesh(
      ribbon(p, lineIdx, () => halfW, () => -halfW, 0.08, [0, 6], false),
      new THREE.MeshStandardMaterial({ map: checker, roughness: 0.8 })
    ), false, false);
    const gridMat = new THREE.MeshBasicMaterial({ color: '#e8ebee' });
    for (let g = 0; g < 8; g++) {
      const s = p.wrapS(-12 - g * 9);
      const side = g % 2 === 0 ? 1 : -1;
      const f = p.sampleAt(s);
      const box = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.25), gridMat);
      box.rotation.x = -Math.PI / 2;
      box.rotation.z = Math.atan2(f.tx, f.tz);
      box.position.set(f.x + f.lx * side * (halfW * 0.45), f.y + 0.07, f.z + f.lz * side * (halfW * 0.45));
      this.track(box, false, false);
    }
  }

  surfaceAt(i, u) {
    const au = Math.abs(u);
    if (au <= this.path.halfW) return 'road';
    if (this.path.kerb[i] && au <= this.path.halfW + KERB_W + 0.2) return 'kerb';
    if (au > this.path.halfW + 3) {
      if (u > 0 ? this.gravelL[i] : this.gravelR[i]) return 'gravel';
    }
    return this.theme.runoff === 'grass' ? 'grass' : 'pavement';
  }

  // --- barriers, tunnel, bridge ---------------------------------------------
  _barriers() {
    const p = this.path, t = this.theme, n = p.n;
    const wallH = t.wall.type === 'tyres' ? 1.05 : 1.15;
    const map = TEX.wallTexture(t.wall.type, t.wall.color, t.wall.stripe);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.75, metalness: t.wall.type === 'armco' ? 0.35 : 0.05, side: THREE.DoubleSide });

    const open = new Uint8Array(n);
    for (let i = 0; i < n; i++) open[i] = p.flags.tunnel[i] ? 0 : 1;
    for (const run of runsOf(open, n)) {
      if (run.length < 3) continue;
      const closed = run.length === n;
      this.track(new THREE.Mesh(wallStrip(p, run, (i) => p.wallL[i] + 0.6, -1.2, wallH, 4, closed, true), mat), true, true);
      this.track(new THREE.Mesh(wallStrip(p, run, (i) => -p.wallR[i] - 0.6, -1.2, wallH, 4, closed, false), mat), true, true);
    }

    // Trackside advertising hoardings on the barrier, along the main straight.
    const banner = TEX.bannerTexture(t.banner || this.def.city.toUpperCase());
    const bMat = new THREE.MeshStandardMaterial({ map: banner, roughness: 0.7, side: THREE.DoubleSide });
    const bIdx = [];
    for (let i = -140; i < 60; i++) bIdx.push(p.wrapI(i));
    this.track(new THREE.Mesh(wallStrip(p, bIdx, (i) => p.wallL[i] + 0.55, 0.05, wallH + 0.02, 26, false, true), bMat), false, false);

    for (const run of runsOf(p.flags.tunnel, n)) this._tunnel(run);
    for (const run of runsOf(p.flags.bridge, n)) this._bridge(run);
  }

  _tunnel(run) {
    const p = this.path;
    const inner = (i) => p.wallL[i] + 0.4, innerR = (i) => -p.wallR[i] - 0.4;
    const H = 6.4;
    const wallMat = new THREE.MeshStandardMaterial({ color: '#d9d5cc', roughness: 0.9, side: THREE.DoubleSide });
    const outMat = new THREE.MeshStandardMaterial({ color: '#bfb9ac', roughness: 0.95, side: THREE.DoubleSide });
    this.track(new THREE.Mesh(wallStrip(p, run, inner, -1, H, 8, false, true), wallMat), true, true);
    this.track(new THREE.Mesh(wallStrip(p, run, innerR, -1, H, 8, false, false), wallMat), true, true);
    // ceiling (seen from inside) and roof (from outside)
    this.track(new THREE.Mesh(ribbon(p, run, innerR, inner, H, [8, 8], false), wallMat), true, false);
    this.track(new THREE.Mesh(ribbon(p, run, (i) => inner(i) + 7, (i) => innerR(i) - 7, H + 3.2, [8, 8], false), outMat), true, true);
    this.track(new THREE.Mesh(wallStrip(p, run, (i) => inner(i) + 7, -2, H + 3.2, 8, false, false), outMat), true, true);
    this.track(new THREE.Mesh(wallStrip(p, run, (i) => innerR(i) - 7, -2, H + 3.2, 8, false, true), outMat), true, true);
    // light strip down the middle of the ceiling
    const lightMat = new THREE.MeshBasicMaterial({ color: '#fff2cf' });
    const lights = new THREE.Mesh(ribbon(p, run, () => 0.55, () => -0.55, H - 0.12, [0, 6], false), lightMat);
    this.track(lights, false, false);
    for (let k = 4; k < run.length; k += 14) {
      const i = run[k];
      const l = new THREE.PointLight('#ffd9a0', 8, 34, 2);
      l.position.set(p.x[i], p.y[i] + H - 0.5, p.z[i]);
      this.group.add(l);
      this.disposables.push(l);
    }
  }

  _bridge(run) {
    const p = this.path;
    const deckMat = new THREE.MeshStandardMaterial({ color: '#b9b5ac', roughness: 0.9, side: THREE.DoubleSide });
    const left = (i) => p.wallL[i] + 1.2, right = (i) => -p.wallR[i] - 1.2;
    this.track(new THREE.Mesh(ribbon(p, run, right, left, -1.5, [8, 8], false), deckMat), true, false);
    this.track(new THREE.Mesh(wallStrip(p, run, left, -1.5, 0.1, 8, false, true), deckMat), true, true);
    this.track(new THREE.Mesh(wallStrip(p, run, right, -1.5, 0.1, 8, false, false), deckMat), true, true);
    const pierMat = new THREE.MeshStandardMaterial({ color: '#c3bfb5', roughness: 0.95 });
    for (let k = 6; k < run.length - 6; k += 12) {
      const i = run[k];
      const ground = this.terrainHeight(p.x[i], p.z[i]);
      const h = p.y[i] - 1.5 - ground;
      if (h < 1.5) continue;
      for (const side of [-1, 1]) {
        const u = side > 0 ? left(i) - 1.4 : right(i) + 1.4;
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.5, h, 1.5), pierMat);
        pier.position.set(p.x[i] + p.lx[i] * u, ground + h / 2, p.z[i] + p.lz[i] * u);
        pier.rotation.y = Math.atan2(p.tx[i], p.tz[i]);
        this.track(pier, true, true);
      }
    }
  }

  // --- pits, grandstands, gantry, landmarks ---------------------------------
  _structures() {
    const p = this.path, t = this.theme;
    const pitSide = this.def.points.find((pt) => pt[2] && pt[2].pit)?.[2].pit || 'R';
    const grandSide = pitSide === 'R' ? 'L' : 'R';

    // start gantry with the lights
    const f = p.sampleAt(0);
    const gantry = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.6, metalness: 0.4 });
    const span = p.halfW + 3.5;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), postMat);
      post.position.set(side * span, 4, 0);
      gantry.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.6, 1.1, 0.7), postMat);
    beam.position.y = 7.6;
    gantry.add(beam);
    const bannerGeo = new THREE.PlaneGeometry(span * 1.7, 1.5);
    const bannerMat = new THREE.MeshStandardMaterial({ map: TEX.bannerTexture(this.def.city.toUpperCase(), '#12161d', '#f4f6f8'), roughness: 0.8 });
    const bFront = new THREE.Mesh(bannerGeo, bannerMat);
    bFront.position.set(0, 6.4, 0.22);
    const bBack = new THREE.Mesh(bannerGeo, bannerMat);
    bBack.position.set(0, 6.4, -0.22);
    bBack.rotation.y = Math.PI;
    gantry.add(bFront, bBack);
    this.lights = [];
    const offMat = new THREE.MeshStandardMaterial({ color: '#26282c', roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const pair = new THREE.Group();
      for (let j = 0; j < 2; j++) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), offMat.clone());
        bulb.position.set(0, j * -0.7, 0);
        pair.add(bulb);
      }
      pair.position.set((i - 2) * 1.5, 8.5, 0);
      gantry.add(pair);
      this.lights.push(pair);
    }
    gantry.position.set(f.x, f.y, f.z);
    gantry.rotation.y = Math.atan2(f.tx, f.tz);
    this.group.add(gantry);
    this.disposables.push(gantry);

    // pit building + pit wall along the main straight
    const pitSign = pitSide === 'L' ? 1 : -1;
    const garage = new THREE.MeshStandardMaterial({ map: TEX.repeated(TEX.garageTexture(), 3, 1), roughness: 0.85 });
    const blank = new THREE.MeshStandardMaterial({ color: '#dedad2', roughness: 0.9 });
    // box faces are [+x, -x, +y, -y, +z, -z]; the garage doors face the track
    const pitFaces = pitSign > 0
      ? [blank, garage, blank, blank, blank, blank]
      : [garage, blank, blank, blank, blank, blank];
    for (let k = 0; k < 7; k++) {
      const s = p.wrapS(-150 + k * 30);
      const fr = p.sampleAt(s);
      const u = pitSign * ((pitSign > 0 ? p.wallL[fr.i] : p.wallR[fr.i]) + 10);
      const b = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 30), pitFaces);
      b.position.set(fr.x + fr.lx * u, fr.y + 3.5, fr.z + fr.lz * u);
      b.rotation.y = Math.atan2(fr.tx, fr.tz);
      this.track(b, true, true);
    }
    const wallIdx = [];
    for (let i = -80; i < 20; i++) wallIdx.push(p.wrapI(i));
    const pitWallMat = new THREE.MeshStandardMaterial({ map: TEX.bannerTexture('PIT LANE', '#1b1f26', '#dfe4ea'), roughness: 0.8, side: THREE.DoubleSide });
    this.track(new THREE.Mesh(
      wallStrip(p, wallIdx, (i) => pitSign * ((pitSign > 0 ? p.wallL[i] : p.wallR[i]) + 2.5), 0, 1.1, 24, false, pitSign > 0),
      pitWallMat
    ), true, true);

    // grandstands along the main straight
    const grandSign = grandSide === 'L' ? 1 : -1;
    const crowd = TEX.crowdTexture();
    crowd.repeat.set(7, 3);
    const crowdMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.95 });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#8d949c', roughness: 0.7, metalness: 0.25 });
    const backMat = new THREE.MeshStandardMaterial({ color: '#d9dce0', roughness: 0.85 });
    const gs = t.grandstands || { count: 5, len: 34, gap: 40 };
    // box faces are [+x, -x, +y, -y, +z, -z]; the crowd goes on the face towards the track
    const faces = grandSign > 0
      ? [backMat, crowdMat, frameMat, frameMat, frameMat, frameMat]
      : [crowdMat, backMat, frameMat, frameMat, frameMat, frameMat];
    for (let k = 0; k < gs.count; k++) {
      const s = p.wrapS(-gs.gap * (gs.count - 1) * 0.6 + k * gs.gap);
      const fr = p.sampleAt(s);
      const wall = grandSign > 0 ? p.wallL[fr.i] : p.wallR[fr.i];
      const u = grandSign * (wall + 8);
      const g = new THREE.Group();
      const seats = new THREE.Mesh(new THREE.BoxGeometry(11, 8.5, gs.len), faces);
      seats.position.set(grandSign * 5, 4.2, 0);
      seats.rotation.z = -grandSign * 0.26;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.4, gs.len + 2), frameMat);
      roof.position.set(grandSign * 6, 10.2, 0);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 10, gs.len), frameMat);
      back.position.set(grandSign * 11.4, 5, 0);
      g.add(seats, roof, back);
      g.position.set(fr.x + fr.lx * u, fr.y, fr.z + fr.lz * u);
      g.rotation.y = Math.atan2(fr.tx, fr.tz);
      this.group.add(g);
      this.disposables.push(g);
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    }

    if (t.ferris) this._ferris();
    if (t.yachts) this._yachts(t.yachts);
    if (this.def.points.some((pt) => pt[2] && pt[2].wings)) this._wings();
  }

  _wings() {
    // The winged bridge structure over the Shanghai main straight.
    const p = this.path;
    const f = p.sampleAt(p.wrapS(-60));
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.5, metalness: 0.25 });
    const span = p.halfW + 16;
    for (const side of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(10, 26, 14), mat);
      tower.position.set(side * span, 13, 0);
      g.add(tower);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(span * 2, 3.4, 11), mat);
    deck.position.y = 24;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(span * 0.95, 1.1, 8, 24, Math.PI), mat);
    arch.position.y = 26;
    arch.rotation.y = Math.PI / 2;
    g.add(deck, arch);
    g.position.set(f.x, f.y, f.z);
    g.rotation.y = Math.atan2(f.tx, f.tz);
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(g);
    this.disposables.push(g);
  }

  _ferris() {
    const p = this.path;
    const f = p.sampleAt(p.length * 0.05);
    const g = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: '#e8eaec', roughness: 0.5, metalness: 0.3 });
    const wheel = new THREE.Group();
    const R = 26;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 8, 40), frame);
    wheel.add(rim);
    const cabinMat = new THREE.MeshStandardMaterial({ color: '#d94f5c', roughness: 0.6 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, R * 2, 6), frame);
      spoke.rotation.z = a;
      wheel.add(spoke);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.4), cabinMat.clone());
      cab.material.color.setHSL((i / 16) * 0.8, 0.55, 0.55);
      cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      wheel.add(cab);
    }
    wheel.position.y = R + 6;
    const legMat = new THREE.MeshStandardMaterial({ color: '#cfd3d7', roughness: 0.6, metalness: 0.2 });
    for (const s of [-1, 1]) {
      for (const zz of [-6, 6]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, R + 6, 8), legMat);
        leg.position.set(s * 9, (R + 6) / 2, zz);
        leg.rotation.z = -s * 0.28;
        g.add(leg);
      }
    }
    g.add(wheel);
    this.ferris = wheel;
    const u = -(p.wallR[f.i] + 78);
    g.position.set(f.x + f.lx * u, this.terrainHeight(f.x + f.lx * u, f.z + f.lz * u), f.z + f.lz * u);
    g.rotation.y = Math.atan2(f.tx, f.tz) + Math.PI / 2;
    g.traverse((o) => { o.castShadow = true; });
    this.group.add(g);
    this.disposables.push(g);
  }

  _yachts(count) {
    const p = this.path, t = this.theme;
    const hullMat = new THREE.MeshStandardMaterial({ color: '#f2f4f6', roughness: 0.35, metalness: 0.1 });
    const deckMat = new THREE.MeshStandardMaterial({ color: '#3b4450', roughness: 0.4 });
    const waterSamples = [];
    for (let i = 0; i < p.n; i++) {
      const o = p.opt(i);
      if (o.waterL || o.waterR) waterSamples.push({ i, side: o.waterL ? 1 : -1 });
    }
    if (!waterSamples.length) return;
    for (let c = 0; c < count; c++) {
      const w = waterSamples[(this.rnd() * waterSamples.length) | 0];
      const i = w.i;
      const off = w.side * (Math.max(p.wallL[i], p.wallR[i]) + 16 + this.rnd() * 45);
      const x = p.x[i] + p.lx[i] * off, z = p.z[i] + p.lz[i] * off;
      if (this.terrainHeight(x, z) > t.water.level - 1.5) continue;
      const len = 10 + this.rnd() * 20;
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(len * 0.3, 2.2, len), hullMat);
      hull.position.y = 0.6;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(len * 0.22, 1.8, len * 0.42), deckMat);
      cabin.position.set(0, 2.5, -len * 0.06);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, len * 0.9, 6), hullMat);
      mast.position.y = 3 + len * 0.4;
      g.add(hull, cabin, mast);
      g.position.set(x, t.water.level, z);
      g.rotation.y = Math.atan2(p.tx[i], p.tz[i]) + (this.rnd() - 0.5) * 0.5;
      g.traverse((o) => { o.castShadow = true; });
      this.group.add(g);
      this.disposables.push(g);
    }
  }

  // --- trees and buildings ---------------------------------------------------
  _treeProtos() {
    const P = {};
    P.pine = () => ({
      trunk: [new THREE.CylinderGeometry(0.22, 0.3, 2.4, 6), '#5a4632', 1.2],
      canopy: [new THREE.ConeGeometry(1.9, 6.2, 8), '#2f6136', 5.2],
    });
    P.round = () => ({
      trunk: [new THREE.CylinderGeometry(0.24, 0.34, 2.6, 6), '#6b5238', 1.3],
      canopy: [new THREE.IcosahedronGeometry(2.6, 1), '#417a33', 4.6],
    });
    P.cherry = () => ({
      trunk: [new THREE.CylinderGeometry(0.2, 0.28, 2.2, 6), '#6a5142', 1.1],
      canopy: [new THREE.IcosahedronGeometry(2.3, 1), '#f0b4c8', 4.0],
    });
    P.palm = () => {
      const fronds = [];
      const frond = new THREE.ConeGeometry(0.55, 3.6, 4);
      for (let i = 0; i < 6; i++) {
        const g = frond.clone();
        g.rotateZ(Math.PI / 2.1);
        g.translate(1.7, 0, 0);
        g.rotateY((i / 6) * Math.PI * 2);
        fronds.push(g);
      }
      const merged = mergeGeoms(fronds);
      return {
        trunk: [new THREE.CylinderGeometry(0.18, 0.3, 6.5, 6), '#8a7354', 3.2],
        canopy: [merged, '#3e8a45', 6.6],
      };
    };
    P.eucalyptus = () => {
      const blobs = [];
      const b1 = new THREE.IcosahedronGeometry(2.0, 1); b1.translate(0.5, 0.4, 0);
      const b2 = new THREE.IcosahedronGeometry(1.5, 1); b2.translate(-1.4, -0.3, 0.5);
      blobs.push(b1, b2);
      return {
        trunk: [new THREE.CylinderGeometry(0.2, 0.32, 5.2, 6), '#cfc7b4', 2.6],
        canopy: [mergeGeoms(blobs), '#6f8b53', 6.0],
      };
    };
    return P;
  }

  _scenery() {
    const p = this.path, t = this.theme;
    const protos = this._treeProtos();
    const kinds = t.trees || [];
    const placements = kinds.map(() => []);
    const totalW = kinds.reduce((a, k) => a + k.weight, 0) || 1;

    // Buildings are sited first so the trees can be told where not to stand. Scattering
    // the two independently is what grew trees up through people's living rooms.
    const spots = this._buildingSpots();
    // A tree is clear of a building if it is outside its footprint - tested in the
    // building's own frame, since the boxes are turned to face the circuit.
    const insideBuilding = (x, z) => {
      for (const o of spots) {
        const dx = x - o.x, dz = z - o.z;
        if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
        // the inverse of the turn the instance is given: local = Rᵀ · world
        const c = Math.cos(o.rot), s = Math.sin(o.rot);
        if (Math.abs(dx * c - dz * s) < o.w / 2 + 2.5 && Math.abs(dx * s + dz * c) < o.d / 2 + 2.5) return true;
      }
      return false;
    };

    const step = Math.max(1, Math.round(9 / p.spacing));
    for (let i = 0; i < p.n; i += step) {
      for (const side of [1, -1]) {
        if (this.rnd() > (t.treeDensity || 0)) continue;
        const wall = side > 0 ? p.wallL[i] : p.wallR[i];
        const u = side * (wall + 5 + this.rnd() * 34);
        const x = p.x[i] + p.lx[i] * u + (this.rnd() - 0.5) * 6;
        const z = p.z[i] + p.lz[i] * u + (this.rnd() - 0.5) * 6;
        const near = this.nearestSample(x, z, 40);
        if (near && near.d < Math.max(p.wallL[near.i], p.wallR[near.i]) + 4) continue;
        const y = this.terrainHeight(x, z);
        if (t.water && y < t.water.level + 0.5) continue;
        if (insideBuilding(x, z)) continue;
        let r = this.rnd() * totalW, pick = 0;
        for (let k = 0; k < kinds.length; k++) { r -= kinds[k].weight; if (r <= 0) { pick = k; break; } }
        placements[pick].push({ x, y, z, s: 0.7 + this.rnd() * 0.7, rot: this.rnd() * Math.PI * 2 });
      }
    }

    kinds.forEach((kind, ki) => {
      const list = placements[ki];
      if (!list.length) return;
      const proto = protos[kind.type] ? protos[kind.type]() : protos.round();
      const parts = [
        { geo: proto.trunk[0], color: proto.trunk[1], y: proto.trunk[2] },
        { geo: proto.canopy[0], color: kind.tint || proto.canopy[1], y: proto.canopy[2] },
      ];
      for (const part of parts) {
        const mat = new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.95, flatShading: true });
        const inst = new THREE.InstancedMesh(part.geo, mat, list.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
        const col = new THREE.Color();
        list.forEach((o, idx) => {
          pos.set(o.x, o.y + part.y * o.s, o.z);
          q.setFromAxisAngle(UP, o.rot);
          sc.setScalar(o.s);
          inst.setMatrixAt(idx, m.compose(pos, q, sc));
          const v = 0.82 + this.rnd() * 0.3;
          inst.setColorAt(idx, col.set(part.color).multiplyScalar(v));
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.frustumCulled = false;
        this.track(inst, false, false);
      }
    });

    // buildings
    if (spots.length) {
      const dusk = t.sun.elevation < 20;
      const mat = new THREE.MeshStandardMaterial({
        map: TEX.repeated(TEX.facadeTexture('#ffffff', dusk, 6), 2, 3),
        emissiveMap: dusk ? TEX.facadeEmissive(6) : null,
        emissive: new THREE.Color(dusk ? '#ffc27a' : '#000'),
        emissiveIntensity: dusk ? 0.9 : 0,
        roughness: 0.9,
      });
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, spots.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
      const col = new THREE.Color();
      spots.forEach((o, i) => {
        // `o.y` is the lowest ground the footprint covers and `o.sink` how far the ground
        // falls across it, so the box starts below the low corner and is tall enough to
        // reach its full height above it. A building cut into a slope is right; one
        // hanging in the air off the downhill corner is what this replaces.
        pos.set(o.x, o.y - o.sink / 2 + o.h / 2, o.z);
        q.setFromAxisAngle(UP, o.rot);
        sc.set(o.w, o.h + o.sink, o.d);
        inst.setMatrixAt(i, m.compose(pos, q, sc));
        inst.setColorAt(i, col.set(o.c));
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      this.track(inst, true, true);
    }
  }

  // Where the buildings stand. Each one is measured against the ground it actually covers
  // rather than the single point at its centre: a twenty-six metre box on a hillside sat
  // level with its middle leaves two corners buried and two hanging in mid-air.
  _buildingSpots() {
    const p = this.path, t = this.theme, bcfg = t.buildings;
    const spots = [];
    if (!bcfg || !(bcfg.density > 0)) return spots;
    const bstep = Math.max(1, Math.round(26 / p.spacing));
    for (let i = 0; i < p.n; i += bstep) {
      for (const side of [1, -1]) {
        if (this.rnd() > bcfg.density) continue;
        const wall = side > 0 ? p.wallL[i] : p.wallR[i];
        const u = side * (wall + 16 + this.rnd() * 26);
        const x = p.x[i] + p.lx[i] * u, z = p.z[i] + p.lz[i] * u;
        const near = this.nearestSample(x, z, 46);
        if (near && near.d < Math.max(p.wallL[near.i], p.wallR[near.i]) + 12) continue;
        const rot = Math.atan2(p.tx[i], p.tz[i]) + (this.rnd() - 0.5) * 0.3;
        const h = bcfg.minH + this.rnd() * (bcfg.maxH - bcfg.minH);
        const w = 12 + this.rnd() * 16, d = 12 + this.rnd() * 14;
        // the ground under all four corners, in the building's own frame
        const c = Math.cos(rot), s = Math.sin(rot);
        let lo = Infinity, hi = -Infinity;
        for (const [ox, oz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) {
          const gy = this.terrainHeight(x + ox * c + oz * s, z - ox * s + oz * c);
          if (gy < lo) lo = gy;
          if (gy > hi) hi = gy;
        }
        if (t.water && lo < t.water.level + 1) continue;
        spots.push({ x, y: lo, z, rot, h, w, d, sink: Math.min(hi - lo, 40),
          c: bcfg.palette[(this.rnd() * bcfg.palette.length) | 0] });
      }
    }
    return spots;
  }

  update(dt, elapsed) {
    if (this.ferris) this.ferris.rotation.z += dt * 0.12;
    if (this.waterMap) {
      this.waterMap.offset.x = Math.sin(elapsed * 0.05) * 0.01;
      this.waterMap.offset.y = elapsed * 0.004;
    }
  }

  setStartLights(count, on = true) {
    if (!this.lights) return;
    this.lights.forEach((pair, i) => {
      pair.children.forEach((bulb) => {
        const lit = on && i < count;
        bulb.material.color.set(lit ? '#ff2b1c' : '#26282c');
        bulb.material.emissive = new THREE.Color(lit ? '#ff3322' : '#000000');
        bulb.material.emissiveIntensity = lit ? 2.2 : 0;
      });
    });
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((mm) => mm.dispose());
      }
    });
    this.scene.fog = null;
  }
}

// Minimal geometry merge (positions/normals/uv only) so we avoid the addons bundle.
function mergeGeoms(geos) {
  let vCount = 0, iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, nn = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, vo * 3);
    nor.set(nn.array, vo * 3);
    if (u) uv.set(u.array, vo * 2);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo; }
    else { for (let i = 0; i < p.count; i++) idx[io++] = i + vo; }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
