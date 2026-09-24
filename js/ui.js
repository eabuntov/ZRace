// Menus, HUD widgets (speed dial, minimap, timing tower) and the results screen.
//
// Everything built here is built from the catalogue, so rebuilding a screen after a
// language change is the same call that built it in the first place.
import { t, tn, num, date, detect, LANGUAGES } from './i18n.js';

const $ = (id) => document.getElementById(id);

// Driver names are typed by whoever is at the keyboard, so they are escaped, not trusted.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function formatTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms3 = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
}

const FLAGS = {
  cn: `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#de2910"/><g fill="#ffde00">
      <polygon points="5,3 6.2,6.6 9.9,6.6 6.9,8.8 8,12.4 5,10.2 2,12.4 3.1,8.8 0.1,6.6 3.8,6.6"/>
      <circle cx="11.5" cy="2.4" r="1"/><circle cx="13.6" cy="4.6" r="1"/><circle cx="13.6" cy="7.5" r="1"/><circle cx="11.5" cy="9.6" r="1"/></g></svg>`,
  mc: `<svg viewBox="0 0 30 20"><rect width="30" height="10" fill="#ce1126"/><rect y="10" width="30" height="10" fill="#fff"/></svg>`,
  jp: `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/></svg>`,
  it: `<svg viewBox="0 0 30 20"><rect width="10" height="20" fill="#008c45"/><rect x="10" width="10" height="20" fill="#f4f5f0"/><rect x="20" width="10" height="20" fill="#cd212a"/></svg>`,
  au: `<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#012169"/>
      <path d="M0,0 L15,10 M15,0 L0,10 M0,0 h15 v10 h-15z" fill="none" stroke="#fff" stroke-width="2"/>
      <path d="M0,0 L15,10 M15,0 L0,10" stroke="#e4002b" stroke-width="1.1"/>
      <path d="M7.5,0 v10 M0,5 h15" stroke="#fff" stroke-width="3"/>
      <path d="M7.5,0 v10 M0,5 h15" stroke="#e4002b" stroke-width="1.6"/>
      <g fill="#fff"><circle cx="7.5" cy="15" r="1.6"/><circle cx="22" cy="4" r="1"/><circle cx="25.5" cy="8.5" r="1.1"/>
      <circle cx="22" cy="13.5" r="1"/><circle cx="19" cy="9" r="0.8"/><circle cx="26" cy="15.5" r="0.7"/></g></svg>`,
};

export class UI {
  constructor(hooks) {
    this.hooks = hooks;
    this.screens = {};
    document.querySelectorAll('.screen').forEach((s) => { this.screens[s.id.replace('screen-', '')] = s; });
    this.current = 'title';

    document.querySelectorAll('[data-go]').forEach((b) => {
      b.addEventListener('click', () => hooks.onNav(b.dataset.go));
    });
    document.querySelectorAll('[data-back]').forEach((b) => {
      b.addEventListener('click', () => hooks.onNav(b.dataset.back));
    });
    $('startRace').addEventListener('click', () => hooks.onStart());
    $('resume').addEventListener('click', () => hooks.onResume());
    $('restart').addEventListener('click', () => hooks.onRestart());
    $('raceAgain').addEventListener('click', () => hooks.onRestart());

    const nick = $('nick');
    if (nick) {
      nick.addEventListener('input', () => hooks.onName(nick.value));
      nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') nick.blur(); e.stopPropagation(); });
    }
    this.nickEl = nick;
    this.boostEl = $('boost');
    this.boostLabel = $('boostLabel');
    this.boostFx = $('boostfx');
    this.msgEl = $('msg');
    this.toastEl = $('toast');
    this.lightsEl = $('lights');
    this.bulbsEl = $('bulbs');
    this.bulbsEl.innerHTML = '<i></i>'.repeat(5);
    this.startHintEl = $('startHint');
    this.cueEl = $('cue');
    this.hintEl = $('hint');
    $('hintClose').addEventListener('click', () => hooks.onHintDone());
    this.dial = $('dial').getContext('2d');
    this.map = $('minimap').getContext('2d');
    this.towerEl = $('tower');
    this.msgTimer = 0;
    this.lastHud = {};
  }

  setName(name) { if (this.nickEl && this.nickEl.value !== name) this.nickEl.value = name; }

  // Whatever had focus is usually a button on the screen being left, which is about to
  // vanish and take the keyboard with it. The new screen's main action picks it up, so a
  // keyboard player is never left tabbing from nowhere - and after a race, focus lands
  // on RACE AGAIN rather than staying with the canvas behind the results.
  show(name) {
    Object.entries(this.screens).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
    const was = this.current;
    this.current = name;
    const el = name && this.screens[name];
    if (!el || name === was) return;
    const active = document.activeElement;
    const stranded = !active || active === document.body || !active.offsetParent;
    if (stranded || name === 'pause' || name === 'results') {
      const target = el.querySelector('button.primary:not(.back)') || el.querySelector('button, input');
      if (target) target.focus({ preventScroll: true });
    }
  }

  hudVisible(v) { $('hud').classList.toggle('hidden', !v); }

  // ------------------------------------------------------------ car select
  buildCars(cars, paints, state) {
    const list = $('carList');
    list.innerHTML = '';
    const selLabel = t('ui.selected');
    cars.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'car-chip pickable' + (i === state.carIndex ? ' sel' : '');
      b.dataset.sel = selLabel;
      b.setAttribute('aria-pressed', String(i === state.carIndex));
      b.innerHTML = `${esc(c.name)}<small>${esc(t(`car.${c.id}.type`))}</small>`;
      b.addEventListener('click', () => this.hooks.onCar(i));
      list.appendChild(b);
    });
    const pl = $('paints');
    pl.innerHTML = '';
    paints.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'paint' + (i === state.paintIndex ? ' sel' : '');
      b.style.background = p.hex;
      b.title = t(`paint.${p.id}`);
      b.setAttribute('aria-label', t(`paint.${p.id}`));
      b.setAttribute('aria-pressed', String(i === state.paintIndex));
      b.addEventListener('click', () => this.hooks.onPaint(i));
      pl.appendChild(b);
    });
    this.updateCarInfo(cars[state.carIndex]);
  }

  updateCarInfo(spec) {
    $('carName').textContent = spec.name;
    $('carType').textContent = t(`car.${spec.id}.type`);
    $('carTagline').textContent = t(`car.${spec.id}.tagline`);
    // Every figure here is one the physics actually reads - agility sets how fast the car
    // takes up the yaw it is asked for and how much lock it has, braking sets the
    // deceleration - so the panel is a description of how the car will drive, not
    // decoration. Those two were the ones being felt from the driving seat and not shown.
    const brakeG = (11.2 * spec.brake) / 9.81;
    const rows = [
      [t('stats.power'), `${num(spec.power / 1000)} ${t('unit.kw')}`, spec.power / 950000],
      [t('stats.accel'), `${num(spec.accel, 1)} ${t('unit.s')}`, 1 - (spec.accel - 2) / 3.2],
      [t('stats.top'), `${num(spec.vTop * 3.6)} ${t('unit.kmh')}`, (spec.vTop - 45) / 40],
      [t('stats.grip'), `${num(spec.grip, 2)} ${t('unit.g')}`, (spec.grip - 0.85) / 0.45],
      [t('stats.braking'), `${num(brakeG, 2)} ${t('unit.g')}`, (brakeG - 1.0) / 0.55],
      [t('stats.agility'), num(spec.agility, 2), (spec.agility - 0.9) / 0.32],
      [t('stats.weight'), `${num(spec.mass)} ${t('unit.kg')}`, 1 - (spec.mass - 1800) / 1200],
    ];
    $('carStats').innerHTML = rows.map(([k, v, f]) => `
      <div class="stat"><div class="row"><span>${k}</span><b>${v}</b></div>
      <div class="meter"><i style="width:${Math.round(Math.max(0.05, Math.min(1, f)) * 100)}%"></i></div></div>`).join('');
  }

  selectCar(i) {
    $('carList').querySelectorAll('.car-chip').forEach((el, k) => {
      el.classList.toggle('sel', k === i);
      el.setAttribute('aria-pressed', String(k === i));
      if (k === i) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  selectPaint(i) {
    $('paints').querySelectorAll('.paint').forEach((el, k) => {
      el.classList.toggle('sel', k === i);
      el.setAttribute('aria-pressed', String(k === i));
    });
  }

  // ---------------------------------------------------------- track select
  // The cards are small and all alike on purpose - a thumbnail, a name, the numbers - so
  // five of them no longer compete for attention; the one picked is told in full in the
  // setup panel beside them.
  buildTracks(tracks, state) {
    const grid = $('trackGrid');
    grid.innerHTML = '';
    const selLabel = t('ui.selected');
    tracks.forEach((track, i) => {
      const card = document.createElement('button');
      card.className = 'track-card pickable' + (i === state.trackIndex ? ' sel' : '');
      card.dataset.sel = selLabel;
      card.setAttribute('aria-pressed', String(i === state.trackIndex));
      const cv = document.createElement('canvas');
      cv.width = 192; cv.height = 112;
      card.appendChild(cv);
      const name = document.createElement('div');
      name.className = 'name';
      name.innerHTML = `${FLAGS[track.def.flag] || ''}<span>${esc(t(`track.${track.def.id}.city`))}</span>`;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const corners = track.path.cornerCount();
      meta.textContent = t('track.meta', {
        country: t(`track.${track.def.id}.country`),
        km: num(track.path.length / 1000, 2),
        corners: tn('track.corners', corners),
      });
      card.append(name, meta);
      card.addEventListener('click', () => this.hooks.onTrack(i));
      grid.appendChild(card);
      this.drawTrackPreview(cv.getContext('2d'), track.path, track.def.theme.accent || '#37e0a6', 10, 5);
    });
  }

  selectTrack(i) {
    $('trackGrid').querySelectorAll('.track-card').forEach((el, k) => {
      el.classList.toggle('sel', k === i);
      el.setAttribute('aria-pressed', String(k === i));
    });
  }

  // The chosen circuit, the race it will be, and the button that starts it, together.
  // `best` is this driver's best lap here in ms, or null.
  updateSetup(track, state, best) {
    const def = track.def;
    const ctx = $('setupMap').getContext('2d');
    const pre = this.drawTrackPreview(ctx, track.path, def.theme.accent || '#37e0a6', 26, 12);
    // corner numbers would be clutter; the first corner's direction is not
    const c0 = track.path.corners()[0];
    if (c0) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(pre.ox + track.path.x[c0.apex] * pre.sc, pre.oy + track.path.z[c0.apex] * pre.sc, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0c10';
      ctx.font = 'bold 9px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('1', pre.ox + track.path.x[c0.apex] * pre.sc, pre.oy + track.path.z[c0.apex] * pre.sc + 0.5);
    }
    $('setupName').innerHTML = `${FLAGS[def.flag] || ''}<span>${esc(t(`track.${def.id}.name`))}</span>`;
    const km = track.path.length / 1000;
    $('setupMeta').textContent = t('track.meta', {
      country: t(`track.${def.id}.country`),
      km: num(km, 2),
      corners: tn('track.corners', track.path.cornerCount()),
    });
    $('setupBlurb').textContent = t(`track.${def.id}.blurb`);
    const race = state.opponents === 0
      ? t('summary.timeTrial')
      : tn('summary.rivals', state.opponents) + ' · ' + t(`diff.${state.difficulty}`);
    $('raceSummary').innerHTML =
      `<b>${esc(tn('summary.laps', state.laps))} · ${esc(race)}</b> · ${esc(num(km * state.laps, 1))} ${esc(t('unit.km'))}<br>`
      + esc(best != null ? t('summary.best', { time: formatTime(best) }) : t('summary.noBest'));
  }

  drawTrackPreview(ctx, path, color, pad = 22, under = 9) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const b = path.bounds();
    const sc = Math.min((w - pad * 2) / (b.maxX - b.minX), (h - pad * 2) / (b.maxZ - b.minZ));
    const ox = (w - (b.maxX - b.minX) * sc) / 2 - b.minX * sc;
    const oy = (h - (b.maxZ - b.minZ) * sc) / 2 - b.minZ * sc;
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= path.n; i += 2) {
      const k = i % path.n;
      const x = ox + path.x[k] * sc, y = oy + path.z[k] * sc;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = under;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, under / 3);
    ctx.stroke();
    // start marker
    ctx.save();
    const a = Math.atan2(path.tx[0], path.tz[0]);
    ctx.translate(ox + path.x[0] * sc, oy + path.z[0] * sc);
    ctx.rotate(-a);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-7, -2, 14, 4);
    ctx.restore();
    return { sc, ox, oy };
  }

  // `tier` is the quality actually in force (0 performance, 1 balanced, 2 quality), which
  // under AUTO is whatever this machine has settled on.
  buildOptions(state, tier = 1) {
    const seg = (el, values, cur, key, label = (v) => v, dim = false) => {
      if (!el) return;
      // rebuilding takes the focused button with it; put focus back on its replacement
      const hadFocus = el.contains(document.activeElement);
      el.innerHTML = '';
      values.forEach((v) => {
        const b = document.createElement('button');
        b.textContent = label(v);
        b.className = (v === cur ? 'sel' : '') + (dim ? ' dim' : '');
        b.setAttribute('aria-pressed', String(v === cur));
        b.addEventListener('click', () => this.hooks.onOption(key, v));
        el.appendChild(b);
        if (hadFocus && v === cur) b.focus({ preventScroll: true });
      });
    };
    seg($('optLaps'), [1, 2, 3, 5], state.laps, 'laps', (v) => num(v));
    seg($('optCars'), [0, 1, 3, 5], state.opponents, 'opponents', (v) => num(v));
    seg($('optDiff'), ['easy', 'normal', 'hard'], state.difficulty, 'difficulty', (v) => t(`diff.${v}`));
    // Lives on the options screen rather than beside the race settings: it is a thing
    // about the world, not about this race.
    seg($('optCaravans'), [false, true], !!state.caravans, 'caravans', (v) => t(v ? 'opt.on' : 'opt.off'));
    // Performance mode overrides these two; they keep the player's choice for later, but
    // are shown greyed out, and the notes say why.
    const lean = tier === 0;
    seg($('optScans'), [false, true], !!state.scans, 'scans', (v) => t(v ? 'opt.on' : 'opt.off'), lean);
    seg($('optGlow'), [false, true], !!state.glow, 'glow', (v) => t(v ? 'opt.on' : 'opt.off'), lean);
    seg($('optCues'), [false, true], state.cues !== false, 'cues', (v) => t(v ? 'opt.on' : 'opt.off'));
    seg($('optQuality'), ['auto', 'performance', 'quality'], state.quality || 'auto', 'quality', (v) => t(`quality.${v}`));
    const qn = $('qualityNote');
    if (qn) {
      qn.textContent = t('options.qualityNote')
        + ((state.quality || 'auto') === 'auto' ? ' ' + t('options.qualityNow', { tier: t(`tier.${tier}`) }) : '');
    }
    const gn = $('glowNote'), sn = $('scansNote');
    if (gn) gn.textContent = t('options.glowNote') + (lean ? ' ' + t('options.leanNote') : '');
    if (sn) sn.textContent = t('options.scansNote') + (lean ? ' ' + t('options.leanNote') : '');
  }

  // The standing total, on the title screen and in the HUD. Hidden at zero on the title
  // screen so a player who never turns caravans on is never told about them there.
  setCoins(n) {
    const count = $('coinCount'), purse = $('purseCount'), row = $('purse');
    if (count && count.textContent !== String(n)) {
      count.textContent = num(n);
      const el = $('coins');
      el.classList.remove('bump');
      void el.offsetWidth;                       // restart the animation
      el.classList.add('bump');
    }
    if (purse) purse.textContent = num(n);
    if (row) row.classList.toggle('hidden', !n);
  }

  coinsVisible(v) { $('coins').classList.toggle('hidden', !v); }

  // ---------------------------------------------------------------- options
  // AUTO first, then every catalogue by its own name - a language nobody can read is a
  // poor thing to label in a language they cannot read either.
  buildLanguages(chosen) {
    const el = $('optLang');
    if (!el) return;
    el.innerHTML = '';
    const opts = [{ code: 'auto', name: `${t('options.auto')} · ${detect().toUpperCase()}` },
      ...LANGUAGES];
    for (const { code, name } of opts) {
      const b = document.createElement('button');
      b.textContent = name;
      b.className = code === chosen ? 'sel' : '';
      b.addEventListener('click', () => this.hooks.onLanguage(code));
      el.appendChild(b);
    }
  }

  // ------------------------------------------------------------------ HUD
  prepMinimap(path) {
    const cv = document.createElement('canvas');
    cv.width = 250; cv.height = 250;
    const ctx = cv.getContext('2d');
    const pad = 16, w = cv.width, h = cv.height;
    const b = path.bounds();
    const sc = Math.min((w - pad * 2) / (b.maxX - b.minX), (h - pad * 2) / (b.maxZ - b.minZ));
    const ox = (w - (b.maxX - b.minX) * sc) / 2 - b.minX * sc;
    const oy = (h - (b.maxZ - b.minZ) * sc) / 2 - b.minZ * sc;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= path.n; i += 2) {
      const k = i % path.n;
      i ? ctx.lineTo(ox + path.x[k] * sc, oy + path.z[k] * sc) : ctx.moveTo(ox + path.x[k] * sc, oy + path.z[k] * sc);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(8,10,14,0.85)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = 'rgba(236,242,247,0.75)'; ctx.lineWidth = 4.5; ctx.stroke();
    // start / finish: a chequered bar across the road, outlined so it reads on the white
    ctx.save();
    ctx.translate(ox + path.x[0] * sc, oy + path.z[0] * sc);
    ctx.rotate(-Math.atan2(path.tx[0], path.tz[0]));
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(-8, -4, 16, 8);
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 2; b++) {
        ctx.fillStyle = (a + b) % 2 ? '#0a0c10' : '#ffffff';
        ctx.fillRect(-7 + a * 3.5, -3 + b * 3, 3.5, 3);
      }
    }
    ctx.restore();
    this.mapBase = { cv, sc, ox, oy, path };
  }

  // `info.apex` is the sample index of the next corner, `info.rival` the index in `cars`
  // of the nearest opponent on the road. Both optional.
  drawMinimap(cars, playerIdx, info = {}) {
    const base = this.mapBase;
    if (!base) return;
    const ctx = this.map;
    const X = (x) => base.ox + x * base.sc, Y = (z) => base.oy + z * base.sc;
    ctx.clearRect(0, 0, 250, 250);
    ctx.drawImage(base.cv, 0, 0);

    // the next corner: a small diamond on the road
    if (info.apex != null) {
      const pa = base.path;
      ctx.save();
      ctx.translate(X(pa.x[info.apex]), Y(pa.z[info.apex]));
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd24a';
      ctx.strokeStyle = 'rgba(8,10,14,0.9)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.strokeRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    }

    cars.forEach((c, i) => {
      if (i === playerIdx) return;
      ctx.beginPath();
      ctx.arc(X(c.x), Y(c.z), 3.6, 0, Math.PI * 2);
      ctx.fillStyle = '#f0f3f6';
      ctx.fill();
      // the one nearest you gets a ring, so the pass or the threat is easy to find
      if (i === info.rival) {
        ctx.beginPath();
        ctx.arc(X(c.x), Y(c.z), 7, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffb020';
        ctx.stroke();
      }
    });

    // you: an arrow pointing the way the car points, over everything else
    const p = cars[playerIdx];
    if (p) {
      const fx = Math.sin(p.h), fy = Math.cos(p.h);
      const x = X(p.x), y = Y(p.z);
      ctx.beginPath();
      ctx.moveTo(x + fx * 9, y + fy * 9);
      ctx.lineTo(x - fx * 5 - fy * 6, y - fy * 5 + fx * 6);
      ctx.lineTo(x - fx * 2, y - fy * 2);
      ctx.lineTo(x - fx * 5 + fy * 6, y - fy * 5 - fx * 6);
      ctx.closePath();
      ctx.fillStyle = '#37e0a6';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(4,18,12,0.9)';
      ctx.stroke();
    }
  }

  drawDial(kmh, vTopKmh, power, maxPower) {
    const ctx = this.dial;
    const R = 96, cx = 130, cy = 130;
    const start = Math.PI * 0.75, sweep = Math.PI * 1.5;
    ctx.clearRect(0, 0, 260, 260);
    ctx.lineCap = 'round';
    // track
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, start + sweep);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 9;
    ctx.stroke();
    // ticks
    for (let i = 0; i <= 10; i++) {
      const a = start + (sweep * i) / 10;
      const r0 = R - 14, r1 = R - (i % 5 === 0 ? 22 : 18);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.strokeStyle = i > 8 ? 'rgba(255,80,60,0.75)' : 'rgba(255,255,255,0.28)';
      ctx.lineWidth = i % 5 === 0 ? 2.5 : 1.5;
      ctx.stroke();
    }
    // speed
    const f = Math.max(0, Math.min(1, kmh / vTopKmh));
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, start + sweep * f);
    const grad = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0, '#1d9c72');
    grad.addColorStop(0.65, '#37e0a6');
    grad.addColorStop(1, '#ffd24a');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 9;
    ctx.stroke();
    // power / regen ring
    const pf = Math.max(-1, Math.min(1, power / maxPower));
    ctx.beginPath();
    const mid = start + sweep * 0.5;
    if (pf >= 0) ctx.arc(cx, cy, R - 15, mid, mid + (sweep / 2) * pf);
    else ctx.arc(cx, cy, R - 15, mid + (sweep / 2) * pf, mid);
    ctx.strokeStyle = pf >= 0 ? 'rgba(55,224,166,0.55)' : 'rgba(90,170,255,0.75)';
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }

  // Four states, each told by colour, by the label's words and by how the bar moves:
  // refilling (hatching runs right), ready, full (steady, READY in words, one pulse on
  // arrival) and lit (amber, hatching runs left as it drains).
  drawBoost(charge, on, armed) {
    const el = this.boostEl;
    if (!el) return;
    const pct = Math.round(Math.max(0, Math.min(1, charge)) * 100);
    if (pct !== this._boostPct) { el.firstElementChild.style.setProperty('--fill', pct + '%'); this._boostPct = pct; }
    const state = on ? 'on' : pct >= 100 ? 'full' : armed ? 'ready' : 'low';
    if (state !== this._boostState) {
      const arrived = state === 'full' && this._boostState != null && this._boostState !== 'full';
      this._boostState = state;
      el.className = 'boost' + (state === 'low' ? '' : ' ' + state) + (state === 'full' ? ' ready' : '')
        + (this._denied ? ' denied' : '');
      if (arrived) {
        void el.offsetWidth;                     // restart the pulse
        el.classList.add('pulse');
      }
      this.boostLabel.textContent = t(state === 'full' ? 'hud.boostReady' : 'hud.boost');
      if (this.boostFx) this.boostFx.classList.toggle('on', !!on);
    }
  }

  // Boost asked for with too little in the tank.
  denyBoost() {
    const el = this.boostEl;
    el.classList.remove('denied');
    void el.offsetWidth;
    el.classList.add('denied');
    this._denied = true;
    clearTimeout(this._denyT);
    this._denyT = setTimeout(() => { el.classList.remove('denied'); this._denied = false; }, 450);
  }

  resetHud() {
    this._boostState = null;
    this._cueKey = null;
    this.cueEl.className = 'cue';
    this.cueEl.style.opacity = '0';
  }

  updateHud(d) {
    if (d.pos !== this.lastHud.pos) $('pos').textContent = d.pos;
    if (d.total !== this.lastHud.total) $('posTotal').textContent = d.total;
    if (d.lap !== this.lastHud.lap) $('lap').textContent = d.lap;
    if (d.laps !== this.lastHud.laps) $('lapTotal').textContent = d.laps;
    $('kmh').textContent = Math.round(d.kmh);
    // Named, because a bare number of kilowatts beside a speed says nothing about what it
    // is counting. Negative is the car putting charge back in under braking.
    $('powerRead').textContent =
      `${t('stats.power')} ${d.power >= 0 ? '' : '−'}${num(Math.abs(d.power))} ${t('unit.kw')}`;
    $('tCur').textContent = formatTime(d.current);
    $('tLast').textContent = formatTime(d.last);
    $('tBest').textContent = formatTime(d.best);
    this.drawDial(d.kmh, d.vTopKmh, d.power, d.maxPower);
    this.drawBoost(d.boost, d.boosting, d.boostArmed);
    this.lastHud = d;
  }

  updateTower(rows) {
    if (!this.towerEl) return;
    const html = rows.map((r) => `<div class="row${r.you ? ' you' : ''}"><i>${r.pos}</i>${r.code}<em>${r.gap}</em></div>`).join('');
    if (html !== this._towerHtml) { this.towerEl.innerHTML = html; this._towerHtml = html; }
  }

  message(text, cls = '', ms = 1600) {
    this.msgEl.className = `center-msg show ${cls}`;
    this.msgEl.innerHTML = text;
    clearTimeout(this._msgT);
    if (ms > 0) this._msgT = setTimeout(() => { this.msgEl.className = 'center-msg'; }, ms);
  }

  clearMessage() { this.msgEl.className = 'center-msg'; this.toastEl.className = 'toast'; }

  // The small confirmation line: camera, mute, rejoin, boost. Separate from the centre
  // message, so a camera change never wipes out a lap time.
  toast(text, cls = '', ms = 1500) {
    this.toastEl.className = `toast show ${cls}`;
    this.toastEl.textContent = text;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.toastEl.className = 'toast'; }, ms);
  }

  lights(n, show = true) {
    this.lightsEl.classList.toggle('show', show);
    [...this.bulbsEl.children].forEach((el, i) => el.classList.toggle('on', i < n));
  }

  startHint(text, armed) {
    if (text !== this._startText) { this.startHintEl.textContent = text; this._startText = text; }
    this.startHintEl.classList.toggle('armed', !!armed);
  }

  // Brake / turn calls and the off-track line. Touches the DOM only when what it says
  // changes; the fade is one style write.
  drawCue(st, cues) {
    let kind = null, glyph = '', text = '', dist = '', opacity = 0;
    if (st && st.off) {
      kind = 'off';
      if (st.off.dir) {
        glyph = st.off.dir === 'left' ? '◀' : st.off.dir === 'right' ? '▶' : '▲';
        text = t(`cue.rejoin.${st.off.dir}`);
        dist = st.off.stuck && this.keyboard ? t('cue.pressR') : t('cue.metres', { n: num(Math.round(st.off.dist)) });
      } else {
        glyph = '⚠';
        text = t('cue.offTrack');
        dist = st.off.late ? t('cue.lateBrake') : '';
      }
      opacity = 1;
    } else if (cues && st && st.cue && st.strength > 0.02) {
      kind = st.cue;
      glyph = kind === 'brake' ? '▼' : kind === 'left' ? '◀' : '▶';
      text = t(`cue.${kind}`);
      dist = t('cue.metres', { n: num(Math.round(st.dist / 10) * 10) });
      opacity = st.strength;
    }
    const key = `${kind}|${glyph}|${text}|${dist}`;
    if (key !== this._cueKey) {
      this._cueKey = key;
      const [b, span, small] = this.cueEl.children;
      b.textContent = glyph;
      span.textContent = text;
      small.textContent = dist;
      this.cueEl.className = 'cue' + (kind ? ' ' + kind : '');
    }
    const o = Math.round(opacity * 20) / 20;
    if (o !== this._cueO) { this.cueEl.style.opacity = String(o); this._cueO = o; }
  }

  // The first-race card: the four controls that matter, then out of the way.
  showHint(touch) {
    const keys = touch
      ? [[t('touch.go'), 'hint.accel'], ['‹ ›', 'hint.steer'], [t('hud.boost'), 'hint.boost']]
      : [['W', 'hint.accel'], ['A D', 'hint.steer'], ['Shift', 'hint.boost'], ['C', 'hint.camera']];
    $('hintKeys').innerHTML = keys.map(([k, what]) => `<span>${k.split(' ').map((x) => `<kbd>${esc(x)}</kbd>`).join('')}${esc(t(what))}</span>`).join('');
    this.hintEl.classList.remove('hidden', 'out');
  }

  hideHint() {
    if (this.hintEl.classList.contains('hidden')) return;
    this.hintEl.classList.add('out');
    setTimeout(() => this.hintEl.classList.add('hidden'), 400);
  }

  results(title, rows) {
    $('resultTitle').textContent = title;
    $('resultRows').innerHTML = rows.map((r) => `
      <tr class="${r.you ? 'you' : ''}">
        <td class="p">${r.pos}</td>
        <td>${esc(r.name)}</td>
        <td class="muted">${esc(r.car)}</td>
        <td class="t">${r.time}</td>
      </tr>`).join('');
    this.show('results');
  }

  // ------------------------------------------------------------- records
  // One board per circuit, sorted by lap time, one row per driver per car. `rows` is
  // null while the shared board is still on its way, or when it could not be reached.
  buildRecords({ tracks, sel, rows, you, scope, online }) {
    const scopes = $('recordScope');
    scopes.innerHTML = '';
    for (const key of ['global', 'local']) {
      const b = document.createElement('button');
      b.textContent = t(`records.${key}`);
      b.className = key === scope ? 'sel' : '';
      // GLOBAL stays clickable even when the last attempt failed: a board that was
      // down a minute ago may not be now, and greying it out for the rest of the
      // session would be a worse answer than letting someone ask again.
      if (key === 'global' && online === false) b.classList.add('dim');
      b.addEventListener('click', () => this.hooks.onRecordScope(key));
      scopes.appendChild(b);
    }

    const tabs = $('recordTracks');
    tabs.innerHTML = '';
    tracks.forEach((track, i) => {
      const b = document.createElement('button');
      b.textContent = t(`track.${track.def.id}.city`).toUpperCase();
      b.className = i === sel ? 'sel' : '';
      b.addEventListener('click', () => this.hooks.onRecordTrack(i));
      tabs.appendChild(b);
    });

    const body = $('recordRows');
    const note = (text) => `<tr><td class="empty" colspan="5">${text}</td></tr>`;
    if (rows == null) {
      body.innerHTML = note(t(online === false ? 'records.noServer' : 'records.fetching'));
    } else if (!rows.length) {
      body.innerHTML = note(t('records.empty'));
    } else {
      body.innerHTML = rows.map((r, i) => `
        <tr class="${r.name === you ? 'you' : ''}${i === 0 ? ' gold' : ''}">
          <td class="p">${i + 1}</td>
          <td>${esc(r.name)}</td>
          <td class="car">${esc(r.car)}</td>
          <td class="t">${formatTime(r.ms)}</td>
          <td class="when">${r.at ? date(r.at) : ''}</td>
        </tr>`).join('');
    }
    $('recordNote').textContent = t(scope === 'global' ? 'records.noteGlobal' : 'records.noteLocal');
  }

  loading(key) {
    $('loadingText').textContent = t(key);
    this.show('loading');
  }
}
