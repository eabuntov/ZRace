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

// `id` is the translation key (paint.<id> in js/lang/); `name` is the English source
// text, kept here so the table still reads as a list of colours.
export const PAINTS = [
  { id: 'mist', name: 'Mist Grey', hex: '#9aa2a8', matte: true },
  { id: 'glacier', name: 'Glacier White', hex: '#eef1f4' },
  { id: 'obsidian', name: 'Obsidian', hex: '#212428' },
  { id: 'electric', name: 'Electric Blue', hex: '#2f6ad0' },
  { id: 'aurora', name: 'Aurora Green', hex: '#2fae74' },
  { id: 'solar', name: 'Solar Orange', hex: '#ef7420' },
  { id: 'crimson', name: 'Crimson', hex: '#c1232d' },
  { id: 'dune', name: 'Dune', hex: '#c9b795' },
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
    model: 'assets/cars/zeekr_x.glb', modelYaw: Math.PI,
    paint: 0,
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
    model: 'assets/cars/zeekr_7x.glb', modelYaw: Math.PI,
    paint: 3,
  },
  {
    id: 'seal',
    name: 'BYD SEAL',
    type: 'Electric sedan',
    tagline: 'Blade battery low in the floor, and it corners like it.',
    dims: { L: 4.80, W: 1.88, H: 1.46, wb: 2.92, wheelR: 0.35, tyre: 0.28 },
    mass: 2185, power: 390000, accel: 3.8, vTop: 55, grip: 1.12, brake: 1.06, agility: 1.08,
    ride: 0.16, hoodY: 1.02,
    cab: { ws: 0.95, rf: -0.10, rb: -0.85, rg: -1.78 },
    hull: [
      [2.34, 0.74, 0.68, 0.74, 0.99],
      [2.16, 0.78, 0.72, 0.89, 0.98],
      [1.79, 0.90, 0.84, 0.99, 0.97],
      [1.42, 0.97, 0.91, 0.99, 0.96],
      [1.05, 1.02, 0.94, 1.00, 0.92],
      [0.68, 1.25, 0.98, 1.00, 0.84],
      [0.31, 1.39, 1.01, 0.99, 0.79],
      [-0.42, 1.48, 1.04, 0.99, 0.76],
      [-1.16, 1.43, 1.10, 1.00, 0.75],
      [-1.53, 1.36, 1.11, 0.99, 0.76],
      [-1.90, 1.24, 1.18, 0.99, 0.82],
      [-2.27, 1.10, 1.04, 0.93, 0.90],
      [-2.46, 1.00, 0.94, 0.74, 0.97],
    ],
    style: { front: 'bar', ducktail: true, chrome: false },
    model: 'assets/cars/byd_seal.glb',
    paint: 3,
  },
  {
    id: 'u9',
    name: 'YANGWANG U9',
    type: 'Electric hypercar',
    tagline: 'Four motors, a metre and a bit tall, and quicker than anything here.',
    dims: { L: 4.97, W: 2.03, H: 1.30, wb: 2.90, wheelR: 0.35, tyre: 0.34 },
    mass: 2475, power: 960000, accel: 2.0, vTop: 87, grip: 1.30, brake: 1.24, agility: 1.16,
    ride: 0.11, hoodY: 0.99,
    cab: { ws: 1.05, rf: 0.25, rb: -0.75, rg: -1.32 },
    hull: [
      [2.58, 0.64, 0.58, 0.74, 0.99],
      [2.38, 0.68, 0.62, 0.86, 0.98],
      [1.96, 0.83, 0.77, 0.97, 0.97],
      [1.55, 0.93, 0.87, 1.00, 0.95],
      [1.13, 0.99, 0.93, 1.00, 0.92],
      [0.72, 1.26, 0.96, 1.00, 0.80],
      [0.31, 1.32, 0.98, 0.98, 0.72],
      [-0.52, 1.31, 1.00, 0.99, 0.68],
      [-0.94, 1.26, 1.02, 1.00, 0.66],
      [-1.35, 1.18, 1.06, 1.00, 0.72],
      [-1.76, 1.08, 1.02, 0.98, 0.86],
      [-2.38, 0.96, 0.90, 0.76, 0.97],
    ],
    style: { front: 'bar', wing: true, splitter: true, flare: 0.05, darkGlass: true },
    model: 'assets/cars/yangwang_u9.glb',
    paint: 4,
  },
  {
    id: 'gc9',
    name: 'GEELY GC9',
    type: 'Large sedan',
    tagline: 'Long bonnet, long boot, and a grille you can see coming.',
    dims: { L: 4.99, W: 1.86, H: 1.51, wb: 2.85, wheelR: 0.35, tyre: 0.27 },
    mass: 1780, power: 215000, accel: 6.8, vTop: 48, grip: 0.98, brake: 0.96, agility: 1.02,
    ride: 0.17, hoodY: 1.03,
    cab: { ws: 0.95, rf: 0.10, rb: -0.95, rg: -1.62 },
    hull: [
      [2.44, 0.80, 0.74, 0.74, 0.99],
      [2.24, 0.84, 0.78, 0.90, 0.98],
      [1.82, 0.93, 0.87, 0.99, 0.97],
      [1.41, 1.03, 0.97, 0.99, 0.95],
      [0.99, 1.25, 1.03, 1.00, 0.90],
      [0.57, 1.46, 1.05, 1.00, 0.80],
      [0.16, 1.53, 1.06, 0.99, 0.78],
      [-0.67, 1.53, 1.10, 0.99, 0.77],
      [-1.09, 1.50, 1.12, 0.99, 0.76],
      [-1.50, 1.43, 1.18, 0.99, 0.78],
      [-1.92, 1.32, 1.26, 0.99, 0.86],
      [-2.34, 1.17, 1.11, 0.92, 0.92],
      [-2.54, 1.06, 1.00, 0.74, 0.97],
    ],
    style: { front: 'waterfall', chrome: true },
    model: 'assets/cars/geely_gc9.glb', paintMat: 'Material.001',
    paint: 2,
  },
  {
    id: 'monjaro',
    name: 'GEELY MONJARO',
    type: 'Large SUV',
    tagline: 'Heavy and high, but it hangs on longer than it looks.',
    dims: { L: 4.77, W: 1.90, H: 1.69, wb: 2.85, wheelR: 0.36, tyre: 0.28 },
    mass: 1935, power: 205000, accel: 7.4, vTop: 46, grip: 0.96, brake: 0.95, agility: 0.96,
    ride: 0.21, hoodY: 1.17,
    // The rear screen runs back almost to the tailgate, as it does on the car.
    cab: { ws: 1.15, rf: 0.15, rb: -1.72, rg: -2.20 },
    // A coupe-ish SUV, and built to read as one beside the Tiggo 8: a lower roof that
    // starts falling before the rear axle, a window line that rises to meet it, and
    // enough tumblehome to pull the glass house in off the shoulders. Body-colour roof
    // and no rails. See the Tiggo's note for the other half of the comparison.
    // The tail used to be a brick. `halfSection` blends between a cabin section, which
    // has tumblehome, and a saloon's flat boot deck, and it picks between them on how far
    // the window line sits below the roof: closer than 10cm and the section is all deck.
    // The old stations walked the window line up to 1.50 under a 1.63 roof, so the last
    // half-metre of the car was a full-width flat shelf with a vertical drop off the back
    // of it - a boot lid, on a car that has no boot. The window line now stays low enough
    // to keep the cabin section to the tailgate, the roof falls away over the last
    // two-thirds of a metre instead of the last fifth, and the shoulders draw in over
    // three stations rather than one.
    hull: [
      [2.38, 1.06, 1.00, 0.76, 0.99],
      [2.19, 1.11, 1.05, 0.90, 0.98],
      [1.79, 1.16, 1.10, 0.99, 0.97],
      [1.39, 1.17, 1.11, 1.00, 0.95],
      [0.99, 1.330, 1.130, 1.00, 0.88],    // long bonnet, screen laid back
      [0.60, 1.560, 1.145, 1.00, 0.77],
      [0.20, 1.655, 1.165, 0.99, 0.72],
      [-0.99, 1.660, 1.205, 1.00, 0.70],
      [-1.39, 1.650, 1.235, 1.00, 0.69],   // roof already easing down
      [-1.74, 1.610, 1.255, 0.99, 0.71],   // and falling by the spoiler lip
      [-2.02, 1.520, 1.245, 0.96, 0.77],   // rear screen falls away
      [-2.22, 1.400, 1.185, 0.90, 0.85],   // screen meets the top of the tailgate
      [-2.38, 1.250, 1.120, 0.75, 0.95],   // tailgate, shoulders drawn in
    ],
    style: { cladding: true, front: 'split', chrome: true, flare: 0.02 },
    // One mesh, one material, the whole car baked into a single colour map - so the paint
    // is carried by that map rather than by a material of its own. See tintAtlas(). The
    // box is where the four polished alloys sit in that map: they are as bright and as
    // colourless as the white bodywork, so nothing but their address tells them apart.
    model: 'assets/cars/geely_monjaro.glb',
    paintAtlas: { keepOut: [[0, 0.75, 0.47, 0.89]] },
    paint: 1,
  },
  {
    id: 'tiggo8',
    name: 'CHERY TIGGO 8 PRO e+',
    type: 'Three-row SUV',
    tagline: 'Seven seats and a plug: the heaviest thing here that still hurries.',
    dims: { L: 4.72, W: 1.86, H: 1.75, wb: 2.71, wheelR: 0.36, tyre: 0.28 },
    mass: 1990, power: 240000, accel: 5.9, vTop: 47, grip: 0.97, brake: 0.97, agility: 0.95,
    ride: 0.21, hoodY: 1.17,
    // Roof panel runs almost to the tailgate - there is a third row under the back of it.
    cab: { ws: 1.00, rf: 0.10, rb: -1.95, rg: -2.33 },
    // The upright one. It shares a class, a size and very nearly a set of style flags
    // with the Monjaro, and the two were being told apart only by their grilles - which
    // is no help at all when the car ahead is showing you its back. So the pair is built
    // to opposite characters: this one keeps a tall roof dead level over all three rows
    // and drops it steeply onto a near-upright tailgate, carries a low flat window line
    // for a big square glass house, and has little tumblehome, so its sides stand up.
    // Black roof and rails on top of that. The Monjaro is the low one with the falling
    // roofline, the rising window line and the body-colour roof.
    hull: [
      [2.28, 0.990, 0.930, 0.76, 0.99],
      [2.08, 1.045, 0.975, 0.89, 0.98],
      [1.69, 1.160, 1.080, 1.00, 0.97],
      [1.29, 1.210, 1.115, 1.00, 0.95],
      [0.90, 1.380, 1.140, 1.00, 0.92],    // short bonnet: the screen gets up early
      [0.51, 1.640, 1.155, 1.00, 0.86],
      [0.11, 1.730, 1.165, 0.99, 0.82],    // tall flat roof begins
      [-0.67, 1.742, 1.195, 0.99, 0.82],
      [-1.07, 1.745, 1.215, 1.00, 0.82],
      [-1.46, 1.742, 1.230, 1.00, 0.82],
      [-1.95, 1.720, 1.250, 0.99, 0.83],   // still high over the third row
      [-2.23, 1.610, 1.290, 0.94, 0.88],   // short, steep rear screen
      [-2.44, 1.330, 1.190, 0.76, 0.96],   // near-upright tailgate
    ],
    style: { cladding: true, twoTone: true, front: 'waterfall', chrome: true, rails: true },
    model: 'assets/cars/chery_tiggo8.glb',
    paint: 7,
  },
  {
    id: 'bigdog',
    name: 'HAVAL BIG DOG',
    type: 'Boxy compact SUV',
    tagline: 'Square as a brick, round headlamps, and no interest in aerodynamics.',
    dims: { L: 4.62, W: 1.89, H: 1.78, wb: 2.74, wheelR: 0.37, tyre: 0.28 },
    mass: 1690, power: 170000, accel: 8.1, vTop: 44, grip: 0.92, brake: 0.93, agility: 0.94,
    ride: 0.22, hoodY: 1.19,
    cab: { ws: 0.98, rf: 0.20, rb: -1.45, rg: -1.88 },
    hull: [
      [2.30, 1.06, 1.00, 0.76, 0.99],
      [2.11, 1.10, 1.04, 0.92, 0.98],
      [1.72, 1.18, 1.12, 1.00, 0.97],
      [1.34, 1.19, 1.13, 1.00, 0.96],
      [0.95, 1.27, 1.21, 0.99, 0.90],
      [0.57, 1.70, 1.22, 1.00, 0.76],
      [0.18, 1.77, 1.23, 0.99, 0.74],
      [-0.59, 1.77, 1.26, 0.98, 0.73],
      [-0.97, 1.78, 1.30, 1.00, 0.72],
      [-1.36, 1.74, 1.36, 0.99, 0.71],
      [-1.74, 1.71, 1.64, 0.99, 0.80],
      [-2.13, 1.61, 1.55, 0.92, 0.92],
      [-2.32, 1.48, 1.42, 0.76, 0.97],
    ],
    style: { cladding: true, twoTone: true, front: 'round', rails: true, flare: 0.03 },
    model: 'assets/cars/haval_big_dog.glb',
    paint: 5,
  },
  {
    id: 'su7',
    name: 'XIAOMI SU7 ULTRA',
    type: 'Electric super saloon',
    tagline: 'Three motors and eleven hundred kilowatts. Nothing here goes with it.',
    dims: { L: 5.12, W: 1.97, H: 1.47, wb: 3.00, wheelR: 0.36, tyre: 0.31 },
    mass: 2360, power: 1100000, accel: 2.0, vTop: 95, grip: 1.32, brake: 1.26, agility: 1.18,
    ride: 0.16, hoodY: 1.09,
    cab: { ws: 1.00, rf: 0.00, rb: -1.00, rg: -1.92 },
    hull: [
      [2.51, 0.76, 0.70, 0.76, 0.99],
      [2.30, 0.80, 0.74, 0.94, 0.98],
      [1.87, 0.92, 0.86, 1.00, 0.97],
      [1.44, 0.98, 0.92, 1.00, 0.95],
      [1.02, 1.09, 1.00, 1.00, 0.90],
      [0.59, 1.31, 1.02, 1.00, 0.80],
      [0.16, 1.45, 1.03, 0.98, 0.76],
      [-0.69, 1.47, 1.06, 0.98, 0.73],
      [-1.11, 1.42, 1.08, 1.00, 0.70],
      [-1.54, 1.35, 1.12, 1.00, 0.70],
      [-1.97, 1.22, 1.16, 1.00, 0.80],
      [-2.39, 1.13, 1.07, 0.88, 0.90],
      [-2.61, 1.00, 0.94, 0.76, 0.97],
    ],
    style: { front: 'bar', ducktail: true, splitter: true, wing: true, flare: 0.04,
      darkGlass: true },
    model: 'assets/cars/xiaomi_su7.glb',
    paint: 6,
  },
  {
    id: 'yu7',
    name: 'XIAOMI YU7',
    type: 'Electric crossover',
    tagline: 'The SU7 grown tall - same wheelbase, far more room over your head.',
    dims: { L: 5.00, W: 2.00, H: 1.60, wb: 3.00, wheelR: 0.38, tyre: 0.29 },
    mass: 2405, power: 508000, accel: 3.2, vTop: 70, grip: 1.10, brake: 1.05, agility: 1.00,
    ride: 0.22, hoodY: 1.09,
    cab: { ws: 1.00, rf: 0.10, rb: -1.30, rg: -1.94 },
    hull: [
      [2.49, 0.88, 0.82, 0.76, 0.99],
      [2.28, 0.92, 0.86, 0.91, 0.98],
      [1.86, 1.03, 0.97, 0.99, 0.97],
      [1.44, 1.06, 1.00, 0.99, 0.96],
      [1.03, 1.09, 1.03, 1.00, 0.92],
      [0.61, 1.37, 1.09, 1.00, 0.85],
      [0.19, 1.55, 1.10, 1.00, 0.75],
      [-0.64, 1.58, 1.12, 0.97, 0.74],
      [-1.06, 1.56, 1.14, 1.00, 0.70],
      [-1.47, 1.51, 1.18, 1.00, 0.68],
      [-1.89, 1.46, 1.38, 1.00, 0.72],
      [-2.30, 1.24, 1.18, 0.92, 0.90],
      [-2.51, 1.10, 1.04, 0.76, 0.97],
    ],
    style: { front: 'bar', rails: true, flare: 0.03 },
    model: 'assets/cars/xiaomi_yu7.glb',
    paint: 1,
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
    } else if (st.front === 'round') {
      // the Big Dog wears a pair of round lamps in square surrounds and no light bar
      const ly = noseTop - 0.28, lc = noseAt(ly);
      for (const sx of [-1, 1]) {
        const x = sx * Math.min(noseHw * 0.62, lc.maxHw * 0.78);
        const tilt = faceTilt(lc, x);
        const surround = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.05), trimMat);
        surround.position.set(x, ly, lc(x) + 0.005);
        surround.rotation.y = tilt;
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 18), lampMat);
        lamp.rotation.set(Math.PI / 2, 0, 0);
        const holder = new THREE.Group();
        holder.add(lamp);
        holder.position.set(x, ly, lc(x) + 0.02);
        holder.rotation.y = tilt;
        group.add(surround, holder);
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
  return addBoostJet(group, spec);
}

// ------------------------------------------------------------------ boost jet
//
// The plume behind a car on overboost: a pair of cones out of the diffuser, each a
// near-white core inside a wider, softer halo, blended additively so they glow rather
// than paint over the scenery. They are ion blue and not flame orange because nothing
// on this grid burns anything - swap JET_COLOUR if you would rather have fire.
//
// Built for whatever mesh the car is actually racing - the code-built car above or a
// rigged scan - so it hangs off the group rather than off any particular body part.
const JET_COLOUR = { core: '#e8f6ff', halo: '#3aa6ff' };

export function addBoostJet(group, spec) {
  if (group.userData.jet) return group;
  const zR = spec.hull ? Math.min(...spec.hull.map((r) => r[0])) : -spec.dims.L / 2;
  const y = spec.ride + 0.30;
  const jet = [];
  for (const side of [-1, 1]) {
    for (const [r, len, hex, op] of [[0.19, 0.78, JET_COLOUR.halo, 0.36], [0.09, 1.02, JET_COLOUR.core, 0.5]]) {
      const g = new THREE.ConeGeometry(r, len, 14, 1, true);
      // Fade it out along its length. Under additive blending a darker vertex adds less,
      // so painting the tip black and the base white turns the cone into a plume that
      // thins into nothing instead of ending in a hard edge.
      const pos = g.attributes.position;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const f = Math.pow(Math.max(0, Math.min(1, 0.5 - pos.getY(i) / len)), 1.5);
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color: hex, transparent: true, opacity: 0, depthWrite: false, fog: false,
          vertexColors: true,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
        })
      );
      // the cone is built along +Y with its point at the top; lay it down so the point
      // trails behind the car and the open base sits in the bumper
      m.rotation.x = -Math.PI / 2;
      m.position.set(side * spec.dims.W * 0.29, y, zR - len / 2 + 0.1);
      m.castShadow = m.receiveShadow = false;
      m.visible = false;
      m.userData.baseOpacity = op;
      group.add(m);
      jet.push(m);
    }
  }
  group.userData.jet = jet;
  group.userData.jetLevel = 0;
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
  // the tail lamps glow under boost too, short of the flare braking gives them
  u.tailMat.emissiveIntensity = state.braking ? 4.2 : state.boosting ? 3.2 : 1.3;

  if (!u.jet) return;
  // Lights fast, dies slowly, and runs longer the quicker the car is going.
  const want = state.boosting ? 1 : 0;
  u.jetLevel += (want - u.jetLevel) * Math.min(1, dt * (want ? 20 : 7));
  const lvl = u.jetLevel;
  const stretch = 1 + Math.min(1.1, state.speed / 70);
  for (const m of u.jet) {
    m.visible = lvl > 0.02;
    if (!m.visible) continue;
    const flick = 0.78 + Math.random() * 0.44;
    m.scale.set(lvl * flick, lvl * stretch * flick, lvl * flick);
    m.material.opacity = m.userData.baseOpacity * lvl * flick;
  }
}
