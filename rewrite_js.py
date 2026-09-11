import re

JS_FILE = r'd:\projects\SIH\web\frontend\app.js'

def update_js():
    with open(JS_FILE, 'r', encoding='utf-8') as f:
        js = f.read()

    # Define the health strip elements in the DOM elements cache
    dom_cache_addition = """
    // System Health Strip
    healthTracking: document.getElementById('health-tracking'),
    healthTrackingTxt: document.getElementById('health-tracking-txt'),
    healthPointing: document.getElementById('health-pointing'),
    healthPointingTxt: document.getElementById('health-pointing-txt'),
    healthDetection: document.getElementById('health-detection'),
    healthDetectionTxt: document.getElementById('health-detection-txt'),
    healthDisturbance: document.getElementById('health-disturbance'),
    healthDisturbanceTxt: document.getElementById('health-disturbance-txt'),
    healthCamera: document.getElementById('health-camera'),
    healthCameraTxt: document.getElementById('health-camera-txt'),
"""
    if 'healthTracking:' not in js:
        js = js.replace('// Transport Bar Elements', dom_cache_addition + '\n    // Transport Bar Elements')

    # Add the update function
    update_function = """
  function updateHealthStrip(t) {
    if (!el.healthTracking) return;

    // Tracking Status
    if (t.is_locked) {
      el.healthTracking.className = 'health-dot green';
      el.healthTrackingTxt.textContent = 'LOCKED';
    } else {
      el.healthTracking.className = 'health-dot red';
      el.healthTrackingTxt.textContent = 'LOST';
    }

    // Pointing Status
    if (t.tracking_error_mrad !== null) {
      if (t.tracking_error_mrad < 2.0) {
        el.healthPointing.className = 'health-dot green';
        el.healthPointingTxt.textContent = 'STABLE';
      } else {
        el.healthPointing.className = 'health-dot amber';
        el.healthPointingTxt.textContent = 'DEVIATING';
      }
    }

    // Detection Status
    const conf = t.confidence || 0.0;
    if (conf >= 0.70) {
      el.healthDetection.className = 'health-dot green';
      el.healthDetectionTxt.textContent = 'GOOD';
    } else if (conf >= 0.40) {
      el.healthDetection.className = 'health-dot amber';
      el.healthDetectionTxt.textContent = 'WEAK';
    } else {
      el.healthDetection.className = 'health-dot red';
      el.healthDetectionTxt.textContent = 'POOR';
    }

    // Disturbance Status
    const sev = t.severity || 0.0;
    if (sev < 0.3) {
      el.healthDisturbance.className = 'health-dot green';
      el.healthDisturbanceTxt.textContent = 'LOW';
    } else if (sev < 0.6) {
      el.healthDisturbance.className = 'health-dot amber';
      el.healthDisturbanceTxt.textContent = 'MODERATE';
    } else {
      el.healthDisturbance.className = 'health-dot red';
      el.healthDisturbanceTxt.textContent = 'HIGH';
    }

    // Camera Control Status
    if (t.supervisor_state === 'SEARCHING') {
      el.healthCamera.className = 'health-dot amber';
      el.healthCameraTxt.textContent = 'SEARCHING';
    } else {
      el.healthCamera.className = 'health-dot cyan';
      el.healthCameraTxt.textContent = 'ACTIVE';
    }
  }
"""
    if 'function updateHealthStrip(t)' not in js:
        js = js.replace('function updateKpiReport(t)', update_function + '\n  function updateKpiReport(t)')

    # Call the update function inside onTelemetryReceived
    if 'updateHealthStrip(t);' not in js:
        js = js.replace('updateTurbulenceDisplays(t);', 'updateTurbulenceDisplays(t);\n    updateHealthStrip(t);')
    
    with open(JS_FILE, 'w', encoding='utf-8') as f:
        f.write(js)

update_js()
print("JS updated.")
