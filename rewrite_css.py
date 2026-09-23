import re
import os

HTML_FILE = r'd:\projects\SIH\web\frontend\index.html'
CSS_FILE = r'd:\projects\SIH\web\frontend\style.css'

def update_css():
    with open(CSS_FILE, 'r', encoding='utf-8') as f:
        css = f.read()

    # Colors
    css = re.sub(r'--bg-space: #090d15;', r'--bg-space: #0a1118;', css)
    css = re.sub(r'--bg-panel: #101623;', r'--bg-panel: #121a24;', css)
    css = re.sub(r'--bg-panel-header: #0d121d;', r'--bg-panel-header: #0e151e;', css)
    css = re.sub(r'--bg-surface: #141c2c;', r'--bg-surface: #17212e;', css)
    css = re.sub(r'--bg-recessed: #06090f;', r'--bg-recessed: #080d12;', css)
    css = re.sub(r'--bg-input: #090e18;', r'--bg-input: #0b1118;', css)

    # Radii
    css = re.sub(r'--radius-xs: 2px;', r'--radius-xs: 4px;', css)
    css = re.sub(r'--radius-sm: 3px;', r'--radius-sm: 8px;', css)
    css = re.sub(r'--radius-md: 4px;', r'--radius-md: 12px;', css)

    # Grid layout for flight ops
    css = re.sub(
        r'\.flight-ops-layout \{\s*display: grid;\s*grid-template-columns: 1fr 340px;\s*gap: 4px;\s*height: 100%;\s*\}',
        r'.flight-ops-layout {\n  display: grid;\n  grid-template-columns: 31% 44% 25%;\n  gap: 8px;\n  height: calc(100% - 150px);\n}',
        css
    )
    
    # Visual Viewports grid
    # Change visual-viewport-grid from 1.15fr 0.85fr (which was side by side) to just full width,
    # as they are now in separate columns.
    css = re.sub(
        r'\.visual-viewport-grid \{\s*display: grid;\s*grid-template-columns: 1\.15fr 0\.85fr;\s*gap: 4px;\s*flex: 1;\s*min-height: 0;\s*padding: 4px;\s*background: var\(--bg-recessed\);\s*\}',
        r'.visual-viewport-grid {\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-height: 0;\n  padding: 4px;\n  background: var(--bg-recessed);\n}',
        css
    )
    
    health_strip_css = """
/* System Health Strip */
.system-health-strip {
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: var(--bg-panel);
  border: 1px solid var(--border-panel);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  margin-top: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
  height: 32px;
}
.health-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}
.health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-green);
}
.health-dot.cyan { background-color: var(--color-cyan); }
.health-dot.amber { background-color: var(--color-amber); }
.health-dot.red { background-color: var(--color-red); }
.health-dot.gray { background-color: var(--text-dim); }

.tooltip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 9px;
  font-weight: 700;
  margin-left: 4px;
  cursor: help;
}

.center-column {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  height: 100%;
}
"""
    if '.system-health-strip' not in css:
        css += health_strip_css

    with open(CSS_FILE, 'w', encoding='utf-8') as f:
        f.write(css)

update_css()
print("CSS updated.")
