"""
Resource and Asset Path Resolution Helper.
Smart India Hackathon - Problem Statement 26169 (ISRO / DOS)

Resolves absolute paths to resource files (configuration JSONs, sample video files, icons)
seamlessly across:
1. Standard Python development mode (relative to project root or current working directory).
2. PyInstaller bundled executable mode:
   - --onedir mode: Assets located in the application directory alongside the executable.
   - --onefile mode: Assets extracted to PyInstaller temporary directory (sys._MEIPASS).
"""

import os
import sys


def get_resource_path(relative_path: str) -> str:
    """
    Resolves the absolute path to a resource file, compatible with both standard
    development execution and PyInstaller bundled executables.

    Args:
        relative_path: Relative path to resource (e.g. 'config/demo_scenarios.json'
                       or 'data/videos/real_laser_pointer.mp4').

    Returns:
        Absolute resolved path to the resource file.
    """
    if not relative_path:
        return ""

    rel_path = os.path.normpath(str(relative_path))

    # 1. If already an existing absolute path, return immediately
    if os.path.isabs(rel_path) and os.path.exists(rel_path):
        return rel_path

    # 2. PyInstaller temporary extraction directory (sys._MEIPASS for --onefile / --onedir)
    if hasattr(sys, "_MEIPASS"):
        meipass_candidate = os.path.join(sys._MEIPASS, rel_path)
        if os.path.exists(meipass_candidate):
            return os.path.abspath(meipass_candidate)

    # 3. PyInstaller frozen application directory (alongside executable in --onedir)
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        exe_candidate = os.path.join(exe_dir, rel_path)
        if os.path.exists(exe_candidate):
            return os.path.abspath(exe_candidate)

    # 4. Project root directory (where resources.py resides)
    project_root = os.path.dirname(os.path.abspath(__file__))
    proj_candidate = os.path.join(project_root, rel_path)
    if os.path.exists(proj_candidate):
        return os.path.abspath(proj_candidate)

    # 5. Current working directory
    cwd_candidate = os.path.join(os.getcwd(), rel_path)
    if os.path.exists(cwd_candidate):
        return os.path.abspath(cwd_candidate)

    # Fallback: return path anchored to project root or executable dir
    if getattr(sys, "frozen", False):
        return os.path.abspath(os.path.join(os.path.dirname(sys.executable), rel_path))
    if hasattr(sys, "_MEIPASS"):
        return os.path.abspath(os.path.join(sys._MEIPASS, rel_path))
    return os.path.abspath(proj_candidate)
