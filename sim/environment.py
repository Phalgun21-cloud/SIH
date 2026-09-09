"""
Virtual 2D Simulation Environment coordinating target kinematics, camera optics,
clutter objects, and realistic physical disturbances.
"""

import time
from typing import Tuple, Optional, List, Any, Dict, Union
import numpy as np
from contracts import FrameData, CameraState, TargetState, DisturbanceConfig
from sim.target import Target, ClutterObject
from sim.camera import Camera
from disturb.turbulence import KolmogorovTurbulence
from disturb.vibration import PlatformVibration
from disturb.noise import SensorNoise
from disturb.occluder import DynamicOccluder
from sim.video_source import VideoFrameSource


class Environment:
    """
    Coordinates target kinematics, clutter, camera gimbal dynamics, and
    physical disturbances (turbulence, vibration, sensor noise, occluders).
    Supports multiple simultaneous moving targets while designating one as primary for tracking.
    Also supports consuming real pre-recorded video files via VideoFrameSource.
    """

    def __init__(
        self,
        target: Optional[Target] = None,
        camera: Optional[Camera] = None,
        clutter_objects: Optional[List[ClutterObject]] = None,
        turbulence: Optional[KolmogorovTurbulence] = None,
        vibration: Optional[PlatformVibration] = None,
        sensor_noise: Optional[SensorNoise] = None,
        occluders: Optional[List[DynamicOccluder]] = None,
        targets: Optional[List[Target]] = None,
        primary_target_id: Optional[Union[str, int]] = None,
        frame_source: str = "synthetic",
        video_source: Optional[VideoFrameSource] = None,
        video_path: Optional[str] = None,
    ):
        self.frame_source = str(frame_source)
        if video_source is not None:
            self.video_source = video_source
            self.frame_source = "video_file"
        elif video_path is not None:
            self.video_source = VideoFrameSource(video_path)
            self.frame_source = "video_file"
        else:
            self.video_source = None

        if targets is not None and len(targets) > 0:
            self.targets = list(targets)
            if primary_target_id is not None:
                self.primary_target_id = primary_target_id
                matched = next((t for t in self.targets if t.target_id == primary_target_id), None)
                self.target = matched if matched is not None else self.targets[0]
            else:
                self.primary_target_id = self.targets[0].target_id
                self.target = self.targets[0]
        elif target is not None:
            self.targets = [target]
            self.primary_target_id = target.target_id
            self.target = target
        else:
            default_tgt = Target()
            self.targets = [default_tgt]
            self.primary_target_id = default_tgt.target_id
            self.target = default_tgt

        self.camera = camera if camera is not None else Camera()
        self.clutter_objects = clutter_objects if clutter_objects is not None else []
        self.turbulence = turbulence
        self.vibration = vibration
        self.sensor_noise = sensor_noise
        self.occluders = occluders if occluders is not None else []

        self.frame_count = 0
        self.sim_time = 0.0
        self.last_step_profile: Dict[str, float] = {}

    def add_target(self, target: Target) -> None:
        """Add another moving target to the simulation environment."""
        self.targets.append(target)

    def set_primary_target(self, target_id: Union[str, int]) -> bool:
        """Designate which target the camera actively tracks."""
        for t in self.targets:
            if t.target_id == target_id:
                self.primary_target_id = target_id
                self.target = t
                return True
        return False

    def get_all_target_states(self) -> List[TargetState]:
        """Return the current ground-truth kinematic states for all targets."""
        return [t.get_state() for t in self.targets]

    def add_clutter(self, clutter: ClutterObject) -> None:
        """Add a clutter object to the environment."""
        self.clutter_objects.append(clutter)

    def add_occluder(self, occluder: DynamicOccluder) -> None:
        """Add an occluder object to the environment."""
        self.occluders.append(occluder)

    def step(
        self,
        dt: float,
        control_pan_delta: float = 0.0,
        control_tilt_delta: float = 0.0,
    ) -> Tuple[FrameData, TargetState, CameraState]:
        """
        Advance simulation by one time step:
        1. Apply commanded gimbal adjustments.
        2. Advance target kinematics and blinking modulation.
        3. Apply platform vibration to apparent camera boresight.
        4. Render optical sensor frame with beacon and clutter.
        5. Apply atmospheric turbulence (scintillation + PSF blur).
        6. Apply dynamic occluders (line-of-sight blockage).
        7. Apply sensor readout and impulse noise.
        """
        self.sim_time += dt

        # 1. Update true camera gimbal pose
        self.camera.apply_control(control_pan_delta, control_tilt_delta, dt=dt)

        if self.frame_source == "video_file" and self.video_source is not None:
            t_render0 = time.perf_counter_ns()
            vframe = self.video_source.get_frame(self.frame_count)
            t_render1 = time.perf_counter_ns()
            if vframe is not None:
                frame = vframe
                self.sim_time = frame.timestamp
            else:
                self.sim_time += dt
                w, h = self.camera.state.resolution
                frame = FrameData(
                    image=np.zeros((h, w), dtype=np.uint8),
                    timestamp=self.sim_time,
                    frame_id=self.frame_count,
                    ground_truth_target_pos=None,
                    ground_truth_targets=None,
                )
            self.frame_count += 1
            target_state = TargetState(
                x=0.0,
                y=0.0,
                vx=0.0,
                vy=0.0,
                confidence=0.0,
                timestamp=self.sim_time,
                tracker_mode="NO_GROUND_TRUTH",
                target_id="video_target",
            )
            self.last_step_profile = {
                "rendering_ms": (t_render1 - t_render0) * 1e-6,
                "disturb_turbulence_ms": 0.0,
                "disturb_noise_ms": 0.0,
                "disturb_occlusion_ms": 0.0,
                "disturb_vibration_ms": 0.0,
                "disturbances_total_ms": 0.0,
            }
            return frame, None, self.camera.state

        # 2. Advance target kinematics for all targets
        for tgt in self.targets:
            tgt.step(dt)
        primary_target_state = self.target.get_state()

        # 3. Platform vibration offset
        vib_pan, vib_tilt = 0.0, 0.0
        t_vib0 = time.perf_counter_ns()
        if self.vibration is not None:
            vib_pan, vib_tilt = self.vibration.step(self.sim_time, dt=dt)
        t_vib1 = time.perf_counter_ns()

        # Temporarily offset camera pointing by vibration jitter for optical rendering
        actual_pan = self.camera.state.pan
        actual_tilt = self.camera.state.tilt
        self.camera.state.pan += vib_pan
        self.camera.state.tilt += vib_tilt

        # 4. Render raw optical frame with all targets
        t_render0 = time.perf_counter_ns()
        frame = self.camera.render_frame(
            target_state=primary_target_state,
            beacon_intensity=self.target.current_intensity,
            clutter_objects=self.clutter_objects,
            frame_id=self.frame_count,
            targets=self.targets,
        )
        t_render1 = time.perf_counter_ns()

        # Restore camera true gimbal angles (vibration is high-frequency apparent jitter)
        self.camera.state.pan = actual_pan
        self.camera.state.tilt = actual_tilt

        raw_img = frame.image

        # 5. Atmospheric Turbulence (Kolmogorov phase screen, scintillation, PSF blur)
        t_turb0 = time.perf_counter_ns()
        if self.turbulence is not None:
            raw_img = self.turbulence.apply_turbulence(
                raw_img, target_pos_px=frame.ground_truth_target_pos
            )
        t_turb1 = time.perf_counter_ns()

        # 6. Dynamic Occluders (block line-of-sight)
        t_occ0 = time.perf_counter_ns()
        if self.occluders:
            for occ in self.occluders:
                occ.step(dt)
                raw_img, _ = occ.apply_to_frame(raw_img, self.camera.state)
        t_occ1 = time.perf_counter_ns()

        # 7. Sensor Readout & Shot Noise
        t_noise0 = time.perf_counter_ns()
        if self.sensor_noise is not None:
            raw_img = self.sensor_noise.apply_noise(raw_img)
        t_noise1 = time.perf_counter_ns()

        frame.image = raw_img
        self.frame_count += 1

        self.last_step_profile = {
            "rendering_ms": (t_render1 - t_render0) * 1e-6,
            "disturb_turbulence_ms": (t_turb1 - t_turb0) * 1e-6,
            "disturb_noise_ms": (t_noise1 - t_noise0) * 1e-6,
            "disturb_occlusion_ms": (t_occ1 - t_occ0) * 1e-6,
            "disturb_vibration_ms": (t_vib1 - t_vib0) * 1e-6,
            "disturbances_total_ms": (
                (t_turb1 - t_turb0)
                + (t_noise1 - t_noise0)
                + (t_occ1 - t_occ0)
                + (t_vib1 - t_vib0)
            ) * 1e-6,
        }

        return frame, primary_target_state, self.camera.state

    def get_angular_tracking_error(
        self,
        target_id: Optional[Union[str, int]] = None,
    ) -> Tuple[Optional[float], Optional[float], Optional[float]]:
        """
        Calculate angular error between target world position and camera boresight.
        Returns (None, None, None) in video_file mode or when no ground truth target is present.
        """
        if self.frame_source == "video_file" or not self.targets:
            return None, None, None

        if target_id is not None:
            matched = next((t for t in self.targets if t.target_id == target_id), self.target)
            tgt = matched.get_state()
        else:
            tgt = self.target.get_state()

        cam = self.camera.state
        err_pan = tgt.x - cam.pan
        err_tilt = tgt.y - cam.tilt
        radial_err = float(np.hypot(err_pan, err_tilt))
        return err_pan, err_tilt, radial_err
