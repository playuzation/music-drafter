// Test tone (tree: lab/main → voice): one oscillator playing the custom wave. Pitch and wave can change while it
// sounds, so the result of every edit is heard right away.

const LEVEL = 0.25;

let ctx, osc, gain, coeffs;

// Lazily creates/resumes the AudioContext. The first call must come from a user gesture (mobile autoplay rules).
function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS: sound even in silent mode
  }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

const periodicWave = () => ctx.createPeriodicWave(coeffs.real, coeffs.imag, { disableNormalization: true });

export const playing = () => Boolean(osc);

// coefficients = { real, imag } from table.harmonics()
export function setWave(coefficients) {
  coeffs = coefficients;
  if (osc) osc.setPeriodicWave(periodicWave());
}

export function start(freq) {
  if (osc) return;
  const ac = audio();
  const t = ac.currentTime;
  osc = ac.createOscillator();
  gain = ac.createGain();
  osc.setPeriodicWave(periodicWave());
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(LEVEL, t + 0.02);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
}

export function setFreq(freq) {
  if (osc) osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.01);
}

export function stop() {
  if (!osc) return;
  const t = ctx.currentTime;
  gain.gain.setTargetAtTime(0, t, 0.015);
  osc.stop(t + 0.1);
  osc = null;
}
