"""
Regression tests for GUI multi-target state extraction and canvas rendering in verify_ui.py.
Verifies:
1. SimulationSession.step() extracts all active targets, tags primary vs secondary,
   and counts detected targets in telemetry.
2. VisualSimulatorUI.render_canvas() draws distinct visual markers and labels for all
   targets simultaneously (both primary and secondary).
3. Telemetry sidebar correctly reflects the multi-target tracking state.
"""

import os
import json
import unittest
import tkinter as tk

from verify_ui import SimulationSession, VisualSimulatorUI
from contracts import get_resource_path


class TestUIMultiTargetRegression(unittest.TestCase):
    """Regression test suite for verify_ui multi-target visualization."""

    def setUp(self):
        config_path = get_resource_path("config/demo_scenarios.json")
        with open(config_path, "r", encoding="utf-8") as f:
            scenarios = json.load(f)
        self.multi_scenario = next(
            s for s in scenarios if s.get("scenario_name") == "DEMO_MULTI_TARGET_PAT"
        )

    def test_simulation_session_multi_target_telemetry(self):
        """SimulationSession.step() must export all targets in the telemetry dictionary."""
        session = SimulationSession(self.multi_scenario)
        self.assertEqual(len(session.targets), 2)
        self.assertEqual(session.primary_target_id, "target_alpha")

        telemetry = session.step()

        # 1. Backwards compatibility key
        self.assertIn("target_pos", telemetry)
        self.assertIsNotNone(telemetry["target_pos"])

        # 2. Multi-target keys
        self.assertIn("targets", telemetry)
        self.assertIn("detected_targets_count", telemetry)
        self.assertIn("primary_target_id", telemetry)

        targets = telemetry["targets"]
        self.assertEqual(len(targets), 2, f"Expected 2 targets in telemetry, got {len(targets)}")

        target_ids = {t["target_id"] for t in targets}
        self.assertEqual(target_ids, {"target_alpha", "target_beta"})

        primary_tgts = [t for t in targets if t["is_primary"]]
        secondary_tgts = [t for t in targets if not t["is_primary"]]
        self.assertEqual(len(primary_tgts), 1)
        self.assertEqual(primary_tgts[0]["target_id"], "target_alpha")
        self.assertEqual(len(secondary_tgts), 1)
        self.assertEqual(secondary_tgts[0]["target_id"], "target_beta")

        # In initial frame, both targets should be in FOV and detected
        self.assertTrue(primary_tgts[0]["in_fov"])
        self.assertTrue(secondary_tgts[0]["in_fov"])
        self.assertEqual(telemetry["detected_targets_count"], 2)

    def test_visual_simulator_canvas_renders_all_targets(self):
        """VisualSimulatorUI must draw both primary and secondary target markers on canvas."""
        try:
            root = tk.Tk()
            root.withdraw()
        except tk.TclError:
            self.skipTest("Tkinter display not available in environment")

        try:
            ui = VisualSimulatorUI(root)
            idx = next(
                i for i, s in enumerate(ui.scenario_list)
                if s.get("scenario_name") == "DEMO_MULTI_TARGET_PAT"
            )
            ui.select_scenario(idx)

            # Step 3 frames
            for _ in range(3):
                ui.advance_frame()

            # Inspect rendered canvas items
            canvas_items = ui.canvas.find_all()
            text_items = [
                ui.canvas.itemcget(item, "text")
                for item in canvas_items
                if ui.canvas.type(item) == "text"
            ]

            # Verify presence of distinct labels for both targets
            has_primary = any("PRIMARY [target_alpha]" in t for t in text_items)
            has_secondary = any("TARGET [target_beta] (SECONDARY)" in t for t in text_items)

            self.assertTrue(
                has_primary,
                f"Canvas should contain primary target label. Found texts: {text_items}",
            )
            self.assertTrue(
                has_secondary,
                f"Canvas should contain secondary target label. Found texts: {text_items}",
            )

            # Verify secondary target diamond reticle exists
            polygon_items = [item for item in canvas_items if ui.canvas.type(item) == "polygon"]
            self.assertGreaterEqual(
                len(polygon_items),
                1,
                "Canvas should contain at least 1 polygon (diamond reticle for secondary target)",
            )

            # Verify sidebar multi-target tracking status
            status_text = ui.lbl_multi_status.cget("text")
            self.assertIn("2 in view", status_text)
            self.assertIn("target_alpha", status_text)

            # Verify per-target history queues are tracked
            self.assertIn("target_alpha", ui.target_histories)
            self.assertIn("target_beta", ui.target_histories)
            self.assertEqual(len(ui.target_histories["target_alpha"]), 3)
            self.assertEqual(len(ui.target_histories["target_beta"]), 3)

            # Verify per-target telemetry widgets are populated
            self.assertIn("target_alpha", ui.target_telemetry_widgets)
            self.assertIn("target_beta", ui.target_telemetry_widgets)
            alpha_role = ui.target_telemetry_widgets["target_alpha"]["role"].cget("text")
            beta_role = ui.target_telemetry_widgets["target_beta"]["role"].cget("text")
            self.assertEqual(alpha_role, "PRIMARY (TRACKED)")
            self.assertEqual(beta_role, "SECONDARY")

        finally:
            root.destroy()

    def test_interactive_target_switching_and_per_target_telemetry(self):
        """Switching primary target updates servo tracking, canvas markers, and telemetry cards."""
        try:
            root = tk.Tk()
            root.withdraw()
        except tk.TclError:
            self.skipTest("Tkinter display not available in environment")

        try:
            ui = VisualSimulatorUI(root)
            idx = next(
                i for i, s in enumerate(ui.scenario_list)
                if s.get("scenario_name") == "DEMO_MULTI_TARGET_PAT"
            )
            ui.select_scenario(idx)

            # Step 5 frames tracking target_alpha
            for _ in range(5):
                ui.advance_frame()

            self.assertEqual(ui.cb_primary_target.get(), "target_alpha")
            self.assertEqual(
                ui.target_telemetry_widgets["target_alpha"]["role"].cget("text"),
                "PRIMARY (TRACKED)",
            )
            self.assertEqual(
                ui.target_telemetry_widgets["target_beta"]["role"].cget("text"),
                "SECONDARY",
            )

            # 1. Switch primary target to target_beta via UI method
            ui.switch_primary_target("target_beta")
            self.assertEqual(ui.cb_primary_target.get(), "target_beta")
            self.assertEqual(ui.current_session.primary_target_id, "target_beta")

            # Advance 15 frames for camera to slew and acquire target_beta
            for _ in range(15):
                ui.advance_frame()

            # Verify camera slewed towards target_beta (negative pan & tilt)
            self.assertLess(ui.current_session.camera.state.pan, 0.0)
            self.assertLess(ui.current_session.camera.state.tilt, 0.0)

            # Verify target_beta is now tracked with low tracking error (< 2 mrad)
            _, _, rad_err = ui.current_session.env.get_angular_tracking_error("target_beta")
            self.assertIsNotNone(rad_err)
            self.assertLess(rad_err * 1e3, 2.0)

            # Verify telemetry cards reflect switched roles
            self.assertEqual(
                ui.target_telemetry_widgets["target_beta"]["role"].cget("text"),
                "PRIMARY (TRACKED)",
            )
            self.assertEqual(
                ui.target_telemetry_widgets["target_alpha"]["role"].cget("text"),
                "SECONDARY",
            )

            # Verify canvas labels reflect switched roles
            items = ui.canvas.find_all()
            texts = [
                ui.canvas.itemcget(item, "text")
                for item in items
                if ui.canvas.type(item) == "text"
            ]
            self.assertTrue(any("PRIMARY [target_beta]" in t for t in texts))
            self.assertTrue(any("TARGET [target_alpha] (SECONDARY)" in t for t in texts))

            # 2. Test click-to-track: click on target_alpha coordinates to switch back
            alpha_obj = next(t for t in ui.current_session.targets if t.target_id == "target_alpha")
            sx, sy = ui.world_to_screen(alpha_obj.x, alpha_obj.y)

            class MockClickEvent:
                def __init__(self, x, y):
                    self.x = x
                    self.y = y

            ui.on_canvas_clicked(MockClickEvent(sx, sy))
            self.assertEqual(ui.cb_primary_target.get(), "target_alpha")
            self.assertEqual(ui.current_session.primary_target_id, "target_alpha")

        finally:
            root.destroy()


if __name__ == "__main__":
    unittest.main()
