# To do

What is still missing, roughly in the order it would be missed by someone
writing something they care about.

## Getting text in and out

- [ ] Copy a part of the text. Nothing can be selected, so "Save .txt" is the
      only way out.

## Agreed, not built

- [ ] Tear the sheet out of the machine: it is crumpled and lands on the
      floor as a ball.

## Longer work

- [ ] Search in the text and in the drawer.
- [ ] Word count over all the texts in the drawer.
- [ ] The floor: sweep it (throw the balls away for good), show the first
      words of a text when hovering over its ball, and say when the oldest
      ball is about to go.
- [ ] Work offline: the typeface comes from Google Fonts and the app cannot
      be installed.

## To check

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
