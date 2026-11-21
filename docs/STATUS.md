# OdyGrade implementation status

Latest (Claude, 2026-11-22): camera LOG profiles added (ARRI LogC3, Canon C-Log3, F-Log, D-Log,
Apple Log, BMD Film Gen 5), tests 60/60; not installed yet.
Earlier: Film stock presets (9, own emulation, snapshot v5, Adobe params
"Film stock"/"Stock amount") added, tests 58/58, harness PASS; dev.12 installed, AE live == offline (max 0/255), Premiere live mean 0.55/255.
Earlier: Grain format (8/16/35/65 mm + ISO) and Film format (weave, flicker,
dust, perforations) added, snapshot v4, tests pass; dev.11 installed, AE live frame 0 == offline (max 0/255), Premiere live mean 0.42/255 at matching frame index.
Earlier 2026-11-21: reference fit now compresses the saturated chroma tail
(snapshot v3; real clip p99 chroma 0.125 -> 0.104 vs ref 0.103); dev.10 installed; AE live == offline (max 1/255), Premiere live mean 0.43/255 from offline, chroma p99 0.104.
Also 2026-11-21: dev.9 applies the reference grade in Premiere with no
click (render-time read of this computer's pending grade, live-verified identical to
manual Load); "Load native grade..." still needed to carry it to another machine.
Native builds use the static CRT (host msvcp140 14.23 crashed dev.8). AE on dev.9 live: identical to dev.6.
Earlier (2026-11-20): panel "Apply to selected clips" live-verified in Premiere
and AE. dev.6 auto-embeds the reference grade in AE (no click, survives save);
the Premiere manual Load click is live-verified, including save/reopen persistence.
Media Encoder export from Premiere renders the effect identically (live-verified).
AE 32 bpc works (effect runs at 16 bpc, HDR >1.0 clipped); Premiere 32f path live-verified
(BGRA32F renders, no errors, SDR output == 8-bit); >1.0 values in Premiere untested.
AE undo/redo of apply verified (one step, embedded grade restored); Premiere undo/redo verified for first apply (1 step) and re-apply (replaces the
instance: 2 steps, previous grade restored exactly; new instance moves to stack end).
Real iPhone clip graded from a film still: AE live render == offline core (max 1/255);
Premiere (after Load click) mean 0.73 from offline, outliers only on chroma edges.
Also 2026-11-20: same .aex PASSES a live Premiere 24.6.1 smoke
(apply, render, .prproj save+reopen restores controls, identical pixels).
Premiere popup params are 0-based in scripting (AE 1-based). See HANDOFF.
Earlier (2026-11-19): native .aex 0.4.0-dev.5 PASSES a live AE 24.6 smoke
(instantiate, 8/16 bpc render, film, AEP save+re-import of controls/keyframes).
Root-cause fix: arbitrary param must be 0x0, flags 0, PF_PUI_NO_ECW_UI in AE.
Premiere, 32 bpc, AME, undo and panel-to-clip apply remain unverified. See HANDOFF.
Previous: user paused for Claude. SDK was supplied, a real .aex was compiled and installed, but host launch was rejected by automatic approval review and no Adobe runtime proof exists. Read the latest checkpoint at the top of docs/HANDOFF.md; older SDK-missing statements below are historical.
Target: Pocket Grade + CopyCat-inspired reference grading for indie short-film editors.
First required host: Premiere Pro 2024. AE 2024 second, Resolve later.
Product scope reaffirmed 2026-11-19: plugin only. Browser preview and CLI are
internal development tools, not separate user-facing applications. Further work
must prioritize actual Adobe effect integration over expanding standalone tooling.
Original implementation and look library; no proprietary Pocket binaries/assets analyzed or copied.

## Implemented (must be verified by tests)
- Offline sRGB image fitting: robust tone quantiles + tonal OKLab palette transfer.
- Separate exposure/WB correction, editable look strength, heuristic skin hue protection.
- 10 original built-in looks; no claimed film-stock measurements.
- Film still stylization: grain, bloom, red halation, vignette, bleach, aspect ratio.
- Frozen per-shot transform; no frame-by-frame fitting/flicker by design.
- CLI multi-frame shot fitting: explicit time range, time-uniform PTS sampling,
  bounded pooled statistics and a frozen standard recipe. See SHOT-ANALYSIS.md.
- Panel multi-still shot import, frozen preview navigation, pooled correction/
  profile refits and pooled auto balance; selected-frame full-resolution export.
- Browser UI, .cube LUT export 17/33/65, JSON grade recipes, still PNG export.
- CEP manifest / ExtendScript adapter for Premiere and AE 2024.
- Capture adapter uses undocumented QE in Premiere and saveFrameToPng in AE.
- LUT export is color-only; spatial effects are not silently baked into LUT.
- SDK-independent C++17 render core compiled with MSVC, matching analytic JS color output.
- Native full-frame film passes with deterministic frame-index grain and alpha-aware glow.
- 10 interleaved 8/16/float buffer conventions, explicit alpha mode, padded/negative row strides.
- Native still CLI decodes/renders/encodes real 16-bit PNG without an 8-bit intermediate.
- Source/native development archives can be regenerated with npm run archive.
- Explicit source profiles: sRGB, display Rec.709/gamma 2.4, Sony S-Log3/S-Gamut3.Cine,
  Panasonic V-Log/V-Gamut. Camera decoding/gamut conversion plus our own SDR view.
- JSON/native snapshot v2 stores input profiles; v1 remains readable as sRGB.
- Native snapshot v3 adds the reference chroma tail (p90/p99); v1/v2 still readable.
- Offline video-native runs the full implemented analytic color/film stack on
  RGBA16 streams, preserving CFR/VFR timing, alpha and relative PCM24 audio offsets.
- Verified color metadata, rotation/SAR handling, cancellable/supervised helpers,
  source-change detection and no-overwrite publication of validated output only.

## Not complete: do not claim Pocket parity or native timeline integration
- Live host panel load, capture, and export must be tested in Adobe.
- Timeline apply sets effect controls automatically; the reference snapshot embeds
  in AE; Premiere reads it from the local pending store until "Load native grade..." embeds it. Premiere re-apply replaces the effect instance so it stays undoable (see HANDOFF).
- Adobe-native real-time 16/32-bit timeline rendering and host keyframes. The portable core
  handles high-precision buffers, but is not an Adobe effect and is not performance-qualified.
- Other camera/LOG encodings, automatic metadata/range detection, ICC, complete
  ACES/HDR workflows, advanced gamut compression and production-footage validation.
- Semantic face/skin segmentation; current protection is a hue heuristic.
- Batch shot balancing and scene-cut detection. Shot pooling analyzes one manually
  selected range; the browser accepts manually selected stills without timestamps.
- Original measured stock emulation (film stock presets not built yet).
- macOS installers, signing, clean-machine validation, licensing/updates.
- Resolve adapter / editable node generation.

Source encoding is explicit; analysis and output use sRGB SDR. Limited camera input
transforms are implemented, not a complete ACES/scene-linear/HDR/RAW mastering system.
Camera LUT interpolation still has visible worst-case outliers on extreme synthetic
colors; this quality limit is recorded in docs/COLOR-MANAGEMENT.md.

## SDK gate (confirmed this continuation)
- Visual Studio 2022 C++ Build Tools and CMake are installed; core builds locally.
- Bounded search found no AE_Effect.h / AEConfig.h in the checked project/download roots.
- Official Adobe Developer Console redirects to sign-in. No SDK acquired or ABI invented.
- User explicitly chose to continue the core first while SDK is unavailable.
- Native adapter, PiPL, effect parameters and real Adobe host validation remain required.

The native video route is an offline execution/validation path, not an Adobe effect.
Its progressive/local-media, timing and disk/memory limits are in docs/NATIVE-VIDEO.md.
