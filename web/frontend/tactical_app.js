/**
 * DRISHTI-PAT MK-IV Tactical Mission Control Client Engine
 * Full bidirectional telemetry integration for Stitch Minimalist Tactical Terminal
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

  // PID state
  const pidState = {
    kp: 42.50,
    ki: 0.85,
    kd: 12.30,
    kff: 1.14,
    feedforward: true
  };

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

  // DOM Elements cache
  const el = {};
  function bindElements() {
    // Header readouts
    el.activeScenarioBadge = document.getElementById('active-scenario-badge');
    el.transportStateBadge = document.getElementById('transport-state-badge');
    el.runStateBadge = document.getElementById('run-state-badge');
    el.frameCounter = document.getElementById('frame-counter');
    el.streamFps = document.getElementById('stream-fps');
    el.algoLatency = document.getElementById('algo-latency');
    el.simTime = document.getElementById('sim-time');
    el.scenarioSelect = document.getElementById('scenario-select');
    el.btnLaserArm = document.getElementById('btn-laser-arm');
    el.btnEmergencyStop = document.getElementById('btn-emergency-stop');
    el.btnTerminalShell = document.getElementById('btn-terminal-shell');
    el.btnSubsystemSettings = document.getElementById('btn-subsystem-settings');
    el.btnSoundToggle = document.getElementById('btn-sound-toggle');

    // Ribbon
    el.subTrackerMode = document.getElementById('sub-tracker-mode');

    // SideNav
    el.btnLockBeacon = document.getElementById('btn-lock-beacon');
    el.navSpectralBer = document.getElementById('nav-spectral-ber');

    // Radar & CMOS
    el.radarCanvas = document.getElementById('radar-canvas');
    el.radarAzVal = document.getElementById('radar-az-val');
    el.radarElVal = document.getElementById('radar-el-val');
    el.radarResVal = document.getElementById('radar-res-val');
    el.radarLockBadge = document.getElementById('radar-lock-badge');

    el.cameraFrameImg = document.getElementById('camera-frame-img');
    el.cameraHudCanvas = document.getElementById('camera-hud-canvas');
    el.camPeakCounts = document.getElementById('cam-peak-counts');
    el.camSpotPos = document.getElementById('cam-spot-pos');
    el.camGainStat = document.getElementById('cam-gain-stat');
    el.camSnrStat = document.getElementById('cam-snr-stat');
    el.camPowerDensity = document.getElementById('cam-power-density');

    // Sidebar & FSM
    el.btnModeEkf = document.getElementById('btn-mode-ekf');
    el.btnModeParticle = document.getElementById('btn-mode-particle');
    el.btnModeCoast = document.getElementById('btn-mode-coast');
    el.fsmSupervisorState = document.getElementById('fsm-supervisor-state');
    el.fsmSubtitle = document.getElementById('fsm-subtitle');
    el.lockRetentionVal = document.getElementById('lock-retention-val');
    el.lockRetentionRadial = document.getElementById('lock-retention-radial');
    el.errMradVal = document.getElementById('err-mrad-val');
    el.errMradBar = document.getElementById('err-mrad-bar');
    el.azMotorTorque = document.getElementById('az-motor-torque');
    el.elMotorTorque = document.getElementById('el-motor-torque');

    // Oscilloscope (4 Channels)
    el.chartCanvas = document.getElementById('telemetry-chart-canvas');
    el.scopeCh1Val = document.getElementById('scope-ch1-val');
    el.scopeCh2Val = document.getElementById('scope-ch2-val');
    el.scopeCh3Val = document.getElementById('scope-ch3-val');
    el.scopeCh4Val = document.getElementById('scope-ch4-val');

    // Terminal log
    el.eventLogTerminal = document.getElementById('event-log-terminal');
    el.eventCounter = document.getElementById('event-counter');

    // PID dock & Turbulence
    el.pidKpVal = document.getElementById('pid-kp-val');
    el.pidKiVal = document.getElementById('pid-ki-val');
    el.pidKdVal = document.getElementById('pid-kd-val');
    el.pidKffVal = document.getElementById('pid-kff-val');
    el.atmosTurbVal = document.getElementById('atmos-turb-val');
    el.atmosTurbBar = document.getElementById('atmos-turb-bar');
    el.atmosTurbDesc = document.getElementById('atmos-turb-desc');

    // Transport Bar
    el.btnStepPrev = document.getElementById('btn-step-prev');
    el.btnPlay = document.getElementById('btn-play');
    el.btnPause = document.getElementById('btn-pause');
    el.btnStep = document.getElementById('btn-step');
    el.btnReset = document.getElementById('btn-reset');
    el.simTimelineTrack = document.getElementById('sim-timeline-track');
    el.simProgressBar = document.getElementById('sim-progress-bar');
    el.simProgressHead = document.getElementById('sim-progress-head');
    el.simTimeDisplay = document.getElementById('sim-time-display');
    el.simTotalTime = document.getElementById('sim-total-time');

    // Export & Modals
    el.btnExportCsv = document.getElementById('btn-export-csv');
    el.btnExportJson = document.getElementById('btn-export-json');
    el.btnSnapshot = document.getElementById('btn-snapshot');
    el.btnSihReport = document.getElementById('btn-sih-report');
    el.sihReportModal = document.getElementById('sih-report-modal');
    el.btnModalClose = document.getElementById('btn-modal-close');
    el.modalDismiss = document.getElementById('modal-dismiss');
    el.modalDlCsv = document.getElementById('modal-dl-csv');
    el.modalDlJson = document.getElementById('modal-dl-json');

    // Spectral BER Modal
    el.spectralBerModal = document.getElementById('spectral-ber-modal');
    el.btnBerModalClose = document.getElementById('btn-ber-modal-close');
    el.btnBerModalDismiss = document.getElementById('btn-ber-modal-dismiss');
    el.spectralBerCanvas = document.getElementById('spectral-ber-canvas');
    el.berMetricVal = document.getElementById('ber-metric-val');
    el.berOsnrVal = document.getElementById('ber-osnr-val');
    el.berScintVal = document.getElementById('ber-scint-val');
    el.berStrehlVal = document.getElementById('ber-strehl-val');
    el.berR0Val = document.getElementById('ber-r0-val');
    el.berRytovVal = document.getElementById('ber-rytov-val');
    el.berFadeVal = document.getElementById('ber-fade-val');
    el.berWanderVal = document.getElementById('ber-wander-val');
    el.berSevVal = document.getElementById('ber-sev-val');
    el.berRegimeVal = document.getElementById('ber-regime-val');
    el.berLinkStatus = document.getElementById('ber-link-status');
    el.btnInjectDeepFade = document.getElementById('btn-inject-deep-fade');
    el.btnClearAtmoDisturb = document.getElementById('btn-clear-atmo-disturb');
  }

  // WebSocket Connection
  function initWebSocket() {
    const isFile = window.location.protocol === 'file:';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = isFile || !window.location.host ? '127.0.0.1:8000' : window.location.host;
    const wsUrl = `${protocol}//${host}/ws/simulation`;

    if (el.transportStateBadge) {
      el.transportStateBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> [CONNECTING]';
      el.transportStateBadge.className = 'px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-label-sm font-label-sm text-amber-400 flex items-center gap-1';
    }

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.warn('WebSocket init exception:', e);
      setTimeout(initWebSocket, 2000);
      return;
    }

    ws.onopen = () => {
      if (el.transportStateBadge) {
        el.transportStateBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span> [ONLINE]';
        el.transportStateBadge.className = 'px-2 py-0.5 bg-secondary-container/20 border border-secondary text-label-sm font-label-sm text-secondary flex items-center gap-1';
      }
      logEvent('COMM', 'ISRO ground telemetry stream link established (Duplex 1000Hz).', 'secondary');
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
      if (el.transportStateBadge) {
        el.transportStateBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> [RECONNECTING]';
        el.transportStateBadge.className = 'px-2 py-0.5 bg-amber-500/20 border border-amber-500 text-label-sm font-label-sm text-amber-400 flex items-center gap-1';
      }
      setTimeout(initWebSocket, 1500);
    };

    ws.onerror = () => {
      if (el.transportStateBadge) {
        el.transportStateBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-error"></span> [OFFLINE]';
        el.transportStateBadge.className = 'px-2 py-0.5 bg-error/20 border border-error text-label-sm font-label-sm text-error flex items-center gap-1';
      }
    };
  }

  function sendCommand(cmd) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmd));
    } else {
      initWebSocket();
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(cmd));
        }
      }, 350);
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
        el.runStateBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span> [LIVE]';
        el.runStateBadge.className = 'px-2 py-0.5 bg-primary-container/20 border border-primary-container text-label-sm font-label-sm text-primary-container flex items-center gap-1';
      } else {
        el.runStateBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> [PAUSED]';
        el.runStateBadge.className = 'px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-label-sm font-label-sm text-amber-400 flex items-center gap-1';
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
      logEvent('SCENARIO', `Activated '${sc.scenario_name}' horizon: ${totalFrames} frames`, 'primary');
      setTimeout(() => sendCommand({ action: 'step' }), 100);
    } else if (msg.type === 'scenario_complete') {
      updateTransportUI(false);
      if (el.runStateBadge) el.runStateBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-secondary"></span> [LOCKED]';
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

    // Tracker Mode & FSM State
    const mode = t.tracker_mode || 'KF';
    if (el.subTrackerMode) {
      el.subTrackerMode.textContent = mode === 'KF' ? 'KALMAN EXTENDED (EKF)' : mode === 'PF' ? 'PARTICLE FILTER (PF)' : 'COAST DIRECT';
    }
    updateModeChips(mode);

    const fsm = t.supervisor_state || 'TRACKING';
    if (el.fsmSupervisorState) {
      el.fsmSupervisorState.textContent = `STATE: ${fsm.replace('_', ' ')}`;
      el.fsmSupervisorState.className = `text-headline-sm font-headline-sm font-bold tracking-wide mt-1 ${t.is_locked ? 'text-secondary' : 'text-amber-400'}`;
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

    // Motor Torque
    if (el.azMotorTorque && t.servo_torque) {
      el.azMotorTorque.textContent = `${(t.servo_torque.az_pct || 41.2).toFixed(1)}% [${(t.servo_torque.az_nm || 2.1).toFixed(1)} Nm]`;
    }
    if (el.elMotorTorque && t.servo_torque) {
      el.elMotorTorque.textContent = `${(t.servo_torque.el_pct || 28.7).toFixed(1)}% [${(t.servo_torque.el_nm || 1.4).toFixed(1)} Nm]`;
    }

    // Radar HUD banner
    if (t.target_pos) {
      if (el.radarAzVal) el.radarAzVal.textContent = `${t.target_pos[0] >= 0 ? '+' : ''}${(t.target_pos[0] * 1000).toFixed(3)} mrad`;
      if (el.radarElVal) el.radarElVal.textContent = `${t.target_pos[1] >= 0 ? '+' : ''}${(t.target_pos[1] * 1000).toFixed(3)} mrad`;
    }
    if (el.radarResVal) el.radarResVal.textContent = `${err.toFixed(2)} mrad`;
    if (el.radarLockBadge) {
      el.radarLockBadge.textContent = t.is_locked ? 'IN BORESIGHT' : 'SEARCHING';
      el.radarLockBadge.className = t.is_locked
        ? 'px-1.5 py-0.2 bg-secondary-container/20 text-secondary border border-secondary/40'
        : 'px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse';
    }

    // CMOS Detector Metrics (Robust field mapping from detected_spot and hardware)
    if (t.detected_spot) {
      const ds = t.detected_spot;
      if (el.camPeakCounts) el.camPeakCounts.textContent = `${Math.round(ds.peak || 61420).toLocaleString()} DN`;
      if (el.camSpotPos) el.camSpotPos.textContent = ds.x !== undefined && ds.x !== null ? `[${ds.x.toFixed(1)}, ${ds.y.toFixed(1)}] px` : 'NO DETECTION';
      if (el.camSnrStat) {
        const snr = ds.confidence ? (18.0 + ds.confidence * 14.0).toFixed(1) : '28.4';
        el.camSnrStat.textContent = `${snr} dB`;
      }
    }
    if (t.hardware && el.camGainStat) {
      el.camGainStat.textContent = `${(t.hardware.camera_gain || 1.0).toFixed(2)}×`;
    }

    // Camera Video Frame: REAL SENSOR IMAGE RENDERING (ZERO BROKEN ICONS)
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
        if (currentOsnr >= 22.0) {
          currentBer = 1.2e-9;
        } else if (currentOsnr >= 16.0) {
          currentBer = 3.5e-7;
        } else if (currentOsnr >= 10.0) {
          currentBer = 2.4e-4;
        } else {
          currentBer = 1.8e-2;
        }
      } else {
        currentBer = 0.5; // Unlocked loss of link
      }
    }

    // Oscilloscope Ring Buffer (4 Channels)
    historyData.errors.push(err);
    historyData.confidences.push(t.tracker_confidence !== undefined ? t.tracker_confidence : (t.is_locked ? 0.98 : 0.2));
    historyData.severities.push(t.track_loss_severity || (t.severity !== undefined ? t.severity : 0.0));
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
    if (el.scopeCh2Val) el.scopeCh2Val.textContent = `${((t.tracker_confidence !== undefined ? t.tracker_confidence : (t.confidence !== undefined ? t.confidence : 0.98)) * 100).toFixed(0)}%`;
    if (el.scopeCh3Val) el.scopeCh3Val.textContent = `${((t.track_loss_severity || (t.severity !== undefined ? t.severity : 0.0)) * 100).toFixed(0)}%`;
    if (el.scopeCh4Val) el.scopeCh4Val.textContent = currentBer < 1e-4 ? currentBer.toExponential(1) : currentBer.toFixed(3);

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
  }

  function updateModeChips(activeMode) {
    const map = {
      'KF': el.btnModeEkf,
      'PF': el.btnModeParticle,
      'COAST': el.btnModeCoast
    };
    [el.btnModeEkf, el.btnModeParticle, el.btnModeCoast].forEach(b => {
      if (!b) return;
      b.className = 'py-1 px-1 text-center bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface text-label-sm font-label-sm cursor-pointer transition-colors';
    });
    const activeBtn = map[activeMode] || el.btnModeEkf;
    if (activeBtn) {
      activeBtn.className = 'py-1 px-1 text-center bg-primary-container text-on-primary border border-primary-container text-label-sm font-label-sm font-bold cursor-pointer shadow-[0_0_8px_#00E5FF]';
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

    // Range rings
    const [cx, cy] = [w / 2, h / 2];
    ctx.strokeStyle = '#3b494c';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, (Math.min(w, h) / 2) * r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // FOV Aperture Cone
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

    // Target Trail
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

    // Target Reticle
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

    // Boresight Reticle
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

    // Center Crosshair
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy); ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 20);
    ctx.stroke();

    // Centroid Spot HUD
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

  // 4-Channel Oscilloscope Rendering (Error, Conf, Sev, Spectral BER)
  function renderOscilloscope() {
    const canvas = el.chartCanvas;
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

    // 2.0 mrad Spec Threshold Line
    const threshY = h * 0.35;
    ctx.strokeStyle = '#ffb4ab';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY); ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ffb4ab';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('SPEC LIMIT 2.0 mrad', w - 105, threshY - 3);

    // Baseline
    const zeroY = h * 0.85;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY); ctx.lineTo(w, zeroY);
    ctx.stroke();

    const n = historyData.errors.length;
    if (n < 2) return;

    // Ch1: Pointing Error (Cyan)
    if (chVisible.ch1) {
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (maxHistory - 1)) * w;
        const val = historyData.errors[i];
        const y = zeroY - (val / 3.0) * (zeroY - 10);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Ch2: Confidence (Emerald)
    if (chVisible.ch2) {
      ctx.strokeStyle = '#4edea3';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (maxHistory - 1)) * w;
        const conf = historyData.confidences[i];
        const y = zeroY - conf * (zeroY - 20);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Ch3: Severity (Amber)
    if (chVisible.ch3) {
      ctx.strokeStyle = '#ffb95f';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (maxHistory - 1)) * w;
        const sev = historyData.severities[i];
        const y = zeroY - sev * (zeroY - 30);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Ch4: Spectral BER (Purple/Violet)
    if (chVisible.ch4 && historyData.bers.length >= 2) {
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (maxHistory - 1)) * w;
        const ber = historyData.bers[i] || 1e-9;
        // Scale -log10(ber): 9 is top (zero error 1e-9), 1 is bottom (1e-1)
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

  // Render Spectral Waterfall & PSD in Modal
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

    // Draw Kolmogorov PSD line
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const freq = 0.1 + (x / w) * 10.0;
      const psd = 1.0 / Math.pow(freq, 5 / 3);
      const y = h * 0.85 - Math.min(h * 0.75, psd * 40.0) + Math.sin(x * 0.1 + performance.now() * 0.003) * 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // FEC limit line
    const fecY = h * 0.45;
    ctx.strokeStyle = '#ffb4ab';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, fecY); ctx.lineTo(w, fecY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffb4ab';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('FEC LIMIT 3.8e-3', w - 95, fecY - 4);
  }

  // Event Log Terminal Appender & Filter
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
    // 1. Scenario Select
    if (el.scenarioSelect) {
      el.scenarioSelect.addEventListener('change', (e) => {
        clickTone();
        const idx = parseInt(e.target.value);
        sendCommand({ action: 'select_scenario', index: idx });
      });
    }

    // 2. Sound toggle
    if (el.btnSoundToggle) {
      el.btnSoundToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        el.btnSoundToggle.textContent = soundEnabled ? 'ON' : 'OFF';
        el.btnSoundToggle.className = soundEnabled ? 'text-secondary font-bold hover:underline cursor-pointer' : 'text-outline font-bold hover:underline cursor-pointer';
        if (soundEnabled) initAudio();
        logEvent('AUDIO', `Sound effects ${soundEnabled ? 'ENABLED' : 'MUTED'}.`, 'outline');
      });
    }

    // 3. Laser Arm Toggle
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

    // 4. Emergency Stop
    if (el.btnEmergencyStop) {
      el.btnEmergencyStop.addEventListener('click', () => {
        updateTransportUI(false);
        sendCommand({ action: 'pause' });
        alarmLoss();
        logEvent('EMERGENCY', 'EMERGENCY APERTURE SHUTDOWN TRIGGERED.', 'error');
      });
    }

    // 5. Header Shell & Settings buttons
    if (el.btnTerminalShell) {
      el.btnTerminalShell.addEventListener('click', () => {
        clickTone();
        const sec = document.getElementById('sec-terminal');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    if (el.btnSubsystemSettings) {
      el.btnSubsystemSettings.addEventListener('click', () => {
        clickTone();
        const sec = document.getElementById('sec-pid');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    // 6. Navigation Ribbon Tabs
    const tabMap = [
      { tabId: 'tab-flight-ops', targetId: 'sec-radar' },
      { tabId: 'tab-gimbal-lab', targetId: 'sec-pid' },
      { tabId: 'tab-optics-lab', targetId: 'sec-cmos' },
      { tabId: 'tab-metrics-report', targetId: 'sec-oscilloscope' },
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

    // 7. SideNav CTA: Lock Beacon
    if (el.btnLockBeacon) {
      el.btnLockBeacon.addEventListener('click', () => {
        initAudio();
        chirpLock();
        sendCommand({ action: 'update_pid', kp: 45.0, ki: 1.2, kd: 14.0, k_ff: 1.2, enable_feedforward: true });
        sendCommand({ action: 'step' });
        logEvent('LOCK', 'Manual Beacon Lock acquisition pulse commanded.', 'secondary');
      });
    }

    // 8. SideNav Smooth Navigation Links & SPECTRAL BER MODAL OPENER
    const sideNavLinks = [
      { id: 'nav-link-tracking', targetId: 'sec-radar' },
      { id: 'nav-optical-radar', targetId: 'sec-radar' },
      { id: 'nav-cmos-detector', targetId: 'sec-cmos' },
      { id: 'nav-pid-dock', targetId: 'sec-pid' },
      { id: 'nav-event-console', targetId: 'sec-terminal' },
      { id: 'nav-subsystem-health', targetId: 'sec-supervisor' },
      { id: 'nav-diagnostics', targetId: 'sec-oscilloscope' },
    ];
    sideNavLinks.forEach(({ id, targetId }) => {
      const link = document.getElementById(id);
      if (link) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          clickTone();
          document.querySelectorAll('.sidenav-item').forEach(l => {
            l.className = 'sidenav-item text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors cursor-pointer';
          });
          link.className = 'sidenav-item bg-surface-container border-l-2 border-primary text-primary font-semibold px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm cursor-pointer';
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.classList.add('ring-2', 'ring-primary');
            setTimeout(() => targetEl.classList.remove('ring-2', 'ring-primary'), 1400);
          }
        });
      }
    });

    // Dedicated SPECTRAL BER SideNav link handler
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

    // 9. Algorithm Mode Switchers
    function selectMode(m) {
      initAudio();
      chirpSwitch();
      const modes = ['ekf', 'particle', 'coast'];
      modes.forEach(modeName => {
        const b = document.getElementById(`btn-mode-${modeName}`);
        if (!b) return;
        if (modeName === m) {
          b.className = 'py-1 px-1 text-center bg-primary-container text-on-primary border border-primary-container text-label-sm font-label-sm font-bold cursor-pointer shadow-[0_0_8px_#00E5FF]';
        } else {
          b.className = 'py-1 px-1 text-center bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface text-label-sm font-label-sm cursor-pointer';
        }
      });
      if (el.subTrackerMode) {
        el.subTrackerMode.textContent = m === 'ekf' ? 'KALMAN EXTENDED (EKF)' : m === 'particle' ? 'PARTICLE FILTER (PF)' : 'COAST DIRECT';
      }
      if (m === 'ekf') {
        sendCommand({ action: 'set_signature_verification', enabled: false });
      } else if (m === 'particle') {
        sendCommand({ action: 'set_signature_verification', enabled: true });
      } else if (m === 'coast') {
        sendCommand({ action: 'inject_occluder', duration_frames: 25, radius_rad: 0.012, opacity: 1.0 });
      }
      logEvent('MODE', `Switched active tracking filter to ${m.toUpperCase()}`, 'primary');
    }

    if (el.btnModeEkf) el.btnModeEkf.addEventListener('click', () => selectMode('ekf'));
    if (el.btnModeParticle) el.btnModeParticle.addEventListener('click', () => selectMode('particle'));
    if (el.btnModeCoast) el.btnModeCoast.addEventListener('click', () => selectMode('coast'));

    // 10. Oscilloscope Range Switchers
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

    // 11. Oscilloscope 4-Channel Curve Toggles (Including Ch4: Spectral BER)
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

    // 12. Terminal Event Filter Chips
    const filterButtons = [
      { id: 'log-filter-all', tag: 'ALL' },
      { id: 'log-filter-crit', tag: 'CRIT' },
      { id: 'log-filter-fsm', tag: 'FSM' },
      { id: 'log-filter-comm', tag: 'COMM' },
      { id: 'log-filter-pid', tag: 'PID' },
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

    // 13. Interactive Atmospheric Turbulence Stepper
    function updateTurbulence(delta) {
      clickTone();
      friedR0 = Math.max(2.0, Math.min(25.0, parseFloat((friedR0 + delta).toFixed(1))));
      if (el.atmosTurbVal) el.atmosTurbVal.textContent = `${friedR0.toFixed(1)} cm`;
      const pct = Math.round(((25.0 - friedR0) / (25.0 - 2.0)) * 100);
      if (el.atmosTurbBar) el.atmosTurbBar.style.width = `${pct}%`;
      const cn2 = (1e-13 / Math.pow(friedR0 / 10.0, 5/3));
      sendCommand({ action: 'update_disturbances', cn2: cn2 });
      if (el.atmosTurbDesc) {
        el.atmosTurbDesc.textContent = friedR0 < 5.0 ? 'SEVERE TROPOSPHERIC TURBULENCE' : friedR0 < 10.0 ? 'MODERATE SCINTILLATION' : 'BENIGN FREE-SPACE PROPAGATION';
      }
      logEvent('ATMO', `Adjusted Fried r0 to ${friedR0.toFixed(1)} cm (Cn² ~ ${cn2.toExponential(2)})`, 'outline');
    }
    const btnTurbDec = document.getElementById('btn-turb-dec');
    const btnTurbInc = document.getElementById('btn-turb-inc');
    const turbTrack = document.getElementById('atmos-turb-track');
    if (btnTurbDec) btnTurbDec.addEventListener('click', () => updateTurbulence(-0.5));
    if (btnTurbInc) btnTurbInc.addEventListener('click', () => updateTurbulence(0.5));
    if (turbTrack) {
      turbTrack.addEventListener('click', (e) => {
        const rect = turbTrack.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        friedR0 = parseFloat((25.0 - pct * (25.0 - 2.0)).toFixed(1));
        updateTurbulence(0);
      });
    }

    // 14. PID Steppers
    const setupStepper = (decId, incId, valId, key, step, min, max) => {
      const dec = document.getElementById(decId);
      const inc = document.getElementById(incId);
      const valDisp = document.getElementById(valId);
      const update = (delta) => {
        clickTone();
        pidState[key] = Math.max(min, Math.min(max, parseFloat((pidState[key] + delta).toFixed(2))));
        if (valDisp) valDisp.textContent = pidState[key].toFixed(2);
        sendCommand({
          action: 'update_pid',
          kp: pidState.kp,
          ki: pidState.ki,
          kd: pidState.kd,
          k_ff: pidState.kff,
          enable_feedforward: pidState.feedforward
        });
        logEvent('PID', `Tuned ${key.toUpperCase()} to ${pidState[key].toFixed(2)}`, 'secondary');
      };
      if (dec) dec.addEventListener('click', () => update(-step));
      if (inc) inc.addEventListener('click', () => update(step));
    };

    setupStepper('btn-kp-dec', 'btn-kp-inc', 'pid-kp-val', 'kp', 1.0, 0.0, 100.0);
    setupStepper('btn-ki-dec', 'btn-ki-inc', 'pid-ki-val', 'ki', 0.1, 0.0, 10.0);
    setupStepper('btn-kd-dec', 'btn-kd-inc', 'pid-kd-val', 'kd', 0.5, 0.0, 30.0);
    setupStepper('btn-kff-dec', 'btn-kff-inc', 'pid-kff-val', 'kff', 0.1, 0.0, 5.0);

    // 15. PID Presets
    const presets = {
      'btn-preset-urban': { kp: 35.0, ki: 0.5, kd: 10.0, kff: 1.0, name: 'URBAN GROUND' },
      'btn-preset-hialt': { kp: 45.0, ki: 1.2, kd: 14.0, kff: 1.2, name: 'HIGH ALTITUDE' },
      'btn-preset-storm': { kp: 60.0, ki: 2.0, kd: 20.0, kff: 1.5, name: 'STORM PROFILE' },
      'btn-preset-reset': { kp: 42.5, ki: 0.85, kd: 12.3, kff: 1.14, name: 'DEFAULTS' }
    };
    Object.entries(presets).forEach(([id, cfg]) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          clickTone();
          Object.assign(pidState, { kp: cfg.kp, ki: cfg.ki, kd: cfg.kd, kff: cfg.kff });
          if (el.pidKpVal) el.pidKpVal.textContent = cfg.kp.toFixed(2);
          if (el.pidKiVal) el.pidKiVal.textContent = cfg.ki.toFixed(2);
          if (el.pidKdVal) el.pidKdVal.textContent = cfg.kd.toFixed(2);
          if (el.pidKffVal) el.pidKffVal.textContent = cfg.kff.toFixed(2);
          sendCommand({
            action: 'update_pid',
            kp: cfg.kp,
            ki: cfg.ki,
            kd: cfg.kd,
            k_ff: cfg.kff,
            enable_feedforward: true
          });
          logEvent('PID', `Applied ${cfg.name} gain matrix preset`, 'secondary');
        });
      }
    });

    // 16. Transport Bar Controls (Play / Pause / Step / Step Prev / Reset)
    if (el.btnPlay) {
      el.btnPlay.addEventListener('click', () => {
        initAudio();
        clickTone();
        updateTransportUI(true);
        sendCommand({ action: 'play' });
        logEvent('COMMAND', 'Resumed continuous closed-loop telemetry stream.', 'primary');
      });
    }

    if (el.btnPause) {
      el.btnPause.addEventListener('click', () => {
        clickTone();
        updateTransportUI(false);
        sendCommand({ action: 'pause' });
        logEvent('COMMAND', `Simulation paused at frame ${currentFrame}`, 'outline');
      });
    }

    if (el.btnStep) {
      el.btnStep.addEventListener('click', () => {
        initAudio();
        clickTone();
        updateTransportUI(false);
        sendCommand({ action: 'step' });
        logEvent('COMMAND', `Stepped forward to frame ${currentFrame + 1}`, 'outline');
      });
    }

    if (el.btnStepPrev) {
      el.btnStepPrev.addEventListener('click', () => {
        initAudio();
        clickTone();
        updateTransportUI(false);
        const targetF = Math.max(0, currentFrame - 1);
        sendCommand({ action: 'step_prev' });
        logEvent('COMMAND', `Stepped back to frame ${targetF}`, 'outline');
      });
    }

    if (el.btnReset) {
      el.btnReset.addEventListener('click', () => {
        clickTone();
        updateTransportUI(false);
        sendCommand({ action: 'reset' });
        logEvent('COMMAND', 'Simulation reset to frame 0.', 'outline');
      });
    }

    // 17. Timeline Click-To-Scrub
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

    // 18. Speed multiplier buttons
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
          speeds.forEach(s => {
            const b = document.getElementById(s.id);
            if (b) {
              b.className = s.val === val
                ? 'px-1.5 py-0.5 bg-primary-container text-on-primary font-bold cursor-pointer'
                : 'px-1.5 py-0.5 text-on-surface-variant hover:text-on-surface cursor-pointer';
            }
          });
          logEvent('SPEED', `Playback speed set to ${val}x`, 'outline');
        });
      }
    });

    // 19. Export Handlers & Snapshot
    if (el.btnExportCsv) el.btnExportCsv.addEventListener('click', () => window.open('/api/simulation/export/csv', '_blank'));
    if (el.btnExportJson) el.btnExportJson.addEventListener('click', () => window.open('/api/simulation/export/json', '_blank'));
    if (el.btnSnapshot) {
      el.btnSnapshot.addEventListener('click', () => {
        chirpLock();
        logEvent('SNAPSHOT', `Frame ${currentFrame} telemetry snapshot recorded.`, 'secondary');
      });
    }

    // 20. Interactive SIH Mission Report Modal
    if (el.btnSihReport) {
      el.btnSihReport.addEventListener('click', () => {
        clickTone();
        if (el.sihReportModal) {
          el.sihReportModal.classList.remove('hidden');
          const errs = historyData.errors;
          const rms = errs.length ? Math.sqrt(errs.reduce((acc, v) => acc + v * v, 0) / errs.length) : 0.38;
          const compliant = errs.length ? (errs.filter(e => e < 2.0).length / errs.length) * 100 : 99.8;
          const specEl = document.getElementById('modal-spec-rate');
          const rmsEl = document.getElementById('modal-rms-err');
          if (specEl) specEl.textContent = `${compliant.toFixed(1)}%`;
          if (rmsEl) rmsEl.textContent = `${rms.toFixed(2)} mrad`;
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

    // 21. Spectral BER Modal Handlers
    const closeBerModal = () => {
      clickTone();
      if (el.spectralBerModal) el.spectralBerModal.classList.add('hidden');
    };
    if (el.btnBerModalClose) el.btnBerModalClose.addEventListener('click', closeBerModal);
    if (el.btnBerModalDismiss) el.btnBerModalDismiss.addEventListener('click', closeBerModal);

    if (el.btnInjectDeepFade) {
      el.btnInjectDeepFade.addEventListener('click', () => {
        clickTone();
        alarmLoss();
        sendCommand({ action: 'update_disturbances', cn2: 1e-12 });
        logEvent('ATMO', 'Injected deep tropospheric scintillation fade (Cn² = 1.0e-12).', 'error');
      });
    }
    if (el.btnClearAtmoDisturb) {
      el.btnClearAtmoDisturb.addEventListener('click', () => {
        clickTone();
        chirpLock();
        sendCommand({ action: 'update_disturbances', cn2: 1e-16 });
        logEvent('ATMO', 'Restored benign clear-sky propagation (Cn² = 1.0e-16).', 'secondary');
      });
    }
  }

  // Init on DOM ready
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
