"""Unit tests for sim module skeleton and contracts integration."""

import unittest
from sim import environment, target, camera
from contracts import CameraState, TargetState, FrameData


class TestSimSkeleton(unittest.TestCase):
    def test_imports(self):
        self.assertTrue(hasattr(environment, "FrameData"))
        self.assertTrue(hasattr(target, "TargetState"))
        self.assertTrue(hasattr(camera, "CameraState"))


if __name__ == "__main__":
    unittest.main()
