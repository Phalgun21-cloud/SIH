"""
FSOC Coarse PAT Simulator - Comprehensive FastAPI & WebSocket Telemetry Server
Smart India Hackathon 2024 | Problem Statement 26169 (ISRO / Department of Space)

Provides a comprehensive REST and WebSocket API exposing 100% of backend capabilities:
- Multi-target kinematics, trajectory profiles, blinking signatures
- Kalman Filter covariance & Particle Filter scatter clouds
- Kolmogorov turbulence (Fried parameter r0, scintillation) & multi-noise models
- Gimbal PID, feedforward, slew-rate limits, hardware latency queue
- Hierarchical reacquisition (Tier 1 predictive ellipse + Tier 2 Archimedean spiral)
- Auto-Exposure / AGC controller state and optical PSF optics
- Track loss root cause classifier (Occlusion, Turbulence, Fast Motion, Dropout)
- Stage-by-stage profiling & quantitative performance metrics
"""

from __future__ import annotations
import os
import sys
import json
import time
import math
import asyncio
import base64
from typing import Dict, Any, Optional, List, Tuple, Set, Union
from collections import deque
from pathlib import Path

import numpy as np
import cv2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ensure backend root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from contracts import (
    FrameData, TargetState, CameraState, MetricsRecord,
    normalize_scenario_targets, get_resource_path
)
from sim.target import Target
from sim.camera import Camera, AutoExposureController
from sim.environment import Environment
from sim.motion_profiles import create_motion_profile
from detect.detector import AdaptiveOpticalDetector, BlobCandidate
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


class FullSimulationSession:
    """
    Closed-loop PAT simulation session wrapper exposing 100% of all backend subsystems.
    """

    def __init__(self, scenario_cfg: Dict[str, Any]):
        self.cfg = scenario_cfg
        self.scenario_name = scenario_cfg.get("scenario_name", "CUSTOM_SCENARIO")
        self.category = scenario_cfg.get("category", "General")
        self.description = scenario_cfg.get("description", "")
        self.num_frames = int(scenario_cfg.get("num_frames", 100))
        self.dt = float(scenario_cfg.get("dt", 0.033))
        self.seed = int(scenario_cfg.get("seed", 42))

        # Optical video source benchmark support
        self.frame_source = scenario_cfg.get("frame_source", "synthetic")
        self.video_path = scenario_cfg.get("video_path", None)
        self.video_source = None
        if self.frame_source == "video_file" and self.video_path:
            from sim.video_source import VideoFrameSource
            try:
                self.video_source = VideoFrameSource(self.video_path)
                if self.video_source.total_frames > 0:
                    self.num_frames = self.video_source.total_frames
                if "dt" not in self.cfg and self.video_source.fps > 0:
                    self.dt = 1.0 / self.video_source.fps
            except Exception as e:
                print(f"Error loading VideoFrameSource for {self.video_path}: {e}")
                self.video_source = None

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
        self.noise_types = list(dist_cfg.get("noise_types", ["gaussian"]))
        self.poisson_scale = float(dist_cfg.get("poisson_scale", 1.0))
        self.salt_pepper_prob = float(dist_cfg.get("salt_pepper_prob", 0.0005 if "salt_pepper" in str(self.noise_types) else 0.0))
        self.random_walk_std = float(dist_cfg.get("random_walk_jitter", 0.00003))

        # Occluders
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

        self.manual_occluders: List[Tuple[int, int, DynamicOccluder]] = []

        ctrl_cfg = scenario_cfg.get("control", {})
        self.kp = float(ctrl_cfg.get("kp", 0.35))
        self.ki = float(ctrl_cfg.get("ki", 0.0))
        self.kd = float(ctrl_cfg.get("kd", 0.15))
        self.k_ff = float(ctrl_cfg.get("k_ff", 1.0))
        self.enable_feedforward = bool(ctrl_cfg.get("enable_feedforward", True))
        self.latency_frames = int(ctrl_cfg.get("latency_frames", 2))
        self.max_vel = float(ctrl_cfg.get("max_velocity", 0.5))
        self.max_acc = float(ctrl_cfg.get("max_acceleration", 1.0))

        reacq_cfg = scenario_cfg.get("reacquisition", {})
        self.enable_pred = bool(reacq_cfg.get("enable_predictive_search", True))
        self.tier1_budget = int(reacq_cfg.get("tier1_budget_frames", 25))
        self.scan_rate = float(reacq_cfg.get("scan_rate", 0.12))

        # Optical auto-exposure & detection
        self.enable_auto_exposure = True
        self.enable_signature_verification = False
        self.colormap_mode = "turbo"

        # Multi-target storage
        self.targets: List[Target] = []
        self.reset()

    def reset(self) -> None:
        """Reset simulation state to initial frame 0."""
        self.frame_id = 0
        self.sim_time = 0.0

        if self.video_source is not None:
            self.video_source.reset()

        # Physical simulator objects
        self.targets = [Target.from_config(t) for t in self.targets_cfg]
        self.target = next((t for t in self.targets if t.target_id == self.primary_target_id), self.targets[0])
        self.camera = Camera(
            pan=0.0,
            tilt=0.0,
            fov_x=0.040,
            fov_y=0.030,
            resolution=(640, 480),
            enable_auto_exposure=self.enable_auto_exposure,
        )

        turb = KolmogorovTurbulence(cn2=self.cn2, seed=self.seed) if self.cn2 > 0 else None
        vib = PlatformVibration(amplitude_rad=self.vib_amp, frequency_hz=self.vib_freq, random_walk_std=self.random_walk_std, seed=self.seed) if self.vib_amp > 0 else None
        has_noise = len(self.noise_types) > 0 or self.noise_std > 0
        noise = SensorNoise(
            gaussian_std=self.noise_std,
            salt_pepper_prob=self.salt_pepper_prob,
            poisson_scale=self.poisson_scale,
            noise_types=self.noise_types,
            seed=self.seed,
        ) if has_noise else None

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
            enable_signature_verification=self.enable_signature_verification,
            targets=self.targets,
            primary_target_id=self.primary_target_id,
        )
        self.hybrid_tracker = HybridTracker(min_valid_confidence=0.40)
        self.slew = SlewRateLimiter(max_velocity=self.max_vel, max_acceleration=self.max_acc)
        self.delay_queue = ControlDelayQueue(delay_frames=self.latency_frames)
        self.pid = PIDController(kp=self.kp, ki=self.ki, kd=self.kd, k_ff=self.k_ff, enable_feedforward=self.enable_feedforward)
        self.reacq_ctrl = HierarchicalReacquisitionController(
            fov_x=0.040,
            fov_y=0.030,
            tier1_budget_frames=self.tier1_budget,
            enable_predictive_search=self.enable_pred,
            scan_rate=self.scan_rate,
        )
        self.classifier = TrackLossClassifier(
            max_slew_velocity=self.max_vel,
            max_slew_acceleration=self.max_acc,
        )
        self.zone_predictor = ReacquisitionZonePredictor()
        self.severity_calc = SeverityCalculator()

        self.state = "TRACKING"
        self.last_known_state = None
        self.consecutive_misses = 0
        self.delayed_p = 0.0
        self.delayed_t = 0.0
        self.computed_zone = None
        self.prev_tracker_mode = "KF"
        self.total_frames_processed = 0
        self.active_locked_frames = 0
        self.manual_occluders.clear()
        self.history_records: List[Dict[str, Any]] = []

        # Diagnostics & Root Cause
        self.last_root_cause: Optional[Dict[str, Any]] = None
        self.acquisition_time: Optional[float] = None
        self.mode_counts = {"KF": 0, "PF": 0, "COAST": 0, "LOST": 0}
        self.all_tracking_errors: List[float] = []

    # Dynamic Setters for full parameter control
    def set_cn2(self, cn2: float) -> None:
        self.cn2 = max(0.0, float(cn2))
        if self.env:
            self.env.turbulence = KolmogorovTurbulence(cn2=self.cn2, seed=self.seed + self.frame_id) if self.cn2 > 0 else None

    def set_vibration(self, amp: float, freq: float) -> None:
        self.vib_amp = max(0.0, float(amp))
        self.vib_freq = max(0.1, float(freq))
        if self.env:
            self.env.vibration = PlatformVibration(amplitude_rad=self.vib_amp, frequency_hz=self.vib_freq, random_walk_std=self.random_walk_std, seed=self.seed + self.frame_id) if self.vib_amp > 0 else None

    def set_noise(self, std: Optional[float] = None, poisson_scale: Optional[float] = None, salt_pepper_prob: Optional[float] = None, noise_types: Optional[List[str]] = None) -> None:
        if std is not None:
            self.noise_std = max(0.0, float(std))
        if poisson_scale is not None:
            self.poisson_scale = max(0.1, float(poisson_scale))
        if salt_pepper_prob is not None:
            self.salt_pepper_prob = max(0.0, min(0.1, float(salt_pepper_prob)))
        if noise_types is not None:
            self.noise_types = list(noise_types)

        if self.env:
            has_noise = len(self.noise_types) > 0 or self.noise_std > 0
            self.env.sensor_noise = SensorNoise(
                gaussian_std=self.noise_std,
                salt_pepper_prob=self.salt_pepper_prob,
                poisson_scale=self.poisson_scale,
                noise_types=self.noise_types,
                seed=self.seed + self.frame_id,
            ) if has_noise else None

    def set_pid(self, kp: Optional[float] = None, ki: Optional[float] = None, kd: Optional[float] = None, k_ff: Optional[float] = None, enable_feedforward: Optional[bool] = None) -> None:
        if kp is not None: self.kp = float(kp); self.pid.kp = self.kp
        if ki is not None: self.ki = float(ki); self.pid.ki = self.ki
        if kd is not None: self.kd = float(kd); self.pid.kd = self.kd
        if k_ff is not None: self.k_ff = float(k_ff); self.pid.k_ff = self.k_ff
        if enable_feedforward is not None:
            self.enable_feedforward = bool(enable_feedforward)
            self.pid.enable_feedforward = self.enable_feedforward

    def set_slew_limits(self, max_vel: Optional[float] = None, max_acc: Optional[float] = None) -> None:
        if max_vel is not None:
            self.max_vel = max(0.01, float(max_vel))
            self.slew.max_velocity = self.max_vel
        if max_acc is not None:
            self.max_acc = max(0.01, float(max_acc))
            self.slew.max_acceleration = self.max_acc

    def set_latency(self, latency_frames: int) -> None:
        self.latency_frames = max(0, int(latency_frames))
        self.delay_queue = ControlDelayQueue(delay_frames=self.latency_frames)

    def set_reacquisition_params(self, enable_predictive: Optional[bool] = None, tier1_budget: Optional[int] = None, scan_rate: Optional[float] = None) -> None:
        if enable_predictive is not None:
            self.enable_pred = bool(enable_predictive)
            self.reacq_ctrl.enable_predictive_search = self.enable_pred
        if tier1_budget is not None:
            self.tier1_budget = max(1, int(tier1_budget))
            self.reacq_ctrl.tier1_budget = self.tier1_budget
        if scan_rate is not None:
            self.scan_rate = max(0.01, float(scan_rate))
            self.reacq_ctrl.scan_rate = self.scan_rate

    def set_primary_target(self, target_id: Union[str, int]) -> bool:
        if self.env and self.env.set_primary_target(target_id):
            self.primary_target_id = target_id
            self.target = self.env.target
            if self.detector:
                self.detector.primary_target_id = target_id
            return True
        return False

    def set_target_motion(self, motion_type: str, target_id: Optional[str] = None, **params) -> None:
        tgt = self.target
        if target_id:
            found = next((t for t in self.targets if str(t.target_id) == str(target_id)), None)
            if found: tgt = found
        if tgt:
            tgt.motion_type = motion_type
            tgt.motion_profile = create_motion_profile(
                motion_type=motion_type,
                initial_pos=(tgt.x, tgt.y),
                velocity=(tgt.vx, tgt.vy),
                **params
            )

    def set_auto_exposure(self, enabled: bool) -> None:
        self.enable_auto_exposure = bool(enabled)
        if self.camera:
            self.camera.enable_auto_exposure = self.enable_auto_exposure

    def set_signature_verification(self, enabled: bool) -> None:
        self.enable_signature_verification = bool(enabled)
        if self.detector:
            self.detector.enable_signature_verification = self.enable_signature_verification

    def inject_occluder(self, duration_frames: int = 18, radius_rad: float = 0.008, opacity: float = 1.0) -> None:
        cur_pos = (self.target.x, self.target.y) if hasattr(self.target, 'x') else self.init_pos
        occ = DynamicOccluder(
            initial_pos=cur_pos,
            velocity=(self.vel[0] * 0.4, self.vel[1] * 0.4),
            radius_rad=float(radius_rad),
            opacity=float(opacity),
        )
        start_f = self.frame_id
        end_f = self.frame_id + int(duration_frames)
        self.manual_occluders.append((start_f, end_f, occ))

    def step(self) -> Dict[str, Any]:
        """Advance simulation by one dt time step and return 100% of telemetry, image, and internals."""
        f = self.frame_id
        dt = self.dt
        t_start = time.perf_counter()

        # Dynamic occluders
        all_occluders = self.scheduled_occluders + self.manual_occluders
        active_occluders = [occ for (s, e, occ) in all_occluders if s <= f <= e]
        self.env.occluders = active_occluders
        active_occ = active_occluders[0] if active_occluders else None

        event_msg: Optional[str] = None
        event_type: Optional[str] = None

        # 1. Camera step & frame rendering
        t0 = time.perf_counter()
        act_p, act_t = self.slew.apply_limit(self.delayed_p, self.delayed_t, dt)
        if self.frame_source == "video_file":
            # In pre-recorded video, virtual gimbal stays aligned with recorded sensor frame
            frame, tgt_state, cam_state = self.env.step(dt, 0.0, 0.0)
        else:
            frame, tgt_state, cam_state = self.env.step(dt, act_p, act_t)
        t_render_disturb = (time.perf_counter() - t0) * 1000.0

        if frame is None or getattr(frame, "image", None) is None:
            return {"completed": True, "frame_id": self.frame_id}

        # 2. Optical Detection
        t0 = time.perf_counter()
        det, all_candidates = self.detector.detect(frame, camera_state=cam_state)
        
        primary_det = None
        det_list = []
        if det is not None:
            det_list = det if isinstance(det, list) else [det]
            if self.frame_source == "video_file":
                valid_dets = [d for d in det_list if getattr(d, "confidence", 0.0) >= 0.40]
                if not valid_dets and len(det_list) > 0:
                    valid_dets = [det_list[0]]
                valid_dets.sort(key=lambda d: getattr(d, "confidence", 0.0), reverse=True)

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
                    primary_det = best_cand if np.hypot(best_cand.x - u_exp, best_cand.y - v_exp) < 75.0 else det[0]
                else:
                    primary_det = det[0]
            else:
                primary_det = det[0] if isinstance(det, list) and len(det) > 0 else det

        is_valid_det = (primary_det is not None and getattr(primary_det, "confidence", 0.0) >= 0.40)
        conf_val = float(primary_det.confidence) if primary_det is not None else 0.0
        det = primary_det
        t_detect = (time.perf_counter() - t0) * 1000.0

        # Candidate blobs summary for multi-target HUD
        blob_candidates_summary = []
        for b in det_list[:8]:  # Top 8 detected blobs
            blob_candidates_summary.append({
                "x": round(float(b.x), 1),
                "y": round(float(b.y), 1),
                "peak": round(float(getattr(b, "peak_intensity", 220.0)), 1),
                "conf": round(float(getattr(b, "confidence", 0.0)), 2),
                "target_id": str(getattr(b, "target_id", "target_0")),
            })

        # Check if primary target is inside camera FOV geometry & gather target positions
        if self.frame_source == "video_file":
            if primary_det is not None:
                err_p_v, err_t_v = self.camera.pixel_to_angular_error(primary_det.x, primary_det.y)
                tgt_true_pos = (round(float(cam_state.pan + err_p_v), 5), round(float(cam_state.tilt + err_t_v), 5))
                target_in_fov = True
            else:
                tgt_true_pos = None
                target_in_fov = False

            all_targets_data = []
            if det_list:
                for i, d in enumerate(det_list[:4]):
                    err_pi, err_ti = self.camera.pixel_to_angular_error(d.x, d.y)
                    all_targets_data.append({
                        "target_id": f"target_{i}",
                        "is_primary": bool(d == primary_det),
                        "pos": (round(float(err_pi), 5), round(float(err_ti), 5)),
                        "vel": (0.0, 0.0),
                        "blink_frequency": 0.0,
                        "motion_type": "VIDEO_OPTICAL_SPOT",
                    })
        else:
            if tgt_state is not None:
                dx_cam = tgt_state.x - cam_state.pan
                dy_cam = tgt_state.y - cam_state.tilt
                target_in_fov = (abs(dx_cam) <= cam_state.fov_x / 2.0) and (abs(dy_cam) <= cam_state.fov_y / 2.0)
                tgt_true_pos = (float(tgt_state.x), float(tgt_state.y))
            else:
                target_in_fov = is_valid_det
                tgt_true_pos = None

            all_targets_data = []
            for t in self.targets:
                all_targets_data.append({
                    "target_id": str(t.target_id),
                    "is_primary": bool(t.target_id == self.primary_target_id),
                    "pos": (round(float(t.x), 5), round(float(t.y), 5)),
                    "vel": (round(float(t.vx), 5), round(float(t.vy), 5)),
                    "blink_frequency": round(float(t.blink_frequency), 1),
                    "motion_type": str(t.motion_type),
                })

        # 3. State Estimation & Tracking (KF/PF Hybrid)
        t0 = time.perf_counter()
        if is_valid_det:
            self.consecutive_misses = 0
            err_p, err_t = self.camera.pixel_to_angular_error(det.x, det.y)
            wx, wy = cam_state.pan + err_p, cam_state.tilt + err_t
            est = self.hybrid_tracker.step(dt, (wx, wy), det.confidence, cn2=self.cn2, frame_id=f)
            self.last_known_state = est

            if self.state == "SEARCHING":
                self.state = "REACQUIRED"
                self.reacq_ctrl.reset()
                pos_str = f" at ({tgt_state.x*1e3:.1f}, {tgt_state.y*1e3:.1f}) mrad" if tgt_state is not None else ""
                event_msg = f"Target REACQUIRED{pos_str}"
                event_type = "REACQ"
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
                cause, conf_cause, rat = self.classifier.classify(
                    self.consecutive_misses,
                    self.last_known_state,
                    cam_state,
                    active_occluder=active_occ,
                    active_cn2=self.cn2,
                    target_true_pos=tgt_true_pos,
                )
                self.last_root_cause = {
                    "cause": cause,
                    "confidence": round(float(conf_cause), 2),
                    "rationale": rat,
                }
                self.reacq_ctrl.start_reacquisition(self.computed_zone, cam_state)
                event_msg = f"TRACK LOST ({cause}) -> Tier-1 Search Initiated"
                event_type = "LOSS"

        # Check for tracker mode switches (KF <-> PF)
        cur_mode = est.tracker_mode if est is not None else "LOST"
        if cur_mode != self.prev_tracker_mode and cur_mode in ["KF", "PF"] and self.prev_tracker_mode in ["KF", "PF"]:
            event_msg = f"Tracker mode switched {self.prev_tracker_mode} -> {cur_mode} (Sev={self.hybrid_tracker.last_severity:.2f})"
            event_type = "MODE_SWITCH"
        self.prev_tracker_mode = cur_mode
        self.mode_counts[cur_mode] = self.mode_counts.get(cur_mode, 0) + 1
        t_track = (time.perf_counter() - t0) * 1000.0

        # Extract Particle Filter scatter cloud (subsampled) or Kalman Covariance Ellipse
        particle_scatter = []
        kalman_cov = None
        if cur_mode == "PF" and hasattr(self.hybrid_tracker, "pf") and self.hybrid_tracker.pf.is_initialized:
            # Subsample 45 particles for visual rendering
            pts = self.hybrid_tracker.pf.particles[::6, :2]
            particle_scatter = [[round(float(p[0]), 5), round(float(p[1]), 5)] for p in pts]
        elif cur_mode in ["KF", "COAST"] and hasattr(self.hybrid_tracker, "kf") and self.hybrid_tracker.kf.is_initialized:
            P = self.hybrid_tracker.kf.P
            kalman_cov = {
                "sigma_x": round(float(np.sqrt(max(1e-10, P[0, 0]))), 5),
                "sigma_y": round(float(np.sqrt(max(1e-10, P[1, 1]))), 5),
            }

        # 4. Control Command Computation
        t0 = time.perf_counter()
        if self.state in ["TRACKING", "REACQUIRED"] and est is not None:
            c_p, c_t = self.pid.compute_command(est, cam_state, dt)
        elif self.state == "SEARCHING":
            c_p, c_t = self.reacq_ctrl.step(dt, cam_state)
        else:
            c_p, c_t = 0.0, 0.0

        if not (np.isfinite(c_p) and np.isfinite(c_t)):
            c_p, c_t = 0.0, 0.0

        self.delayed_p, self.delayed_t = self.delay_queue.step(c_p, c_t)
        t_control = (time.perf_counter() - t0) * 1000.0

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
        else:
            _, _, rad_err_rad = self.env.get_angular_tracking_error()
            rad_err_mrad = float(rad_err_rad * 1e3) if rad_err_rad is not None else None
            rad_err_px = float(rad_err_rad * (self.camera.state.resolution[0] / self.camera.state.fov_x)) if rad_err_rad is not None else None
        if rad_err_mrad is not None:
            self.all_tracking_errors.append(rad_err_mrad)

        # Lock retention and target acquisition timing
        is_locked = (cur_mode in ["KF", "PF"]) and (rad_err_mrad is None or rad_err_mrad <= 2.0)
        self.total_frames_processed += 1
        if is_locked:
            self.active_locked_frames += 1
            if self.acquisition_time is None:
                self.acquisition_time = round(f * dt, 3)

        lock_retention_pct = float((self.active_locked_frames / max(1, self.total_frames_processed)) * 100.0)

        # Cumulative Metrics
        avg_err = float(np.mean(self.all_tracking_errors)) if self.all_tracking_errors else 0.0
        max_err = float(np.max(self.all_tracking_errors)) if self.all_tracking_errors else 0.0
        rmse_err = float(np.sqrt(np.mean(np.square(self.all_tracking_errors)))) if self.all_tracking_errors else 0.0

        # Occluder info
        occ_info = None
        if active_occ:
            occ_info = {
                "x": float(active_occ.x),
                "y": float(active_occ.y),
                "radius_rad": float(active_occ.radius_rad),
                "opacity": float(active_occ.opacity),
            }

        # Predictive Reacquisition Zone
        zone_info = None
        if self.computed_zone and self.state == "SEARCHING":
            cp = getattr(self.computed_zone, "center_pan", 0.0)
            ct = getattr(self.computed_zone, "center_tilt", 0.0)
            sr = getattr(self.computed_zone, "search_radius", 0.015)
            zone_info = {
                "center": (float(cp), float(ct)),
                "semi_major": float(sr),
                "semi_minor": float(sr * 0.75),
                "orientation_rad": 0.0,
            }

        # Format camera sensor frame (rendered with selected colormap & annotations)
        frame_jpeg_b64 = self._render_camera_frame(frame.image, det, is_valid_det, det_list)

        # 6. Comprehensive Atmospheric Turbulence & Wave Propagation Calculations
        env_prof = getattr(self.env, "last_step_profile", {})
        t_turb_ms = float(env_prof.get("disturb_turbulence_ms", 0.0))
        t_rnd_ms = float(env_prof.get("rendering_ms", 0.0))
        t_noise_ms = float(env_prof.get("disturb_noise_ms", 0.0))
        t_occ_ms = float(env_prof.get("disturb_occlusion_ms", 0.0))
        t_vib_ms = float(env_prof.get("disturb_vibration_ms", 0.0))
        t_dist_total_ms = float(env_prof.get("disturbances_total_ms", 0.0))

        # Atmospheric wave propagation physics
        r0_val = 0.0
        rytov_val = 0.0
        scint_index = 0.0
        atten_val = 1.0
        fade_pct = 0.0
        blur_sigma = 0.0
        strehl_ratio = 1.0
        wander_mrad = 0.0
        s_turb = 0.0
        turb_regime = "CLEAR SKY"
        link_dist_m = 5000.0

        if self.env.turbulence and self.cn2 > 0:
            turb = self.env.turbulence
            link_dist_m = float(turb.link_distance)
            r0_m = turb.fried_parameter
            r0_val = r0_m * 1000.0  # mm
            k = 2.0 * np.pi / turb.wavelength
            L = turb.link_distance

            # Rytov variance for plane/spherical wave optical comms
            rytov_val = float(1.23 * self.cn2 * (k ** (7.0 / 6.0)) * (L ** (11.0 / 6.0)))
            # Aperture-averaged scintillation index approximation
            if rytov_val > 0:
                scint_index = float(np.clip(rytov_val / (1.0 + 1.2 * (rytov_val ** (6.0 / 5.0))), 0.0, 1.2))
            # Attenuation factor & percent fade
            atten_val = float(np.clip(1.0 - 0.45 * np.log10(max(1e-16, self.cn2) / 1e-16) / 3.5, 0.40, 1.0))
            fade_pct = round((1.0 - atten_val) * 100.0, 1)
            # PSF broadening blur sigma (pixels)
            blur_sigma = float(np.clip(0.035 / max(1e-5, r0_m), 0.2, 2.6))
            # Strehl ratio with ground telescope aperture D = 0.10 m (10 cm mirror)
            aperture_d = 0.10
            strehl_ratio = float(1.0 / (1.0 + (aperture_d / max(1e-4, r0_m)) ** (5.0 / 3.0)))
            # Beam wander angular standard deviation (mrad)
            wander_rad = float(np.sqrt(max(0.0, 2.91 * (aperture_d ** (-1.0 / 3.0)) * self.cn2 * L)))
            wander_mrad = wander_rad * 1e3
            # Turbulence severity score in [0.0, 1.0] (matching SeverityCalculator)
            s_turb = float(np.clip((np.log10(max(1e-18, self.cn2)) - (-16.0)) / ((-12.0) - (-16.0)), 0.0, 1.0))
            # Regime categorization
            if self.cn2 >= 1.0e-13:
                turb_regime = "SEVERE SCINTILLATION FADE"
            elif self.cn2 >= 1.0e-15:
                turb_regime = "MODERATE TURBULENCE"
            else:
                turb_regime = "WEAK / CLEAR SKY"

        # Total frame processing time
        t_total = (time.perf_counter() - t_start) * 1000.0

        telemetry = {
            "frame_id": f,
            "sim_time": round(f * dt, 4),
            "target_pos": tgt_true_pos,
            "all_targets": all_targets_data,
            "camera_pan_tilt": (float(cam_state.pan), float(cam_state.tilt)),
            "fov_bounds": [float(b) for b in cam_state.fov_bounds],
            "is_valid_det": bool(is_valid_det),
            "target_in_fov": bool(target_in_fov),
            "confidence": round(conf_val, 4),
            "severity": round(float(getattr(self.hybrid_tracker, "last_severity", 0.0)), 4),
            "tracker_mode": cur_mode,
            "supervisor_state": self.state,
            "reacquisition_tier": self.reacq_ctrl.current_tier,
            "tier1_counter": self.reacq_ctrl.tier1_frame_counter,
            "tracking_error_mrad": round(rad_err_mrad, 4) if rad_err_mrad is not None else None,
            "tracking_error_px": round(rad_err_px, 2) if rad_err_px is not None else None,
            "lock_retention_rate": round(lock_retention_pct, 1),
            "is_locked": bool(is_locked),
            "active_occluder": occ_info,
            "reacq_zone": zone_info,
            "event_message": event_msg,
            "event_type": event_type,
            "camera_frame": frame_jpeg_b64,
            "particle_cloud": particle_scatter,
            "kalman_cov": kalman_cov,
            "candidate_blobs": blob_candidates_summary,
            "root_cause_diagnosis": self.last_root_cause,
            "metrics": {
                "avg_error_mrad": round(avg_err, 3),
                "max_error_mrad": round(max_err, 3),
                "rmse_error_mrad": round(rmse_err, 3),
                "lock_retention_pct": round(lock_retention_pct, 1),
                "acquisition_time_s": self.acquisition_time,
                "mode_counts": self.mode_counts,
            },
            "profiling": {
                "rendering_ms": round(t_rnd_ms, 2),
                "disturb_turbulence_ms": round(t_turb_ms, 3),
                "disturb_noise_ms": round(t_noise_ms, 3),
                "disturb_occlusion_ms": round(t_occ_ms, 3),
                "disturb_vibration_ms": round(t_vib_ms, 3),
                "disturb_total_ms": round(t_dist_total_ms, 2),
                "render_disturb_ms": round(t_render_disturb, 2),
                "detect_ms": round(t_detect, 2),
                "track_ms": round(t_track, 2),
                "control_ms": round(t_control, 2),
                "total_frame_ms": round(t_total, 2),
                "instantaneous_fps": round(1000.0 / max(0.1, t_total), 1),
            },
            "turbulence": {
                "cn2": self.cn2,
                "fried_r0_mm": round(r0_val, 2),
                "rytov_variance": round(rytov_val, 4),
                "scintillation_index": round(scint_index, 4),
                "attenuation_factor": round(atten_val, 3),
                "fade_loss_pct": fade_pct,
                "blur_sigma_px": round(blur_sigma, 2),
                "strehl_ratio": round(strehl_ratio, 3),
                "beam_wander_mrad": round(wander_mrad, 3),
                "turbulence_severity": round(s_turb, 3),
                "regime": turb_regime,
                "link_distance_m": round(link_dist_m, 1),
                "calc_time_ms": round(t_turb_ms, 3),
            },
            "disturbances": {
                "cn2": self.cn2,
                "fried_r0_mm": round(r0_val, 1),
                "vibration_amp": self.vib_amp,
                "vibration_freq": self.vib_freq,
                "noise_std": self.noise_std,
                "noise_types": self.noise_types,
            },
            "hardware": {
                "latency_frames": self.latency_frames,
                "max_velocity": self.max_vel,
                "max_acceleration": self.max_acc,
                "camera_gain": round(float(getattr(self.camera.exposure_ctrl, "gain", 1.0)), 2) if self.camera and hasattr(self.camera, "exposure_ctrl") else 1.0,
                "auto_exposure_active": bool(self.camera.enable_auto_exposure) if self.camera else True,
            },
            "pid": {
                "kp": self.kp,
                "ki": self.ki,
                "kd": self.kd,
                "k_ff": self.k_ff,
                "feedforward_active": self.enable_feedforward,
            },
            "detected_spot": {
                "x": float(det.x) if det else None,
                "y": float(det.y) if det else None,
                "confidence": round(float(det.confidence), 4) if det else 0.0,
                "peak": round(float(getattr(det, "peak_intensity", 220.0)), 1) if det else 0.0,
            } if det else None,
        }

        self.history_records.append({
            "frame": f,
            "time": round(f * dt, 4),
            "error_mrad": rad_err_mrad if rad_err_mrad is not None else 0.0,
            "confidence": conf_val,
            "severity": float(getattr(self.hybrid_tracker, "last_severity", 0.0)),
            "mode": cur_mode,
            "locked": is_locked,
        })
        if len(self.history_records) > 200:
            self.history_records.pop(0)

        self.frame_id += 1
        self.sim_time += dt
        return telemetry

    def _render_camera_frame(self, raw_img: np.ndarray, det: Any, is_valid: bool, candidates: List[Any]) -> str:
        """Render raw sensor frame to false-color JPEG base64 with comprehensive overlays."""
        img_f = raw_img.astype(np.float32)
        p_min = float(np.min(img_f))
        p_max = float(np.max(img_f))
        if p_max > p_min:
            norm_img = ((img_f - p_min) / (p_max - p_min) * 255.0).astype(np.uint8)
        else:
            norm_img = np.clip(img_f, 0, 255).astype(np.uint8)

        if self.colormap_mode == "turbo":
            colored = cv2.applyColorMap(norm_img, cv2.COLORMAP_TURBO)
        elif self.colormap_mode == "inferno":
            colored = cv2.applyColorMap(norm_img, cv2.COLORMAP_INFERNO)
        elif self.colormap_mode == "viridis":
            colored = cv2.applyColorMap(norm_img, cv2.COLORMAP_VIRIDIS)
        elif self.colormap_mode == "green":
            g_channel = norm_img
            b_channel = (norm_img * 0.2).astype(np.uint8)
            r_channel = (norm_img * 0.1).astype(np.uint8)
            colored = cv2.merge([b_channel, g_channel, r_channel])
        else:
            colored = cv2.cvtColor(norm_img, cv2.COLOR_GRAY2BGR)

        h, w = colored.shape[:2]
        cx, cy = w // 2, h // 2

        # Boresight reticle (center crosshair in cyan)
        reticle_col = (255, 240, 0)  # BGR cyan
        cv2.line(colored, (cx - 16, cy), (cx + 16, cy), reticle_col, 1)
        cv2.line(colored, (cx, cy - 16), (cx, cy + 16), reticle_col, 1)
        cv2.circle(colored, (cx, cy), 9, reticle_col, 1)

        # Overlay all candidate spots (yellow circles)
        if isinstance(candidates, list) and len(candidates) > 1:
            for cand in candidates[1:4]:
                bx, by = int(round(cand.x)), int(round(cand.y))
                if 0 <= bx < w and 0 <= by < h:
                    cv2.circle(colored, (bx, by), 6, (0, 215, 255), 1)

        # Detected primary target marker
        if det is not None and is_valid:
            tx, ty = int(round(det.x)), int(round(det.y))
            if 0 <= tx < w and 0 <= ty < h:
                tgt_col = (100, 255, 50)  # Emerald green
                box_sz = 14
                cv2.rectangle(colored, (tx - box_sz, ty - box_sz), (tx + box_sz, ty + box_sz), tgt_col, 1)
                cv2.line(colored, (tx - 5, ty), (tx + 5, ty), tgt_col, 1)
                cv2.line(colored, (tx, ty - 5), (tx, ty + 5), tgt_col, 1)
                cv2.putText(colored, f"LOCK {det.confidence:.2f}", (tx + 16, ty + 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, tgt_col, 1, cv2.LINE_AA)

        # Scale to 480x360
        preview = cv2.resize(colored, (480, 360), interpolation=cv2.INTER_AREA)
        _, buffer = cv2.imencode(".jpg", preview, [cv2.IMWRITE_JPEG_QUALITY, 75])
        b64_str = base64.b64encode(buffer).decode("ascii")
        return f"data:image/jpeg;base64,{b64_str}"


class ComprehensiveSimulationManager:
    """Singleton simulation manager coordinating session, WebSocket broadcasting, and playback loop."""

    def __init__(self):
        self.scenarios: List[Dict[str, Any]] = self._load_all_scenarios()
        self.current_session: Optional[FullSimulationSession] = None
        self.active_websockets: Set[WebSocket] = set()
        self.is_running = False
        self.playback_speed = 1.0
        self._loop_task: Optional[asyncio.Task] = None

        if self.scenarios:
            self.load_scenario(0)

    def _load_all_scenarios(self) -> List[Dict[str, Any]]:
        scenarios: List[Dict[str, Any]] = []
        cfg_paths = [
            PROJECT_ROOT / "config" / "demo_scenarios.json",
        ]
        for p in cfg_paths:
            if p.exists():
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            scenarios.extend(data)
                        elif isinstance(data, dict):
                            scenarios.append(data)
                except Exception as e:
                    print(f"Warning: Failed to load scenarios from {p}: {e}")

        # Auto-discover video evaluation benchmarks from data/videos/
        sample_videos = [
            ("REAL_LASER_POINTER", "data/videos/real_laser_pointer.mp4", "Real Optical Laser Pointer Spot Tracking Benchmark"),
            ("PARANAL_AO_LASER", "data/videos/real_paranal_ao_laser.mp4", "ESO Paranal Observatory Optical Beam Atmospheric Propagation"),
            ("STRESS_ASTIGMATIC", "data/videos/stress_test_astigmatic.mp4", "Astigmatic Beam Distortion & Anamorphic Deformation Test"),
            ("CLUTTER_OCCLUSION", "data/videos/stress_test_clutter_occlusion.mp4", "Dense Optical Clutter & Multi-Spot Occlusion Stress"),
            ("LASER_OGV_BENCHMARK", "data/videos/laser_pointer.ogv", "OGV Continuous Laser Spot Optical Bench Recording"),
            ("PARANAL_WEBM_FEED", "data/videos/paranal_laser.webm", "High-Resolution Optical Telescope Beam Wavefront Feed"),
        ]
        for label, rel_path, desc in sample_videos:
            vpath = PROJECT_ROOT / rel_path
            if vpath.exists():
                try:
                    from sim.video_source import VideoFrameSource
                    vs = VideoFrameSource(str(vpath))
                    n_frames = vs.total_frames
                    fps = vs.fps
                    res_w, res_h = vs.width, vs.height
                    vs.close()
                    scenarios.append({
                        "scenario_name": f"[VIDEO] {label}",
                        "category": "video_evaluation",
                        "frame_source": "video_file",
                        "video_path": str(vpath),
                        "num_frames": n_frames,
                        "dt": 1.0 / max(1.0, fps),
                        "description": f"{desc} ({res_w}x{res_h}, {n_frames} frames @ {fps:.1f} FPS)",
                    })
                except Exception as e:
                    print(f"Warning: Failed to load benchmark video {vpath}: {e}")
        return scenarios

    def load_scenario(self, idx_or_name: Any) -> Dict[str, Any]:
        target_cfg = None
        if isinstance(idx_or_name, int):
            if 0 <= idx_or_name < len(self.scenarios):
                target_cfg = self.scenarios[idx_or_name]
        else:
            for s in self.scenarios:
                if s.get("scenario_name") == str(idx_or_name):
                    target_cfg = s
                    break

        if target_cfg is None and self.scenarios:
            target_cfg = self.scenarios[0]

        self.is_running = False
        self.current_session = FullSimulationSession(target_cfg)
        return {
            "scenario_name": self.current_session.scenario_name,
            "category": self.current_session.category,
            "description": self.current_session.description,
            "frame_source": self.current_session.frame_source,
            "num_frames": self.current_session.num_frames,
            "dt": self.current_session.dt,
        }

    async def connect_client(self, websocket: WebSocket):
        await websocket.accept()
        self.active_websockets.add(websocket)
        if self.current_session:
            init_payload = {
                "type": "init",
                "scenario_name": self.current_session.scenario_name,
                "category": self.current_session.category,
                "description": self.current_session.description,
                "frame_source": self.current_session.frame_source,
                "num_frames": self.current_session.num_frames,
                "frame_id": self.current_session.frame_id,
                "is_running": self.is_running,
                "playback_speed": self.playback_speed,
                "colormap": self.current_session.colormap_mode,
                "scenarios": [
                    {
                        "name": s.get("scenario_name", "UNKNOWN"),
                        "category": s.get("category", "General"),
                        "description": s.get("description", ""),
                        "num_frames": s.get("num_frames", 100),
                        "frame_source": s.get("frame_source", "synthetic"),
                    }
                    for s in self.scenarios
                ],
            }
            await websocket.send_text(json.dumps(init_payload))

    def disconnect_client(self, websocket: WebSocket):
        self.active_websockets.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        if not self.active_websockets:
            return
        msg_str = json.dumps(message)
        dead = []
        for ws in self.active_websockets:
            try:
                await ws.send_text(msg_str)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_websockets.discard(ws)

    def step(self) -> Dict[str, Any]:
        if not self.current_session:
            raise RuntimeError("No active simulation session")
        if self.current_session.frame_id >= self.current_session.num_frames:
            self.is_running = False
            return {"completed": True, "frame_id": self.current_session.frame_id}
        telemetry = self.current_session.step()
        return telemetry

    def start_playback(self):
        self.is_running = True
        if self._loop_task is None or self._loop_task.done():
            self._loop_task = asyncio.create_task(self._simulation_loop())

    def pause_playback(self):
        self.is_running = False

    def reset_playback(self):
        self.is_running = False
        if self.current_session:
            self.current_session.reset()

    async def _simulation_loop(self):
        while self.is_running:
            start_t = time.perf_counter()
            if self.current_session and self.current_session.frame_id < self.current_session.num_frames:
                telemetry = self.current_session.step()
                payload = {
                    "type": "telemetry",
                    "data": telemetry,
                    "completed": False,
                }
                await self.broadcast(payload)
                if self.current_session.frame_id >= self.current_session.num_frames:
                    self.is_running = False
                    await self.broadcast({"type": "scenario_complete", "frame_id": self.current_session.frame_id})
                    break
            else:
                self.is_running = False
                break

            target_delay = (self.current_session.dt / max(0.1, self.playback_speed)) if self.current_session else 0.033
            elapsed = time.perf_counter() - start_t
            sleep_t = max(0.005, target_delay - elapsed)
            await asyncio.sleep(sleep_t)


# Schemas for Extended REST API
class ComprehensiveDisturbanceUpdate(BaseModel):
    cn2: Optional[float] = None
    vibration_amplitude: Optional[float] = None
    vibration_frequency: Optional[float] = None
    noise_level: Optional[float] = None
    poisson_scale: Optional[float] = None
    salt_pepper_prob: Optional[float] = None
    noise_types: Optional[List[str]] = None

class ComprehensiveControlUpdate(BaseModel):
    kp: Optional[float] = None
    ki: Optional[float] = None
    kd: Optional[float] = None
    k_ff: Optional[float] = None
    enable_feedforward: Optional[bool] = None
    max_velocity: Optional[float] = None
    max_acceleration: Optional[float] = None
    latency_frames: Optional[int] = None
    enable_predictive_search: Optional[bool] = None
    tier1_budget: Optional[int] = None
    scan_rate: Optional[float] = None

class TargetKinematicsUpdate(BaseModel):
    target_id: Optional[str] = None
    motion_type: str  # straight_line, circular, figure_eight, spiral, sinusoidal, random
    radius: Optional[float] = None
    angular_velocity: Optional[float] = None
    amplitude_x: Optional[float] = None
    amplitude_y: Optional[float] = None
    frequency: Optional[float] = None

class OccluderInjection(BaseModel):
    duration_frames: Optional[int] = 18
    radius_rad: Optional[float] = 0.008
    opacity: Optional[float] = 1.0

class PlaybackCommand(BaseModel):
    action: str  # play, pause, step, reset
    speed: Optional[float] = 1.0


# Initialize FastAPI Application
app = FastAPI(
    title="DRISHTI-PAT MK-IV Comprehensive Flight Telemetry API",
    description="Full closed-loop optical communication simulation station for SIH PS-26169 (ISRO / DOS)",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sim_manager = ComprehensiveSimulationManager()


# REST Endpoints
@app.get("/api/status")
async def get_status():
    session = sim_manager.current_session
    return {
        "status": "online",
        "system": "DRISHTI-PAT MK-IV (ISRO PS-26169)",
        "is_running": sim_manager.is_running,
        "playback_speed": sim_manager.playback_speed,
        "current_scenario": session.scenario_name if session else None,
        "frame_id": session.frame_id if session else 0,
        "total_frames": session.num_frames if session else 0,
        "connected_clients": len(sim_manager.active_websockets),
    }

@app.get("/api/scenarios")
async def list_scenarios():
    return [
        {
            "index": i,
            "name": s.get("scenario_name", f"Scenario {i}"),
            "category": s.get("category", "General"),
            "description": s.get("description", ""),
            "num_frames": s.get("num_frames", 100),
            "seed": s.get("seed", 42),
        }
        for i, s in enumerate(sim_manager.scenarios)
    ]

@app.post("/api/scenario/select")
async def select_scenario(index: int = Query(..., ge=0)):
    if index >= len(sim_manager.scenarios):
        raise HTTPException(status_code=404, detail="Scenario index out of range")
    res = sim_manager.load_scenario(index)
    await sim_manager.broadcast({
        "type": "scenario_loaded",
        "scenario": res,
    })
    return res

@app.post("/api/simulation/playback")
async def handle_playback(cmd: PlaybackCommand):
    act = cmd.action.lower()
    if act == "play":
        if cmd.speed is not None:
            sim_manager.playback_speed = float(cmd.speed)
        sim_manager.start_playback()
    elif act == "pause":
        sim_manager.pause_playback()
    elif act == "step":
        res = sim_manager.step()
        await sim_manager.broadcast({"type": "telemetry", "data": res})
        return res
    elif act == "reset":
        sim_manager.reset_playback()
        await sim_manager.broadcast({"type": "reset", "frame_id": 0})
    return {"status": "ok", "action": act, "is_running": sim_manager.is_running}

@app.post("/api/simulation/disturbances")
async def update_disturbances(data: ComprehensiveDisturbanceUpdate):
    sess = sim_manager.current_session
    if not sess: raise HTTPException(status_code=400, detail="No active session")
    if data.cn2 is not None: sess.set_cn2(data.cn2)
    if data.vibration_amplitude is not None or data.vibration_frequency is not None:
        amp = data.vibration_amplitude if data.vibration_amplitude is not None else sess.vib_amp
        freq = data.vibration_frequency if data.vibration_frequency is not None else sess.vib_freq
        sess.set_vibration(amp, freq)
    sess.set_noise(
        std=data.noise_level,
        poisson_scale=data.poisson_scale,
        salt_pepper_prob=data.salt_pepper_prob,
        noise_types=data.noise_types,
    )
    return {"status": "updated"}

@app.post("/api/simulation/control")
async def update_control(data: ComprehensiveControlUpdate):
    sess = sim_manager.current_session
    if not sess: raise HTTPException(status_code=400, detail="No active session")
    sess.set_pid(
        kp=data.kp, ki=data.ki, kd=data.kd, k_ff=data.k_ff,
        enable_feedforward=data.enable_feedforward,
    )
    sess.set_slew_limits(max_vel=data.max_velocity, max_acc=data.max_acceleration)
    if data.latency_frames is not None:
        sess.set_latency(data.latency_frames)
    sess.set_reacquisition_params(
        enable_predictive=data.enable_predictive_search,
        tier1_budget=data.tier1_budget,
        scan_rate=data.scan_rate,
    )
    return {"status": "updated"}

@app.post("/api/simulation/target_motion")
async def update_target_motion(data: TargetKinematicsUpdate):
    sess = sim_manager.current_session
    if not sess: raise HTTPException(status_code=400, detail="No active session")
    params = {}
    if data.radius is not None: params["radius"] = data.radius
    if data.angular_velocity is not None: params["angular_velocity"] = data.angular_velocity
    if data.amplitude_x is not None: params["amplitude_x"] = data.amplitude_x
    if data.amplitude_y is not None: params["amplitude_y"] = data.amplitude_y
    if data.frequency is not None: params["frequency"] = data.frequency
    sess.set_target_motion(data.motion_type, target_id=data.target_id, **params)
    return {"status": "motion_updated", "motion_type": data.motion_type}

@app.post("/api/simulation/primary_target")
async def set_primary_target(target_id: str = Query(...)):
    sess = sim_manager.current_session
    if not sess: raise HTTPException(status_code=400, detail="No active session")
    ok = sess.set_primary_target(target_id)
    return {"status": "success" if ok else "target_not_found", "primary_target": sess.primary_target_id}

@app.post("/api/simulation/inject_occluder")
async def inject_occluder(data: OccluderInjection):
    sess = sim_manager.current_session
    if not sess: raise HTTPException(status_code=400, detail="No active session")
    sess.inject_occluder(
        duration_frames=data.duration_frames or 18,
        radius_rad=data.radius_rad or 0.008,
        opacity=data.opacity or 1.0,
    )
    return {"status": "occluder_injected", "start_frame": sess.frame_id}

@app.post("/api/simulation/colormap")
async def set_colormap(mode: str = Query("turbo")):
    if sim_manager.current_session:
        sim_manager.current_session.colormap_mode = mode.lower()
    return {"colormap": mode}

@app.get("/api/simulation/export/csv")
async def export_csv():
    sess = sim_manager.current_session
    if not sess or not sess.history_records:
        raise HTTPException(status_code=400, detail="No history records available to export")
    headers = ["Frame", "Time_s", "Tracking_Error_mrad", "Confidence", "Severity", "Tracker_Mode", "Locked"]
    lines = [",".join(headers)]
    for r in sess.history_records:
        lines.append(f"{r['frame']},{r['time']:.4f},{r['error_mrad']:.4f},{r['confidence']:.4f},{r['severity']:.4f},{r['mode']},{int(r['locked'])}")
    csv_data = "\n".join(lines)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=telemetry_{sess.scenario_name}.csv"}
    )

@app.get("/api/simulation/export/json")
async def export_json():
    sess = sim_manager.current_session
    if not sess: raise HTTPException(status_code=400, detail="No active session")
    return {
        "scenario": sess.scenario_name,
        "history": sess.history_records,
        "metrics": {
            "mean_error": float(np.mean(sess.all_tracking_errors)) if sess.all_tracking_errors else 0.0,
            "max_error": float(np.max(sess.all_tracking_errors)) if sess.all_tracking_errors else 0.0,
            "rmse": float(np.sqrt(np.mean(np.square(sess.all_tracking_errors)))) if sess.all_tracking_errors else 0.0,
            "mode_counts": sess.mode_counts,
            "acquisition_time": sess.acquisition_time,
        }
    }


@app.post("/api/simulation/upload_video")
async def upload_video(file: UploadFile = File(...)):
    """Upload external optical video file, decode properties, and initialize closed-loop simulation."""
    allowed_exts = {".mp4", ".avi", ".ogv", ".webm", ".mkv"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{ext}'. Allowed formats: {', '.join(allowed_exts)}")

    upload_dir = PROJECT_ROOT / "data" / "videos" / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    save_path = upload_dir / file.filename

    contents = await file.read()
    with open(save_path, "wb") as f:
        f.write(contents)

    from sim.video_source import VideoFrameSource
    try:
        vs = VideoFrameSource(str(save_path))
        n_frames = vs.total_frames
        fps = vs.fps
        width, height = vs.width, vs.height
        vs.close()
    except Exception as e:
        if save_path.exists():
            save_path.unlink()
        raise HTTPException(status_code=400, detail=f"Failed to decode video file via OpenCV: {e}")

    video_cfg = {
        "scenario_name": f"[VIDEO] {Path(file.filename).stem.upper()}",
        "category": "video_evaluation",
        "frame_source": "video_file",
        "video_path": str(save_path),
        "num_frames": n_frames,
        "dt": 1.0 / max(1.0, fps),
        "description": f"Uploaded Video: {file.filename} ({width}x{height}, {n_frames} frames @ {fps:.1f} FPS)",
    }

    sim_manager.scenarios.append(video_cfg)
    new_idx = len(sim_manager.scenarios) - 1
    res = sim_manager.load_scenario(new_idx)

    await sim_manager.broadcast({
        "type": "scenario_loaded",
        "scenario": res,
        "is_video": True,
        "video_info": {
            "filename": file.filename,
            "width": width,
            "height": height,
            "fps": fps,
            "num_frames": n_frames,
        }
    })

    return {
        "status": "success",
        "scenario": res,
        "index": new_idx,
        "video_info": {
            "filename": file.filename,
            "width": width,
            "height": height,
            "fps": fps,
            "num_frames": n_frames,
        }
    }


@app.get("/api/simulation/video_benchmarks")
async def get_video_benchmarks():
    """List available pre-recorded optical video benchmarks in data/videos/."""
    video_dir = PROJECT_ROOT / "data" / "videos"
    benchmarks = []
    if video_dir.exists():
        for f in video_dir.glob("*.*"):
            if f.suffix.lower() in [".mp4", ".webm", ".ogv", ".avi", ".mkv"]:
                try:
                    from sim.video_source import VideoFrameSource
                    vs = VideoFrameSource(str(f))
                    benchmarks.append({
                        "filename": f.name,
                        "path": str(f),
                        "frames": vs.total_frames,
                        "fps": round(vs.fps, 1),
                        "resolution": f"{vs.width}x{vs.height}",
                        "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
                    })
                    vs.close()
                except Exception:
                    pass
    return benchmarks


# High-Speed WebSocket Endpoint
@app.websocket("/ws/simulation")
async def websocket_simulation(websocket: WebSocket):
    await sim_manager.connect_client(websocket)
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                cmd = json.loads(raw_data)
            except Exception:
                continue

            action = cmd.get("action")
            sess = sim_manager.current_session

            if action == "play":
                if "speed" in cmd: sim_manager.playback_speed = float(cmd["speed"])
                sim_manager.start_playback()
            elif action == "pause":
                sim_manager.pause_playback()
            elif action == "step":
                sim_manager.pause_playback()
                res = sim_manager.step()
                await sim_manager.broadcast({"type": "telemetry", "data": res})
            elif action == "reset":
                sim_manager.reset_playback()
                await sim_manager.broadcast({"type": "reset", "frame_id": 0})
            elif action == "set_speed":
                sim_manager.playback_speed = float(cmd.get("speed", 1.0))
            elif action == "select_scenario":
                idx = cmd.get("index", 0)
                res = sim_manager.load_scenario(idx)
                await sim_manager.broadcast({"type": "scenario_loaded", "scenario": res})
            elif action == "set_colormap":
                if sess: sess.colormap_mode = cmd.get("colormap", "turbo")
            elif action == "update_disturbances":
                if sess:
                    if "cn2" in cmd: sess.set_cn2(float(cmd["cn2"]))
                    if "vibration_amp" in cmd:
                        sess.set_vibration(float(cmd["vibration_amp"]), float(cmd.get("vibration_freq", sess.vib_freq)))
                    if "noise_std" in cmd: sess.set_noise(std=float(cmd["noise_std"]))
                    if "poisson_scale" in cmd: sess.set_noise(poisson_scale=float(cmd["poisson_scale"]))
                    if "salt_pepper_prob" in cmd: sess.set_noise(salt_pepper_prob=float(cmd["salt_pepper_prob"]))
                    if "noise_types" in cmd: sess.set_noise(noise_types=cmd["noise_types"])
            elif action == "update_pid":
                if sess:
                    sess.set_pid(
                        kp=cmd.get("kp"), ki=cmd.get("ki"), kd=cmd.get("kd"),
                        k_ff=cmd.get("k_ff"), enable_feedforward=cmd.get("enable_feedforward"),
                    )
            elif action == "update_control_hardware":
                if sess:
                    sess.set_slew_limits(max_vel=cmd.get("max_velocity"), max_acc=cmd.get("max_acceleration"))
                    if "latency_frames" in cmd: sess.set_latency(int(cmd["latency_frames"]))
                    sess.set_reacquisition_params(
                        enable_predictive=cmd.get("enable_predictive_search"),
                        tier1_budget=cmd.get("tier1_budget"),
                        scan_rate=cmd.get("scan_rate"),
                    )
            elif action == "set_auto_exposure":
                if sess: sess.set_auto_exposure(bool(cmd.get("enabled", True)))
            elif action == "set_signature_verification":
                if sess: sess.set_signature_verification(bool(cmd.get("enabled", False)))
            elif action == "set_primary_target":
                if sess and "target_id" in cmd: sess.set_primary_target(cmd["target_id"])
            elif action == "set_target_motion":
                if sess and "motion_type" in cmd:
                    sess.set_target_motion(cmd["motion_type"], target_id=cmd.get("target_id"))
            elif action == "inject_occluder":
                if sess:
                    sess.inject_occluder(
                        duration_frames=int(cmd.get("duration_frames", 18)),
                        radius_rad=float(cmd.get("radius_rad", 0.008)),
                        opacity=float(cmd.get("opacity", 1.0)),
                    )
    except WebSocketDisconnect:
        sim_manager.disconnect_client(websocket)
    except Exception:
        sim_manager.disconnect_client(websocket)


# Mount Static Frontend
FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory="web/frontend", html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web.server:app", host="127.0.0.1", port=8000, reload=True)
