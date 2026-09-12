import re

with open('scratch/stitch_generated_screen.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Header Badges & Readouts
html = html.replace(
    '[SCENARIO: LEO_ORBIT_PASS_04]',
    '<span id="active-scenario-badge">[SCENARIO: INITIALIZING]</span>'
)
html = html.replace(
    '[ONLINE]',
    '<span id="transport-state-badge" class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span> [ONLINE]</span>'
)
html = html.replace(
    '[LIVE]',
    '<span id="run-state-badge" class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-primary-container"></span> [LIVE]</span>'
)

# Frame readout
html = html.replace(
    '<span class="font-label-md text-label-md text-on-surface">0045 / 0100</span>',
    '<span id="frame-counter" class="font-label-md text-label-md text-on-surface">0000 / 0100</span>'
)
# Stream FPS
html = html.replace(
    '<span class="font-label-md text-label-md text-secondary">30.0 FPS</span>',
    '<span id="stream-fps" class="font-label-md text-label-md text-secondary">30.0 FPS</span>'
)
# Loop latency
html = html.replace(
    '<span class="font-label-md text-label-md text-primary font-bold">6.2 ms</span>',
    '<span id="algo-latency" class="font-label-md text-label-md text-primary font-bold">6.2 ms</span>'
)
# Sim time
html = html.replace(
    '<span class="font-label-md text-label-md text-primary-container font-bold tracking-widest">00:01:30.500 s</span>',
    '<span id="sim-time" class="font-label-md text-label-md text-primary-container font-bold tracking-widest">0.000 s</span>'
)

# Scenario Selector dropdown
old_scenario_dropdown = '''<div class="hidden 2xl:flex items-center gap-1 bg-surface-container border border-outline-variant px-2 py-1 text-label-sm font-label-sm text-on-surface">
<span class="material-symbols-outlined text-primary-container text-sm">satellite_alt</span>
<span class="text-on-surface">LEO Optical Downlink Pass [700km Altitude]</span>
<span class="material-symbols-outlined text-on-surface-variant text-xs">arrow_drop_down</span>
</div>'''

new_scenario_dropdown = '''<div class="flex items-center gap-1 bg-surface-container border border-outline-variant px-2 py-0.5 text-label-sm font-label-sm text-on-surface">
<span class="material-symbols-outlined text-primary-container text-sm">satellite_alt</span>
<select id="scenario-select" class="bg-transparent border-0 text-on-surface font-mono text-label-sm focus:outline-none cursor-pointer max-w-[280px]">
  <option value="" disabled selected>Loading scenarios...</option>
</select>
</div>'''
html = html.replace(old_scenario_dropdown, new_scenario_dropdown)

# Laser Arm button ID
html = html.replace(
    '<button class="px-2.5 py-1 text-label-md font-label-md bg-tertiary-container/10 border border-tertiary-fixed-dim text-tertiary-fixed hover:bg-tertiary-container/30 transition-colors uppercase tracking-wider flex items-center gap-1">',
    '<button id="btn-laser-arm" class="px-2.5 py-1 text-label-md font-label-md bg-tertiary-container/10 border border-tertiary-fixed-dim text-tertiary-fixed hover:bg-tertiary-container/30 transition-colors uppercase tracking-wider flex items-center gap-1 cursor-pointer">'
)

# Emergency Stop button ID
html = html.replace(
    '<button class="px-2.5 py-1 text-label-md font-label-md caution-stripe border border-error text-error hover:text-white transition-all uppercase tracking-wider flex items-center gap-1 font-bold">',
    '<button id="btn-emergency-stop" class="px-2.5 py-1 text-label-md font-label-md caution-stripe border border-error text-error hover:text-white transition-all uppercase tracking-wider flex items-center gap-1 font-bold cursor-pointer">'
)

# Top Right Icon Buttons
html = html.replace(
    '<button class="p-1 hover:text-primary transition-colors" title="Terminal Shell">',
    '<button id="btn-terminal-shell" class="p-1 hover:text-primary transition-colors cursor-pointer" title="Terminal Shell">'
)
html = html.replace(
    '<button class="p-1 hover:text-primary transition-colors" title="Subsystem Settings">',
    '<button id="btn-subsystem-settings" class="p-1 hover:text-primary transition-colors cursor-pointer" title="Subsystem Settings">'
)

# Audio Chirp Toggle in nav
html = html.replace(
    '<span>AUDIO CHIRP: ON</span>',
    '<span>AUDIO CHIRP: <button id="btn-sound-toggle" class="text-secondary font-bold hover:underline cursor-pointer">ON</button></span>'
)

# Tracker Ribbon indicator
html = html.replace(
    '<span class="text-primary-container font-semibold">KALMAN EXTENDED (EKF)</span>',
    '<span id="sub-tracker-mode" class="text-primary-container font-semibold">KALMAN EXTENDED (EKF)</span>'
)

# 2. Workspace Navigation Ribbon Tabs
old_tabs = '''<div class="flex items-center gap-6 h-full">
<!-- Active tab from prompt & JSON structure -->
<button class="text-primary border-b-2 border-primary pb-0.5 font-semibold text-label-md font-label-md flex items-center gap-1.5 h-full">
<span class="material-symbols-outlined text-sm">radar</span>
        FLIGHT OPERATIONS (ACTIVE)
      </button>
<button class="text-on-surface-variant hover:text-on-surface pb-0.5 font-medium transition-colors text-label-md font-label-md flex items-center gap-1.5 h-full">
<span class="material-symbols-outlined text-sm">adjust</span>
        GIMBAL CONTROL LAB
      </button>
<button class="text-on-surface-variant hover:text-on-surface pb-0.5 font-medium transition-colors text-label-md font-label-md flex items-center gap-1.5 h-full">
<span class="material-symbols-outlined text-sm">biotech</span>
        OPTICS &amp; TURBULENCE
      </button>
<button class="text-on-surface-variant hover:text-on-surface pb-0.5 font-medium transition-colors text-label-md font-label-md flex items-center gap-1.5 h-full">
<span class="material-symbols-outlined text-sm">query_stats</span>
        METRICS &amp; DIAGNOSTICS
      </button>
<button class="text-on-surface-variant hover:text-on-surface pb-0.5 font-medium transition-colors text-label-md font-label-md flex items-center gap-1.5 h-full">
<span class="material-symbols-outlined text-sm">history</span>
        MISSION REPLAY &amp; EXPORT
      </button>
</div>'''

new_tabs = '''<div class="flex items-center gap-6 h-full">
<button id="tab-flight-ops" class="tab-ribbon text-primary border-b-2 border-primary pb-0.5 font-semibold text-label-md font-label-md flex items-center gap-1.5 h-full cursor-pointer">
<span class="material-symbols-outlined text-sm">radar</span>
FLIGHT OPERATIONS (ACTIVE)
</button>
<button id="tab-gimbal-lab" class="tab-ribbon text-on-surface-variant hover:text-on-surface pb-0.5 font-medium transition-colors text-label-md font-label-md flex items-center gap-1.5 h-full cursor-pointer">
<span class="material-symbols-outlined text-sm">adjust</span>
GIMBAL CONTROL LAB
</button>
<button id="tab-optics-lab" class="tab-ribbon text-on-surface-variant hover:text-on-surface pb-0.5 font-medium transition-colors text-label-md font-label-md flex items-center gap-1.5 h-full cursor-pointer">
<span class="material-symbols-outlined text-sm">biotech</span>
OPTICS &amp; TURBULENCE
</button>
<button id="tab-metrics-report" class="tab-ribbon text-on-surface-variant hover:text-on-surface pb-0.5 font-medium transition-colors text-label-md font-label-md flex items-center gap-1.5 h-full cursor-pointer">
<span class="material-symbols-outlined text-sm">query_stats</span>
METRICS &amp; DIAGNOSTICS
</button>
<button id="tab-mission-replay" class="tab-ribbon text-on-surface-variant hover:text-on-surface pb-0.5 font-medium transition-colors text-label-md font-label-md flex items-center gap-1.5 h-full cursor-pointer">
<span class="material-symbols-outlined text-sm">history</span>
MISSION REPLAY &amp; EXPORT
</button>
</div>'''
html = html.replace(old_tabs, new_tabs)

# 3. SideNav Controls
# Lock Beacon CTA
html = html.replace(
    '<button class="w-full mb-3 py-1.5 px-3 bg-primary-container text-on-primary font-label-md text-label-md font-bold tracking-wider uppercase border border-primary hover:bg-surface-tint transition-colors flex items-center justify-center gap-2">',
    '<button id="btn-lock-beacon" class="w-full mb-3 py-1.5 px-3 bg-primary-container text-on-primary font-label-md text-label-md font-bold tracking-wider uppercase border border-primary hover:bg-surface-tint transition-colors flex items-center justify-center gap-2 cursor-pointer">'
)

# SideNav Links
old_sidenav_links = '''<div class="space-y-1">
<!-- Active: LINK TRACKING -->
<a class="bg-surface-container border-l-2 border-primary text-primary font-semibold px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm" href="#">
<span class="material-symbols-outlined text-primary text-base">radar</span>
<span>LINK TRACKING</span>
</a>
<a class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors" href="#">
<span class="material-symbols-outlined text-base">adjust</span>
<span>OPTICAL RADAR</span>
</a>
<a class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors" href="#">
<span class="material-symbols-outlined text-base">biotech</span>
<span>CMOS DETECTOR</span>
</a>
<a class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors" href="#">
<span class="material-symbols-outlined text-base">tune</span>
<span>PID SERVO DOCK</span>
</a>
<a class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors" href="#">
<span class="material-symbols-outlined text-base">query_stats</span>
<span>SPECTRAL BER</span>
</a>
<a class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors" href="#">
<span class="material-symbols-outlined text-base">terminal</span>
<span>EVENT CONSOLE</span>
</a>
</div>'''

new_sidenav_links = '''<div class="space-y-1">
<a id="nav-link-tracking" class="sidenav-item bg-surface-container border-l-2 border-primary text-primary font-semibold px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm cursor-pointer" href="#sec-radar">
<span class="material-symbols-outlined text-primary text-base">radar</span>
<span>LINK TRACKING</span>
</a>
<a id="nav-optical-radar" class="sidenav-item text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors cursor-pointer" href="#sec-radar">
<span class="material-symbols-outlined text-base">adjust</span>
<span>OPTICAL RADAR</span>
</a>
<a id="nav-cmos-detector" class="sidenav-item text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors cursor-pointer" href="#sec-cmos">
<span class="material-symbols-outlined text-base">biotech</span>
<span>CMOS DETECTOR</span>
</a>
<a id="nav-pid-dock" class="sidenav-item text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors cursor-pointer" href="#sec-pid">
<span class="material-symbols-outlined text-base">tune</span>
<span>PID SERVO DOCK</span>
</a>
<a id="nav-spectral-ber" class="sidenav-item text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors cursor-pointer" href="#sec-oscilloscope">
<span class="material-symbols-outlined text-base">query_stats</span>
<span class="text-purple-300 font-bold">SPECTRAL BER</span>
</a>
<a id="nav-event-console" class="sidenav-item text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-2 flex items-center gap-3 text-label-sm font-label-sm transition-colors cursor-pointer" href="#sec-terminal">
<span class="material-symbols-outlined text-base">terminal</span>
<span>EVENT CONSOLE</span>
</a>
</div>'''
html = html.replace(old_sidenav_links, new_sidenav_links)

# SideNav bottom links
html = html.replace(
    '<a class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-1.5 flex items-center gap-3 text-label-sm font-label-sm transition-colors" href="#">\n<span class="material-symbols-outlined text-base">health_and_safety</span>\n<span>SUBSYSTEM HEALTH</span>\n</a>',
    '<a id="nav-subsystem-health" class="sidenav-item text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-1.5 flex items-center gap-3 text-label-sm font-label-sm transition-colors cursor-pointer" href="#sec-supervisor"><span class="material-symbols-outlined text-base">health_and_safety</span><span>SUBSYSTEM HEALTH</span></a>'
)
html = html.replace(
    '<a class="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-1.5 flex items-center gap-3 text-label-sm font-label-sm transition-colors" href="#">\n<span class="material-symbols-outlined text-base">developer_board</span>\n<span>DIAGNOSTICS</span>\n</a>',
    '<a id="nav-diagnostics" class="sidenav-item text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface px-3 py-1.5 flex items-center gap-3 text-label-sm font-label-sm transition-colors cursor-pointer" href="#sec-oscilloscope"><span class="material-symbols-outlined text-base">developer_board</span><span>DIAGNOSTICS</span></a>'
)

# 4. Section IDs for Main Bento Grid
# Radar section
html = html.replace(
    '<section class="col-span-12 lg:col-span-5 bg-surface-container border border-outline-variant flex flex-col h-[380px] relative overflow-hidden">',
    '<section id="sec-radar" class="col-span-12 lg:col-span-5 bg-surface-container border border-outline-variant flex flex-col h-[380px] relative overflow-hidden transition-all duration-300">'
)
# CMOS section
html = html.replace(
    '<section class="col-span-12 lg:col-span-4 bg-surface-container border border-outline-variant flex flex-col h-[380px] relative overflow-hidden">',
    '<section id="sec-cmos" class="col-span-12 lg:col-span-4 bg-surface-container border border-outline-variant flex flex-col h-[380px] relative overflow-hidden transition-all duration-300">'
)
# Supervisor section
html = html.replace(
    '<section class="col-span-12 lg:col-span-3 bg-surface-container border border-outline-variant flex flex-col h-[380px] p-2 justify-between">',
    '<section id="sec-supervisor" class="col-span-12 lg:col-span-3 bg-surface-container border border-outline-variant flex flex-col h-[380px] p-2 justify-between transition-all duration-300">'
)
# Oscilloscope section
html = html.replace(
    '<section class="col-span-12 lg:col-span-5 bg-surface-container border border-outline-variant flex flex-col h-64">',
    '<section id="sec-oscilloscope" class="col-span-12 lg:col-span-5 bg-surface-container border border-outline-variant flex flex-col h-64 transition-all duration-300">'
)
# Terminal section
html = html.replace(
    '<section class="col-span-12 lg:col-span-4 bg-surface-container border border-outline-variant flex flex-col h-64">',
    '<section id="sec-terminal" class="col-span-12 lg:col-span-4 bg-surface-container border border-outline-variant flex flex-col h-64 transition-all duration-300">'
)
# PID section
html = html.replace(
    '<section class="col-span-12 lg:col-span-3 bg-surface-container border border-outline-variant flex flex-col h-64 justify-between p-2">',
    '<section id="sec-pid" class="col-span-12 lg:col-span-3 bg-surface-container border border-outline-variant flex flex-col h-64 justify-between p-2 transition-all duration-300">'
)

# 5. Replace Radar static SVG with Canvas
radar_svg_pattern = r'<svg class="w-full h-full absolute inset-0" viewbox="-120 -120 240 240">.*?</svg>'
radar_canvas_replacement = '<canvas id="radar-canvas" class="w-full h-full absolute inset-0 block"></canvas>'
html = re.sub(radar_svg_pattern, radar_canvas_replacement, html, flags=re.DOTALL)

# Radar floating HUD
html = html.replace(
    '<span class="text-on-surface">AZ: <strong class="text-primary font-mono">+04.281 mrad</strong></span>',
    '<span class="text-on-surface">AZ: <strong id="radar-az-val" class="text-primary font-mono">+00.000 mrad</strong></span>'
)
html = html.replace(
    '<span class="text-on-surface">EL: <strong class="text-primary font-mono">-01.904 mrad</strong></span>',
    '<span class="text-on-surface">EL: <strong id="radar-el-val" class="text-primary font-mono">-00.000 mrad</strong></span>'
)
html = html.replace(
    '<span class="text-on-surface">RESIDUAL: <strong class="text-secondary font-mono">0.14 mrad</strong></span>',
    '<span class="text-on-surface">RESIDUAL: <strong id="radar-res-val" class="text-secondary font-mono">0.00 mrad</strong></span>'
)
html = html.replace(
    '<span class="px-1.5 py-0.2 bg-secondary-container/20 text-secondary border border-secondary/40">IN BORESIGHT</span>',
    '<span id="radar-lock-badge" class="px-1.5 py-0.2 bg-secondary-container/20 text-secondary border border-secondary/40">IN BORESIGHT</span>'
)

# 6. Replace CMOS Detector simulated spot with real <img> and overlay canvas (NO BROKEN ALT TEXT)
cmos_sim_pattern = r'<div class="relative w-36 h-36 rounded-full flex items-center justify-center">.*?</div>\s*</div>'
cmos_real_replacement = '''<div class="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#06080F]">
  <img id="camera-frame-img" class="w-full h-full object-contain pointer-events-none" alt="" style="display: none;" />
  <canvas id="camera-hud-canvas" class="absolute inset-0 pointer-events-none w-full h-full"></canvas>
</div>'''
html = re.sub(cmos_sim_pattern, cmos_real_replacement, html, flags=re.DOTALL)

# CMOS Overlays
html = html.replace(
    '<strong class="text-on-surface font-mono">61,420 DN</strong>',
    '<strong id="cam-peak-counts" class="text-on-surface font-mono">61,420 DN</strong>'
)
html = html.replace(
    '<strong class="text-secondary font-mono">3.2 px</strong>',
    '<strong id="cam-spot-pos" class="text-secondary font-mono">NO DETECTION</strong>'
)
html = html.replace(
    '<strong class="text-primary font-mono">14.2 dB</strong>',
    '<strong id="cam-gain-stat" class="text-primary font-mono">1.00×</strong>'
)
html = html.replace(
    '<strong class="text-secondary font-mono">28.6 dB</strong>',
    '<strong id="cam-snr-stat" class="text-secondary font-mono">28.4 dB</strong>'
)
html = html.replace(
    '<span class="text-primary font-mono">142.6 pW/cm²</span>',
    '<span id="cam-power-density" class="text-primary font-mono">142.6 pW/cm²</span>'
)

# 7. Telemetry Sidebar Mode buttons
html = html.replace(
    '<button class="py-1 px-1 text-center bg-primary-container/20 border border-primary-container text-primary text-label-sm font-label-sm font-bold">\n                EKF (ACT)\n              </button>',
    '<button id="btn-mode-ekf" class="py-1 px-1 text-center bg-primary-container/20 border border-primary-container text-primary text-label-sm font-label-sm font-bold cursor-pointer">EKF (ACT)</button>'
)
html = html.replace(
    '<button class="py-1 px-1 text-center bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface text-label-sm font-label-sm">\n                PARTICLE\n              </button>',
    '<button id="btn-mode-particle" class="py-1 px-1 text-center bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface text-label-sm font-label-sm cursor-pointer">PARTICLE</button>'
)
html = html.replace(
    '<button class="py-1 px-1 text-center bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface text-label-sm font-label-sm">\n                COAST\n              </button>',
    '<button id="btn-mode-coast" class="py-1 px-1 text-center bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface text-label-sm font-label-sm cursor-pointer">COAST</button>'
)

# Supervisor state
html = html.replace(
    '<div class="text-headline-sm font-headline-sm font-bold text-secondary tracking-wide mt-1">\n              STATE: CLOSED LOOP TRACKING\n            </div>',
    '<div id="fsm-supervisor-state" class="text-headline-sm font-headline-sm font-bold text-secondary tracking-wide mt-1">STATE: CLOSED LOOP TRACKING</div>'
)
html = html.replace(
    '<div class="text-body-sm font-body-sm text-on-surface-variant mt-1 flex items-center gap-1.5">\n<span class="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>\n<span>BEACON LOCKED &amp; CENTROIDED</span>\n</div>',
    '<div id="fsm-subtitle" class="text-body-sm font-body-sm text-on-surface-variant mt-1 flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-secondary animate-pulse"></span><span>BEACON LOCKED &amp; CENTROIDED</span></div>'
)

# Lock retention
html = html.replace(
    '<div class="text-headline-lg font-headline-lg font-bold text-primary font-mono mt-0.5">99.4%</div>',
    '<div id="lock-retention-val" class="text-headline-lg font-headline-lg font-bold text-primary font-mono mt-0.5">99.4%</div>'
)
html = html.replace(
    '<div class="w-12 h-12 rounded-full border-2 border-secondary border-t-primary flex items-center justify-center text-label-sm font-label-sm font-mono text-secondary">\n              99.4\n            </div>',
    '<div id="lock-retention-radial" class="w-12 h-12 rounded-full border-2 border-secondary border-t-primary flex items-center justify-center text-label-sm font-label-sm font-mono text-secondary">99.4</div>'
)

# Pointing error residual
html = html.replace(
    '<span class="text-primary font-mono font-bold">0.42 mrad</span>',
    '<span id="err-mrad-val" class="text-primary font-mono font-bold">0.000 mrad</span>'
)
html = html.replace(
    '<div class="h-full bg-secondary w-[14%] transition-all duration-300"></div>',
    '<div id="err-mrad-bar" class="h-full bg-secondary w-[14%] transition-all duration-300"></div>'
)

# Motor torque
html = html.replace(
    '<span class="text-on-surface font-mono">41.2% [2.1 Nm]</span>',
    '<span id="az-motor-torque" class="text-on-surface font-mono">41.2% [2.1 Nm]</span>'
)
html = html.replace(
    '<span class="text-on-surface font-mono">28.7% [1.4 Nm]</span>',
    '<span id="el-motor-torque" class="text-on-surface font-mono">28.7% [1.4 Nm]</span>'
)

# 8. Oscilloscope SVG replacement & Range buttons
scope_svg_pattern = r'<svg class="w-full h-36" preserveaspectratio="none" viewbox="0 0 400 120">.*?</svg>'
scope_canvas_replacement = '<canvas id="telemetry-chart-canvas" class="w-full h-36 relative z-10 block"></canvas>'
html = re.sub(scope_svg_pattern, scope_canvas_replacement, html, flags=re.DOTALL)

old_scope_ranges = '''<div class="flex items-center gap-1 text-label-sm font-label-sm">
<span class="px-1.5 py-0.5 bg-surface-variant text-on-surface-variant">10s</span>
<span class="px-1.5 py-0.5 bg-primary-container text-on-primary font-bold">30s</span>
<span class="px-1.5 py-0.5 bg-surface-variant text-on-surface-variant">60s</span>
<span class="px-1.5 py-0.5 bg-surface-variant text-on-surface-variant">ALL</span>
</div>'''

new_scope_ranges = '''<div class="flex items-center gap-1 text-label-sm font-label-sm">
<button id="scope-range-10" class="scope-range-btn px-1.5 py-0.5 bg-surface-variant text-on-surface-variant hover:text-on-surface cursor-pointer">10s</button>
<button id="scope-range-30" class="scope-range-btn px-1.5 py-0.5 bg-primary-container text-on-primary font-bold cursor-pointer">30s</button>
<button id="scope-range-60" class="scope-range-btn px-1.5 py-0.5 bg-surface-variant text-on-surface-variant hover:text-on-surface cursor-pointer">60s</button>
<button id="scope-range-all" class="scope-range-btn px-1.5 py-0.5 bg-surface-variant text-on-surface-variant hover:text-on-surface cursor-pointer">ALL</button>
</div>'''
html = html.replace(old_scope_ranges, new_scope_ranges)

# Oscilloscope 4-Channel Legend Readouts & Toggles (INCLUDES CH4: SPECTRAL BER!)
old_legend_toggles = '''<div class="flex items-center gap-3">
<span class="text-primary flex items-center gap-1 cursor-pointer">
<span class="w-2 h-2 rounded-full bg-primary-container"></span>
                  Ch1: Pointing Error (0.42 mrad)
                </span>
<span class="text-secondary flex items-center gap-1 cursor-pointer">
<span class="w-2 h-2 rounded-full bg-secondary"></span>
                  Ch2: Confidence (98.4%)
                </span>
<span class="text-tertiary-fixed-dim flex items-center gap-1 cursor-pointer">
<span class="w-2 h-2 rounded-full bg-tertiary-fixed-dim"></span>
                  Ch3: Fried r0 (8.5cm)
                </span>
</div>'''

new_legend_toggles = '''<div class="flex items-center gap-2.5 flex-wrap">
<button id="toggle-ch1" class="text-primary flex items-center gap-1 cursor-pointer hover:underline text-[9px]" title="Toggle Channel 1">
<span class="w-2 h-2 rounded-full bg-primary-container"></span>
Ch1: Error (<span id="scope-ch1-val">0.000</span> mrad)
</button>
<button id="toggle-ch2" class="text-secondary flex items-center gap-1 cursor-pointer hover:underline text-[9px]" title="Toggle Channel 2">
<span class="w-2 h-2 rounded-full bg-secondary"></span>
Ch2: Conf (<span id="scope-ch2-val">0%</span>)
</button>
<button id="toggle-ch3" class="text-tertiary-fixed-dim flex items-center gap-1 cursor-pointer hover:underline text-[9px]" title="Toggle Channel 3">
<span class="w-2 h-2 rounded-full bg-tertiary-fixed-dim"></span>
Ch3: Sev (<span id="scope-ch3-val">0%</span>)
</button>
<button id="toggle-ch4" class="text-purple-300 flex items-center gap-1 cursor-pointer hover:underline text-[9px] font-bold" title="Toggle Channel 4 (Spectral BER)">
<span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
Ch4: BER (<span id="scope-ch4-val">1.2e-9</span>)
</button>
</div>'''
html = html.replace(old_legend_toggles, new_legend_toggles)

# 9. Terminal Log Container & Filter Chips
old_terminal_chips = '''<div class="flex items-center gap-1 text-[8px] font-mono">
<span class="px-1 bg-surface-variant text-primary font-bold cursor-pointer">[ALL]</span>
<span class="px-1 bg-surface-container text-on-surface-variant cursor-pointer">[CRIT]</span>
<span class="px-1 bg-surface-container text-on-surface-variant cursor-pointer">[FSM]</span>
<span class="px-1 bg-surface-container text-on-surface-variant cursor-pointer">[SENSORS]</span>
</div>'''

new_terminal_chips = '''<div class="flex items-center gap-1 text-[8px] font-mono">
<button id="log-filter-all" class="log-filter-btn px-1.5 py-0.5 bg-primary-container text-on-primary font-bold cursor-pointer">[ALL]</button>
<button id="log-filter-crit" class="log-filter-btn px-1.5 py-0.5 bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer">[CRIT]</button>
<button id="log-filter-fsm" class="log-filter-btn px-1.5 py-0.5 bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer">[FSM]</button>
<button id="log-filter-comm" class="log-filter-btn px-1.5 py-0.5 bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer">[COMM]</button>
<button id="log-filter-pid" class="log-filter-btn px-1.5 py-0.5 bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer">[PID]</button>
</div>'''
html = html.replace(old_terminal_chips, new_terminal_chips)

old_terminal_log = '''<div class="flex-1 bg-surface-container-lowest p-2 overflow-y-auto custom-scrollbar font-mono text-[10px] space-y-1.5 leading-relaxed">
<div class="flex items-start gap-1.5 text-on-surface">
<span class="text-outline shrink-0">00:01:30.412</span>
<span class="px-1 bg-secondary-container/20 text-secondary border border-secondary/30 shrink-0 font-bold">[LOCK]</span>
<span class="text-on-surface">Carrier beacon stabilized on CMOS sub-aperture #2.</span>
</div>
<div class="flex items-start gap-1.5 text-on-surface">
<span class="text-outline shrink-0">00:01:29.890</span>
<span class="px-1 bg-primary-container/20 text-primary-container border border-primary-container/30 shrink-0 font-bold">[MODE]</span>
<span class="text-on-surface">Transition: OPEN_LOOP_ACQUISITION -&gt; CLOSED_LOOP_TRACKING.</span>
</div>
<div class="flex items-start gap-1.5 text-on-surface">
<span class="text-outline shrink-0">00:01:28.104</span>
<span class="px-1 bg-tertiary-container/20 text-tertiary-fixed-dim border border-tertiary-container/30 shrink-0 font-bold">[PID]</span>
<span class="text-on-surface">Auto-tuned feedforward gain Kff to 1.14 on Azimuth axis.</span>
</div>
<div class="flex items-start gap-1.5 text-on-surface">
<span class="text-outline shrink-0">00:01:26.550</span>
<span class="px-1 bg-secondary-container/20 text-secondary border border-secondary/30 shrink-0 font-bold">[REACQ]</span>
<span class="text-on-surface">Spot centroid recovered after micro-scintillation fade (SNR 12.1 -&gt; 28.4 dB).</span>
</div>
<div class="flex items-start gap-1.5 text-on-surface">
<span class="text-outline shrink-0">00:01:24.002</span>
<span class="px-1 bg-surface-variant text-on-surface-variant border border-outline-variant shrink-0 font-bold">[GIMBAL]</span>
<span class="text-on-surface">Slew rate normalized to 0.42 rad/s. Track convergence &lt;0.5mrad.</span>
</div>
<div class="flex items-start gap-1.5 text-on-surface">
<span class="text-outline shrink-0">00:01:21.310</span>
<span class="px-1 bg-primary-container/20 text-primary-container border border-primary-container/30 shrink-0 font-bold">[OPTICS]</span>
<span class="text-on-surface">Piezo Fast Steering Mirror (FSM) zero-point calibrated.</span>
</div>
</div>'''

new_terminal_log = '<div id="event-log-terminal" class="flex-1 bg-surface-container-lowest p-2 overflow-y-auto custom-scrollbar font-mono text-[10px] space-y-1.5 leading-relaxed"></div>'
html = html.replace(old_terminal_log, new_terminal_log)

html = html.replace(
    '<span>6/120 EVENTS</span>',
    '<span id="event-counter">0 EVENTS</span>'
)

# 10. PID Steppers & Atmospheric Turbulence
html = html.replace(
    '<span class="text-primary font-mono">42.50</span>',
    '<span id="pid-kp-val" class="text-primary font-mono">42.50</span>'
)
html = html.replace(
    '<span class="text-primary font-mono">0.85</span>',
    '<span id="pid-ki-val" class="text-primary font-mono">0.85</span>'
)
html = html.replace(
    '<span class="text-primary font-mono">12.30</span>',
    '<span id="pid-kd-val" class="text-primary font-mono">12.30</span>'
)
html = html.replace(
    '<span class="text-primary font-mono">1.14</span>',
    '<span id="pid-kff-val" class="text-primary font-mono">1.14</span>'
)

old_stepper_kp = '''<div class="flex gap-1 mt-1">
<button class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface">-</button>
<button class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface">+</button>
</div>'''
new_stepper_kp = '''<div class="flex gap-1 mt-1">
<button id="btn-kp-dec" class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface cursor-pointer">-</button>
<button id="btn-kp-inc" class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface cursor-pointer">+</button>
</div>'''
html = html.replace(old_stepper_kp, new_stepper_kp, 1)

old_stepper_ki = '''<div class="flex gap-1 mt-1">
<button class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface">-</button>
<button class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface">+</button>
</div>'''
new_stepper_ki = '''<div class="flex gap-1 mt-1">
<button id="btn-ki-dec" class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface cursor-pointer">-</button>
<button id="btn-ki-inc" class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface cursor-pointer">+</button>
</div>'''
html = html.replace(old_stepper_ki, new_stepper_ki, 1)

old_stepper_kd = '''<div class="flex gap-1 mt-1">
<button class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface">-</button>
<button class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface">+</button>
</div>'''
new_stepper_kd = '''<div class="flex gap-1 mt-1">
<button id="btn-kd-dec" class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface cursor-pointer">-</button>
<button id="btn-kd-inc" class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface cursor-pointer">+</button>
</div>'''
html = html.replace(old_stepper_kd, new_stepper_kd, 1)

old_stepper_kff = '''<div class="flex gap-1 mt-1">
<button class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface">-</button>
<button class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface">+</button>
</div>'''
new_stepper_kff = '''<div class="flex gap-1 mt-1">
<button id="btn-kff-dec" class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface cursor-pointer">-</button>
<button id="btn-kff-inc" class="flex-1 bg-surface-variant hover:bg-surface-bright text-center text-on-surface cursor-pointer">+</button>
</div>'''
html = html.replace(old_stepper_kff, new_stepper_kff, 1)

# Preset buttons
html = html.replace(
    '<button class="py-1 bg-surface-container-high border border-outline-variant hover:border-primary text-on-surface-variant hover:text-primary">\n                URBAN\n              </button>',
    '<button id="btn-preset-urban" class="py-1 bg-surface-container-high border border-outline-variant hover:border-primary text-on-surface-variant hover:text-primary cursor-pointer">URBAN</button>'
)
html = html.replace(
    '<button class="py-1 bg-surface-container-high border border-outline-variant hover:border-primary text-on-surface-variant hover:text-primary">\n                HI-ALT\n              </button>',
    '<button id="btn-preset-hialt" class="py-1 bg-surface-container-high border border-outline-variant hover:border-primary text-on-surface-variant hover:text-primary cursor-pointer">HI-ALT</button>'
)
html = html.replace(
    '<button class="py-1 bg-surface-container-high border border-outline-variant hover:border-primary text-on-surface-variant hover:text-primary">\n                STORM\n              </button>',
    '<button id="btn-preset-storm" class="py-1 bg-surface-container-high border border-outline-variant hover:border-primary text-on-surface-variant hover:text-primary cursor-pointer">STORM</button>'
)
html = html.replace(
    '<button class="py-1 bg-surface-variant border border-outline-variant text-on-surface hover:text-error">\n                RESET\n              </button>',
    '<button id="btn-preset-reset" class="py-1 bg-surface-variant border border-outline-variant text-on-surface hover:text-error cursor-pointer">RESET</button>'
)

# Interactive Atmospheric Turbulence Stepper
old_turb_box = '''<div class="mt-2 bg-surface-container-low border border-outline-variant p-1.5 text-label-sm font-label-sm">
<div class="flex justify-between text-on-surface-variant">
<span>ATMOS TURBULENCE (Fried r0):</span>
<span class="text-tertiary-fixed-dim font-mono font-bold">8.5 cm</span>
</div>
<div class="w-full bg-surface-container-lowest h-1.5 mt-1">
<div class="bg-tertiary-fixed-dim h-full w-[42%]"></div>
</div>
<div class="text-[8px] text-outline mt-0.5">MODERATE TROPOSPHERIC SCINTILLATION</div>
</div>'''

new_turb_box = '''<div class="mt-2 bg-surface-container-low border border-outline-variant p-1.5 text-label-sm font-label-sm">
<div class="flex justify-between items-center text-on-surface-variant">
<span>ATMOS TURBULENCE (Fried r0):</span>
<div class="flex items-center gap-1 font-mono font-bold text-tertiary-fixed-dim">
  <button id="btn-turb-dec" class="px-1.5 py-0.2 bg-surface-variant hover:bg-surface-bright text-on-surface border border-outline-variant cursor-pointer text-[10px]">-</button>
  <span id="atmos-turb-val">8.5 cm</span>
  <button id="btn-turb-inc" class="px-1.5 py-0.2 bg-surface-variant hover:bg-surface-bright text-on-surface border border-outline-variant cursor-pointer text-[10px]">+</button>
</div>
</div>
<div id="atmos-turb-track" class="w-full bg-surface-container-lowest h-1.5 mt-1 cursor-pointer">
<div id="atmos-turb-bar" class="bg-tertiary-fixed-dim h-full w-[42%] transition-all"></div>
</div>
<div id="atmos-turb-desc" class="text-[8px] text-outline mt-0.5">MODERATE TROPOSPHERIC SCINTILLATION</div>
</div>'''
html = html.replace(old_turb_box, new_turb_box)

# 11. Transport Bar Controls
old_transport = '''<div class="flex items-center border border-outline-variant bg-surface-container-low">
<button class="p-1.5 hover:bg-surface-variant text-on-surface-variant hover:text-on-surface" title="Step Back Frame">
<span class="material-symbols-outlined text-sm">skip_previous</span>
</button>
<button class="p-1.5 bg-secondary-container/20 text-secondary border-x border-outline-variant hover:bg-secondary-container/40 hud-glow-green" title="Play Simulation">
<span class="material-symbols-outlined text-base">play_arrow</span>
</button>
<button class="p-1.5 hover:bg-surface-variant text-on-surface-variant hover:text-on-surface" title="Pause Simulation">
<span class="material-symbols-outlined text-sm">pause</span>
</button>
<button class="p-1.5 hover:bg-surface-variant text-on-surface-variant hover:text-on-surface border-r border-outline-variant" title="Step Forward Frame">
<span class="material-symbols-outlined text-sm">skip_next</span>
</button>
<button class="p-1.5 hover:bg-surface-variant text-error" title="Reset Simulation">
<span class="material-symbols-outlined text-sm">restart_alt</span>
</button>
</div>'''

new_transport = '''<div class="flex items-center border border-outline-variant bg-surface-container-low">
<button id="btn-step-prev" class="p-1.5 hover:bg-surface-variant text-on-surface-variant hover:text-on-surface cursor-pointer" title="Step Back Frame">
<span class="material-symbols-outlined text-sm">skip_previous</span>
</button>
<button id="btn-play" class="p-1.5 bg-secondary-container/20 text-secondary border-x border-outline-variant hover:bg-secondary-container/40 hud-glow-green cursor-pointer" title="Play Simulation">
<span class="material-symbols-outlined text-base">play_arrow</span>
</button>
<button id="btn-pause" class="p-1.5 hover:bg-surface-variant text-on-surface-variant hover:text-on-surface cursor-pointer" title="Pause Simulation">
<span class="material-symbols-outlined text-sm">pause</span>
</button>
<button id="btn-step" class="p-1.5 hover:bg-surface-variant text-on-surface-variant hover:text-on-surface border-r border-outline-variant cursor-pointer" title="Step Forward Frame">
<span class="material-symbols-outlined text-sm">skip_next</span>
</button>
<button id="btn-reset" class="p-1.5 hover:bg-surface-variant text-error cursor-pointer" title="Reset Simulation">
<span class="material-symbols-outlined text-sm">restart_alt</span>
</button>
</div>'''
html = html.replace(old_transport, new_transport)

# Speed buttons
old_speeds = '''<div class="hidden sm:flex items-center gap-0.5 border border-outline-variant bg-surface-container-low text-label-sm font-label-sm p-0.5">
<button class="px-1.5 py-0.5 text-on-surface-variant hover:text-on-surface">0.25x</button>
<button class="px-1.5 py-0.5 text-on-surface-variant hover:text-on-surface">0.5x</button>
<button class="px-1.5 py-0.5 bg-primary-container text-on-primary font-bold">1.0x</button>
<button class="px-1.5 py-0.5 text-on-surface-variant hover:text-on-surface">2.0x</button>
<button class="px-1.5 py-0.5 text-on-surface-variant hover:text-on-surface">5.0x</button>
</div>'''

new_speeds = '''<div class="hidden sm:flex items-center gap-0.5 border border-outline-variant bg-surface-container-low text-label-sm font-label-sm p-0.5">
<button id="speed-btn-025" class="px-1.5 py-0.5 text-on-surface-variant hover:text-on-surface cursor-pointer">0.25x</button>
<button id="speed-btn-05" class="px-1.5 py-0.5 text-on-surface-variant hover:text-on-surface cursor-pointer">0.5x</button>
<button id="speed-btn-1" class="px-1.5 py-0.5 bg-primary-container text-on-primary font-bold cursor-pointer">1.0x</button>
<button id="speed-btn-2" class="px-1.5 py-0.5 text-on-surface-variant hover:text-on-surface cursor-pointer">2.0x</button>
<button id="speed-btn-5" class="px-1.5 py-0.5 text-on-surface-variant hover:text-on-surface cursor-pointer">5.0x</button>
</div>'''
html = html.replace(old_speeds, new_speeds)

# Timeline Bar with Scrubbing Track ID
old_timeline = '''<div class="flex-1 max-w-2xl mx-6 flex items-center gap-3">
<span class="text-label-sm font-label-sm font-mono text-primary">00:01:30.500</span>
<div class="flex-1 h-3 bg-surface-container-low border border-outline-variant relative cursor-pointer group">
<!-- Buffered Track -->
<div class="absolute top-0 bottom-0 left-0 w-[70%] bg-surface-variant opacity-60"></div>
<!-- Active Progress Head at 45% -->
<div class="absolute top-0 bottom-0 left-0 w-[45%] bg-primary-container hud-glow"></div>
<!-- Timeline Marker Point -->
<div class="absolute top-[-3px] bottom-[-3px] left-[45%] w-1.5 bg-white shadow-[0_0_8px_#00E5FF]"></div>
</div>
<span class="text-label-sm font-label-sm font-mono text-on-surface-variant">00:03:20.000</span>
</div>'''

new_timeline = '''<div class="flex-1 max-w-2xl mx-6 flex items-center gap-3">
<span id="sim-time-display" class="text-label-sm font-label-sm font-mono text-primary">00:00:00.000</span>
<div id="sim-timeline-track" class="flex-1 h-3 bg-surface-container-low border border-outline-variant relative cursor-pointer group" title="Click anywhere to scrub timeline">
<!-- Active Progress Head -->
<div id="sim-progress-bar" class="absolute top-0 bottom-0 left-0 w-[0%] bg-primary-container hud-glow pointer-events-none"></div>
<!-- Timeline Marker Point -->
<div id="sim-progress-head" class="absolute top-[-3px] bottom-[-3px] left-[0%] w-1.5 bg-white shadow-[0_0_8px_#00E5FF] pointer-events-none"></div>
</div>
<span id="sim-total-time" class="text-label-sm font-label-sm font-mono text-on-surface-variant">00:00:00.000</span>
</div>'''
html = html.replace(old_timeline, new_timeline)

# Export Buttons
html = html.replace(
    '<button class="hidden md:flex items-center gap-1 px-2 py-1 bg-surface-container border border-outline-variant text-label-sm font-label-sm text-on-surface-variant hover:text-primary hover:border-primary transition-colors">\n<span class="material-symbols-outlined text-xs">table_chart</span>\n<span>CSV</span>\n</button>',
    '<button id="btn-export-csv" class="hidden md:flex items-center gap-1 px-2 py-1 bg-surface-container border border-outline-variant text-label-sm font-label-sm text-on-surface-variant hover:text-primary hover:border-primary transition-colors cursor-pointer"><span class="material-symbols-outlined text-xs">table_chart</span><span>CSV</span></button>'
)
html = html.replace(
    '<button class="hidden md:flex items-center gap-1 px-2 py-1 bg-surface-container border border-outline-variant text-label-sm font-label-sm text-on-surface-variant hover:text-primary hover:border-primary transition-colors">\n<span class="material-symbols-outlined text-xs">data_object</span>\n<span>JSON</span>\n</button>',
    '<button id="btn-export-json" class="hidden md:flex items-center gap-1 px-2 py-1 bg-surface-container border border-outline-variant text-label-sm font-label-sm text-on-surface-variant hover:text-primary hover:border-primary transition-colors cursor-pointer"><span class="material-symbols-outlined text-xs">data_object</span><span>JSON</span></button>'
)
html = html.replace(
    '<button class="hidden sm:flex items-center gap-1 px-2 py-1 bg-surface-container border border-outline-variant text-label-sm font-label-sm text-on-surface hover:text-primary transition-colors">\n<span class="material-symbols-outlined text-xs">photo_camera</span>\n<span>SNAPSHOT</span>\n</button>',
    '<button id="btn-snapshot" class="hidden sm:flex items-center gap-1 px-2 py-1 bg-surface-container border border-outline-variant text-label-sm font-label-sm text-on-surface hover:text-primary transition-colors cursor-pointer"><span class="material-symbols-outlined text-xs">photo_camera</span><span>SNAPSHOT</span></button>'
)
html = html.replace(
    '<button class="px-2.5 py-1 bg-primary text-on-primary font-bold text-label-sm font-label-sm uppercase tracking-wider hover:bg-primary-fixed-dim transition-colors flex items-center gap-1">\n<span class="material-symbols-outlined text-xs font-bold">description</span>\n<span>GENERATE SIH REPORT</span>\n</button>',
    '<button id="btn-sih-report" class="px-2.5 py-1 bg-primary text-on-primary font-bold text-label-sm font-label-sm uppercase tracking-wider hover:bg-primary-fixed-dim transition-colors flex items-center gap-1 cursor-pointer"><span class="material-symbols-outlined text-xs font-bold">description</span><span>GENERATE SIH REPORT</span></button>'
)

# 12. Add SIH Mission Modal Dialog & SPECTRAL BER Modal Dialog markup before </body>
sih_and_ber_modals_html = '''
<!-- Interactive SIH Report Modal Dialog -->
<div id="sih-report-modal" class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4">
  <div class="bg-surface-container border border-primary/50 w-full max-w-2xl p-4 shadow-[0_0_30px_rgba(0,229,255,0.2)] flex flex-col gap-3 font-mono">
    <div class="flex justify-between items-center border-b border-outline-variant pb-2">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"></span>
        <h2 class="text-headline-sm font-bold text-primary tracking-wider">SIH 2024 MISSION PERFORMANCE AUDIT</h2>
      </div>
      <button id="btn-modal-close" class="text-on-surface-variant hover:text-error cursor-pointer p-1 text-base">✕</button>
    </div>
    <div class="text-label-sm text-on-surface-variant">
      DEPT-PAT-09 // CLOSED-LOOP OPTICAL FSOC GROUND TERMINAL BENCHMARK
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-label-sm">
      <div class="p-2 bg-surface-container-low border border-outline-variant">
        <div class="text-outline">SPEC COMPLIANCE</div>
        <div id="modal-spec-rate" class="text-headline-sm font-bold text-secondary">99.8%</div>
        <div class="text-[8px] text-on-surface-variant">&lt;2.0 mrad threshold</div>
      </div>
      <div class="p-2 bg-surface-container-low border border-outline-variant">
        <div class="text-outline">RMS POINTING ERROR</div>
        <div id="modal-rms-err" class="text-headline-sm font-bold text-primary">0.38 mrad</div>
        <div class="text-[8px] text-secondary">SUB-MRAD PRECISION</div>
      </div>
      <div class="p-2 bg-surface-container-low border border-outline-variant">
        <div class="text-outline">LOCK RETENTION</div>
        <div id="modal-lock-rate" class="text-headline-sm font-bold text-secondary">100.0%</div>
        <div class="text-[8px] text-on-surface-variant">ZERO LINK DROPOUT</div>
      </div>
      <div class="p-2 bg-surface-container-low border border-outline-variant">
        <div class="text-outline">ACQUISITION TIME</div>
        <div id="modal-acq-time" class="text-headline-sm font-bold text-primary">0.033 s</div>
        <div class="text-[8px] text-on-surface-variant">INSTANT LOCK</div>
      </div>
    </div>
    <div class="p-2.5 bg-surface-container-lowest border border-outline-variant text-[11px] text-on-surface leading-relaxed space-y-1">
      <div class="text-primary font-bold">ALGORITHM BENCHMARK SUMMARY:</div>
      <div>• Extended Kalman Filter (EKF) converged within 1 frame under moderate Kolmogorov turbulence (r0=8.5cm).</div>
      <div>• Slew-rate constrained servo controller eliminated overshoot and avoided platform mechanical saturation.</div>
      <div>• Centroid spot verification sustained 1000Hz equivalent real-time telemetry loop (&lt;10ms compute latency).</div>
    </div>
    <div class="flex justify-between items-center pt-2 border-t border-outline-variant">
      <div class="flex items-center gap-2">
        <button id="modal-dl-csv" class="px-3 py-1 bg-surface-variant border border-outline-variant hover:border-primary text-on-surface hover:text-primary text-label-sm font-bold cursor-pointer">EXPORT CSV</button>
        <button id="modal-dl-json" class="px-3 py-1 bg-surface-variant border border-outline-variant hover:border-primary text-on-surface hover:text-primary text-label-sm font-bold cursor-pointer">EXPORT JSON</button>
      </div>
      <button id="modal-dismiss" class="px-4 py-1 bg-primary text-on-primary text-label-sm font-bold tracking-wider uppercase cursor-pointer hover:bg-primary-fixed-dim">ACKNOWLEDGE</button>
    </div>
  </div>
</div>

<!-- Interactive SPECTRAL BER & Atmospheric Optical Link Quality Modal Dialog -->
<div id="spectral-ber-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
  <div class="bg-surface-container border border-purple-500/50 w-full max-w-3xl p-4 shadow-[0_0_35px_rgba(192,132,252,0.25)] flex flex-col gap-3 font-mono">
    <div class="flex justify-between items-center border-b border-outline-variant pb-2">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse"></span>
        <h2 class="text-headline-sm font-bold text-purple-300 tracking-wider">SPECTRAL BIT ERROR RATE (BER) &amp; OPTICAL LINK QUALITY</h2>
      </div>
      <button id="btn-ber-modal-close" class="text-on-surface-variant hover:text-error cursor-pointer p-1 text-base">✕</button>
    </div>
    
    <div class="text-label-sm text-on-surface-variant flex items-center justify-between">
      <span>CARRIER: 1550nm DWDM (ITU CH-34) // LINK DISTANCE: 5.0 km // COHERENT RX</span>
      <span id="ber-link-status" class="px-2 py-0.5 bg-secondary-container/20 text-secondary border border-secondary/40 text-label-sm font-bold">[LINK ACTIVE: ERROR-FREE]</span>
    </div>

    <!-- 4 Key Spectral & BER Metrics Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-label-sm">
      <div class="p-2.5 bg-surface-container-low border border-outline-variant">
        <div class="text-outline">BIT ERROR RATE (BER)</div>
        <div id="ber-metric-val" class="text-headline-md font-bold text-secondary font-mono mt-0.5">1.20 × 10⁻⁹</div>
        <div class="text-[8px] text-on-surface-variant">&lt;10⁻⁹ TARGET SPEC</div>
      </div>
      <div class="p-2.5 bg-surface-container-low border border-outline-variant">
        <div class="text-outline">OPTICAL SNR (OSNR)</div>
        <div id="ber-osnr-val" class="text-headline-md font-bold text-primary font-mono mt-0.5">28.4 dB</div>
        <div class="text-[8px] text-secondary">+14.4 dB LINK MARGIN</div>
      </div>
      <div class="p-2.5 bg-surface-container-low border border-outline-variant">
        <div class="text-outline">SCINTILLATION INDEX (σ₁²)</div>
        <div id="ber-scint-val" class="text-headline-md font-bold text-tertiary-fixed-dim font-mono mt-0.5">0.052</div>
        <div class="text-[8px] text-on-surface-variant">APERTURE AVERAGED</div>
      </div>
      <div class="p-2.5 bg-surface-container-low border border-outline-variant">
        <div class="text-outline">TELESCOPE STREHL RATIO</div>
        <div id="ber-strehl-val" class="text-headline-md font-bold text-purple-300 font-mono mt-0.5">0.884</div>
        <div class="text-[8px] text-secondary">DIFFRACTION LIMITED</div>
      </div>
    </div>

    <!-- Spectral Synthesis Canvas Graph: Live BER vs Scintillation & Phase PSD -->
    <div class="bg-surface-container-lowest p-2 border border-outline-variant flex flex-col gap-1 relative">
      <div class="flex justify-between items-center text-[9px] text-on-surface-variant">
        <span class="text-purple-300 font-bold">LIVE SPECTRAL BIT ERROR RATE &amp; SCINTILLATION FADE TRAJECTORY</span>
        <span>FEC LIMIT: 3.8 × 10⁻³</span>
      </div>
      <canvas id="spectral-ber-canvas" class="w-full h-36 relative z-10 block"></canvas>
    </div>

    <!-- Atmospheric Wave Propagation Diagnostic Grid -->
    <div class="grid grid-cols-3 gap-2 text-[10px] text-on-surface-variant bg-surface-container-low p-2 border border-outline-variant">
      <div>Fried Parameter (r₀): <strong id="ber-r0-val" class="text-primary font-mono">19.7 mm</strong></div>
      <div>Rytov Variance (σ_R²): <strong id="ber-rytov-val" class="text-on-surface font-mono">7.61</strong></div>
      <div>Intensity Fade Loss: <strong id="ber-fade-val" class="text-tertiary-fixed-dim font-mono">-1.52 dB (29.6%)</strong></div>
      <div>Angular Wander (1σ): <strong id="ber-wander-val" class="text-on-surface font-mono">0.025 mrad</strong></div>
      <div>Turbulence Severity: <strong id="ber-sev-val" class="text-secondary font-mono">0.575</strong></div>
      <div>Turbulence Regime: <strong id="ber-regime-val" class="text-primary font-mono">MODERATE TURBULENCE</strong></div>
    </div>

    <!-- Modal Footer Actions -->
    <div class="flex justify-between items-center pt-2 border-t border-outline-variant">
      <div class="flex items-center gap-2">
        <button id="btn-inject-deep-fade" class="px-3 py-1 bg-surface-variant border border-outline-variant hover:border-error text-on-surface hover:text-error text-label-sm font-bold cursor-pointer transition-colors">INJECT SCINTILLATION FADE</button>
        <button id="btn-clear-atmo-disturb" class="px-3 py-1 bg-surface-variant border border-outline-variant hover:border-secondary text-on-surface hover:text-secondary text-label-sm font-bold cursor-pointer transition-colors">CLEAR ATMOSPHERE</button>
      </div>
      <button id="btn-ber-modal-dismiss" class="px-4 py-1 bg-purple-500 text-on-primary text-label-sm font-bold tracking-wider uppercase cursor-pointer hover:bg-purple-400">ACKNOWLEDGE</button>
    </div>
  </div>
</div>
'''

html = html.replace('</body>', sih_and_ber_modals_html + '\n<script src="tactical_app.js"></script>\n</body>')

with open('web/frontend/tactical.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f"Written web/frontend/tactical.html: {len(html)} bytes")

with open('web/frontend/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f"Written web/frontend/index.html: {len(html)} bytes")
