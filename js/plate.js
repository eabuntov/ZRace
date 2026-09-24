// Number plates on the back of the cars, carrying the driver's name.
//
// The plate is styled on the green gradient plate China gives new-energy vehicles, which
// every car here would wear. It is one small plane and one small canvas texture: on a
// built car it replaces the blank plate the builder already puts there; on a scan, where
// the rear of the body could be anywhere, the tail is found by casting a few rays at it
// once per model, and the plate is laid on the surface at the tilt the rays report.
import * as THREE from 'three';

const W = 0.44, H = 0.14;                        // metres - a real plate is 440 x 140 mm
const CW = 384, CH = 122;                        // canvas, same proportions

function paint(ctx, text) {
  const g = ctx.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, '#f2fbf3');
  g.addColorStop(0.55, '#9fe0ae');
  g.addColorStop(1, '#3fb766');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, CW - 10, CH - 10);
  // the two rivets
  ctx.fillStyle = '#6d7a72';
  for (const x of [34, CW - 34]) { ctx.beginPath(); ctx.arc(x, 20, 5, 0, Math.PI * 2); ctx.fill(); }
  const label = String(text || '').toUpperCase().slice(0, 14) || '—';
  // as large as fits: short names fill the plate, long ones shrink to stay on it
  let size = 78;
  ctx.font = `bold ${size}px Arial, sans-serif`;
  const room = CW - 44;
  const w = ctx.measureText(label).width;
  if (w > room) { size = Math.max(30, Math.floor(size * room / w)); ctx.font = `bold ${size}px Arial, sans-serif`; }
  ctx.fillStyle = '#101312';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, CW / 2, CH / 2 + 4);
}

function makeTexture(text) {
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  paint(c.getContext('2d'), text);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Race plates are shared by text, so a grid rebuilt race after race does not leave a
// trail of textures behind it. The showroom plate is its own, and redrawn as you type.
const shared = new Map();
function sharedMaterial(text) {
  if (!shared.has(text)) {
    shared.set(text, new THREE.MeshStandardMaterial({ map: makeTexture(text), roughness: 0.45, metalness: 0.1 }));
  }
  return shared.get(text);
}

const geo = new THREE.PlaneGeometry(W, H);
geo.userData.shared = true;                      // never disposed with a race scene

// Where the tail of a scan is, per model: found once, since every clone is placed alike.
const tails = new Map();
const ray = new THREE.Raycaster();

// A few scans model their own plate as a named part. Where one does, ours goes straight
// over the rear half of it, rather than a second plate appearing above or below it.
const MODEL_PLATE = /car_?plate|licen[cs]e/i;

function modelledPlate(root) {
  let lo = null, hi = null;
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !MODEL_PLATE.test(o.name || '')) return;
    const pos = o.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
      if (v.z > 0) continue;                     // the front plate, if it is the same part
      if (!lo) { lo = v.clone(); hi = v.clone(); } else { lo.min(v); hi.max(v); }
    }
  });
  if (!lo || hi.y - lo.y < 0.04) return null;
  return { y: (lo.y + hi.y) / 2, z: lo.z, tilt: 0 };
}

function scanTail(root, spec) {
  if (tails.has(spec.id)) return tails.get(spec.id);
  root.updateMatrixWorld(true);
  const own = modelledPlate(root);
  if (own) { tails.set(spec.id, own); return own; }
  // `spec.plateY` is for scans whose own plate is painted into a texture, where nothing
  // but a look at the model says where it is
  const y0 = spec.plateY ?? Math.min(0.8, Math.max(0.45, spec.dims.H * 0.42));
  const back = -spec.dims.L;                     // well behind the car, looking forwards
  const hitAt = (x, y) => {
    ray.set(new THREE.Vector3(x, y, back), new THREE.Vector3(0, 0, 1));
    ray.far = spec.dims.L;
    const hit = ray.intersectObject(root, true).find((h) => !h.object.userData.zracePlate);
    return hit ? hit.point.z : null;
  };
  // The rearmost point across each row of the plate's footprint - a plate recess with a
  // lip over it would otherwise swallow the top of the plate - and the tilt from the top
  // row to the bottom one, so it lies along a raked tailgate rather than poking out of it.
  const row = (y) => {
    const zs = [-3, -2, -1, 0, 1, 2, 3].map((k) => hitAt((k / 3) * W / 2, y)).filter((z) => z != null);
    return zs.length ? Math.min(...zs) : null;
  };
  const zUp = row(y0 + H / 2), zMid = row(y0), zDn = row(y0 - H / 2);
  let tilt = 0;
  if (zUp != null && zDn != null) tilt = Math.max(-0.6, Math.min(0.6, Math.atan2(zUp - zDn, H)));
  // The centre goes far enough back that, tilted, neither edge is inside the body: the top
  // edge sits `s` further forward than the centre and the bottom edge `s` further back.
  const s = Math.sin(tilt) * H / 2;
  const limits = [zMid, zUp != null ? zUp - s : null, zDn != null ? zDn + s : null].filter((z) => z != null);
  const z = limits.length ? Math.min(...limits) : -spec.dims.L / 2 + 0.05;
  const out = { y: y0, z, tilt };
  tails.set(spec.id, out);
  return out;
}

// Puts a plate on `root` (a built car or a placed scan, nose towards +Z, standing at the
// origin) reading `text`. `own` gives the car a texture of its own, for the showroom.
export function attachPlate(root, spec, text, { own = false } = {}) {
  const mat = own
    ? new THREE.MeshStandardMaterial({ map: makeTexture(text), roughness: 0.45, metalness: 0.1 })
    : sharedMaterial(text);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.zracePlate = true;
  mesh.rotation.y = Math.PI;                     // the plane faces -Z, out of the tail
  const mount = new THREE.Group();
  const blank = root.getObjectByName('zrace-plate-blank');
  if (blank) {
    // a built car: take the blank plate's place, just proud of it
    mount.position.copy(blank.position);
    mount.position.z -= 0.012;
    blank.scale.set(W / 0.3, H / 0.1, 1);        // the backing grows to frame the bigger plate
  } else {
    const tail = scanTail(root, spec);
    mount.position.set(0, tail.y, tail.z - 0.012);
    mount.rotation.x = tail.tilt;
  }
  mount.add(mesh);
  root.add(mount);
  root.userData.plate = { mesh, own, text };
  return mesh;
}

// Rewrites the showroom plate in place.
export function setPlateText(root, text) {
  const p = root && root.userData.plate;
  if (!p || p.text === text) return;
  p.text = text;
  if (p.own) {
    paint(p.mesh.material.map.image.getContext('2d'), text);
    p.mesh.material.map.needsUpdate = true;
  } else {
    p.mesh.material = sharedMaterial(text);
  }
}
