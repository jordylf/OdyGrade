# Native host integration gate
This is the largest remaining gap to the requested Pocket Grade + CopyCat workflow.
User reaffirmed plugin-only scope on 2026-11-19. Browser/CLI feature expansion must
not replace this native host milestone. A CEP development ZIP plus a standalone
renderer is not an installable color effect.

The SDK-independent core now exists under native/ and compiles locally. Use its
immutable recipe/buffer API after validating actual host suite formats. Its
standalone executable and PNG tests do not satisfy any of the Adobe-host gates below.
The official SDK download required Adobe login; user chose to continue core work
first. Real SDK acquisition is still required before compiling host adapters.

## Current handoff gate — rechecked 2026-11-19

The official [After Effects developer page](https://developer.adobe.com/after-effects/)
links Get the SDKs to [Adobe Developer Console](https://developer.adobe.com/console/servicesandapis/ae).
Opening that exact link in the connected browser redirected to Adobe Sign in.
No SDK archive was found in the checked top-level Downloads folder. No user login
was performed. Kinetic AE status returned NO_PANEL; no host render was claimed.

Required user action: sign in on Adobe's page, download/extract the After Effects
C++ SDK, then supply the local SDK root containing Examples/Headers/AE_Effect.h.
Credentials are not needed in chat. User has been asked for the extracted path.

Once supplied, inspect the actual SDK headers, license, examples and PiPL build
tools first. Verify target compatibility with Premiere/AE 2024 before writing the
adapter/build target against those headers. Then build/load a real native effect
and execute the host evidence checklist below. Existing core builds and green
offline tests are not substitutes for that compile/load/export evidence.

## Premiere Pro 2024
Do not use a UXP-only integration requiring Premiere 25.6+. Keep CEP analysis/UI
while evaluating native effect SDK support for a render effect with stored match
data plus color/film parameters. Adobe AE SDK effects can be compatible with Premiere,
but suites, pixel layouts, render callbacks, threading and parameter serialization
must be validated on both hosts before choosing a shared binary architecture.

A correct integration must:
- Apply to the intended selected clip(s), not all clips or the active project.
- Preserve original media, existing effects and edits; support undo.
- Store enough transform data in the project for reload/render without an open panel.
- Keep exposure, match strength, skin protection and film controls editable.
- Agree with panel preview in an explicitly managed input/output color pipeline.
- Handle alpha, 8/16/float formats, arbitrary render rectangles and row strides.
- Support deterministic temporal grain and avoid per-frame model refitting.
- Fail visibly if the matching effect is missing; never report success after only
  exporting a LUT or inserting a still image.
- Render correctly via Premiere export / Media Encoder, including panel closed.

## Evidence needed before calling this complete
A real Adobe 2024 project with known synthetic chart and moving video:
1. Apply grade from panel to chosen clip.
2. Change parameters in host Effect Controls; verify frames/scopes change as expected.
3. Undo/redo and save/reopen; verify stored transform and source media remain intact.
4. Compare multiple export frames against reference renderer with a declared tolerance.
5. Exercise nonzero film effects in playback and export.
6. Test alpha and high-bit-depth footage, missing dependencies and fresh installation.
7. Capture real host screenshots with version and project context.
The current browser screenshot and CLI ProRes test do not satisfy these gates.
