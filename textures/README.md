# Textures

The desk is a photographed and scanned table top, **Wood Table Worn** from
[Poly Haven](https://polyhaven.com/a/wood_table_worn) (photography: Dimitrios
Savva, processing: Rico Cilliers), released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The files in this
folder stay under CC0; the MIT license of the repository covers the code, not
these files.

- `desk.jpg`: the colour of the wood, used as the page background.
- `desk-normal.jpg`: the relief of its surface. The lamp's shader lights it, so
  scratches and grain catch the light from the side the lamp is on.

The original covers 55 cm of table. In the app one tile is 36 line heights
wide, which shows the wood at roughly half its real scale next to the sheet.

`tools/build-desk.py` downloads the two maps and resizes them. It needs
Python 3.9+ and `ffmpeg`.
