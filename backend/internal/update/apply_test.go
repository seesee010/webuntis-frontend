package update

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// sleepEnv turns the test binary into a program that just keeps running,
// for TestReplaceARunningProgram.
const sleepEnv = "UNTIS_UPDATE_TEST_SLEEP"

func TestMain(m *testing.M) {
	if os.Getenv(sleepEnv) != "" {
		fmt.Println("running")
		time.Sleep(time.Minute)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

// The update replaces programs that are running at that moment: untisd
// replaces itself, and in a portable folder the desktop app as well.
// Windows refuses to overwrite or delete a running program but allows
// renaming it, which is what place relies on. This runs a real process
// from the file being replaced, on whatever system the tests run on.
func TestReplaceARunningProgram(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Skip(err)
	}
	dir := t.TempDir()
	name := "untisd"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	target := filepath.Join(dir, name)
	copyFile(t, self, target)

	cmd := exec.Command(target)
	cmd.Env = append(os.Environ(), sleepEnv+"=1")
	stdout, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	if line, _ := bufio.NewReader(stdout).ReadString('\n'); strings.TrimSpace(line) != "running" {
		t.Fatalf("the helper did not start: %q", line)
	}

	tmp := write(t, filepath.Join(dir, ".untis-update-1"), "the new version")
	if err := place([]placement{{tmp, target}}); err != nil {
		t.Fatalf("replacing a running program: %v", err)
	}
	if got := read(t, target); got != "the new version" {
		t.Errorf("target = %q", got)
	}

	// What could not be deleted while running is removed on the next start.
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	RemoveLeftovers(Install{Kind: KindWeb, OS: runtime.GOOS, Exe: target})
	if left := leftovers(t, dir); len(left) != 0 {
		t.Errorf("left after the next start: %v", left)
	}
}

func copyFile(t *testing.T, from, to string) {
	t.Helper()
	src, err := os.Open(from)
	if err != nil {
		t.Fatal(err)
	}
	defer src.Close()
	dst, err := os.OpenFile(to, os.O_CREATE|os.O_WRONLY, 0o755)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(dst, src); err != nil {
		t.Fatal(err)
	}
	if err := dst.Close(); err != nil {
		t.Fatal(err)
	}
}

// If the second of two programs cannot be installed, the first one is put
// back: a portable folder never ends up with a new backend and an old app.
func TestPlaceRollsBack(t *testing.T) {
	dir := t.TempDir()
	backend := write(t, filepath.Join(dir, "untisd"), "old backend")
	shell := write(t, filepath.Join(dir, "untis-desktop"), "old app")
	tmp1 := write(t, filepath.Join(dir, ".untis-update-1"), "new backend")
	missing := filepath.Join(dir, ".untis-update-2") // was never written

	err := place([]placement{{tmp1, backend}, {missing, shell}})
	if err == nil {
		t.Fatal("place succeeded with a missing file")
	}
	if read(t, backend) != "old backend" || read(t, shell) != "old app" {
		t.Errorf("after the rollback: %q, %q", read(t, backend), read(t, shell))
	}
	if left := leftovers(t, dir); len(left) != 0 {
		t.Errorf("left behind: %v", left)
	}
}

func TestPlaceCreatesAMissingTarget(t *testing.T) {
	dir := t.TempDir()
	tmp := write(t, filepath.Join(dir, ".untis-update-1"), "new")
	target := filepath.Join(dir, "untisd")
	if err := place([]placement{{tmp, target}}); err != nil || read(t, target) != "new" {
		t.Errorf("err = %v", err)
	}
}

func TestRemoveLeftovers(t *testing.T) {
	dir := t.TempDir()
	exe := write(t, filepath.Join(dir, "untisd.exe"), "current")
	shell := write(t, filepath.Join(dir, "untis-desktop.exe"), "current")
	keep := write(t, filepath.Join(dir, "notes.old"), "the user's file")
	for _, name := range []string{"untisd.exe.old", "untis-desktop.exe.old", ".untis-update-123", ".untis-update-9.zip"} {
		write(t, filepath.Join(dir, name), "stale")
	}
	RemoveLeftovers(Install{Kind: KindPortable, OS: "windows", Exe: exe})
	entries, _ := os.ReadDir(dir)
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	if fmt.Sprint(names) != "[notes.old untis-desktop.exe untisd.exe]" {
		t.Errorf("after cleaning: %v", names)
	}
	if read(t, exe) != "current" || read(t, shell) != "current" || read(t, keep) != "the user's file" {
		t.Error("a current file was changed")
	}

	// installations the updater never writes to are left alone entirely
	other := t.TempDir()
	stale := write(t, filepath.Join(other, ".untis-update-1"), "not ours to judge")
	RemoveLeftovers(Install{Kind: KindDeb, OS: "linux", Exe: write(t, filepath.Join(other, "untisd"), "x")})
	if read(t, stale) == "" {
		t.Error("cleaned a folder of a package installation")
	}

	image := write(t, filepath.Join(t.TempDir(), "Untis.AppImage"), "current")
	write(t, image+oldSuffix, "stale")
	RemoveLeftovers(Install{Kind: KindAppImage, OS: "linux", Exe: "/tmp/.mount_x/usr/bin/untisd", AppImage: image})
	if left := leftovers(t, filepath.Dir(image)); len(left) != 0 {
		t.Errorf("left: %v", left)
	}
}

func TestExtractTakesOnlyTheNamedPrograms(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "untisd")
	archive := filepath.Join(t.TempDir(), "a.tar.gz")
	// a second file of the same name deeper in the archive, and a name
	// that tries to leave the folder: neither is written anywhere
	if err := os.WriteFile(archive, tarGz(t, map[string]string{
		"pkg/untisd": "the program", "pkg/README.txt": "docs", "../../outside": "escape",
	}), 0o600); err != nil {
		t.Fatal(err)
	}
	files, err := extract(archive, false, map[string]string{"untisd": target})
	if err != nil || len(files) != 1 || files[0].target != target {
		t.Fatalf("files = %+v, err = %v", files, err)
	}
	if read(t, files[0].tmp) != "the program" || filepath.Dir(files[0].tmp) != dir {
		t.Errorf("extracted %q into %s", read(t, files[0].tmp), files[0].tmp)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 1 {
		t.Errorf("more than the program was written: %v", entries)
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(dir), "outside")); err == nil {
		t.Error("an entry escaped the folder")
	}
}

func TestExtractCleansUpWhenAProgramIsMissing(t *testing.T) {
	dir := t.TempDir()
	archive := filepath.Join(t.TempDir(), "a.zip")
	if err := os.WriteFile(archive, zipped(t, map[string]string{"pkg/untisd.exe": "backend only"}), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := extract(archive, true, map[string]string{
		"untisd.exe": filepath.Join(dir, "untisd.exe"), "untis-desktop.exe": filepath.Join(dir, "untis-desktop.exe"),
	})
	if err == nil || !strings.Contains(err.Error(), "untis-desktop.exe") {
		t.Errorf("err = %v", err)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("temporary files left: %v", entries)
	}
}

func TestParseChecksums(t *testing.T) {
	a, b := strings.Repeat("a", 64), strings.Repeat("B", 64)
	sums := parseChecksums([]byte(a + "  Untis_1.1.0_amd64.deb\n" + b + " *untis-web-1.1.0-windows-amd64.zip\r\n" +
		"\n# comment\nshort  file\n" + strings.Repeat("z", 64) + "  not-hex\n" + a + "  two  names\n"))
	if len(sums) != 2 || sums["Untis_1.1.0_amd64.deb"] != a || sums["untis-web-1.1.0-windows-amd64.zip"] != strings.ToLower(b) {
		t.Errorf("sums = %v", sums)
	}
}

func TestSourceFrom(t *testing.T) {
	env := func(v string) func(string) string {
		return func(k string) string {
			if k == SourceEnv {
				return v
			}
			return ""
		}
	}
	if src, err := SourceFrom(env("")); err != nil || src != GitHub {
		t.Errorf("default: %+v %v", src, err)
	}
	for _, ok := range []string{"http://127.0.0.1:8080", "http://localhost:9/", "http://[::1]:8080", "https://mirror.example.org/gh"} {
		src, err := SourceFrom(env(ok))
		if err != nil || src.API != strings.TrimRight(ok, "/") || src.Download != src.API {
			t.Errorf("%s: %+v %v", ok, src, err)
		}
	}
	// anything unsafe falls back to GitHub instead of being used
	for _, bad := range []string{"http://example.org", "http://192.168.1.10:8080", "ftp://127.0.0.1", "file:///tmp/x", "not a url", "127.0.0.1:8080"} {
		if src, err := SourceFrom(env(bad)); err == nil || src != GitHub {
			t.Errorf("%s: accepted as %+v", bad, src)
		}
	}
}

func TestURLsStayInsideTheRepository(t *testing.T) {
	if got, want := GitHub.AssetURL("v1.1.0", "Untis_1.1.0_amd64.deb"), "https://github.com/seesee010/webuntis-frontend/releases/download/v1.1.0/Untis_1.1.0_amd64.deb"; got != want {
		t.Errorf("asset url = %s", got)
	}
	if got, want := GitHub.PageURL("v1.1.0"), "https://github.com/seesee010/webuntis-frontend/releases/tag/v1.1.0"; got != want {
		t.Errorf("page url = %s", got)
	}
	if got := GitHub.latestURL(); got != "https://api.github.com/repos/seesee010/webuntis-frontend/releases/latest" {
		t.Errorf("api url = %s", got)
	}
	// a hostile name cannot climb out of the release
	if got := GitHub.AssetURL("v1.1.0", "../../../evil/repo/x"); strings.Contains(got, "/../") {
		t.Errorf("asset url = %s", got)
	}
}

func TestInstallCommandQuotesThePath(t *testing.T) {
	if got := installCommand(KindDeb, "/home/it's me/Downloads/Untis_1.1.0_amd64.deb"); got != `sudo apt install '/home/it'\''s me/Downloads/Untis_1.1.0_amd64.deb'` {
		t.Errorf("command = %s", got)
	}
	if got := installCommand(KindNSIS, "x"); got != "" {
		t.Errorf("command for an installer = %q", got)
	}
}
