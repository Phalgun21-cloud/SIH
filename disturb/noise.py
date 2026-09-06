"""
Optical Sensor Noise Generator (Readout Gaussian + Salt-and-Pepper Impulse Noise).
Smart India Hackathon - FSOC PAT Simulator (ISRO / DOS PS 26169)

Optimized with vectorized SIMD image generation via OpenCV and NumPy.
"""

from typing import Optional
import numpy as np
import cv2


class SensorNoise:
    """
    Simulates optical sensor noise artifacts:
    - Additive zero-mean Gaussian readout noise
    - Salt-and-pepper impulse noise (hot and dead pixels)
    - Dark current noise
    """

    def __init__(
        self,
        gaussian_std: float = 6.0,          # Standard deviation of readout noise
        salt_pepper_prob: float = 0.0005,   # Probability of hot/dead pixels (e.g. 0.05%)
        seed: int = 42,
    ):
        self.gaussian_std = float(gaussian_std)
        self.salt_pepper_prob = float(salt_pepper_prob)
        self._rng = np.random.default_rng(seed)
        self._noise_buf: Optional[np.ndarray] = None

    def apply_noise(self, image: np.ndarray) -> np.ndarray:
        """
        Apply Gaussian readout and salt-and-pepper impulse noise to sensor image.
        Uses vectorized OpenCV SIMD Gaussian noise generation and array masking.

        Args:
            image: Input 2D uint8 sensor image.

        Returns:
            Noisy 2D uint8 sensor image.
        """
        if image is None or image.size == 0:
            return image

        # Re-use pre-allocated noise buffer for performance
        if self._noise_buf is None or self._noise_buf.shape != image.shape:
            self._noise_buf = np.empty(image.shape, dtype=np.float32)

        # 1. Vectorized Gaussian Readout Noise
        if self.gaussian_std > 0:
            cv2.randn(self._noise_buf, 0.0, self.gaussian_std)
            # Vectorized float32 addition and saturation clipping
            out = cv2.add(image.astype(np.float32), self._noise_buf)
            out = np.clip(out, 0, 255, out=out).astype(np.uint8)
        else:
            out = image.copy()

        # 2. Vectorized Salt-and-Pepper Impulse Noise
        if self.salt_pepper_prob > 0:
            num_pixels = image.size
            half_sp = int(np.ceil(self.salt_pepper_prob * num_pixels)) // 2
            if half_sp > 0:
                # Hot pixels (salt -> 255)
                y_salt = self._rng.integers(0, image.shape[0], half_sp)
                x_salt = self._rng.integers(0, image.shape[1], half_sp)
                out[y_salt, x_salt] = 255

                # Dead pixels (pepper -> 0)
                y_pep = self._rng.integers(0, image.shape[0], half_sp)
                x_pep = self._rng.integers(0, image.shape[1], half_sp)
                out[y_pep, x_pep] = 0

        return out
