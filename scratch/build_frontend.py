import subprocess
import os

with open(r'web/frontend/src/App.tsx', 'r', encoding='utf-8') as f:
    lines = f.read().splitlines()

# 1. style.css
css_text = '\n'.join(lines[18:592])
with open(r'web/frontend/style.css', 'w', encoding='utf-8') as f:
    f.write(css_text)
print(f"Written style.css: {len(css_text)} bytes")

# 2. index.html
html_body = '\n'.join(lines[598:1256])
full_html = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DRISHTI-PAT MK-IV — FSOC PAT Ground Station Console</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body class="console-root">
""" + html_body + """
    <script src="app.js"></script>
  </body>
</html>
"""
with open(r'web/frontend/index.html', 'w', encoding='utf-8') as f:
    f.write(full_html)
print(f"Written index.html: {len(full_html)} bytes")

# 3. app.js runtime
ts_runtime = '\n'.join(lines[1261:3186])
wrapper_ts = """(function () {
  'use strict';
""" + ts_runtime + """

  function init() {
    const host = document.querySelector('.console-root') || document.body;
    try {
      mountConsole(host);
    } catch (e) {
      console.error('Failed to mount console:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
"""
with open(r'web/frontend/_temp_runtime.ts', 'w', encoding='utf-8') as f:
    f.write(wrapper_ts)

print("Running esbuild to transpile app.js...")
cmd = 'cmd.exe /c "npx esbuild web/frontend/_temp_runtime.ts --outfile=web/frontend/app.js"'
subprocess.check_call(cmd, shell=True)

if os.path.exists('web/frontend/_temp_runtime.ts'):
    os.remove('web/frontend/_temp_runtime.ts')

print("Frontend build complete!")
