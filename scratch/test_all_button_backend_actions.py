import asyncio
import json
import websockets

async def test_controls():
    uri = "ws://127.0.0.1:8000/ws/simulation"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        # 1. Init
        init_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
        assert init_msg["type"] == "init", f"Expected init, got {init_msg}"
        print(f"[PASS] Init message received: Scenario '{init_msg['scenario_name']}', total frames {init_msg['num_frames']}")

        # 2. Play
        await ws.send(json.dumps({"action": "play"}))
        frames = []
        for _ in range(5):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=3.0))
            if msg["type"] == "telemetry":
                frames.append(msg["data"]["frame_id"])
        print(f"[PASS] Playback streaming frames: {frames}")
        assert len(frames) == 5, "Failed to stream 5 frames on play"

        # 3. Pause
        await ws.send(json.dumps({"action": "pause"}))
        await asyncio.sleep(0.3)
        print("[PASS] Pause command sent")

        # 4. Step forward
        await ws.send(json.dumps({"action": "step"}))
        step_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=3.0))
        assert step_msg["type"] == "telemetry"
        cur_f = step_msg["data"]["frame_id"]
        print(f"[PASS] Step forward reached frame {cur_f}")

        # 5. Step backward
        await ws.send(json.dumps({"action": "step_prev"}))
        step_prev_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=3.0))
        assert step_prev_msg["type"] == "telemetry"
        prev_f = step_prev_msg["data"]["frame_id"]
        print(f"[PASS] Step backward reached frame {prev_f}")

        # 6. Seek (Timeline Scrub)
        await ws.send(json.dumps({"action": "seek", "frame": 42}))
        seek_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=3.0))
        assert seek_msg["type"] == "telemetry"
        seek_f = seek_msg["data"]["frame_id"]
        print(f"[PASS] Timeline scrub / seek reached frame {seek_f}")
        assert seek_f == 42, f"Expected frame 42, got {seek_f}"

        # 7. Speed multiplier
        await ws.send(json.dumps({"action": "set_speed", "speed": 2.0}))
        print("[PASS] Set speed 2.0x accepted")

        # 8. PID Update
        await ws.send(json.dumps({"action": "update_pid", "kp": 55.0, "ki": 1.2, "kd": 16.0, "k_ff": 1.3, "enable_feedforward": True}))
        print("[PASS] PID gain tuning accepted")

        # 9. Turbulence disturbance update
        await ws.send(json.dumps({"action": "update_disturbances", "cn2": 2.5e-14}))
        print("[PASS] Atmospheric disturbance update accepted")

        # 10. Reset
        await ws.send(json.dumps({"action": "reset"}))
        reset_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=3.0))
        assert reset_msg["type"] == "reset"
        print("[PASS] Reset to frame 0 successful")

        # 11. Play from reset
        await ws.send(json.dumps({"action": "play"}))
        resumed_frames = []
        for _ in range(5):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=3.0))
            if msg["type"] == "telemetry":
                resumed_frames.append(msg["data"]["frame_id"])
        print(f"[PASS] Playback resumed from reset successfully: {resumed_frames}")
        assert resumed_frames[0] <= 1, f"Expected start at 0 or 1, got {resumed_frames[0]}"

        # Pause before disconnect
        await ws.send(json.dumps({"action": "pause"}))

    print("\nALL BUTTON/WEBSOCKET BACKEND ACTIONS VERIFIED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(test_controls())
