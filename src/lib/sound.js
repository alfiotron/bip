// Suoni generati al momento, senza file audio: funzionano anche offline.
let ctx = null;
let enabled = true;

export const setSoundEnabled = (on) => { enabled = on; };

function tone(freq, start, duration, type = 'sine', volume = 0.15) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.02);
}

export function play(kind) {
  if (!enabled) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (kind === 'ok') tone(1320, 0, 0.09);
    else if (kind === 'warn') { tone(880, 0, 0.12, 'triangle'); tone(660, 0.14, 0.14, 'triangle'); }
    else if (kind === 'err') { tone(220, 0, 0.18, 'square', 0.08); tone(180, 0.2, 0.26, 'square', 0.08); }
    else if (kind === 'pay') { tone(988, 0, 0.1); tone(1319, 0.1, 0.16); }
  } catch { /* audio non disponibile */ }
}
