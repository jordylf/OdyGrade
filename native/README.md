# Portable native render core

This is a compiled, SDK-independent C++17 renderer. **It is not an Adobe plugin**:
there is no EffectMain, PiPL resource, `.aex`/`.prm`, host parameter registration,
timeline effect application, or Adobe SDK in this directory.

## Build and verify

```
npm run native:build
npm run native:test
```

Requires Node 18+, CMake 3.20+, and a C++17 compiler. On Windows, the build script
finds Visual Studio 2022 C++ Build Tools / CMake through vswhere. Set
`ODYGRADE_CMAKE` to an explicit executable if needed. Generated outputs live in
`.native-build/` and are excluded from source archives. Look parameters are
generated from the JS library at build time to prevent two drifting look libraries.

The renderer reads validated internal snapshots generated from JSON:

```
node tools/cli.cjs native --recipe assets/sample-grade.json --output grade.odyn
node tools/cli.cjs still-native --recipe assets/sample-grade.json --input frame.png --output graded16.png
node tools/cli.cjs video-native --recipe grade.json --input clip.mov --output graded-film.mov
```

`still-native` requires FFmpeg/ffprobe. It decodes and encodes 16-bit RGBA; the core
does not roundtrip through 8-bit pixels. Output is PNG and existing files are refused.
It applies the complete implemented color + spatial film stack. Source encoding is
explicit in the recipe: sRGB, display gamma 2.4, S-Log3/S-Gamut3.Cine or V-Log/V-Gamut.
Output is sRGB SDR. See ../docs/COLOR-MANAGEMENT.md for the technical/view distinction.

## Integration contract

- `include/odygrade/core.hpp` exposes immutable recipe structures and full-frame
  rendering. Source/destination must have equal dimensions and valid buffers.
- RGBA/BGRA/ARGB 8-bit, RGBA/ARGB 16-bit (65535 white), separate RGBA/ARGB 16-bit
  formats with 32768 white for future AE adapters, and RGBA/BGRA/ARGB 32-bit float.
  These are tested buffer conventions, not proof of Adobe host interoperability.
- `row_bytes` may include padding or be negative. The pointer always denotes the
  logical first row. Caller owns allocation/lifetime and must supply enough memory
  for every addressed row. The core cannot discover allocation bounds from pointers.
- Straight and premultiplied alpha are explicit. Premultiplied source colors are
  unpremultiplied for grading; output is premultiplied only if requested. Alpha is
  preserved within destination precision. Zero-alpha premultiplied RGB is zero.
- Pixel, recipe and stride validation happens before destination writes. Invalid
  settings, stale fitted correction and nonfinite pixels fail instead of silently
  producing a partial grade. Full-frame staging also permits in-place rendering.
- Grain changes deterministically with frame index; identical frames/indices are
  repeatable regardless of render order or concurrent invocation. No per-frame fit.
- Bloom/halation ignore invisible highlight contributions. Film math retains float
  intermediates; JS stills quantize color to 8-bit before film. Corresponding outputs
  are compared with a declared tolerance rather than claimed bit-identical.
- Color is clipped to SDR output [0,1]. Float storage is not a promise of HDR.
- Optional pixel_aspect render context defaults to 1 and shapes aspect bars in
  display geometry. The raw CLI accepts it after first-frame-index as a decimal.
  This does not change fitting or imply a physically calibrated blur model.
- Input matrices and look constants are generated from the JS modules. Internal
  snapshot v2 records source and model profiles; v1 snapshots still read as sRGB.
  A model/profile mismatch fails rather than silently reinterpreting fitted data.
- Spatial passes require a full frame. Tiled rendering, cancellation/progress,
  GPU acceleration, per-instance scratch allocation and host ROI handling are not
  implemented. Whole-frame staging has a substantial memory footprint at 4K+;
  performance has not been qualified for real-time playback.
- The command-line executable accepts tightly packed straight-alpha frames on
  binary stdin and writes binary stdout; it rejects a truncated final frame.
  Use Node child-process buffer APIs. Windows PowerShell text pipes can corrupt
  binary pixel data. This stream interface does not preserve timestamps by itself.

## Adobe SDK gate

The Node video helper separately restores timing/audio around the raw pixel core.
See ../docs/NATIVE-VIDEO.md for VFR caching, cancellation, verification and limits.
This offline route does not satisfy the live-host gate below.

The official Adobe Developer Console required login during this session. A bounded
search did not find `AE_Effect.h` / `AEConfig.h` locally. User explicitly selected
"continue the core first". Obtain the actual SDK from the user's Adobe account
before writing and compiling the adapter. Do not reconstruct SDK ABI structs or
fetch unofficial old SDK copies to pretend the plugin built successfully.
See `../docs/NEXT-NATIVE-INTEGRATION.md` for the remaining host acceptance gates.
