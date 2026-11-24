# Typelight MVP plan

Deliver a usable paid desktop application and an honest interactive web demo.
The first release must make everyday writing, keeping documents, and moving
text into other tools dependable. The commercial model and validation
hypotheses are defined in [BUSINESS.md](BUSINESS.md).

Checkboxes below track verification of the release criteria. An unchecked item
may have partial implementation already. [TODO.md](TODO.md) retains the existing
feature notes and manual checks.

## Current foundation

The prototype already provides the typewriter environment, a document drawer,
search, undo and redo, text import and export, JSON backup and import, printing,
browser autosave, storage failure warnings, and cross-tab coordination. It also
has a service worker and installation manifest for offline web use.

The desktop direction is one Electron application for macOS, Windows, and
Linux, with shared storage, file dialogs, and automatic snapshots. All three
platforms are required for the MVP; platform-specific visual polish must not
create separate application implementations. See [DESKTOP.md](DESKTOP.md) for
builds, storage, and verification limits.
The checklist below remains the wider commercial release gate; initial desktop
implementation does not imply all release criteria are met.

Mouse and keyboard selection, copying, cutting, and replacement are implemented,
with regression checks for native selection, composition, and undo restoration.
Remaining gaps include preparing signed, notarized public distribution with a
commercial purchase flow.
The existing `#demo` intentionally disables saving. Browser and real-device
checks listed in TODO remain necessary for the surfaces supported at launch.

## Stage 1 Complete the writing workflow

Required before asking testers to rely on Typelight for personal writing.

- [x] Support selecting and copying part of a document with keyboard and
  mouse input. The paper stays still during dragging; the head follows the active
  end on release. Touch dragging retains its existing scrolling behavior.
- [ ] Verify selection with paste, insertion, deletion, navigation, search, and
  grouped undo/redo across the supported platforms. Automated Mac runtime checks
  cover replacement, multiline paste, composition, clipboard, and undo/redo.
- [ ] Verify real Czech dead-key input, accented text, and composition input.
- [ ] Verify text import and export, file naming, and print or PDF output on
  macOS, Windows, and Linux.
- [ ] Verify backup import preserves existing documents and handles duplicate,
  invalid, and truncated input without losing the current library.
- [ ] Make unsaved changes and storage failures visible with a usable way to
  copy or export the affected text.

Acceptance: a tester can write a document, revise a paragraph, copy part of it,
export it, close the application, and reopen the intact document. A failed save
must never appear successful.

## Stage 2 Establish desktop storage and recovery

Required before a paid beta. Local-only storage remains the initial model.

- [ ] Extract cohesive editing, document, and storage modules from the large
  HTML file as needed. Keep new modules under 500 lines.
- [ ] Separate browser and desktop storage behind a shared document interface;
  keep the website and demo deployable as static assets.
- [ ] Implement desktop document persistence that survives application restarts
  and does not depend on browser site storage.
- [ ] Provide open, save, and save-as operations for text files, with explicit
  handling of canceled dialogs, read failures, and write failures.
- [ ] Protect saved documents from interrupted writes; retain a recoverable
  previous state and test forced termination during saving.
- [ ] Save automatic backup snapshots outside the primary document store and
  define retention, backup frequency, and the maximum expected recovery gap.
- [ ] Provide a simple way to browse and restore previous versions without
  silently overwriting the only copy of the current text.
- [ ] Test restoring from backup with the primary data unavailable or damaged.
- [ ] Retain portable library export and import, including a path to move
  existing browser documents into the desktop application.
- [ ] Prevent conflicting writes from multiple application instances and
  verify the chosen behavior.

Acceptance: normal saves, interrupted saves, unavailable locations, malformed
data, and recovery from backup have verified outcomes. Backups on the same
device must not be described as protection against losing that device.

Automated development-Mac checks now cover startup recovery from a damaged or
missing primary library, preservation of the original, cancellation and recovery
failures, portable backups above 8 MB, malformed backup rejection, process
termination at three write stages, and a latest-state snapshot on normal close.
The Electron recovery test also verifies that a failed close snapshot leaves
the editor open and unlocked for retry. Cross-platform release verification
remains pending; the broader checkboxes above are not a claim of missing code.

## Stage 3 Package a desktop beta

macOS, Windows, and Linux are required. Build and test on each target system.

- [ ] Define and verify minimum OS versions and supported Linux distributions.
- [ ] Validate the shared Electron implementation on macOS, Windows, and Linux:
  WebGL lighting, audio, keyboard shortcuts, file dialogs, printing, and
  offline operation.
- [ ] Produce macOS DMG/ZIP, Windows NSIS, and Linux AppImage/DEB packages;
  verify installation and upgrades on clean target machines.
- [ ] Check current stable versions and APIs through Context7 before adding
  dependencies.
- [ ] Keep operating-system access behind a small validated interface and
  restrict the native bridge to bundled application content.
- [ ] Produce a distributable build and verify installation, first launch,
  relaunch, and offline writing on a clean test environment.
- [ ] Sign the release and complete platform-specific distribution steps.
- [ ] Establish a dependable update path and verify that an update or failed
  update preserves documents. Automatic updating may follow if a clear manual
  update path is adequate for the beta.
- [ ] Test realistic long documents and a populated drawer; record fixtures,
  supported scale, and any visible performance limits.
- [ ] Verify keyboard operation, reduced motion, sound controls, and the
  fallback without WebGL.
- [ ] Verify VoiceOver and NVDA on target systems. Keyboard navigation, modal
  help, even reading light, 75–200% desktop zoom, concise document labels, and
  quiet autosave announcements are implemented with automated Mac checks.

Acceptance: an external tester can install the application, write offline,
restart it, recover a version, and install an update without losing documents.

## Stage 4 Build the public demo and presentation

The demo should represent the paid writing experience accurately while limiting
the size of the personal workspace.

- [ ] Provide one personal draft with the real editing, lighting, and sound.
- [ ] Keep sample documents separate from the visitor's draft and label them
  clearly. Do not allow sample resets to discard personal text.
- [ ] Preserve the personal draft across reloads when storage is available;
  show a clear warning and export option when persistence fails.
- [ ] Keep copying and downloading personal text available without payment.
- [ ] Explain that the draft is stored in this browser and does not sync.
- [ ] Demonstrate the drawer and page overview with sample documents.
- [ ] Avoid short timers, recurring purchase interruptions, and export locks.
- [ ] Publish a concise English presentation with a short recording, launch
  demo action, supported platform, desktop benefits, and clear price.
- [ ] Test the demo in current Chrome, Firefox, and Safari. Ensure the landing
  page and basic demo are usable on mobile; desktop writing remains the focus.

Acceptance: a visitor can understand the offer, try the real experience,
retain or export their own draft, and identify what the desktop purchase adds.

## Stage 5 Enable paid beta sales

- [ ] Define what the EUR 19 beta includes, its supported platform, known
  limitations, and how it relates to the proposed EUR 29 stable release.
- [ ] Define device allowance, major-version entitlement, and upgrade policy.
- [ ] Select checkout and download delivery, show the final payable price,
  and publish purchase and refund terms.
- [ ] Provide a way to retrieve a purchase and download again, plus a support
  contact. Routine writing must work offline after setup.
- [ ] Document distribution licenses and preserve code and asset attribution.
- [ ] Verify purchase, delivery, installation, purchase recovery, and refund
  handling using the payment provider's test facilities where available.

Acceptance: a customer knows what they are buying, receives a usable installer,
can recover their purchase, and has a clear route to support.

## Stage 6 Validate demand before expanding

- [ ] Recruit 20–30 target users for two weeks of writing with their own texts.
- [ ] Track repeat writing, completed sessions, exports, blockers, and reasons
  for abandoning the application through interviews or minimal consented
  measurement. Do not collect document contents.
- [ ] Compare repeat use with the proposed threshold in BUSINESS.md: at least
  one third of testers writing on three or more separate days.
- [ ] Offer the usable paid beta and seek ten purchases outside the developer's
  personal circle, extending recruitment if needed.
- [ ] Review purchases, refunds, support effort, and repeat use before funding
  additional architectures or optional content.

These are decision aids, not guarantees of market fit. Investigate workflow
problems when the demo attracts attention but does not lead to regular writing.

## Verification requirements

For each new functionality, add at least three unit tests under `tests/`:
expected use, an edge case, and an error case. Document the runner and update
existing tests whenever behavior changes. Include unexpected failures in
storage and import tests rather than testing only valid inputs.

Manually verify editing, undo and redo, persistence, import and export, keyboard
navigation, offline use, recovery, and relevant visual behavior. Use a separate
browser profile for storage testing because the current `#demo` does not save.
Keep release checks separate from commercial validation results.

## Deferred beyond MVP

- Cloud synchronization, accounts, and subscription plans.
- Additional paid themes, sound packs, and environment customization.
- Native mobile applications and additional processor architectures.
- Rich formatting, publishing integrations, and extensive document conversion.
- Collaboration, AI writing features, and a plugin system.
- Additional physical effects such as tearing pages from the machine.

## First implementation tasks

1. Validate selection and copying on Windows and Linux and with real composition
   input; automated Mac checks cover caret movement, composition, and undo.
2. Verify existing backup and restore behavior, then establish the shared
   document and storage boundaries for the desktop version.
3. Verify file persistence, automatic backup, recovery, audio, and packaging
   in the shared Electron app on all three required desktop platforms.
