// Controller (tree root): owns the app state, applies UI actions to the song and drives playback.
//   main ─┬─ song ── theory
//         ├─ audio ── synth
//         └─ ui
import * as S from './song.js';
import * as audio from './audio.js';
import * as ui from './ui.js';

const DOTTABLE = [2, 4, 8]; // ½, 1 and 2 beats may be dotted (×1.5 → 3, 6, 12 steps)
// Note lengths that map back onto the length buttons: steps → [dur, dotted]
const LENGTH_INPUT = { 1: [1, false], 2: [2, false], 3: [2, true], 4: [4, false], 6: [4, true], 8: [8, false], 12: [8, true], 16: [16, false] };

const state = {
  song: S.createSong(),
  measure: 0, // measure being edited
  track: 0, // track being edited
  cursor: 0, // step where the next palette input lands
  sel: null, // selected note { start, deg, picked }; picked = tapped by the user, so length buttons resize it
  dur: 4, // input length in steps (1 = ¼ beat … 16 = 4 beats)
  dotted: false,
  loop: true,
  playing: null, // 'measure' | 'song' | null
  pos: null, // audible playhead { m, s }
};

const stepSec = () => 60 / state.song.bpm / S.STEPS_PER_BEAT;
const inputLen = () => (state.dotted && DOTTABLE.includes(state.dur) ? state.dur * 1.5 : state.dur);
const snap = step => step - (step % Math.min(state.dur, S.STEPS_PER_BEAT));
const beats = steps => steps / S.STEPS_PER_BEAT;
const editedTrack = () => state.song.tracks[state.track];
const selectedNote = () => state.sel && S.findNote(state.song, state.track, state.measure, state.sel.start, state.sel.deg);
const hasNotes = measures => measures.some(notes => notes.length);
const pad = n => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

function soundOf(track, deg, steps) {
  if (track.type === 'drum') return { drum: deg };
  return { wave: track.type, freq: S.noteFreq(state.song, track, deg), dur: steps * stepSec() };
}

function preview(deg, len) {
  audio.preview(soundOf(editedTrack(), deg, Math.min(len, S.STEPS_PER_BEAT)));
}

function goMeasure(m) {
  state.measure = m;
  state.cursor = 0;
  state.sel = null;
}

// Writes a note of the input length at `start` in the edited measure/track and moves the cursor after it.
function place(start, deg) {
  const len = inputLen();
  if (start + len > S.STEPS) return ui.toast(`이 위치에는 ${beats(S.STEPS - start)}박까지만 들어갑니다.`);
  S.placeNote(state.song, state.track, state.measure, start, len, deg);
  state.sel = { start, deg, picked: false };
  state.cursor = (start + len) % S.STEPS;
  preview(deg, len);
}

// Changes the input length; a note the user picked takes the new length too (unless it would overflow the measure).
function setLength(dur, dotted) {
  const prev = [state.dur, state.dotted];
  [state.dur, state.dotted] = [dur, dotted];
  const note = state.sel?.picked && selectedNote();
  if (!note) return;
  if (S.resizeNote(state.song, state.track, state.measure, note, inputLen())) {
    state.cursor = (note.start + inputLen()) % S.STEPS;
  } else {
    [state.dur, state.dotted] = prev;
    ui.toast('마디 끝을 넘어가서 길이를 바꿀 수 없습니다.');
  }
}

// mode 'measure' loops the measure being edited (following it when the user switches); 'song' plays all measures.
function play(mode) {
  let first = 0;
  let last = 0;
  state.playing = mode;
  audio.play({
    length() {
      first = mode === 'measure' ? state.measure : 0;
      last = mode === 'measure' ? state.measure : S.measureCount(state.song) - 1;
      return (last - first + 1) * S.STEPS;
    },
    at(i) {
      const m = first + Math.floor(i / S.STEPS);
      const s = i % S.STEPS;
      const events = S.attacksAt(state.song, m, s, first, last).map(a => soundOf(a.track, a.deg, a.steps));
      return { events, pos: { m, s } };
    },
    stepSec,
    loop: () => state.loop,
    onPos(pos) {
      state.pos = pos;
      if (pos) return ui.playhead(pos, state.measure);
      state.playing = null;
      ui.render(state);
    },
  });
}

function stop() {
  audio.stop();
  state.playing = null;
  state.pos = null;
}

const actions = {
  bpm({ v }) {
    if (Number.isFinite(v)) state.song.bpm = Math.min(S.BPM_MAX, Math.max(S.BPM_MIN, Math.round(v)));
  },
  scale({ v }) {
    state.song.scale = v;
  },
  loop({ v }) {
    state.loop = v;
  },
  play({ mode }) {
    play(mode);
  },
  stop,

  measure({ m }) {
    goMeasure(m);
  },
  addMeasure() {
    if (S.insertMeasure(state.song, state.measure + 1)) goMeasure(state.measure + 1);
  },
  copyMeasure() {
    if (S.insertMeasure(state.song, state.measure + 1, state.measure)) goMeasure(state.measure + 1);
  },
  delMeasure() {
    const m = state.measure;
    if (hasNotes(state.song.tracks.map(tr => tr.measures[m])) && !confirm(`마디 ${m + 1}을(를) 삭제할까요?`)) return;
    if (S.removeMeasure(state.song, m)) goMeasure(Math.min(m, S.measureCount(state.song) - 1));
  },

  track({ t }) {
    state.track = t;
    state.sel = null;
  },
  addTrack() {
    if (!S.addTrack(state.song)) return;
    state.track = state.song.tracks.length - 1;
    state.sel = null;
  },
  delTrack({ t }) {
    if (hasNotes(state.song.tracks[t].measures) && !confirm(`트랙 ${t + 1}을(를) 삭제할까요?`)) return;
    if (!S.removeTrack(state.song, t)) return;
    if (t < state.track || state.track === state.song.tracks.length) state.track--;
    state.sel = null;
  },
  type({ t, v }) {
    S.setTrackType(state.song, t, v);
    state.sel = null;
  },
  octave({ t, v }) {
    state.song.tracks[t].octave = v;
  },

  cell({ step, deg }) {
    place(snap(step), deg);
  },
  deg({ v }) {
    place(state.cursor, v);
  },
  // Tapping a note selects it (melodic) or removes the hit (drum).
  note({ start, deg }) {
    const note = S.findNote(state.song, state.track, state.measure, start, deg);
    if (!note) return;
    if (editedTrack().type === 'drum') {
      S.removeNote(state.song, state.track, state.measure, note);
      state.sel = null;
      return;
    }
    state.sel = { start, deg, picked: true };
    state.cursor = (start + note.len) % S.STEPS;
    if (LENGTH_INPUT[note.len]) [state.dur, state.dotted] = LENGTH_INPUT[note.len];
    preview(deg, note.len);
  },
  cursor({ step }) {
    state.cursor = snap(step);
    state.sel = null;
  },
  rest() {
    const len = inputLen();
    if (state.cursor + len > S.STEPS) return ui.toast(`이 위치에는 ${beats(S.STEPS - state.cursor)}박까지만 들어갑니다.`);
    S.clearRange(state.song, state.track, state.measure, state.cursor, len);
    state.cursor = (state.cursor + len) % S.STEPS;
    state.sel = null;
  },
  dur({ v }) {
    setLength(v, state.dotted);
  },
  dot() {
    setLength(state.dur, !state.dotted);
  },
  tie() {
    const note = selectedNote();
    if (note) note.tie = !note.tie;
  },
  del() {
    const note = selectedNote();
    if (!note) return;
    S.removeNote(state.song, state.track, state.measure, note);
    state.cursor = note.start;
    state.sel = null;
  },
  clear() {
    S.clearRange(state.song, state.track, state.measure, 0, S.STEPS);
    state.cursor = 0;
    state.sel = null;
  },

  save() {
    ui.download(`music-drafter-${stamp()}.json`, S.toJSON(state.song));
  },
  import({ text }) {
    let song;
    try {
      song = S.fromJSON(text);
    } catch (e) {
      return ui.toast(`불러오기 실패: ${e.message}`);
    }
    stop();
    state.song = song;
    state.track = 0;
    goMeasure(0);
    ui.toast('곡을 불러왔습니다.');
  },
};

ui.init({
  spec: {
    STEPS: S.STEPS,
    STEPS_PER_BEAT: S.STEPS_PER_BEAT,
    DEGREES: S.DEGREES,
    MAX_TRACKS: S.MAX_TRACKS,
    MAX_MEASURES: S.MAX_MEASURES,
    TRACK_TYPES: S.TRACK_TYPES,
    OCTAVES: S.OCTAVES,
    DOTTABLE,
  },
  label(t, deg) {
    const track = state.song.tracks[t];
    return track.type === 'drum' ? audio.DRUM_NAMES[deg - 1] : S.noteName(state.song, track, deg);
  },
  tieIn: (t, m, note) => S.isTiedIn(state.song, t, m, note),
  tieOut: (t, m, note) => S.isTiedOut(state.song, t, m, note),
  onAction(action) {
    actions[action.act]?.(action);
    ui.render(state);
  },
});
ui.render(state);
