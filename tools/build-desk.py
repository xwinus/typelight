#!/usr/bin/env python3
"""Fetch the desk texture into textures/.

The desk is "Wood Table Worn" from Poly Haven (photography: Dimitrios Savva,
processing: Rico Cilliers), CC0 1.0. Two of its maps are used:

  desk.jpg         the colour of the wood, shown as the page background
  desk-normal.jpg  its surface relief, which the lamp's shader lights

Needs Python 3.9+ and ffmpeg on PATH.

    python3 tools/build-desk.py
"""
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache"
OUT = ROOT / "textures"
BASE = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg"
ASSET = "wood_table_worn"

# (map, resolution, output, output size in px, ffmpeg JPEG quality: lower is better)
# The normal map must stay a power of two: the shader tiles it.
MAPS = [
    ("diff", "2k", "desk.jpg", 1536, 3),
    ("nor_gl", "1k", "desk-normal.jpg", 1024, 2),
]


def fetch(name, res):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f"{ASSET}_{name}_{res}.jpg"
    if not path.exists():
        url = f"{BASE}/{res}/{ASSET}/{path.name}"
        print(f"downloading {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (texture build script)"})
        with urllib.request.urlopen(req, timeout=120) as r:
            path.write_bytes(r.read())
    return path


def main():
    OUT.mkdir(exist_ok=True)
    for name, res, out, size, quality in MAPS:
        src = fetch(name, res)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src),
                        "-vf", f"scale={size}:{size}:flags=lanczos", "-q:v", str(quality),
                        "-map_metadata", "-1", str(OUT / out)], check=True)
        print(f"{out}: {(OUT / out).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
