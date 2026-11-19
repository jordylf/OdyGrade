# One frozen match from a sampled shot

`fit-shot` fits a reference to multiple frames from one explicitly chosen shot.
It produces an ordinary editable OdyGrade v2 recipe, usable by the existing LUT,
still and native-video commands. The transform is fitted once and reused; it does
not automatically follow exposure changes or detect cuts.

```powershell
node tools/cli.cjs fit-shot --input shot.mov --reference reference.png --output shot-grade.json --profile sony-slog3-sgamut3cine --samples 9 --start 0.5 --duration 3
node tools/cli.cjs video-native --recipe shot-grade.json --input shot.mov --output graded.mov
```

Omit `--start` and `--duration` to analyze the whole input as one shot. Start is in
seconds relative to the first video frame, including for media with nonzero PTS.
The range is half-open: a frame starting at the range end is excluded. It must
contain at least one frame presentation timestamp and fit within the video.
**The range selects analysis frames only. Rendering still processes the entire
input clip.** Trim the media separately when a shorter output is required.

The profile declares the source pixel encoding; reference stills are sRGB. Use
`profiles` to list supported encodings. There is no camera/range autodetection.
The default is sRGB. Do not choose a LOG profile for already converted footage.

## Sampling and pooling

- Request 1–32 samples (default 9). For each uniformly spaced target time, choose
  the nearest actual frame PTS within the range. Duplicate selections are removed;
  VFR footage can therefore yield fewer distinct frames than requested. Actual
  indices/times are recorded in the recipe, rather than promising a sample count.
- FFmpeg decodes the selected video stream with its right-angle autorotation.
  Samples are downscaled to at most 512 pixels on their longest raster dimension
  without upscaling. Video inspection shares the native-video input restrictions.
- Analysis uses 8-bit RGBA samples, explicit profile normalization, then the same
  OKLab statistics as still matching. It is not high-bit-depth source analysis.
  Downscaling before normalization is an approximation, especially for LOG colors.
- Source statistics pool at most 60,000 candidate pixels across frames, using an
  equal candidate-pixel budget per frame. Alpha and normalized black rejection
  can leave unequal numbers of accepted samples. Each frame must have at least
  16 accepted samples; an unusable dark/transparent frame fails visibly.
- Large differences between sampled median brightness add a warning to the model.
  This is a heuristic prompt to inspect the range, not a scene-cut detector.
- No per-frame model updates occur during rendering. Changing lighting or camera
  exposure within the shot remains visible; this does not implement deflicker,
  tracking, batch shot balancing or semantic skin segmentation.

## Recipe and workflow limits

The model stores numeric source/reference distributions, source profile and
correction state. No media paths or original images are embedded. The top-level
`analysis` object records indices, seconds, range, sample dimensions and precision
as informational provenance; native rendering needs only the validated model.
The browser can load this recipe and adjust match strength/look/film controls,
preserving its informational provenance when re-saving. Correction/profile edits
on imported pooled grades require explicitly pressing Create grade to refit from
the currently loaded frames; they never silently reduce a saved shot to one still.

## Panel workflow with selected stills

Select or drop 1–32 source stills from one shot into Your frame. Choose one
reference, then Create grade. The panel pools all loaded frames, and retains
that collection when exposure, white balance, profile or auto balance is changed.
Use the preview-frame selector/arrows to inspect another source frame without
refitting. Save still exports the selected frame at its original dimensions.
Importing a new collection replaces the existing one, rather than appending.

The browser does not extract frames from a video: choose representative stills
yourself, or use the CLI's PTS sampler. Selected stills have equal candidate-pixel
budgets, not timestamp/duration weights. Both UI and CLI keep one frozen model.
One-frame UI matching keeps its existing preview-resolution analysis; pooled
analysis uses smaller previews bounded to 512×320, preserving aspect ratio.
Browser decoding/canvas color handling is another reason to validate real footage
and the host color pipeline separately.

Imports allow up to 50 MB/16 MP per image and 100 MB total source files. The panel
decodes sequentially, retaining small previews/analysis and only the currently
selected full-size decoded source. A failed batch keeps the previous collection
and model. This bounds retained data but is not a measured worst-case memory or
performance qualification. Interactions are disabled while imports/exports run.

Film controls initially default to zero. Spatial film effects require native
rendering or a still export; a LUT contains color transforms only.

Analysis probes decoded frame timing and decodes from the beginning up to the
last selected frame; long clips can take time. It has bounded sample/probe memory
and supervised cancellable helper processes. The input stat check is best-effort,
not a media lock or cryptographic immutability guarantee. Output is staged and
validated before no-replace publication; an existing/concurrently created recipe
is preserved. Temporary analysis staging is removed on success/failure.

This is an offline core workflow. Adobe SDK integration, live host validation and
actual short-film perceptual quality remain separate unfinished requirements.
