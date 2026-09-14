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
    dims: { L: 4.43, W: 1.84, H: 1.57, wb: 2.75, wheelR: 0.35, tyre: 0.27 },
    mass: 1900, power: 315000, accel: 3.8, vTop: 53, grip: 1.02, brake: 1.04, agility: 1.12,
    ride: 0.20, hoodY: 0.99,
    cab: { ws: 1.25, rf: 0.05, rb: -1.05, rg: -1.62 },
    hull: [
      [2.15, 0.76, 0.72, 0.70, 0.99],
      [1.92, 0.90, 0.84, 0.88, 0.98],
      [1.55, 0.97, 0.90, 0.97, 0.97],
      [1.25, 0.99, 0.92, 1.00, 0.97],
      [0.62, 1.38, 0.94, 1.00, 0.90],
      [0.05, 1.57, 0.95, 1.00, 0.86],
      [-1.05, 1.55, 0.98, 1.00, 0.85],
      [-1.62, 1.40, 1.00, 0.98, 0.88],
      [-2.00, 1.14, 1.00, 0.94, 0.94],
      [-2.28, 1.00, 0.94, 0.80, 0.98],
    ],
    style: { cladding: true, twoTone: true, front: 'split', flare: 0.03 },
    paint: 0,
  },
  {
    id: '007',
    name: 'ZEEKR 007',
    type: 'Fastback sedan',
    tagline: 'Low, slippery and quick off the line.',
    dims: { L: 4.87, W: 1.90, H: 1.45, wb: 2.93, wheelR: 0.37, tyre: 0.28 },
    mass: 2150, power: 475000, accel: 2.9, vTop: 58, grip: 1.10, brake: 1.08, agility: 1.04,
    ride: 0.16, hoodY: 0.88,
    cab: { ws: 1.40, rf: 0.10, rb: -0.85, rg: -2.05 },
    hull: [
      [2.36, 0.62, 0.58, 0.68, 0.99],
      [2.10, 0.76, 0.70, 0.88, 0.98],
      [1.70, 0.85, 0.80, 0.97, 0.97],
      [1.40, 0.88, 0.83, 1.00, 0.97],
      [0.75, 1.22, 0.86, 1.00, 0.91],
      [0.10, 1.44, 0.88, 1.00, 0.86],
      [-0.85, 1.45, 0.90, 1.00, 0.85],
      [-1.70, 1.26, 0.93, 0.99, 0.88],
      [-2.05, 1.08, 0.95, 0.96, 0.93],
      [-2.30, 1.00, 0.94, 0.90, 0.96],
      [-2.51, 0.92, 0.86, 0.78, 0.98],
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
    ride: 0.17, hoodY: 0.92,
    cab: { ws: 1.45, rf: 0.15, rb: -1.15, rg: -1.95 },
    hull: [
      [2.41, 0.64, 0.60, 0.70, 0.99],
      [2.15, 0.80, 0.74, 0.89, 0.98],
      [1.75, 0.89, 0.84, 0.97, 0.97],
      [1.45, 0.92, 0.87, 1.00, 0.97],
      [0.80, 1.28, 0.90, 1.00, 0.91],
      [0.15, 1.53, 0.92, 1.00, 0.86],
      [-1.15, 1.55, 0.95, 1.00, 0.85],
      [-1.95, 1.38, 0.98, 0.99, 0.88],
      [-2.30, 1.16, 1.00, 0.95, 0.94],
      [-2.56, 1.02, 0.94, 0.82, 0.98],
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
    ride: 0.13, hoodY: 0.86,
    cab: { ws: 1.45, rf: 0.15, rb: -1.15, rg: -1.95 },
    hull: [
      [2.41, 0.58, 0.54, 0.72, 0.99],
      [2.15, 0.74, 0.68, 0.90, 0.98],
      [1.75, 0.83, 0.78, 0.98, 0.97],
      [1.45, 0.86, 0.81, 1.00, 0.97],
      [0.80, 1.22, 0.84, 1.00, 0.91],
      [0.15, 1.48, 0.86, 1.00, 0.86],
      [-1.15, 1.50, 0.89, 1.00, 0.85],
      [-1.95, 1.33, 0.92, 0.99, 0.88],
      [-2.30, 1.12, 0.94, 0.95, 0.94],
      [-2.56, 0.98, 0.88, 0.82, 0.98],
    ],
    style: { front: 'stargate', wing: true, splitter: true, flare: 0.06, darkGlass: true },
    paint: 4,
  },
  {
    id: '7x',
    name: 'ZEEKR 7X',
    type: 'Mid-size SUV',
    tagline: 'Heavier, but it hides the weight well.',
    dims: { L: 4.83, W: 1.93, H: 1.66, wb: 2.93, wheelR: 0.39, tyre: 0.29 },
    mass: 2400, power: 475000, accel: 3.2, vTop: 58, grip: 1.00, brake: 1.00, agility: 0.98,
    ride: 0.22, hoodY: 1.08,
    cab: { ws: 1.32, rf: 0.05, rb: -1.25, rg: -1.85 },
    hull: [
      [2.33, 0.84, 0.78, 0.72, 0.99],
      [2.05, 1.00, 0.92, 0.90, 0.98],
      [1.62, 1.06, 0.98, 0.98, 0.97],
      [1.32, 1.08, 1.00, 1.00, 0.97],
      [0.65, 1.46, 1.02, 1.00, 0.91],
      [0.05, 1.66, 1.04, 1.00, 0.87],
      [-1.25, 1.64, 1.07, 1.00, 0.86],
      [-1.85, 1.50, 1.09, 0.99, 0.89],
      [-2.20, 1.26, 1.10, 0.95, 0.95],
      [-2.48, 1.10, 1.02, 0.82, 0.98],
    ],
    style: { cladding: true, twoTone: true, front: 'split', rails: true },
    paint: 3,
  },
  {
    id: '009',
    name: 'ZEEKR 009',
    type: 'Luxury MPV',
    tagline: 'Six seats, nearly three tonnes and a wall of light at the front.',
    dims: { L: 5.21, W: 2.02, H: 1.85, wb: 3.21, wheelR: 0.38, tyre: 0.28 },
    mass: 2820, power: 400000, accel: 4.4, vTop: 53, grip: 0.92, brake: 0.94, agility: 0.88,
    ride: 0.20, hoodY: 1.24,
    cab: { ws: 1.75, rf: 0.85, rb: -1.95, rg: -2.35 },
    hull: [
      [2.52, 1.02, 0.96, 0.78, 0.99],
      [2.32, 1.16, 1.08, 0.93, 0.98],
      [2.00, 1.22, 1.14, 0.99, 0.98],
      [1.75, 1.26, 1.18, 1.00, 0.97],
      [1.25, 1.62, 1.20, 1.00, 0.95],
      [0.85, 1.85, 1.21, 1.00, 0.93],
      [-1.95, 1.84, 1.24, 1.00, 0.92],
      [-2.35, 1.70, 1.26, 0.99, 0.93],
      [-2.55, 1.44, 1.26, 0.96, 0.95],
      [-2.69, 1.22, 1.08, 0.84, 0.98],
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

  const steps = Math.max(40, Math.round((zF - zR) / 0.07));
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

  // blunt caps at the nose and tail, fanned to the centre of the end section
  const capCentre = (i, push) => {
    const st = stations[i];
    let sy = 0;
    for (const [, y] of st.pts) sy += y;
    const cy = sy / st.pts.length;
    positions.push(0, cy, st.z + push);
    return positions.length / 3 - 1;
  };
  const noseIdx = capCentre(stations.length - 1, 0.04);
  const tailIdx = capCentre(0, -0.04);
  const last = rings.length - 1;
  // Wind each cap triangle so its normal points away from the car (+Z at the nose,
  // -Z at the tail) rather than trusting the direction the ring happens to run in.
  const capTri = (i0, i1, centre, wantZ) => {
    const px = (k) => positions[k * 3], py = (k) => positions[k * 3 + 1];
    const ux = px(i1) - px(i0), uy = py(i1) - py(i0);
    const vx = px(centre) - px(i0), vy = py(centre) - py(i0);
    return (ux * vy - uy * vx) * wantZ >= 0 ? [i0, i1, centre] : [i1, i0, centre];
  };
  for (let j = 0; j < RING; j++) {
    const j2 = (j + 1) % RING;
    const a = idx(last, j), b = idx(last, j + 1);
    const y = (rings[last][j][1] + rings[last][j2][1]) / 2;
    groups[y < spec.ride + 0.3 ? TRIM : PAINT].push(...capTri(a, b, noseIdx, 1));   // dark lower fascia
    const c = idx(0, j), d = idx(0, j + 1);
    const y2 = (rings[0][j][1] + rings[0][j2][1]) / 2;
    groups[y2 < spec.ride + 0.3 ? TRIM : PAINT].push(...capTri(c, d, tailIdx, -1));
  }

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
let barTexture = null;
function getBarTexture() {
  if (barTexture) return barTexture;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 16;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0e12';
  ctx.fillRect(0, 0, 256, 16);
  ctx.fillStyle = '#ffffff';
  for (let x = 3; x < 256; x += 8) ctx.fillRect(x, 3, 5, 10);
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
    map: getBarTexture(), emissiveMap: getBarTexture(), color: '#dfeaff',
    emissive: '#cfe2ff', emissiveIntensity: 1.7, roughness: 0.25,
  });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#eaf3ff', emissive: '#bcdcff', emissiveIntensity: 1.5, roughness: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({
    map: getBarTexture(), emissiveMap: getBarTexture(), color: '#c8202a',
    emissive: '#ff2a1c', emissiveIntensity: 1.3, roughness: 0.3,
  });

  const noseTop = prof.top(zF);
  const noseHw = prof.hw(zF - 0.05);
  if (st.front === 'waterfall') {
    const gh = noseTop - spec.ride - 0.42;
    const grille = new THREE.Mesh(new THREE.BoxGeometry(noseHw * 1.5, gh, 0.05), chromeMat);
    grille.position.set(0, noseTop - gh / 2 - 0.16, zF - 0.02);
    group.add(grille);
    const bars = 13;
    for (let i = 0; i < bars; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.028, gh * 0.9, 0.07), lampMat);
      bar.position.set((i / (bars - 1) - 0.5) * noseHw * 1.42, noseTop - gh / 2 - 0.16, zF + 0.015);
      group.add(bar);
    }
  } else {
    const wide = st.front === 'stargate' ? 1.74 : 1.5;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(noseHw * wide, 0.07, 0.07), headMat);
    bar.position.set(0, noseTop - 0.13, zF + 0.01);
    group.add(bar);
    if (st.front === 'split') {
      for (const sx of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(noseHw * 0.42, 0.09, 0.07), lampMat);
        lamp.position.set(sx * noseHw * 0.52, noseTop - 0.29, zF - 0.01);
        lamp.rotation.z = sx * 0.07;
        group.add(lamp);
      }
    }
    // lower intake
    const intake = new THREE.Mesh(new THREE.BoxGeometry(noseHw * 1.3, 0.16, 0.06), trimMat);
    intake.position.set(0, spec.ride + 0.22, zF - 0.02);
    group.add(intake);
  }

  // full-width rear light bar, wrapping around the corners
  const tailTop = prof.top(zR);
  const tailHw = prof.hw(zR + 0.06);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(tailHw * 1.66, 0.08, 0.06), tailMat);
  rear.position.set(0, tailTop - 0.14, zR - 0.02);
  group.add(rear);
  for (const sx of [-1, 1]) {
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.22), tailMat);
    wrap.position.set(sx * tailHw * 0.86, tailTop - 0.14, zR + 0.09);
    wrap.rotation.y = sx * 0.35;
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
