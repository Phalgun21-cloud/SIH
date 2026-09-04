"""Unit tests for disturb module skeleton and contracts integration."""

import unittest
from disturb import turbulence, vibration, noise, occluder
from contracts import DisturbanceConfig


class TestDisturbSkeleton(unittest.TestCase):
    def test_imports(self):
        self.assertTrue(hasattr(turbulence, "DisturbanceConfig"))
        self.assertTrue(hasattr(vibration, "DisturbanceConfig"))
        self.assertTrue(hasattr(noise, "DisturbanceConfig"))
        self.assertTrue(hasattr(occluder, "DisturbanceConfig"))


if __name__ == "__main__":
    unittest.main()
