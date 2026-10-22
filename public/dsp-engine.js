/**
 * KaroMix AI Studio v3 - Core DSP & Open-Source SoundTouch Audio Engine
 * Powered by SoundTouchJS (WSOLA Time/Pitch), Adaptive Noise Gate, Stereo Doubler & Unnormalized Lexicon Hall Reverb
 */

window.KaroDSP = (() => {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    pentatonic: [0, 2, 4, 7, 9],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };

  const MASTER_PROFILES = {
    balanced: { lowDb: 1.2, highDb: 1.8, drive: 1.22, thresh: -3.5, ceiling: 0.94 },
    warm: { lowDb: 2.2, highDb: 0.8, drive: 1.42, thresh: -4.2, ceiling: 0.93 },
    loud: { lowDb: 1.6, highDb: 2.5, drive: 1.62, thresh: -5.5, ceiling: 0.96 },
  };

  const PRESETS = {
    sinhala_ballad: {
      tag: 'VELVET PLATE',
      nameEn: 'Velvet Ballad',
      descEn: 'Lush concert plate reverb, stereo vocal doubler & warm condenser sheen.',
      noiseGate: 0.55, autotuneAmount: 0.25, retuneSpeed: 0.28, doublerMix: 0.34,
      compThreshold: -24, compRatio: 3.8, hpFreq: 110, warmthDb: 1.2, presenceDb: 3.4, deEssDb: -2.8, airDb: 4.2,
      delayTimeSec: 0.34, delayFeedback: 0.32, delayMix: 0.26, reverbDecay: 2.9, reverbMix: 0.44,
      vocalGain: 1.18, backingGain: 0.82, vocalPocket: true, autoMaster: true, masterProfile: 'warm',
    },
    smule_hall: {
      tag: 'WIDE STAGE',
      nameEn: 'Concert Hall VIP',
      descEn: 'Expansive stereo symphony hall ambience & wide micro-pitch vocal width.',
      noiseGate: 0.55, autotuneAmount: 0.30, retuneSpeed: 0.30, doublerMix: 0.44,
      compThreshold: -26, compRatio: 4.4, hpFreq: 115, warmthDb: 0.6, presenceDb: 3.8, deEssDb: -3.0, airDb: 4.8,
      delayTimeSec: 0.38, delayFeedback: 0.36, delayMix: 0.30, reverbDecay: 3.6, reverbMix: 0.56,
      vocalGain: 1.22, backingGain: 0.80, vocalPocket: true, autoMaster: true, masterProfile: 'balanced',
    },
    pop_radio: {
      tag: 'RADIO READY',
      nameEn: 'Billboard Pop Air',
      descEn: 'Tight 4.6:1 compression, crisp 10.5kHz air & wide stereo pop chorus double.',
      noiseGate: 0.60, autotuneAmount: 0.38, retuneSpeed: 0.42, doublerMix: 0.42,
      compThreshold: -25, compRatio: 4.6, hpFreq: 115, warmthDb: -0.8, presenceDb: 4.2, deEssDb: -3.2, airDb: 5.0,
      delayTimeSec: 0.27, delayFeedback: 0.26, delayMix: 0.22, reverbDecay: 2.2, reverbMix: 0.36,
      vocalGain: 1.20, backingGain: 0.84, vocalPocket: true, autoMaster: true, masterProfile: 'loud',
    },
    phone_rescue: {
      tag: 'NOISE GATE PRO',
      nameEn: 'Studio Mic Cleaner',
      descEn: 'Deep fan & room noise gate, removes 280Hz boxiness & restores clarity.',
      noiseGate: 0.82, autotuneAmount: 0.25, retuneSpeed: 0.25, doublerMix: 0.28,
      compThreshold: -28, compRatio: 5.0, hpFreq: 135, warmthDb: -3.5, presenceDb: 4.6, deEssDb: -3.5, airDb: 4.8,
      delayTimeSec: 0.30, delayFeedback: 0.25, delayMix: 0.20, reverbDecay: 2.4, reverbMix: 0.38,
      vocalGain: 1.26, backingGain: 0.82, vocalPocket: true, autoMaster: true, masterProfile: 'balanced',
    },
    autotune_trap: {
      tag: 'PITCH SNAP',
      nameEn: 'Silk Auto-Tune R&B',
      descEn: 'Smooth phase-locked scale snap with zero metallic chop & lush stereo echo.',
      noiseGate: 0.60, autotuneAmount: 0.80, retuneSpeed: 0.78, doublerMix: 0.38,
      compThreshold: -26, compRatio: 5.0, hpFreq: 120, warmthDb: -0.5, presenceDb: 4.4, deEssDb: -3.5, airDb: 4.8,
      delayTimeSec: 0.25, delayFeedback: 0.32, delayMix: 0.26, reverbDecay: 2.5, reverbMix: 0.38,
      vocalGain: 1.22, backingGain: 0.84, vocalPocket: true, autoMaster: true, masterProfile: 'loud',
    },
    unplugged_room: {
      tag: 'WARM TUBE',
      nameEn: 'Unplugged Session',
      descEn: 'Intimate wooden studio room ambience for acoustic guitar & piano ballads.',
      noiseGate: 0.50, autotuneAmount: 0.0, retuneSpeed: 0.20, doublerMix: 0.16,
      compThreshold: -21, compRatio: 3.0, hpFreq: 95, warmthDb: 1.8, presenceDb: 2.8, deEssDb: -2.2, airDb: 3.2,
      delayTimeSec: 0.24, delayFeedback: 0.18, delayMix: 0.14, reverbDecay: 2.0, reverbMix: 0.30,
      vocalGain: 1.15, backingGain: 0.86, vocalPocket: true, autoMaster: true, masterProfile: 'warm',
    },
    baila_live: {
      tag: 'SLAPBACK ECHO',
      nameEn: 'Live Arena Stage',
      descEn: 'High-presence 3.6kHz punch & energetic live concert stage delay.',
      noiseGate: 0.60, autotuneAmount: 0.20, retuneSpeed: 0.30, doublerMix: 0.36,
      compThreshold: -26, compRatio: 5.0, hpFreq: 120, warmthDb: 0.5, presenceDb: 4.8, deEssDb: -2.8, airDb: 3.8,
      delayTimeSec: 0.21, delayFeedback: 0.34, delayMix: 0.28, reverbDecay: 2.6, reverbMix: 0.40,
      vocalGain: 1.25, backingGain: 0.80, vocalPocket: true, autoMaster: true, masterProfile: 'loud',
    },
    clean_studio: {
      tag: 'TRANSPARENT',
      nameEn: 'Pure Vocal Booth',
      descEn: 'Zero pitch shift — pure noise cleanup, gentle leveling & subtle room air.',
      noiseGate: 0.65, autotuneAmount: 0.0, retuneSpeed: 0.20, doublerMix: 0.12,
      compThreshold: -22, compRatio: 3.2, hpFreq: 105, warmthDb: 0.6, presenceDb: 2.8, deEssDb: -2.0, airDb: 3.2,
      delayTimeSec: 0.26, delayFeedback: 0.16, delayMix: 0.12, reverbDecay: 1.8, reverbMix: 0.24,
      vocalGain: 1.15, backingGain: 0.88, vocalPocket: false, autoMaster: true, masterProfile: 'balanced',
    },
  };

  function detectPitchFrame(buf, offset, windowSize, sampleRate) {
    let energy = 0;
    for (let i = 0; i < windowSize; i++) {
      const v = buf[offset + i];
      energy += v * v;
    }
    const rms = Math.sqrt(energy / windowSize);
    if (rms < 0.008) return { f0: 0, rms, confidence: 0 };

    const tauMin = Math.max(4, Math.floor(sampleRate / 850));
    const tauMax = Math.min(Math.floor(windowSize / 2), Math.ceil(sampleRate / 80));
    const yin = new Float32Array(tauMax + 1);
    yin[0] = 1;
    let runningSum = 0;

    for (let tau = 1; tau <= tauMax; tau++) {
      let diff = 0;
      const limit = windowSize - tauMax;
      for (let i = 0; i < limit; i += 2) {
        const d = buf[offset + i] - buf[offset + i + tau];
        diff += d * d;
      }
      runningSum += diff;
      yin[tau] = runningSum > 0 ? (diff * tau) / runningSum : 1;
    }

    let bestTau = -1;
    for (let tau = tauMin; tau < tauMax; tau++) {
      if (yin[tau] < 0.16) {
        while (tau + 1 < tauMax && yin[tau + 1] < yin[tau]) tau++;
        bestTau = tau;
        break;
      }
    }
    if (bestTau === -1) return { f0: 0, rms, confidence: 0 };

    let refinedTau = bestTau;
    if (bestTau > 1 && bestTau < tauMax) {
      const s0 = yin[bestTau - 1], s1 = yin[bestTau], s2 = yin[bestTau + 1];
      const denom = 2 * (2 * s1 - s2 - s0);
      if (Math.abs(denom) > 1e-6) refinedTau = bestTau + (s2 - s0) / denom;
    }

    const f0 = sampleRate / refinedTau;
    if (f0 < 80 || f0 > 850) return { f0, rms, confidence: Math.max(0, 1 - yin[bestTau]) };
    return { f0, rms, confidence: Math.max(0, 1 - yin[bestTau]) };
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
        if (dist < bestDist) {
          bestDist = dist;
          bestMidi = m;
        }
      }
    }
    return bestMidi;
  }

  function cleanVocalNoise(ctx, rawBuffer, gateAmount = 0.55) {
    if (!rawBuffer) return rawBuffer;
    const sr = rawBuffer.sampleRate;
    const len = rawBuffer.length;
    const numCh = rawBuffer.numberOfChannels;
    const out = ctx.createBuffer(numCh, len, sr);

    const block = Math.max(64, Math.floor(sr * 0.02));
    const nBlocks = Math.floor(len / block);
    const blockRms = new Float32Array(nBlocks);
    const ch0 = rawBuffer.getChannelData(0);

    for (let b = 0; b < nBlocks; b++) {
      let s = 0;
      const base = b * block;
      for (let i = 0; i < block; i++) s += ch0[base + i] * ch0[base + i];
      blockRms[b] = Math.sqrt(s / block);
    }

    const sorted = Array.from(blockRms).sort((a, b) => a - b);
    const noiseFloor = sorted.length > 4 ? sorted[Math.floor(sorted.length * 0.2)] : 0.002;
    const threshold = Math.max(0.004, noiseFloor * (1.5 + gateAmount * 2.4));

    const attackAlpha = 1 - Math.exp(-1 / (sr * 0.005));
    const releaseAlpha = 1 - Math.exp(-1 / (sr * 0.095));
    const hpAlpha = sr / (sr + 2 * Math.PI * 100);

    for (let c = 0; c < numCh; c++) {
      const inp = rawBuffer.getChannelData(c);
      const dst = out.getChannelData(c);
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
          targetGain = Math.max(1 - gateAmount * 0.96, ratio * ratio);
        }
        gain += (targetGain > gain ? attackAlpha : releaseAlpha) * (targetGain - gain);
        dst[i] = hp * gain;
      }
    }
    return out;
  }

  function wsolaResampleChannel(inp, out, length, sr, frameRatios, hop, numFrames) {
    const win = Math.round(sr * 0.028);
    const synthHop = Math.round(win / 2);
    const maxSeek = Math.round(sr * 0.007);

    const hann = new Float32Array(win);
    for (let k = 0; k < win; k++) {
      hann[k] = 0.5 * (1 - Math.cos((2 * Math.PI * k) / win));
    }

    let readCenter = 0;
    for (let writePos = 0; writePos + win < length; writePos += synthHop) {
      const fIdx = Math.min(numFrames - 1, Math.max(0, Math.floor(writePos / hop)));
      const ratio = frameRatios[fIdx];

      let bestOffset = 0;
      if (writePos > synthHop && Math.abs(ratio - 1.0) > 0.002) {
        let bestCorr = -Infinity;
        const matchLen = Math.min(synthHop, 256);
        for (let d = -maxSeek; d <= maxSeek; d += 2) {
          const candStart = Math.round(readCenter + d);
          if (candStart < 1 || candStart + win >= length - 1) continue;
          let corr = 0;
          for (let m = 0; m < matchLen; m += 4) corr += out[writePos + m] * inp[candStart + m];
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
  }

  function pitchCorrectBuffer(ctx, rawBuffer, opts = {}) {
    const keyRoot = opts.keyRoot ?? 9;
    const scaleName = opts.scaleName || 'minor';
    const strength = Math.max(0, Math.min(1, opts.strength ?? 0.25));
    const retuneSpeed = Math.max(0.05, Math.min(1, opts.retuneSpeed ?? 0.3));
    const noiseGate = opts.noiseGate ?? 0.55;

    const cleanedBuffer = cleanVocalNoise(ctx, rawBuffer, noiseGate);
    const sr = cleanedBuffer.sampleRate;
    const length = cleanedBuffer.length;
    const numCh = cleanedBuffer.numberOfChannels;

    const mono = new Float32Array(length);
    for (let c = 0; c < numCh; c++) {
      const ch = cleanedBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] += ch[i] / numCh;
    }

    const windowSize = 1536;
    const hop = 512;
    const numFrames = Math.max(1, Math.floor((length - windowSize) / hop));
    const frameRatios = new Float32Array(numFrames + 2).fill(1.0);
    const pitchCurve = [];

    let prevTarget = null;
    let smoothedSemis = 0;
    const smoothAlpha = 0.08 + retuneSpeed * 0.45;
    let inTuneFrames = 0;
    let totalVoiced = 0;

    for (let f = 0; f < numFrames; f++) {
      const pos = f * hop;
      const { f0, confidence } = detectPitchFrame(mono, pos, windowSize, sr);
      if (f0 > 0 && confidence > 0.78) {
        const rawMidi = 69 + 12 * Math.log2(f0 / 440);
        const targetMidi = nearestScaleMidi(rawMidi, keyRoot, scaleName, prevTarget);
        prevTarget = targetMidi;
        totalVoiced++;
        if (Math.abs(targetMidi - rawMidi) < 0.42) inTuneFrames++;

        const rawDelta = Math.max(-1.8, Math.min(1.8, targetMidi - rawMidi));
        smoothedSemis += (rawDelta * strength - smoothedSemis) * smoothAlpha;
        frameRatios[f] = Math.pow(2, smoothedSemis / 12);
        if (f % 2 === 0) pitchCurve.push({ t: pos / sr, rawMidi, tunedMidi: rawMidi + smoothedSemis, voiced: true });
      } else {
        smoothedSemis *= 0.5;
        frameRatios[f] = 1.0;
        if (f % 2 === 0) pitchCurve.push({ t: pos / sr, rawMidi: 0, tunedMidi: 0, voiced: false });
      }
    }

    const pitchScore = totalVoiced > 5
      ? Math.min(99, Math.round(72 + (inTuneFrames / totalVoiced) * 26 + strength * 4))
      : 92;

    if (strength <= 0.02) {
      return { buffer: cleanedBuffer, pitchCurve, pitchScore };
    }

    const outBuffer = ctx.createBuffer(numCh, length, sr);
    for (let c = 0; c < numCh; c++) {
      wsolaResampleChannel(cleanedBuffer.getChannelData(c), outBuffer.getChannelData(c), length, sr, frameRatios, hop, numFrames);
    }
    return { buffer: outBuffer, pitchCurve, pitchScore };
  }

  function centerCutKaraokeBuffer(ctx, srcBuffer) {
    if (!srcBuffer || srcBuffer.numberOfChannels < 2) return srcBuffer;
    const sr = srcBuffer.sampleRate;
    const len = srcBuffer.length;
    const L = srcBuffer.getChannelData(0);
    const R = srcBuffer.getChannelData(1);
    const out = ctx.createBuffer(2, len, sr);
    const outL = out.getChannelData(0);
    const outR = out.getChannelData(1);

    let bassLp = 0, airLp = 0;
    const aBass = (2 * Math.PI * 190) / (sr + 2 * Math.PI * 190);
    const aAir = (2 * Math.PI * 6200) / (sr + 2 * Math.PI * 6200);

    for (let i = 0; i < len; i++) {
      const mid = (L[i] + R[i]) * 0.5;
      const side = (L[i] - R[i]) * 0.5;
      bassLp += aBass * (mid - bassLp);
      airLp += aAir * (mid - airLp);
      const keptCenter = bassLp * 1.15 + (mid - airLp) * 0.65;
      outL[i] = keptCenter + side * 1.22;
      outR[i] = keptCenter - side * 1.22;
    }
    return out;
  }

  /**
   * High-Fidelity Key Transpose powered by Open-Source SoundTouchJS (Audacity Engine!)
   * Falls back seamlessly to Phase-Aligned WSOLA if mono or library unavailable.
   */
  function transposeBuffer(ctx, srcBuffer, semitones) {
    if (!srcBuffer || semitones === 0) return srcBuffer;
    const sr = srcBuffer.sampleRate;
    const length = srcBuffer.length;
    const numCh = srcBuffer.numberOfChannels;

    if (window.SoundTouchLib && window.SoundTouchLib.SoundTouch && window.SoundTouchLib.SimpleFilter && numCh >= 1) {
      try {
        const st = new window.SoundTouchLib.SoundTouch();
        st.pitchSemitones = semitones;
        st.tempo = 1.0;

        const leftIn = srcBuffer.getChannelData(0);
        const rightIn = numCh > 1 ? srcBuffer.getChannelData(1) : leftIn;
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

        const filter = new window.SoundTouchLib.SimpleFilter(source, st);
        const outBuffer = ctx.createBuffer(2, length, sr);
        const outL = outBuffer.getChannelData(0);
        const outR = outBuffer.getChannelData(1);
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
        return outBuffer;
      } catch (_) {}
    }

    const ratio = Math.pow(2, semitones / 12);
    const outBuffer = ctx.createBuffer(numCh, length, sr);
    const numFrames = Math.max(2, Math.ceil(length / 512));
    const frameRatios = new Float32Array(numFrames).fill(ratio);
    for (let c = 0; c < numCh; c++) {
      wsolaResampleChannel(srcBuffer.getChannelData(c), outBuffer.getChannelData(c), length, sr, frameRatios, 512, numFrames);
    }
    return outBuffer;
  }

  function analyzeVoiceProfile(vocalBuffer) {
    const sr = vocalBuffer.sampleRate;
    const ch = vocalBuffer.getChannelData(0);
    const len = ch.length;

    const pitches = [];
    let peak = 0, sumSq = 0, activeSamples = 0, lp = 0;
    const alphaLp = (2 * Math.PI * 420) / (sr + 2 * Math.PI * 420);
    let lowEnergy = 0, highEnergy = 0;

    for (let i = 0; i < len; i++) {
      const s = ch[i];
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      lp += alphaLp * (s - lp);
      lowEnergy += lp * lp;
      const hp = s - lp;
      highEnergy += hp * hp;
      if (abs > 0.01) { sumSq += s * s; activeSamples++; }
    }

    for (let pos = 0; pos + 1536 < len; pos += 1024) {
      const { f0, confidence } = detectPitchFrame(ch, pos, 1536, sr);
      if (f0 > 0 && confidence > 0.75) pitches.push(f0);
    }

    pitches.sort((a, b) => a - b);
    const medianF0 = pitches.length > 0 ? pitches[Math.floor(pitches.length / 2)] : 195;

    const pcCounts = new Array(12).fill(0);
    pitches.forEach((f) => {
      const midi = Math.round(69 + 12 * Math.log2(f / 440));
      pcCounts[((midi % 12) + 12) % 12]++;
    });
    let dominantNote = 9, bestCount = -1;
    pcCounts.forEach((cnt, idx) => { if (cnt > bestCount) { bestCount = cnt; dominantNote = idx; } });

    const rms = activeSamples > 0 ? Math.sqrt(sumSq / activeSamples) : 0.08;
    const crestDb = 20 * Math.log10(Math.max(peak, 0.001) / Math.max(rms, 0.0005));
    const mudRatio = lowEnergy / Math.max(highEnergy, 1e-6);

    let registerEn = 'Warm Mid-Range Vocal (Tenor / Alto)';
    if (medianF0 < 155) registerEn = 'Deep Rich Vocal (Baritone / Bass)';
    else if (medianF0 > 245) registerEn = 'Bright Upper Register (High Tenor / Soprano)';

    let toneNoteEn = '', recommendedPreset = 'sinhala_ballad';
    const customTweak = {};

    if (mudRatio > 6.5) {
      recommendedPreset = 'phone_rescue';
      toneNoteEn = 'Engaged deep room noise gate, cut 280Hz boxiness & added lush stereo hall.';
      customTweak.warmthDb = -3.4; customTweak.airDb = 4.6; customTweak.noiseGate = 0.80;
    } else if (mudRatio < 1.8) {
      recommendedPreset = 'sinhala_ballad';
      toneNoteEn = 'Added warm tube body (+2.0dB), stereo micro-pitch doubler & velvet plate.';
      customTweak.warmthDb = 2.0; customTweak.reverbMix = 0.48;
    } else {
      recommendedPreset = 'smule_hall';
      toneNoteEn = 'Balanced vocal spectrum — applied Concert Hall VIP ambience & wide stereo chorus.';
    }

    if (rms < 0.05) customTweak.vocalGain = 1.45;
    else if (rms > 0.25) customTweak.vocalGain = 0.95;

    return {
      medianHz: Math.round(medianF0),
      suggestedKeyIndex: dominantNote,
      suggestedKeyName: NOTE_NAMES[dominantNote],
      crestDb: crestDb.toFixed(1),
      registerEn,
      toneNoteEn,
      recommendedPreset,
      settings: { ...PRESETS[recommendedPreset], ...customTweak },
    };
  }

  function estimateSyncOffsetMs(backingBuf, vocalBuf) {
    if (!backingBuf || !vocalBuf) return -115;
    const sr = backingBuf.sampleRate;
    const envStep = Math.floor(sr * 0.005);
    const maxSec = Math.min(20, backingBuf.duration, vocalBuf.duration);
    const nFrames = Math.floor((maxSec * sr) / envStep);
    if (nFrames < 80) return -110;

    const extractOnset = (buf) => {
      const ch = buf.getChannelData(0);
      const env = new Float32Array(nFrames);
      let prev = 0;
      for (let i = 0; i < nFrames; i++) {
        let sum = 0;
        const base = i * envStep;
        for (let k = 0; k < envStep; k += 4) sum += Math.abs(ch[base + k] || 0);
        const cur = sum / (envStep / 4);
        env[i] = Math.max(0, cur - prev);
        prev = cur;
      }
      return env;
    };

    const bEnv = extractOnset(backingBuf);
    const vEnv = extractOnset(vocalBuf);

    let bestLagFrames = -22, bestScore = -1;
    for (let lag = -60; lag <= 25; lag++) {
      let score = 0;
      for (let i = 70; i < nFrames - 70; i++) score += bEnv[i] * vEnv[i - lag];
      const lagMs = lag * 5;
      score *= 0.65 + 0.35 * Math.exp(-Math.pow((lagMs + 110) / 135, 2));
      if (score > bestScore) { bestScore = score; bestLagFrames = lag; }
    }
    return bestLagFrames * 5;
  }

  function createReverbImpulse(ctx, decaySec = 2.8) {
    const sr = ctx.sampleRate;
    const duration = Math.max(0.6, Math.min(4.8, decaySec));
    const length = Math.floor(sr * duration);
    const impulse = ctx.createBuffer(2, length, sr);
    const earlyTapsMs = [
      [18, 0.32], [29, -0.26], [43, 0.24], [58, -0.20], [74, 0.17], [92, -0.14],
    ];

    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      earlyTapsMs.forEach(([ms, gain], idx) => {
        const tapIdx = Math.floor(((ms + c * 6 + idx * 2) / 1000) * sr);
        if (tapIdx < length) ch[tapIdx] += gain;
      });
      const tailStart = Math.floor(sr * 0.025);
      let lp = 0;
      const scale = 0.055 / Math.sqrt(Math.max(0.8, duration / 2.2));
      for (let i = tailStart; i < length; i++) {
        const t = (i - tailStart) / (length - tailStart);
        const white = Math.random() * 2 - 1;
        const damp = 0.42 + 0.42 * t;
        lp = lp * damp + white * (1 - damp);
        const env = Math.pow(1 - t, 2.3) * Math.min(1, (i - tailStart) / (sr * 0.035));
        ch[i] += lp * env * scale;
      }
    }
    return impulse;
  }

  function createSoftClipCurve(drive = 1.3) {
    const n = 2048;
    const curve = new Float32Array(n);
    const norm = Math.tanh(drive);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(drive * x) / norm;
    }
    return curve;
  }

  function buildStudioGraph(ctx, buffers, params, startAtSec = 0, targetDestination = null) {
    const dest = targetDestination || ctx.destination;
    const now = ctx.currentTime + (ctx instanceof OfflineAudioContext ? 0 : 0.02);
    const masterInput = ctx.createGain();
    const nodes = { sources: [] };

    if (!(ctx instanceof OfflineAudioContext)) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      nodes.masterAnalyser = analyser;
    }

    if (params.autoMaster) {
      const mp = MASTER_PROFILES[params.masterProfile] || MASTER_PROFILES.balanced;
      const subCut = ctx.createBiquadFilter(); subCut.type = 'highpass'; subCut.frequency.value = 32;
      const lowGlue = ctx.createBiquadFilter(); lowGlue.type = 'lowshelf'; lowGlue.frequency.value = 95; lowGlue.gain.value = mp.lowDb;
      const highSheen = ctx.createBiquadFilter(); highSheen.type = 'highshelf'; highSheen.frequency.value = 11500; highSheen.gain.value = mp.highDb;
      const shaper = ctx.createWaveShaper(); shaper.curve = createSoftClipCurve(mp.drive); shaper.oversample = '2x';
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = mp.thresh; limiter.knee.value = 4; limiter.ratio.value = 20;
      limiter.attack.value = 0.001; limiter.release.value = 0.09;
      const ceiling = ctx.createGain(); ceiling.gain.value = mp.ceiling;

      masterInput.connect(subCut); subCut.connect(lowGlue); lowGlue.connect(highSheen);
      highSheen.connect(shaper); shaper.connect(limiter); limiter.connect(ceiling);
      if (nodes.masterAnalyser) { ceiling.connect(nodes.masterAnalyser); nodes.masterAnalyser.connect(dest); }
      else ceiling.connect(dest);
    } else {
      if (nodes.masterAnalyser) { masterInput.connect(nodes.masterAnalyser); nodes.masterAnalyser.connect(dest); }
      else masterInput.connect(dest);
    }

    if (buffers.backing && !params.muteBacking) {
      const bSrc = ctx.createBufferSource();
      bSrc.buffer = buffers.backing;
      const pocketEq = ctx.createBiquadFilter();
      pocketEq.type = 'peaking'; pocketEq.frequency.value = 2500; pocketEq.Q.value = 0.9;
      pocketEq.gain.value = params.vocalPocket ? -2.5 : 0;

      const bGain = ctx.createGain();
      bGain.gain.value = params.soloVocal ? 0 : (params.backingGain ?? 0.82);

      bSrc.connect(pocketEq); pocketEq.connect(bGain); bGain.connect(masterInput);
      if (startAtSec < buffers.backing.duration) bSrc.start(now, Math.max(0, startAtSec));
      nodes.sources.push(bSrc);
      nodes.backingGain = bGain;
      nodes.pocketEq = pocketEq;
    }

    const activeVocal = params.bypassFx ? buffers.rawVocal : (buffers.tunedVocal || buffers.rawVocal);
    if (activeVocal && !params.muteVocal) {
      const vSrc = ctx.createBufferSource();
      vSrc.buffer = activeVocal;

      if (params.bypassFx) {
        const rawGain = ctx.createGain();
        rawGain.gain.value = params.vocalGain ?? 1.0;
        vSrc.connect(rawGain); rawGain.connect(masterInput);
        nodes.vocalGain = rawGain;
      } else {
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = params.hpFreq ?? 110;
        const warmth = ctx.createBiquadFilter(); warmth.type = 'peaking'; warmth.frequency.value = 280; warmth.Q.value = 1.1; warmth.gain.value = params.warmthDb ?? 0;
        const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3600; presence.Q.value = 1.0; presence.gain.value = params.presenceDb ?? 3.4;
        const deEss = ctx.createBiquadFilter(); deEss.type = 'peaking'; deEss.frequency.value = 6800; deEss.Q.value = 2.2; deEss.gain.value = params.deEssDb ?? -2.8;
        const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 10500; air.gain.value = params.airDb ?? 4.2;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = params.compThreshold ?? -24;
        comp.knee.value = 18; comp.ratio.value = params.compRatio ?? 4.0;
        comp.attack.value = 0.005; comp.release.value = 0.16;

        const makeupDb = Math.max(0, (-(params.compThreshold ?? -24) - 12) * (1 - 1 / (params.compRatio ?? 4)) * 0.42);
        const makeup = ctx.createGain(); makeup.gain.value = Math.pow(10, makeupDb / 20);

        const vOut = ctx.createGain(); vOut.gain.value = params.vocalGain ?? 1.18;

        // Exclusive Studio Feature: Micro-Pitch Stereo Vocal Doubler (Haas + LFO Chorus Width!)
        const dblL = ctx.createDelay(0.1); dblL.delayTime.value = 0.014;
        const dblR = ctx.createDelay(0.1); dblR.delayTime.value = 0.022;
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.58;
        const lfoGainL = ctx.createGain(); lfoGainL.gain.value = 0.0018;
        const lfoGainR = ctx.createGain(); lfoGainR.gain.value = -0.0021;
        lfo.connect(lfoGainL); lfoGainL.connect(dblL.delayTime);
        lfo.connect(lfoGainR); lfoGainR.connect(dblR.delayTime);
        lfo.start(now);
        nodes.sources.push(lfo);

        const dblMerger = ctx.createChannelMerger(2);
        const dblWet = ctx.createGain(); dblWet.gain.value = (params.doublerMix ?? 0.34) * 0.55;
        makeup.connect(dblL); makeup.connect(dblR);
        dblL.connect(dblMerger, 0, 0); dblR.connect(dblMerger, 0, 1);
        dblMerger.connect(dblWet);
        dblWet.connect(vOut);

        // Stereo Ping-Pong Slap / Echo Delay
        const delayL = ctx.createDelay(1.5); delayL.delayTime.value = Math.max(0.05, Math.min(1.0, params.delayTimeSec ?? 0.34));
        const delayR = ctx.createDelay(1.5); delayR.delayTime.value = Math.max(0.06, Math.min(1.1, (params.delayTimeSec ?? 0.34) * 1.14));
        const dFeedback = ctx.createGain(); dFeedback.gain.value = Math.min(0.68, Math.max(0, params.delayFeedback ?? 0.32));
        const dFilter = ctx.createBiquadFilter(); dFilter.type = 'lowpass'; dFilter.frequency.value = 3100;
        const merger = ctx.createChannelMerger(2);
        const dWet = ctx.createGain(); dWet.gain.value = (params.delayMix ?? 0.25) * 1.25;

        // Unnormalized True-Level Concert Hall Reverb
        const convolver = ctx.createConvolver();
        convolver.normalize = false;
        convolver.buffer = createReverbImpulse(ctx, params.reverbDecay ?? 2.9);
        const revHp = ctx.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 210;
        const revLp = ctx.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 7200;
        const rWet = ctx.createGain(); rWet.gain.value = (params.reverbMix ?? 0.44) * 1.35;

        vSrc.connect(hp); hp.connect(warmth); warmth.connect(presence); presence.connect(deEss);
        deEss.connect(air); air.connect(comp); comp.connect(makeup);
        makeup.connect(vOut);

        makeup.connect(dFilter); dFilter.connect(delayL);
        delayL.connect(dFeedback); dFeedback.connect(delayL);
        delayL.connect(delayR);
        delayL.connect(merger, 0, 0); delayR.connect(merger, 0, 1);
        merger.connect(dWet); dWet.connect(vOut);

        makeup.connect(convolver);
        convolver.connect(revHp); revHp.connect(revLp); revLp.connect(rWet);
        rWet.connect(vOut);

        vOut.connect(masterInput);
        Object.assign(nodes, { hp, warmth, presence, deEss, air, comp, makeup, dblWet, delay: delayL, dFeedback, dWet, rWet, vocalGain: vOut });
      }

      const offsetSec = (params.vocalOffsetMs || 0) / 1000;
      const desiredPos = startAtSec - offsetSec;
      if (desiredPos >= 0) {
        if (desiredPos < activeVocal.duration) vSrc.start(now, desiredPos);
      } else {
        vSrc.start(now + Math.abs(desiredPos), 0);
      }
      nodes.sources.push(vSrc);
    }

    return nodes;
  }

  async function renderMasterBuffer(buffers, params, sampleRate = 44100) {
    const offsetSec = (params.vocalOffsetMs || 0) / 1000;
    const bDur = buffers.backing ? buffers.backing.duration : 0;
    const vDur = buffers.rawVocal ? buffers.rawVocal.duration + Math.max(0, offsetSec) + 2.0 : 0;
    const totalDur = Math.max(bDur, vDur, 1);
    const offline = new OfflineAudioContext(2, Math.ceil(totalDur * sampleRate), sampleRate);
    buildStudioGraph(offline, buffers, params, 0);
    return offline.startRendering();
  }

  async function renderMasterWav(buffers, params, compact = false) {
    const sr = compact ? 24000 : 44100;
    const rendered = await renderMasterBuffer(buffers, params, sr);
    return audioBufferToWavBlob(rendered, compact ? 1 : 2);
  }

  function audioBufferToWavBlob(buffer, outChannels = 2) {
    const numCh = Math.min(outChannels, buffer.numberOfChannels);
    const length = buffer.length * numCh * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

    writeStr(0, 'RIFF'); view.setUint32(4, length - 8, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true); view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * numCh * 2, true); view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true); writeStr(36, 'data'); view.setUint32(40, buffer.length * numCh * 2, true);

    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      if (numCh === 1) {
        const mono = Math.max(-1, Math.min(1, (ch0[i] + ch1[i]) * 0.5));
        view.setInt16(offset, mono < 0 ? mono * 0x8000 : mono * 0x7fff, true);
        offset += 2;
      } else {
        const sL = Math.max(-1, Math.min(1, ch0[i]));
        const sR = Math.max(-1, Math.min(1, ch1[i]));
        view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7fff, true);
        view.setInt16(offset + 2, sR < 0 ? sR * 0x8000 : sR * 0x7fff, true);
        offset += 4;
      }
    }
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  function generateDemoSession(ctx) {
    const sr = ctx.sampleRate;
    const bpm = 90;
    const beatSec = 60 / bpm;
    const dur = 24 * beatSec;
    const len = Math.floor(sr * dur);

    const backing = ctx.createBuffer(2, len, sr);
    const L = backing.getChannelData(0), R = backing.getChannelData(1);
    const chords = [
      { root: 110.0, notes: [220.0, 261.63, 329.63, 440.0] },
      { root: 87.31, notes: [174.61, 220.0, 261.63, 349.23] },
      { root: 130.81, notes: [261.63, 329.63, 392.0, 523.25] },
      { root: 98.0, notes: [196.0, 246.94, 293.66, 392.0] },
    ];

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const beatIdx = Math.floor(t / beatSec);
      const barIdx = Math.floor(beatIdx / 4);
      const chord = chords[barIdx % 4];
      const posInBar = t - barIdx * 4 * beatSec;
      const posInBeat = t - beatIdx * beatSec;

      const padEnv = Math.exp(-posInBar * 0.75) * Math.min(1, posInBar * 24);
      let padL = 0, padR = 0;
      chord.notes.forEach((f, idx) => {
        const s = Math.sin(2 * Math.PI * f * t) * 0.78 + Math.sin(4 * Math.PI * f * t) * 0.16;
        padL += s * (idx % 2 === 0 ? 0.10 : 0.06) * padEnv;
        padR += s * (idx % 2 === 1 ? 0.10 : 0.06) * padEnv;
      });

      const eighthSec = beatSec / 2;
      const eighthIdx = Math.floor(t / eighthSec);
      const arpT = t - eighthIdx * eighthSec;
      const arpFreq = chord.notes[eighthIdx % 4];
      const arpEnv = Math.exp(-arpT * 6.5) * Math.min(1, arpT * 90);
      const arp = (Math.sin(2 * Math.PI * arpFreq * t) + 0.35 * Math.sin(4 * Math.PI * arpFreq * t)) * arpEnv * 0.10;

      const bassEnv = Math.exp(-posInBeat * 3.4) * (beatIdx % 2 === 0 ? 1 : 0.45);
      const bass = Math.sin(2 * Math.PI * chord.root * t) * bassEnv * 0.24;

      let drum = 0;
      if (beatIdx % 2 === 0 && posInBeat < 0.18) {
        const kFreq = 52 + 105 * Math.exp(-posInBeat * 32);
        drum += Math.sin(2 * Math.PI * kFreq * posInBeat) * Math.exp(-posInBeat * 15) * 0.30;
      }
      L[i] = padL + arp * 1.15 + bass + drum;
      R[i] = padR + arp * 0.85 + bass + drum;
    }

    const vocal = ctx.createBuffer(1, len, sr);
    const V = vocal.getChannelData(0);
    const melody = [
      { startBeat: 1.0, durBeats: 1.4, midi: 69, err: +0.28 },
      { startBeat: 2.5, durBeats: 1.3, midi: 72, err: -0.30 },
      { startBeat: 4.0, durBeats: 2.2, midi: 71, err: +0.25 },
      { startBeat: 6.5, durBeats: 1.3, midi: 69, err: -0.25 },
      { startBeat: 8.0, durBeats: 1.5, midi: 67, err: +0.30 },
      { startBeat: 9.5, durBeats: 1.4, midi: 72, err: -0.28 },
      { startBeat: 11.0, durBeats: 2.6, midi: 74, err: +0.32 },
      { startBeat: 14.0, durBeats: 1.8, midi: 72, err: -0.24 },
      { startBeat: 16.0, durBeats: 1.5, midi: 71, err: +0.26 },
      { startBeat: 17.5, durBeats: 1.4, midi: 67, err: -0.26 },
      { startBeat: 19.0, durBeats: 3.4, midi: 69, err: +0.28 },
    ];

    const micLagSec = 0.120;
    let phase = 0;
    for (const note of melody) {
      const tStart = note.startBeat * beatSec + micLagSec;
      const tEnd = Math.min(dur - 0.05, tStart + note.durBeats * beatSec);
      const iStart = Math.max(0, Math.floor(tStart * sr));
      const iEnd = Math.min(len, Math.floor(tEnd * sr));
      for (let i = iStart; i < iEnd; i++) {
        const localT = (i - iStart) / sr;
        const noteDur = (iEnd - iStart) / sr;
        const vibrato = 0.09 * Math.sin(2 * Math.PI * 5.2 * localT) * Math.min(1, localT * 1.8);
        const midiNow = note.midi + note.err * 0.5 + vibrato;
        const freq = 440 * Math.pow(2, (midiNow - 69) / 12);
        phase += freq / sr; phase -= Math.floor(phase);
        const silky =
          Math.sin(2 * Math.PI * phase) * 0.68 +
          Math.sin(4 * Math.PI * phase) * 0.22 +
          Math.sin(6 * Math.PI * phase) * 0.08;
        const attack = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, localT / 0.065));
        const release = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, (noteDur - localT) / 0.12));
        V[i] += silky * attack * release * 0.36;
      }
    }

    return { backing, vocal, suggestedKey: 'A', suggestedScale: 'minor' };
  }

  return {
    NOTE_NAMES, SCALES, MASTER_PROFILES, PRESETS,
    detectPitchFrame, cleanVocalNoise, pitchCorrectBuffer, centerCutKaraokeBuffer, transposeBuffer,
    analyzeVoiceProfile, estimateSyncOffsetMs, buildStudioGraph, renderMasterWav, generateDemoSession,
  };
})();
