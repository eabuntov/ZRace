// The ZEEKR line-up: specs used by the physics, and low-poly models built from a
// parametric side profile that is extruded and tapered, so each model keeps its own
// silhouette (compact crossover, fastback, shooting brake, SUV, MPV).
//
// Performance figures are game-tuned for racing, not manufacturer data.
//
// Profile coordinates are in metres in car space: +Z is forward, the origin sits on the
// ground in the middle of the wheelbase.
//   ride  ground clearance of the sill      noseY  top of the nose
//   hoodY top of the bonnet                 beltY  window line (top of the lower body)
//   tailY top of the tailgate               roofY  roof height
//   ws    bottom of the windscreen          rf/rb  front/back of the roof
//   rg    bottom of the rear screen
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
    dims: { L: 4.43, W: 1.84, H: 1.57, wb: 2.75, wheelR: 0.35 },
    mass: 1900, power: 315000, accel: 3.8, vTop: 53, grip: 1.02, brake: 1.04, agility: 1.12,
    body: { ride: 0.20, noseY: 0.70, hoodY: 0.88, beltY: 0.94, tailY: 1.08, roofY: 1.57,
      ws: 1.05, rf: 0.10, rb: -1.25, rg: -1.75, twoTone: true, cladding: true },
    paint: 0, front: 'split',
  },
  {
    id: '007',
    name: 'ZEEKR 007',
    type: 'Fastback sedan',
    tagline: 'Low, slippery and quick off the line.',
    dims: { L: 4.87, W: 1.90, H: 1.45, wb: 2.93, wheelR: 0.37 },
    mass: 2150, power: 475000, accel: 2.9, vTop: 58, grip: 1.10, brake: 1.08, agility: 1.04,
    body: { ride: 0.16, noseY: 0.58, hoodY: 0.80, beltY: 0.86, tailY: 0.98, roofY: 1.45,
      ws: 1.15, rf: 0.15, rb: -1.05, rg: -2.10, twoTone: false },
    paint: 1, front: 'stargate',
  },
  {
    id: '001',
    name: 'ZEEKR 001',
    type: 'Shooting brake',
    tagline: 'Long wheelbase, long roof, huge straight-line punch.',
    dims: { L: 4.97, W: 2.00, H: 1.55, wb: 3.00, wheelR: 0.38 },
    mass: 2320, power: 580000, accel: 3.2, vTop: 66, grip: 1.08, brake: 1.05, agility: 0.98,
    body: { ride: 0.17, noseY: 0.60, hoodY: 0.84, beltY: 0.90, tailY: 1.04, roofY: 1.55,
      ws: 1.20, rf: 0.20, rb: -1.40, rg: -2.15, twoTone: false },
    paint: 2, front: 'stargate',
  },
  {
    id: '001fr',
    name: 'ZEEKR 001 FR',
    type: 'Four-motor flagship',
    tagline: 'The fast one: four motors, lowered, wide arches.',
    dims: { L: 4.97, W: 2.04, H: 1.50, wb: 3.00, wheelR: 0.39 },
    mass: 2400, power: 930000, accel: 2.1, vTop: 78, grip: 1.22, brake: 1.18, agility: 1.06,
    body: { ride: 0.13, noseY: 0.56, hoodY: 0.80, beltY: 0.86, tailY: 1.00, roofY: 1.50,
      ws: 1.20, rf: 0.20, rb: -1.40, rg: -2.15, twoTone: false, wing: true },
    paint: 4, front: 'stargate',
  },
  {
    id: '7x',
    name: 'ZEEKR 7X',
    type: 'Mid-size SUV',
    tagline: 'Heavier, but it hides the weight well.',
    dims: { L: 4.83, W: 1.93, H: 1.66, wb: 2.93, wheelR: 0.39 },
    mass: 2400, power: 475000, accel: 3.2, vTop: 58, grip: 1.00, brake: 1.00, agility: 0.98,
    body: { ride: 0.22, noseY: 0.74, hoodY: 0.94, beltY: 1.00, tailY: 1.16, roofY: 1.66,
      ws: 1.05, rf: 0.10, rb: -1.40, rg: -1.95, twoTone: true, cladding: true },
    paint: 3, front: 'split',
  },
  {
    id: '009',
    name: 'ZEEKR 009',
    type: 'Luxury MPV',
    tagline: 'Six seats, nearly three tonnes and a wall of light at the front.',
    dims: { L: 5.21, W: 2.02, H: 1.85, wb: 3.21, wheelR: 0.38 },
    mass: 2820, power: 400000, accel: 4.4, vTop: 53, grip: 0.92, brake: 0.94, agility: 0.88,
    body: { ride: 0.20, noseY: 0.86, hoodY: 1.06, beltY: 1.12, tailY: 1.30, roofY: 1.85,
      ws: 1.45, rf: 0.85, rb: -2.00, rg: -2.50, twoTone: false, van: true },
    paint: 5, front: 'waterfall',
  },
];

// --- wheels ------------------------------------------------------------------
let rimTexture = null;
function getRimTexture() {
  if (rimTexture) return rimTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#14161a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.save();
  ctx.translate(128, 128);
  ctx.fillStyle = '#cfd4da';
  ctx.beginPath(); ctx.arc(0, 0, 112, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b1e23';
  for (let i = 0; i < 10; i++) {
    ctx.save();
    ctx.rotate((i / 10) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(-9, -26);
    ctx.lineTo(9, -26);
    ctx.lineTo(15, -106);
    ctx.lineTo(-15, -106);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#9aa1a8';
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2f35';
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  rimTexture = new THREE.CanvasTexture(c);
  rimTexture.colorSpace = THREE.SRGBColorSpace;
  return rimTexture;
}

function buildWheel(r, width) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  const tyreMat = new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.9 });
  const rimSide = new THREE.MeshStandardMaterial({ color: '#20242a', roughness: 0.5, metalness: 0.7 });
  const rimFace = new THREE.MeshStandardMaterial({ map: getRimTexture(), roughness: 0.35, metalness: 0.85 });
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 20, 1, true), tyreMat);
  tyre.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.99, r * 0.99, width * 0.9, 20), [rimSide, rimFace, rimFace]);
  rim.rotation.z = Math.PI / 2;
  spin.add(tyre, rim);
  g.add(spin);           // outer group steers, inner group spins
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// --- body --------------------------------------------------------------------
function bodyExtents(spec) {
  const { L, wb } = spec.dims;
  return {
    zF: wb / 2 + (L - wb) * 0.46,        // front bumper
    zR: -(wb / 2 + (L - wb) * 0.54),     // rear bumper
  };
}

function lowerBodyShape(spec) {
  const { wb, wheelR } = spec.dims;
  const b = spec.body;
  const { zF, zR } = bodyExtents(spec);
  const archR = wheelR + 0.09;
  const y0 = b.ride;
  const s = new THREE.Shape();
  s.moveTo(zR + 0.14, y0);
  s.lineTo(-wb / 2 - archR, y0);
  s.absarc(-wb / 2, y0 - 0.03, archR, Math.PI, 0, true);   // rear wheel arch
  s.lineTo(wb / 2 - archR, y0);
  s.absarc(wb / 2, y0 - 0.03, archR, Math.PI, 0, true);    // front wheel arch
  s.lineTo(zF - 0.26, y0);
  s.quadraticCurveTo(zF - 0.02, y0 + 0.02, zF - 0.01, y0 + 0.26);   // front bumper
  s.lineTo(zF, b.noseY);
  s.quadraticCurveTo(zF - 0.18, b.hoodY - 0.10, zF - 0.42, b.hoodY - 0.03); // bonnet
  s.lineTo(b.ws + 0.04, b.hoodY);
  s.lineTo(b.ws - 0.10, b.beltY);                                    // cowl step
  s.lineTo(b.rg + 0.18, b.beltY);                                    // window line
  s.quadraticCurveTo(zR + 0.42, b.tailY, zR + 0.16, b.tailY - 0.04); // tailgate
  s.lineTo(zR + 0.01, b.tailY - 0.28);
  s.lineTo(zR, y0 + 0.38);                                           // rear bumper
  s.closePath();
  return s;
}

function cabinShape(spec) {
  const b = spec.body;
  const y = b.beltY - 0.04;
  const s = new THREE.Shape();
  s.moveTo(b.ws - 0.03, y);
  s.lineTo(b.rf, b.roofY);          // windscreen
  s.lineTo(b.rb, b.roofY);          // roof
  s.lineTo(b.rg, y);                // rear screen
  s.closePath();
  return s;
}

function taper(geo, fn) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * fn(pos.getX(i), pos.getY(i)));
  pos.needsUpdate = true;
}

function extrude(shape, width, bevel = 0.05) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 3, curveSegments: 12,
  });
  geo.translate(0, 0, -width / 2);
  return geo;
}

// Profile X becomes car Z (forward); the extrusion axis becomes car X.
function finish(geo) {
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

export function buildCar(spec, paintHex, opts = {}) {
  const { W, wb, wheelR } = spec.dims;
  const b = spec.body;
  const { zF, zR } = bodyExtents(spec);
  const halfW = W / 2;
  const group = new THREE.Group();
  const paint = PAINTS.find((p) => p.hex === paintHex) || PAINTS[spec.paint];
  const matte = !!paint.matte;

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(paintHex || paint.hex),
    metalness: matte ? 0.3 : 0.7,
    roughness: matte ? 0.58 : 0.28,
    clearcoat: matte ? 0.3 : 0.95,
    clearcoatRoughness: matte ? 0.45 : 0.08,
    envMapIntensity: 1.15,
    flatShading: true,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#0c1117', metalness: 0.4, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.7,
    flatShading: true,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.62, metalness: 0.3 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.2, metalness: 0.95 });

  // lower body
  const bodyGeo = extrude(lowerBodyShape(spec), W - 0.1);
  taper(bodyGeo, (x, y) => {
    const nose = 1 - 0.17 * smooth01((x - (zF - 0.8)) / 0.8);
    const tail = 1 - 0.12 * smooth01((zR + 0.8 - x) / 0.8);
    const top = 1 - 0.09 * smooth01((y - b.hoodY * 0.55) / 0.7);
    const sill = 1 - 0.09 * smooth01((b.ride + 0.24 - y) / 0.3);
    return nose * tail * top * sill;
  });
  group.add(new THREE.Mesh(finish(bodyGeo), bodyMat));

  // glasshouse
  const cabGeo = extrude(cabinShape(spec), (W - 0.1) * 0.92, 0.035);
  taper(cabGeo, (x, y) => 1 - 0.17 * smooth01((y - b.beltY) / Math.max(0.25, b.roofY - b.beltY)));
  group.add(new THREE.Mesh(finish(cabGeo), glassMat));

  // roof panel (contrasting on the two-tone cars)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.78, 0.055, Math.abs(b.rb - b.rf)),
    b.twoTone ? trimMat : bodyMat
  );
  roof.position.set(0, b.roofY + 0.01, (b.rf + b.rb) / 2);
  group.add(roof);

  // chrome window surround along the glass base
  const trim = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.03, Math.abs(b.ws - b.rg) * 0.96), chromeMat);
  trim.position.set(0, b.beltY - 0.02, (b.ws + b.rg) / 2);
  group.add(trim);

  // black cladding on the crossovers
  if (b.cladding) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.17, (zF - zR) * 0.5), trimMat);
    sill.position.set(0, b.ride + 0.07, (zF + zR) / 2);
    group.add(sill);
    for (const zAx of [wb / 2, -wb / 2]) {
      for (const sx of [-1, 1]) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(wheelR + 0.12, 0.05, 6, 14, Math.PI), trimMat);
        arch.rotation.y = Math.PI / 2;
        arch.position.set(sx * (halfW - 0.05), wheelR + 0.01, zAx);
        group.add(arch);
      }
    }
  }

  // lights
  const headMat = new THREE.MeshStandardMaterial({ color: '#eaf3ff', emissive: '#bcdcff', emissiveIntensity: 1.5, roughness: 0.25 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#c8202a', emissive: '#ff2a1c', emissiveIntensity: 1.2, roughness: 0.3 });
  const frontZ = zF + 0.01;
  if (spec.front === 'waterfall') {
    const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.66, 0.52, 0.06), chromeMat);
    grille.position.set(0, b.noseY - 0.06, frontZ - 0.02);
    group.add(grille);
    for (let i = -5; i <= 5; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.48, 0.08), headMat);
      bar.position.set(i * (W * 0.058), b.noseY - 0.06, frontZ);
      group.add(bar);
    }
  } else {
    const wide = spec.front === 'stargate' ? 0.84 : 0.72;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(W * wide, 0.07, 0.07), headMat);
    bar.position.set(0, b.hoodY - 0.16, frontZ - 0.02);
    group.add(bar);
    if (spec.front === 'split') {
      for (const sx of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(W * 0.2, 0.1, 0.07), headMat);
        lamp.position.set(sx * W * 0.3, b.noseY - 0.16, frontZ - 0.03);
        group.add(lamp);
      }
    }
  }

  // full-width rear light bar - the family signature
  const rearBar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.08, 0.06), tailMat);
  rearBar.position.set(0, b.tailY - 0.26, zR - 0.01);
  group.add(rearBar);

  if (b.wing) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.05, 0.3), trimMat);
    wing.position.set(0, b.tailY + 0.14, zR + 0.42);
    group.add(wing);
    for (const sx of [-1, 1]) {
      const stay = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.16), trimMat);
      stay.position.set(sx * W * 0.28, b.tailY + 0.05, zR + 0.42);
      group.add(stay);
    }
  }

  // mirrors
  for (const sx of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.085, 0.19), trimMat);
    mirror.position.set(sx * (halfW + 0.04), b.beltY + 0.11, b.ws - 0.2);
    group.add(mirror);
  }

  // wheels
  const wheelWidth = 0.26 + (W - 1.84) * 0.14;
  const proto = buildWheel(wheelR, wheelWidth);
  const wheels = [];
  const track = halfW - wheelWidth * 0.55;
  for (const [zi, xi] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const w = proto.clone(true);
    w.position.set(xi * track, wheelR, zi * (wb / 2));
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
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), numMat);
      plate.position.set(sx * (halfW + 0.01), b.beltY - 0.30, -wb * 0.12);
      plate.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(plate);
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
  u.tailMat.emissiveIntensity = state.braking ? 3.6 : 1.1;
}
