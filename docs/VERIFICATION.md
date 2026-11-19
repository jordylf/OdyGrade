# Verification — 2026-11-19
## Passed
- Node 24.12.0: node --test tests/*.test.cjs — **56 passed, 0 failed, 0 skipped** (panel multi-frame continuation).
- node tools/check.cjs — all JS/CJS/JSX syntax checked with Node vm.Script.
  This is a syntax check only, not ExtendScript host runtime verification.
- Real FFmpeg integration: PNG RGBA roundtrip; generated 33³ .cube loaded by lut3d
  with tetrahedral interpolation; compared with direct engine output.
  Mean per-channel error <1.1 code values, maximum error <12 on synthetic color patches.
- Real 1-second 12 fps video with audio: output 12 frames, ProRes HQ yuv422p10le,
  PCM s16le audio. This verifies codec/interchange, not input precision or host color science.
- CLI refuses existing output. Legacy `video` rejects spatial film controls;
  `video-native` renders the full implemented color/film stack.
- Browser served on loopback 127.0.0.1:5184; imported synthetic source/reference,
  created match, changed look and grain, toggled split/original/graded.
- Browser downloads observed: OdyGrade.json, OdyGrade-33.cube, OdyGrade-still.png.
- Browser recipe import restored fitted model; malformed JSON displayed error and
  retained the previous valid state.
- No horizontal overflow at widths 390, 720, 1100 and 1500.
- No JavaScript page errors during matching interaction.
- Imported recipe without a reference: correction edit rejected and slider/state rolled back.
- Final recipe validation also rejects missing/nonfinite fitted correction metadata.
- Browser screenshot: ../OdyGrade-preview.png (relative to source directory's parent).
  The BROWSER PREVIEW badge is intentional.

## Not verified / not implemented
- No live Adobe process, CEP panel load, capture or save-dialog execution tested.
- No automatic native editable timeline application exists.
- No production-footage/host validation of the implemented camera profiles; no other
  camera encodings, ICC, RAW, HDR or full ACES/mastering pipeline.
- No production short-film footage or multi-frame perceptual quality evaluation.
- No numerical matching to proprietary Pocket Grade/CopyCat output.
- No signed ZXP or clean-machine installation validation.
- No Resolve installation/integration testing.
- No neural inference/semantic segmentation; algorithm is statistical.
- CLI video encodes 10-bit, but a 33³ LUT learned from 8-bit source/reference stills
  does not imply the analysis recovered lost precision.

## Reproduce
npm test
npm run check
npm run dev
Use tools/ui-smoke.playwright.js through a Playwright MCP runner with the local
preview page selected. Browser tests are separate from the dependency-free unit suite.
npm run package stages unsigned CEP runtime assets.

## Native core continuation
- Actual Release build succeeded with MSVC 19.44.35229 / Visual Studio 2022 Build Tools
  and Windows SDK 10.0.26100.0, using CMake. No Adobe SDK/header shims were used.
- C++ executable passed six contract groups: 10 pixel layouts/padding, high precision
  and alpha, negative-stride/in-place rendering, failure-before-write validation, and
  deterministic temporal grain/transparent glow/concurrent rendering, and pixel-aspect matte geometry.
- Native-vs-JS differential tests exercised all ten looks plus a fitted model and
  correction controls. Color-only 8-bit output differs by at most one code value
  on the tested synthetic data; float results agree within 2e-6 on tested colors.
- Film still comparison allows mean difference <0.5 / maximum 2 code values because
  native film retains float intermediates while JS stills quantize color first.
- Native 16-bit input/output preserved a one-code-value distinction that an 8-bit
  intermediate would lose. Real FFmpeg PNG encoding/decoding also passed this check.
- Native recipe files and media paths with Unicode characters passed on Windows.
- Consecutive raw frames have deterministic changing grain; requesting frame 1 by
  itself matches frame 1 in the stream. This does not test host timestamps/keyframes.
- Transparent bright pixels no longer contribute glow into visible neighbors in
  either the JS film engine or native renderer.
- Recipes reject inherited/prototype look names, negative palette spread and bounded
  numeric overflow cases. Truncated native streams and malformed snapshots fail.
- FFmpeg-dependent native tests first skipped in the sandbox because its PATH omitted
  FFmpeg. Final suite ran in the environment where the installed tool was available:
  the native-core-stage suite passed 29 tests with 0 skipped. The later profile
  continuation below passed 42 tests, including all 10 native Node tests.

Build and reproduce: npm run native:build, npm run native:test.
Read native/README.md for memory, full-frame, alpha and precision contracts.
Portable C++ output is not an .aex/.prm, Adobe-host evidence, HDR support or a
real-time performance qualification. The official SDK download requires sign-in;
user confirmed continuing the core first. Native host integration remains incomplete.

## Input-profile continuation — version 0.2
- Full Node suite: 42 passed, 0 failed, 0 skipped, including FFmpeg media cases.
- MSVC Release rebuild and the five C++ contract groups still passed.
- Sony S-Log3 decode tested at published black, gray, white and segment breakpoint.
- Panasonic V-Log decode tested against published code values/formula; derived
  V-Gamut→Rec.709 matrix matches the manufacturer six-decimal matrix within 5.1e-7.
- D65 neutral preservation, distinct gamma-2.4 display input, bounded monotone
  project SDR view and normalized-domain black-bar filtering passed.
- Both camera profiles and display inputs agree with analytic JS in native float
  render tests within 2e-6 on the exercised colors/models.
- JSON v1 keeps its frozen model while reading as v2/sRGB. Native v1 snapshots
  remain readable. Mismatched and unsupported input profiles are rejected.
- Camera CLI fitting persisted source/model profile; real FFmpeg consumed exported
  65³ camera LUTs. Measured synthetic-grid error: Sony mean 0.2480 / max 22 code
  values, Panasonic mean 0.2497 / max 24. These extrema remain quality limitations.
- A previous independent-channel view produced a max error of 58 on the Sony grid;
  peak-RGB scaling reduced that outlier. Passing current bounds is not proof of
  mastering quality or parity with a manufacturer's display LUT/CopyCat.
- Browser: select profile, load corresponding synthetic fixture, match, default
  camera LUT precision 65, save/reopen v2 camera recipe, read v1/sRGB recipe, and
  reset while retaining source profile. No page errors or horizontal overflow at
  tested 390/720/1500 widths. Updated screenshot retains BROWSER PREVIEW badge.
- Source/reference fixtures are synthetic illustrations/encodings, not camera
  recordings or evidence of short-film perceptual matching quality.

Technical sources and view policy: docs/COLOR-MANAGEMENT.md. Actual Adobe host
load/capture/timeline application, SDK adapter build and real-footage grading
quality are still unverified/incomplete.


## Native video continuation — version 0.3
- Final complete Node suite: 50 passed, 0 failed, 0 skipped (~146 seconds).
  Includes real FFmpeg/ffprobe media tests; native Release tests passed six groups.
- CFR and VFR fixtures verified actual decoded frame count, PTS and final duration,
  complete PCM audio bytes, delayed audio and earlier audio with nonzero origins.
- Actual right-angle display rotation, anamorphic SAR, odd dimensions, silent alpha
  ProRes and CLI asynchronous dispatch were exercised. Grain changes by frame index.
- Read-back requires BT.709 primaries/matrix and IEC 61966-2-1 transfer metadata;
  encoder flags alone were insufficient, so frame setparams and MOV colr are used.
- Abort, throwing progress callback, broken renderer, source mutation and output
  publication race tests left no failed output/job directories or overwritten file.
- Planning rejects unknown final duration rather than guessing previous cadence;
  authoritative stream end is accepted when frame duration is unavailable.
- Synthetic demo: 24 frames, 12 fps, 2 seconds, 480x270 graded ProRes HQ with PCM24;
  side-by-side preview 960x270 H.264/AAC, checked with ffprobe. Left is synthetic
  S-Log3 input, right is the actual native output. Both carry explicit SDR metadata.
- This is offline full-frame CPU rendering. It does not establish Adobe timeline
  integration, realtime performance, production camera quality or Pocket parity.
  See NATIVE-VIDEO.md for supported inputs, retained audio and rejected cases.


## Multi-frame shot continuation — 2026-11-19
- Resumed after the user-requested pause. Complete suite: 55 passed, 0 failed,
  0 skipped in ~118.5 seconds. This supersedes the interrupted pre-pause run.
- New shot tests verify single-frame equivalence, pooled distributions from both
  contexts, <=60k source sample budget, invalid/black frames and brightness warnings.
- PTS sampling tests cover nonzero origins, VFR gaps, half-open explicit ranges,
  sample limits and empty/out-of-range rejection.
- Real CLI test decodes the expected requested frames, compares the fitted model
  to direct pooled fitting, retains the declared profile and emits a reusable LUT.
- Failure tests cover pre-decode/active-decode cancellation, throwing callbacks,
  source-stat mutation, output publication races and staging cleanup.
- Existing native-video regression still passes after sharing media-process helpers:
  CFR/VFR, alpha, rotation/SAR, clocks, complete audio, cancellation and no-overwrite.
- End-to-end synthetic recipe: nine sampled frames [0,3,6,9,12,15,18,21,23] from
  the two-second S-Log3 illustration clip. OdyGrade-shot-grade.json was consumed
  by video-native, which successfully published OdyGrade-shot-demo.mov with 24
  frames and stream-cfr mode. No spatial film controls were added to this recipe.
- Static JS/JSX syntax checks pass. UTF-8 UI text restored after a prior locale
  re-encoding error. Browser video sampling UI has not been implemented.
- No Adobe host/SDK gate was closed. Mathematical and synthetic moving-media
  checks do not establish production-footage matching quality or Pocket parity.


## Panel multi-frame continuation — 2026-11-19
- Complete Node suite: 56 passed, 0 failed, 0 skipped (~123.9 seconds). The new
  pooled auto-correction test checks stacked-image equivalence, one-frame
  compatibility and independence from stale correction values.
- tools/ui-shot.playwright.js passed against the actual loopback browser UI:
  two source PNGs contribute to the exported fitted model; navigation preserves
  that model; full-size still export uses the selected 96x64 source, not frame one.
- Exposure and profile changes refit both loaded frames. Auto balance gives the
  same model/settings from either preview selection.
- A partially invalid PNG batch and a 33-frame batch preserve previous frames and
  fitted model. Pooled imported recipes retain provenance; implicit correction/
  profile edits reject and roll back until an explicit Create grade.
- Responsive checks: no horizontal overflow at 390/720/1100/1500 pixels. No page
  JavaScript errors. A fresh page's favicon 404 was unrelated to application behavior.
- The original single-frame UI smoke also passed JSON/LUT/still download checks,
  matching/split preview and the same responsive sizes without page errors.
- Current OdyGrade-preview.png shows two original synthetic illustration variants
  in BROWSER PREVIEW. It is not a screenshot of a running Adobe effect.
- Source batches retain only small previews/analysis plus selected full-size image;
  limits are enforced, but peak browser memory/performance were not qualified.
