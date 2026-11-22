# Input profiles and SDR rendering — 0.2

Source encoding is now explicit. Reference screenshots and final output are sRGB.
The same normalization runs in browser previews, fitting, analytic C++ rendering,
still export, and LUT generation. A LUT includes normalization and therefore must
receive the selected input encoding; applying it after another camera transform
would normalize the material twice.

| Profile ID | Input contract |
| --- | --- |
| `srgb` | Already normalized, display-referred sRGB RGB. Default and all legacy v1 recipes. |
| `rec709-gamma24` | Full-range RGB with Rec.709 primaries, ideal-black gamma 2.4 display encoding. Not the camera BT.709 OETF or arbitrary monitor black compensation. |
| `sony-slog3-sgamut3cine` | Full-range S-Log3 code values with standard S-Gamut3.Cine primaries. Not S-Gamut3, S-Log2 or VENICE variants. |
| `panasonic-vlog-vgamut` | Full-range V-Log code values with V-Gamut primaries. No inferred camera model, legal-range conversion or metadata detection. |
| `arri-logc3-awg3` | Full-range ARRI LogC3 (EI 800, SUP 3.x) with ARRI Wide Gamut 3. Other EI curves and LogC4/AWG4 are not covered. |
| `canon-clog3-cinemagamut` | Full-range Canon C-Log3 (v1.2 formula) with Cinema Gamut, decoded to scene reflection (x0.9). |
| `fujifilm-flog-fgamut` | Full-range Fujifilm F-Log (not F-Log2) with F-Gamut (Rec.2020 primaries). |
| `dji-dlog-dgamut` | Full-range DJI D-Log with D-Gamut. Not D-Log M. |
| `apple-log-rec2020` | Apple Log (iPhone) with Rec.2020 primaries. |
| `blackmagic-film5-wg5` | Blackmagic Film Generation 5 with Blackmagic Wide Gamut Gen 5 (D65 used as white; BMD publishes 0.312717, 0.3290312). |
| `hlg-rec2020` | Full-range HLG (BT.2100) with Rec.2020 primaries, e.g. iPhone HDR video (Dolby Vision 8.4 HLG base layer). Scene-light inverse OETF, no HLG OOTF; BT.2408 diffuse white (75% signal) = 1.0, 18% grey at 38%. Use only on unconverted HLG pixels; choose sRGB if the host already tone-mapped to Rec.709. |

PNG/JPEG/WebP import uses browser-decoded values. This is not RAW decoding or an ICC
profile engine. Host captures may already contain a display/color transform; choose
sRGB if the editor has already normalized them. Files whose numeric values have
been remapped from camera full range need correct preprocessing, not a different
camera dropdown guessed from the picture's appearance.

## Technical transforms and evidence

Sony transfer uses the manufacturer's published S-Log3 inverse, with black at
95/1023 and 18% reflection at 420/1023. The vendor-supplied Academy CTL resolves the
typographical `out +` in the low segment of the old PDF: the operation is assignment.
References: [Sony technical summary](https://pro.sony/s3/cms-static-content/uploadfile/06/1237494271406.pdf),
[Sony-supplied CTL](https://github.com/ampas/aces-dev/blob/v1.3/transforms/ctl/idt/vendorSupplied/sony/IDT.Sony.SLog3_SGamut3Cine.ctl).

Primaries come from the Academy's pinned ACES v1.3 color utility definitions:
standard S-Gamut3.Cine uses green (0.225, 0.800), and the D65 white is shared with
Rec.709/sRGB. The module derives a row-major RGB→XYZ→linear Rec.709 matrix from
those chromaticities; it does not apply the ACES output transform or claim to be
a complete ACES IDT/ODT pipeline.
[Primary definitions](https://github.com/ampas/aces-dev/blob/v1.3/transforms/ctl/lib/ACESlib.Utilities_Color.ctl).

Panasonic transfer uses the published V-Log inverse with the 0.181 breakpoint.
The derived V-Gamut→Rec.709 matrix is tested against the manufacturer's printed
matrix to the precision of its six-decimal values. Both profiles are tested on
documented black/gray/white values and D65 neutral preservation.
[Panasonic reference manual](https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf).

The gamma 2.4 display profile is the ideal-black special case of BT.1886. No camera
OETF decoding or configurable nonzero monitor black is implied.
[ITU-R BT.1886](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1886-0-201103-I!!PDF-E.pdf).

Added 2026-11-22: ARRI LogC3, Canon C-Log3, Fujifilm F-Log, DJI D-Log, Apple Log and
Blackmagic Film Gen 5. Curves and primaries are the manufacturers' published values as
collected in colour-science (colour/models/rgb/transfer_functions and datasets, which cite
each white paper). Tests check each decode against an independent forward formula,
the published 18% gray code (LogC3 0.391, C-Log3 0.343, F-Log 470/1023), the published
AWG3 / D-Gamut / BMD WG RGB->XYZ matrices, and D65 neutral preservation; native parity
is covered for every profile.

## Our display rendering and its limits

For camera profiles, decoding and gamut conversion first produce scene-linear
Rec.709 RGB. The project then supplies its own SDR view: leave peak RGB up to 0.8
unchanged; above this, map the peak to `0.8 + 0.2*(1-exp(-(peak-0.8)/0.2))` and scale
all channels by the same ratio. Clip negative out-of-gamut components and encode
sRGB. This retains positive-channel ratios and preserves middle gray. It is not
Sony LC-709, Panasonic V-709, measured film stock or an ACES display rendering.

The view is applied before analysis/correction. It is an SDR starting point;
recovery/grading of uncompressed scene highlights, advanced gamut compression,
full HDR/RAW workflows and other camera profiles remain future work. Out-of-gamut
negative RGB is clipped, so extreme lights/colors still need quality evaluation.

Camera LUT export defaults to 65³. Tests against FFmpeg on a synthetic saturated
color grid measured mean error about 0.25 code values but maxima of 22 (Sony) and
24 (Panasonic), so the LUT is not numerically identical to analytic rendering.
These maxima remain an export-quality limitation on extreme colors. Prefer the
analytic core when exact processing matters and validate actual footage before
mastering. Browser analysis still uses an 8-bit decoded preview; native 16-bit
processing does not recover precision lost in that analysis.

## Persistence and regression data

- JSON recipe v2 declares inputSpace/profile and sRGB outputSpace. A fitted model
  records the profile used to learn it. Profile changes require refitting.
- JSON v1 reads as sRGB and retains its frozen model. The original
  `assets/sample-grade.json` intentionally remains a v1 regression/sample fixture.
- Internal native snapshots now use v2 with profile/model-profile fields; the
  C++ reader still accepts v1 snapshots as sRGB.
- UI reset preserves the source profile. Demo loading uses a corresponding
  synthetic encoding fixture; it never represents a recording from a real camera.
- `tools/make-camera-samples.py` regenerates those original fixtures from the
  synthetic scene using Pillow/NumPy. Runtime processing needs neither package.
