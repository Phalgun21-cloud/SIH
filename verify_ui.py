"""
Standalone Visual Simulation UI for FSOC Coarse PAT Simulator.
Smart India Hackathon 2024 | Problem Statement 26169 (ISRO / DOS)

Interactive Tkinter application providing real-time 2D graphical visualization
of the closed-loop PAT pipeline:
- Main 2D Canvas: Camera FOV boundary, target marker (with detection status),
  camera boresight reticle (with lock/coast dimming), dynamic occluders,
  Tier 1 predictive re-acquisition zone, and motion history trails.
- Live Telemetry Sidebar: Tracker mode (KF/PF/COAST), supervisor state
  (TRACKING/SEARCHING/REACQUIRED), confidence and severity meters, tracking error,
  and a scrolling real-time event log.
- Bottom Controls: Scenario selector (from config/demo_scenarios.json),
  Play/Pause, Step-Frame, Reset, and adjustable simulation speed.
"""

from __future__ import annotations
import os
import json
import time
import math
from typing import Dict, Any, Optional, List, Tuple
from collections import deque
import numpy as np

import tkinter as tk
from tkinter import ttk
import cv2
from PIL import Image, ImageTk

from contracts import FrameData, TargetState, CameraState, MetricsRecord, normalize_scenario_targets, get_resource_path
from sim.target import Target
from sim.camera import Camera
from sim.environment import Environment
from detect.detector import AdaptiveOpticalDetector
from track.kalman import ConstantVelocityKalmanFilter
from track.particle import ParticleFilter
from track.severity import SeverityCalculator
from track.hybrid import HybridTracker
from control.pid import PIDController
from control.slew import SlewRateLimiter
from control.latency import ControlDelayQueue
from control.reacquisition import HierarchicalReacquisitionController
from track.classifier import TrackLossClassifier
from track.reacquisition_zone import ReacquisitionZonePredictor
from disturb.turbulence import KolmogorovTurbulence
from disturb.vibration import PlatformVibration
from disturb.noise import SensorNoise
from disturb.occluder import DynamicOccluder


class SimulationSession:
    """
    Closed-loop PAT simulation session wrapper for interactive per-frame stepping.
    Directly executes real backend algorithms without mocking.
    """

    def __init__(self, scenario_cfg: Dict[str, Any]):
        self.cfg = scenario_cfg
        self.scenario_name = scenario_cfg.get("scenario_name", "UNKNOWN")
        self.num_frames = int(scenario_cfg.get("num_frames", 100))
        self.dt = float(scenario_cfg.get("dt", 0.033))
        self.seed = int(scenario_cfg.get("seed", 42))

        targets_cfg, self.primary_target_id = normalize_scenario_targets(scenario_cfg)
        self.targets_cfg = targets_cfg
        primary_cfg = next((t for t in self.targets_cfg if t.get("target_id") == self.primary_target_id), self.targets_cfg[0])
        self.init_pos = tuple(primary_cfg.get("initial_pos", [0.010, -0.005]))
        self.vel = tuple(primary_cfg.get("velocity", [0.003, -0.002]))
        self.base_intensity = float(primary_cfg.get("base_intensity", 220.0))
        self.dist_km = float(primary_cfg.get("distance_km", primary_cfg.get("range_km", 5.0)))

        dist_cfg = scenario_cfg.get("disturbances", {})
        self.cn2 = float(dist_cfg.get("cn2", 1.0e-14))
        self.vib_amp = float(dist_cfg.get("vibration_amplitude", 0.0003))
        self.vib_freq = float(dist_cfg.get("vibration_frequency", 10.0))
        self.noise_std = float(dist_cfg.get("noise_level", 4.0))
        self.noise_types = dist_cfg.get("noise_types", None)
        self.poisson_scale = float(dist_cfg.get("poisson_scale", 1.0))
        self.salt_pepper_prob = float(dist_cfg.get("salt_pepper_prob", 0.0005 if (self.noise_types and "salt_pepper" in str(self.noise_types)) else 0.0))

        # Occlusions (single or list)
        self.scheduled_occluders: List[Tuple[int, int, DynamicOccluder]] = []
        raw_occs = []
        if dist_cfg.get("occlusion"):
            raw_occs.append(dist_cfg["occlusion"])
        if dist_cfg.get("occlusions"):
            raw_occs.extend(dist_cfg["occlusions"])

        for item in raw_occs:
            if isinstance(item, dict):
                occ = DynamicOccluder(
                    initial_pos=self.init_pos,
                    velocity=self.vel,
                    radius_rad=float(item.get("radius_rad", 0.008)),
                    opacity=float(item.get("opacity", 1.0)),
                )
                s_f = int(item.get("start_frame", 10))
                e_f = int(item.get("end_frame", 25))
                self.scheduled_occluders.append((s_f, e_f, occ))

        ctrl_cfg = scenario_cfg.get("control", {})
        self.kp = float(ctrl_cfg.get("kp", 0.35))
        self.ki = float(ctrl_cfg.get("ki", 0.0))
        self.kd = float(ctrl_cfg.get("kd", 0.15))
        self.k_ff = float(ctrl_cfg.get("k_ff", 1.0))
        self.latency_frames = int(ctrl_cfg.get("latency_frames", 2))
        self.max_vel = float(ctrl_cfg.get("max_velocity", 0.5))
        self.max_acc = float(ctrl_cfg.get("max_acceleration", 1.0))

        reacq_cfg = scenario_cfg.get("reacquisition", {})
        self.enable_pred = bool(reacq_cfg.get("enable_predictive_search", True))
        self.tier1_budget = int(reacq_cfg.get("tier1_budget_frames", 25))
        self.frame_source = scenario_cfg.get("frame_source", "synthetic")
        self.video_path = scenario_cfg.get("video_path", None)

        self.reset()

    def reset(self) -> None:
        """Reset simulation state to initial frame 0."""
        self.frame_id = 0
        self.sim_time = 0.0

        # Physical simulator objects
        self.targets = [Target.from_config(t) for t in self.targets_cfg]
        self.target = next((t for t in self.targets if t.target_id == self.primary_target_id), self.targets[0])
        self.camera = Camera(
            pan=0.0,
            tilt=0.0,
            fov_x=0.040,
            fov_y=0.030,
            resolution=(640, 480),
            enable_auto_exposure=True,
        )

        turb = KolmogorovTurbulence(cn2=self.cn2, seed=self.seed) if self.cn2 > 0 else None
        vib = PlatformVibration(amplitude_rad=self.vib_amp, frequency_hz=self.vib_freq, seed=self.seed) if self.vib_amp > 0 else None
        has_noise = (self.noise_types is not None and len(self.noise_types) > 0) or self.noise_std > 0
        noise = SensorNoise(
            gaussian_std=self.noise_std,
            salt_pepper_prob=self.salt_pepper_prob,
            poisson_scale=self.poisson_scale,
            noise_types=self.noise_types,
            seed=self.seed,
        ) if has_noise else None

        self.video_source = None
        if self.frame_source == "video_file":
            from sim.video_source import VideoFrameSource
            self.video_source = VideoFrameSource(self.video_path)
            if "dt" not in self.cfg and self.video_source.fps > 0:
                self.dt = 1.0 / self.video_source.fps

        plat_motion_cfg = self.cfg.get("platform_motion", self.cfg.get("disturbances", {}).get("platform_motion", None))

        self.env = Environment(
            target=self.target,
            targets=self.targets,
            primary_target_id=self.primary_target_id,
            camera=self.camera,
            turbulence=turb,
            vibration=vib,
            sensor_noise=noise,
            occluders=[],
            frame_source=self.frame_source,
            video_source=self.video_source,
            platform_motion=plat_motion_cfg,
        )

        # Algorithmic modules
        self.detector = AdaptiveOpticalDetector(
            enable_signature_verification=False,
            targets=self.targets,
            primary_target_id=self.primary_target_id,
        )
        self.hybrid_tracker = HybridTracker(min_valid_confidence=0.40)
        self.slew = SlewRateLimiter(max_velocity=self.max_vel, max_acceleration=self.max_acc)
        self.delay_queue = ControlDelayQueue(delay_frames=self.latency_frames)
        self.pid = PIDController(kp=self.kp, ki=self.ki, kd=self.kd, k_ff=self.k_ff, enable_feedforward=True)
        self.reacq_ctrl = HierarchicalReacquisitionController(
            fov_x=0.040,
            fov_y=0.030,
            tier1_budget_frames=self.tier1_budget,
            enable_predictive_search=self.enable_pred,
            scan_rate=0.12,
        )
        self.classifier = TrackLossClassifier()
        self.zone_predictor = ReacquisitionZonePredictor()

        self.state = "TRACKING"
        self.last_known_state = None
        self.consecutive_misses = 0
        self.delayed_p = 0.0
        self.delayed_t = 0.0
        self.computed_zone = None
        self.prev_tracker_mode = "KF"
        self.total_frames_processed = 0
        self.active_locked_frames = 0

    def set_primary_target(self, target_id: Union[str, int]) -> bool:
        """Dynamically switch active tracking primary target."""
        if self.frame_source == "video_file":
            self.primary_target_id = target_id
            self.last_known_state = None
            self.consecutive_misses = 0
            self.hybrid_tracker = HybridTracker(min_valid_confidence=0.40)
            self.pid.reset()
            return True

        matched = next((t for t in self.targets if t.target_id == target_id), None)
        if matched is None:
            return False
        self.primary_target_id = target_id
        self.target = matched
        self.env.set_primary_target(target_id)
        self.detector.set_primary_target(target_id)
        self.last_known_state = None
        self.consecutive_misses = 0
        self.hybrid_tracker = HybridTracker(min_valid_confidence=0.40)
        self.pid.reset()
        return True

    def step(self) -> Dict[str, Any]:
        """Advance simulation by one dt time step and return frame telemetry."""
        f = self.frame_id
        dt = self.dt

        # Dynamic occlusion injection
        active_occluders = [occ for (s, e, occ) in self.scheduled_occluders if s <= f <= e]
        self.env.occluders = active_occluders
        active_occ = active_occluders[0] if active_occluders else None

        event_msg: Optional[str] = None

        # 1. Camera step & frame rendering
        act_p, act_t = self.slew.apply_limit(self.delayed_p, self.delayed_t, dt)
        if self.frame_source == "video_file":
            # In pre-recorded video, virtual gimbal stays aligned with the recorded sensor frame
            # to prevent open-loop coordinate runaway while tracking actuator commands in telemetry.
            frame, tgt_state, cam_state = self.env.step(dt, 0.0, 0.0)
        else:
            frame, tgt_state, cam_state = self.env.step(dt, act_p, act_t)

        # 2. Optical Detection
        det, _ = self.detector.detect(frame)

        # Match detection to active primary target
        primary_det = None
        if det is not None:
            if self.frame_source == "video_file":
                det_list = det if isinstance(det, list) else [det]
                valid_dets = [d for d in det_list if getattr(d, "confidence", 0.0) >= 0.40]
                if not valid_dets and len(det_list) > 0:
                    valid_dets = [det_list[0]]
                valid_dets.sort(key=lambda d: getattr(d, "confidence", 0.0), reverse=True)
                valid_dets = valid_dets[:3]

                target_idx = 0
                if isinstance(self.primary_target_id, str) and self.primary_target_id.startswith("target_"):
                    try:
                        target_idx = int(self.primary_target_id.split("_")[1])
                    except (ValueError, IndexError):
                        target_idx = 0
                if 0 <= target_idx < len(valid_dets):
                    primary_det = valid_dets[target_idx]
                elif len(valid_dets) > 0:
                    primary_det = valid_dets[0]
            elif isinstance(det, list) and len(det) > 0 and tgt_state is not None:
                exp_pix = self.camera.world_to_pixel(tgt_state.x, tgt_state.y)
                if exp_pix is not None:
                    u_exp, v_exp = exp_pix
                    best_cand = min(det, key=lambda d: np.hypot(d.x - u_exp, d.y - v_exp))
                    if np.hypot(best_cand.x - u_exp, best_cand.y - v_exp) < 75.0:
                        primary_det = best_cand
                    else:
                        primary_det = det[0]
                else:
                    primary_det = det[0]
            else:
                primary_det = det[0] if isinstance(det, list) and len(det) > 0 else det

        is_valid_det = (primary_det is not None and getattr(primary_det, "confidence", 0.0) >= 0.40)
        conf_val = float(primary_det.confidence) if primary_det is not None else 0.0

        # Multi-target state extraction and FOV check
        targets_telemetry = []
        if self.frame_source == "video_file":
            if det is not None:
                det_list = det if isinstance(det, list) else [det]
                valid_dets = [d for d in det_list if getattr(d, "confidence", 0.0) >= 0.40]
                if not valid_dets and len(det_list) > 0:
                    valid_dets = [det_list[0]]
                valid_dets.sort(key=lambda d: getattr(d, "confidence", 0.0), reverse=True)
                valid_dets = valid_dets[:3]

                for i, d in enumerate(valid_dets):
                    t_id = f"target_{i}"
                    err_pi, err_ti = self.camera.pixel_to_angular_error(d.x, d.y)
                    is_prim_i = (d == primary_det)
                    err_mrad_i = float(np.hypot(err_pi, err_ti) * 1e3)
                    targets_telemetry.append({
                        "target_id": t_id,
                        "pos": (err_pi, err_ti),
                        "pixel_pos": (float(d.x), float(d.y)),
                        "in_fov": True,
                        "is_primary": is_prim_i,
                        "is_occluded": False,
                        "is_detected": bool(getattr(d, "confidence", 0.0) >= 0.40),
                        "error_mrad": err_mrad_i,
                        "confidence": float(getattr(d, "confidence", 0.0)),
                        "blink_frequency": 0.0,
                        "distance_km": 1.0,
                    })
            elif self.last_known_state is not None:
                tid = str(self.primary_target_id)
                pix = self.camera.world_to_pixel(self.last_known_state.x, self.last_known_state.y)
                targets_telemetry.append({
                    "target_id": tid,
                    "pos": (self.last_known_state.x, self.last_known_state.y),
                    "pixel_pos": pix,
                    "in_fov": True,
                    "is_primary": True,
                    "is_occluded": True,
                    "is_detected": False,
                    "error_mrad": float(np.hypot(self.last_known_state.x, self.last_known_state.y) * 1e3),
                    "confidence": 0.0,
                    "blink_frequency": 0.0,
                    "distance_km": 1.0,
                })
        else:
            all_tgt_states = self.env.get_all_target_states()
            for ts in all_tgt_states:
                dx_t = ts.x - cam_state.pan
                dy_t = ts.y - cam_state.tilt
                in_fov_t = (abs(dx_t) <= cam_state.fov_x / 2.0) and (abs(dy_t) <= cam_state.fov_y / 2.0)
                is_occ_t = False
                if active_occ is not None:
                    is_occ_t = bool(np.hypot(ts.x - active_occ.x, ts.y - active_occ.y) <= active_occ.radius_rad)
                is_prim_t = (ts.target_id == self.primary_target_id)
                err_mrad_t = float(np.hypot(dx_t, dy_t) * 1e3)

                target_obj = next((t for t in self.targets if t.target_id == ts.target_id), None)
                bfreq = getattr(target_obj, "blink_frequency", 4.0) if target_obj else 4.0
                dist_km = getattr(target_obj, "distance_km", 5.0) if target_obj else 5.0

                targets_telemetry.append({
                    "target_id": ts.target_id,
                    "pos": (ts.x, ts.y),
                    "in_fov": in_fov_t,
                    "is_primary": is_prim_t,
                    "is_occluded": is_occ_t,
                    "is_detected": (in_fov_t and not is_occ_t),
                    "error_mrad": err_mrad_t,
                    "blink_frequency": bfreq,
                    "distance_km": dist_km,
                })

        # Count total valid detected targets in frame
        if det is not None:
            if isinstance(det, list):
                detected_count = len([d for d in det if getattr(d, "confidence", 0.0) >= 0.40])
            else:
                detected_count = 1 if is_valid_det else 0
        else:
            detected_count = 0

        # Check if primary target is inside camera FOV geometry
        if tgt_state is not None:
            dx_cam = tgt_state.x - cam_state.pan
            dy_cam = tgt_state.y - cam_state.tilt
            target_in_fov = (abs(dx_cam) <= cam_state.fov_x / 2.0) and (abs(dy_cam) <= cam_state.fov_y / 2.0)
            tgt_true_pos = (tgt_state.x, tgt_state.y)
        else:
            target_in_fov = is_valid_det
            tgt_true_pos = None

        # 3. State Estimation & Tracking
        if is_valid_det:
            self.consecutive_misses = 0
            err_p, err_t = self.camera.pixel_to_angular_error(primary_det.x, primary_det.y)
            wx, wy = cam_state.pan + err_p, cam_state.tilt + err_t
            est = self.hybrid_tracker.step(dt, (wx, wy), primary_det.confidence, cn2=self.cn2, frame_id=f)
            self.last_known_state = est

            if self.state == "SEARCHING":
                self.state = "REACQUIRED"
                self.reacq_ctrl.reset()
                pos_str = f" at ({tgt_state.x*1e3:.1f}, {tgt_state.y*1e3:.1f}) mrad" if tgt_state is not None else ""
                event_msg = f"Frame {f}: Target REACQUIRED{pos_str}"
        else:
            self.consecutive_misses += 1
            est = self.hybrid_tracker.step(dt, None, 0.0, cn2=self.cn2, frame_id=f)

            if self.state == "TRACKING" and self.consecutive_misses >= 8 and self.last_known_state is not None:
                self.state = "SEARCHING"
                self.computed_zone = self.zone_predictor.compute_zone(
                    self.last_known_state,
                    frame.timestamp,
                    (self.camera.state.fov_x, self.camera.state.fov_y),
                )
                cause, conf, rat = self.classifier.classify(
                    self.consecutive_misses,
                    self.last_known_state,
                    cam_state,
                    active_occluder=active_occ,
                    active_cn2=self.cn2,
                    target_true_pos=tgt_true_pos,
                )
                self.reacq_ctrl.start_reacquisition(self.computed_zone, cam_state)
                event_msg = f"Frame {f}: TRACK LOST ({cause}) -> Predictive Zone Search"

        # Check for tracker mode switches (KF <-> PF)
        cur_mode = est.tracker_mode if est is not None else "LOST"
        if cur_mode != self.prev_tracker_mode and cur_mode in ["KF", "PF"] and self.prev_tracker_mode in ["KF", "PF"]:
            event_msg = f"Frame {f}: Tracker switched {self.prev_tracker_mode} -> {cur_mode} (Sev={self.hybrid_tracker.last_severity:.2f})"
        self.prev_tracker_mode = cur_mode

        # 4. Control Command Computation
        if self.state in ["TRACKING", "REACQUIRED"] and est is not None:
            c_p, c_t = self.pid.compute_command(est, cam_state, dt)
        elif self.state == "SEARCHING":
            c_p, c_t = self.reacq_ctrl.step(dt, cam_state)
        else:
            c_p, c_t = 0.0, 0.0

        if not (np.isfinite(c_p) and np.isfinite(c_t)):
            c_p, c_t = 0.0, 0.0

        self.delayed_p, self.delayed_t = self.delay_queue.step(c_p, c_t)

        # 5. Tracking Error Calculation
        if self.frame_source == "video_file":
            if primary_det is not None:
                err_p_v, err_t_v = self.camera.pixel_to_angular_error(primary_det.x, primary_det.y)
                rad_err_rad = float(np.hypot(err_p_v, err_t_v))
                rad_err_mrad = float(rad_err_rad * 1e3)
                rad_err_px = float(np.hypot(primary_det.x - self.camera.state.resolution[0] / 2.0,
                                            primary_det.y - self.camera.state.resolution[1] / 2.0))
            else:
                rad_err_rad = None
                rad_err_mrad = None
                rad_err_px = None
            is_locked = (cur_mode in ["KF", "PF"]) and is_valid_det
        else:
            _, _, rad_err_rad = self.env.get_angular_tracking_error()
            rad_err_mrad = float(rad_err_rad * 1e3) if rad_err_rad is not None else None
            rad_err_px = float(rad_err_rad * (self.camera.state.resolution[0] / self.camera.state.fov_x)) if rad_err_rad is not None else None
            is_locked = (cur_mode in ["KF", "PF"]) and (rad_err_mrad is None or rad_err_mrad <= 2.0)

        # Lock retention and target loss tracking
        self.total_frames_processed += 1
        if is_locked:
            self.active_locked_frames += 1
        unlocked = self.total_frames_processed - self.active_locked_frames
        target_loss_percent = float((unlocked / max(1, self.total_frames_processed)) * 100.0)

        occ_info = None
        if active_occ:
            occ_info = (active_occ.x, active_occ.y, active_occ.radius_rad)

        telemetry = {
            "frame_id": f,
            "sim_time": f * dt,
            "target_pos": tgt_true_pos,
            "targets": targets_telemetry,
            "detected_targets_count": detected_count,
            "primary_target_id": self.primary_target_id,
            "camera_pan_tilt": (cam_state.pan, cam_state.tilt),
            "fov_bounds": cam_state.fov_bounds,
            "is_valid_det": is_valid_det,
            "target_in_fov": target_in_fov,
            "confidence": conf_val,
            "severity": float(getattr(self.hybrid_tracker, "last_severity", 0.0)),
            "tracker_mode": cur_mode,
            "supervisor_state": self.state,
            "tracking_error_mrad": rad_err_mrad,
            "tracking_error_px": rad_err_px,
            "target_loss_percent": target_loss_percent,
            "active_occluder": occ_info,
            "reacq_zone": self.computed_zone if self.state == "SEARCHING" else None,
            "event_message": event_msg,
            "frame_source": self.frame_source,
            "frame_image": frame.image if frame is not None else None,
            "actuator_command": (act_p, act_t),
        }

        self.frame_id += 1
        self.sim_time += dt
        return telemetry


class VisualSimulatorUI:
    """
    Tkinter visualization GUI for FSOC coarse PAT simulator.
    """

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("FSOC Coarse PAT Visual Simulator | SIH 2024 PS-26169 (ISRO / DOS)")
        self.root.geometry("1180x820")
        self.root.configure(bg="#0B0F17")
        self.root.minsize(1000, 720)

        # Application state
        self.is_running = False
        self.playback_speed = 1.0
        self.scenario_list = self.load_scenarios()
        self.current_session: Optional[SimulationSession] = None

        # Visual history queues (last 35 points)
        self.target_history: deque = deque(maxlen=35)
        self.target_histories: Dict[str, deque] = {}
        self.camera_history: deque = deque(maxlen=35)

        # Canvas projection parameters (radians -> canvas pixels)
        self.canvas_w = 740
        self.canvas_h = 560
        # World view center and angular span (radians)
        self.view_center_pan = 0.015
        self.view_center_tilt = -0.005
        self.view_span_pan = 0.065   # 65 mrad width
        self.view_span_tilt = 0.050  # 50 mrad height

        self._bg_photo: Optional[Any] = None
        self._last_targets_telemetry: List[Dict[str, Any]] = []

        self.setup_ui()
        self.select_scenario(0)

    def load_scenarios(self) -> List[Dict[str, Any]]:
        """Load demo scenarios from config file and auto-discover video benchmarks."""
        candidates = [
            get_resource_path("config/demo_scenarios.json"),
            get_resource_path("configs/demo_scenarios.json"),
            "config/demo_scenarios.json",
            "configs/demo_scenarios.json",
        ]
        scenarios: List[Dict[str, Any]] = []
        for path in candidates:
            if path and os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    scenarios = json.load(f)
                    break

        # Auto-discover video evaluation benchmarks from data/videos/
        sample_videos = [
            ("BENCHMARK_2_REAL_LASER", "data/videos/real_laser_pointer.mp4"),
            ("BENCHMARK_2_PARANAL_AO", "data/videos/real_paranal_ao_laser.mp4"),
            ("BENCHMARK_2_STRESS_ASTIGMATIC", "data/videos/stress_test_astigmatic.mp4"),
        ]
        for label, rel_path in sample_videos:
            vpath = get_resource_path(rel_path)
            if vpath and os.path.exists(vpath):
                n_frames = 60
                fps = 30.0
                try:
                    from sim.video_source import VideoFrameSource
                    vs = VideoFrameSource(vpath)
                    n_frames = vs.total_frames if vs.total_frames > 0 else 60
                    fps = vs.fps if vs.fps > 0 else 30.0
                    vs.close()
                except Exception:
                    pass
                scenarios.append({
                    "scenario_name": f"[VIDEO] {label}",
                    "category": "video_evaluation",
                    "frame_source": "video_file",
                    "video_path": vpath,
                    "num_frames": n_frames,
                    "dt": 1.0 / fps,
                    "target": {"initial_pos": [0.0, 0.0], "velocity": [0.0, 0.0]},
                    "disturbances": {},
                    "control": {
                        "kp": 0.35, "ki": 0.0, "kd": 0.15, "k_ff": 1.0,
                        "latency_frames": 1, "max_velocity": 0.5, "max_acceleration": 1.0
                    }
                })

        return scenarios

    def setup_ui(self) -> None:
        """Construct Tkinter layout: Header, Main Canvas, Side Telemetry, and Controls."""
        # 1. Header Banner
        header = tk.Frame(self.root, bg="#121824", height=50)
        header.pack(fill=tk.X, side=tk.TOP, padx=0, pady=0)

        lbl_title = tk.Label(
            header,
            text="FSOC COARSE PAT SIMULATOR — VISUAL TRACKING TELEMETRY HUD",
            font=("Segoe UI", 12, "bold"),
            fg="#00F0FF",
            bg="#121824",
        )
        lbl_title.pack(side=tk.LEFT, padx=16, pady=10)

        lbl_sub = tk.Label(
            header,
            text="ISRO / DOS PS-26169 | Closed-Loop Optical PAT Verification",
            font=("Segoe UI", 9),
            fg="#8A99AD",
            bg="#121824",
        )
        lbl_sub.pack(side=tk.RIGHT, padx=16, pady=10)

        # 2. Main Content Container (Canvas + Sidebar)
        main_body = tk.Frame(self.root, bg="#0B0F17")
        main_body.pack(fill=tk.BOTH, expand=True, padx=12, pady=8)

        # Left Column: Canvas + Reticle Legends
        canvas_box = tk.Frame(main_body, bg="#101622", relief=tk.RIDGE, bd=1)
        canvas_box.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))

        self.canvas = tk.Canvas(
            canvas_box,
            width=self.canvas_w,
            height=self.canvas_h,
            bg="#080C14",
            highlightthickness=0,
        )
        self.canvas.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
        self.canvas.bind("<Configure>", self.on_canvas_resize)
        self.canvas.bind("<Button-1>", self.on_canvas_clicked)

        # Canvas Legend bar
        legend_bar = tk.Frame(canvas_box, bg="#101622")
        legend_bar.pack(fill=tk.X, side=tk.BOTTOM, padx=8, pady=4)
        legends = [
            ("■ Camera FOV", "#00C8FF"),
            ("● Primary Target", "#00FF88"),
            ("◈ Secondary Target", "#D980FA"),
            ("● Target (Occluded)", "#667788"),
            ("✚ Camera Boresight", "#00F0FF"),
            ("◌ Occluder", "#556677"),
            ("⬡ Reacq Zone", "#FFAA00"),
        ]
        for txt, col in legends:
            lbl = tk.Label(legend_bar, text=txt, font=("Segoe UI", 8, "bold"), fg=col, bg="#101622")
            lbl.pack(side=tk.LEFT, padx=8)

        # Right Column: Live Telemetry Sidebar
        sidebar = tk.Frame(main_body, bg="#121824", width=380, relief=tk.RIDGE, bd=1)
        sidebar.pack(side=tk.RIGHT, fill=tk.BOTH, expand=False, padx=(0, 0))
        sidebar.pack_propagate(False)

        self.setup_sidebar(sidebar)

        # 3. Bottom Controls Panel
        ctrl_bar = tk.Frame(self.root, bg="#121824", height=68, relief=tk.RIDGE, bd=1)
        ctrl_bar.pack(fill=tk.X, side=tk.BOTTOM, padx=12, pady=(0, 10))

        self.setup_controls(ctrl_bar)

    def setup_sidebar(self, parent: tk.Frame) -> None:
        """Construct telemetry cards and event log in sidebar."""
        pad_x, pad_y = 12, 6

        # Section Header
        lbl_head = tk.Label(parent, text="FLIGHT TELEMETRY HUD", font=("Segoe UI", 10, "bold"), fg="#00E5FF", bg="#121824")
        lbl_head.pack(anchor=tk.W, padx=pad_x, pady=(10, 4))

        # Status Cards Grid
        cards_frame = tk.Frame(parent, bg="#121824")
        cards_frame.pack(fill=tk.X, padx=pad_x, pady=4)

        # Card 1: Tracker Mode
        c1 = tk.Frame(cards_frame, bg="#182232", relief=tk.GROOVE, bd=1)
        c1.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 4), pady=2)
        tk.Label(c1, text="TRACKER MODE", font=("Segoe UI", 7, "bold"), fg="#7A8CA3", bg="#182232").pack(pady=(4, 0))
        self.lbl_tracker_mode = tk.Label(c1, text="KF (ACTIVE)", font=("Segoe UI", 12, "bold"), fg="#00FF88", bg="#182232")
        self.lbl_tracker_mode.pack(pady=(2, 6))

        # Card 2: Supervisor State
        c2 = tk.Frame(cards_frame, bg="#182232", relief=tk.GROOVE, bd=1)
        c2.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(4, 0), pady=2)
        tk.Label(c2, text="SUPERVISOR STATE", font=("Segoe UI", 7, "bold"), fg="#7A8CA3", bg="#182232").pack(pady=(4, 0))
        self.lbl_supervisor_state = tk.Label(c2, text="TRACKING", font=("Segoe UI", 12, "bold"), fg="#00FF88", bg="#182232")
        self.lbl_supervisor_state.pack(pady=(2, 6))

        # Numeric Indicators Frame
        info_frame = tk.Frame(parent, bg="#121824")
        info_frame.pack(fill=tk.X, padx=pad_x, pady=6)

        # Frame counter & time
        f_row = tk.Frame(info_frame, bg="#121824")
        f_row.pack(fill=tk.X, pady=2)
        tk.Label(f_row, text="Frame / Sim Time:", font=("Segoe UI", 9), fg="#A0B0C4", bg="#121824").pack(side=tk.LEFT)
        self.lbl_frame_time = tk.Label(f_row, text="0 / 100  (0.00 s)", font=("Segoe UI", 9, "bold"), fg="#FFFFFF", bg="#121824")
        self.lbl_frame_time.pack(side=tk.RIGHT)

        # Multi-target tracking status
        multi_row = tk.Frame(info_frame, bg="#121824")
        multi_row.pack(fill=tk.X, pady=2)
        tk.Label(multi_row, text="Target Tracking:", font=("Segoe UI", 9), fg="#A0B0C4", bg="#121824").pack(side=tk.LEFT)
        self.lbl_multi_status = tk.Label(multi_row, text="1 in view", font=("Segoe UI", 9, "bold"), fg="#00E5FF", bg="#121824")
        self.lbl_multi_status.pack(side=tk.RIGHT)

        # Tracking Error (mrad & px)
        err_row = tk.Frame(info_frame, bg="#121824")
        err_row.pack(fill=tk.X, pady=2)
        tk.Label(err_row, text="Tracking Error:", font=("Segoe UI", 9), fg="#A0B0C4", bg="#121824").pack(side=tk.LEFT)
        self.lbl_error = tk.Label(err_row, text="0.000 mrad | 0.0 px", font=("Segoe UI", 9, "bold"), fg="#00FF88", bg="#121824")
        self.lbl_error.pack(side=tk.RIGHT)

        # Target Loss % (PS Item 18)
        loss_row = tk.Frame(info_frame, bg="#121824")
        loss_row.pack(fill=tk.X, pady=2)
        tk.Label(loss_row, text="Target Loss %:", font=("Segoe UI", 9), fg="#A0B0C4", bg="#121824").pack(side=tk.LEFT)
        self.lbl_loss = tk.Label(loss_row, text="0.0%", font=("Segoe UI", 9, "bold"), fg="#00FF88", bg="#121824")
        self.lbl_loss.pack(side=tk.RIGHT)

        # Target Selection & Multi-Target Telemetry Panel
        self.tgt_panel = tk.Frame(parent, bg="#16202E", relief=tk.GROOVE, bd=1)
        self.tgt_panel.pack(fill=tk.X, padx=pad_x, pady=4)

        tgt_hdr = tk.Frame(self.tgt_panel, bg="#16202E")
        tgt_hdr.pack(fill=tk.X, padx=6, pady=(4, 2))
        tk.Label(tgt_hdr, text="TRACK TARGET", font=("Segoe UI", 7, "bold"), fg="#00E5FF", bg="#16202E").pack(side=tk.LEFT)

        self.cb_primary_target = ttk.Combobox(tgt_hdr, state="readonly", width=14, font=("Segoe UI", 8))
        self.cb_primary_target.pack(side=tk.RIGHT)
        self.cb_primary_target.bind("<<ComboboxSelected>>", self.on_primary_target_selected)

        # Target Telemetry Cards Frame
        self.frame_target_cards = tk.Frame(self.tgt_panel, bg="#16202E")
        self.frame_target_cards.pack(fill=tk.X, padx=4, pady=(0, 4))
        self.target_telemetry_widgets: Dict[str, Dict[str, tk.Label]] = {}

        # Gauges (Confidence & Severity)
        gauge_box = tk.Frame(parent, bg="#182232", relief=tk.GROOVE, bd=1)
        gauge_box.pack(fill=tk.X, padx=pad_x, pady=6)

        # Confidence Bar
        conf_hdr = tk.Frame(gauge_box, bg="#182232")
        conf_hdr.pack(fill=tk.X, padx=8, pady=(6, 2))
        tk.Label(conf_hdr, text="Detection Confidence", font=("Segoe UI", 8, "bold"), fg="#C5D3E3", bg="#182232").pack(side=tk.LEFT)
        self.lbl_conf_val = tk.Label(conf_hdr, text="1.000", font=("Segoe UI", 8, "bold"), fg="#00FF88", bg="#182232")
        self.lbl_conf_val.pack(side=tk.RIGHT)

        self.canv_conf_bar = tk.Canvas(gauge_box, height=10, bg="#0E141E", highlightthickness=0)
        self.canv_conf_bar.pack(fill=tk.X, padx=8, pady=(0, 6))

        # Severity Bar
        sev_hdr = tk.Frame(gauge_box, bg="#182232")
        sev_hdr.pack(fill=tk.X, padx=8, pady=(4, 2))
        tk.Label(sev_hdr, text="Disturbance Severity", font=("Segoe UI", 8, "bold"), fg="#C5D3E3", bg="#182232").pack(side=tk.LEFT)
        self.lbl_sev_val = tk.Label(sev_hdr, text="0.000", font=("Segoe UI", 8, "bold"), fg="#00F0FF", bg="#182232")
        self.lbl_sev_val.pack(side=tk.RIGHT)

        self.canv_sev_bar = tk.Canvas(gauge_box, height=10, bg="#0E141E", highlightthickness=0)
        self.canv_sev_bar.pack(fill=tk.X, padx=8, pady=(0, 8))

        # Active Disturbance Badges
        dist_box = tk.Frame(parent, bg="#121824")
        dist_box.pack(fill=tk.X, padx=pad_x, pady=4)
        tk.Label(dist_box, text="ACTIVE DISTURBANCES", font=("Segoe UI", 7, "bold"), fg="#7A8CA3", bg="#121824").pack(anchor=tk.W)

        self.lbl_dist_info = tk.Label(
            dist_box,
            text="Cn2=1e-15 | Vib=10Hz | Noise=std3",
            font=("Segoe UI", 8),
            fg="#6DE3B5",
            bg="#182232",
            padx=6,
            pady=4,
            relief=tk.FLAT,
        )
        self.lbl_dist_info.pack(fill=tk.X, pady=2)

        # Real-time Event Log
        tk.Label(parent, text="LIVE EVENT LOG", font=("Segoe UI", 8, "bold"), fg="#7A8CA3", bg="#121824").pack(anchor=tk.W, padx=pad_x, pady=(8, 2))

        self.txt_log = tk.Text(
            parent,
            height=7,
            bg="#080C14",
            fg="#78E6B8",
            font=("Consolas", 8),
            relief=tk.FLAT,
            bd=0,
            padx=6,
            pady=6,
        )
        self.txt_log.pack(fill=tk.BOTH, expand=True, padx=pad_x, pady=(0, 10))
        self.txt_log.insert(tk.END, "PAT Simulator initialized.\nReady for playback.\n")
        self.txt_log.config(state=tk.DISABLED)

    def setup_controls(self, parent: tk.Frame) -> None:
        """Construct playback control buttons, speed slider, and scenario dropdown."""
        # Left: Scenario dropdown
        scen_frame = tk.Frame(parent, bg="#121824")
        scen_frame.pack(side=tk.LEFT, padx=12, pady=10)

        tk.Label(scen_frame, text="Scenario:", font=("Segoe UI", 9, "bold"), fg="#A0B0C4", bg="#121824").pack(side=tk.LEFT, padx=(0, 6))
        names = [s.get("scenario_name", f"Scenario {i}") for i, s in enumerate(self.scenario_list)]
        self.cb_scenario = ttk.Combobox(scen_frame, values=names, state="readonly", width=34)
        if names:
            self.cb_scenario.current(0)
        self.cb_scenario.pack(side=tk.LEFT)
        self.cb_scenario.bind("<<ComboboxSelected>>", self.on_scenario_changed)

        # Center: Playback Buttons
        btn_frame = tk.Frame(parent, bg="#121824")
        btn_frame.pack(side=tk.LEFT, padx=16, pady=10)

        self.btn_play = tk.Button(
            btn_frame,
            text="▶ Play",
            font=("Segoe UI", 9, "bold"),
            bg="#00B894",
            fg="#FFFFFF",
            width=8,
            relief=tk.FLAT,
            command=self.toggle_play,
        )
        self.btn_play.pack(side=tk.LEFT, padx=4)

        self.btn_step = tk.Button(
            btn_frame,
            text="⏭ Step",
            font=("Segoe UI", 9, "bold"),
            bg="#2D3A4F",
            fg="#FFFFFF",
            width=8,
            relief=tk.FLAT,
            command=self.step_one_frame,
        )
        self.btn_step.pack(side=tk.LEFT, padx=4)

        self.btn_reset = tk.Button(
            btn_frame,
            text="↺ Reset",
            font=("Segoe UI", 9, "bold"),
            bg="#3F4D63",
            fg="#FFFFFF",
            width=8,
            relief=tk.FLAT,
            command=self.reset_session,
        )
        self.btn_reset.pack(side=tk.LEFT, padx=4)

        self.btn_load_video = tk.Button(
            btn_frame,
            text="📁 Load Video",
            font=("Segoe UI", 9, "bold"),
            bg="#4A3F6B",
            fg="#FFFFFF",
            width=11,
            relief=tk.FLAT,
            command=self.browse_video_file,
        )
        self.btn_load_video.pack(side=tk.LEFT, padx=4)

        # Right: Speed Slider
        speed_frame = tk.Frame(parent, bg="#121824")
        speed_frame.pack(side=tk.RIGHT, padx=16, pady=10)

        self.lbl_speed = tk.Label(speed_frame, text="Speed: 1.0x", font=("Segoe UI", 9, "bold"), fg="#A0B0C4", bg="#121824")
        self.lbl_speed.pack(side=tk.LEFT, padx=(0, 6))

        self.slider_speed = tk.Scale(
            speed_frame,
            from_=0.2,
            to=3.0,
            resolution=0.1,
            orient=tk.HORIZONTAL,
            length=130,
            bg="#121824",
            fg="#FFFFFF",
            highlightthickness=0,
            command=self.on_speed_changed,
        )
        self.slider_speed.set(1.0)
        self.slider_speed.pack(side=tk.LEFT)

    def on_scenario_changed(self, event=None) -> None:
        idx = self.cb_scenario.current()
        self.select_scenario(idx)

    def browse_video_file(self) -> None:
        """Open a file dialog to dynamically load an external video file into the simulator."""
        from tkinter import filedialog
        default_dir = get_resource_path("data/videos")
        path = filedialog.askopenfilename(
            initialdir=default_dir if os.path.exists(default_dir) else ".",
            title="Select Laser / Optical Video File",
            filetypes=[
                ("Video Files", "*.mp4 *.avi *.ogv *.webm *.mkv"),
                ("All Files", "*.*"),
            ],
        )
        if path:
            video_name = f"[VIDEO] {os.path.basename(path)}"
            n_frames = 300
            fps = 30.0
            try:
                from sim.video_source import VideoFrameSource
                vs = VideoFrameSource(path)
                n_frames = vs.total_frames if vs.total_frames > 0 else 300
                fps = vs.fps if vs.fps > 0 else 30.0
                vs.close()
            except Exception:
                pass

            video_cfg = {
                "scenario_name": video_name,
                "category": "video_evaluation",
                "frame_source": "video_file",
                "video_path": path,
                "num_frames": n_frames,
                "dt": 1.0 / fps,
                "target": {"initial_pos": [0.0, 0.0], "velocity": [0.0, 0.0]},
                "disturbances": {},
                "control": {
                    "kp": 0.35, "ki": 0.0, "kd": 0.15, "k_ff": 1.0,
                    "latency_frames": 1, "max_velocity": 0.5, "max_acceleration": 1.0
                }
            }
            self.scenario_list.append(video_cfg)
            names = [s.get("scenario_name", f"Scenario_{i}") for i, s in enumerate(self.scenario_list)]
            self.cb_scenario["values"] = names
            new_idx = len(self.scenario_list) - 1
            self.cb_scenario.current(new_idx)
            self.select_scenario(new_idx)
            self.log_event(f"Loaded video source: {os.path.basename(path)} ({n_frames} frames, {fps:.1f} FPS)")

    def select_scenario(self, idx: int) -> None:
        if 0 <= idx < len(self.scenario_list):
            cfg = self.scenario_list[idx]
            self.current_session = SimulationSession(cfg)
            self.target_history.clear()
            self.target_histories.clear()
            self.camera_history.clear()
            self.is_running = False
            self.btn_play.config(text="▶ Play", bg="#00B894")

            # Update disturbance badge
            if cfg.get("frame_source") == "video_file":
                vname = os.path.basename(cfg.get("video_path", "video"))
                txt = f"VIDEO EVALUATION | Source: {vname} | Optical PAT Benchmarking"
            else:
                dist = cfg.get("disturbances", {})
                cn2 = dist.get("cn2", 0.0)
                vib = dist.get("vibration_frequency", 0.0)
                noise = dist.get("noise_level", 0.0)
                occ_count = 1 if dist.get("occlusion") else len(dist.get("occlusions", []))
                txt = f"Cn2={cn2:.1e} | Vib={vib:.0f}Hz | Noise=std{noise:.0f} | Occluder={'YES' if occ_count>0 else 'NONE'}"
            self.lbl_dist_info.config(text=txt)

            # Update target selection combobox
            target_ids = [t.target_id for t in self.current_session.targets]
            self.cb_primary_target["values"] = target_ids
            if target_ids:
                self.cb_primary_target.set(self.current_session.primary_target_id)
            for w in self.frame_target_cards.winfo_children():
                w.destroy()
            self.target_telemetry_widgets.clear()

            self.log_event(f"Loaded scenario '{cfg.get('scenario_name')}' ({cfg.get('num_frames')} frames)")
            self.draw_canvas_placeholder()

    def on_speed_changed(self, val: str) -> None:
        self.playback_speed = float(val)
        self.lbl_speed.config(text=f"Speed: {self.playback_speed:.1f}x")

    def toggle_play(self) -> None:
        self.is_running = not self.is_running
        if self.is_running:
            self.btn_play.config(text="⏸ Pause", bg="#E17055")
            self.animation_loop()
        else:
            self.btn_play.config(text="▶ Play", bg="#00B894")

    def step_one_frame(self) -> None:
        if self.is_running:
            self.toggle_play()
        self.advance_frame()

    def reset_session(self) -> None:
        if self.current_session:
            self.current_session.reset()
            self.target_history.clear()
            self.target_histories.clear()
            self.camera_history.clear()
            if self.current_session:
                target_ids = [t.target_id for t in self.current_session.targets]
                self.cb_primary_target["values"] = target_ids
                if target_ids:
                    self.cb_primary_target.set(self.current_session.primary_target_id)
            for w in self.frame_target_cards.winfo_children():
                w.destroy()
            self.target_telemetry_widgets.clear()
            self.is_running = False
            self.btn_play.config(text="▶ Play", bg="#00B894")
            self.log_event("Simulation reset to frame 0")
            self.draw_canvas_placeholder()

    def advance_frame(self) -> None:
        if not self.current_session:
            return

        if self.current_session.frame_id >= self.current_session.num_frames:
            self.is_running = False
            self.btn_play.config(text="▶ Play", bg="#00B894")
            self.log_event("Scenario completed.")
            return

        telemetry = self.current_session.step()
        self._last_targets_telemetry = telemetry.get("targets", [])
        self.update_telemetry_ui(telemetry)
        self.render_canvas(telemetry)

    def switch_primary_target(self, target_id: str) -> None:
        """Switch active tracking target and update UI."""
        if not self.current_session:
            return
        old_id = self.current_session.primary_target_id
        if old_id == target_id:
            return
        if self.current_session.set_primary_target(target_id):
            self.cb_primary_target.set(target_id)
            self.log_event(f"Target Switch: {old_id} -> {target_id} (Tracking Re-targeted)")
            if not self.is_running and self.current_session.frame_id > 0:
                self.step_one_frame()

    def on_primary_target_selected(self, event=None) -> None:
        sel = self.cb_primary_target.get()
        if sel:
            self.switch_primary_target(sel)

    def on_canvas_clicked(self, event) -> None:
        """Click-to-track: click near any target marker on canvas to designate it as primary."""
        if not self.current_session:
            return

        if self.current_session.frame_source == "video_file":
            res = getattr(self.current_session.camera.state, "resolution", (640, 480))
            scale_x = self.canvas_w / float(res[0])
            scale_y = self.canvas_h / float(res[1])
            for t_info in self._last_targets_telemetry:
                if "pixel_pos" in t_info and t_info["pixel_pos"] is not None:
                    px, py = t_info["pixel_pos"]
                    sx = px * scale_x
                    sy = py * scale_y
                    if math.hypot(event.x - sx, event.y - sy) <= 30.0:
                        self.switch_primary_target(t_info["target_id"])
                        break
            return

        for t in self.current_session.targets:
            sx, sy = self.world_to_screen(t.x, t.y)
            dist = math.hypot(event.x - sx, event.y - sy)
            if dist <= 24.0:
                self.switch_primary_target(t.target_id)
                break

    def animation_loop(self) -> None:
        if not self.is_running:
            return

        self.advance_frame()

        # Target dt nominal is 33ms (30 FPS); scale by playback_speed
        base_ms = int(self.current_session.dt * 1000.0) if self.current_session else 33
        delay_ms = max(5, int(base_ms / max(0.1, self.playback_speed)))
        self.root.after(delay_ms, self.animation_loop)

    def log_event(self, msg: str) -> None:
        self.txt_log.config(state=tk.NORMAL)
        self.txt_log.insert(tk.END, f"{msg}\n")
        self.txt_log.see(tk.END)
        self.txt_log.config(state=tk.DISABLED)

    # -------------------------------------------------------------------------
    # Canvas Coordinate Projection & Rendering
    # -------------------------------------------------------------------------

    def on_canvas_resize(self, event) -> None:
        self.canvas_w = event.width
        self.canvas_h = event.height

    def world_to_screen(self, pan_rad: float, tilt_rad: float) -> Tuple[float, float]:
        """Map angular radian coordinates to canvas pixel coordinates."""
        cx = self.canvas_w / 2.0
        cy = self.canvas_h / 2.0
        scale_x = self.canvas_w / self.view_span_pan
        scale_y = self.canvas_h / self.view_span_tilt

        dx = pan_rad - self.view_center_pan
        dy = tilt_rad - self.view_center_tilt

        # Invert tilt so positive tilt is up
        sx = cx + dx * scale_x
        sy = cy - dy * scale_y
        return sx, sy

    def draw_canvas_placeholder(self) -> None:
        """Render initial background grid before simulation start."""
        self.canvas.delete("all")
        if self.current_session and self.current_session.frame_source == "video_file":
            cx, cy = self.canvas_w / 2.0, self.canvas_h / 2.0
            vname = os.path.basename(self.current_session.video_path) if self.current_session.video_path else "VIDEO"
            self.canvas.create_rectangle(0, 0, self.canvas_w, self.canvas_h, fill="#080C14")
            self.canvas.create_text(
                cx, cy - 20,
                text=f"OPTICAL VIDEO STREAM READY: {vname}",
                fill="#00E5FF",
                font=("Segoe UI", 12, "bold"),
                justify=tk.CENTER,
            )
            self.canvas.create_text(
                cx, cy + 15,
                text="Press ▶ Play or ⏭ Step to initiate real-time acquisition & tracking",
                fill="#7A8CA3",
                font=("Segoe UI", 9),
                justify=tk.CENTER,
            )
        else:
            self.draw_grid()

    def render_canvas(self, data: Dict[str, Any]) -> None:
        """Render complete visual frame on main canvas."""
        self.canvas.delete("all")
        frame_src = data.get("frame_source", getattr(self.current_session, "frame_source", "synthetic"))
        if frame_src == "video_file" and data.get("frame_image") is not None:
            self.render_video_canvas(data)
        else:
            self.render_world_canvas(data)

    def render_video_canvas(self, data: Dict[str, Any]) -> None:
        """Render optical video frame with real-time HUD overlays."""
        frame_img = data["frame_image"]
        targets_list = data.get("targets", [])
        mode = data.get("tracker_mode", "LOST")
        state = data.get("supervisor_state", "TRACKING")
        is_valid = data.get("is_valid_det", False)
        rad_err_mrad = data.get("tracking_error_mrad")
        rad_err_px = data.get("tracking_error_px")

        # 1. Resize and render decoded video frame
        h, w = frame_img.shape[:2]
        cw = max(10, self.canvas_w)
        ch = max(10, self.canvas_h)

        if frame_img.ndim == 2:
            pil_img = Image.fromarray(frame_img).convert("RGB")
        else:
            pil_img = Image.fromarray(cv2.cvtColor(frame_img, cv2.COLOR_BGR2RGB))

        if (w, h) != (cw, ch):
            pil_img = pil_img.resize((cw, ch), Image.Resampling.BILINEAR)

        self._bg_photo = ImageTk.PhotoImage(pil_img)
        self.canvas.create_image(0, 0, image=self._bg_photo, anchor=tk.NW)

        # Scale ratios from video resolution to canvas
        scale_x = cw / float(w)
        scale_y = ch / float(h)

        # 2. Camera Boresight (Optical Center)
        cx = cw / 2.0
        cy = ch / 2.0
        if mode in ["KF", "PF"]:
            ret_col = "#00F0FF"
            ret_status = f"LOCKED ({mode})"
        elif mode in ["COAST", "PF_COAST"]:
            ret_col = "#7D8C9E"
            ret_status = "COASTING"
        else:
            ret_col = "#FFAA00" if state == "SEARCHING" else "#505C6C"
            ret_status = "SEARCHING"

        cross_len = 22
        ring_r = 12
        self.canvas.create_oval(cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r, outline=ret_col, width=1.5)
        self.canvas.create_line(cx - cross_len, cy, cx - ring_r, cy, fill=ret_col, width=1.5)
        self.canvas.create_line(cx + ring_r, cy, cx + cross_len, cy, fill=ret_col, width=1.5)
        self.canvas.create_line(cx, cy - cross_len, cx, cy - ring_r, fill=ret_col, width=1.5)
        self.canvas.create_line(cx, cy + ring_r, cx, cy + cross_len, fill=ret_col, width=1.5)
        self.canvas.create_text(cx + 16, cy - 14, text=f"BORESIGHT: {ret_status}", fill=ret_col, font=("Segoe UI", 7, "bold"), anchor=tk.W)

        # 3. Update trajectory history
        for t_info in targets_list:
            tid = t_info["target_id"]
            if "pixel_pos" in t_info and t_info["pixel_pos"] is not None:
                px, py = t_info["pixel_pos"]
                tsx = px * scale_x
                tsy = py * scale_y
                if tid not in self.target_histories:
                    self.target_histories[tid] = deque(maxlen=35)
                self.target_histories[tid].append((tsx, tsy))
                if t_info.get("is_primary"):
                    self.target_history.append((tsx, tsy))

        # 4. Draw breadcrumb trails
        for t_info in targets_list:
            tid = t_info["target_id"]
            pts = list(self.target_histories.get(tid, []))
            if len(pts) >= 2:
                is_prim = t_info.get("is_primary", False)
                for i in range(len(pts) - 1):
                    col = "#00FF88" if is_prim else "#D980FA"
                    self.canvas.create_line(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], fill=col, width=1, dash=(2, 2))

        # 5. Draw Target Markers
        for t_info in targets_list:
            tid = t_info["target_id"]
            if "pixel_pos" not in t_info or t_info["pixel_pos"] is None:
                continue
            px, py = t_info["pixel_pos"]
            tsx = px * scale_x
            tsy = py * scale_y
            is_prim = t_info.get("is_primary", False)
            t_detected = t_info.get("is_detected", False)
            conf = t_info.get("confidence", 0.0)
            err_m = t_info.get("error_mrad", 0.0)

            if is_prim:
                if t_detected:
                    box_r = 16
                    self.canvas.create_rectangle(tsx - box_r, tsy - box_r, tsx + box_r, tsy + box_r, outline="#00FF88", width=2)
                    self.canvas.create_oval(tsx - 4, tsy - 4, tsx + 4, tsy + 4, fill="#00FF88", outline="#FFFFFF", width=1)
                    label_txt = f"PRIMARY [{tid}] (LOCKED) ({conf*100:.0f}%)"
                    self.canvas.create_text(tsx + box_r + 6, tsy - 6, text=label_txt, fill="#00FF88", font=("Segoe UI", 8, "bold"), anchor=tk.W)

                    # Vector error line from boresight center to target
                    self.canvas.create_line(cx, cy, tsx, tsy, fill="#FFAA00", width=1.5, dash=(3, 3))
                    mx, my = (cx + tsx) / 2.0, (cy + tsy) / 2.0
                    self.canvas.create_text(mx, my - 8, text=f"Δ {err_m:.1f} mrad", fill="#FFDD66", font=("Segoe UI", 7, "bold"))
                else:
                    # Coasting target
                    box_r = 14
                    self.canvas.create_rectangle(tsx - box_r, tsy - box_r, tsx + box_r, tsy + box_r, outline="#FFAA00", width=1.5, dash=(4, 2))
                    self.canvas.create_text(tsx + box_r + 6, tsy, text=f"PRIMARY [{tid}] (COASTING)", fill="#FFAA00", font=("Segoe UI", 8, "bold"), anchor=tk.W)
            else:
                # Secondary target
                dr = 12
                self.canvas.create_polygon(tsx, tsy - dr, tsx + dr, tsy, tsx, tsy + dr, tsx - dr, tsy, outline="#D980FA", fill="", width=1.5, dash=(2, 2))
                self.canvas.create_oval(tsx - 3, tsy - 3, tsx + 3, tsy + 3, fill="#D980FA", outline="#FFFFFF", width=1)
                self.canvas.create_text(tsx + 14, tsy, text=f"TARGET [{tid}] (SECONDARY)", fill="#D980FA", font=("Segoe UI", 7, "bold"), anchor=tk.W)

        # 6. Top-left OSD overlay badge
        vname = os.path.basename(self.current_session.video_path) if getattr(self.current_session, "video_path", None) else "STREAM"
        osd_text = f"● VIDEO EVALUATION: {vname} | RES: {w}x{h} | DT: {self.current_session.dt*1000:.1f}ms"
        self.canvas.create_rectangle(8, 8, 8 + len(osd_text)*6.8, 28, fill="#0A0E17", outline="#1F2C3F", width=1)
        self.canvas.create_text(14, 18, text=osd_text, fill="#6DE3B5", font=("Segoe UI", 8, "bold"), anchor=tk.W)

    def draw_grid(self) -> None:
        """Draw background coordinate grid with mrad tick marks."""
        w, h = self.canvas_w, self.canvas_h
        cx, cy = w / 2.0, h / 2.0

        # Subdued grid lines every 10 mrad
        grid_step_rad = 0.010  # 10 mrad
        scale_x = w / self.view_span_pan
        scale_y = h / self.view_span_tilt

        # Vertical gridlines
        p_min = self.view_center_pan - self.view_span_pan / 2.0
        p_max = self.view_center_pan + self.view_span_pan / 2.0
        start_p = math.floor(p_min / grid_step_rad) * grid_step_rad
        curr_p = start_p
        while curr_p <= p_max:
            sx, _ = self.world_to_screen(curr_p, 0.0)
            self.canvas.create_line(sx, 0, sx, h, fill="#121B2A", width=1, dash=(2, 4))
            self.canvas.create_text(sx + 2, h - 12, text=f"{curr_p*1e3:.0f}mrad", fill="#2C3D55", font=("Consolas", 7), anchor=tk.W)
            curr_p += grid_step_rad

        # Horizontal gridlines
        t_min = self.view_center_tilt - self.view_span_tilt / 2.0
        t_max = self.view_center_tilt + self.view_span_tilt / 2.0
        start_t = math.floor(t_min / grid_step_rad) * grid_step_rad
        curr_t = start_t
        while curr_t <= t_max:
            _, sy = self.world_to_screen(0.0, curr_t)
            self.canvas.create_line(0, sy, w, sy, fill="#121B2A", width=1, dash=(2, 4))
            self.canvas.create_text(8, sy - 6, text=f"{curr_t*1e3:.0f}mrad", fill="#2C3D55", font=("Consolas", 7), anchor=tk.W)
            curr_t += grid_step_rad

    def render_world_canvas(self, data: Dict[str, Any]) -> None:
        """Render complete synthetic scenario visual frame on world canvas."""
        self.draw_grid()

        tgt_pos = data.get("target_pos")
        targets_list = data.get("targets")
        cam_pan, cam_tilt = data["camera_pan_tilt"]
        p_min, p_max, t_min, t_max = data["fov_bounds"]
        is_valid = data["is_valid_det"]
        in_fov = data["target_in_fov"]
        mode = data["tracker_mode"]
        state = data["supervisor_state"]
        occ = data["active_occluder"]
        zone = data["reacq_zone"]

        # 1. Update Motion Trajectory History Trails
        cam_sx, cam_sy = self.world_to_screen(cam_pan, cam_tilt)
        self.camera_history.append((cam_sx, cam_sy))

        # Target trajectories
        if targets_list:
            for t_info in targets_list:
                tid = t_info["target_id"]
                tpan, ttilt = t_info["pos"]
                tsx, tsy = self.world_to_screen(tpan, ttilt)
                if tid not in self.target_histories:
                    self.target_histories[tid] = deque(maxlen=35)
                self.target_histories[tid].append((tsx, tsy))
                if t_info.get("is_primary"):
                    self.target_history.append((tsx, tsy))
        elif tgt_pos is not None:
            tgt_pan, tgt_tilt = tgt_pos
            tgt_sx, tgt_sy = self.world_to_screen(tgt_pan, tgt_tilt)
            self.target_history.append((tgt_sx, tgt_sy))

        # Draw Target Breadcrumb Trails
        if targets_list:
            for t_info in targets_list:
                tid = t_info["target_id"]
                pts = list(self.target_histories.get(tid, []))
                if len(pts) >= 2:
                    is_prim = t_info.get("is_primary", False)
                    for i in range(len(pts) - 1):
                        if is_prim:
                            col = "#155C3A" if i < len(pts) // 2 else "#00BA66"
                        else:
                            col = "#522C6D" if i < len(pts) // 2 else "#9980FA"
                        self.canvas.create_line(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], fill=col, width=1, dash=(2, 2))
        elif len(self.target_history) >= 2:
            pts = list(self.target_history)
            for i in range(len(pts) - 1):
                col = "#155C3A" if i < len(pts) // 2 else "#00BA66"
                self.canvas.create_line(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], fill=col, width=1, dash=(2, 2))

        # Draw Camera Boresight Trail (Solid Cyan)
        if len(self.camera_history) >= 2:
            pts = list(self.camera_history)
            for i in range(len(pts) - 1):
                col = "#0B4C63" if i < len(pts) // 2 else "#00C8FF"
                self.canvas.create_line(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], fill=col, width=2)

        # 2. Draw Dynamic Occluder (if active)
        if occ:
            ox, oy, orad = occ
            osx, osy = self.world_to_screen(ox, oy)
            scale_r = (self.canvas_w / self.view_span_pan) * orad
            self.canvas.create_oval(
                osx - scale_r,
                osy - scale_r,
                osx + scale_r,
                osy + scale_r,
                fill="#253245",
                outline="#4F637D",
                width=2,
                stipple="gray50",
            )
            self.canvas.create_text(osx, osy, text="OCCLUDER", fill="#8EA2BD", font=("Segoe UI", 7, "bold"))

        # 3. Draw Camera FOV Rectangle
        fov_x1, fov_y1 = self.world_to_screen(p_min, t_max)  # Top-left
        fov_x2, fov_y2 = self.world_to_screen(p_max, t_min)  # Bottom-right
        fov_col = "#00D4FF" if mode in ["KF", "PF"] else "#667788"
        self.canvas.create_rectangle(fov_x1, fov_y1, fov_x2, fov_y2, outline=fov_col, width=2, dash=(4, 3))
        self.canvas.create_text(fov_x1 + 6, fov_y1 + 10, text="CAM FOV (40x30 mrad)", fill=fov_col, font=("Segoe UI", 7), anchor=tk.W)

        # 4. Draw Predictive Re-acquisition Search Zone (when SEARCHING)
        if zone is not None:
            zx, zy = self.world_to_screen(zone.center_pan, zone.center_tilt)
            zr = (self.canvas_w / self.view_span_pan) * zone.search_radius
            self.canvas.create_oval(zx - zr, zy - zr, zx + zr, zy + zr, outline="#FFAA00", width=2, dash=(3, 2))
            self.canvas.create_text(zx, zy - zr - 8, text="TIER 1 PREDICTED ZONE", fill="#FFAA00", font=("Segoe UI", 7, "bold"))

        # 5. Draw Target Markers (loop over all targets)
        if targets_list:
            for t_info in targets_list:
                tid = t_info["target_id"]
                tpan, ttilt = t_info["pos"]
                tsx, tsy = self.world_to_screen(tpan, ttilt)
                is_prim = t_info.get("is_primary", False)
                t_in_fov = t_info.get("in_fov", False)
                t_occ = t_info.get("is_occluded", False)

                if is_prim:
                    # Primary Target
                    if is_valid and t_in_fov and not t_occ:
                        tgt_fill = "#00FF88"
                        tgt_outline = "#FFFFFF"
                        tgt_label = f"PRIMARY [{tid}] (LOCKED)"
                        r = 7
                    elif t_in_fov and not t_occ:
                        tgt_fill = "#FFAA00"
                        tgt_outline = "#FFDD66"
                        tgt_label = f"PRIMARY [{tid}] (LOW CONF)"
                        r = 6
                    else:
                        tgt_fill = "#505C6C"
                        tgt_outline = "#7D8C9E"
                        tgt_label = f"PRIMARY [{tid}] (OCCLUDED/LOST)"
                        r = 5

                    # Primary halo & circle
                    if is_valid and not t_occ:
                        self.canvas.create_oval(tsx - r - 4, tsy - r - 4, tsx + r + 4, tsy + r + 4, outline="#00FF88", width=1)
                    self.canvas.create_oval(tsx - r, tsy - r, tsx + r, tsy + r, fill=tgt_fill, outline=tgt_outline, width=2)
                    self.canvas.create_text(tsx + 14, tsy, text=tgt_label, fill=tgt_fill, font=("Segoe UI", 7, "bold"), anchor=tk.W)
                else:
                    # Secondary Target (detected but not primary)
                    if t_in_fov and not t_occ:
                        sec_fill = "#D980FA"
                        sec_outline = "#FFFFFF"
                        sec_label = f"TARGET [{tid}] (SECONDARY)"
                        r = 6
                        # Diamond outer marker for secondary target
                        dr = r + 4
                        self.canvas.create_polygon(
                            tsx, tsy - dr,
                            tsx + dr, tsy,
                            tsx, tsy + dr,
                            tsx - dr, tsy,
                            outline="#D980FA", fill="", width=1.5, dash=(2, 2)
                        )
                        self.canvas.create_oval(tsx - r, tsy - r, tsx + r, tsy + r, fill=sec_fill, outline=sec_outline, width=1.5)
                        self.canvas.create_text(tsx + 14, tsy, text=sec_label, fill=sec_fill, font=("Segoe UI", 7, "bold"), anchor=tk.W)
                    else:
                        sec_fill = "#4A5568"
                        sec_outline = "#718096"
                        sec_label = f"TARGET [{tid}] (SECONDARY/OCCLUDED)"
                        r = 5
                        self.canvas.create_oval(tsx - r, tsy - r, tsx + r, tsy + r, fill=sec_fill, outline=sec_outline, width=1)
                        self.canvas.create_text(tsx + 12, tsy, text=sec_label, fill=sec_fill, font=("Segoe UI", 7), anchor=tk.W)
        elif tgt_pos is not None:
            # Fallback for single-target dictionary without "targets"
            if is_valid and in_fov:
                tgt_fill = "#00FF88"
                tgt_outline = "#FFFFFF"
                tgt_label = "PRIMARY (LOCKED)"
                r = 7
            elif in_fov and not occ:
                tgt_fill = "#FFAA00"
                tgt_outline = "#FFDD66"
                tgt_label = "PRIMARY (LOW CONF)"
                r = 6
            else:
                tgt_fill = "#505C6C"
                tgt_outline = "#7D8C9E"
                tgt_label = "PRIMARY (OCCLUDED/LOST)"
                r = 5

            tgt_pan, tgt_tilt = tgt_pos
            tgt_sx, tgt_sy = self.world_to_screen(tgt_pan, tgt_tilt)
            if is_valid:
                self.canvas.create_oval(tgt_sx - r - 4, tgt_sy - r - 4, tgt_sx + r + 4, tgt_sy + r + 4, outline="#00FF88", width=1)
            self.canvas.create_oval(tgt_sx - r, tgt_sy - r, tgt_sx + r, tgt_sy + r, fill=tgt_fill, outline=tgt_outline, width=1.5)
            self.canvas.create_text(tgt_sx + 12, tgt_sy, text=tgt_label, fill=tgt_fill, font=("Segoe UI", 7, "bold"), anchor=tk.W)

        # 6. Draw Camera Boresight Reticle
        # CRITICAL: Visibly dim/gray out reticle when coasting blind!
        if mode in ["KF", "PF"]:
            ret_col = "#00F0FF"
            ret_width = 2
            ret_status = f"LOCKED ({mode})"
        elif mode in ["COAST", "PF_COAST"]:
            ret_col = "#5A6878"  # Visibly grayed out
            ret_width = 1.5
            ret_status = "COASTING (BLIND)"
        else:
            ret_col = "#FFAA00" if state == "SEARCHING" else "#4A5568"
            ret_width = 1.5
            ret_status = "SEARCHING"

        # Reticle Crosshairs
        cross_len = 16
        ring_r = 9
        self.canvas.create_oval(cam_sx - ring_r, cam_sy - ring_r, cam_sx + ring_r, cam_sy + ring_r, outline=ret_col, width=ret_width)
        self.canvas.create_line(cam_sx - cross_len, cam_sy, cam_sx - ring_r, cam_sy, fill=ret_col, width=ret_width)
        self.canvas.create_line(cam_sx + ring_r, cam_sy, cam_sx + cross_len, cam_sy, fill=ret_col, width=ret_width)
        self.canvas.create_line(cam_sx, cam_sy - cross_len, cam_sx, cam_sy - ring_r, fill=ret_col, width=ret_width)
        self.canvas.create_line(cam_sx, cam_sy + ring_r, cam_sx, cam_sy + cross_len, fill=ret_col, width=ret_width)
        self.canvas.create_text(cam_sx + 14, cam_sy - 12, text=f"BORESIGHT: {ret_status}", fill=ret_col, font=("Segoe UI", 7, "bold"), anchor=tk.W)

    def update_telemetry_ui(self, data: Dict[str, Any]) -> None:
        """Update sidebar badges, meters, and event log."""
        f_id = data["frame_id"]
        total_f = self.current_session.num_frames if self.current_session else 100
        sim_t = data["sim_time"]
        mode = data["tracker_mode"]
        state = data["supervisor_state"]
        conf = data["confidence"]
        sev = data["severity"]
        err_mrad = data["tracking_error_mrad"]
        event_msg = data.get("event_message")

        # 1. Update Tracker Mode Badge
        if mode == "KF":
            self.lbl_tracker_mode.config(text="KF (KALMAN)", fg="#00FF88")
        elif mode == "PF":
            self.lbl_tracker_mode.config(text="PF (PARTICLE)", fg="#00D4FF")
        elif "COAST" in mode:
            self.lbl_tracker_mode.config(text="COAST (BLIND)", fg="#FFAA00")
        else:
            self.lbl_tracker_mode.config(text="LOST", fg="#FF4757")

        # 2. Update Supervisor State Badge
        if state == "TRACKING":
            self.lbl_supervisor_state.config(text="TRACKING", fg="#00FF88")
        elif state == "SEARCHING":
            self.lbl_supervisor_state.config(text="SEARCHING", fg="#FFAA00")
        elif state == "REACQUIRED":
            self.lbl_supervisor_state.config(text="REACQUIRED", fg="#A29BFE")

        # 3. Numeric counters
        self.lbl_frame_time.config(text=f"{f_id} / {total_f}  ({sim_t:.2f} s)")

        # Multi-Target status
        targets_list = data.get("targets", [])
        prim_id = data.get("primary_target_id", "primary")
        det_cnt = data.get("detected_targets_count", len([t for t in targets_list if t.get("is_detected")]))
        if len(targets_list) > 1:
            self.lbl_multi_status.config(text=f"{det_cnt} in view | Track: {prim_id}", fg="#00E5FF")
        elif targets_list:
            self.lbl_multi_status.config(text=f"{det_cnt} in view | Track: {prim_id}", fg="#00E5FF")
        else:
            self.lbl_multi_status.config(text=f"Track: {prim_id}", fg="#00E5FF")

        if self.cb_primary_target.get() != prim_id:
            self.cb_primary_target.set(prim_id)

        # Clean up target telemetry widgets no longer present in targets_list
        active_tids = {t["target_id"] for t in targets_list}
        stale_tids = [tid for tid in list(self.target_telemetry_widgets.keys()) if tid not in active_tids]
        for tid in stale_tids:
            self.target_telemetry_widgets[tid]["card"].destroy()
            del self.target_telemetry_widgets[tid]

        # Update Per-Target Telemetry Cards in Sidebar
        for t_info in targets_list:
            tid = t_info["target_id"]
            is_prim = t_info.get("is_primary", False)
            err_mrad_t = t_info.get("error_mrad", 0.0)
            bfreq = t_info.get("blink_frequency", 4.0)
            dist_km = t_info.get("distance_km", 5.0)
            in_f = t_info.get("in_fov", False)
            is_occ = t_info.get("is_occluded", False)

            if tid not in self.target_telemetry_widgets:
                card = tk.Frame(self.frame_target_cards, bg="#101824", relief=tk.FLAT, bd=1)
                card.pack(fill=tk.X, pady=1)

                r1 = tk.Frame(card, bg="#101824")
                r1.pack(fill=tk.X, padx=4, pady=(1, 0))
                lbl_name = tk.Label(r1, font=("Segoe UI", 8, "bold"), bg="#101824")
                lbl_name.pack(side=tk.LEFT)
                lbl_role = tk.Label(r1, font=("Segoe UI", 7, "bold"), bg="#101824")
                lbl_role.pack(side=tk.RIGHT)

                r2 = tk.Frame(card, bg="#101824")
                r2.pack(fill=tk.X, padx=4, pady=(0, 1))
                lbl_metrics = tk.Label(r2, font=("Segoe UI", 7), fg="#8A99AD", bg="#101824")
                lbl_metrics.pack(side=tk.LEFT)
                lbl_err = tk.Label(r2, font=("Segoe UI", 7, "bold"), bg="#101824")
                lbl_err.pack(side=tk.RIGHT)

                self.target_telemetry_widgets[tid] = {
                    "card": card,
                    "name": lbl_name,
                    "role": lbl_role,
                    "metrics": lbl_metrics,
                    "err": lbl_err,
                }

            w = self.target_telemetry_widgets[tid]
            role_col = "#00FF88" if is_prim else "#D980FA"
            w["name"].config(text=f"● {tid}", fg=role_col)
            role_text = "PRIMARY (TRACKED)" if is_prim else "SECONDARY"
            w["role"].config(text=role_text, fg=role_col)

            fov_txt = "FOV" if in_f else "OUT"
            occ_txt = "OCC" if is_occ else "VIS"
            w["metrics"].config(
                text=f"{bfreq:.1f} Hz | {dist_km:.1f} km | {fov_txt} | {occ_txt}"
            )
            err_col = "#00FF88" if err_mrad_t < 2.0 else ("#FFAA00" if err_mrad_t < 6.0 else "#FF4757")
            w["err"].config(text=f"Err: {err_mrad_t:.2f} mrad", fg=err_col)

        err_px = data.get("tracking_error_px")
        loss_pct = data.get("target_loss_percent", 0.0)

        if err_mrad is not None:
            err_col = "#00FF88" if err_mrad < 2.0 else ("#FFAA00" if err_mrad < 6.0 else "#FF4757")
            if err_px is not None:
                self.lbl_error.config(text=f"{err_mrad:.3f} mrad | {err_px:.1f} px", fg=err_col)
            else:
                self.lbl_error.config(text=f"{err_mrad:.3f} mrad", fg=err_col)
        else:
            self.lbl_error.config(text="N/A (No GT)", fg="#A0AEC0")

        loss_col = "#00FF88" if loss_pct < 5.0 else ("#FFAA00" if loss_pct < 20.0 else "#FF4757")
        self.lbl_loss.config(text=f"{loss_pct:.1f}%", fg=loss_col)

        # 4. Confidence Meter
        self.lbl_conf_val.config(text=f"{conf:.3f}")
        self.canv_conf_bar.delete("all")
        bw = self.canv_conf_bar.winfo_width() or 200
        bar_fill_w = max(0, min(bw, int(bw * conf)))
        conf_bar_col = "#00FF88" if conf >= 0.50 else ("#FFAA00" if conf >= 0.40 else "#FF4757")
        self.canv_conf_bar.create_rectangle(0, 0, bar_fill_w, 10, fill=conf_bar_col, width=0)

        # 5. Severity Meter
        self.lbl_sev_val.config(text=f"{sev:.3f}")
        self.canv_sev_bar.delete("all")
        sev_fill_w = max(0, min(bw, int(bw * sev)))
        sev_bar_col = "#00FF88" if sev < 0.35 else ("#FFAA00" if sev < 0.65 else "#FF4757")
        self.canv_sev_bar.create_rectangle(0, 0, sev_fill_w, 10, fill=sev_bar_col, width=0)

        # 6. Event log entry
        if event_msg:
            self.log_event(event_msg)


def run_cli_scenario(
    scenario_selector: str = "0",
    output_dir: str = "logs",
    num_frames_override: Optional[int] = None,
) -> int:
    """
    Run a simulation scenario headlessly from the command line,
    step through all frames, and write performance report and telemetry logs.
    """
    import datetime
    from metrics.batch_runner import BatchScenarioRunner

    candidates = [
        get_resource_path("config/demo_scenarios.json"),
        get_resource_path("configs/demo_scenarios.json"),
        "config/demo_scenarios.json",
    ]
    scenarios: List[Dict[str, Any]] = []
    for c in candidates:
        if c and os.path.exists(c):
            with open(c, "r", encoding="utf-8") as f:
                scenarios = json.load(f)
            break

    if not scenarios:
        print("[ERROR] No demo scenarios found in config/demo_scenarios.json")
        return 1

    # Resolve target scenario by index or name
    selected_scenario: Optional[Dict[str, Any]] = None
    if scenario_selector.isdigit():
        idx = int(scenario_selector)
        if 0 <= idx < len(scenarios):
            selected_scenario = scenarios[idx]
    if selected_scenario is None:
        for s in scenarios:
            if s.get("scenario_name", "").lower() == scenario_selector.lower():
                selected_scenario = s
                break

    if selected_scenario is None:
        print(f"[ERROR] Could not find scenario matching '{scenario_selector}'. Available:")
        for i, s in enumerate(scenarios):
            print(f"  [{i}] {s.get('scenario_name')}")
        return 1

    scenario_cfg = dict(selected_scenario)
    if num_frames_override is not None and num_frames_override > 0:
        scenario_cfg["num_frames"] = num_frames_override

    scen_name = scenario_cfg.get("scenario_name", "UNNAMED")
    total_frames = int(scenario_cfg.get("num_frames", 100))
    print(f"[FSOC PAT SIMULATOR] Running standalone CLI scenario: {scen_name} ({total_frames} frames)...")

    runner = BatchScenarioRunner()
    os.makedirs(output_dir, exist_ok=True)

    t0 = time.perf_counter()
    record = runner.run_scenario(scenario_cfg, use_hybrid_tracker=True)
    elapsed = time.perf_counter() - t0

    # Save performance report JSON
    report_data = {
        "scenario_name": scen_name,
        "timestamp": datetime.datetime.now().isoformat(),
        "total_frames": record.total_frames,
        "elapsed_seconds": elapsed,
        "fps": record.fps,
        "metrics": record.to_dict(),
    }
    report_file = os.path.join(output_dir, "performance_report.json")
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    # Save detailed CSV if logger was used
    if runner.last_logger is not None:
        csv_path = os.path.join(output_dir, f"{scen_name}_telemetry.csv")
        runner.last_logger.export_csv(csv_path)
        print(f"  [LOG] Per-frame telemetry saved to: {csv_path}")

    print(f"  [LOG] Performance report saved to: {report_file}")
    print("\n" + "=" * 65)
    print(f"  SCENARIO EXECUTION COMPLETE: {scen_name}")
    print("=" * 65)
    avg_err_mrad = record.avg_tracking_error if isinstance(record.avg_tracking_error, (int, float)) else 0.0
    max_err_mrad = record.max_tracking_error if isinstance(record.max_tracking_error, (int, float)) else 0.0
    avg_err_px = record.tracking_error_px if isinstance(record.tracking_error_px, (int, float)) else 0.0
    rmse = record.rmse_px if isinstance(record.rmse_px, (int, float)) else 0.0
    acq_t = record.acquisition_time_s if record.acquisition_time_s > 0 else record.acquisition_time

    print(f"  Frames Processed   : {record.total_frames}")
    print(f"  Elapsed Time       : {elapsed:.3f} s ({record.fps:.1f} FPS)")
    print(f"  Acquisition Time   : {acq_t:.3f} s")
    print(f"  Lock Retention Rate: {record.lock_retention_rate * 100.0:.1f}%")
    print(f"  Target Loss        : {record.target_loss_percent:.2f}% (drops: {record.track_loss_count})")
    print(f"  Avg Tracking Error : {avg_err_mrad:.3f} mrad ({avg_err_px:.1f} px)")
    print(f"  Max Tracking Error : {max_err_mrad:.3f} mrad")
    print(f"  RMSE Error         : {rmse:.2f} px")
    print(f"  Tracker Breakdown  : {record.active_tracker_breakdown}")
    print("=" * 65 + "\n")
    return 0


def main():
    import argparse
    parser = argparse.ArgumentParser(description="FSOC Coarse PAT Simulator (ISRO / DOS PS 26169)")
    parser.add_argument("--cli", action="store_true", help="Run in headless CLI mode without Tkinter GUI")
    parser.add_argument("--run-scenario", type=str, default=None, help="Scenario name or index to execute (e.g. DEMO_ACQUISITION_AND_TRACK or 0)")
    parser.add_argument("--frames", type=int, default=None, help="Override number of simulation frames")
    parser.add_argument("--output-dir", type=str, default="logs", help="Directory to save performance report and telemetry logs")
    parser.add_argument("--list-scenarios", action="store_true", help="List available scenario names and exit")

    args, unknown = parser.parse_known_args()

    if args.list_scenarios:
        candidates = [
            get_resource_path("config/demo_scenarios.json"),
            get_resource_path("configs/demo_scenarios.json"),
            "config/demo_scenarios.json",
        ]
        scenarios = []
        for c in candidates:
            if c and os.path.exists(c):
                with open(c, "r", encoding="utf-8") as f:
                    scenarios = json.load(f)
                break
        print("Available Demo Scenarios:")
        for i, s in enumerate(scenarios):
            print(f"  [{i}] {s.get('scenario_name')}: {s.get('description', '')}")
        return 0

    if args.cli or args.run_scenario is not None:
        target_scenario = args.run_scenario or "0"
        return run_cli_scenario(target_scenario, output_dir=args.output_dir, num_frames_override=args.frames)

    root = tk.Tk()
    app = VisualSimulatorUI(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    main()
