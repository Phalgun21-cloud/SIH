from bs4 import BeautifulSoup

HTML_FILE = r'd:\projects\SIH\web\frontend\index.html'

def rewrite_html():
    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')

    # 1. Rename Navigation Tabs
    tabs = soup.select('.nav-tabs-group button')
    if len(tabs) >= 4:
        tabs[0].contents[-1].replace_with(' 01 LIVE TRACKING')
        tabs[1].contents[-1].replace_with(' 02 CAMERA CONTROL')
        tabs[2].contents[-1].replace_with(' 03 TARGET & OPTICS')
        tabs[3].contents[-1].replace_with(' 04 TEST RESULTS')

    # 2. Get main components
    flight_ops = soup.find(id='panel-flight-ops')
    layout = flight_ops.select_one('.flight-ops-layout')
    
    instrument_column = layout.select_one('.instrument-column')
    telemetry_sidebar = layout.select_one('.telemetry-sidebar')
    
    radar_card = instrument_column.find(id='radar-card')
    camera_card = instrument_column.find(id='camera-card')
    oscilloscope = instrument_column.select_one('.oscilloscope-surface')
    
    # Detach them
    radar_card.extract()
    camera_card.extract()
    oscilloscope.extract()
    
    # 3. Create 3 columns
    # Column 1: Left Panel (TARGET POSITION)
    left_col = soup.new_tag('div', attrs={'class': 'instrument-column left-column'})
    radar_card['style'] = 'height: 100%;'
    left_col.append(radar_card)
    
    # Add title for left col
    radar_card.select_one('.v-indicator').next_sibling.replace_with(' TARGET POSITION')
    
    # Column 2: Center Panel (OPTICAL CAMERA FEED)
    center_col = soup.new_tag('div', attrs={'class': 'instrument-column center-column'})
    camera_card['style'] = 'height: 100%;'
    center_col.append(camera_card)
    
    cam_title = camera_card.select_one('#camera-title-text')
    cam_title.string = 'OPTICAL CAMERA FEED'
    
    # Column 3: Right Panel (TRACKING STATUS & TEST CONDITIONS)
    right_col = telemetry_sidebar
    right_col['class'] = right_col.get('class', []) + ['right-column']
    
    # Rename 'PAT FLIGHT TELEMETRY' to 'TRACKING STATUS'
    flight_ops_title = right_col.select_one('.cap-title')
    if flight_ops_title and 'PAT FLIGHT TELEMETRY' in flight_ops_title.text:
        flight_ops_title.string = 'TRACKING STATUS'
        
    # Simplify Terminology
    def rename_label(selector, text):
        el = right_col.select_one(selector)
        if el: el.string = text

    rename_label('#tracker-mode-card .inst-label', 'Tracking Method')
    rename_label('#lock-retention-val', 'Target Lock') # Actually this is the value
    # Let's find labels by text
    for el in right_col.find_all('span', class_='inst-label'):
        if 'ESTIMATOR MODE' in el.text: el.string = 'Tracking Method'
        elif 'LOCK RETENTION' in el.text: el.string = 'Target Lock'
        
    for el in right_col.find_all('span', class_='sm-label'):
        if 'TRACKING ERROR' in el.text: el.string = 'Pointing Error'
        elif 'FOCAL DEVIATION' in el.text: el.string = 'Target Offset'
        elif 'TURBULENCE SEVERITY' in el.text: el.string = 'Turbulence Level'

    for el in right_col.find_all('span', class_='c-title'):
        if 'Kolmogorov Turbulence' in el.text: el.string = 'Atmospheric Turbulence'
        elif 'Platform Jitter Amplitude' in el.text: el.string = 'Platform Vibration'
        elif 'Jitter Frequency' in el.text: el.string = 'Vibration Frequency'

    for el in right_col.find_all('span', class_='cap-title'):
        if 'DISTURBANCE INJECTION' in el.text: el.string = 'TEST CONDITIONS'
        
    btn_inject = right_col.find(id='btn-inject-occ')
    if btn_inject:
        btn_inject.string = '⚡ SIMULATE SIGNAL BLOCK'

    # Clear old flight-ops-layout
    layout.clear()
    
    # 4. Append columns to flight-ops-layout
    layout.append(left_col)
    layout.append(center_col)
    layout.append(right_col)
    
    # 5. Add System Health Strip and Graph
    system_health = soup.new_tag('div', attrs={'class': 'system-health-strip'})
    system_health.append(BeautifulSoup('''
        <div class="health-item"><span class="health-dot" id="health-tracking"></span> TRACKING: <span id="health-tracking-txt">LOCKED</span></div>
        <div class="health-item"><span class="health-dot" id="health-pointing"></span> POINTING: <span id="health-pointing-txt">STABLE</span></div>
        <div class="health-item"><span class="health-dot" id="health-detection"></span> DETECTION: <span id="health-detection-txt">GOOD</span></div>
        <div class="health-item"><span class="health-dot" id="health-disturbance"></span> DISTURBANCE: <span id="health-disturbance-txt">MODERATE</span></div>
        <div class="health-item"><span class="health-dot" id="health-camera"></span> CAMERA CONTROL: <span id="health-camera-txt">ACTIVE</span></div>
    ''', 'html.parser'))
    
    flight_ops.append(system_health)
    
    # Oscilloscope rename
    osc_title = oscilloscope.select_one('.scope-title span:last-child')
    if osc_title: osc_title.string = 'LIVE TRACKING PERFORMANCE'
    oscilloscope['style'] = 'flex: 1;'
    flight_ops.append(oscilloscope)

    # 6. Move Event Log
    event_log = right_col.select_one('.console-panel')
    if event_log:
        event_log.extract()
        # Rename to LIVE EVENT LOG
        event_log.select_one('.cap-title').string = 'LIVE EVENT LOG'
        # Add to the bottom of flight ops
        event_log['style'] = 'margin-top: 8px;'
        flight_ops.append(event_log)

    with open(HTML_FILE, 'w', encoding='utf-8') as f:
        f.write(soup.prettify(formatter="html"))

rewrite_html()
print("HTML updated.")
