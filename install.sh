#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_app=
destination="$HOME/Applications"
open_after=1
stage_dir=
previous_app=
target_app=
installed=0

usage() {
  cat <<'EOF'
Usage: ./install.sh [--app /path/Typelight.app] [--destination /path] [--no-open]

Run ./install.sh without arguments to build, update, and open Typelight.
The default destination is ~/Applications.
  --app PATH         Install an already built, signed Typelight.app instead.
  --destination DIR  Install Typelight.app in this directory without sudo.
  --no-open          Do not launch after installing.
  -h, --help         Show this help.

Source builds require macOS, Node.js 22+, and npm.
The app runs on macOS 14+. A running copy is asked to save and quit automatically.
If quitting is blocked, installation stops without forcibly terminating the app.
Documents and backups are preserved; the installer only replaces the app bundle.
Local builds use an ad hoc signature. No quarantine or Gatekeeper settings are changed.
EOF
}

fail() { printf '%s\n' "$*" >&2; exit 1; }
cleanup() {
  if [ "$installed" -eq 0 ] && [ -n "$previous_app" ] && [ -e "$previous_app" ]; then
    if [ ! -e "$target_app" ]; then mv "$previous_app" "$target_app"; fi
  fi
  if [ -n "$stage_dir" ] && [ -d "$stage_dir" ]; then
    # Retain the old app if an unexpected failure prevented rollback.
    if [ "$installed" -eq 0 ] && [ -n "$previous_app" ] && [ -e "$previous_app" ]; then
      printf 'Previous application retained at %s\n' "$previous_app" >&2
    else
      rm -rf -- "$stage_dir"
    fi
  fi
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    --app)
      [ "$#" -ge 2 ] || fail 'Missing --app path.'
      source_app=$2; shift 2 ;;
    --destination)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail 'Missing --destination directory.'
      destination=$2; shift 2 ;;
    --no-open) open_after=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[ "$(uname -s)" = Darwin ] || fail 'This installer is for macOS.'
[ "$(id -u)" -ne 0 ] || fail 'Run without sudo; the default destination is ~/Applications.'
os_version=$(sw_vers -productVersion)
[ "${os_version%%.*}" -ge 14 ] || fail 'Typelight requires macOS 14 or newer.'

if [ -z "$source_app" ]; then
  [ -x "$script_dir/tools/build-desktop.sh" ] || fail 'Pass --app with a built Typelight.app.'
  # A development copy may be running from a build output that will be replaced.
  /usr/bin/osascript -l JavaScript "$script_dir/tools/quit-desktop.js" \
    "$script_dir/build/Typelight.app" "$script_dir/build/electron/mac/Typelight.app" \
    "$script_dir/build/electron/mac-arm64/Typelight.app" "$script_dir/build/electron/mac-universal/Typelight.app" ||
    fail 'The running development copy could not quit. Build and installation stopped.'
  "$script_dir/tools/build-desktop.sh" --platform mac --dir
  source_app="$script_dir/build/Typelight.app"
fi
[ -d "$source_app" ] && [ ! -L "$source_app" ] || fail 'The source must be an application bundle, not a symbolic link.'
source_app=$(CDPATH= cd -- "$source_app" && pwd)

validate_app() {
  app_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$1/Contents/Info.plist" 2>/dev/null) || return 1
  app_executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$1/Contents/Info.plist" 2>/dev/null) || return 1
  [ "$app_id" = com.typelight.app ] && [ "$app_executable" = Typelight ] &&
    [ -f "$1/Contents/MacOS/Typelight" ] && [ -x "$1/Contents/MacOS/Typelight" ]
}
validate_app "$source_app" || fail 'The source is not a valid Typelight application.'
/usr/bin/codesign --verify --deep --strict "$source_app" || fail 'Application signature verification failed.'

[ ! -L "$destination" ] || fail 'Refusing a symbolic link as the destination directory.'
mkdir -p "$destination"
destination=$(CDPATH= cd -- "$destination" && pwd)
target_app="$destination/Typelight.app"
[ "$source_app" != "$target_app" ] || fail 'The application is already at the destination.'
[ ! -L "$target_app" ] || fail 'Refusing to replace a symbolic link.'
if [ -e "$target_app" ]; then
  validate_app "$target_app" || fail 'Refusing to replace an application that is not Typelight.'
fi

stage_dir=$(mktemp -d "$destination/.typelight-install.XXXXXX")
/usr/bin/ditto "$source_app" "$stage_dir/Typelight.app"
/usr/bin/codesign --verify --deep --strict "$stage_dir/Typelight.app" || fail 'Copied application failed verification.'
printf '%s\n' 'Asking any running previous copy to save and quit…'
if [ "$destination" = "$HOME/Applications" ]; then
  # The standard install also handles copies launched from Downloads or a DMG.
  set -- --all
else
  set -- "$target_app" "$source_app"
fi
/usr/bin/osascript -l JavaScript "$script_dir/tools/quit-desktop.js" "$@" ||
  fail 'Update stopped; the previous application and its documents are preserved.'
if [ -e "$target_app" ]; then
  previous_app="$stage_dir/previous.app"
  mv "$target_app" "$previous_app"
fi
mv "$stage_dir/Typelight.app" "$target_app"
installed=1
printf 'Installed: %s\n' "$target_app"
if [ "$open_after" -eq 1 ]; then /usr/bin/open "$target_app"; fi
