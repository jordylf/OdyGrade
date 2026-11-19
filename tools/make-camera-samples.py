"""Encode the original synthetic scene into known source-profile fixtures.

Development-only dependencies: Pillow and NumPy. These are synthetic encodings,
not footage shot on a Sony/Panasonic camera or evidence of camera matching quality.
"""
from pathlib import Path
import json
import subprocess
import numpy as np
from PIL import Image, PngImagePlugin

root = Path(__file__).resolve().parents[1]
profiles = json.loads(subprocess.check_output(
    ["node", "-e", "console.log(JSON.stringify(require('./src/color-management.js').PROFILES))"], cwd=root, text=True))
source = np.asarray(Image.open(root / "assets/sample-source.png").convert("RGB"), dtype=np.float64) / 255
linear = np.where(source <= .04045, source / 12.92, ((source + .055) / 1.055) ** 2.4)
for key, filename in [("rec709-gamma24", "sample-gamma24.png"),
                      ("sony-slog3-sgamut3cine", "sample-slog3.png"),
                      ("panasonic-vlog-vgamut", "sample-vlog.png")]:
    profile = profiles[key]
    if profile["scene"]:
        peak = np.max(linear, axis=-1, keepdims=True)
        restored = .8 - .2 * np.log(np.maximum((1 - peak) / .2, 1e-12))
        scale = np.where(peak > .8, restored / np.maximum(peak, 1e-12), 1)
        matrix = np.asarray(profile["matrix"]).reshape(3, 3)
        camera = np.maximum((linear * scale) @ np.linalg.inv(matrix).T, 0)
        if profile["transfer"] == 2:
            encoded = np.where(camera >= .01125,
                (420 + np.log10((camera + .01) / .19) * 261.5) / 1023,
                (camera * (171.2102946929 - 95) / .01125 + 95) / 1023)
        else:
            encoded = np.where(camera < .01, 5.6 * camera + .125,
                .241514 * np.log10(camera + .00873) + .598206)
    else:
        encoded = linear ** (1 / 2.4)
    pixels = np.clip(np.floor(encoded * 255 + .5), 0, 255).astype(np.uint8)
    info = PngImagePlugin.PngInfo()
    info.add_text("Description", "Synthetic encoding fixture: " + profile["name"])
    path = root / "assets" / filename
    Image.fromarray(pixels).save(path, pnginfo=info)
    print(path)
