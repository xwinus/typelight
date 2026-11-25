# To do

What is still missing, roughly in the order it would be missed by someone
writing something they care about.

The desktop product and public demo release checklist is in [MVP.md](MVP.md).
See [BUSINESS.md](BUSINESS.md) for the commercial direction and validation plan.
The items below retain the detailed prototype notes.

## Getting text in and out

- [x] Select, copy, cut, and replace part of the text with mouse and keyboard;
      preserve the selection when undoing an edit.
- [x] Remember each document's caret, selection, and reading position when
      switching texts and reopening the app.
- [x] Keep bounded undo/redo history per text during the session; do not persist
      undo history across restarts or include it in backups.
- [x] Rename the current text through Help or F2 while writing; expose the same
      action in the desktop File menu with Cmd/Ctrl+Shift+N.
- [x] Provide a persistent volume slider and mute control in Help; preserve
      the chosen volume when muting with Help or the Sound tool.
- [x] Browse dated desktop snapshots, preview individual texts, and restore one
      as a separate drawer copy without replacing existing documents.
- [x] Find and replace one or all matches in the current text (Cmd/Ctrl+Shift+F),
      with each replacement action undoable and drawer texts left intact.

## Put off

- [ ] Tear the sheet out of the machine: it is crumpled and lands on the
      floor as a ball. Not now; it would want deciding which sheet goes (the
      last, the one under the head, or the whole text) and how it is torn.

## To check

- [x] Measure long-text and populated-drawer workloads on the development Mac,
      including key input, replace all, snapshots, save integrity, and retained
      memory. Run `npm run test:performance`; see DESKTOP.md for results and limits.
- [x] Reduce redundant storage encoding and IPC copies, release the preload seed,
      and avoid duplicate drawer label calculations; verify save/retry invariants.
- [ ] Further improve the measured 500-document workload (drawer rebuilding,
      replacement, and transient memory), and verify lower-memory target machines.
- [ ] Check real dead-key/IME input in long multiline texts; Electron insertText
      is slower than ordinary key events in the performance harness.
- [ ] Hands-on VoiceOver and NVDA checks for editing, drawer navigation, help,
      file dialogs, and save errors. Automated Mac checks cover focus, keyboard
      activation, reading contrast, tooltips, and layout at 200% zoom.
- [ ] Electron desktop on macOS, Windows, and Linux: clean installation, audio,
      input, print, offline restart, recovery, and upgrades preserving documents.
      Include restored reading positions, per-text undo after switching, rename,
      volume/mute, version-history copy restoration, and find/replace.
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
