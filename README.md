<img src="logo.svg" width="72" alt="">

# Typelight

A minimal writing app that behaves like a typewriter in a dim room. The type
head travels along a rail under the line you are writing, and a small lamp on
it lights the paper with a warm pool of light.

The web editor is a static page with no build step or dependencies. The desktop
application uses Electron and shares the same editor on macOS, Windows, and Linux.

## Product direction

The planned commercial product is a desktop writing application sold with a
one-time purchase, with an interactive web demo on the product website. See
[Business model](BUSINESS.md) for the audience, offer, pricing hypotheses, and
validation plan, and [MVP plan](MVP.md) for the required steps before release.
The application described below is the current web prototype.

## Desktop application

One Electron application targets macOS, Windows, and Linux, with a hidden title
bar, translucent controls, system file dialogs, and automatic local backups.
The macOS appearance does not require a separately maintained AppKit version.

Run `npm ci` followed by `npm start` for development. Build installers on the
target system with `npm run build:mac`, `npm run build:win`, or
`npm run build:linux`. On macOS, `./install.sh` needs no parameters: it builds,
asks the previous running version to save and quit, and installs into
`~/Applications`. See [Desktop setup](DESKTOP.md) for requirements, storage,
testing, and the remaining release checks.

## Run it

Serve the folder over http and open it in a browser:

    python3 -m http.server 8000

then go to <http://localhost:8000>. Opening `index.html` straight from disk
also works, but without sound: browsers do not let a page read the sample
files from a `file://` address.

Everything it needs is in the folder, the typeface included (Courier Prime, in
`fonts/`, under the SIL Open Font License: see `fonts/OFL.txt`). Opened over
http(s), the page keeps a copy of itself and of everything it loads (`sw.js`),
so after the first visit it works without a connection, and browsers that
offer it can install it as an app.

## How it works

- You type where the head is, which is at the end of the text unless you move
  it. To correct something further back, click on it, or roll the paper there
  and use the arrow keys: the paper is rolled until that line is under the
  head and the carriage goes to the place. What you type goes in there and the
  rest moves along. Left and right move the carriage, up and down the paper,
  Home and End go to the ends of the line, and Escape takes the head back to
  the end of the text.
- Drag on the paper or hold Shift with the arrow keys to select text. Double-click
  selects a word; Shift-click extends the selection. Cmd/Ctrl+A selects the whole
  document, including pages outside the viewport. Cmd/Ctrl+C copies the selection,
  Cmd/Ctrl+X cuts it, and typing, pasting, indenting, or Delete replaces it. Undo restores
  both the text and its previous selection. Escape first clears the selection.
  Option+Arrow on macOS and Ctrl+Arrow elsewhere move by words; adding Shift
  selects them. Shift+Home/End selects to a line boundary and Shift+PageUp/Down
  extends by a screen of text. Touch dragging continues to roll the paper.
- Tab and Shift+Tab move between controls without changing the document.
  Cmd/Ctrl+] inserts four spaces. F6 switches between the tools and the current
  writing, drawer, or page view. Enter and Space activate buttons.
- The question mark in the upper-right corner (or F1) opens reading options and
  keyboard help; in the desktop app it sits in the title bar, opposite the
  window's own buttons. Even reading light removes shading and distressed ink
  for clearer text and selection. "Reading" in the menu (Alt/Control+R, and
  Cmd/Ctrl+Shift+R in the desktop app) switches it too. Size controls offer 75–200% scaling: the whole
  interface on desktop, text on the web. Cmd/Ctrl+Plus, Minus, and 0 adjust or
  reset it. Reading preferences are remembered outside demo mode.
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
  word count. "Export text…" (or Cmd/Ctrl+S) downloads the text in the machine
  as a plain text file, all its pages in one, named after the text if it has
  been given a name.
- "Open file" (or Cmd/Ctrl+O, or dropping files on the page) opens text files.
  One file goes into the machine, and the text that was there is put away in
  the drawer; several go into the drawer, on top of the pile. A text takes its
  name from the file. Files are read as UTF-8, or else as windows-1250.
- With the drawer out, "Back up" downloads every text, the one in the machine
  and those in the drawer, as one JSON file. Opening such a file brings its
  texts back into the drawer. Nothing is replaced: a text that is already
  there is not brought in twice. The balls of paper on the floor are not
  backed up.
- "Find" (or Cmd/Ctrl+F) looks for a word in the text in the machine. Every
  place it is gets marked, as with a highlighter, and Enter, Shift+Enter or
  Cmd/Ctrl+G take the head from one to the next. Neither capitals nor accents
  count: "zivot" finds "Život". If texts in the drawer have the word too, it
  says how many; with the drawer out, those stand out and the rest are in
  shadow. Typing, or Esc, puts the word away.
- With the drawer out, the word count is that of every text, the one in the
  machine and those in the drawer.
- Pointing at a ball of paper on the floor says what is on it and when it goes
  for good, and when the oldest has three days or less left, the drawer says
  so as it comes out. "Sweep the floor" throws every ball away for good, after
  a second click to be sure.
- Printing (Cmd/Ctrl+P) prints the text in the machine on A4, as it lies in
  the machine: Courier at ten characters to the inch, 62 to a line, the pages
  from the second on numbered. "Save as PDF" in the print dialog makes a PDF.
- The app can be open in several tabs. When one tab saves, the others stop
  saving, so as not to write over it, and take up what it saved as soon as
  they are used again.
- Undo and redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y) go back a run of typing
  or of rubbing out at a time, up to a new line. Taking another text into the
  machine starts its undo afresh.
- Each item of the menu has a letter underlined. Alt and that letter works
  the item from the keyboard (on a Mac it is Control, because Option and a
  letter types characters there): P for the pages, D for the drawer, L for
  the lamp, R for the even reading light, O for the sound, I to find, F to open a file, S to save, N for a
  new text, and with the drawer out B to back up. With the drawer out, "Back
  up" takes the place of "Save .txt", and the blank sheet on top of the pile
  that of "New text".
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

An early prototype. Desktop builds share one implementation, but each target
still requires installation and runtime checks before a public release. The
web editor has been checked in desktop Chrome; real phones and very long
manuscripts need further testing. Documents stay on the device; there is no sync.

## License

The code is MIT, see [LICENSE](LICENSE). The sound samples and the desk texture
are CC0 1.0.
