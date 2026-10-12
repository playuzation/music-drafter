// Sound sources on Web Audio (tree leaf): oscillator tones and synthesized drum hits.

export const DRUM_NAMES = ['킥', '스네어', '클랩', '로우탐', '하이탐', '닫힌햇', '열린햇', '크래시'];

// Peak gain per waveform, roughly matching loudness (square/saw are much louder than sine at equal amplitude).
const LEVEL = { sine: 0.3, triangle: 0.34, square: 0.12, sawtooth: 0.18 };

export function createSynth(ctx) {
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  // Gain starting at `peak` and fading out over `decay` seconds.
  function env(out, t, peak, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    g.connect(out);
    return g;
  }

  // Oscillator whose pitch drops from f0 to f1 within `glide` seconds (kick, toms, snare body).
  function drop(type, f0, f1, glide, t, out, end) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    o.connect(out);
    o.start(t);
    o.stop(end);
  }

  // Filtered white noise (snare, clap, cymbals).
  function hiss(filter, freq, t, out, end) {
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    src.buffer = noise;
    f.type = filter;
    f.frequency.value = freq;
    src.connect(f).connect(out);
    src.start(t);
    src.stop(end);
  }

  function clap(out, t) {
    const g = ctx.createGain();
    for (const d of [0, 0.012, 0.024]) {
      g.gain.setValueAtTime(1.5, t + d);
      g.gain.exponentialRampToValueAtTime(0.15, t + d + 0.01);
    }
    g.gain.setValueAtTime(1.3, t + 0.036);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    g.connect(out);
    hiss('bandpass', 1300, t, g, t + 0.25);
  }

  const drums = [
    (out, t) => drop('sine', 150, 42, 0.12, t, env(out, t, 0.9, 0.45), t + 0.45),
    (out, t) => {
      hiss('highpass', 1200, t, env(out, t, 0.45, 0.18), t + 0.2);
      drop('triangle', 220, 160, 0.08, t, env(out, t, 0.35, 0.12), t + 0.12);
    },
    clap,
    (out, t) => drop('sine', 120, 75, 0.3, t, env(out, t, 0.7, 0.4), t + 0.4),
    (out, t) => drop('sine', 210, 140, 0.25, t, env(out, t, 0.6, 0.3), t + 0.3),
    (out, t) => hiss('highpass', 7500, t, env(out, t, 0.25, 0.06), t + 0.07),
    (out, t) => hiss('highpass', 7000, t, env(out, t, 0.22, 0.4), t + 0.4),
    (out, t) => hiss('highpass', 4500, t, env(out, t, 0.25, 1.4), t + 1.4),
  ];

  // Pitched note: fast attack, gentle decay to a sustain level, short release ending at t + dur.
  function tone(out, wave, freq, t, dur) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const peak = LEVEL[wave];
    const rel = Math.min(0.05, dur / 3);
    o.type = wave;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.setTargetAtTime(peak * 0.6, t + 0.005, 0.15);
    g.gain.setTargetAtTime(0, t + dur - rel, rel / 4);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + rel);
  }

  return { tone, drum: (out, index, t) => drums[index](out, t) };
}
