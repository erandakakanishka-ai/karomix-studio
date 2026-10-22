/**
 * KaroMix AI v4 — Ultra-Smooth Mobile-First Studio Controller
 * - 0ms UI Freeze (All heavy pitch & SoundTouch DSP isolated in dsp-worker.js)
 * - Synchronous Direct-Gesture iOS/Android Audio Unlock + Pre-Decoded Real Human Vocal Stems
 * - Clean 4-Screen Architecture (Home | Sing | Mix Studio | Library)
 */

const App = (() => {
  const state = {
    view: 'home',
    stageMode: 'video',
    user: null,
    projects: [],
    authToken: localStorage.getItem('karomix_token') || '',
    authMode: 'login',
    isProDemo: localStorage.getItem('karomix_pro_demo') === '1',
    exportsUsed: 0,

    audioCtx: null,
    audioUnlocked: false,
    originalBackingBuffer: null,
    backingBuffer: null,
    rawVocalBuffer: null,
    tunedVocalBuffer: null,
    backingPeaks: null,
    vocalPeaks: null,
    pitchFrames: [],
    pitchScore: 95,
    isDemoSession: false,
    userLoadedBacking: false,
    lastMasterBlob: null,
    lastMasterFilename: 'karomix-master.wav',
    ytPlayer: null,
    ytSyncInterval: null,
    waitingForYtTap: false,

    isPlaying: false,
    playStartCtxTime: 0,
    playOffsetSec: 0,
    pausePositionSec: 0,
    liveNodes: null,
    rafId: null,

    karaokeCutActive: false,
    transposeSemitones: 0,
    karaokeResults: [],
    karaokeIndex: 0,
    lrcLines: [],

    isRecording: false,
    isMonitoring: false,
    micStream: null,
    micAnalyser: null,
    mediaRecorder: null,
    recChunks: [],
    recStartMs: 0,
    recMeterRaf: null,

    activePreset: 'crystal_hd',
    params: {
      ...KaroDSP.PRESETS.crystal_hd,
      vocalOffsetMs: 0,
      scaleKey: 9,
      bypassFx: false,
      soloVocal: false,
    },
  };

  let demoLoadPromise = null;
  const fftBytes = new Uint8Array(512);

  // ==================== iOS / ANDROID SYNCHRONOUS GESTURE UNLOCK ====================
  function ensureAudioCtx() {
    if (!state.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      state.audioCtx = new AC();
    }
    return state.audioCtx;
  }

  function unlockMobileAudioSync() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') {
        navigator.audioSession.type = 'playback';
      }
    } catch (_) {}

    const ctx = ensureAudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (!state.audioUnlocked) {
      try {
        const silent = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = silent;
        src.connect(ctx.destination);
        src.start(0);
        state.audioUnlocked = true;
      } catch (_) {}
    }
    return ctx;
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // ==================== NAVIGATION (CLEAN 4 VIEWS) ====================
  function switchView(view) {
    state.view = view;
    document.querySelectorAll('.app-view').forEach((el) => el.classList.toggle('active', el.id === `view-${view}`));
    document.querySelectorAll('.nav-item, .mob-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (view === 'mix') {
      requestAnimationFrame(() => {
        drawSpectrum();
        drawTimeline();
        drawPitchGraph();
      });
    } else if (view === 'library') {
      refreshServerState();
    }
  }

  function setStageMode(mode) {
    state.stageMode = mode;
    document.getElementById('btnStageVideo').className = mode === 'video' ? 'btn btn-sm btn-cyan' : 'btn btn-sm';
    document.getElementById('btnStageLyrics').className = mode === 'lyrics' ? 'btn btn-sm btn-cyan' : 'btn btn-sm';
    // Keep iframe mounted so mobile browsers never pause YouTube audio when reading lyrics!
    document.getElementById('stageVideoWrap').style.display = 'flex';
    document.getElementById('stageLyricsWrap').style.display = mode === 'lyrics' ? 'block' : 'none';
  }

  // ==================== REAL STUDIO VOCAL + BAND PRELOADER (ZERO FREEZE!) ====================
  async function preloadRealDemoAssets() {
    if (demoLoadPromise) return demoLoadPromise;
    demoLoadPromise = (async () => {
      const ctx = ensureAudioCtx();
      const [irRes, backRes, vocRes] = await Promise.all([
        fetch('/assets/hall-ir.mp3'),
        fetch('/assets/demo-backing.mp3'),
        fetch('/assets/demo-vocal.mp3'),
      ]);
      const [irArr, backArr, vocArr] = await Promise.all([
        irRes.arrayBuffer(),
        backRes.arrayBuffer(),
        vocRes.arrayBuffer(),
      ]);
      const [irBuf, backBuf, vocBuf] = await Promise.all([
        ctx.decodeAudioData(irArr),
        ctx.decodeAudioData(backArr),
        ctx.decodeAudioData(vocArr),
      ]);

      KaroDSP.setHallImpulseBuffer(irBuf);

      if (!state.backingBuffer && !state.rawVocalBuffer) {
        state.originalBackingBuffer = backBuf;
        state.backingBuffer = backBuf;
        state.rawVocalBuffer = vocBuf;
        state.tunedVocalBuffer = vocBuf;
        state.backingPeaks = KaroDSP.computeWaveformPeaks(backBuf, 220);
        state.vocalPeaks = KaroDSP.computeWaveformPeaks(vocBuf, 220);
        state.isDemoSession = true;
        if (state.view === 'mix') drawTimeline();

        KaroDSP.processVocalAsync(ctx, vocBuf, {
          autotuneAmount: 0,
          retuneSpeed: 0.3,
          noiseGate: 0.45,
          scaleKey: 9,
        }).then((res) => {
          if (state.isDemoSession) {
            state.tunedVocalBuffer = res.buffer;
            state.pitchFrames = res.pitchCurve || [];
            state.pitchScore = res.pitchScore || 95;
            updatePitchBadge();
            if (state.view === 'mix') drawPitchGraph();
          }
        }).catch(() => {});
      }
      return { backBuf, vocBuf };
    })().catch((err) => {
      console.warn('Demo preload warning:', err);
      demoLoadPromise = null;
      throw err;
    });
    return demoLoadPromise;
  }

  function updatePitchBadge() {
    const el = document.getElementById('pitchScoreBadge');
    if (el) el.textContent = `Pitch ${state.pitchScore}%`;
  }

  async function toggleHeroDemo() {
    unlockMobileAudioSync();
    if (state.isPlaying) {
      pausePlayback();
      return;
    }
    if (!state.rawVocalBuffer || !state.backingBuffer) {
      document.getElementById('heroPlayText').textContent = 'Loading...';
      await preloadRealDemoAssets();
    }
    startPlayback(state.pausePositionSec);
  }

  async function openMixWithRealDemo() {
    unlockMobileAudioSync();
    switchView('mix');
    if (!state.rawVocalBuffer || !state.backingBuffer) {
      await preloadRealDemoAssets();
    }
    startPlayback(0);
    showToast('Playing real studio vocal & band mix — tap any preset live!');
  }

  async function loadRealSingerDemo(autoPlay = true) {
    unlockMobileAudioSync();
    stopPlaybackInternal();
    state.backingBuffer = null;
    state.rawVocalBuffer = null;
    state.userLoadedBacking = false;
    demoLoadPromise = null;
    await preloadRealDemoAssets();
    document.getElementById('projectTitleInput').value = 'Slow Motion Dream — Studio Mix';
    applyPreset('crystal_hd', false);
    state.pausePositionSec = 0;
    drawTimeline();
    if (autoPlay) startPlayback(0);
    showToast('Loaded real female vocal stem + studio backing band!');
  }

  async function loadInstrumentalDemoForSing() {
    unlockMobileAudioSync();
    await preloadRealDemoAssets();
    state.userLoadedBacking = true;
    showToast('Studio backing band armed — tap Start Recording to sing over it!');
  }

  // ==================== INSTANT LIVE PLAYBACK & RETINA SPECTRUM ====================
  function drawSpectrum() {
    const canvas = document.getElementById('spectrumCanvas');
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.save();
    g.scale(dpr, dpr);
    g.fillStyle = '#060810';
    g.fillRect(0, 0, w, h);

    if (state.liveNodes?.analyser && state.isPlaying) {
      state.liveNodes.analyser.getByteFrequencyData(fftBytes);
    } else {
      fftBytes.fill(0);
    }

    const bars = 46;
    const gap = 3;
    const barW = Math.max(2, (w - gap * (bars + 1)) / bars);
    for (let i = 0; i < bars; i++) {
      const bin = Math.min(fftBytes.length - 1, Math.floor(Math.pow(i / bars, 1.35) * 190) + 1);
      const val = fftBytes[bin] / 255;
      const bh = Math.max(3, val * (h - 10));
      const x = gap + i * (barW + gap);
      const y = h - bh - 4;
      g.fillStyle = val > 0.66 ? '#fbbf24' : '#38bdf8';
      g.fillRect(x, y, barW, bh);
    }
    g.restore();
  }

  function getMasterSignalRms() {
    if (!state.liveNodes?.analyser) return 0;
    const td = new Float32Array(state.liveNodes.analyser.fftSize);
    state.liveNodes.analyser.getFloatTimeDomainData(td);
    let s = 0;
    for (let i = 0; i < td.length; i++) s += td[i] * td[i];
    return Math.sqrt(s / td.length);
  }

  function getTotalDuration() {
    const off = (state.params.vocalOffsetMs || 0) / 1000;
    const bDur = state.backingBuffer ? state.backingBuffer.duration : 0;
    const vDur = state.rawVocalBuffer ? state.rawVocalBuffer.duration + Math.max(0, off) : 0;
    return Math.max(bDur, vDur, 1);
  }

  function getCurrentPlayhead() {
    if (!state.isPlaying || !state.audioCtx) return state.pausePositionSec;
    return state.playOffsetSec + Math.max(0, state.audioCtx.currentTime - state.playStartCtxTime);
  }

  function stopPlaybackInternal() {
    if (state.liveNodes?.sources) {
      state.liveNodes.sources.forEach((s) => { try { s.stop(); } catch (_) {} });
    }
    state.liveNodes = null;
    state.isPlaying = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    updatePlayButtonsUI(false);
    if (state.view === 'mix') drawSpectrum();
  }

  function updatePlayButtonsUI(playing) {
    const heroBtn = document.getElementById('heroPlayText');
    if (heroBtn) heroBtn.textContent = playing ? 'Pause Vocal Demo' : 'Hear Vocal Demo';
    const mixBtn = document.getElementById('playBtnText');
    if (mixBtn) mixBtn.textContent = playing ? 'Pause Mix' : 'Play Mix';
  }

  function startPlayback(fromSec = 0) {
    const ctx = unlockMobileAudioSync();
    stopPlaybackInternal();

    if (!state.backingBuffer && !state.rawVocalBuffer) return;

    const total = getTotalDuration();
    const startSec = fromSec >= total - 0.1 ? 0 : Math.max(0, fromSec);

    state.liveNodes = KaroDSP.buildStudioGraph(
      ctx,
      { backing: state.backingBuffer, rawVocal: state.rawVocalBuffer, tunedVocal: state.tunedVocalBuffer },
      state.params,
      startSec
    );

    state.isPlaying = true;
    state.playStartCtxTime = ctx.currentTime + 0.015;
    state.playOffsetSec = startSec;
    updatePlayButtonsUI(true);

    const tick = () => {
      if (!state.isPlaying) return;
      const pos = getCurrentPlayhead();
      const dur = getTotalDuration();
      const tStr = `${fmtTime(pos)} / ${fmtTime(dur)}`;
      const mixT = document.getElementById('transportTime');
      const heroT = document.getElementById('heroDemoTime');
      if (mixT) mixT.textContent = tStr;
      if (heroT) heroT.textContent = fmtTime(pos);

      if (state.view === 'mix') {
        drawSpectrum();
        drawTimeline(pos);
      }
      if (pos >= dur + 0.15) {
        stopPlaybackInternal();
        state.pausePositionSec = 0;
        if (state.view === 'mix') drawTimeline(0);
        return;
      }
      state.rafId = requestAnimationFrame(tick);
    };
    state.rafId = requestAnimationFrame(tick);
  }

  function pausePlayback() {
    state.pausePositionSec = getCurrentPlayhead();
    stopPlaybackInternal();
  }

  async function togglePlayback() {
    unlockMobileAudioSync();
    if (state.isPlaying) {
      pausePlayback();
      return;
    }
    if (!state.backingBuffer && !state.rawVocalBuffer) {
      await preloadRealDemoAssets();
    }
    startPlayback(state.pausePositionSec);
  }

  function stopAndRewind() {
    stopPlaybackInternal();
    state.pausePositionSec = 0;
    document.getElementById('transportTime').textContent = `00:00 / ${fmtTime(getTotalDuration())}`;
    drawTimeline(0);
  }

  // ==================== ZERO-GLITCH LIVE CONTROLS ====================
  function updateFxButtonsUI() {
    const on = !state.params.bypassFx;
    const label = on ? 'Studio FX: ON' : 'Raw Dry Mic';
    ['btnBypassFx', 'btnHeroFx'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = label;
        el.className = on ? 'btn btn-cyan' : 'btn';
      }
    });
    const sub = document.getElementById('heroDemoSub');
    if (sub) {
      sub.textContent = on
        ? 'Studio Concert Hall + Stereo Doubler ACTIVE'
        : 'Raw dry microphone stem (FX bypassed — hear the difference!)';
    }
  }

  function toggleBypassFx() {
    unlockMobileAudioSync();
    state.params.bypassFx = !state.params.bypassFx;
    updateFxButtonsUI();
    if (state.liveNodes) KaroDSP.applyLiveParamsToGraph(state.liveNodes, state.params);
  }

  function toggleSoloVocal() {
    state.params.soloVocal = !state.params.soloVocal;
    document.getElementById('btnSoloVocal').className = state.params.soloVocal ? 'btn btn-sm btn-amber' : 'btn btn-sm';
    if (state.liveNodes) KaroDSP.applyLiveParamsToGraph(state.liveNodes, state.params);
  }

  function renderPresets() {
    const grid = document.getElementById('presetGrid');
    if (!grid) return;
    grid.innerHTML = Object.entries(KaroDSP.PRESETS).map(([key, p]) => `
      <div class="preset-card ${state.activePreset === key ? 'active' : ''}" onclick="App.applyPreset('${key}', true)">
        <div class="preset-card-tag">${p.tag}</div>
        <div class="preset-card-name">${p.nameEn}</div>
        <div class="preset-card-desc">${p.descEn}</div>
      </div>
    `).join('');
  }

  function applyPreset(key, notify = true) {
    const p = KaroDSP.PRESETS[key];
    if (!p) return;
    state.activePreset = key;
    state.params = { ...state.params, ...p, bypassFx: false };
    updateFxButtonsUI();
    renderPresets();
    syncSlidersFromParams();

    if (state.liveNodes) KaroDSP.applyLiveParamsToGraph(state.liveNodes, state.params);
    if ((p.autotuneAmount || 0) > 0 && state.rawVocalBuffer) {
      applyWorkerAutoTune();
    }
    if (notify) showToast(`Preset active: ${p.nameEn}`);
  }

  function syncSlidersFromParams() {
    const p = state.params;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const txt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('vocalVolSlider', Math.round(p.vocalGain * 100));
    txt('vocalVolVal', `${Math.round(p.vocalGain * 100)}%`);
    set('backingVolSlider', Math.round(p.backingGain * 100));
    txt('backingVolVal', `${Math.round(p.backingGain * 100)}%`);
    set('reverbMixSlider', Math.round(p.reverbMix * 100));
    txt('reverbMixText', `${Math.round(p.reverbMix * 100)}%`);
    set('doublerMixSlider', Math.round((p.doublerMix ?? 0.4) * 100));
    txt('doublerMixText', `${Math.round((p.doublerMix ?? 0.4) * 100)}%`);
    set('delayMixSlider', Math.round(p.delayMix * 100));
    txt('delayMixText', `${Math.round(p.delayMix * 100)}%`);
    set('airSlider', p.airDb);
    txt('airValText', `+${Number(p.airDb).toFixed(1)} dB`);
    const clarityPct = Math.min(100, Math.max(0, Math.round(((p.airDb ?? 5.0) / 6.5) * 100)));
    set('claritySlider', clarityPct);
    txt('clarityValText', `${clarityPct}%`);
    set('atStrength', Math.round((p.autotuneAmount || 0) * 100));
    txt('atStrengthText', `${Math.round((p.autotuneAmount || 0) * 100)}%`);
    set('gateSlider', Math.round((p.noiseGate || 0.55) * 100));
    txt('gateValText', `${Math.round((p.noiseGate || 0.55) * 100)}%`);
    setMasterProfile(p.masterProfile || 'warm', false);
  }

  function setClarityMacro(pct) {
    const n = Number(pct) || 0;
    const ratio = n / 100;
    state.params.mudCutDb = -(1.2 + ratio * 3.4);      // -1.2dB .. -4.6dB surgical 310Hz mud cut
    state.params.presenceDb = 1.6 + ratio * 3.0;       // +1.6dB .. +4.6dB 3.8kHz lyric articulation
    state.params.airDb = 1.5 + ratio * 5.0;            // +1.5dB .. +6.5dB 11kHz condenser air
    state.params.exciterMix = 0.08 + ratio * 0.36;     // subtle Sony C-800G tube harmonic shimmer
    document.getElementById('clarityValText').textContent = `${Math.round(n)}%`;
    document.getElementById('airSlider').value = state.params.airDb.toFixed(1);
    document.getElementById('airValText').textContent = `+${state.params.airDb.toFixed(1)} dB`;
    if (state.liveNodes) KaroDSP.applyLiveParamsToGraph(state.liveNodes, state.params);
  }

  function updateParam(name, val) {
    state.params[name] = val;
    syncSlidersFromParams();
    if (state.liveNodes) KaroDSP.applyLiveParamsToGraph(state.liveNodes, state.params);
  }

  function setMasterProfile(profile, notify = true) {
    state.params.masterProfile = profile;
    ['warm', 'balanced', 'loud'].forEach((k) => {
      const btn = document.getElementById(`mp-${k}`);
      if (btn) btn.className = k === profile ? 'btn btn-sm btn-amber' : 'btn btn-sm';
    });
    if (state.liveNodes) KaroDSP.applyLiveParamsToGraph(state.liveNodes, state.params);
    if (notify) showToast(`Master tone: ${profile.toUpperCase()}`);
  }

  function setVocalOffset(ms, restartAudio = false) {
    const val = Math.round(Number(ms) || 0);
    state.params.vocalOffsetMs = val;
    document.getElementById('syncOffsetSlider').value = val;
    document.getElementById('syncOffsetLabel').textContent = `${val > 0 ? '+' : ''}${val} ms`;
    drawTimeline();
    if (restartAudio && state.isPlaying) startPlayback(getCurrentPlayhead());
  }

  function autoAlignTracks() {
    if (!state.backingBuffer || !state.rawVocalBuffer) {
      showToast('Record or load a vocal track first');
      return;
    }
    const ms = KaroDSP.estimateSyncOffsetMs(state.backingBuffer, state.rawVocalBuffer);
    setVocalOffset(ms, true);
    showToast(`Auto-aligned vocal sync (${ms > 0 ? '+' : ''}${ms} ms)`);
  }

  function runSmartVoiceMatch() {
    if (!state.rawVocalBuffer) {
      showToast('Load or record a voice track first');
      return;
    }
    const res = KaroDSP.analyzeVoiceQuick(state.rawVocalBuffer);
    state.activePreset = res.presetKey;
    state.params = { ...state.params, ...res.settings, bypassFx: false };
    updateFxButtonsUI();
    renderPresets();
    syncSlidersFromParams();
    if (state.liveNodes) KaroDSP.applyLiveParamsToGraph(state.liveNodes, state.params);
    const banner = document.getElementById('voiceReportBanner');
    banner.style.display = 'block';
    banner.textContent = `✓ ${res.note}`;
    showToast('AI matched EQ, compression & hall space to your voice!');
  }

  // ==================== WEB WORKER AUTO-TUNE & SOUNDTOUCH KEY SHIFT ====================
  async function applyWorkerAutoTune() {
    if (!state.rawVocalBuffer) return;
    const ctx = ensureAudioCtx();
    state.params.autotuneAmount = Number(document.getElementById('atStrength').value) / 100;
    state.params.noiseGate = Number(document.getElementById('gateSlider').value) / 100;
    state.params.scaleKey = Number(document.getElementById('keySelect').value);

    const res = await KaroDSP.processVocalAsync(ctx, state.rawVocalBuffer, {
      autotuneAmount: state.params.autotuneAmount,
      retuneSpeed: 0.45,
      noiseGate: state.params.noiseGate,
      scaleKey: state.params.scaleKey,
    });
    state.tunedVocalBuffer = res.buffer;
    state.pitchFrames = res.pitchCurve || [];
    state.pitchScore = res.pitchScore || 95;
    updatePitchBadge();
    drawPitchGraph();
    if (state.isPlaying) startPlayback(getCurrentPlayhead());
  }

  async function shiftBackingKey(delta) {
    if (!state.originalBackingBuffer) await preloadRealDemoAssets();
    const next = Math.max(-6, Math.min(6, state.transposeSemitones + delta));
    state.transposeSemitones = next;
    document.getElementById('transposeLabel').textContent = `${next > 0 ? '+' : ''}${next} st`;
    showToast(next === 0 ? 'Restored original song key' : `Shifting music key (${next > 0 ? '+' : ''}${next} st)...`);

    const ctx = ensureAudioCtx();
    const base = state.karaokeCutActive
      ? KaroDSP.centerCutKaraokeBuffer(ctx, state.originalBackingBuffer)
      : state.originalBackingBuffer;

    state.backingBuffer = next === 0 ? base : await KaroDSP.transposeBufferAsync(ctx, base, next);
    state.backingPeaks = KaroDSP.computeWaveformPeaks(state.backingBuffer, 220);
    drawTimeline();
    if (state.isPlaying) startPlayback(getCurrentPlayhead());
  }

  function applyKaraokeVocalCut() {
    if (!state.originalBackingBuffer) {
      showToast('Upload or load a stereo song first');
      return;
    }
    const ctx = ensureAudioCtx();
    state.karaokeCutActive = !state.karaokeCutActive;
    document.getElementById('btnKaraokeCut').className = state.karaokeCutActive ? 'btn btn-sm btn-amber' : 'btn btn-sm';
    state.backingBuffer = state.karaokeCutActive
      ? KaroDSP.centerCutKaraokeBuffer(ctx, state.originalBackingBuffer)
      : state.originalBackingBuffer;
    state.backingPeaks = KaroDSP.computeWaveformPeaks(state.backingBuffer, 220);
    drawTimeline();
    if (state.isPlaying) startPlayback(getCurrentPlayhead());
    showToast(state.karaokeCutActive ? 'Center lead vocals reduced!' : 'Original stereo track restored');
  }

  // ==================== INSTANT SONG-NAME KARAOKE VIDEO + LRC LYRICS ====================
  function parseYoutubeId(input) {
    const m = String(input || '').trim().match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function heroSearchSubmit(e) {
    e.preventDefault();
    const q = document.getElementById('heroSongQuery').value.trim();
    if (q) quickSingSong(q);
  }

  function quickSingSong(songName) {
    unlockMobileAudioSync();
    document.getElementById('ytUrlInput').value = songName;
    switchView('sing');
    searchOrLoadKaraoke(songName);
  }

  function ensureYtApi() {
    if (window.YT || document.getElementById('yt-iframe-api')) return;
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  // Send command via BOTH YT.Player object AND direct IFrame postMessage so it never misses a beat!
  function ytSendCommand(func, args = []) {
    const iframe = document.getElementById('ytKaraokeIframe');
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
      } catch (_) {}
    }
    if (state.ytPlayer && typeof state.ytPlayer[func] === 'function') {
      try { state.ytPlayer[func](...args); } catch (_) {}
    }
  }

  function renderYoutubeEmbed(videoId, title = '') {
    ensureYtApi();
    const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname);
    const originParam = isIp ? '' : `&origin=${encodeURIComponent(window.location.origin)}`;
    setStageMode('video');
    document.getElementById('stageVideoWrap').innerHTML = `
      <iframe id="ytKaraokeIframe"
        src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&playsinline=1&rel=0&modestbranding=1${originParam}"
        title="${title.replace(/"/g, '')}"
        referrerpolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen></iframe>`;

    state.ytPlayer = null;
    clearInterval(state.ytSyncInterval);
    const tryAttachPlayer = (attempt = 0) => {
      if (window.YT && window.YT.Player) {
        try {
          state.ytPlayer = new window.YT.Player('ytKaraokeIframe', {
            events: {
              onStateChange: (ev) => {
                // If mobile browser waited for 1 tap on the YouTube player, start recording THE EXACT INSTANT music starts!
                if (state.waitingForYtTap && ev.data === 1) {
                  state.waitingForYtTap = false;
                  beginActiveMediaRecorder();
                }
              },
            },
          });
        } catch (_) {}
      } else if (attempt < 15) {
        setTimeout(() => tryAttachPlayer(attempt + 1), 350);
      }
    };
    setTimeout(() => tryAttachPlayer(0), 250);

    state.ytSyncInterval = setInterval(() => {
      if (!state.lrcLines.length) return;
      let curSec = -1;
      if (state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') {
        try { curSec = state.ytPlayer.getCurrentTime(); } catch (_) {}
      } else if (state.isRecording) {
        curSec = (Date.now() - state.recStartMs) / 1000;
      }
      if (curSec >= 0) updateActiveLyricAtTime(curSec);
    }, 250);
  }

  function updateActiveLyricAtTime(sec) {
    let idx = 0;
    for (let i = 0; i < state.lrcLines.length; i++) {
      if (sec >= state.lrcLines[i].sec) idx = i;
      else break;
    }
    const cur = state.lrcLines[idx];
    const nxt = state.lrcLines[idx + 1];
    const bar = document.getElementById('liveTeleprompterBar');
    if (bar && cur) {
      bar.style.display = 'block';
      document.getElementById('teleLineCurrent').textContent = `♪ ${cur.text}`;
      document.getElementById('teleLineNext').textContent = nxt ? nxt.text : '';
    }
    const row = document.getElementById(`lr-${idx}`);
    if (row && !row.classList.contains('active')) {
      document.querySelectorAll('.lyric-row.active').forEach((r) => r.classList.remove('active'));
      row.classList.add('active');
      if (state.stageMode === 'lyrics') row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function seekToLyric(sec) {
    const target = Math.max(0, Number(sec) || 0);
    if (state.ytPlayer && typeof state.ytPlayer.seekTo === 'function') {
      try {
        state.ytPlayer.seekTo(target, true);
        state.ytPlayer.playVideo();
        updateActiveLyricAtTime(target);
        showToast(`Jumped to ${fmtTime(target)}`);
        return;
      } catch (_) {}
    }
    updateActiveLyricAtTime(target);
  }

  async function searchOrLoadKaraoke(overrideInput) {
    const raw = (overrideInput || document.getElementById('ytUrlInput').value || '').trim();
    if (!raw) {
      showToast('Type any song name (e.g. Perfect Ed Sheeran)');
      return;
    }
    const directId = parseYoutubeId(raw);
    if (directId) {
      renderYoutubeEmbed(directId, 'Karaoke Video');
      return;
    }

    const btn = document.getElementById('btnKaraokeSearch');
    btn.disabled = true;
    btn.textContent = 'Finding...';
    document.getElementById('projectTitleInput').value = `${raw} — Vocal Cover`;

    fetchLyrics(raw);

    try {
      const res = await fetch(`/api/search-karaoke?q=${encodeURIComponent(raw)}`);
      const data = await res.json();
      const videos = data.videos || data.results || [];
      if (!videos.length) {
        showToast('No karaoke video found — try adding the artist name');
        return;
      }
      state.karaokeResults = videos;
      state.karaokeIndex = 0;
      renderKaraokeStrip();
      selectKaraokeVideo(0);
      document.getElementById('btnNextKaraoke').style.display = videos.length > 1 ? 'inline-flex' : 'none';
      showToast('Karaoke video ready! Tap Start Recording to sing.');
    } catch (_) {
      showToast('Network issue finding karaoke video');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Search';
    }
  }

  function renderKaraokeStrip() {
    const strip = document.getElementById('karaokeResultsStrip');
    strip.style.display = 'flex';
    strip.innerHTML = state.karaokeResults.map((v, idx) => `
      <div class="yt-item ${idx === state.karaokeIndex ? 'active' : ''}" onclick="App.selectKaraokeVideo(${idx})">
        <img src="${v.thumbnail}" alt="" loading="lazy" />
        <div class="yt-item-title">${v.title}</div>
      </div>
    `).join('');
  }

  function selectKaraokeVideo(idx) {
    const v = state.karaokeResults[idx];
    if (!v) return;
    state.karaokeIndex = idx;
    renderKaraokeStrip();
    renderYoutubeEmbed(v.id || v.videoId, v.title);
  }

  function nextKaraokeResult() {
    if (!state.karaokeResults.length) return;
    selectKaraokeVideo((state.karaokeIndex + 1) % state.karaokeResults.length);
  }

  async function fetchLyrics(query) {
    try {
      const cleanQ = String(query || '').replace(/\b(karaoke|instrumental|lyrics|version|official|acoustic)\b/gi, '').trim() || query;
      let hit = null;

      // Primary: Direct browser CORS query to LRCLIB (bypasses Cloudflare Worker-to-Worker Bot Fight blocks!)
      try {
        const directRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanQ)}`);
        if (directRes.ok) {
          const list = await directRes.json();
          if (Array.isArray(list) && list.length) {
            hit = list.find((item) => item.syncedLyrics) || list.find((item) => item.plainLyrics) || null;
          }
        }
      } catch (_) {}

      // Fallback: Edge API endpoint
      if (!hit) {
        const res = await fetch(`/api/lyrics?q=${encodeURIComponent(cleanQ)}`);
        const data = await res.json();
        hit = data.track || (data.results || [])[0];
      }
      if (!hit) return;

      const lines = [];
      String(hit.syncedLyrics || hit.plainLyrics || '').split('\n').forEach((line) => {
        const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
        if (m) {
          const text = m[3].trim();
          if (text) lines.push({ sec: Number(m[1]) * 60 + Number(m[2]), text });
        } else if (line.trim()) {
          lines.push({ sec: lines.length * 4, text: line.trim() });
        }
      });
      state.lrcLines = lines;
      const box = document.getElementById('lyricsStageBox');
      if (lines.length) {
        box.innerHTML = lines.map((l, i) =>
          `<div class="lyric-row ${i === 0 ? 'active' : ''}" id="lr-${i}" onclick="App.seekToLyric(${l.sec})">${l.text}</div>`
        ).join('');
        updateActiveLyricAtTime(0);
      }
    } catch (_) {}
  }

  // ==================== CLEAN LOW-LATENCY MIC RECORDING & FILE UPLOAD ====================
  async function handleBackingUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    unlockMobileAudioSync();
    showToast('Decoding music track...');
    const ctx = ensureAudioCtx();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    state.originalBackingBuffer = buf;
    state.backingBuffer = buf;
    state.backingPeaks = KaroDSP.computeWaveformPeaks(buf, 220);
    state.isDemoSession = false;
    state.userLoadedBacking = true;
    state.transposeSemitones = 0;
    document.getElementById('projectTitleInput').value = file.name.replace(/\.[^.]+$/, '') + ' — Vocal Cover';
    if (state.view === 'mix') {
      drawTimeline();
      if (state.isPlaying) startPlayback(0);
    }
    showToast(`Loaded music: ${file.name}`);
  }

  async function handleVocalUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    unlockMobileAudioSync();
    showToast('Loading your vocal recording...');
    const ctx = ensureAudioCtx();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    if (!state.userLoadedBacking) {
      state.backingBuffer = null;
      state.originalBackingBuffer = null;
      state.backingPeaks = null;
    }
    state.rawVocalBuffer = buf;
    state.tunedVocalBuffer = buf;
    state.vocalPeaks = KaroDSP.computeWaveformPeaks(buf, 220);
    state.isDemoSession = false;
    switchView('mix');
    runSmartVoiceMatch();
    applyWorkerAutoTune();
    startPlayback(0);
  }

  function onMicModeChange() {
    const headphonesOnly = document.getElementById('useCleanMic').checked;
    document.getElementById('micCleanLabel').textContent = headphonesOnly
      ? 'Headphones (Voice Isolation ON)'
      : 'Speaker + Voice (No Headphones)';
    if (state.micStream && !state.isRecording) {
      releaseMic();
    }
  }

  async function initMicStream() {
    if (state.micStream) return state.micStream;
    const headphonesOnly = document.getElementById('useCleanMic').checked;
    document.getElementById('micCleanLabel').textContent = headphonesOnly
      ? 'Headphones (Voice Isolation ON)'
      : 'Speaker + Voice (No Headphones)';

    // CRITICAL FOR PHONE SPEAKER SINGING:
    // Disable hardware noiseSuppression, echoCancellation & autoGainControl so phone speaker music + voice BOTH record richly without pumping!
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: headphonesOnly,
        echoCancellation: false,
        autoGainControl: headphonesOnly,
        channelCount: 1,
      },
    });
    state.micStream = stream;
    const ctx = ensureAudioCtx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    state.micAnalyser = analyser;
    startMicMeterLoop();
    return stream;
  }

  function startMicMeterLoop() {
    cancelAnimationFrame(state.recMeterRaf);
    const buf = new Float32Array(2048);
    let frameSkip = 0;
    const loop = () => {
      if (!state.micAnalyser) return;
      state.micAnalyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 4) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / (buf.length / 4));
      document.getElementById('micMeterFill').style.width = `${Math.min(100, rms * 340)}%`;

      if (++frameSkip % 5 === 0) {
        const note = KaroDSP.detectPitchLive(buf, state.audioCtx.sampleRate);
        document.getElementById('livePitchText').textContent = note ? `Note: ${note}` : 'Note: --';
      }
      if (state.isRecording) {
        const elapsed = (Date.now() - state.recStartMs) / 1000;
        document.getElementById('recTimerText').textContent = fmtTime(elapsed);
        state.lrcLines.forEach((l, i) => {
          if (elapsed >= l.sec) {
            const el = document.getElementById(`lr-${i}`);
            if (el && !el.classList.contains('active')) {
              document.querySelectorAll('.lyric-row.active').forEach((r) => r.classList.remove('active'));
              el.classList.add('active');
              el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
          }
        });
      }
      state.recMeterRaf = requestAnimationFrame(loop);
    };
    state.recMeterRaf = requestAnimationFrame(loop);
  }

  function releaseMic() {
    cancelAnimationFrame(state.recMeterRaf);
    if (state.micStream) state.micStream.getTracks().forEach((t) => t.stop());
    state.micStream = null;
    state.micAnalyser = null;
    document.getElementById('micMeterFill').style.width = '0%';
  }

  async function toggleMicMonitor() {
    unlockMobileAudioSync();
    if (state.isMonitoring) {
      state.isMonitoring = false;
      releaseMic();
      document.getElementById('btnMicCheck').textContent = 'Test Mic';
      return;
    }
    try {
      await initMicStream();
      state.isMonitoring = true;
      document.getElementById('btnMicCheck').textContent = 'Stop Test';
      showToast('Speak or sing now to check your mic level');
    } catch (_) {
      showToast('Please allow Microphone permission in your browser');
    }
  }

  function runCountdown() {
    return new Promise((resolve) => {
      if (!document.getElementById('useCountdown').checked) return resolve();
      const mask = document.getElementById('countdownOverlay');
      const num = document.getElementById('countdownNum');
      let n = 3;
      mask.classList.add('show');
      num.textContent = '3';
      const iv = setInterval(() => {
        n--;
        if (n <= 0) {
          clearInterval(iv);
          mask.classList.remove('show');
          resolve();
        } else {
          num.textContent = String(n);
        }
      }, 650);
    });
  }

  function beginActiveMediaRecorder() {
    if (!state.micStream || state.isRecording) return;
    const headphonesOnly = document.getElementById('useCleanMic').checked;
    state.recChunks = [];
    const bestMime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
      .find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
    const recOpts = bestMime ? { mimeType: bestMime, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
    const rec = new MediaRecorder(state.micStream, recOpts);
    state.mediaRecorder = rec;
    rec.ondataavailable = (ev) => { if (ev.data.size > 0) state.recChunks.push(ev.data); };
    rec.onstop = async () => {
      releaseMic();
      const blob = new Blob(state.recChunks, { type: rec.mimeType || bestMime || 'audio/webm' });
      const ctx = ensureAudioCtx();
      const vocalBuf = await ctx.decodeAudioData(await blob.arrayBuffer());
      if (!state.userLoadedBacking) {
        state.backingBuffer = null;
        state.originalBackingBuffer = null;
        state.backingPeaks = null;
      }
      state.rawVocalBuffer = vocalBuf;
      state.tunedVocalBuffer = vocalBuf;
      state.vocalPeaks = KaroDSP.computeWaveformPeaks(vocalBuf, 220);
      state.isDemoSession = false;

      switchView('mix');
      runSmartVoiceMatch();
      if (!headphonesOnly) {
        state.params.hpFreq = 55;
        state.params.noiseGate = 0.04;
        document.getElementById('gateSlider').value = 4;
        document.getElementById('gateValText').textContent = '4%';
      }
      await applyWorkerAutoTune();
      startPlayback(0);
    };

    if (state.backingBuffer && state.userLoadedBacking) {
      const ctx = ensureAudioCtx();
      const bSrc = ctx.createBufferSource();
      bSrc.buffer = state.backingBuffer;
      bSrc.connect(ctx.destination);
      bSrc.start();
      state.liveNodes = { sources: [bSrc] };
    }

    if (state.lrcLines.length) updateActiveLyricAtTime(0);
    rec.start();
    state.isRecording = true;
    state.recStartMs = Date.now();
    document.getElementById('btnRecordVocal').classList.add('recording');
    document.getElementById('recBtnLabel').textContent = 'Stop & Mix My Voice';
    showToast('Recording live! Sing along now.');
  }

  async function toggleMicRecording() {
    unlockMobileAudioSync();

    // Cancel or stop active / armed recording
    if (state.isRecording || state.waitingForYtTap) {
      state.waitingForYtTap = false;
      state.isRecording = false;
      ytSendCommand('pauseVideo');
      stopPlaybackInternal();
      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
      } else {
        releaseMic();
      }
      document.getElementById('btnRecordVocal').classList.remove('recording');
      document.getElementById('recBtnLabel').textContent = 'Start Recording';
      return;
    }

    // Native Android App Bridge Hook (Android 10+ SDK >= 29 AudioPlaybackCapture support!)
    if (window.AndroidNativeStudio && typeof window.AndroidNativeStudio.canCaptureInternalAudio === 'function') {
      try {
        if (window.AndroidNativeStudio.canCaptureInternalAudio()) {
          ytSendCommand('pauseVideo');
          ytSendCommand('seekTo', [0, true]);
          await runCountdown();
          ytSendCommand('seekTo', [0, true]);
          ytSendCommand('unMute');
          ytSendCommand('setVolume', [100]);
          ytSendCommand('playVideo');
          window.AndroidNativeStudio.startDualRecording();
          state.isRecording = true;
          state.recStartMs = Date.now();
          document.getElementById('btnRecordVocal').classList.add('recording');
          document.getElementById('recBtnLabel').textContent = 'Stop & Mix My Voice';
          return;
        }
      } catch (_) {}
    }

    const hasYtIframe = !!document.getElementById('ytKaraokeIframe');
    if (hasYtIframe) {
      // Pause & rewind to 00:00 cleanly WITHOUT muting so mobile audio unlock stays intact!
      ytSendCommand('pauseVideo');
      ytSendCommand('seekTo', [0, true]);
    }

    try {
      await initMicStream();
      await runCountdown();

      if (hasYtIframe) {
        ytSendCommand('unMute');
        ytSendCommand('setVolume', [100]);
        ytSendCommand('seekTo', [0, true]);
        ytSendCommand('playVideo');

        // Check in 450ms if mobile browser auto-started YouTube or needs 1 tap on the YouTube ▶ icon
        setTimeout(() => {
          const st = state.ytPlayer?.getPlayerState?.();
          if (st === 1 || st === 3) {
            beginActiveMediaRecorder();
          } else {
            // Mobile browser hasn't had its one-time tap inside YouTube iframe yet — arm instant auto-start on ▶ tap!
            state.waitingForYtTap = true;
            document.getElementById('btnRecordVocal').classList.add('recording');
            document.getElementById('recBtnLabel').textContent = 'Tap ▶ on Video to Start!';
            document.getElementById('stageVideoWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('Tap ▶ on the video once — recording starts automatically!');
          }
        }, 450);
      } else {
        beginActiveMediaRecorder();
      }
    } catch (_) {
      showToast('Microphone access blocked — please allow mic access');
    }
  }

  // Native Android WebView Receiver (receives separate digital internal backing WAV + clean mic WAV on Android 10+)
  async function receiveNativeDualTracks(backingBase64, vocalBase64) {
    const ctx = ensureAudioCtx();
    const toBuf = async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return ctx.decodeAudioData(bytes.buffer);
    };
    if (backingBase64) {
      const bBuf = await toBuf(backingBase64);
      state.originalBackingBuffer = bBuf;
      state.backingBuffer = bBuf;
      state.backingPeaks = KaroDSP.computeWaveformPeaks(bBuf, 220);
      state.userLoadedBacking = true;
    }
    if (vocalBase64) {
      const vBuf = await toBuf(vocalBase64);
      state.rawVocalBuffer = vBuf;
      state.tunedVocalBuffer = vBuf;
      state.vocalPeaks = KaroDSP.computeWaveformPeaks(vBuf, 220);
    }
    state.isDemoSession = false;
    switchView('mix');
    runSmartVoiceMatch();
    await applyWorkerAutoTune();
    startPlayback(0);
  }

  // ==================== ULTRA-LIGHT 60FPS WAVEFORM & PITCH CANVAS ====================
  function drawTimeline(playheadSec = getCurrentPlayhead()) {
    const canvas = document.getElementById('waveformCanvas');
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.save();
    g.scale(dpr, dpr);
    g.fillStyle = '#060810';
    g.fillRect(0, 0, w, h);

    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();

    const total = getTotalDuration();

    const drawPeaks = (peaks, dur, startSec, yCenter, halfH, color) => {
      if (!peaks || !dur) return;
      g.fillStyle = color;
      const startX = (startSec / total) * w;
      const trackW = (dur / total) * w;
      const barW = Math.max(1.5, trackW / peaks.length - 1);
      for (let i = 0; i < peaks.length; i++) {
        const x = startX + (i / peaks.length) * trackW;
        if (x < -4 || x > w + 4) continue;
        const amp = Math.max(2, peaks[i] * halfH);
        g.fillRect(x, yCenter - amp, barW, amp * 2);
      }
    };

    if (state.backingBuffer && state.backingPeaks) {
      drawPeaks(state.backingPeaks, state.backingBuffer.duration, 0, h * 0.27, h * 0.2, '#38bdf8');
    }
    if (state.rawVocalBuffer && state.vocalPeaks) {
      const offSec = (state.params.vocalOffsetMs || 0) / 1000;
      drawPeaks(state.vocalPeaks, state.rawVocalBuffer.duration, offSec, h * 0.74, h * 0.2, '#fbbf24');
    }

    const px = Math.max(0, Math.min(w, (playheadSec / total) * w));
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(px, 0); g.lineTo(px, h); g.stroke();
    g.restore();
  }

  function initTimelinePointerInteractions() {
    const canvas = document.getElementById('waveformCanvas');
    if (!canvas) return;
    let draggingVocal = false;
    let startX = 0;
    let startOffset = 0;

    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      if (y > rect.height * 0.5) {
        draggingVocal = true;
        startX = e.clientX;
        startOffset = state.params.vocalOffsetMs || 0;
        canvas.setPointerCapture(e.pointerId);
      } else {
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const seek = ratio * getTotalDuration();
        state.pausePositionSec = seek;
        if (state.isPlaying) startPlayback(seek);
        else drawTimeline(seek);
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!draggingVocal) return;
      const rect = canvas.getBoundingClientRect();
      const deltaSec = ((e.clientX - startX) / rect.width) * getTotalDuration();
      const clamped = Math.max(-500, Math.min(500, Math.round(startOffset + deltaSec * 1000)));
      setVocalOffset(clamped, false);
    });

    canvas.addEventListener('pointerup', () => {
      if (draggingVocal) {
        draggingVocal = false;
        if (state.isPlaying) startPlayback(getCurrentPlayhead());
      }
    });
  }

  function drawPitchGraph() {
    const canvas = document.getElementById('pitchCanvas');
    if (!canvas) return;
    const w = canvas.clientWidth || 500;
    const h = canvas.clientHeight || 110;
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    g.fillStyle = '#060810';
    g.fillRect(0, 0, w, h);

    const curve = Array.isArray(state.pitchFrames) ? state.pitchFrames : [];
    const voiced = curve.filter((f) => f && f.voiced && f.rawMidi > 0);
    if (!voiced.length) return;
    const minM = Math.min(...voiced.map((f) => f.rawMidi)) - 2;
    const maxM = Math.max(...voiced.map((f) => f.rawMidi)) + 2;
    const span = Math.max(8, maxM - minM);

    const plot = (key, color, width) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      let down = false;
      curve.forEach((f, i) => {
        if (!f || !f.voiced || f.rawMidi <= 0) { down = false; return; }
        const x = (i / curve.length) * w;
        const y = h - ((f[key] - minM) / span) * (h - 16) - 8;
        if (!down) { g.moveTo(x, y); down = true; } else g.lineTo(x, y);
      });
      g.stroke();
    };
    plot('rawMidi', 'rgba(148,163,184,0.55)', 1.5);
    plot('tunedMidi', '#38bdf8', 2.2);
  }

  // ==================== CLOUD D1 STATE, AUTH, SAVE & WAV EXPORT ====================
  async function apiFetch(url, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (state.authToken) headers.Authorization = `Bearer ${state.authToken}`;
    const res = await fetch(url, { ...opts, headers });
    return res.json();
  }

  async function refreshServerState() {
    try {
      const data = await apiFetch('/api/state');
      if (data.authenticated && data.user) {
        state.user = data.user;
      } else {
        state.user = null;
      }
      state.projects = data.projects || [];
      if (data.user && typeof data.user.exports_this_month === 'number') {
        state.exportsUsed = Math.max(state.exportsUsed, data.user.exports_this_month);
      }
      updateAccountUI();
      renderSavedProjects();
    } catch (_) {}
  }

  function updateAccountUI() {
    const isPro = state.isProDemo || (state.user && state.user.plan !== 'free');
    document.getElementById('topPlanBadge').textContent = isPro ? 'PRO ∞' : `FREE • ${state.exportsUsed}/3`;
    document.getElementById('authTriggerBtn').textContent = state.user ? state.user.display_name.slice(0, 10) : 'Sign In';
    const proBtn = document.getElementById('proActionBtn');
    if (proBtn) proBtn.textContent = isPro ? 'Pro Pass Active ✓' : 'Activate Pro Pass';
  }

  function openAuthModal() {
    document.getElementById('authModal').classList.add('open');
    document.getElementById('authLoggedInBox').style.display = state.user ? 'block' : 'none';
    document.getElementById('authForm').style.display = state.user ? 'none' : 'block';
    if (state.user) {
      document.getElementById('authUserName').textContent = state.user.display_name;
      document.getElementById('authUserEmail').textContent = state.user.email;
    }
  }

  function closeAuthModal() { document.getElementById('authModal').classList.remove('open'); }

  function setAuthMode(mode) {
    state.authMode = mode;
    document.getElementById('authNameWrap').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('tabLoginBtn').className = mode === 'login' ? 'btn btn-sm btn-amber' : 'btn btn-sm';
    document.getElementById('tabRegBtn').className = mode === 'register' ? 'btn btn-sm btn-amber' : 'btn btn-sm';
    document.getElementById('authSubmitBtn').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  }

  async function submitAuth(e) {
    e.preventDefault();
    const payload = {
      email: document.getElementById('authEmail').value.trim(),
      password: document.getElementById('authPassword').value,
      display_name: document.getElementById('authName').value.trim(),
    };
    const path = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const data = await apiFetch(path, { method: 'POST', body: JSON.stringify(payload) });
    if (data.error) { showToast(data.error); return; }
    state.authToken = data.token;
    state.user = data.user;
    localStorage.setItem('karomix_token', data.token);
    updateAccountUI();
    closeAuthModal();
    showToast(`Signed in as ${data.user.display_name}`);
  }

  function logout() {
    state.authToken = '';
    state.user = null;
    localStorage.removeItem('karomix_token');
    updateAccountUI();
    closeAuthModal();
    showToast('Signed out');
  }

  async function toggleProDemo() {
    state.isProDemo = !state.isProDemo;
    localStorage.setItem('karomix_pro_demo', state.isProDemo ? '1' : '0');
    apiFetch('/api/upgrade-demo', {
      method: 'POST',
      body: JSON.stringify({ plan: state.isProDemo ? 'pro_global' : 'free' }),
    }).catch(() => {});
    updateAccountUI();
    showToast(state.isProDemo ? 'Pro Unlimited Pass activated!' : 'Switched to Free Tier');
  }

  async function saveProjectToD1() {
    const title = document.getElementById('projectTitleInput').value.trim() || 'Untitled Mix';
    const data = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        title,
        preset_key: state.activePreset,
        vocal_offset_ms: state.params.vocalOffsetMs,
        duration_sec: getTotalDuration(),
        settings: state.params,
      }),
    });
    if (data.ok || data.id) showToast('Saved mix settings to Cloudflare D1!');
  }

  function renderSavedProjects() {
    const box = document.getElementById('savedProjectsList');
    if (!box) return;
    const list = state.projects || [];
    if (!list.length) {
      box.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">No saved mixes yet — save any mix from Mix Studio.</div>';
      return;
    }
    box.innerHTML = list.map((p) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);gap:8px;">
        <div>
          <div style="font-weight:700;">${p.title}</div>
          <div style="font-size:11.5px;color:var(--text-secondary);">Preset: ${p.preset_key || p.preset_name} • Sync: ${p.vocal_offset_ms}ms</div>
        </div>
        <button class="btn btn-sm" onclick='App.restoreProject(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Load</button>
      </div>
    `).join('');
  }

  function restoreProject(p) {
    document.getElementById('projectTitleInput').value = p.title;
    try {
      const s = typeof p.settings_json === 'string' ? JSON.parse(p.settings_json) : p.settings_json;
      state.activePreset = p.preset_key || p.preset_name || 'smule_hall';
      state.params = { ...state.params, ...s };
      renderPresets();
      syncSlidersFromParams();
    } catch (_) {}
    switchView('mix');
    showToast(`Loaded "${p.title}"`);
  }

  async function exportMasteredWav() {
    unlockMobileAudioSync();
    if (!state.backingBuffer && !state.rawVocalBuffer) {
      await preloadRealDemoAssets();
    }
    const isPro = state.isProDemo || (state.user && state.user.plan !== 'free');
    if (!isPro && state.exportsUsed >= 3) {
      switchView('library');
      showToast('Free 3 exports used — tap Activate Pro Pass!');
      return;
    }

    const btn = document.getElementById('btnRenderMaster');
    btn.disabled = true;
    btn.textContent = 'Mastering...';

    try {
      const compact = document.getElementById('exportFormatSelect').value === 'compact';
      const wavBlob = await KaroDSP.renderMasterWav(
        { backing: state.backingBuffer, rawVocal: state.rawVocalBuffer, tunedVocal: state.tunedVocalBuffer },
        state.params,
        compact
      );
      state.exportsUsed++;
      updateAccountUI();
      apiFetch('/api/track-export', { method: 'POST' }).catch(() => {});

      const fname = `${(document.getElementById('projectTitleInput').value || 'karomix').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.wav`;
      state.lastMasterBlob = wavBlob;
      state.lastMasterFilename = fname;

      const url = URL.createObjectURL(wavBlob);
      document.getElementById('masterOutputArea').style.display = 'block';
      document.getElementById('renderedAudioPlayer').src = url;

      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      a.click();

      if (window.confetti) window.confetti({ particleCount: 70, spread: 65, origin: { y: 0.7 } });
      showToast('Mastered WAV downloaded!');
    } catch (err) {
      showToast('Export error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Download Master';
    }
  }

  async function shareMasterFile() {
    if (!state.lastMasterBlob) {
      showToast('Render your song first');
      return;
    }
    try {
      const file = new File([state.lastMasterBlob], state.lastMasterFilename, { type: 'audio/wav' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: document.getElementById('projectTitleInput').value || 'My KaroMix Studio Cover',
          text: 'Recorded & mastered on KaroMix AI Studio',
          files: [file],
        });
        return;
      }
    } catch (_) {}
    const url = URL.createObjectURL(state.lastMasterBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.lastMasterFilename;
    a.click();
    showToast('Saved master WAV to device!');
  }

  // ==================== BOOT ====================
  function init() {
    renderPresets();
    syncSlidersFromParams();
    updateFxButtonsUI();
    initTimelinePointerInteractions();
    refreshServerState();

    window.addEventListener('pointerdown', unlockMobileAudioSync, { once: true, passive: true });
    window.addEventListener('touchstart', unlockMobileAudioSync, { once: true, passive: true });

    // Pre-decode real female vocal + studio band + Matrix Hall IR silently in background!
    setTimeout(() => { preloadRealDemoAssets().catch(() => {}); }, 80);
  }

  document.addEventListener('DOMContentLoaded', init);

  // Also pause background YouTube stage if switching away from Sing view
  function pauseYoutubeStage() {
    ytSendCommand('pauseVideo');
  }

  return {
    switchView: (v) => { if (v !== 'sing') pauseYoutubeStage(); switchView(v); },
    setStageMode, getMasterSignalRms, ytStateDebug: () => ({
      playerState: state.ytPlayer?.getPlayerState?.(),
      currentTime: state.ytPlayer?.getCurrentTime?.(),
      isMuted: state.ytPlayer?.isMuted?.(),
    }),
    toggleHeroDemo, openMixWithRealDemo, loadRealSingerDemo, loadInstrumentalDemoForSing,
    togglePlayback, stopAndRewind, toggleBypassFx, toggleSoloVocal,
    applyPreset, setClarityMacro, updateParam, setMasterProfile, setVocalOffset, autoAlignTracks, runSmartVoiceMatch,
    applyWorkerAutoTune, shiftBackingKey, applyKaraokeVocalCut,
    heroSearchSubmit, quickSingSong, searchOrLoadKaraoke, selectKaraokeVideo, nextKaraokeResult, seekToLyric,
    onMicModeChange, handleBackingUpload, handleVocalUpload, toggleMicMonitor, toggleMicRecording, receiveNativeDualTracks,
    openAuthModal, closeAuthModal, setAuthMode, submitAuth, logout, toggleProDemo,
    saveProjectToD1, restoreProject, exportMasteredWav, shareMasterFile,
  };
})();
