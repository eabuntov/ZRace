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
  // Mark the geometry itself as well. The race tears its scene down by disposing every
  // geometry in it, and a scan racing as the player's car would take the cached original
  // with it - leaving every later view of that car empty.
  root.traverse((o) => { if (o.isMesh) o.geometry.userData.shared = true; });
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
  // A scan with nothing that reads as a paint material, but one colour map covering the
  // whole car, is repainted through that map instead - see tintAtlas. `spec.paintAtlas`
  // opts a car in, because it only works where the bodywork is the one near-white thing
  // in the texture, and that is a fact about the asset rather than something to guess at.
  const atlas = spec.paintAtlas && !collectPaintMats(root, spec).length;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const many = Array.isArray(o.material);
    const mats = (many ? o.material : [o.material]).map((m) => {
      if (!atlas && !isPaint(m, spec)) return m;
      if (atlas && !(m.map && m.map.image)) return m;
      if (!clones.has(m)) {
        const c = m.clone();
        c.userData = { ...c.userData, zracePaint: true };
        if (atlas) {
          c.userData.zraceAtlas = m.map;
          c.userData.zraceKeepOut = spec.paintAtlas.keepOut || [];
        }
        clones.set(m, c);
      }
      return clones.get(m);
    });
    o.material = many ? mats : mats[0];
  });
  applyPaint(root, paint);
  return clones.size;
}

function collectPaintMats(root, spec) {
  const found = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of [].concat(o.material)) if (isPaint(m, spec)) found.push(m);
  });
  return found;
}

function applyPaint(root, paint) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of [].concat(o.material)) {
      if (!m.userData || !m.userData.zracePaint) continue;
      if (m.userData.zraceAtlas) { tintAtlas(m, paint); n++; continue; }
      m.color.set(paint.hex);
      m.metalness = paint.matte ? 0.2 : 0.6;
      m.roughness = paint.matte ? 0.55 : 0.18;
      m.needsUpdate = true;
      n++;
    }
  });
  return n;
}

// Some scans are a single mesh wearing a single material, with the whole car - glass,
// tyres, lights and all - baked into one colour map. The Monjaro is one, and there is no
// material to tint that would not tint the windows with it. What there is, is a body
// painted white in that map: so the paint goes on texel by texel, over the bright and
// colourless pixels only. Tyres, glass and dark trim are far too dark to catch it and the
// lights are far too saturated. Polished alloys are the one thing that is as bright and
// as grey as white bodywork, and no rule about colour can separate them - so where they
// sit in the atlas is named by `keepOut` instead, in the spec, beside the model it
// describes. Boxes are [u0, v0, u1, v1] in image space, y down from the top left.
const BODY_MIN_LUMA = 0.62;
const BODY_MAX_SAT = 0.12;

function tintAtlas(mat, paint) {
  const src = mat.userData.zraceAtlas;          // the untouched original image
  const keepOut = mat.userData.zraceKeepOut || [];
  const img = src.image;
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const pr = parseInt(paint.hex.slice(1, 3), 16) / 255;
  const pg = parseInt(paint.hex.slice(3, 5), 16) / 255;
  const pb = parseInt(paint.hex.slice(5, 7), 16) / 255;
  const boxes = keepOut.map(([u0, v0, u1, v1]) =>
    [Math.floor(u0 * w), Math.floor(v0 * h), Math.ceil(u1 * w), Math.ceil(v1 * h)]);
  for (let y = 0; y < h; y++) {
    let masked = false;
    for (const b of boxes) if (y >= b[1] && y < b[3]) { masked = true; break; }
    for (let x = 0; x < w; x++) {
      if (masked) {
        let skip = false;
        for (const b of boxes) if (x >= b[0] && x < b[2] && y >= b[1] && y < b[3]) { skip = true; break; }
        if (skip) continue;
      }
      const i = (y * w + x) * 4;
      const r = px[i] / 255, g = px[i + 1] / 255, bl = px[i + 2] / 255;
      const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
      if (max < BODY_MIN_LUMA || max - min > BODY_MAX_SAT) continue;
      // Keep the shading that is baked in and carry the hue over it, so panel gaps,
      // dirt and the soft shadow under the arches all survive the respray.
      px[i] = Math.min(255, max * pr * 255 * 1.08);
      px[i + 1] = Math.min(255, max * pg * 255 * 1.08);
      px[i + 2] = Math.min(255, max * pb * 255 * 1.08);
    }
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = src.flipY;
  tex.colorSpace = src.colorSpace;
  tex.wrapS = src.wrapS; tex.wrapT = src.wrapT;
  if (mat.map && mat.map.isCanvasTexture) mat.map.dispose();
  mat.map = tex;
  mat.color.set('#ffffff');
  mat.needsUpdate = true;
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
