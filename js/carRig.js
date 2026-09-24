// Turning a scanned model into something the race loop can drive.
//
// `animateCar` expects a car to expose userData.wheels (four groups, each spinning its
// first child), userData.steerWheels (the front two) and userData.tailMat. A code-built
// car is assembled that way from the start. A scan is not: it arrives as a heap of meshes
// split by material, with the wheels wherever the modeller left them.
//
// So the wheels are found by name, sorted into corners and re-parented under pivots of our
// own. Nothing moves - `attach` keeps every mesh exactly where it was in the world - it
// only changes what turns them.
//
// Three things make this messier than it sounds. Names like `carWheelHouse` are bodywork,
// not wheels. Some exports merge a part across corners - the SU7's brake discs are one
// mesh spanning both front wheels, its calipers one spanning all four - and those cannot
// be given to a single corner without dragging the others round with them, so they stay
// where they are. And a stray part caught by the name match will pull a wheel's centre off
// if the centre is taken from everything in that corner, so it is taken from the tyre.
//
// Everything is then checked against the car we think it is: four wheels of about the
// right radius, evenly spaced about the centreline, the right wheelbase apart. Anything
// that fails returns null and the caller races the code-built car, because a scanned body
// on wheels turning about the wrong point looks worse than a simpler car that behaves.
import * as THREE from 'three';

const WHEEL = /tire|tyre|luntai|lungu|rim|wheel|caliper|brake|disk|disc|hub/i;
const NOT_WHEEL = /house|arch|liner|fender|trim|window|glass|logo|badge|shell|body|door/i;
const TAIL = /tail|rear.?light|deng_red|red_emis|brakes|stop/i;

function isWheelish(o) {
  const tag = `${o.name || ''} ${o.material?.name || ''}`;
  return WHEEL.test(tag) && !NOT_WHEEL.test(tag);
}

const vol = (s) => s.x * s.y * s.z;

export function rigScan(root, spec) {
  const whole = new THREE.Box3().setFromObject(root);
  const size = whole.getSize(new THREE.Vector3());
  const mid = whole.getCenter(new THREE.Vector3());
  const dia = spec.dims.wheelR * 2;

  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || !isWheelish(o)) return;
    const box = new THREE.Box3().setFromObject(o);
    const s = box.getSize(new THREE.Vector3());
    // a part spanning corners belongs to no single wheel; leave it where it is
    if (s.x > size.x * 0.5 || s.z > size.z * 0.3) return;
    parts.push({ o, box, s, c: box.getCenter(new THREE.Vector3()) });
  });
  if (parts.length < 4) return null;

  // The biggest part in each corner is the tyre, and it is what the wheel turns about.
  // Anything else in that corner joins it only if it is close enough to belong to it.
  const corners = new Map();
  for (const p of parts) {
    const key = (p.c.x > mid.x ? 'R' : 'L') + (p.c.z > mid.z ? 'F' : 'B');
    const g = corners.get(key) || { key, parts: [] };
    g.parts.push(p);
    corners.set(key, g);
  }
  if (corners.size !== 4) return null;

  for (const g of corners.values()) {
    g.tyre = g.parts.reduce((a, b) => (vol(a.s) > vol(b.s) ? a : b));
    g.meshes = g.parts.filter((p) => p.c.distanceTo(g.tyre.c) < dia * 0.6).map((p) => p.o);
    g.centre = g.tyre.c;
    g.dia = Math.max(g.tyre.s.y, g.tyre.s.z);
  }

  // Does this actually look like the car's four wheels?
  const all = [...corners.values()];
  const near = (a, b, t) => Math.abs(a - b) <= t;
  const xs = all.map((g) => Math.abs(g.centre.x - mid.x));
  const track = xs.reduce((a, b) => a + b, 0) / 4;
  if (xs.some((x) => !near(x, track, track * 0.2 + 0.05))) return null;
  if (all.some((g) => !near(g.dia, dia, dia * 0.35))) return null;
  const zf = all.filter((g) => g.key[1] === 'F').map((g) => g.centre.z - mid.z);
  const zb = all.filter((g) => g.key[1] === 'B').map((g) => g.centre.z - mid.z);
  if (zf.length !== 2 || zb.length !== 2) return null;
  if (!near(zf[0], zf[1], 0.15) || !near(zb[0], zb[1], 0.15)) return null;
  const wb = Math.abs((zf[0] + zf[1]) / 2 - (zb[0] + zb[1]) / 2);
  if (!near(wb, spec.dims.wb, 0.35)) return null;

  // A steer group at the wheel's centre, a spin group inside it, the wheel inside that.
  // animateCar turns the outer one about Y and the inner one about X.
  const made = {};
  for (const g of all) {
    const steer = new THREE.Group();
    steer.position.copy(root.worldToLocal(g.centre.clone()));
    const spin = new THREE.Group();
    steer.add(spin);
    root.add(steer);
    for (const mesh of g.meshes) spin.attach(mesh);
    made[g.key] = steer;
  }

  // Brake lights: drive whichever emissive material reads as a tail lamp. Plenty of scans
  // have none, and a throwaway saves animateCar from having to care.
  let tailMat = null;
  root.traverse((o) => {
    if (tailMat || !o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (m && m.emissive && TAIL.test(m.name || '')) { tailMat = m; return; }
    }
  });
  // Every copy of a model shares its materials with the cached original, and the brake
  // lights are driven per car - so each rigged car gets a tail lamp of its own, or one car
  // braking would light up every other car built from the same scan.
  if (tailMat) {
    const shared = tailMat;
    tailMat = shared.clone();
    tailMat.emissive.setHex(0xff2a1c);
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (Array.isArray(o.material)) o.material = o.material.map((m) => (m === shared ? tailMat : m));
      else if (o.material === shared) o.material = tailMat;
    });
  } else tailMat = new THREE.MeshStandardMaterial();

  return {
    wheels: [made.LF, made.RF, made.LB, made.RB],
    steerWheels: [made.LF, made.RF],
    wheelR: spec.dims.wheelR,
    tailMat,
    spec,
  };
}
