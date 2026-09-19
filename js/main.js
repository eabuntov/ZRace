// ZRace - game shell: renderer, showroom, race loop and race rules.
import * as THREE from 'three';
import { TRACKS } from './tracks.js';
import { TrackPath } from './trackPath.js';
import { TrackWorld } from './trackBuild.js';
import { CARS, PAINTS, buildCar, animateCar, addBoostJet } from './cars.js';
import { loadShowroomCar, repaintShowroomCar } from './carModel.js';
import { rigScan } from './carRig.js';
import { Vehicle, resolveCollisions } from './physics.js';
import { AIDriver, computeRacingLine, driverName } from './ai.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { UI, formatTime } from './ui.js';
import * as Records from './records.js';
import { t, num, setLanguage } from './i18n.js';
import { setMaxAnisotropy, shadowTexture } from './textures.js';

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

    this.settings = Object.assign(
      { carIndex: 0, paintIndex: 0, trackIndex: 0, laps: 3, opponents: 5, difficulty: 'normal',
        name: Records.DEFAULT_NAME, lang: 'auto' },
      this.load()
    );
    this.best = this.settings.best || {};
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
  envFor(theme) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, theme ? theme.sky.top : '#2b3a52');
    g.addColorStop(0.48, theme ? theme.sky.horizon : '#9fb2c6');
    g.addColorStop(0.52, '#44484d');
    g.addColorStop(1, '#141618');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    // sun blob + a couple of soft highlights so the paint has something to reflect
    const sun = ctx.createRadialGradient(150, 60, 4, 150, 60, 70);
    sun.addColorStop(0, '#ffffff');
    sun.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(80, 0, 150, 130);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(330, 40, 120, 26);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const env = this.pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    return env;
  }

  buildShowroom() {
    const s = (this.showroom = new THREE.Scene());
    s.background = new THREE.Color('#0a0c10');
    s.environment = this.envFor(null);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({ color: '#0d1014', roughness: 0.42, metalness: 0.3 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(3.9, 4.1, 0.18, 64),
      new THREE.MeshStandardMaterial({ color: '#171b21', roughness: 0.5, metalness: 0.4 })
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

    const key = new THREE.DirectionalLight('#ffffff', 2.6);
    key.position.set(6, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
    key.shadow.bias = -0.0008;
    const rim = new THREE.DirectionalLight('#8fd8ff', 1.5);
    rim.position.set(-7, 4, -6);
    const fill = new THREE.HemisphereLight('#cfe3ff', '#0a0c10', 0.8);
    s.add(key, rim, fill);

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
    this.ui.buildOptions(this.settings);
    this.save();
  }

  bindKeys() {
    this.input.on('KeyC', () => { if (this.state === 'racing' || this.state === 'finished') this.camMode = (this.camMode + 1) % CAM_MODES.length; });
    this.input.on('KeyR', () => { if (this.state === 'racing' && this.player) this.player.respawn(); });
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
    this.raceScene.environment = this.envFor(def.theme);
    this.world = new TrackWorld(this.raceScene, path, def);
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
      if (isPlayer) this.raceScanForPlayer(v, paint);
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

    this.ui.prepMinimap(path);
    this.raceTime = 0;
    this.countdown = 0.9;
    this.lightCount = 0;
    this.goDelay = 0;
    this.state = 'countdown';
    this.camMode = 0;
    this.wrongWay = 0;
    this.finishTimer = 0;
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

  // The player's car is the one on screen for the whole race, so it gets the scan; the
  // opponents stay code-built, which is what keeps the draw calls down. The scan has to be
  // rigged first - a scanned body on wheels that do not turn is worse than a simpler car
  // that behaves - and if that fails the built car simply stays where it is.
  raceScanForPlayer(v, paintHex) {
    const race = (this.raceId = (this.raceId || 0) + 1);
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
      if (car.race.finished && car.ai) input = { ...input, throttle: input.throttle * 0.5 };
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

    // standings
    const order = [...cars].sort((a, b) => b.dist - a.dist);
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

    // meshes
    for (const car of cars) {
      car.mesh.position.set(car.x, car.y, car.z);
      car.mesh.rotation.set(car.pitch, car.h, car.roll);
      animateCar(car.mesh, car, dt);
    }
    this.shadows.forEach((sh, i) => {
      const c = cars[i];
      sh.position.set(c.x, c.y + 0.04, c.z);
      sh.rotation.z = -c.h;
    });

    if (this.state === 'finished') {
      this.finishTimer += dt;
      if (this.finishTimer > 2.6 && this.ui.current !== 'results') this.showResults();
    }
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
      return;
    }
    // the camera trails the car's velocity direction so slides look dramatic
    const vel = new THREE.Vector3(p.vx, 0, p.vz);
    const dir = vel.lengthSq() > 9 ? vel.normalize().lerp(fwd, 0.45).normalize() : fwd.clone();
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
    if (p.impact > 3) {
      const a = Math.min(0.05, p.impact * 0.004);
      this.camera.position.x += (Math.random() - 0.5) * a * 8;
      this.camera.position.y += (Math.random() - 0.5) * a * 8;
    }
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
      this.renderer.render(this.raceScene, this.camera);
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
      if (this.showCar) this.showCar.rotation.y = 0;
      this.renderer.render(this.showroom, this.camera);
      return;
    }

    this.updateRace(dt);
    this.updateCamera(dt);
    this.updateHud();
    this.world.update(dt, this.elapsed);
    this.world.updateShadow(this.camLook);
    const p = this.player;
    this.audio.update(dt, {
      speed: p.speed, vTop: p.spec.vTop, throttle: this.input.state.throttle,
      slide: p.slide, rumble: p.rumble, boosting: p.boosting,
    });
    this.renderer.render(this.raceScene, this.camera);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Debug / test entry: ?track=suzuka&car=su7&laps=1&opp=3&auto=1&go=1
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
