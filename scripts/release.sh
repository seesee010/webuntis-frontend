#!/usr/bin/env bash
# Release helpers. Run from anywhere; paths are relative to the repo.
#
#   release.sh sidecar TRIPLE     build untisd as Tauri sidecar for a Rust target triple
#   release.sh goarch TRIPLE      print "GOOS GOARCH [GOARM]" for a triple (used by tests)
#   release.sh web GOOS GOARCH    pack the web edition for one platform into release/
#   release.sh web-all            pack the web edition for every platform in WEB_TARGETS
#   release.sh collect TRIPLE     copy Tauri bundles of a target into release/ and add portable archives
#   release.sh notes VERSION      print the CHANGELOG section of VERSION (release notes)
#   release.sh checksums          write release/SHA256SUMS
#
# The web edition embeds the frontend: run `make web` (or copy desktop/dist
# into backend/internal/webui/dist) before `web`/`web-all`.
set -euo pipefail
export LC_ALL=C

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(cat "$ROOT/VERSION")
OUT=$ROOT/release
LDFLAGS="-s -w -X main.version=$VERSION"

# Every platform the web edition is built for: GOOS/GOARCH[/GOARM].
WEB_TARGETS=(
  linux/amd64 linux/arm64 linux/arm/7 linux/arm/6 linux/386 linux/riscv64 linux/ppc64le linux/s390x linux/loong64
  windows/amd64 windows/arm64 windows/386
  darwin/amd64 darwin/arm64
  freebsd/amd64 freebsd/arm64 freebsd/386 freebsd/arm/7
  openbsd/amd64 openbsd/arm64 openbsd/386 openbsd/arm/7
  netbsd/amd64 netbsd/arm64 netbsd/386 netbsd/arm/7
  dragonfly/amd64
  illumos/amd64
  solaris/amd64
)

die() { echo "release.sh: $*" >&2; exit 1; }

# goarch TRIPLE -> "GOOS GOARCH [GOARM]"
goarch() {
  local triple=$1 arch os
  arch=${triple%%-*}
  case $triple in
    *-linux-*) os=linux ;;
    *-windows-*) os=windows ;;
    *-apple-darwin) os=darwin ;;
    *-freebsd) os=freebsd ;;
    *-openbsd) os=openbsd ;;
    *-netbsd) os=netbsd ;;
    *) die "unknown target triple: $triple" ;;
  esac
  case $arch in
    x86_64) echo "$os amd64" ;;
    aarch64) echo "$os arm64" ;;
    i686|i586) echo "$os 386" ;;
    armv7) echo "$os arm 7" ;;
    riscv64gc) echo "$os riscv64" ;;
    universal) echo "$os universal" ;;
    *) die "unknown architecture in $triple" ;;
  esac
}

build() { # build OUTFILE GOOS GOARCH [GOARM]
  local out=$1 goos=$2 goarch=$3 goarm=${4:-}
  (cd "$ROOT/backend" && CGO_ENABLED=0 GOOS=$goos GOARCH=$goarch GOARM=$goarm \
    go build -trimpath -ldflags "$LDFLAGS" -o "$out" ./cmd/untisd)
}

sidecar() {
  local triple=$1 dir=$ROOT/desktop/src-tauri/binaries
  local ext="" goos goarch goarm
  read -r goos goarch goarm <<<"$(goarch "$triple")"
  [[ $goos == windows ]] && ext=.exe
  mkdir -p "$dir"
  local out=$dir/untisd-$triple$ext
  if [[ $goarch == universal ]]; then
    # Tauri builds a universal app arch by arch, so it needs both
    # per-arch sidecars as well as the lipo'd universal one.
    build "$dir/untisd-x86_64-apple-darwin" darwin amd64
    build "$dir/untisd-aarch64-apple-darwin" darwin arm64
    lipo -create -output "$out" "$dir/untisd-x86_64-apple-darwin" "$dir/untisd-aarch64-apple-darwin"
  else
    build "$out" "$goos" "$goarch" "$goarm"
  fi
  echo "$out"
}

web() {
  local goos=$1 goarch=$2 goarm=${3:-}
  [[ -f $ROOT/backend/internal/webui/dist/index.html ]] || die "frontend not embedded; run 'make web' first"
  local suffix=$goarch${goarm:+v$goarm}
  local name=untis-web-$VERSION-$goos-$suffix
  local stage
  stage=$(mktemp -d)
  mkdir -p "$stage/$name" "$OUT"
  local bin=untisd
  [[ $goos == windows ]] && bin=untisd.exe
  build "$stage/$name/$bin" "$goos" "$goarch" "$goarm"
  cat >"$stage/$name/README.txt" <<TXT
Untis web edition $VERSION ($goos/$suffix)

Run:   ./$bin -web
It starts a local server on 127.0.0.1 and opens the app in your browser.
Without a browser opener (e.g. on a server), add -no-browser and open the
printed address yourself.

Sample data is shown until you switch Settings > Data source to the
untis CLI (https://github.com/seesee010/webuntis-scraper).
TXT
  if [[ $goos == windows ]]; then
    (cd "$stage" && zip -qr "$OUT/$name.zip" "$name")
    echo "$OUT/$name.zip"
  else
    tar -C "$stage" -czf "$OUT/$name.tar.gz" "$name"
    echo "$OUT/$name.tar.gz"
  fi
  rm -rf "$stage"
}

web_all() {
  local t goos goarch goarm
  for t in "${WEB_TARGETS[@]}"; do
    IFS=/ read -r goos goarch goarm <<<"$t"
    web "$goos" "$goarch" "$goarm"
  done
}

zipdir() { # zipdir ARCHIVE DIR - zip, 7-Zip (Windows runners) or PowerShell
  if command -v zip >/dev/null; then
    (cd "$(dirname "$2")" && zip -qr "$1" "$(basename "$2")")
  elif command -v 7z >/dev/null; then
    # 7-Zip writes "/" separators, so the zip unpacks correctly everywhere.
    (cd "$(dirname "$2")" && 7z a -tzip -bd "$1" "$(basename "$2")" >/dev/null)
  else
    powershell -NoProfile -Command "Compress-Archive -Path '$(cygpath -w "$2")' -DestinationPath '$(cygpath -w "$1")'"
  fi
}

# collect TRIPLE: the installers Tauri produced, plus portable archives
# (the app binary next to untisd, no installation needed).
collect() {
  local triple=$1 goos goarch _ arch
  read -r goos goarch _ <<<"$(goarch "$triple")"
  arch=$goarch
  [[ $goarch == amd64 ]] && arch=x64
  local rel=${TARGET_DIR:-$ROOT/desktop/src-tauri/target}/$triple/release
  local bundle=$rel/bundle
  [[ -d $bundle ]] || die "no bundles in $bundle"
  mkdir -p "$OUT"
  local f n=0
  shopt -s nullglob
  for f in "$bundle"/deb/*.deb "$bundle"/rpm/*.rpm "$bundle"/appimage/*.AppImage \
           "$bundle"/dmg/*.dmg "$bundle"/msi/*.msi "$bundle"/nsis/*.exe; do
    cp "$f" "$OUT/"
    n=$((n + 1))
  done
  for f in "$bundle"/macos/*.app; do
    tar -C "$(dirname "$f")" -czf "$OUT/Untis_${VERSION}_${arch}.app.tar.gz" "$(basename "$f")"
    n=$((n + 1))
  done
  shopt -u nullglob

  local stage name
  stage=$(mktemp -d)
  case $goos in
    linux)
      name=Untis_${VERSION}_${arch}-linux-portable
      mkdir -p "$stage/$name"
      cp "$rel/untis-desktop" "$rel/untisd" "$stage/$name/"
      tar -C "$stage" -czf "$OUT/$name.tar.gz" "$name"
      n=$((n + 1)) ;;
    windows)
      name=Untis_${VERSION}_${arch}-windows-portable
      mkdir -p "$stage/$name"
      cp "$rel/untis-desktop.exe" "$rel/untisd.exe" "$stage/$name/"
      zipdir "$OUT/$name.zip" "$stage/$name"
      n=$((n + 1)) ;;
  esac
  rm -rf "$stage"
  [[ $n -gt 0 ]] || die "nothing collected for $triple"
  ls -1 "$OUT"
}

# notes VERSION: the changelog section, plus where to find the downloads.
notes() {
  local version=$1
  awk -v v="$version" '
    $0 ~ "^## \\[" v "\\]" { on = 1; next }
    on && /^## \[/ { exit }
    on && /^\[/ { next }
    on { print }
  ' "$ROOT/CHANGELOG.md" | sed '/./,$!d'
  cat <<MD

### Downloads

Which file to pick is explained in the
[installation guide](https://github.com/seesee010/webuntis-frontend/blob/v$version/docs/install.md).
Verify downloads with \`sha256sum -c SHA256SUMS\`.
MD
}

checksums() {
  [[ -d $OUT ]] || die "nothing in $OUT"
  (cd "$OUT" && find . -maxdepth 1 -type f ! -name SHA256SUMS -printf '%f\n' | sort | xargs sha256sum >SHA256SUMS)
  echo "$OUT/SHA256SUMS"
}

case ${1:-} in
  sidecar) sidecar "${2:?triple}" ;;
  goarch) goarch "${2:?triple}" ;;
  web) web "${2:?goos}" "${3:?goarch}" "${4:-}" ;;
  web-all) web_all ;;
  targets) printf '%s\n' "${WEB_TARGETS[@]}" ;;
  collect) collect "${2:?triple}" ;;
  notes) notes "${2:?version}" ;;
  checksums) checksums ;;
  *) sed -n '2,13p' "$0"; exit 2 ;;
esac
