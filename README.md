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

- You type where the head is, which is at the end of the text unless you move
  it. To correct something further back, click on it, or roll the paper there
  and use the arrow keys: the paper is rolled until that line is under the
  head and the carriage goes to the place. What you type goes in there and the
  rest moves along. Left and right move the carriage, up and down the paper,
  Home and End go to the ends of the line, and Escape takes the head back to
  the end of the text. Nothing can be selected.
- Lines wrap on their own; the head returns and the paper feeds up one line.
- The mouse wheel or a touch drag rolls the paper so you can reread, a line
  at a time like the ratchet of a platen: the paper never rests between two
  lines. Typing brings it back to the line the head is on.
- The paper is A4, in proportion to the type: ten characters to the inch, so
  the sheet is just under 83 characters wide and takes 62 to a line and about
  34 lines. When a sheet is full it rolls out and the next one rolls in. The
  pages of one text stay together: they lie one above another up the table,
  numbered in pencil from the second on. PageUp and PageDown roll from page
  to page, Cmd/Ctrl+Up to the first. The word count also says how many pages
  there are, or, while you are looking back, which one you are on. On a
  screen too narrow for A4 the sheet is narrower and the lines shorter, but it
  is as long.
- "Pages" (there once a text has a second page) steps back from the machine:
  every page lies on the table, small, under the cone of a desk lamp. Click
  one to go back with the paper rolled to it.
- The lamp is computed per pixel in a WebGL shader: a hooded bulb aimed up the
  page, with a penumbra, an uneven reflector, falloff with distance, and
  raking light that picks out the texture of the paper. The lamp in the
  drawer and the desk lamp over the pages are worked out the same way.
  Without WebGL the app falls back to plain gradients.
- The sounds are recordings of real typewriters. Each strike plays a different
  take, the carriage return is timed to the head's travel, and a bell rings
  eight columns before the right margin.
- The desk has a drawer for the texts you are not working on. "New text" puts
  the one in the machine away, however many pages it is, and gives you a
  blank sheet; "Drawer" shows the pile, lit by a small lamp under the edge of
  the table. A text of several pages lies there as a bundle held by a paper
  clip. Click a text to put it back in the machine. Hover over one and click
  the slip of paper under its clip to give it a name. Drag a text up or down
  to move it in the pile, or pull it out sideways to throw it away: it lands
  on the floor as a ball of paper, and clicking the ball smooths it out again.
  The floor keeps the last five balls, for thirty days; older ones are gone
  for good. With the keyboard: Tab to the texts, arrows to go between them,
  Alt+arrows to move one, F2 to name it, Delete to throw it away, Enter to
  take it. On a touch screen, hold a text to pick it up.
- Everything is saved in the browser's local storage as you type, on this
  device only. If the browser will not keep it (its storage is full, or
  switched off for the site), "Not saved in this browser" says so beside the
  word count. "Save .txt" (or Cmd/Ctrl+S) downloads the text in the machine
  as a plain text file, all its pages in one.
- With the drawer out, "Back up" downloads every text, the one in the machine
  and those in the drawer, as one JSON file, and "Restore" brings the texts
  of such a file back into the drawer, on top of the pile. Restoring replaces
  nothing: a text that is already there is not brought in twice. The balls of
  paper on the floor are not backed up.
- The app can be open in several tabs. When one tab saves, the others stop
  saving, so as not to write over it, and take up what it saved as soon as
  they are used again.
- Undo and redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y) go back a run of typing
  or of rubbing out at a time, up to a new line. Taking another text into the
  machine starts its undo afresh.
- Each item of the menu has a letter underlined. Alt and that letter works
  the item from the keyboard (on a Mac it is Control, because Option and a
  letter types characters there): P for the pages, D for the drawer, L for
  the lamp, O for the sound, S to save, N for a new text, and with the drawer
  out B to back up and R to restore.
- Opening the app with `#demo` at the end of the address fills the drawer
  with sample texts to try it on; nothing is read or saved in that mode.

## Sounds

The samples in `sounds/` (typewriters, paper, a drawer) are cut from recordings by Joseph Sardin
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
or with very long manuscripts. The drawer lives in one browser: there is no
sync, and two tabs open at once will overwrite each other's drawer.

## License

The code is MIT, see [LICENSE](LICENSE). The sound samples and the desk texture
are CC0 1.0.
