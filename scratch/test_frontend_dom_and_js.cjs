const fs = require('fs');
const path = require('path');

const htmlContent = fs.readFileSync(path.join(__dirname, '../web/frontend/index.html'), 'utf8');
const jsContent = fs.readFileSync(path.join(__dirname, '../web/frontend/tactical_app.js'), 'utf8');

// Verify critical element IDs exist in index.html
const requiredIds = [
  'camera-frame-img',
  'nav-spectral-ber',
  'spectral-ber-modal',
  'btn-ber-modal-close',
  'btn-ber-modal-dismiss',
  'toggle-ch4',
  'scope-ch4-val',
  'ber-metric-val',
  'ber-osnr-val',
  'ber-scint-val',
  'ber-strehl-val',
  'ber-r0-val',
  'ber-rytov-val',
  'ber-fade-val',
  'ber-wander-val',
  'ber-sev-val',
  'ber-regime-val',
  'spectral-ber-canvas',
  'btn-inject-deep-fade',
  'btn-clear-atmo-disturb'
];

console.log('--- Verifying HTML DOM Element IDs ---');
let missing = 0;
for (const id of requiredIds) {
  if (htmlContent.includes(`id="${id}"`)) {
    console.log(`[PASS] Found id="${id}"`);
  } else {
    console.error(`[FAIL] Missing id="${id}"`);
    missing++;
  }
}

if (missing > 0) {
  process.exit(1);
}

// Verify that tactical_app.js has all event handlers and binding logic
console.log('\n--- Verifying tactical_app.js Functionality ---');
const checks = [
  { desc: 'CMOS image extraction check', regex: /t\.camera_frame \|\| t\.image_base64/ },
  { desc: 'CMOS image display block', regex: /el\.cameraFrameImg\.style\.display\s*=\s*'block'/ },
  { desc: 'Nav Spectral BER click listener', regex: /el\.navSpectralBer.*?addEventListener\('click'/s },
  { desc: 'Close Spectral BER modal listener', regex: /el\.btnBerModalClose.*?addEventListener\('click'/s },
  { desc: 'Dismiss Spectral BER modal listener', regex: /el\.btnBerModalDismiss.*?addEventListener\('click'/s },
  { desc: 'Toggle Ch4 BER listener', regex: /setupChannelToggle\('toggle-ch4',\s*'ch4'\)/ },
  { desc: 'Oscilloscope Ch4 rendering', regex: /chVisible\.ch4 && historyData\.bers\.length/ },
  { desc: 'Logarithmic BER oscilloscope waveform', regex: /-Math\.log10\(Math\.max\(1e-10,\s*ber\)\)/ },
  { desc: 'Live BER calculation in telemetry', regex: /currentBer\s*=\s*1\.2e-9/ },
  { desc: 'Spectral PSD canvas rendering', regex: /renderSpectralWaterfallCanvas/ }
];

for (const c of checks) {
  if (c.regex.test(jsContent)) {
    console.log(`[PASS] ${c.desc}`);
  } else {
    console.error(`[FAIL] Missing ${c.desc}`);
    missing++;
  }
}

if (missing > 0) {
  process.exit(1);
}

console.log('\nALL FRONTEND LOGIC & DOM CHECKS PASSED WITH 0 ERRORS!');
