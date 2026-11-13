package update

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// Kind is the way the running app was installed. It decides which file
// of a release belongs to this installation.
type Kind string

const (
	KindWeb      Kind = "web"      // web edition archive (untisd -web)
	KindAppImage Kind = "appimage" // Linux AppImage
	KindPortable Kind = "portable" // portable desktop archive (Linux, Windows)
	KindDeb      Kind = "deb"      // Debian package
	KindRPM      Kind = "rpm"      // RPM package
	KindNSIS     Kind = "nsis"     // Windows setup.exe
	KindMSI      Kind = "msi"      // Windows MSI
	KindDMG      Kind = "dmg"      // macOS app bundle, shipped as a disk image
	KindUnknown  Kind = "unknown"  // built from source, or not recognised
)

// Action is what pressing the update button does for a Kind.
type Action string

const (
	// ActionReplace downloads the new files and puts them in place of the
	// running ones; a restart finishes the update.
	ActionReplace Action = "replace"
	// ActionRun downloads the installer and opens it.
	ActionRun Action = "run"
	// ActionSave downloads the package; installing it needs the system's
	// package manager and administrator rights.
	ActionSave Action = "save"
	// ActionPage opens the release page: there is no file this
	// installation could be updated with safely.
	ActionPage Action = "page"
)

// PortableMarker is a file the release puts into the portable archives.
// It is the only thing that tells a portable folder from an installed
// app, so its presence is what allows replacing the files in place.
const PortableMarker = "portable.txt"

// Install describes the running installation.
type Install struct {
	Kind Kind
	OS   string // runtime.GOOS
	Arch string // runtime.GOARCH
	// WebTarget is the "GOOS-ARCH" suffix of the web archive this binary
	// came from, e.g. "linux-armv7". It is stamped into release builds.
	WebTarget string
	// Exe is the running untisd binary.
	Exe string
	// AppImage is the AppImage file the app runs from (KindAppImage).
	AppImage string
}

// Env is what Detect looks at. The functions exist so tests can describe
// any platform.
type Env struct {
	OS, Arch  string
	Exe       string // absolute path of the running binary, symlinks resolved
	Web       bool   // started with -web
	WebTarget string // stamped at build time, empty for source builds
	Getenv    func(string) string
	Exists    func(path string) bool
	// Succeeds runs a command and reports whether it exited with 0.
	Succeeds func(name string, args ...string) bool
}

// OSEnv describes the running process.
func OSEnv(web bool, webTarget string) Env {
	exe, err := os.Executable()
	if err == nil {
		if resolved, err := filepath.EvalSymlinks(exe); err == nil {
			exe = resolved
		}
	}
	return Env{
		OS: runtime.GOOS, Arch: runtime.GOARCH, Exe: exe, Web: web, WebTarget: webTarget,
		Getenv: os.Getenv,
		Exists: func(p string) bool { _, err := os.Stat(p); return err == nil },
		Succeeds: func(name string, args ...string) bool {
			path, err := exec.LookPath(name)
			if err != nil {
				return false
			}
			return exec.Command(path, args...).Run() == nil
		},
	}
}

// Detect works out how the app was installed. When in doubt the answer is
// KindUnknown: opening the release page is always right, downloading the
// wrong file never is.
func Detect(e Env) Install {
	in := Install{Kind: KindUnknown, OS: e.OS, Arch: e.Arch, Exe: e.Exe}
	if e.Exe == "" {
		return in
	}
	// Paths are handled by the rules of e.OS, not of the machine this
	// code runs on, so every platform can be described in tests.
	sep, exeSuffix := "/", ""
	if e.OS == "windows" {
		sep, exeSuffix = `\`, ".exe"
	}
	dir := e.Exe[:strings.LastIndex(e.Exe, sep)+1]

	if e.Web {
		// Only binaries from a release archive know their target; a
		// `make web` build stays unknown.
		if e.WebTarget != "" {
			in.Kind, in.WebTarget = KindWeb, e.WebTarget
		}
		return in
	}

	// The AppImage runtime sets APPIMAGE and APPDIR for everything it
	// starts, so a terminal that is itself an AppImage leaks them. Only
	// trust them when our binary really lives in that mount.
	if e.OS == "linux" {
		if img, mount := e.Getenv("APPIMAGE"), e.Getenv("APPDIR"); img != "" && mount != "" && strings.HasPrefix(e.Exe, strings.TrimSuffix(mount, sep)+sep) && e.Exists(img) {
			in.Kind, in.AppImage = KindAppImage, img
			return in
		}
	}

	if (e.OS == "linux" || e.OS == "windows") && e.Exists(dir+PortableMarker) &&
		e.Exists(dir+"untis-desktop"+exeSuffix) {
		in.Kind = KindPortable
		return in
	}

	switch e.OS {
	case "linux":
		switch {
		case e.Succeeds("dpkg", "-S", e.Exe):
			in.Kind = KindDeb
		case e.Succeeds("rpm", "-qf", e.Exe):
			in.Kind = KindRPM
		}
	case "windows":
		// The NSIS installer leaves its uninstaller next to the app; the
		// MSI does not and installs below Program Files.
		switch {
		case e.Exists(dir + "uninstall.exe"):
			in.Kind = KindNSIS
		case underProgramFiles(e, e.Exe):
			in.Kind = KindMSI
		}
	case "darwin":
		if strings.Contains(e.Exe, ".app/Contents/MacOS/") {
			in.Kind = KindDMG
		}
	}
	return in
}

func underProgramFiles(e Env, path string) bool {
	for _, name := range []string{"ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"} {
		if root := e.Getenv(name); root != "" && strings.HasPrefix(strings.ToLower(path), strings.ToLower(root)+`\`) {
			return true
		}
	}
	return false
}

// Asset is the name of the release file this installation is updated
// with, or "" when the release has none for it. The names are the ones
// scripts/release.sh and the Tauri bundler produce.
func (in Install) Asset(v Version) string {
	if in.Kind == KindWeb {
		if in.WebTarget == "" {
			return ""
		}
		ext := ".tar.gz"
		if in.OS == "windows" {
			ext = ".zip"
		}
		return "untis-web-" + v.String() + "-" + in.WebTarget + ext
	}
	if in.Kind == KindDMG {
		return "Untis_" + v.String() + "_universal.dmg" // one image for Apple Silicon and Intel
	}
	// Every other desktop file exists for 64-bit Intel/AMD and ARM only,
	// and each format has its own name for the two.
	type names struct{ amd64, arm64 string }
	arch := func(n names) string {
		switch in.Arch {
		case "amd64":
			return n.amd64
		case "arm64":
			return n.arm64
		}
		return ""
	}
	pick := func(n names, format func(arch string) string) string {
		if a := arch(n); a != "" {
			return format(a)
		}
		return ""
	}
	ver := v.String()
	switch in.Kind {
	case KindAppImage:
		return pick(names{"amd64", "aarch64"}, func(a string) string { return "Untis_" + ver + "_" + a + ".AppImage" })
	case KindDeb:
		return pick(names{"amd64", "arm64"}, func(a string) string { return "Untis_" + ver + "_" + a + ".deb" })
	case KindRPM:
		return pick(names{"x86_64", "aarch64"}, func(a string) string { return "Untis-" + ver + "-1." + a + ".rpm" })
	case KindNSIS:
		return pick(names{"x64", "arm64"}, func(a string) string { return "Untis_" + ver + "_" + a + "-setup.exe" })
	case KindMSI:
		return pick(names{"x64", ""}, func(a string) string { return "Untis_" + ver + "_" + a + "_en-US.msi" })
	case KindPortable:
		switch in.OS {
		case "linux":
			return pick(names{"x64", "arm64"}, func(a string) string { return "Untis_" + ver + "_" + a + "-linux-portable.tar.gz" })
		case "windows":
			return pick(names{"x64", "arm64"}, func(a string) string { return "Untis_" + ver + "_" + a + "-windows-portable.zip" })
		}
	}
	return ""
}

// Action is what the update button does for this installation.
func (in Install) Action() Action {
	switch in.Kind {
	case KindWeb, KindAppImage, KindPortable:
		return ActionReplace
	case KindNSIS, KindMSI, KindDMG:
		return ActionRun
	case KindDeb, KindRPM:
		return ActionSave
	}
	return ActionPage
}
