// WAV encoder (tree leaf): AudioBuffer → 16-bit PCM WAV file bytes.

export function encodeWav(buffer) {
  const { numberOfChannels: channels, sampleRate, length } = buffer;
  const dataSize = length * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + dataSize));
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));

  text(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, dataSize, true);

  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (const samples of data) {
      view.setInt16(offset, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
      offset += 2;
    }
  }
  return view.buffer;
}
