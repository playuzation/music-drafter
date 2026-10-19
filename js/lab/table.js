// Wave table (tree: lab/main → table): one drawn cycle as SIZE samples in [-1, 1], presets, smoothing, and conversion
// to the harmonic coefficients Web Audio's PeriodicWave takes. Pure module.

export const SIZE = 64;

const SHAPES = {
  sine: p => Math.sin(2 * Math.PI * p),
  triangle: p => 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5),
  square: p => (p < 0.5 ? 1 : -1),
  sawtooth: p => 2 * ((p + 0.5) % 1) - 1,
  flat: () => 0,
};

const index = x => Math.min(SIZE - 1, Math.max(0, Math.floor(x * SIZE)));
const clamp = v => Math.max(-1, Math.min(1, v));

export const preset = name => Float32Array.from({ length: SIZE }, (_, i) => SHAPES[name](i / SIZE));

// Draws a straight stroke from (x0, v0) to (x1, v1) into the table; x is the position in the cycle (0-1).
export function paint(table, x0, v0, x1, v1) {
  const i0 = index(x0);
  const i1 = index(x1);
  for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) {
    table[i] = clamp(i0 === i1 ? v1 : v0 + ((v1 - v0) * (i - i0)) / (i1 - i0));
  }
}

// Default Gaussian widths (in samples of the cycle) for smoothing levels 0-4. Each level halves the range of
// harmonics that survive: level 1 only trims jagged edges, level 4 keeps little beyond the second harmonic.
export const SMOOTHING = [0, 0.75, 1.5, 3, 6];

// The cycle blurred with a Gaussian of width sigma (in samples; 0 leaves it as is), wrapping around because the
// wave repeats.
export function smooth(table, sigma) {
  if (!sigma) return Float32Array.from(table);
  const n = table.length;
  const radius = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, j) => Math.exp(-((j - radius) ** 2) / (2 * sigma * sigma)));
  const total = kernel.reduce((sum, k) => sum + k, 0);
  return Float32Array.from(table, (_, i) => kernel.reduce((sum, k, j) => sum + k * table[(i + j - radius + n) % n], 0) / total);
}

// Fourier coefficients (real = cosine, imag = sine terms) of the cycle without its DC offset, scaled so the
// drawn cycle peaks at ±1. A flat cycle gives all zeros, i.e. silence.
export function harmonics(table) {
  const n = table.length;
  const real = new Float32Array(n / 2);
  const imag = new Float32Array(n / 2);
  const mean = table.reduce((sum, v) => sum + v, 0) / n;
  const peak = Math.max(...table.map(v => Math.abs(v - mean)));
  if (peak < 1e-6) return { real, imag };
  for (let k = 1; k < n / 2; k++) {
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * k * i) / n;
      real[k] += table[i] * Math.cos(a);
      imag[k] += table[i] * Math.sin(a);
    }
    real[k] *= 2 / n / peak;
    imag[k] *= 2 / n / peak;
  }
  return { real, imag };
}
