// Scanned models for the car-select screen.
//
// The cars on track are built in code because six of them are on screen at once and they
// have to be cheap. The select screen only ever shows one, standing still, so it can
// afford a scanned model instead - the same references the procedural hulls are measured
// against, stripped of their interiors and their four spare wheel sets, then simplified
// and quantised to roughly a fifth of the triangles and an eighth of the bytes.
//
// Nothing here is allowed to hold up the menu. The code-built car goes on the turntable
// straight away and the scan replaces it whenever it finishes arriving; a download that
// fails, or a car with no scan, simply leaves the built one there.
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

// The paint chips have to keep working, so the body colour is swapped on a clone of the
// paint material; every other material is shared with the cached scene untouched.
function repaint(root, paint) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const many = Array.isArray(o.material);
    const mats = (many ? o.material : [o.material]).map((m) => {
      if (!/car_paint/i.test(m.name || '')) return m;
      const c = m.clone();
      c.color = new THREE.Color(paint.hex);
      c.metalness = paint.matte ? 0.2 : 0.6;
      c.roughness = paint.matte ? 0.55 : 0.18;
      return c;
    });
    o.material = many ? mats : mats[0];
  });
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
    repaint(root, PAINTS.find((p) => p.hex === paintHex) || PAINTS[spec.paint]);
    return root;
  });
}
