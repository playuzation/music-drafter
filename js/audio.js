// Audio engine (tree: main → audio → synth): AudioContext lifecycle, note preview and a look-ahead step sequencer.
// It knows nothing about songs: the caller supplies the events for each step.
import { createSynth } from './synth.js';

export { DRUM_NAMES } from './synth.js';

const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead of the clock
const TICK_MS = 25;

let ctx, synth, master, bus;
let timer = 0;
let frame = 0;

// Lazily creates/resumes the AudioContext. The first call must come from a user gesture (mobile autoplay rules).
function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS: sound even in silent mode
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(limiter);
    synth = createSynth(ctx);
  }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

// event = { drum: 1-8 } | { wave, freq, dur (seconds) }
function sound(event, t, out) {
  if (event.drum) synth.drum(out, event.drum - 1, t);
  else synth.tone(out, event.wave, event.freq, t, event.dur);
}

export function preview(event) {
  sound(event, audio().currentTime + 0.01, master);
}

// Plays a step sequence. Everything is read lazily, so edits and tempo changes apply while playing:
//   length()   steps in one pass, read at the start of every pass
//   at(i)      { events, pos } for step i; `pos` is handed to onPos when that step becomes audible
//   stepSec()  seconds per step
//   loop()     whether to start another pass
//   onPos(pos) called on animation frames as steps are heard; onPos(null) once playback has ended
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

  const draw = () => {
    const now = ac.currentTime - (ac.outputLatency || 0);
    let due = 0;
    while (due < queue.length && queue[due][0] <= now) due++;
    if (due) {
      const pos = queue[due - 1][1];
      queue.splice(0, due);
      seq.onPos(pos);
      if (!pos) return;
    }
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
