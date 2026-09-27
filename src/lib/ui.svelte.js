import { play } from './sound.js';

// Avvisi a comparsa in basso e indicatore di stato in alto.
export const ui = $state({
  toast: null, // { kind: 'ok' | 'warn' | 'err', title, detail, code, action: { label, run } }
  status: { kind: 'idle', text: 'Pronto a scansionare' },
  navOpen: false,
  eventMenuOpen: false
});

let toastTimer;
let statusTimer;

export function showToast(kind, title, { detail = '', code = '', ms, action = null, sound = kind } = {}) {
  ui.toast = { kind, title, detail, code, action };
  clearTimeout(toastTimer);
  const wait = ms ?? (kind === 'ok' ? 2200 : kind === 'warn' ? 6000 : 0); // gli errori restano finché non li chiudi
  if (wait) toastTimer = setTimeout(() => { ui.toast = null; }, wait);
  if (sound) play(sound);
}

export function hideToast() {
  clearTimeout(toastTimer);
  ui.toast = null;
}

export function setStatus(kind, text, ms = 0) {
  ui.status = { kind, text };
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { ui.status = { kind: 'idle', text: 'Pronto a scansionare' }; }, ms);
}
