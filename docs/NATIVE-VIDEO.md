# Native video pipeline — 0.3

This offline path executes and validates the actual C++ core. It does not apply an
effect inside Premiere/AE or remove the Adobe SDK requirement.

```
npm run native:build
node tools/cli.cjs video-native --recipe grade.json --input clip.mov --output graded.mov
```

The recipe is compiled once and held fixed across frames. All implemented color
and film controls run analytically: matching, source normalization, grain, bloom,
halation, vignette, bleach and aspect bars. No per-frame refitting or 3D LUT lookup.

## Pixels, timing and audio

- Binary Node streams transport decoded RGBA16 into/out of the core. No 8-bit
  image intermediate or Windows PowerShell text pipe is involved.
- Constant-interval video streams to ProRes HQ. Alpha inputs use ProRes 4444 with
  alpha enabled. Processing precision and final codec quantization are distinct.
- VFR temporarily caches graded 16-bit PNGs, then restores decoded source PTS
  through ffconcat. An explicit duplicate endpoint establishes the preceding real
  frame's duration. A video-only trim removes it before adding audio, so a shared
  frame cap cannot truncate the audio tail. Unknown final duration is rejected.
- All audio streams become PCM24. Their offsets relative to video remain intact.
  The shared origin is the earliest video/audio start; earlier audio is retained.
- Right-angle rotation is normalized into pixels. Sample aspect is preserved and
  inverted for 90/270° rotation. The core receives it as context for aspect bars,
  not as a fitted color/recipe parameter.
- Output RGB is sRGB-coded, stored as limited-range BT.709 YUV. Frame properties,
  codec flags and container color metadata are explicit. ffprobe must read back
  BT.709 primaries/matrix and IEC 61966-2-1 transfer; encoder flags alone were not
  sufficient in the tested FFmpeg build.

## Process lifecycle and publication

`renderVideo(recipe, input, output, options)` returns a Promise with output path,
dimensions, frame count, timing mode, audio count and alpha summary. Options accept
AbortSignal and sync/async onProgress callbacks. Trusted executable overrides are
options, never recipe fields. Progress phases are probe, render, timing (VFR), audio,
verify and publish; only a fulfilled Promise means completion.

The CLI handles SIGINT/SIGTERM cancellation. Pipe, codec, callback and cancellation
failures terminate and await children before scratch cleanup. The candidate output
stays in a verified `.odygrade-job-*` directory beside the destination until frame
count, PTS, last duration, geometry, alpha, color metadata and audio offsets pass.
A best-effort source size/mtime/inode guard rejects media changed during work.

Publication uses a no-replace hard link where supported, otherwise an exclusive
copy. A concurrently created destination is preserved. The temporary path is
checked before recursive cleanup. Cancellation cannot roll back an already
committed, validated output. Original source media is never edited.

## Limits and reproduction

Requires a compiled core, FFmpeg/ffprobe, local fixed-size progressive video up to
16 MP/frame, known increasing PTS and a known final duration. HDR tags, ambiguous
timestamps, changing raster sizes and arbitrary rotation are rejected. Only the
source profiles in COLOR-MANAGEMENT.md are supported. Probe output is bounded to
64 MB; VFR cache disk use grows with frame count/resolution. No real-time or
long-form performance qualification is implied.

Subtitles, timecode/data tracks and arbitrary source metadata are not copied.
Audio is transcoded. ICC, interlaced video and a full mastering pipeline remain
unsupported. Bloom radius is in raster pixels, not a calibrated physical lens model.

`npm test` runs the video integration cases; `native:test` focuses on core buffer,
snapshot and still tests. Actual media tests cover CFR/VFR, complete PCM data,
delayed/earlier audio, nonzero origin, rotation/SAR, alpha, moving grain, active abort,
helper failure, callback failure, source mutation and a publish race. These synthetic
checks do not establish real-film matching quality or Adobe-host behavior.

Primary references: [FFmpeg options](https://www.ffmpeg.org/ffmpeg.html),
[concat/MOV formats](https://ffmpeg.org/ffmpeg-formats.html),
[timestamp filters](https://ffmpeg.org/ffmpeg-filters.html),
[ProRes encoder](https://ffmpeg.org/ffmpeg-codecs.html).

## Synthetic moving demo

```
node tools/demo-video.cjs --work <scratch-directory> --output <deliverables-directory>
```

Use explicit separate directories; existing demo files are refused. The demo pans
the project's synthetic S-Log3 illustration for 24 frames/2 seconds, applies a frozen
reference fit and native film controls, and preserves a generated reference tone.
The MP4 shows source LOG at left and the actual grade at right. It is not camera
footage or an Adobe screen recording. MOV is the native output; MP4 is a compressed
viewing comparison.
