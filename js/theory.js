// Music theory (tree leaf): scale degree → MIDI note → frequency / name. The key is fixed to C.

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11, 12], // 장음계: C D E F G A B C
  minor: [0, 2, 3, 5, 7, 8, 10, 12], // 자연단음계: C D E♭ F G A♭ B♭ C
};

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export const degreeMidi = (scale, octave, deg) => 12 * (octave + 1) + SCALES[scale][deg - 1]; // C4 = 60
export const midiFreq = midi => 440 * 2 ** ((midi - 69) / 12);
export const midiName = midi => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
