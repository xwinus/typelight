#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/typelight-installer-test.XXXXXX")
trap 'rm -rf -- "$test_dir"' EXIT HUP INT TERM
fixture="$test_dir/Source With Spaces/Typelight.app"
destination="$test_dir/Applications With Spaces"
mkdir -p "$fixture/Contents/MacOS" "$fixture/Contents/Resources" "$destination"
cat > "$fixture/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.typelight.app</string>
  <key>CFBundleExecutable</key><string>Typelight</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
printf 'int main(void) { return 0; }\n' > "$test_dir/fixture.c"
xcrun clang "$test_dir/fixture.c" -o "$fixture/Contents/MacOS/Typelight"
printf 'first version\n' > "$fixture/Contents/Resources/version.txt"
/usr/bin/codesign --force --sign - "$fixture" 2>/dev/null

install_fixture() {
  "$project_dir/install.sh" --app "$fixture" --destination "$destination" --no-open
}
expect_failure() {
  if "$@" > "$test_dir/failure.log" 2>&1; then
    printf 'Expected failure: %s\n' "$*" >&2
    exit 1
  fi
}

printf 'personal writing\n' > "$destination/personal-text.txt"
install_fixture > "$test_dir/install.log" 2>&1
cmp "$fixture/Contents/Resources/version.txt" "$destination/Typelight.app/Contents/Resources/version.txt"
[ "$(cat "$destination/personal-text.txt")" = 'personal writing' ]
printf '%s\n' 'PASS: installs a signed application into a path with spaces and preserves neighboring files'

printf 'second version\n' > "$fixture/Contents/Resources/version.txt"
/usr/bin/codesign --force --sign - "$fixture" 2>/dev/null
install_fixture > "$test_dir/upgrade.log" 2>&1
[ "$(cat "$destination/Typelight.app/Contents/Resources/version.txt")" = 'second version' ]
printf '%s\n' 'PASS: upgrades an existing Typelight application'

expect_failure "$project_dir/install.sh" --app "$destination/Typelight.app" --destination "$destination" --no-open
[ -x "$destination/Typelight.app/Contents/MacOS/Typelight" ]
printf '%s\n' 'PASS: rejects installing a bundle over itself'

foreign_destination="$test_dir/Unrelated Applications"
mkdir -p "$foreign_destination/Typelight.app/Contents"
cp "$fixture/Contents/Info.plist" "$foreign_destination/Typelight.app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier com.example.unrelated' "$foreign_destination/Typelight.app/Contents/Info.plist"
expect_failure "$project_dir/install.sh" --app "$fixture" --destination "$foreign_destination" --no-open
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$foreign_destination/Typelight.app/Contents/Info.plist")" = com.example.unrelated ]
printf '%s\n' 'PASS: refuses to replace an unrelated application'

ln -s "$destination" "$test_dir/Linked Applications"
expect_failure "$project_dir/install.sh" --app "$fixture" --destination "$test_dir/Linked Applications" --no-open
printf '%s\n' 'PASS: refuses a symbolic-link destination'

printf 'unexpected modification\n' > "$fixture/Contents/Resources/version.txt"
expect_failure install_fixture
[ "$(cat "$destination/Typelight.app/Contents/Resources/version.txt")" = 'second version' ]
printf '%s\n' 'PASS: rejects a damaged signature without touching the installed application'
/usr/bin/codesign --force --sign - "$fixture" 2>/dev/null

mkdir "$test_dir/failing-commands"
cat > "$test_dir/failing-commands/mv" <<'EOF'
#!/bin/sh
case "$1" in
  */.typelight-install.*/Typelight.app) exit 1 ;;
esac
exec /bin/mv "$@"
EOF
chmod +x "$test_dir/failing-commands/mv"
expect_failure env PATH="$test_dir/failing-commands:$PATH" "$project_dir/install.sh" \
  --app "$fixture" --destination "$destination" --no-open
[ "$(cat "$destination/Typelight.app/Contents/Resources/version.txt")" = 'second version' ]
/usr/bin/codesign --verify --deep --strict "$destination/Typelight.app"
printf '%s\n' 'PASS: restores the previous application when replacing it fails'

mkdir -p "$test_dir/blocked-installer/tools"
cp "$project_dir/install.sh" "$test_dir/blocked-installer/install.sh"
printf 'function run() { throw new Error("Quit was blocked"); }\n' > "$test_dir/blocked-installer/tools/quit-desktop.js"
expect_failure sh "$test_dir/blocked-installer/install.sh" --app "$fixture" --destination "$destination" --no-open
[ "$(cat "$destination/Typelight.app/Contents/Resources/version.txt")" = 'second version' ]
/usr/bin/codesign --verify --deep --strict "$destination/Typelight.app"
printf '%s\n' 'PASS: a failed quit leaves the installed application intact'

# Use a separate fixture process; never send quit to a personal Typelight copy.
xcrun clang -fobjc-arc -framework AppKit "$project_dir/tests/fixtures/installer-app.m" \
  -o "$fixture/Contents/MacOS/Typelight"
/usr/bin/codesign --force --sign - "$fixture" 2>/dev/null
install_fixture > "$test_dir/prepare-running.log" 2>&1
marker="$test_dir/pending-save.txt"
"$destination/Typelight.app/Contents/MacOS/Typelight" "$marker" &
fixture_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ ! -f "$marker.ready" ] || break
  sleep 0.2
done
[ -f "$marker.ready" ] || { printf '%s\n' 'Fixture did not start.' >&2; exit 1; }
install_fixture > "$test_dir/running-upgrade.log" 2>&1
wait "$fixture_pid"
[ "$(cat "$marker")" = 'pending writing saved' ]
printf '%s\n' 'PASS: normally quits the running target and waits for its pending save before replacing it'
