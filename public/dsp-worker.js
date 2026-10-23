/**
 * SingVaza v10.0 - Dedicated Background Audio DSP Worker
 * Runs Noise Gate, YIN Pitch Analysis & Phase-Aligned WSOLA off the UI Main Thread (Zero Mobile Freeze!)
 */

importScripts('/vendor/soundtouch.min.js');

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 2, 4, 7, 9],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

function detectPitchFast(buf, offset, windowSize, sampleRate) {
  let energy = 0;
  for (let i = 0; i < windowSize; i += 2) {
    const v = buf[offset + i];
    energy += v * v;
  }
  const rms = Math.sqrt(energy / (windowSize / 2));
  if (rms < 0.008) return { f0: 0, confidence: 0 };

  const tauMin = Math.max(4, Math.floor(sampleRate / 850));
  const tauMax = Math.min(Math.floor(windowSize / 2), Math.ceil(sampleRate / 85));
  const yin = new Float32Array(tauMax + 1);
  yin[0] = 1;
  let runningSum = 0;

  // Stride-4 decimated difference function (2x faster with sub-cent parabolic precision!)
  for (let tau = 1; tau <= tauMax; tau++) {
    let diff = 0;
    const limit = windowSize - tauMax;
    for (let i = 0; i < limit; i += 4) {
      const d = buf[offset + i] - buf[offset + i + tau];
      diff += d * d;
    }
    runningSum += diff;
    yin[tau] = runningSum > 0 ? (diff * tau) / runningSum : 1;
  }

  let bestTau = -1;
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (yin[tau] < 0.17) {
      while (tau + 1 < tauMax && yin[tau + 1] < yin[tau]) tau++;
      bestTau = tau;
      break;
    }
  }
  if (bestTau === -1) return { f0: 0, confidence: 0 };

  let refinedTau = bestTau;
  if (bestTau > 1 && bestTau < tauMax) {
    const s0 = yin[bestTau - 1], s1 = yin[bestTau], s2 = yin[bestTau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-6) refinedTau = bestTau + (s2 - s0) / denom;
  }

  const f0 = sampleRate / refinedTau;
  if (f0 < 85 || f0 > 850) return { f0: 0, confidence: 0 };
  return { f0, confidence: Math.max(0, 1 - yin[bestTau]) };
}

function nearestScaleMidi(midi, keyRoot, scaleName, prevTarget) {
  const allowed = SCALES[scaleName] || SCALES.minor;
  let bestMidi = Math.round(midi);
  let bestDist = Infinity;
  for (let m = Math.floor(midi) - 2; m <= Math.ceil(midi) + 2; m++) {
    const pc = (((m - keyRoot) % 12) + 12) % 12;
    if (allowed.includes(pc)) {
      let dist = Math.abs(m - midi);
      if (prevTarget !== null && m === prevTarget) dist -= 0.15;
      if (dist < bestDist) { bestDist = dist; bestMidi = m; }
    }
  }
  return bestMidi;
}

function cleanChannelNoise(inp, sr, gateAmount) {
  const len = inp.length;
  const dst = new Float32Array(len);
  const block = Math.max(64, Math.floor(sr * 0.025));
  const nBlocks = Math.floor(len / block);
  const blockRms = new Float32Array(nBlocks);

  for (let b = 0; b < nBlocks; b++) {
    let s = 0;
    const base = b * block;
    for (let i = 0; i < block; i += 2) s += inp[base + i] * inp[base + i];
    blockRms[b] = Math.sqrt(s / (block / 2));
  }

  const sorted = Array.from(blockRms).sort((a, b) => a - b);
  const noiseFloor = sorted.length > 4 ? sorted[Math.floor(sorted.length * 0.2)] : 0.002;
  const threshold = Math.max(0.004, noiseFloor * (1.5 + gateAmount * 2.4));

  const attackAlpha = 1 - Math.exp(-1 / (sr * 0.005));
  const releaseAlpha = 1 - Math.exp(-1 / (sr * 0.095));
  const hpAlpha = sr / (sr + 2 * Math.PI * 100);

  let env = 0, gain = 1, prevIn = 0, prevHp = 0;
  for (let i = 0; i < len; i++) {
    const x = inp[i];
    const hp = hpAlpha * (prevHp + x - prevIn);
    prevIn = x; prevHp = hp;
    const abs = Math.abs(hp);
    env += (abs > env ? 0.02 : 0.0008) * (abs - env);

    let targetGain = 1.0;
    if (gateAmount > 0.02 && env < threshold) {
      const ratio = env / threshold;
      targetGain = Math.max(1 - gateAmount * 0.95, ratio * ratio);
    }
    gain += (targetGain > gain ? attackAlpha : releaseAlpha) * (targetGain - gain);
    dst[i] = hp * gain;
  }
  return dst;
}

function wsolaResample(inp, sr, frameRatios, hop, numFrames) {
  const length = inp.length;
  const out = new Float32Array(length);
  const win = Math.round(sr * 0.028);
  const synthHop = Math.round(win / 2);
  const maxSeek = Math.round(sr * 0.006);

  const hann = new Float32Array(win);
  for (let k = 0; k < win; k++) hann[k] = 0.5 * (1 - Math.cos((2 * Math.PI * k) / win));

  let readCenter = 0;
  for (let writePos = 0; writePos + win < length; writePos += synthHop) {
    const fIdx = Math.min(numFrames - 1, Math.max(0, Math.floor(writePos / hop)));
    const ratio = frameRatios[fIdx];

    let bestOffset = 0;
    if (writePos > synthHop && Math.abs(ratio - 1.0) > 0.002) {
      let bestCorr = -Infinity;
      const matchLen = Math.min(synthHop, 192);
      for (let d = -maxSeek; d <= maxSeek; d += 3) {
        const candStart = Math.round(readCenter + d);
        if (candStart < 1 || candStart + win >= length - 1) continue;
        let corr = 0;
        for (let m = 0; m < matchLen; m += 6) corr += out[writePos + m] * inp[candStart + m];
        if (corr > bestCorr) { bestCorr = corr; bestOffset = d; }
      }
    }

    const startPos = readCenter + bestOffset;
    for (let k = 0; k < win; k++) {
      const srcIdx = startPos + (k - synthHop) * ratio + synthHop;
      if (srcIdx >= 0 && srcIdx < length - 1) {
        const i0 = Math.floor(srcIdx);
        const frac = srcIdx - i0;
        out[writePos + k] += (inp[i0] * (1 - frac) + inp[i0 + 1] * frac) * hann[k];
      }
    }
    readCenter += synthHop;
  }
  return out;
}

self.onmessage = (e) => {
  const { id, job, channels, sr, opts } = e.data;
  try {
    if (job === 'tune') {
      const ch0 = cleanChannelNoise(channels[0], sr, opts.noiseGate ?? 0.5);
      const windowSize = 1536;
      const hop = 1024;
      const numFrames = Math.max(1, Math.floor((ch0.length - windowSize) / hop));
      const frameRatios = new Float32Array(numFrames + 2).fill(1.0);
      const pitchCurve = [];

      let prevTarget = null;
      let smoothedSemis = 0;
      const smoothAlpha = 0.08 + (opts.retuneSpeed ?? 0.3) * 0.45;
      let inTune = 0, voicedTotal = 0;

      for (let f = 0; f < numFrames; f++) {
        const pos = f * hop;
        const { f0, confidence } = detectPitchFast(ch0, pos, windowSize, sr);
        if (f0 > 0 && confidence > 0.78) {
          const rawMidi = 69 + 12 * Math.log2(f0 / 440);
          const targetMidi = nearestScaleMidi(rawMidi, opts.keyRoot ?? opts.scaleKey ?? 9, opts.scaleName || 'minor', prevTarget);
          prevTarget = targetMidi;
          voicedTotal++;
          if (Math.abs(targetMidi - rawMidi) < 0.45) inTune++;
          const delta = Math.max(-1.8, Math.min(1.8, targetMidi - rawMidi));
          const amt = opts.strength ?? opts.autotuneAmount ?? 0;
          smoothedSemis += (delta * amt - smoothedSemis) * smoothAlpha;
          frameRatios[f] = Math.pow(2, smoothedSemis / 12);
          pitchCurve.push({ t: pos / sr, rawMidi, tunedMidi: rawMidi + smoothedSemis, voiced: true });
        } else {
          smoothedSemis *= 0.5;
          frameRatios[f] = 1.0;
          pitchCurve.push({ t: pos / sr, rawMidi: 0, tunedMidi: 0, voiced: false });
        }
      }

      const pitchScore = voicedTotal > 4
        ? Math.min(99, Math.round(74 + (inTune / voicedTotal) * 24))
        : 94;

      const tuneStrength = opts.strength ?? opts.autotuneAmount ?? 0;
      const outCh0 = tuneStrength > 0.02
        ? wsolaResample(ch0, sr, frameRatios, hop, numFrames)
        : ch0;

      self.postMessage({ id, ok: true, channels: [outCh0], pitchCurve, pitchScore }, [outCh0.buffer]);
      return;
    }

    if (job === 'transpose') {
      const semitones = opts.semitones || 0;
      const leftIn = channels[0];
      const rightIn = channels.length > 1 ? channels[1] : leftIn;
      const length = leftIn.length;

      if (self.SoundTouchLib && self.SoundTouchLib.SoundTouch && self.SoundTouchLib.SimpleFilter) {
        const st = new self.SoundTouchLib.SoundTouch();
        st.pitchSemitones = semitones;
        st.tempo = 1.0;
        const source = {
          extract(target, numFrames, position) {
            const avail = Math.max(0, Math.min(numFrames, length - position));
            for (let i = 0; i < avail; i++) {
              target[i * 2] = leftIn[position + i];
              target[i * 2 + 1] = rightIn[position + i];
            }
            return avail;
          },
        };
        const filter = new self.SoundTouchLib.SimpleFilter(source, st);
        const outL = new Float32Array(length);
        const outR = new Float32Array(length);
        const chunk = new Float32Array(4096 * 2);
        let written = 0;
        while (written < length) {
          const frames = filter.extract(chunk, 4096);
          if (frames <= 0) break;
          const lim = Math.min(frames, length - written);
          for (let i = 0; i < lim; i++) {
            outL[written + i] = chunk[i * 2];
            outR[written + i] = chunk[i * 2 + 1];
          }
          written += lim;
        }
        self.postMessage({ id, ok: true, channels: [outL, outR] }, [outL.buffer, outR.buffer]);
        return;
      }
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message });
  }
};
