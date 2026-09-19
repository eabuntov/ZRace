// Circuit definitions.
//
// Layouts are simplified interpretations of the real circuits, drawn as closed lists of
// control points in the order cars drive them: [x, y, opts?] with x to the right and y
// downwards, exactly like looking at a track map. trackPath.js runs a centripetal
// Catmull-Rom spline through them and scales the loop to `length` metres.
//
// Point options: h (height in metres), tunnel, waterL / waterR (water beyond that side),
// runoff / runoffL / runoffR (metres to the barrier), pit / grand ('L' | 'R').

export const TRACKS = [
  {
    id: 'shanghai',
    name: 'Shanghai International Circuit',
    city: 'Shanghai',
    country: 'China',
    flag: 'cn',
    blurb: 'ZEEKR home soil: a tightening snail into turn 1, a back straight over a kilometre long and a hairpin built for late braking.',
    length: 4400,
    width: 14,
    runoff: [9, 9],
    extraOutside: 14,
    points: [
      [100, 620, { pit: 'R', grand: 'L', wings: true }],
      [100, 520, { pit: 'R', grand: 'L' }],
      [100, 420],
      [101, 330],
      [106, 250],
      [112, 214],                 // T1
      [134, 180],
      [172, 163],
      [210, 172],                 // T2 - it keeps tightening
      [227, 198],
      [214, 223],
      [190, 226],
      [174, 238],                 // T3
      [172, 264],
      [186, 288],                 // T4
      [222, 297],
      [300, 296],
      [400, 272],                 // T5 kink
      [500, 218],
      [556, 182],                 // T6 hairpin
      [584, 175],
      [598, 193],
      [586, 216],
      [556, 268],
      [546, 320],                 // T7
      [560, 372],                 // T8
      [548, 432],
      [540, 498],
      [554, 540],                 // T9
      [592, 558],
      [642, 548],                 // T10
      [674, 520],
      [692, 480],                 // T11
      [706, 438],
      [730, 410],                 // T12 - long right onto the back straight
      [772, 400],
      [814, 426],
      [832, 482],
      [830, 562],
      [810, 642],
      [772, 722],                 // T13
      [718, 772],
      [650, 800],
      [520, 812],                 // back straight
      [380, 818],
      [250, 820],
      [186, 822],                 // T14 hairpin
      [160, 810],
      [158, 788],
      [172, 770],
      [180, 748],                 // T15
      [170, 726],
      [142, 714],                 // T16
      [114, 692],
      [102, 664, { pit: 'R', grand: 'L' }],
    ],
    theme: {
      sky: { top: '#3d5f9e', horizon: '#f3b27a' },
      fog: { color: '#e6b48f', density: 0.00042 },
      sun: { color: '#ffc98f', intensity: 2.6, elevation: 14, azimuth: 235 },
      hemi: { sky: '#9fb4e0', ground: '#6a5a48', intensity: 1.15 },
      ground: 'grass', groundTint: '#7d9a4c',
      runoff: 'asphalt', gravel: false,
      kerb: ['#d8262c', '#f4f4f4'],
      wall: { type: 'concrete', color: '#e9e6df', stripe: '#c8102e' },
      hills: { amp: 4, scale: 500 },
      mountains: null,
      skyline: { count: 60, dist: [900, 1800], height: [70, 260], tower: true, palette: ['#8d97a8', '#a8a397', '#6f7c8f', '#b6b0a5'] },
      trees: [{ type: 'round', weight: 1, tint: '#4d7a36' }, { type: 'pine', weight: 0.3 }],
      treeDensity: 0.3,
      buildings: { density: 0.05, minH: 8, maxH: 30, palette: ['#d8d3c8', '#b9c3cc', '#e5e1d6'] },
      banner: 'SHANGHAI',
    },
  },
  {
    id: 'monaco',
    name: 'Circuit de Monaco',
    city: 'Monte Carlo',
    country: 'Monaco',
    flag: 'mc',
    blurb: 'Barriers inches away, a climb to Casino Square, the slowest hairpin in racing and a tunnel along the sea.',
    length: 2750,
    width: 10,
    runoff: [1.4, 1.4],
    extraOutside: 3,
    points: [
      [100, 620, { pit: 'R', grand: 'L' }],
      [100, 520, { pit: 'R', grand: 'L' }],
      [100, 430],
      [102, 380],
      [110, 350, { h: 2 }],              // Sainte Devote
      [132, 334],
      [166, 331],                        // Beau Rivage
      [250, 318, { h: 14 }],
      [340, 300, { h: 26 }],
      [420, 281, { h: 34 }],
      [470, 262, { h: 38 }],             // Massenet
      [506, 238],
      [529, 210, { h: 41 }],
      [549, 189, { h: 42 }],             // Casino Square
      [576, 182],
      [612, 187, { h: 36 }],
      [656, 197, { h: 30 }],
      [686, 206, { h: 28 }],             // Mirabeau
      [698, 226],
      [700, 251, { h: 24 }],
      [698, 263],
      [688, 275, { h: 22 }],             // Grand Hotel hairpin
      [701, 283],
      [714, 274],
      [716, 256, { h: 19 }],
      [719, 240],
      [731, 228, { h: 17 }],             // Mirabeau Bas
      [756, 224],
      [781, 233, { h: 12 }],             // Portier
      [793, 251],
      [796, 276, { h: 8 }],
      [794, 301, { tunnel: true, waterL: true, h: 7 }],
      [785, 341, { tunnel: true, waterL: true }],
      [763, 383, { tunnel: true, waterL: true }],
      [729, 416, { tunnel: true, waterL: true, h: 5 }],
      [693, 435, { waterL: true, h: 3 }],
      [651, 449, { waterL: true, h: 2 }],
      [629, 453, { waterL: true, runoff: 4 }],   // Nouvelle Chicane
      [617, 467, { waterL: true, runoff: 4 }],
      [601, 471, { waterL: true, runoff: 4 }],
      [585, 463, { waterL: true, h: 1 }],
      [540, 459, { waterL: true }],
      [460, 463, { waterL: true }],
      [380, 467, { waterL: true }],
      [311, 471, { waterL: true }],      // Tabac
      [271, 479, { waterL: true }],
      [241, 497, { waterL: true }],
      [229, 521, { waterL: true }],      // Swimming pool
      [221, 549, { waterL: true }],
      [207, 567, { waterL: true }],
      [205, 591, { waterL: true }],
      [215, 611, { waterL: true }],
      [213, 635, { waterL: true }],
      [208, 657, { waterL: true }],      // La Rascasse
      [206, 683, { waterL: true }],
      [196, 705, { waterL: true }],
      [174, 713],
      [148, 713],                        // Anthony Nogues
      [124, 707],
      [108, 693],
      [102, 668, { pit: 'R', grand: 'L' }],
    ],
    theme: {
      sky: { top: '#2f6fd0', horizon: '#bfe0ff' },
      fog: { color: '#cfe4f7', density: 0.00055 },
      sun: { color: '#fff3dc', intensity: 3.0, elevation: 52, azimuth: 150 },
      hemi: { sky: '#cfe3ff', ground: '#8c7a60', intensity: 1.25 },
      ground: 'urban', groundTint: '#b9b0a0',
      runoff: 'pavement', gravel: false,
      kerb: ['#d8262c', '#f4f4f4'],
      wall: { type: 'armco', color: '#c9ced4', stripe: '#d8262c' },
      hills: { amp: 30, scale: 450 },
      mountains: { color: '#57705a', height: [240, 520], dist: 1800, count: 14 },
      water: { level: -2, color: '#1a6b93' },
      trees: [{ type: 'palm', weight: 1 }, { type: 'round', weight: 0.25, tint: '#4f7d3a' }],
      treeDensity: 0.25,
      buildings: { density: 0.9, minH: 12, maxH: 45, palette: ['#f1e3c6', '#e9c9a3', '#f3d6cf', '#fbf4e6', '#e2b98f', '#d9d2c3'] },
      grandstands: { count: 3, len: 24, gap: 34 },
      banner: 'MONTE CARLO',
      yachts: 26,
    },
  },
  {
    id: 'suzuka',
    name: 'Suzuka Circuit',
    city: 'Suzuka',
    country: 'Japan',
    flag: 'jp',
    blurb: 'The figure-of-eight: flowing S-curves, Degner, the hairpin, Spoon and flat-out 130R back over the bridge.',
    length: 4500,
    width: 13,
    runoff: [8, 8],
    extraOutside: 12,
    figure8: true,
    bridgeHeight: 8.5,
    bridgeRamp: 150,
    points: [
      [600, 140, { pit: 'R', grand: 'L' }],
      [700, 142, { pit: 'R', grand: 'L' }],
      [800, 146],
      [890, 152],
      [942, 168],                 // Turn 1
      [968, 205],
      [958, 243],                 // Turn 2
      [922, 264],
      [880, 272],                 // S curves
      [849, 292],
      [818, 297],
      [788, 318],
      [757, 321],
      [722, 333],                 // Dunlop
      [690, 356],
      [670, 386],                 // Degner 1
      [652, 412],
      [622, 440],                 // Degner 2
      [590, 450],
      [520, 451],
      [470, 451],                 // the crossing, under the bridge
      [380, 451],
      [300, 450],
      [240, 450],
      [206, 452],                 // Hairpin
      [184, 463],
      [197, 476],
      [232, 480],
      [268, 489],                 // 200R
      [300, 510],
      [330, 560],
      [344, 604],                 // Spoon
      [372, 638],
      [404, 634],
      [416, 610],
      [434, 556],                 // back straight, over the bridge
      [452, 502],
      [470, 450],
      [492, 386],
      [508, 336],                 // 130R
      [514, 296],
      [506, 258],
      [499, 236],                 // Casio Triangle
      [512, 222],
      [504, 205],
      [508, 178],                 // final curve
      [528, 152],
      [556, 141],
    ],
    theme: {
      sky: { top: '#5b8fd6', horizon: '#e9eef5' },
      fog: { color: '#e3e8ef', density: 0.00048 },
      sun: { color: '#fff1e2', intensity: 2.8, elevation: 38, azimuth: 120 },
      hemi: { sky: '#d9e6ff', ground: '#6f6a52', intensity: 1.2 },
      ground: 'grass', groundTint: '#6f9a45',
      runoff: 'grass', gravel: true,
      kerb: ['#d8262c', '#f4f4f4'],
      wall: { type: 'tyres', color: '#1c1c1c', stripe: '#f4f4f4' },
      hills: { amp: 16, scale: 420 },
      mountains: { color: '#4f6f63', height: [220, 480], dist: 1900, count: 16 },
      trees: [{ type: 'cherry', weight: 1 }, { type: 'pine', weight: 0.9 }, { type: 'round', weight: 0.4, tint: '#4c7a33' }],
      treeDensity: 0.55,
      buildings: { density: 0.03, minH: 6, maxH: 14, palette: ['#e8e4da', '#cfd6dc'] },
      banner: 'SUZUKA',
      ferris: true,
    },
  },
  {
    id: 'monza',
    name: 'Autodromo Nazionale Monza',
    city: 'Monza',
    country: 'Italy',
    flag: 'it',
    blurb: 'The Temple of Speed: long straights through the royal park, the Lesmos, Ascari and the endless Parabolica.',
    length: 4400,
    width: 13,
    runoff: [9, 9],
    extraOutside: 16,
    points: [
      [150, 700, { pit: 'R', grand: 'L' }],
      [150, 600, { pit: 'R', grand: 'L' }],
      [150, 480],
      [150, 390],
      [152, 344],                 // Variante del Rettifilo
      [160, 323],
      [172, 316],
      [179, 300],
      [184, 258],                 // Curva Grande
      [203, 199],
      [243, 151],
      [302, 119],
      [364, 111],
      [470, 119],                 // Variante della Roggia
      [492, 119],
      [505, 110],
      [521, 110],
      [534, 118],
      [600, 141],                 // Lesmo 1
      [641, 159],
      [661, 186],
      [666, 216],
      [663, 262],                 // Lesmo 2
      [656, 291],
      [636, 321],
      [590, 401],                 // Serraglio
      [546, 481],
      [521, 541],
      [511, 601],
      [506, 651],
      [509, 671],                 // Variante Ascari
      [513, 691],
      [506, 713],
      [493, 731],
      [489, 753],
      [470, 851],                 // Rettifilo Centro
      [441, 931],
      [421, 966],                 // Curva Parabolica
      [386, 991],
      [331, 1001],
      [271, 996],
      [216, 976],
      [176, 946],
      [156, 916],
      [151, 860, { pit: 'R', grand: 'L' }],
      [150, 780, { pit: 'R', grand: 'L' }],
    ],
    theme: {
      sky: { top: '#4a86d4', horizon: '#f6e7cf' },
      fog: { color: '#eadfcb', density: 0.00045 },
      sun: { color: '#ffe2b8', intensity: 2.9, elevation: 30, azimuth: 250 },
      hemi: { sky: '#d6e4ff', ground: '#5f6a3c', intensity: 1.2 },
      ground: 'grass', groundTint: '#62923e',
      runoff: 'grass', gravel: true,
      kerb: ['#d8262c', '#f4f4f4'],
      wall: { type: 'armco', color: '#c9ced4', stripe: '#1f8f3a' },
      hills: { amp: 3, scale: 500 },
      mountains: { color: '#6b7f9c', height: [180, 380], dist: 2800, count: 12 },
      trees: [{ type: 'round', weight: 1, tint: '#3f6f2c' }, { type: 'round', weight: 0.6, tint: '#5a8a38' }, { type: 'pine', weight: 0.3 }],
      treeDensity: 0.95,
      buildings: { density: 0, minH: 6, maxH: 12, palette: ['#e8d9bd'] },
      grandstands: { count: 6, len: 36, gap: 42 },
      banner: 'MONZA',
    },
  },
  {
    id: 'bathurst',
    name: 'Mount Panorama',
    city: 'Bathurst',
    country: 'Australia',
    flag: 'au',
    blurb: 'A public road up a mountain: 175 metres of climb, walls at the Cutting, the Dipper plunge and a flat-out Conrod Straight.',
    length: 4800,
    width: 12,
    runoff: [7, 7],
    extraOutside: 10,
    points: [
      [300, 850, { pit: 'L', grand: 'R' }],
      [400, 850, { pit: 'L', grand: 'R' }],
      [480, 849],
      [522, 843],                             // Hell Corner
      [540, 822],
      [544, 790, { h: 6 }],
      [548, 700, { h: 22 }],                  // Mountain Straight
      [556, 600, { h: 40 }],
      [570, 452, { h: 56 }],
      [582, 421, { h: 62 }],                  // Griffins Bend
      [604, 402, { h: 68 }],
      [627, 386, { h: 78, runoff: 2 }],       // The Cutting
      [634, 364, { h: 92, runoff: 1.5 }],
      [619, 345, { h: 104, runoff: 1.5 }],
      [594, 340, { h: 112, runoff: 1.5 }],
      [541, 335, { h: 126, runoff: 2 }],      // Reid Park
      [500, 316, { h: 138, runoff: 2 }],
      [460, 296, { h: 152, runoff: 2 }],      // Sulman Park
      [410, 290, { h: 163, runoff: 2 }],
      [360, 282, { h: 171, runoff: 2 }],      // McPhillamy Park
      [320, 292, { h: 175, runoff: 2 }],
      [290, 288, { h: 174, runoff: 2 }],      // Skyline
      [268, 272, { h: 168, runoff: 2 }],
      [250, 270, { h: 160, runoff: 2 }],      // The Esses
      [236, 285, { h: 150, runoff: 2 }],
      [222, 300, { h: 140, runoff: 2 }],
      [205, 302, { h: 132, runoff: 2 }],
      [190, 312, { h: 124, runoff: 2 }],      // The Dipper
      [178, 330, { h: 116, runoff: 2 }],
      [165, 345, { h: 110, runoff: 2.5 }],
      [140, 350, { h: 106, runoff: 3 }],      // Forrest Elbow
      [118, 356, { h: 102, runoff: 3 }],
      [110, 378, { h: 96 }],
      [114, 480, { h: 62 }],                  // Conrod Straight
      [124, 600, { h: 26 }],
      [140, 700, { h: 8 }],
      [150, 742, { h: 4 }],                   // The Chase
      [147, 772],
      [161, 791],
      [176, 801],
      [186, 830, { h: 1 }],                   // Murray's Corner
      [211, 849],
      [242, 852, { pit: 'L', grand: 'R' }],
    ],
    theme: {
      sky: { top: '#2a62c4', horizon: '#d9ecff' },
      fog: { color: '#d3e2ee', density: 0.00038 },
      sun: { color: '#fff0d4', intensity: 3.0, elevation: 40, azimuth: 30 },
      hemi: { sky: '#cfe0ff', ground: '#7a6a45', intensity: 1.2 },
      ground: 'dry', groundTint: '#a3a15a',
      runoff: 'grass', gravel: false,
      kerb: ['#d8262c', '#f4f4f4'],
      wall: { type: 'concrete', color: '#dcdad4', stripe: '#1f4fa8' },
      hills: { amp: 45, scale: 520 },
      mountains: { color: '#5d6f57', height: [200, 430], dist: 2100, count: 16 },
      trees: [{ type: 'eucalyptus', weight: 1 }, { type: 'eucalyptus', weight: 0.6, tint: '#71805a' }],
      treeDensity: 0.7,
      buildings: { density: 0.02, minH: 5, maxH: 9, palette: ['#e4dccb', '#cfc6b3'] },
      banner: 'BATHURST',
    },
  },
];
