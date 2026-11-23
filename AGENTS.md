# Repository Guidelines

## Project Structure & Module Organization
Typelight has a dependency-free static web editor and one Electron desktop implementation for macOS, Windows, and Linux. `index.html` contains the shared interface, CSS, JavaScript, and WebGL shaders. `desktop/electron/` contains the isolated desktop host, storage, menus, and file dialogs; `desktop/web/` contains its bridge and appearance. `sw.js` handles web offline caching; `manifest.webmanifest` defines web installation metadata. Assets live in `sounds/`, `textures/`, `fonts/`, and `icons/`. `tools/` contains build and asset-generation scripts. `tests/` holds regression tests. `README.md`, `DESKTOP.md`, and `TODO.md` document behavior and outstanding work.

## Build, Test, and Development Commands
- `python3 -m http.server 8000` — serve the repository; open `http://localhost:8000`.
- Open `http://localhost:8000/#demo` for sample texts without reading or saving browser documents.
- `python3 tools/build-sounds.py --report` — download recordings, rebuild sound samples and their manifest, and report selections.
- `python3 tools/build-desk.py` — download and resize desk textures.
- `npm ci && npm start` — install locked development dependencies and start the desktop app.
- `npm test` — run isolated desktop unit tests.
- `npm run test:desktop` — exercise the actual Electron runtime using temporary documents.
- `npm run build:mac`, `npm run build:win`, `npm run build:linux` — package on the corresponding host.

Asset generation requires Python 3.9+ and `ffmpeg`. Web development needs no build step or package installation. Desktop development requires Node.js 22+ and npm; end users need neither.

## Coding Style & Naming Conventions
Use English for code and comments. Match existing two-space JavaScript/CSS indentation and four-space Python indentation. Use camelCase for JavaScript functions, snake_case for Python functions, and UPPER_SNAKE_CASE for constants. JavaScript uses semicolons and predominantly single-quoted strings. Reuse existing helpers and CSS custom properties before adding alternatives.

Keep new files focused and under 500 lines; extract cohesive modules when extending the oversized `index.html`. Preserve static deployment. Consult Context7 for current stable versions and documented APIs before introducing libraries.

## Testing Guidelines
Use Node's built-in test runner. For new functionality, add at least three unit tests under `tests/`: expected behavior, an edge case, and an error case. Use descriptive names such as `tests/<feature>.test.cjs`, document the runner, and update tests when logic changes. Never use personal documents in runtime tests; use `TYPELIGHT_DATA_DIR` or the isolated smoke harness.

Manually check editing, undo/redo, persistence, file import/export, keyboard navigation, and affected visual behavior. Use a separate browser profile for persistence tests; demo mode disables storage. Check offline reloads, WebGL fallback, and touch behavior when relevant.

## Commit & Pull Request Guidelines
Follow history's short imperative subjects, such as “Work the menu from the keyboard.” Commit and push only when explicitly requested. PRs should explain behavior changes, link relevant issues, list verification and limitations, and include screenshots for visual changes.

## Review Guidelines
Review all changed files, prioritizing document preservation, cross-tab storage, and failure handling. Update `sw.js`'s `CACHE` when its shell list changes. Preserve asset licenses and attribution.
