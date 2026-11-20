# Claude handoff — OdyGrade
Updated: 2026-11-20 (Asia/Jakarta)


## Latest checkpoint — first real-footage grade (Claude, 2026-11-20)

- User iPhone clip (HEVC 1920x1080 rotated to 1080x1920, 60 fps, 3 s, BT.709 SDR)
  + user-supplied film still (palette strip/watermark cropped). Run folder
  work/adobe-host/runs/real-20261120-144200 (reference.png, grade.json/.odyn,
  f5/f15/f25 src+graded, compare.jpg).
- fit-shot --profile rec709-gamma24, 9 sampled frames: fitted model, look neutral,
  no exposure/WB correction. still-native renders: mean RGB 116/108/99 -> 80/84/70
  (darker, teal-green background, warm skin kept by 65% skin protection); identical
  means across the three frames (frozen per-shot transform, no flicker).
- LIVE AE 24.6.2 PASS on this clip (ae-live/): empty untitled project, MOV imported,
  1080x1920 comp, OdyHost.apply(grade.odyn + effectParams) -> linked=1 (link -19816).
  Graded frames at 0.5/1.5/2.5 s vs still-native run on AE's own effect-off frames:
  |diff| mean 0.00, max 1/255 (16 bpc). compare-ae.jpg = src | graded | reference.
- saveFrameToPng writes only after the script returns: queue frames, poll the file
  from outside. Rough wall time (file mtimes, incl. HEVC decode + 16-bit PNG encode):
  ~5 s/frame graded vs ~3 s/frame effect off; not a real-time playback benchmark.
- Not yet: Premiere on this clip; AE project left untitled/unsaved (user's to discard).

## Previous checkpoint — AE undo/redo of panel apply (Claude, 2026-11-20)

- LIVE AE 24.6.2 PASS (runs/ae-undo-20261120-025101): one Undo after apply removes
  the whole effect (0 effects, comp/layer intact); Redo (command 2035) restores it
  in the embedded state (Grade link -13415); redone render == earlier embedded
  render (0.0), 9.13 from source.
- Note: Kinetic wraps each script in its own undo group, so this proves undo of the
  whole apply step, not of OdyHost.apply's inner "Apply OdyGrade" group alone
  (panel calls via CEP evalScript have no outer group, so that group is the step).
- Note: Grade link embed overwrites controls with the snapshot's values (here
  Grain 35 -> 0); in real use panel params come from the same recipe.
- Premiere undo not tested (no scriptable undo; would need UI).

## Previous checkpoint — AE 32 bpc (Claude, 2026-11-20)

- LIVE AE 24.6.2, 32 bpc, Render Queue -> TIFF (runs/ae-link-20261120-012224/rq-*.tif):
  effect renders; 32 bpc vs 16 bpc output 0.33 mean|d|; grade delta 9.14 at both.
  The effect is not float-aware (no SmartFX), so AE runs it at 16 bpc inside a
  32 bpc project: values > 1.0 are clipped (SDR core by design). SmartFX/float is
  only needed for linear/HDR workflows; not started.
- comp.saveFrameToPng is unusable at 32 bpc (near-black even with no effect); use
  the Render Queue for 32 bpc captures.
- Premiere 32f (BGRA_4444_32f) path still unproven; user chose to stop at AE.
  Prepared, NOT run: adapter render trace "render fmt in/out" (opt-in trace file;
  1 BGRA8, 8 BGRA32F) and ppro-host-smoke.jsx job "depth <dir>" (Maximum Bit Depth
  off/on). OdyGrade-native-dev holds the dev.7-fmttrace build (sha e33a684e...),
  NOT installed; installed is still dev.6-link (sha 3aab7ae0...).

## Previous checkpoint — auto-embed via "Grade link" (Claude, 2026-11-20)

- .aex 0.4.0-dev.6-link installed (sha 3aab7ae0...). New last param Link
  ("Grade link", SUPERVISE slider -30000..30000). Param count 20 -> 21: dev.5 test
  projects may not reload; no user projects used dev builds.
- OdyHost.apply writes Folder.userData/OdyGrade/pending/<token>.odyn (prunes old
  pending files), sets Grade link=token LAST; the effect's USER_CHANGED_PARAM reads
  %APPDATA%/OdyGrade/pending/<token>.odyn, set_snapshot() embeds it, flips link to
  -token. apply reply has linked=<n acked>; panel shows the manual Load hint only
  when linked != count. Harness covers no-op / embed / ack.
- LIVE AE 24.6.2 PASS (runs/ae-link-20261120-012224): linked=1, link -13089,
  render differs from params-only (10.8) and from source (9.1); AEP save +
  re-import renders identical (0.0) and keeps the ack.
- LIVE Premiere 24.6.1: NOT auto-embedded. Premiere sends no USER_CHANGED_PARAM
  for scripted ComponentParam.setValue (probe: value stayed +24292). Panel falls
  back to the manual "Load native grade..." instruction there. Open idea if needed:
  Premiere-specific path (e.g. sequence data), not attempted.
- ppro-host-smoke.jsx gained job modes "apply <dir>" and "probe <dir>" (read-only).
- LIVE Premiere manual fallback PASS (UI-driven, runs/ppro-20261120-011840): the
  "Load native grade..." button opens the .odyn dialog; loading last-applied.odyn
  showed "Reference grade embedded in this effect", controls took the snapshot
  values (Look Neutral, ratio Original, trims 0), program view changed; after
  save + close + reopen the program view was identical (mean|d| 0.0, screen capture).
- LIVE Media Encoder 24 PASS (job "export <dir>", same run, ame/frame000-297.png):
  Premiere queued the sequence via app.encoder.encodeSequence + startBatch with the
  AME "PNG Sequence (Match Source)" preset; AME loaded the .aex and rendered.
  AME frame 179 (embedded-grade clip) == Premiere exportFramePNG reference (0.0);
  differs from ungraded source by 9.14 (AE linked render: 9.13 -> cross-host
  consistent). Clip-1 film frame vs Premiere film.png 1.32 (frame-varying grain).

## Previous checkpoint — panel "Apply to selected clips" (Claude, 2026-11-20)

- Panel button #applyNative (index.html, src/app.js effectParams) -> OdyBridge.apply ->
  host/bridge.jsx OdyHost.apply. Adds or reuses OdyGrade on selected AE layers
  (one undo group) / selected Premiere video clips (QE addVideoEffect; k-th DOM clip
  = k-th non-"Empty" QE item) and sets Look, 14 sliders, Frame ratio. Popups are sent
  0-based and mapped +1 for AE only.
- The reference-match snapshot lives in the arbitrary param, which no host script can
  set. Apply writes it to Folder.userData/OdyGrade/last-applied.odyn and the status
  tells the user to click OdyGrade > Load native grade... and pick that file.
  Exposure/temp/tint go into the trims (the effect zeroes them on load, as before).
  Open question: auto-embed without the extra click.
- LIVE Premiere 24.6.1 PASS (apply-result.json, job "apply <dir>" in
  tools/ppro-host-smoke.jsx): only the selected second clip got the effect;
  Look=1 read back 1 and rendered warm (R/B 1.09 -> 1.32 = Amber Hour), Grain 35,
  ratio 2; unselected clip unchanged.
- LIVE AE 24.6.2 PASS (runs/ae-apply-20261120-010128, via Kinetic in an empty
  Untitled project): only the selected layer got the effect; Look 0-based 1 -> AE 2
  (Amber), ratio 2 -> 3; second apply reused the instance (1 effect) and updated
  values; render warm R/B 1.09 -> 1.35, matching the earlier AE smoke.
  Undo of the "Apply OdyGrade" group not isolated (Kinetic wraps its own group).
- npm run check + npm test (56/56) pass.

## Previous checkpoint — first live Premiere pass (Claude, 2026-11-20)

- Premiere Pro 24.6.1 + installed .aex 0.4.0-dev.5: PASS (runs/ppro-20261120-004257).
  Effect listed by QE as "OdyGrade", applied to a still clip, rendered, saved to a
  scratch .prproj, project reopened, controls restored, reopened PNG == film PNG
  exactly (mean|d| 0.0). before->after 12.4, after->film 51.1. Alpha 255.
- Harness: tools/run-ppro-smoke.ps1 (refuses if Premiere runs) installs the dev
  runner tools/ppro-smoke-runner into %APPDATA% CEP extensions; it polls every
  10 s and evaluates tools/ppro-host-smoke.jsx, inert without
  %TEMP%/odygrade-ppro-job.txt. Job "<dir>" = create+render+save (phase1.json),
  job "reopen <dir>" = open that scratch project when NO project is open
  (host-result.json). -Remove uninstalls the runner (done after this run).
- PPro 24 quirk: app.project.closeDocument() ends the running ExtendScript (no
  error, no result); hence the two-phase job.
- IMPORTANT for panel->clip apply: Premiere popup values are 0-based through
  ComponentParam.setValue/getValue (AE is 1-based). Look=2 was "Nocturne" in
  Premiere, "Amber Hour" in AE; Frame ratio 4 clamped to 3. Map indices per host.
- Not tested yet: Premiere BGRA32f path (8-bit sequence only), keyframes in
  Premiere, AME export, undo, real footage.

## Previous checkpoint — host smoke made safe (Claude, 2026-11-19)

- tools/adobe-host-smoke.jsx rewritten: no app.newProject / app.open /
  project.close / app.quit anywhere. Runs only in an UNTITLED + EMPTY project,
  otherwise refuses untouched. Save/reopen is now "save scratch project to a new
  .aep in the scratch folder, then re-import that .aep and check Look + 2
  Exposure-trim keyframes" (re-parses flattened effect data without closing).
  Test dir comes from $.getenv('ODY_TEST_DIR'); no file is ever overwritten.
- New tools/run-ae-smoke.ps1: refuses if AfterFX.exe is already running (so the
  script can never reach a user session), creates a fresh timestamped folder in
  work/adobe-host/runs/, copies source.png, launches `AfterFX.exe -r`, waits for
  host-result.json. Never kills AE; user closes it.
- Static checks only: launcher parses, JSX parses, forbidden-call scan clean.
  NOT yet run in AE — needs the user's explicit go-ahead to launch After Effects.
- Run 1 (user approved): launcher started AE 24.6.2x2 cleanly (Untitled, 0 items,
  verified via Kinetic ae_status), but the cold-start `-r` script never executed:
  no host-result.json, project untouched. Re-sending `-r` to that instance was
  denied by the auto-mode classifier; Kinetic panel permission is "read", so no
  script route was bypassed. Pending: user runs File > Scripts > Run Script File
  > tools/adobe-host-smoke.jsx in that same AE window (env var is inherited).
  Launcher fix still needed: wait for AE main window, then send `-r`.
- Run 2 (via Kinetic, user raised panel to "script"): env var does NOT reach AE
  (broker relaunch), so the smoke now also accepts KineticArgs.dir. Native load
  PROVEN: app.effects lists "OdyWorks OdyGrade". saveFrameToPng is async in AE 24;
  smoke now waits for a nonempty PNG.
- ROOT CAUSE of AE crash on apply: opt-in trace (%TEMP%\OdyGrade-trace.log, only
  if that file exists) showed GLOBAL_SETUP -> PARAMS_SETUP -> crash inside
  PF_ADD_ARBITRARY2. AE_Effect.h:425 says AE arbitrary params MUST use
  PF_PUI_TOPIC/CONTROL or PF_PUI_NO_ECW_UI; we used only PF_PUI_INVISIBLE. Fixed
  to NO_ECW_UI|INVISIBLE (0.4.0-dev.3, sha 6dd7dbf3...). Installer gained
  -ReplaceExisting (refuses while AE/PPro run, backs up old .aex to the package).
  The SDK harness cannot catch this: it fakes add_param.
- dev.3 (NO_ECW_UI|INVISIBLE + CANNOT_TIME_VARY|CANNOT_INTERP) STILL crashed in
  add_param. dev.4 (Paramarama pattern 1x1, flags 0, NO_ECW_UI) no crash; AE
  reported "no custom ui outflag, but param has ui_width or ui_height". dev.5 =
  0x0, flags 0, PF_PUI_NO_ECW_UI (sha df1dbe02...), built + harness PASS, staged in
  OdyGrade-native-dev; needs AE closed, then install -ReplaceExisting and rerun.
- FIRST LIVE AE PASS (dev.5, AE 24.6.2x2, 2026-11-19 22:55, runs/20261119-225244):
  host-result ok=true. Effect instantiates, renders 8 & 16 bpc, film controls
  render, Look + 2 Exposure keyframes survive AEP save + re-import.
  Pixels: before->after Look Amber mean|d| 6.9 (R 126->140, B 115->104), 8 vs 16 bpc
  consistent, film16 differs 35.5 mean, reopened16 == film16 exactly, alpha 255.
  Limits: saveFrameToPng writes 8-bit PNG, so 16-bpc precision is NOT verified;
  no 32-bpc, Premiere, AME, undo, panel->selected-clip or .odyn load test yet.
  Trace stays compiled in but is inert unless %TEMP%\OdyGrade-trace.log exists
  (that file currently exists on this machine; delete it to stop tracing).

## Previous checkpoint — USER PAUSED, continue in Claude (2026-11-19)

User explicitly stopped Codex and wants to continue in Claude. Do not launch Adobe
or continue implementation without the user's next instruction. This checkpoint
supersedes historical statements below that the SDK or .aex is missing.

- Source: C:/Users/Lenovo/Documents/Codex/2026-11-18/ap/outputs/OdyGrade
- SDK ZIP supplied by user: E:/Download/decant/AfterEffectsSDK_27.0.0_win.zip
- ZIP SHA256: 802223c6e798b836267538691ac701057d1457356afdf1db986cfd96595c7a26
- SDK extracted safely into C:/Users/Lenovo/Documents/Codex/2026-11-18/ap/work/adobe-sdk-27/AfterEffectsSDK (432 members, 5,712,608 expanded bytes). SDK is not vendored in source/output archives.
- ACTUAL native Windows x64 effect compiled with SDK headers + PiPLtool and MSVC:
  .adobe-build/adobe/Release/OdyGrade.aex (0.4 development).
- Native development package: outputs/OdyGrade-native-dev/ (sibling of source):
  OdyGrade.aex, manifest.json, install.ps1, README.md.
- Installer ran with Windows UAC and its report verified success at
  C:/Users/Lenovo/Documents/Codex/2026-11-18/ap/work/adobe-host/install-result.json.
  Installed target: C:/Program Files/Adobe/Common/Plug-ins/7.0/MediaCore/OdyWorks/OdyGrade.aex
  Installed/bundled SHA256: BF9CE0B3914529F21638C6E4F4613A207912EF828BBEA93BB864F2E9093A88EC
  No other plugin was overwritten; no activation/licensing/registry modification.
- Actual host app inspected: AE executable version 24.6.2. Premiere/AE 2024 remain the targets.
- No native Adobe runtime load/render proof yet. A launch command was rejected by
  automatic approval review because tools/adobe-host-smoke.jsx closes a project
  without saving and isolation was not sufficiently established. THE COMMAND DID
  NOT EXECUTE. Do not retry through an indirect route. Revise the smoke to avoid
  project closing or prove a safely isolated owned test instance, then obtain any
  needed approval. User has now stopped work; no AE launch should happen now.

Implemented native adapter:
- native/adobe/adapter.cpp + adapter.hpp + OdyGradePiPL.r + CMakeLists.txt.
- Real EffectMain / PluginDataEntryFunction2 exports and PiPL resource.
- AE legacy ARGB8 / ARGB16 (32768 white), Premiere BGRA8/BGRA32f registration.
  Premiere formats are compiled but not host tested. No AE SmartFX/32-bpc path.
- Progressive full frames <=16 MP, explicit alpha mode, frame-index grain / pixel-aspect matte.
- Reference snapshot stored in arbitrary parameter (bounded UTF-8 text .odyn) with
  new/copy/dispose/flatten/unflatten/compare/interpolation/print/scan callbacks.
- Host look/strength/color/film controls. Exposure/WB are post-match trims, with a
  two-pass float intermediate, preserving the fitted model's correction state.
- Load native grade button opens .odyn, embeds contents and updates host controls.
  Intended manual workflow: reference fit in CEP panel -> Save native grade ->
  load it in the effect's Reference grade control. Automatic selected-clip apply
  is still NOT implemented or verified.
- Panel now has Save native grade (.odyn); native-recipe.js is loaded in HTML;
  ExtendScript saveText accepts odyn. Syntax check passes. This specific new
  panel-to-host export route has not been runtime/browser/CEP-tested yet.
- Build: node tools/adobe.cjs --sdk <extracted AfterEffectsSDK root>
- Harness: .adobe-build/adobe/Release/odygrade-adobe-tests.exe <native-snapshot.odyn>
  A fixture exists in work/adobe-host/grade.odyn. Harness passed actual SDK callback
  setup, 8/16-bit render, reference serialization, post-match trim, invalid data,
  alpha white normalization, interlace rejection and cancellation. It simulates
  host services using REAL SDK structs; it is not live Adobe compatibility proof.
- The prior complete Node suite passed 56/56 before this native adapter addition.
  Do not claim those tests cover the new adapter. The new adapter harness passed,
  and current JS/JSX syntax passed. Full suite not rerun after native export UI changes.

Next in Claude:
1. Inspect adapter/installer and use the SDK at the supplied path. Keep SDK external.
2. Fix host smoke safety first; no closing/replacing user projects. Verify native
   discovery, actual 2024 render and pixels, especially alpha/color/8/16/float.
3. Validate stored reference load, undo, save/reopen, host keyframes and Premiere/AME.
4. Complete panel-to-selected-clip application and AE 32-bpc/SmartFX/performance as required.
5. Update docs/STATUS.md and verification honestly, then package only verified artifacts.

Source has NO commits, all source remains untracked/uncommitted; nothing pushed.
Plugin-only product. Browser/CLI are internal development tools, never substitutes
for the native host acceptance gates. No claim of Pocket output parity.

## User intent / locked decisions
Jordy / Ody wants a plugin like **Pocket Grade + CopyCat**: import a film still,
auto-correct / match its color direction, keep controls editable, support short-film
workflows. The user explicitly clarified that the six-plugin Pocket CC suite is out
of the initial scope. Premiere Pro 2024 first; AE 2024 second; Resolve later.
Do not silently raise the minimum Adobe version to use UXP.
User requested these notes in Obsidian for development in Claude.
User clarified again on 2026-11-19: **plugin only, not a website/web product**.
CEP HTML/JS is an in-Adobe panel implementation; browser preview and CLI are
internal development/verification tools. Do not expand either into a separate
product or treat them as completing the plugin. Prioritize the real native host
adapter, editable timeline effect and Adobe validation. SDK acquisition is the
remaining prerequisite for compiling that adapter; do not invent SDK ABI types.
During the next continuation, the official SDK download required Adobe sign-in and
no local effect SDK was found in the bounded search. User explicitly chose
"Belum punya SDK, lanjut core dulu". The portable C++ renderer is now implemented;
do not claim that this removed the Adobe SDK/host-integration gate.

Working/source directory:
C:\Users\Lenovo\Documents\Codex\2026-11-18\ap\outputs\OdyGrade

## Start here
Read README.md, docs/STATUS.md, docs/REFERENCE-EVIDENCE.md, docs/VERIFICATION.md.
Run npm test and npm run check. npm run dev serves 127.0.0.1:5184.
No npm packages are required for the runtime or unit tests.
Native build/test: npm run native:build, then npm run native:test. CMake 3.20+
and a C++17 compiler are required; the Windows helper finds Visual Studio 2022.
FFmpeg/ffprobe must be on PATH for CLI media operations; missing tools skip those
integration tests, so check the test summary rather than claiming all media checks ran.

## Current architecture
- src/engine.js: shared UMD color engine, sRGB transfer ↔ OKLab, three tonal palette
  distributions, luminance quantiles, correction, frozen matching, hue protection,
  original ten-look library, JSON v2 model/recipe with v1 compatibility, .cube 17/33/65.
- src/film.js: CPU still stylization, deterministic grain, thresholded blur bloom,
  red halation, vignette, bleach, aspect ratio. Not physically calibrated film stock.
- src/app.js + src/worker.js: browser/CEP UI and asynchronous preview processing.
  Image import is capped at 16 MP / 50 MB. Preview is downsampled, PNG uses original size.
- src/bridge.js + host/bridge.jsx: minimal evalScript transport, experimental frame
  capture and save dialog. Host code is ES3 compatible; no Node integration enabled.
- CSXS/manifest.xml: PPRO/AEFT 24.x, CEP 11, unsigned development manifest.
- tools/cli.cjs: fit recipe, emit cube, full-resolution still, color-only ProRes video.
  Uses execFileSync arrays (no shell command interpolation), refuses to overwrite.
- tools/package.cjs and install-dev.ps1: stage/copy dev panel. Installer refuses
  existing destination; optional -EnableDebug modifies HKCU CSXS.11 PlayerDebugMode.
  Package generation does not install or change the registry.
- assets/: original synthetic scene, reference, sample recipe/LUT/still.
- tests/: mathematical/serialization/film tests plus real FFmpeg integration.
- native/: actual C++17 core, strict internal recipe reader, binary full-frame stream
  executable and C++ contract tests. Read native/README.md for buffer/memory limits.
- src/native-recipe.js: canonical internal snapshot compiled from validated JSON.
  It carries numeric fit state, controls and film parameters, never executable code.
- tools/native.cjs: local build/test; tools/native-still.cjs: real 16-bit PNG path.
  CLI commands native and still-native export a snapshot or process a high-bit-depth still.
- tools/native-video.cjs supervises RGBA16 pipes into the real core, ProRes HQ/4444,
  PCM24 audio and verified CFR/VFR timing. CLI video-native is asynchronous; only
  fulfilled Promise / zero exit after publication is success. Read docs/NATIVE-VIDEO.md.
- tools/fit-shot.cjs / CLI fit-shot samples a manually chosen shot time range,
  pooling frames with E.fitFrames into an ordinary frozen v2 recipe. Read
  docs/SHOT-ANALYSIS.md for ranges, precision, provenance and browser limitations.
- tools/media-process.cjs owns shared supervised helpers for probing, binary
  sample collection and rendering; regression-test both routes when changing it.
- Native look parameters are generated from src/engine.js at build time; do not maintain
  a second independently edited look table. C++ source has no Adobe SDK includes.
- src/color-management.js supplies explicit source encoding, log decoding and derived
  gamut matrices. Native profile constants are generated from the same module.
  Read docs/COLOR-MANAGEMENT.md before touching transfer, gamut or display rendering.
- tools/archive.py excludes .native-build/Git/signing material and produces source,
  unsigned CEP and a Windows x64 core-development kit with checksums.

## Important implementation limits
This is a functioning offline reference-grade foundation, not feature parity.
No native .prm/.aex, no automatic editable Lumetri timeline application,
no Resolve node creation. Host capture/panel installation is not live-verified.
There is now an actual static C++ library and standalone renderer. Neither implements
EffectMain, PiPL, host parameter blocks, arbitrary-data callbacks or timeline application.
Native C++ supports 10 buffer layouts, straight/premultiplied alpha and deterministic
temporal grain. It requires full frames for spatial passes, stages substantial memory,
has no cancellation/GPU/ROI implementation and has not been qualified for real-time.
Preview/still and LUT-based clip rendering are actual color transforms,
but passing these does not prove Adobe timeline behavior.

Source profiles now include sRGB, ideal-black display gamma 2.4, Sony standard
S-Log3/S-Gamut3.Cine and Panasonic V-Log/V-Gamut. Output remains sRGB SDR. No other
camera encodings, range/metadata detection, RAW, ICC, HDR or full ACES pipeline.
Our camera view uses peak-RGB highlight compression after decoding/gamut conversion;
it is not Sony/Panasonic's creative/display LUT. Negative gamut excursions are clipped.
65³ camera LUT interpolation has measured extreme-color outliers (max 22/24 code
values on the synthetic grid), although mean error is ~0.25. Do not erase this limit
or infer real-footage color quality from passing mathematical tests.
Skin protection is hue-based; no segmentation model. Matching cannot reproduce
lighting, wardrobe, production design, optics, or proprietary film-grade internals.
Ten looks here are original parameter sets, not the seller's LUT/PowerGrade assets.
Recipe stores frozen distribution plus settings; it does not embed source/reference.
An imported transform can be reused on another source; correction changes need
source/reference refitting. New source/reference normally clears a freshly fitted
match, except when an imported frozen recipe is intentionally retained.

## Next work in priority order
1. Verify CEP installation/loading in real Premiere 2024. Capture a known active
   sequence at CTI; confirm output exists and actually matches CTI, not frame zero.
   Test capture of non-ASCII paths and disabled filesystem permission failures.
   Keep host test media/project isolated; do not edit the user's existing project.
2. Prove supported color-managed input/output and host transfer characteristics
   with neutral ramp, chart, saturated patches, skintones and clipping tests.
   Introduce explicit camera LOG/gamut transforms with official formula references.
   The two named camera transforms and gamma-2.4 display input now exist and are
   mathematically tested. Remaining work is real camera/host validation, precision,
   better gamut mapping, more profiles and a mastering-grade color pipeline.
3. Implement real editable timeline rendering. Inspect installed SDK availability.
   Portable rendering is already available: native/include/odygrade/core.hpp.
   Obtain the real Adobe SDK first; do not approximate SDK ABI structs or download
   unofficial old SDK copies to make an apparent plugin build.
   Preferred architecture to evaluate: shared C++ render core with AE effect SDK
   compatibility for Premiere + .aex, CEP panel handles analysis/reference/UI.
   Confirm SDK host differences and parameter serialization before selecting it.
   A UXP-only path is incompatible with the locked Premiere 2024 requirement.
   Do not substitute a rendered still layer for native clip effect application.
4. Use saved immutable match parameters/LUT in native renderer; add film spatial
   passes, seeded temporal grain and parameter/keyframe controls. Ensure export
   and preview agree in the same color pipeline. Preserve alpha correctly.
   The core already has immutable analytic transforms, spatial passes, seeded grain
   and explicit alpha contracts. Remaining work is SDK storage/parameters, host
   render callbacks, ROI/cancellation/performance and actual timeline/export tests.
5. Test actual short-film footage: diverse skin, mixed lighting, tungsten, night,
   outdoor foliage, low-key scenes, strong palette mismatch, scene cuts.
   Compare multiple frames and scope measurements. Synthetic tests are insufficient.
   CLI shot pooling is now implemented, but it does not detect cuts, balance
   multiple shots or compensate changing exposure. Keep these requirements open.
6. Add batch shot balancing, semantic protection, measured stock transforms and
   remaining format emulation (gate weave, flicker, dust/perforations) as needed.
7. AE integration validation, then Resolve adapter/editable nodes. Obtain/test
   Resolve before promising Studio/free compatibility.
8. Signed ZXP, clean-machine installation, versioning, model/tool integrity,
   licensing/update plan only after core native workflow works.

## Product-reference investigation
Only rendered public marketing page inspected. Read-only REA doctor found stale
Codex registration; CLI 6.4.0 exists but no engines connected here. No configuration
repair or proprietary artifact analysis was performed. If user supplies a legally
available plugin/package, use the reverse-engineer-anything skill for actual artifact
evidence. Ordinary source development does not require REA.

## Environment / housekeeping
Windows 11. Node 24.12.0, Python 3.13, Pillow and NumPy installed; FFmpeg on PATH.
Premiere Pro 2024 and AE 2024 directories exist. Neither was running during initial
inspection. Obsidian CLI exists but could not reach a running Obsidian instance;
project note is updated directly in the vault as instructed by global AGENTS.md.
Port registry read before selecting 5184; server binds only loopback.
Read 00 - Codebase Memory Hub.md and relevant project note on session start.
Architecture decisions also persisted with codebase-memory MCP manage_adr.
Check actual git status; do not add AI attribution or push without request.

Native continuation environment: Visual Studio 2022 Build Tools / MSVC 19.44.35229,
Windows SDK 10.0.26100.0, CMake bundled with Build Tools. The sandbox shell omitted
FFmpeg from PATH although the external development shell could find it. Do not
misreport skipped media tests as passed; final media/native tests used the available
FFmpeg environment. Kinetic AE status returned NO_PANEL; no permission was bypassed
and no live-host test was claimed.

Profile continuation: JSON v2 declares inputSpace and outputSpace; model stores its
fit inputProfile. Legacy JSON/native v1 stays sRGB. Reject profile mismatch and
refit from source/reference on profile changes. UI reset retains the source profile;
demo loading selects synthetic profile-encoded fixtures. assets/sample-grade.json
intentionally stays v1 for compatibility tests. Do not overwrite that fixture without
moving the regression data. Source analysis ignores black bars after normalization.

Video continuation (0.3): optional pixel-aspect context shapes native aspect bars;
it is not a recipe parameter. One frozen grade renders the entire clip. VFR uses
16-bit PNG caching plus an explicit endpoint/video-only trim to preserve final
duration before adding audio; no final shared frame cap truncates its tail. The
common origin is the earliest video/audio start, preserving earlier/delayed audio.
All audio streams become PCM24. Unknown final timing is rejected, not guessed.
Frame-level color properties must be set as well as encoder flags; verify readback
metadata. Abort, helper/pipe/callback failure, source mutation and publish collisions
clean the supervised job and never replace a user's output. The old video command
remains the LUT-only compatibility path. Scratch use/performance, source formats and
metadata limitations are documented. Synthetic MOV/MP4 deliverables demonstrate
actual native frame processing, never camera footage or a Premiere/AE capture.
Host-native effect parameters, render callbacks, cancellation/ROI/GPU behavior and
real timeline/export tests remain unimplemented; offline cancellation is separate.


Shot continuation (2026-11-19): resumed from docs/PAUSED.md and reran the whole
suite: 55 passed, no failures/skips. Added five shot-analysis tests. Synthetic
nine-frame recipe + actual 24-frame native movie are next to the source directory
as OdyGrade-shot-grade.json and OdyGrade-shot-demo.mov. These are illustrative
synthetic fixtures, not camera-footage validation. Analysis is 8-bit, rendering
is RGBA16 transport. Film defaults remain zero. Recipe provenance is informational;
browser re-save now preserves both the model and CLI provenance. The offline recipe
works with existing native render/cube commands; no SDK/host integration claimed.


Panel continuation (2026-11-19): source input/drop accepts 1-32 selected stills,
100 MB total / 50 MB and 16 MP per file. Sequential decode commits only a complete
valid batch. Small previews/analysis are retained; selecting a preview reloads
that file for full-size still export. Matching/correction/profile refit and auto
balance pool all loaded samples. Preview navigation never refits the model.
Imported pooled recipes preserve informational provenance on save and require an
explicit Create grade before correction/profile refitting, preventing accidental
single-still replacement. Browser has manual still selection, not video extraction.
Read SHOT-ANALYSIS.md. Full suite 56/56 without skips plus both browser smoke scripts
passed; run ui-shot.playwright.js through Playwright MCP for pooled workflow proof.
Native Adobe host integration and production-footage quality gates remain open.


Native plugin prerequisite rechecked 2026-11-19: official Get the SDKs link leads
to Adobe Developer Console and redirected to Adobe Sign in in the connected
browser. User was asked to download/extract After Effects C++ SDK and provide
its root containing Examples/Headers/AE_Effect.h. No credentials were entered.
Kinetic AE still returned NO_PANEL. Further browser/CLI product expansion is out
of scope. See NEXT-NATIVE-INTEGRATION.md for the concrete next compile/load gates.
