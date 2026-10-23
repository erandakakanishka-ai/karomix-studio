/* SingVaza v19.0 — Featherweight Pure Vocal Pitch & Key Worker (Zero Bass Cut, Zero Long-Song OOM) */
try {
  importScripts('/vendor/soundtouch.min.js');
} catch (_) {}

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

function nearestScaleMidi(midiFloat, keyRoot = 0, scaleName = 'minor', prevMidi = null) {
  const allowed = SCALES[scaleName] || SCALES.minor;
  let best = Math.round(midiFloat);
  let bestCost = Infinity;
  const center = Math.round(midiFloat);
  for (let cand = center - 2; cand <= center + 2; cand++) {
    const deg = (((cand - keyRoot) % 12) + 12) % 12;
    if (allowed.includes(deg)) {
      let cost = Math.abs(cand - midiFloat);
      if (prevMidi !== null && cand !== prevMidi) cost += 0.16;
      if (cost < bestCost) {
        bestCost = cost;
        best = cand;
      }
    }
  }
  return best;
}

function detectPitchFast(buf, offset, windowSize, sr) {
  let energy = 0;
  for (let i = 0; i < windowSize; i += 8) {
    const v = buf[offset + i];
    energy += v * v;
  }
  const rms = Math.sqrt(energy / (windowSize / 8));
  if (rms < 0.008) return { f0: 0, confidence: 0 };

  const minTau = Math.max(2, Math.floor(sr / 950));
  const maxTau = Math.min(Math.floor(windowSize / 2), Math.ceil(sr / 75));
  const half = Math.floor(windowSize / 2);

  const yin = new Float32Array(maxTau + 1);
  yin[0] = 1;
  let runningSum = 0;

  for (let tau = 1; tau <= maxTau; tau++) {
    let diff = 0;
    for (let i = 0; i < half; i += 4) {
      const d = buf[offset + i] - buf[offset + i + tau];
      diff += d * d;
    }
    yin[tau] = diff;
    runningSum += diff;
    yin[tau] = runningSum > 0 ? (yin[tau] * tau) / runningSum : 1;
  }

  let tauEst = -1;
  const threshold = 0.18;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (yin[tau] < threshold) {
      while (tau + 1 <= maxTau && yin[tau + 1] < yin[tau]) tau++;
      tauEst = tau;
      break;
    }
  }

  if (tauEst === -1) {
    let minVal = 1;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (yin[tau] < minVal) { minVal = yin[tau]; tauEst = tau; }
    }
    if (minVal > 0.35) return { f0: 0, confidence: 0 };
  }

  let betterTau = tauEst;
  if (tauEst > 1 && tauEst < maxTau) {
    const s0 = yin[tauEst - 1], s1 = yin[tauEst], s2 = yin[tauEst + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-6) betterTau = tauEst + (s2 - s0) / denom;
  }

  const confidence = Math.max(0, 1 - yin[tauEst]);
  return { f0: sr / betterTau, confidence };
}

// Pure envelope noise gate ONLY when requested — NEVER alters bass/EQ or creates extra copy when gate is off!
function cleanChannelNoise(inp, sr, gateAmount) {
  if (!gateAmount || gateAmount <= 0.02) return inp;

  const len = inp.length;
  const dst = new Float32Array(len);

  let sumSq = 0, cnt = 0;
  const step = Math.max(1, Math.floor(len / 4000));
  const samples = [];
  for (let i = 0; i < len; i += step) {
    const a = Math.abs(inp[i]);
    samples.push(a);
    sumSq += a * a;
    cnt++;
  }
  samples.sort((a, b) => a - b);
  const noiseFloor = samples[Math.floor(samples.length * 0.18)] || 0.002;
  const avgRms = Math.sqrt(sumSq / Math.max(1, cnt));
  const threshold = Math.min(avgRms * 0.45, noiseFloor * (1.5 + gateAmount * 4.2));

  let env = 0;
  let gain = 1;
  const attack = 1 - Math.exp(-1 / (sr * 0.004));
  const release = 1 - Math.exp(-1 / (sr * 0.085));
  const gateAttack = 1 - Math.exp(-1 / (sr * 0.008));
  const gateRelease = 1 - Math.exp(-1 / (sr * 0.14));

  for (let i = 0; i < len; i++) {
    const x = inp[i];
    const abs = Math.abs(x);
    env += (abs - env) * (abs > env ? attack : release);
    let targetGain = 1.0;
    if (env < threshold && threshold > 1e-5) {
      const ratio = env / threshold;
      targetGain = Math.max(1 - gateAmount * 0.92, ratio * ratio);
    }
    gain += (targetGain - gain) * (targetGain > gain ? gateAttack : gateRelease);
    dst[i] = x * gain;
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
      for (let d = -maxSeek; d <= maxSeek; d += 4) {
        const candStart = Math.round(readCenter + d);
        if (candStart < 1 || candStart + win >= length - 1) continue;
        let corr = 0;
        for (let m = 0; m < matchLen; m += 8) corr += out[writePos + m] * inp[candStart + m];
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
      const gateAmt = opts.noiseGate ?? 0;
      const tuneStrength = opts.strength ?? opts.autotuneAmount ?? 0;
      const ch0 = cleanChannelNoise(channels[0], sr, gateAmt);

      const durationSec = ch0.length / Math.max(8000, sr);
      const windowSize = sr >= 40000 ? 1536 : 1024;
      const hop = durationSec > 60 ? 2048 : 1024;
      const numFrames = Math.max(1, Math.floor((ch0.length - windowSize) / hop));
      const frameRatios = tuneStrength > 0.02 ? new Float32Array(numFrames + 2).fill(1.0) : null;
      const curveStride = Math.max(1, Math.ceil(numFrames / 420));
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
          smoothedSemis += (delta * tuneStrength - smoothedSemis) * smoothAlpha;
          if (frameRatios) frameRatios[f] = Math.pow(2, smoothedSemis / 12);
          if (f % curveStride === 0) {
            pitchCurve.push({ t: pos / sr, rawMidi, tunedMidi: rawMidi + smoothedSemis, voiced: true });
          }
        } else {
          smoothedSemis *= 0.5;
          if (frameRatios) frameRatios[f] = 1.0;
          if (f % curveStride === 0) {
            pitchCurve.push({ t: pos / sr, rawMidi: 0, tunedMidi: 0, voiced: false });
          }
        }
      }

      const pitchScore = voicedTotal > 4
        ? Math.min(99, Math.round(74 + (inTune / voicedTotal) * 24))
        : 94;

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
