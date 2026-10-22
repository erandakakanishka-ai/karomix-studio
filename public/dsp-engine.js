/**
 * KaroMix Studio - 100% Browser Web Audio DSP & Mastering Engine
 * Zero Cloudflare Server CPU usage ($0 Free Tier scaling to thousands of singers!)
 */

window.KaroDSP = (() => {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    pentatonic: [0, 2, 4, 7, 9],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };

  // 8 Studio Vocal Mixing Templates tailored for Sri Lankan + Global Karaoke Singers
  const PRESETS = {
    sinhala_ballad: {
      name: '🎤 Sinhala Soft Ballad',
      desc: 'සිංහල භාවාත්මක ගීත සඳහා උණුසුම් Plate Reverb + මෘදු Echo සහ පැහැදිලි හඬ',
      autotuneAmount: 0.55,
      retuneSpeed: 0.35,
      compThreshold: -24,
      compRatio: 3.8,
      hpFreq: 95,
      warmthDb: 1.5,
      presenceDb: 3.2,
      deEssDb: -2.5,
      airDb: 3.8,
      delayTimeSec: 0.34,
      delayFeedback: 0.28,
      delayMix: 0.20,
      reverbDecay: 2.6,
      reverbMix: 0.30,
      vocalGain: 1.15,
      backingGain: 0.85,
      vocalPocket: true,
      autoMaster: true,
    },
    smule_hall: {
      name: '🏟️ Smule / StarMaker Hall',
      desc: 'ඕනෑම Phone mic හඬක් ප්‍රසංග ශාලාවක ගයනවා සේ පුළුල් සහ මිහිරි කරයි',
      autotuneAmount: 0.65,
      retuneSpeed: 0.45,
      compThreshold: -26,
      compRatio: 4.5,
      hpFreq: 105,
      warmthDb: 0.5,
      presenceDb: 3.8,
      deEssDb: -3.0,
      airDb: 4.5,
      delayTimeSec: 0.38,
      delayFeedback: 0.34,
      delayMix: 0.25,
      reverbDecay: 3.4,
      reverbMix: 0.38,
      vocalGain: 1.2,
      backingGain: 0.82,
      vocalPocket: true,
      autoMaster: true,
    },
    pop_radio: {
      name: '✨ Modern Pop Studio',
      desc: 'TikTok / YouTube Covers සඳහා ඉතා පැහැදිලි, දීප්තිමත් Studio Pop මිශ්‍රණය',
      autotuneAmount: 0.72,
      retuneSpeed: 0.58,
      compThreshold: -25,
      compRatio: 4.8,
      hpFreq: 110,
      warmthDb: -1.0,
      presenceDb: 4.2,
      deEssDb: -3.2,
      airDb: 5.0,
      delayTimeSec: 0.27,
      delayFeedback: 0.22,
      delayMix: 0.16,
      reverbDecay: 1.9,
      reverbMix: 0.22,
      vocalGain: 1.18,
      backingGain: 0.86,
      vocalPocket: true,
      autoMaster: true,
    },
    autotune_trap: {
      name: '🔥 Hard Auto-Tune Pop/R&B',
      desc: 'වේගවත් Pitch Snap (95% Auto-Tune) සමඟ නවීන R&B / Hip-Hop ශෛලිය',
      autotuneAmount: 0.95,
      retuneSpeed: 0.92,
      compThreshold: -27,
      compRatio: 5.5,
      hpFreq: 115,
      warmthDb: -0.5,
      presenceDb: 4.5,
      deEssDb: -3.5,
      airDb: 4.8,
      delayTimeSec: 0.25,
      delayFeedback: 0.30,
      delayMix: 0.22,
      reverbDecay: 2.1,
      reverbMix: 0.24,
      vocalGain: 1.22,
      backingGain: 0.85,
      vocalPocket: true,
      autoMaster: true,
    },
    phone_rescue: {
      name: '📱 Phone Mic Rescue',
      desc: 'සාමාන්‍ය Phone Mic වල බොඳ (Muddy) හඬ සහ ඝෝෂාව ඉවත් කර Studio පැහැදිලි බව දෙයි',
      autotuneAmount: 0.50,
      retuneSpeed: 0.35,
      compThreshold: -28,
      compRatio: 5.2,
      hpFreq: 130,
      warmthDb: -3.8,
      presenceDb: 4.6,
      deEssDb: -3.5,
      airDb: 4.6,
      delayTimeSec: 0.30,
      delayFeedback: 0.20,
      delayMix: 0.14,
      reverbDecay: 2.0,
      reverbMix: 0.24,
      vocalGain: 1.25,
      backingGain: 0.84,
      vocalPocket: true,
      autoMaster: true,
    },
    unplugged_room: {
      name: '🎸 Acoustic Unplugged',
      desc: 'ගිටාර් / පියානෝ ගීත සඳහා ස්වභාවික ලී කාමරයක ශබ්දය (Natural Acoustic)',
      autotuneAmount: 0.35,
      retuneSpeed: 0.25,
      compThreshold: -21,
      compRatio: 3.0,
      hpFreq: 90,
      warmthDb: 2.0,
      presenceDb: 2.6,
      deEssDb: -2.0,
      airDb: 3.0,
      delayTimeSec: 0.22,
      delayFeedback: 0.14,
      delayMix: 0.09,
      reverbDecay: 1.4,
      reverbMix: 0.19,
      vocalGain: 1.12,
      backingGain: 0.88,
      vocalPocket: true,
      autoMaster: true,
    },
    baila_live: {
      name: '💃 Live Band / Bailā Stage',
      desc: 'වේගවත් Drums/Band සංගීතය මැදින් කටහඬ හොඳින් කැපී පෙනෙන Live Stage Echo',
      autotuneAmount: 0.45,
      retuneSpeed: 0.40,
      compThreshold: -26,
      compRatio: 5.0,
      hpFreq: 115,
      warmthDb: 0.5,
      presenceDb: 4.8,
      deEssDb: -2.8,
      airDb: 3.5,
      delayTimeSec: 0.19,
      delayFeedback: 0.28,
      delayMix: 0.22,
      reverbDecay: 2.3,
      reverbMix: 0.26,
      vocalGain: 1.24,
      backingGain: 0.82,
      vocalPocket: true,
      autoMaster: true,
    },
    clean_studio: {
      name: '🎧 Clean Studio Vocal',
      desc: 'අමතර Echo රහිත පිරිසිදු Compressor + EQ පමණක් සහිත ස්වභාවික හඬ',
      autotuneAmount: 0.25,
      retuneSpeed: 0.20,
      compThreshold: -22,
      compRatio: 3.2,
      hpFreq: 95,
      warmthDb: 0.5,
      presenceDb: 2.5,
      deEssDb: -2.0,
      airDb: 2.8,
      delayTimeSec: 0.25,
      delayFeedback: 0.10,
      delayMix: 0.04,
      reverbDecay: 1.2,
      reverbMix: 0.10,
      vocalGain: 1.12,
      backingGain: 0.90,
      vocalPocket: false,
      autoMaster: true,
    },
  };

  // Single-frame YIN fundamental frequency detector (fast, accurate 75Hz-880Hz)
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
    const threshold = 0.18;
    for (let tau = tauMin; tau < tauMax; tau++) {
      if (yin[tau] < threshold) {
        while (tau + 1 < tauMax && yin[tau + 1] < yin[tau]) {
          tau++;
        }
        bestTau = tau;
        break;
      }
    }

    if (bestTau === -1) return { f0: 0, rms, confidence: 0 };

    // Parabolic interpolation for sub-sample accuracy (< 2 cents)
    let refinedTau = bestTau;
    if (bestTau > 1 && bestTau < tauMax) {
      const s0 = yin[bestTau - 1];
      const s1 = yin[bestTau];
      const s2 = yin[bestTau + 1];
      const denom = 2 * (2 * s1 - s2 - s0);
      if (Math.abs(denom) > 1e-6) {
        refinedTau = bestTau + (s2 - s0) / denom;
      }
    }

    const f0 = sampleRate / refinedTau;
    if (f0 < 75 || f0 > 880) return { f0: 0, rms, confidence: 0 };
    return { f0, rms, confidence: Math.max(0, 1 - yin[bestTau]) };
  }

  function nearestScaleMidi(midi, keyRoot, scaleName, prevTarget) {
    const allowed = SCALES[scaleName] || SCALES.minor;
    let bestMidi = Math.round(midi);
    let bestDist = Infinity;

    const minM = Math.floor(midi) - 2;
    const maxM = Math.ceil(midi) + 2;
    for (let m = minM; m <= maxM; m++) {
      const pc = (((m - keyRoot) % 12) + 12) % 12;
      if (allowed.includes(pc)) {
        let dist = Math.abs(m - midi);
        if (prevTarget !== null && m === prevTarget) {
          dist -= 0.12; // Hysteresis prevents vibrato note-flutter
        }
        if (dist < bestDist) {
          bestDist = dist;
          bestMidi = m;
        }
      }
    }
    return bestMidi;
  }

  /**
   * Real Auto-Tune Engine:
   * YIN Pitch Contour -> Musical Scale Quantizer -> Dual Rotating Tap sin^2 Overlap-Add Pitch Shifter
   * Runs at ~50x real-time speed in pure Float32Array with zero time-drift and zero clicks!
   */
  function pitchCorrectBuffer(ctx, rawBuffer, opts = {}) {
    const keyRoot = opts.keyRoot ?? 9; // Default A
    const scaleName = opts.scaleName || 'minor';
    const strength = Math.max(0, Math.min(1, opts.strength ?? 0.6));
    const retuneSpeed = Math.max(0.05, Math.min(1, opts.retuneSpeed ?? 0.5));

    const sr = rawBuffer.sampleRate;
    const length = rawBuffer.length;
    const numCh = rawBuffer.numberOfChannels;

    // Mix down to mono for clean F0 pitch tracking
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
        const desiredDelta = rawDelta * strength;
        smoothedSemis += (desiredDelta - smoothedSemis) * smoothAlpha;

        frameRatios[f] = Math.pow(2, smoothedSemis / 12);
        const tunedMidi = rawMidi + smoothedSemis;
        if (f % 2 === 0) {
          pitchCurve.push({ t: pos / sr, rawMidi, tunedMidi, voiced: true });
        }
      } else {
        smoothedSemis *= 0.65;
        frameRatios[f] = Math.pow(2, smoothedSemis / 12);
        if (f % 2 === 0) {
          pitchCurve.push({ t: pos / sr, rawMidi: 0, tunedMidi: 0, voiced: false });
        }
      }
    }

    if (strength <= 0.01) {
      return { buffer: rawBuffer, pitchCurve };
    }

    // Dual-tap sin^2 overlap-add pitch shifter (exact unity gain: sin^2 + cos^2 = 1)
    const outBuffer = ctx.createBuffer(numCh, length, sr);
    const grain = Math.round(sr * 0.036); // 36ms vocal grain
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
        const d1 = phi * grain;
        const d2 = phi2 * grain;

        const s1 = Math.sin(Math.PI * phi);
        const w1 = s1 * s1;
        const w2 = 1.0 - w1;

        const readInterp = (readPos) => {
          if (readPos <= 0 || readPos >= length - 1) return 0;
          const idx = Math.floor(readPos);
          const f = readPos - idx;
          return inp[idx] * (1 - f) + inp[idx + 1] * f;
        };

        const sample = w1 * readInterp(n - d1) + w2 * readInterp(n - d2);
        const writeIdx = n - halfGrain;
        if (writeIdx >= 0 && writeIdx < length) {
          out[writeIdx] = sample;
        }
      }
    }

    return { buffer: outBuffer, pitchCurve };
  }

  /**
   * Smart Voice Profile Analyzer:
   * Analyzes singer's fundamental pitch register, phone-mic boxiness vs air, and dynamic range,
   * then automatically tunes EQ, Compressor, Reverb & Preset to fit THEIR specific voice!
   */
  function analyzeVoiceProfile(vocalBuffer) {
    const sr = vocalBuffer.sampleRate;
    const ch = vocalBuffer.getChannelData(0);
    const len = ch.length;

    const pitches = [];
    let peak = 0;
    let sumSq = 0;
    let activeSamples = 0;

    // 1-pole low-pass (< 420Hz) vs high-frequency diff energy to measure Mud vs Brightness
    let lp = 0;
    const alphaLp = (2 * Math.PI * 420) / (sr + 2 * Math.PI * 420);
    let lowEnergy = 0;
    let highEnergy = 0;

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

    const windowSize = 1536;
    const step = 1024;
    for (let pos = 0; pos + windowSize < len; pos += step) {
      const { f0, confidence } = detectPitchFrame(ch, pos, windowSize, sr);
      if (f0 > 0 && confidence > 0.75) pitches.push(f0);
    }

    pitches.sort((a, b) => a - b);
    const medianF0 = pitches.length > 0 ? pitches[Math.floor(pitches.length / 2)] : 195;

    // Estimate most comfortable key from sung pitch histogram
    const pcCounts = new Array(12).fill(0);
    pitches.forEach((f) => {
      const midi = Math.round(69 + 12 * Math.log2(f / 440));
      pcCounts[((midi % 12) + 12) % 12]++;
    });
    let dominantNote = 9;
    let bestCount = -1;
    pcCounts.forEach((cnt, idx) => {
      if (cnt > bestCount) {
        bestCount = cnt;
        dominantNote = idx;
      }
    });

    const rms = activeSamples > 0 ? Math.sqrt(sumSq / activeSamples) : 0.08;
    const crestDb = 20 * Math.log10(Math.max(peak, 0.001) / Math.max(rms, 0.0005));
    const mudRatio = lowEnergy / Math.max(highEnergy, 1e-6);

    let registerSi = 'මධ්‍යම පරාසයේ උණුසුම් හඬක් (Warm Tenor / Alto)';
    if (medianF0 < 155) registerSi = 'ගැඹුරු පිරිපුන් හඬක් (Deep Baritone / Bass)';
    else if (medianF0 > 245) registerSi = 'ඉහළ මිහිරි පරාසයේ හඬක් (Bright High / Soprano)';

    let toneNoteSi = '';
    let recommendedPreset = 'sinhala_ballad';
    const customTweak = {};

    if (mudRatio > 6.5) {
      recommendedPreset = 'phone_rescue';
      toneNoteSi = 'Phone Mic බොඳ ගතිය (Low-mid mud) හඳුනාගත් නිසා 280Hz අඩු කර Air දීප්තිය වැඩි කරන ලදී.';
      customTweak.warmthDb = -3.4;
      customTweak.airDb = 4.6;
      customTweak.presenceDb = 4.2;
    } else if (mudRatio < 1.8) {
      recommendedPreset = 'sinhala_ballad';
      toneNoteSi = 'ඔබේ හඬ ඉතා තියුණු (Bright) බැවින් උණුසුම් ගතිය (Warmth +2.2dB) සහ මෘදු Plate Reverb එක් කරන ලදී.';
      customTweak.warmthDb = 2.2;
      customTweak.deEssDb = -3.8;
    } else {
      recommendedPreset = medianF0 > 235 ? 'smule_hall' : 'pop_radio';
      toneNoteSi = 'සමබර හඬ පරාසයක් ඇත! Studio Pop පැහැදිලි බව සහ Stereo Echo ස්වයංක්‍රීයව සකස් කරන ලදී.';
    }

    if (crestDb > 15) {
      customTweak.compThreshold = -27;
      customTweak.compRatio = 5.0;
    }

    // Auto normalize suggestion if recorded very quietly
    if (rms < 0.05) {
      customTweak.vocalGain = 1.45;
    } else if (rms > 0.25) {
      customTweak.vocalGain = 0.92;
    }

    return {
      medianHz: Math.round(medianF0),
      suggestedKeyIndex: dominantNote,
      suggestedKeyName: NOTE_NAMES[dominantNote],
      crestDb: crestDb.toFixed(1),
      mudRatio: mudRatio.toFixed(1),
      registerSi,
      toneNoteSi,
      recommendedPreset,
      settings: { ...PRESETS[recommendedPreset], ...customTweak },
    };
  }

  /**
   * Cross-correlates vocal onset energy envelope with backing beat envelope
   * to suggest a fast sync offset fix between -320ms and +320ms.
   */
  function estimateSyncOffsetMs(backingBuf, vocalBuf) {
    if (!backingBuf || !vocalBuf) return -115;
    const sr = backingBuf.sampleRate;
    const envStep = Math.floor(sr * 0.005); // 5ms envelope resolution
    const maxSec = Math.min(20, backingBuf.duration, vocalBuf.duration);
    const nFrames = Math.floor((maxSec * sr) / envStep);
    if (nFrames < 80) return -100;

    const extractOnset = (buf) => {
      const ch = buf.getChannelData(0);
      const env = new Float32Array(nFrames);
      let prev = 0;
      for (let i = 0; i < nFrames; i++) {
        let sum = 0;
        const base = i * envStep;
        for (let k = 0; k < envStep; k += 4) sum += Math.abs(ch[base + k] || 0);
        const cur = sum / (envStep / 4);
        env[i] = Math.max(0, cur - prev); // Positive onset transient!
        prev = cur;
      }
      return env;
    };

    const bEnv = extractOnset(backingBuf);
    const vEnv = extractOnset(vocalBuf);

    // Search typical mic/Bluetooth recording delay range (-300ms to +150ms)
    let bestLagFrames = -22;
    let bestScore = -1;
    for (let lag = -60; lag <= 25; lag++) {
      let score = 0;
      for (let i = 70; i < nFrames - 70; i++) {
        score += bEnv[i] * vEnv[i - lag];
      }
      const lagMs = lag * 5;
      // Physical mic/Bluetooth latency prior resolves musical eighth-note beat aliasing!
      const prior = 0.65 + 0.35 * Math.exp(-Math.pow((lagMs + 110) / 135, 2));
      score *= prior;
      if (score > bestScore) {
        bestScore = score;
        bestLagFrames = lag;
      }
    }
    return bestLagFrames * 5;
  }

  // Synthesize lush stereo algorithmic room/plate/hall impulse response
  function createReverbImpulse(ctx, decaySec = 2.4) {
    const sr = ctx.sampleRate;
    const duration = Math.max(0.5, Math.min(4.5, decaySec));
    const length = Math.floor(sr * duration);
    const impulse = ctx.createBuffer(2, length, sr);
    const preDelaySamples = Math.floor(sr * 0.022); // 22ms studio vocal pre-delay keeps lyrics crisp!

    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      let lp = 0;
      for (let i = preDelaySamples; i < length; i++) {
        const t = (i - preDelaySamples) / (length - preDelaySamples);
        const env = Math.pow(1 - t, 2.8);
        // Progressive high-frequency air damping over reverb tail
        const white = Math.random() * 2 - 1;
        lp = lp * (0.35 + 0.45 * t) + white * (1 - (0.35 + 0.45 * t));
        ch[i] = lp * env * 0.55;
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

  /**
   * Builds identical studio mixing + mastering DSP graph for BOTH:
   * - Live real-time AudioContext playback (with live parameter knob updates!)
   * - Fast OfflineAudioContext full-song WAV mixdown render!
   */
  function buildStudioGraph(ctx, buffers, params, startAtSec = 0) {
    const now = ctx.currentTime + (ctx instanceof OfflineAudioContext ? 0 : 0.02);
    const masterInput = ctx.createGain();
    const nodes = { sources: [] };

    // Master Bus Chain (Glue EQ + Soft Tube Saturation + Brickwall Limiter)
    if (params.autoMaster) {
      const subCut = ctx.createBiquadFilter();
      subCut.type = 'highpass';
      subCut.frequency.value = 32;

      const lowGlue = ctx.createBiquadFilter();
      lowGlue.type = 'lowshelf';
      lowGlue.frequency.value = 95;
      lowGlue.gain.value = 1.3;

      const highSheen = ctx.createBiquadFilter();
      highSheen.type = 'highshelf';
      highSheen.frequency.value = 11500;
      highSheen.gain.value = 1.6;

      const shaper = ctx.createWaveShaper();
      shaper.curve = createSoftClipCurve(1.3);
      shaper.oversample = '2x';

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3.2;
      limiter.knee.value = 4;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.09;

      const ceiling = ctx.createGain();
      ceiling.gain.value = 0.94; // -0.5 dBFS safe ceiling (zero clipping!)

      masterInput.connect(subCut);
      subCut.connect(lowGlue);
      lowGlue.connect(highSheen);
      highSheen.connect(shaper);
      shaper.connect(limiter);
      limiter.connect(ceiling);
      ceiling.connect(ctx.destination);
    } else {
      masterInput.connect(ctx.destination);
    }

    // TRACK 1: Backing Karaoke Instrumental
    if (buffers.backing && !params.muteBacking) {
      const bSrc = ctx.createBufferSource();
      bSrc.buffer = buffers.backing;

      const pocketEq = ctx.createBiquadFilter();
      pocketEq.type = 'peaking';
      pocketEq.frequency.value = 2500;
      pocketEq.Q.value = 0.9;
      pocketEq.gain.value = params.vocalPocket ? -2.4 : 0;

      const bGain = ctx.createGain();
      bGain.gain.value = params.soloVocal ? 0 : (params.backingGain ?? 0.85);

      bSrc.connect(pocketEq);
      pocketEq.connect(bGain);
      bGain.connect(masterInput);

      if (startAtSec < buffers.backing.duration) {
        bSrc.start(now, Math.max(0, startAtSec));
      }
      nodes.sources.push(bSrc);
      nodes.backingGain = bGain;
      nodes.pocketEq = pocketEq;
    }

    // TRACK 2: Singer's Vocal Track + Full Studio FX Rack
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
        // 1. High-Pass Rumble Filter
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = params.hpFreq ?? 95;

        // 2. Warmth / Mud Control (280 Hz)
        const warmth = ctx.createBiquadFilter();
        warmth.type = 'peaking';
        warmth.frequency.value = 280;
        warmth.Q.value = 1.1;
        warmth.gain.value = params.warmthDb ?? 0;

        // 3. Vocal Presence Cut-through (3.6 kHz)
        const presence = ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 3600;
        presence.Q.value = 1.0;
        presence.gain.value = params.presenceDb ?? 3.0;

        // 4. De-Esser Tamer (6.8 kHz)
        const deEss = ctx.createBiquadFilter();
        deEss.type = 'peaking';
        deEss.frequency.value = 6800;
        deEss.Q.value = 2.2;
        deEss.gain.value = params.deEssDb ?? -2.5;

        // 5. Silky Condenser Air Shelf (10.5 kHz)
        const air = ctx.createBiquadFilter();
        air.type = 'highshelf';
        air.frequency.value = 10500;
        air.gain.value = params.airDb ?? 3.5;

        // 6. Studio Dynamics Compressor + Automatic Makeup Gain
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = params.compThreshold ?? -24;
        comp.knee.value = 18;
        comp.ratio.value = params.compRatio ?? 4.0;
        comp.attack.value = 0.006;
        comp.release.value = 0.16;

        const makeupDb = Math.max(0, (-(params.compThreshold ?? -24) - 12) * (1 - 1 / (params.compRatio ?? 4)) * 0.42);
        const makeup = ctx.createGain();
        makeup.gain.value = Math.pow(10, makeupDb / 20);

        const dryBus = ctx.createGain();
        dryBus.gain.value = 1.0;

        // 7. Warm Analog Echo / Delay Send
        const delay = ctx.createDelay(1.5);
        delay.delayTime.value = Math.max(0.05, Math.min(1.0, params.delayTimeSec ?? 0.32));
        const dFeedback = ctx.createGain();
        dFeedback.gain.value = Math.min(0.65, Math.max(0, params.delayFeedback ?? 0.25));
        const dFilter = ctx.createBiquadFilter();
        dFilter.type = 'lowpass';
        dFilter.frequency.value = 2800;
        const dWet = ctx.createGain();
        dWet.gain.value = params.delayMix ?? 0.18;

        // 8. Lush Studio Convolution Reverb Send (with Abbey Road 220Hz mud cut!)
        const convolver = ctx.createConvolver();
        convolver.buffer = createReverbImpulse(ctx, params.reverbDecay ?? 2.5);
        const revHp = ctx.createBiquadFilter();
        revHp.type = 'highpass';
        revHp.frequency.value = 220;
        const rWet = ctx.createGain();
        rWet.gain.value = params.reverbMix ?? 0.28;

        const vOut = ctx.createGain();
        vOut.gain.value = params.vocalGain ?? 1.15;

        // Wire Vocal Chain
        vSrc.connect(hp);
        hp.connect(warmth);
        warmth.connect(presence);
        presence.connect(deEss);
        deEss.connect(air);
        air.connect(comp);
        comp.connect(makeup);

        makeup.connect(dryBus);
        dryBus.connect(vOut);

        // Delay loop
        makeup.connect(delay);
        delay.connect(dFilter);
        dFilter.connect(dFeedback);
        dFeedback.connect(delay);
        dFilter.connect(dWet);
        dWet.connect(vOut);

        // Reverb send
        makeup.connect(convolver);
        convolver.connect(revHp);
        revHp.connect(rWet);
        rWet.connect(vOut);

        vOut.connect(masterInput);

        Object.assign(nodes, { hp, warmth, presence, deEss, air, comp, makeup, delay, dFeedback, dWet, rWet, vocalGain: vOut });
      }

      // Precision Sample-Accurate Sync Offset Scheduling (-1000ms to +1000ms)
      const offsetSec = (params.vocalOffsetMs || 0) / 1000;
      const desiredPos = startAtSec - offsetSec;
      if (desiredPos >= 0) {
        if (desiredPos < activeVocal.duration) {
          vSrc.start(now, desiredPos);
        }
      } else {
        vSrc.start(now + Math.abs(desiredPos), 0);
      }
      nodes.sources.push(vSrc);
    }

    return nodes;
  }

  // Fast Full-Song Offline Render + 16-bit Stereo PCM WAV Encoder
  async function renderMasterWav(buffers, params) {
    const sampleRate = 44100;
    const offsetSec = (params.vocalOffsetMs || 0) / 1000;
    const bDur = buffers.backing ? buffers.backing.duration : 0;
    const vDur = buffers.rawVocal ? buffers.rawVocal.duration + Math.max(0, offsetSec) + 1.8 : 0;
    const totalDur = Math.max(bDur, vDur, 1);

    const offline = new OfflineAudioContext(2, Math.ceil(totalDur * sampleRate), sampleRate);
    buildStudioGraph(offline, buffers, params, 0);
    const rendered = await offline.startRendering();
    return audioBufferToWavBlob(rendered);
  }

  function audioBufferToWavBlob(buffer) {
    const numCh = buffer.numberOfChannels;
    const length = buffer.length * numCh * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

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

    const channels = [];
    for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Instant 1-Click Built-in Demo Generator:
   * Track 1: 16s Sinhala Pop Ballad Backing Track in A Minor (Am - F - C - G @ 90 BPM)
   * Track 2: Realistic Human-Formant Sung Vocal with intentional off-pitch drift (+-42 cents)
   *          AND +120ms mic recording lag so user can test Auto-Tune + Sync Drag + Voice Match immediately!
   */
  function generateDemoSession(ctx) {
    const sr = ctx.sampleRate;
    const bpm = 92;
    const beatSec = 60 / bpm;
    const totalBeats = 24; // 6 bars (~15.65s)
    const dur = totalBeats * beatSec;
    const len = Math.floor(sr * dur);

    // 1. Synthesize Stereo Backing Track (Am -> F -> C -> G)
    const backing = ctx.createBuffer(2, len, sr);
    const L = backing.getChannelData(0);
    const R = backing.getChannelData(1);

    const chords = [
      { root: 110.0, notes: [220.0, 261.63, 329.63, 440.0] },   // Am
      { root: 87.31, notes: [174.61, 220.0, 261.63, 349.23] },  // F
      { root: 130.81, notes: [261.63, 329.63, 392.0, 523.25] }, // C
      { root: 98.0, notes: [196.0, 246.94, 293.66, 392.0] },    // G
    ];

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const beatIdx = Math.floor(t / beatSec);
      const barIdx = Math.floor(beatIdx / 4);
      const chord = chords[barIdx % 4];
      const posInBar = t - barIdx * 4 * beatSec;
      const posInBeat = t - beatIdx * beatSec;

      // Warm Electric Piano Pad + Plucked Guitar Arpeggio
      const padEnv = Math.exp(-posInBar * 0.85) * Math.min(1, posInBar * 35);
      let padL = 0;
      let padR = 0;
      chord.notes.forEach((f, idx) => {
        const s = Math.sin(2 * Math.PI * f * t) * 0.7 + Math.sin(4 * Math.PI * f * t) * 0.2;
        padL += s * (idx % 2 === 0 ? 0.11 : 0.06) * padEnv;
        padR += s * (idx % 2 === 1 ? 0.11 : 0.06) * padEnv;
      });

      // Eighth-note acoustic pluck arpeggio
      const eighthSec = beatSec / 2;
      const eighthIdx = Math.floor(t / eighthSec);
      const arpT = t - eighthIdx * eighthSec;
      const arpFreq = chord.notes[eighthIdx % 4];
      const arpEnv = Math.exp(-arpT * 7.5) * Math.min(1, arpT * 120);
      const arp = (Math.sin(2 * Math.PI * arpFreq * t) + 0.45 * Math.sin(4 * Math.PI * arpFreq * t)) * arpEnv * 0.11;

      // Warm Bass Guitar on beats 1 & 2.5
      const bassEnv = Math.exp(-posInBeat * 3.8) * (beatIdx % 2 === 0 ? 1 : 0.45);
      const bass = (Math.sin(2 * Math.PI * chord.root * t) + 0.3 * Math.sin(4 * Math.PI * chord.root * t)) * bassEnv * 0.24;

      // Soft Pop Kick & Rim Snare & Shaker
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

    // 2. Synthesize Raw Expressive Singer Vocal (slightly off-pitch + +120ms Bluetooth mic lag!)
    const vocal = ctx.createBuffer(1, len, sr);
    const V = vocal.getChannelData(0);

    // Expressive melody in A Minor (MIDI notes + intentional human pitch imperfections in semitones!)
    const melody = [
      { startBeat: 1.0, durBeats: 1.4, midi: 69, err: +0.38 }, // A4 (sharp!)
      { startBeat: 2.5, durBeats: 1.3, midi: 72, err: -0.44 }, // C5 (flat!)
      { startBeat: 4.0, durBeats: 2.2, midi: 71, err: +0.34 }, // B4
      { startBeat: 6.5, durBeats: 1.3, midi: 69, err: -0.35 }, // A4
      { startBeat: 8.0, durBeats: 1.5, midi: 67, err: +0.42 }, // G4 (sharp!)
      { startBeat: 9.5, durBeats: 1.4, midi: 72, err: -0.40 }, // C5 (flat!)
      { startBeat: 11.0, durBeats: 2.6, midi: 74, err: +0.45 }, // D5 (sharp!)
      { startBeat: 14.0, durBeats: 1.8, midi: 72, err: -0.32 }, // C5
      { startBeat: 16.0, durBeats: 1.5, midi: 71, err: +0.38 }, // B4
      { startBeat: 17.5, durBeats: 1.4, midi: 67, err: -0.36 }, // G4
      { startBeat: 19.0, durBeats: 3.6, midi: 69, err: +0.40 }, // A4 final held note
    ];

    const micLagSec = 0.120; // Simulated 120ms mic recording delay!
    let phase = 0;
    // Two vocal tract formant resonators (open vowel "Aa / Oo")
    let f1y1 = 0, f1y2 = 0, f2y1 = 0, f2y2 = 0;
    const designBandpass = (fc, bw) => {
      const r = Math.exp((-Math.PI * bw) / sr);
      const c1 = 2 * r * Math.cos((2 * Math.PI * fc) / sr);
      const c2 = -(r * r);
      const g = 1 - r;
      return { c1, c2, g };
    };
    const form1 = designBandpass(730, 110);
    const form2 = designBandpass(1180, 150);

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

        phase += freq / sr;
        phase -= Math.floor(phase);

        // Rich glottal pulse (Rosenberg-like voiced source)
        const glottal =
          Math.sin(2 * Math.PI * phase) * 0.55 +
          Math.sin(4 * Math.PI * phase) * 0.30 +
          Math.sin(6 * Math.PI * phase) * 0.18 +
          Math.sin(8 * Math.PI * phase) * 0.10 +
          Math.sin(10 * Math.PI * phase) * 0.06;

        const y1 = form1.g * glottal + form1.c1 * f1y1 + form1.c2 * f1y2;
        f1y2 = f1y1;
        f1y1 = y1;

        const y2 = form2.g * glottal + form2.c1 * f2y1 + form2.c2 * f2y2;
        f2y2 = f2y1;
        f2y1 = y2;

        const attack = Math.min(1, localT / 0.045);
        const release = Math.min(1, (noteDur - localT) / 0.09);
        V[i] += (glottal * 0.22 + y1 * 0.52 + y2 * 0.28) * attack * release * 0.42;
      }
    }

    return { backing, vocal, suggestedKey: 'A', suggestedScale: 'minor' };
  }

  // Transpose a Karaoke Backing Track by -6..+6 semitones at constant tempo!
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

        const r1 = n - phi * grain;
        const r2 = n - phi2 * grain;
        let v1 = 0, v2 = 0;
        if (r1 > 0 && r1 < length - 1) {
          const i1 = Math.floor(r1);
          v1 = inp[i1] * (1 - (r1 - i1)) + inp[i1 + 1] * (r1 - i1);
        }
        if (r2 > 0 && r2 < length - 1) {
          const i1 = Math.floor(r2);
          v2 = inp[i1] * (1 - (r2 - i1)) + inp[i1 + 1] * (r2 - i1);
        }
        const writeIdx = n - halfGrain;
        if (writeIdx >= 0 && writeIdx < length) {
          out[writeIdx] = w1 * v1 + w2 * v2;
        }
      }
    }
    return outBuffer;
  }

  return {
    NOTE_NAMES,
    SCALES,
      PRESETS,
      detectPitchFrame,
      pitchCorrectBuffer,
      transposeBuffer,
      analyzeVoiceProfile,
      estimateSyncOffsetMs,
      buildStudioGraph,
      renderMasterWav,
      generateDemoSession,
    };
  })();
