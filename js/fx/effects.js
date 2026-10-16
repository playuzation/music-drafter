// Effect units (tree: fx/main → fx/effects). Each unit is input → dry and wet paths → output, so it can be
// switched on and off with short ramps (no clicks) and its parameters changed while the song plays.

// Effects in signal order. Params: [id, label, min, max, step, default, unit]
export const EFFECTS = [
  { id: 'distortion', name: '디스토션', params: [['drive', '드라이브', 1, 100, 1, 30, ''], ['mix', '믹스', 0, 100, 1, 100, '%']] },
  {
    id: 'compressor',
    name: '컴프레서',
    params: [['threshold', '임계값', -60, 0, 1, -24, 'dB'], ['ratio', '비율', 1, 20, 0.5, 4, ':1'], ['makeup', '메이크업 게인', 0, 24, 1, 0, 'dB']],
  },
  {
    id: 'echo',
    name: '에코',
    params: [['time', '시간', 50, 1000, 10, 300, 'ms'], ['feedback', '되먹임', 0, 90, 1, 40, '%'], ['mix', '믹스', 0, 100, 1, 50, '%']],
  },
  { id: 'reverb', name: '리버브', params: [['decay', '잔향 길이', 0.3, 6, 0.1, 2, 's'], ['mix', '믹스', 0, 100, 1, 35, '%']] },
  { id: 'limiter', name: '리미터', params: [['threshold', '임계값', -30, 0, 1, -12, 'dB'], ['makeup', '출력 게인', 0, 24, 1, 0, 'dB']] },
];

const db = v => 10 ** (v / 20);

// Soft clipping curve; `drive` sets how hard the signal is pushed into it. Scaled by ½ so drive 1 keeps quiet
// signals at unity gain and heavy drive tops out at -6 dB instead of jumping to full scale.
const softClip = drive =>
  Float32Array.from({ length: 1025 }, (_, i) => {
    const x = i / 512 - 1;
    return (0.5 * (1 + drive) * x) / (1 + drive * Math.abs(x));
  });

// Stereo noise decaying by 60 dB over `seconds`: the room the reverb simulates. Scaled to unit energy, so a
// steady tone comes out of the room about as loud as it went in, whatever the length.
function impulse(ac, seconds) {
  const length = Math.ceil(seconds * ac.sampleRate);
  const buffer = ac.createBuffer(2, length, ac.sampleRate);
  const scale = Math.sqrt(41.4 / length); // energy of uniform noise × exp(-6.9 i/length) is length / 41.4
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp((-6.9 * i) / length) * scale;
  }
  return buffer;
}

// Compressor and limiter: dynamics processing followed by make-up gain.
function dynamics(ac, input, wet, fixed) {
  const comp = ac.createDynamicsCompressor();
  const makeup = ac.createGain();
  for (const [name, value] of Object.entries(fixed)) comp[name].value = value;
  input.connect(comp).connect(makeup).connect(wet);
  return {
    set(param, v) {
      if (param === 'makeup') makeup.gain.value = db(v);
      else comp[param].value = v;
    },
    levels: () => [0, 1],
  };
}

// Each builder wires input → … → wet and returns set(param, value) and levels() → [dry, wet] while on.
const BUILDERS = {
  distortion(ac, input, wet) {
    const shaper = ac.createWaveShaper();
    shaper.oversample = '4x';
    input.connect(shaper).connect(wet);
    let mix = 1;
    return {
      set(param, v) {
        if (param === 'drive') shaper.curve = softClip(v);
        if (param === 'mix') mix = v / 100;
      },
      levels: () => [1 - mix, mix],
    };
  },
  compressor: (ac, input, wet) => dynamics(ac, input, wet, { knee: 6, attack: 0.003, release: 0.25 }),
  echo(ac, input, wet) {
    const delay = ac.createDelay(1);
    const feedback = ac.createGain();
    input.connect(delay).connect(wet);
    delay.connect(feedback).connect(delay);
    let mix = 0.5;
    return {
      set(param, v) {
        if (param === 'time') delay.delayTime.setTargetAtTime(v / 1000, ac.currentTime, 0.05);
        if (param === 'feedback') feedback.gain.value = v / 100;
        if (param === 'mix') mix = v / 100;
      },
      levels: () => [1, mix],
    };
  },
  reverb(ac, input, wet) {
    const convolver = ac.createConvolver();
    convolver.normalize = false; // impulse() is already scaled
    input.connect(convolver).connect(wet);
    let mix = 0.35;
    let timer = 0;
    return {
      set(param, v) {
        // Rebuilding the room is costly: wait until the slider rests.
        if (param === 'decay') {
          clearTimeout(timer);
          timer = setTimeout(() => (convolver.buffer = impulse(ac, v)), convolver.buffer ? 150 : 0);
        }
        if (param === 'mix') mix = v / 100;
      },
      levels: () => [1, mix],
    };
  },
  limiter: (ac, input, wet) => dynamics(ac, input, wet, { knee: 0, ratio: 20, attack: 0.001, release: 0.1 }),
};

export function createUnit(ac, id) {
  const input = ac.createGain();
  const output = ac.createGain();
  const dry = ac.createGain();
  const wet = ac.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  wet.gain.value = 0;
  const effect = BUILDERS[id](ac, input, wet);
  let on = false;
  const apply = () => {
    const [d, w] = on ? effect.levels() : [1, 0];
    dry.gain.setTargetAtTime(d, ac.currentTime, 0.02);
    wet.gain.setTargetAtTime(w, ac.currentTime, 0.02);
  };
  return {
    input,
    output,
    setOn(value) {
      on = value;
      apply();
    },
    set(param, value) {
      effect.set(param, value);
      apply();
    },
  };
}
