// Translations.
//
// One flat table of dotted keys per language, in js/lang/. English is bundled with this
// module and is both the source text and the fallback for any key a translation has not
// caught up with, so a half-finished catalogue degrades to English a line at a time
// rather than showing raw keys.
//
// Static markup carries data-i18n attributes and is rewritten in place by applyStatic();
// anything the game builds at runtime calls t() instead. Both are re-run on a language
// change, so switching language never needs a reload.

import en from './lang/en.js';

// Only these codes are ever imported - a saved setting is data, and a dynamic import
// takes a path, so the list is the allow-list as well as what the options screen shows.
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ru', name: 'Русский' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
];

const FALLBACK = 'en';
const KNOWN = new Set(LANGUAGES.map((l) => l.code));

let dict = en;
let current = FALLBACK;
let plural = new Intl.PluralRules(FALLBACK);

export const language = () => current;

// What the browser asks for, narrowed to something we have. navigator.languages is in
// the user's order of preference, so the first one we can serve wins; a regional tag
// falls back to its base language, which is how zh-CN finds zh and de-AT finds de.
export function detect(prefs) {
  const list = prefs || navigator.languages || [navigator.language || FALLBACK];
  for (const raw of list) {
    if (!raw) continue;
    const tag = String(raw).toLowerCase();
    if (KNOWN.has(tag)) return tag;
    const base = tag.split('-')[0];
    if (KNOWN.has(base)) return base;
  }
  return FALLBACK;
}

// `code` is a language code, or 'auto' / nothing to follow the browser. Resolves to the
// code actually in use, which is English if the requested catalogue could not be had.
export async function setLanguage(code) {
  const want = !code || code === 'auto' ? detect() : String(code);
  let next = en;
  let resolved = FALLBACK;
  if (want !== FALLBACK && KNOWN.has(want)) {
    try {
      next = (await import(`./lang/${want}.js`)).default;
      resolved = want;
    } catch (err) {
      console.warn(`[zrace] no catalogue for "${want}", staying in English`, err);
    }
  }
  dict = next;
  current = resolved;
  plural = new Intl.PluralRules(resolved);
  document.documentElement.lang = resolved;
  applyStatic();
  return resolved;
}

const fill = (s, params) => (params
  ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m))
  : s);

export function t(key, params) {
  const s = dict[key] != null ? dict[key] : en[key];
  if (s == null) {
    console.warn(`[zrace] missing translation key "${key}"`);
    return key;
  }
  return fill(s, params);
}

// Counted things. English needs one or other; Russian wants one / few / many; Chinese and
// Japanese want none of it. Intl knows which categories a language uses, and a catalogue
// only has to supply the ones its language actually needs - `.other` covers the rest.
export function tn(key, n, params) {
  const cat = plural.select(n);
  for (const table of [dict, en]) {
    const s = table[`${key}.${cat}`] != null ? table[`${key}.${cat}`] : table[`${key}.other`];
    if (s != null) return fill(s, { ...params, n: num(n) });
  }
  console.warn(`[zrace] missing plural key "${key}"`);
  return String(n);
}

// Numbers in the player's language: 4,40 km in Berlin, 4.40 km in Birmingham.
export function num(value, digits = 0) {
  return new Intl.NumberFormat(current, {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(value);
}

export function date(ms) {
  return new Date(ms).toLocaleDateString(current, { day: 'numeric', month: 'short', year: '2-digit' });
}

const SETTERS = {
  'data-i18n': (el, s) => { el.textContent = s; },
  'data-i18n-placeholder': (el, s) => el.setAttribute('placeholder', s),
  'data-i18n-aria': (el, s) => el.setAttribute('aria-label', s),
  'data-i18n-title': (el, s) => el.setAttribute('title', s),
};

// Rewrites every marked element under `root`. Safe to call as often as you like: each
// element is set from its key, not edited, so it is the same answer every time.
export function applyStatic(root = document) {
  for (const [attr, set] of Object.entries(SETTERS)) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => set(el, t(el.getAttribute(attr))));
  }
  if (root === document) document.title = t('app.title');
}
