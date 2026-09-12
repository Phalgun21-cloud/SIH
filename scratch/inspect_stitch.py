import re

with open('scratch/stitch_generated_screen.html', 'r', encoding='utf-8') as f:
    html = f.read()

ids = re.findall(r'id="([^"]+)"', html)
print(f"Total IDs: {len(ids)}")
for i in ids:
    print(f"  #{i}")

# Check for canvas, video, img, buttons, selects, inputs
tags = ['canvas', 'img', 'video', 'button', 'select', 'input']
for t in tags:
    found = re.findall(r'<' + t + r'[^>]*>', html)
    print(f"Total <{t}>: {len(found)}")
    for elem in found[:5]:
        print(f"   {elem[:100]}")
