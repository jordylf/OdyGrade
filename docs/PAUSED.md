# Paused for Claude continuation — 2026-11-19


## Latest checkpoint — USER PAUSED, continue in Claude (2026-11-19)

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

