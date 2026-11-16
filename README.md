<img src="logo.svg" width="72" alt="">

# Typelight

A minimal writing app that behaves like a typewriter in a dim room. The type
head travels along a rail under the line you are writing, and a small lamp on
it lights the paper with a warm pool of light.

It is a static page with no build step and no dependencies.

## Run it

Serve the folder over http and open it in a browser:

    python3 -m http.server 8000

then go to <http://localhost:8000>. Opening `index.html` straight from disk
also works, but without sound: browsers do not let a page read the sample
files from a `file://` address.

The typeface (Courier Prime) is loaded from Google Fonts; offline it falls back
to the system Courier.

## How it works

- You type at the end of the text only. Backspace deletes backwards.
- Lines wrap on their own; the head returns and the paper feeds up one line.
- The mouse wheel, a touch drag, or the up and down arrows roll the paper back
  so you can reread. Typing brings it back to the current line.
- The lamp is computed per pixel in a WebGL shader: a hooded bulb aimed up the
  page, with a penumbra, an uneven reflector, falloff with distance, and
  raking light that picks out the texture of the paper. Without WebGL the app
  falls back to a plain gradient.
- The sounds are recordings of real typewriters. Each strike plays a different
  take, the carriage return is timed to the head's travel, and a bell rings
  eight columns before the right margin.
- The text is saved in the browser's local storage as you type. "Save .txt"
  (or Cmd/Ctrl+S) downloads it as a plain text file.

## Sounds

The samples in `sounds/` are cut from recordings by Joseph Sardin
([BigSoundBank.com](https://bigsoundbank.com)) and knufds
([Freesound.org](https://freesound.org)), all released under CC0 1.0. See
[sounds/README.md](sounds/README.md) for the sources and for how to rebuild
them with `tools/build-sounds.py`.

## Desk

The table under the sheet is a CC0 scan from [Poly Haven](https://polyhaven.com),
"Wood Table Worn" by Dimitrios Savva and Rico Cilliers. See
[textures/README.md](textures/README.md).

## Status

An early prototype. Checked in desktop Chrome; not yet tested on a real phone
or with very long manuscripts.

## License

The code is MIT, see [LICENSE](LICENSE). The sound samples and the desk texture
are CC0 1.0.
