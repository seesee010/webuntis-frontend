#!/usr/bin/env bash
# Tests for scripts/release.sh. Builds into a temporary release dir.
set -euo pipefail
export LC_ALL=C
cd "$(dirname "$0")/.."
R=scripts/release.sh
fail=0
check() { # check DESCRIPTION EXPECTED ACTUAL
  if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FAIL $1: expected '$2', got '$3'"; fail=1; fi
}

# Triple mapping for every desktop target the release workflow uses.
check "x86_64 linux"   "linux amd64"       "$($R goarch x86_64-unknown-linux-gnu)"
check "aarch64 linux"  "linux arm64"       "$($R goarch aarch64-unknown-linux-gnu)"
check "armv7 linux"    "linux arm 7"       "$($R goarch armv7-unknown-linux-gnueabihf)"
check "x86_64 windows" "windows amd64"     "$($R goarch x86_64-pc-windows-msvc)"
check "arm64 windows"  "windows arm64"     "$($R goarch aarch64-pc-windows-msvc)"
check "intel mac"      "darwin amd64"      "$($R goarch x86_64-apple-darwin)"
check "universal mac"  "darwin universal"  "$($R goarch universal-apple-darwin)"
check "freebsd"        "freebsd amd64"     "$($R goarch x86_64-unknown-freebsd)"
if $R goarch sparc-sun-solaris >/dev/null 2>&1; then echo "FAIL unknown triple accepted"; fail=1; else echo "ok   unknown triple rejected"; fi

# Every web target is a platform the Go toolchain supports.
supported=$(go tool dist list)
unsupported=0
while IFS=/ read -r goos goarch _; do
  grep -qx "$goos/$goarch" <<<"$supported" || { echo "FAIL $goos/$goarch not supported by go"; unsupported=1; fail=1; }
done < <($R targets)
[[ $unsupported == 0 ]] && echo "ok   all $($R targets | wc -l) web targets are Go ports"

# ... and every one of them actually compiles.
while IFS=/ read -r goos goarch goarm; do
  if (cd backend && CGO_ENABLED=0 GOOS=$goos GOARCH=$goarch GOARM=$goarm go build -o /dev/null ./cmd/untisd) 2>/dev/null; then :; else
    echo "FAIL $goos/$goarch${goarm:+/$goarm} does not compile"; fail=1
  fi
done < <($R targets)
echo "ok   cross-compiled every web target"
grep -q '^freebsd/' <(  $R targets) && grep -q '^openbsd/' <($R targets) && grep -q '^netbsd/' <($R targets) \
  && echo "ok   BSDs included" || { echo "FAIL BSDs missing"; fail=1; }

# Build a sidecar and two web archives for real.
out=$($R sidecar x86_64-unknown-linux-gnu)
check "sidecar version" "untisd $(cat VERSION)" "$("$out" -version)"

dist=backend/internal/webui/dist
created_index=0
if [[ ! -f $dist/index.html ]]; then echo '<html><head></head></html>' >$dist/index.html; created_index=1; fi
trap '[[ $created_index == 1 ]] && rm -f '"$dist"'/index.html; rm -rf release' EXIT
rm -rf release

tgz=$($R web freebsd amd64)
check "freebsd archive" "untis-web-$(cat VERSION)-freebsd-amd64.tar.gz" "$(basename "$tgz")"
check "freebsd contents" "README.txt untisd" "$(tar -tzf "$tgz" | grep -v '/$' | xargs -n1 basename | sort | xargs)"
zipf=$($R web windows arm64)
check "windows archive is zip" "untis-web-$(cat VERSION)-windows-arm64.zip" "$(basename "$zipf")"
check "windows binary" "1" "$(unzip -l "$zipf" | grep -c 'untisd.exe')"
armf=$($R web linux arm 7)
check "armv7 name" "untis-web-$(cat VERSION)-linux-armv7.tar.gz" "$(basename "$armf")"

# collect: a fake Tauri output tree for Linux and Windows.
fake=$(mktemp -d)
V=$(cat VERSION)
mkdir -p "$fake/x86_64-unknown-linux-gnu/release/bundle/"{deb,rpm,appimage}
touch "$fake/x86_64-unknown-linux-gnu/release/bundle/deb/Untis_${V}_amd64.deb" \
      "$fake/x86_64-unknown-linux-gnu/release/bundle/rpm/Untis-${V}-1.x86_64.rpm" \
      "$fake/x86_64-unknown-linux-gnu/release/bundle/appimage/Untis_${V}_amd64.AppImage" \
      "$fake/x86_64-unknown-linux-gnu/release/untis-desktop" "$fake/x86_64-unknown-linux-gnu/release/untisd"
mkdir -p "$fake/universal-apple-darwin/release/bundle/"{dmg,macos/Untis.app/Contents}
touch "$fake/universal-apple-darwin/release/bundle/dmg/Untis_${V}_universal.dmg"
mkdir -p "$fake/aarch64-pc-windows-msvc/release/bundle/nsis"
touch "$fake/aarch64-pc-windows-msvc/release/bundle/nsis/Untis_${V}_arm64-setup.exe" \
      "$fake/aarch64-pc-windows-msvc/release/untis-desktop.exe" "$fake/aarch64-pc-windows-msvc/release/untisd.exe"
rm -rf release
TARGET_DIR=$fake $R collect x86_64-unknown-linux-gnu >/dev/null
TARGET_DIR=$fake $R collect universal-apple-darwin >/dev/null
TARGET_DIR=$fake $R collect aarch64-pc-windows-msvc >/dev/null
check "collected files" "Untis-${V}-1.x86_64.rpm Untis_${V}_amd64.AppImage Untis_${V}_amd64.deb Untis_${V}_arm64-setup.exe Untis_${V}_arm64-windows-portable.zip Untis_${V}_universal.app.tar.gz Untis_${V}_universal.dmg Untis_${V}_x64-linux-portable.tar.gz" "$(ls release | sort | xargs)"
check "linux portable contents" "untis-desktop untisd" "$(tar -tzf release/Untis_${V}_x64-linux-portable.tar.gz | grep -v '/$' | xargs -n1 basename | sort | xargs)"
check "windows portable contents" "2" "$(unzip -l release/Untis_${V}_arm64-windows-portable.zip | grep -c '\.exe')"
if TARGET_DIR=$fake/none $R collect x86_64-unknown-linux-gnu >/dev/null 2>&1; then echo "FAIL collect without bundles"; fail=1; else echo "ok   collect without bundles fails"; fi
rm -rf "$fake" release
$R web freebsd amd64 >/dev/null
$R web windows arm64 >/dev/null
$R web linux arm 7 >/dev/null

# notes: the changelog section of the version, without link references.
notes=$($R notes "$V")
grep -q "^First release." <<<"$notes" && echo "ok   notes start with the section text" || { echo "FAIL notes text"; fail=1; }
grep -q "^### Added" <<<"$notes" && echo "ok   notes keep subsections" || { echo "FAIL notes subsections"; fail=1; }
grep -q "^\[$V\]:" <<<"$notes" && { echo "FAIL notes contain link refs"; fail=1; } || echo "ok   notes drop link references"
grep -q "docs/install.md" <<<"$notes" && echo "ok   notes link the install guide" || { echo "FAIL notes install link"; fail=1; }

$R checksums >/dev/null
(cd release && sha256sum -c --quiet SHA256SUMS) && echo "ok   checksums verify" || { echo "FAIL checksums"; fail=1; }
check "checksum entries" "3" "$(wc -l <release/SHA256SUMS | tr -d ' ')"

exit $fail
