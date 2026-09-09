# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller Specification for FSOC Coarse PAT Simulator.
Smart India Hackathon - Problem Statement 26169 (ISRO / DOS)

Packages the verify_ui.py visual simulator and closed-loop PAT backend into
a standalone, self-contained Windows application directory (--onedir).
"""

import sys
import os

block_cipher = None

# Bundle configuration files and sample video assets
added_files = [
    ('config', 'config'),
    ('data/videos', 'data/videos'),
]

# Explicitly declare all internal and third-party modules needed by the application
hidden_imports = [
    'contracts',
    'resources',
    'sim',
    'sim.camera',
    'sim.target',
    'sim.environment',
    'sim.motion_profiles',
    'sim.video_source',
    'detect',
    'detect.detector',
    'track',
    'track.kalman',
    'track.particle',
    'track.severity',
    'track.hybrid',
    'track.classifier',
    'track.reacquisition_zone',
    'control',
    'control.pid',
    'control.slew',
    'control.latency',
    'control.reacquisition',
    'disturb',
    'disturb.turbulence',
    'disturb.vibration',
    'disturb.noise',
    'disturb.occluder',
    'disturb.atmospheric',
    'metrics',
    'metrics.calculator',
    'metrics.logger',
    'metrics.batch_runner',
    'cv2',
    'numpy',
    'tkinter',
    'tkinter.ttk',
    'json',
    'csv',
    'math',
    'time',
    'dataclasses',
    'collections',
]

# Exclude large, unrelated machine learning / scientific packages installed in user python env
excluded_packages = [
    'torch',
    'torchvision',
    'torchaudio',
    'matplotlib',
    'pandas',
    'IPython',
    'jinja2',
    'pytest',
    'unittest',
    'test',
    'tests',
    'notebook',
    'jupyter',
    'sympy',
    'tornado',
    'sphinx',
    'botocore',
    'boto3',
    'PIL',
]

a = Analysis(
    ['verify_ui.py'],
    pathex=['.'],
    binaries=[],
    datas=added_files,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excluded_packages,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='FSOC_PAT_Simulator',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # Console enabled for stdout/stderr logs and CLI runs
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='FSOC_PAT_Simulator',
)
