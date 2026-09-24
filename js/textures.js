// Every texture in the game is painted into a canvas at run time - no image files,
// so the game works straight from disk with nothing to download.
import * as THREE from 'three';

let maxAniso = 4;
export function setMaxAnisotropy(v) { maxAniso = v; }

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// Deterministic noise helpers -------------------------------------------------
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export { mulberry };

function speckle(ctx, w, h, count, rnd, colors, sizeMin = 1, sizeMax = 3) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    const s = sizeMin + rnd() * (sizeMax - sizeMin);
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

// Surfaces --------------------------------------------------------------------
export function asphaltTexture(kind = 'road') {
  return cached('asphalt' + kind, () => {
    const c = canvas(512, 512), ctx = c.getContext('2d'), rnd = mulberry(7);
    const base = kind === 'road' ? '#3c3d42' : '#56575c';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    speckle(ctx, 512, 512, 14000, rnd, kind === 'road'
      ? ['#33343a', '#45464c', '#2e2f34', '#4d4e55']
      : ['#4e4f55', '#606167', '#4a4b51', '#66676d'], 1, 3);
    // faint patch repairs
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(rnd() * 512, rnd() * 512, 40 + rnd() * 120, 20 + rnd() * 80);
    }
    return toTexture(c, 1, 1);
  });
}

export function grassTexture(tint = '#62923e', dry = false) {
  return cached('grass' + tint + dry, () => {
    const c = canvas(256, 256), ctx = c.getContext('2d'), rnd = mulberry(11);
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, 256, 256);
    const shades = dry
      ? ['#b3ac62', '#9c9a54', '#c3bd77', '#8d8a4c']
      : ['#5c8b3a', '#6ea047', '#527f33', '#7cae52'];
    speckle(ctx, 256, 256, 6000, rnd, shades, 1, 4);
    // mown stripes
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(0, y, 256, 16);
    }
    return toTexture(c, 1, 1);
  });
}

export function gravelTexture() {
  return cached('gravel', () => {
    const c = canvas(256, 256), ctx = c.getContext('2d'), rnd = mulberry(13);
    ctx.fillStyle = '#b9a684';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 9000, rnd, ['#a89673', '#c9b795', '#98886a', '#d6c7a8'], 1, 3);
    return toTexture(c, 1, 1);
  });
}

export function pavementTexture() {
  return cached('pavement', () => {
    const c = canvas(256, 256), ctx = c.getContext('2d'), rnd = mulberry(17);
    ctx.fillStyle = '#b4afa5';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 4000, rnd, ['#aaa59b', '#bfbab0', '#a09b92'], 1, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.13)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
    }
    return toTexture(c, 1, 1);
  });
}

export function kerbTexture(colors = ['#d8262c', '#f4f4f4']) {
  return cached('kerb' + colors.join(), () => {
    const c = canvas(64, 128), ctx = c.getContext('2d');
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = colors[1];
    ctx.fillRect(0, 64, 64, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, 8, 128);
    return toTexture(c, 1, 1);
  });
}

// Barriers --------------------------------------------------------------------
export function wallTexture(type, color = '#c9ced4', stripe = '#d8262c') {
  return cached('wall' + type + color + stripe, () => {
    const c = canvas(256, 64), ctx = c.getContext('2d'), rnd = mulberry(23);
    if (type === 'tyres') {
      ctx.fillStyle = '#1d1d1f';
      ctx.fillRect(0, 0, 256, 64);
      for (let x = 16; x < 256; x += 32) {
        for (let y = 16; y < 64; y += 32) {
          ctx.strokeStyle = '#2e2e31'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.fillStyle = stripe;
      ctx.fillRect(0, 0, 256, 7);
    } else if (type === 'concrete') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 256, 64);
      speckle(ctx, 256, 64, 900, rnd, ['#d5d2cb', '#c6c3bc', '#e3e0d9'], 1, 2);
      ctx.fillStyle = stripe;
      ctx.fillRect(0, 44, 256, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 3, 64);
    } else { // armco
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = color;
      ctx.fillRect(0, 6, 256, 52);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, 22, 256, 8);
      ctx.fillRect(0, 46, 256, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(0, 10, 256, 5);
      ctx.fillStyle = stripe;
      ctx.fillRect(0, 0, 256, 7);
      for (let x = 8; x < 256; x += 64) {
        ctx.fillStyle = '#8b9098';
        ctx.fillRect(x, 14, 5, 36);
      }
    }
    return toTexture(c, 1, 1);
  });
}

export function bannerTexture(text, bg = '#0e1116', fg = '#ffffff') {
  return cached('banner' + text + bg + fg, () => {
    const c = canvas(512, 64), ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = fg;
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '8px';
    ctx.fillText(text, 256, 34);
    return toTexture(c, 1, 1);
  });
}


// Cached textures are shared, so take a clone when a mesh needs its own tiling.
export function repeated(tex, rx, ry) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

// Pit garages: roller doors with a band of glass above.
export function garageTexture() {
  return cached('garage', () => {
    const c = canvas(256, 128), ctx = c.getContext('2d');
    ctx.fillStyle = '#e7e4dd';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(0, 8, 256, 30);                 // glass band
    for (let x = 8; x < 256; x += 16) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, 8, 5, 30);
    }
    for (let i = 0; i < 4; i++) {
      const x = 12 + i * 62;
      ctx.fillStyle = '#3c434c';
      ctx.fillRect(x, 52, 46, 66);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let y = 56; y < 118; y += 7) ctx.fillRect(x, y, 46, 2);
    }
    ctx.fillStyle = '#c8c4bb';
    ctx.fillRect(0, 44, 256, 6);
    return toTexture(c, 1, 1);
  });
}

// Buildings / crowd -----------------------------------------------------------
export function crowdTexture() {
  return cached('crowd', () => {
    const c = canvas(128, 128), ctx = c.getContext('2d'), rnd = mulberry(29);
    ctx.fillStyle = '#1a1d22';
    ctx.fillRect(0, 0, 128, 128);
    // rows of seats, with muted clothing colours so it reads as a crowd from a distance
    const cols = ['#8f8d86', '#6f4b45', '#3f5570', '#8a7a45', '#4d6a4a', '#9aa1a8', '#6b5570'];
    for (let y = 10; y < 128; y += 16) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y + 10, 128, 3);
      for (let x = 6; x < 128; x += 12) {
        if (rnd() < 0.25) continue;
        ctx.fillStyle = cols[(rnd() * cols.length) | 0];
        ctx.fillRect(x + rnd() * 2, y + rnd() * 2, 7, 9);
      }
    }
    return toTexture(c, 1, 1);
  });
}

export function facadeTexture(color = '#d8d3c8', lit = false, seed = 3) {
  return cached('facade' + color + lit + seed, () => {
    const c = canvas(128, 128), ctx = c.getContext('2d'), rnd = mulberry(seed * 977 + 5);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    speckle(ctx, 128, 128, 700, rnd, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'], 1, 3);
    for (let y = 10; y < 128; y += 20) {
      for (let x = 8; x < 128; x += 18) {
        const on = rnd() < 0.4;
        ctx.fillStyle = lit && on ? '#ffd68a' : 'rgba(28,34,44,0.72)';
        ctx.fillRect(x, y, 11, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x, y + 12, 11, 2);
      }
    }
    return toTexture(c, 1, 1);
  });
}

// Emissive mask for lit windows (used at dusk).
export function facadeEmissive(seed = 3) {
  return cached('facadeE' + seed, () => {
    const c = canvas(128, 128), ctx = c.getContext('2d'), rnd = mulberry(seed * 977 + 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 10; y < 128; y += 20) {
      for (let x = 8; x < 128; x += 18) {
        const on = rnd() < 0.4;
        if (on) { ctx.fillStyle = '#ffcf7a'; ctx.fillRect(x, y, 11, 12); }
      }
    }
    return toTexture(c, 1, 1);
  });
}

// Start/finish line -----------------------------------------------------------
export function checkerTexture(cells = 8) {
  return cached('checker' + cells, () => {
    const c = canvas(256, 64), ctx = c.getContext('2d');
    const s = 256 / cells;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#f2f2f2' : '#15161a';
        ctx.fillRect(i * s, j * 32, s, 32);
      }
    }
    return toTexture(c, 1, 1);
  });
}

export function waterTexture() {
  return cached('water', () => {
    const c = canvas(256, 256), ctx = c.getContext('2d'), rnd = mulberry(41);
    ctx.fillStyle = '#14567a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.03 + rnd() * 0.06})`;
      ctx.lineWidth = 1 + rnd() * 1.5;
      const x = rnd() * 256, y = rnd() * 256, w = 6 + rnd() * 26;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + w / 2, y - 2, x + w, y);
      ctx.stroke();
    }
    return toTexture(c, 1, 1);
  });
}

// The showroom floor. It is a disc on an empty background, and once the studio was
// bright enough to see, the rim of that disc became a hard horizon straight across the
// screen. So the floor darkens to the background colour before it gets there: same
// geometry, no edge. CircleGeometry lays its UVs out from the centre, so a radial
// gradient lands exactly where it should.
export function studioFloorTexture() {
  return cached('studioFloor', () => {
    const c = canvas(256, 256), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
    g.addColorStop(0, '#39424f');
    g.addColorStop(0.28, '#2b323d');
    g.addColorStop(0.62, '#1b2027');
    g.addColorStop(0.88, '#12161c');
    g.addColorStop(1, '#12161c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  });
}

// The pool of light the showroom strips throw on the floor: white in the middle,
// nothing at the edge, meant to be laid down additively.
export function glowTexture() {
  return cached('glow', () => {
    const c = canvas(128, 128), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.45, 'rgba(236,244,255,0.30)');
    g.addColorStop(0.78, 'rgba(210,228,255,0.10)');
    g.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// One puff of tyre smoke or dust: a ragged cluster of soft blobs rather than a single
// disc, so a cloud of them reads as smoke and not as a stack of circles. Only the alpha
// is read; the colour comes from the particle.
export function puffTexture() {
  return cached('puff', () => {
    const c = canvas(128, 128), ctx = c.getContext('2d');
    const rnd = mulberry(77);
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 26;
      const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, s = 18 + rnd() * 20;
      const g = ctx.createRadialGradient(x, y, 0, x, y, s);
      g.addColorStop(0, 'rgba(255,255,255,0.34)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  });
}

// Braking distance boards, 150 / 100 / 50, side by side in one texture: a white board
// with a heavy number, and one to three diagonal bars in the circuit's colour so the count
// reads even when the digits are still too small to make out.
export function brakeBoardTexture(accent = '#37e0a6') {
  return cached('boards' + accent, () => {
    const c = canvas(384, 128), ctx = c.getContext('2d');
    ['150', '100', '50'].forEach((label, k) => {
      const x = k * 128;
      ctx.fillStyle = '#f4f6f8';
      ctx.fillRect(x, 0, 128, 128);
      ctx.strokeStyle = '#12161d';
      ctx.lineWidth = 8;
      ctx.strokeRect(x + 4, 4, 120, 120);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 8, 8, 112, 36);
      ctx.clip();
      ctx.fillStyle = accent;
      for (let b = 0; b < 3 - k; b++) {
        ctx.beginPath();
        const bx = x + 18 + b * 34;
        ctx.moveTo(bx, 44); ctx.lineTo(bx + 18, 8); ctx.lineTo(bx + 34, 8); ctx.lineTo(bx + 16, 44);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#12161d';
      ctx.font = 'bold 64px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 64, 86);
    });
    const t = toTexture(c, 1, 1);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// The light sweeping round the showroom floor: one bright wedge fading off behind it,
// and nothing over the turntable itself. Laid down additively and turned slowly.
export function sweepTexture() {
  return cached('sweep', () => {
    const c = canvas(256, 256), ctx = c.getContext('2d');
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(0, 128, 128);
      g.addColorStop(0, 'rgba(255,255,255,0.0)');
      g.addColorStop(0.02, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.2, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.3, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    // a ring: clear over the turntable, brightest just outside its rim, gone at the edge
    const r = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(0.5, 'rgba(0,0,0,0)');
    r.addColorStop(0.58, 'rgba(0,0,0,1)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// Soft round shadow blob placed under each car.
export function shadowTexture() {
  return cached('shadow', () => {
    const c = canvas(128, 128), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
