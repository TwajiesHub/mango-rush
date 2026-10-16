// Mango Rush — the tuning panel.   OWNER: Claude Code  ·  STATUS: step 3, DEBUG ONLY
//
// Loaded ONLY with ?debug in the address: main.js imports it with a dynamic import(), so players never download it.
//
//   initTune({ getPerf }) -> void   (getPerf is optional)
//     A small paper-and-ink panel at the right edge, collapsed to a "TUNE" tab. The T key (or the tab) opens and closes it.
//     Sliders for every TUNE value marked for the panel (core/config.js TUNE_DEFS), grouped, each with a live value; changes apply
//     at once. Buttons: Copy values (a JSON object of every changed value goes to the clipboard) and Reset (back to the defaults).
//     Changed values are remembered in localStorage (debug mode only, try/catch everywhere) and restored on the next load.
//
// PERFORMANCE. The top of the panel shows fps, the average and worst frame time over the last 2 s, the measured refresh rate, the
// current fps cap, antialias on/off, the pixel ratio and the quality level (see renderer.js). It refreshes 4 times a second and ONLY
// while the panel is open, so it costs nothing when closed.
//
// FAIRNESS. While any value really differs from the default (tuneIsChanged(), which ignores slider rounding), a tag
// "TUNING · NOT RANKED" with a one-tap Reset is on screen, from the moment the page loads (so also from the very start of a
// run when values were restored), and main.js does not save the run to the start.ng leaderboard. This holds on the beta too:
// the rule is about the values, not the address.
//
// KEYS. The panel never swallows game keys: after a slider changes it is blurred, so the arrow keys and WASD go to the game; and
// a game key pressed while a slider has focus blurs it first and does not move the slider.

import { TUNE, TUNE_DEFS, setTune, resetTune, tuneIsChanged, tuneChangedValues } from '../core/config.js';
import { state } from '../core/state.js';

const KEY = 'mango-rush:tune';
const GAME_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'p', 'escape']);

let panel = null;
let tab = null;
let tag = null;
let perfBox = null;
let perfTimer = 0;
let getPerfFn = null;
const rows = new Map();   // key -> { input, out }

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (saved && typeof saved === 'object') for (const [k, v] of Object.entries(saved)) setTune(k, Number(v));
  } catch { /* storage blocked or corrupt: start from the defaults */ }
}

function save() {
  try {
    const changed = tuneChangedValues();
    if (Object.keys(changed).length) localStorage.setItem(KEY, JSON.stringify(changed));
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

const fmt = (d, v) => (d.step >= 1 ? String(Math.round(v)) : v.toFixed(d.step >= 0.1 ? 1 : 2));

function refresh() {
  for (const d of TUNE_DEFS) {
    const r = rows.get(d.key);
    if (!r) continue;
    r.input.value = String(TUNE[d.key]);
    r.out.textContent = fmt(d, TUNE[d.key]);
    r.row.classList.toggle('is-changed', Math.abs(TUNE[d.key] - d.def) > Math.max(1e-6, d.step * 0.25));
  }
  tag.hidden = !tuneIsChanged();
}

function doReset() {
  resetTune();
  save();
  refresh();
}

let lastPerfText = '';
function paintPerf() {
  if (!getPerfFn || !perfBox) return;
  const p = getPerfFn();
  const text = [
    `${p.fps.toFixed(0)} fps   avg ${p.avgMs.toFixed(1)} ms   worst ${p.worstMs.toFixed(1)} ms`,
    `refresh ${p.refreshHz ? p.refreshHz.toFixed(0) + ' Hz' : 'measuring…'}   cap ${p.capped ? p.capFps.toFixed(0) + ' fps (on)' : 'off'}`,
    `antialias ${p.antialias ? 'on' : 'off'}   pixel ratio ${p.pixelRatio}   quality ${p.level + 1}/${p.levels}`,
    p.gpu ? `GPU ${p.gpu}` : 'GPU unknown',
  ].join('\n');
  if (text !== lastPerfText) { lastPerfText = text; perfBox.textContent = text; }   // write only when it changed
}

function toggle(open) {
  const show = open === undefined ? panel.hidden : open;
  panel.hidden = !show;
  tab.setAttribute('aria-expanded', String(show));
  clearInterval(perfTimer);
  if (show && getPerfFn) { paintPerf(); perfTimer = setInterval(paintPerf, 250); }   // only while open
}

async function copyValues(btn) {
  const text = JSON.stringify(tuneChangedValues(), null, 2);
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { /* fall back below */ }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  const old = btn.textContent;
  btn.textContent = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => { btn.textContent = old; }, 1400);
}

export function initTune({ getPerf } = {}) {
  getPerfFn = getPerf || null;
  const style = document.createElement('style');
  style.textContent = `
    .tune-tab { position: fixed; right: 0; top: 46%; z-index: 30; min-width: 44px; min-height: 44px; padding: 6px 10px; border: var(--border); border-right: 0; border-radius: var(--radius) 0 0 var(--radius); background: var(--paper); color: var(--ink); font: 800 12px var(--font-body); letter-spacing: 0.14em; cursor: pointer; pointer-events: auto; }
    .tune { position: fixed; right: 0; top: 0; bottom: 0; z-index: 31; width: min(330px, 92vw); box-sizing: border-box; overflow-y: auto; padding: 12px 14px 18px; background: var(--paper); color: var(--ink); border-left: var(--border); font: 600 13px var(--font-body); pointer-events: auto; overscroll-behavior: contain; }
    .tune[hidden], .tune-tag[hidden] { display: none; }
    .tune .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; position: sticky; top: -12px; margin: -12px -14px 4px; padding: 8px 14px; background: var(--paper); z-index: 1; }
    .tune .perf { margin: 4px 0 0; padding: 6px 8px; background: var(--ink); color: var(--cream); border-radius: var(--radius); font: 600 11px/1.45 ui-monospace, Consolas, monospace; white-space: pre-wrap; }
    .tune h2 { margin: 0; font: 900 18px var(--font-display); }
    .tune h3 { margin: 14px 0 4px; font: 800 11px var(--font-body); letter-spacing: 0.2em; text-transform: uppercase; }
    .tune .row { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; padding: 3px 0; align-items: center; }
    .tune .row.is-changed .name { text-decoration: underline; text-decoration-color: var(--vermilion); text-decoration-thickness: 2px; }
    .tune .row output { font-variant-numeric: tabular-nums; font-weight: 800; }
    .tune .row input { grid-column: 1 / -1; width: 100%; height: 30px; margin: 0; accent-color: var(--ink); }
    .tune .bar { display: flex; gap: 8px; margin-top: 10px; }
    .tune button, .tune-tag button { min-height: 44px; padding: 6px 14px; border: var(--border); border-radius: var(--radius); background: var(--ink); color: var(--saffron); font: 800 13px var(--font-body); cursor: pointer; }
    .tune .bar button { flex: 1; }
    .tune .note { margin: 8px 0 0; font-size: 12px; font-weight: 600; }
    .tune-tag { position: fixed; z-index: 29; right: 16px; top: 142px; display: flex; align-items: center; gap: 8px; padding: 3px 4px 3px 10px; background: var(--ink); color: var(--cream); border-radius: 99px; font: 800 11px var(--font-body); letter-spacing: 0.14em; pointer-events: auto; }
    .tune-tag button { min-height: 44px; padding: 0 12px; border-radius: 99px; background: var(--saffron); color: var(--ink); border: 0; font-size: 11px; letter-spacing: 0.12em; }
  `;
  document.head.appendChild(style);

  load();

  tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'tune-tab';
  tab.textContent = 'TUNE';
  tab.setAttribute('aria-label', 'Tuning panel (T)');
  tab.setAttribute('aria-expanded', 'false');

  panel = document.createElement('aside');
  panel.className = 'tune';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Tuning panel');
  const head = document.createElement('div');
  head.className = 'head';
  const title = document.createElement('h2');
  title.textContent = 'Tuning · T closes';
  const close = document.createElement('button');   // phones have no T key
  close.type = 'button';
  close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close the tuning panel');
  close.addEventListener('click', () => { toggle(false); close.blur(); });
  head.append(title, close);
  panel.appendChild(head);
  perfBox = document.createElement('pre');
  perfBox.className = 'perf';
  perfBox.setAttribute('aria-label', 'Performance');
  panel.appendChild(perfBox);

  let group = '';
  for (const d of TUNE_DEFS) {
    if (!d.panel) continue;
    if (d.group !== group) {
      group = d.group;
      const h = document.createElement('h3');
      h.textContent = group;
      panel.appendChild(h);
    }
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('label');
    name.className = 'name';
    name.textContent = d.label;
    const out = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.step);
    input.id = `tune-${d.key}`;
    name.htmlFor = input.id;
    input.addEventListener('input', () => {
      setTune(d.key, Number(input.value));
      out.textContent = fmt(d, TUNE[d.key]);
      row.classList.toggle('is-changed', Math.abs(TUNE[d.key] - d.def) > Math.max(1e-6, d.step * 0.25));
      tag.hidden = !tuneIsChanged();
      save();
    });
    input.addEventListener('change', () => input.blur());   // give the keys back to the game
    row.append(name, out, input);
    panel.appendChild(row);
    rows.set(d.key, { input, out, row });
  }

  const bar = document.createElement('div');
  bar.className = 'bar';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy values';
  copy.addEventListener('click', () => { copyValues(copy); copy.blur(); });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset';
  reset.addEventListener('click', () => { doReset(); reset.blur(); });
  bar.append(copy, reset);
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = 'Runs with changed values are not saved to the leaderboard. Underlined = changed. G toggles a slippery test patch.';
  panel.append(bar, note);

  tag = document.createElement('div');
  tag.className = 'tune-tag';
  tag.hidden = true;
  const label = document.createElement('span');
  label.textContent = 'TUNING · NOT RANKED';
  const tagReset = document.createElement('button');
  tagReset.type = 'button';
  tagReset.textContent = 'RESET';
  tagReset.setAttribute('aria-label', 'Reset tuning to the defaults');
  tagReset.addEventListener('click', () => { doReset(); tagReset.blur(); });
  tag.append(label, tagReset);

  tab.addEventListener('click', () => { toggle(); tab.blur(); });
  document.body.append(tab, panel, tag);

  // keys: T toggles the panel; a game key never moves a slider (it hands the focus back to the game instead)
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 't' && !e.repeat) { toggle(); return; }
    const el = document.activeElement;
    if (el && panel.contains(el) && GAME_KEYS.has(k) && (state.screen === 'play' || el.type === 'range')) {
      if (el.type === 'range') e.preventDefault();   // the slider must not move on a game key
      el.blur();
    }
  }, true);

  refresh();
  window.__tune = { TUNE, setTune, resetTune, tuneIsChanged, tuneChangedValues, refresh };
}
