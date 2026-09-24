// ZRace - what the tyres leave behind: rubber on the road, smoke off it, dust off the
// verges. None of it is in the physics; it all reads the state the physics already keeps
// (`slide`, `surface`, `speed`), so it can never change how a car drives.
import * as THREE from 'three';
import { puffTexture } from './textures.js';

// Height of each surface's top above the centreline, from the ribbons in trackBuild.js.
// A mark sits a few millimetres above the one under it, with polygon offset to keep it
// from flickering through.
const SURFACE_TOP = { road: 0.05, kerb: 0.09 };
const EDGE_LINE_TOP = 0.075;
const MARK_LIFT = 0.006;

// Lateral slip, in m/s, at which rubber starts going down. The tyre squeal starts well
// below this (audio.js, at 0.8), and that is on purpose: a car that squeals through a
// quick corner is working, one that paints the road is sliding.
const SKID_FROM = 2.0;
const SKID_FULL = 7.0;
const SMOKE_FROM = 2.8;

const SEGMENTS = 4096;          // quads of rubber kept before the oldest are reused
const PARTICLES = 900;
const EMIT_RANGE = 260;         // no smoke or dust for cars further than this from the camera

// What each run-off throws up, per metre per second of speed, per wheel.
const DUST = {
  gravel: { rate: 0.8, colour: '#cbbd9d', alpha: 0.75, size: [0.7, 4.2], life: 1.4 },
  grass: { rate: 0.3, colour: '#857b56', alpha: 0.5, size: [0.5, 2.6], life: 0.9 },
  dry: { rate: 0.6, colour: '#b09c70', alpha: 0.7, size: [0.7, 4.0], life: 1.5 },
};
const SMOKE = { colour: '#e2e4e8', alpha: 0.7, size: [0.9, 5.2], life: 2.1 };

export class TyreEffects {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.trails = new Map();
    this._marks();
    this._particles();
  }

  // --- rubber -----------------------------------------------------------------
  // One ring buffer of separate quads, each from where a wheel was on the last mark to
  // where it is now. Separate rather than a strip, so a trail can stop and start anywhere
  // without the buffer needing to know which quads belong to which trail.
  _marks() {
    const g = new THREE.BufferGeometry();
    this.markPos = new THREE.BufferAttribute(new Float32Array(SEGMENTS * 4 * 3), 3);
    this.markCol = new THREE.BufferAttribute(new Float32Array(SEGMENTS * 4 * 4), 4);
    this.markPos.setUsage(THREE.DynamicDrawUsage);
    this.markCol.setUsage(THREE.DynamicDrawUsage);
    const index = new Uint32Array(SEGMENTS * 6);
    for (let q = 0; q < SEGMENTS; q++) index.set([q * 4, q * 4 + 2, q * 4 + 1, q * 4 + 1, q * 4 + 2, q * 4 + 3], q * 6);
    g.setAttribute('position', this.markPos);
    g.setAttribute('color', this.markCol);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.marks = new THREE.Mesh(g, mat);
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 1;
    this.scene.add(this.marks);
    this.markNext = 0;
    this.markCount = 0;
    this.markRubber = new THREE.Color('#121314');
  }

  _addMark(a, b, sx, sz, halfW) {
    const q = this.markNext;
    const p = this.markPos.array, c = this.markCol.array;
    const o = q * 12;
    p[o] = a.x + sx * halfW; p[o + 1] = a.y; p[o + 2] = a.z + sz * halfW;
    p[o + 3] = a.x - sx * halfW; p[o + 4] = a.y; p[o + 5] = a.z - sz * halfW;
    p[o + 6] = b.x + sx * halfW; p[o + 7] = b.y; p[o + 8] = b.z + sz * halfW;
    p[o + 9] = b.x - sx * halfW; p[o + 10] = b.y; p[o + 11] = b.z - sz * halfW;
    const r = this.markRubber;
    const k = q * 16;
    for (let v = 0; v < 4; v++) {
      c[k + v * 4] = r.r; c[k + v * 4 + 1] = r.g; c[k + v * 4 + 2] = r.b;
      c[k + v * 4 + 3] = v < 2 ? a.a : b.a;
    }
    this.markPos.addUpdateRange(o, 12);
    this.markCol.addUpdateRange(k, 16);
    this.markPos.needsUpdate = this.markCol.needsUpdate = true;
    this.markNext = (q + 1) % SEGMENTS;
    this.markCount = Math.min(SEGMENTS, this.markCount + 1);
    this.marks.geometry.setDrawRange(0, this.markCount * 6);
  }

  // --- smoke and dust -------------------------------------------------------------
  _particles() {
    const n = PARTICLES;
    const g = new THREE.BufferGeometry();
    const attr = (size) => {
      const a = new THREE.BufferAttribute(new Float32Array(n * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pPos = attr(3); this.pCol = attr(3); this.pSize = attr(1); this.pAlpha = attr(1); this.pRot = attr(1);
    g.setAttribute('position', this.pPos);
    g.setAttribute('aColor', this.pCol);
    g.setAttribute('aSize', this.pSize);
    g.setAttribute('aAlpha', this.pAlpha);
    g.setAttribute('aRot', this.pRot);
    // what the GPU does not need: velocity, age and how each one grows and fades
    this.pVel = new Float32Array(n * 3);
    this.pAge = new Float32Array(n);
    this.pLife = new Float32Array(n);
    this.pGrow = new Float32Array(n * 2);
    this.pFade = new Float32Array(n);
    this.pSpin = new Float32Array(n);
    this.pNext = 0;
    this.live = 0;

    // Lit by the circuit's own light, roughly: halfway between the sky and the sun, so
    // Shanghai's smoke comes out as warm as its evening.
    const theme = this.world.theme;
    const tint = new THREE.Color(theme.hemi.sky).lerp(new THREE.Color(theme.sun.color), 0.5).multiplyScalar(0.9);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: puffTexture() }, uScale: { value: 500 }, uTint: { value: tint } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aRot; attribute vec3 aColor;
        uniform float uScale;
        varying float vAlpha; varying float vRot; varying vec3 vColor;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = -mv.z;
          gl_PointSize = aSize * uScale / max(dist, 0.5);
          // thins out into the haze far off, and right in front of the lens, where one
          // puff would otherwise fill the screen
          vAlpha = aAlpha * (1.0 - smoothstep(170.0, 420.0, dist)) * smoothstep(0.8, 3.0, dist);
          vRot = aRot; vColor = aColor;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uTint;
        varying float vAlpha; varying float vRot; varying vec3 vColor;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float cs = cos(vRot), sn = sin(vRot);
          vec2 uv = vec2(cs*c.x - sn*c.y, sn*c.x + cs*c.y) + 0.5;
          float a = texture2D(map, uv).a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor * uTint, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.scene.add(this.points);
    this._c = new THREE.Color();
  }

  _emit(x, y, z, vx, vy, vz, kind, strength) {
    const i = this.pNext;
    this.pNext = (i + 1) % PARTICLES;
    const r = Math.random;
    this.pPos.array.set([x, y, z], i * 3);
    this.pVel[i * 3] = vx + (r() - 0.5) * 1.4;
    this.pVel[i * 3 + 1] = vy + r() * 0.8;
    this.pVel[i * 3 + 2] = vz + (r() - 0.5) * 1.4;
    this._c.set(kind.colour).multiplyScalar(0.9 + r() * 0.2);
    this.pCol.array.set([this._c.r, this._c.g, this._c.b], i * 3);
    this.pAge[i] = 0;
    this.pLife[i] = kind.life * (0.75 + r() * 0.5);
    this.pGrow[i * 2] = kind.size[0] * (0.8 + r() * 0.4);
    this.pGrow[i * 2 + 1] = kind.size[1] * (0.8 + r() * 0.4);
    this.pFade[i] = kind.alpha * Math.min(1, strength);
    this.pRot.array[i] = r() * Math.PI * 2;
    this.pSpin[i] = (r() - 0.5) * 1.2;
    this.pSize.array[i] = this.pGrow[i * 2];
    this.pAlpha.array[i] = 0;
  }

  _stepParticles(dt) {
    const drag = Math.exp(-dt * 1.6);
    const pos = this.pPos.array, vel = this.pVel;
    let live = 0;
    for (let i = 0; i < PARTICLES; i++) {
      const life = this.pLife[i];
      if (life <= 0) continue;
      const age = (this.pAge[i] += dt);
      if (age >= life) {
        this.pLife[i] = 0; this.pAlpha.array[i] = 0; this.pSize.array[i] = 0;
        continue;
      }
      live++;
      const t = age / life;
      vel[i * 3] *= drag; vel[i * 3 + 2] *= drag;
      vel[i * 3 + 1] = vel[i * 3 + 1] * drag + 0.35 * dt;   // warm air, rising
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      // grows quickly then slowly; fades in over the first tenth and out over the rest
      this.pSize.array[i] = this.pGrow[i * 2] + (this.pGrow[i * 2 + 1] - this.pGrow[i * 2]) * Math.sqrt(t);
      this.pAlpha.array[i] = this.pFade[i] * Math.min(1, t * 10) * (1 - t) * (1 - t);
      this.pRot.array[i] += this.pSpin[i] * dt;
    }
    this.live = live;
    for (const a of [this.pPos, this.pSize, this.pAlpha, this.pRot, this.pCol]) a.needsUpdate = true;
  }

  // --- per frame ------------------------------------------------------------------
  update(dt, cars, camera, viewHeight) {
    const cam = camera.position;
    for (const car of cars) {
      const near = Math.hypot(car.x - cam.x, car.z - cam.z) < EMIT_RANGE;
      this._car(car, dt, near);
    }
    this._stepParticles(dt);
    this.points.material.uniforms.uScale.value = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }

  _car(car, dt, near) {
    let trail = this.trails.get(car);
    if (!trail) {
      trail = { wheels: [0, 1, 2, 3].map(() => ({ on: false, x: 0, y: 0, z: 0, a: 0, emit: 0 })) };
      this.trails.set(car, trail);
    }
    const d = car.spec.dims;
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    const sx = fz, sz = -fx;                      // the car's left
    const half = d.W * 0.5 - d.tyre * 0.5;
    const p = car.proj;
    const slip = Math.max(0, (car.slide - SKID_FROM) / (SKID_FULL - SKID_FROM));
    const ground = this.world.theme.ground === 'dry' ? 'dry' : null;

    for (let w = 0; w < 4; w++) {
      const front = w < 2;
      const side = w % 2 === 0 ? 1 : -1;
      const along = (front ? 1 : -1) * d.wb * 0.5;
      const x = car.x + fx * along + sx * side * half;
      const z = car.z + fz * along + sz * side * half;
      const u = p.u + (x - car.x) * p.lx + (z - car.z) * p.lz;
      const surface = this.world.surfaceAt(p.i, u);
      const wh = trail.wheels[w];

      // rubber: the rears whenever the car is sliding, the fronts only when it is badly
      // sideways - which is also when they are scrubbing rather than rolling
      let top = SURFACE_TOP[surface];
      if (surface === 'road' && Math.abs(u) > this.world.path.halfW - 0.32) top = EDGE_LINE_TOP;
      const strength = top == null ? 0 : front ? Math.max(0, slip - 0.35) * 0.7 : Math.min(1, slip);
      if (strength > 0.02 && car.speed > 3) {
        const y = car.y + top + MARK_LIFT;
        const a = 0.55 * Math.min(1, strength);
        const jump = Math.hypot(x - wh.x, z - wh.z);
        if (!wh.on || jump > 4) {
          Object.assign(wh, { on: true, x, y, z, a: 0 });
        } else if (jump > 0.4) {
          this._addMark(wh, { x, y, z, a }, sx, sz, d.tyre * 0.5);
          Object.assign(wh, { x, y, z, a });
        }
      } else if (wh.on) {
        // let the trail thin out to nothing rather than stop dead
        if (Math.hypot(x - wh.x, z - wh.z) > 0.4 && wh.a > 0) {
          const y = top == null ? wh.y : car.y + top + MARK_LIFT;
          this._addMark(wh, { x, y, z, a: 0 }, sx, sz, d.tyre * 0.5);
        }
        wh.on = false;
      }

      if (!near || front) continue;
      // smoke off the tarmac, dust off everything that is not
      let kind = null, rate = 0;
      if (top != null) {
        if (car.slide > SMOKE_FROM && car.speed > 4) { kind = SMOKE; rate = (car.slide - SMOKE_FROM) * 12; }
      } else if (car.speed > 5) {
        kind = surface === 'gravel' ? DUST.gravel : surface === 'grass' ? (ground ? DUST.dry : DUST.grass) : null;
        if (kind) rate = kind.rate * car.speed;
      }
      if (!kind) { wh.emit = 0; continue; }
      wh.emit += Math.min(60, rate) * dt;
      const strengthP = kind === SMOKE ? Math.min(1, (car.slide - SMOKE_FROM) / 4 + 0.35) : 1;
      while (wh.emit >= 1) {
        wh.emit -= 1;
        this._emit(x, car.y + 0.3, z, car.vx * 0.3, 0.4, car.vz * 0.3, kind, strengthP);
      }
    }
  }

  dispose() {
    for (const o of [this.marks, this.points]) {
      this.scene.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    this.trails.clear();
  }
}
