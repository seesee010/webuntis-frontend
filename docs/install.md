# Installation

Every release on the [releases page](https://github.com/seesee010/webuntis-frontend/releases)
comes in two editions:

- the **desktop app** — a native window (Tauri), for Windows, macOS and Linux;
- the **web edition** — one small program, `untisd`, that opens the same app
  in your browser. It runs on everything Go supports, including the BSDs.

Both start with fictional **sample data**. To see your real timetable,
install the [`untis` CLI](https://github.com/seesee010/webuntis-scraper),
run `untis init` once, and switch **Settings › Data source** to
**untis CLI**.

In the file names below, `VERSION` stands for the release version, e.g. `1.0.0`.

## Windows

| File | For |
|---|---|
| `Untis_VERSION_x64-setup.exe` | installer, 64-bit Intel/AMD (recommended) |
| `Untis_VERSION_x64_en-US.msi` | MSI package, for managed installs (`msiexec /i`) |
| `Untis_VERSION_arm64-setup.exe` | installer, ARM64 (Snapdragon, Surface Pro X, …) |
| `Untis_VERSION_x64-windows-portable.zip` | no installation: unzip and run `untis-desktop.exe` |
| `Untis_VERSION_arm64-windows-portable.zip` | portable, ARM64 |

The app uses Microsoft Edge WebView2, which ships with Windows 10 and 11;
the installers add it if it is missing (the portable zips need it present).

The builds are not code-signed yet, so SmartScreen may warn "Windows
protected your PC": choose **More info › Run anyway**.

## macOS

| File | For |
|---|---|
| `Untis_VERSION_universal.dmg` | disk image, Apple Silicon and Intel (recommended) |
| `Untis_VERSION_universal.app.tar.gz` | the app bundle as an archive |

Open the dmg and drag **Untis** into **Applications**. The app is not
notarised yet, so the first start is blocked by Gatekeeper. Either
right-click the app and choose **Open**, or run:

```bash
xattr -dr com.apple.quarantine /Applications/Untis.app
```

## Linux

| File | For |
|---|---|
| `Untis_VERSION_amd64.deb` / `Untis_VERSION_arm64.deb` | Debian, Ubuntu, Mint, Pop!_OS: `sudo apt install ./Untis_*.deb` |
| `Untis-VERSION-1.x86_64.rpm` / `Untis-VERSION-1.aarch64.rpm` | Fedora, openSUSE, RHEL: `sudo dnf install ./Untis-*.rpm` |
| `Untis_VERSION_amd64.AppImage` / `Untis_VERSION_aarch64.AppImage` | any distribution: `chmod +x` and run |
| `Untis_VERSION_x64-linux-portable.tar.gz` / `…_arm64-linux-portable.tar.gz` | unpack and run `./untis-desktop`; needs WebKitGTK 4.1 (`webkit2gtk-4.1`) installed |

On Arch Linux (and Omarchy) the AppImage or the portable archive work out
of the box: `sudo pacman -S webkit2gtk-4.1` for the portable one.

## BSD, illumos, Solaris and everything else: the web edition

The desktop toolkit does not support the BSDs, so they get the web edition.
It is the same app, served by `untisd` on 127.0.0.1 and opened in your
browser.

| File | Platforms |
|---|---|
| `untis-web-VERSION-freebsd-{amd64,arm64,386,armv7}.tar.gz` | FreeBSD |
| `untis-web-VERSION-openbsd-{amd64,arm64,386,armv7}.tar.gz` | OpenBSD |
| `untis-web-VERSION-netbsd-{amd64,arm64,386,armv7}.tar.gz` | NetBSD |
| `untis-web-VERSION-dragonfly-amd64.tar.gz` | DragonFly BSD |
| `untis-web-VERSION-illumos-amd64.tar.gz`, `untis-web-VERSION-solaris-amd64.tar.gz` | illumos (OmniOS, OpenIndiana), Solaris |
| `untis-web-VERSION-linux-{amd64,arm64,armv7,armv6,386,riscv64,ppc64le,s390x,loong64}.tar.gz` | Linux, incl. Raspberry Pi and servers |
| `untis-web-VERSION-darwin-{amd64,arm64}.tar.gz` | macOS without the desktop app |
| `untis-web-VERSION-windows-{amd64,arm64,386}.zip` | Windows without the desktop app |

```bash
tar xzf untis-web-VERSION-freebsd-amd64.tar.gz
cd untis-web-VERSION-freebsd-amd64
./untisd -web
```

`untisd -web` prints the address and opens it with `xdg-open` (`open` on
macOS). On a machine without a desktop, add `-no-browser` and open the
printed address in a browser on the same machine — the server only
accepts connections from the local machine.

## Updating

The app looks for a newer release once a day. When there is one, an
**Update to …** button appears in the top bar; without a newer release
there is no button. Nothing is downloaded until you press it.

What the button does depends on how you installed the app, and it always
fetches the file for your platform and installation:

| Installed from | The button |
|---|---|
| AppImage | downloads the new AppImage, puts it in place of the old file and offers a restart |
| portable archive (Linux, Windows) | replaces the programs in the folder and offers a restart |
| web edition archive | replaces `untisd`; on Linux, macOS and the BSDs it restarts itself and reloads the page, on Windows you start it again |
| `.deb` / `.rpm` | downloads the package to your download folder and shows the command to install it (this needs administrator rights) |
| Windows installer (`.exe`, `.msi`) | downloads the installer and opens it; SmartScreen may warn as described under [Windows](#windows) |
| macOS disk image | downloads the disk image and opens it; drag **Untis** into **Applications** again. Gatekeeper treats it like any download, see [macOS](#macos) |
| built from source, other platforms | opens the release page |

The folder of a portable installation is recognised by the `portable.txt`
file in it. Portable folders and web archives of version 1.0.0 predate
the updater and cannot be recognised; unpack a newer archive over them once.

Every download is checked against the release's `SHA256SUMS` before it is
used. **Settings › General › Check for updates** switches the daily check
off; **Status › Check now** looks on request.

## Verifying downloads

Every release has a `SHA256SUMS` file:

```bash
sha256sum -c --ignore-missing SHA256SUMS      # Linux, BSD: sha256 -c / shasum -a 256 -c
```

## Building from source

See the [README](../README.md#-development): `make app` for the desktop app,
`make web` for the web edition (`backend/bin/untisd`), and
`scripts/release.sh` for every release artefact.
