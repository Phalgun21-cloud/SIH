import asyncio
import json
import websockets

async def test_stream():
    async with websockets.connect('ws://127.0.0.1:8000/ws/simulation') as ws:
        init_m = json.loads(await ws.recv())
        print(f"[OK] Init received: {init_m['scenario_name']}")
        
        # Receive frame 0 immediately sent on connect
        f0_m = json.loads(await ws.recv())
        assert f0_m['type'] == 'telemetry', f"Expected telemetry, got {f0_m['type']}"
        tel0 = f0_m['data']
        assert 'camera_frame' in tel0 and tel0['camera_frame'].startswith('data:image/jpeg;base64,'), "Invalid camera_frame"
        print(f"[OK] Frame 0 camera_frame received! Size: {len(tel0['camera_frame'])} bytes")
        
        # Test play streaming 3 frames
        await ws.send(json.dumps({'action': 'play'}))
        for _ in range(3):
            tm = json.loads(await ws.recv())
            if tm['type'] == 'telemetry':
                d = tm['data']
                assert d['camera_frame'].startswith('data:image/jpeg;base64,')
                print(f"[OK] Frame {d['frame_id']} verified: camera_frame {len(d['camera_frame'])} bytes, error {d.get('tracking_error_mrad')} mrad")
        await ws.send(json.dumps({'action': 'pause'}))
    print("\nALL CMOS CAMERA STREAM & TELEMETRY CHECKS PASSED WITH ZERO ERRORS!")

if __name__ == '__main__':
    asyncio.run(test_stream())
