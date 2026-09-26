// Everything beyond the barriers that is not a grandstand or a building: how the ground
// is coloured, the land out to the horizon with the mountains standing on it, the woods,
// and the bushes and stones along the fence.
//
// The circuit's own terrain (trackBuild.js) is a height grid about 600 m wider than the
// track on every side. Past its edge there used to be nothing: a flat horizon line with a
// ring of unlit cones standing in the fog. `FarLand` carries the ground on from that edge
// out to the sky and grows the mountains out of it, so they are hills lit by the same sun
// as everything else rather than cut-outs pasted on the horizon.
import * as THREE from 'three';
import * as TEX from './textures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// smoothstep that also runs backwards when a > b
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// --- noise -------------------------------------------------------------------

// Value noise on an integer lattice, smoothed. Deterministic per seed, so a circuit looks
// the same every time it is loaded.
export function makeNoise(seed) {
  const hash = (ix, iz) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const value = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    const top = a + (b - a) * ux, bottom = c + (d - c) * ux;
    return top + (bottom - top) * uz;
  };
  // Each octave is turned and shifted, so the lattice of one never lines up with the next.
  const next = (p) => { const x = p[0]; p[0] = x * 1.6 + p[1] * 1.2 + 17.3; p[1] = -x * 1.2 + p[1] * 1.6 - 9.1; };
  // 0..1, rolling
  const fbm = (x, z, oct = 4) => {
    let v = 0, amp = 0.5, sum = 0;
    const p = [x, z];
    for (let i = 0; i < oct; i++) { v += amp * value(p[0], p[1]); sum += amp; next(p); amp *= 0.5; }
    return v / sum;
  };
  // 0..1, with sharp crests where the noise crosses its middle: ranges rather than hills.
  // Each octave is weighted by the one before, so the fine detail gathers on the ridges and
  // the valleys stay smooth.
  const ridged = (x, z, oct = 5) => {
    let v = 0, amp = 0.5, sum = 0, weight = 1;
    const p = [x, z];
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(value(p[0], p[1]) * 2 - 1);
      n *= n;
      v += amp * n * weight; sum += amp;
      weight = clamp(n * 1.5, 0, 1);
      next(p); amp *= 0.5;
    }
    return v / sum;
  };
  return { value, fbm, ridged };
}

// --- ground colour -----------------------------------------------------------

// What the ground is at any point: its colour, and how much of it is bare rock or paving
// rather than grass. The circuit's terrain and the far land both ask this, so the two
// meet at the terrain's edge without a seam.
//
// The colour is a vertex colour, multiplied onto the ground texture by the terrain
// material. Grass keeps the old recipe (the theme's tint over a grass texture of the same
// tint) and the rest is measured against it.
export class Ground {
  constructor(theme, noise) {
    this.noise = noise;
    this.urban = theme.ground === 'urban';
    this.dry = theme.ground === 'dry';
    this.soil = new THREE.Color(this.urban ? theme.wild || theme.groundTint : theme.groundTint);
    this.pave = new THREE.Color(theme.groundTint);
    this.rock = new THREE.Color(theme.rock || (this.dry ? '#9c8468' : '#8f8a80')).multiplyScalar(0.62);
    this.snow = new THREE.Color('#f4f7fb').multiplyScalar(1.25);
    const m = theme.mountains;
    // the vegetation on the mountainsides; the theme's mountain colour was chosen to be
    // seen through haze, and the fog now does the hazing, so it is taken deeper
    this.slopes = m ? new THREE.Color(m.color).lerp(this.soil, 0.35).multiplyScalar(0.8) : this.soil.clone();
    this.snowLine = m && m.snow ? m.height[1] * (m.snowLine || 0.55) : Infinity;
    this.peak = m ? m.height[1] : 1;
    const f = theme.forest;
    this.forestDensity = f ? f.density : 0;
    this.fields = theme.fields || 0;
    this._c = new THREE.Color();
  }

  // 0..1: how much of this spot is woodland. Patches a few hundred metres across with
  // clearings between them; the denser the theme's forest, the more of the map they cover.
  forestAt(x, z) {
    const d = this.forestDensity;
    if (!d) return 0;
    const n = this.noise.fbm(x / 320 + 71, z / 320 - 13, 4);
    const th = 0.7 - d * 0.36;
    return smooth(th, th + 0.09, n);
  }

  // `ny` is the up component of the ground's normal, `pave` how paved it is (0..1),
  // `lift` how many metres the mountains have raised it and `d` how far it is from the
  // centreline (Infinity when that is further than anyone measured). Writes the vertex
  // colour into `col` at `k` and the rock / paving / farmland weights into `mix` at `m`.
  shade(x, z, ny, pave, lift, d, col, k, mix, m) {
    const nz = this.noise;
    const bright = nz.fbm(x / 240, z / 240, 3);
    const moist = nz.fbm(x / 900 + 31, z / 900 - 7, 2);
    const c = this._c.copy(this.soil).multiplyScalar(0.8 + 0.42 * bright);
    // dry, yellowing patches and lush, bluer ones
    const dryness = smooth(0.38, 0.66, moist) * (this.dry ? 1.3 : 0.9);
    c.r *= 1 + 0.2 * dryness - 0.08 * (1 - dryness);
    c.g *= 1 + 0.04 * dryness;
    c.b *= 1 - 0.3 * dryness;
    // woodland seen from a distance is darker than a field: the canopy, and the shade
    // under it where the trees are planted
    const wood = this.forestAt(x, z);
    c.multiplyScalar(1 - 0.52 * wood);
    c.b *= 1 - 0.2 * wood;
    // up the mountains the grass gives way to their own vegetation
    const high = smooth(20, this.peak * 0.35, lift);
    if (high > 0) c.lerp(this.slopes, high);
    // paving (urban circuits) sits between the grass and the rock; nobody paves an
    // embankment, so the steep ground keeps its scrub
    pave *= smooth(0.8, 0.93, ny);
    if (pave > 0) {
      const pv = this.pave;
      const v = 0.86 + 0.28 * bright;
      c.setRGB(c.r + (pv.r * v - c.r) * pave, c.g + (pv.g * v - c.g) * pave, c.b + (pv.b * v - c.b) * pave);
    }
    // rock: steep ground, the tops of the mountains, and on dry circuits bare patches
    let rock = smooth(0.84, 0.64, ny) + smooth(0.45, 0.95, lift / this.peak) * 0.8;
    if (this.dry) rock += smooth(0.6, 0.72, nz.fbm(x / 70 - 5, z / 70 + 3, 3)) * 0.55;
    rock = clamp(rock, 0, 1);
    const rv = 0.85 + 0.3 * bright;
    c.setRGB(c.r + (this.rock.r * rv - c.r) * rock, c.g + (this.rock.g * rv - c.g) * rock, c.b + (this.rock.b * rv - c.b) * rock);
    // snow on the high, flatter ground
    let snow = 0;
    if (lift > this.snowLine - 60) {
      const line = this.snowLine + (nz.fbm(x / 160, z / 160, 3) - 0.5) * 120;
      snow = smooth(line - 25, line + 25, lift) * smooth(0.5, 0.72, ny);
      c.lerp(this.snow, snow);
    }
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    const r = 1 - (1 - rock) * (1 - snow);
    mix[m] = r;
    mix[m + 1] = pave * (1 - r);
    // farmland on the open, level ground away from the circuit and below the mountains
    mix[m + 2] = this.fields * (1 - wood) * (1 - wood) * (1 - r) * (1 - pave) *
      smooth(90, 150, d) * smooth(40, 8, lift) * smooth(0.9, 0.97, ny);
  }
}

// --- terrain material --------------------------------------------------------

// One material for all the ground outside the run-off. Textures are laid by world
// position rather than UV, so the circuit's grid and the far land share them seamlessly
// and nothing depends on a texture's repeat (the grass texture is shared with the run-off,
// which sets its own). The grass is sampled at two scales and averaged, which hides the
// tiling that a single repeat shows across a field. Rock is projected from all three axes
// so it does not smear down cliffs, and a per-vertex weight (`groundMix`: rock, paving,
// farmland) blends them.
export function groundMaterial(theme, fieldAngle = 0) {
  const urban = theme.ground === 'urban';
  const soil = TEX.grassTexture(urban ? theme.wild || theme.groundTint : theme.groundTint, theme.ground === 'dry' || urban);
  const mat = new THREE.MeshStandardMaterial({ map: soil, vertexColors: true, roughness: 1, metalness: 0 });
  const uniforms = {
    rockMap: { value: TEX.rockTexture() },
    paveMap: { value: TEX.pavementTexture() },
    scales: { value: new THREE.Vector3(1 / 14, 1 / 26, 1 / 16) },
    fieldTurn: { value: new THREE.Vector2(Math.cos(fieldAngle), Math.sin(fieldAngle)) },
    // crops, each normalised to the brightness of what it replaces so the fields sit in
    // the same light as the grass around them
    crops: { value: ['#d2b75a', '#7aa33e', '#557f33', '#94704a', '#b3b56c'].map((h) => {
      const c = new THREE.Color(h);
      return new THREE.Vector3(c.r, c.g, c.b).divideScalar(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
    }) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 groundMix;
        varying vec3 vMix;
        varying vec3 vWorld;
        varying vec3 vWorldN;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vMix = groundMix;
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D rockMap;
        uniform sampler2D paveMap;
        uniform vec3 scales;
        uniform vec2 fieldTurn;
        uniform vec3 crops[5];
        varying vec3 vMix;
        float fieldHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        varying vec3 vWorld;
        varying vec3 vWorldN;`)
      .replace('#include <map_fragment>', `
        vec2 wp = vWorld.xz;
        vec3 ground = mix(texture2D(map, wp * scales.x).rgb,
                          texture2D(map, wp * scales.x * 0.21 + vec2(0.37, 0.61)).rgb, 0.5);
        if (vMix.y > 0.001) ground = mix(ground, texture2D(paveMap, wp * scales.z).rgb, vMix.y);
        if (vMix.x > 0.001) {
          vec3 bw = pow(abs(normalize(vWorldN)), vec3(4.0));
          bw /= bw.x + bw.y + bw.z;
          vec3 rock = texture2D(rockMap, vWorld.zy * scales.y).rgb * bw.x
                    + texture2D(rockMap, wp * scales.y).rgb * bw.y
                    + texture2D(rockMap, vWorld.xy * scales.y).rgb * bw.z;
          ground = mix(ground, rock, vMix.x);
        }
        diffuseColor.rgb *= ground;`)
      // Farmland, drawn here rather than in the vertex colours so the field edges stay
      // sharp on the far land, whose vertices are tens of metres apart. Rows of fields of
      // varying width, each a crop or left as meadow, with furrows along the ploughed and
      // ripening ones and a dark hedge line round every field. The furrows and hedges fade
      // out once they are finer than a pixel, before they can shimmer.
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vMix.z > 0.01) {
          vec2 q = vec2(fieldTurn.x * vWorld.x - fieldTurn.y * vWorld.z, fieldTurn.y * vWorld.x + fieldTurn.x * vWorld.z);
          float row = floor(q.y / 85.0);
          float width = 95.0 + 110.0 * fieldHash(vec2(row, 7.0));
          float qx = q.x + fieldHash(vec2(row, 3.0)) * width;
          vec2 id = vec2(floor(qx / width), row);
          vec2 f = vec2(fract(qx / width) * width, fract(q.y / 85.0) * 85.0);
          float hsh = fieldHash(id);
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 crop = diffuseColor.rgb;
          float tilled = 0.0;
          if (hsh < 0.22) { crop = crops[0] * lum * 1.35; tilled = 1.0; }
          else if (hsh < 0.42) crop = crops[1] * lum * 1.1;
          else if (hsh < 0.58) crop = crops[2] * lum * 0.95;
          else if (hsh < 0.7) { crop = crops[3] * lum * 1.05; tilled = 1.0; }
          else if (hsh < 0.8) crop = crops[4] * lum * 1.2;
          float fw = fwidth(q.x) + fwidth(q.y);
          float furrow = 1.0 - 0.14 * tilled * (0.5 + 0.5 * sin(q.x * 1.7)) * (1.0 - smoothstep(0.8, 2.5, fw));
          float edge = min(min(f.x, width - f.x), min(f.y, 85.0 - f.y));
          float hedge = mix(0.55, 1.0, smoothstep(1.2, 3.2, edge)) ;
          hedge = mix(hedge, 1.0, smoothstep(2.0, 8.0, fw));
          diffuseColor.rgb = mix(diffuseColor.rgb, crop * furrow * hedge, clamp(vMix.z, 0.0, 1.0));
        }`);
  };
  mat.customProgramCacheKey = () => 'zrace-ground';
  return mat;
}

// --- the land beyond the circuit's terrain ------------------------------------

// A disc of ground from inside the terrain grid's edge out to near the sky dome, with
// rings spaced further apart the further out they are. Inside the grid it sinks out of
// sight under the circuit's own terrain; past the edge it carries the hills on, and
// further out the mountains rise out of it.
export class FarLand {
  constructor(world, ground, noise) {
    this.w = world;
    this.ground = ground;
    this.noise = noise;
    const T = world.terrain;
    this.rect = { minX: T.minX, minZ: T.minZ, maxX: T.minX + (T.nx - 1) * T.cell - 0.01, maxZ: T.minZ + (T.nz - 1) * T.cell - 0.01 };
    this.cx = (this.rect.minX + this.rect.maxX) / 2;
    this.cz = (this.rect.minZ + this.rect.maxZ) / 2;
    this.mtn = world.theme.mountains;
    if (this.mtn) this.wave = (2 * Math.PI * this.mtn.dist) / this.mtn.count;
    this.water = world.theme.water;
    this.amp = Math.max(8, world.theme.hills.amp);
  }

  // Metres the mountains add at a point `dOut` beyond the grid's edge. They start to
  // rise well short of the theme's distance and reach full height there; the ridged noise
  // makes them ranges with passes rather than a row of cones, and a slower noise over it
  // makes some stretches of the horizon massifs and others low.
  lift(x, z, dOut) {
    const m = this.mtn;
    if (!m) return 0;
    const r = Math.hypot(x - this.cx, z - this.cz);
    const ramp = smooth(m.dist * 0.35, m.dist, r) * smooth(0, 350, dOut);
    if (ramp <= 0) return 0;
    const s = this.wave;
    const range = this.noise.ridged(x / s, z / s, 5);
    const massif = this.noise.fbm(x / (s * 3) + 40, z / (s * 3) - 20, 2);
    const [h0, h1] = m.height;
    return ramp * (h0 * 0.3 + h1 * Math.pow(range, 1.7) * (0.35 + 1.1 * massif));
  }

  // { h, lift } at any point. Inside the grid it is the circuit's terrain, dropped out of
  // sight by more the further in it is; outside it is the grid's edge carried on by the
  // same hills, with more roll to it further out, then the mountains, and at circuits by
  // the sea it stays under the water wherever the grid's edge was under it.
  sample(x, z) {
    const R = this.rect, w = this.w;
    const qx = clamp(x, R.minX, R.maxX), qz = clamp(z, R.minZ, R.maxZ);
    const dOut = Math.hypot(x - qx, z - qz);
    if (dOut === 0) {
      const dIn = Math.min(x - R.minX, R.maxX - x, z - R.minZ, R.maxZ - z);
      return { h: w.terrainHeight(x, z) - Math.min(14, 0.3 * dIn), lift: 0 };
    }
    const edge = w.terrainHeight(qx, qz);
    let h = edge + (w.hillsAt(x, z) - w.hillsAt(qx, qz));
    h += (this.noise.fbm(x / 650, z / 650, 3) - 0.5) * 2.4 * this.amp * smooth(0, 600, dOut);
    let lift = this.lift(x, z, dOut);
    if (this.water) {
      // How much of the grid's edge round here is under water, rather than whether this
      // one point of it is: taken point by point the coast came out as sheer walls
      // wherever the edge went from sea to land between two neighbouring vertices.
      let wet = 0;
      for (let a = -2; a <= 2; a++) {
        for (let b = -2; b <= 2; b++) {
          const hx = clamp(qx + a * 110, R.minX, R.maxX), hz = clamp(qz + b * 110, R.minZ, R.maxZ);
          if (w.terrainHeight(hx, hz) < this.water.level) wet++;
        }
      }
      const sea = smooth(0.25, 0.75, wet / 25);
      if (sea > 0) {
        lift *= 1 - sea;
        const floor = this.water.level - 4 - Math.min(30, dOut * 0.02);
        h = h + (Math.min(h, floor) - h) * sea;
      }
    }
    return { h: h + lift, lift };
  }

  height(x, z) { return this.sample(x, z).h; }

  mesh(material) {
    const R = this.rect;
    const rIn = Math.min(R.maxX - R.minX, R.maxZ - R.minZ) / 2 * 0.97;
    const rOut = 6400;
    const NA = 320, NR = 76;
    const count = NA * NR;
    const pos = new Float32Array(count * 3);
    const lifts = new Float32Array(count);
    for (let j = 0; j < NR; j++) {
      const r = rIn * Math.pow(rOut / rIn, j / (NR - 1));
      for (let i = 0; i < NA; i++) {
        const a = (i / NA) * Math.PI * 2;
        const x = this.cx + Math.sin(a) * r, z = this.cz + Math.cos(a) * r;
        const s = this.sample(x, z);
        const k = j * NA + i;
        pos[k * 3] = x; pos[k * 3 + 1] = s.h; pos[k * 3 + 2] = z;
        lifts[k] = s.lift;
      }
    }
    const index = new Uint32Array((NR - 1) * NA * 6);
    let o = 0;
    for (let j = 0; j < NR - 1; j++) {
      for (let i = 0; i < NA; i++) {
        const i2 = (i + 1) % NA;
        const a = j * NA + i, b = j * NA + i2, c = (j + 1) * NA + i, d = (j + 1) * NA + i2;
        index[o++] = a; index[o++] = c; index[o++] = b;
        index[o++] = b; index[o++] = c; index[o++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeVertexNormals();
    const nrm = g.attributes.normal.array;
    const col = new Float32Array(count * 3), mix = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      this.ground.shade(pos[k * 3], pos[k * 3 + 2], nrm[k * 3 + 1], 0, lifts[k], Infinity, col, k * 3, mix, k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('groundMix', new THREE.BufferAttribute(mix, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = false;
    return mesh;
  }
}

// --- distance to the track ---------------------------------------------------

// Approximate distance from any point of the terrain grid to the nearest centreline
// sample, on a coarse grid: exact in the cells the track passes through, then spread out
// by a two-pass chamfer sweep. Good for deciding where the woods go; nearestSample()
// stays the authority up close.
export function trackDistance(world, cell = 16) {
  const p = world.path, T = world.terrain;
  const minX = T.minX, minZ = T.minZ;
  const nx = Math.ceil(((T.nx - 1) * T.cell) / cell) + 1;
  const nz = Math.ceil(((T.nz - 1) * T.cell) / cell) + 1;
  const d = new Float32Array(nx * nz).fill(1e9);
  for (let i = 0; i < p.n; i++) {
    const cx = Math.round((p.x[i] - minX) / cell), cz = Math.round((p.z[i] - minZ) / cell);
    for (let b = -1; b <= 1; b++) {
      for (let a = -1; a <= 1; a++) {
        const gx = cx + a, gz = cz + b;
        if (gx < 0 || gz < 0 || gx >= nx || gz >= nz) continue;
        const dist = Math.hypot(minX + gx * cell - p.x[i], minZ + gz * cell - p.z[i]);
        const k = gz * nx + gx;
        if (dist < d[k]) d[k] = dist;
      }
    }
  }
  const diag = cell * Math.SQRT2;
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const k = z * nx + x;
      let v = d[k];
      if (x > 0) v = Math.min(v, d[k - 1] + cell);
      if (z > 0) {
        v = Math.min(v, d[k - nx] + cell);
        if (x > 0) v = Math.min(v, d[k - nx - 1] + diag);
        if (x < nx - 1) v = Math.min(v, d[k - nx + 1] + diag);
      }
      d[k] = v;
    }
  }
  for (let z = nz - 1; z >= 0; z--) {
    for (let x = nx - 1; x >= 0; x--) {
      const k = z * nx + x;
      let v = d[k];
      if (x < nx - 1) v = Math.min(v, d[k + 1] + cell);
      if (z < nz - 1) {
        v = Math.min(v, d[k + nx] + cell);
        if (x < nx - 1) v = Math.min(v, d[k + nx + 1] + diag);
        if (x > 0) v = Math.min(v, d[k + nx - 1] + diag);
      }
      d[k] = v;
    }
  }
  return (x, z) => {
    const gx = clamp(Math.round((x - minX) / cell), 0, nx - 1);
    const gz = clamp(Math.round((z - minZ) / cell), 0, nz - 1);
    return d[gz * nx + gx];
  };
}

// --- woods, bushes and stones ------------------------------------------------

// Low-poly models for the mass planting, each one mesh with its colours in the vertices,
// so a whole wood of one kind is one draw call. The trackside trees keep their rounder,
// heavier models; these stand further back and there are thousands of them.
//
// The trackside trees carry their colour twice, once as the material's and once as the
// instance's, and the circuits were tuned with that deeper green; these square theirs to
// match, or a wood behind a row of trees looks like a different season.
function part(geo, color, x, y, z, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  return { g, color: c.multiply(c) };
}

function merged(parts) {
  let n = 0;
  for (const pt of parts) n += pt.g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const pt of parts) {
    const a = pt.g.attributes.position;
    pos.set(a.array, o * 3);
    for (let i = 0; i < a.count; i++) {
      col[(o + i) * 3] = pt.color.r; col[(o + i) * 3 + 1] = pt.color.g; col[(o + i) * 3 + 2] = pt.color.b;
    }
    o += a.count;
    pt.g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const CANOPY = { pine: '#2f6136', round: '#417a33', cherry: '#f0b4c8', palm: '#3e8a45', eucalyptus: '#6f8b53' };

function treeModel(type, tint) {
  const leaf = tint || CANOPY[type] || CANOPY.round;
  const trunk = (r0, r1, h, color = '#5a4632') => part(new THREE.CylinderGeometry(r0, r1, h, 5, 1, true), color, 0, h / 2 - 0.3, 0);
  switch (type) {
    case 'pine':
      return merged([
        trunk(0.22, 0.32, 2.4),
        part(new THREE.ConeGeometry(2.1, 4.6, 7, 1, true), leaf, 0, 4.1, 0),
        part(new THREE.ConeGeometry(1.5, 3.4, 7, 1, true), new THREE.Color(leaf).multiplyScalar(1.12), 0, 6.3, 0),
      ]);
    case 'palm': {
      const parts = [trunk(0.16, 0.28, 7.2, '#8a7354')];
      for (let i = 0; i < 6; i++) {
        const f = new THREE.ConeGeometry(0.5, 3.6, 3, 1, true).toNonIndexed();
        f.rotateZ(Math.PI / 2.1);
        f.translate(1.7, 0, 0);
        f.rotateY((i / 6) * Math.PI * 2);
        parts.push(part(f, leaf, 0, 6.9, 0));
      }
      return merged(parts);
    }
    case 'eucalyptus':
      return merged([
        trunk(0.2, 0.3, 5.4, '#cfc7b4'),
        part(new THREE.IcosahedronGeometry(2.0, 0), leaf, 0.5, 6.2, 0),
        part(new THREE.IcosahedronGeometry(1.5, 0), new THREE.Color(leaf).multiplyScalar(0.9), -1.4, 5.3, 0.5),
      ]);
    default: // round and cherry
      return merged([
        trunk(0.24, 0.36, 3, type === 'cherry' ? '#6a5142' : '#6b5238'),
        part(new THREE.IcosahedronGeometry(2.6, 0), leaf, 0, 4.7, 0, 1, 0.85, 1),
        part(new THREE.IcosahedronGeometry(1.7, 0), new THREE.Color(leaf).multiplyScalar(1.1), 0.9, 5.8, 0.5),
      ]);
  }
}

// The same trees for a kilometre away: canopy only, a handful of faces, and bigger, since
// out there one stands for a clump.
function farTreeModel(type, tint) {
  const leaf = tint || CANOPY[type] || CANOPY.round;
  if (type === 'pine' || type === 'palm') return merged([part(new THREE.ConeGeometry(2.2, 7.5, 5, 1, true), leaf, 0, 3.6, 0)]);
  return merged([part(new THREE.IcosahedronGeometry(2.8, 0), leaf, 0, 3.4, 0, 1, 0.9, 1)]);
}

function bushModel(color) {
  return merged([
    part(new THREE.IcosahedronGeometry(1, 0), color, 0, 0.35, 0, 1.3, 0.8, 1.3),
    part(new THREE.IcosahedronGeometry(0.75, 0), new THREE.Color(color).multiplyScalar(1.12), 0.8, 0.3, 0.35, 1.1, 0.8, 1.1),
  ]);
}

function rockModel(color) {
  return merged([
    part(new THREE.DodecahedronGeometry(1, 0), color, 0, 0.15, 0, 1.3, 0.62, 1),
    part(new THREE.DodecahedronGeometry(0.55, 0), new THREE.Color(color).multiplyScalar(0.9), 1.1, 0.05, 0.4, 1, 0.7, 1.1),
  ]);
}

// Instances bucketed into square chunks, so each bucket gets a bounding sphere and the
// ones behind the camera are not drawn at all.
class Scatter {
  constructor(chunk = 520) {
    this.chunk = chunk;
    this.buckets = new Map();
    this.count = 0;
  }

  add(kind, x, y, z, s, sy, rot, tint) {
    const key = `${kind}:${Math.floor(x / this.chunk)}:${Math.floor(z / this.chunk)}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { kind, list: [] }));
    b.list.push(x, y, z, s, sy, rot, tint.r, tint.g, tint.b);
    this.count++;
  }

  build(world, models, material) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    for (const b of this.buckets.values()) {
      const L = b.list, n = L.length / 9;
      const inst = new THREE.InstancedMesh(models[b.kind], material, n);
      for (let i = 0; i < n; i++) {
        const o = i * 9;
        pos.set(L[o], L[o + 1], L[o + 2]);
        q.setFromAxisAngle(up, L[o + 5]);
        sc.set(L[o + 3], L[o + 3] * L[o + 4], L[o + 3]);
        inst.setMatrixAt(i, m.compose(pos, q, sc));
        inst.setColorAt(i, col.setRGB(L[o + 6], L[o + 7], L[o + 8]));
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      world.track(inst, false, false);
    }
  }
}

// Woods, then the bushes and stones by the fence. `blocked(x, z, pad)` says where
// something already stands (buildings, the Ferris wheel); `paved(near)` how paved the
// ground is by the nearest centreline sample.
export function plantLandscape(world, ground, blocked, paved) {
  const t = world.theme, p = world.path;
  const rnd = TEX.mulberry(0x7e1e5 ^ world.def.id.length * 131);
  const T = world.terrain;
  const water = t.water ? t.water.level + 0.6 : -Infinity;
  const slopeAt = (x, z) => {
    const e = 3;
    const dx = world.terrainHeight(x + e, z) - world.terrainHeight(x - e, z);
    const dz = world.terrainHeight(x, z + e) - world.terrainHeight(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  };
  const variation = (base, amount) => {
    const v = 1 - amount / 2 + rnd() * amount;
    return new THREE.Color(v * (0.96 + rnd() * 0.08), v, v * (0.94 + rnd() * 0.1)).multiply(base);
  };
  const white = new THREE.Color(1, 1, 1);
  const share = world.lite ? 0.45 : 1;

  // The woods. Planted out to a band around the circuit; beyond it the ground is painted
  // darker in the same pattern (Ground.forestAt), which is all a wood is from a kilometre.
  const fcfg = t.forest;
  if (fcfg && fcfg.density > 0) {
    const kinds = fcfg.trees || t.trees || [{ type: 'round', weight: 1 }];
    const totalW = kinds.reduce((a, k) => a + k.weight, 0);
    const models = kinds.map((k) => treeModel(k.type, k.tint));
    const dist = trackDistance(world);
    const band = fcfg.band || 460;
    const x1 = T.minX + (T.nx - 1) * T.cell, z1 = T.minZ + (T.nz - 1) * T.cell;
    // the spacing that keeps the whole wood to a budget of instances
    let bandArea = 0;
    for (let z = T.minZ; z < z1; z += 16) for (let x = T.minX; x < x1; x += 16) if (dist(x, z) < band) bandArea += 256;
    const step = Math.max(11, Math.sqrt((bandArea * fcfg.density * 0.6) / ((fcfg.budget || 11000) * share)));
    const trees = new Scatter();
    for (let z = T.minZ; z < z1; z += step) {
      for (let x = T.minX; x < x1; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.95, pz = z + (rnd() - 0.5) * step * 0.95;
        const d = dist(px, pz);
        if (d > band) continue;
        const f = ground.forestAt(px, pz) * smooth(band, band - 90, d);
        if (f <= 0.02 || rnd() > f) continue;
        if (d < 90) {
          const near = world.nearestSample(px, pz, 90);
          if (near && near.d < Math.max(p.wallL[near.i], p.wallR[near.i]) + 26 + rnd() * 18) continue;
        }
        const y = world.terrainHeight(px, pz);
        if (y < water || slopeAt(px, pz) > 0.75 || blocked(px, pz, 4)) continue;
        let r = rnd() * totalW, pick = 0;
        for (let k = 0; k < kinds.length; k++) { r -= kinds[k].weight; if (r <= 0) { pick = k; break; } }
        // older in the middle of a wood, younger at its edge
        const s = (0.85 + rnd() * 0.5) * (0.85 + 0.7 * f);
        trees.add(pick, px, y - 0.2, pz, s, 0.85 + rnd() * 0.35, rnd() * Math.PI * 2, variation(white, 0.34));
      }
    }
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    trees.build(world, models, treeMat);

    // Beyond the band, out to a kilometre or so past the terrain grid, the woods go on as
    // canopies alone: enough for the hills on the horizon to carry a treeline. Not above
    // the tree line on the mountains, not on bare rock, not in the sea.
    const far = new Scatter(900);
    const farModels = kinds.map((k) => farTreeModel(k.type, k.tint));
    const R = world.far.rect, cx = world.far.cx, cz = world.far.cz;
    const reach = Math.max(R.maxX - R.minX, R.maxZ - R.minZ) / 2 + 1000;
    const farArea = 4 * reach * reach - bandArea;
    const farStep = Math.max(22, Math.sqrt((farArea * fcfg.density * 0.5) / ((fcfg.farBudget || 7000) * share)));
    const treeLine = ground.peak * 0.3;
    for (let z = cz - reach; z < cz + reach; z += farStep) {
      for (let x = cx - reach; x < cx + reach; x += farStep) {
        const px = x + (rnd() - 0.5) * farStep, pz = z + (rnd() - 0.5) * farStep;
        const inside = px > R.minX && px < R.maxX && pz > R.minZ && pz < R.maxZ;
        if (inside && dist(px, pz) < band) continue;
        const f = ground.forestAt(px, pz);
        if (f <= 0.05 || rnd() > f) continue;
        const here = inside ? { h: world.terrainHeight(px, pz), lift: 0 } : world.far.sample(px, pz);
        if (here.lift > treeLine || here.h < water) continue;
        const dx = world.groundHeight(px + 8, pz) - here.h, dz = world.groundHeight(px, pz + 8) - here.h;
        if (Math.hypot(dx, dz) / 8 > 0.7 || blocked(px, pz, 6)) continue;
        let r = rnd() * totalW, pick = 0;
        for (let k = 0; k < kinds.length; k++) { r -= kinds[k].weight; if (r <= 0) { pick = k; break; } }
        far.add(pick, px, here.h - 0.5, pz, 1.3 + rnd() * 0.8, 0.8 + rnd() * 0.4, rnd() * Math.PI * 2, variation(white, 0.3));
      }
    }
    far.build(world, farModels, treeMat);
    world.forestCount = trees.count + far.count;
  }

  // Bushes and stones, thickest just beyond the barrier and thinning out away from it.
  const brush = t.brush || {};
  if (brush.bushes || brush.rocks) {
    const soil = new THREE.Color(t.groundTint);
    const bushColor = soil.clone().multiplyScalar(0.62).lerp(new THREE.Color('#355e2c'), 0.45);
    const rockColor = new THREE.Color(t.rock || (t.ground === 'dry' ? '#a08a70' : '#9a968e'));
    const models = [bushModel(bushColor), rockModel(rockColor)];
    const sc = new Scatter();
    const step = Math.max(1, Math.round(5 / p.spacing));
    for (let i = 0; i < p.n; i += step) {
      if (p.flags.tunnel[i] || p.flags.bridge[i]) continue;
      for (const side of [1, -1]) {
        for (const [kind, rate] of [[0, brush.bushes || 0], [1, brush.rocks || 0]]) {
          if (rnd() > rate * share) continue;
          const wall = side > 0 ? p.wallL[i] : p.wallR[i];
          const u = side * (wall + 2 + Math.pow(rnd(), 1.8) * 70);
          const x = p.x[i] + p.lx[i] * u + (rnd() - 0.5) * 5;
          const z = p.z[i] + p.lz[i] * u + (rnd() - 0.5) * 5;
          const near = world.nearestSample(x, z, 40);
          if (near && near.d < Math.max(p.wallL[near.i], p.wallR[near.i]) + 2) continue;
          const y = world.terrainHeight(x, z);
          if (y < water || blocked(x, z, 1.5)) continue;
          if (paved(near) > 0.4) continue;
          const s = kind === 0 ? 0.6 + rnd() * 0.9 : 0.35 + Math.pow(rnd(), 2) * 1.4;
          sc.add(kind, x, y - (kind === 1 ? 0.15 * s : 0.05), z, s, kind === 0 ? 0.8 + rnd() * 0.5 : 0.7 + rnd() * 0.6,
            rnd() * Math.PI * 2, variation(white, 0.3));
        }
      }
    }
    sc.build(world, models, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  }
}
