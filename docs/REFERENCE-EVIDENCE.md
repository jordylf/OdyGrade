# Reference evidence / 2026-11-18
Scope clarified by user: **Pocket Grade + CopyCat first**, not the six-product suite.
User explicitly requires Premiere 2024, chooses Premiere first, targets indie filmmakers.
User requests Obsidian notes for continuation in Claude.

## Observed public product page
https://filmmakersotoi.com/pocket-cc
Rendered page inspected via Playwright on 2026-11-18, Indonesian text.
- Pocket CC is an installer/license hub for six products.
- Pocket Grade 2.0 runs on DaVinci Resolve Studio 20+, not free Resolve.
- CopyCat beta accepts a reference screenshot and camera + LOG profile.
- Claims to construct editable nodes using the included ten Sotoi looks.
- Film Module advertises compressor, bleach, faded black, vignette, grain,
  ratio, film stock, format effects, halation and bloom.
These are seller claims visible on the page, not independently verified runtime behavior.

## Unknown
No proprietary plugin artifact or installed Pocket instance was supplied.
No algorithm, model weights, measured stock data, LUT assets, or license behavior was inspected.
Do not claim identical internals, training data, output quality, or numerical parity.

## REA availability
Installed rea CLI 6.4.0. Read-only doctor found stale Codex registration.
No REA MCP tools exposed in this chat; native engines not configured.
No configuration was repaired and no package was acquired.
Browser/public-page findings are not REA Evidence IDs.

## Primary technical references
- Adobe CEP sample, manifest and Premiere adapter:
  https://github.com/Adobe-CEP/Samples/tree/master/PProPanel
- Historical Adobe sample issue includes QE exportFramePNG usage:
  https://github.com/Adobe-CEP/Samples/issues/129
- Current sample prefers Media Encoder export with a PNG preset;
  our QE capture is explicitly experimental and requires live host verification.
- Adobe Premiere extensibility:
  https://developer.adobe.com/premiere-pro/
- AE effects SDK can target Premiere:
  https://developer.adobe.com/after-effects/
- Existing Premiere match feature:
  https://helpx.adobe.com/uk/premiere/desktop/correct-color/add-color-effects/match-color-between-shots.html
- OKLab equations:
  https://bottosson.github.io/posts/oklab/

## Design choices, not reverse-engineered facts
OKLab statistical transfer, color-only LUT interchange, original ten looks,
offline processing, and CEP UI are this project's own implementation decisions.
