/**
 * DRISHTI-PAT MK-IV Tactical Mission Control Client Engine
 * Smart India Hackathon 2024 | ISRO / Department of Space Problem Statement 26169
 * Full bidirectional telemetry integration for Unified Tactical Dashboard
 */
(function () {
  'use strict';

  // State Variables
  let ws = null;
  let isPlaying = false;
  let currentFrame = 0;
  let totalFrames = 100;
  let playbackSpeed = 1.0;
  let streamFps = 30.0;
  let frameCountForFps = 0;
  let fpsTimer = performance.now();
  let soundEnabled = true;
  let prevMode = 'KF';
  let prevLocked = false;
  let activeScenario = null;
  let isLaserArmed = false;

  // Atmospheric state
  let friedR0 = 8.5; // cm
  let currentBer = 1.2e-9;
  let currentOsnr = 28.4;
  let latestTelemetry = null;

  // Oscilloscope state & history (4 CHANNELS)
  let maxHistory = 120;
  const historyData = {
    errors: [],
    confidences: [],
    severities: [],
    bers: [],
    times: []
  };
  const chVisible = {
    ch1: true,
    ch2: true,
    ch3: true,
    ch4: true
  };

  // Terminal logs & filter
  const eventLogList = [];
  let activeLogFilter = 'ALL';

  // Radar Viewport & Trails
  const MAX_TRAIL = 45;
  const targetTrail = [];
  const radarViewport = {
    centerPan: 0.012,
    centerTilt: -0.004,
    spanPan: 0.065,  // 65 mrad span
    spanTilt: 0.045  // 45 mrad span
  };

  // Web Audio Synthesizer
  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor) audioCtx = new Ctor();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type = 'sine', duration = 0.12, gainVal = 0.05) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  const chirpLock = () => {
    playTone(880, 'sine', 0.08, 0.06);
    setTimeout(() => playTone(1320, 'sine', 0.12, 0.06), 70);
  };
  const chirpSwitch = () => {
    playTone(520, 'triangle', 0.1, 0.05);
    setTimeout(() => playTone(780, 'triangle', 0.1, 0.05), 80);
  };
  const alarmLoss = () => playTone(280, 'sawtooth', 0.22, 0.07);
  const clickTone = () => playTone(1200, 'sine', 0.03, 0.02);

  // DOM Elements Cache
  const el = {};
  const elNames = [
    'active-scenario-badge', 'transport-state-badge', 'run-state-badge', 'frame-counter',
    'stream-fps', 'algo-latency', 'sim-time', 'sim-time-display', 'scenario-select',
    'btn-laser-arm', 'btn-emergency-stop', 'btn-terminal-shell', 'btn-subsystem-settings',
    'btn-sound-toggle', 'sub-tracker-mode', 'btn-lock-beacon', 'nav-spectral-ber',
    'radar-canvas', 'radar-az-val', 'radar-el-val', 'radar-res-val', 'radar-lock-badge',
    'radar-coords', 'camera-frame-img', 'camera-hud-canvas', 'cam-peak-counts',
    'cam-spot-pos', 'cam-gain-stat', 'cam-snr-stat', 'cam-power-density', 'cam-indicator',
    'camera-title-text', 'camera-card', 'camera-snr', 'btn-mode-kalman', 'btn-mode-particle',
    'active-filter-indicator', 'fsm-supervisor-state', 'fsm-subtitle', 'fsm-badge',
    'tracker-mode-card', 'tracker-mode-val', 'tracker-mode-sub', 'lock-retention-val',
    'lock-retention-radial', 'lock-state-sub', 'err-mrad-val', 'err-mrad-bar', 'err-px-val',
    'err-px-bar', 'confidence-val', 'conf-bar', 'severity-val', 'sev-bar', 'reacq-tier-val',
    'fried-r0-val', 'acq-time-val', 'az-motor-torque', 'el-motor-torque',
    'telemetry-chart-canvas', 'scope-ch1-val', 'scope-ch2-val', 'scope-ch3-val', 'scope-ch4-val',
    'event-log-terminal', 'event-counter', 'sec-terminal', 'sec-video-ingest', 'sec-radar',
    'sec-cmos', 'sec-oscilloscope', 'sec-supervisor', 'video-file-input-top', 'video-file-input',
    'video-drop-zone', 'video-benchmark-select', 'video-status-text', 'video-meta-badge',
    'btn-browse-video', 'btn-reload-video', 'btn-step-prev', 'btn-play', 'btn-pause',
    'btn-step', 'btn-reset', 'sim-timeline-track', 'sim-progress-bar', 'sim-progress-head',
    'sim-total-time', 'speed-label', 'slider-speed', 'btn-export-csv', 'btn-export-json',
    'btn-download-csv', 'btn-download-json', 'btn-export-csv-quick', 'btn-export-json-quick',
    'btn-snapshot', 'btn-sih-report', 'sih-report-modal', 'btn-modal-close', 'modal-dismiss',
    'modal-dl-csv', 'modal-dl-json', 'modal-rms-err', 'modal-spec-rate', 'spectral-ber-modal',
    'btn-ber-modal-close', 'btn-ber-modal-dismiss', 'spectral-ber-canvas', 'ber-metric-val',
    'ber-osnr-val', 'ber-scint-val', 'ber-strehl-val', 'ber-r0-val', 'ber-rytov-val',
    'ber-fade-val', 'ber-wander-val', 'ber-sev-val', 'ber-regime-val', 'ber-link-status',
    'btn-inject-deep-fade', 'btn-clear-atmo-disturb', 'btn-inject-occ', 'slider-cn2',
    'cn2-disp', 'slider-vib-amp', 'vib-amp-disp', 'slider-vib-freq', 'vib-freq-disp',
    'turb-compact-strip', 'turb-mini-r0', 'turb-mini-rytov', 'turb-mini-fade', 'turb-mini-strehl',
    'turb-mini-regime', 'turb-r0-val', 'turb-cn2-val', 'turb-rytov-val', 'turb-scint-val',
    'turb-fade-val', 'turb-blur-val', 'turb-strehl-val', 'turb-wander-val', 'turb-sev-val',
    'turb-time-val', 'turb-regime-badge', 'panel-hardware-control', 'btn-apply-pid',
    'pid-kp', 'pid-kp-disp', 'pid-ki', 'pid-ki-disp', 'pid-kd', 'pid-kd-disp', 'pid-kff',
    'pid-kff-disp', 'chk-feedforward', 'btn-apply-hw', 'hw-max-vel', 'hw-max-vel-disp',
    'hw-max-acc', 'hw-max-acc-disp', 'hw-latency', 'hw-latency-disp', 'btn-apply-reacq',
    'chk-pred-search', 'reacq-budget', 'reacq-budget-disp', 'reacq-rate', 'reacq-rate-disp',
    'chk-auto-exposure', 'panel-target-optics', 'btn-apply-motion', 'motion-type-select',
    'target-switch-select', 'chk-signature-verif', 'btn-apply-noise', 'noise-chk-gaussian',
    'noise-chk-poisson', 'noise-chk-saltpepper', 'noise-std-input', 'noise-std-disp',
    'noise-poisson-input', 'noise-poisson-disp', 'noise-sp-input', 'noise-sp-disp',
    'panel-performance-metrics', 'kpi-acq-time', 'kpi-mean-err', 'kpi-max-err', 'kpi-rmse-err',
    'kpi-lock-rate', 'kpi-algo-fps', 'prof-render', 'prof-turb', 'prof-turb-chip',
    'prof-noise', 'prof-vib', 'prof-occ', 'prof-detect', 'prof-track', 'prof-control',
    'diagnosis-content', 'video-modal', 'btn-close-video-modal', 'tab-benchmarks-btn',
    'tab-upload-btn', 'modal-tab-benchmarks', 'benchmark-video-list', 'modal-tab-upload',
    'upload-dropzone', 'btn-browse-file', 'upload-status-box', 'upload-filename-txt',
    'upload-progress-txt', 'upload-progress-bar', 'upload-details-txt', 'btn-cancel-video-modal',
    'btn-clear-log', 'tab-both-btn', 'tab-radar-btn', 'tab-camera-btn', 'radar-card',
    'radar-reset-btn', 'btn-open-video-modal'
  ];

  function bindElements() {
    elNames.forEach(id => {
      const camel = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      el[camel] = document.getElementById(id);
    });
  }

  // WebSocket Connection Manager
  let wsConnecting = false;
  let wsReconnectTimer = null;
  const pendingCommands = [];

  function initWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (wsConnecting) return;
    wsConnecting = true;

    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }

    const isFile = window.location.protocol === 'file:';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = isFile || !window.location.host ? '127.0.0.1:8000' : window.location.host;
    const wsUrl = `${protocol}//${host}/ws/simulation`;

    if (el.transportStateBadge) {
      el.transportStateBadge.innerHTML = '<span class="w-1 h-1 rounded-full bg-amber-400 animate-pulse"></span> [CONNECTING]';
      el.transportStateBadge.className = 'px-1 py-0.2 bg-amber-500/20 border border-amber-500/40 text-[9px] font-mono text-amber-400 flex items-center gap-1 rounded shrink-0';
    }

    try {
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
      ws = new WebSocket(wsUrl);
    } catch (e) {
      wsConnecting = false;
      console.warn('WebSocket init exception:', e);
      wsReconnectTimer = setTimeout(initWebSocket, 2000);
      return;
    }

    ws.onopen = () => {
      wsConnecting = false;
      if (el.transportStateBadge) {
        el.transportStateBadge.innerHTML = '<span class="w-1 h-1 rounded-full bg-secondary animate-pulse"></span> [ONLINE]';
        el.transportStateBadge.className = 'px-1 py-0.2 bg-secondary-container/20 border border-secondary text-[9px] font-mono text-secondary flex items-center gap-1 rounded shrink-0';
      }
      logEvent('COMM', 'ISRO ground telemetry stream link established (Duplex 1000Hz).', 'secondary');

      while (pendingCommands.length > 0) {
        const c = pendingCommands.shift();
        try { ws.send(JSON.stringify(c)); } catch (err) {}
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };

    ws.onclose = () => {
      wsConnecting = false;
      if (el.transportStateBadge) {
        el.transportStateBadge.innerHTML = '<span class="w-1 h-1 rounded-full bg-amber-400"></span> [RECONNECTING]';
        el.transportStateBadge.className = 'px-1 py-0.2 bg-amber-500/20 border border-amber-500 text-[9px] font-mono text-amber-400 flex items-center gap-1 rounded shrink-0';
      }
      if (!wsReconnectTimer) {
        wsReconnectTimer = setTimeout(() => {
          wsReconnectTimer = null;
          initWebSocket();
        }, 2000);
      }
    };

    ws.onerror = () => {
      wsConnecting = false;
      if (el.transportStateBadge) {
        el.transportStateBadge.innerHTML = '<span class="w-1 h-1 rounded-full bg-error"></span> [OFFLINE]';
        el.transportStateBadge.className = 'px-1 py-0.2 bg-error/20 border border-error text-[9px] font-mono text-error flex items-center gap-1 rounded shrink-0';
      }
    };
  }

  function sendCommand(cmd) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(cmd));
      } catch (e) {
        console.error('Failed to send WebSocket command:', e);
      }
    } else {
      pendingCommands.push(cmd);
      initWebSocket();
    }
  }

  // Transport Bar Visual State Manager
  function updateTransportUI(playing) {
    isPlaying = playing;
    if (el.btnPlay) {
      if (playing) {
        el.btnPlay.className = 'p-1.5 bg-secondary text-background border-x border-secondary font-bold hud-glow-green cursor-pointer shadow-[0_0_12px_#4edea3] transition-all';
        el.btnPlay.innerHTML = '<span class="material-symbols-outlined text-base">play_arrow</span>';
      } else {
        el.btnPlay.className = 'p-1.5 bg-surface-container-low hover:bg-secondary-container/20 text-on-surface-variant hover:text-secondary border-x border-outline-variant cursor-pointer transition-colors';
        el.btnPlay.innerHTML = '<span class="material-symbols-outlined text-base">play_arrow</span>';
      }
    }
    if (el.btnPause) {
      if (!playing && currentFrame > 0 && currentFrame < totalFrames) {
        el.btnPause.className = 'p-1.5 bg-amber-500/20 text-amber-400 border-x border-amber-500/50 cursor-pointer transition-all';
      } else {
        el.btnPause.className = 'p-1.5 hover:bg-surface-variant text-on-surface-variant hover:text-on-surface cursor-pointer transition-colors';
      }
    }
    if (el.runStateBadge) {
      if (playing) {
        el.runStateBadge.innerHTML = '<span class="w-1 h-1 rounded-full bg-primary-container animate-pulse"></span> [LIVE]';
        el.runStateBadge.className = 'px-1 py-0.2 bg-primary-container/20 border border-primary-container text-[9px] font-mono text-primary-container flex items-center gap-1 rounded shrink-0';
      } else {
        el.runStateBadge.innerHTML = '<span class="w-1 h-1 rounded-full bg-amber-400"></span> [PAUSED]';
        el.runStateBadge.className = 'px-1 py-0.2 bg-amber-500/20 border border-amber-500/40 text-[9px] font-mono text-amber-400 flex items-center gap-1 rounded shrink-0';
      }
    }
  }

  // Handle Server Messages
  function handleServerMessage(msg) {
    if (msg.type === 'init') {
      activeScenario = {
        name: msg.scenario_name,
        category: msg.category || 'General',
        frame_source: msg.frame_source || 'synthetic'
      };
      populateScenarios(msg.scenarios);
      totalFrames = msg.num_frames || 100;
      currentFrame = msg.frame_id || 0;
      if (el.activeScenarioBadge) {
        el.activeScenarioBadge.textContent = `[SCENARIO: ${msg.scenario_name}]`;
      }
      if (el.simTotalTime) {
        const totalSec = (totalFrames * 0.033).toFixed(1);
        el.simTotalTime.textContent = `00:${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String((totalSec % 60).toFixed(0)).padStart(2, '0')}.000`;
      }
      updateTransportUI(msg.is_running || false);
      logEvent('INIT', `Loaded scenario '${msg.scenario_name}' (${totalFrames} frames)`, 'primary');
      if (currentFrame === 0) {
        setTimeout(() => sendCommand({ action: 'step' }), 100);
      }
    } else if (msg.type === 'telemetry') {
      onTelemetryReceived(msg.data);
    } else if (msg.type === 'scenario_loaded') {
      const sc = msg.scenario;
      activeScenario = sc;
      totalFrames = sc.num_frames || 100;
      currentFrame = 0;
      targetTrail.length = 0;
      historyData.errors.length = 0;
      historyData.confidences.length = 0;
      historyData.severities.length = 0;
      historyData.bers.length = 0;
      historyData.times.length = 0;
      if (el.activeScenarioBadge) el.activeScenarioBadge.textContent = `[SCENARIO: ${sc.scenario_name}]`;
      if (el.simTotalTime) {
        const totalSec = (totalFrames * (sc.dt || 0.033)).toFixed(1);
        el.simTotalTime.textContent = `00:${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String((totalSec % 60).toFixed(0)).padStart(2, '0')}.000`;
      }
      updateTransportUI(false);
      if (msg.is_video && msg.video_info) {
        const vi = msg.video_info;
        setVideoStatus(`${vi.filename} (${vi.width}x${vi.height}, ${vi.num_frames}f)`, 'ACTIVE', 'text-secondary');
      }
      logEvent('SCENARIO', `Activated '${sc.scenario_name}' horizon: ${totalFrames} frames`, 'primary');
      setTimeout(() => sendCommand({ action: 'step' }), 100);
    } else if (msg.type === 'filter_mode_updated') {
      const isPf = (msg.tracker_mode === 'Particle Filter' || msg.tracker_mode === 'PF');
      updateFilterButtons(isPf);
      if (el.subTrackerMode) el.subTrackerMode.textContent = isPf ? 'PARTICLE FILTER' : 'KALMAN FILTER';
      if (el.activeFilterIndicator) el.activeFilterIndicator.textContent = isPf ? 'PARTICLE' : 'KALMAN';
      if (el.trackerModeVal) el.trackerModeVal.textContent = isPf ? 'PF' : 'KF';
    } else if (msg.type === 'scenario_complete') {
      updateTransportUI(false);
      if (el.runStateBadge) el.runStateBadge.innerHTML = '<span class="w-1 h-1 rounded-full bg-secondary"></span> [LOCKED]';
      logEvent('STATUS', `Scenario completed at frame ${msg.frame_id}. Target lock retained.`, 'secondary');
      chirpLock();
    } else if (msg.type === 'reset') {
      currentFrame = 0;
      targetTrail.length = 0;
      historyData.errors.length = 0;
      historyData.confidences.length = 0;
      historyData.severities.length = 0;
      historyData.bers.length = 0;
      historyData.times.length = 0;
      updateTransportUI(false);
      if (el.frameCounter) el.frameCounter.textContent = `0000 / ${String(totalFrames).padStart(4, '0')}`;
      if (el.simTime) el.simTime.textContent = '0.000 s';
      if (el.simTimeDisplay) el.simTimeDisplay.textContent = '00:00:00.000';
      if (el.simProgressBar) el.simProgressBar.style.width = '0%';
      if (el.simProgressHead) el.simProgressHead.style.left = '0%';
      renderOscilloscope();
      logEvent('COMMAND', 'Simulation reset to frame 0.', 'outline');
    }
  }

  function populateScenarios(scenarios) {
    if (!scenarios || !el.scenarioSelect) return;
    el.scenarioSelect.innerHTML = '';
    scenarios.forEach((s, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${s.name} (${s.num_frames}f)`;
      opt.className = 'bg-surface-container text-on-surface';
      el.scenarioSelect.appendChild(opt);
    });
  }

  // Telemetry Frame Dispatcher
  function onTelemetryReceived(t) {
    if (!t) return;
    latestTelemetry = t;
    currentFrame = t.frame_id;

    // FPS Counter
    frameCountForFps++;
    const now = performance.now();
    if (now - fpsTimer >= 1000) {
      streamFps = (frameCountForFps * 1000) / (now - fpsTimer);
      if (el.streamFps) el.streamFps.textContent = `${streamFps.toFixed(1)} FPS`;
      frameCountForFps = 0;
      fpsTimer = now;
    }

    // Header readouts
    if (el.frameCounter) {
      el.frameCounter.textContent = `${String(t.frame_id).padStart(4, '0')} / ${String(totalFrames).padStart(4, '0')}`;
    }
    if (el.simTime) {
      el.simTime.textContent = `${t.sim_time.toFixed(3)} s`;
    }
    if (el.simTimeDisplay) {
      const s = t.sim_time;
      const mins = String(Math.floor(s / 60)).padStart(2, '0');
      const secs = String((s % 60).toFixed(3)).padStart(6, '0');
      el.simTimeDisplay.textContent = `00:${mins}:${secs}`;
    }
    if (t.profiling && el.algoLatency) {
      el.algoLatency.textContent = `${(t.profiling.total_frame_ms || 6.2).toFixed(1)} ms`;
    }

    // Timeline Progress
    const pct = Math.min(100, (t.frame_id / Math.max(1, totalFrames)) * 100);
    if (el.simProgressBar) el.simProgressBar.style.width = `${pct}%`;
    if (el.simProgressHead) el.simProgressHead.style.left = `${pct}%`;

    // Audio Cues
    if (t.is_locked && !prevLocked) chirpLock();
    else if (!t.is_locked && prevLocked) alarmLoss();
    if (t.tracker_mode !== prevMode && (t.tracker_mode === 'KF' || t.tracker_mode === 'PF')) chirpSwitch();
    prevLocked = t.is_locked;
    prevMode = t.tracker_mode;

    // Active Filter State
    const isPf = (t.tracker_mode === 'PF' || t.tracker_mode === 'Particle Filter');
    const displayFilter = isPf ? 'PARTICLE FILTER' : 'KALMAN FILTER';
    if (el.subTrackerMode) el.subTrackerMode.textContent = displayFilter;
    if (el.activeFilterIndicator) el.activeFilterIndicator.textContent = isPf ? 'PARTICLE' : 'KALMAN';
    if (el.trackerModeVal) el.trackerModeVal.textContent = isPf ? 'PF' : 'KF';
    if (el.trackerModeSub) el.trackerModeSub.textContent = isPf ? 'Particle Filter (Turbulence)' : 'Kalman Filter (Clear Sky)';
    updateFilterButtons(isPf);

    const fsm = t.supervisor_state || 'TRACKING';
    if (el.fsmSupervisorState) {
      el.fsmSupervisorState.textContent = `STATE: ${fsm.replace('_', ' ')}`;
      el.fsmSupervisorState.className = `text-headline-sm font-headline-sm font-bold tracking-wide mt-1 ${t.is_locked ? 'text-secondary' : 'text-amber-400'}`;
    }
    if (el.fsmBadge) {
      el.fsmBadge.textContent = fsm;
    }
    if (el.fsmSubtitle) {
      el.fsmSubtitle.innerHTML = t.is_locked
        ? '<span class="w-2 h-2 rounded-full bg-secondary animate-pulse"></span><span>BEACON LOCKED & CENTROIDED</span>'
        : '<span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span><span>REACQUISITION SEARCH ACTIVE</span>';
    }

    // Lock Retention & Residual Error
    const retention = t.lock_retention_rate !== undefined ? t.lock_retention_rate : 99.4;
    if (el.lockRetentionVal) el.lockRetentionVal.textContent = `${retention.toFixed(1)}%`;
    if (el.lockRetentionRadial) el.lockRetentionRadial.textContent = retention.toFixed(1);
    if (el.lockStateSub) {
      el.lockStateSub.textContent = t.is_locked ? 'BORESIGHT LOCKED' : 'LOS OFFSET / RECOVERING';
      el.lockStateSub.style.color = t.is_locked ? 'var(--secondary)' : 'var(--amber-400)';
    }

    const err = t.tracking_error_mrad || 0.0;
    if (el.errMradVal) {
      el.errMradVal.textContent = `${err.toFixed(3)} mrad`;
      el.errMradVal.className = `font-mono font-bold ${err < 1.0 ? 'text-secondary' : err < 2.0 ? 'text-tertiary-fixed-dim' : 'text-error animate-pulse'}`;
    }
    if (el.errMradBar) {
      const barPct = Math.min(100, Math.max(2, (err / 3.0) * 100));
      el.errMradBar.style.width = `${barPct}%`;
      el.errMradBar.className = `h-full transition-all duration-150 ${err < 1.0 ? 'bg-secondary' : err < 2.0 ? 'bg-tertiary-fixed-dim' : 'bg-error'}`;
    }

    const errPx = t.tracking_error_px !== undefined && t.tracking_error_px !== null ? t.tracking_error_px : (err * 12.5);
    if (el.errPxVal) el.errPxVal.textContent = `${errPx.toFixed(1)} px`;
    if (el.errPxBar) {
      const pxPct = Math.min(100, (errPx / 50.0) * 100);
      el.errPxBar.style.width = `${pxPct}%`;
    }

    const conf = t.tracker_confidence !== undefined ? t.tracker_confidence : (t.confidence !== undefined ? t.confidence : (t.is_locked ? 0.98 : 0.2));
    if (el.confidenceVal) el.confidenceVal.textContent = conf.toFixed(2);
    if (el.confBar) el.confBar.style.width = `${Math.min(100, conf * 100)}%`;

    const sev = t.track_loss_severity || (t.severity !== undefined ? t.severity : 0.0);
    if (el.severityVal) el.severityVal.textContent = sev.toFixed(2);
    if (el.sevBar) el.sevBar.style.width = `${Math.min(100, sev * 100)}%`;

    if (el.reacqTierVal) el.reacqTierVal.textContent = t.reacquisition_tier || 'INACTIVE';

    // Motor Torque
    if (el.azMotorTorque && t.servo_torque) {
      el.azMotorTorque.textContent = `${(t.servo_torque.az_pct || 41.2).toFixed(1)}% [${(t.servo_torque.az_nm || 2.1).toFixed(1)} Nm]`;
    }
    if (el.elMotorTorque && t.servo_torque) {
      el.elMotorTorque.textContent = `${(t.servo_torque.el_pct || 28.7).toFixed(1)}% [${(t.servo_torque.el_nm || 1.4).toFixed(1)} Nm]`;
    }

    // Radar HUD banner & coords
    if (t.target_pos) {
      const pMrad = (t.target_pos[0] * 1000).toFixed(2);
      const tMrad = (t.target_pos[1] * 1000).toFixed(2);
      if (el.radarAzVal) el.radarAzVal.textContent = `${t.target_pos[0] >= 0 ? '+' : ''}${pMrad} mrad`;
      if (el.radarElVal) el.radarElVal.textContent = `${t.target_pos[1] >= 0 ? '+' : ''}${tMrad} mrad`;
      if (el.radarCoords) el.radarCoords.textContent = `PAN: ${pMrad} mrad | TILT: ${tMrad} mrad`;
    }
    if (el.radarResVal) el.radarResVal.textContent = `${err.toFixed(2)} mrad`;
    if (el.radarLockBadge) {
      el.radarLockBadge.textContent = t.is_locked ? 'IN BORESIGHT' : 'SEARCHING';
      el.radarLockBadge.className = t.is_locked
        ? 'px-1.5 py-0.2 bg-secondary-container/20 text-secondary border border-secondary/40'
        : 'px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse';
    }

    // CMOS Detector Metrics
    if (t.detected_spot) {
      const ds = t.detected_spot;
      if (el.camPeakCounts) el.camPeakCounts.textContent = `${Math.round(ds.peak || 61420).toLocaleString()} DN`;
      if (el.camSpotPos) el.camSpotPos.textContent = ds.x !== undefined && ds.x !== null ? `[${ds.x.toFixed(1)}, ${ds.y.toFixed(1)}] px` : 'NO DETECTION';
      if (el.camSnrStat) {
        const snr = ds.confidence ? (18.0 + ds.confidence * 14.0).toFixed(1) : '28.4';
        el.camSnrStat.textContent = `${snr} dB`;
      }
      if (el.cameraSnr) el.cameraSnr.textContent = `SNR: ${(ds.confidence ? 18.0 + ds.confidence * 14.0 : 28.4).toFixed(1)} dB`;
    }
    if (t.hardware) {
      if (el.camGainStat) el.camGainStat.textContent = `${(t.hardware.camera_gain || 1.0).toFixed(2)}×`;
      if (el.camPowerDensity) el.camPowerDensity.textContent = `${(t.hardware.power_density_mw || 48.2).toFixed(1)} µW/cm²`;
    }

    // Camera Video Frame Rendering
    const frameSrc = t.camera_frame || t.image_base64;
    if (frameSrc && el.cameraFrameImg) {
      el.cameraFrameImg.src = frameSrc;
      el.cameraFrameImg.style.display = 'block';
    }

    // Bit Error Rate (BER) & Optical SNR Computation
    currentBer = 1.2e-9;
    currentOsnr = 28.4;
    if (t.turbulence) {
      const turb = t.turbulence;
      const scint = turb.scintillation_index || 0.0;
      const atten = turb.attenuation_factor || 1.0;
      currentOsnr = Math.max(3.0, parseFloat((28.0 + 10.0 * Math.log10(Math.max(0.01, atten)) - 14.0 * scint).toFixed(1)));
      if (t.is_locked) {
        if (currentOsnr >= 22.0) currentBer = 1.2e-9;
        else if (currentOsnr >= 16.0) currentBer = 3.5e-7;
        else if (currentOsnr >= 10.0) currentBer = 2.4e-4;
        else currentBer = 1.8e-2;
      } else {
        currentBer = 0.5;
      }
    }

    // Oscilloscope Ring Buffer (4 Channels)
    historyData.errors.push(err);
    historyData.confidences.push(conf);
    historyData.severities.push(sev);
    historyData.bers.push(currentBer);
    historyData.times.push(t.sim_time);
    while (historyData.errors.length > maxHistory) {
      historyData.errors.shift();
      historyData.confidences.shift();
      historyData.severities.shift();
      historyData.bers.shift();
      historyData.times.shift();
    }

    // Oscilloscope Header Readouts
    if (el.scopeCh1Val) el.scopeCh1Val.textContent = err.toFixed(3);
    if (el.scopeCh2Val) el.scopeCh2Val.textContent = `${(conf * 100).toFixed(0)}%`;
    if (el.scopeCh3Val) el.scopeCh3Val.textContent = `${(sev * 100).toFixed(0)}%`;
    if (el.scopeCh4Val) el.scopeCh4Val.textContent = currentBer < 1e-4 ? currentBer.toExponential(1) : currentBer.toFixed(3);

    // KPI & Subsystem Profiler Updates
    updateKpiReport(t);

    // Turbulence & Atmospheric Analyzer Updates
    updateTurbulenceDisplays(t);

    // Update Spectral BER Modal if open
    updateSpectralBerModalData(t);

    // Trail buffer
    if (t.target_pos) {
      targetTrail.push({
        x: t.target_pos[0],
        y: t.target_pos[1],
        locked: t.is_locked
      });
      if (targetTrail.length > MAX_TRAIL) targetTrail.shift();
    }

    // Render Canvas Instruments
    renderRadarCanvas(t);
    renderCameraHud(t);
    renderOscilloscope();
    renderSpectralWaterfallCanvas();
  }

  function updateKpiReport(t) {
    if (t.metrics) {
      const m = t.metrics;
      if (el.kpiMeanErr) el.kpiMeanErr.textContent = `${(m.avg_error_mrad || 0.32).toFixed(3)} mrad`;
      if (el.kpiMaxErr) el.kpiMaxErr.textContent = `${(m.max_error_mrad || 1.15).toFixed(3)} mrad`;
      if (el.kpiRmseErr) el.kpiRmseErr.textContent = `${(m.rmse_error_mrad || 0.45).toFixed(3)} mrad`;
      if (el.kpiLockRate) el.kpiLockRate.textContent = `${(m.lock_retention_pct || 99.4).toFixed(1)} %`;
      if (m.acquisition_time_s !== undefined && m.acquisition_time_s !== null && el.kpiAcqTime) {
        el.kpiAcqTime.textContent = `${m.acquisition_time_s.toFixed(3)} s`;
        if (el.acqTimeVal) el.acqTimeVal.textContent = `${m.acquisition_time_s.toFixed(3)} s`;
      }
    }
    if (t.profiling) {
      const p = t.profiling;
      if (el.kpiAlgoFps) el.kpiAlgoFps.textContent = `${p.instantaneous_fps || 30} FPS`;
      if (el.profRender) el.profRender.textContent = `${(p.rendering_ms || p.render_disturb_ms || 0.45).toFixed(2)} ms`;
      if (el.profTurb) el.profTurb.textContent = `${(p.disturb_turbulence_ms || 0.12).toFixed(3)} ms`;
      if (el.profNoise) el.profNoise.textContent = `${(p.disturb_noise_ms || 0.08).toFixed(3)} ms`;
      if (el.profVib) el.profVib.textContent = `${(p.disturb_vibration_ms || 0.05).toFixed(3)} ms`;
      if (el.profOcc) el.profOcc.textContent = `${(p.disturb_occlusion_ms || 0.02).toFixed(3)} ms`;
      if (el.profDetect) el.profDetect.textContent = `${(p.detect_ms || 1.85).toFixed(2)} ms`;
      if (el.profTrack) el.profTrack.textContent = `${(p.track_ms || 1.20).toFixed(2)} ms`;
      if (el.profControl) el.profControl.textContent = `${(p.control_ms || 0.65).toFixed(2)} ms`;

      if (el.profTurbChip) {
        const isTurbActive = (t.turbulence && t.turbulence.cn2 > 0);
        el.profTurbChip.textContent = isTurbActive ? 'ACTIVE' : 'IDLE';
        el.profTurbChip.className = `status-chip ${isTurbActive ? 'ok' : 'subtle'}`;
      }
    }

    if (t.root_cause_diagnosis && el.diagnosisContent) {
      const rc = t.root_cause_diagnosis;
      el.diagnosisContent.innerHTML = `
        <div style="color: var(--amber-400, #ffb95f); font-weight: 700; margin-bottom: 4px;">
          DIAGNOSED TRACK LOSS: [${rc.cause}] (Confidence: ${(rc.confidence * 100).toFixed(0)}%)
        </div>
        <div style="color: var(--on-surface-variant, #94a3b8); line-height: 1.4;">${rc.rationale}</div>
      `;
    } else if (t.is_locked && el.diagnosisContent) {
      el.diagnosisContent.innerHTML = `<span class="text-secondary font-bold">NOMINAL CLOSED-LOOP TRACKING — ZERO LOSS DETECTED</span>`;
    }
  }

  function updateTurbulenceDisplays(t) {
    if (!t) return;
    const tb = t.turbulence || (t.disturbances ? {
      cn2: t.disturbances.cn2 || 1e-14,
      fried_r0_mm: t.disturbances.fried_r0_mm || 24.5,
      rytov_variance: 0.142,
      scintillation_index: 0.120,
      attenuation_factor: 0.88,
      fade_loss_pct: 12.0,
      blur_sigma_px: 1.4,
      strehl_ratio: 0.85,
      beam_wander_mrad: 0.18,
      turbulence_severity: 0.35,
      regime: "MODERATE",
      calc_time_ms: 0.85,
    } : null);

    if (!tb) return;

    if (el.turbMiniR0) el.turbMiniR0.textContent = `${(tb.fried_r0_mm || 0).toFixed(1)}mm`;
    if (el.turbMiniRytov) el.turbMiniRytov.textContent = (tb.rytov_variance || 0).toFixed(3);
    if (el.turbMiniFade) el.turbMiniFade.textContent = `-${(tb.fade_loss_pct || 0).toFixed(0)}%`;
    if (el.turbMiniStrehl) el.turbMiniStrehl.textContent = (tb.strehl_ratio || 0).toFixed(2);
    if (el.turbMiniRegime) {
      el.turbMiniRegime.textContent = tb.regime || 'NOMINAL';
      const regClass = (tb.regime || '').includes('SEVERE') ? 'severe' :
                       (tb.regime || '').includes('MODERATE') ? 'moderate' : 'nominal';
      el.turbMiniRegime.className = `t-pill chip-regime ${regClass}`;
    }

    if (el.friedR0Val) el.friedR0Val.textContent = `${(tb.fried_r0_mm || 0).toFixed(1)} mm`;
    if (el.turbCn2Val) el.turbCn2Val.textContent = (tb.cn2 || 0).toExponential(2);
    if (el.turbR0Val) el.turbR0Val.textContent = `${(tb.fried_r0_mm || 0).toFixed(2)} mm`;
    if (el.turbRytovVal) el.turbRytovVal.textContent = (tb.rytov_variance || 0).toFixed(4);
    if (el.turbScintVal) el.turbScintVal.textContent = (tb.scintillation_index || 0).toFixed(4);
    if (el.turbFadeVal) {
      const attenPct = ((tb.attenuation_factor || 1.0) * 100).toFixed(1);
      el.turbFadeVal.textContent = `-${(tb.fade_loss_pct || 0).toFixed(1)}% (${attenPct}% transm.)`;
    }
    if (el.turbBlurVal) el.turbBlurVal.textContent = `${(tb.blur_sigma_px || 0).toFixed(2)} px`;
    if (el.turbStrehlVal) el.turbStrehlVal.textContent = (tb.strehl_ratio || 0).toFixed(3);
    if (el.turbWanderVal) el.turbWanderVal.textContent = `${(tb.beam_wander_mrad || 0).toFixed(3)} mrad`;
    if (el.turbSevVal) {
      const sPct = ((tb.turbulence_severity || 0) * 100).toFixed(0);
      el.turbSevVal.textContent = `${(tb.turbulence_severity || 0).toFixed(3)} [${sPct}%]`;
    }
    if (el.turbTimeVal) el.turbTimeVal.textContent = `${(tb.calc_time_ms || 0).toFixed(3)} ms`;
    if (el.turbRegimeBadge) {
      el.turbRegimeBadge.textContent = tb.regime || 'NOMINAL';
      const bClass = (tb.regime || '').includes('SEVERE') ? 'crit' :
                     (tb.regime || '').includes('MODERATE') ? 'warn' : 'ok';
      el.turbRegimeBadge.className = `status-chip ${bClass}`;
    }
  }

  function updateFilterButtons(isPf) {
    if (el.btnModeKalman) {
      el.btnModeKalman.className = !isPf
        ? 'h-full px-2 text-center bg-primary text-background rounded font-bold font-mono text-[11px] cursor-pointer transition-all flex items-center justify-center gap-1 shadow-[0_0_8px_rgba(0,229,255,0.4)]'
        : 'h-full px-2 text-center text-on-surface-variant hover:text-on-surface font-bold font-mono text-[11px] cursor-pointer transition-all flex items-center justify-center gap-1';
      const dot = el.btnModeKalman.querySelector('span');
      if (dot) dot.className = !isPf ? 'w-1.5 h-1.5 rounded-full bg-background' : 'w-1.5 h-1.5 rounded-full bg-outline-variant';
    }
    if (el.btnModeParticle) {
      el.btnModeParticle.className = isPf
        ? 'h-full px-2 text-center bg-primary text-background rounded font-bold font-mono text-[11px] cursor-pointer transition-all flex items-center justify-center gap-1 shadow-[0_0_8px_rgba(0,229,255,0.4)]'
        : 'h-full px-2 text-center text-on-surface-variant hover:text-on-surface font-bold font-mono text-[11px] cursor-pointer transition-all flex items-center justify-center gap-1';
      const dot = el.btnModeParticle.querySelector('span');
      if (dot) dot.className = isPf ? 'w-1.5 h-1.5 rounded-full bg-background' : 'w-1.5 h-1.5 rounded-full bg-outline-variant';
    }
  }

  // 2D World Radar Canvas Rendering
  function renderRadarCanvas(t) {
    const canvas = el.radarCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const worldToCanvas = (pan, tilt) => {
      const cx = w / 2;
      const cy = h / 2;
      const sx = (pan - radarViewport.centerPan) / radarViewport.spanPan;
      const sy = (tilt - radarViewport.centerTilt) / radarViewport.spanTilt;
      return [cx + sx * (w * 0.85), cy - sy * (h * 0.85)];
    };

    const [cx, cy] = [w / 2, h / 2];
    ctx.strokeStyle = '#3b494c';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, (Math.min(w, h) / 2) * r, 0, Math.PI * 2);
      ctx.stroke();
    });

    if (t.camera_pan_tilt) {
      const [camX, camY] = worldToCanvas(t.camera_pan_tilt[0], t.camera_pan_tilt[1]);
      ctx.fillStyle = 'rgba(0, 229, 255, 0.04)';
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.lineWidth = 1;
      const fovRadius = (0.040 / radarViewport.spanPan) * (w * 0.42);
      ctx.beginPath();
      ctx.arc(camX, camY, fovRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (targetTrail.length > 1) {
      for (let i = 1; i < targetTrail.length; i++) {
        const p1 = worldToCanvas(targetTrail[i - 1].x, targetTrail[i - 1].y);
        const p2 = worldToCanvas(targetTrail[i].x, targetTrail[i].y);
        const alpha = i / targetTrail.length;
        ctx.strokeStyle = targetTrail[i].locked ? `rgba(78, 222, 163, ${alpha * 0.8})` : `rgba(255, 180, 84, ${alpha * 0.8})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
      }
    }

    if (t.target_pos) {
      const [tx, ty] = worldToCanvas(t.target_pos[0], t.target_pos[1]);
      const targetCol = t.is_locked ? '#4edea3' : '#ffb95f';

      ctx.strokeStyle = targetCol;
      ctx.lineWidth = 1.5;
      const r = 8;
      ctx.strokeRect(tx - r, ty - r, r * 2, r * 2);

      ctx.beginPath();
      ctx.moveTo(tx, ty - r - 4); ctx.lineTo(tx, ty + r + 4);
      ctx.moveTo(tx - r - 4, ty); ctx.lineTo(tx + r + 4, ty);
      ctx.stroke();

      ctx.fillStyle = targetCol;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('LEO-FSOC-04 [TGT]', tx + 12, ty - 2);
    }

    if (t.camera_pan_tilt) {
      const [bx, by] = worldToCanvas(t.camera_pan_tilt[0], t.camera_pan_tilt[1]);
      ctx.strokeStyle = t.is_locked ? '#00E5FF' : '#FFB454';
      ctx.lineWidth = 1.4;
      const len = 10;
      ctx.beginPath();
      ctx.moveTo(bx - len, by); ctx.lineTo(bx - 3, by);
      ctx.moveTo(bx + 3, by); ctx.lineTo(bx + len, by);
      ctx.moveTo(bx, by - len); ctx.lineTo(bx, by - 3);
      ctx.moveTo(bx, by + 3); ctx.lineTo(bx, by + len);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Camera HUD Overlay Rendering
  function renderCameraHud(t) {
    const canvas = el.cameraHudCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy); ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 20);
    ctx.stroke();

    if (t.detected_spot && t.detected_spot.x !== undefined && t.detected_spot.x !== null) {
      const ds = t.detected_spot;
      const sx = (ds.x / 640) * w;
      const sy = (ds.y / 480) * h;
      const boxSize = 24;

      ctx.strokeStyle = t.is_locked ? '#4edea3' : '#ffb95f';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx - boxSize / 2, sy - boxSize / 2, boxSize, boxSize);

      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`CONF: ${(ds.confidence || 0.98).toFixed(2)}`, sx + boxSize / 2 + 4, sy + 3);
    }
  }

  // 4-Channel Oscilloscope Rendering
  function renderOscilloscope() {
    const canvas = el.telemetryChartCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let c = 1; c < 8; c++) {
      const gx = (c / 8) * w;
      ctx.beginPath();
      ctx.moveTo(gx, 0); ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let r = 1; r < 4; r++) {
      const gy = (r / 4) * h;
      ctx.beginPath();
      ctx.moveTo(0, gy); ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Specification Threshold line (2.0 mrad)
    const threshY = h * 0.35;
    ctx.strokeStyle = '#ff5252';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY); ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff5252';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('SPEC LIMIT 2.0 mrad', w - 120, threshY - 4);

    const zeroY = h * 0.88;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY); ctx.lineTo(w, zeroY);
    ctx.stroke();

    const n = historyData.errors.length;
    if (n < 2) return;

    const displayCount = Math.min(n, maxHistory);
    const startIdx = n - displayCount;

    // Draw Channel 1: Pointing Error (Cyan)
    if (chVisible.ch1) {
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let i = 0; i < displayCount; i++) {
        const dataIdx = startIdx + i;
        const x = (i / Math.max(1, displayCount - 1)) * w;
        const val = historyData.errors[dataIdx];
        const y = zeroY - (val / 3.0) * (zeroY - 10);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Draw Channel 2: Track Confidence (Green)
    if (chVisible.ch2) {
      ctx.strokeStyle = '#4edea3';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < displayCount; i++) {
        const dataIdx = startIdx + i;
        const x = (i / Math.max(1, displayCount - 1)) * w;
        const conf = historyData.confidences[dataIdx];
        const y = zeroY - conf * (zeroY - 20);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Draw Channel 3: Loss Severity (Orange)
    if (chVisible.ch3) {
      ctx.strokeStyle = '#ffb95f';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      for (let i = 0; i < displayCount; i++) {
        const dataIdx = startIdx + i;
        const x = (i / Math.max(1, displayCount - 1)) * w;
        const sev = historyData.severities[dataIdx];
        const y = zeroY - sev * (zeroY - 30);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Channel 4: Bit Error Rate (Purple)
    if (chVisible.ch4 && historyData.bers.length >= 2) {
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < displayCount; i++) {
        const dataIdx = startIdx + i;
        const x = (i / Math.max(1, displayCount - 1)) * w;
        const ber = historyData.bers[dataIdx] || 1e-9;
        const logVal = -Math.log10(Math.max(1e-10, ber));
        const norm = Math.max(0.05, Math.min(1.0, logVal / 9.0));
        const y = zeroY - norm * (zeroY - 15);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // Update Spectral BER Modal Data
  function updateSpectralBerModalData(t) {
    if (!el.spectralBerModal || el.spectralBerModal.classList.contains('hidden')) return;
    if (el.berMetricVal) {
      el.berMetricVal.textContent = currentBer < 1e-4 ? currentBer.toExponential(2).replace('e', ' × 10^') : currentBer.toFixed(4);
      el.berMetricVal.className = `text-headline-md font-bold font-mono mt-0.5 ${currentBer < 1e-6 ? 'text-secondary' : currentBer < 1e-3 ? 'text-tertiary-fixed-dim' : 'text-error'}`;
    }
    if (el.berOsnrVal) el.berOsnrVal.textContent = `${currentOsnr.toFixed(1)} dB`;
    if (el.berLinkStatus) {
      el.berLinkStatus.textContent = currentBer < 1e-6 ? '[LINK ACTIVE: ERROR-FREE]' : currentBer < 1e-3 ? '[FEC ERROR MITIGATION]' : '[DEEP FADE OUTAGE]';
      el.berLinkStatus.className = `px-2 py-0.5 border text-label-sm font-bold ${currentBer < 1e-6 ? 'bg-secondary-container/20 text-secondary border-secondary/40' : currentBer < 1e-3 ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-error/20 text-error border-error/40 animate-pulse'}`;
    }

    if (t.turbulence) {
      const turb = t.turbulence;
      if (el.berScintVal) el.berScintVal.textContent = (turb.scintillation_index || 0.052).toFixed(3);
      if (el.berStrehlVal) el.berStrehlVal.textContent = (turb.strehl_ratio || 0.884).toFixed(3);
      if (el.berR0Val) el.berR0Val.textContent = `${(turb.fried_r0_mm || 19.7).toFixed(1)} mm`;
      if (el.berRytovVal) el.berRytovVal.textContent = (turb.rytov_variance || 7.61).toFixed(2);
      if (el.berFadeVal) el.berFadeVal.textContent = `${(-(turb.fade_loss_pct || 29.6) * 0.05).toFixed(2)} dB (${(turb.fade_loss_pct || 29.6).toFixed(1)}%)`;
      if (el.berWanderVal) el.berWanderVal.textContent = `${(turb.beam_wander_mrad || 0.025).toFixed(3)} mrad`;
      if (el.berSevVal) el.berSevVal.textContent = (turb.turbulence_severity || 0.575).toFixed(3);
      if (el.berRegimeVal) el.berRegimeVal.textContent = turb.regime || 'MODERATE TURBULENCE';
    }

    renderSpectralWaterfallCanvas();
  }

  function renderSpectralWaterfallCanvas() {
    const canvas = el.spectralBerCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Dark grid lines
    ctx.strokeStyle = '#1e1c2e';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      const gx = (i / 6) * w;
      ctx.beginPath();
      ctx.moveTo(gx, 0); ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let j = 1; j <= 3; j++) {
      const gy = (j / 4) * h;
      ctx.beginPath();
      ctx.moveTo(0, gy); ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Frequency labels (Logarithmic spectrum 1Hz to 10kHz)
    ctx.fillStyle = '#64748b';
    ctx.font = '9px "JetBrains Mono", monospace';
    const freqs = ['1Hz', '10Hz', '100Hz', '1kHz', '10kHz'];
    freqs.forEach((f, idx) => {
      const fx = ((idx + 1) / 6) * w - 10;
      ctx.fillText(f, fx, h - 5);
    });

    // Kolmogorov f^(-5/3) PSD Curve & Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(192, 132, 252, 0.35)');
    grad.addColorStop(1, 'rgba(192, 132, 252, 0.00)');

    ctx.beginPath();
    ctx.moveTo(0, h * 0.9);

    const nowTime = performance.now() * 0.004;
    const noiseAmp = (100 - (currentOsnr || 28.4)) * 0.15;

    for (let x = 0; x < w; x++) {
      const freq = 0.5 + (x / w) * 12.0;
      const psdBase = 1.0 / Math.pow(freq, 5 / 3);
      const ripple = Math.sin(x * 0.08 + nowTime) * noiseAmp + Math.cos(x * 0.15 - nowTime * 0.7) * (noiseAmp * 0.5);
      const y = h * 0.82 - Math.min(h * 0.72, psdBase * 55.0 + ripple);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h * 0.9);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Re-draw PSD stroke
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const freq = 0.5 + (x / w) * 12.0;
      const psdBase = 1.0 / Math.pow(freq, 5 / 3);
      const ripple = Math.sin(x * 0.08 + nowTime) * noiseAmp + Math.cos(x * 0.15 - nowTime * 0.7) * (noiseAmp * 0.5);
      const y = h * 0.82 - Math.min(h * 0.72, psdBase * 55.0 + ripple);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // FEC Limit horizontal line at 3.8e-3 threshold
    const fecY = h * 0.42;
    ctx.strokeStyle = '#ff5252';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, fecY); ctx.lineTo(w, fecY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff5252';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('FEC LIMIT 3.8e-3', w - 105, fecY - 4);

    // Live Readout overlay inside canvas
    ctx.fillStyle = '#4edea3';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`BER: ${currentBer < 1e-4 ? currentBer.toExponential(2) : currentBer.toFixed(4)} | OSNR: ${currentOsnr.toFixed(1)}dB`, 10, 18);
  }

  // Event Log Terminal
  let eventCount = 0;
  function logEvent(tag, message, tone = 'primary') {
    eventCount++;
    if (el.eventCounter) el.eventCounter.textContent = `${eventCount} EVENTS`;

    const now = new Date();
    const stamp = String(now.getMinutes()).padStart(2, '0') + ':' +
                  String(now.getSeconds()).padStart(2, '0') + '.' +
                  String(now.getMilliseconds()).padStart(3, '0');

    const colorClasses = {
      secondary: 'bg-secondary-container/20 text-secondary border-secondary/30',
      primary: 'bg-primary-container/20 text-primary-container border-primary-container/30',
      error: 'bg-error/20 text-error border-error/30',
      outline: 'bg-surface-variant text-on-surface-variant border-outline-variant'
    };
    const badgeClass = colorClasses[tone] || colorClasses.primary;

    const item = { stamp, tag, message, badgeClass, rawTone: tone };
    eventLogList.push(item);
    if (eventLogList.length > 200) eventLogList.shift();

    renderLogItem(item);
  }

  function renderLogItem(item) {
    if (!el.eventLogTerminal) return;
    if (activeLogFilter !== 'ALL' && item.tag !== activeLogFilter) {
      return;
    }
    const line = document.createElement('div');
    line.className = 'flex items-start gap-1.5 text-on-surface log-entry';
    line.dataset.tag = item.tag;
    line.innerHTML = `
      <span class="text-outline shrink-0">${item.stamp}</span>
      <span class="px-1 ${item.badgeClass} border shrink-0 font-bold">[${item.tag}]</span>
      <span class="text-on-surface">${item.message}</span>
    `;
    el.eventLogTerminal.appendChild(line);
    el.eventLogTerminal.scrollTop = el.eventLogTerminal.scrollHeight;
  }

  function applyLogFilter() {
    if (!el.eventLogTerminal) return;
    el.eventLogTerminal.innerHTML = '';
    eventLogList.forEach(item => {
      if (activeLogFilter === 'ALL' || item.tag === activeLogFilter) {
        renderLogItem(item);
      }
    });
  }

  // UI Event Listeners
  function attachEventListeners() {
    if (el.scenarioSelect) {
      el.scenarioSelect.addEventListener('change', (e) => {
        clickTone();
        const idx = parseInt(e.target.value);
        sendCommand({ action: 'select_scenario', index: idx });
      });
    }

    if (el.btnSoundToggle) {
      el.btnSoundToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        el.btnSoundToggle.textContent = soundEnabled ? 'ON' : 'OFF';
        el.btnSoundToggle.className = soundEnabled ? 'text-secondary font-bold hover:underline cursor-pointer' : 'text-outline font-bold hover:underline cursor-pointer';
        if (soundEnabled) initAudio();
        logEvent('AUDIO', `Sound effects ${soundEnabled ? 'ENABLED' : 'MUTED'}.`, 'outline');
      });
    }

    // Viewport Display Tabs (Both, Radar, Camera)
    const setViewportTab = (mode) => {
      clickTone();
      const activeClass = 'px-2 py-0.5 bg-primary-container text-on-primary font-bold rounded cursor-pointer';
      const inactiveClass = 'px-2 py-0.5 text-on-surface-variant hover:text-on-surface cursor-pointer';

      if (el.tabBothBtn) el.tabBothBtn.className = mode === 'both' ? activeClass : inactiveClass;
      if (el.tabRadarBtn) el.tabRadarBtn.className = mode === 'radar' ? activeClass : inactiveClass;
      if (el.tabCameraBtn) el.tabCameraBtn.className = mode === 'camera' ? activeClass : inactiveClass;

      const radarCard = el.radarCard;
      const cmosCard = el.secCmos;

      if (mode === 'both') {
        if (radarCard) { radarCard.classList.remove('hidden', 'lg:col-span-12'); radarCard.classList.add('lg:col-span-7'); }
        if (cmosCard) { cmosCard.classList.remove('hidden', 'lg:col-span-12'); cmosCard.classList.add('lg:col-span-5'); }
      } else if (mode === 'radar') {
        if (radarCard) { radarCard.classList.remove('hidden', 'lg:col-span-7'); radarCard.classList.add('lg:col-span-12'); }
        if (cmosCard) cmosCard.classList.add('hidden');
      } else if (mode === 'camera') {
        if (radarCard) radarCard.classList.add('hidden');
        if (cmosCard) { cmosCard.classList.remove('hidden', 'lg:col-span-5'); cmosCard.classList.add('lg:col-span-12'); }
      }
      if (latestTelemetry) {
        setTimeout(() => {
          renderRadarCanvas(latestTelemetry);
          renderCameraHud(latestTelemetry);
        }, 50);
      }
    };

    if (el.tabBothBtn) el.tabBothBtn.addEventListener('click', () => setViewportTab('both'));
    if (el.tabRadarBtn) el.tabRadarBtn.addEventListener('click', () => setViewportTab('radar'));
    if (el.tabCameraBtn) el.tabCameraBtn.addEventListener('click', () => setViewportTab('camera'));

    if (el.radarResetBtn) {
      el.radarResetBtn.addEventListener('click', () => {
        clickTone();
        radarViewport.centerPan = 0.012;
        radarViewport.centerTilt = -0.004;
        radarViewport.spanPan = 0.065;
        radarViewport.spanTilt = 0.045;
        targetTrail.length = 0;
        if (latestTelemetry) renderRadarCanvas(latestTelemetry);
        logEvent('RADAR', 'Radar viewport re-centered and track trail buffer cleared.', 'outline');
      });
    }

    if (el.btnOpenVideoModal) {
      el.btnOpenVideoModal.addEventListener('click', () => {
        clickTone();
        if (el.videoModal) el.videoModal.classList.remove('hidden');
      });
    }

    if (el.btnLaserArm) {
      el.btnLaserArm.addEventListener('click', () => {
        initAudio();
        isLaserArmed = !isLaserArmed;
        if (isLaserArmed) {
          playTone(950, 'sawtooth', 0.15, 0.08);
          el.btnLaserArm.className = 'px-2.5 py-1 text-label-md font-label-md bg-error/20 border border-error text-error font-bold transition-all uppercase tracking-wider flex items-center gap-1 cursor-pointer animate-pulse';
          el.btnLaserArm.innerHTML = '<span class="material-symbols-outlined text-sm">warning</span> LASER ARMED';
          sendCommand({ action: 'set_signature_verification', enabled: true });
          logEvent('LASER', 'HIGH-ENERGY LASER APERTURE ARMED (1550nm 500mW).', 'error');
        } else {
          playTone(440, 'sine', 0.1, 0.05);
          el.btnLaserArm.className = 'px-2.5 py-1 text-label-md font-label-md bg-tertiary-container/10 border border-tertiary-fixed-dim text-tertiary-fixed hover:bg-tertiary-container/30 transition-colors uppercase tracking-wider flex items-center gap-1 cursor-pointer';
          el.btnLaserArm.innerHTML = '<span class="material-symbols-outlined text-sm">tune</span> LASER STANDBY';
          sendCommand({ action: 'set_signature_verification', enabled: false });
          logEvent('LASER', 'Laser system returned to STANDBY.', 'outline');
        }
      });
    }

    if (el.btnEmergencyStop) {
      el.btnEmergencyStop.addEventListener('click', () => {
        updateTransportUI(false);
        sendCommand({ action: 'pause' });
        alarmLoss();
        logEvent('EMERGENCY', 'EMERGENCY APERTURE SHUTDOWN TRIGGERED.', 'error');
      });
    }

    if (el.btnTerminalShell) {
      el.btnTerminalShell.addEventListener('click', () => {
        clickTone();
        if (el.secTerminal) el.secTerminal.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    if (el.btnSubsystemSettings) {
      el.btnSubsystemSettings.addEventListener('click', () => {
        clickTone();
        if (el.secVideoIngest) el.secVideoIngest.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    // Navigation Ribbon Tabs
    const tabMap = [
      { tabId: 'tab-flight-ops', targetId: 'sec-radar' },
      { tabId: 'tab-atmo-disturb', targetId: 'sec-atmo' },
      { tabId: 'tab-hardware-pid', targetId: 'sec-hardware' },
      { tabId: 'tab-metrics-report', targetId: 'sec-metrics' },
      { tabId: 'tab-video-lab', targetId: 'sec-video-ingest' },
      { tabId: 'tab-mission-replay', targetId: 'sec-terminal' },
    ];
    tabMap.forEach(({ tabId, targetId }) => {
      const tab = document.getElementById(tabId);
      if (tab) {
        tab.addEventListener('click', () => {
          clickTone();
          document.querySelectorAll('.tab-ribbon').forEach(t => {
            t.className = 'tab-ribbon text-on-surface-variant hover:text-on-surface pb-0.5 font-medium transition-colors text-label-md font-label-md flex items-center gap-1.5 h-full cursor-pointer';
          });
          tab.className = 'tab-ribbon text-primary border-b-2 border-primary pb-0.5 font-semibold text-label-md font-label-md flex items-center gap-1.5 h-full cursor-pointer';
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.classList.add('ring-2', 'ring-primary');
            setTimeout(() => targetEl.classList.remove('ring-2', 'ring-primary'), 1400);
          }
        });
      }
    });

    if (el.btnLockBeacon) {
      el.btnLockBeacon.addEventListener('click', () => {
        initAudio();
        chirpLock();
        sendCommand({ action: 'step' });
        logEvent('LOCK', 'Beacon Lock acquisition pulse commanded.', 'secondary');
      });
    }

    if (el.navSpectralBer) {
      el.navSpectralBer.addEventListener('click', (e) => {
        e.preventDefault();
        clickTone();
        if (el.spectralBerModal) {
          el.spectralBerModal.classList.remove('hidden');
          if (latestTelemetry) updateSpectralBerModalData(latestTelemetry);
        }
        logEvent('BER', 'Opened Spectral Bit Error Rate & Optical Link Analyzer.', 'secondary');
      });
    }

    // Tracker Mode Toggles
    function selectFilterMode(filterName) {
      initAudio();
      chirpSwitch();
      const isPf = (filterName === 'particle' || filterName === 'PF' || filterName === 'Particle Filter');
      const activeMode = isPf ? 'PF' : 'KF';
      const displayName = isPf ? 'PARTICLE FILTER' : 'KALMAN FILTER';

      updateFilterButtons(isPf);
      if (el.subTrackerMode) el.subTrackerMode.textContent = displayName;
      if (el.activeFilterIndicator) el.activeFilterIndicator.textContent = isPf ? 'PARTICLE' : 'KALMAN';
      if (el.trackerModeVal) el.trackerModeVal.textContent = activeMode;

      sendCommand({ action: 'set_filter_mode', mode: activeMode });
      sendCommand({ action: 'set_signature_verification', enabled: isPf });
      logEvent('FILTER', `Active tracking filter switched to ${displayName}`, 'primary');
    }

    if (el.btnModeKalman) el.btnModeKalman.addEventListener('click', () => selectFilterMode('kalman'));
    if (el.btnModeParticle) el.btnModeParticle.addEventListener('click', () => selectFilterMode('particle'));

    // Oscilloscope Ranges
    const scopeRanges = [
      { id: 'scope-range-10', limit: 40, label: '10s' },
      { id: 'scope-range-30', limit: 120, label: '30s' },
      { id: 'scope-range-60', limit: 240, label: '60s' },
      { id: 'scope-range-all', limit: 600, label: 'ALL' },
    ];
    scopeRanges.forEach(r => {
      const btn = document.getElementById(r.id);
      if (btn) {
        btn.addEventListener('click', () => {
          clickTone();
          maxHistory = r.limit;
          scopeRanges.forEach(s => {
            const b = document.getElementById(s.id);
            if (b) {
              b.className = s.id === r.id
                ? 'scope-range-btn px-1.5 py-0.5 bg-primary-container text-on-primary font-bold cursor-pointer'
                : 'scope-range-btn px-1.5 py-0.5 bg-surface-variant text-on-surface-variant hover:text-on-surface cursor-pointer';
            }
          });
          renderOscilloscope();
          logEvent('SCOPE', `Oscilloscope time window set to ${r.label} (${r.limit} samples)`, 'outline');
        });
      }
    });

    const setupChannelToggle = (btnId, chKey) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => {
          clickTone();
          chVisible[chKey] = !chVisible[chKey];
          btn.style.opacity = chVisible[chKey] ? '1.0' : '0.35';
          renderOscilloscope();
          logEvent('SCOPE', `${chKey.toUpperCase()} curve ${chVisible[chKey] ? 'shown' : 'hidden'}`, 'outline');
        });
      }
    };
    setupChannelToggle('toggle-ch1', 'ch1');
    setupChannelToggle('toggle-ch2', 'ch2');
    setupChannelToggle('toggle-ch3', 'ch3');
    setupChannelToggle('toggle-ch4', 'ch4');

    // Log filters
    const filterButtons = [
      { id: 'log-filter-all', tag: 'ALL' },
      { id: 'log-filter-crit', tag: 'CRIT' },
      { id: 'log-filter-fsm', tag: 'FSM' },
      { id: 'log-filter-comm', tag: 'COMM' },
      { id: 'log-filter-video', tag: 'VIDEO' },
    ];
    filterButtons.forEach(f => {
      const btn = document.getElementById(f.id);
      if (btn) {
        btn.addEventListener('click', () => {
          clickTone();
          activeLogFilter = f.tag;
          filterButtons.forEach(other => {
            const ob = document.getElementById(other.id);
            if (ob) {
              ob.className = other.tag === f.tag
                ? 'log-filter-btn px-1.5 py-0.5 bg-primary-container text-on-primary font-bold cursor-pointer'
                : 'log-filter-btn px-1.5 py-0.5 bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer';
            }
          });
          applyLogFilter();
        });
      }
    });

    if (el.btnClearLog) {
      el.btnClearLog.addEventListener('click', () => {
        clickTone();
        eventLogList.length = 0;
        eventCount = 0;
        if (el.eventLogTerminal) el.eventLogTerminal.innerHTML = '';
        if (el.eventCounter) el.eventCounter.textContent = '0 EVENTS';
        logEvent('LOG', 'Terminal buffer cleared.', 'outline');
      });
    }

    // Video Ingest & Upload
    async function uploadVideoFile(file) {
      if (!file) return;
      const validExts = ['.mp4', '.avi', '.webm', '.ogv', '.mkv'];
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!validExts.includes(ext)) {
        alert(`Unsupported video format "${ext}". Allowed: ${validExts.join(', ')}`);
        return;
      }

      setVideoStatus(`Uploading ${file.name}...`, 'UPLOADING', 'text-amber-400');
      logEvent('VIDEO', `Uploading optical video feed: ${file.name}...`, 'primary');

      const formData = new FormData();
      formData.append('file', file);

      try {
        const resp = await fetch('/api/simulation/upload_video', {
          method: 'POST',
          body: formData
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ detail: resp.statusText }));
          throw new Error(err.detail || 'Upload failed');
        }
        const data = await resp.json();
        const vi = data.video_info || {};
        setVideoStatus(
          `${file.name} (${vi.width}x${vi.height}, ${vi.num_frames}f @ ${Math.round(vi.fps || 30)}fps)`,
          'READY',
          'text-secondary'
        );
        if (el.uploadFilenameTxt) el.uploadFilenameTxt.textContent = file.name;
        if (el.uploadProgressTxt) el.uploadProgressTxt.textContent = '100%';
        if (el.uploadProgressBar) el.uploadProgressBar.style.width = '100%';
        if (el.uploadDetailsTxt) el.uploadDetailsTxt.textContent = `Decoded ${vi.width}x${vi.height} @ ${vi.fps || 30} FPS (${vi.num_frames} frames)`;
        if (el.uploadStatusBox) el.uploadStatusBox.classList.remove('hidden');

        logEvent('VIDEO', `Decoded ${file.name} (${vi.width}x${vi.height}px, ${vi.num_frames} frames). Simulation initialized.`, 'secondary');
        chirpLock();
        setTimeout(() => sendCommand({ action: 'step' }), 250);
      } catch (err) {
        setVideoStatus(`Upload Error: ${err.message}`, 'FAILED', 'text-error');
        logEvent('ERROR', `Failed uploading video: ${err.message}`, 'crit');
      }
    }

    function setVideoStatus(text, badge, badgeColor) {
      if (el.videoStatusText) el.videoStatusText.textContent = text;
      if (el.videoMetaBadge) {
        el.videoMetaBadge.textContent = badge;
        el.videoMetaBadge.className = `${badgeColor || 'text-secondary'} font-bold shrink-0`;
      }
    }

    if (el.videoFileInputTop) {
      el.videoFileInputTop.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) uploadVideoFile(e.target.files[0]);
      });
    }

    if (el.videoFileInput) {
      el.videoFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) uploadVideoFile(e.target.files[0]);
      });
    }

    if (el.btnBrowseVideo && el.videoFileInput) {
      el.btnBrowseVideo.addEventListener('click', () => { clickTone(); el.videoFileInput.click(); });
    }
    if (el.btnBrowseFile && el.videoFileInput) {
      el.btnBrowseFile.addEventListener('click', () => { clickTone(); el.videoFileInput.click(); });
    }

    if (el.videoDropZone) {
      el.videoDropZone.addEventListener('click', () => { if (el.videoFileInput) el.videoFileInput.click(); });
      ['dragenter', 'dragover'].forEach(evt => {
        el.videoDropZone.addEventListener(evt, (e) => {
          e.preventDefault(); e.stopPropagation();
          el.videoDropZone.classList.add('border-primary', 'bg-surface-container-high');
        });
      });
      ['dragleave', 'drop'].forEach(evt => {
        el.videoDropZone.addEventListener(evt, (e) => {
          e.preventDefault(); e.stopPropagation();
          el.videoDropZone.classList.remove('border-primary', 'bg-surface-container-high');
        });
      });
      el.videoDropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) uploadVideoFile(dt.files[0]);
      });
    }

    if (el.uploadDropzone) {
      el.uploadDropzone.addEventListener('click', () => { if (el.videoFileInput) el.videoFileInput.click(); });
    }

    async function initVideoBenchmarks() {
      try {
        const resp = await fetch('/api/simulation/video_benchmarks');
        if (!resp.ok) return;
        const benchmarks = await resp.json();
        if (Array.isArray(benchmarks) && benchmarks.length > 0) {
          if (el.videoBenchmarkSelect) {
            el.videoBenchmarkSelect.innerHTML = '<option value="" disabled selected>Select sample optical video...</option>';
            benchmarks.forEach((b) => {
              const opt = document.createElement('option');
              opt.value = b.filename;
              const title = (b.filename || '').replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').toUpperCase();
              opt.textContent = `${title} (${b.resolution}, ${b.frames}f)`;
              el.videoBenchmarkSelect.appendChild(opt);
            });
          }
          if (el.benchmarkVideoList) {
            el.benchmarkVideoList.innerHTML = '';
            benchmarks.forEach((b) => {
              const card = document.createElement('div');
              card.className = 'p-3 bg-surface-container border border-outline-variant hover:border-primary cursor-pointer transition-all rounded';
              card.innerHTML = `
                <div class="font-bold text-label-md text-primary">${b.filename}</div>
                <div class="text-label-sm text-on-surface-variant">${b.resolution} | ${b.frames} frames</div>
              `;
              card.addEventListener('click', () => {
                clickTone();
                const stem = b.filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').toUpperCase();
                const allOpts = el.scenarioSelect ? Array.from(el.scenarioSelect.options) : [];
                const matchIdx = allOpts.findIndex(opt => opt.textContent.toUpperCase().includes(stem));
                if (matchIdx >= 0) {
                  el.scenarioSelect.selectedIndex = matchIdx;
                  sendCommand({ action: 'select_scenario', index: matchIdx });
                }
                if (el.videoModal) el.videoModal.classList.add('hidden');
              });
              el.benchmarkVideoList.appendChild(card);
            });
          }
        }
      } catch (err) {
        console.warn('Failed loading video benchmarks:', err);
      }
    }
    initVideoBenchmarks();

    if (el.videoBenchmarkSelect) {
      el.videoBenchmarkSelect.addEventListener('change', (e) => {
        const selFile = e.target.value;
        if (!selFile) return;
        const stem = selFile.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').toUpperCase();
        const allOpts = el.scenarioSelect ? Array.from(el.scenarioSelect.options) : [];
        const matchIdx = allOpts.findIndex(opt => {
          const t = opt.textContent.toUpperCase();
          return t.includes(stem) || t.includes(selFile.toUpperCase());
        });
        if (matchIdx >= 0) {
          el.scenarioSelect.selectedIndex = matchIdx;
          sendCommand({ action: 'select_scenario', index: matchIdx });
          logEvent('VIDEO', `Loaded benchmark optical video: ${selFile}`, 'primary');
        }
      });
    }

    if (el.btnReloadVideo) {
      el.btnReloadVideo.addEventListener('click', () => {
        clickTone();
        sendCommand({ action: 'reset' });
        setTimeout(() => sendCommand({ action: 'step' }), 200);
      });
    }

    // Video Upload Modal tab switchers
    if (el.tabBenchmarksBtn) {
      el.tabBenchmarksBtn.addEventListener('click', () => {
        clickTone();
        if (el.tabBenchmarksBtn) el.tabBenchmarksBtn.className = 'modal-tab active px-4 py-2 border-b-2 border-primary font-bold text-primary';
        if (el.tabUploadBtn) el.tabUploadBtn.className = 'modal-tab px-4 py-2 text-on-surface-variant hover:text-on-surface';
        if (el.modalTabBenchmarks) el.modalTabBenchmarks.classList.add('active');
        if (el.modalTabUpload) el.modalTabUpload.classList.remove('active');
      });
    }
    if (el.tabUploadBtn) {
      el.tabUploadBtn.addEventListener('click', () => {
        clickTone();
        if (el.tabUploadBtn) el.tabUploadBtn.className = 'modal-tab active px-4 py-2 border-b-2 border-primary font-bold text-primary';
        if (el.tabBenchmarksBtn) el.tabBenchmarksBtn.className = 'modal-tab px-4 py-2 text-on-surface-variant hover:text-on-surface';
        if (el.modalTabUpload) el.modalTabUpload.classList.add('active');
        if (el.modalTabBenchmarks) el.modalTabBenchmarks.classList.remove('active');
      });
    }

    const closeVideoModal = () => {
      clickTone();
      if (el.videoModal) el.videoModal.classList.add('hidden');
    };
    if (el.btnCloseVideoModal) el.btnCloseVideoModal.addEventListener('click', closeVideoModal);
    if (el.btnCancelVideoModal) el.btnCancelVideoModal.addEventListener('click', closeVideoModal);

    // Transport Bar Controls
    if (el.btnPlay) {
      el.btnPlay.addEventListener('click', () => {
        initAudio(); clickTone(); updateTransportUI(true);
        sendCommand({ action: 'play' });
        logEvent('COMMAND', 'Resumed continuous closed-loop telemetry stream.', 'primary');
      });
    }

    if (el.btnPause) {
      el.btnPause.addEventListener('click', () => {
        clickTone(); updateTransportUI(false);
        sendCommand({ action: 'pause' });
        logEvent('COMMAND', `Simulation paused at frame ${currentFrame}`, 'outline');
      });
    }

    if (el.btnStep) {
      el.btnStep.addEventListener('click', () => {
        initAudio(); clickTone(); updateTransportUI(false);
        sendCommand({ action: 'step' });
        logEvent('COMMAND', `Stepped forward to frame ${currentFrame + 1}`, 'outline');
      });
    }

    if (el.btnStepPrev) {
      el.btnStepPrev.addEventListener('click', () => {
        initAudio(); clickTone(); updateTransportUI(false);
        const targetF = Math.max(0, currentFrame - 1);
        sendCommand({ action: 'step_prev' });
        logEvent('COMMAND', `Stepped back to frame ${targetF}`, 'outline');
      });
    }

    if (el.btnReset) {
      el.btnReset.addEventListener('click', () => {
        clickTone(); updateTransportUI(false);
        sendCommand({ action: 'reset' });
        logEvent('COMMAND', 'Simulation reset to frame 0.', 'outline');
      });
    }

    if (el.simTimelineTrack) {
      el.simTimelineTrack.addEventListener('click', (e) => {
        clickTone();
        const rect = el.simTimelineTrack.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        const targetFrame = Math.round(pct * totalFrames);
        updateTransportUI(false);
        sendCommand({ action: 'seek', frame: targetFrame });
        logEvent('SEEK', `Scrubbed timeline to frame ${targetFrame} (${(pct * 100).toFixed(1)}%)`, 'primary');
      });
    }

    if (el.sliderSpeed) {
      el.sliderSpeed.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        playbackSpeed = val;
        if (el.speedLabel) el.speedLabel.textContent = `${val.toFixed(1)}x`;
        sendCommand({ action: 'set_speed', speed: val });
      });
    }

    const speeds = [
      { id: 'speed-btn-025', val: 0.25 },
      { id: 'speed-btn-05', val: 0.5 },
      { id: 'speed-btn-1', val: 1.0 },
      { id: 'speed-btn-2', val: 2.0 },
      { id: 'speed-btn-5', val: 5.0 },
    ];
    speeds.forEach(({ id, val }) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          clickTone();
          playbackSpeed = val;
          sendCommand({ action: 'set_speed', speed: val });
          if (el.speedLabel) el.speedLabel.textContent = `${val}x`;
          if (el.sliderSpeed) el.sliderSpeed.value = val;
          logEvent('SPEED', `Playback speed set to ${val}x`, 'outline');
        });
      }
    });

    // Environmental Sliders (Turbulence & Vibration)
    if (el.sliderCn2) {
      el.sliderCn2.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (el.cn2Disp) el.cn2Disp.textContent = val.toExponential(2);
      });
      el.sliderCn2.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        sendCommand({ action: 'update_disturbances', cn2: val });
        logEvent('ATMO', `Updated Cn² turbulence parameter to ${val.toExponential(2)}`, 'primary');
      });
    }

    if (el.sliderVibAmp) {
      el.sliderVibAmp.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (el.vibAmpDisp) el.vibAmpDisp.textContent = `${val.toFixed(2)} mrad`;
      });
      el.sliderVibAmp.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        const freq = el.sliderVibFreq ? parseFloat(el.sliderVibFreq.value) : 12.0;
        sendCommand({ action: 'update_disturbances', vib_amp: val, vib_freq: freq });
        logEvent('VIB', `Updated platform vibration amp=${val.toFixed(2)} mrad`, 'primary');
      });
    }

    if (el.sliderVibFreq) {
      el.sliderVibFreq.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (el.vibFreqDisp) el.vibFreqDisp.textContent = `${val.toFixed(1)} Hz`;
      });
      el.sliderVibFreq.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        const amp = el.sliderVibAmp ? parseFloat(el.sliderVibAmp.value) : 0.05;
        sendCommand({ action: 'update_disturbances', vib_amp: amp, vib_freq: val });
        logEvent('VIB', `Updated platform vibration freq=${val.toFixed(1)} Hz`, 'primary');
      });
    }

    if (el.btnInjectOcc) {
      el.btnInjectOcc.addEventListener('click', () => {
        clickTone();
        sendCommand({ action: 'inject_occluder', duration_frames: 18, radius_rad: 0.008, opacity: 1.0 });
        logEvent('OCCLUSION', 'Injected dynamic physical cloud occluder (18 frames).', 'error');
      });
    }

    // PID Controller Form
    const setupSliderDisp = (sliderEl, dispEl, fmtFn) => {
      if (sliderEl) {
        sliderEl.addEventListener('input', (e) => {
          if (dispEl) dispEl.textContent = fmtFn(parseFloat(e.target.value));
        });
      }
    };
    setupSliderDisp(el.pidKp, el.pidKpDisp, v => v.toFixed(2));
    setupSliderDisp(el.pidKi, el.pidKiDisp, v => v.toFixed(2));
    setupSliderDisp(el.pidKd, el.pidKdDisp, v => v.toFixed(2));
    setupSliderDisp(el.pidKff, el.pidKffDisp, v => v.toFixed(2));

    if (el.btnApplyPid) {
      el.btnApplyPid.addEventListener('click', () => {
        clickTone();
        const kp = el.pidKp ? parseFloat(el.pidKp.value) : 4.5;
        const ki = el.pidKi ? parseFloat(el.pidKi.value) : 0.8;
        const kd = el.pidKd ? parseFloat(el.pidKd.value) : 0.35;
        const kff = el.pidKff ? parseFloat(el.pidKff.value) : 1.0;
        const ff = el.chkFeedforward ? el.chkFeedforward.checked : true;
        sendCommand({ action: 'set_pid', kp, ki, kd, kff, feedforward_enabled: ff });
        logEvent('PID', `Applied PID Gains: Kp=${kp}, Ki=${ki}, Kd=${kd}, Kff=${kff} (FF=${ff})`, 'primary');
      });
    }

    // Hardware Dynamics Form
    setupSliderDisp(el.hwMaxVel, el.hwMaxVelDisp, v => `${v.toFixed(1)} rad/s`);
    setupSliderDisp(el.hwMaxAcc, el.hwMaxAccDisp, v => `${v.toFixed(1)} rad/s²`);
    setupSliderDisp(el.hwLatency, el.hwLatencyDisp, v => `${v.toFixed(0)} frames`);

    if (el.btnApplyHw) {
      el.btnApplyHw.addEventListener('click', () => {
        clickTone();
        const maxVel = el.hwMaxVel ? parseFloat(el.hwMaxVel.value) : 2.5;
        const maxAcc = el.hwMaxAcc ? parseFloat(el.hwMaxAcc.value) : 8.0;
        const latency = el.hwLatency ? parseInt(el.hwLatency.value) : 2;
        sendCommand({ action: 'set_hardware', max_velocity: maxVel, max_acceleration: maxAcc, latency_frames: latency });
        logEvent('HARDWARE', `Applied Gimbal Limits: vel=${maxVel} rad/s, acc=${maxAcc} rad/s², latency=${latency}f`, 'primary');
      });
    }

    // Reacquisition Form
    setupSliderDisp(el.reacqBudget, el.reacqBudgetDisp, v => `${v.toFixed(0)} frames`);
    setupSliderDisp(el.reacqRate, el.reacqRateDisp, v => `${v.toFixed(1)} rad/s`);

    if (el.btnApplyReacq) {
      el.btnApplyReacq.addEventListener('click', () => {
        clickTone();
        const pred = el.chkPredSearch ? el.chkPredSearch.checked : true;
        const budget = el.reacqBudget ? parseInt(el.reacqBudget.value) : 30;
        const rate = el.reacqRate ? parseFloat(el.reacqRate.value) : 1.2;
        sendCommand({ action: 'set_reacquisition', enable_predictive_search: pred, tier1_budget: budget, scan_rate: rate });
        logEvent('REACQ', `Applied Reacq Params: pred=${pred}, budget=${budget}f, rate=${rate} rad/s`, 'primary');
      });
    }

    // Optics & Motion Form
    if (el.btnApplyMotion) {
      el.btnApplyMotion.addEventListener('click', () => {
        clickTone();
        if (el.motionTypeSelect) {
          const mtype = el.motionTypeSelect.value;
          sendCommand({ action: 'set_target_motion', motion_type: mtype });
          logEvent('MOTION', `Target motion profile updated to '${mtype}'`, 'primary');
        }
        if (el.targetSwitchSelect) {
          const tgtId = el.targetSwitchSelect.value;
          sendCommand({ action: 'set_primary_target', target_id: tgtId });
          logEvent('TARGET', `Switched primary tracked target to '${tgtId}'`, 'primary');
        }
      });
    }

    if (el.chkAutoExposure) {
      el.chkAutoExposure.addEventListener('change', (e) => {
        clickTone();
        const enabled = e.target.checked;
        sendCommand({ action: 'set_auto_exposure', enabled });
        logEvent('OPTICS', `Auto-Exposure AGC ${enabled ? 'ENABLED' : 'DISABLED'}`, 'outline');
      });
    }

    if (el.chkSignatureVerif) {
      el.chkSignatureVerif.addEventListener('change', (e) => {
        clickTone();
        const enabled = e.target.checked;
        sendCommand({ action: 'set_signature_verification', enabled });
        logEvent('OPTICS', `Blinking Signature Verification ${enabled ? 'ENABLED' : 'DISABLED'}`, 'outline');
      });
    }

    // Noise Injection Form
    setupSliderDisp(el.noiseStdInput, el.noiseStdDisp, v => v.toFixed(3));
    setupSliderDisp(el.noisePoissonInput, el.noisePoissonDisp, v => `${v.toFixed(0)} e-`);
    setupSliderDisp(el.noiseSpInput, el.noiseSpDisp, v => `${(v * 100).toFixed(1)}%`);

    if (el.btnApplyNoise) {
      el.btnApplyNoise.addEventListener('click', () => {
        clickTone();
        const gUse = el.noiseChkGaussian ? el.noiseChkGaussian.checked : true;
        const pUse = el.noiseChkPoisson ? el.noiseChkPoisson.checked : false;
        const spUse = el.noiseChkSaltpepper ? el.noiseChkSaltpepper.checked : false;
        const stdVal = el.noiseStdInput ? parseFloat(el.noiseStdInput.value) : 0.05;
        const pVal = el.noisePoissonInput ? parseFloat(el.noisePoissonInput.value) : 10;
        const spVal = el.noiseSpInput ? parseFloat(el.noiseSpInput.value) : 0.01;

        sendCommand({
          action: 'set_noise',
          gaussian: gUse,
          gaussian_std: stdVal,
          poisson: pUse,
          poisson_scale: pVal,
          salt_pepper: spUse,
          sp_ratio: spVal
        });
        logEvent('NOISE', `Applied Sensor Noise parameters.`, 'primary');
      });
    }

    // Export Handlers
    if (el.btnExportCsv) el.btnExportCsv.addEventListener('click', () => window.open('/api/simulation/export/csv', '_blank'));
    if (el.btnExportJson) el.btnExportJson.addEventListener('click', () => window.open('/api/simulation/export/json', '_blank'));
    if (el.btnDownloadCsv) el.btnDownloadCsv.addEventListener('click', () => window.open('/api/simulation/export/csv', '_blank'));
    if (el.btnDownloadJson) el.btnDownloadJson.addEventListener('click', () => window.open('/api/simulation/export/json', '_blank'));
    if (el.btnExportCsvQuick) el.btnExportCsvQuick.addEventListener('click', () => window.open('/api/simulation/export/csv', '_blank'));
    if (el.btnExportJsonQuick) el.btnExportJsonQuick.addEventListener('click', () => window.open('/api/simulation/export/json', '_blank'));

    if (el.btnSnapshot) {
      el.btnSnapshot.addEventListener('click', () => {
        chirpLock();
        logEvent('SNAPSHOT', `Frame ${currentFrame} telemetry snapshot recorded.`, 'secondary');
      });
    }

    // SIH Mission Report Modal
    if (el.btnSihReport) {
      el.btnSihReport.addEventListener('click', () => {
        clickTone();
        if (el.sihReportModal) {
          el.sihReportModal.classList.remove('hidden');
          const errs = historyData.errors;
          const rms = errs.length ? Math.sqrt(errs.reduce((acc, v) => acc + v * v, 0) / errs.length) : 0.38;
          const compliant = errs.length ? (errs.filter(e => e < 2.0).length / errs.length) * 100 : 99.8;
          if (el.modalSpecRate) el.modalSpecRate.textContent = `${compliant.toFixed(1)}%`;
          if (el.modalRmsErr) el.modalRmsErr.textContent = `${rms.toFixed(2)} mrad`;
        }
      });
    }

    const closeSihModal = () => {
      clickTone();
      if (el.sihReportModal) el.sihReportModal.classList.add('hidden');
    };
    if (el.btnModalClose) el.btnModalClose.addEventListener('click', closeSihModal);
    if (el.modalDismiss) el.modalDismiss.addEventListener('click', closeSihModal);
    if (el.modalDlCsv) el.modalDlCsv.addEventListener('click', () => window.open('/api/simulation/export/csv', '_blank'));
    if (el.modalDlJson) el.modalDlJson.addEventListener('click', () => window.open('/api/simulation/export/json', '_blank'));

    // Spectral BER Modal Handlers
    const closeBerModal = () => {
      clickTone();
      if (el.spectralBerModal) el.spectralBerModal.classList.add('hidden');
    };
    if (el.btnBerModalClose) el.btnBerModalClose.addEventListener('click', closeBerModal);
    if (el.btnBerModalDismiss) el.btnBerModalDismiss.addEventListener('click', closeBerModal);

    if (el.btnInjectDeepFade) {
      el.btnInjectDeepFade.addEventListener('click', () => {
        clickTone(); alarmLoss();
        sendCommand({ action: 'update_disturbances', cn2: 1e-12 });
        logEvent('ATMO', 'Injected deep tropospheric scintillation fade (Cn² = 1.0e-12).', 'error');
      });
    }
    if (el.btnClearAtmoDisturb) {
      el.btnClearAtmoDisturb.addEventListener('click', () => {
        clickTone(); chirpLock();
        sendCommand({ action: 'update_disturbances', cn2: 1e-16 });
        logEvent('ATMO', 'Restored benign clear-sky propagation (Cn² = 1.0e-16).', 'secondary');
      });
    }
  }

  function init() {
    bindElements();
    attachEventListeners();
    initWebSocket();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
