# OdyGrade
Local reference-based color grading, initially targeting **Premiere Pro 2024**.
AE 2024 adapter is included but unverified. Resolve is future work.
This is an early implementation, not a finished Pocket Grade replacement.
The requested product is an **in-Adobe plugin only**. Browser preview and CLI
are internal development tools. The current CEP development package and portable
core are not a working native timeline effect; the real Adobe SDK/adapter gate
in docs/NEXT-NATIVE-INTEGRATION.md must be completed before calling it a plugin release.

The SDK-independent native C++ renderer now builds and has differential tests against
the JS engine. It supports high-precision buffers and 16-bit PNG still rendering;
it is **not** a compiled Adobe effect. Full-film video rendering is now available
through video-native; see docs/NATIVE-VIDEO.md for the offline pipeline contract.

## Run
Node 18+; zero npm dependencies.
- npm test
- npm run check
- npm run dev
- Open http://127.0.0.1:5184
- npm run package — stage unsigned CEP assets

Load a source still and film/reference screenshot, then Create grade.
Fine-tune correction, look strength, skin hue protection, palette and film controls.
Save JSON to resume work; export .cube for the color transform or PNG for a full still.

**Choose the source profile; output is sRGB SDR.** Supported sources are sRGB,
Rec.709 display gamma 2.4, HLG/Rec.2020 (iPhone HDR), and log curves from Sony, Panasonic,
ARRI, Canon, Fujifilm, DJI, Apple and Blackmagic (see docs/COLOR-MANAGEMENT.md).
Use sRGB if your editor already normalized the footage. Camera values must be full
range and unconverted. Reference screenshots remain sRGB. The camera profiles use
official transfer/primary definitions plus our own SDR view, not a manufacturer's
creative LUT or full ACES/HDR/RAW workflow. Read docs/COLOR-MANAGEMENT.md.
Synthetic samples demonstrate controls, not production footage quality.

## Use the LUT in Adobe / Resolve
Premiere: Lumetri Color > Creative > Look > Browse, then select the .cube file.
The LUT must receive the input encoding stored in its recipe and outputs sRGB.
The Creative Look example is appropriate only when its input matches that encoding;
Adobe's host pipeline has not been verified here. A camera LUT includes normalization:
do not apply another camera conversion before it. Camera LUTs default to 65³ and
still have interpolation error on extreme colors; see docs/COLOR-MANAGEMENT.md.
AE: apply a compatible LUT-loading effect manually. Resolve: import the LUT
and apply at a stage matching the recipe's input domain. Native editable node construction
and automatic timeline application are **not implemented**.
Spatial film effects cannot be encoded in .cube; they exist in PNG exports and JSON.

## Install (Windows, After Effects / Premiere Pro 2024)
Build the effect (node tools/adobe.cjs --sdk <AfterEffectsSDK>), then npm run release.
It writes ../OdyGrade-<version>-win64.zip with Install.cmd / Uninstall.cmd / README.txt:
panel per user (unsigned, so CSXS.11 PlayerDebugMode is enabled), effect into
Program Files\Adobe\Common\Plug-ins.0\MediaCore\OdyWorks after one UAC prompt and a
SHA-256 check. Close both hosts first. Not a signed ZXP; not tested on a clean machine.
Version lives in package.json; tests/version.test.cjs keeps CSXS, CMake, PiPL and the
effect's my_version equal to it.

## Adobe 2024 CEP development installation
1. npm run package
2. Review tools/install-dev.ps1.
3. powershell -ExecutionPolicy Bypass -File tools/install-dev.ps1 -EnableDebug
4. Restart Premiere/AE 2024. Open Window > Extensions > OdyGrade.
The script copies a development build into the per-user CEP folder and optionally
enables CSXS.11 PlayerDebugMode. It refuses to overwrite an existing installation.
These actions are not performed just by generating the package.
No signed ZXP is supplied. Do not describe this as a production installer.

## Native core development

```
npm run native:build
npm run native:test
node tools/cli.cjs still-native --recipe assets/sample-grade.json --input assets/sample-source.png --output graded16.png
```

Build requires CMake 3.20+ and a C++17 compiler (Visual Studio 2022 Build Tools on Windows).
Native still rendering additionally requires FFmpeg/ffprobe. Pixel processing retains
16-bit precision; this does not recover precision missing in an 8-bit source/reference.
Native tests are skipped by npm test if the renderer has not been built. Run
native:build and native:test explicitly before claiming native verification.

npm run archive regenerates source, CEP-development and Windows-native-development
ZIPs under outputs using Python's standard library. The native development kit is
unsigned, requires a compatible Windows VC runtime, and is not a clean-machine installer.

Host capture is experimental: Premiere uses undocumented QE, AE uses
saveFrameToPng. The adapter never changes project in/out points or timeline clips.
If capture fails, manually export an image and load it. Current host verification
status and missing product features are in docs/STATUS.md.

## Algorithm
Fit robust luminance quantiles and three tonal-region OKLab chroma means/scales.
Exclude transparent pixels and near-black bars. Apply bounded palette transfer,
monotone luminance matching, optional skin-hue protection, and independent controls.
One fitted model is reused without per-frame analysis. This avoids algorithmic
frame-to-frame pumping; it does not solve shot changes, lighting changes or tracking.
Skin protection is a color heuristic, not semantic detection.
The current method is statistical, not a trained neural model.
Input normalization precedes analysis; source/reference black bars are excluded
in that normalized domain. JSON v2 stores the profile and reads v1 files as sRGB.

## Development handoff
Read docs/HANDOFF.md, docs/STATUS.md, and docs/REFERENCE-EVIDENCE.md before extending.
Do not confuse passing mathematical tests or browser screenshots with host evidence.
Keep unsupported features explicit. No proprietary Pocket assets, presets or
algorithms are bundled. All look names and look parameters here are original.

## CLI media workflow
node tools/cli.cjs help

Use fit for a frozen recipe, cube for a LUT, and still for PNG. video-native applies
the full C++ stack with RGBA16 transport, preserved CFR/VFR timing, alpha-aware
ProRes output and offset-preserving PCM24 audio. See docs/NATIVE-VIDEO.md.
The legacy video command remains LUT/color-only and rejects spatial film controls.
FFmpeg is external. Native video is offline execution, not an Adobe timeline effect.
Use profiles to list source encodings and fit --profile <id> to select one.

Use `fit-shot` to analyze several time-sampled frames from one shot instead of a
single still. The resulting frozen recipe works with `video-native` and LUT export.
See [shot analysis](docs/SHOT-ANALYSIS.md) for commands, range semantics and limits.
