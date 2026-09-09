"""
Target kinematics and beacon optical emissions (blinking modulation and clutter).
"""

from typing import Tuple, Optional, Union, Dict, Any
import numpy as np
from contracts import TargetState, TargetConfig


class Target:
    """
    Simulates an optical beacon terminal with configurable kinematics and blinking modulation.
    Supports multi-target discrimination via target_id and unique blink frequencies.
    """

    def __init__(
        self,
        initial_pos: Tuple[float, float] = (0.030, 0.020),
        velocity: Tuple[float, float] = (0.002, -0.001),
        base_intensity: float = 220.0,
        blink_frequency: float = 4.0,   # Hz
        modulation_depth: float = 0.85, # Fractional modulation (0.0 to 1.0)
        range_km: float = 5.0,          # Optical link distance (km)
        ref_range_km: float = 5.0,      # Reference distance where nominal intensity is calibrated
        target_id: Union[str, int] = "target_0",
    ):
        self.target_id = target_id
        self.x = float(initial_pos[0])
        self.y = float(initial_pos[1])
        self.vx = float(velocity[0])
        self.vy = float(velocity[1])
        self.base_intensity = float(base_intensity)
        self.blink_frequency = float(blink_frequency)
        self.modulation_depth = float(modulation_depth)
        self.range_km = float(range_km)
        self.ref_range_km = float(ref_range_km)
        self.timestamp = 0.0

    @classmethod
    def from_config(cls, cfg: Union[Dict[str, Any], TargetConfig]) -> "Target":
        """Factory method to instantiate a Target from a config dict or TargetConfig."""
        if isinstance(cfg, TargetConfig):
            return cls(
                initial_pos=cfg.initial_pos,
                velocity=cfg.velocity,
                base_intensity=cfg.base_intensity,
                blink_frequency=cfg.blink_frequency,
                modulation_depth=cfg.modulation_depth,
                range_km=cfg.range_km,
                ref_range_km=cfg.ref_range_km,
                target_id=cfg.target_id,
            )
        pos = cfg.get("initial_pos", cfg.get("initial_position", (0.030, 0.020)))
        vel = cfg.get("velocity", cfg.get("initial_velocity", (0.002, -0.001)))
        return cls(
            initial_pos=tuple(pos) if isinstance(pos, (list, tuple)) else pos,
            velocity=tuple(vel) if isinstance(vel, (list, tuple)) else vel,
            base_intensity=float(cfg.get("base_intensity", cfg.get("beacon_power", 220.0))),
            blink_frequency=float(cfg.get("blink_frequency", 4.0)),
            modulation_depth=float(cfg.get("modulation_depth", 0.5)),
            range_km=float(cfg.get("range_km", cfg.get("distance_km", 5.0))),
            ref_range_km=float(cfg.get("ref_range_km", 5.0)),
            target_id=cfg.get("target_id", "target_0"),
        )

    @property
    def current_intensity(self) -> float:
        """
        Compute modulated beacon intensity at current timestamp.
        Accounts for:
        1. Range-dependent optical free-space path loss (inverse-square law: (R_ref / R)^2).
        2. Blinking modulation.
        """
        # Range-based optical power scaling
        r = max(0.2, self.range_km)
        r_ref = max(0.2, self.ref_range_km)
        range_factor = (r_ref / r) ** 2

        # Periodic sinusoidal blinking modulation
        if self.blink_frequency > 0:
            phase = 2.0 * np.pi * self.blink_frequency * self.timestamp
            factor = (1.0 - self.modulation_depth) + self.modulation_depth * (0.5 * (1.0 + np.sin(phase)))
        else:
            factor = 1.0

        raw_intensity = self.base_intensity * factor * range_factor
        return float(np.clip(raw_intensity, 1.0, 10000.0))

    def step(self, dt: float) -> TargetState:
        """Advance target position and time."""
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.timestamp += dt
        return self.get_state()

    def get_state(self) -> TargetState:
        return TargetState(
            x=self.x,
            y=self.y,
            vx=self.vx,
            vy=self.vy,
            confidence=1.0,
            timestamp=self.timestamp,
            tracker_mode="GROUND_TRUTH",
            target_id=self.target_id,
        )



class ClutterObject:
    """
    Simulates a false target / clutter object (e.g. constant solar glint or static background reflection).
    Emits a steady, non-blinking bright optical spot.
    """

    def __init__(
        self,
        pos: Tuple[float, float] = (0.015, 0.010),
        intensity: float = 230.0,  # Bright, steady non-blinking
    ):
        self.x = float(pos[0])
        self.y = float(pos[1])
        self.intensity = float(intensity)

    @property
    def current_intensity(self) -> float:
        """Constant non-blinking intensity."""
        return self.intensity
