"""
Automated Standalone Application Packaging Script with PyInstaller.
Smart India Hackathon - Problem Statement 26169 (ISRO / DOS)

Packages verify_ui.py and the complete PAT simulation backend into a standalone,
portable Windows executable directory (--onedir) including all dependencies
(OpenCV, NumPy, Scipy, Tkinter) and bundled configuration/video assets.

Mitigates OneDrive Files-On-Demand placeholder issues by defaulting all build
and distribution outputs to a local, non-synced directory (e.g. C:\\FSOC_Build\\dist).
"""

import os
import sys
import shutil
import time
import argparse
import subprocess
from typing import Optional, Tuple


def format_size(bytes_val: int) -> str:
    """Format byte count to human-readable string (KB, MB, GB)."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_val < 1024.0:
            return f"{bytes_val:.2f} {unit}"
        bytes_val /= 1024.0
    return f"{bytes_val:.2f} TB"


def get_dir_size(dir_path: str) -> int:
    """Calculate total byte size of all files in directory tree."""
    total = 0
    for root, dirs, files in os.walk(dir_path):
        for f in files:
            fp = os.path.join(root, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total


def check_onedrive_path(path: str, label: str) -> None:
    """Check if path is inside a OneDrive-synced folder and print a prominent warning."""
    abs_p = os.path.abspath(path)
    if "onedrive" in abs_p.lower():
        print("\n" + "!" * 76)
        print(f"  [WARNING] The {label} is inside a OneDrive-synced directory:")
        print(f"            {abs_p}")
        print("  OneDrive Files-On-Demand can cause 'Failed to import encodings module'")
        print("  runtime crashes by serving placeholder stubs instead of real binaries.")
        print("  It is STRONGLY RECOMMENDED to build to a local, non-synced directory")
        print("  such as C:\\FSOC_Build\\dist (the default in this script).")
        print("!" * 76 + "\n")


def get_default_build_locations(build_dir: Optional[str] = None) -> Tuple[str, str]:
    """
    Resolve safe non-OneDrive output directories for dist and work paths.
    
    Priority:
    1. Explicit --build-dir argument if provided
    2. FSOC_BUILD_DIR environment variable if set
    3. C:\\FSOC_Build on Windows (or ~/FSOC_Build on non-Windows)
    """
    if build_dir is not None:
        base = os.path.abspath(build_dir)
    elif "FSOC_BUILD_DIR" in os.environ:
        base = os.path.abspath(os.environ["FSOC_BUILD_DIR"])
    elif sys.platform == "win32":
        base = r"C:\FSOC_Build"
    else:
        base = os.path.expanduser("~/FSOC_Build")

    dist_dir = os.path.join(base, "dist")
    work_dir = os.path.join(base, "work")
    return dist_dir, work_dir


def robust_rmtree(path: str) -> None:
    """Robustly delete directory tree on Windows handling transient file locks."""
    if not os.path.exists(path):
        return
    abs_p = os.path.abspath(path)
    if sys.platform == "win32":
        for _ in range(4):
            subprocess.run(f'cmd.exe /c "if exist \"{abs_p}\" rd /s /q \"{abs_p}\""', shell=True, capture_output=True)
            if not os.path.exists(abs_p):
                return
            time.sleep(0.5)
    for _ in range(3):
        try:
            shutil.rmtree(abs_p, ignore_errors=False)
            return
        except Exception:
            time.sleep(0.3)
    shutil.rmtree(abs_p, ignore_errors=True)


def build(
    clean: bool = True,
    onefile: bool = False,
    dist_dir: Optional[str] = None,
    work_dir: Optional[str] = None,
    build_dir: Optional[str] = None,
    create_zip: bool = True,
) -> int:
    """
    Execute PyInstaller build targeting safe local non-OneDrive output directories.
    
    Args:
        clean: Whether to wipe previous build/work and dist directories.
        onefile: If True, build single-file executable; else build onedir bundle.
        dist_dir: Optional custom directory for final distribution bundle.
        work_dir: Optional custom directory for intermediate build artifacts.
        build_dir: Optional base directory under which dist and work will be created.
        create_zip: Whether to generate a distribution ZIP archive.
    """
    project_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_root)

    # Resolve output paths
    def_dist, def_work = get_default_build_locations(build_dir)
    dist_path = os.path.abspath(dist_dir) if dist_dir is not None else def_dist
    work_path = os.path.abspath(work_dir) if work_dir is not None else def_work

    print("=" * 76)
    print("  FSOC PAT SIMULATOR — PYINSTALLER STANDALONE BUILD SCRIPT")
    print("  ISRO / DOS PS 26169 | Entry Point: verify_ui.py")
    print("=" * 76)
    print(f"[*] Project Source Root : {project_root}")
    print(f"[*] Distribution Target  : {dist_path}")
    print(f"[*] Work / Intermediate  : {work_path}")

    # Check for OneDrive in paths and warn user
    check_onedrive_path(dist_path, "distribution output path (--distpath)")
    check_onedrive_path(work_path, "intermediate work path (--workpath)")

    # 1. Clean previous artifacts if requested
    if clean:
        for p, name in [(dist_path, "dist"), (work_path, "work")]:
            if os.path.exists(p):
                print(f"[*] Cleaning previous '{name}' directory ({p})...")
                robust_rmtree(p)

    os.makedirs(dist_path, exist_ok=True)
    os.makedirs(work_path, exist_ok=True)

    # 2. Check PyInstaller availability
    try:
        import PyInstaller
        import PyInstaller.__main__
        print(f"[*] Found PyInstaller version {PyInstaller.__version__}")
    except ImportError:
        print("[ERROR] PyInstaller is not installed in the active Python environment.")
        print("        Install it via: python -m pip install pyinstaller")
        return 1

    t0 = time.perf_counter()

    # 3. Assemble command line arguments
    spec_path = os.path.join(project_root, "fsoc_simulator.spec")
    if not onefile and os.path.exists(spec_path):
        print(f"[*] Building using specification: {spec_path} (--onedir mode)...")
        spec_or_args = [
            spec_path,
            f"--distpath={dist_path}",
            f"--workpath={work_path}",
            "--noconfirm",
        ]
    else:
        mode_flag = "--onefile" if onefile else "--onedir"
        print(f"[*] Building using CLI flags ({mode_flag} mode)...")
        spec_or_args = [
            "verify_ui.py",
            mode_flag,
            "--name=FSOC_PAT_Simulator",
            f"--distpath={dist_path}",
            f"--workpath={work_path}",
            "--add-data=config;config",
            "--add-data=data/videos;data/videos",
            "--hidden-import=contracts",
            "--hidden-import=resources",
            "--hidden-import=sim",
            "--hidden-import=detect",
            "--hidden-import=track",
            "--hidden-import=control",
            "--hidden-import=disturb",
            "--hidden-import=metrics",
            "--hidden-import=cv2",
            "--hidden-import=numpy",
            "--hidden-import=scipy",
            "--hidden-import=tkinter",
            "--hidden-import=tkinter.ttk",
            "--console",
            "--noconfirm",
        ]

    cmd_str = f"python -m PyInstaller {' '.join(spec_or_args)}"
    print(f"[*] Executing command:\n    {cmd_str}\n")

    try:
        ret = subprocess.run([sys.executable, "-m", "PyInstaller"] + spec_or_args)
        if ret.returncode != 0:
            print(f"[ERROR] PyInstaller failed with exit code: {ret.returncode}")
            return ret.returncode
    except Exception as ex:
        print(f"[ERROR] Exception during PyInstaller build: {ex}")
        return 1

    build_time = time.perf_counter() - t0

    # 4. Verify outputs
    if onefile:
        exe_path = os.path.join(dist_path, "FSOC_PAT_Simulator.exe")
        target_dir = dist_path
    else:
        target_dir = os.path.join(dist_path, "FSOC_PAT_Simulator")
        exe_path = os.path.join(target_dir, "FSOC_PAT_Simulator.exe")

    if not os.path.exists(exe_path):
        print(f"[ERROR] Expected executable not found at: {exe_path}")
        return 1

    exe_size = os.path.getsize(exe_path)
    total_size = get_dir_size(target_dir)

    # 5. Create fresh distribution ZIP archive
    zip_path = None
    zip_size = 0
    if create_zip and not onefile:
        zip_base = os.path.join(dist_path, "FSOC_PAT_Simulator_Windows_x64")
        expected_zip = zip_base + ".zip"
        print(f"[*] Generating submission ZIP archive: {expected_zip}...")
        try:
            shutil.make_archive(zip_base, "zip", root_dir=dist_path, base_dir="FSOC_PAT_Simulator")
            if os.path.exists(expected_zip):
                zip_path = expected_zip
                zip_size = os.path.getsize(zip_path)
                print(f"    [+] Created ZIP archive: {format_size(zip_size)} ({zip_size:,} bytes)")
        except Exception as ze:
            print(f"    [!] Warning: Failed to compress ZIP: {ze}")

    print("\n" + "=" * 76)
    print("  BUILD SUCCESSFUL!")
    print("=" * 76)
    print(f"  Build Elapsed Time : {build_time:.2f} seconds")
    print(f"  Packaging Mode     : {'--onefile' if onefile else '--onedir (recommended for fast startup)'}")
    print(f"  Executable Path    : {exe_path}")
    print(f"  Executable Binary  : {format_size(exe_size)} ({exe_size:,} bytes)")
    if not onefile:
        print(f"  Bundle Directory   : {target_dir}")
        print(f"  Total Bundle Size  : {format_size(total_size)} ({total_size:,} bytes)")
    if zip_path:
        print(f"  Submission ZIP     : {zip_path}")
        print(f"  ZIP File Size      : {format_size(zip_size)} ({zip_size:,} bytes)")
    print("=" * 76 + "\n")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Package FSOC PAT Simulator as standalone executable.")
    parser.add_argument("--build-dir", default=None, help="Base output directory (default: C:\\FSOC_Build or $FSOC_BUILD_DIR).")
    parser.add_argument("--distpath", default=None, help="Explicit directory for final executable bundle.")
    parser.add_argument("--workpath", default=None, help="Explicit directory for intermediate build files.")
    parser.add_argument("--no-clean", action="store_true", help="Do not wipe target directories prior to building.")
    parser.add_argument("--onefile", action="store_true", help="Package into a single .exe (slower startup vs onedir).")
    parser.add_argument("--no-zip", action="store_true", help="Skip creating distribution ZIP archive.")
    args = parser.parse_args()

    exit_code = build(
        clean=not args.no_clean,
        onefile=args.onefile,
        dist_dir=args.distpath,
        work_dir=args.workpath,
        build_dir=args.build_dir,
        create_zip=not args.no_zip,
    )
    sys.exit(exit_code)
