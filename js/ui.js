// DOM view (tree leaf): renders the app state and turns user input into action objects for main.js.
// It imports nothing; init() hands it the spec constants and the label/tie queries it needs.

const TYPE_NAMES = { sine: '정현파', triangle: '삼각파', square: '사각파', sawtooth: '톱니파', drum: '드럼' };
const COLORS = ['#5ad1ff', '#ff6fae', '#b6f36b', '#ffc85a', '#a98bff', '#ff8a65', '#4fe0b0', '#e6e66e'];

// ctx = { spec: { STEPS, STEPS_PER_BEAT, DEGREES, MAX_TRACKS, MAX_MEASURES, TRACK_TYPES, OCTAVES, DOTTABLE },
//         label(t, deg), tieIn(t, m, note), tieOut(t, m, note), onAction(action) }
let ctx;
let toastTimer = 0;

const $ = id => document.getElementById(id);
const range = n => Array.from({ length: n }, (_, i) => i);
const x = steps => `${(steps / ctx.spec.STEPS) * 100}%`;
const option = (value, text, current) => `<option value="${value}"${value === current ? ' selected' : ''}>${text}</option>`;
const playheadHTML = () => `<i class="playhead" style="width:${x(1)}" hidden></i>`;

export function init(context) {
  ctx = context;
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
}

// ---- input ----

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const action = {};
  for (const [k, v] of Object.entries(el.dataset)) action[k] = v !== '' && !isNaN(v) ? +v : v;
  if (action.act === 'open') return $('file').click();
  if (action.act === 'grid') return onGrid(e, el, action.t);
  if (action.act === 'ruler') return ctx.onAction({ act: 'cursor', step: stepAt(e, el) });
  ctx.onAction(action);
}

// Tap on a grid: another lane gets selected; on the edited lane a note is picked or a new one is placed.
function onGrid(e, grid, t) {
  if (!grid.closest('.sel')) return ctx.onAction({ act: 'track', t });
  const note = e.target.closest('.note');
  if (note) return ctx.onAction({ act: 'note', start: +note.dataset.start, deg: +note.dataset.deg });
  const { DEGREES } = ctx.spec;
  const r = grid.getBoundingClientRect();
  const row = Math.min(DEGREES - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * DEGREES)));
  ctx.onAction({ act: 'cell', step: stepAt(e, grid), deg: DEGREES - row });
}

function stepAt(e, el) {
  const { STEPS } = ctx.spec;
  const r = el.getBoundingClientRect();
  return Math.min(STEPS - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * STEPS)));
}

function onChange(e) {
  const el = e.target;
  if (el.id === 'file') return readFile(el);
  if (!el.dataset.set) return;
  const v = el.type === 'checkbox' ? el.checked : el.value !== '' && !isNaN(el.value) ? +el.value : el.value;
  ctx.onAction({ act: el.dataset.set, t: +el.dataset.t, v });
}

async function readFile(input) {
  const [file] = input.files;
  input.value = ''; // picking the same file again must still fire `change`
  if (file) ctx.onAction({ act: 'import', text: await file.text() });
}

// ---- output ----

export function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

export function render(s) {
  const { tracks } = s.song;
  const count = tracks[0].measures.length;
  const { MAX_TRACKS, MAX_MEASURES } = ctx.spec;

  if (+$('bpm').value !== s.song.bpm) $('bpm').value = s.song.bpm; // also shows the clamped value
  $('scale').value = s.song.scale;
  $('loop').checked = s.loop;
  for (const b of document.querySelectorAll('[data-act="play"]')) b.classList.toggle('on', b.dataset.mode === s.playing);

  $('measure-info').textContent = `마디 ${s.measure + 1} / ${count}`;
  $('add-measure').disabled = $('copy-measure').disabled = count >= MAX_MEASURES;
  $('del-measure').disabled = count <= 1;
  const tabs = $('tabs');
  tabs.innerHTML = range(count)
    .map(m => `<button class="tab${m === s.measure ? ' on' : ''}" data-act="measure" data-m="${m}">${m + 1}</button>`)
    .join('');
  const on = tabs.children[s.measure];
  if (on.offsetLeft < tabs.scrollLeft || on.offsetLeft + on.offsetWidth > tabs.scrollLeft + tabs.clientWidth) {
    tabs.scrollLeft = on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2;
  }

  $('lanes').innerHTML = tracks.map((track, t) => (t === s.track ? editLane : miniLane)(s, track, t)).join('');
  $('add-track').disabled = tracks.length >= MAX_TRACKS;
  $('add-track').textContent = `+ 트랙 추가 (${tracks.length}/${MAX_TRACKS})`;

  renderPalette(s);
  playhead(s.pos, s.measure);
}

// Moves the playhead without re-rendering: highlights the playing measure tab and step column.
export function playhead(pos, measure) {
  for (const tab of $('tabs').children) tab.classList.toggle('play', pos?.m === +tab.dataset.m);
  for (const el of $('lanes').querySelectorAll('.playhead')) {
    el.hidden = pos?.m !== measure;
    if (!el.hidden) el.style.left = x(pos.s);
  }
}

// The lane being edited: settings, beat ruler, labelled piano-roll grid with cursor, and the rest row.
function editLane(s, track, t) {
  const { STEPS, STEPS_PER_BEAT, DEGREES, TRACK_TYPES, OCTAVES } = ctx.spec;
  const drum = track.type === 'drum';
  const notes = track.measures[s.measure];
  const types = TRACK_TYPES.map(v => option(v, TYPE_NAMES[v], track.type)).join('');
  const octaves = OCTAVES.map(v => option(v, `옥타브 ${v}`, track.octave)).join('');
  const ruler = range(STEPS).map(i => `<span>${i % STEPS_PER_BEAT ? '' : i / STEPS_PER_BEAT + 1}</span>`).join('');
  const keys = range(DEGREES)
    .map(i => DEGREES - i)
    .map(d => `<span>${drum ? '' : `<b>${d}</b>`}${ctx.label(t, d)}</span>`)
    .join('');
  return `<section class="lane sel" style="--c:${COLORS[t]}">
    <div class="lane-head">
      <strong>트랙 ${t + 1}</strong>
      <select data-set="type" data-t="${t}" aria-label="트랙 ${t + 1} 음색">${types}</select>
      ${drum ? '' : `<select data-set="octave" data-t="${t}" aria-label="트랙 ${t + 1} 옥타브">${octaves}</select>`}
      <button class="del-track" data-act="delTrack" data-t="${t}"${s.song.tracks.length > 1 ? '' : ' disabled'} aria-label="트랙 ${t + 1} 삭제">✕</button>
    </div>
    <div class="roll">
      <span></span>
      <div class="ruler" data-act="ruler" title="탭하면 입력 위치(커서)를 옮깁니다">${ruler}</div>
      <div class="keys">${keys}</div>
      <div class="grid" data-act="grid" data-t="${t}">${notesHTML(s, t, notes, true)}<i class="cursor" style="left:${x(s.cursor)}"></i>${playheadHTML()}</div>
      <span class="rest-key">쉼표</span>
      <div class="rests">${restsHTML(notes)}</div>
    </div>
  </section>`;
}

// Other lanes: a compact read-only preview of the same measure; tapping selects the track.
function miniLane(s, track, t) {
  return `<section class="lane mini" style="--c:${COLORS[t]}">
    <div class="roll">
      <button class="lane-pick" data-act="track" data-t="${t}">트랙 ${t + 1}<small>${TYPE_NAMES[track.type]}</small></button>
      <div class="grid" data-act="grid" data-t="${t}">${notesHTML(s, t, track.measures[s.measure], false)}${playheadHTML()}</div>
    </div>
  </section>`;
}

function notesHTML(s, t, notes, full) {
  const { DEGREES } = ctx.spec;
  const melodic = s.song.tracks[t].type !== 'drum';
  return notes
    .map(n => {
      let cls = 'note';
      if (full) {
        if (s.sel?.start === n.start && s.sel.deg === n.deg) cls += ' on';
        if (n.tie) cls += ctx.tieOut(t, s.measure, n) ? ' tie' : ' tie open';
        if (n.start === 0 && ctx.tieIn(t, s.measure, n)) cls += ' tied';
      }
      const top = ((DEGREES - n.deg) / DEGREES) * 100;
      const style = `left:${x(n.start)};width:${x(n.len)};top:${top}%`;
      return `<div class="${cls}" data-start="${n.start}" data-deg="${n.deg}" style="${style}">${full && melodic ? n.deg : ''}</div>`;
    })
    .join('');
}

// Steps covered by no note are rests, shown as the largest beat-aligned rest values (as in sheet music).
function restsHTML(notes) {
  const { STEPS, STEPS_PER_BEAT } = ctx.spec;
  const busy = Array(STEPS).fill(false);
  for (const n of notes) busy.fill(true, n.start, n.start + n.len);
  let html = '';
  for (let p = 0; p < STEPS; ) {
    if (busy[p]) {
      p++;
      continue;
    }
    let d = STEPS;
    while (p % d || p + d > STEPS || busy.slice(p, p + d).includes(true)) d /= 2;
    const beats = d / STEPS_PER_BEAT;
    const text = d >= STEPS_PER_BEAT ? `쉼표 ${beats}박` : '쉼';
    html += `<span class="rest" style="left:${x(p)};width:${x(d)}" title="쉼표 ${beats}박">${text}</span>`;
    p += d;
  }
  return html;
}

function renderPalette(s) {
  const { DEGREES, DOTTABLE } = ctx.spec;
  const track = s.song.tracks[s.track];
  const drum = track.type === 'drum';
  const dottable = DOTTABLE.includes(s.dur);
  for (const b of $('durs').querySelectorAll('[data-act="dur"]')) b.classList.toggle('on', +b.dataset.v === s.dur);
  $('dot').disabled = !dottable;
  $('dot').classList.toggle('on', dottable && s.dotted);
  $('degs').innerHTML = range(DEGREES)
    .map(i => i + 1)
    .map(d => {
      const label = ctx.label(s.track, d);
      return `<button data-act="deg" data-v="${d}">${drum ? `<span>${label}</span>` : `<b>${d}</b><small>${label}</small>`}</button>`;
    })
    .join('');
  const note = s.sel && track.measures[s.measure].find(n => n.start === s.sel.start && n.deg === s.sel.deg);
  $('tie').disabled = $('del').disabled = !note;
  $('tie').classList.toggle('on', Boolean(note?.tie));
}
