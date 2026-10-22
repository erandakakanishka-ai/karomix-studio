/**
 * KaroMix Studio Pro - Precision Client-Side DSP & AI Mastering Engine
 * 100% Zero-Server-CPU Audio Processing (Web Audio API + OfflineAudioContext)
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
    balanced: { lowDb: 1.3, highDb: 1.6, drive: 1.28, thresh: -3.4, ceiling: 0.94 },
    warm: { lowDb: 2.4, highDb: 0.6, drive: 1.55, thresh: -4.2, ceiling: 0.93 },
    loud: { lowDb: 1.8, highDb: 2.4, drive: 1.72, thresh: -5.8, ceiling: 0.96 },
  };

  const PRESETS = {
    sinhala_ballad: {
      tag: 'VELVET PLATE',
      nameEn: 'Velvet Ballad',
      nameSi: 'භාවාත්මක ගීත (Ballad)',
      descEn: 'Warm plate reverb, quarter-note echo & silky high air for emotional vocals.',
      descSi: 'මෘදු Plate Reverb, මිහිරි Echo සහ උණුසුම් ගැඹුරු හඬ පැහැදිලි බව.',
      autotuneAmount: 0.55, retuneSpeed: 0.35, compThreshold: -24, compRatio: 3.8,
      hpFreq: 95, warmthDb: 1.5, presenceDb: 3.2, deEssDb: -2.5, airDb: 3.8,
      delayTimeSec: 0.34, delayFeedback: 0.28, delayMix: 0.20, reverbDecay: 2.6, reverbMix: 0.30,
      vocalGain: 1.15, backingGain: 0.85, vocalPocket: true, autoMaster: true, masterProfile: 'warm',
    },
    pop_radio: {
      nameEn: 'Crisp Pop Studio',
      nameSi: 'Studio Pop පැහැදිලි හඬ',
      tag: 'RADIO READY',
      descEn: 'Tight 4.8:1 compression, bright 10kHz condenser sheen & tight slap delay.',
      descSi: 'TikTok සහ YouTube Covers සඳහා ඉතා පැහැදිලි නවීන Studio Pop හඬ.',
      autotuneAmount: 0.72, retuneSpeed: 0.58, compThreshold: -25, compRatio: 4.8,
      hpFreq: 110, warmthDb: -1.0, presenceDb: 4.2, deEssDb: -3.2, airDb: 5.0,
      delayTimeSec: 0.27, delayFeedback: 0.22, delayMix: 0.16, reverbDecay: 1.9, reverbMix: 0.22,
      vocalGain: 1.18, backingGain: 0.86, vocalPocket: true, autoMaster: true, masterProfile: 'loud',
    },
    smule_hall: {
      nameEn: 'Arena Concert Hall',
      nameSi: 'ප්‍රසංග ශාලා හඬ (Hall)',
      tag: 'WIDE STAGE',
      descEn: 'Lush stereo concert hall ambience that makes mobile mic vocals sound huge.',
      descSi: 'සාමාන්‍ය Phone Mic හඬක් විශාල ප්‍රසංග වේදිකාවක ගයනවා සේ පුළුල් කරයි.',
      autotuneAmount: 0.65, retuneSpeed: 0.45, compThreshold: -26, compRatio: 4.5,
      hpFreq: 105, warmthDb: 0.5, presenceDb: 3.8, deEssDb: -3.0, airDb: 4.5,
      delayTimeSec: 0.38, delayFeedback: 0.34, delayMix: 0.25, reverbDecay: 3.4, reverbMix: 0.38,
      vocalGain: 1.2, backingGain: 0.82, vocalPocket: true, autoMaster: true, masterProfile: 'balanced',
    },
    autotune_trap: {
      nameEn: 'Modern Auto-Tune',
      nameSi: 'Hard Auto-Tune R&B',
      tag: 'HARD SNAP',
      descEn: 'Zero-latency 95% pitch quantization for modern R&B, Hip-Hop & Hyperpop.',
      descSi: 'වේගවත් Pitch Snap (95%) සමඟ නවීන R&B සහ Pop ගායන ශෛලිය.',
      autotuneAmount: 0.95, retuneSpeed: 0.92, compThreshold: -27, compRatio: 5.5,
      hpFreq: 115, warmthDb: -0.5, presenceDb: 4.5, deEssDb: -3.5, airDb: 4.8,
      delayTimeSec: 0.25, delayFeedback: 0.30, delayMix: 0.22, reverbDecay: 2.1, reverbMix: 0.24,
      vocalGain: 1.22, backingGain: 0.85, vocalPocket: true, autoMaster: true, masterProfile: 'loud',
    },
    phone_rescue: {
      nameEn: 'Phone Mic Restorer',
      nameSi: 'Phone Mic පිරිසිදුකරණය',
      tag: 'AI CLEANUP',
      descEn: 'Cuts 280Hz boxiness, tames harsh sibilance & lifts studio condenser air.',
      descSi: 'දුරකථන Mic වල බොඳ ගතිය සහ අනවශ්‍ය දෝංකාරය ඉවත් කර පැහැදිලි කරයි.',
      autotuneAmount: 0.50, retuneSpeed: 0.35, compThreshold: -28, compRatio: 5.2,
      hpFreq: 130, warmthDb: -3.8, presenceDb: 4.6, deEssDb: -3.5, airDb: 4.6,
      delayTimeSec: 0.30, delayFeedback: 0.20, delayMix: 0.14, reverbDecay: 2.0, reverbMix: 0.24,
      vocalGain: 1.25, backingGain: 0.84, vocalPocket: true, autoMaster: true, masterProfile: 'balanced',
    },
    unplugged_room: {
      nameEn: 'Acoustic Session',
      nameSi: 'Acoustic ගිටාර්/පියානෝ',
      tag: 'NATURAL WOOD',
      descEn: 'Intimate wooden studio room reflections with gentle tube warmth.',
      descSi: 'ගිටාර් සහ පියානෝ Acoustic ගීත සඳහා ඉතා ස්වභාවික මිහිරි හඬ.',
      autotuneAmount: 0.35, retuneSpeed: 0.25, compThreshold: -21, compRatio: 3.0,
      hpFreq: 90, warmthDb: 2.0, presenceDb: 2.6, deEssDb: -2.0, airDb: 3.0,
      delayTimeSec: 0.22, delayFeedback: 0.14, delayMix: 0.09, reverbDecay: 1.4, reverbMix: 0.19,
      vocalGain: 1.12, backingGain: 0.88, vocalPocket: true, autoMaster: true, masterProfile: 'warm',
    },
    baila_live: {
      nameEn: 'Live Band Stage',
      nameSi: 'Live Band / Bailā වේදිකාව',
      tag: 'HIGH PUNCH',
      descEn: 'High-presence 3.6kHz punch + energetic stage slapback that cuts over drums.',
      descSi: 'වේගවත් Band සංගීතය මැදින් කටහඬ හොඳින් කැපී පෙනෙන Live Stage Echo.',
      autotuneAmount: 0.45, retuneSpeed: 0.40, compThreshold: -26, compRatio: 5.0,
      hpFreq: 115, warmthDb: 0.5, presenceDb: 4.8, deEssDb: -2.8, airDb: 3.5,
      delayTimeSec: 0.19, delayFeedback: 0.28, delayMix: 0.22, reverbDecay: 2.3, reverbMix: 0.26,
      vocalGain: 1.24, backingGain: 0.82, vocalPocket: true, autoMaster: true, masterProfile: 'loud',
    },
    clean_studio: {
      nameEn: 'Pure Vocal Booth',
      nameSi: 'ස්වභාවික Studio හඬ',
      tag: 'TRANSPARENT',
      descEn: 'Transparent studio leveling & subtle EQ polish with minimal room tail.',
      descSi: 'අමතර දෝංකාර රහිත පිරිසිදු Compressor සහ EQ පමණක් සහිත හඬ.',
      autotuneAmount: 0.25, retuneSpeed: 0.20, compThreshold: -22, compRatio: 3.2,
      hpFreq: 95, warmthDb: 0.5, presenceDb: 2.5, deEssDb: -2.0, airDb: 2.8,
      delayTimeSec: 0.25, delayFeedback: 0.10, delayMix: 0.04, reverbDecay: 1.2, reverbMix: 0.10,
      vocalGain: 1.12, backingGain: 0.90, vocalPocket: false, autoMaster: true, masterProfile: 'balanced',
    },
  };

  function detectPitchFrame(buf, offset, windowSize, sampleRate) {
    let energy = 0;
    for (let i = 0; i < windowSize; i++) {
      const v = buf[offset + i];
      energy += v * v;
    }
    const rms = Math.sqrt(energy / windowSize);
    if (rms < 0.007) return { f0: 0, rms, confidence: 0 };

    const tauMin = Math.max(4, Math.floor(sampleRate / 880));
    const tauMax = Math.min(Math.floor(windowSize / 2), Math.ceil(sampleRate / 75));
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
      if (yin[tau] < 0.18) {
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
    if (f0 < 75 || f0 > 880) return { f0: 0, rms, confidence: 0 };
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
        if (prevTarget !== null && m === prevTarget) dist -= 0.12;
        if (dist < bestDist) {
          bestDist = dist;
          bestMidi = m;
        }
      }
    }
    return bestMidi;
  }

  function pitchCorrectBuffer(ctx, rawBuffer, opts = {}) {
    const keyRoot = opts.keyRoot ?? 9;
    const scaleName = opts.scaleName || 'minor';
    const strength = Math.max(0, Math.min(1, opts.strength ?? 0.6));
    const retuneSpeed = Math.max(0.05, Math.min(1, opts.retuneSpeed ?? 0.5));

    const sr = rawBuffer.sampleRate;
    const length = rawBuffer.length;
    const numCh = rawBuffer.numberOfChannels;

    const mono = new Float32Array(length);
    for (let c = 0; c < numCh; c++) {
      const ch = rawBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] += ch[i] / numCh;
    }

    const windowSize = 1536;
    const hop = 512;
    const numFrames = Math.max(1, Math.floor((length - windowSize) / hop));
    const frameRatios = new Float32Array(numFrames + 2).fill(1.0);
    const pitchCurve = [];

    let prevTarget = null;
    let smoothedSemis = 0;
    const smoothAlpha = 0.12 + retuneSpeed * 0.78;

    for (let f = 0; f < numFrames; f++) {
      const pos = f * hop;
      const { f0, confidence } = detectPitchFrame(mono, pos, windowSize, sr);
      if (f0 > 0 && confidence > 0.72) {
        const rawMidi = 69 + 12 * Math.log2(f0 / 440);
        const targetMidi = nearestScaleMidi(rawMidi, keyRoot, scaleName, prevTarget);
        prevTarget = targetMidi;
        const rawDelta = Math.max(-2.5, Math.min(2.5, targetMidi - rawMidi));
        smoothedSemis += (rawDelta * strength - smoothedSemis) * smoothAlpha;
        frameRatios[f] = Math.pow(2, smoothedSemis / 12);
        if (f % 2 === 0) pitchCurve.push({ t: pos / sr, rawMidi, tunedMidi: rawMidi + smoothedSemis, voiced: true });
      } else {
        smoothedSemis *= 0.65;
        frameRatios[f] = Math.pow(2, smoothedSemis / 12);
        if (f % 2 === 0) pitchCurve.push({ t: pos / sr, rawMidi: 0, tunedMidi: 0, voiced: false });
      }
    }

    if (strength <= 0.01) return { buffer: rawBuffer, pitchCurve };

    const outBuffer = ctx.createBuffer(numCh, length, sr);
    const grain = Math.round(sr * 0.036);
    const halfGrain = Math.round(grain * 0.5);

    for (let c = 0; c < numCh; c++) {
      const inp = rawBuffer.getChannelData(c);
      const out = outBuffer.getChannelData(c);
      let phi = 0.0;
      for (let n = 0; n < length + halfGrain; n++) {
        const fIdx = Math.min(numFrames - 1, Math.max(0, Math.floor(n / hop)));
        const frac = Math.min(1, Math.max(0, (n - fIdx * hop) / hop));
        const ratio = frameRatios[fIdx] * (1 - frac) + frameRatios[fIdx + 1] * frac;
        phi += (1.0 - ratio) / grain;
        phi -= Math.floor(phi);
        const phi2 = phi + 0.5 >= 1.0 ? phi - 0.5 : phi + 0.5;
        const s1 = Math.sin(Math.PI * phi);
        const w1 = s1 * s1;
        const w2 = 1.0 - w1;
        const r1 = n - phi * grain, r2 = n - phi2 * grain;
        let v1 = 0, v2 = 0;
        if (r1 > 0 && r1 < length - 1) {
          const i1 = Math.floor(r1);
          v1 = inp[i1] * (1 - (r1 - i1)) + inp[i1 + 1] * (r1 - i1);
        }
        if (r2 > 0 && r2 < length - 1) {
          const i2 = Math.floor(r2);
          v2 = inp[i2] * (1 - (r2 - i2)) + inp[i2 + 1] * (r2 - i2);
        }
        const writeIdx = n - halfGrain;
        if (writeIdx >= 0 && writeIdx < length) out[writeIdx] = w1 * v1 + w2 * v2;
      }
    }
    return { buffer: outBuffer, pitchCurve };
  }

  // Stereo Center-Cut Vocal Reducer (Turns ordinary Stereo MP3 songs into instant Karaoke tracks while keeping sub-185Hz Bass & Kick!)
  function centerCutKaraokeBuffer(ctx, srcBuffer) {
    if (!srcBuffer || srcBuffer.numberOfChannels < 2) return srcBuffer;
    const sr = srcBuffer.sampleRate;
    const len = srcBuffer.length;
    const L = srcBuffer.getChannelData(0);
    const R = srcBuffer.getChannelData(1);
    const out = ctx.createBuffer(2, len, sr);
    const outL = out.getChannelData(0);
    const outR = out.getChannelData(1);

    let bassLp = 0;
    const alpha = (2 * Math.PI * 185) / (sr + 2 * Math.PI * 185);
    for (let i = 0; i < len; i++) {
      const mid = (L[i] + R[i]) * 0.5;
      const side = (L[i] - R[i]) * 0.5;
      bassLp += alpha * (mid - bassLp);
      outL[i] = (bassLp * 1.15 + side * 1.18);
      outR[i] = (bassLp * 1.15 - side * 1.18);
    }
    return out;
  }

  function transposeBuffer(ctx, srcBuffer, semitones) {
    if (!srcBuffer || semitones === 0) return srcBuffer;
    const ratio = Math.pow(2, semitones / 12);
    const sr = srcBuffer.sampleRate;
    const length = srcBuffer.length;
    const numCh = srcBuffer.numberOfChannels;
    const outBuffer = ctx.createBuffer(numCh, length, sr);
    const grain = Math.round(sr * 0.046);
    const halfGrain = Math.round(grain * 0.5);

    for (let c = 0; c < numCh; c++) {
      const inp = srcBuffer.getChannelData(c);
      const out = outBuffer.getChannelData(c);
      let phi = 0.0;
      const dPhi = (1.0 - ratio) / grain;
      for (let n = 0; n < length + halfGrain; n++) {
        phi += dPhi;
        phi -= Math.floor(phi);
        const phi2 = phi + 0.5 >= 1.0 ? phi - 0.5 : phi + 0.5;
        const s1 = Math.sin(Math.PI * phi);
        const w1 = s1 * s1;
        const w2 = 1.0 - w1;
        const r1 = n - phi * grain, r2 = n - phi2 * grain;
        let v1 = 0, v2 = 0;
        if (r1 > 0 && r1 < length - 1) {
          const i1 = Math.floor(r1);
          v1 = inp[i1] * (1 - (r1 - i1)) + inp[i1 + 1] * (r1 - i1);
        }
        if (r2 > 0 && r2 < length - 1) {
          const i2 = Math.floor(r2);
          v2 = inp[i2] * (1 - (r2 - i2)) + inp[i2 + 1] * (r2 - i2);
        }
        const writeIdx = n - halfGrain;
        if (writeIdx >= 0 && writeIdx < length) out[writeIdx] = w1 * v1 + w2 * v2;
      }
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
      if (abs > 0.01) {
        sumSq += s * s;
        activeSamples++;
      }
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
    pcCounts.forEach((cnt, idx) => {
      if (cnt > bestCount) { bestCount = cnt; dominantNote = idx; }
    });

    const rms = activeSamples > 0 ? Math.sqrt(sumSq / activeSamples) : 0.08;
    const crestDb = 20 * Math.log10(Math.max(peak, 0.001) / Math.max(rms, 0.0005));
    const mudRatio = lowEnergy / Math.max(highEnergy, 1e-6);

    let registerEn = 'Warm Mid-Range Vocal (Tenor / Alto)';
    let registerSi = 'මධ්‍යම පරාසයේ උණුසුම් හඬක් (Warm Tenor / Alto)';
    if (medianF0 < 155) {
      registerEn = 'Deep Rich Vocal (Baritone / Bass)';
      registerSi = 'ගැඹුරු පිරිපුන් හඬක් (Deep Baritone)';
    } else if (medianF0 > 245) {
      registerEn = 'Bright Upper Register (High Tenor / Soprano)';
      registerSi = 'ඉහළ මිහිරි පරාසයේ හඬක් (Bright Soprano)';
    }

    let toneNoteEn = '', toneNoteSi = '', recommendedPreset = 'sinhala_ballad';
    const customTweak = {};

    if (mudRatio > 6.5) {
      recommendedPreset = 'phone_rescue';
      toneNoteEn = 'Detected low-mid room boxiness — carved 280Hz mud (-3.4dB) and lifted 10.5kHz condenser sheen.';
      toneNoteSi = 'Phone Mic බොඳ ගතිය හඳුනාගත් නිසා 280Hz අඩු කර Studio දීප්තිය වැඩි කරන ලදී.';
      customTweak.warmthDb = -3.4; customTweak.airDb = 4.6; customTweak.presenceDb = 4.2;
    } else if (mudRatio < 1.8) {
      recommendedPreset = 'sinhala_ballad';
      toneNoteEn = 'Bright vocal transient profile — added tube body (+2.2dB @ 280Hz), velvet plate & smooth de-essing.';
      toneNoteSi = 'දීප්තිමත් හඬ පරාසයට උණුසුම් බව (+2.2dB) සහ මෘදු Plate Reverb එක් කරන ලදී.';
      customTweak.warmthDb = 2.2; customTweak.deEssDb = -3.8;
    } else {
      recommendedPreset = medianF0 > 235 ? 'smule_hall' : 'pop_radio';
      toneNoteEn = 'Balanced harmonic spectrum — applied radio compression, presence focus & stereo space.';
      toneNoteSi = 'සමබර හඬ පරාසයකි — Studio Pop පැහැදිලි බව සහ Stereo Echo ස්වයංක්‍රීයව සකස් විය.';
    }

    if (crestDb > 15) { customTweak.compThreshold = -27; customTweak.compRatio = 5.0; }
    if (rms < 0.05) customTweak.vocalGain = 1.45;
    else if (rms > 0.25) customTweak.vocalGain = 0.92;

    return {
      medianHz: Math.round(medianF0),
      suggestedKeyIndex: dominantNote,
      suggestedKeyName: NOTE_NAMES[dominantNote],
      crestDb: crestDb.toFixed(1),
      registerEn, registerSi, toneNoteEn, toneNoteSi,
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

  function createReverbImpulse(ctx, decaySec = 2.4) {
    const sr = ctx.sampleRate;
    const duration = Math.max(0.5, Math.min(4.5, decaySec));
    const length = Math.floor(sr * duration);
    const impulse = ctx.createBuffer(2, length, sr);
    const preDelay = Math.floor(sr * 0.022);
    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      let lp = 0;
      for (let i = preDelay; i < length; i++) {
        const t = (i - preDelay) / (length - preDelay);
        const white = Math.random() * 2 - 1;
        lp = lp * (0.35 + 0.45 * t) + white * (1 - (0.35 + 0.45 * t));
        ch[i] = lp * Math.pow(1 - t, 2.8) * 0.55;
      }
    }
    return impulse;
  }

  function createSoftClipCurve(drive = 1.35) {
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
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;
      nodes.masterAnalyser = analyser;
    }

    if (params.autoMaster) {
      const mp = MASTER_PROFILES[params.masterProfile] || MASTER_PROFILES.balanced;
      const subCut = ctx.createBiquadFilter();
      subCut.type = 'highpass'; subCut.frequency.value = 32;

      const lowGlue = ctx.createBiquadFilter();
      lowGlue.type = 'lowshelf'; lowGlue.frequency.value = 95; lowGlue.gain.value = mp.lowDb;

      const highSheen = ctx.createBiquadFilter();
      highSheen.type = 'highshelf'; highSheen.frequency.value = 11500; highSheen.gain.value = mp.highDb;

      const shaper = ctx.createWaveShaper();
      shaper.curve = createSoftClipCurve(mp.drive);
      shaper.oversample = '2x';

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = mp.thresh;
      limiter.knee.value = 4; limiter.ratio.value = 20;
      limiter.attack.value = 0.001; limiter.release.value = 0.09;

      const ceiling = ctx.createGain();
      ceiling.gain.value = mp.ceiling;

      masterInput.connect(subCut);
      subCut.connect(lowGlue);
      lowGlue.connect(highSheen);
      highSheen.connect(shaper);
      shaper.connect(limiter);
      limiter.connect(ceiling);
      if (nodes.masterAnalyser) {
        ceiling.connect(nodes.masterAnalyser);
        nodes.masterAnalyser.connect(dest);
      } else {
        ceiling.connect(dest);
      }
    } else {
      if (nodes.masterAnalyser) {
        masterInput.connect(nodes.masterAnalyser);
        nodes.masterAnalyser.connect(dest);
      } else {
        masterInput.connect(dest);
      }
    }

    if (buffers.backing && !params.muteBacking) {
      const bSrc = ctx.createBufferSource();
      bSrc.buffer = buffers.backing;
      const pocketEq = ctx.createBiquadFilter();
      pocketEq.type = 'peaking'; pocketEq.frequency.value = 2500; pocketEq.Q.value = 0.9;
      pocketEq.gain.value = params.vocalPocket ? -2.4 : 0;

      const bGain = ctx.createGain();
      bGain.gain.value = params.soloVocal ? 0 : (params.backingGain ?? 0.85);

      bSrc.connect(pocketEq);
      pocketEq.connect(bGain);
      bGain.connect(masterInput);
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
        vSrc.connect(rawGain);
        rawGain.connect(masterInput);
        nodes.vocalGain = rawGain;
      } else {
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = params.hpFreq ?? 95;
        const warmth = ctx.createBiquadFilter(); warmth.type = 'peaking'; warmth.frequency.value = 280; warmth.Q.value = 1.1; warmth.gain.value = params.warmthDb ?? 0;
        const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3600; presence.Q.value = 1.0; presence.gain.value = params.presenceDb ?? 3.0;
        const deEss = ctx.createBiquadFilter(); deEss.type = 'peaking'; deEss.frequency.value = 6800; deEss.Q.value = 2.2; deEss.gain.value = params.deEssDb ?? -2.5;
        const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 10500; air.gain.value = params.airDb ?? 3.5;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = params.compThreshold ?? -24;
        comp.knee.value = 18; comp.ratio.value = params.compRatio ?? 4.0;
        comp.attack.value = 0.006; comp.release.value = 0.16;

        const makeupDb = Math.max(0, (-(params.compThreshold ?? -24) - 12) * (1 - 1 / (params.compRatio ?? 4)) * 0.42);
        const makeup = ctx.createGain(); makeup.gain.value = Math.pow(10, makeupDb / 20);

        const delay = ctx.createDelay(1.5); delay.delayTime.value = Math.max(0.05, Math.min(1.0, params.delayTimeSec ?? 0.32));
        const dFeedback = ctx.createGain(); dFeedback.gain.value = Math.min(0.65, Math.max(0, params.delayFeedback ?? 0.25));
        const dFilter = ctx.createBiquadFilter(); dFilter.type = 'lowpass'; dFilter.frequency.value = 2800;
        const dWet = ctx.createGain(); dWet.gain.value = params.delayMix ?? 0.18;

        const convolver = ctx.createConvolver(); convolver.buffer = createReverbImpulse(ctx, params.reverbDecay ?? 2.5);
        const revHp = ctx.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 220;
        const rWet = ctx.createGain(); rWet.gain.value = params.reverbMix ?? 0.28;

        const vOut = ctx.createGain(); vOut.gain.value = params.vocalGain ?? 1.15;

        vSrc.connect(hp); hp.connect(warmth); warmth.connect(presence); presence.connect(deEss);
        deEss.connect(air); air.connect(comp); comp.connect(makeup);
        makeup.connect(vOut);

        makeup.connect(delay); delay.connect(dFilter); dFilter.connect(dFeedback); dFeedback.connect(delay);
        dFilter.connect(dWet); dWet.connect(vOut);

        makeup.connect(convolver); convolver.connect(revHp); revHp.connect(rWet); rWet.connect(vOut);
        vOut.connect(masterInput);

        Object.assign(nodes, { hp, warmth, presence, deEss, air, comp, makeup, delay, dFeedback, dWet, rWet, vocalGain: vOut });
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
    const vDur = buffers.rawVocal ? buffers.rawVocal.duration + Math.max(0, offsetSec) + 1.6 : 0;
    const totalDur = Math.max(bDur, vDur, 1);
    const offline = new OfflineAudioContext(2, Math.ceil(totalDur * sampleRate), sampleRate);
    buildStudioGraph(offline, buffers, params, 0);
    return offline.startRendering();
  }

  async function renderMasterWav(buffers, params, compact = false) {
    // compact mode renders crisp 24kHz Mono/Stereo lightweight share file (~3.5x smaller for instant WhatsApp sharing!)
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

    writeStr(0, 'RIFF');
    view.setUint32(4, length - 8, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * numCh * 2, true);
    view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, buffer.length * numCh * 2, true);

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
    const bpm = 92;
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

      const padEnv = Math.exp(-posInBar * 0.85) * Math.min(1, posInBar * 35);
      let padL = 0, padR = 0;
      chord.notes.forEach((f, idx) => {
        const s = Math.sin(2 * Math.PI * f * t) * 0.7 + Math.sin(4 * Math.PI * f * t) * 0.2;
        padL += s * (idx % 2 === 0 ? 0.11 : 0.06) * padEnv;
        padR += s * (idx % 2 === 1 ? 0.11 : 0.06) * padEnv;
      });

      const eighthSec = beatSec / 2;
      const eighthIdx = Math.floor(t / eighthSec);
      const arpT = t - eighthIdx * eighthSec;
      const arpFreq = chord.notes[eighthIdx % 4];
      const arpEnv = Math.exp(-arpT * 7.5) * Math.min(1, arpT * 120);
      const arp = (Math.sin(2 * Math.PI * arpFreq * t) + 0.45 * Math.sin(4 * Math.PI * arpFreq * t)) * arpEnv * 0.11;

      const bassEnv = Math.exp(-posInBeat * 3.8) * (beatIdx % 2 === 0 ? 1 : 0.45);
      const bass = (Math.sin(2 * Math.PI * chord.root * t) + 0.3 * Math.sin(4 * Math.PI * chord.root * t)) * bassEnv * 0.24;

      let drum = 0;
      if (beatIdx % 2 === 0 && posInBeat < 0.18) {
        const kFreq = 54 + 115 * Math.exp(-posInBeat * 34);
        drum += Math.sin(2 * Math.PI * kFreq * posInBeat) * Math.exp(-posInBeat * 16) * 0.32;
      }
      if (beatIdx % 2 === 1 && posInBeat < 0.12) {
        const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
        drum += (noise * 0.55 + Math.sin(2 * Math.PI * 390 * posInBeat) * 0.45) * Math.exp(-posInBeat * 28) * 0.18;
      }

      L[i] = padL + arp * 1.15 + bass + drum;
      R[i] = padR + arp * 0.85 + bass + drum;
    }

    const vocal = ctx.createBuffer(1, len, sr);
    const V = vocal.getChannelData(0);
    const melody = [
      { startBeat: 1.0, durBeats: 1.4, midi: 69, err: +0.38 },
      { startBeat: 2.5, durBeats: 1.3, midi: 72, err: -0.44 },
      { startBeat: 4.0, durBeats: 2.2, midi: 71, err: +0.34 },
      { startBeat: 6.5, durBeats: 1.3, midi: 69, err: -0.35 },
      { startBeat: 8.0, durBeats: 1.5, midi: 67, err: +0.42 },
      { startBeat: 9.5, durBeats: 1.4, midi: 72, err: -0.40 },
      { startBeat: 11.0, durBeats: 2.6, midi: 74, err: +0.45 },
      { startBeat: 14.0, durBeats: 1.8, midi: 72, err: -0.32 },
      { startBeat: 16.0, durBeats: 1.5, midi: 71, err: +0.38 },
      { startBeat: 17.5, durBeats: 1.4, midi: 67, err: -0.36 },
      { startBeat: 19.0, durBeats: 3.6, midi: 69, err: +0.40 },
    ];

    const micLagSec = 0.120;
    let phase = 0, f1y1 = 0, f1y2 = 0, f2y1 = 0, f2y2 = 0;
    const designBp = (fc, bw) => {
      const r = Math.exp((-Math.PI * bw) / sr);
      return { c1: 2 * r * Math.cos((2 * Math.PI * fc) / sr), c2: -(r * r), g: 1 - r };
    };
    const form1 = designBp(730, 110), form2 = designBp(1180, 150);

    for (const note of melody) {
      const tStart = note.startBeat * beatSec + micLagSec;
      const tEnd = Math.min(dur - 0.05, tStart + note.durBeats * beatSec);
      const iStart = Math.max(0, Math.floor(tStart * sr));
      const iEnd = Math.min(len, Math.floor(tEnd * sr));
      for (let i = iStart; i < iEnd; i++) {
        const localT = (i - iStart) / sr;
        const noteDur = (iEnd - iStart) / sr;
        const vibrato = 0.08 * Math.sin(2 * Math.PI * 5.4 * localT) * Math.min(1, localT * 2.2);
        const glide = -0.35 * Math.exp(-localT * 14);
        const midiNow = (note.midi - 12) + note.err + vibrato + glide;
        const freq = 440 * Math.pow(2, (midiNow - 69) / 12);
        phase += freq / sr; phase -= Math.floor(phase);
        const glottal =
          Math.sin(2 * Math.PI * phase) * 0.55 + Math.sin(4 * Math.PI * phase) * 0.30 +
          Math.sin(6 * Math.PI * phase) * 0.18 + Math.sin(8 * Math.PI * phase) * 0.10 +
          Math.sin(10 * Math.PI * phase) * 0.06;
        const y1 = form1.g * glottal + form1.c1 * f1y1 + form1.c2 * f1y2; f1y2 = f1y1; f1y1 = y1;
        const y2 = form2.g * glottal + form2.c1 * f2y1 + form2.c2 * f2y2; f2y2 = f2y1; f2y1 = y2;
        const attack = Math.min(1, localT / 0.045);
        const release = Math.min(1, (noteDur - localT) / 0.09);
        V[i] += (glottal * 0.22 + y1 * 0.52 + y2 * 0.28) * attack * release * 0.42;
      }
    }

    return { backing, vocal, suggestedKey: 'A', suggestedScale: 'minor' };
  }

  return {
    NOTE_NAMES, SCALES, MASTER_PROFILES, PRESETS,
    detectPitchFrame, pitchCorrectBuffer, centerCutKaraokeBuffer, transposeBuffer,
    analyzeVoiceProfile, estimateSyncOffsetMs, buildStudioGraph, renderMasterWav, generateDemoSession,
  };
})();
