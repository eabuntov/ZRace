// Menus, HUD widgets (speed dial, minimap, timing tower) and the results screen.

const $ = (id) => document.getElementById(id);

export function formatTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(t).padStart(3, '0')}`;
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

    this.msgEl = $('msg');
    this.lightsEl = $('lights');
    this.lightsEl.innerHTML = '<i></i>'.repeat(5);
    this.dial = $('dial').getContext('2d');
    this.map = $('minimap').getContext('2d');
    this.towerEl = $('tower');
    this.msgTimer = 0;
    this.lastHud = {};
  }

  show(name) {
    Object.entries(this.screens).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
    this.current = name;
  }

  hudVisible(v) { $('hud').classList.toggle('hidden', !v); }

  // ------------------------------------------------------------ car select
  buildCars(cars, paints, state) {
    const list = $('carList');
    list.innerHTML = '';
    cars.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'car-chip' + (i === state.carIndex ? ' sel' : '');
      b.innerHTML = `${c.name}<small>${c.type}</small>`;
      b.addEventListener('click', () => this.hooks.onCar(i));
      list.appendChild(b);
    });
    const pl = $('paints');
    pl.innerHTML = '';
    paints.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'paint' + (i === state.paintIndex ? ' sel' : '');
      b.style.background = p.hex;
      b.title = p.name;
      b.addEventListener('click', () => this.hooks.onPaint(i));
      pl.appendChild(b);
    });
    this.updateCarInfo(cars[state.carIndex]);
  }

  updateCarInfo(spec) {
    $('carName').textContent = spec.name;
    $('carType').textContent = spec.type;
    $('carTagline').textContent = spec.tagline;
    const rows = [
      ['POWER', `${Math.round(spec.power / 1000)} kW`, spec.power / 950000],
      ['0–100 KM/H', `${spec.accel.toFixed(1)} s`, 1 - (spec.accel - 2) / 3.2],
      ['TOP SPEED', `${Math.round(spec.vTop * 3.6)} km/h`, (spec.vTop - 45) / 40],
      ['GRIP', `${spec.grip.toFixed(2)} g`, (spec.grip - 0.85) / 0.45],
      ['WEIGHT', `${spec.mass} kg`, 1 - (spec.mass - 1800) / 1200],
    ];
    $('carStats').innerHTML = rows.map(([k, v, f]) => `
      <div class="stat"><div class="row"><span>${k}</span><b>${v}</b></div>
      <div class="meter"><i style="width:${Math.round(Math.max(0.05, Math.min(1, f)) * 100)}%"></i></div></div>`).join('');
  }

  selectCar(i) {
    $('carList').querySelectorAll('.car-chip').forEach((el, k) => el.classList.toggle('sel', k === i));
  }

  selectPaint(i) {
    $('paints').querySelectorAll('.paint').forEach((el, k) => el.classList.toggle('sel', k === i));
  }

  // ---------------------------------------------------------- track select
  buildTracks(tracks, state) {
    const grid = $('trackGrid');
    grid.innerHTML = '';
    tracks.forEach((t, i) => {
      const card = document.createElement('button');
      card.className = 'track-card' + (i === state.trackIndex ? ' sel' : '');
      const cv = document.createElement('canvas');
      cv.width = 420; cv.height = 240;
      card.appendChild(cv);
      const name = document.createElement('div');
      name.className = 'name';
      name.innerHTML = `${FLAGS[t.def.flag] || ''}<span>${t.def.city}</span>`;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${t.def.country} · ${(t.path.length / 1000).toFixed(2)} km · ${t.path.cornerCount()} corners`;
      const blurb = document.createElement('div');
      blurb.className = 'blurb';
      blurb.textContent = t.def.blurb;
      card.append(name, meta, blurb);
      card.addEventListener('click', () => this.hooks.onTrack(i));
      grid.appendChild(card);
      this.drawTrackPreview(cv.getContext('2d'), t.path, '#37e0a6');
    });
  }

  selectTrack(i) {
    $('trackGrid').querySelectorAll('.track-card').forEach((el, k) => el.classList.toggle('sel', k === i));
  }

  drawTrackPreview(ctx, path, color) {
    const w = ctx.canvas.width, h = ctx.canvas.height, pad = 22;
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
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
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

  buildOptions(state) {
    const seg = (el, values, cur, key, label = (v) => v) => {
      el.innerHTML = '';
      values.forEach((v) => {
        const b = document.createElement('button');
        b.textContent = label(v);
        b.className = v === cur ? 'sel' : '';
        b.addEventListener('click', () => this.hooks.onOption(key, v));
        el.appendChild(b);
      });
    };
    seg($('optLaps'), [1, 2, 3, 5], state.laps, 'laps');
    seg($('optCars'), [0, 1, 3, 5], state.opponents, 'opponents');
    seg($('optDiff'), ['easy', 'normal', 'hard'], state.difficulty, 'difficulty', (v) => v.toUpperCase());
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
    ctx.save();
    ctx.translate(ox + path.x[0] * sc, oy + path.z[0] * sc);
    ctx.rotate(-Math.atan2(path.tx[0], path.tz[0]));
    ctx.fillStyle = '#37e0a6';
    ctx.fillRect(-6, -2.5, 12, 5);
    ctx.restore();
    this.mapBase = { cv, sc, ox, oy };
  }

  drawMinimap(cars, playerIdx) {
    const base = this.mapBase;
    if (!base) return;
    const ctx = this.map;
    ctx.clearRect(0, 0, 250, 250);
    ctx.drawImage(base.cv, 0, 0);
    cars.forEach((c, i) => {
      const x = base.ox + c.x * base.sc, y = base.oy + c.z * base.sc;
      ctx.beginPath();
      ctx.arc(x, y, i === playerIdx ? 5 : 3.6, 0, Math.PI * 2);
      ctx.fillStyle = i === playerIdx ? '#37e0a6' : '#f0f3f6';
      ctx.fill();
      if (i === playerIdx) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(4,18,12,0.8)';
        ctx.stroke();
      }
    });
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

  drawBoost(charge, on, armed) {
    const el = this.boostEl;
    if (!el) return;
    const pct = Math.round(Math.max(0, Math.min(1, charge)) * 100);
    if (pct !== this._boostPct) { el.firstElementChild.style.setProperty('--fill', pct + '%'); this._boostPct = pct; }
    const cls = 'boost' + (on ? ' on' : armed ? ' ready' : '');
    if (cls !== this._boostCls) {
      el.className = cls;
      if (this.boostFx) this.boostFx.classList.toggle('on', !!on);
      this._boostCls = cls;
    }
  }

  updateHud(d) {
    if (d.pos !== this.lastHud.pos) $('pos').textContent = d.pos;
    if (d.total !== this.lastHud.total) $('posTotal').textContent = d.total;
    if (d.lap !== this.lastHud.lap) $('lap').textContent = d.lap;
    if (d.laps !== this.lastHud.laps) $('lapTotal').textContent = d.laps;
    $('kmh').textContent = Math.round(d.kmh);
    $('powerRead').textContent = `${d.power >= 0 ? '' : '−'}${Math.abs(Math.round(d.power))} kW`;
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

  clearMessage() { this.msgEl.className = 'center-msg'; }

  lights(n, show = true) {
    this.lightsEl.classList.toggle('show', show);
    [...this.lightsEl.children].forEach((el, i) => el.classList.toggle('on', i < n));
  }

  results(title, rows) {
    $('resultTitle').textContent = title;
    $('resultRows').innerHTML = rows.map((r) => `
      <tr class="${r.you ? 'you' : ''}">
        <td class="p">${r.pos}</td>
        <td>${r.name}</td>
        <td class="muted">${r.car}</td>
        <td class="t">${r.time}</td>
      </tr>`).join('');
    this.show('results');
  }

  loading(text) {
    $('loadingText').textContent = text;
    this.show('loading');
  }
}
