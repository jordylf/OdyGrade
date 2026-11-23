# Third-party notes
No runtime packages or third-party images are bundled.
OdyGrade source and synthetic sample scene were authored for this project.
OKLab equations are based on Björn Ottosson's published color space:
https://bottosson.github.io/posts/oklab/
Adobe host integration references:
https://github.com/Adobe-CEP/Samples
No Adobe CSInterface source is vendored; a minimal CEP evalScript adapter is used.
Camera transfer/primary definitions are mathematical data from Sony, Panasonic,
and the Academy's ACES v1.3 reference definitions. Sources and our separate SDR
view design are documented in docs/COLOR-MANAGEMENT.md. No manufacturer LUT or
camera footage is bundled; the encoded sample frames are synthetic project assets.
Pocket Grade / Pocket CC are references owned by their respective creators.
Their names identify the reference product only; this project is not affiliated.

README demo images (docs/images/match.jpg, before-after.gif) show stills from
Tears of Steel (2012) (c) Blender Foundation | mango.blender.org, licensed
CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). The stills are used
unmodified as colour references; they are not shipped in the release package.

The README S-Log3 demo (docs/images/slog3.jpg) shows a still from Shutter Island
(2010) (c) Paramount Pictures, as published by @colorpalette.cinema, cropped to the
frame and used only as the colour reference for the demo grade. It is not shipped in
the release package; the palette beside it was measured by OdyGrade.
