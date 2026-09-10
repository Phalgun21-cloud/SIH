"""
Unit tests for optical video evaluation and playback simulation in verify_ui.py.

Verifies:
1. SimulationSession steps through pre-recorded video frames without open-loop gimbal runaway.
2. Live optical target extraction from video frames with real boresight error computation.
3. VisualSimulatorUI renders decoded video frames on canvas with full HUD overlays.
4. Dynamic target switching and click-to-track on video canvas.
5. Reset rewinds video stream back to frame 0.
"""

import os
import math
import unittest
import tkinter as tk

from verify_ui import SimulationSession, VisualSimulatorUI
from contracts import get_resource_path


class TestUIVideoPlayback(unittest.TestCase):
    """Test suite for video playback simulation and UI visualization."""

    @classmethod
    def setUpClass(cls):
        cls.video_path = get_resource_path("data/videos/real_laser_pointer.mp4")
        if not os.path.exists(cls.video_path):
            raise unittest.SkipTest(f"Video file not found at {cls.video_path}")

        cls.video_cfg = {
            "scenario_name": "[VIDEO] real_laser_pointer.mp4",
            "category": "video_evaluation",
            "frame_source": "video_file",
            "video_path": cls.video_path,
            "num_frames": 25,
            "dt": 0.033,
            "target": {"initial_pos": [0.0, 0.0], "velocity": [0.0, 0.0]},
            "disturbances": {},
            "control": {
                "kp": 0.35, "ki": 0.0, "kd": 0.15, "k_ff": 1.0,
                "latency_frames": 1, "max_velocity": 0.5, "max_acceleration": 1.0
            }
        }

    def test_simulation_session_video_stepping_no_runaway(self):
        """SimulationSession must step without gimbal coordinate runaway and report real optical errors."""
        session = SimulationSession(self.video_cfg)
        self.assertEqual(session.frame_source, "video_file")

        for f in range(10):
            telem = session.step()
            self.assertEqual(telem["frame_id"], f)
            cam_pan, cam_tilt = telem["camera_pan_tilt"]

            # Virtual camera must remain aligned with optical recording frame (no runaway)
            self.assertEqual(cam_pan, 0.0, "Virtual camera pan must not drift in video mode")
            self.assertEqual(cam_tilt, 0.0, "Virtual camera tilt must not drift in video mode")

            # Must contain video frame image
            self.assertIn("frame_image", telem)
            self.assertIsNotNone(telem["frame_image"])
            self.assertEqual(telem["frame_image"].shape, (480, 640))

            # Must contain optical targets
            self.assertIn("targets", telem)
            targets = telem["targets"]
            self.assertGreaterEqual(len(targets), 1, "Should detect at least 1 optical spot in video")

            # Target 0 should have real optical error and pixel position
            t0 = targets[0]
            self.assertIn("pixel_pos", t0)
            self.assertIn("error_mrad", t0)
            self.assertGreater(t0["error_mrad"], 0.0, "Optical error should be positive non-zero")
            self.assertLess(t0["error_mrad"], 25.0, "Laser spot should be well within FOV")

            # Tracking error in telemetry must match optical boresight error
            self.assertIsNotNone(telem["tracking_error_mrad"])
            self.assertIsNotNone(telem["tracking_error_px"])
            self.assertAlmostEqual(telem["tracking_error_mrad"], t0["error_mrad"], places=2)

    def test_canvas_renders_video_frame_and_hud_overlays(self):
        """VisualSimulatorUI must render decoded video frame and HUD reticles on canvas."""
        try:
            root = tk.Tk()
            root.withdraw()
        except tk.TclError:
            self.skipTest("Tkinter display not available in environment")

        try:
            ui = VisualSimulatorUI(root)
            ui.scenario_list.append(self.video_cfg)
            ui.select_scenario(len(ui.scenario_list) - 1)

            # Step 5 frames
            for _ in range(5):
                ui.advance_frame()

            canvas_items = ui.canvas.find_all()

            # Must contain background image
            image_items = [itm for itm in canvas_items if ui.canvas.type(itm) == "image"]
            self.assertEqual(len(image_items), 1, "Canvas must contain 1 decoded video frame background image")

            # Must contain text labels for boresight, target, and OSD
            text_items = [ui.canvas.itemcget(itm, "text") for itm in canvas_items if ui.canvas.type(itm) == "text"]
            self.assertTrue(any("BORESIGHT" in t for t in text_items), f"Must have boresight text: {text_items}")
            self.assertTrue(any("PRIMARY" in t for t in text_items), f"Must have primary target text: {text_items}")
            self.assertTrue(any("VIDEO EVALUATION" in t for t in text_items), f"Must have video OSD text: {text_items}")

            # Must contain error vector line (dashed line)
            line_items = [itm for itm in canvas_items if ui.canvas.type(itm) == "line"]
            self.assertGreaterEqual(len(line_items), 5, "Must draw boresight crosshairs and error vector line")

            # Verify sidebar error display
            err_text = ui.lbl_error.cget("text")
            self.assertIn("mrad", err_text)
            self.assertNotIn("N/A", err_text, "Error must be numeric and populated for video tracking")

            # Verify target cards in sidebar
            self.assertIn("target_0", ui.target_telemetry_widgets)
            self.assertEqual(ui.target_telemetry_widgets["target_0"]["role"].cget("text"), "PRIMARY (TRACKED)")

        finally:
            root.destroy()

    def test_video_target_switching_and_click_to_track(self):
        """Switching targets in video mode updates primary role, reticles, and cards."""
        try:
            root = tk.Tk()
            root.withdraw()
        except tk.TclError:
            self.skipTest("Tkinter display not available in environment")

        try:
            ui = VisualSimulatorUI(root)
            ui.scenario_list.append(self.video_cfg)
            ui.select_scenario(len(ui.scenario_list) - 1)
            ui.advance_frame()

            self.assertEqual(ui.current_session.primary_target_id, "target_0")

            if len(ui._last_targets_telemetry) >= 2:
                # 1. Combobox switch to target_1
                ui.switch_primary_target("target_1")
                self.assertEqual(ui.current_session.primary_target_id, "target_1")
                ui.advance_frame()

                self.assertEqual(ui.target_telemetry_widgets["target_1"]["role"].cget("text"), "PRIMARY (TRACKED)")
                self.assertEqual(ui.target_telemetry_widgets["target_0"]["role"].cget("text"), "SECONDARY")

                # 2. Click-to-track back to target_0
                t0_info = next(t for t in ui._last_targets_telemetry if t["target_id"] == "target_0")
                px, py = t0_info["pixel_pos"]
                res = ui.current_session.camera.state.resolution
                sx = px * (ui.canvas_w / res[0])
                sy = py * (ui.canvas_h / res[1])

                class MockClick:
                    def __init__(self, x, y):
                        self.x = x
                        self.y = y

                ui.on_canvas_clicked(MockClick(sx, sy))
                self.assertEqual(ui.current_session.primary_target_id, "target_0")

        finally:
            root.destroy()

    def test_session_reset_rewinds_video(self):
        """Resetting session must rewind video frame index to 0."""
        try:
            root = tk.Tk()
            root.withdraw()
        except tk.TclError:
            self.skipTest("Tkinter display not available in environment")

        try:
            ui = VisualSimulatorUI(root)
            ui.scenario_list.append(self.video_cfg)
            ui.select_scenario(len(ui.scenario_list) - 1)

            for _ in range(5):
                ui.advance_frame()

            self.assertEqual(ui.current_session.frame_id, 5)

            ui.reset_session()
            self.assertEqual(ui.current_session.frame_id, 0)

            ui.advance_frame()
            self.assertEqual(ui.current_session.frame_id, 1)

        finally:
            root.destroy()


if __name__ == "__main__":
    unittest.main()
