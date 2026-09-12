import urllib.request
import json
import asyncio
import websockets

html = urllib.request.urlopen('http://127.0.0.1:8000/').read().decode('utf-8')
assert 'id="camera-frame-img"' in html, 'Missing camera-frame-img'
assert 'id="nav-spectral-ber"' in html, 'Missing nav-spectral-ber'
assert 'id="spectral-ber-modal"' in html, 'Missing spectral-ber-modal'
assert 'id="toggle-ch4"' in html, 'Missing toggle-ch4'
print('HTML DOM assertions passed!')

async def test_ws():
    async with websockets.connect('ws://127.0.0.1:8000/ws/simulation') as ws:
        msg = await ws.recv()
        data = json.loads(msg)
        print('Initial msg type:', data.get('type'))
        await ws.send(json.dumps({'action': 'step'}))
        for _ in range(10):
            msg = await ws.recv()
            pkt = json.loads(msg)
            print('Received message type:', pkt.get('type'))
            if pkt.get('type') == 'telemetry':
                t = pkt.get('data', {})
                cf = t.get('camera_frame', '')
                print(f"Got telemetry: frame = {t.get('frame_idx')}, camera_frame length = {len(cf)}, starts with = {cf[:35]}")
                assert len(cf) > 1000, 'Camera frame empty!'
                assert cf.startswith('data:image/jpeg;base64,'), 'Invalid camera frame prefix'
                assert 'turbulence' in t, 'Missing turbulence'
                print('Turbulence data keys:', list(t.get('turbulence', {}).keys()))
                print('Detected spot:', t.get('detected_spot'))
                print('ALL WS TELEMETRY CHECKS PASSED PERFECTLY!')
                return
        raise Exception('No telemetry received')

asyncio.run(test_ws())
