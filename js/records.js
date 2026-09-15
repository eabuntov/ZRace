// Nicknames and the record board.
//
// There is no server. Every record lives in this browser's localStorage under one key,
// kept as a table per circuit, which is enough for the thing people actually ask for -
// a name against a time, and a board that is still there tomorrow - and it keeps the
// game a folder of static files behind nginx.
//
// One row per driver per car, so a household can argue about who is quickest in what
// rather than one person filling the board with ten laps of the same machine.

const STORE = 'zrace.records.v1';
const KEEP = 12;
const MAX_NAME = 14;

export const DEFAULT_NAME = 'Player';

export function cleanName(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return t || DEFAULT_NAME;
}

// Three letters for the timing tower, which has room for exactly that.
export function driverCode(name) {
  const t = cleanName(name).replace(/[^A-Za-z0-9]/g, '');
  return (t.slice(0, 3) || 'YOU').toUpperCase();
}

export function load() {
  try {
    const r = JSON.parse(localStorage.getItem(STORE));
    return r && typeof r === 'object' ? r : {};
  } catch { return {}; }
}

export function save(records) {
  try { localStorage.setItem(STORE, JSON.stringify(records)); } catch { /* private mode */ }
}

export function forTrack(records, trackId) {
  const rows = records[trackId];
  return Array.isArray(rows) ? rows : [];
}

// Files a lap and returns its 1-based rank on that circuit, or 0 if it did not make the
// board (it is slower than this driver's own lap in this car, or slower than every row
// the board has space for).
export function add(records, trackId, entry) {
  const name = cleanName(entry.name);
  const row = { name, carId: entry.carId, car: entry.car, ms: Math.round(entry.ms), at: Date.now() };
  const rows = forTrack(records, trackId)
    .filter((r) => !(r.name === name && r.carId === row.carId) && isFinite(r.ms));
  rows.push(row);
  rows.sort((a, b) => a.ms - b.ms);
  records[trackId] = rows.slice(0, KEEP);
  const rank = records[trackId].indexOf(row) + 1;
  save(records);
  return rank;
}

// The fastest lap anyone has set here, in any car - what "the record" means on a board.
export function best(records, trackId) {
  return forTrack(records, trackId)[0] || null;
}

// ------------------------------------------------------------- the shared board
//
// The same table, shared, when the deployment is running server/scores.py behind /api
// (tools/deploy.sh sets that up). It is optional in the strongest sense: every call here
// fails soft, so a missing, slow or unhappy service means the game quietly carries on
// with the table above and the player never sees an error about it.

const API = '/api';
const TIMEOUT = 5000;

let reachable = null;            // null until probed, then true / false

async function call(path, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(API + path, { ...opts, signal: ctl.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;          // the service answered, so it is still up
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// A refusal is the service working - it read the request and said no. Silence is not,
// and neither is a 5xx: a proxy in front of a board that has stopped answers 502 itself,
// so a status alone is not proof anything is behind it.
const isDown = (err) => !err.status || err.status >= 500;

export async function probe() {
  try { await call('/health'); reachable = true; } catch { reachable = false; }
  return reachable;
}

export const isOnline = () => reachable === true;

// Returns the shared rows, or null if they could not be had.
export async function globalBoard(trackId) {
  try {
    const r = await call(`/records/${encodeURIComponent(trackId)}`);
    reachable = true;
    return Array.isArray(r.rows) ? r.rows : [];
  } catch (err) {
    if (isDown(err)) reachable = false;
    return null;
  }
}

// Fire and forget: resolves to the rank the lap took on the shared board, or 0 for
// "it did not make it" - which covers a slower lap, a refused one and no service at all.
export async function submitGlobal(trackId, entry) {
  try {
    const r = await call('/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track: trackId,
        name: cleanName(entry.name),
        car: entry.carId,
        carName: entry.car,
        ms: Math.round(entry.ms),
      }),
    });
    reachable = true;
    return r.rank || 0;
  } catch (err) {
    if (isDown(err)) reachable = false;
    return 0;
  }
}
