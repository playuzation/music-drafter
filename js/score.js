// Staff notation (tree: main → ui → score): SVG markup for one track's measure. Time is laid out proportionally,
// like the grid, so a playhead moving at constant speed passes each note while it sounds.

export const SCORE_W = 400; // viewBox width
export const STAFF_H = 84; // viewBox height of one track's staff
const TOP = 28; // y of the top staff line
const X0 = 72; // x where the measure's first step starts (after clef, key and time signature)
const X1 = SCORE_W - 6; // closing barline
const y = pos => TOP + (8 - pos) * 4; // pos: staff position in half spaces above the bottom line

// Drum kit slots in synth.js DRUM_NAMES order → [staff position, head]: kick, snare, clap, low tom, high tom,
// closed hat, open hat, crash. 'x' is a cymbal-style head, 'o' an open hi-hat.
const DRUMS = [[1], [5], [4, 'x'], [3], [7], [9, 'x'], [9, 'o'], [10, 'x']];
// Written value for a length in steps (the largest that fits): [steps, filled head, stem, flags, dot]
const VALUES = [
  [16, 0, 0, 0, 0],
  [12, 0, 1, 0, 1],
  [8, 0, 1, 0, 0],
  [6, 1, 1, 0, 1],
  [4, 1, 1, 0, 0],
  [3, 1, 1, 1, 1],
  [2, 1, 1, 1, 0],
  [1, 1, 1, 2, 0],
];
const FLATS = { treble: [4, 7, 3], bass: [2, 5, 1] }; // C minor key signature: B♭ E♭ A♭
const REST = {
  16: x => `<rect x="${x - 6}" y="${y(6)}" width="12" height="4"/>`,
  8: x => `<rect x="${x - 6}" y="${y(4) - 4}" width="12" height="4"/>`,
  4: x => `<path class="line" d="M${x - 2} ${y(7)}l5 6-4 4 5 6c-5-2-7 1-3 5"/>`,
  2: x => `<circle cx="${x - 2}" cy="${y(5)}" r="2"/><path class="line" d="M${x - 2} ${y(5) + 1.5}q4 1 6-2L${x} ${y(1)}"/>`,
  1: x =>
    `<circle cx="${x - 1}" cy="${y(5)}" r="2"/><circle cx="${x - 3}" cy="${y(3)}" r="2"/>` +
    `<path class="line" d="M${x - 1} ${y(5) + 1.5}q4 1 6-2L${x - 1} ${y(0)}M${x - 3} ${y(3) + 1.5}q4 1 5.5-1.5"/>`,
};

const line = (x1, x2, y1, y2, cls) => `<line class="${cls}" x1="${x1}" x2="${x2}" y1="${y1}" y2="${y2}"/>`;
// Tie between two x positions, bowing away from the stem (below a stem-up note).
const arc = (x1, x2, ty, up, cls) => `<path class="${cls}" d="M${x1} ${ty}Q${(x1 + x2) / 2} ${ty + (up ? 7 : -7)} ${x2} ${ty}"/>`;

export const headX = (step, steps) => X0 + (step * (X1 - X0)) / steps;

// Steps without a note as [start, length] rests, using the largest beat-aligned values (as in sheet music).
export function restSlots(notes, steps) {
  const busy = Array(steps).fill(false);
  for (const n of notes) busy.fill(true, n.start, n.start + n.len);
  const slots = [];
  for (let p = 0; p < steps; ) {
    if (busy[p]) {
      p++;
      continue;
    }
    let d = steps;
    while (p % d || p + d > steps || busy.slice(p, p + d).includes(true)) d /= 2;
    slots.push([p, d]);
    p += d;
  }
  return slots;
}

// One track's staff for one measure. Clef follows the octave so notes stay within two ledger lines;
// octave 6 is written an octave lower with the ottava treble clef.
export function staffSVG({ track, notes, minor, steps, tieIn, tieOut }) {
  const at = step => headX(step, steps) + 6; // notehead x for a note starting at `step`
  const drum = track.type === 'drum';
  const clef = drum ? 'perc' : track.octave <= 3 ? 'bass' : 'treble';
  const degree1 = clef === 'bass' ? track.octave * 7 - 18 : Math.min(track.octave, 5) * 7 - 30;
  let svg = '';
  for (let p = 0; p <= 8; p += 2) svg += line(8, X1, y(p), y(p), 'staff');
  svg += line(X1, X1, y(8), y(0), 'staff');
  if (drum) {
    svg += `<rect class="sign" x="16" y="${y(6)}" width="3" height="16"/><rect class="sign" x="22" y="${y(6)}" width="3" height="16"/>`;
  } else {
    // Noto Music draws the G clef's curl at its baseline and the F clef's dots 2.75 spaces above it.
    const glyph = clef === 'bass' ? '𝄢' : track.octave === 6 ? '𝄟' : '𝄞';
    svg += `<text class="clef" x="10" y="${clef === 'bass' ? y(0.5) : y(2)}">${glyph}</text>`;
    if (minor) FLATS[clef].forEach((p, i) => (svg += `<text class="flat" x="${36 + i * 7}" y="${y(p) + 3}">♭</text>`));
  }
  svg += `<text class="meter" x="64" y="${y(4)}">4</text><text class="meter" x="64" y="${y(0)}">4</text>`;
  for (const [p, d] of restSlots(notes, steps)) svg += `<g class="rest">${REST[d](d === steps ? (X0 + X1) / 2 : at(p))}</g>`;

  for (const n of notes) {
    const [pos, head] = drum ? DRUMS[n.deg - 1] : [degree1 + n.deg - 1];
    const up = drum || pos < 4;
    const [, filled, stem, flags, dot] = VALUES.find(v => v[0] <= n.len);
    const x = at(n.start);
    const cy = y(pos);
    let g = `<rect class="dur" x="${x - 6}" y="${cy - 3}" width="${n.len * ((X1 - X0) / steps)}" height="6" rx="3"/>`;
    for (let p = -2; p >= pos; p -= 2) g += line(x - 8, x + 8, y(p), y(p), 'ledger');
    for (let p = 10; p <= pos; p += 2) g += line(x - 8, x + 8, y(p), y(p), 'ledger');
    if (head) {
      g += `<path class="line" d="M${x - 3.5} ${cy - 3.5}l7 7m0-7l-7 7"/>`;
      if (head === 'o') g += `<circle class="hollow" cx="${x}" cy="${cy - 10}" r="2.5"/>`;
    } else {
      g += `<ellipse${filled ? '' : ' class="hollow"'} cx="${x}" cy="${cy}" rx="5" ry="3.6" transform="rotate(-20 ${x} ${cy})"/>`;
    }
    if (stem) {
      const sx = up ? x + 4.4 : x - 4.4;
      const end = up ? cy - 28 : cy + 28;
      g += line(sx, sx, cy, end, 'line');
      for (let f = 0; f < flags; f++) {
        g += `<path class="line" d="M${sx} ${up ? end + f * 6 : end - f * 6}q2 ${up ? 7 : -7} 7 ${up ? 11 : -11}"/>`;
      }
    }
    if (dot) g += `<circle cx="${x + 9}" cy="${pos % 2 ? cy : cy - 4}" r="1.6"/>`;
    const ty = cy + (up ? 6 : -6);
    if (n.tie) {
      const end = n.start + n.len;
      g += arc(x + 3, end >= steps ? X1 + 6 : at(end) - 3, ty, up, tieOut(n) ? 'tie' : 'tie open');
    }
    if (n.start === 0 && tieIn(n)) g += arc(X0 - 6, x - 3, ty, up, 'tie');
    svg += `<g class="nt" data-s="${n.start}" data-l="${n.len}">${g}</g>`;
  }
  return svg;
}
