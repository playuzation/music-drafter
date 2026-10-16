// Song model (tree: main → song → theory): plain data, editing operations, tie resolution and JSON I/O.
// No DOM or audio here. Time unit is the "step" = a 16th note (¼ beat); a 4/4 measure has 16 steps.
import { SCALES, degreeMidi, midiFreq, midiName } from './theory.js';

const FORMAT = 'music-drafter';
const VERSION = 1;
export const STEPS = 16;
export const STEPS_PER_BEAT = 4;
export const DEGREES = 8;
export const MAX_TRACKS = 8;
export const MAX_MEASURES = 256;
export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const TRACK_TYPES = ['sine', 'triangle', 'square', 'sawtooth', 'drum'];
export const OCTAVES = [2, 3, 4, 5, 6];
export const SESSION_KEY = 'music-drafter:song'; // sessionStorage key: the current song, shared by the pages

// song  = { format, version, bpm, scale, tracks: [{ type, octave, measures: [[note, ...], ...] }] }
// note  = { start: 0-15, len: steps, deg: 1-8 (drum: kit slot), tie: joined to the next note of the same pitch }
// Steps without a note are rests. Melodic tracks are monophonic; drum tracks are monophonic per lane (deg).

const newTrack = (type, count) => ({ type, octave: 4, measures: Array.from({ length: count }, () => []) });
const byTime = (a, b) => a.start - b.start || a.deg - b.deg;
const laneOf = (track, deg) => (track.type === 'drum' ? deg : 0);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export const createSong = () => ({ format: FORMAT, version: VERSION, bpm: 120, scale: 'major', tracks: [newTrack('sine', 1)] });
export const measureCount = song => song.tracks[0].measures.length;

// ---- tracks ----

export function addTrack(song) {
  if (song.tracks.length >= MAX_TRACKS) return false;
  song.tracks.push(newTrack('sine', measureCount(song)));
  return true;
}

export function removeTrack(song, t) {
  if (song.tracks.length <= 1) return false;
  song.tracks.splice(t, 1);
  return true;
}

export function setTrackType(song, t, type) {
  const track = song.tracks[t];
  track.type = type;
  // Turning a drum track melodic: keep it monophonic by dropping notes that overlap an earlier one.
  if (type !== 'drum') {
    track.measures = track.measures.map(notes => {
      let end = 0;
      return notes.filter(n => {
        if (n.start < end) return false;
        end = n.start + n.len;
        return true;
      });
    });
  }
}

// ---- measures ----

// Inserts an empty measure at `at`, or a copy of measure `copyOf`.
export function insertMeasure(song, at, copyOf = -1) {
  if (measureCount(song) >= MAX_MEASURES) return false;
  for (const track of song.tracks) {
    track.measures.splice(at, 0, copyOf < 0 ? [] : track.measures[copyOf].map(n => ({ ...n })));
  }
  return true;
}

export function removeMeasure(song, m) {
  if (measureCount(song) <= 1) return false;
  for (const track of song.tracks) track.measures.splice(m, 1);
  return true;
}

// ---- notes ----

export const findNote = (song, t, m, start, deg) => song.tracks[t].measures[m].find(n => n.start === start && n.deg === deg);

// Silences steps [start, start + len): notes starting inside are removed, notes running into it are cut short.
// `deg` limits this to one drum lane; 0 clears every lane.
export function clearRange(song, t, m, start, len, deg = 0) {
  const track = song.tracks[t];
  const end = start + len;
  track.measures[m] = track.measures[m].filter(n => {
    if ((deg && n.deg !== deg) || n.start + n.len <= start || n.start >= end) return true;
    if (n.start >= start) return false;
    n.len = start - n.start;
    return true;
  });
}

// Writes a note over whatever sounded there (in its lane). Returns the note, or null if it does not fit the measure.
export function placeNote(song, t, m, start, len, deg) {
  if (start < 0 || len < 1 || start + len > STEPS) return null;
  const track = song.tracks[t];
  clearRange(song, t, m, start, len, laneOf(track, deg));
  const note = { start, len, deg, tie: false };
  track.measures[m].push(note);
  track.measures[m].sort(byTime);
  return note;
}

export function removeNote(song, t, m, note) {
  const notes = song.tracks[t].measures[m];
  const i = notes.indexOf(note);
  if (i >= 0) notes.splice(i, 1);
}

export function resizeNote(song, t, m, note, len) {
  if (note.start + len > STEPS) return false;
  removeNote(song, t, m, note);
  placeNote(song, t, m, note.start, len, note.deg).tie = note.tie;
  return true;
}

// ---- ties ----

// Whether `note` (in measure m) continues a tied note of the same pitch, looking back no further than measure `first`.
export function isTiedIn(song, t, m, note, first = 0) {
  const prevM = note.start ? m : m - 1;
  const end = note.start || STEPS;
  return prevM >= first && song.tracks[t].measures[prevM].some(p => p.tie && p.deg === note.deg && p.start + p.len === end);
}

// [measure, note] that `note` is tied into, if any, without going past measure `last`.
function tieTarget(track, m, note, last) {
  if (!note.tie) return null;
  const end = note.start + note.len;
  const nextM = end === STEPS ? m + 1 : m;
  const next = nextM <= last && track.measures[nextM]?.find(q => q.start === end % STEPS && q.deg === note.deg);
  return next ? [nextM, next] : null;
}

export const isTiedOut = (song, t, m, note) => !!tieTarget(song.tracks[t], m, note, Infinity);

// Notes that start sounding at (measure m, step s) while measures first..last are played: [{ track, deg, steps }].
// Tied continuations are skipped; their length is added to the note that starts the tie chain.
export function attacksAt(song, m, s, first, last) {
  const out = [];
  song.tracks.forEach((track, t) => {
    for (const note of track.measures[m] || []) {
      if (note.start !== s || isTiedIn(song, t, m, note, first)) continue;
      let steps = note.len;
      for (let hop = tieTarget(track, m, note, last); hop; hop = tieTarget(track, ...hop, last)) steps += hop[1].len;
      out.push({ track, deg: note.deg, steps });
    }
  });
  return out;
}

// ---- pitch ----

export const noteFreq = (song, track, deg) => midiFreq(degreeMidi(song.scale, track.octave, deg));
export const noteName = (song, track, deg) => midiName(degreeMidi(song.scale, track.octave, deg));

// ---- sounds (what the audio engine plays: { drum: 1-8 } | { wave, freq, dur (seconds) }) ----

export const stepSeconds = song => 60 / song.bpm / STEPS_PER_BEAT;

export function soundOf(song, track, deg, steps) {
  if (track.type === 'drum') return { drum: deg };
  return { wave: track.type, freq: noteFreq(song, track, deg), dur: steps * stepSeconds(song) };
}

// Sounds starting at (measure m, step s) while measures first..last are played.
export const soundsAt = (song, m, s, first, last) => attacksAt(song, m, s, first, last).map(a => soundOf(song, a.track, a.deg, a.steps));

// One pass through the whole song: time-ordered [{ time, ...sound }] and its length in seconds.
export function songSounds(song) {
  const last = measureCount(song) - 1;
  const step = stepSeconds(song);
  const sounds = [];
  for (let m = 0; m <= last; m++) {
    for (let s = 0; s < STEPS; s++) {
      for (const sound of soundsAt(song, m, s, 0, last)) sounds.push({ time: (m * STEPS + s) * step, ...sound });
    }
  }
  return { sounds, seconds: (last + 1) * STEPS * step };
}

// ---- JSON ----

export const toJSON = song => JSON.stringify(song, null, 2);

// Parses and validates a song file. Throws an Error with a user-facing (Korean) message when invalid.
export function fromJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 형식이 아닙니다.');
  }
  const check = (ok, msg) => {
    if (!ok) throw new Error(msg);
  };
  check(data?.format === FORMAT, 'Music Drafter 곡 파일이 아닙니다.');
  check(data.version === VERSION, `지원하지 않는 파일 버전입니다: ${data.version}`);
  check(isInt(data.bpm, BPM_MIN, BPM_MAX), `bpm은 ${BPM_MIN}~${BPM_MAX} 사이의 정수여야 합니다.`);
  check(Object.keys(SCALES).includes(data.scale), `scale은 ${Object.keys(SCALES).join(', ')} 중 하나여야 합니다.`);
  check(Array.isArray(data.tracks) && isInt(data.tracks.length, 1, MAX_TRACKS), `트랙은 1~${MAX_TRACKS}개여야 합니다.`);
  const count = data.tracks[0]?.measures?.length;
  check(isInt(count, 1, MAX_MEASURES), `마디는 1~${MAX_MEASURES}개여야 합니다.`);

  const tracks = data.tracks.map((track, ti) => {
    check(TRACK_TYPES.includes(track?.type), `트랙 ${ti + 1}: type이 올바르지 않습니다.`);
    check(OCTAVES.includes(track.octave), `트랙 ${ti + 1}: octave는 ${OCTAVES.join(', ')} 중 하나여야 합니다.`);
    check(Array.isArray(track.measures) && track.measures.length === count, `트랙 ${ti + 1}: 마디 수가 첫 트랙과 다릅니다.`);
    const measures = track.measures.map((notes, mi) => {
      const where = `트랙 ${ti + 1}, 마디 ${mi + 1}`;
      check(Array.isArray(notes), `${where}: 음표 목록이 배열이 아닙니다.`);
      const clean = notes.map(n => {
        const ok = isInt(n?.start, 0, STEPS - 1) && isInt(n.len, 1, STEPS - n.start) && isInt(n.deg, 1, DEGREES);
        check(ok, `${where}: 음표 값(start/len/deg)이 올바르지 않습니다.`);
        return { start: n.start, len: n.len, deg: n.deg, tie: n.tie === true };
      });
      clean.sort(byTime);
      const laneEnd = {};
      for (const n of clean) {
        const lane = laneOf(track, n.deg);
        check(n.start >= (laneEnd[lane] || 0), `${where}: 겹치는 음표가 있습니다.`);
        laneEnd[lane] = n.start + n.len;
      }
      return clean;
    });
    return { type: track.type, octave: track.octave, measures };
  });
  return { format: FORMAT, version: VERSION, bpm: data.bpm, scale: data.scale, tracks };
}
