package update

import (
	"bufio"
	"os"
	"strings"
	"testing"
)

// fakeEnv describes a machine: which files exist, which variables are set
// and which package manager owns the binary.
func fakeEnv(goos, arch, exe string, files []string, vars map[string]string, owner string) Env {
	return Env{
		OS: goos, Arch: arch, Exe: exe,
		Getenv: func(k string) string { return vars[k] },
		Exists: func(p string) bool {
			for _, f := range files {
				if f == p {
					return true
				}
			}
			return false
		},
		Succeeds: func(name string, args ...string) bool { return name == owner && args[len(args)-1] == exe },
	}
}

func TestDetect(t *testing.T) {
	appimage := map[string]string{"APPIMAGE": "/home/u/Apps/Untis.AppImage", "APPDIR": "/tmp/.mount_UntisAb"}
	pf := map[string]string{"ProgramFiles": `C:\Program Files`, "ProgramFiles(x86)": `C:\Program Files (x86)`}
	cases := []struct {
		name string
		env  Env
		want Kind
	}{
		{"appimage", fakeEnv("linux", "amd64", "/tmp/.mount_UntisAb/usr/bin/untisd", []string{"/home/u/Apps/Untis.AppImage"}, appimage, ""), KindAppImage},
		// started from a terminal that is itself an AppImage: its
		// variables are inherited, but our binary is not in its mount
		{"foreign appimage variables", fakeEnv("linux", "amd64", "/usr/bin/untisd", []string{"/home/u/Apps/Untis.AppImage"}, appimage, "dpkg"), KindDeb},
		{"appimage with a similar mount name", fakeEnv("linux", "amd64", "/tmp/.mount_UntisAbc/usr/bin/untisd", []string{"/home/u/Apps/Untis.AppImage"}, appimage, ""), KindUnknown},
		{"appimage file gone", fakeEnv("linux", "amd64", "/tmp/.mount_UntisAb/usr/bin/untisd", nil, appimage, ""), KindUnknown},
		{"deb", fakeEnv("linux", "arm64", "/usr/bin/untisd", nil, nil, "dpkg"), KindDeb},
		{"rpm", fakeEnv("linux", "amd64", "/usr/bin/untisd", nil, nil, "rpm"), KindRPM},
		{"linux portable", fakeEnv("linux", "amd64", "/home/u/untis/untisd", []string{"/home/u/untis/portable.txt", "/home/u/untis/untis-desktop"}, nil, ""), KindPortable},
		{"marker without the app", fakeEnv("linux", "amd64", "/home/u/untis/untisd", []string{"/home/u/untis/portable.txt"}, nil, ""), KindUnknown},
		{"built from source", fakeEnv("linux", "amd64", "/home/u/src/desktop/src-tauri/target/debug/untisd", []string{"/home/u/src/desktop/src-tauri/target/debug/untis-desktop"}, nil, ""), KindUnknown},
		{"windows portable", fakeEnv("windows", "amd64", `D:\Tools\Untis\untisd.exe`, []string{`D:\Tools\Untis\portable.txt`, `D:\Tools\Untis\untis-desktop.exe`}, pf, ""), KindPortable},
		{"windows portable in program files", fakeEnv("windows", "amd64", `C:\Program Files\Untis\untisd.exe`, []string{`C:\Program Files\Untis\portable.txt`, `C:\Program Files\Untis\untis-desktop.exe`}, pf, ""), KindPortable},
		{"nsis per user", fakeEnv("windows", "arm64", `C:\Users\u\AppData\Local\Untis\untisd.exe`, []string{`C:\Users\u\AppData\Local\Untis\uninstall.exe`}, pf, ""), KindNSIS},
		{"nsis per machine", fakeEnv("windows", "amd64", `C:\Program Files\Untis\untisd.exe`, []string{`C:\Program Files\Untis\uninstall.exe`}, pf, ""), KindNSIS},
		{"msi", fakeEnv("windows", "amd64", `C:\Program Files\Untis\untisd.exe`, nil, pf, ""), KindMSI},
		{"msi, other case", fakeEnv("windows", "amd64", `c:\program files\Untis\untisd.exe`, nil, pf, ""), KindMSI},
		{"windows, somewhere else", fakeEnv("windows", "amd64", `C:\Program Files Extra\Untis\untisd.exe`, nil, pf, ""), KindUnknown},
		{"mac app", fakeEnv("darwin", "arm64", "/Applications/Untis.app/Contents/MacOS/untisd", nil, nil, ""), KindDMG},
		{"mac, loose binary", fakeEnv("darwin", "arm64", "/Users/u/bin/untisd", nil, nil, ""), KindUnknown},
		{"freebsd sidecar", fakeEnv("freebsd", "amd64", "/usr/local/bin/untisd", nil, nil, ""), KindUnknown},
		{"no executable path", fakeEnv("linux", "amd64", "", nil, nil, "dpkg"), KindUnknown},
	}
	for _, c := range cases {
		if got := Detect(c.env); got.Kind != c.want {
			t.Errorf("%s: kind = %s, want %s", c.name, got.Kind, c.want)
		}
	}

	in := Detect(cases[0].env)
	if in.AppImage != "/home/u/Apps/Untis.AppImage" || in.Exe != "/tmp/.mount_UntisAb/usr/bin/untisd" {
		t.Errorf("appimage install = %+v", in)
	}
}

func TestDetectWebEdition(t *testing.T) {
	// a release archive knows its target ...
	e := fakeEnv("linux", "arm", "/home/pi/untis-web-1.0.0-linux-armv7/untisd", nil, nil, "")
	e.Web, e.WebTarget = true, "linux-armv7"
	if in := Detect(e); in.Kind != KindWeb || in.WebTarget != "linux-armv7" {
		t.Errorf("web archive: %+v", in)
	}
	// ... a `make web` build does not, and is never replaced
	e.WebTarget = ""
	if in := Detect(e); in.Kind != KindUnknown {
		t.Errorf("web from source: %+v", in)
	}
	// -web wins over everything else found around the binary
	e = fakeEnv("linux", "amd64", "/usr/bin/untisd", nil, nil, "dpkg")
	e.Web, e.WebTarget = true, "linux-amd64"
	if in := Detect(e); in.Kind != KindWeb {
		t.Errorf("web beside a package: %+v", in)
	}
	// the stamp alone does not make a sidecar a web edition
	e.Web = false
	if in := Detect(e); in.Kind != KindDeb {
		t.Errorf("stamped binary used as sidecar: %+v", in)
	}
}

// released reads the file names of a real release (v1.0.0).
func released(t *testing.T) map[string]bool {
	t.Helper()
	f, err := os.Open("testdata/v1.0.0-assets.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	names := map[string]bool{}
	for sc := bufio.NewScanner(f); sc.Scan(); {
		if name := strings.TrimSpace(sc.Text()); name != "" {
			names[name] = true
		}
	}
	return names
}

// TestAssetNamesMatchARealRelease pins the file names to what the release
// workflow really published: every installation maps to a file that
// exists, and every published file is the answer for exactly one
// installation.
func TestAssetNamesMatchARealRelease(t *testing.T) {
	names := released(t)
	v, _ := ParseVersion("1.0.0")
	used := map[string]string{}
	expect := func(what string, in Install) {
		t.Helper()
		name := in.Asset(v)
		if !names[name] {
			t.Errorf("%s: asset %q is not a file of the release", what, name)
			return
		}
		if prev, dup := used[name]; dup {
			t.Errorf("%s and %s both download %s", prev, what, name)
		}
		used[name] = what
	}

	for _, arch := range []string{"amd64", "arm64"} {
		expect("appimage "+arch, Install{Kind: KindAppImage, OS: "linux", Arch: arch})
		expect("deb "+arch, Install{Kind: KindDeb, OS: "linux", Arch: arch})
		expect("rpm "+arch, Install{Kind: KindRPM, OS: "linux", Arch: arch})
		expect("linux portable "+arch, Install{Kind: KindPortable, OS: "linux", Arch: arch})
		expect("windows portable "+arch, Install{Kind: KindPortable, OS: "windows", Arch: arch})
		expect("nsis "+arch, Install{Kind: KindNSIS, OS: "windows", Arch: arch})
	}
	expect("msi amd64", Install{Kind: KindMSI, OS: "windows", Arch: "amd64"})
	expect("dmg", Install{Kind: KindDMG, OS: "darwin", Arch: "arm64"})
	if a, b := (Install{Kind: KindDMG, OS: "darwin", Arch: "amd64"}).Asset(v), (Install{Kind: KindDMG, OS: "darwin", Arch: "arm64"}).Asset(v); a != b {
		t.Errorf("the mac image is universal, got %s and %s", a, b)
	}

	// The web edition: the target is the part of the archive name the
	// release script stamps into the binary.
	web := 0
	for name := range names {
		if !strings.HasPrefix(name, "untis-web-1.0.0-") {
			continue
		}
		target := strings.TrimSuffix(strings.TrimSuffix(strings.TrimPrefix(name, "untis-web-1.0.0-"), ".tar.gz"), ".zip")
		goos, _, _ := strings.Cut(target, "-")
		expect("web "+target, Install{Kind: KindWeb, OS: goos, WebTarget: target})
		web++
	}
	if web < 25 {
		t.Errorf("only %d web archives found in the release list", web)
	}

	// Everything published is covered, except the checksum file and the
	// mac app archive (the disk image is the one that is offered).
	for name := range names {
		if _, ok := used[name]; !ok && name != ChecksumFile && name != "Untis_1.0.0_universal.app.tar.gz" {
			t.Errorf("no installation is updated with %s", name)
		}
	}
}

func TestNoAssetWhereTheReleaseHasNone(t *testing.T) {
	v, _ := ParseVersion("1.2.3")
	for what, in := range map[string]Install{
		"unknown":            {Kind: KindUnknown, OS: "linux", Arch: "amd64"},
		"msi on arm64":       {Kind: KindMSI, OS: "windows", Arch: "arm64"},
		"appimage on riscv":  {Kind: KindAppImage, OS: "linux", Arch: "riscv64"},
		"deb on 32-bit":      {Kind: KindDeb, OS: "linux", Arch: "386"},
		"portable on mac":    {Kind: KindPortable, OS: "darwin", Arch: "arm64"},
		"web without target": {Kind: KindWeb, OS: "linux", Arch: "amd64"},
	} {
		if name := in.Asset(v); name != "" {
			t.Errorf("%s: asset %q, want none", what, name)
		}
	}
	// the version is part of every name
	if name := (Install{Kind: KindDeb, OS: "linux", Arch: "amd64"}).Asset(v); name != "Untis_1.2.3_amd64.deb" {
		t.Errorf("deb name = %s", name)
	}
}

func TestActions(t *testing.T) {
	for kind, want := range map[Kind]Action{
		KindWeb: ActionReplace, KindAppImage: ActionReplace, KindPortable: ActionReplace,
		KindNSIS: ActionRun, KindMSI: ActionRun, KindDMG: ActionRun,
		KindDeb: ActionSave, KindRPM: ActionSave, KindUnknown: ActionPage, Kind("new"): ActionPage,
	} {
		if got := (Install{Kind: kind}).Action(); got != want {
			t.Errorf("%s: action %s, want %s", kind, got, want)
		}
	}
}
