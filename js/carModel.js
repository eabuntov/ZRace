// Scanned models for the car-select screen.
//
// The cars on track are built in code because six of them are on screen at once and they
// have to be cheap. The select screen only ever shows one, standing still, so it can
// afford a scanned model instead - the same references the procedural hulls are measured
// against, stripped of their interiors and their four spare wheel sets, then simplified
// and quantised to roughly a fifth of the triangles and an eighth of the bytes.
//
// Nothing here is allowed to leave the menu empty-handed. A scan that fails to arrive, or
// a car that has none, resolves to null and the caller stands the code-built car on the
// turntable instead. Scenes are cached on first sight, so every later look is immediate.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PAINTS } from './cars.js';

// The assets are meshopt-compressed: these models arrive with every vertex split, so
// welding and simplification can do little, and compressing the buffer is what keeps them
// to a few megabytes. The decoder is one self-contained module - no separate wasm fetch.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();                       // url -> Promise<THREE.Group | null>

// Exports arrive at whatever scale and facing they were left in - one of these is 1/100
// scale, another 1/2.6, and the 7X is over a hundred thousand units long - so the car is
// placed by its own bounding box rather than by trusting any transform in the file. Which
// way it faces cannot be measured, so `spec.modelYaw` carries it: the two ZEEKR scans are
// modelled nose toward -Z and everything else nose toward +Z.
function place(scene, spec) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const k = spec.dims.L / Math.max(size.x, size.z);
  scene.scale.setScalar(k);
  scene.position.set(-mid.x * k, -box.min.y * k, -mid.z * k);
  // The turntable writes the root's rotation every frame, so the turn that brings the
  // nose round to +Z has to live on a group of its own underneath it.
  const yaw = new THREE.Group();
  yaw.rotation.y = (spec.modelYaw || 0) + (size.x > size.z ? Math.PI / 2 : 0);
  yaw.add(scene);
  const root = new THREE.Group();
  root.add(yaw);
  root.userData.shared = true;                 // geometry is cached - never dispose it
  return root;
}

// Which material carries the paint is entirely up to whoever built the model:
// car_paint_bai, Car_Paint, CarPaint, ..._Carpaint, or just `body`. Where the name gives
// nothing away - the GC9 calls it Material.001 - `spec.paintMat` names it outright.
const PAINT_MAT = /car[\s_]?paint|^body$/i;

function isPaint(mat, spec) {
  const name = mat.name || '';
  return spec.paintMat ? name === spec.paintMat : PAINT_MAT.test(name);
}

// The body colour is swapped on a clone, so the cached scene keeps its own materials and
// every other part of the car goes on sharing them. One clone is made per material rather
// than per mesh: a dozen meshes wear the paint and they should stay one material between
// them. The clones are marked so the colour can be changed again later without reloading.
function repaint(root, spec, paint) {
  const clones = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const many = Array.isArray(o.material);
    const mats = (many ? o.material : [o.material]).map((m) => {
      if (!isPaint(m, spec)) return m;
      if (!clones.has(m)) {
        const c = m.clone();
        c.userData = { ...c.userData, zracePaint: true };
        clones.set(m, c);
      }
      return clones.get(m);
    });
    o.material = many ? mats : mats[0];
  });
  applyPaint(root, paint);
  return clones.size;
}

function applyPaint(root, paint) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of [].concat(o.material)) {
      if (!m.userData || !m.userData.zracePaint) continue;
      m.color.set(paint.hex);
      m.metalness = paint.matte ? 0.2 : 0.6;
      m.roughness = paint.matte ? 0.55 : 0.18;
      m.needsUpdate = true;
      n++;
    }
  });
  return n;
}

// Recolour a car already standing on the turntable. Returns how many materials changed, so
// a caller can tell the difference between "done" and "this scan has no separable paint" -
// the Monjaro is one mesh with one material covering glass and wheels as well as bodywork,
// and tinting that would tint the whole car.
export function repaintShowroomCar(root, paintHex) {
  const paint = PAINTS.find((p) => p.hex === paintHex) || PAINTS[0];
  return applyPaint(root, paint);
}

export function loadShowroomCar(spec, paintHex) {
  if (!spec.model) return Promise.resolve(null);
  if (!cache.has(spec.model)) {
    cache.set(spec.model, new Promise((resolve) => {
      loader.load(spec.model, (gltf) => resolve(gltf.scene), undefined, (err) => {
        console.warn(`showroom model ${spec.model} did not load`, err);
        resolve(null);
      });
    }));
  }
  return cache.get(spec.model).then((scene) => {
    if (!scene) return null;
    const root = place(scene.clone(true), spec);
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    repaint(root, spec, PAINTS.find((p) => p.hex === paintHex) || PAINTS[spec.paint]);
    return root;
  });
}
