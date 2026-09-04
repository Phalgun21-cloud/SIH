"""Unit tests for detect module skeleton and contracts integration."""

import unittest
from detect import detector
from contracts import FrameData, TargetState


class TestDetectSkeleton(unittest.TestCase):
    def test_imports(self):
        self.assertTrue(hasattr(detector, "FrameData"))
        self.assertTrue(hasattr(detector, "TargetState"))


if __name__ == "__main__":
    unittest.main()
