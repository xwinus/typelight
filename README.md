# Typelight

A minimal writing app that behaves like a typewriter in a dim room. The type
head travels along a rail under the line you are writing, and a small lamp on
it lights the paper with a warm pool of light.

It is a single static file with no build step and no dependencies.

## Run it

Open `index.html` in a browser.

The typeface (Courier Prime) is loaded from Google Fonts; offline it falls back
to the system Courier.

## How it works

- You type at the end of the text only. Backspace deletes backwards.
- Lines wrap on their own; the head returns and the paper feeds up one line.
- The mouse wheel, a touch drag, or the up and down arrows roll the paper back
  so you can reread. Typing brings it back to the current line.
- Sounds are synthesised with Web Audio, there are no audio files. A bell rings
  eight columns before the right margin.
- The text is saved in the browser's local storage as you type. "Uložit .txt"
  (or Cmd/Ctrl+S) downloads it as a plain text file.

The interface labels are in Czech for now.

## Status

An early prototype. Checked in desktop Chrome; not yet tested on a real phone
or with very long manuscripts.

## License

MIT, see [LICENSE](LICENSE).
