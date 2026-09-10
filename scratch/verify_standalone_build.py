"""
Verification Script for Standalone FSOC PAT Simulator Build.
Executes Requirements 3a, 3b, 3c and 4 against C:\\FSOC_Build\\dist\\FSOC_PAT_Simulator\\FSOC_PAT_Simulator.exe
"""
import os
import sys
import time
import subprocess
import json
import psutil

EXE_PATH = r"C:\FSOC_Build\dist\FSOC_PAT_Simulator\FSOC_PAT_Simulator.exe"
OUT_DIR = r"C:\FSOC_Build\test_verification_run"

def run_step_3a():
    print("=" * 70)
    print("STEP 3a: Launch GUI with no arguments & inspect process")
    print("=" * 70)
    assert os.path.exists(EXE_PATH), f"Executable not found at {EXE_PATH}"
    
    proc = subprocess.Popen([EXE_PATH])
    print(f"[*] Spawned process with PID: {proc.pid}")
    time.sleep(3.5)
    
    p = psutil.Process(proc.pid)
    is_running = p.is_running()
    status = p.status()
    rss_mb = p.memory_info().rss / (1024 * 1024)
    print(f"[+] Process PID         : {proc.pid}")
    print(f"[+] Is Running          : {is_running}")
    print(f"[+] Process Status      : {status}")
    print(f"[+] Working Set (RSS)   : {rss_mb:.2f} MB")
    
    # Enumerate top-level window titles for the process
    import ctypes
    user32 = ctypes.windll.user32
    window_titles = []
    
    def enum_windows_callback(hwnd, extra):
        if user32.IsWindowVisible(hwnd):
            pid = ctypes.c_ulong()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value == proc.pid:
                length = user32.GetWindowTextLengthW(hwnd)
                if length > 0:
                    buff = ctypes.create_unicode_buffer(length + 1)
                    user32.GetWindowTextW(hwnd, buff, length + 1)
                    window_titles.append(buff.value)
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
    cb = WNDENUMPROC(enum_windows_callback)
    user32.EnumWindows(cb, 0)
    
    cmd_resp = f"(Get-Process -Id {proc.pid}).Responding"
    res_resp = subprocess.run(["powershell", "-NoProfile", "-Command", cmd_resp], capture_output=True, text=True)
    responding = res_resp.stdout.strip()
    
    print(f"[+] Detected Window Titles: {window_titles}")
    print(f"[+] Responding State    : {responding}")
    
    # Clean termination
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    print("[+] Cleanly terminated test GUI process.")
    assert is_running, "Process failed to stay running"
    print("[PASS] Step 3a verified successfully.\n")


def run_step_3b():
    print("=" * 70)
    print("STEP 3b: Run --list-scenarios from Command Prompt")
    print("=" * 70)
    res = subprocess.run([EXE_PATH, "--list-scenarios"], capture_output=True, text=True)
    print(f"[*] Exit code: {res.returncode}")
    print("[*] Output:\n" + res.stdout)
    assert res.returncode == 0, f"Expected returncode 0, got {res.returncode}"
    expected_scenarios = [
        "DEMO_ACQUISITION_AND_TRACK",
        "DEMO_HIGH_JITTER_REJECTION",
        "DEMO_DYNAMIC_OCCLUSION_RECOVERY",
        "DEMO_EXTENDED_COMBINED_STRESS",
        "DEMO_MULTI_TARGET_PAT",
        "DEMO_CIRCULAR_MOTION_POISSON_NOISE",
        "DEMO_FIGURE_EIGHT_PLATFORM_MOTION",
        "DEMO_ATMOSPHERIC_FOG",
        "DEMO_ATMOSPHERIC_LOW_LIGHT",
    ]
    for expected in expected_scenarios:
        assert expected in res.stdout, f"Missing scenario: {expected}"
    print(f"[PASS] Step 3b verified successfully: all {len(expected_scenarios)} demo scenarios discovered.\n")


def run_step_3c():
    print("=" * 70)
    print("STEP 3c: Run --run-scenario DEMO_ACQUISITION_AND_TRACK --output-dir")
    print("=" * 70)
    os.makedirs(OUT_DIR, exist_ok=True)
    cmd = [
        EXE_PATH,
        "--run-scenario",
        "DEMO_ACQUISITION_AND_TRACK",
        "--output-dir",
        OUT_DIR,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print(f"[*] Exit code: {res.returncode}")
    print("[*] CLI Output:\n" + res.stdout)
    assert res.returncode == 0, f"Expected returncode 0, got {res.returncode}"
    
    report_file = os.path.join(OUT_DIR, "performance_report.json")
    csv_file = os.path.join(OUT_DIR, "DEMO_ACQUISITION_AND_TRACK_telemetry.csv")
    if not os.path.exists(csv_file):
        csv_file = os.path.join(OUT_DIR, "telemetry.csv")
    
    assert os.path.exists(report_file), f"Missing {report_file}"
    assert os.path.exists(csv_file), f"Missing {csv_file}"
    
    with open(report_file, "r") as f:
        report_data = json.load(f)
    print(f"[+] Loaded performance report ({len(report_data)} keys):")
    for k in ["scenario_name", "total_frames", "fps", "tracking_efficiency_pct", "mean_tracking_error_px", "rmse_px"]:
        if k in report_data:
            print(f"    - {k}: {report_data[k]}")
            
    with open(csv_file, "r") as f:
        csv_lines = f.readlines()
    print(f"[+] Telemetry CSV has {len(csv_lines)} lines (header + {len(csv_lines)-1} frames)")
    assert len(csv_lines) > 50, "Telemetry CSV has insufficient rows"
    
    print("[PASS] Step 3c verified successfully: real JSON & CSV telemetry generated.\n")


def run_step_4():
    print("=" * 70)
    print("STEP 4: Re-run Environment Isolation Test")
    print("=" * 70)
    # Restrict PATH to System32 and Windows; wipe PYTHONPATH and PYTHONHOME
    clean_env = {
        "PATH": r"C:\Windows\System32;C:\Windows",
        "SYSTEMROOT": r"C:\Windows",
        "COMSPEC": r"C:\Windows\System32\cmd.exe",
        "PATHEXT": ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC",
        "TEMP": os.environ.get("TEMP", r"C:\Windows\Temp"),
        "TMP": os.environ.get("TMP", r"C:\Windows\Temp"),
    }
    # Ensure no python environment variables leak
    assert "PYTHONPATH" not in clean_env
    assert "PYTHONHOME" not in clean_env
    
    print("[*] Executing standalone exe in isolated environment:")
    print(f"    PATH = {clean_env['PATH']}")
    print("    PYTHONPATH = None, PYTHONHOME = None")
    
    res = subprocess.run([EXE_PATH, "--list-scenarios"], env=clean_env, capture_output=True, text=True)
    print(f"[*] Exit code: {res.returncode}")
    print(f"[*] Scenario list output length: {len(res.stdout)} chars")
    assert res.returncode == 0, f"Isolation test failed with exit code {res.returncode}"
    assert "DEMO_ACQUISITION_AND_TRACK" in res.stdout
    assert "DEMO_ATMOSPHERIC_LOW_LIGHT" in res.stdout
    print("[PASS] Step 4 verified successfully: standalone exe runs in isolated shell with exit code 0.\n")


if __name__ == "__main__":
    run_step_3a()
    run_step_3b()
    run_step_3c()
    run_step_4()
    print("=" * 70)
    print("ALL EXE VERIFICATIONS COMPLETED SUCCESSFULLY!")
    print("=" * 70)
