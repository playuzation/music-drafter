// Waveform lab page (tree root): draw one cycle of a wave and listen to it at any pitch.
//   lab/main ─┬─ lab/table
//             ├─ lab/voice
//             └─ theory   (pitch helpers, a leaf shared with the composer page)
import * as T from './table.js';
import * as voice from './voice.js';
import { midiFreq, midiName } from '../theory.js';

const $ = id => document.getElementById(id);
const canvas = $('wave');
const pitch = $('pitch');
const playButton = $('play');

let table = T.preset('sine');
let last = null; // previous pointer position [x, v] while drawing
let frame = 0;

// One cycle; sample i sits at the middle of its slot, and the line wraps to the neighbouring cycles at the edges.
function draw() {
  const dpr = window.devicePixelRatio || 1;
  const w = (canvas.width = canvas.clientWidth * dpr);
  const h = (canvas.height = canvas.clientHeight * dpr);
  const g = canvas.getContext('2d');
  g.strokeStyle = '#2e3442';
  g.lineWidth = dpr;
  g.beginPath();
  for (const f of [0.25, 0.5, 0.75]) {
    g.moveTo(w * f, 0);
    g.lineTo(w * f, h);
  }
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  g.strokeStyle = '#7aa2ff';
  g.lineWidth = 2.5 * dpr;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = -1; i <= T.SIZE; i++) {
    const v = table[(i + T.SIZE) % T.SIZE];
    g.lineTo(((i + 0.5) / T.SIZE) * w, ((1 - v) / 2) * h);
  }
  g.stroke();
}

// Redraws and updates the sound at most once per frame while drawing.
function changed() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    draw();
    voice.setWave(T.harmonics(table));
  });
}

function pointAt(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, 1 - (2 * (e.clientY - r.top)) / r.height];
}

function stroke(e) {
  const p = pointAt(e);
  T.paint(table, ...(last || p), ...p);
  last = p;
  changed();
}

function showPitch() {
  const m = +pitch.value;
  $('pitch-label').textContent = `${midiName(m)} · ${midiFreq(m).toFixed(1)} Hz`;
}

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  last = null;
  stroke(e);
});
canvas.addEventListener('pointermove', e => last && stroke(e));
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => (last = null));

for (const button of document.querySelectorAll('[data-preset]')) {
  button.addEventListener('click', () => {
    table = T.preset(button.dataset.preset);
    changed();
  });
}

pitch.addEventListener('input', () => {
  showPitch();
  voice.setFreq(midiFreq(+pitch.value));
});

playButton.addEventListener('click', () => {
  if (voice.playing()) voice.stop();
  else voice.start(midiFreq(+pitch.value));
  playButton.textContent = voice.playing() ? '■ 멈추기' : '▶ 소리 내기';
  playButton.classList.toggle('on', voice.playing());
});

window.addEventListener('resize', draw);
voice.setWave(T.harmonics(table));
showPitch();
draw();
