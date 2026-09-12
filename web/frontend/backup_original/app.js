/**
 * DRISHTI-PAT MK-IV PRO Master Flight Telemetry & Hardware Control Station
 * Smart India Hackathon 2024 | ISRO / DOS Problem Statement 26169
 *
 * Full-featured aerospace mission control dashboard exposing 100% of backend:
 * - Multi-target kinematics & trajectory patterns
 * - Particle filter probabilistic scatter clouds & Kalman covariance
 * - Hierarchical reacquisition (Tier 1 & 2)
 * - Slew rate limits, hardware latency, PID tuning
 * - Multi-noise environmental models & stage profiling
 * - Synthesized audio telemetry tones
 */

(function () {
  'use strict';

  // --- State Variables ---
  let ws = null;
  let isPlaying = false;
  let currentFrame = 0;
  let totalFrames = 100;
  let playbackSpeed = 1.0;
  let frameCountForFps = 0;
  let streamFps = 30.0;
  let fpsTimer = performance.now();
  let soundEnabled = true;
  let prevMode = 'KF';
  let prevLocked = false;

  // Web Audio Context for Synthesized Telemetry Sounds
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.05) {
    if (!soundEnabled || !audioCtx) return;
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
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  function playLockChirp() {
    if (!soundEnabled || !audioCtx) return;
    playTone(880, 'sine', 0.1, 0.06);
    setTimeout(() => playTone(1320, 'sine', 0.15, 0.07), 80);
  }

  function playSwitchChirp() {
    if (!soundEnabled || !audioCtx) return;
    playTone(520, 'triangle', 0.12, 0.05);
    setTimeout(() => playTone(780, 'triangle', 0.12, 0.05), 90);
  }

  function playLossAlarm() {
    if (!soundEnabled || !audioCtx) return;
    playTone(280, 'sawtooth', 0.25, 0.08);
  }

  // Rolling History
  const MAX_HISTORY = 120;
  const historyData = {
    errors: [],
    confidences: [],
    severities: [],
  };

  const MAX_TRAIL = 45;
  const targetTrail = [];
  const cameraTrail = [];

  // World Radar Viewport
  const radarViewport = {
    centerPan: 0.012,
    centerTilt: -0.004,
    spanPan: 0.065,  // 65 mrad width
    spanTilt: 0.045, // 45 mrad height
  };

  // Latest Telemetry Cache
  let latestTelemetry = null;

  // DOM Elements Cache
  const el = {
    // Nav
    sysStatus: document.getElementById('sys-status-val'),
    streamFps: document.getElementById('stream-fps'),
    algoLatency: document.getElementById('algo-latency'),
    frameCounter: document.getElementById('frame-counter'),
    simTime: document.getElementById('sim-time'),
    scenarioSelect: document.getElementById('scenario-select'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),

    // Master Navigation Tabs
    masterTabs: document.querySelectorAll('.master-tab'),
    workspacePanels: document.querySelectorAll('.workspace-panel'),

    // Flight Ops View Controls
    tabBoth: document.getElementById('tab-both-btn'),
    tabRadar: document.getElementById('tab-radar-btn'),
    tabCamera: document.getElementById('tab-camera-btn'),
    displaysContainer: document.getElementById('displays-container'),
    colormapSelect: document.getElementById('colormap-select'),
    radarResetBtn: document.getElementById('radar-reset-btn'),

    // Canvas & Sensor Displays
    radarCanvas: document.getElementById('radar-canvas'),
    radarCoords: document.getElementById('radar-coords'),
    cameraImg: document.getElementById('camera-frame-img'),
    cameraSnr: document.getElementById('camera-snr'),
    cameraTitleText: document.getElementById('camera-title-text'),
    camIndicator: document.getElementById('cam-indicator'),
    camPeakCounts: document.getElementById('cam-peak-counts'),
    camSpotPos: document.getElementById('cam-spot-pos'),
    camGainStat: document.getElementById('cam-gain-stat'),

    // Oscilloscope
    chartCanvas: document.getElementById('telemetry-chart-canvas'),
    scopeCh1Val: document.getElementById('scope-ch1-val'),
    scopeCh2Val: document.getElementById('scope-ch2-val'),
    scopeCh3Val: document.getElementById('scope-ch3-val'),

    // Telemetry Sidebar Cards
    fsmBadge: document.getElementById('fsm-badge'),
    trackerModeCard: document.getElementById('tracker-mode-card'),
    trackerModeVal: document.getElementById('tracker-mode-val'),
    trackerModeSub: document.getElementById('tracker-mode-sub'),
    lockRetentionVal: document.getElementById('lock-retention-val'),
    lockStateSub: document.getElementById('lock-state-sub'),
    errMradVal: document.getElementById('err-mrad-val'),
    errMradBar: document.getElementById('err-mrad-bar'),
    errPxVal: document.getElementById('err-px-val'),
    errPxBar: document.getElementById('err-px-bar'),
    confidenceVal: document.getElementById('confidence-val'),
    confBar: document.getElementById('conf-bar'),
    severityVal: document.getElementById('severity-val'),
    sevBar: document.getElementById('sev-bar'),
    reacqTierVal: document.getElementById('reacq-tier-val'),
    friedR0Val: document.getElementById('fried-r0-val'),
    acqTimeVal: document.getElementById('acq-time-val'),

    // Quick Disturbance Sliders
    btnInjectOcc: document.getElementById('btn-inject-occ'),
    sliderCn2: document.getElementById('slider-cn2'),
    cn2Disp: document.getElementById('cn2-disp'),
    sliderVibAmp: document.getElementById('slider-vib-amp'),
    vibAmpDisp: document.getElementById('vib-amp-disp'),
    sliderVibFreq: document.getElementById('slider-vib-freq'),
    vibFreqDisp: document.getElementById('vib-freq-disp'),

    // Terminal Log
    eventLogTerminal: document.getElementById('event-log-terminal'),
    btnClearLog: document.getElementById('btn-clear-log'),

    // Hardware & Control Lab Elements
    pidKp: document.getElementById('pid-kp'),
    pidKpDisp: document.getElementById('pid-kp-disp'),
    pidKi: document.getElementById('pid-ki'),
    pidKiDisp: document.getElementById('pid-ki-disp'),
    pidKd: document.getElementById('pid-kd'),
    pidKdDisp: document.getElementById('pid-kd-disp'),
    pidKff: document.getElementById('pid-kff'),
    pidKffDisp: document.getElementById('pid-kff-disp'),
    chkFeedforward: document.getElementById('chk-feedforward'),
    btnApplyPid: document.getElementById('btn-apply-pid'),

    hwMaxVel: document.getElementById('hw-max-vel'),
    hwMaxVelDisp: document.getElementById('hw-max-vel-disp'),
    hwMaxAcc: document.getElementById('hw-max-acc'),
    hwMaxAccDisp: document.getElementById('hw-max-acc-disp'),
    hwLatency: document.getElementById('hw-latency'),
    hwLatencyDisp: document.getElementById('hw-latency-disp'),
    btnApplyHw: document.getElementById('btn-apply-hw'),

    chkPredSearch: document.getElementById('chk-pred-search'),
    reacqBudget: document.getElementById('reacq-budget'),
    reacqBudgetDisp: document.getElementById('reacq-budget-disp'),
    reacqRate: document.getElementById('reacq-rate'),
    reacqRateDisp: document.getElementById('reacq-rate-disp'),
    btnApplyReacq: document.getElementById('btn-apply-reacq'),
    chkAutoExposure: document.getElementById('chk-auto-exposure'),

    // Multi-Target & Optics Elements
    motionTypeSelect: document.getElementById('motion-type-select'),
    targetSwitchSelect: document.getElementById('target-switch-select'),
    chkSignatureVerif: document.getElementById('chk-signature-verif'),
    btnApplyMotion: document.getElementById('btn-apply-motion'),

    noiseChkGaussian: document.getElementById('noise-chk-gaussian'),
    noiseChkPoisson: document.getElementById('noise-chk-poisson'),
    noiseChkSaltPepper: document.getElementById('noise-chk-saltpepper'),
    noiseStdInput: document.getElementById('noise-std-input'),
    noiseStdDisp: document.getElementById('noise-std-disp'),
    noisePoissonInput: document.getElementById('noise-poisson-input'),
    noisePoissonDisp: document.getElementById('noise-poisson-disp'),
    noiseSpInput: document.getElementById('noise-sp-input'),
    noiseSpDisp: document.getElementById('noise-sp-disp'),
    btnApplyNoise: document.getElementById('btn-apply-noise'),

    // Quantitative KPI Report Elements
    kpiAcqTime: document.getElementById('kpi-acq-time'),
    kpiMeanErr: document.getElementById('kpi-mean-err'),
    kpiMaxErr: document.getElementById('kpi-max-err'),
    kpiRmseErr: document.getElementById('kpi-rmse-err'),
    kpiLockRate: document.getElementById('kpi-lock-rate'),
    kpiAlgoFps: document.getElementById('kpi-algo-fps'),
    profRender: document.getElementById('prof-render'),
    profTurb: document.getElementById('prof-turb'),
    profTurbChip: document.getElementById('prof-turb-chip'),
    profNoise: document.getElementById('prof-noise'),
    profVib: document.getElementById('prof-vib'),
    profOcc: document.getElementById('prof-occ'),
    profDetect: document.getElementById('prof-detect'),
    profTrack: document.getElementById('prof-track'),
    profControl: document.getElementById('prof-control'),
    diagnosisContent: document.getElementById('diagnosis-content'),
    btnDownloadCsv: document.getElementById('btn-download-csv'),
    btnDownloadJson: document.getElementById('btn-download-json'),

    // Turbulence Status Elements
    turbMiniR0: document.getElementById('turb-mini-r0'),
    turbMiniRytov: document.getElementById('turb-mini-rytov'),
    turbMiniFade: document.getElementById('turb-mini-fade'),
    turbMiniStrehl: document.getElementById('turb-mini-strehl'),
    turbMiniRegime: document.getElementById('turb-mini-regime'),

    // Atmospheric Turbulence Analyzer Panel (Optics Workspace)
    turbCn2Val: document.getElementById('turb-cn2-val'),
    turbR0Val: document.getElementById('turb-r0-val'),
    turbRytovVal: document.getElementById('turb-rytov-val'),
    turbScintVal: document.getElementById('turb-scint-val'),
    turbFadeVal: document.getElementById('turb-fade-val'),
    turbBlurVal: document.getElementById('turb-blur-val'),
    turbStrehlVal: document.getElementById('turb-strehl-val'),
    turbWanderVal: document.getElementById('turb-wander-val'),
    turbSevVal: document.getElementById('turb-sev-val'),
    turbTimeVal: document.getElementById('turb-time-val'),
    turbRegimeBadge: document.getElementById('turb-regime-badge'),

    // Transport Bar Elements
    btnPlay: document.getElementById('btn-play'),
    btnPause: document.getElementById('btn-pause'),
    btnStep: document.getElementById('btn-step'),
    btnReset: document.getElementById('btn-reset'),
    sliderSpeed: document.getElementById('slider-speed'),
    speedLabel: document.getElementById('speed-label'),
    simProgressBar: document.getElementById('sim-progress-bar'),
    btnExportCsvQuick: document.getElementById('btn-export-csv-quick'),
    btnExportJsonQuick: document.getElementById('btn-export-json-quick'),

    // Video Benchmark & Upload Modal Elements
    btnOpenVideoModal: document.getElementById('btn-open-video-modal'),
    videoModal: document.getElementById('video-modal'),
    btnCloseVideoModal: document.getElementById('btn-close-video-modal'),
    btnCancelVideoModal: document.getElementById('btn-cancel-video-modal'),
    tabBenchmarksBtn: document.getElementById('tab-benchmarks-btn'),
    tabUploadBtn: document.getElementById('tab-upload-btn'),
    modalTabBenchmarks: document.getElementById('modal-tab-benchmarks'),
    modalTabUpload: document.getElementById('modal-tab-upload'),
    benchmarkVideoList: document.getElementById('benchmark-video-list'),
    uploadDropzone: document.getElementById('upload-dropzone'),
    videoFileInput: document.getElementById('video-file-input'),
    btnBrowseFile: document.getElementById('btn-browse-file'),
    uploadStatusBox: document.getElementById('upload-status-box'),
    uploadFilenameTxt: document.getElementById('upload-filename-txt'),
    uploadProgressTxt: document.getElementById('upload-progress-txt'),
    uploadProgressBar: document.getElementById('upload-progress-bar'),
    uploadDetailsTxt: document.getElementById('upload-details-txt'),
  };

  const radarCtx = el.radarCanvas.getContext('2d');
  const chartCtx = el.chartCanvas.getContext('2d');

  // --- WebSocket Connection ---
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/simulation`;

    el.sysStatus.textContent = 'CONNECTING';
    el.sysStatus.className = 'pill-val';

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      el.sysStatus.textContent = 'ONLINE';
      el.sysStatus.className = 'pill-val online';
      logTerminal('STATUS', 'Duplex telemetry stream link established (ISRO Comm Bus).', 'info');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      el.sysStatus.textContent = 'RECONNECTING';
      el.sysStatus.className = 'pill-val';
      setTimeout(initWebSocket, 2000);
    };

    ws.onerror = () => {
      el.sysStatus.textContent = 'OFFLINE';
      el.sysStatus.className = 'pill-val';
    };
  }

  function sendCommand(cmd) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmd));
    }
  }

  // Active Scenario Metadata
  let activeScenario = null;

  // --- Server Message Dispatcher ---
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
      updatePlaybackControls(msg.is_running);
      if (msg.colormap) el.colormapSelect.value = msg.colormap;
      logTerminal('INIT', `Initialized scenario '${msg.scenario_name}' (${totalFrames} frames)`, 'info');
      resetTelemetryView();
    } else if (msg.type === 'telemetry') {
      onTelemetryReceived(msg.data);
    } else if (msg.type === 'scenario_loaded') {
      const sc = msg.scenario;
      activeScenario = sc;
      totalFrames = sc.num_frames || 100;
      currentFrame = 0;
      targetTrail.length = 0;
      cameraTrail.length = 0;
      historyData.errors.length = 0;
      historyData.confidences.length = 0;
      historyData.severities.length = 0;
      updatePlaybackControls(false);
      logTerminal('SCENARIO', `Loaded '${sc.scenario_name}' | Horizon: ${totalFrames} frames`, 'info');
      resetTelemetryView();
    } else if (msg.type === 'scenario_complete') {
      updatePlaybackControls(false);
      logTerminal('STATUS', `Scenario completed at frame ${msg.frame_id}. Target locked.`, 'lock');
      playLockChirp();
    } else if (msg.type === 'reset') {
      currentFrame = 0;
      targetTrail.length = 0;
      cameraTrail.length = 0;
      historyData.errors.length = 0;
      historyData.confidences.length = 0;
      historyData.severities.length = 0;
      updatePlaybackControls(false);
      resetTelemetryView();
      logTerminal('COMMAND', 'Simulation reset to frame 0.', 'info');
    }
  }

  function populateScenarios(scenarios) {
    if (!scenarios || !scenarios.length) return;
    el.scenarioSelect.innerHTML = '';

    const synthGroup = document.createElement('optgroup');
    synthGroup.label = '⚡ Synthetic PAT Scenarios';
    const videoGroup = document.createElement('optgroup');
    videoGroup.label = '🎬 Real Optical Video Benchmarks';

    scenarios.forEach((s, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${s.name} (${s.num_frames}f)`;
      if ((s.category && s.category === 'video_evaluation') || (s.name && s.name.startsWith('[VIDEO]'))) {
        videoGroup.appendChild(opt);
      } else {
        synthGroup.appendChild(opt);
      }
    });

    if (synthGroup.children.length > 0) el.scenarioSelect.appendChild(synthGroup);
    if (videoGroup.children.length > 0) el.scenarioSelect.appendChild(videoGroup);
  }

  function resetTelemetryView() {
    el.frameCounter.textContent = `0 / ${totalFrames}`;
    el.simTime.textContent = '0.000 s';
    el.simProgressBar.style.width = '0%';
    if (el.scopeCh1Val) el.scopeCh1Val.textContent = '0.000';
    if (el.scopeCh2Val) el.scopeCh2Val.textContent = '0%';
    if (el.scopeCh3Val) el.scopeCh3Val.textContent = '0%';

    const isVideo = activeScenario && (activeScenario.frame_source === 'video_file' || activeScenario.category === 'video_evaluation');
    if (el.cameraTitleText) {
      el.cameraTitleText.textContent = isVideo ? 'OPTICAL FEED [VIDEO BENCHMARK]' : 'CMOS OPTICAL SENSOR (640×480)';
    }
    if (el.camIndicator) {
      el.camIndicator.className = isVideo ? 'v-indicator' : 'v-indicator amber';
    }

    drawRadarPlaceholder();
    drawOscilloscope();
  }

  // --- Telemetry Processing & HUD Updates ---
  function onTelemetryReceived(t) {
    if (!t) return;
    latestTelemetry = t;
    currentFrame = t.frame_id;

    // Stream FPS & Algorithm Latency
    frameCountForFps++;
    const now = performance.now();
    if (now - fpsTimer >= 1000) {
      streamFps = (frameCountForFps * 1000) / (now - fpsTimer);
      el.streamFps.textContent = streamFps.toFixed(1);
      frameCountForFps = 0;
      fpsTimer = now;
    }

    if (t.profiling && t.profiling.total_frame_ms) {
      el.algoLatency.textContent = `${t.profiling.total_frame_ms.toFixed(1)} ms`;
    }

    // Top Counters
    el.frameCounter.textContent = `${t.frame_id} / ${totalFrames}`;
    el.simTime.textContent = `${t.sim_time.toFixed(3)} s`;
    const progress = Math.min(100, (t.frame_id / Math.max(1, totalFrames)) * 100);
    el.simProgressBar.style.width = `${progress}%`;

    // Audio Cue Triggers
    if (t.is_locked && !prevLocked) {
      playLockChirp();
    } else if (!t.is_locked && prevLocked) {
      playLossAlarm();
    }
    if (t.tracker_mode !== prevMode && t.tracker_mode in { KF: 1, PF: 1 }) {
      playSwitchChirp();
    }
    prevLocked = t.is_locked;
    prevMode = t.tracker_mode;

    // Update Telemetry Badges
    updateTelemetryHUD(t);

    // Update Optical Camera Feed
    if (t.camera_frame) {
      el.cameraImg.src = t.camera_frame;
    }
    const gainVal = (t.hardware && t.hardware.camera_gain) ? t.hardware.camera_gain.toFixed(2) : '1.00';
    el.cameraSnr.textContent = `CONF: ${(t.confidence || 0).toFixed(3)} | GAIN: ${gainVal}x`;
    el.camGainStat.textContent = `AGC GAIN: ${gainVal}x`;
    if (t.detected_spot && t.detected_spot.x !== null) {
      el.camSpotPos.textContent = `SPOT: (${t.detected_spot.x.toFixed(1)}, ${t.detected_spot.y.toFixed(1)}) px`;
      el.camPeakCounts.textContent = `PEAK: ${(t.detected_spot.peak || 220).toFixed(0)} cts`;
    } else {
      el.camSpotPos.textContent = 'SPOT: [NO DETECTION]';
      el.camPeakCounts.textContent = 'PEAK: 0 cts';
    }

    // Live Oscilloscope Header Channel Values
    if (el.scopeCh1Val) {
      el.scopeCh1Val.textContent = t.tracking_error_mrad !== null ? t.tracking_error_mrad.toFixed(3) : '0.000';
    }
    if (el.scopeCh2Val) {
      el.scopeCh2Val.textContent = `${((t.confidence || 0) * 100).toFixed(0)}%`;
    }
    if (el.scopeCh3Val) {
      el.scopeCh3Val.textContent = `${((t.severity || 0) * 100).toFixed(0)}%`;
    }

    // Dynamic Video Scenario Detection in Header
    if (el.cameraTitleText) {
      const isVideo = (activeScenario && (activeScenario.frame_source === 'video_file' || activeScenario.category === 'video_evaluation')) ||
                      (t.all_targets && t.all_targets[0] && t.all_targets[0].motion_type === 'VIDEO_OPTICAL_SPOT');
      if (isVideo && !el.cameraTitleText.textContent.includes('VIDEO')) {
        el.cameraTitleText.textContent = 'OPTICAL FEED [VIDEO BENCHMARK]';
        if (el.camIndicator) el.camIndicator.className = 'v-indicator';
      }
    }

    // Push into History for Oscilloscope
    const errVal = t.tracking_error_mrad !== null ? t.tracking_error_mrad : 0.0;
    historyData.errors.push(errVal);
    historyData.confidences.push(t.confidence || 0.0);
    historyData.severities.push(t.severity || 0.0);

    if (historyData.errors.length > MAX_HISTORY) {
      historyData.errors.shift();
      historyData.confidences.shift();
      historyData.severities.shift();
    }

    // Add Trail Points
    if (t.target_pos) {
      targetTrail.push({ pan: t.target_pos[0], tilt: t.target_pos[1], locked: t.is_locked, valid: t.is_valid_det });
      if (targetTrail.length > MAX_TRAIL) targetTrail.shift();
    }
    if (t.camera_pan_tilt) {
      cameraTrail.push({ pan: t.camera_pan_tilt[0], tilt: t.camera_pan_tilt[1] });
      if (cameraTrail.length > MAX_TRAIL) cameraTrail.shift();
    }

    // Sync Multi-Target list in dropdown
    if (t.all_targets && t.all_targets.length > 0 && el.targetSwitchSelect.children.length !== t.all_targets.length) {
      el.targetSwitchSelect.innerHTML = '';
      t.all_targets.forEach((tgt) => {
        const opt = document.createElement('option');
        opt.value = tgt.target_id;
        opt.textContent = `${tgt.target_id}${tgt.is_primary ? ' [PRIMARY]' : ''} (${tgt.motion_type})`;
        opt.selected = tgt.is_primary;
        el.targetSwitchSelect.appendChild(opt);
      });
    }

    // Render Canvas & Oscilloscope
    renderRadar(t);
    drawOscilloscope();

    // Update KPI Report Tab
    updateKpiReport(t);

    // Update Atmospheric Turbulence & Wave Propagation Displays
    updateTurbulenceDisplays(t);

    // Event Log
    if (t.event_message) {
      const cls = t.event_type === 'MODE_SWITCH' ? 'switch' :
                  t.event_type === 'LOSS' ? 'loss' :
                  t.event_type === 'REACQ' ? 'reacq' : 'info';
      logTerminal(t.event_type || 'EVENT', t.event_message, cls);
    }
  }

  function updateTelemetryHUD(t) {
    // Mode
    const mode = t.tracker_mode || 'LOST';
    el.trackerModeVal.textContent = mode;
    el.trackerModeVal.className = `mode-text ${mode.toLowerCase()}`;

    if (mode === 'KF') el.trackerModeSub.textContent = 'Kalman Filter (Clear Sky)';
    else if (mode === 'PF') el.trackerModeSub.textContent = 'Particle Filter (Turbulence)';
    else if (mode === 'COAST') el.trackerModeSub.textContent = 'Predictive Inertial Coast';
    else el.trackerModeSub.textContent = 'Target Lost / Searching';

    // FSM Supervisor
    const fsm = t.supervisor_state || 'TRACKING';
    el.fsmBadge.textContent = fsm;
    el.fsmBadge.className = `pulse-tag ${fsm.toLowerCase()}`;

    // Lock Retention
    el.lockRetentionVal.textContent = `${(t.lock_retention_rate || 100).toFixed(1)}%`;
    el.lockStateSub.textContent = t.is_locked ? 'BORESIGHT LOCKED' : 'LOS OFFSET / RECOVERING';
    el.lockStateSub.style.color = t.is_locked ? 'var(--green)' : 'var(--amber)';

    // Tracking Error
    const errMrad = t.tracking_error_mrad !== null ? t.tracking_error_mrad.toFixed(3) : '--';
    el.errMradVal.textContent = errMrad;
    const errPct = Math.min(100, ((t.tracking_error_mrad || 0) / 4.0) * 100);
    el.errMradBar.style.width = `${errPct}%`;
    el.errMradBar.style.background = (t.tracking_error_mrad || 0) <= 2.0 ? 'var(--cyan)' : 'var(--red)';

    const errPx = t.tracking_error_px !== null ? t.tracking_error_px.toFixed(1) : '--';
    el.errPxVal.textContent = errPx;
    const pxPct = Math.min(100, ((t.tracking_error_px || 0) / 50.0) * 100);
    el.errPxBar.style.width = `${pxPct}%`;

    // Confidence
    const conf = t.confidence || 0.0;
    el.confidenceVal.textContent = conf.toFixed(2);
    el.confBar.style.width = `${Math.min(100, conf * 100)}%`;

    // Severity
    const sev = t.severity || 0.0;
    el.severityVal.textContent = sev.toFixed(2);
    el.sevBar.style.width = `${Math.min(100, sev * 100)}%`;

    // Sub-Status Items
    el.reacqTierVal.textContent = t.reacquisition_tier || 'INACTIVE';
    if (t.disturbances && t.disturbances.fried_r0_mm) {
      el.friedR0Val.textContent = `${t.disturbances.fried_r0_mm} mm`;
    }
    if (t.metrics && t.metrics.acquisition_time_s !== null) {
      el.acqTimeVal.textContent = `${t.metrics.acquisition_time_s.toFixed(3)} s`;
    }

    // Coordinates Readout
    if (t.camera_pan_tilt) {
      const pMrad = (t.camera_pan_tilt[0] * 1e3).toFixed(2);
      const tMrad = (t.camera_pan_tilt[1] * 1e3).toFixed(2);
      el.radarCoords.textContent = `PAN: ${pMrad} mrad | TILT: ${tMrad} mrad`;
    }
  }

  function updateKpiReport(t) {
    if (!t.metrics) return;
    el.kpiMeanErr.textContent = `${t.metrics.avg_error_mrad.toFixed(3)} mrad`;
    el.kpiMaxErr.textContent = `${t.metrics.max_error_mrad.toFixed(3)} mrad`;
    el.kpiRmseErr.textContent = `${t.metrics.rmse_error_mrad.toFixed(3)} mrad`;
    el.kpiLockRate.textContent = `${t.metrics.lock_retention_pct.toFixed(1)} %`;
    if (t.metrics.acquisition_time_s) {
      el.kpiAcqTime.textContent = `${t.metrics.acquisition_time_s.toFixed(3)} s`;
    }
    if (t.profiling) {
      el.kpiAlgoFps.textContent = `${t.profiling.instantaneous_fps} FPS`;
      if (el.profRender) el.profRender.textContent = `${(t.profiling.rendering_ms || t.profiling.render_disturb_ms || 0).toFixed(2)} ms`;
      if (el.profTurb) el.profTurb.textContent = `${(t.profiling.disturb_turbulence_ms || 0).toFixed(3)} ms`;
      if (el.profNoise) el.profNoise.textContent = `${(t.profiling.disturb_noise_ms || 0).toFixed(3)} ms`;
      if (el.profVib) el.profVib.textContent = `${(t.profiling.disturb_vibration_ms || 0).toFixed(3)} ms`;
      if (el.profOcc) el.profOcc.textContent = `${(t.profiling.disturb_occlusion_ms || 0).toFixed(3)} ms`;
      if (el.profDetect) el.profDetect.textContent = `${(t.profiling.detect_ms || 0).toFixed(2)} ms`;
      if (el.profTrack) el.profTrack.textContent = `${(t.profiling.track_ms || 0).toFixed(2)} ms`;
      if (el.profControl) el.profControl.textContent = `${(t.profiling.control_ms || 0).toFixed(2)} ms`;

      if (el.profTurbChip) {
        const isTurbActive = (t.turbulence && t.turbulence.cn2 > 0);
        el.profTurbChip.textContent = isTurbActive ? 'ACTIVE' : 'IDLE';
        el.profTurbChip.className = `status-chip ${isTurbActive ? 'ok' : 'subtle'}`;
      }
    }

    if (t.root_cause_diagnosis) {
      const rc = t.root_cause_diagnosis;
      el.diagnosisContent.innerHTML = `
        <div style="color: var(--amber); font-weight: 700; margin-bottom: 4px;">
          DIAGNOSED TRACK LOSS: [${rc.cause}] (Confidence: ${(rc.confidence * 100).toFixed(0)}%)
        </div>
        <div style="color: var(--text-secondary); line-height: 1.4;">${rc.rationale}</div>
      `;
    } else if (t.is_locked) {
      el.diagnosisContent.innerHTML = `<span class="diag-status ok">NOMINAL CLOSED-LOOP TRACKING — ZERO LOSS DETECTED</span>`;
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

    // Compact technical strip on Flight Ops panel
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

    // Sidebar Fried r0
    if (el.friedR0Val) {
      el.friedR0Val.textContent = `${(tb.fried_r0_mm || 0).toFixed(1)} mm`;
    }

    // Full Atmospheric Turbulence Analyzer on Optics panel
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

  // --- World Radar Canvas Rendering ---
  function worldToCanvas(panRad, tiltRad, w, h) {
    const cx = w / 2.0;
    const cy = h / 2.0;
    const scaleX = w / radarViewport.spanPan;
    const scaleY = h / radarViewport.spanTilt;

    const dx = panRad - radarViewport.centerPan;
    const dy = tiltRad - radarViewport.centerTilt;

    const sx = cx + dx * scaleX;
    const sy = cy - dy * scaleY; // Invert tilt
    return [sx, sy];
  }

  function drawRadarPlaceholder() {
    const w = el.radarCanvas.width;
    const h = el.radarCanvas.height;
    radarCtx.clearRect(0, 0, w, h);
    drawRadarGrid(w, h);
  }

  function drawRadarGrid(w, h) {
    const cx = w / 2.0;
    const cy = h / 2.0;
    const scaleX = w / radarViewport.spanPan;
    const scaleY = h / radarViewport.spanTilt;

    // 1. Subtle Lens Vignette / Dark Aperture Backplate
    const grad = radarCtx.createRadialGradient(cx, cy, Math.min(w, h) * 0.15, cx, cy, Math.max(w, h) * 0.7);
    grad.addColorStop(0, '#0d131f');
    grad.addColorStop(1, '#080c14');
    radarCtx.fillStyle = grad;
    radarCtx.fillRect(0, 0, w, h);

    // 2. Corner Alignment Fiducials
    radarCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    radarCtx.lineWidth = 1;
    const fidLen = 8;
    const corners = [[16, 16], [w - 16, 16], [16, h - 16], [w - 16, h - 16]];
    corners.forEach(([fx, fy]) => {
      radarCtx.beginPath();
      radarCtx.moveTo(fx - fidLen, fy); radarCtx.lineTo(fx + fidLen, fy);
      radarCtx.moveTo(fx, fy - fidLen); radarCtx.lineTo(fx, fy + fidLen);
      radarCtx.stroke();
    });

    // 3. Coordinate Grid Lines (10 mrad major intervals)
    const stepRad = 0.010; // 10 mrad
    const minPan = radarViewport.centerPan - radarViewport.spanPan / 2;
    const maxPan = radarViewport.centerPan + radarViewport.spanPan / 2;
    const startX = Math.floor(minPan / stepRad) * stepRad;

    radarCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    radarCtx.lineWidth = 1;
    radarCtx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    radarCtx.font = '10.5px JetBrains Mono';

    radarCtx.beginPath();
    for (let p = startX; p <= maxPan; p += stepRad) {
      const [sx] = worldToCanvas(p, 0, w, h);
      radarCtx.moveTo(sx, 0);
      radarCtx.lineTo(sx, h);
    }

    const minTilt = radarViewport.centerTilt - radarViewport.spanTilt / 2;
    const maxTilt = radarViewport.centerTilt + radarViewport.spanTilt / 2;
    const startY = Math.floor(minTilt / stepRad) * stepRad;

    for (let t = startY; t <= maxTilt; t += stepRad) {
      const [, sy] = worldToCanvas(0, t, w, h);
      radarCtx.moveTo(0, sy);
      radarCtx.lineTo(w, sy);
    }
    radarCtx.stroke();

    // Axis Labels along border
    radarCtx.font = '10px JetBrains Mono';
    for (let p = startX; p <= maxPan; p += stepRad) {
      const [sx] = worldToCanvas(p, 0, w, h);
      if (sx > 40 && sx < w - 40) {
        const valMrad = (p * 1e3).toFixed(0);
        radarCtx.fillText(`${valMrad > 0 ? '+' : ''}${valMrad}`, sx - 10, h - 6);
      }
    }
    for (let t = startY; t <= maxTilt; t += stepRad) {
      const [, sy] = worldToCanvas(0, t, w, h);
      if (sy > 25 && sy < h - 25) {
        const valMrad = (t * 1e3).toFixed(0);
        radarCtx.fillText(`${valMrad > 0 ? '+' : ''}${valMrad}`, 6, sy + 3);
      }
    }

    // 4. Concentric Calibrated Range Rings
    [0.010, 0.020, 0.030].forEach((ringRad) => {
      const rPx = ringRad * scaleX;
      radarCtx.strokeStyle = 'rgba(0, 229, 255, 0.06)';
      radarCtx.lineWidth = 1;
      radarCtx.beginPath();
      radarCtx.arc(cx, cy, rPx, 0, Math.PI * 2);
      radarCtx.stroke();

      radarCtx.fillStyle = 'rgba(0, 229, 255, 0.35)';
      radarCtx.font = '10px JetBrains Mono';
      radarCtx.fillText(`${(ringRad * 1e3).toFixed(0)} mrad`, cx + rPx * 0.707 + 4, cy - rPx * 0.707 - 3);
    });

    // 5. Central Coordinate Axis Lines with Tick Marks
    radarCtx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    radarCtx.beginPath();
    radarCtx.moveTo(cx, 0); radarCtx.lineTo(cx, h);
    radarCtx.moveTo(0, cy); radarCtx.lineTo(w, cy);
    radarCtx.stroke();

    // Center Crosshair (Precision clearance gap)
    radarCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    radarCtx.beginPath();
    radarCtx.moveTo(cx - 18, cy); radarCtx.lineTo(cx - 4, cy);
    radarCtx.moveTo(cx + 4, cy); radarCtx.lineTo(cx + 18, cy);
    radarCtx.moveTo(cx, cy - 18); radarCtx.lineTo(cx, cy - 4);
    radarCtx.moveTo(cx, cy + 4); radarCtx.lineTo(cx, cy + 18);
    radarCtx.stroke();
  }

  function renderRadar(t) {
    const w = el.radarCanvas.width;
    const h = el.radarCanvas.height;
    const scaleX = w / radarViewport.spanPan;

    radarCtx.clearRect(0, 0, w, h);
    drawRadarGrid(w, h);

    // 1. Camera FOV Bounds (Precision 1px hairline with corner tick brackets)
    if (t.fov_bounds && t.fov_bounds.length === 4) {
      const [pMin, pMax, tMin, tMax] = t.fov_bounds;
      const [x1, y1] = worldToCanvas(pMin, tMax, w, h);
      const [x2, y2] = worldToCanvas(pMax, tMin, w, h);

      const fovW = x2 - x1;
      const fovH = y2 - y1;

      radarCtx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
      radarCtx.lineWidth = 1;
      radarCtx.fillStyle = 'rgba(0, 229, 255, 0.02)';
      radarCtx.strokeRect(x1, y1, fovW, fovH);
      radarCtx.fillRect(x1, y1, fovW, fovH);

      // Precision Corner Brackets
      const bSz = 10;
      radarCtx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
      radarCtx.lineWidth = 1.5;
      radarCtx.beginPath();
      radarCtx.moveTo(x1, y1 + bSz); radarCtx.lineTo(x1, y1); radarCtx.lineTo(x1 + bSz, y1);
      radarCtx.moveTo(x2 - bSz, y1); radarCtx.lineTo(x2, y1); radarCtx.lineTo(x2, y1 + bSz);
      radarCtx.moveTo(x1, y2 - bSz); radarCtx.lineTo(x1, y2); radarCtx.lineTo(x1 + bSz, y2);
      radarCtx.moveTo(x2 - bSz, y2); radarCtx.lineTo(x2, y2); radarCtx.lineTo(x2, y2 - bSz);
      radarCtx.stroke();

      // Top Tag
      radarCtx.fillStyle = 'rgba(0, 229, 255, 0.75)';
      radarCtx.font = '10px JetBrains Mono';
      radarCtx.fillText('OPTICAL DETECTOR ACTIVE APERTURE [50.0 mrad]', x1 + 6, y1 + 14);
    }

    // 2. Dynamic Occluders (Shadow zone with technical warning hatching)
    if (t.active_occluder) {
      const [ox, oy] = worldToCanvas(t.active_occluder.x, t.active_occluder.y, w, h);
      const oRadPx = t.active_occluder.radius_rad * scaleX;

      const occGrad = radarCtx.createRadialGradient(ox, oy, oRadPx * 0.1, ox, oy, oRadPx);
      occGrad.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
      occGrad.addColorStop(0.8, 'rgba(245, 158, 11, 0.08)');
      occGrad.addColorStop(1, 'rgba(245, 158, 11, 0.01)');

      radarCtx.fillStyle = occGrad;
      radarCtx.beginPath();
      radarCtx.arc(ox, oy, oRadPx, 0, Math.PI * 2);
      radarCtx.fill();

      radarCtx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      radarCtx.lineWidth = 1;
      radarCtx.setLineDash([4, 3]);
      radarCtx.beginPath();
      radarCtx.arc(ox, oy, oRadPx, 0, Math.PI * 2);
      radarCtx.stroke();
      radarCtx.setLineDash([]);

      radarCtx.fillStyle = 'rgba(245, 158, 11, 0.9)';
      radarCtx.font = '10.5px JetBrains Mono';
      radarCtx.fillText(`[LOS OCCLUDER: ${(t.active_occluder.radius_rad * 1e3).toFixed(1)} mrad]`, ox - 45, oy - oRadPx - 4);
    }

    // 3. Tier-1 Predictive Search Zone (Elliptical Search)
    if (t.reacq_zone && t.supervisor_state === 'SEARCHING') {
      const [zx, zy] = worldToCanvas(t.reacq_zone.center[0], t.reacq_zone.center[1], w, h);
      const sMajPx = t.reacq_zone.semi_major * scaleX;
      const sMinPx = t.reacq_zone.semi_minor * scaleX;

      radarCtx.save();
      radarCtx.translate(zx, zy);
      radarCtx.rotate(-t.reacq_zone.orientation_rad);

      radarCtx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
      radarCtx.lineWidth = 1.2;
      radarCtx.setLineDash([4, 3]);
      radarCtx.fillStyle = 'rgba(245, 158, 11, 0.08)';

      radarCtx.beginPath();
      radarCtx.ellipse(0, 0, sMajPx, sMinPx, 0, 0, Math.PI * 2);
      radarCtx.fill();
      radarCtx.stroke();
      radarCtx.restore();

      radarCtx.fillStyle = 'var(--amber)';
      radarCtx.font = '10.5px JetBrains Mono';
      radarCtx.fillText('TIER-1 REACQUISITION SEARCH ZONE', zx - 65, zy - sMinPx - 6);
    }

    // 4. Probabilistic Particle Filter Cloud (Delicate Monte Carlo stippling)
    if (t.tracker_mode === 'PF' && t.particle_cloud && t.particle_cloud.length > 0) {
      radarCtx.fillStyle = 'rgba(168, 85, 247, 0.6)';
      t.particle_cloud.forEach(([px, py]) => {
        const [sx, sy] = worldToCanvas(px, py, w, h);
        radarCtx.beginPath();
        radarCtx.arc(sx, sy, 1.8, 0, Math.PI * 2);
        radarCtx.fill();
      });
    }

    // 5. Kalman Covariance Ellipse (Crisp 1px dashed)
    if (t.kalman_cov && (t.tracker_mode === 'KF' || t.tracker_mode === 'COAST') && t.camera_pan_tilt) {
      const [cx, cy] = worldToCanvas(t.camera_pan_tilt[0], t.camera_pan_tilt[1], w, h);
      const covXPx = t.kalman_cov.sigma_x * 2.0 * scaleX;
      const covYPx = t.kalman_cov.sigma_y * 2.0 * scaleX;

      radarCtx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
      radarCtx.lineWidth = 1;
      radarCtx.setLineDash([3, 3]);
      radarCtx.beginPath();
      radarCtx.ellipse(cx, cy, Math.max(6, covXPx), Math.max(6, covYPx), 0, 0, Math.PI * 2);
      radarCtx.stroke();
      radarCtx.setLineDash([]);
    }

    // 6. Target Trajectory Trail (Clean fading path with micro-points)
    if (targetTrail.length > 1) {
      for (let i = 1; i < targetTrail.length; i++) {
        const p1 = targetTrail[i - 1];
        const p2 = targetTrail[i];
        const [x1, y1] = worldToCanvas(p1.pan, p1.tilt, w, h);
        const [x2, y2] = worldToCanvas(p2.pan, p2.tilt, w, h);

        const alpha = (i / targetTrail.length) * 0.65;
        radarCtx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
        radarCtx.lineWidth = 1.2;
        radarCtx.beginPath();
        radarCtx.moveTo(x1, y1);
        radarCtx.lineTo(x2, y2);
        radarCtx.stroke();
      }
    }

    // 7. Render All Multi-Targets
    if (t.all_targets && t.all_targets.length > 0) {
      t.all_targets.forEach((tgt) => {
        const [tx, ty] = worldToCanvas(tgt.pos[0], tgt.pos[1], w, h);
        const isPrimary = tgt.is_primary;

        if (isPrimary) {
          const targetCol = t.is_locked ? '#10b981' : t.is_valid_det ? '#00e5ff' : '#f59e0b';

          // Outer reticle circle with 4 corner tick marks
          radarCtx.strokeStyle = targetCol;
          radarCtx.lineWidth = 1.5;
          radarCtx.beginPath();
          radarCtx.arc(tx, ty, 8, 0, Math.PI * 2);
          radarCtx.stroke();

          // 4 Cardinal Ticks
          const tickLen = 4;
          radarCtx.beginPath();
          radarCtx.moveTo(tx - 8 - tickLen, ty); radarCtx.lineTo(tx - 8, ty);
          radarCtx.moveTo(tx + 8, ty); radarCtx.lineTo(tx + 8 + tickLen, ty);
          radarCtx.moveTo(tx, ty - 8 - tickLen); radarCtx.lineTo(tx, ty - 8);
          radarCtx.moveTo(tx, ty + 8); radarCtx.lineTo(tx, ty + 8 + tickLen);
          radarCtx.stroke();

          // Solid Target Core
          radarCtx.fillStyle = targetCol;
          radarCtx.beginPath();
          radarCtx.arc(tx, ty, 2.5, 0, Math.PI * 2);
          radarCtx.fill();

          // Clean Aerospace Callout
          radarCtx.fillStyle = '#f1f5f9';
          radarCtx.font = '10.5px JetBrains Mono';
          radarCtx.fillText(`TGT-${tgt.target_id} [PRI]`, tx + 14, ty - 2);

          radarCtx.fillStyle = targetCol;
          const statusText = t.is_locked ? 'LOCKED' : t.is_valid_det ? 'TRACK' : 'COAST';
          radarCtx.fillText(`${statusText} (${(tgt.motion_type || '').toUpperCase()})`, tx + 14, ty + 10);
        } else {
          // Secondary / Clutter Target (Dotted Muted Ring)
          radarCtx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
          radarCtx.lineWidth = 1;
          radarCtx.setLineDash([2, 2]);
          radarCtx.beginPath();
          radarCtx.arc(tx, ty, 5.5, 0, Math.PI * 2);
          radarCtx.stroke();
          radarCtx.setLineDash([]);

          radarCtx.fillStyle = 'rgba(0, 229, 255, 0.6)';
          radarCtx.beginPath();
          radarCtx.arc(tx, ty, 2, 0, Math.PI * 2);
          radarCtx.fill();

          radarCtx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          radarCtx.font = '10.5px JetBrains Mono';
          radarCtx.fillText(`TGT-${tgt.target_id}`, tx + 9, ty + 3);
        }

        // Velocity Vector Arrow
        const vxPx = tgt.vel[0] * 1.5 * scaleX;
        const vyPx = -tgt.vel[1] * 1.5 * scaleX;
        radarCtx.strokeStyle = isPrimary ? 'rgba(16, 185, 129, 0.7)' : 'rgba(0, 229, 255, 0.35)';
        radarCtx.lineWidth = 1;
        radarCtx.beginPath();
        radarCtx.moveTo(tx, ty);
        radarCtx.lineTo(tx + vxPx, ty + vyPx);
        radarCtx.stroke();
      });
    }

    // 8. Actuator / Gimbal Boresight Reticle
    if (t.camera_pan_tilt) {
      const [bx, by] = worldToCanvas(t.camera_pan_tilt[0], t.camera_pan_tilt[1], w, h);

      // Fine Pointing Coupling Tolerance Circle (2.0 mrad threshold boundary!)
      const spec2mradPx = 0.002 * scaleX;
      radarCtx.strokeStyle = t.is_locked ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)';
      radarCtx.lineWidth = 1;
      radarCtx.setLineDash([2, 3]);
      radarCtx.beginPath();
      radarCtx.arc(bx, by, spec2mradPx, 0, Math.PI * 2);
      radarCtx.stroke();
      radarCtx.setLineDash([]);

      // Precision Open-Center Reticle Crosshairs
      radarCtx.strokeStyle = t.is_locked ? 'rgba(0, 229, 255, 0.95)' : 'rgba(245, 158, 11, 0.9)';
      radarCtx.lineWidth = 1.5;

      const rInner = 5;
      const rOuter = 14;
      radarCtx.beginPath();
      radarCtx.moveTo(bx - rOuter, by); radarCtx.lineTo(bx - rInner, by);
      radarCtx.moveTo(bx + rInner, by); radarCtx.lineTo(bx + rOuter, by);
      radarCtx.moveTo(bx, by - rOuter); radarCtx.lineTo(bx, by - rInner);
      radarCtx.moveTo(bx, by + rInner); radarCtx.lineTo(bx, by + rOuter);
      radarCtx.stroke();

      radarCtx.beginPath();
      radarCtx.arc(bx, by, 9, 0, Math.PI * 2);
      radarCtx.stroke();

      // Dashed Error Vector to Primary Target
      if (t.target_pos) {
        const [tx, ty] = worldToCanvas(t.target_pos[0], t.target_pos[1], w, h);
        const errDist = Math.hypot(tx - bx, ty - by);
        if (errDist > 3) {
          radarCtx.strokeStyle = t.is_locked ? 'rgba(0, 229, 255, 0.4)' : 'rgba(245, 158, 11, 0.4)';
          radarCtx.lineWidth = 1;
          radarCtx.setLineDash([2, 2]);
          radarCtx.beginPath();
          radarCtx.moveTo(bx, by);
          radarCtx.lineTo(tx, ty);
          radarCtx.stroke();
          radarCtx.setLineDash([]);
        }
      }
    }

    // 9. Precision In-Canvas Telemetry HUD Overlays (Top clearance only; bottom clean for legend)
    radarCtx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    radarCtx.font = '10px JetBrains Mono';
    const azStr = ((t.camera_pan_tilt?.[0] || 0) * 1e3).toFixed(2);
    const elStr = ((t.camera_pan_tilt?.[1] || 0) * 1e3).toFixed(2);
    radarCtx.fillText(`GIMBAL: AZ ${azStr > 0 ? '+' : ''}${azStr} | EL ${elStr > 0 ? '+' : ''}${elStr} mrad`, 14, 18);

    const lockStateStr = t.is_locked ? 'STATUS: COARSE PAT LOCKED (<=2.0 mrad)' : 'STATUS: ACQUIRING / SCANNING';
    radarCtx.fillStyle = t.is_locked ? '#10b981' : '#f59e0b';
    radarCtx.fillText(lockStateStr, Math.max(260, w - 240), 18);
  }

  // --- Real-Time Oscilloscope ---
  function drawOscilloscope() {
    const w = el.chartCanvas.width;
    const h = el.chartCanvas.height;

    chartCtx.clearRect(0, 0, w, h);

    // 1. Dark CRT Scope Background
    chartCtx.fillStyle = '#0a0e17';
    chartCtx.fillRect(0, 0, w, h);

    // 2. Oscilloscope Grid
    chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    chartCtx.lineWidth = 1;

    // Horizontal division lines (0, 1, 2, 3, 4, 5 mrad)
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = h - (i / ySteps) * (h - 28) - 14;
      chartCtx.beginPath();
      chartCtx.moveTo(0, y);
      chartCtx.lineTo(w, y);
      chartCtx.stroke();
    }

    // Vertical time division lines
    for (let x = 0; x < w; x += 45) {
      chartCtx.beginPath();
      chartCtx.moveTo(x, 0);
      chartCtx.lineTo(x, h);
      chartCtx.stroke();
    }

    // 3. 2.0 mrad Specification Threshold Line
    const threshY = h - (2.0 / 6.0) * (h - 28) - 14;
    chartCtx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
    chartCtx.lineWidth = 1;
    chartCtx.setLineDash([4, 3]);
    chartCtx.beginPath();
    chartCtx.moveTo(0, threshY);
    chartCtx.lineTo(w, threshY);
    chartCtx.stroke();
    chartCtx.setLineDash([]);

    chartCtx.fillStyle = 'rgba(239, 68, 68, 0.9)';
    chartCtx.font = '10px JetBrains Mono';
    chartCtx.fillText('2.00 mrad FSOC FINE-POINTING SPEC LIMIT', 10, threshY - 4);

    // Baseline (0.0 mrad)
    const zeroY = h - 14;
    chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    chartCtx.lineWidth = 1;
    chartCtx.beginPath();
    chartCtx.moveTo(0, zeroY);
    chartCtx.lineTo(w, zeroY);
    chartCtx.stroke();

    // 4. Trace Rendering
    if (historyData.errors.length >= 2) {
      const len = historyData.errors.length;
      const stepX = w / (MAX_HISTORY - 1);

      // Channel 1 Fill Under Error Curve
      chartCtx.fillStyle = 'rgba(0, 229, 255, 0.05)';
      chartCtx.beginPath();
      chartCtx.moveTo(0, zeroY);
      historyData.errors.forEach((val, idx) => {
        const x = idx * stepX;
        const normY = Math.min(1.0, val / 6.0);
        const y = h - normY * (h - 28) - 14;
        chartCtx.lineTo(x, y);
      });
      chartCtx.lineTo((len - 1) * stepX, zeroY);
      chartCtx.closePath();
      chartCtx.fill();

      // Channel 1: Tracking Error (mrad) - Solid Cyan 1.8px
      chartCtx.strokeStyle = '#00e5ff';
      chartCtx.lineWidth = 1.8;
      chartCtx.beginPath();
      historyData.errors.forEach((val, idx) => {
        const x = idx * stepX;
        const normY = Math.min(1.0, val / 6.0);
        const y = h - normY * (h - 28) - 14;
        if (idx === 0) chartCtx.moveTo(x, y);
        else chartCtx.lineTo(x, y);
      });
      chartCtx.stroke();

      // Channel 2: Confidence (0 to 1) - Crisp Green 1.2px
      chartCtx.strokeStyle = '#10b981';
      chartCtx.lineWidth = 1.2;
      chartCtx.beginPath();
      historyData.confidences.forEach((val, idx) => {
        const x = idx * stepX;
        const y = h - val * (h - 28) - 14;
        if (idx === 0) chartCtx.moveTo(x, y);
        else chartCtx.lineTo(x, y);
      });
      chartCtx.stroke();

      // Channel 3: Severity (0 to 1) - Amber 1.2px
      chartCtx.strokeStyle = '#f59e0b';
      chartCtx.lineWidth = 1.2;
      chartCtx.beginPath();
      historyData.severities.forEach((val, idx) => {
        const x = idx * stepX;
        const y = h - val * (h - 28) - 14;
        if (idx === 0) chartCtx.moveTo(x, y);
        else chartCtx.lineTo(x, y);
      });
      chartCtx.stroke();
    }

    // 5. Channel Readouts updated in HTML Header to guarantee zero text collision
    const curErr = historyData.errors.length ? historyData.errors[historyData.errors.length - 1].toFixed(3) : '0.000';
    const curConf = historyData.confidences.length ? (historyData.confidences[historyData.confidences.length - 1] * 100).toFixed(0) : '0';
    const curSev = historyData.severities.length ? (historyData.severities[historyData.severities.length - 1] * 100).toFixed(0) : '0';

    if (el.scopeCh1Val) el.scopeCh1Val.textContent = curErr;
    if (el.scopeCh2Val) el.scopeCh2Val.textContent = `${curConf}%`;
    if (el.scopeCh3Val) el.scopeCh3Val.textContent = `${curSev}%`;
  }

  // --- Terminal Event Log Helper ---
  function logTerminal(tag, msg, cls = 'info') {
    const timeStr = new Date().toISOString().substring(14, 22);
    const line = document.createElement('div');
    line.className = `log-line ${cls}`;
    line.textContent = `[${timeStr}] [${tag}] ${msg}`;
    el.eventLogTerminal.appendChild(line);
    el.eventLogTerminal.scrollTop = el.eventLogTerminal.scrollHeight;

    while (el.eventLogTerminal.children.length > 80) {
      el.eventLogTerminal.removeChild(el.eventLogTerminal.firstChild);
    }
  }

  // --- UI Controls & Event Listeners ---
  function updatePlaybackControls(running) {
    isPlaying = running;
    if (isPlaying) {
      el.btnPlay.innerHTML = '<span class="btn-icon">⏸</span> PAUSE';
      el.btnPlay.style.background = 'var(--amber)';
      el.btnPlay.style.borderColor = 'var(--amber)';
    } else {
      el.btnPlay.innerHTML = '<span class="btn-icon">▶</span> PLAY';
      el.btnPlay.style.background = 'var(--cyan)';
      el.btnPlay.style.borderColor = 'var(--cyan)';
    }
  }

  function setupEventListeners() {
    // Master Workspace Tab Navigation
    el.masterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        el.masterTabs.forEach((t) => t.classList.remove('active'));
        el.workspacePanels.forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        const targetPanel = tab.getAttribute('data-panel');
        const p = document.getElementById(`panel-${targetPanel}`);
        if (p) p.classList.add('active');
      });
    });

    // Audio Mute Toggle
    el.btnSoundToggle.addEventListener('click', () => {
      initAudio();
      soundEnabled = !soundEnabled;
      el.btnSoundToggle.textContent = soundEnabled ? '🔊 SOUND: ON' : '🔇 SOUND: MUTED';
      el.btnSoundToggle.style.borderColor = soundEnabled ? 'var(--cyan)' : 'var(--border-subtle)';
    });

    // Playback Transport Controls
    el.btnPlay.addEventListener('click', () => {
      initAudio();
      if (isPlaying) {
        sendCommand({ action: 'pause' });
        updatePlaybackControls(false);
      } else {
        sendCommand({ action: 'play', speed: playbackSpeed });
        updatePlaybackControls(true);
      }
    });

    el.btnPause.addEventListener('click', () => {
      sendCommand({ action: 'pause' });
      updatePlaybackControls(false);
    });

    el.btnStep.addEventListener('click', () => {
      initAudio();
      sendCommand({ action: 'step' });
      updatePlaybackControls(false);
    });

    el.btnReset.addEventListener('click', () => {
      sendCommand({ action: 'reset' });
      updatePlaybackControls(false);
    });

    // Speed Slider
    el.sliderSpeed.addEventListener('input', (e) => {
      playbackSpeed = parseFloat(e.target.value);
      el.speedLabel.textContent = `${playbackSpeed.toFixed(1)}x`;
      sendCommand({ action: 'set_speed', speed: playbackSpeed });
    });

    // Scenario Select
    el.scenarioSelect.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      sendCommand({ action: 'select_scenario', index: idx });
    });

    // View Switching Tabs
    const tabs = [el.tabBoth, el.tabRadar, el.tabCamera];
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const view = tab.getAttribute('data-view');
        el.displaysContainer.className = `displays-wrapper ${view === 'radar' ? 'radar-only' : view === 'camera' ? 'camera-only' : ''}`;
      });
    });

    // Colormap Switcher
    el.colormapSelect.addEventListener('change', (e) => {
      const cm = e.target.value;
      sendCommand({ action: 'set_colormap', colormap: cm });
      logTerminal('OPTICS', `Sensor colormap switched to '${cm}'.`, 'info');
    });

    // Radar Center
    el.radarResetBtn.addEventListener('click', () => {
      radarViewport.centerPan = 0.012;
      radarViewport.centerTilt = -0.004;
      logTerminal('RADAR', 'Viewport centered to nominal boresight coordinates.', 'info');
    });

    // Quick Disturbance Sliders
    el.sliderCn2.addEventListener('input', (e) => {
      const expVal = parseFloat(e.target.value);
      const cn2 = Math.pow(10, expVal);
      el.cn2Disp.textContent = cn2.toExponential(1);

      // Instant Physics Feedback for immediate responsiveness
      const k = 2.0 * Math.PI / 1550e-9;
      const L = 5000.0;
      const r0 = Math.min(2000.0, Math.max(5.0, Math.pow(0.423 * (k * k) * cn2 * L, -0.6) * 1000.0));
      const rytov = 1.23 * cn2 * Math.pow(k, 7.0 / 6.0) * Math.pow(L, 11.0 / 6.0);
      const atten = Math.min(1.0, Math.max(0.40, 1.0 - 0.45 * Math.log10(Math.max(1e-16, cn2) / 1e-16) / 3.5));
      const fadePct = (1.0 - atten) * 100.0;
      const strehl = 1.0 / (1.0 + Math.pow(100.0 / Math.max(0.1, r0), 5.0 / 3.0));

      if (el.turbMiniR0) el.turbMiniR0.textContent = `${r0.toFixed(1)}mm`;
      if (el.turbMiniRytov) el.turbMiniRytov.textContent = rytov.toFixed(3);
      if (el.turbMiniFade) el.turbMiniFade.textContent = `-${fadePct.toFixed(0)}%`;
      if (el.turbMiniStrehl) el.turbMiniStrehl.textContent = strehl.toFixed(2);
      if (el.turbMiniRegime) {
        const reg = cn2 >= 1e-13 ? 'SEVERE' : cn2 >= 1e-15 ? 'MODERATE' : 'CLEAR';
        el.turbMiniRegime.textContent = reg;
        el.turbMiniRegime.className = `t-pill chip-regime ${reg.toLowerCase()}`;
      }

      sendCommand({ action: 'update_disturbances', cn2: cn2 });
    });

    el.sliderVibAmp.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      el.vibAmpDisp.textContent = `${val.toFixed(2)} mrad`;
      sendCommand({ action: 'update_disturbances', vibration_amp: val * 1e-3 });
    });

    el.sliderVibFreq.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      el.vibFreqDisp.textContent = `${val.toFixed(0)} Hz`;
      sendCommand({ action: 'update_disturbances', vibration_freq: val });
    });

    // Inject Occluder
    el.btnInjectOcc.addEventListener('click', () => {
      initAudio();
      sendCommand({ action: 'inject_occluder', duration_frames: 20, radius_rad: 0.008 });
      logTerminal('DISTURBANCE', 'Manual dynamic occluder injected into Line-of-Sight!', 'warn');
      playLossAlarm();
    });

    // Clear Log
    el.btnClearLog.addEventListener('click', () => {
      el.eventLogTerminal.innerHTML = '';
      logTerminal('SYSTEM', 'Log cleared.', 'init');
    });

    // --- HARDWARE & CONTROL LAB LISTENERS ---
    // PID Sliders Realtime Readout
    el.pidKp.addEventListener('input', (e) => el.pidKpDisp.textContent = parseFloat(e.target.value).toFixed(2));
    el.pidKi.addEventListener('input', (e) => el.pidKiDisp.textContent = parseFloat(e.target.value).toFixed(2));
    el.pidKd.addEventListener('input', (e) => el.pidKdDisp.textContent = parseFloat(e.target.value).toFixed(2));
    el.pidKff.addEventListener('input', (e) => el.pidKffDisp.textContent = parseFloat(e.target.value).toFixed(2));

    el.btnApplyPid.addEventListener('click', () => {
      sendCommand({
        action: 'update_pid',
        kp: parseFloat(el.pidKp.value),
        ki: parseFloat(el.pidKi.value),
        kd: parseFloat(el.pidKd.value),
        k_ff: parseFloat(el.pidKff.value),
        enable_feedforward: el.chkFeedforward.checked,
      });
      logTerminal('CONTROL', `Updated PID gains: Kp=${el.pidKp.value}, Ki=${el.pidKi.value}, Kd=${el.pidKd.value}, Kff=${el.pidKff.value}`, 'info');
    });

    // Slew & Latency
    el.hwMaxVel.addEventListener('input', (e) => el.hwMaxVelDisp.textContent = `${parseFloat(e.target.value).toFixed(2)} rad/s`);
    el.hwMaxAcc.addEventListener('input', (e) => el.hwMaxAccDisp.textContent = `${parseFloat(e.target.value).toFixed(2)} rad/s²`);
    el.hwLatency.addEventListener('input', (e) => {
      const fr = parseInt(e.target.value, 10);
      el.hwLatencyDisp.textContent = `${fr} frames (~${(fr * 33).toFixed(0)} ms)`;
    });

    el.btnApplyHw.addEventListener('click', () => {
      sendCommand({
        action: 'update_control_hardware',
        max_velocity: parseFloat(el.hwMaxVel.value),
        max_acceleration: parseFloat(el.hwMaxAcc.value),
        latency_frames: parseInt(el.hwLatency.value, 10),
      });
      logTerminal('HARDWARE', `Updated actuator limits: MaxVel=${el.hwMaxVel.value} rad/s, Latency=${el.hwLatency.value} frames`, 'info');
    });

    // Reacquisition Settings
    el.reacqBudget.addEventListener('input', (e) => el.reacqBudgetDisp.textContent = `${e.target.value} frames`);
    el.reacqRate.addEventListener('input', (e) => el.reacqRateDisp.textContent = `${parseFloat(e.target.value).toFixed(2)} rad/s`);

    el.btnApplyReacq.addEventListener('click', () => {
      sendCommand({
        action: 'update_control_hardware',
        enable_predictive_search: el.chkPredSearch.checked,
        tier1_budget: parseInt(el.reacqBudget.value, 10),
        scan_rate: parseFloat(el.reacqRate.value),
      });
      logTerminal('REACQUISITION', `Updated Reacq strategy: PredSearch=${el.chkPredSearch.checked}, Tier1Budget=${el.reacqBudget.value}f`, 'info');
    });

    el.chkAutoExposure.addEventListener('change', (e) => {
      sendCommand({ action: 'set_auto_exposure', enabled: e.target.checked });
      logTerminal('OPTICS', `Auto-Exposure / AGC controller ${e.target.checked ? 'ENABLED' : 'DISABLED'}.`, 'info');
    });

    // --- MULTI-TARGET & OPTICS LAB LISTENERS ---
    el.btnApplyMotion.addEventListener('click', () => {
      const mType = el.motionTypeSelect.value;
      const tgtId = el.targetSwitchSelect.value;
      sendCommand({ action: 'set_target_motion', motion_type: mType, target_id: tgtId });
      logTerminal('KINEMATICS', `Target '${tgtId}' motion trajectory set to '${mType}'.`, 'info');
    });

    el.targetSwitchSelect.addEventListener('change', (e) => {
      const tgtId = e.target.value;
      sendCommand({ action: 'set_primary_target', target_id: tgtId });
      logTerminal('TARGET', `Designated '${tgtId}' as primary tracking beacon.`, 'lock');
    });

    el.chkSignatureVerif.addEventListener('change', (e) => {
      sendCommand({ action: 'set_signature_verification', enabled: e.target.checked });
      logTerminal('DETECTOR', `Temporal blinking signature verification ${e.target.checked ? 'ACTIVATED' : 'BYPASSED'}.`, 'info');
    });

    // Noise Model Sliders
    el.noiseStdInput.addEventListener('input', (e) => el.noiseStdDisp.textContent = `${parseFloat(e.target.value).toFixed(1)} counts`);
    el.noisePoissonInput.addEventListener('input', (e) => el.noisePoissonDisp.textContent = parseFloat(e.target.value).toFixed(2));
    el.noiseSpInput.addEventListener('input', (e) => el.noiseSpDisp.textContent = `${(parseFloat(e.target.value) * 100).toFixed(2)}%`);

    el.btnApplyNoise.addEventListener('click', () => {
      const nTypes = [];
      if (el.noiseChkGaussian.checked) nTypes.push('gaussian');
      if (el.noiseChkPoisson.checked) nTypes.push('poisson');
      if (el.noiseChkSaltPepper.checked) nTypes.push('salt_pepper');

      sendCommand({
        action: 'update_disturbances',
        noise_types: nTypes,
        noise_std: parseFloat(el.noiseStdInput.value),
        poisson_scale: parseFloat(el.noisePoissonInput.value),
        salt_pepper_prob: parseFloat(el.noiseSpInput.value),
      });
      logTerminal('NOISE', `Sensor noise suite updated: models=[${nTypes.join(', ')}]`, 'info');
    });

    // Export Downloads
    const downloadCsv = () => window.open('/api/simulation/export/csv', '_blank');
    const downloadJson = () => window.open('/api/simulation/export/json', '_blank');

    el.btnDownloadCsv.addEventListener('click', downloadCsv);
    el.btnDownloadJson.addEventListener('click', downloadJson);
    el.btnExportCsvQuick.addEventListener('click', downloadCsv);
    el.btnExportJsonQuick.addEventListener('click', downloadJson);

    // Video Benchmark & Upload Modal Listeners
    if (el.btnOpenVideoModal) {
      el.btnOpenVideoModal.addEventListener('click', openVideoModal);
    }
    if (el.btnCloseVideoModal) {
      el.btnCloseVideoModal.addEventListener('click', closeVideoModal);
    }
    if (el.btnCancelVideoModal) {
      el.btnCancelVideoModal.addEventListener('click', closeVideoModal);
    }
    if (el.videoModal) {
      el.videoModal.addEventListener('click', (e) => {
        if (e.target === el.videoModal) closeVideoModal();
      });
    }

    if (el.tabBenchmarksBtn && el.tabUploadBtn) {
      el.tabBenchmarksBtn.addEventListener('click', () => {
        el.tabBenchmarksBtn.classList.add('active');
        el.tabUploadBtn.classList.remove('active');
        if (el.modalTabBenchmarks) el.modalTabBenchmarks.classList.add('active');
        if (el.modalTabUpload) el.modalTabUpload.classList.remove('active');
      });
      el.tabUploadBtn.addEventListener('click', () => {
        el.tabUploadBtn.classList.add('active');
        el.tabBenchmarksBtn.classList.remove('active');
        if (el.modalTabUpload) el.modalTabUpload.classList.add('active');
        if (el.modalTabBenchmarks) el.modalTabBenchmarks.classList.remove('active');
      });
    }

    if (el.btnBrowseFile && el.videoFileInput) {
      el.btnBrowseFile.addEventListener('click', (e) => {
        e.stopPropagation();
        el.videoFileInput.click();
      });
      el.uploadDropzone.addEventListener('click', () => {
        el.videoFileInput.click();
      });
      el.videoFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          uploadVideoFile(e.target.files[0]);
        }
      });
    }

    if (el.uploadDropzone) {
      ['dragenter', 'dragover'].forEach(name => {
        el.uploadDropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          el.uploadDropzone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(name => {
        el.uploadDropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          el.uploadDropzone.classList.remove('dragover');
        });
      });
      el.uploadDropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          uploadVideoFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        el.btnPlay.click();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        el.btnStep.click();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        el.btnReset.click();
      } else if (e.code === 'Escape') {
        closeVideoModal();
      }
    });

    // Canvas Auto-Resize
    window.addEventListener('resize', handleCanvasResize);
    handleCanvasResize();
  }

  // --- Video Benchmark & Upload System Functions ---
  let cachedBenchmarks = [];

  function openVideoModal() {
    if (!el.videoModal) return;
    el.videoModal.style.display = 'flex';
    fetchVideoBenchmarks();
  }

  function closeVideoModal() {
    if (!el.videoModal) return;
    el.videoModal.style.display = 'none';
    if (el.uploadStatusBox) el.uploadStatusBox.style.display = 'none';
    if (el.videoFileInput) el.videoFileInput.value = '';
  }

  async function fetchVideoBenchmarks() {
    if (!el.benchmarkVideoList) return;
    el.benchmarkVideoList.innerHTML = '<div style="color: var(--text-dim); padding: 12px;">Loading pre-recorded optical benchmarks...</div>';
    try {
      const res = await fetch('/api/simulation/video_benchmarks');
      const data = await res.json();
      cachedBenchmarks = data || [];
      renderBenchmarkCards(cachedBenchmarks);
    } catch (e) {
      el.benchmarkVideoList.innerHTML = `<div style="color: var(--red); padding: 12px;">Failed to query video benchmarks: ${e.message}</div>`;
    }
  }

  function renderBenchmarkCards(benchmarks) {
    if (!el.benchmarkVideoList) return;
    if (!benchmarks.length) {
      el.benchmarkVideoList.innerHTML = '<div style="color: var(--text-dim); padding: 12px;">No pre-recorded videos found in data/videos/.</div>';
      return;
    }

    el.benchmarkVideoList.innerHTML = '';
    benchmarks.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'benchmark-card';
      const cleanName = b.filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').toUpperCase();
      card.innerHTML = `
        <div class="benchmark-card-head">
          <div class="benchmark-card-title">
            <span>🎥</span> ${cleanName}
          </div>
          <span class="benchmark-tag">BENCHMARK 2</span>
        </div>
        <div class="benchmark-card-meta mono">
          <span>${b.resolution}</span> ·
          <span>${b.frames} frames</span> ·
          <span>${b.fps} FPS</span> ·
          <span>${b.size_mb} MB</span>
        </div>
        <div class="benchmark-card-desc">
          Optical laser beam tracking evaluation with real sensor noise, jitter, and atmospheric distortions.
        </div>
      `;
      card.addEventListener('click', () => {
        selectBenchmarkVideo(b.filename);
      });
      el.benchmarkVideoList.appendChild(card);
    });
  }

  function selectBenchmarkVideo(filename) {
    const stem = filename.replace(/\.[^/.]+$/, '').toUpperCase();
    let targetIdx = -1;
    for (let i = 0; i < el.scenarioSelect.options.length; i++) {
      const opt = el.scenarioSelect.options[i];
      if (opt.textContent.toUpperCase().includes(stem)) {
        targetIdx = parseInt(opt.value, 10);
        break;
      }
    }

    if (targetIdx >= 0) {
      el.scenarioSelect.value = targetIdx;
      sendCommand({ action: 'select_scenario', index: targetIdx });
      logTerminal('VIDEO', `Loaded benchmark optical video: '${filename}'`, 'lock');
      closeVideoModal();
    } else {
      fetch('/api/scenario/select?index=0', { method: 'POST' }).catch(() => {});
      closeVideoModal();
    }
  }

  async function uploadVideoFile(file) {
    if (!file) return;
    const allowed = ['.mp4', '.avi', '.webm', '.ogv', '.mkv'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      alert(`Invalid format '${ext}'. Please select an MP4, AVI, WEBM, OGV, or MKV file.`);
      return;
    }

    el.uploadStatusBox.style.display = 'flex';
    el.uploadFilenameTxt.textContent = file.name;
    el.uploadProgressTxt.textContent = 'Uploading to server...';
    el.uploadProgressBar.style.width = '35%';
    el.uploadProgressBar.style.background = 'var(--color-cyan)';
    el.uploadDetailsTxt.textContent = 'Transferring binary payload to optical video decoding pipeline...';
    el.uploadDetailsTxt.style.color = 'var(--text-secondary)';

    const formData = new FormData();
    formData.append('file', file);

    try {
      const resp = await fetch('/api/simulation/upload_video', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || `Upload failed with status ${resp.status}`);
      }

      const res = await resp.json();
      el.uploadProgressBar.style.width = '100%';
      el.uploadProgressTxt.textContent = 'Converted to Simulation!';
      const vInfo = res.video_info || {};
      el.uploadDetailsTxt.textContent = `Decoded: ${vInfo.width || 640}x${vInfo.height || 480} | ${vInfo.num_frames} frames @ ${vInfo.fps ? vInfo.fps.toFixed(1) : 30} FPS. Ready!`;
      el.uploadDetailsTxt.style.color = 'var(--color-green)';

      logTerminal('VIDEO', `Uploaded & converted '${file.name}' (${vInfo.num_frames} frames). Simulation initialized.`, 'lock');

      setTimeout(() => {
        fetch('/api/scenarios')
          .then(r => r.json())
          .then(list => {
            populateScenarios(list);
            if (res.index !== undefined) {
              el.scenarioSelect.value = res.index;
            }
          })
          .catch(() => {});
        closeVideoModal();
      }, 900);
    } catch (err) {
      el.uploadProgressTxt.textContent = 'Error';
      el.uploadProgressBar.style.background = 'var(--red)';
      el.uploadDetailsTxt.textContent = `Conversion failed: ${err.message}`;
      el.uploadDetailsTxt.style.color = 'var(--red)';
    }
  }

  function handleCanvasResize() {
    const rRect = el.radarCanvas.getBoundingClientRect();
    if (rRect.width && rRect.height) {
      el.radarCanvas.width = rRect.width;
      el.radarCanvas.height = rRect.height;
    }
    const cRect = el.chartCanvas.getBoundingClientRect();
    if (cRect.width && cRect.height) {
      el.chartCanvas.width = cRect.width;
      el.chartCanvas.height = cRect.height;
    }
    drawOscilloscope();
  }

  // Initialize on DOM Ready
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initWebSocket();
    drawRadarPlaceholder();
    drawOscilloscope();
  });
})();
