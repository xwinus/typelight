# Sounds

Every sample here is cut from field recordings released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain
dedication): typewriters, paper and a drawer recorded by **Joseph Sardin**
([BigSoundBank.com](https://bigsoundbank.com)) and a carriage return recorded
by **knufds** ([Freesound.org](https://freesound.org)). The samples in this
folder stay under CC0; the MIT license of the repository covers the code, not
these files.

CC0 asks for no credit. It is given anyway: additional sounds by Joseph Sardin,
BigSoundBank.com, and by knufds, Freesound.org.

## Sources

| Used for | Recording |
|---|---|
| `key-*` (letter strikes) | [Typewriter #1](https://bigsoundbank.com/typewriter-s1065.html), a heavy mechanical machine |
| `return-*` | [Typewriter bell & carriage reset](https://freesound.org/people/knufds/sounds/345955/) by knufds, an antique machine |
| `feed-*` | [Typewriter #2](https://bigsoundbank.com/typewriter-2-s2835.html), [Typewriter #3](https://bigsoundbank.com/typewriter-3-s2836.html), a Hermes |
| `space-*` | [Typewriter, space](https://bigsoundbank.com/typewriter-space-s2843.html) |
| `bell-*` | [Typewriter, Bell #1](https://bigsoundbank.com/typewriter-bell-s2844.html), [Typewriter, bell #2](https://bigsoundbank.com/typewriter-bell-s2845.html) |
| `crumple-*` | Ball paper [#1](https://bigsoundbank.com/sound-1220.html), [#2](https://bigsoundbank.com/ball-paper-2-s1221.html), [#3](https://bigsoundbank.com/sound-1222.html), [#4](https://bigsoundbank.com/sound-1223.html), [#5](https://bigsoundbank.com/sound-1224.html): a sheet wrinkled into a ball |
| `drawer-open-*`, `drawer-close-*` | [Wooden drawer, opening](https://bigsoundbank.com/wooden-drawer-opening-s1499.html), [Wooden drawer, closing](https://bigsoundbank.com/detail-1500-wooden-drawer-closing.html) |

## What is in the folder

- `key-01` … `key-28`: single letter strikes. Each is a different strike from
  the recording, so they differ the way real strikes do. They come from the
  heavier machine on purpose: the Hermes strikes are nearly all click, with
  little of the low thump of a type bar hitting the platen, and sounded too
  light.
- `space-01`: the space bar. The source has one take only; the app varies its
  pitch and volume slightly, and also uses it, pitched down, for backspace.
- `bell-01`, `bell-02`: the end-of-line bell.
- `return-01`: a carriage return: the ratchet of the carriage sweeping back,
  then the hard stop. One take; for a short trip the app enters it late, so the
  stop always lands when the head arrives. It is cut from Freesound's MP3
  preview, because the original WAV needs a Freesound login. To use the
  original, download it to `tools/.cache/345955.wav` and rebuild.
- `feed-01` … `feed-03`: the line-feed click from the start of a Hermes
  carriage return, used when the paper is rolled by a line.
- `crumple-01` … `crumple-05`: a sheet of paper screwed up into a ball, the
  first second of each recording. Played when a sheet from the drawer is thrown
  away and, quieter and a little faster, when one is smoothed out again.
- `drawer-open-01`, `drawer-close-01`: the desk drawer, a slide that ends in a
  knock. The knock is some 20 dB above the slide in the recordings; the build
  halves that range. The manifest says where the knock is, and the app starts
  the sample so that it falls when the drawer on the screen reaches its stop.
- `manifest.json`: the list the app loads, with the timing of each return and
  a version that changes whenever a sample does (it keeps browsers from
  playing a cached older set).

All files are 48 kHz, 16-bit stereo FLAC. The letter strikes and the space bar
come from mono recordings, so both channels are identical there.

## Rebuilding

`tools/build-sounds.py` downloads the source recordings and cuts the samples
again. It needs Python 3.9+ and `ffmpeg`:

    python3 tools/build-sounds.py --report

The strikes are found automatically (loud, isolated, not clipped), and so is
the stop of the carriage return and the knock of the drawer; the line-feed clicks are marked by hand at
the top of the script. To drop a sample you do
not like, delete the file and its line in `manifest.json`.
