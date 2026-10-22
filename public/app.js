/**
 * KaroMix Studio - Frontend Controller & Multi-Track Waveform Drag Editor
 */

window.App = (() => {
  let audioCtx = null;
  const buffers = {
    originalBacking: null,
    backing: null,
    rawVocal: null,
    tunedVocal: null,
  };
  let backingSemitones = 0;
  let pitchCurveData = [];
  let activePresetKey = 'sinhala_ballad';
  let customD1Presets = [];
  let savedD1Projects = [];
  let userState = { plan: 'free', exports_this_month: 1 };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const params = {
    ...KaroDSP.PRESETS.sinhala_ballad,
    vocalOffsetMs: 0,
    bypassFx: false,
    soloVocal: false,
    muteBacking: false,
    muteVocal: false,
  };

  // Playback state
  let isPlaying = false;
  let playStartCtxTime = 0;
  let playStartOffsetSec = 0;
  let liveNodes = null;
  let animFrameId = null;

  // Recording / Mic state
  let isRecording = false;
  let mediaRecorder = null;
  let tabMediaRecorder = null;
  let micStream = null;
  let tabStream = null;
  let recChunks = [];
  let tabChunks = [];
  let recStartTime = 0;
  let monitorActive = false;
  let analyserNode = null;
  let meterRaf = null;
  let currentYouTubeVideoId = '';

  function ensureAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC({ latencyHint: 'interactive' });
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.innerText = msg;
    el.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => el.classList.remove('show'), 3400);
  }

  // ==================== CLOUDFLARE D1 BACKEND API SYNC ====================
  async function loadServerState() {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const data = await res.json();
      if (data.user) {
        userState = data.user;
        updateQuotaUI();
      }
      customD1Presets = data.presets || [];
      renderPresetCards();
      renderSavedProjects(data.projects || []);
    } catch (err) {
      renderPresetCards();
    }
  }

  function updateQuotaUI() {
    const isPro = userState.plan && userState.plan.startsWith('pro');
    document.getElementById('planLabel').innerText = isPro ? 'PRO UNLIMITED' : 'FREE (3/mo)';
    document.getElementById('exportCount').innerText = userState.exports_this_month ?? 0;
    document.getElementById('upgradeBtn').innerText = isPro ? '✅ Pro Active' : '💎 Pro Test';
  }

  async function toggleProDemo() {
    const nextPlan = userState.plan === 'free' ? 'pro_lk' : 'free';
    await fetch('/api/upgrade-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: nextPlan }),
    });
    await loadServerState();
    showToast(nextPlan === 'free' ? 'Free Plan එකට මාරු විය' : '💎 Pro Plan (Unlimited Master Exports) සක්‍රීය විය!');
  }

  // ==================== SOURCE TABS & YOUTUBE KARAOKE PLAYER ====================
  function switchSourceTab(tabId, btn) {
    document.querySelectorAll('.src-pane').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.src-tab').forEach((b) => b.classList.remove('active'));
    document.getElementById('pane-' + tabId).classList.add('active');
    if (btn) btn.classList.add('active');
  }

  function switchSourceTabById(tabId) {
    const btns = document.querySelectorAll('.src-tab');
    const idx = tabId === 'yt' ? 0 : tabId === 'file' ? 1 : 2;
    switchSourceTab(tabId, btns[idx]);
  }

  function extractYouTubeId(url) {
    if (!url) return '';
    const trimmed = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = trimmed.match(p);
      if (m) return m[1];
    }
    return '';
  }

  function loadYouTubeLink() {
    const raw = document.getElementById('ytUrlInput').value;
    const vid = extractYouTubeId(raw);
    if (!vid) {
      showToast('⚠️ කරුණාකර නිවැරදි YouTube ලින්ක් එකක් Paste කරන්න');
      return;
    }
    currentYouTubeVideoId = vid;
    const box = document.getElementById('ytPlayerContainer');
    box.innerHTML = `<iframe id="ytIframe" src="https://www.youtube-nocookie.com/embed/${vid}?enablejsapi=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    document.getElementById('backingStatusBadge').innerText = `🎬 YouTube Ready (${vid})`;
    showToast('✅ YouTube Karaoke Player සූදානම්! දැන් Record බොත්තම ඔබා ගායනා කරන්න.');
  }

  function sendYouTubeCommand(func) {
    const iframe = document.getElementById('ytIframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
    }
  }

  // ==================== FILE UPLOAD & INSTANT DEMO SESSION ====================
  async function handleBackingUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    stopPlayback();
    const ctx = ensureAudioCtx();
    showToast('⏳ Karaoke Track එක decode කරමින් පවතී...');
    try {
      const arr = await file.arrayBuffer();
      buffers.originalBacking = await ctx.decodeAudioData(arr);
      buffers.backing = buffers.originalBacking;
      backingSemitones = 0;
      document.getElementById('transposeLabel').innerText = '0 st';
      document.getElementById('backingStatusBadge').innerText = `✅ ${file.name} (${buffers.backing.duration.toFixed(1)}s)`;
      document.getElementById('projectTitleInput').value = file.name.replace(/\.[^.]+$/, '') + ' (Cover)';
      drawTimeline(0);
      showToast('🎵 Karaoke Track එක සූදානම්! දැන් Record Voice ඔබා ගායනා කරන්න.');
    } catch (err) {
      showToast('❌ ගොනුව කියවිය නොහැක. කරුණාකර MP3 / WAV / M4A / MP4 ගොනුවක් තෝරන්න.');
    }
  }

  async function handleVocalUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    stopPlayback();
    const ctx = ensureAudioCtx();
    showToast('⏳ Voice Recording එක සකසමින් පවතී...');
    try {
      const arr = await file.arrayBuffer();
      buffers.rawVocal = await ctx.decodeAudioData(arr);
      reprocessAutoTune();
      drawTimeline(0);
      showToast('🎤 ඔබේ කටහඬ Track 2 වෙත ඇතුළත් විය! දැන් Play Mix හෝ Smart Voice Match ඔබන්න.');
    } catch (err) {
      showToast('❌ Voice ගොනුව කියවිය නොහැක.');
    }
  }

  function loadFullDemo(includeVocal = true) {
    stopPlayback();
    const ctx = ensureAudioCtx();
    const demo = KaroDSP.generateDemoSession(ctx);
    buffers.originalBacking = demo.backing;
    buffers.backing = demo.backing;
    backingSemitones = 0;
    document.getElementById('transposeLabel').innerText = '0 st';
    document.getElementById('backingStatusBadge').innerText = '🎹 Sinhala Pop Ballad Demo (Am • 92 BPM)';
    document.getElementById('keySelect').value = '9';
    document.getElementById('scaleSelect').value = 'minor';

    if (includeVocal) {
      buffers.rawVocal = demo.vocal;
      // Intentionally start at 0ms first, then auto-align or let user hear & fix -120ms lag!
      setVocalOffset(-120, false);
      applyPreset('sinhala_ballad', false);
      reprocessAutoTune();
      showToast('⚡ Demo Music + Raw Singer Voice සූදානම්! දැන් ▶️ Play Mix ඔබා අසා බලන්න!');
    } else {
      buffers.rawVocal = null;
      buffers.tunedVocal = null;
      pitchCurveData = [];
      drawPitchGraph();
      showToast('🎵 Instrumental Track සූදානම්! දැන් 🎙️ Record Voice ඔබා ඔබේ හඬින් ගයන්න!');
    }
    drawTimeline(0);
  }

  // ==================== LIVE MIC & TAB+MIC SIMULTANEOUS RECORDING ====================
  async function getConfiguredMicStream() {
    const studioMode = document.getElementById('micModeSelect').value === 'studio';
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: !studioMode,
        noiseSuppression: !studioMode,
        autoGainControl: !studioMode,
      },
    });
  }

  async function toggleMicMonitor() {
    const btn = document.getElementById('btnMicCheck');
    if (monitorActive) {
      monitorActive = false;
      if (micStream && !isRecording) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
      }
      cancelAnimationFrame(meterRaf);
      document.getElementById('micMeterFill').style.width = '0%';
      document.getElementById('livePitchText').innerText = '--';
      btn.innerText = '🎚️ Test Mic';
      return;
    }

    try {
      const ctx = ensureAudioCtx();
      micStream = await getConfiguredMicStream();
      startLiveMicMeter(ctx, micStream);
      monitorActive = true;
      btn.innerText = '🔇 Stop Test';
      showToast('🎙️ Mic ක්‍රියාත්මකයි! ගායනා කර Level එක සහ ස්වරය බලන්න.');
    } catch (err) {
      showToast('⚠️ Microphone අවසරය (Permission) ලබා දෙන්න.');
    }
  }

  function startLiveMicMeter(ctx, stream) {
    const src = ctx.createMediaStreamSource(stream);
    analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 2048;
    src.connect(analyserNode);
    const timeBuf = new Float32Array(analyserNode.fftSize);

    const loop = () => {
      if (!analyserNode || (!monitorActive && !isRecording)) return;
      analyserNode.getFloatTimeDomainData(timeBuf);
      let sum = 0;
      for (let i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i];
      const rms = Math.sqrt(sum / timeBuf.length);
      const pct = Math.min(100, Math.round(rms * 340));
      document.getElementById('micMeterFill').style.width = pct + '%';

      const { f0, confidence } = KaroDSP.detectPitchFrame(timeBuf, 0, 1536, ctx.sampleRate);
      if (f0 > 0 && confidence > 0.72) {
        const midi = 69 + 12 * Math.log2(f0 / 440);
        const rounded = Math.round(midi);
        const note = KaroDSP.NOTE_NAMES[((rounded % 12) + 12) % 12] + (Math.floor(rounded / 12) - 1);
        const cents = Math.round((midi - rounded) * 100);
        document.getElementById('livePitchText').innerText = `${note} (${cents >= 0 ? '+' : ''}${cents}c)`;
      }

      if (isRecording) {
        const sec = Math.floor((performance.now() - recStartTime) / 1000);
        document.getElementById('recTimerText').innerText =
          String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
      }
      meterRaf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(meterRaf);
    loop();
  }

  function runCountdown() {
    return new Promise((resolve) => {
      if (!document.getElementById('useCountdown').checked) return resolve();
      const overlay = document.getElementById('countdownOverlay');
      const numEl = document.getElementById('countdownNum');
      overlay.classList.add('show');
      let count = 3;
      numEl.innerText = count;
      const iv = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(iv);
          overlay.classList.remove('show');
          resolve();
        } else {
          numEl.innerText = count;
        }
      }, 750);
    });
  }

  // Record YouTube Tab Audio (Track 1) + Singer Microphone (Track 2) simultaneously!
  async function startTabPlusMicRecord() {
    if (isRecording) {
      return stopAllRecording();
    }
    try {
      const ctx = ensureAudioCtx();
      tabStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (tabStream.getAudioTracks().length === 0) {
        tabStream.getTracks().forEach((t) => t.stop());
        showToast('⚠️ කරුණාකර Tab එක තෝරන විට "Also share tab audio" (ශබ්දය බෙදාගන්න) tick එක දමන්න!');
        return;
      }
      micStream = await getConfiguredMicStream();
      await runCountdown();

      const audioOnlyTab = new MediaStream(tabStream.getAudioTracks());
      tabChunks = [];
      recChunks = [];
      tabMediaRecorder = new MediaRecorder(audioOnlyTab);
      mediaRecorder = new MediaRecorder(micStream);

      tabMediaRecorder.ondataavailable = (ev) => { if (ev.data.size > 0) tabChunks.push(ev.data); };
      mediaRecorder.ondataavailable = (ev) => { if (ev.data.size > 0) recChunks.push(ev.data); };

      const donePromise = Promise.all([
        new Promise((res) => { tabMediaRecorder.onstop = res; }),
        new Promise((res) => { mediaRecorder.onstop = res; }),
      ]);

      isRecording = true;
      recStartTime = performance.now();
      startLiveMicMeter(ctx, micStream);
      sendYouTubeCommand('playVideo');

      tabMediaRecorder.start(200);
      mediaRecorder.start(200);

      document.getElementById('btnRecTabAndMic').innerText = '⏹️ Stop YouTube + Mic Recording';
      document.getElementById('btnRecordVocal').innerText = '⏹️ Stop Recording';
      document.getElementById('btnRecordVocal').classList.add('recording');
      showToast('🔴 YouTube සංගීතය සහ ඔබේ කටහඬ වෙන වෙනම Record වෙමින් පවතී!');

      donePromise.then(async () => {
        const tabBlob = new Blob(tabChunks, { type: tabMediaRecorder.mimeType || 'audio/webm' });
        const micBlob = new Blob(recChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        buffers.originalBacking = await ctx.decodeAudioData(await tabBlob.arrayBuffer());
        buffers.backing = buffers.originalBacking;
        backingSemitones = 0;
        buffers.rawVocal = await ctx.decodeAudioData(await micBlob.arrayBuffer());
        setVocalOffset(-90, false);
        reprocessAutoTune();
        drawTimeline(0);
        document.getElementById('backingStatusBadge').innerText = `✅ Captured YouTube Audio (${buffers.backing.duration.toFixed(1)}s)`;
        showToast('🎉 සුපිරි! YouTube Music (Track 1) + ඔබේ Voice (Track 2) දෙකම Mixer එකට ආවා!');
      });
    } catch (err) {
      showToast('⚠️ Tab + Mic Capture අවලංගු විය: ' + (err.message || 'Permission denied'));
    }
  }

  async function toggleMicRecording() {
    if (isRecording) {
      return stopAllRecording();
    }
    stopPlayback();
    try {
      const ctx = ensureAudioCtx();
      micStream = await getConfiguredMicStream();
      await runCountdown();

      recChunks = [];
      mediaRecorder = new MediaRecorder(micStream);
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recChunks.push(ev.data);
      };

      mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(recChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
          buffers.rawVocal = await ctx.decodeAudioData(await blob.arrayBuffer());
          // Compensate typical browser mic latency automatically (-110ms)
          setVocalOffset(-110, false);
          reprocessAutoTune();
          drawTimeline(0);
          showToast('🎤 ඔබේ කටහඬ Record විය! දැන් ▶️ Play Mix හෝ ✨ Smart Voice Match ඔබන්න!');
        } catch (decodeErr) {
          showToast('⚠️ කෙටි වැඩි හෝ හිස් recording එකකි. නැවත උත්සාහ කරන්න.');
        }
      };

      // Play backing track in headphones while recording!
      if (buffers.backing) {
        const monitorBacking = ctx.createBufferSource();
        monitorBacking.buffer = buffers.backing;
        const g = ctx.createGain();
        g.gain.value = params.backingGain ?? 0.85;
        monitorBacking.connect(g);
        g.connect(ctx.destination);
        monitorBacking.start();
        liveNodes = { sources: [monitorBacking] };
      } else if (currentYouTubeVideoId) {
        sendYouTubeCommand('playVideo');
      }

      isRecording = true;
      recStartTime = performance.now();
      startLiveMicMeter(ctx, micStream);
      mediaRecorder.start(200);

      const btn = document.getElementById('btnRecordVocal');
      btn.innerText = '⏹️ Stop Recording';
      btn.classList.add('recording');
    } catch (err) {
      showToast('⚠️ Microphone අවසරය ලබා දෙන්න: ' + err.message);
    }
  }

  function stopAllRecording() {
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (tabMediaRecorder && tabMediaRecorder.state !== 'inactive') tabMediaRecorder.stop();
    if (liveNodes && liveNodes.sources) {
      liveNodes.sources.forEach((s) => { try { s.stop(); } catch (_) {} });
      liveNodes = null;
    }
    sendYouTubeCommand('pauseVideo');
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    if (tabStream) { tabStream.getTracks().forEach((t) => t.stop()); tabStream = null; }
    monitorActive = false;

    const btn = document.getElementById('btnRecordVocal');
    btn.innerText = '🎙️ Record Voice';
    btn.classList.remove('recording');
    document.getElementById('btnRecTabAndMic').innerText = '🔴 YouTube Music + Mic එකවර Record කරන්න';
  }

  // ==================== PLAYBACK & REAL-TIME PARAMETER UPDATES ====================
  function getProjectDuration() {
    const b = buffers.backing ? buffers.backing.duration : 0;
    const v = buffers.rawVocal ? buffers.rawVocal.duration + Math.max(0, params.vocalOffsetMs / 1000) : 0;
    return Math.max(b, v, 0);
  }

  function getCurrentPlayheadSec() {
    if (!isPlaying || !audioCtx) return playStartOffsetSec;
    return Math.min(getProjectDuration(), playStartOffsetSec + (audioCtx.currentTime - playStartCtxTime));
  }

  function startPlayback(fromSec = playStartOffsetSec) {
    if (!buffers.backing && !buffers.rawVocal) {
      showToast('💡 මුලින්ම Track එකක් දමන්න — නැතහොත් ඉහත "⚡ Demo ගීතය" බොත්තම ඔබන්න!');
      return;
    }
    stopPlayback(false);
    const ctx = ensureAudioCtx();
    const dur = getProjectDuration();
    const startSec = fromSec >= dur - 0.15 ? 0 : Math.max(0, fromSec);

    // If user recorded on Mobile using only YouTube link (no local backing file), sync YouTube video playback automatically!
    if (!buffers.backing && currentYouTubeVideoId) {
      if (startSec < 0.2) sendYouTubeCommand('seekTo');
      sendYouTubeCommand('playVideo');
    }

    liveNodes = KaroDSP.buildStudioGraph(ctx, buffers, params, startSec);
    isPlaying = true;
    playStartOffsetSec = startSec;
    playStartCtxTime = ctx.currentTime;
    document.getElementById('btnPlayPause').innerText = '⏸️ Pause';

    const tick = () => {
      if (!isPlaying) return;
      const cur = getCurrentPlayheadSec();
      drawTimeline(cur);
      updateTimeReadout(cur, dur);
      if (cur >= dur) {
        stopPlayback(true);
        return;
      }
      animFrameId = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopPlayback(resetToZero = false) {
    if (isPlaying && audioCtx) {
      playStartOffsetSec = resetToZero ? 0 : getCurrentPlayheadSec();
    } else if (resetToZero) {
      playStartOffsetSec = 0;
    }
    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    if (!buffers.backing && currentYouTubeVideoId) {
      sendYouTubeCommand('pauseVideo');
    }
    if (liveNodes && liveNodes.sources) {
      liveNodes.sources.forEach((s) => { try { s.stop(); } catch (_) {} });
    }
    liveNodes = null;
    document.getElementById('btnPlayPause').innerText = '▶️ Play Mix';
    drawTimeline(playStartOffsetSec);
    updateTimeReadout(playStartOffsetSec, getProjectDuration());
  }

  function togglePlayback() {
    if (isPlaying) stopPlayback(false);
    else startPlayback(playStartOffsetSec);
  }

  function stopAndRewind() {
    stopPlayback(true);
  }

  function updateTimeReadout(cur, total) {
    const fmt = (s) =>
      String(Math.floor(s / 60)).padStart(2, '0') + ':' + (s % 60).toFixed(1).padStart(4, '0');
    document.getElementById('transportTime').innerText = `${fmt(cur)} / ${fmt(total)}`;
  }

  // Live instant parameter updates without interrupting playback!
  function updateParam(key, val, rebuildIfPlaying = false) {
    params[key] = val;
    syncSlidersFromParams();

    if (liveNodes && isPlaying) {
      if (rebuildIfPlaying) {
        const pos = getCurrentPlayheadSec();
        startPlayback(pos);
        return;
      }
      if (key === 'backingGain' && liveNodes.backingGain) {
        liveNodes.backingGain.gain.value = params.soloVocal ? 0 : val;
      }
      if (key === 'vocalGain' && liveNodes.vocalGain) liveNodes.vocalGain.gain.value = val;
      if (key === 'warmthDb' && liveNodes.warmth) liveNodes.warmth.gain.value = val;
      if (key === 'presenceDb' && liveNodes.presence) liveNodes.presence.gain.value = val;
      if (key === 'airDb' && liveNodes.air) liveNodes.air.gain.value = val;
      if (key === 'reverbMix' && liveNodes.rWet) liveNodes.rWet.gain.value = val;
      if (key === 'delayMix' && liveNodes.dWet) liveNodes.dWet.gain.value = val;
      if (key === 'delayTimeSec' && liveNodes.delay) liveNodes.delay.delayTime.value = val;
      if (key === 'vocalPocket' && liveNodes.pocketEq) liveNodes.pocketEq.gain.value = val ? -2.4 : 0;
    }
  }

  function onCompChange(sliderVal) {
    const thresh = -Number(sliderVal);
    const ratio = Number((1.5 + (Number(sliderVal) / 36) * 5).toFixed(1));
    params.compThreshold = thresh;
    params.compRatio = ratio;
    syncSlidersFromParams();
    if (liveNodes && liveNodes.comp) {
      liveNodes.comp.threshold.value = thresh;
      liveNodes.comp.ratio.value = ratio;
    }
  }

  function toggleBypassFx() {
    params.bypassFx = !params.bypassFx;
    const btn = document.getElementById('btnBypassFx');
    btn.innerText = params.bypassFx ? '🔇 Raw Voice Only (FX OFF)' : '👂 Original vs Mixed (FX ON)';
    btn.classList.toggle('btn-cyan', !params.bypassFx);
    if (isPlaying) startPlayback(getCurrentPlayheadSec());
  }

  function toggleSoloVocal() {
    params.soloVocal = !params.soloVocal;
    const btn = document.getElementById('btnSoloVocal');
    btn.classList.toggle('btn-primary', params.soloVocal);
    if (liveNodes && liveNodes.backingGain) {
      liveNodes.backingGain.gain.value = params.soloVocal ? 0 : params.backingGain;
    }
  }

  // ==================== AUTO-TUNE & SMART VOICE MATCH ====================
  function reprocessAutoTune() {
    if (!buffers.rawVocal) return;
    const ctx = ensureAudioCtx();
    const keyRoot = Number(document.getElementById('keySelect').value);
    const scaleName = document.getElementById('scaleSelect').value;
    const strength = Number(document.getElementById('atStrength').value) / 100;
    const retuneSpeed = Number(document.getElementById('atSpeed').value) / 100;

    params.autotuneAmount = strength;
    params.retuneSpeed = retuneSpeed;

    const result = KaroDSP.pitchCorrectBuffer(ctx, buffers.rawVocal, {
      keyRoot,
      scaleName,
      strength,
      retuneSpeed,
    });
    buffers.tunedVocal = result.buffer;
    pitchCurveData = result.pitchCurve;
    drawPitchGraph();

    if (isPlaying) {
      startPlayback(getCurrentPlayheadSec());
    }
  }

  function runSmartVoiceMatch() {
    if (!buffers.rawVocal) {
      showToast('⚠️ පළමුව කටහඬ Record කරන්න (හෝ "⚡ Demo ගීතය" බොත්තම ඔබන්න)');
      return;
    }
    const report = KaroDSP.analyzeVoiceProfile(buffers.rawVocal);
    activePresetKey = report.recommendedPreset;
    Object.assign(params, report.settings);
    document.getElementById('keySelect').value = String(report.suggestedKeyIndex);

    syncSlidersFromParams();
    renderPresetCards();
    reprocessAutoTune();

    const banner = document.getElementById('voiceReportBanner');
    banner.classList.add('visible');
    banner.innerHTML = `
      <div style="font-weight:800;color:#34d399;margin-bottom:4px;">
        ✨ Smart Voice Match විශ්ලේෂණය අවසන්!
      </div>
      <div><strong>හඬ පරාසය:</strong> ${report.registerSi} (Avg Pitch: ~${report.medianHz} Hz • Suggested Key: <strong>${report.suggestedKeyName}</strong>)</div>
      <div style="color:#cbd5e1;margin-top:3px;">${report.toneNoteSi}</div>
    `;
    showToast(`✨ ඔබේ කටහඬට ගැලපෙන "${KaroDSP.PRESETS[activePresetKey].name}" ස්වයංක්‍රීයව සකස් විය!`);
  }

  function applyPreset(key, restart = true) {
    const preset = KaroDSP.PRESETS[key];
    if (!preset) return;
    activePresetKey = key;
    Object.assign(params, preset);
    syncSlidersFromParams();
    renderPresetCards();
    if (buffers.rawVocal) reprocessAutoTune();
    else if (restart && isPlaying) startPlayback(getCurrentPlayheadSec());
  }

  function syncSlidersFromParams() {
    const fmtDb = (v) => (v >= 0 ? '+' : '') + Number(v).toFixed(1) + ' dB';
    document.getElementById('atStrength').value = Math.round((params.autotuneAmount ?? 0.55) * 100);
    document.getElementById('atStrengthText').innerText = Math.round((params.autotuneAmount ?? 0.55) * 100) + '%';
    document.getElementById('autotunePctVal').innerText = Math.round((params.autotuneAmount ?? 0.55) * 100) + '%';

    document.getElementById('atSpeed').value = Math.round((params.retuneSpeed ?? 0.35) * 100);
    document.getElementById('atSpeedText').innerText = Math.round((params.retuneSpeed ?? 0.35) * 100) + '%';

    const compAbs = Math.abs(params.compThreshold ?? -24);
    document.getElementById('compSlider').value = compAbs;
    document.getElementById('compValText').innerText = `${params.compThreshold} dB (${params.compRatio}:1)`;

    document.getElementById('warmthSlider').value = params.warmthDb;
    document.getElementById('warmthValText').innerText = fmtDb(params.warmthDb);

    document.getElementById('presenceSlider').value = params.presenceDb;
    document.getElementById('presenceValText').innerText = fmtDb(params.presenceDb);

    document.getElementById('airSlider').value = params.airDb;
    document.getElementById('airValText').innerText = fmtDb(params.airDb);

    document.getElementById('reverbMixSlider').value = Math.round(params.reverbMix * 100);
    document.getElementById('reverbMixText').innerText = Math.round(params.reverbMix * 100) + '%';

    document.getElementById('reverbDecaySlider').value = params.reverbDecay;
    document.getElementById('reverbDecayText').innerText = Number(params.reverbDecay).toFixed(1) + 's';

    document.getElementById('delayMixSlider').value = Math.round(params.delayMix * 100);
    document.getElementById('delayMixText').innerText = Math.round(params.delayMix * 100) + '%';

    document.getElementById('delayTimeSlider').value = Math.round(params.delayTimeSec * 1000);
    document.getElementById('delayTimeText').innerText = Math.round(params.delayTimeSec * 1000) + ' ms';

    document.getElementById('backingVolSlider').value = Math.round(params.backingGain * 100);
    document.getElementById('backingVolVal').innerText = Math.round(params.backingGain * 100) + '%';

    document.getElementById('vocalVolSlider').value = Math.round(params.vocalGain * 100);
    document.getElementById('vocalVolVal').innerText = Math.round(params.vocalGain * 100) + '%';

    document.getElementById('chkVocalPocket').checked = !!params.vocalPocket;
    document.getElementById('chkAutoMaster').checked = !!params.autoMaster;
  }

  // ==================== MANUAL SYNC OFFSET + DRAG WAVEFORM CANVAS ====================
  function setVocalOffset(ms, restartLive = false) {
    const clamped = Math.max(-800, Math.min(800, Math.round(Number(ms))));
    params.vocalOffsetMs = clamped;
    document.getElementById('syncOffsetSlider').value = clamped;
    document.getElementById('syncOffsetLabel').innerText =
      (clamped > 0 ? '+' : '') + clamped + ' ms';
    drawTimeline(getCurrentPlayheadSec());
    if (restartLive && isPlaying) {
      startPlayback(getCurrentPlayheadSec());
    }
  }

  function nudgeOffset(deltaMs) {
    setVocalOffset(params.vocalOffsetMs + deltaMs, true);
  }

  function autoAlignTracks() {
    if (!buffers.backing || !buffers.rawVocal) {
      setVocalOffset(-120, true);
      showToast('⚡ සාමාන්‍ය Mic Delay (-120ms) සකස් කරන ලදී.');
      return;
    }
    const suggested = KaroDSP.estimateSyncOffsetMs(buffers.backing, buffers.rawVocal);
    setVocalOffset(suggested, true);
    showToast(`🎯 Beat සහ Voice පරීක්ෂා කර Sync Offset එක ${suggested} ms ලෙස සකස් කරන ලදී!`);
  }

  function drawBufferPeaks(ctx2d, buffer, xOffsetPx, yTop, height, widthPx, color, totalDurSec) {
    if (!buffer || totalDurSec <= 0) return;
    const ch = buffer.getChannelData(0);
    const durRatio = buffer.duration / totalDurSec;
    const drawWidth = Math.max(1, widthPx * durRatio);
    const samplesPerPx = Math.max(1, Math.floor(ch.length / drawWidth));
    const midY = yTop + height / 2;

    ctx2d.fillStyle = color;
    for (let px = 0; px < drawWidth; px++) {
      const drawX = xOffsetPx + px;
      if (drawX < 0 || drawX > widthPx) continue;
      const start = px * samplesPerPx;
      let peak = 0;
      for (let k = 0; k < samplesPerPx; k += 8) {
        const v = Math.abs(ch[start + k] || 0);
        if (v > peak) peak = v;
      }
      const barH = Math.max(2, Math.min(height * 0.92, peak * height * 1.45));
      ctx2d.fillRect(drawX, midY - barH / 2, 1.5, barH);
    }
  }

  function drawTimeline(playheadSec = 0) {
    const canvas = document.getElementById('waveformCanvas');
    const c = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    c.clearRect(0, 0, W, H);

    c.fillStyle = '#070b14';
    c.fillRect(0, 0, W, H);

    // Subtle beat/second grid lines
    const totalDur = Math.max(getProjectDuration(), 10);
    c.strokeStyle = '#141e33';
    c.lineWidth = 1;
    for (let s = 0; s <= totalDur; s += 1) {
      const x = (s / totalDur) * W;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, H);
      c.stroke();
    }

    // Center divider between Track 1 and Track 2
    c.strokeStyle = '#263552';
    c.beginPath();
    c.moveTo(0, H / 2);
    c.lineTo(W, H / 2);
    c.stroke();

    // Track 1: Backing Karaoke Track
    c.fillStyle = '#94a3b8';
    c.font = 'bold 11.5px system-ui, sans-serif';
    c.fillText('TRACK 1 • KARAOKE MUSIC (Click top half to Seek)', 10, 16);
    if (buffers.backing) {
      drawBufferPeaks(c, buffers.backing, 0, 20, H / 2 - 24, W, 'rgba(34, 211, 238, 0.85)', totalDur);
    } else {
      c.fillStyle = '#475569';
      c.fillText('Track එකක් Upload කරන්න, YouTube Capture කරන්න, හෝ "⚡ Demo ගීතය" ඔබන්න', 10, 52);
    }

    // Track 2: Vocal Track (shifted visually by vocalOffsetMs!)
    const offsetPx = ((params.vocalOffsetMs / 1000) / totalDur) * W;
    c.fillStyle = '#fdba74';
    c.fillText(`TRACK 2 • YOUR VOCAL (Drag left/right to sync • Offset: ${params.vocalOffsetMs} ms)`, 10, H / 2 + 16);
    if (buffers.rawVocal) {
      drawBufferPeaks(c, buffers.rawVocal, offsetPx, H / 2 + 20, H / 2 - 24, W, 'rgba(249, 115, 22, 0.9)', totalDur);
    } else {
      c.fillStyle = '#475569';
      c.fillText('තවම කටහඬ Record කර නැත — "🎙️ Record Voice" ඔබන්න', 10, H / 2 + 52);
    }

    // Playhead cursor
    const playX = Math.min(W, Math.max(0, (playheadSec / totalDur) * W));
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(playX, 0);
    c.lineTo(playX, H);
    c.stroke();
  }

  function drawPitchGraph() {
    const canvas = document.getElementById('pitchCanvas');
    const c = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    c.fillStyle = '#070b14';
    c.fillRect(0, 0, W, H);

    const voiced = pitchCurveData.filter((p) => p.voiced);
    if (voiced.length < 3) {
      c.fillStyle = '#64748b';
      c.font = '11.5px system-ui, sans-serif';
      c.fillText('කටහඬ Record කළ පසු Auto-Tune ස්වර රේඛාව මෙහි පෙන්වයි', 14, H / 2 + 4);
      return;
    }

    let minM = Infinity, maxM = -Infinity;
    voiced.forEach((p) => {
      if (p.rawMidi < minM) minM = p.rawMidi;
      if (p.rawMidi > maxM) maxM = p.rawMidi;
    });
    minM = Math.floor(minM) - 1;
    maxM = Math.ceil(maxM) + 1;
    const span = Math.max(6, maxM - minM);

    // Semitone note grid lines
    c.strokeStyle = '#152038';
    c.lineWidth = 1;
    for (let m = minM; m <= maxM; m++) {
      const y = H - ((m - minM) / span) * H;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }

    const totalLen = pitchCurveData.length;
    const plotCurve = (key, color, width) => {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.beginPath();
      let penDown = false;
      pitchCurveData.forEach((pt, idx) => {
        if (!pt.voiced) {
          penDown = false;
          return;
        }
        const x = (idx / totalLen) * W;
        const y = H - ((pt[key] - minM) / span) * H;
        if (!penDown) {
          c.moveTo(x, y);
          penDown = true;
        } else {
          c.lineTo(x, y);
        }
      });
      c.stroke();
    };

    plotCurve('rawMidi', 'rgba(249, 115, 22, 0.72)', 1.5);
    plotCurve('tunedMidi', '#22d3ee', 2.2);
  }

  function setupCanvasInteractions() {
    const canvas = document.getElementById('waveformCanvas');
    let draggingVocal = false;
    let startX = 0;
    let startOffsetMs = 0;

    const getClientX = (e) => (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const getClientY = (e) => (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);

    const onDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const relY = getClientY(e) - rect.top;
      const relX = getClientX(e) - rect.left;
      const totalDur = Math.max(getProjectDuration(), 10);

      if (relY > rect.height / 2) {
        // Bottom half -> Drag Vocal Track directly left/right!
        draggingVocal = true;
        startX = getClientX(e);
        startOffsetMs = params.vocalOffsetMs;
      } else {
        // Top half -> Seek song playhead!
        const seekSec = Math.max(0, Math.min(totalDur, (relX / rect.width) * totalDur));
        playStartOffsetSec = seekSec;
        if (isPlaying) startPlayback(seekSec);
        else {
          drawTimeline(seekSec);
          updateTimeReadout(seekSec, getProjectDuration());
        }
      }
    };

    const onMove = (e) => {
      if (!draggingVocal) return;
      const rect = canvas.getBoundingClientRect();
      const dxPx = getClientX(e) - startX;
      // Fine drag scale: full width = 2400ms range for super smooth control
      const deltaMs = (dxPx / rect.width) * 2400;
      setVocalOffset(startOffsetMs + deltaMs, false);
    };

    const onUp = () => {
      if (draggingVocal) {
        draggingVocal = false;
        if (isPlaying) startPlayback(getCurrentPlayheadSec());
      }
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  }

  // ==================== RENDER UI LISTS, SAVE D1, EXPORT WAV ====================
  function renderPresetCards() {
    const grid = document.getElementById('presetGrid');
    let html = '';
    Object.entries(KaroDSP.PRESETS).forEach(([key, p]) => {
      const active = key === activePresetKey ? 'active' : '';
      html += `
        <div class="preset-card ${active}" onclick="App.applyPreset('${key}')">
          <div class="preset-name">${p.name}</div>
          <div class="preset-desc">${p.desc}</div>
        </div>
      `;
    });
    customD1Presets.forEach((cp, idx) => {
      html += `
        <div class="preset-card" onclick="App.applyCustomD1Preset(${idx})">
          <div class="preset-name">⭐ ${escapeHtml(cp.name)}</div>
          <div class="preset-desc">D1 Custom Saved Preset ${cp.voice_profile ? '• ' + escapeHtml(cp.voice_profile) : ''}</div>
        </div>
      `;
    });
    grid.innerHTML = html;
  }

  function applyCustomD1Preset(idx) {
    const cp = customD1Presets[idx];
    if (!cp) return;
    try {
      const parsed = JSON.parse(cp.settings_json);
      Object.assign(params, parsed);
      syncSlidersFromParams();
      reprocessAutoTune();
      showToast(`⭐ "${cp.name}" Preset එක ක්‍රියාත්මක විය!`);
    } catch (_) {}
  }

  async function saveCustomPresetToD1() {
    const name = prompt('ඔබේ Custom Vocal Preset එකට නමක් දෙන්න:', 'My Studio Voice');
    if (!name) return;
    await fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        voice_profile: `${document.getElementById('keySelect').selectedOptions[0].text}`,
        settings: params,
        is_public: true,
      }),
    });
    await loadServerState();
    showToast(`💾 "${name}" Preset එක Cloudflare D1 Database එකට Save විය!`);
  }

  async function saveProjectToD1() {
    const title = document.getElementById('projectTitleInput').value || 'Untitled Cover';
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        youtube_url: document.getElementById('ytUrlInput').value || '',
        preset_key: activePresetKey,
        musical_key: document.getElementById('keySelect').value,
        musical_scale: document.getElementById('scaleSelect').value,
        vocal_offset_ms: params.vocalOffsetMs,
        settings: params,
        duration_sec: getProjectDuration(),
      }),
    });
    await loadServerState();
    showToast(`💾 "${title}" ව්‍යාපාරික D1 Database එකේ සුරැකිණි!`);
  }

  function renderSavedProjects(projects) {
    savedD1Projects = projects || [];
    const box = document.getElementById('savedProjectsList');
    if (!savedD1Projects.length) {
      box.innerHTML = 'තවම Save කළ Mixes නොමැත ("💾 Save" ඔබන්න).';
      return;
    }
    box.innerHTML = savedD1Projects
      .map(
        (p, idx) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1e2942;">
        <div>
          <strong style="color:#f8fafc;">${escapeHtml(p.title)}</strong>
          <div style="font-size:11px;color:#94a3b8;">Preset: ${escapeHtml(p.preset_key)} • Sync: ${p.vocal_offset_ms}ms</div>
        </div>
        <button class="btn btn-sm" onclick="App.loadProjectByIndex(${idx})">Load</button>
      </div>
    `
      )
      .join('');
  }

  function loadProjectByIndex(idx) {
    const p = savedD1Projects[idx];
    if (!p) return;
    try {
      const s = typeof p.settings_json === 'string' ? JSON.parse(p.settings_json) : p.settings_json;
      Object.assign(params, s);
      setVocalOffset(params.vocalOffsetMs || 0, false);
      syncSlidersFromParams();
      reprocessAutoTune();
      showToast('📂 Saved Project Settings load කරන ලදී!');
    } catch (_) {}
  }

  async function exportMasteredWav() {
    if (!buffers.backing && !buffers.rawVocal) {
      showToast('⚠️ පළමුව ගීතයක් හෝ Demo Track එකක් දමන්න!');
      return;
    }

    // Freemium SaaS Gate Check (3 free exports/mo unless Pro!)
    const isPro = userState.plan && userState.plan.startsWith('pro');
    if (!isPro && (userState.exports_this_month || 0) >= 3) {
      showToast('🔒 Free මාසික සීමාව (3/3) අවසන්! ඉහළ ඇති "💎 Pro Test" බොත්තම ඔබා Unlimited Exports සක්‍රීය කරන්න!');
      return;
    }

    const btn = document.getElementById('btnRenderMaster');
    btn.disabled = true;
    btn.innerText = '⏳ Auto-Mastering & Rendering...';

    try {
      const wavBlob = await KaroDSP.renderMasterWav(buffers, { ...params, bypassFx: false, soloVocal: false });
      const url = URL.createObjectURL(wavBlob);

      const player = document.getElementById('renderedAudioPlayer');
      player.src = url;
      document.getElementById('masterOutputArea').style.display = 'block';

      const safeTitle = (document.getElementById('projectTitleInput').value || 'karomix-master')
        .replace(/[^a-zA-Z0-9_-]+/g, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}_Mastered.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      await fetch('/api/track-export', { method: 'POST' });
      await loadServerState();
      showToast('🎉 සුපිරි! Auto-Mastered 44.1kHz Stereo WAV ගීතය Download විය!');
    } catch (err) {
      showToast('❌ Render දෝෂයකි: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerText = '💿 Auto-Master & WAV Download';
    }
  }

  function shiftBackingKey(delta) {
    if (!buffers.originalBacking) {
      showToast('⚠️ පළමුව Karaoke Track එකක් හෝ Demo ගීතය load කරන්න!');
      return;
    }
    const next = Math.max(-6, Math.min(6, backingSemitones + delta));
    if (next === backingSemitones) return;
    const prevDelta = next - backingSemitones;
    backingSemitones = next;
    const ctx = ensureAudioCtx();
    buffers.backing = KaroDSP.transposeBuffer(ctx, buffers.originalBacking, backingSemitones);

    // Automatically shift singer Auto-Tune Key by the exact same semitones!
    const keySel = document.getElementById('keySelect');
    const curKey = Number(keySel.value);
    keySel.value = String((((curKey + prevDelta) % 12) + 12) % 12);
    document.getElementById('transposeLabel').innerText =
      (backingSemitones > 0 ? '+' : '') + backingSemitones + ' st';

    if (buffers.rawVocal) reprocessAutoTune();
    else if (isPlaying) startPlayback(getCurrentPlayheadSec());
    drawTimeline(getCurrentPlayheadSec());
    showToast(`🎼 ගීතයේ Key එක ${backingSemitones > 0 ? '+' : ''}${backingSemitones} Semitones (${keySel.selectedOptions[0].text}) වෙත මාරු විය!`);
  }

  function resetBackingKey() {
    if (!buffers.originalBacking || backingSemitones === 0) return;
    shiftBackingKey(-backingSemitones);
  }

  // Boot
  window.addEventListener('DOMContentLoaded', () => {
    setupCanvasInteractions();
    syncSlidersFromParams();
    renderPresetCards();
    drawTimeline(0);
    drawPitchGraph();
    loadServerState();
  });

  return {
    switchSourceTab,
    switchSourceTabById,
    loadYouTubeLink,
    handleBackingUpload,
    handleVocalUpload,
    loadFullDemo,
    toggleMicMonitor,
    toggleMicRecording,
    startTabPlusMicRecord,
    togglePlayback,
    stopAndRewind,
    updateParam,
    onCompChange,
    toggleBypassFx,
    toggleSoloVocal,
    reprocessAutoTune,
    runSmartVoiceMatch,
    applyPreset,
    applyCustomD1Preset,
    setVocalOffset,
    nudgeOffset,
    autoAlignTracks,
    shiftBackingKey,
    resetBackingKey,
    saveCustomPresetToD1,
    saveProjectToD1,
    loadProjectByIndex,
    exportMasteredWav,
    toggleProDemo,
  };
})();
