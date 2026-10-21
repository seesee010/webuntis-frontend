#!/usr/bin/env bash
# Release helpers. Run from anywhere; paths are relative to the repo.
#
#   release.sh sidecar TRIPLE     build untisd as Tauri sidecar for a Rust target triple
#   release.sh goarch TRIPLE      print "GOOS GOARCH [GOARM]" for a triple (used by tests)
#   release.sh web GOOS GOARCH    pack the web edition for one platform into release/
#   release.sh web-all            pack the web edition for every platform in WEB_TARGETS
#   release.sh checksums          write release/SHA256SUMS
#
# The web edition embeds the frontend: run `make web` (or copy desktop/dist
# into backend/internal/webui/dist) before `web`/`web-all`.
set -euo pipefail

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
    build "$out.amd64" darwin amd64
    build "$out.arm64" darwin arm64
    lipo -create -output "$out" "$out.amd64" "$out.arm64"
    rm -f "$out.amd64" "$out.arm64"
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
  checksums) checksums ;;
  *) sed -n '2,11p' "$0"; exit 2 ;;
esac
