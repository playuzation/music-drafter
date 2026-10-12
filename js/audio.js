// Audio engine (tree: main → audio → synth, wav): AudioContext lifecycle, note preview, a look-ahead step
// sequencer and offline rendering to WAV. It knows nothing about songs: the caller supplies the events.
import { createSynth } from './synth.js';
import { encodeWav } from './wav.js';

export { DRUM_NAMES } from './synth.js';

const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead of the clock
const TICK_MS = 25;
const RENDER_RATE = 44100;
const RENDER_TAIL = 1.5; // seconds rendered after the last step so notes and cymbals ring out (crash: 1.4 s)
const RENDER_SLICE = 1; // seconds of voices created at a time while rendering

let ctx, synth, master, bus;
let timer = 0;
let frame = 0;

// Master gain → limiter → destination. Live playback and offline rendering share it, so files sound the same.
function masterBus(ac) {
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  limiter.connect(ac.destination);
  const gain = ac.createGain();
  gain.gain.value = 0.8;
  gain.connect(limiter);
  return gain;
}

// Lazily creates/resumes the AudioContext. The first call must come from a user gesture (mobile autoplay rules).
function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS: sound even in silent mode
    master = masterBus(ctx);
    synth = createSynth(ctx);
  }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

// event = { drum: 1-8 } | { wave, freq, dur (seconds) }
function sound(event, t, out, voice = synth) {
  if (event.drum) voice.drum(out, event.drum - 1, t);
  else voice.tone(out, event.wave, event.freq, t, event.dur);
}

// Renders time-ordered events ({ time, ...event }) spanning `seconds` offline and returns a mono 16-bit WAV file.
export async function renderWav(events, seconds) {
  const ac = new OfflineAudioContext(1, Math.ceil((seconds + RENDER_TAIL) * RENDER_RATE), RENDER_RATE);
  const out = masterBus(ac);
  const voice = createSynth(ac);
  let next = 0;
  const scheduleBefore = end => {
    for (; next < events.length && events[next].time < end; next++) {
      const { time, ...event } = events[next];
      sound(event, time, out, voice);
    }
  };
  // Creating every voice up front makes long songs render very slowly, so voices are added one slice ahead of
  // the render position. Firefox has no offline suspend() and gets them all at once.
  if (!ac.suspend) {
    scheduleBefore(Infinity);
  } else {
    scheduleBefore(RENDER_SLICE);
    for (let t = RENDER_SLICE; t < seconds; t += RENDER_SLICE) {
      ac.suspend(t - 0.1).then(() => {
        scheduleBefore(t + RENDER_SLICE);
        ac.resume();
      });
    }
  }
  return encodeWav(await ac.startRendering());
}

export function preview(event) {
  sound(event, audio().currentTime + 0.01, master);
}

// Plays a step sequence. Everything is read lazily, so edits and tempo changes apply while playing:
//   length()   steps in one pass, read at the start of every pass
//   at(i)      { events, pos } for step i; `pos` is handed to onPos when that step becomes audible
//   stepSec()  seconds per step
//   loop()     whether to start another pass
//   onPos(pos, frac) called every animation frame with the audible step's `pos` and how far into that step
//              playback is (0-1); onPos(null) once playback has ended
export function play(seq) {
  stop();
  const ac = audio();
  const queue = [];
  let i = 0;
  let len = seq.length();
  let time = ac.currentTime + 0.05;
  bus = ac.createGain();
  bus.connect(master);

  timer = setInterval(() => {
    if (time < ac.currentTime) time = ac.currentTime + 0.05; // timer was throttled (background tab): resync
    while (time < ac.currentTime + LOOKAHEAD) {
      if (i >= len) {
        if (!seq.loop()) {
          clearInterval(timer);
          queue.push([time, null]);
          return;
        }
        i = 0;
        len = seq.length();
      }
      const { events, pos } = seq.at(i++);
      for (const event of events) sound(event, time, bus);
      queue.push([time, pos]);
      time += seq.stepSec();
    }
  }, TICK_MS);

  let heard = null; // [time, pos] of the step being heard
  const draw = () => {
    const now = ac.currentTime - (ac.outputLatency || 0);
    let due = 0;
    while (due < queue.length && queue[due][0] <= now) due++;
    if (due) {
      heard = queue[due - 1];
      queue.splice(0, due);
      if (!heard[1]) return seq.onPos(null);
    }
    if (heard) seq.onPos(heard[1], Math.min(1, (now - heard[0]) / seq.stepSec()));
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
}

export function stop() {
  clearInterval(timer);
  cancelAnimationFrame(frame);
  if (bus) {
    const old = bus;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.01); // quick fade instead of a click
    setTimeout(() => old.disconnect(), 200);
    bus = null;
  }
}
