# To do

What is still missing, roughly in the order it would be missed by someone
writing something they care about.

The desktop product and public demo release checklist is in [MVP.md](MVP.md).
See [BUSINESS.md](BUSINESS.md) for the commercial direction and validation plan.
The items below retain the detailed prototype notes.

## Getting text in and out

- [x] Select, copy, cut, and replace part of the text with mouse and keyboard;
      preserve the selection when undoing an edit.

## Put off

- [ ] Tear the sheet out of the machine: it is crumpled and lands on the
      floor as a ball. Not now; it would want deciding which sheet goes (the
      last, the one under the head, or the whole text) and how it is torn.

## To check

- [ ] Hands-on VoiceOver and NVDA checks for editing, drawer navigation, help,
      file dialogs, and save errors. Automated Mac checks cover focus, keyboard
      activation, reading contrast, tooltips, and layout at 200% zoom.
- [ ] Electron desktop on macOS, Windows, and Linux: clean installation, audio,
      input, print, offline restart, recovery, and upgrades preserving documents.
- [ ] Sign and notarize the macOS release; sign the Windows installer.

- [ ] Czech diacritics typed with dead keys in the middle of a text. Passes
      with composition simulated in Chrome (including undo); not yet tried on
      a real keyboard.
- [ ] Undo from the browser's Edit menu, and by shaking a phone. Both should
      come to the page's own undo through `beforeinput`; untested.
- [ ] A real phone and a touch screen: rolling the paper, the drawer, the
      pages.
- [ ] Firefox and Safari. Printing in particular: the sheets are A4 with no
      margin of the browser's own (`@page`), which Safari has been known to
      ignore.
- [ ] Windows: Alt and a letter for the menu may be taken by the browser's
      own menu before the page sees it (Alt+S in Firefox, for one).
- [ ] All motion and sound by eye and ear: the page turn, rolling by lines,
      the pages overview and its lamp coming on, the crumpling.
- [ ] The pages overview without WebGL (the plain gradient).
- [ ] Installing the app, and using it offline, on a real phone and in
      Safari (tested offline in Chrome only). A new version reaches an
      installed app on the next start with a connection.
