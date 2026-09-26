// ZRace - game shell: renderer, showroom, race loop and race rules.
import * as THREE from 'three';
import { TRACKS } from './tracks.js';
import { TrackPath } from './trackPath.js';
import { TrackWorld } from './trackBuild.js';
import { CARS, PAINTS, buildCar, animateCar, addBoostJet } from './cars.js';
import { loadShowroomCar, repaintShowroomCar } from './carModel.js';
import { rigScan } from './carRig.js';
import { Vehicle, resolveCollisions } from './physics.js';
import { Caravan } from './caravan.js';
import { AIDriver, computeRacingLine, driverName } from './ai.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { UI, formatTime } from './ui.js';
import { PostFX } from './post.js';
import { TyreEffects } from './effects.js';
import * as Records from './records.js';
import { t, num, setLanguage } from './i18n.js';
import { setMaxAnisotropy, shadowTexture, glowTexture, studioFloorTexture } from './textures.js';

const DIFF = {
  easy: { skill: 0.86, rubber: 0.022 },
  normal: { skill: 0.935, rubber: 0.016 },
  hard: { skill: 1.0, rubber: 0.008 },
};

const CAM_MODES = [
  { name: 'chase', back: 7.4, up: 3.0, ahead: 7, lookUp: 0.9, fov: 62 },
  { name: 'close', back: 5.0, up: 2.2, ahead: 6, lookUp: 0.8, fov: 66 },
  { name: 'bonnet', bonnet: true, fov: 72 },
];

const STORE = 'zeekrcircuit.v1';

// Hand the keyboard back to the game. Whatever the player last clicked still has focus -
// the RESUME button, a menu button, the name box - and a focused element sees the key
// first: the name box swallows W outright, and a button treats Space as a click. Racing
// starts, and resumes, with nothing in the page holding on to it.
const takeKeyboard = () => {
  const el = document.activeElement;
  if (el && el !== document.body && typeof el.blur === 'function') el.blur();
};

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 9000);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.post = new PostFX(this.renderer);

    this.settings = Object.assign(
      { carIndex: 0, paintIndex: 0, trackIndex: 0, laps: 3, opponents: 5, difficulty: 'normal',
        name: Records.DEFAULT_NAME, lang: 'auto', caravans: false, glow: false, scans: false, coins: 0 },
      this.load()
    );
    this.best = this.settings.best || {};
    this.post.enabled = !!this.settings.glow;
    this.records = Records.load();
    this.recordTrack = this.settings.trackIndex;
    this.recordScope = 'global';
    this.recordReq = 0;
    // Ask once, in the background, whether this deployment has a shared board behind
    // /api. Nothing waits on the answer; the records screen just falls back without it.
    Records.probe().then((up) => { if (!up) this.recordScope = 'local'; });

    this.input = new Input();
    this.audio = new AudioEngine();
    this.state = 'menu';
    this.camMode = 0;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    // Camera shake: a smoothed level, a decaying kick for impacts, a phase to drive the
    // oscillators, and two scratch vectors so the loop allocates nothing.
    this.shake = 0;
    this.shakeKick = 0;
    this.shakeT = 0;
    this.shakeRight = new THREE.Vector3();
    this.shakeUp = new THREE.Vector3();
    // Somebody who has asked their system not to animate things at them should not be
    // handed a shaking camera the moment they put two wheels on the grass.
    this.calmCamera = matchMedia('(prefers-reduced-motion: reduce)');

    this.tracks = TRACKS.map((def) => ({ def, path: new TrackPath(def) }));

    this.ui = new UI({
      onNav: (target) => this.nav(target),
      onCar: (i) => this.pickCar(i),
      onPaint: (i) => this.pickPaint(i),
      onTrack: (i) => this.pickTrack(i),
      onOption: (k, v) => this.setOption(k, v),
      onName: (v) => this.setName(v),
      onRecordTrack: (i) => { this.recordTrack = i; this.showRecords(); },
      onRecordScope: (v) => {
        this.recordScope = v;
        // asking for the shared board again is also asking whether it is back
        if (v === 'global' && !Records.isOnline()) Records.probe().then(() => this.showRecords());
        else this.showRecords();
      },
      onLanguage: (code) => this.pickLanguage(code),
      onStart: () => this.startRace(),
      onResume: () => this.resume(),
      onRestart: () => this.startRace(),
    });

    this.buildShowroom();
    this.ui.buildCars(CARS, PAINTS, this.settings);
    this.ui.buildTracks(this.tracks, this.settings);
    this.ui.buildOptions(this.settings);
    this.ui.buildLanguages(this.settings.lang);
    this.ui.setName(this.settings.name);
    this.ui.setCoins(this.settings.coins || 0);
    this.ui.show('title');

    this.bindKeys();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    if (matchMedia('(pointer: coarse)').matches) {
      document.getElementById('touch').classList.remove('hidden');
      this.input.bindTouchControls(document.getElementById('touch'));
    }
    window.addEventListener('pointerdown', () => this.audio.resume(), { once: true });
    window.addEventListener('keydown', () => this.audio.resume(), { once: true });

    this.bootFromQuery();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // --------------------------------------------------------------- storage
  load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ ...this.settings, best: this.best }));
    } catch { /* private mode */ }
  }

  // ------------------------------------------------------------- showroom
  // The showroom gets a studio of its own rather than the sky a circuit uses. A sky is
  // one bright dome overhead: it lights a roof and a bonnet and leaves the flanks, the
  // sills and the wheels to fall away into the background, which is why the car on the
  // turntable looked like it was parked in an unlit garage. This is a light box: walls,
  // three bright strips across the ceiling, and a floor bright enough to bounce. Paint
  // is mostly a mirror, so this map does more for how the car reads than any of the
  // lamps below it - the strips are what draw the long highlights down its length - and
  // it is the backdrop as well, so the room is one room whether you look at it or at
  // its reflection.
  studioEnv() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0.00, '#9fb0c4');          // ceiling
    g.addColorStop(0.30, '#4a5462');          // upper wall
    g.addColorStop(0.50, '#333b46');          // horizon
    g.addColorStop(0.60, '#48525f');          // floor, lit near the car
    g.addColorStop(1.00, '#222830');          // floor, away from it
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);

    // A soft-edged blob, stretched: a strip light seen in a mirror has no hard edge.
    const blob = (cx, cy, rx, ry, alpha, core = 0.45) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx, ry);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(core, 'rgba(255,255,255,0.92)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rg;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    };

    // Three overhead strips, spread around the compass so the car is never turned to a
    // side that has nothing to reflect.
    for (const cx of [148, 512, 876]) blob(cx, 86, 190, 40, 1);
    // and the bounce back up off the floor
    for (const cx of [148, 512, 876]) blob(cx, 352, 230, 64, 0.30, 0.2);

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    // Kept, not disposed: the same map is the backdrop, so the room reflected in the
    // paint and the room behind the car are one and the same.
    return { env: this.pmrem.fromEquirectangular(tex).texture, backdrop: tex };
  }

  // Projectors on the rig, aimed at the turntable. The strips spread light evenly over
  // everything, which is even but flat; a spot is what puts a bright pool on the floor
  // and a hard edge along a shoulder line, and it is the difference between a car that
  // is merely visible and one that looks lit. Three of them, from three directions, so
  // the turntable never presents a side that nothing is pointed at.
  addProjectors(s) {
    const aim = new THREE.Object3D();
    aim.position.set(0, 0.85, 0);
    s.add(aim);

    const shell = new THREE.MeshStandardMaterial({ color: '#171d26', roughness: 0.45, metalness: 0.7 });
    const glass = new THREE.MeshBasicMaterial({ color: '#f4f8ff' });
    const barrelGeo = new THREE.CylinderGeometry(0.36, 0.5, 1.2, 20, 1, true);
    const lensGeo = new THREE.CircleGeometry(0.36, 20);
    const yokeGeo = new THREE.TorusGeometry(0.54, 0.055, 6, 20);

    for (const [az, colour, power] of [[0.65, '#ffffff', 1500], [2.75, '#d7e8ff', 1150], [4.65, '#ffdfbe', 1150]]) {
      const at = new THREE.Vector3(Math.sin(az) * 13, 7.6, Math.cos(az) * 13);
      const spot = new THREE.SpotLight(colour, power, 46, 0.38, 0.65, 2);
      spot.position.copy(at);
      spot.target = aim;
      s.add(spot);

      const rig = new THREE.Group();
      const barrel = new THREE.Mesh(barrelGeo, shell);
      barrel.rotation.x = Math.PI / 2;            // the cylinder runs down +Z, the way it points
      const lens = new THREE.Mesh(lensGeo, glass);
      lens.position.z = 0.61;
      const yoke = new THREE.Mesh(yokeGeo, shell);
      rig.add(barrel, lens, yoke);
      rig.position.copy(at);
      rig.lookAt(aim.position);                   // a Mesh turns its +Z to face a point
      s.add(rig);
    }
  }

  // The three strips, as things you can see. The environment map already puts them in
  // the paint; without anything on screen the highlights sliding along the bodywork are
  // reflections of nothing, and the scene reads as flat however bright it gets.
  addStudioStrips(s) {
    const housing = new THREE.MeshStandardMaterial({ color: '#141922', roughness: 0.55, metalness: 0.6 });
    const lens = new THREE.MeshBasicMaterial({ color: '#eef5ff' });
    // The halo is what a bright strip does to a camera, faked: additive, never written
    // to the depth buffer, so it lies over whatever is behind it instead of cutting it.
    const halo = new THREE.MeshBasicMaterial({
      color: '#9fc8ff', transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const housingGeo = new THREE.BoxGeometry(13, 0.24, 0.8);
    const lensGeo = new THREE.PlaneGeometry(12.5, 0.58);
    const haloGeo = new THREE.PlaneGeometry(13.2, 1.3);

    for (const z of [-4.4, 0, 4.4]) {
      const bar = new THREE.Group();
      const box = new THREE.Mesh(housingGeo, housing);
      const face = new THREE.Mesh(lensGeo, lens);
      face.rotation.x = Math.PI / 2;               // pointing at the floor
      face.position.y = -0.13;
      const glow = new THREE.Mesh(haloGeo, halo);
      glow.rotation.x = Math.PI / 2;
      glow.position.y = -0.16;
      bar.add(box, face, glow);
      bar.position.set(0, 5.9, z);
      s.add(bar);
    }
  }

  buildShowroom() {
    const s = (this.showroom = new THREE.Scene());
    const { env, backdrop } = this.studioEnv();
    s.environment = env;
    s.background = backdrop;
    s.backgroundBlurriness = 0.35;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshStandardMaterial({ map: studioFloorTexture(), roughness: 0.36, metalness: 0.35 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    // The pool of light the strips throw on the floor. A turntable standing in a black
    // void gives the eye nothing to put the car on; this is the ground it stands on.
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(15, 64),
      new THREE.MeshBasicMaterial({
        map: glowTexture(), transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.006;
    s.add(pool);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(3.9, 4.1, 0.18, 64),
      new THREE.MeshStandardMaterial({ color: '#232932', roughness: 0.42, metalness: 0.45 })
    );
    disc.position.y = -0.09;
    disc.receiveShadow = true;
    s.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.02, 0.035, 8, 96),
      new THREE.MeshBasicMaterial({ color: '#37e0a6' })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    s.add(ring);

    this.addStudioStrips(s);
    this.addProjectors(s);

    const key = new THREE.DirectionalLight('#ffffff', 3.1);
    key.position.set(6, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
    key.shadow.bias = -0.0008;
    // Low and warm from the front quarter. Every other lamp here is above the car, and
    // something has to reach under the arches and along the sills or the bottom half of
    // the car stays a silhouette however bright the top half is.
    const kick = new THREE.DirectionalLight('#ffd9b4', 1.2);
    kick.position.set(-5, 1.1, 9);
    // The ground colour is the floor answering back. Near-black here was half the
    // problem: it meant everything below the waistline was lit by nothing at all.
    const fill = new THREE.HemisphereLight('#dfecff', '#3c4553', 1.5);
    s.add(key, kick, fill);

    // A fill that rides with the camera. Every other lamp here is bolted to the room, so
    // whichever way the turntable had got to, the side facing you was in shadow half the
    // time. This one is always on the side you are looking from.
    this.showFill = new THREE.DirectionalLight('#e8f1ff', 1.6);
    s.add(this.showFill, this.showFill.target);

    this.showCar = null;
    this.showAngle = 0.6;
  }

  // The turntable shows the scan itself. Building a code car first only to throw it away
  // a moment later made the screen flicker, and there is no need: every car has a scan,
  // the load starts at boot rather than when the screen opens, and a scan already seen is
  // cached and comes back in well under a tenth of a second. Whatever is on the platform
  // stays there until the next one is ready, so changing car never shows an empty stand.
  // The code-built car remains the fallback for a download that fails.
  // Scanned models share cached geometry, so only built ones are ever disposed.
  dropShowroomCar() {
    if (!this.showCar) return;
    this.showroom.remove(this.showCar);
    if (!this.showCar.userData.shared) {
      this.showCar.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.showCar = null;
  }

  refreshShowroomCar() {
    const spec = CARS[this.settings.carIndex];
    const paintHex = PAINTS[this.settings.paintIndex].hex;
    const token = (this.showToken = (this.showToken || 0) + 1);
    const put = (car) => {
      if (token !== this.showToken) {            // the choice moved on while this loaded
        if (car && !car.userData.shared) car.traverse((o) => o.geometry && o.geometry.dispose());
        return;
      }
      this.dropShowroomCar();
      this.showCar = car;
      this.showroom.add(car);
    };
    loadShowroomCar(spec, paintHex)
      .then((model) => put(model || buildCar(spec, paintHex)))
      .catch(() => put(buildCar(spec, paintHex)));
  }

  // ----------------------------------------------------------------- menus
  nav(target) {
    this.audio.click();
    if (target === 'car' || target === 'timetrial') {
      if (target === 'timetrial') this.setOption('opponents', 0);
      this.refreshShowroomCar();
      this.ui.show('car');
      this.state = 'menu';
    } else if (target === 'track') {
      // Reached from the car screen, and from CHANGE CIRCUIT on the results screen - in
      // which case the race behind it has to be torn down, or its scene goes on rendering
      // (and its cars go on driving) underneath the menu.
      if (this.state !== 'menu') this.endRace(true);
      this.ui.show('track');
    } else if (target === 'controls') {
      this.ui.show('controls');
    } else if (target === 'options') {
      this.ui.show('options');
    } else if (target === 'records') {
      this.recordTrack = this.settings.trackIndex;
      this.showRecords();
    } else if (target === 'title') {
      this.ui.show('title');
    } else if (target === 'quit') {
      this.endRace(true);
      this.ui.show('title');
    }
  }

  // Paints from what is already in hand, then fills the shared board in when it lands.
  // The request is tagged, so flicking between circuits while one is in flight cannot
  // have the slow answer overwrite the board you are actually looking at.
  showRecords() {
    const def = this.tracks[this.recordTrack].def;
    const you = Records.cleanName(this.settings.name);
    const local = Records.forTrack(this.records, def.id);
    const scope = Records.isOnline() ? this.recordScope : 'local';
    const req = ++this.recordReq;

    const paint = (rows) => this.ui.buildRecords({
      tracks: this.tracks, sel: this.recordTrack, rows, you, scope,
      online: Records.isOnline(),
    });
    paint(scope === 'global' ? null : local);
    this.ui.show('records');

    if (scope !== 'global') return;
    Records.globalBoard(def.id).then((rows) => {
      if (req !== this.recordReq || this.ui.current !== 'records') return;
      if (rows) return paint(rows);
      // Nothing came back. Someone who opened a record board wants to see records, so
      // show them the ones this machine has rather than an apology where a table was.
      this.recordScope = 'local';
      this.showRecords();
    });
  }

  // Loads the catalogue, then rebuilds everything the menus drew from the old one.
  // Static markup is rewritten by setLanguage itself; these are the screens this class
  // builds by hand, plus the car panel, whose text is a car away from its own screen.
  async pickLanguage(code) {
    this.settings.lang = code;
    this.audio.click();
    await setLanguage(code === 'auto' ? null : code);
    this.ui.buildCars(CARS, PAINTS, this.settings);
    this.ui.buildTracks(this.tracks, this.settings);
    this.ui.buildOptions(this.settings);
    this.ui.buildLanguages(this.settings.lang);
    if (this.ui.current === 'records') this.showRecords();
    this.save();
  }

  setName(v) {
    this.settings.name = Records.cleanName(v);
    this.save();
  }

  pickCar(i) {
    this.settings.carIndex = i;
    this.ui.selectCar(i);
    this.ui.updateCarInfo(CARS[i]);
    this.refreshShowroomCar();
    this.audio.click();
    this.save();
  }

  pickPaint(i) {
    this.settings.paintIndex = i;
    this.ui.selectPaint(i);
    // A scan on the turntable is recoloured where it stands - the colour is one material
    // away, and reloading and re-placing a car to change it is work for nothing. The
    // code-built car bakes its paint in at build time, so that one does need rebuilding.
    if (this.showCar && this.showCar.userData.shared) {
      repaintShowroomCar(this.showCar, PAINTS[i].hex);
    } else {
      this.refreshShowroomCar();
    }
    this.audio.click();
    this.save();
  }

  pickTrack(i) {
    this.settings.trackIndex = i;
    this.ui.selectTrack(i);
    this.audio.click();
    this.save();
  }

  setOption(k, v) {
    this.settings[k] = v;
    if (k === 'glow') this.post.enabled = !!v;
    this.ui.buildOptions(this.settings);
    this.save();
  }

  bindKeys() {
    this.input.on('KeyC', () => { if (this.state === 'racing' || this.state === 'finished') this.camMode = (this.camMode + 1) % CAM_MODES.length; });
    // Rejoining is rate-limited: a rejoin is a teleport, and holding R down a dozen times
    // a second is not something any circuit should have to answer for.
    this.input.on('KeyR', () => {
      if (this.state !== 'racing' || !this.player) return;
      if (this.raceTime - this.lastRespawn < 1.5) return;
      this.lastRespawn = this.raceTime;
      this.player.respawn();
    });
    this.input.on('KeyM', () => { this.audio.setMuted(!this.audio.muted); this.ui.message(t(this.audio.muted ? 'msg.muted' : 'msg.soundOn'), '', 900); });
    const pause = () => {
      if (this.state === 'racing' || this.state === 'countdown') this.pause();
      else if (this.state === 'paused') this.resume();
    };
    this.input.on('KeyP', pause);
    this.input.on('Escape', pause);
  }

  // ------------------------------------------------------------------ race
  startRace() {
    this.audio.click();
    this.endRace(true);
    this.ui.loading('loading.circuit');
    this.ui.hudVisible(false);
    // let the loading screen paint before the (synchronous) build
    setTimeout(() => this.buildRace(), 60);
  }

  buildRace() {
    const t0 = performance.now();
    const { def, path } = this.tracks[this.settings.trackIndex];
    this.raceScene = new THREE.Scene();
    // a phone or tablet gets thinner woods: tens of thousands of trees are cheap on a
    // desktop graphics card and not on a phone's
    this.world = new TrackWorld(this.raceScene, path, def, { lite: matchMedia('(pointer: coarse)').matches });
    this.raceScene.environment = this.world.environment(this.pmrem);
    this.path = path;
    this.def = def;
    this.line = computeRacingLine(path);

    const diff = DIFF[this.settings.difficulty];
    const n = this.settings.opponents + 1;
    const playerSpec = CARS[this.settings.carIndex];
    // Opponents are drawn from the models closest in performance to the player's car,
    // so a race in the ZEEKR X is not simply a procession of 001 FRs.
    const perf = (c) => Math.pow(c.power / c.mass, 0.35) * Math.pow(c.grip, 0.6) * Math.pow(c.vTop, 0.35);
    const pp = perf(playerSpec);
    const others = CARS.filter((c) => c.id !== playerSpec.id)
      .sort((a, b) => Math.abs(perf(a) - pp) - Math.abs(perf(b) - pp));
    this.cars = [];
    this.shadows = [];
    // a scan that arrives after this race has been torn down must not land in the next one
    this.raceId = (this.raceId || 0) + 1;
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 });

    for (let i = 0; i < n; i++) {
      const isPlayer = i === n - 1;              // player starts at the back
      const spec = isPlayer ? playerSpec : others[i % others.length];
      const v = new Vehicle(spec, this.world);
      const slot = i;
      const u = (slot % 2 === 0 ? 1 : -1) * path.halfW * 0.42;
      v.placeAt(-9 - slot * 8.5, u, { lapOffset: -path.length });
      v.isPlayer = isPlayer;
      const paint = isPlayer ? PAINTS[this.settings.paintIndex].hex : PAINTS[(i * 3 + 2) % PAINTS.length].hex;
      const [code, name] = driverName(i);
      v.code = isPlayer ? Records.driverCode(this.settings.name) : code;
      v.driver = isPlayer ? Records.cleanName(this.settings.name) : name;
      v.mesh = buildCar(spec, paint, { number: isPlayer ? 1 : i + 2 });
      v.mesh.rotation.order = 'YXZ';
      this.raceScene.add(v.mesh);
      if (isPlayer || this.settings.scans) this.raceScan(v, paint);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(spec.dims.L * 1.25, spec.dims.W * 2.0), shadowMat);
      sh.rotation.x = -Math.PI / 2;
      this.raceScene.add(sh);
      this.shadows.push(sh);
      v.race = { n: -1, lapStart: 0, laps: [], best: null, finished: false, finishTime: null };
      if (!isPlayer) {
        v.ai = new AIDriver(v, path, this.line, { skill: diff.skill * (0.975 + 0.02 * ((i * 7) % 5) / 4) });
      }
      this.cars.push(v);
    }
    this.player = this.cars[this.cars.length - 1];
    if (this.autopilot) this.player.ai = new AIDriver(this.player, path, this.line, { skill: 0.95 });

    // Опционально, по многочисленным просьбам. The caravan is built after the cars and
    // kept out of `this.cars`, so lap counting, the standings and the results table never
    // see it - the only thing that crosses back is a count of coins.
    this.caravan = this.settings.caravans ? new Caravan(this.raceScene, path, this.world) : null;
    this.tyreFx = new TyreEffects(this.raceScene, this.world);
    this.ui.coinsVisible(!!this.caravan);

    this.ui.prepMinimap(path);
    this.raceTime = 0;
    this.countdown = 0.9;
    this.lightCount = 0;
    this.goDelay = 0;
    this.state = 'countdown';
    this.camMode = 0;
    this.wrongWay = 0;
    this.finishTimer = 0;
    this.resultsShown = false;
    this.lastRespawn = -99;
    this.world.setStartLights(0);
    this.ui.lights(0, true);
    this.ui.hudVisible(true);
    this.ui.show(null);
    this.ui.clearMessage();
    // Crossing the finish line takes the controls away, and pausing does too. Both are
    // undone from one place - here - because a new race is the one moment they must be
    // live again no matter which way it was started: race again, a different car, or
    // restart from the pause menu. Leaving it to whoever disabled them is how a race
    // after a finished race ended up with a car that ignored the throttle.
    this.input.enabled = true;
    takeKeyboard();
    this.input.clear();
    this.audio.start();
    document.body.classList.add('racing');

    const f = path.sampleAt(path.wrapS(-9 - (n - 1) * 8.5));
    this.camPos.set(f.x - f.tx * 9, f.y + 3.4, f.z - f.tz * 9);
    this.camLook.set(f.x, f.y + 1, f.z);
    console.log(`[zrace] ${t(`track.${def.id}.name`)} built in ${Math.round(performance.now() - t0)} ms`);
  }

  // The player's car is the one on screen for the whole race, so it always gets the scan.
  // The opponents stay code-built unless the options ask otherwise, which is what keeps the
  // draw calls down: a scan is dozens of meshes where a built car is a handful. The scan
  // has to be rigged first - a scanned body on wheels that do not turn is worse than a
  // simpler car that behaves - and if that fails the built car simply stays where it is.
  // It arrives whenever the model has downloaded, so the car swaps over mid-race if needs be.
  raceScan(v, paintHex) {
    const race = this.raceId;
    loadShowroomCar(v.spec, paintHex).then((scan) => {
      if (!scan || race !== this.raceId || !this.cars || !this.cars.includes(v)) return;
      const rig = rigScan(scan, v.spec);
      if (!rig) {
        console.info(`[zrace] ${v.spec.name}: scan has no separable wheels, racing the built car`);
        return;
      }
      scan.userData = { ...scan.userData, ...rig };
      addBoostJet(scan, v.spec);
      scan.rotation.order = 'YXZ';
      scan.position.copy(v.mesh.position);
      scan.quaternion.copy(v.mesh.quaternion);
      this.raceScene.remove(v.mesh);
      v.mesh.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
      v.mesh = scan;
      this.raceScene.add(scan);
    });
  }

  endRace(clear) {
    if (this.caravan) { this.caravan.dispose(); this.caravan = null; }
    if (this.tyreFx) { this.tyreFx.dispose(); this.tyreFx = null; }
    if (this.world) { this.world.dispose(); this.world = null; }
    if (this.raceScene) {
      this.raceScene.traverse((o) => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      });
      this.raceScene = null;
    }
    this.cars = null;
    this.player = null;
    this.audio.stop();
    document.body.classList.remove('racing');
    if (clear) {
      this.state = 'menu';
      this.ui.hudVisible(false);
      this.ui.lights(0, false);
    }
  }

  pause() {
    if (this.state === 'paused') return;
    this.prevState = this.state;
    this.state = 'paused';
    this.input.enabled = false;
    this.audio.stop();
    document.body.classList.remove('racing');
    this.ui.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.prevState || 'racing';
    this.input.enabled = true;
    takeKeyboard();
    this.input.clear();
    this.audio.start();
    document.body.classList.add('racing');
    this.ui.show(null);
  }

  // --------------------------------------------------------------- systems
  updateRace(dt) {
    const cars = this.cars;
    const diff = DIFF[this.settings.difficulty];

    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        if (this.lightCount < 5) {
          this.lightCount++;
          this.countdown = 0.75;
          this.world.setStartLights(this.lightCount);
          this.ui.lights(this.lightCount);
          this.audio.beep(420, 0.12, 0.14);
          if (this.lightCount === 5) this.countdown = 0.5 + Math.random() * 1.1;
        } else {
          this.state = 'racing';
          this.raceTime = 0;
          this.world.setStartLights(0);
          this.ui.lights(0, false);
          this.ui.message(t('msg.go'), 'good', 900);
          this.audio.beep(880, 0.35, 0.2);
          for (const c of cars) c.race.lapStart = 0;
        }
      }
    }

    const racing = this.state === 'racing' || this.state === 'finished';
    if (racing) this.raceTime += dt;

    for (const car of cars) {
      // The grid sits on the brakes until the lights go out, and the AI is not asked for an
      // input before then. Its answer would be thrown away anyway, and asking has a side
      // effect: a driver treats a car that has not moved for three seconds as stuck and
      // respawns it onto the centreline - which is precisely what a car waiting on the grid
      // looks like. That fired around the third red light and shuffled the grid.
      let input = { throttle: 0, brake: 1, steer: 0, handbrake: true };
      if (racing) {
        if (car.ai) {
          const gap = this.player ? car.dist - this.player.dist : 0;
          const rubber = car === this.player ? 0 : (gap > 140 ? -diff.rubber : gap < -140 ? diff.rubber : 0);
          input = car.ai.update(dt, cars, rubber);
        } else {
          input = this.input.state;
        }
      }
      // A driver who has taken the flag does a slow-down lap and parks, rather than
      // circulating for ever because the player never finished and nothing ever ended
      // the race. Steering still comes from the AI, so they pull up on the track and
      // not into a barrier.
      if (car.race.finished && car.ai) {
        const coast = Math.max(0, 1 - (this.raceTime - car.race.finishTime) / 6);
        input = { ...input, throttle: input.throttle * coast * 0.5, brake: coast < 0.35 ? 0.5 : 0, boost: false };
      }
      car.update(dt, input);
      // and no stuck time is banked while waiting, so nobody is a second from being
      // respawned the moment the race actually starts
      if (!racing) car.stuck = 0;
    }
    resolveCollisions(cars);

    // laps & finishing
    for (const car of cars) {
      const L = this.path.length;
      const n = Math.floor(car.dist / L);
      if (n > car.race.n) {
        if (n >= 1 && racing) {
          const lap = this.raceTime - car.race.lapStart;
          car.race.laps.push(lap);
          car.race.lapStart = this.raceTime;
          if (car.race.best == null || lap < car.race.best) car.race.best = lap;
          if (car === this.player) this.onPlayerLap(lap, n);
        }
        car.race.n = n;
        if (n >= this.settings.laps && !car.race.finished) {
          car.race.finished = true;
          car.race.finishTime = this.raceTime;
          if (car === this.player) this.onPlayerFinish();
        }
      }
    }

    // Standings. Cars that have taken the flag are ranked by when they took it and always
    // ahead of cars still running, because once a driver has finished they stop and their
    // distance stops growing - sorting the lot on distance alone had them sink back down
    // the order while they parked.
    const order = [...cars].sort((a, b) => {
      if (a.race.finished && b.race.finished) return a.race.finishTime - b.race.finishTime;
      if (a.race.finished !== b.race.finished) return a.race.finished ? -1 : 1;
      return b.dist - a.dist;
    });
    order.forEach((c, i) => { c.pos = i + 1; });
    this.order = order;

    // player feedback
    if (this.player && racing) {
      const p = this.player;
      const fwdDot = Math.sin(p.h) * p.proj.tx + Math.cos(p.h) * p.proj.tz;
      if (fwdDot < -0.25 && p.speed > 4) {
        this.wrongWay += dt;
        if (this.wrongWay > 0.5) this.ui.message(t('msg.wrongWay'), 'red', 400);
      } else this.wrongWay = 0;
      if (p.impact > 4) this.audio.hit(p.impact);
    }

    // the caravan, and whatever the player relieved it of
    if (this.caravan) {
      const took = this.caravan.update(dt, this.player, this.state === 'racing');
      if (took) this.onRobbery(took);
    }

    // meshes
    for (const car of cars) {
      car.mesh.position.set(car.x, car.y + car.rollLift, car.z);
      car.mesh.rotation.set(car.pitch, car.h, car.roll);
      animateCar(car.mesh, car, dt);
    }
    this.shadows.forEach((sh, i) => {
      const c = cars[i];
      sh.position.set(c.x, c.y + 0.04, c.z);
      sh.rotation.z = -c.h;
    });

    // The results screen is shown once, a beat after the flag. Re-testing whether it is
    // the screen on display meant that leaving it - CHANGE CIRCUIT, say - put it straight
    // back up on the very next frame, so those buttons looked dead.
    if (this.state === 'finished' && !this.resultsShown) {
      this.finishTimer += dt;
      if (this.finishTimer > 2.6) { this.resultsShown = true; this.showResults(); }
    }
  }

  // Coins go to the driver, not to the race: the purse is part of the saved settings and
  // survives the session, which is the whole of what "an account" means here.
  onRobbery(n) {
    this.settings.coins = (this.settings.coins || 0) + n;
    this.ui.setCoins(this.settings.coins);
    this.ui.message(t('msg.robbed', { n: num(n) }), 'good', 1400);
    this.audio.beep(1180, 0.07, 0.13);
    setTimeout(() => this.audio.beep(1560, 0.09, 0.11), 70);
    this.save();
  }

  onPlayerLap(lap, n) {
    const id = this.def.id;
    const spec = this.player.spec;
    const entry = { name: this.settings.name, carId: spec.id, car: spec.name, ms: lap * 1000 };
    const rank = Records.add(this.records, id, entry);
    // and out to the shared board, if this deployment has one. A lap that tops it is
    // worth saying so about; everything else is silent, including no service at all.
    Records.submitGlobal(id, entry).then((worldRank) => {
      if (worldRank === 1) {
        this.ui.message(t('msg.worldRecord') + `<small>${formatTime(entry.ms)}</small>`, 'good', 2800);
      }
    });
    const prev = this.best[id];
    if (rank === 1) {
      this.best[id] = Math.min(lap, prev == null ? lap : prev);
      this.save();
      this.ui.message(t('msg.circuitRecord') + `<small>${formatTime(lap * 1000)}</small>`, 'good', 2400);
    } else if (prev == null || lap < prev) {
      this.best[id] = lap;
      this.save();
      this.ui.message(t('msg.newBest') + `<small>${formatTime(lap * 1000)}</small>`, 'good', 2200);
    } else {
      this.ui.message(formatTime(lap * 1000)
        + (rank ? `<small>${t('msg.boardPos', { n: num(rank) })}</small>` : ''), '', 1600);
    }
    const left = this.settings.laps - n;
    if (left === 1) setTimeout(() => this.ui.message(t('msg.finalLap'), 'warn', 1800), 2300);
  }

  onPlayerFinish() {
    this.state = 'finished';
    this.finishTimer = 0;
    this.input.enabled = false;
    document.body.classList.remove('racing');
    const pos = this.player.pos || 1;
    this.ui.message(pos === 1 ? t('msg.winner') : t('msg.finishedP', { n: num(pos) }),
      pos === 1 ? 'good' : '', 2600);
  }

  showResults() {
    const L = this.path.length;
    const rows = [...this.cars]
      .sort((a, b) => (b.race.finished ? b.dist + 1e6 : b.dist) - (a.race.finished ? a.dist + 1e6 : a.dist))
      .map((c, i) => {
        let time;
        if (c.race.finished) time = formatTime(c.race.finishTime * 1000);
        else {
          const behind = (this.settings.laps * L - c.dist) / Math.max(c.speed, 25);
          time = '+' + behind.toFixed(1) + 's';
        }
        return { pos: i + 1, name: c.driver, car: c.spec.name, time, you: c.isPlayer };
      });
    const p = this.player;
    const title = this.settings.opponents === 0
      ? t('results.timeTrial', { time: formatTime((p.race.best || 0) * 1000) })
      : p.pos === 1 ? t('results.won') : t('results.finishedP', { n: num(p.pos) });
    this.ui.results(title, rows);
    this.audio.stop();
  }

  updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    const mode = CAM_MODES[this.camMode];
    const fwd = new THREE.Vector3(Math.sin(p.h), 0, Math.cos(p.h));
    const target = new THREE.Vector3(p.x, p.y, p.z);
    const wantFov = mode.fov + Math.min(16, p.speed * 0.26) + (p.boosting ? 7 : 0);
    this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * (p.boosting ? 5 : 3));
    this.camera.updateProjectionMatrix();

    if (mode.bonnet) {
      const pos = target.clone().addScaledVector(fwd, p.spec.dims.L * 0.18).setY(p.y + p.spec.hoodY + 0.18);
      this.camera.position.copy(pos);
      this.camLook.copy(pos).addScaledVector(fwd, 14).setY(p.y + 1.2);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.camLook);
      this.camera.rotation.z = -p.roll * 0.5;
      this.applyShake(dt, p, mode);
      return;
    }
    // The camera trails the car's velocity direction so slides look dramatic - but only
    // while the car is going forwards. Reversing turns the velocity round, which swung the
    // camera to the far side of the car and left you steering towards your own bonnet.
    const vel = new THREE.Vector3(p.vx, 0, p.vz);
    const dir = vel.lengthSq() > 9 && p.vf > 0.5
      ? vel.normalize().lerp(fwd, 0.45).normalize()
      : fwd.clone();
    const want = target.clone().addScaledVector(dir, -mode.back).setY(p.y + mode.up);
    const k = 1 - Math.exp(-dt * 6.5);
    this.camPos.lerp(want, k);
    const ground = Math.max(this.world.terrainHeight(this.camPos.x, this.camPos.z), p.y - 1.5);
    if (this.camPos.y < ground + 1.1) this.camPos.y = ground + 1.1;
    this.camera.position.copy(this.camPos);
    const look = target.clone().addScaledVector(fwd, mode.ahead).setY(p.y + mode.lookUp);
    this.camLook.lerp(look, Math.min(1, dt * 9));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camLook);
    this.applyShake(dt, p, mode);
  }

  // Shake, for the two things that shake a car: the surface under it and hitting
  // something. The physics already works out how rough the ground is - `rumble` is the
  // surface's own roughness scaled by how fast you are crossing it, and it is the same
  // number that drives the rumble in the speakers, so the picture and the sound agree.
  // Tarmac is zero, so on the road this costs a comparison and nothing else.
  //
  // Applied after lookAt, in the camera's own right/up, so it is a shake of the image
  // rather than of the car's position in the world - and applied to the camera only, so
  // it can never feed back into where the chase camera thinks it should be.
  applyShake(dt, p, mode) {
    const target = p.rumble || 0;
    // rises fast onto a kerb, falls away a little more slowly coming off it
    this.shake += (target - this.shake) * Math.min(1, dt * (target > this.shake ? 22 : 9));
    this.shakeKick = Math.max(0, this.shakeKick - dt * 3.2);
    if (p.impact > 3) this.shakeKick = Math.max(this.shakeKick, Math.min(1, p.impact * 0.055));
    if (this.calmCamera.matches) return;

    // The shake is mostly angular. Shoving a camera seven metres behind the car sideways
    // by a couple of centimetres moves the picture by about a fifth of a degree, which is
    // to say not at all; turning it by a fifth of a degree moves the picture by a fifth of
    // a degree wherever it happens to be standing. The positional part is kept because it
    // still tells on the bonnet camera, which sits a hand's breadth off the bodywork.
    //
    // The bonnet camera is bolted to the car and gets the full measure; the chase camera
    // is nominally a helicopter and gets about two thirds.
    const bonnet = !!mode.bonnet;
    const ang = this.shake * (bonnet ? 0.019 : 0.013) + this.shakeKick * 0.030;
    const off = this.shake * (bonnet ? 0.050 : 0.030) + this.shakeKick * 0.120;
    if (ang < 0.00004) return;

    this.shakeT += dt;
    const t = this.shakeT;
    // Three incommensurate oscillators plus a little grit: a single sine reads as a
    // wobble, and pure noise reads as a fault in the renderer.
    const ox = Math.sin(t * 31) * 0.55 + Math.sin(t * 47 + 1.3) * 0.3 + (Math.random() - 0.5) * 0.3;
    const oy = Math.sin(t * 37 + 0.7) * 0.55 + Math.sin(t * 19 + 2.1) * 0.3 + (Math.random() - 0.5) * 0.3;
    const rz = Math.sin(t * 23 + 0.4) * 0.6 + (Math.random() - 0.5) * 0.2;

    const q = this.camera.quaternion;
    this.shakeRight.set(1, 0, 0).applyQuaternion(q);
    this.shakeUp.set(0, 1, 0).applyQuaternion(q);
    this.camera.position.addScaledVector(this.shakeRight, ox * off);
    this.camera.position.addScaledVector(this.shakeUp, oy * off);
    // local axes, so this is a shake of the image whichever way the camera is pointing
    this.camera.rotateX(oy * ang);
    this.camera.rotateY(ox * ang);
    this.camera.rotateZ(rz * ang * 0.5);
  }

  updateHud() {
    const p = this.player;
    if (!p) return;
    const cur = this.state === 'countdown' ? 0 : this.raceTime - p.race.lapStart;
    this.ui.updateHud({
      pos: p.pos || 1,
      total: this.cars.length,
      lap: Math.min(this.settings.laps, Math.max(1, p.race.n + 1)),
      laps: this.settings.laps,
      kmh: p.kmh,
      vTopKmh: p.spec.vTop * 3.6 * 1.05,
      power: p.powerDraw,
      maxPower: p.spec.power / 1000,
      boost: p.boostCharge,
      boosting: p.boosting,
      boostArmed: p.boostCharge >= 0.25,
      current: cur * 1000,
      last: p.race.laps.length ? p.race.laps[p.race.laps.length - 1] * 1000 : null,
      best: p.race.best != null ? p.race.best * 1000 : (this.best[this.def.id] != null ? this.best[this.def.id] * 1000 : null),
    });
    this.ui.drawMinimap(this.cars, this.cars.indexOf(p));
    if (this.order) {
      const leader = this.order[0];
      this.ui.updateTower(this.order.slice(0, 8).map((c) => ({
        pos: c.pos,
        code: c.code,
        you: c.isPlayer,
        gap: c === leader ? t('hud.leader') : '+' + ((leader.dist - c.dist) / Math.max(25, c.speed)).toFixed(1),
      })));
    }
  }

  // ------------------------------------------------------------------ loop
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    this.input.update(dt);

    if (this.state === 'paused') {
      this.post.render(this.raceScene, this.camera);
      return;
    }

    if (this.state === 'menu') {
      this.showAngle += dt * 0.16;
      const L = CARS[this.settings.carIndex].dims.L;
      const r = 6.6 + L * 1.15, h = 2.5;
      this.camera.fov += (40 - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
      this.camera.position.set(Math.sin(this.showAngle) * r, h, Math.cos(this.showAngle) * r);
      this.camera.lookAt(0, 0.72, 0);
      this.showFill.position.copy(this.camera.position);
      if (this.showCar) this.showCar.rotation.y = 0;
      this.post.render(this.showroom, this.camera);
      return;
    }

    this.updateRace(dt);
    this.updateCamera(dt);
    this.tyreFx.update(dt, this.cars, this.camera, this.renderer.domElement.height);
    this.updateHud();
    this.world.update(dt, this.elapsed);
    this.world.updateShadow(this.camLook);
    const p = this.player;
    this.audio.update(dt, {
      speed: p.speed, vTop: p.spec.vTop, throttle: this.input.state.throttle,
      slide: p.slide, rumble: p.rumble, boosting: p.boosting,
    });
    this.post.render(this.raceScene, this.camera);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Debug / test entry: ?track=suzuka&car=su7&laps=1&opp=3&auto=1&go=1&scans=1
  bootFromQuery() {
    const q = new URLSearchParams(location.search);
    if (!q.toString()) { this.refreshShowroomCar(); return; }
    const ti = this.tracks.findIndex((t) => t.def.id === q.get('track'));
    if (ti >= 0) this.settings.trackIndex = ti;
    const ci = CARS.findIndex((c) => c.id === q.get('car'));
    if (ci >= 0) this.settings.carIndex = ci;
    if (q.has('laps')) this.settings.laps = Math.max(1, +q.get('laps'));
    if (q.has('opp')) this.settings.opponents = Math.max(0, +q.get('opp'));
    if (q.has('diff')) this.settings.difficulty = q.get('diff');
    if (q.has('scans')) this.settings.scans = q.get('scans') === '1';
    this.autopilot = q.get('auto') === '1';
    this.refreshShowroomCar();
    this.ui.buildOptions(this.settings);
    this.ui.selectTrack(this.settings.trackIndex);
    // selectCar only moves the highlight; the panel was built from the saved carIndex,
    // so it has to be told as well or it describes a different car than the one selected
    this.ui.selectCar(this.settings.carIndex);
    this.ui.updateCarInfo(CARS[this.settings.carIndex]);
    if (q.get('go') === '1') setTimeout(() => this.startRace(), 50);
  }
}

// The catalogue has to be in hand before the first screen is drawn, so the language is
// read straight out of storage here rather than waiting for the Game to parse settings:
// a menu that renders in English and then flips a frame later looks like a bug. 'auto',
// and anything unreadable, both come out as null, which is setLanguage's "ask the browser".
const savedLanguage = () => {
  try {
    const lang = (JSON.parse(localStorage.getItem(STORE)) || {}).lang;
    return lang && lang !== 'auto' ? lang : null;
  } catch { return null; }
};

try {
  await setLanguage(savedLanguage());
  window.__game = new Game();
} catch (err) {
  console.error(err);
  const f = document.getElementById('fatal');
  f.className = '';
  f.innerHTML = `<h2>${t('fatal.title')}</h2><p>${err && err.message ? err.message : err}</p>
    <p class="muted">${t('fatal.webgl')}</p>`;
}
