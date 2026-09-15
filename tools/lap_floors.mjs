// Generates server/floors.json: the fastest lap each car could physically set on each
// circuit, which is what the score server uses to throw out impossible submissions.
//
// The board is public and unauthenticated, so anyone can POST a time at it. There is no
// way to prove a lap was driven, but there is a way to prove one was not: the game
// already works out, for the AI, the fastest speed a given car can carry through every
// point of the racing line. Integrating dt = ds / v along that line gives a lap time that
// assumes a perfect line, perfect braking, and - because this ignores how long the car
// takes to get back up to speed out of a corner - infinite acceleration. Nobody beats it.
// Anything quicker did not happen.
//
//   node tools/lap_floors.mjs            # writes server/floors.json
//   node tools/lap_floors.mjs --print    # show the table and write nothing
//
// Re-run it after changing a car's grip, brakes or top speed, or any circuit's layout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACKS } from '../js/tracks.js';
import { TrackPath } from '../js/trackPath.js';
import { computeRacingLine, lineCurvature } from '../js/ai.js';

// The margin below the ideal at which a time stops being merely excellent and starts
// being impossible. The ideal is already unreachable, so this only has to absorb the
// difference between this model and whatever the game's physics does on the day.
const MARGIN = 0.94;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// cars.js imports three.js, which is not installed here and is not needed for a table of
// numbers, so the specs are read straight out of the source.
function readCarSpecs() {
  const src = fs.readFileSync(path.join(root, 'js/cars.js'), 'utf8');
  const re = /\bid: '([\w-]+)',\s*\n\s*name: '([^']+)',[\s\S]*?\n\s*mass: (\d+), power: (\d+), accel: ([\d.]+), vTop: ([\d.]+), grip: ([\d.]+), brake: ([\d.]+)/g;
  const out = [];
  for (let m; (m = re.exec(src)); ) {
    out.push({
      id: m[1], name: m[2], mass: +m[3], power: +m[4],
      accel: +m[5], vTop: +m[6], grip: +m[7], brake: +m[8],
    });
  }
  if (!out.length) throw new Error('no car specs found in js/cars.js - has the format changed?');
  return out;
}

// A lap driven at the limit everywhere: cornering as hard as the tyres allow, braking as
// late as they allow, and accelerating as hard as the motor and whatever grip the corner
// is not using will allow. Three constraints, relaxed against each other until they stop
// moving, then integrated for time. It is the same speed profile the AI drives to with an
// acceleration pass added, and that pass is what makes the number tight enough to be
// worth checking against - without it the bound ignores how long a car takes to get back
// up to speed, and comes out about twenty seconds a lap too generous.
const G = 9.81;

function idealLap(p, line, car) {
  const n = p.n, ds = p.spacing;
  const k = lineCurvature(p, line);
  const latMax = car.grip * G;
  const brakeA = 11.2 * car.brake;
  const fMax = Math.min(car.mass * (27.78 / car.accel) * 1.15, car.grip * car.mass * G * 1.05);
  const tractionMax = car.grip * car.mass * G;
  const cd = car.power / Math.pow(car.vTop, 3);

  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = k[i] < 1e-6 ? car.vTop : Math.min(car.vTop, Math.sqrt(latMax / k[i]));
  }
  // The passes wrap around the lap, so they need a few goes to settle.
  for (let pass = 0; pass < 5; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n;
      const lim = Math.sqrt(v[j] * v[j] + 2 * brakeA * ds);
      if (v[i] > lim) v[i] = lim;
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const u = v[i];
      const latUse = Math.min(1, (u * u * k[i]) / latMax);
      const share = Math.max(0.3, Math.sqrt(1 - latUse * latUse));
      const drive = Math.min(fMax, car.power / Math.max(u, 4), tractionMax * share);
      const a = (drive - cd * u * u) / car.mass;
      const lim = Math.sqrt(Math.max(1, u * u + 2 * a * ds));
      if (v[j] > lim) v[j] = lim;
    }
  }
  let t = 0;
  for (let i = 0; i < n; i++) t += ds / Math.max(v[i], 1);
  return t;
}

const cars = readCarSpecs();
const floors = {};
const table = [];

for (const def of TRACKS) {
  const p = new TrackPath(def);
  const line = computeRacingLine(p);
  floors[def.id] = {};
  for (const car of cars) {
    const ideal = idealLap(p, line, car);
    floors[def.id][car.id] = Math.round(ideal * MARGIN * 1000);
    table.push({ track: def.id, car: car.id, ideal, floor: ideal * MARGIN });
  }
}

const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
for (const def of TRACKS) {
  console.log(`\n${def.name}`);
  for (const r of table.filter((r) => r.track === def.id)) {
    console.log(`  ${r.car.padEnd(9)} ideal ${fmt(r.ideal)}   reject faster than ${fmt(r.floor)}`);
  }
}

if (!process.argv.includes('--print')) {
  const dir = path.join(root, 'server');
  fs.mkdirSync(dir, { recursive: true });
  const out = { generated: new Date().toISOString().slice(0, 10), margin: MARGIN, floors };
  fs.writeFileSync(path.join(dir, 'floors.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`\nwrote server/floors.json - ${TRACKS.length} circuits x ${cars.length} cars`);
}
