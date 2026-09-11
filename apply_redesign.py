import os

CSS_FILE = r'd:\projects\SIH\web\frontend\style.css'
HTML_FILE = r'd:\projects\SIH\web\frontend\index.html'

def override_css():
    new_css = """
/* ==========================================================================
   ULTRA-SIMPLIFIED AESTHETIC REDESIGN
   Premium Dark Space Theme & Layout Fixes
   ========================================================================== */

:root {
  --bg-space: #030508 !important;
  --bg-panel: rgba(10, 15, 25, 0.6) !important;
  --bg-panel-header: rgba(15, 20, 32, 0.8) !important;
  --bg-surface: rgba(18, 25, 40, 0.7) !important;
  --bg-recessed: rgba(5, 8, 14, 0.9) !important;

  --border-subtle: rgba(40, 50, 70, 0.3) !important;
  --border-panel: rgba(56, 189, 248, 0.15) !important;
  --border-instrument: rgba(56, 189, 248, 0.25) !important;

  --radius-xs: 8px !important;
  --radius-sm: 12px !important;
  --radius-md: 16px !important;
}

/* Glassmorphism for Panels */
.station-panel, .hero-instrument-surface, .oscilloscope-surface, .station-header, .subsystem-nav-bar {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
}

/* 2-Column Clean Layout */
.flight-ops-layout {
  display: grid !important;
  grid-template-columns: 1fr 340px !important;
  gap: 12px !important;
  height: 100% !important;
}

.visual-viewport-grid {
  gap: 12px !important;
  background: transparent !important;
}

.viewport-card {
  border-radius: var(--radius-sm) !important;
}

.canvas-viewport, .camera-viewport {
  border-radius: 0 0 var(--radius-sm) var(--radius-sm) !important;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8) !important;
}

/* Hide dense technical jargon/panels */
#fsm-badge,
.reacq-tier-val,
.fsm-status-badge,
#turb-mini-r0, #turb-mini-rytov, #turb-mini-fade, #turb-mini-strehl, #turb-mini-regime,
.turb-mini-group,
.technical-legend,
.telemetry-item:nth-child(5), /* Loop time */
.telemetry-item:nth-child(3), /* Stream FPS */
.console-panel /* Hide Event Log by default */
{
  display: none !important;
}

/* Clean up Typography */
.t-val, .pill-val, .cap-title {
  letter-spacing: 1px !important;
}

.mode-text {
  font-size: 20px !important;
  font-weight: 800 !important;
  text-shadow: 0 0 10px rgba(56, 189, 248, 0.5) !important;
}

.primary-metric-val {
  font-size: 24px !important;
  font-weight: 800 !important;
}

/* Header Tweaks */
.station-callsign {
  font-size: 18px !important;
  text-transform: uppercase !important;
}

.master-tab {
  font-size: 13px !important;
  padding: 8px 16px !important;
  height: 38px !important;
}
"""
    with open(CSS_FILE, 'a', encoding='utf-8') as f:
        f.write(new_css)

def rename_html():
    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        html = f.read()

    # Rename Tabs
    html = html.replace('PRIMARY TRACKING & TELEMETRY', 'LIVE TRACKING')
    html = html.replace('GIMBAL & SERVO CONTROLS', 'CAMERA CONTROL')
    html = html.replace('MULTI-TARGET & OPTICS LAB', 'TARGET & OPTICS')
    html = html.replace('PERFORMANCE VERIFICATION', 'TEST RESULTS')

    # Rename Labels
    html = html.replace('ESTIMATOR MODE', 'TRACKING METHOD')
    html = html.replace('LOCK RETENTION', 'TARGET LOCK')
    html = html.replace('TRACKING ERROR', 'POINTING ERROR')
    html = html.replace('FOCAL DEVIATION', 'TARGET OFFSET')
    html = html.replace('DISTURBANCE INJECTION', 'TEST CONDITIONS')
    html = html.replace('Kolmogorov Turbulence', 'Atmospheric Turbulence')
    html = html.replace('INJECT OCCLUDER', 'SIMULATE SIGNAL BLOCK')

    with open(HTML_FILE, 'w', encoding='utf-8') as f:
        f.write(html)

override_css()
rename_html()
print("Redesign applied successfully.")
