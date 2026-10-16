// Effects page (tree root): loop the composed song through a chain of switchable effects.
//   fx/main ─┬─ song ── theory   (song file and its sounds; shared with the composer page)
//            ├─ audio ─┬─ synth  (offline rendering of the song; shared with the composer page)
//            │         └─ wav
//            └─ fx/effects
import * as S from '../song.js';
import { renderBuffer } from '../audio.js';
import { EFFECTS, createUnit } from './effects.js';

const $ = id => document.getElementById(id);

let ctx = null; // live AudioContext holding the effect chain; created on the first play (mobile autoplay rules)
let units = null; // effect units, in EFFECTS (signal) order
let source = null; // the playing song
let rendered = null; // Promise of { buffer, seconds } for the loaded song

$('effects').innerHTML = EFFECTS.map(
  e => `<div class="fx">
    <label class="fx-name"><input type="checkbox" data-fx="${e.id}"> ${e.name}</label>
    ${e.params
      .map(
        ([id, label, min, max, step, value, unit]) => `<label class="param"><span>${label} <output>${value}${unit}</output></span>
      <input type="range" data-fx="${e.id}" data-param="${id}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`,
      )
      .join('')}
  </div>`,
).join('');

// Sends one control's value to its effect unit (once the chain exists).
function apply(el) {
  const unit = units?.[EFFECTS.findIndex(e => e.id === el.dataset.fx)];
  if (!unit) return;
  if (el.type === 'checkbox') unit.setOn(el.checked);
  else unit.set(el.dataset.param, +el.value);
}

function chain() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS: sound even in silent mode
  units = EFFECTS.map(e => createUnit(ctx, e.id));
  for (let i = 1; i < units.length; i++) units[i - 1].output.connect(units[i].input);
  units[units.length - 1].output.connect(ctx.destination);
  for (const el of $('effects').querySelectorAll('[data-fx]')) apply(el);
  return ctx;
}

function setPlaying(on) {
  $('play').classList.toggle('on', on);
}

function stop() {
  if (source) source.stop();
  source = null;
  setPlaying(false);
}

async function play() {
  const ac = chain(); // inside the click: unlocks audio on mobile
  if (ac.state !== 'running') ac.resume();
  try {
    const { buffer, seconds } = await rendered;
    stop();
    source = ac.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopEnd = seconds;
    source.connect(units[0].input);
    source.start();
    setPlaying(true);
  } catch (e) {
    $('status').textContent = `재생하지 못했습니다: ${e.message}`;
  }
}

// Renders the song once with the composer's synth; effects are applied live on top of it.
function load(song, title) {
  stop();
  const { sounds, seconds } = S.songSounds(song);
  $('status').textContent = '곡을 준비하는 중입니다…';
  rendered = renderBuffer(sounds, seconds).then(buffer => ({ buffer, seconds }));
  rendered.then(
    () => ($('status').textContent = ''),
    e => ($('status').textContent = `곡을 준비하지 못했습니다: ${e.message}`),
  );
  $('song-info').textContent = `${title} · 마디 ${S.measureCount(song)}개 · ${song.bpm} BPM · 트랙 ${song.tracks.length}개`;
  $('play').disabled = false;
}

$('effects').addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.param) el.parentElement.querySelector('output').textContent = el.value + el.dataset.unit;
  apply(el);
});
$('play').addEventListener('click', play);
$('stop').addEventListener('click', stop);
$('open').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async () => {
  const [file] = $('file').files;
  $('file').value = '';
  if (!file) return;
  try {
    load(S.fromJSON(await file.text()), file.name);
  } catch (e) {
    $('status').textContent = `불러오기 실패: ${e.message}`;
  }
});

try {
  load(S.fromJSON(sessionStorage.getItem(S.SESSION_KEY)), '작곡 페이지의 곡');
} catch {
  $('song-info').textContent = '곡이 없습니다. 작곡 페이지에서 곡을 만들거나 JSON 파일을 불러오세요.';
}
