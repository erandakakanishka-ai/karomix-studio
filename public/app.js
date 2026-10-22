/**
 * KaroMix AI Studio v3 - Application Controller
 * Instant Song-Name Karaoke Video Search, LRCLIB Synced Teleprompter, AudioMotion Spectrum, SoundTouch & D1 Cloud
 */

window.App = (() => {
  let audioCtx = null;
  let audioMotion = null;
  const buffers = {
    originalBacking: null,
    backing: null,
    rawVocal: null,
    tunedVocal: null,
  };
  let backingSemitones = 0;
  let karaokeCutActive = false;
  let pitchCurveData = [];
  let activePresetKey = 'sinhala_ballad';
  let customD1Presets = [];
  let savedD1Projects = [];
  let authMode = 'login';
  let authToken = '';
  let userState = { display_name: 'Guest Artist', plan: 'free', exports_this_month: 0 };

  let karaokeResults = [];
  let activeKaraokeIdx = 0;
  let currentYouTubeVideoId = '';
  let parsedLyrics = [];
  let lastActiveLyricIdx = -1;

  try {
    authToken = localStorage.getItem('karomix_token') || '';
  } catch (_) {}

  const params = {
    ...KaroDSP.PRESETS.sinhala_ballad,
    vocalOffsetMs: 0,
    bypassFx: false,
    soloVocal: false,
    muteBacking: false,
    muteVocal: false,
  };

  let isPlaying = false;
  let playStartCtxTime = 0;
  let playStartOffsetSec = 0;
  let liveNodes = null;
  let animFrameId = null;

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

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function apiHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (authToken) h.Authorization = 'Bearer ' + authToken;
    return h;
  }

  function ensureAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC({ latencyHint: 'interactive' });
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Open-Source AudioMotionAnalyzer Integration (64-band Studio LED RTA Visualizer)
  function connectSpectrumAnalyzer(masterNode) {
    const container = document.getElementById('audioMotionBox');
    if (!container || !window.AudioMotionAnalyzer || !masterNode) return;
    try {
      if (!audioMotion) {
        audioMotion = new window.AudioMotionAnalyzer(container, {
          audioCtx: ensureAudioCtx(),
          connectSpeakers: false,
          mode: 6,
          barSpace: 0.25,
          ledBars: true,
          showPeaks: true,
          showScaleX: false,
          showScaleY: false,
          bgAlpha: 0,
          overlay: true,
        });
        audioMotion.registerGradient('karomix', {
          bgColor: '#070910',
          colorStops: [
            { pos: 0.0, color: '#f59e0b' },
            { pos: 0.55, color: '#fbbf24' },
            { pos: 1.0, color: '#38bdf8' },
          ],
        });
        audioMotion.gradient = 'karomix';
      } else {
        audioMotion.disconnectInput();
      }
      audioMotion.connectInput(masterNode);
    } catch (_) {}
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.innerText = msg;
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ==================== NAVIGATION & TABS ====================
  function switchView(viewId) {
    document.querySelectorAll('.app-view').forEach((v) => v.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');

    document.querySelectorAll('[data-view]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-view') === viewId);
    });

    if (viewId === 'studio') {
      requestAnimationFrame(() => {
        drawTimeline(getCurrentPlayheadSec());
        drawPitchGraph();
      });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openInspectorTab(tabId) {
    document.querySelectorAll('.insp-pane').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.insp-tab').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-itab') === tabId);
    });
    const pane = document.getElementById('itab-' + tabId);
    if (pane) pane.classList.add('active');
    if (tabId === 'autotune') requestAnimationFrame(drawPitchGraph);
  }

  function switchSourceSub(subId, btn) {
    ['yt', 'lyrics', 'upload', 'synth'].forEach((id) => {
      const el = document.getElementById('sub-' + id);
      if (el) el.style.display = id === subId ? 'block' : 'none';
    });
    if (btn && btn.parentElement) {
      btn.parentElement.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }

  // ==================== INSTANT KARAOKE SEARCH & LRCLIB SYNCED LYRICS ====================
  function extractYouTubeId(url) {
    if (!url) return '';
    const t = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
    for (const p of [/[?&]v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/, /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/]) {
      const m = t.match(p);
      if (m) return m[1];
    }
    return '';
  }

  function heroSearchSubmit(e) {
    e.preventDefault();
    const q = document.getElementById('heroSongQuery').value.trim();
    if (!q) return;
    quickSingSong(q);
  }

  async function quickSingSong(songQuery) {
    switchView('studio');
    openInspectorTab('source');
    switchSourceSub('yt', document.getElementById('srcTabSearch'));
    document.getElementById('ytUrlInput').value = songQuery;
    await searchOrLoadKaraoke();
  }

  async function searchOrLoadKaraoke() {
    const input = document.getElementById('ytUrlInput').value.trim();
    if (!input) return showToast('Type any song title or artist first');

    const directId = extractYouTubeId(input);
    if (directId && (input.includes('http') || input.length === 11)) {
      selectKaraokeVideo({ id: directId, title: 'YouTube Karaoke Track', channel: 'Direct Link', duration: '' }, -1);
      return;
    }

    const btn = document.getElementById('btnKaraokeSearch');
    btn.disabled = true;
    btn.innerText = 'Searching...';

    try {
      // Search playable HD Karaoke videos AND time-synced LRCLIB lyrics concurrently!
      fetchSyncedLyrics(input, true);

      const res = await fetch('/api/search-karaoke?q=' + encodeURIComponent(input));
      const data = await res.json();
      karaokeResults = data.videos || [];

      if (!karaokeResults.length) {
        showToast('No videos matched — try adding artist name');
        return;
      }

      renderKaraokeResultsStrip();
      selectKaraokeVideo(karaokeResults[0], 0);
      document.getElementById('btnNextKaraoke').style.display = karaokeResults.length > 1 ? 'inline-flex' : 'none';
      showToast('Loaded karaoke video + synced lyrics! Press Record anytime.');
    } catch (_) {
      showToast('Search temporarily busy — please retry');
    } finally {
      btn.disabled = false;
      btn.innerText = 'Search';
    }
  }

  function renderKaraokeResultsStrip() {
    const strip = document.getElementById('karaokeResultsStrip');
    if (!karaokeResults.length) {
      strip.style.display = 'none';
      return;
    }
    strip.style.display = 'flex';
    strip.innerHTML = karaokeResults
      .map(
        (v, idx) => `
      <div class="yt-card ${idx === activeKaraokeIdx ? 'active' : ''}" onclick="App.pickKaraokeByIndex(${idx})">
        <div class="yt-card-thumb">
          <img src="${escapeHtml(v.thumbnail)}" alt="" loading="lazy" />
          ${v.duration ? `<span class="yt-dur mono">${escapeHtml(v.duration)}</span>` : ''}
        </div>
        <div class="yt-card-meta">
          <div class="yt-card-title">${escapeHtml(v.title)}</div>
        </div>
      </div>
    `
      )
      .join('');
  }

  function pickKaraokeByIndex(idx) {
    const v = karaokeResults[idx];
    if (!v) return;
    selectKaraokeVideo(v, idx);
  }

  function nextKaraokeResult() {
    if (!karaokeResults.length) return;
    const nextIdx = (activeKaraokeIdx + 1) % karaokeResults.length;
    selectKaraokeVideo(karaokeResults[nextIdx], nextIdx);
    showToast(`Switched to version ${nextIdx + 1}/${karaokeResults.length}`);
  }

  function selectKaraokeVideo(v, idx) {
    activeKaraokeIdx = idx;
    currentYouTubeVideoId = v.id;
    renderKaraokeResultsStrip();
    const originParam = encodeURIComponent(window.location.origin);
    document.getElementById('ytPlayerContainer').innerHTML =
      `<iframe id="ytIframe" src="https://www.youtube.com/embed/${encodeURIComponent(v.id)}?enablejsapi=1&autoplay=1&rel=0&origin=${originParam}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    document.getElementById('backingStatusBadge').innerText = v.title ? v.title.slice(0, 32) : `Karaoke (${v.id})`;
    if (v.title && v.title !== 'YouTube Karaoke Track') {
      document.getElementById('projectTitleInput').value = v.title.replace(/\(.*?\)|\[.*?\]/g, '').trim().slice(0, 38) + ' — Cover';
    }
  }

  function parseLrcText(lrc) {
    const lines = [];
    const regex = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]\s*(.*)/;
    lrc.split('\n').forEach((row) => {
      const m = row.match(regex);
      if (m) {
        const sec = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
        const text = m[3].trim();
        if (text) lines.push({ sec, text });
      }
    });
    return lines.sort((a, b) => a.sec - b.sec);
  }

  async function fetchSyncedLyrics(query, silent = false) {
    const q = (query || '').trim();
    if (!q) return;
    document.getElementById('lrcQueryInput').value = q;
    const box = document.getElementById('lyricsStageBox');

    try {
      const res = await fetch('/api/lyrics?q=' + encodeURIComponent(q));
      const data = await res.json();
      const track = data.track;
      if (!track) {
        if (!silent) showToast('No lyrics found for that title');
        return;
      }

      if (track.syncedLyrics) {
        parsedLyrics = parseLrcText(track.syncedLyrics);
        box.innerHTML = parsedLyrics
          .map((l, i) => `<div class="lyric-line ${i === 0 ? 'active' : ''}" id="lrc-line-${i}" onclick="App.seekToLyric(${l.sec})">${escapeHtml(l.text)}</div>`)
          .join('');
      } else if (track.plainLyrics) {
        parsedLyrics = [];
        box.innerHTML = track.plainLyrics
          .split('\n')
          .filter(Boolean)
          .map((t, i) => `<div class="lyric-line ${i === 0 ? 'active' : ''}">${escapeHtml(t)}</div>`)
          .join('');
      }
      if (!silent) showToast(`Synced lyrics loaded: ${track.trackName} — ${track.artistName}`);
    } catch (_) {}
  }

  function seekToLyric(sec) {
    playStartOffsetSec = sec;
    if (isPlaying) startPlayback(sec);
    else {
      drawTimeline(sec);
      updateTimeReadout(sec, getProjectDuration());
    }
  }

  function updateLyricsScroll(curSec) {
    if (!parsedLyrics.length) return;
    let idx = 0;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (curSec >= parsedLyrics[i].sec) idx = i;
      else break;
    }
    if (idx !== lastActiveLyricIdx) {
      lastActiveLyricIdx = idx;
      document.querySelectorAll('.lyric-line.active').forEach((el) => el.classList.remove('active'));
      const activeEl = document.getElementById('lrc-line-' + idx);
      if (activeEl) {
        activeEl.classList.add('active');
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  function sendYouTubeCommand(func) {
    const iframe = document.getElementById('ytIframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
    }
  }

  // ==================== AUTH & CLOUD D1 ====================
  function openAuthModal() {
    const loggedIn = Boolean(authToken && userState.email && !userState.id?.startsWith('demo-singer'));
    document.getElementById('authLoggedInBox').style.display = loggedIn ? 'block' : 'none';
    document.getElementById('authForm').style.display = loggedIn ? 'none' : 'block';
    if (loggedIn) {
      document.getElementById('authUserName').innerText = userState.display_name || 'Artist';
      document.getElementById('authUserEmail').innerText = userState.email || '';
    }
    document.getElementById('authModal').classList.add('open');
  }

  function closeAuthModal() {
    document.getElementById('authModal').classList.remove('open');
  }

  function setAuthMode(mode) {
    authMode = mode;
    document.getElementById('tabLoginBtn').classList.toggle('btn-amber', mode === 'login');
    document.getElementById('tabRegBtn').classList.toggle('btn-amber', mode === 'register');
    document.getElementById('authNameWrap').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('authSubmitBtn').innerText = mode === 'login' ? 'Sign In to Studio' : 'Create Studio Account';
  }

  async function submitAuth(e) {
    e.preventDefault();
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = {
      email: document.getElementById('authEmail').value,
      password: document.getElementById('authPassword').value,
      display_name: document.getElementById('authName').value,
    };
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || 'Authentication failed');
      authToken = data.token;
      try { localStorage.setItem('karomix_token', authToken); } catch (_) {}
      closeAuthModal();
      await loadServerState();
      showToast('Welcome, ' + (data.user.display_name || data.user.email));
    } catch (_) {
      showToast('Connection error');
    }
  }

  function logout() {
    authToken = '';
    try { localStorage.removeItem('karomix_token'); } catch (_) {}
    closeAuthModal();
    loadServerState();
    showToast('Signed out');
  }

  async function loadServerState() {
    try {
      const res = await fetch('/api/state', { headers: apiHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.user) {
        userState = data.user;
        updateQuotaUI(data.authenticated);
      }
      customD1Presets = data.presets || [];
      renderPresetCards();
      renderSavedProjects(data.projects || []);
    } catch (_) {
      renderPresetCards();
    }
  }

  function updateQuotaUI(authenticated) {
    const isPro = userState.plan && userState.plan.startsWith('pro');
    const used = userState.exports_this_month ?? 0;
    document.getElementById('topPlanBadge').innerText = isPro ? 'PRO ARTIST' : `FREE • ${used}/3`;
    document.getElementById('proActionBtn').innerText = isPro ? 'Pro Active (Switch to Free)' : 'Activate Pro Artist Pass';
    document.getElementById('authTriggerBtn').innerText = authenticated && userState.display_name
      ? userState.display_name.slice(0, 12)
      : 'Sign In';
  }

  async function toggleProDemo() {
    const nextPlan = userState.plan === 'free' ? 'pro_global' : 'free';
    await fetch('/api/upgrade-demo', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ plan: nextPlan }),
    });
    await loadServerState();
    showToast(nextPlan === 'free' ? 'Switched to Free Creator Plan' : 'Pro Artist Unlimited Unlocked!');
  }

  // ==================== TRACK UPLOAD, DEMO & VOCAL REMOVER ====================
  async function handleBackingUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    stopPlayback();
    const ctx = ensureAudioCtx();
    showToast('Decoding audio track...');
    try {
      buffers.originalBacking = await ctx.decodeAudioData(await file.arrayBuffer());
      buffers.backing = buffers.originalBacking;
      backingSemitones = 0;
      karaokeCutActive = false;
      document.getElementById('btnKaraokeCut').classList.remove('btn-cyan');
      document.getElementById('transposeLabel').innerText = '0 st';
      const cleanName = file.name.replace(/\.[^.]+$/, '');
      document.getElementById('backingStatusBadge').innerText = `${cleanName.slice(0, 22)} (${buffers.backing.duration.toFixed(1)}s)`;
      document.getElementById('projectTitleInput').value = cleanName + ' — Cover';
      fetchSyncedLyrics(cleanName, true);
      drawTimeline(0);
      updateTimeReadout(0, getProjectDuration());
      showToast('Instrumental loaded — tap Vocal Remover if song has original vocals!');
    } catch (_) {
      showToast('Unsupported format — please choose MP3, WAV, M4A, or MP4');
    }
  }

  async function handleVocalUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    stopPlayback();
    const ctx = ensureAudioCtx();
    try {
      buffers.rawVocal = await ctx.decodeAudioData(await file.arrayBuffer());
      reprocessAutoTune();
      drawTimeline(0);
      showToast('Vocal imported to Track 02');
    } catch (_) {
      showToast('Could not decode vocal file');
    }
  }

  function applyKaraokeVocalCut() {
    if (!buffers.originalBacking) return showToast('Upload or load an audio track first');
    const ctx = ensureAudioCtx();
    karaokeCutActive = !karaokeCutActive;
    const base = backingSemitones !== 0
      ? KaroDSP.transposeBuffer(ctx, buffers.originalBacking, backingSemitones)
      : buffers.originalBacking;
    buffers.backing = karaokeCutActive ? KaroDSP.centerCutKaraokeBuffer(ctx, base) : base;
    document.getElementById('btnKaraokeCut').classList.toggle('btn-cyan', karaokeCutActive);
    drawTimeline(getCurrentPlayheadSec());
    if (isPlaying) startPlayback(getCurrentPlayheadSec());
    showToast(karaokeCutActive ? 'Stereo Center Vocal Remover ON' : 'Full Original Stereo Restored');
  }

  function loadFullDemo(includeVocal = true) {
    stopPlayback();
    const ctx = ensureAudioCtx();
    const demo = KaroDSP.generateDemoSession(ctx);
    buffers.originalBacking = demo.backing;
    buffers.backing = demo.backing;
    backingSemitones = 0;
    karaokeCutActive = false;
    document.getElementById('btnKaraokeCut').classList.remove('btn-cyan');
    document.getElementById('transposeLabel').innerText = '0 st';
    document.getElementById('backingStatusBadge').innerText = 'Midnight Ballad (Am • 90 BPM)';
    document.getElementById('projectTitleInput').value = 'Midnight Ballad — Studio Cover';
    document.getElementById('keySelect').value = '9';
    document.getElementById('scaleSelect').value = 'minor';

    if (includeVocal) {
      buffers.rawVocal = demo.vocal;
      setVocalOffset(-120, false);
      applyPreset('sinhala_ballad', false);
      reprocessAutoTune();
    } else {
      buffers.rawVocal = null;
      buffers.tunedVocal = null;
      pitchCurveData = [];
      drawPitchGraph();
    }
    updateChips();
    drawTimeline(0);
    updateTimeReadout(0, getProjectDuration());
  }

  function launchInstantShowcase() {
    switchView('studio');
    loadFullDemo(true);
    setTimeout(() => startPlayback(0), 120);
  }

  // ==================== RECORDING & LIVE VOCAL TUNER ====================
  async function getConfiguredMicStream() {
    const cleanMode = document.getElementById('micModeSelect').value === 'clean';
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: cleanMode, noiseSuppression: cleanMode, autoGainControl: cleanMode },
    });
  }

  async function toggleMicMonitor() {
    const btn = document.getElementById('btnMicCheck');
    if (monitorActive) {
      monitorActive = false;
      if (micStream && !isRecording) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
      cancelAnimationFrame(meterRaf);
      document.getElementById('micMeterFill').style.width = '0%';
      document.getElementById('livePitchText').innerText = 'Tuner: --';
      btn.innerText = 'Mic Check';
      return;
    }
    try {
      const ctx = ensureAudioCtx();
      micStream = await getConfiguredMicStream();
      startLiveMicMeter(ctx, micStream);
      monitorActive = true;
      btn.innerText = 'Stop Check';
    } catch (_) {
      showToast('Allow microphone permission in your browser settings');
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
      document.getElementById('micMeterFill').style.width = Math.min(100, Math.round(rms * 340)) + '%';

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
        updateLyricsScroll((performance.now() - recStartTime) / 1000);
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
        if (count <= 0) { clearInterval(iv); overlay.classList.remove('show'); resolve(); }
        else numEl.innerText = count;
      }, 700);
    });
  }

  async function startTabPlusMicRecord() {
    if (isRecording) return stopAllRecording();
    try {
      const ctx = ensureAudioCtx();
      tabStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (tabStream.getAudioTracks().length === 0) {
        tabStream.getTracks().forEach((t) => t.stop());
        return showToast('Enable "Share tab audio" in the popup prompt');
      }
      micStream = await getConfiguredMicStream();
      await runCountdown();

      tabChunks = []; recChunks = [];
      tabMediaRecorder = new MediaRecorder(new MediaStream(tabStream.getAudioTracks()));
      mediaRecorder = new MediaRecorder(micStream);
      tabMediaRecorder.ondataavailable = (ev) => { if (ev.data.size > 0) tabChunks.push(ev.data); };
      mediaRecorder.ondataavailable = (ev) => { if (ev.data.size > 0) recChunks.push(ev.data); };

      const done = Promise.all([
        new Promise((r) => { tabMediaRecorder.onstop = r; }),
        new Promise((r) => { mediaRecorder.onstop = r; }),
      ]);

      isRecording = true;
      recStartTime = performance.now();
      startLiveMicMeter(ctx, micStream);
      sendYouTubeCommand('playVideo');
      tabMediaRecorder.start(200);
      mediaRecorder.start(200);
      setRecordingButtonsUI(true);

      done.then(async () => {
        buffers.originalBacking = await ctx.decodeAudioData(await new Blob(tabChunks).arrayBuffer());
        buffers.backing = buffers.originalBacking;
        buffers.rawVocal = await ctx.decodeAudioData(await new Blob(recChunks).arrayBuffer());
        setVocalOffset(-95, false);
        reprocessAutoTune();
        drawTimeline(0);
        document.getElementById('backingStatusBadge').innerText = `Captured Karaoke (${buffers.backing.duration.toFixed(1)}s)`;
        showToast('Captured karaoke music + vocal cleanly!');
      });
    } catch (_) {
      showToast('Screen audio capture cancelled');
    }
  }

  async function toggleMicRecording() {
    if (isRecording) return stopAllRecording();
    stopPlayback();
    try {
      const ctx = ensureAudioCtx();
      micStream = await getConfiguredMicStream();
      await runCountdown();

      recChunks = [];
      mediaRecorder = new MediaRecorder(micStream);
      mediaRecorder.ondataavailable = (ev) => { if (ev.data.size > 0) recChunks.push(ev.data); };
      mediaRecorder.onstop = async () => {
        try {
          buffers.rawVocal = await ctx.decodeAudioData(await new Blob(recChunks).arrayBuffer());
          setVocalOffset(-110, false);
          reprocessAutoTune();
          drawTimeline(0);
          showToast('Vocal take captured — press Play to hear your studio mix!');
        } catch (_) {
          showToast('Recording was too short — please try again');
        }
      };

      if (buffers.backing) {
        const monitorBacking = ctx.createBufferSource();
        monitorBacking.buffer = buffers.backing;
        const g = ctx.createGain();
        g.gain.value = params.backingGain ?? 0.82;
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
      setRecordingButtonsUI(true);
    } catch (_) {
      showToast('Microphone permission is required to record');
    }
  }

  function setRecordingButtonsUI(rec) {
    const b1 = document.getElementById('btnRecordVocal');
    const b2 = document.getElementById('btnTopRecord');
    b1.classList.toggle('recording', rec);
    b2.classList.toggle('recording', rec);
    document.getElementById('topRecText').innerText = rec ? 'Stop' : 'Record';
    b1.querySelector('span').innerText = rec ? 'Stop Recording' : 'Start Recording';
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
    setRecordingButtonsUI(false);
  }

  // ==================== PLAYBACK ENGINE ====================
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
    if (!buffers.backing && !buffers.rawVocal) loadFullDemo(true);
    stopPlayback(false);
    const ctx = ensureAudioCtx();
    const dur = getProjectDuration();
    const startSec = fromSec >= dur - 0.15 ? 0 : Math.max(0, fromSec);

    if (!buffers.backing && currentYouTubeVideoId) sendYouTubeCommand('playVideo');

    liveNodes = KaroDSP.buildStudioGraph(ctx, buffers, params, startSec);
    if (liveNodes.masterAnalyser) connectSpectrumAnalyzer(liveNodes.masterAnalyser);

    isPlaying = true;
    playStartOffsetSec = startSec;
    playStartCtxTime = ctx.currentTime;
    document.getElementById('playBtnText').innerText = 'Pause';

    const tick = () => {
      if (!isPlaying) return;
      const cur = getCurrentPlayheadSec();
      drawTimeline(cur);
      updateLyricsScroll(cur);
      updateTimeReadout(cur, dur);
      if (cur >= dur) { stopPlayback(true); return; }
      animFrameId = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopPlayback(resetToZero = false) {
    if (isPlaying && audioCtx) playStartOffsetSec = resetToZero ? 0 : getCurrentPlayheadSec();
    else if (resetToZero) playStartOffsetSec = 0;

    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    if (!buffers.backing && currentYouTubeVideoId) sendYouTubeCommand('pauseVideo');
    if (liveNodes && liveNodes.sources) {
      liveNodes.sources.forEach((s) => { try { s.stop(); } catch (_) {} });
    }
    liveNodes = null;
    document.getElementById('playBtnText').innerText = 'Play';
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
    const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + (s % 60).toFixed(1).padStart(4, '0');
    document.getElementById('transportTime').innerText = `${fmt(cur)} / ${fmt(total)}`;
  }

  // ==================== DSP PARAMS, PRESETS & AUTO-TUNE ====================
  function updateChips() {
    const kName = KaroDSP.NOTE_NAMES[Number(document.getElementById('keySelect')?.value || 9)];
    const sc = document.getElementById('scaleSelect')?.value || 'minor';
    document.getElementById('chipKey').innerText = kName + (sc === 'minor' ? 'm' : '');
    document.getElementById('chipSync').innerText = (params.vocalOffsetMs > 0 ? '+' : '') + params.vocalOffsetMs + 'ms';
    const p = KaroDSP.PRESETS[activePresetKey];
    if (p) document.getElementById('chipPreset').innerText = p.nameEn;
  }

  function updateParam(key, val, rebuildIfPlaying = false) {
    params[key] = val;
    syncSlidersFromParams();
    if (liveNodes && isPlaying) {
      if (rebuildIfPlaying) return startPlayback(getCurrentPlayheadSec());
      if (key === 'backingGain' && liveNodes.backingGain) liveNodes.backingGain.gain.value = params.soloVocal ? 0 : val;
      if (key === 'vocalGain' && liveNodes.vocalGain) liveNodes.vocalGain.gain.value = val;
      if (key === 'warmthDb' && liveNodes.warmth) liveNodes.warmth.gain.value = val;
      if (key === 'presenceDb' && liveNodes.presence) liveNodes.presence.gain.value = val;
      if (key === 'airDb' && liveNodes.air) liveNodes.air.gain.value = val;
      if (key === 'doublerMix' && liveNodes.dblWet) liveNodes.dblWet.gain.value = val * 0.55;
      if (key === 'reverbMix' && liveNodes.rWet) liveNodes.rWet.gain.value = val * 1.35;
      if (key === 'delayMix' && liveNodes.dWet) liveNodes.dWet.gain.value = val * 1.25;
      if (key === 'delayTimeSec' && liveNodes.delay) liveNodes.delay.delayTime.value = val;
      if (key === 'vocalPocket' && liveNodes.pocketEq) liveNodes.pocketEq.gain.value = val ? -2.5 : 0;
    }
  }

  function setMasterProfile(profileKey) {
    params.masterProfile = profileKey;
    ['warm', 'balanced', 'loud'].forEach((k) => {
      document.getElementById('mp-' + k).classList.toggle('active', k === profileKey);
    });
    if (isPlaying) startPlayback(getCurrentPlayheadSec());
  }

  function onNoiseGateChange(val) {
    params.noiseGate = Number(val) / 100;
    document.getElementById('gateValText').innerText = Math.round(Number(val)) + '%';
    if (buffers.rawVocal) reprocessAutoTune();
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
    btn.innerText = params.bypassFx ? 'RAW MIC' : 'FX ON';
    btn.classList.toggle('btn-cyan', !params.bypassFx);
    if (isPlaying) startPlayback(getCurrentPlayheadSec());
  }

  function toggleSoloVocal() {
    params.soloVocal = !params.soloVocal;
    document.getElementById('btnSoloVocal').classList.toggle('btn-amber', params.soloVocal);
    if (liveNodes && liveNodes.backingGain) {
      liveNodes.backingGain.gain.value = params.soloVocal ? 0 : params.backingGain;
    }
  }

  function reprocessAutoTune() {
    updateChips();
    if (!buffers.rawVocal) return;
    const ctx = ensureAudioCtx();
    const keyRoot = Number(document.getElementById('keySelect').value);
    const scaleName = document.getElementById('scaleSelect').value;
    const strength = Number(document.getElementById('atStrength').value) / 100;
    const retuneSpeed = Number(document.getElementById('atSpeed').value) / 100;
    params.autotuneAmount = strength;
    params.retuneSpeed = retuneSpeed;

    const result = KaroDSP.pitchCorrectBuffer(ctx, buffers.rawVocal, {
      keyRoot, scaleName, strength, retuneSpeed, noiseGate: params.noiseGate ?? 0.55,
    });
    buffers.tunedVocal = result.buffer;
    pitchCurveData = result.pitchCurve;
    document.getElementById('pitchScoreBadge').innerText = `PITCH ${result.pitchScore || 94}%`;
    drawPitchGraph();
    if (isPlaying) startPlayback(getCurrentPlayheadSec());
  }

  function runSmartVoiceMatch() {
    if (!buffers.rawVocal) loadFullDemo(true);
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
      <div style="font-weight:700;color:var(--emerald);margin-bottom:3px;">AI Voice Profile Matched</div>
      <div><strong>Register:</strong> ${escapeHtml(report.registerEn)} • Fundamental <strong>${report.medianHz} Hz</strong> • Key <strong>${report.suggestedKeyName}</strong></div>
      <div style="color:var(--text-secondary);margin-top:2px;">${escapeHtml(report.toneNoteEn)}</div>
    `;
    showToast('AI matched vocal chain: ' + KaroDSP.PRESETS[activePresetKey].nameEn);
  }

  function applyPreset(key, restart = true) {
    const preset = KaroDSP.PRESETS[key];
    if (!preset) return;
    activePresetKey = key;
    Object.assign(params, preset);
    setMasterProfile(preset.masterProfile || 'warm');
    syncSlidersFromParams();
    renderPresetCards();
    updateChips();
    if (buffers.rawVocal) reprocessAutoTune();
    else if (restart && isPlaying) startPlayback(getCurrentPlayheadSec());
  }

  function syncSlidersFromParams() {
    const fmtDb = (v) => (v >= 0 ? '+' : '') + Number(v).toFixed(1) + ' dB';
    const pct = Math.round((params.autotuneAmount ?? 0.25) * 100);
    document.getElementById('atStrength').value = pct;
    document.getElementById('atStrengthText').innerText = pct + '%';
    document.getElementById('autotunePctVal').innerText = pct + '%';

    const spd = Math.round((params.retuneSpeed ?? 0.28) * 100);
    document.getElementById('atSpeed').value = spd;
    document.getElementById('atSpeedText').innerText = spd + '%';

    const gatePct = Math.round((params.noiseGate ?? 0.55) * 100);
    document.getElementById('gateSlider').value = gatePct;
    document.getElementById('gateValText').innerText = gatePct + '%';

    const dblPct = Math.round((params.doublerMix ?? 0.34) * 100);
    document.getElementById('doublerMixSlider').value = dblPct;
    document.getElementById('doublerMixText').innerText = dblPct + '%';

    document.getElementById('compSlider').value = Math.abs(params.compThreshold ?? -24);
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

  // ==================== RETINA HIGH-DPI WAVEFORM & PITCH CONTOUR ====================
  function prepareRetinaCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(300, Math.round(rect.width));
    const h = Math.max(90, Math.round(rect.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, W: w, H: h };
  }

  function drawBufferPeaks(c, buffer, xOffsetPx, yTop, height, widthPx, color, totalDurSec) {
    if (!buffer || totalDurSec <= 0) return;
    const ch = buffer.getChannelData(0);
    const drawWidth = Math.max(1, widthPx * (buffer.duration / totalDurSec));
    const samplesPerPx = Math.max(1, Math.floor(ch.length / drawWidth));
    const midY = yTop + height / 2;

    c.fillStyle = color;
    for (let px = 0; px < drawWidth; px += 2) {
      const drawX = xOffsetPx + px;
      if (drawX < 0 || drawX > widthPx) continue;
      const start = px * samplesPerPx;
      let peak = 0;
      for (let k = 0; k < samplesPerPx; k += 8) {
        const v = Math.abs(ch[start + k] || 0);
        if (v > peak) peak = v;
      }
      const barH = Math.max(2, Math.min(height * 0.9, peak * height * 1.6));
      c.fillRect(drawX, midY - barH / 2, 1.4, barH);
    }
  }

  function drawTimeline(playheadSec = 0) {
    const canvas = document.getElementById('waveformCanvas');
    if (!canvas) return;
    const { c, W, H } = prepareRetinaCanvas(canvas);
    c.fillStyle = '#070910';
    c.fillRect(0, 0, W, H);

    const totalDur = Math.max(getProjectDuration(), 12);
    c.strokeStyle = 'rgba(255,255,255,0.045)';
    c.lineWidth = 1;
    for (let s = 0; s <= totalDur; s += 1) {
      const x = (s / totalDur) * W;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    }

    c.strokeStyle = 'rgba(255,255,255,0.1)';
    c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();

    c.font = '600 10.5px Inter, sans-serif';
    c.fillStyle = '#38bdf8';
    c.fillText('01 INSTRUMENTAL  •  TAP TO SEEK', 10, 15);
    if (buffers.backing) {
      drawBufferPeaks(c, buffers.backing, 0, 20, H / 2 - 24, W, '#38bdf8', totalDur);
    } else {
      c.fillStyle = '#475569';
      c.fillText('Search karaoke below, upload MP3/MP4, or click Demo', 10, 48);
    }

    const offsetPx = ((params.vocalOffsetMs / 1000) / totalDur) * W;
    c.fillStyle = '#fbbf24';
    c.fillText(`02 LEAD VOCAL  •  DRAG TO SYNC (${params.vocalOffsetMs} ms)`, 10, H / 2 + 15);
    if (buffers.rawVocal) {
      drawBufferPeaks(c, buffers.rawVocal, offsetPx, H / 2 + 20, H / 2 - 24, W, '#f59e0b', totalDur);
    } else {
      c.fillStyle = '#475569';
      c.fillText('Press Record to capture clean studio vocals', 10, H / 2 + 48);
    }

    const playX = Math.min(W, Math.max(0, (playheadSec / totalDur) * W));
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(playX, 0); c.lineTo(playX, H); c.stroke();
  }

  function drawPitchGraph() {
    const canvas = document.getElementById('pitchCanvas');
    if (!canvas) return;
    const { c, W, H } = prepareRetinaCanvas(canvas);
    c.fillStyle = '#070910';
    c.fillRect(0, 0, W, H);

    const voiced = pitchCurveData.filter((p) => p.voiced);
    if (voiced.length < 3) {
      c.fillStyle = '#64748b';
      c.font = '12px Inter, sans-serif';
      c.fillText('Record vocals or load Demo to inspect note contour', 14, H / 2 + 4);
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

    c.font = '10px JetBrains Mono, monospace';
    for (let m = minM; m <= maxM; m++) {
      const y = H - ((m - minM) / span) * H;
      c.strokeStyle = 'rgba(255,255,255,0.06)';
      c.beginPath(); c.moveTo(28, y); c.lineTo(W, y); c.stroke();
      c.fillStyle = '#64748b';
      c.fillText(KaroDSP.NOTE_NAMES[((m % 12) + 12) % 12], 6, y + 3);
    }

    const plot = (key, color, width) => {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.beginPath();
      let down = false, prevVal = 0;
      pitchCurveData.forEach((pt, idx) => {
        if (!pt.voiced) { down = false; return; }
        const x = 28 + (idx / pitchCurveData.length) * (W - 32);
        const y = H - ((pt[key] - minM) / span) * H;
        if (!down || Math.abs(pt[key] - prevVal) > 2.1) {
          c.moveTo(x, y);
          down = true;
        } else {
          c.lineTo(x, y);
        }
        prevVal = pt[key];
      });
      c.stroke();
    };

    plot('rawMidi', 'rgba(245, 158, 11, 0.65)', 1.4);
    plot('tunedMidi', '#38bdf8', 2.2);
  }

  function setVocalOffset(ms, restartLive = false) {
    const clamped = Math.max(-800, Math.min(800, Math.round(Number(ms))));
    params.vocalOffsetMs = clamped;
    document.getElementById('syncOffsetSlider').value = clamped;
    document.getElementById('syncOffsetLabel').innerText = (clamped > 0 ? '+' : '') + clamped + ' ms';
    updateChips();
    drawTimeline(getCurrentPlayheadSec());
    if (restartLive && isPlaying) startPlayback(getCurrentPlayheadSec());
  }

  function nudgeOffset(d) {
    setVocalOffset(params.vocalOffsetMs + d, true);
  }

  function autoAlignTracks() {
    if (!buffers.backing || !buffers.rawVocal) {
      setVocalOffset(-115, true);
      return showToast('Applied -115ms mic latency alignment');
    }
    const suggested = KaroDSP.estimateSyncOffsetMs(buffers.backing, buffers.rawVocal);
    setVocalOffset(suggested, true);
    showToast(`Auto-aligned vocal sync to ${suggested} ms`);
  }

  function shiftBackingKey(delta) {
    if (!buffers.originalBacking) return showToast('Load an instrumental track or Demo first');
    const next = Math.max(-6, Math.min(6, backingSemitones + delta));
    if (next === backingSemitones) return;
    const prevDelta = next - backingSemitones;
    backingSemitones = next;
    const ctx = ensureAudioCtx();
    const shifted = KaroDSP.transposeBuffer(ctx, buffers.originalBacking, backingSemitones);
    buffers.backing = karaokeCutActive ? KaroDSP.centerCutKaraokeBuffer(ctx, shifted) : shifted;

    const keySel = document.getElementById('keySelect');
    keySel.value = String((((Number(keySel.value) + prevDelta) % 12) + 12) % 12);
    document.getElementById('transposeLabel').innerText = (backingSemitones > 0 ? '+' : '') + backingSemitones + ' st';
    updateChips();
    if (buffers.rawVocal) reprocessAutoTune();
    else if (isPlaying) startPlayback(getCurrentPlayheadSec());
    drawTimeline(getCurrentPlayheadSec());
    showToast(`Key shifted ${backingSemitones > 0 ? '+' : ''}${backingSemitones} semitones via SoundTouch`);
  }

  function setupCanvasInteractions() {
    const canvas = document.getElementById('waveformCanvas');
    let dragging = false, startX = 0, startOff = 0;
    const cx = (e) => (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const cy = (e) => (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);

    const onDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const totalDur = Math.max(getProjectDuration(), 12);
      if (cy(e) - rect.top > rect.height / 2) {
        dragging = true; startX = cx(e); startOff = params.vocalOffsetMs;
      } else {
        const seek = Math.max(0, Math.min(totalDur, ((cx(e) - rect.left) / rect.width) * totalDur));
        playStartOffsetSec = seek;
        if (isPlaying) startPlayback(seek);
        else { drawTimeline(seek); updateTimeReadout(seek, getProjectDuration()); }
      }
    };
    const onMove = (e) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      setVocalOffset(startOff + ((cx(e) - startX) / rect.width) * 2200, false);
    };
    const onUp = () => {
      if (dragging) { dragging = false; if (isPlaying) startPlayback(getCurrentPlayheadSec()); }
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    window.addEventListener('resize', () => {
      drawTimeline(getCurrentPlayheadSec());
      drawPitchGraph();
    });
  }

  // ==================== PRESETS, CLOUD PROJECTS & EXPORT ====================
  function renderPresetCards() {
    const grid = document.getElementById('presetGrid');
    if (!grid) return;
    let html = '';
    Object.entries(KaroDSP.PRESETS).forEach(([key, p]) => {
      const active = key === activePresetKey ? 'active' : '';
      html += `
        <div class="preset-tile ${active}" onclick="App.applyPreset('${key}')">
          <div class="preset-tag">${escapeHtml(p.tag)}</div>
          <div class="preset-title">${escapeHtml(p.nameEn)}</div>
          <div class="preset-sub">${escapeHtml(p.descEn)}</div>
        </div>
      `;
    });
    customD1Presets.forEach((cp, idx) => {
      html += `
        <div class="preset-tile" onclick="App.applyCustomD1Preset(${idx})">
          <div class="preset-tag">CLOUD CUSTOM</div>
          <div class="preset-title">${escapeHtml(cp.name)}</div>
          <div class="preset-sub">${escapeHtml(cp.voice_profile || 'Saved vocal chain')}</div>
        </div>
      `;
    });
    grid.innerHTML = html;
  }

  function applyCustomD1Preset(idx) {
    const cp = customD1Presets[idx];
    if (!cp) return;
    try {
      Object.assign(params, JSON.parse(cp.settings_json));
      syncSlidersFromParams();
      reprocessAutoTune();
      showToast('Loaded chain: ' + cp.name);
    } catch (_) {}
  }

  async function saveCustomPresetToD1() {
    const name = prompt('Name your custom vocal chain:', 'My Signature Chain');
    if (!name) return;
    await fetch('/api/presets', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        name,
        voice_profile: `Key ${KaroDSP.NOTE_NAMES[Number(document.getElementById('keySelect').value)]}`,
        settings: params,
        is_public: false,
      }),
    });
    await loadServerState();
    showToast('Custom vocal chain saved to Cloud D1');
  }

  async function saveProjectToD1() {
    const title = document.getElementById('projectTitleInput').value || 'Untitled Studio Cover';
    await fetch('/api/projects', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        title,
        youtube_url: currentYouTubeVideoId ? `https://youtu.be/${currentYouTubeVideoId}` : '',
        preset_key: activePresetKey,
        musical_key: document.getElementById('keySelect').value,
        musical_scale: document.getElementById('scaleSelect').value,
        vocal_offset_ms: params.vocalOffsetMs,
        settings: params,
        duration_sec: getProjectDuration(),
      }),
    });
    await loadServerState();
    showToast('Project saved to Cloud Library');
  }

  async function deleteProject(id) {
    await fetch('/api/projects/' + encodeURIComponent(id), { method: 'DELETE', headers: apiHeaders() });
    await loadServerState();
  }

  function renderSavedProjects(projects) {
    savedD1Projects = projects || [];
    const box = document.getElementById('savedProjectsList');
    if (!box) return;
    if (!savedD1Projects.length) {
      box.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text-muted);">No cloud projects saved yet. Open Vocal Studio and click <strong>Save</strong> to store your cover session.</div>';
      return;
    }
    box.innerHTML = savedD1Projects
      .map(
        (p, idx) => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid var(--border);flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;font-size:14px;">${escapeHtml(p.title)}</div>
          <div class="mono" style="font-size:11.5px;color:var(--text-muted);">Chain: ${escapeHtml(p.preset_key)} • Sync: ${p.vocal_offset_ms}ms</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-amber" onclick="App.loadProjectByIndex(${idx})">Open in Studio</button>
          <button class="btn btn-sm" onclick="App.deleteProject('${escapeHtml(p.id)}')">Delete</button>
        </div>
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
      document.getElementById('projectTitleInput').value = p.title || 'Loaded Mix';
      setVocalOffset(params.vocalOffsetMs || 0, false);
      syncSlidersFromParams();
      reprocessAutoTune();
      switchView('studio');
      showToast('Project loaded into Vocal Studio');
    } catch (_) {}
  }

  async function exportMasteredWav() {
    if (!buffers.backing && !buffers.rawVocal) loadFullDemo(true);
    const isPro = userState.plan && userState.plan.startsWith('pro');
    if (!isPro && (userState.exports_this_month || 0) >= 3) {
      switchView('pricing');
      return showToast('Free plan limit (3/3) reached — activate Pro Artist Pass for unlimited exports!');
    }

    const btn = document.getElementById('btnRenderMaster');
    btn.disabled = true;
    const compact = document.getElementById('exportFormatSelect').value === 'compact';
    btn.querySelector('span').innerText = 'Mastering Studio Record...';

    try {
      const wavBlob = await KaroDSP.renderMasterWav(buffers, { ...params, bypassFx: false, soloVocal: false }, compact);
      const url = URL.createObjectURL(wavBlob);
      document.getElementById('renderedAudioPlayer').src = url;
      document.getElementById('masterOutputArea').style.display = 'block';

      const safeTitle = (document.getElementById('projectTitleInput').value || 'karomix-master').replace(/[^a-zA-Z0-9_-]+/g, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}_${compact ? 'Share' : 'Master'}.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      if (window.confetti) {
        window.confetti({ particleCount: 70, spread: 68, origin: { y: 0.72 } });
      }

      await fetch('/api/track-export', { method: 'POST', headers: apiHeaders() });
      await loadServerState();
      showToast('Mastered audio rendered & downloaded!');
    } catch (err) {
      showToast('Render failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.querySelector('span').innerText = 'Render Master & Download';
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    setupCanvasInteractions();
    syncSlidersFromParams();
    renderPresetCards();
    updateChips();
    drawTimeline(0);
    loadServerState();
  });

  return {
    switchView, openInspectorTab, switchSourceSub,
    heroSearchSubmit, quickSingSong, searchOrLoadKaraoke, pickKaraokeByIndex, nextKaraokeResult,
    fetchSyncedLyrics, seekToLyric,
    openAuthModal, closeAuthModal, setAuthMode, submitAuth, logout,
    handleBackingUpload, handleVocalUpload, applyKaraokeVocalCut,
    loadFullDemo, launchInstantShowcase,
    toggleMicMonitor, toggleMicRecording, startTabPlusMicRecord,
    togglePlayback, stopAndRewind, updateParam, setMasterProfile,
    onNoiseGateChange, onCompChange, toggleBypassFx, toggleSoloVocal,
    reprocessAutoTune, runSmartVoiceMatch, applyPreset, applyCustomD1Preset,
    setVocalOffset, nudgeOffset, autoAlignTracks, shiftBackingKey,
    saveCustomPresetToD1, saveProjectToD1, deleteProject, loadProjectByIndex,
    exportMasteredWav, toggleProDemo,
  };
})();
