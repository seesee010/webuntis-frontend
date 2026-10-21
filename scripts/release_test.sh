#!/usr/bin/env bash
# Tests for scripts/release.sh. Builds into a temporary release dir.
set -euo pipefail
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

$R checksums >/dev/null
(cd release && sha256sum -c --quiet SHA256SUMS) && echo "ok   checksums verify" || { echo "FAIL checksums"; fail=1; }
check "checksum entries" "3" "$(wc -l <release/SHA256SUMS | tr -d ' ')"

exit $fail
