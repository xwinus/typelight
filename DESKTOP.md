# Typelight desktop

Typelight uses one Electron application for macOS, Windows, and Linux, sharing
the existing static editor. Platform code lives in `desktop/electron/`; the
shared editor bridge and appearance live in `desktop/web/`. The web version
continues to work without Node.js, Electron, or a build step.

The desktop window hides its title and uses system window controls, a draggable
top area, and a compact translucent icon palette. Action names appear on hover
or keyboard focus; buttons retain accessible names and keyboard shortcuts.
A small dot beside the word count shows save status, with a visible message
when saving fails. The editor shows a short word count, and the drawer shows
the number of texts. Large values use compact notation such as `12.4k words`,
with exact values on hover. The drawer header shows the full library summary,
for example `12 texts · 8,420 words`.
A 44px brass monogram sits in the wood above the paper, underneath the
desk lighting. It moves with the desk and is hidden in windows at most 640px
tall; it never occupies toolbar space or intercepts input.
This appearance does not depend on
native macOS Liquid Glass. The earlier AppKit/WebKit prototype is not the
production architecture; there is one desktop implementation to maintain.

## Toolbar interaction contract

The primary palette always shows eight tools in the same order and with equal
spacing: Drawer, Pages, New Text, Open, Export Text, Find, Lamp, and Sound.
Opening another view must not resize the palette, move a target, hide an icon,
or change an action's meaning. Pages remains visible but disabled for a
single-page document; its accessible label explains why. New Text and Export
Text work from the drawer as well as the editor. Library backup belongs to the
drawer header and the File menu, never in place of Export Text. Tests enforce
both position stability and the absence of empty icon slots.

## Writing controls

Each document retains its caret, selection direction, and reading position when
switching texts and after reopening. Undo and redo are separate for each text
and survive switching during the current session. They remain in memory only:
up to 32 recent documents, 500 steps per stack, and a shared character budget
bound retained history. Reopening starts fresh undo histories; automatic
snapshots and portable backups do not contain them.

Help (F1) includes Rename current text and a 0–100% volume slider for the keys,
carriage, bell, paper, and drawer. F2 while writing or File → Rename Current
Text… (Cmd/Ctrl+Shift+N) opens the same naming dialog. Leaving the name empty
makes the text untitled; the name is used for suggested export filenames.
The sound checkbox and Sound tool mute without losing the chosen volume.
Sound and volume preferences survive reopening.

Find → Replace… or Cmd/Ctrl+Shift+F opens literal, case- and accent-insensitive
replacement in the current document. Replace changes the selected match;
Replace all changes all matches as one undoable edit. An empty replacement
deletes matches. Drawer texts remain unchanged. The Edit menu also exposes
Find and Replace….

Open imports a copy into the library; later edits do not change the source
file. Export Text writes a separate copy to the chosen location. Autosave
continues to save the library rather than overwriting an opened or exported file.

## Develop and build

Install Node.js 22 or newer with npm. From the repository root:

```sh
npm ci
npm start
npm test
npm run test:desktop
```

Node.js and npm are development tools; customers run the packaged application
without installing them. Dependencies are pinned in `package-lock.json`.

Build each release on its target operating system:

| System | Command | Artifacts in `build/electron/` |
| --- | --- | --- |
| macOS | `npm run build:mac` | DMG and ZIP, host architecture |
| Windows | `npm run build:win` | NSIS `.exe`, x64 |
| Linux | `npm run build:linux` | AppImage and DEB, x64 |

On macOS/Linux or a compatible shell on Windows, `tools/build-desktop.sh`
installs locked dependencies and builds for the current host. It also accepts
`--platform mac|win|linux`, `--arch arm64|x64`, and `--dir` to skip installers.
`--arch universal` is available for macOS. The script copies a completed Mac
bundle to `build/Typelight.app` for the local installer.

Cross-compilation is not the release verification strategy. GitHub Actions has
two separate workflows:

- **Unit tests** runs `npm test` on Linux for pushes to `master` and for pull
  requests. Feature-branch pushes do not start a second run alongside their PR;
  branches without a PR are tested locally until they are proposed for merging.
  The job uses Node's built-in test runner without installing dependencies or
  downloading Electron, and has a five-minute timeout. Newer runs cancel older
  unfinished unit-test runs for the same branch or PR.
- **Desktop builds** runs unit tests, Electron runtime tests, and packaging on
  the selected operating systems. Start it manually from Actions with `all`,
  `mac`, `win`, or `linux`. Mac includes Apple Silicon and Intel. Pushing a tag
  starting with `v` (for example `v0.1.0`) always runs every desktop target.
  Platform selection has a five-minute timeout; each desktop build has a
  thirty-minute timeout.

Desktop builds upload DMG/ZIP, Windows x64 NSIS, and Linux x64 AppImage/DEB files
as workflow artifacts retained for seven days; they do not publish a release. Ordinary branch pushes
and pull requests do not trigger desktop builds, and no nightly build is scheduled.
Installation and manual runtime checks remain required even after packaging succeeds.

## Install

On macOS, run:

```sh
./install.sh
```

No parameters are needed. This builds and installs into
`~/Applications/Typelight.app`, then launches it. After staging and verifying
the new bundle, the default installer asks running Typelight copies (including
those opened from Downloads or a DMG) to quit normally
and waits for its pending saves to finish. A running development copy in a build
output is closed before rebuilding that output. No additional developer tools
are required for quitting; the helper uses macOS AppKit through JavaScript for
Automation.
Use `--no-open` to skip launching, or install a completed bundle:

```sh
./install.sh --app ./build/Typelight.app --destination "$HOME/Applications" --no-open
```

If the app remains open for 30 seconds because of a dialog or a save error, the
installer stops without force-quitting it or replacing the installed bundle.
Resolve the issue and run `./install.sh` again.
The script verifies the bundle identity and signature, stages the replacement, and restores the old
application if replacement fails. Documents, preferences, and backups are
outside the bundle and are preserved. Run without `sudo`.

On Windows, run the NSIS installer. It installs per user and lets the user
choose a destination. Uninstalling does not delete application data.

On Linux, install the DEB with the distribution's package installer, or make
the AppImage executable and launch it. AppImage support depends on the target
Linux distribution's runtime configuration; do not disable Chromium's sandbox
to work around an installation issue. Linux installation must be checked on
the distributions selected for the release.

## Documents and recovery

The library is a versioned `library.json` file in the application data directory:

- macOS: `~/Library/Application Support/Typelight/`
- Windows: `%APPDATA%/Typelight/`
- Linux: `$XDG_CONFIG_HOME/Typelight/`, usually `~/.config/Typelight/`

The Mac path and snapshot format remain compatible with the earlier native
prototype. The installer also requests a normal quit from that earlier copy.
Updates replace the application, not the document library.

Automatic snapshots live in the neighboring `Backups` directory. The first
changed save after launch backs up the previous persisted state, then snapshots
are spaced at least five minutes apart; the newest 30 are retained. A normal
window close also backs up the latest persisted state after pending edits have
finished saving. An unchanged final snapshot is not duplicated. If that backup
fails, the window stays open and unlocked for export or retry. During an open
session, the current library may be more recent than the latest snapshot;
the five-minute spacing is not a guaranteed maximum recovery gap. Local backups
do not protect against device loss; keep portable library exports elsewhere too.

File → Version History… lists automatic snapshots by date. Select a snapshot,
then a text from its writing desk, drawer, or discarded texts to preview it.
Restore as a new copy adds that single text to the drawer with a new identity
and a "(restored copy)" title suffix, even if identical text already exists.
Existing texts and the document currently in the machine are preserved.
Large previews are shortened on screen; restoration uses the complete text.
Malformed snapshots cannot be restored, and a snapshot changed since preview
must be reselected. A copy is reported as saved only after its library write
finishes. If that write fails, the copy remains in memory and the dialog reports
the failure so it can be exported without restoring a duplicate.

The library and JSON backup import limits are 50 MiB. Text imports are limited
to 8 MB per file. Portable backups require valid UTF-8 and a complete, valid
document list; a malformed backup is rejected as a whole.
Before merging imports or snapshot texts, the desktop editor checks the complete
resulting library size, including discarded documents and preferences. Imports
that would exceed the storage limit leave the current library unchanged.

If the primary library is damaged, startup offers a snapshot picker before
opening the editor. A missing primary with existing automatic snapshots also
offers recovery instead of silently opening an empty library. The selected
snapshot is validated before confirmation. Recovery keeps the original bytes
in `Recovered Originals`, outside automatic snapshot rotation, then atomically
installs the recovered library. Canceling leaves the files untouched. A library
changed externally during recovery is not overwritten. Inaccessible or
nonregular library paths must be resolved through the library folder first.
The File menu's separate Recover from Snapshot… action continues to merge
snapshot texts into an already open library rather than replacing it.

For isolated testing, set `TYPELIGHT_DATA_DIR` to a temporary directory. Never
point it at unrelated files. The shared web `#demo` mode disables persistence;
it is not a substitute for desktop save/restart testing.

## Verification

```sh
npm test
npm run test:desktop
```

Unit tests cover the shared desktop bridge and the Electron modules. The
desktop smoke and recovery tests launch the real Electron runtime with temporary data.
Use `xvfb-run -a npm run test:desktop` on a headless Linux host. Each new
functionality requires expected, edge, and error cases. Changes to persistence
must also preserve cancellation, interrupted writes, malformed data, and the
previous valid library. Tests use temporary data, not personal documents.
Storage regression tests forcibly terminate a child process during partial
writing, before replacement, and immediately after replacement, then verify
the primary library and previous snapshot. These process-crash checks do not
simulate power loss or failure of the underlying storage device.

The macOS installer regression suite uses signed temporary fixture applications:

```sh
sh tests/installer.test.sh
```

It uses isolated application paths and does not close a personal Typelight copy.
It covers installation, upgrades, paths with spaces, invalid destinations,
damaged signatures, rollback, blocked quits, and waiting for a running fixture
to finish saving before replacement.

Before release, manually check each target: typing and composition, undo/redo,
file import/export, native dialogs, print/PDF, all sounds, offline restart,
backup recovery, accessibility, and updating without losing documents. Packaging
configuration and CI availability do not establish these runtime results.

## Current verification record

On the development Mac, the Electron smoke test verified importing the prior
native library format, renderer isolation, real keyboard input, autosave,
undo/redo, flushing edits and unfinished renames on close, and restoring them
when reopening. Layout checks cover the editor and drawer at 900 and 1180 px,
including button bounds and overlapping controls. All
42 bundled FLAC samples loaded and decoded; typing started a sound source on
a running AudioContext. Physical speaker output and audible quality still
need a listening pass.

The separate Electron recovery scenario
verified damaged-library startup, preservation of the original, further editing,
failed close backups leaving the editor unlocked, successful retry, and the final
snapshot containing the latest text. Import tests cover backups larger than 8 MB,
strict validation, capacity checks before mutation, and document-ID collisions.
Selection checks cover mouse dragging,
double-click, keyboard and native-menu selection, plain-text copy/cut, replacement,
multi-page ranges, and restoring backward selections through undo. Unit tests
also verify grapheme boundaries and preservation of text after clipboard errors.
Composition replacement is tested with simulated input; real keyboard IME checks
on each target platform remain necessary.
Accessibility runtime checks cover Tab and reverse Tab without editing, Enter
and Space activation, F6 navigation, drawer and page focus, modal help and focus
restoration, and hoverable tooltips dismissible with Escape. Reading mode uses
even paper lighting and crisp ink; computed normal and selected text contrast
exceeds 4.5:1. At 200% zoom, every toolbar button remains within the smallest
desktop window, and help remains scrollable. Reading and size preferences survive
reopening without changing the document. Routine autosaves are silent to screen
readers; save failures and completed recovery have separate announcements.
Drawer names are concise, with metadata exposed separately. These automated
checks do not replace hands-on VoiceOver and NVDA testing before release.
Metal rendering checks cover GPU buffer limits and allocation failures, carriage
tracking, reading illumination, and loss and restoration of the WebGL context.
The installed help dialog and even reading light were also inspected visually
on macOS, then the original appearance was restored without editing the text.
The packaged Mac application's ASAR is
also supported by the smoke runner through `TYPELIGHT_TEST_APP=/path/to/app.asar`.
The installed palette was also inspected visually in the editor and drawer;
both retain the same visible tools and regular spacing. Keyboard order matches
the visual order, and drawer actions sit above the scene's lighting overlay.
The no-argument installer was
verified separately: it requests a normal quit, updates the installed copy,
and launches it again. No forced termination is used.

Cross-packaging on this Apple Silicon Mac produced a Windows x64 ZIP,
Windows and Linux x64 unpacked applications, and a Linux DEB package. The ZIP
has not been run on Windows, and the DEB has not been installed or run on Linux.
Windows NSIS and Linux AppImage creation reached their host
packaging tools, then failed because the downloaded Mac helper binaries were
Intel-only and could not execute here (macOS error -86). Their target-host CI
builds remain the intended verification path. Windows and Linux runtime tests
have not yet been run; this is not a verified public release for those systems.

## Performance checks

Run `npm run test:performance` locally when preparing a release. To select a
case, use `npm run test:performance -- novel` (or `small`, `stress`, `paragraph`).
This command is deliberately separate from `npm test`, `test:desktop`, and CI.
It requires the existing Electron development dependency, adds no dependencies,
and uses a fresh temporary library and Electron profile for each case. No
personal documents are read. Temporary libraries are removed after each run.
Raw timings, process memory samples, renderer heap measurements, fixture sizes,
and machine information are written under `build/performance/<timestamp>/`.
Set `TYPELIGHT_PERF_PROFILE=1` to record renderer CPU profiles during input and
switching, plus the duration of individual main-process storage writes.

The deterministic fixtures in `tests/performance-fixtures.cjs` contain Czech
accents, emoji, and English paragraphs. Each library starts with 30 full automatic
snapshots. Character counts below are UTF-16 code units; drawer counts exclude
the active document.

| Case | Active text | Drawer | Stored library |
| --- | ---: | ---: | ---: |
| small | 10,000 characters | 10 × 2,000 characters | 0.03 MiB |
| novel | 600,000 characters | 200 × 20,000 characters | 4.57 MiB |
| stress | 2,000,000 characters | 500 × 40,000 characters | 21.84 MiB |
| paragraph | 600,000 characters in one paragraph | 200 × 20,000 characters | 4.57 MiB |

The harness sends real Electron key events at the start, middle, and end (12
characters per position). It measures Electron `insertText` separately (three
commits per position), checks grouped undo, switches documents 30 times, replaces
all matches three times and undoes each replacement, opens snapshot history,
previews and restores a separate copy, saves, and closes with a final checkpoint.
Assertions compare every original document and title with the final on-disk
library, verify the exact inserted/replaced text, and reject renderer errors.

Action timings include dispatch from the main process and two animation frames
after completion. They indicate responsiveness, not physical keyboard-to-display
latency or completion of decorative animations. Startup ends after fonts and two
frames; it is not a cold-machine startup benchmark. WebGL and audio remain enabled
with volume zero, at 1180 × 820 and normal zoom. Background frame throttling is
disabled so a hidden test window does not distort the result.

### Development Mac baseline, 2026-11-25

Apple M1 Pro, 32 GiB RAM, arm64, Darwin 27.2.0, Electron 45.4.1 / Chromium
156.0.8078.100. All four cases passed their integrity checks. Values below are
milliseconds: medians except startup, history, save, and close, which each have
one sample. The raw report also retains every sample and nearest-rank p95; the
small sample counts do not establish a statistically robust latency guarantee.

| Operation | small | novel | stress | paragraph |
| --- | ---: | ---: | ---: | ---: |
| Startup | 368 | 869 | 1,443 | 777 |
| Key input, start / middle / end | 19 / 18 / 17 | 25 / 25 / 25 | 36 / 42 / 42 | 67 / 59 / 58 |
| Largest individual key-input sample | 53 | 87 | 138 | 120 |
| Switch document | 33 | 172 | 515 | 167 |
| Find | 37 | 138 | 415 | 170 |
| Replace all | 63 | 289 | 1,097 | 277 |
| Open history with initial preview | 33 | 164 | 401 | 190 |
| Preview another saved document | 15 | 46 | 156 | 45 |
| Restore and save a copy | 41 | 264 | 856 | 251 |
| Save library | 23 | 54 | 236 | 56 |
| Close and checkpoint | 15 | 43 | 96 | 40 |
| Electron insertText at the end | 17 | 142 | 1,208 | 54 |

The `insertText` path is substantially slower near the end of long multiline
documents than key events. A renderer CPU profile places most of that delay
outside the sampled application JavaScript. This is an observed automation/API
path, not evidence that normal typing takes 1.2 seconds per character. Real
dead-key and IME input still need hands-on testing before drawing conclusions
about those input methods. Disabling textarea wrapping did not improve that path;
no speculative editor change was made.

| Memory observation | small | novel | stress | paragraph |
| --- | ---: | ---: | ---: | ---: |
| Peak sampled process working-set sum, MiB | 807 | 1,434 | 2,844 | 1,532 |
| Renderer JS heap after initial load, MiB | 1.42 | 17.00 | 79.02 | 16.93 |
| Renderer JS heap after repeat cycle 1, MiB | 1.84 | 39.98 | 193.35 | 39.91 |
| Renderer JS heap after repeat cycle 2, MiB | 1.88 | 40.03 | 193.38 | 39.96 |

Working sets are sampled every 500 ms across the application's processes,
including GPU and utility processes. Their sum can count shared pages more than
once, misses shorter peaks, and is affected by macOS memory compression; it is
not an exact unique-RAM footprint. JS heap is measured through the debugger after
explicit garbage collection between stages, never during timed actions. It
excludes other native, graphics, and audio allocations. The two repeat cycles
each switch and edit/undo the same five documents. Their stable retained heap
does not establish leak freedom during hours of use.

The novel case provides a useful provisional beta workload on this machine.
The stress case preserves data, but half-second switches, one-second replacement,
and high transient memory are visible limitations. A single huge paragraph also
costs more per keystroke than ordinary paragraphs. Do not advertise the 50 MiB
storage ceiling as a smooth-editing capacity guarantee. Further candidates are
reducing drawer rebuilding and making long search/replacement work less blocking.
The bounded optimization pass below addresses redundant storage work and copies.
Lower-memory machines,
Windows, Linux, and real IME input remain unmeasured.

### Bounded storage and drawer optimization

Desktop saves now send only changed fields over IPC, retaining unacknowledged
changes until the disk write succeeds. Legacy hosts still receive complete
snapshots. The main process merges changes, validates changed values, and reuses
encoded fields from the last successful save. Encoding caches share the current
snapshot buffer rather than retaining older full buffers. The on-disk version-one
format, 50 MiB limit, complete-file conflict check, atomic replacement, fsync,
automatic backups, and close checkpoints are unchanged. Even no-op saves still
check for external file changes.

The renderer releases its initial preload seed after hydration and caches the
encoded size of unchanged fields for capacity checks. The drawer uses an ID map,
reuses date formatters, avoids recalculating newly rendered labels, and keeps its
canvas backing storage when its dimensions have not changed. Full DOM rebuilding
is retained because drag, keyboard focus, and accessibility depend on its ordering.

Regression coverage includes concurrent edits and reversions during a pending
save, failed-save retries, malformed patches, external changes, removed fields,
exact escaped UTF-8 size limits, one-time hydration, drawer labels, and resizing.
No migration or new dependency is required. This pass does not alter the slow
Electron insertText path or the ordinary input handling.

The same four cases passed again on the same Mac. Comparison with the baseline
above (before → after, milliseconds unless stated otherwise):

| Observation | small | novel | stress | paragraph |
| --- | ---: | ---: | ---: | ---: |
| Switch document, median | 33 → 26 | 172 → 163 | 515 → 471 | 167 → 149 |
| Replace all, median | 63 → 43 | 289 → 269 | 1,097 → 905 | 277 → 261 |
| Key input at end, median | 17 → 17 | 25 → 25 | 42 → 42 | 58 → 53 |
| Save library, single sample | 23 → 32 | 54 → 84 | 236 → 99 | 56 → 58 |
| JS heap after repeat cycle 2, MiB | 1.88 → 1.85 | 40.03 → 32.31 | 193.38 → 154.92 | 39.96 → 32.25 |
| Peak sampled working-set sum, MiB | 807 → 824 | 1,434 → 1,409 | 2,844 → 2,807 | 1,532 → 1,440 |

The largest workload retains about 20% less renderer JS heap. Document switching
improves modestly (about 8% in stress), and replace-all benefits from cheaper
capacity checks even though its search algorithm is unchanged. Single save
samples vary, including slower results on smaller cases; they do not support a
general end-to-end save-speed claim. Total working-set peaks remain high and
are not materially improved in the stress case. Full drawer serialization and
DOM rebuilding remain scalability limits; this is not a claim that every action
or every machine is faster.

The comparison uses raw reports from `build/performance/2026-11-25T09-36-54-698Z/`
and `build/performance/2026-11-25T09-57-36-536Z/` in the development workspace.
All original documents and titles survived the final disk checks. The full unit
suite (227 tests) and Electron smoke, recovery, and writing suites also passed.

## Distribution

Local Mac builds are signed ad hoc. Public Mac downloads require a Developer ID
signature and notarization; Windows release installers need the publisher's
signing setup. Configure those credentials in the release environment and
override the local Mac signing identity. No script removes quarantine or changes
Gatekeeper settings. The configured Mac deployment minimum is macOS 14; verify
that minimum and the other supported OS versions before publication.

Automatic updates, checkout, licensing, and download delivery remain outside
this desktop implementation. The initial update path is a replacement installer
that preserves the application data directory. The repository's MIT license and
all bundled font, sound, and texture attributions remain included.
