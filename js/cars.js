// The ZEEKR line-up: specs used by the physics, and the car models.
//
// Each body is a lofted hull. Every model carries a table of cross-section stations
// along its length:
//
//     [ z, top, belt, hwR, tumble ]
//       z       position along the car (+Z is forward, origin mid-wheelbase, on the ground)
//       top     height of the upper surface there (bonnet / screen / roof / tailgate)
//       belt    window line - the top of the painted lower body
//       hwR     half-width at that station, as a fraction of the car's half width
//       tumble  how much narrower the roof is than the body (tumblehome)
//
// Stations are interpolated with a monotone spline, each one is turned into a rounded
// cross-section, and consecutive sections are stitched into a surface. Faces are then
// handed to paint / glass / black trim materials depending on where they sit, which is
// what gives each car its windscreen, side glass and blacked-out pillars.
//
// Performance figures are game-tuned for racing, not manufacturer data.
import * as THREE from 'three';

export const PAINTS = [
  { name: 'Mist Grey', hex: '#9aa2a8', matte: true },
  { name: 'Glacier White', hex: '#eef1f4' },
  { name: 'Obsidian', hex: '#212428' },
  { name: 'Electric Blue', hex: '#2f6ad0' },
  { name: 'Aurora Green', hex: '#2fae74' },
  { name: 'Solar Orange', hex: '#ef7420' },
  { name: 'Crimson', hex: '#c1232d' },
  { name: 'Dune', hex: '#c9b795' },
];

export const CARS = [
  {
    id: 'x',
    name: 'ZEEKR X',
    type: 'Compact crossover',
    tagline: 'Short, light and eager to change direction.',
    dims: { L: 4.43, W: 1.84, H: 1.57, wb: 2.75, wheelR: 0.37, tyre: 0.27 },
    mass: 1900, power: 315000, accel: 3.8, vTop: 53, grip: 1.02, brake: 1.04, agility: 1.12,
    ride: 0.24, hoodY: 1.11,
    cab: { ws: 0.95, rf: 0.05, rb: -1.35, rg: -1.80 },
    hull: [
      [2.20, 0.86, 0.80, 0.74, 0.99],
      [2.10, 0.90, 0.84, 0.88, 0.98],
      [1.90, 0.97, 0.91, 0.97, 0.97],
      [1.50, 1.07, 1.01, 0.98, 0.95],
      [1.09, 1.14, 1.08, 0.98, 0.92],
      [0.89, 1.20, 1.06, 0.97, 0.89],
      [0.49, 1.42, 1.04, 1.00, 0.80],
      [0.09, 1.53, 1.05, 0.96, 0.75],
      [-0.72, 1.55, 1.07, 0.97, 0.72],
      [-1.32, 1.52, 1.20, 0.97, 0.70],
      [-1.73, 1.44, 1.32, 0.98, 0.74],
      [-1.98, 1.42, 1.36, 0.94, 0.85],
      [-2.20, 1.20, 1.14, 0.76, 0.96],
    ],
    style: { cladding: true, twoTone: true, front: 'split', flare: 0.03 },
    model: 'assets/cars/zeekr_x.glb',
    paint: 0,
  },
  {
    id: '007',
    name: 'ZEEKR 007',
    type: 'Fastback sedan',
    tagline: 'Low, slippery and quick off the line.',
    dims: { L: 4.87, W: 1.90, H: 1.45, wb: 2.93, wheelR: 0.37, tyre: 0.28 },
    mass: 2150, power: 475000, accel: 2.9, vTop: 58, grip: 1.10, brake: 1.08, agility: 1.04,
    ride: 0.16, hoodY: 0.99,
    cab: { ws: 1.10, rf: -0.20, rb: -1.20, rg: -2.02 },
    hull: [
      [2.36, 0.73, 0.67, 0.78, 0.99],
      [2.10, 0.84, 0.78, 0.96, 0.98],
      [1.70, 0.91, 0.85, 0.99, 0.97],
      [1.40, 0.95, 0.90, 1.00, 0.97],
      [1.10, 0.99, 0.94, 1.00, 0.96],
      [0.45, 1.32, 0.97, 1.00, 0.84],
      [-0.20, 1.45, 0.99, 1.00, 0.79],
      [-1.20, 1.42, 1.01, 1.00, 0.78],
      [-2.00, 1.18, 1.03, 0.98, 0.90],
      [-2.30, 1.04, 0.98, 0.94, 0.95],
      [-2.51, 0.94, 0.87, 0.78, 0.98],
    ],
    style: { front: 'stargate', ducktail: true },
    paint: 1,
  },
  {
    id: '001',
    name: 'ZEEKR 001',
    type: 'Shooting brake',
    tagline: 'Long wheelbase, long roof, huge straight-line punch.',
    dims: { L: 4.97, W: 2.00, H: 1.55, wb: 3.00, wheelR: 0.38, tyre: 0.29 },
    mass: 2320, power: 580000, accel: 3.2, vTop: 66, grip: 1.08, brake: 1.05, agility: 0.98,
    ride: 0.17, hoodY: 1.02,
    cab: { ws: 1.15, rf: -0.15, rb: -1.35, rg: -1.98 },
    hull: [
      [2.41, 0.77, 0.71, 0.78, 0.99],
      [2.15, 0.88, 0.82, 0.96, 0.98],
      [1.75, 0.95, 0.89, 0.99, 0.97],
      [1.45, 0.98, 0.92, 1.00, 0.97],
      [1.15, 1.02, 0.96, 1.00, 0.96],
      [0.50, 1.36, 0.99, 1.00, 0.84],
      [-0.15, 1.545, 1.01, 1.00, 0.79],
      [-1.35, 1.54, 1.04, 1.00, 0.78],
      [-1.95, 1.49, 1.10, 0.99, 0.80],
      [-2.30, 1.34, 1.28, 0.95, 0.90],
      [-2.56, 1.18, 1.12, 0.80, 0.97],
    ],
    style: { front: 'stargate', chrome: true },
    paint: 2,
  },
  {
    id: '001fr',
    name: 'ZEEKR 001 FR',
    type: 'Four-motor flagship',
    tagline: 'The fast one: four motors, lowered, wide arches.',
    dims: { L: 4.97, W: 2.04, H: 1.50, wb: 3.00, wheelR: 0.39, tyre: 0.33 },
    mass: 2400, power: 930000, accel: 2.1, vTop: 78, grip: 1.22, brake: 1.18, agility: 1.06,
    ride: 0.13, hoodY: 0.98,
    cab: { ws: 1.15, rf: -0.15, rb: -1.35, rg: -1.98 },
    hull: [
      [2.41, 0.73, 0.67, 0.80, 0.99],
      [2.15, 0.84, 0.78, 0.97, 0.98],
      [1.75, 0.92, 0.86, 1.00, 0.97],
      [1.45, 0.96, 0.92, 1.00, 0.97],
      [1.15, 0.99, 0.94, 1.00, 0.96],
      [0.50, 1.32, 0.97, 1.00, 0.84],
      [-0.15, 1.50, 0.99, 1.00, 0.79],
      [-1.35, 1.49, 1.01, 1.00, 0.78],
      [-1.95, 1.39, 1.03, 0.99, 0.87],
      [-2.30, 1.18, 1.03, 0.95, 0.93],
      [-2.56, 1.02, 0.94, 0.80, 0.97],
    ],
    style: { front: 'stargate', wing: true, splitter: true, flare: 0.06, darkGlass: true },
    paint: 4,
  },
  {
    id: '7x',
    name: 'ZEEKR 7X',
    type: 'Mid-size SUV',
    tagline: 'Heavier, but it hides the weight well.',
    dims: { L: 4.83, W: 1.93, H: 1.66, wb: 2.93, wheelR: 0.37, tyre: 0.29 },
    mass: 2400, power: 475000, accel: 3.2, vTop: 58, grip: 1.00, brake: 1.00, agility: 0.98,
    ride: 0.25, hoodY: 1.14,
    cab: { ws: 1.05, rf: 0.05, rb: -1.90, rg: -2.16 },
    hull: [
      [2.33, 0.90, 0.84, 0.76, 0.99],
      [2.20, 0.93, 0.87, 0.89, 0.98],
      [1.98, 1.01, 0.95, 0.96, 0.97],
      [1.54, 1.10, 1.04, 0.97, 0.96],
      [1.11, 1.15, 1.09, 0.97, 0.93],
      [0.89, 1.22, 1.10, 0.97, 0.89],
      [0.46, 1.55, 1.10, 1.00, 0.82],
      [0.02, 1.62, 1.11, 0.96, 0.76],
      [-0.85, 1.65, 1.11, 0.96, 0.72],
      [-1.50, 1.62, 1.14, 0.96, 0.72],
      [-1.94, 1.55, 1.30, 0.94, 0.78],
      [-2.20, 1.36, 1.30, 0.87, 0.90],
      [-2.48, 1.22, 1.16, 0.76, 0.97],
    ],
    style: { cladding: true, twoTone: true, front: 'split', rails: true },
    model: 'assets/cars/zeekr_7x.glb',
    paint: 3,
  },
  {
    id: '009',
    name: 'ZEEKR 009',
    type: 'Luxury MPV',
    tagline: 'Six seats, nearly three tonnes and a wall of light at the front.',
    dims: { L: 5.21, W: 2.02, H: 1.85, wb: 3.21, wheelR: 0.38, tyre: 0.28 },
    mass: 2820, power: 400000, accel: 4.4, vTop: 53, grip: 0.92, brake: 0.94, agility: 0.88,
    ride: 0.20, hoodY: 1.44,
    cab: { ws: 1.80, rf: 0.85, rb: -1.95, rg: -2.38 },
    hull: [
      [2.52, 1.14, 1.08, 0.82, 0.99],
      [2.32, 1.30, 1.22, 0.97, 0.98],
      [2.05, 1.38, 1.30, 1.00, 0.98],
      [1.80, 1.44, 1.34, 1.00, 0.97],
      [1.30, 1.70, 1.36, 1.00, 0.95],
      [0.85, 1.845, 1.37, 1.00, 0.93],
      [-1.95, 1.84, 1.40, 1.00, 0.88],
      [-2.38, 1.78, 1.44, 0.99, 0.90],
      [-2.58, 1.66, 1.58, 0.97, 0.94],
      [-2.69, 1.46, 1.38, 0.84, 0.98],
    ],
    style: { front: 'waterfall', chrome: true, rails: true, slider: true },
    paint: 5,
  },
];

// --- maths -------------------------------------------------------------------

// Monotone cubic interpolation (Fritsch-Carlson): smooth, and it never overshoots,
// so a station table cannot produce bulges the shape was not asked for.
function monotone(xs, ys) {
  const n = xs.length;
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; dy[i] = (ys[i + 1] - ys[i]) / dx[i]; }
  m[0] = dy[0]; m[n - 1] = dy[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (dy[i - 1] * dy[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / dy[i - 1] + w2 / dy[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = dx[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return ys[i] * (2 * t3 - 3 * t2 + 1) + m[i] * h * (t3 - 2 * t2 + t)
      + ys[i + 1] * (-2 * t3 + 3 * t2) + m[i + 1] * h * (t3 - t2);
  };
}

// --- hull --------------------------------------------------------------------
const HALF = 11;          // points per half cross-section
const RING = HALF * 2 - 2;

// One cross-section, right half only, from the underbody centre up to the roof centre.
// Where there is a glasshouse the upper points follow the window line; over the bonnet
// and boot they instead form raised fender tops with a shallow crown between them,
// which is what stops the top of the car reading as one flat plane.
function halfSection(hw, sill, belt, top, tumble, floorY, dome, arch = 0) {
  // An arch opening lifts the sill a long way up the side of the car, and over the
  // bonnet the window line is only a few centimetres above it. Keep a minimum depth of
  // bodywork between the two: where the arch would otherwise reach the window line it
  // pushes it up instead, which is what gives the fender its crown over each wheel.
  belt = Math.max(belt, sill + 0.09);
  top = Math.max(top, belt + 0.02);
  const tw = hw * tumble;
  // `arch` is 0 along the rockers and 1 over an axle: the sill tucks in between the
  // wheels but stays full width around the openings, so the tyres sit inside the lip
  // instead of standing proud of the bodywork.
  // The lower body is spaced as fractions of the sill -> belt span so the points stay
  // in order however far the arch has lifted the sill.
  const span = belt - sill;
  const lower = [
    [0, floorY],
    [hw * 0.55, floorY + 0.015],
    [hw * (0.86 + 0.13 * arch), sill],
    [hw * (0.98 + 0.02 * arch), sill + span * 0.35],
    [hw, sill + span * 0.60],
    [hw * 0.99, sill + span * 0.88],
  ];
  const cabin = [
    [hw * 0.95, belt + Math.min(0.05, (top - belt) * 0.3)],
    [tw * 0.995, belt + (top - belt) * 0.45],
    [tw * 0.93, top - (top - belt) * 0.14],
    [tw * 0.6, top - (top - belt) * 0.012],
    [0, top + dome],
  ];
  const fender = 0.045;
  const deck = [
    [hw * 0.97, top + fender * 0.55],
    [hw * 0.9, top + fender],
    [hw * 0.72, top + fender * 0.3],
    [hw * 0.42, top + dome * 0.6],
    [0, top + dome * 0.8],
  ];
  // blend between the two so the cowl and the boot shut-line stay smooth
  const t = Math.min(1, Math.max(0, (top - belt - 0.1) / 0.14));
  const e = t * t * (3 - 2 * t);
  const upper = cabin.map(([x, y], i) => [
    deck[i][0] + (x - deck[i][0]) * e,
    deck[i][1] + (y - deck[i][1]) * e,
  ]);
  return lower.concat(upper);
}

// Wheel arches: the sill lifts over each axle so the wheels sit in an opening.
//
// A wheel sits on the ground, so the top of its tyre is a full diameter up - the opening
// has to reach `2 * wheelR` plus some suspension travel, not one radius. Anything lower
// and the bodywork simply closes over the tyre.
const ARCH_GAP = 0.06;                    // clearance between tyre and arch lip
function archGeom(spec) {
  const { wheelR } = spec.dims;
  return { archR: wheelR + 0.17, apex: 2 * wheelR + ARCH_GAP };
}

function sillLine(spec) {
  const { wb } = spec.dims;
  const { archR, apex } = archGeom(spec);
  return (z) => {
    let y = spec.ride;
    for (const axle of [wb / 2, -wb / 2]) {
      const d = Math.abs(z - axle);
      if (d < archR) {
        y = Math.max(y, spec.ride + (apex - spec.ride) * Math.pow(1 - (d / archR) ** 2, 0.55));
      }
    }
    return y;
  };
}

const PAINT = 0, GLASS = 1, TRIM = 2, ROOF = 3;

function faceMaterial(h, z, y, spec) {
  const c = spec.cab;
  if (h <= 2) return TRIM;                                   // floor and arch undersides
  // black sill / bumper band, level along the length of the car
  if (y < spec.ride + (spec.style.cladding ? 0.22 : 0.1)) return TRIM;
  const sideGlass = z < c.ws && z > c.rg;
  const screen = (z <= c.ws && z >= c.rf) || (z <= c.rb && z >= c.rg);
  if (h >= 6 && h <= 8) return sideGlass ? GLASS : PAINT;
  if (h === 9) {
    if (screen) return GLASS;
    if (z < c.rf && z > c.rb) return spec.style.twoTone ? ROOF : PAINT;
  }
  return PAINT;
}

// Interpolated profile of a body, cached on the spec. Details (lights, mirrors,
// handles) are placed against this so they always sit on the surface.
export function hullProfile(spec) {
  if (spec._prof) return spec._prof;
  const halfW = spec.dims.W / 2;
  const table = [...spec.hull].sort((a, b) => a[0] - b[0]);
  const zs = table.map((r) => r[0]);
  const fTop = monotone(zs, table.map((r) => r[1]));
  const fBelt = monotone(zs, table.map((r) => r[2]));
  const fHwR = monotone(zs, table.map((r) => r[3]));
  const fTum = monotone(zs, table.map((r) => r[4]));
  const flare = spec.style.flare || 0;
  const wb = spec.dims.wb;
  const fHw = (z) => {
    let extra = 0;
    if (flare) {
      for (const axle of [wb / 2, -wb / 2]) {
        const d = Math.abs(z - axle);
        if (d < 0.85) extra = Math.max(extra, flare * (1 - (d / 0.85) ** 2));
      }
    }
    return halfW * fHwR(z) + extra;
  };
  spec._prof = {
    top: fTop, belt: fBelt, hw: fHw, tumble: fTum, sill: sillLine(spec),
    zR: zs[0], zF: zs[zs.length - 1],
  };
  return spec._prof;
}

function buildHull(spec) {
  const { top: fTop, belt: fBelt, hw: fHw, tumble: fTum, sill, zR, zF } = hullProfile(spec);

  const steps = Math.max(56, Math.round((zF - zR) / 0.055));
  const stations = [];
  const lift = archGeom(spec).apex - spec.ride;    // how far the sill rises over an axle
  for (let i = 0; i <= steps; i++) {
    const z = zR + ((zF - zR) * i) / steps;
    const sillY = sill(z);
    const arch = Math.min(1, Math.max(0, (sillY - spec.ride) / (lift * 0.55)));
    stations.push({
      z,
      pts: halfSection(fHw(z), sillY, fBelt(z), fTop(z), fTum(z), spec.ride - 0.04, 0.035, arch),
    });
  }

  const positions = [];
  const ringOf = (st) => {
    const ring = [];
    for (const [x, y] of st.pts) ring.push([x, y]);
    for (let j = HALF - 2; j >= 1; j--) ring.push([-st.pts[j][0], st.pts[j][1]]);
    return ring;
  };
  const rings = stations.map(ringOf);
  for (let i = 0; i < rings.length; i++) {
    for (const [x, y] of rings[i]) positions.push(x, y, stations[i].z);
  }

  const groups = [[], [], [], []];
  const idx = (i, j) => i * RING + (j % RING);
  for (let i = 0; i < rings.length - 1; i++) {
    const z = (stations[i].z + stations[i + 1].z) / 2;
    for (let j = 0; j < RING; j++) {
      // Band between perimeter points j and j+1, mapped back onto the half section.
      // The mirrored half runs the other way, so it is RING-1-j there, not RING-j -
      // getting this wrong shifts every material band one step to one side.
      const h = j < HALF - 1 ? j : RING - 1 - j;
      const j2 = (j + 1) % RING;
      const y = (rings[i][j][1] + rings[i][j2][1] + rings[i + 1][j][1] + rings[i + 1][j2][1]) / 4;
      const g = faceMaterial(h, z, y, spec);
      const a = idx(i, j), b = idx(i, j + 1), c = idx(i + 1, j), d = idx(i + 1, j + 1);
      groups[g].push(a, b, c, c, b, d);
    }
  }

  // Wind a cap face so its normal points away from the car (+Z at the nose, -Z at the
  // tail) rather than trusting the direction the ring happens to run in.
  const capTri = (i0, i1, i2, wantZ) => {
    const px = (k) => positions[k * 3], py = (k) => positions[k * 3 + 1];
    const ux = px(i1) - px(i0), uy = py(i1) - py(i0);
    const vx = px(i2) - px(i0), vy = py(i2) - py(i0);
    return (ux * vy - uy * vx) * wantZ >= 0 ? [i0, i1, i2] : [i1, i0, i2];
  };

  // The bumper faces closing each end of the loft. Two things matter here. Each cap
  // carries its own copy of the end ring, so smoothing cannot average its forward-facing
  // normals into the sides of the car; and it is built from concentric rings rather than
  // one fan, so the dark lower fascia can be picked per face by height. Fanning the whole
  // perimeter to a single point gave every face a share of the bottom of the car and
  // spread the dark band into a bow tie right across the nose.
  const CAP_RINGS = [1, 0.74, 0.46, 0.2];
  const buildCap = (i, push, wantZ) => {
    const st = stations[i];
    let sy = 0;
    for (const [, y] of st.pts) sy += y;
    const cy = sy / st.pts.length;                 // the face bulges out around here
    const z = st.z;
    const yAt = (j, sc) => cy + (rings[i][j][1] - cy) * sc;
    const bases = CAP_RINGS.map((sc) => {
      const base = positions.length / 3;
      for (const [x, y] of rings[i]) positions.push(x * sc, cy + (y - cy) * sc, z + push * (1 - sc));
      return base;
    });
    positions.push(0, cy, z + push);
    const centre = positions.length / 3 - 1;
    const band = (y) => (y < spec.ride + 0.3 ? TRIM : PAINT);
    const inner = CAP_RINGS.length - 1;
    for (let j = 0; j < RING; j++) {
      const j2 = (j + 1) % RING;
      for (let r = 0; r < inner; r++) {
        const a = bases[r] + j, b = bases[r] + j2;
        const c = bases[r + 1] + j, d = bases[r + 1] + j2;
        const my = (yAt(j, CAP_RINGS[r]) + yAt(j2, CAP_RINGS[r])
          + yAt(j, CAP_RINGS[r + 1]) + yAt(j2, CAP_RINGS[r + 1])) / 4;
        groups[band(my)].push(...capTri(a, b, c, wantZ), ...capTri(b, d, c, wantZ));
      }
      const e = bases[inner] + j, f = bases[inner] + j2;
      groups[band((yAt(j, CAP_RINGS[inner]) + yAt(j2, CAP_RINGS[inner]) + cy) / 3)]
        .push(...capTri(e, f, centre, wantZ));
    }
  };
  buildCap(rings.length - 1, 0.035, 1);
  buildCap(0, -0.035, -1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const index = [];
  const ranges = [];
  for (let g = 0; g < groups.length; g++) {
    ranges.push([index.length, groups[g].length]);
    index.push(...groups[g]);
  }
  geo.setIndex(index);
  ranges.forEach(([start, count], g) => { if (count) geo.addGroup(start, count, g); });
  geo.computeVertexNormals();
  return geo;
}

// --- wheels ------------------------------------------------------------------
let rimTexture = null;
function getRimTexture() {
  if (rimTexture) return rimTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0e1114';
  ctx.fillRect(0, 0, 256, 256);
  ctx.save();
  ctx.translate(128, 128);
  // brake disc and caliper seen between the spokes
  ctx.fillStyle = '#4e545c';
  ctx.beginPath(); ctx.arc(0, 0, 88, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a4048'; ctx.lineWidth = 3;
  for (let r = 40; r < 86; r += 9) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#b4372c';
  ctx.beginPath(); ctx.arc(0, 0, 90, -0.5, 0.5); ctx.arc(0, 0, 62, 0.5, -0.5, true); ctx.fill();
  // rim lip
  ctx.strokeStyle = '#c2c8cf'; ctx.lineWidth = 20;
  ctx.beginPath(); ctx.arc(0, 0, 114, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 104, 0, Math.PI * 2); ctx.stroke();
  // spokes
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i / 5) * Math.PI * 2 + 0.3);
    const grad = ctx.createLinearGradient(0, -110, 0, -20);
    grad.addColorStop(0, '#aeb5bd');
    grad.addColorStop(1, '#7d848c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-14, -26);
    ctx.lineTo(14, -26);
    ctx.lineTo(23, -104);
    ctx.lineTo(-23, -104);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#9aa1a8';
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#23272c';
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  rimTexture = new THREE.CanvasTexture(c);
  rimTexture.colorSpace = THREE.SRGBColorSpace;
  return rimTexture;
}

// Tyre built as a lathe so it has a flat tread and rounded shoulders.
// LatheGeometry takes its profile running *up* the lathe axis: ordered the other way it
// winds every face backwards and points the normals at the axis, which culls the tread
// and leaves the tyre looking like a hole. So the profile starts at the inboard sidewall.
function tyreGeometry(R, width) {
  const w = width / 2;
  const bore = R * 0.7;
  const pts = [
    new THREE.Vector2(bore, -w),
    new THREE.Vector2(R * 0.9, -w),
    new THREE.Vector2(R * 0.985, -w * 0.86),
    new THREE.Vector2(R, -w * 0.62),
    new THREE.Vector2(R, w * 0.62),
    new THREE.Vector2(R * 0.985, w * 0.86),
    new THREE.Vector2(R * 0.9, w),
    new THREE.Vector2(bore, w),
  ];
  const geo = new THREE.LatheGeometry(pts, 26);
  geo.rotateZ(Math.PI / 2);          // spin axis along X
  return geo;
}

// `side` is +1 for the right of the car and -1 for the left, so the rim face always
// points outwards.
function buildWheel(R, width, side) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  const tyreMat = new THREE.MeshStandardMaterial({ color: '#16171b', roughness: 0.92 });
  const rimFace = new THREE.MeshStandardMaterial({ map: getRimTexture(), roughness: 0.38, metalness: 0.8 });
  const tyre = new THREE.Mesh(tyreGeometry(R, width), tyreMat);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.74, 26), rimFace);
  disc.rotation.y = (side > 0 ? 1 : -1) * Math.PI / 2;
  disc.position.x = side * width * 0.46;
  // wide enough to cap the tyre's bore (R * 0.7) - any narrower and there is a ring
  // gap to see straight through the wheel
  const inner = new THREE.Mesh(new THREE.CircleGeometry(R * 0.72, 20), new THREE.MeshStandardMaterial({ color: '#0b0d10', roughness: 1 }));
  inner.rotation.y = (side > 0 ? -1 : 1) * Math.PI / 2;
  inner.position.x = -side * width * 0.44;
  spin.add(tyre, disc, inner);
  g.add(spin);                       // outer group steers, inner group spins
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// --- light signature ---------------------------------------------------------

// ZEEKR's "Stargate": a full-width panel of individually lit LED pixels rather than a
// lamp with a lens. Drawn as a small repeating tile - the band is built from segments,
// so one tile per segment adds up to a matrix right across the nose.
let gateTexture = null;
function getGateTexture() {
  if (gateTexture) return gateTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#070a0e';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#ffffff';
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < 4; i++) ctx.fillRect(2 + i * 8, 2 + r * 8, 5, 5);
  }
  gateTexture = new THREE.CanvasTexture(c);
  gateTexture.colorSpace = THREE.SRGBColorSpace;
  return gateTexture;
}

// Half-width of the body at height `y` on station `z`. A band sits on the outside of the
// car, so it needs the width at its own height: near the top of a nose the body is a good
// deal narrower than it is at the shoulder, and a band sized off the widest point would
// bury its own ends in the paint.
function widthAt(spec, prof, z, y) {
  const sillY = prof.sill(z);
  const lift = archGeom(spec).apex - spec.ride;
  const arch = Math.min(1, Math.max(0, (sillY - spec.ride) / (lift * 0.55)));
  const pts = halfSection(prof.hw(z), sillY, prof.belt(z), prof.top(z), prof.tumble(z),
    spec.ride - 0.04, 0.035, arch);
  let w = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if ((y0 <= y && y1 >= y) || (y1 <= y && y0 >= y)) {
      const d = y1 - y0;
      w = Math.max(w, x0 + (x1 - x0) * (Math.abs(d) > 1e-6 ? (y - y0) / d : 0));
    }
  }
  return w;
}

// The nose and tail are curved in plan, so a light bar laid across one has to follow that
// curve. Walking the body width backwards from the tip gives, for any point across the
// face, the z at which the body is actually that wide - which is where the band sits.
// `dir` is +1 at the nose and -1 at the tail. The returned function carries `maxHw`, the
// widest the band can be at this height before it runs off the end of the car.
function faceCurve(spec, prof, zTip, dir, y) {
  const N = 26, reach = 0.6;
  const zs = [], hws = [];
  for (let i = 0; i <= N; i++) {
    const z = zTip - dir * (reach * i) / N;
    zs.push(z);
    hws.push(widthAt(spec, prof, z, y));
  }
  const curve = (x) => {
    const t = Math.abs(x);
    if (t <= hws[0]) return zs[0];
    for (let i = 1; i <= N; i++) {
      if (hws[i] >= t) {
        const span = hws[i] - hws[i - 1];
        return zs[i - 1] + (zs[i] - zs[i - 1]) * (span > 1e-6 ? (t - hws[i - 1]) / span : 1);
      }
    }
    return zs[N];
  };
  curve.maxHw = Math.max(...hws);
  return curve;
}

// Slope of a face curve at x, as a rotation about Y that lays a piece flat on it.
function faceTilt(curve, x) {
  return -Math.atan((curve(x + 0.02) - curve(x - 0.02)) / 0.04);
}

// A light bar or grille that follows `curve` across the face of the car. `h` is its
// height, `d` its depth and `out` how far it stands proud of the paint.
//
// It is swept as one strip rather than assembled from a row of boxes: a car carries
// several of these and six of them race at once, so each one has to be a single draw
// call. The cross-section is a closed rectangle, which comes out facing outwards at
// either end of the car without needing to know which end it is on.
function curvedBand(mat, halfW, h, d, y, curve, out, segs = 16) {
  halfW = Math.min(halfW, curve.maxHw * 0.99);
  const section = [[h / 2, d / 2], [-h / 2, d / 2], [-h / 2, -d / 2], [h / 2, -d / 2]];
  const pos = [], index = [];
  for (let i = 0; i <= segs; i++) {
    const x = ((i / segs) * 2 - 1) * halfW;
    const z = curve(x) + out;
    const a = faceTilt(curve, x), ca = Math.cos(a), sa = Math.sin(a);
    for (const [dy, dz] of section) pos.push(x + dz * sa, y + dy, z + dz * ca);
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const a = i * 4 + k, b = i * 4 + k2, c = (i + 1) * 4 + k, e = (i + 1) * 4 + k2;
      index.push(a, b, c, b, e, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

let barTexture = null;
function getBarTexture() {
  if (barTexture) return barTexture;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 16;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5d6f86';
  ctx.fillRect(0, 0, 256, 16);
  ctx.fillStyle = '#ffffff';
  for (let x = 3; x < 256; x += 8) ctx.fillRect(x, 2, 5, 12);
  barTexture = new THREE.CanvasTexture(c);
  barTexture.colorSpace = THREE.SRGBColorSpace;
  return barTexture;
}

// --- assembly ----------------------------------------------------------------
export function buildCar(spec, paintHex, opts = {}) {
  const { wb, wheelR, tyre } = spec.dims;
  const zF = Math.max(...spec.hull.map((r) => r[0]));
  const zR = Math.min(...spec.hull.map((r) => r[0]));
  const group = new THREE.Group();
  const paint = PAINTS.find((p) => p.hex === paintHex) || PAINTS[spec.paint];
  const matte = !!paint.matte;
  const st = spec.style;

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(paintHex || paint.hex),
    metalness: matte ? 0.3 : 0.72,
    roughness: matte ? 0.55 : 0.26,
    clearcoat: matte ? 0.3 : 1,
    clearcoatRoughness: matte ? 0.45 : 0.06,
    envMapIntensity: 1.2,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: st.darkGlass ? '#05080b' : '#0b1016',
    metalness: 0.45, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.9,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#14161a', roughness: 0.72, metalness: 0.2 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.35, metalness: 0.5 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#ccd2d9', roughness: 0.18, metalness: 1 });

  const hull = new THREE.Mesh(buildHull(spec), [bodyMat, glassMat, trimMat, roofMat]);
  group.add(hull);

  const prof = hullProfile(spec);
  const cab = spec.cab;

  // Wheel arch trim, built along the sill line itself so it hugs the opening.
  if (st.cladding) {
    const { archR } = archGeom(spec);
    const posA = [], idxA = [];
    for (const axle of [wb / 2, -wb / 2]) {
      for (const sx of [-1, 1]) {
        const N = 18, base = posA.length / 3;
        for (let i = 0; i <= N; i++) {
          const z = axle + (-1 + (2 * i) / N) * archR * 0.97;
          const y = prof.sill(z);
          let ry = y - wheelR, rz = z - axle;
          const rl = Math.hypot(ry, rz) || 1;
          ry /= rl; rz /= rl;
          const x = sx * (prof.hw(z) + 0.014);
          posA.push(x, y + ry * 0.004, z + rz * 0.004);
          posA.push(x, y + ry * 0.075, z + rz * 0.075);
        }
        for (let i = 0; i < N; i++) {
          const a = base + i * 2;
          idxA.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    ag.setIndex(idxA);
    ag.computeVertexNormals();
    group.add(new THREE.Mesh(ag, new THREE.MeshStandardMaterial({
      color: '#15171b', roughness: 0.75, metalness: 0.15, side: THREE.DoubleSide,
    })));
  }

  // roof rails
  if (st.rails) {
    const zm = (cab.rf + cab.rb) / 2;
    const rw = prof.hw(zm) * prof.tumble(zm);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, Math.abs(cab.rf - cab.rb) * 0.8), trimMat);
      rail.position.set(sx * rw * 0.78, prof.top(zm) + 0.02, zm);
      group.add(rail);
    }
  }

  // chrome window surround along the belt line
  if (st.chrome) {
    const zm = (cab.ws + cab.rg) / 2;
    for (const sx of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, Math.abs(cab.ws - cab.rg) * 0.88), chromeMat);
      line.position.set(sx * (prof.hw(zm) + 0.012), prof.belt(zm) + 0.02, zm);
      group.add(line);
    }
  }

  // door handles, and the sliding-door rail on the MPV
  const handleMat = st.chrome ? chromeMat : trimMat;
  for (const sx of [-1, 1]) {
    for (const dz of st.slider ? [0.5, -0.9] : [0.4, -0.8]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.04, 0.18), handleMat);
      h.position.set(sx * (prof.hw(dz) + 0.012), prof.belt(dz) - 0.13, dz);
      group.add(h);
    }
    if (st.slider) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.028, 1.5), trimMat);
      rail.position.set(sx * (prof.hw(-0.9) + 0.008), prof.belt(-0.9) - 0.34, -0.95);
      group.add(rail);
    }
  }

  // --- light signature ---
  const headMat = new THREE.MeshStandardMaterial({
    map: getBarTexture(), emissiveMap: getBarTexture(), color: '#eaf2ff',
    emissive: '#dbeaff', emissiveIntensity: 2.6, roughness: 0.25,
  });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#eaf3ff', emissive: '#cbe4ff', emissiveIntensity: 2.2, roughness: 0.2 });
  const gateMat = new THREE.MeshStandardMaterial({
    map: getGateTexture(), emissiveMap: getGateTexture(), color: '#dbe9ff',
    emissive: '#b6d6ff', emissiveIntensity: 2.4, roughness: 0.2,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    map: getBarTexture(), emissiveMap: getBarTexture(), color: '#d0232e',
    emissive: '#ff3020', emissiveIntensity: 2.0, roughness: 0.3,
  });

  const noseTop = prof.top(zF);
  const noseHw = prof.hw(zF - 0.05);
  const noseAt = (y) => faceCurve(spec, prof, zF, 1, y);
  if (st.front === 'waterfall') {
    // 009: the face is nearly vertical and almost all of it is grille - a tall chrome
    // frame full of vertical bars, with the lamps pushed out to the top corners.
    const gh = Math.min(0.42, noseTop - spec.ride - 0.34);
    const gy = spec.ride + 0.16 + gh / 2;
    const gc = noseAt(gy);
    group.add(curvedBand(chromeMat, noseHw * 0.92, gh + 0.05, 0.05, gy, gc, 0.005, 14));
    group.add(curvedBand(trimMat, noseHw * 0.87, gh, 0.05, gy, gc, 0.02, 14));
    const bars = 15, bw = Math.min(noseHw * 0.82, gc.maxHw * 0.82);
    for (let i = 0; i < bars; i++) {
      const x = ((i / (bars - 1)) * 2 - 1) * bw;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.022, gh * 0.9, 0.055), chromeMat);
      bar.position.set(x, gy, gc(x) + 0.035);
      bar.rotation.y = faceTilt(gc, x);
      group.add(bar);
    }
    const dy = noseTop - 0.15, dc = noseAt(dy);
    group.add(curvedBand(headMat, noseHw * 0.93, 0.06, 0.06, dy, dc, 0.015, 18));
    const ly = noseTop - 0.31, lc = noseAt(ly);
    for (const sx of [-1, 1]) {
      const x = sx * Math.min(noseHw * 0.8, lc.maxHw * 0.8);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.06), lampMat);
      lamp.position.set(x, ly, lc(x) + 0.015);
      lamp.rotation.y = faceTilt(lc, x);
      group.add(lamp);
    }
  } else {
    if (st.front === 'stargate') {
      // the Stargate matrix spans the whole nose, with the driving lamps at its ends
      const gh = 0.13, gy = noseTop - 0.2, gc = noseAt(gy);
      const gw = Math.min(noseHw * 0.9, gc.maxHw * 0.97);
      group.add(curvedBand(gateMat, gw, gh, 0.07, gy, gc, 0.015, 20));
      for (const sx of [-1, 1]) {
        const x = sx * gw * 0.88;
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(noseHw * 0.22, gh * 0.6, 0.075), lampMat);
        lamp.position.set(x, gy, gc(x) + 0.02);
        lamp.rotation.y = faceTilt(gc, x);
        group.add(lamp);
      }
    } else {
      const by = noseTop - 0.17;
      group.add(curvedBand(headMat, noseHw * 0.88, 0.055, 0.07, by, noseAt(by), 0.015, 16));
    }
    if (st.front === 'split') {
      const ly = noseTop - 0.4, lc = noseAt(ly);
      for (const sx of [-1, 1]) {
        const x = sx * Math.min(noseHw * 0.58, lc.maxHw * 0.7);
        const tilt = faceTilt(lc, x);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(noseHw * 0.36, 0.115, 0.06), trimMat);
        housing.position.set(x, ly, lc(x) + 0.005);
        housing.rotation.y = tilt;
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(noseHw * 0.3, 0.075, 0.07), lampMat);
        lamp.position.set(x, ly, lc(x) + 0.015);
        lamp.rotation.y = tilt;
        group.add(housing, lamp);
      }
    }
    // lower intake
    const iy = spec.ride + 0.15;
    group.add(curvedBand(trimMat, noseHw * 0.78, 0.15, 0.06, iy, noseAt(iy), 0.0, 12));
  }

  // full-width rear light bar, wrapping around the corners
  const tailTop = prof.top(zR);
  const tailHw = prof.hw(zR + 0.06);
  const ty = tailTop - 0.16;
  const tail = faceCurve(spec, prof, zR, -1, ty);
  const tw = Math.min(tailHw * 0.9, tail.maxHw * 0.97);
  group.add(curvedBand(tailMat, tw, 0.075, 0.06, ty, tail, -0.015, 18));
  for (const sx of [-1, 1]) {
    const x = sx * tw * 0.98;
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.2), tailMat);
    wrap.position.set(x, ty, tail(x) + 0.06);
    wrap.rotation.y = faceTilt(tail, x);
    group.add(wrap);
  }
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.11, 0.02),
    new THREE.MeshStandardMaterial({ color: '#e2e6e9', roughness: 0.6 })
  );
  plate.position.set(0, Math.max(spec.ride + 0.3, tailTop - 0.5), zR - 0.02);
  group.add(plate);

  // diffuser, splitter, spoilers
  const diff = new THREE.Mesh(new THREE.BoxGeometry(prof.hw(zR + 0.3) * 1.5, 0.13, 0.3), trimMat);
  diff.position.set(0, spec.ride + 0.01, zR + 0.22);
  group.add(diff);
  if (st.splitter) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(prof.hw(zF - 0.3) * 1.95, 0.03, 0.3), trimMat);
    sp.position.set(0, spec.ride - 0.03, zF - 0.26);
    group.add(sp);
  }
  if (st.ducktail) {
    const zt = zR + 0.28;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(prof.hw(zt) * 1.7, 0.045, 0.16), bodyMat);
    lip.position.set(0, prof.top(zt) + 0.02, zt);
    lip.rotation.x = -0.14;
    group.add(lip);
  }
  if (st.wing) {
    const zw = zR + 0.42;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(prof.hw(zw) * 1.9, 0.04, 0.3), trimMat);
    blade.position.set(0, prof.top(zw) + 0.24, zw);
    blade.rotation.x = -0.12;
    group.add(blade);
    for (const sx of [-1, 1]) {
      const stay = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.12), trimMat);
      stay.position.set(sx * prof.hw(zw) * 0.66, prof.top(zw) + 0.11, zw);
      group.add(stay);
    }
  }

  // door mirrors: a thin arm, a moulded housing and a dark mirror face
  const zMir = cab.ws - 0.2;
  const mirrorGlass = new THREE.MeshStandardMaterial({ color: '#1b2026', roughness: 0.08, metalness: 0.95 });
  for (const sx of [-1, 1]) {
    const x0 = prof.hw(zMir), y0 = prof.belt(zMir) + 0.05;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.02, 0.035), trimMat);
    arm.position.set(sx * (x0 + 0.035), y0 + 0.01, zMir);
    arm.rotation.z = -sx * 0.3;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), bodyMat);
    shell.scale.set(0.055, 0.05, 0.095);
    shell.position.set(sx * (x0 + 0.095), y0 + 0.035, zMir - 0.015);
    shell.rotation.y = sx * 0.2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.043, 16), mirrorGlass);
    face.scale.set(1, 0.8, 1);
    face.position.set(sx * (x0 + 0.098), y0 + 0.035, zMir - 0.1);
    face.rotation.y = Math.PI + sx * 0.22;
    group.add(arm, shell, face);
  }

  // wipers resting at the base of the windscreen (a symmetric pair)
  for (const sx of [-1, 1]) {
    const wiper = new THREE.Mesh(new THREE.BoxGeometry(prof.hw(cab.ws) * 0.62, 0.018, 0.026), trimMat);
    wiper.position.set(sx * prof.hw(cab.ws) * 0.36, prof.top(cab.ws + 0.06) + 0.015, cab.ws + 0.08);
    wiper.rotation.y = sx * 0.1;
    group.add(wiper);
  }

  // --- wheels ---
  // Each axle gets its own track so the outer face of the tyre sits just inside the arch
  // lip at that end of the car, rather than being swallowed by the widest bodywork.
  const wheelWidth = tyre || 0.27;
  const protos = { 1: buildWheel(wheelR, wheelWidth, 1), '-1': buildWheel(wheelR, wheelWidth, -1) };
  const wheels = [];
  const trackAt = (z) => prof.hw(z) * 0.99 - wheelWidth * 0.5 - 0.015;
  for (const [zi, xi] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const w = protos[xi].clone(true);
    const z = zi * (wb / 2);
    w.position.set(xi * trackAt(z), wheelR, z);
    group.add(w);
    wheels.push(w);
  }

  // racing number on the doors
  if (opts.number) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    ctx.beginPath(); ctx.arc(64, 64, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#16181c';
    ctx.font = 'bold 60px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(opts.number), 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const numMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.55 });
    for (const sx of [-1, 1]) {
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), numMat);
      disc.position.set(sx * (prof.hw(-wb * 0.12) + 0.025), prof.belt(-wb * 0.12) - 0.26, -wb * 0.12);
      disc.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(disc);
    }
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  group.userData = {
    spec, wheels, steerWheels: [wheels[0], wheels[1]],
    bodyMat, tailMat, headMat, wheelR,
  };
  return group;
}

// Called every frame so the wheels turn and the brake lights come on.
export function animateCar(car, state, dt) {
  const u = car.userData;
  const roll = (state.speed / u.wheelR) * dt * (state.reverse ? -1 : 1);
  for (const w of u.wheels) w.children[0].rotation.x -= roll;
  const steer = state.steerAngle || 0;
  u.steerWheels[0].rotation.y = steer;
  u.steerWheels[1].rotation.y = steer;
  u.tailMat.emissiveIntensity = state.braking ? 4.2 : 1.3;
}
