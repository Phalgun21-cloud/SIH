with open('web/frontend/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

required_ids = [
    'active-scenario-badge', 'transport-state-badge', 'run-state-badge', 'frame-counter',
    'stream-fps', 'algo-latency', 'sim-time', 'scenario-select', 'btn-laser-arm',
    'btn-emergency-stop', 'btn-terminal-shell', 'btn-subsystem-settings', 'btn-sound-toggle',
    'sub-tracker-mode', 'btn-lock-beacon',
    'tab-flight-ops', 'tab-gimbal-lab', 'tab-optics-lab', 'tab-metrics-report', 'tab-mission-replay',
    'nav-link-tracking', 'nav-optical-radar', 'nav-cmos-detector', 'nav-pid-dock', 'nav-spectral-ber', 'nav-event-console',
    'sec-radar', 'sec-cmos', 'sec-supervisor', 'sec-oscilloscope', 'sec-terminal', 'sec-pid',
    'radar-canvas', 'radar-az-val', 'radar-el-val', 'radar-res-val', 'radar-lock-badge',
    'camera-frame-img', 'camera-hud-canvas', 'cam-peak-counts', 'cam-spot-pos', 'cam-gain-stat', 'cam-snr-stat', 'cam-power-density',
    'btn-mode-ekf', 'btn-mode-particle', 'btn-mode-coast', 'fsm-supervisor-state', 'fsm-subtitle',
    'lock-retention-val', 'lock-retention-radial', 'err-mrad-val', 'err-mrad-bar',
    'az-motor-torque', 'el-motor-torque',
    'telemetry-chart-canvas', 'scope-ch1-val', 'scope-ch2-val', 'scope-ch3-val', 'scope-ch4-val',
    'scope-range-10', 'scope-range-30', 'scope-range-60', 'scope-range-all',
    'toggle-ch1', 'toggle-ch2', 'toggle-ch3', 'toggle-ch4',
    'log-filter-all', 'log-filter-crit', 'log-filter-fsm', 'log-filter-comm', 'log-filter-pid',
    'event-log-terminal', 'event-counter',
    'pid-kp-val', 'pid-ki-val', 'pid-kd-val', 'pid-kff-val',
    'btn-kp-dec', 'btn-kp-inc', 'btn-ki-dec', 'btn-ki-inc', 'btn-kd-dec', 'btn-kd-inc', 'btn-kff-dec', 'btn-kff-inc',
    'btn-preset-urban', 'btn-preset-hialt', 'btn-preset-storm', 'btn-preset-reset',
    'btn-turb-dec', 'btn-turb-inc', 'atmos-turb-val', 'atmos-turb-track', 'atmos-turb-bar', 'atmos-turb-desc',
    'btn-step-prev', 'btn-play', 'btn-pause', 'btn-step', 'btn-reset',
    'sim-timeline-track', 'sim-progress-bar', 'sim-progress-head', 'sim-time-display', 'sim-total-time',
    'speed-btn-025', 'speed-btn-05', 'speed-btn-1', 'speed-btn-2', 'speed-btn-5',
    'btn-export-csv', 'btn-export-json', 'btn-snapshot', 'btn-sih-report',
    'sih-report-modal', 'btn-modal-close', 'modal-dismiss', 'modal-dl-csv', 'modal-dl-json',
    'spectral-ber-modal', 'btn-ber-modal-close', 'btn-ber-modal-dismiss',
    'spectral-ber-canvas', 'ber-metric-val', 'ber-osnr-val', 'ber-scint-val', 'ber-strehl-val',
    'ber-r0-val', 'ber-rytov-val', 'ber-fade-val', 'ber-wander-val', 'ber-sev-val', 'ber-regime-val',
    'ber-link-status', 'btn-inject-deep-fade', 'btn-clear-atmo-disturb'
]

missing = [i for i in required_ids if f'id="{i}"' not in html]
if missing:
    print('MISSING IDs:', missing)
else:
    print(f'ALL {len(required_ids)} REQUIRED IDs (INCLUDING SPECTRAL BER & CMOS) VERIFIED SUCCESSFULLY!')
