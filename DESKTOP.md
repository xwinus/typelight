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

Cross-compilation is not the release verification strategy. The GitHub Actions
workflow builds Apple Silicon and Intel Mac artifacts, a Windows x64 installer,
and Linux x64 packages on their corresponding hosts. It uploads workflow
artifacts only; it does not publish a release. Runtime checks on each target
remain required even after packaging succeeds.

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
are spaced at least five minutes apart; the newest 30 are retained. The current
library is more recent than the latest snapshot. Local backups do not protect
against device loss; keep portable library exports elsewhere as well.

The library limit is 50 MiB. Text imports are limited to 8 MB per file. Invalid
or unsupported primary data must stop loading rather than silently replace the
only copy. Keep the original file when recovering a damaged library.

For isolated testing, set `TYPELIGHT_DATA_DIR` to a temporary directory. Never
point it at unrelated files. The shared web `#demo` mode disables persistence;
it is not a substitute for desktop save/restart testing.

## Verification

```sh
npm test
npm run test:desktop
```

Unit tests cover the shared desktop bridge and the Electron modules. The
desktop smoke test launches the real Electron runtime with temporary data.
Use `xvfb-run -a npm run test:desktop` on a headless Linux host. Each new
functionality requires expected, edge, and error cases. Changes to persistence
must also preserve cancellation, interrupted writes, malformed data, and the
previous valid library. Tests use temporary data, not personal documents.

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

The latest unit suite passes 76 tests. The packaged Mac application's ASAR is
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
