#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
case "$(uname -s)" in
  Darwin) platform=mac ;;
  Linux) platform=linux ;;
  MINGW*|MSYS*|CYGWIN*) platform=win ;;
  *) printf '%s\n' 'Use npm run build:mac, build:win, or build:linux on a supported host.' >&2; exit 1 ;;
esac
case "$(uname -m)" in arm64|aarch64) build_arch=arm64 ;; *) build_arch=x64 ;; esac
only_directory=0

usage() {
  cat <<'HELP'
Usage: tools/build-desktop.sh [--platform mac|win|linux] [--arch arm64|x64|universal] [--dir]

Build the shared Electron application. Defaults to this host and architecture.
Requires Node.js 22+ and npm. npm ci installs the locked build dependencies.
Build each release on its target operating system; CI covers all three systems.
Outputs installers in build/electron/. On macOS, also copies the app to
build/Typelight.app for install.sh. --dir skips creating installer archives.
Local macOS builds are signed ad hoc, not notarized for public distribution.
HELP
}
fail() { printf '%s\n' "$*" >&2; exit 1; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --platform) [ "$#" -ge 2 ] || fail 'Missing platform.'; platform=$2; shift 2 ;;
    --arch) [ "$#" -ge 2 ] || fail 'Missing architecture.'; build_arch=$2; shift 2 ;;
    --dir) only_directory=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done
case "$platform" in mac|win|linux) ;; *) fail "Unsupported platform: $platform" ;; esac
case "$build_arch" in x86_64) build_arch=x64 ;; arm64|x64|universal) ;; *) fail "Unsupported architecture: $build_arch" ;; esac
[ "$build_arch" != universal ] || [ "$platform" = mac ] || fail 'Universal builds are only available for macOS.'
command -v node >/dev/null 2>&1 || fail 'Install Node.js 22 or newer first.'
command -v npm >/dev/null 2>&1 || fail 'Install npm first.'
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' || fail 'Node.js 22 or newer is required.'
[ ! -L "$project_dir/build" ] || fail 'Refusing a symlinked build directory.'
cd "$project_dir"
npm ci
set -- --"$platform" --"$build_arch" --publish never
[ "$only_directory" -eq 0 ] || set -- "$@" --dir
npm exec -- electron-builder "$@"

if [ "$platform" = mac ]; then
  case "$build_arch" in x64) output=mac ;; *) output="mac-$build_arch" ;; esac
  built_app="$project_dir/build/electron/$output/Typelight.app"
  [ -d "$built_app" ] || fail "Missing built app: $built_app"
  target_app="$project_dir/build/Typelight.app"
  [ ! -L "$target_app" ] || fail 'Refusing a symlinked output app.'
  stage_dir=$(mktemp -d "$project_dir/build/.electron-copy.XXXXXX")
  trap 'rm -rf -- "$stage_dir"' EXIT HUP INT TERM
  /usr/bin/ditto "$built_app" "$stage_dir/Typelight.app"
  /usr/bin/codesign --verify --deep --strict "$stage_dir/Typelight.app"
  if [ -e "$target_app" ]; then mv "$target_app" "$stage_dir/previous.app"; fi
  if ! mv "$stage_dir/Typelight.app" "$target_app"; then
    if [ -e "$stage_dir/previous.app" ]; then mv "$stage_dir/previous.app" "$target_app"; fi
    fail 'Could not replace the build output.'
  fi
  printf 'Built: %s\n' "$target_app"
fi
printf 'Artifacts: %s/build/electron/\n' "$project_dir"
