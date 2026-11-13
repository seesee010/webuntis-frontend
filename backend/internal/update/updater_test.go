package update

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeGitHub serves one release the way GitHub does: the "latest" API
// answer with an ETag, and the files under /releases/download/TAG/.
type fakeGitHub struct {
	*httptest.Server
	mu         sync.Mutex
	tag        string
	files      map[string][]byte
	draft, pre bool
	apiStatus  int               // answer of the API instead of 200
	apiBody    string            // raw API answer instead of the release
	sizes      map[string]int64  // sizes the API claims, when not the truth
	redirect   map[string]string // file -> where the download redirects to
	hold       chan struct{}     // when set, downloads wait for it
	apiCalls   atomic.Int32
	fresh      atomic.Int32 // API answers with a body (not 304)
	downloads  atomic.Int32
}

func newFakeGitHub(t *testing.T, tag string, files map[string][]byte) *fakeGitHub {
	t.Helper()
	g := &fakeGitHub{tag: tag, files: files}
	g.Server = httptest.NewServer(http.HandlerFunc(g.serve))
	t.Cleanup(g.Close)
	return g
}

// withSums adds the SHA256SUMS file for everything in files.
func withSums(files map[string][]byte) map[string][]byte {
	var names []string
	for n := range files {
		names = append(names, n)
	}
	sort.Strings(names)
	var b strings.Builder
	for _, n := range names {
		sum := sha256.Sum256(files[n])
		fmt.Fprintf(&b, "%s  %s\n", hex.EncodeToString(sum[:]), n)
	}
	files[ChecksumFile] = []byte(b.String())
	return files
}

func (g *fakeGitHub) serve(w http.ResponseWriter, r *http.Request) {
	g.mu.Lock()
	defer g.mu.Unlock()
	base := "/" + Owner + "/" + Repo + "/releases/download/" + g.tag + "/"
	switch {
	case r.URL.Path == "/repos/"+Owner+"/"+Repo+"/releases/latest":
		g.apiCalls.Add(1)
		if !strings.HasPrefix(r.Header.Get("User-Agent"), "untis-gui/") {
			http.Error(w, "no user agent", http.StatusForbidden)
			return
		}
		if g.apiStatus != 0 {
			http.Error(w, `{"message":"nope"}`, g.apiStatus)
			return
		}
		etag := `"` + g.tag + `"`
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		g.fresh.Add(1)
		w.Header().Set("ETag", etag)
		if g.apiBody != "" {
			fmt.Fprint(w, g.apiBody)
			return
		}
		type asset struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
			// what the real API also sends; the updater must not use it
			URL string `json:"browser_download_url"`
		}
		var assets []asset
		for name, data := range g.files {
			size := int64(len(data))
			if s, ok := g.sizes[name]; ok {
				size = s
			}
			assets = append(assets, asset{name, size, "http://evil.invalid/" + name})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tag_name": g.tag, "draft": g.draft, "prerelease": g.pre, "assets": assets,
			"html_url": "http://evil.invalid/page",
		})
	case strings.HasPrefix(r.URL.Path, base):
		name := strings.TrimPrefix(r.URL.Path, base)
		if to, ok := g.redirect[name]; ok {
			http.Redirect(w, r, to, http.StatusFound)
			return
		}
		data, ok := g.files[name]
		if !ok {
			http.NotFound(w, r)
			return
		}
		if name != ChecksumFile {
			g.downloads.Add(1)
			if hold := g.hold; hold != nil {
				g.mu.Unlock()
				<-hold
				g.mu.Lock()
			}
		}
		_, _ = w.Write(data)
	default:
		http.NotFound(w, r)
	}
}

func tarGz(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	_ = tw.WriteHeader(&tar.Header{Name: "dir/", Typeflag: tar.TypeDir, Mode: 0o755})
	for name, body := range files {
		if err := tw.WriteHeader(&tar.Header{Name: name, Typeflag: tar.TypeReg, Mode: 0o644, Size: int64(len(body))}); err != nil {
			t.Fatal(err)
		}
		_, _ = tw.Write([]byte(body))
	}
	_ = tw.Close()
	_ = gz.Close()
	return buf.Bytes()
}

func zipped(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(body))
	}
	_ = zw.Close()
	return buf.Bytes()
}

// harness is an updater pointed at a fake GitHub, with everything it
// would do to the system recorded instead.
type harness struct {
	*Updater
	gh        *fakeGitHub
	opened    []string
	downloads string
	mu        sync.Mutex
	events    []Status
	enabled   atomic.Bool
}

func newHarness(t *testing.T, version string, in Install, gh *fakeGitHub, tweak func(*Config)) *harness {
	t.Helper()
	h := &harness{gh: gh, downloads: t.TempDir()}
	h.enabled.Store(true)
	cfg := Config{
		Version: version, Install: in,
		Source:       Source{API: gh.URL, Download: gh.URL},
		Enabled:      h.enabled.Load,
		Open:         func(target string) error { h.opened = append(h.opened, target); return nil },
		DownloadsDir: func() (string, error) { return h.downloads, nil },
		Publish: func(st Status) {
			h.mu.Lock()
			h.events = append(h.events, st)
			h.mu.Unlock()
		},
	}
	if tweak != nil {
		tweak(&cfg)
	}
	h.Updater = New(cfg)
	return h
}

// finish presses the button and waits for the outcome.
func (h *harness) finish(t *testing.T) Status {
	t.Helper()
	if err := h.Apply(context.Background()); err != nil {
		t.Fatalf("apply: %v", err)
	}
	return h.wait(t)
}

func (h *harness) wait(t *testing.T) Status {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if st := h.Status(); st.State != StateDownloading {
			return st
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatal("the update did not finish")
	return Status{}
}

func write(t *testing.T, path, content string) string {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func read(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

// leftovers lists what an update must not leave behind in dir.
func leftovers(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".untis-update-") || strings.HasSuffix(e.Name(), oldSuffix) {
			out = append(out, e.Name())
		}
	}
	return out
}

func webInstall(t *testing.T) Install {
	t.Helper()
	return Install{Kind: KindWeb, OS: "linux", Arch: "amd64", WebTarget: "linux-amd64", Exe: write(t, filepath.Join(t.TempDir(), "untisd"), "old")}
}

func webRelease(t *testing.T) map[string][]byte {
	t.Helper()
	return withSums(map[string][]byte{
		"untis-web-1.1.0-linux-amd64.tar.gz": tarGz(t, map[string]string{
			"untis-web-1.1.0-linux-amd64/untisd":     "new",
			"untis-web-1.1.0-linux-amd64/README.txt": "read me",
		}),
		// a file for another platform must never be picked
		"untis-web-1.1.0-linux-arm64.tar.gz": tarGz(t, map[string]string{"untis-web-1.1.0-linux-arm64/untisd": "wrong architecture"}),
		"Untis_1.1.0_amd64.deb":              []byte("wrong edition"),
	})
}

// --- checking ---------------------------------------------------------------

func TestCheck(t *testing.T) {
	cases := []struct {
		name, current, tag string
		want               State
		latest             string
	}{
		{"newer release", "1.0.0", "v1.1.0", StateAvailable, "1.1.0"},
		{"newer patch", "1.0.9", "v1.0.10", StateAvailable, "1.0.10"},
		{"same version", "1.1.0", "v1.1.0", StateIdle, ""},
		{"older release", "2.0.0", "v1.9.9", StateIdle, ""},
		{"tag without v", "1.0.0", "1.1.0", StateAvailable, "1.1.0"},
	}
	for _, c := range cases {
		gh := newFakeGitHub(t, c.tag, webRelease(t))
		h := newHarness(t, c.current, webInstall(t), gh, nil)
		st := h.Check(context.Background())
		if st.State != c.want || st.Latest != c.latest || st.CheckError != "" || st.CheckedAt == nil {
			t.Errorf("%s: %+v", c.name, st)
		}
	}
}

func TestCheckDescribesTheUpdate(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	h := newHarness(t, "1.0.0", webInstall(t), gh, nil)
	st := h.Check(context.Background())
	if st.Asset != "untis-web-1.1.0-linux-amd64.tar.gz" || st.Action != ActionReplace || st.Size != int64(len(gh.files[st.Asset])) {
		t.Errorf("asset = %q action = %q size = %d", st.Asset, st.Action, st.Size)
	}
	// the page address is built from the tag, not taken from the answer
	if want := gh.URL + "/" + Owner + "/" + Repo + "/releases/tag/v1.1.0"; st.URL != want {
		t.Errorf("url = %s, want %s", st.URL, want)
	}
	if !st.Supported || !st.Enabled || st.Current != "1.0.0" || st.Kind != KindWeb {
		t.Errorf("status = %+v", st)
	}
}

// A check that does not work is silent: no update, no error state, just a
// note for the status page.
func TestFailedCheckIsSilent(t *testing.T) {
	for name, tweak := range map[string]func(*fakeGitHub){
		"rate limit":       func(g *fakeGitHub) { g.apiStatus = http.StatusForbidden },
		"server error":     func(g *fakeGitHub) { g.apiStatus = http.StatusBadGateway },
		"garbage":          func(g *fakeGitHub) { g.apiBody = "<html>not json" },
		"tag is no number": func(g *fakeGitHub) { g.tag = "nightly" },
		"pre-release tag":  func(g *fakeGitHub) { g.tag = "v2.0.0-rc1" },
	} {
		gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
		tweak(gh)
		h := newHarness(t, "1.0.0", webInstall(t), gh, nil)
		st := h.Check(context.Background())
		if st.State != StateIdle || st.Latest != "" || st.CheckError == "" || st.Error != "" {
			t.Errorf("%s: %+v", name, st)
		}
		if err := h.Apply(context.Background()); !errors.Is(err, ErrNothingToDo) {
			t.Errorf("%s: apply = %v", name, err)
		}
	}

	// the server is not there at all
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	gh.Close()
	h := newHarness(t, "1.0.0", webInstall(t), gh, nil)
	if st := h.Check(context.Background()); st.State != StateIdle || st.CheckError == "" {
		t.Errorf("offline: %+v", st)
	}
}

func TestNoReleaseIsNotAnError(t *testing.T) {
	for name, tweak := range map[string]func(*fakeGitHub){
		"no release yet": func(g *fakeGitHub) { g.apiStatus = http.StatusNotFound },
		"draft":          func(g *fakeGitHub) { g.draft = true },
		"pre-release":    func(g *fakeGitHub) { g.pre = true },
	} {
		gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
		tweak(gh)
		h := newHarness(t, "1.0.0", webInstall(t), gh, nil)
		if st := h.Check(context.Background()); st.State != StateIdle || st.CheckError != "" || st.Latest != "" {
			t.Errorf("%s: %+v", name, st)
		}
	}
}

func TestFailedCheckKeepsAKnownUpdate(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	h := newHarness(t, "1.0.0", webInstall(t), gh, nil)
	h.Check(context.Background())
	gh.mu.Lock()
	gh.apiStatus = http.StatusBadGateway
	gh.mu.Unlock()
	if st := h.Check(context.Background()); st.State != StateAvailable || st.Latest != "1.1.0" || st.CheckError == "" {
		t.Errorf("after a failed check: %+v", st)
	}
}

func TestDevelopmentBuildsNeverAsk(t *testing.T) {
	gh := newFakeGitHub(t, "v9.0.0", webRelease(t))
	for _, version := range []string{"dev", "", "1.0.0-rc1"} {
		h := newHarness(t, version, webInstall(t), gh, func(c *Config) { c.FirstCheck = time.Millisecond })
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
		h.Run(ctx)
		cancel()
		if st := h.Check(context.Background()); st.Supported || st.State != StateIdle {
			t.Errorf("%q: %+v", version, st)
		}
	}
	if n := gh.apiCalls.Load(); n != 0 {
		t.Errorf("a development build asked the release source %d times", n)
	}
}

func TestUnchangedReleaseIsNotFetchedAgain(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	h := newHarness(t, "1.0.0", webInstall(t), gh, nil)
	for range 3 {
		if st := h.Check(context.Background()); st.State != StateAvailable || st.Latest != "1.1.0" {
			t.Fatalf("status = %+v", st)
		}
	}
	if calls, fresh := gh.apiCalls.Load(), gh.fresh.Load(); calls != 3 || fresh != 1 {
		t.Errorf("%d requests, %d with a body; want 3 and 1 (the rest conditional)", calls, fresh)
	}
	// a new release replaces the remembered one
	gh.mu.Lock()
	gh.tag = "v1.2.0"
	gh.mu.Unlock()
	if st := h.Check(context.Background()); st.Latest != "1.2.0" {
		t.Errorf("after a new release: %+v", st)
	}
}

// --- the automatic check and its setting ------------------------------------

func TestRunChecksOnlyWhenEnabled(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	h := newHarness(t, "1.0.0", webInstall(t), gh, func(c *Config) { c.FirstCheck, c.Interval = time.Millisecond, time.Hour })
	h.enabled.Store(false)
	h.SettingsChanged()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan struct{})
	go func() { h.Run(ctx); close(done) }()

	time.Sleep(40 * time.Millisecond)
	if n := gh.apiCalls.Load(); n != 0 {
		t.Fatalf("checked %d times although the setting is off", n)
	}
	if st := h.Status(); st.Enabled || st.State != StateIdle {
		t.Errorf("status = %+v", st)
	}

	// switching it on checks right away, not at the next interval
	h.enabled.Store(true)
	h.SettingsChanged()
	deadline := time.Now().Add(5 * time.Second)
	for h.Status().State != StateAvailable && time.Now().Before(deadline) {
		time.Sleep(2 * time.Millisecond)
	}
	if st := h.Status(); st.State != StateAvailable || !st.Enabled {
		t.Fatalf("after switching on: %+v", st)
	}

	// switching it off takes the button away again
	h.enabled.Store(false)
	h.SettingsChanged()
	if st := h.Status(); st.State != StateIdle || st.Latest != "" || st.Enabled {
		t.Errorf("after switching off: %+v", st)
	}
	if err := h.Apply(context.Background()); !errors.Is(err, ErrNothingToDo) {
		t.Errorf("apply after switching off = %v", err)
	}
	cancel()
	<-done
}

func TestRunChecksAgainAfterTheInterval(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	h := newHarness(t, "1.0.0", webInstall(t), gh, func(c *Config) { c.FirstCheck, c.Interval = time.Millisecond, 15*time.Millisecond })
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { h.Run(ctx); close(done) }()
	deadline := time.Now().Add(10 * time.Second)
	for gh.apiCalls.Load() < 3 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	cancel()
	<-done
	if n := gh.apiCalls.Load(); n < 3 {
		t.Errorf("only %d checks with a 15ms interval", n)
	}
}

// A manual check works with the automatic one switched off: it is the
// user asking.
func TestManualCheckWorksWhenDisabled(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	h := newHarness(t, "1.0.0", webInstall(t), gh, nil)
	h.enabled.Store(false)
	if st := h.Check(context.Background()); st.State != StateAvailable || st.Enabled {
		t.Errorf("status = %+v", st)
	}
}

// --- pressing the button: replace in place ----------------------------------

func TestNothingHappensWithoutTheButton(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	in := webInstall(t)
	h := newHarness(t, "1.0.0", in, gh, func(c *Config) { c.FirstCheck, c.Interval = time.Millisecond, 5*time.Millisecond })
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	h.Run(ctx)
	if st := h.Status(); st.State != StateAvailable {
		t.Fatalf("status = %+v", st)
	}
	if n := gh.downloads.Load(); n != 0 || read(t, in.Exe) != "old" || len(h.opened) != 0 {
		t.Errorf("without the button: %d downloads, binary %q, opened %v", n, read(t, in.Exe), h.opened)
	}
}

func TestWebEditionIsReplaced(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	in := webInstall(t)
	h := newHarness(t, "1.0.0", in, gh, func(c *Config) { c.CanRestart = true })
	h.Check(context.Background())
	st := h.finish(t)
	if st.State != StateDone || st.Error != "" {
		t.Fatalf("status = %+v", st)
	}
	if got := read(t, in.Exe); got != "new" {
		t.Errorf("binary = %q", got)
	}
	if info, _ := os.Stat(in.Exe); runtime.GOOS != "windows" && info.Mode().Perm() != 0o755 {
		t.Errorf("mode = %v", info.Mode())
	}
	if st.Result == nil || st.Result.Action != ActionReplace || st.Result.Restart != RestartServer || st.Result.File != "" {
		t.Errorf("result = %+v", st.Result)
	}
	if left := leftovers(t, filepath.Dir(in.Exe)); len(left) != 0 {
		t.Errorf("left behind: %v", left)
	}
	if entries, _ := os.ReadDir(filepath.Dir(in.Exe)); len(entries) != 1 {
		t.Errorf("the folder gained files: %v", entries)
	}
	if n := gh.downloads.Load(); n != 1 {
		t.Errorf("%d downloads, want exactly the one matching file", n)
	}
	if len(h.opened) != 0 {
		t.Errorf("opened %v", h.opened)
	}

	// progress was published: downloading first, done last
	h.mu.Lock()
	defer h.mu.Unlock()
	var states []State
	for _, ev := range h.events {
		if len(states) == 0 || states[len(states)-1] != ev.State {
			states = append(states, ev.State)
		}
	}
	if fmt.Sprint(states) != "[available downloading done]" {
		t.Errorf("published states: %v", states)
	}
	if last := h.events[len(h.events)-1]; last.Done != last.Size || last.Size == 0 {
		t.Errorf("final progress %d of %d", last.Done, last.Size)
	}
}

func TestWebEditionWithoutSelfRestart(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	h := newHarness(t, "1.0.0", webInstall(t), gh, nil) // CanRestart false, as on Windows
	h.Check(context.Background())
	if st := h.finish(t); st.Result == nil || st.Result.Restart != RestartManual {
		t.Errorf("result = %+v", st.Result)
	}
}

func TestRenamedBinaryIsReplacedWhereItIs(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	in := webInstall(t)
	renamed := filepath.Join(filepath.Dir(in.Exe), "timetable-server")
	if err := os.Rename(in.Exe, renamed); err != nil {
		t.Fatal(err)
	}
	in.Exe = renamed
	h := newHarness(t, "1.0.0", in, gh, nil)
	h.Check(context.Background())
	if st := h.finish(t); st.State != StateDone || read(t, renamed) != "new" {
		t.Errorf("status = %+v, binary = %q", st, read(t, renamed))
	}
}

func TestWindowsWebEditionUsesTheZip(t *testing.T) {
	dir := t.TempDir()
	in := Install{Kind: KindWeb, OS: "windows", Arch: "arm64", WebTarget: "windows-arm64", Exe: write(t, filepath.Join(dir, "untisd.exe"), "old")}
	gh := newFakeGitHub(t, "v1.1.0", withSums(map[string][]byte{
		"untis-web-1.1.0-windows-arm64.zip": zipped(t, map[string]string{
			"untis-web-1.1.0-windows-arm64/untisd.exe": "new", "untis-web-1.1.0-windows-arm64/README.txt": "x",
		}),
		"untis-web-1.1.0-windows-amd64.zip": zipped(t, map[string]string{"untis-web-1.1.0-windows-amd64/untisd.exe": "wrong"}),
	}))
	h := newHarness(t, "1.0.0", in, gh, nil)
	if st := h.Check(context.Background()); st.Asset != "untis-web-1.1.0-windows-arm64.zip" {
		t.Fatalf("asset = %s", st.Asset)
	}
	if st := h.finish(t); st.State != StateDone || read(t, in.Exe) != "new" {
		t.Errorf("status = %+v, binary = %q", st, read(t, in.Exe))
	}
}

func TestPortableFolderIsReplaced(t *testing.T) {
	for _, goos := range []string{"linux", "windows"} {
		dir := t.TempDir()
		ext, asset, archive := "", "Untis_1.1.0_x64-linux-portable.tar.gz", tarGz
		if goos == "windows" {
			ext, asset, archive = ".exe", "Untis_1.1.0_x64-windows-portable.zip", zipped
		}
		in := Install{Kind: KindPortable, OS: goos, Arch: "amd64", Exe: write(t, filepath.Join(dir, "untisd"+ext), "old backend")}
		shell := write(t, filepath.Join(dir, "untis-desktop"+ext), "old app")
		marker := write(t, filepath.Join(dir, PortableMarker), "my marker")
		notes := write(t, filepath.Join(dir, "notes.txt"), "the user's own file")

		gh := newFakeGitHub(t, "v1.1.0", withSums(map[string][]byte{
			asset: archive(t, map[string]string{
				"Untis_1.1.0_x64-" + goos + "-portable/untisd" + ext:        "new backend",
				"Untis_1.1.0_x64-" + goos + "-portable/untis-desktop" + ext: "new app",
				"Untis_1.1.0_x64-" + goos + "-portable/" + PortableMarker:   "release marker",
				"Untis_1.1.0_x64-" + goos + "-portable/extra.dll":           "not ours",
			}),
		}))
		h := newHarness(t, "1.0.0", in, gh, nil)
		if st := h.Check(context.Background()); st.Asset != asset {
			t.Fatalf("%s: asset = %s", goos, st.Asset)
		}
		st := h.finish(t)
		if st.State != StateDone || st.Result.Restart != RestartApp {
			t.Fatalf("%s: status = %+v", goos, st)
		}
		if read(t, in.Exe) != "new backend" || read(t, shell) != "new app" {
			t.Errorf("%s: programs = %q, %q", goos, read(t, in.Exe), read(t, shell))
		}
		// only the two programs are touched
		if read(t, marker) != "my marker" || read(t, notes) != "the user's own file" {
			t.Errorf("%s: other files changed", goos)
		}
		if entries, _ := os.ReadDir(dir); len(entries) != 4 {
			t.Errorf("%s: folder now has %d files", goos, len(entries))
		}
	}
}

func TestAppImageIsReplaced(t *testing.T) {
	dir := t.TempDir()
	image := write(t, filepath.Join(dir, "Untis.AppImage"), "old image")
	mount := t.TempDir()
	in := Install{Kind: KindAppImage, OS: "linux", Arch: "arm64", Exe: write(t, filepath.Join(mount, "untisd"), "mounted"), AppImage: image}
	gh := newFakeGitHub(t, "v1.1.0", withSums(map[string][]byte{
		"Untis_1.1.0_aarch64.AppImage": []byte("new image"),
		"Untis_1.1.0_amd64.AppImage":   []byte("wrong architecture"),
	}))
	h := newHarness(t, "1.0.0", in, gh, nil)
	h.Check(context.Background())
	st := h.finish(t)
	if st.State != StateDone || st.Result.Restart != RestartApp {
		t.Fatalf("status = %+v", st)
	}
	// the file the user starts is replaced, under the name they gave it
	if read(t, image) != "new image" {
		t.Errorf("image = %q", read(t, image))
	}
	if info, _ := os.Stat(image); runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		t.Errorf("the new image is not executable: %v", info.Mode())
	}
	// the mounted copy is read-only and stays alone
	if read(t, in.Exe) != "mounted" || len(leftovers(t, dir)) != 0 || len(leftovers(t, mount)) != 0 {
		t.Errorf("mount touched or leftovers: %v %v", leftovers(t, dir), leftovers(t, mount))
	}
}

// --- pressing the button: installers and packages ---------------------------

func TestPackagesAreSavedWithTheirCommand(t *testing.T) {
	cases := []struct {
		kind    Kind
		arch    string
		asset   string
		command string
	}{
		{KindDeb, "amd64", "Untis_1.1.0_amd64.deb", "sudo apt install '%s'"},
		{KindDeb, "arm64", "Untis_1.1.0_arm64.deb", "sudo apt install '%s'"},
		{KindRPM, "amd64", "Untis-1.1.0-1.x86_64.rpm", "sudo rpm -Uvh '%s'"},
		{KindRPM, "arm64", "Untis-1.1.0-1.aarch64.rpm", "sudo rpm -Uvh '%s'"},
	}
	files := map[string][]byte{}
	for _, c := range cases {
		files[c.asset] = []byte("package " + c.asset)
	}
	gh := newFakeGitHub(t, "v1.1.0", withSums(files))
	for _, c := range cases {
		exe := write(t, filepath.Join(t.TempDir(), "untisd"), "installed")
		h := newHarness(t, "1.0.0", Install{Kind: c.kind, OS: "linux", Arch: c.arch, Exe: exe}, gh, nil)
		h.Check(context.Background())
		st := h.finish(t)
		file := filepath.Join(h.downloads, c.asset)
		if st.State != StateDone || st.Result.Action != ActionSave || st.Result.File != file || st.Result.Restart != "" {
			t.Fatalf("%s: status = %+v result = %+v", c.asset, st, st.Result)
		}
		if st.Result.Command != fmt.Sprintf(c.command, file) {
			t.Errorf("%s: command = %s", c.asset, st.Result.Command)
		}
		if read(t, file) != "package "+c.asset {
			t.Errorf("%s: saved %q", c.asset, read(t, file))
		}
		// a package is never opened or run, and the installed program
		// is not touched
		if len(h.opened) != 0 || read(t, exe) != "installed" || len(leftovers(t, h.downloads)) != 0 {
			t.Errorf("%s: opened %v, leftovers %v", c.asset, h.opened, leftovers(t, h.downloads))
		}
	}
}

func TestInstallersAreDownloadedAndOpened(t *testing.T) {
	cases := []struct {
		kind       Kind
		goos, arch string
		asset      string
	}{
		{KindNSIS, "windows", "amd64", "Untis_1.1.0_x64-setup.exe"},
		{KindNSIS, "windows", "arm64", "Untis_1.1.0_arm64-setup.exe"},
		{KindMSI, "windows", "amd64", "Untis_1.1.0_x64_en-US.msi"},
		{KindDMG, "darwin", "arm64", "Untis_1.1.0_universal.dmg"},
		{KindDMG, "darwin", "amd64", "Untis_1.1.0_universal.dmg"},
	}
	files := map[string][]byte{}
	for _, c := range cases {
		files[c.asset] = []byte("installer " + c.asset)
	}
	gh := newFakeGitHub(t, "v1.1.0", withSums(files))
	for _, c := range cases {
		exe := write(t, filepath.Join(t.TempDir(), "untisd"), "installed")
		h := newHarness(t, "1.0.0", Install{Kind: c.kind, OS: c.goos, Arch: c.arch, Exe: exe}, gh, nil)
		h.Check(context.Background())
		st := h.finish(t)
		file := filepath.Join(h.downloads, c.asset)
		if st.State != StateDone || st.Result.Action != ActionRun || st.Result.File != file || st.Result.Command != "" {
			t.Fatalf("%s: status = %+v result = %+v", c.asset, st, st.Result)
		}
		if len(h.opened) != 1 || h.opened[0] != file || read(t, file) != "installer "+c.asset {
			t.Errorf("%s: opened %v", c.asset, h.opened)
		}
	}
}

func TestSecondDownloadOverwritesTheFirst(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", withSums(map[string][]byte{"Untis_1.1.0_amd64.deb": []byte("package")}))
	h := newHarness(t, "1.0.0", Install{Kind: KindDeb, OS: "linux", Arch: "amd64", Exe: write(t, filepath.Join(t.TempDir(), "untisd"), "x")}, gh, nil)
	write(t, filepath.Join(h.downloads, "Untis_1.1.0_amd64.deb"), "half a download from last week")
	h.Check(context.Background())
	if st := h.finish(t); st.State != StateDone || read(t, st.Result.File) != "package" {
		t.Errorf("status = %+v", st)
	}
	// pressing again after it is done downloads again rather than failing
	if st := h.finish(t); st.State != StateDone || read(t, st.Result.File) != "package" {
		t.Errorf("second run = %+v", st)
	}
}

// --- pressing the button: nothing to download -------------------------------

func TestUnknownInstallationOpensTheReleasePage(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	page := gh.URL + "/" + Owner + "/" + Repo + "/releases/tag/v1.1.0"
	for name, in := range map[string]Install{
		"built from source":           {Kind: KindUnknown, OS: "linux", Arch: "amd64", Exe: "/x/untisd"},
		"platform without a file":     {Kind: KindAppImage, OS: "linux", Arch: "riscv64", Exe: "/x/untisd", AppImage: "/x/a.AppImage"},
		"file missing in the release": {Kind: KindRPM, OS: "linux", Arch: "amd64", Exe: "/x/untisd"},
	} {
		h := newHarness(t, "1.0.0", in, gh, nil)
		st := h.Check(context.Background())
		if st.State != StateAvailable || st.Action != ActionPage || st.Asset != "" {
			t.Fatalf("%s: status = %+v", name, st)
		}
		if err := h.Apply(context.Background()); err != nil {
			t.Fatalf("%s: apply: %v", name, err)
		}
		if len(h.opened) != 1 || h.opened[0] != page {
			t.Errorf("%s: opened %v, want %s", name, h.opened, page)
		}
		// the update is still pending and nothing was downloaded
		if st := h.Status(); st.State != StateAvailable || gh.downloads.Load() != 0 {
			t.Errorf("%s: after opening the page: %+v", name, st)
		}
	}
}

func TestOpenPage(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	h := newHarness(t, "1.0.0", webInstall(t), gh, nil)
	if err := h.OpenPage(); !errors.Is(err, ErrNothingToDo) {
		t.Errorf("before any update is known: %v", err)
	}
	h.Check(context.Background())
	if err := h.OpenPage(); err != nil || len(h.opened) != 1 || !strings.HasSuffix(h.opened[0], "/releases/tag/v1.1.0") {
		t.Errorf("err = %v, opened %v", err, h.opened)
	}
}

// --- what can go wrong -------------------------------------------------------

// Every failure leaves the installation exactly as it was, cleans up, and
// keeps the button so the user can try again.
func TestFailuresChangeNothing(t *testing.T) {
	asset := "untis-web-1.1.0-linux-amd64.tar.gz"
	cases := map[string]struct {
		tweak func(t *testing.T, g *fakeGitHub)
		want  string // part of the error
	}{
		"tampered file": {func(t *testing.T, g *fakeGitHub) {
			g.files[asset] = tarGz(t, map[string]string{"x/untisd": "evil"})
		}, "does not match its checksum"},
		"no checksum file": {func(t *testing.T, g *fakeGitHub) { delete(g.files, ChecksumFile) }, "cannot be verified"},
		"file not in the checksum list": {func(t *testing.T, g *fakeGitHub) {
			g.files[ChecksumFile] = []byte(strings.Repeat("0", 64) + "  something-else.tar.gz\n")
		}, "does not list"},
		"checksum of another file": {func(t *testing.T, g *fakeGitHub) {
			sum := sha256.Sum256(g.files["untis-web-1.1.0-linux-arm64.tar.gz"])
			g.files[ChecksumFile] = []byte(hex.EncodeToString(sum[:]) + "  " + asset + "\n")
		}, "does not match its checksum"},
		"shorter than announced": {func(t *testing.T, g *fakeGitHub) {
			g.sizes = map[string]int64{asset: int64(len(g.files[asset])) + 10}
		}, "the release lists"},
		"longer than announced": {func(t *testing.T, g *fakeGitHub) {
			g.sizes = map[string]int64{asset: int64(len(g.files[asset])) - 10}
		}, "the release lists"},
		"empty file":          {func(t *testing.T, g *fakeGitHub) { g.sizes = map[string]int64{asset: 0} }, "implausible size"},
		"absurdly large file": {func(t *testing.T, g *fakeGitHub) { g.sizes = map[string]int64{asset: 5 << 30} }, "implausible size"},
		"redirect to plain http": {func(t *testing.T, g *fakeGitHub) {
			g.redirect = map[string]string{asset: "http://downloads.example.invalid/file"}
		}, "refusing redirect"},
		"archive without the program": {func(t *testing.T, g *fakeGitHub) {
			g.files[asset] = tarGz(t, map[string]string{"untis-web-1.1.0-linux-amd64/README.txt": "only this"})
			withSums(g.files)
		}, "does not contain untisd"},
		"not an archive": {func(t *testing.T, g *fakeGitHub) {
			g.files[asset] = []byte("<html>rate limited</html>")
			withSums(g.files)
		}, "gzip"},
	}
	for name, c := range cases {
		gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
		in := webInstall(t)
		h := newHarness(t, "1.0.0", in, gh, nil)
		gh.mu.Lock()
		c.tweak(t, gh)
		gh.mu.Unlock()
		if st := h.Check(context.Background()); st.State != StateAvailable {
			t.Fatalf("%s: check: %+v", name, st)
		}
		st := h.finish(t)
		if st.State != StateFailed || !strings.Contains(st.Error, c.want) || st.Result != nil {
			t.Errorf("%s: state %s, error %q (want %q)", name, st.State, st.Error, c.want)
		}
		if got := read(t, in.Exe); got != "old" {
			t.Errorf("%s: the binary was changed to %q", name, got)
		}
		if left := leftovers(t, filepath.Dir(in.Exe)); len(left) != 0 {
			t.Errorf("%s: left behind %v", name, left)
		}
		// still offered: the button stays and a retry is possible
		if st.Latest != "1.1.0" || st.Asset != asset {
			t.Errorf("%s: the update is no longer offered: %+v", name, st)
		}
	}
}

func TestRetryAfterAFailure(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	in := webInstall(t)
	h := newHarness(t, "1.0.0", in, gh, nil)
	h.Check(context.Background())
	good := gh.files[ChecksumFile]
	gh.mu.Lock()
	gh.files[ChecksumFile] = []byte("garbage\n")
	gh.mu.Unlock()
	if st := h.finish(t); st.State != StateFailed {
		t.Fatalf("status = %+v", st)
	}
	// a check in between keeps the failure visible, it is the same release
	if st := h.Check(context.Background()); st.State != StateFailed || st.Error == "" {
		t.Errorf("after a check: %+v", st)
	}
	gh.mu.Lock()
	gh.files[ChecksumFile] = good
	gh.mu.Unlock()
	if st := h.finish(t); st.State != StateDone || st.Error != "" || read(t, in.Exe) != "new" {
		t.Errorf("retry: %+v, binary %q", st, read(t, in.Exe))
	}
}

func TestNoWriteAccess(t *testing.T) {
	if runtime.GOOS == "windows" || os.Getuid() == 0 {
		t.Skip("needs a user whose access a read-only folder restricts")
	}
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	in := webInstall(t)
	dir := filepath.Dir(in.Exe)
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(dir, 0o755)
	h := newHarness(t, "1.0.0", in, gh, nil)
	h.Check(context.Background())
	st := h.finish(t)
	if st.State != StateFailed || !strings.Contains(st.Error, "write access to "+dir) {
		t.Errorf("status = %+v", st)
	}
	// noticed before anything was downloaded
	if n := gh.downloads.Load(); n != 0 || read(t, in.Exe) != "old" {
		t.Errorf("%d downloads, binary %q", n, read(t, in.Exe))
	}
}

func TestOnlyOneUpdateAtATime(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	gh.hold = make(chan struct{})
	in := webInstall(t)
	h := newHarness(t, "1.0.0", in, gh, nil)
	h.Check(context.Background())
	if err := h.Apply(context.Background()); err != nil {
		t.Fatal(err)
	}
	for gh.downloads.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	if err := h.Apply(context.Background()); !errors.Is(err, ErrBusy) {
		t.Errorf("second press = %v, want ErrBusy", err)
	}
	// a check while downloading does not reset the progress
	if st := h.Check(context.Background()); st.State != StateDownloading {
		t.Errorf("state after a check = %s", st.State)
	}
	// switching the setting off does not abort a running update either
	h.enabled.Store(false)
	h.SettingsChanged()
	if st := h.Status(); st.State != StateDownloading {
		t.Errorf("state after switching off = %s", st.State)
	}
	close(gh.hold)
	if st := h.wait(t); st.State != StateDone || gh.downloads.Load() != 1 || read(t, in.Exe) != "new" {
		t.Errorf("status = %+v, downloads = %d", st, gh.downloads.Load())
	}
	// done stays done: a later check must not bring the button back for
	// a version that is already in place
	if st := h.Check(context.Background()); st.State != StateDone || st.Result == nil {
		t.Errorf("after a later check: %+v", st)
	}
}

func TestOpenerFailureIsReported(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", withSums(map[string][]byte{"Untis_1.1.0_x64-setup.exe": []byte("installer")}))
	h := newHarness(t, "1.0.0", Install{Kind: KindNSIS, OS: "windows", Arch: "amd64", Exe: write(t, filepath.Join(t.TempDir(), "untisd.exe"), "x")}, gh,
		func(c *Config) { c.Open = func(string) error { return errors.New("no handler") } })
	h.Check(context.Background())
	st := h.finish(t)
	file := filepath.Join(h.downloads, "Untis_1.1.0_x64-setup.exe")
	// the verified installer is kept and named, so the user can start it
	if st.State != StateFailed || !strings.Contains(st.Error, file) || read(t, file) != "installer" {
		t.Errorf("status = %+v", st)
	}
}

// --- order, noise and cleanup -------------------------------------------------

// The answer to "apply" and the events of the update travel separately
// and can arrive in either order; the sequence number tells which is newer.
func TestEveryChangeHasAHigherSequenceNumber(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	h := newHarness(t, "1.0.0", webInstall(t), gh, nil)
	h.Check(context.Background())
	if err := h.Apply(context.Background()); err != nil {
		t.Fatal(err)
	}
	final := h.wait(t)
	h.mu.Lock()
	defer h.mu.Unlock()
	for i := 1; i < len(h.events); i++ {
		if h.events[i].Seq <= h.events[i-1].Seq {
			t.Fatalf("event %d has seq %d after %d", i, h.events[i].Seq, h.events[i-1].Seq)
		}
	}
	if last := h.events[len(h.events)-1]; last.State != StateDone || last.Seq != final.Seq {
		t.Errorf("last event %s seq %d, status seq %d", last.State, last.Seq, final.Seq)
	}
}

// Every saved setting calls SettingsChanged; only a change of the update
// setting may reach the frontend.
func TestOtherSettingsDoNotPublish(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	h := newHarness(t, "1.0.0", webInstall(t), gh, nil)
	h.Check(context.Background())
	count := func() int { h.mu.Lock(); defer h.mu.Unlock(); return len(h.events) }
	before := count()
	for range 5 {
		h.SettingsChanged()
	}
	if n := count(); n != before {
		t.Errorf("%d events for settings that did not change the update check", n-before)
	}
	h.enabled.Store(false)
	h.SettingsChanged()
	h.SettingsChanged()
	if n := count(); n != before+1 {
		t.Errorf("%d events for switching the check off, want 1", n-before)
	}
	if n := gh.apiCalls.Load(); n != 1 {
		t.Errorf("%d requests", n)
	}
}

func TestInstallationIsDetectedOnFirstUse(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	in := webInstall(t)
	var calls atomic.Int32
	h := newHarness(t, "1.0.0", Install{}, gh, func(c *Config) {
		c.Detect = func() Install { calls.Add(1); return in }
	})
	if n := calls.Load(); n != 0 {
		t.Fatalf("detected %d times while starting", n)
	}
	if st := h.Check(context.Background()); st.Kind != KindWeb || st.Asset == "" {
		t.Errorf("status = %+v", st)
	}
	h.Status()
	h.finish(t)
	if n := calls.Load(); n != 1 {
		t.Errorf("detected %d times, want once", n)
	}
}

// A download that was cut off (the app was closed) leaves a hidden
// temporary file; the next start removes it, also from the download
// folder, and touches nothing else there.
func TestStartRemovesInterruptedDownloads(t *testing.T) {
	gh := newFakeGitHub(t, "v1.1.0", webRelease(t))
	exe := write(t, filepath.Join(t.TempDir(), "untisd"), "installed")
	h := newHarness(t, "1.0.0", Install{Kind: KindDeb, OS: "linux", Arch: "amd64", Exe: exe}, gh, func(c *Config) { c.FirstCheck = time.Hour })
	stale := write(t, filepath.Join(h.downloads, ".untis-update-123"), "half a package")
	mine := write(t, filepath.Join(h.downloads, "holiday.jpg"), "the user's file")
	earlier := write(t, filepath.Join(h.downloads, "Untis_1.0.5_amd64.deb"), "an earlier, complete download")
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { h.Run(ctx); close(done) }()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(stale); err != nil {
			break
		}
		time.Sleep(time.Millisecond)
	}
	cancel()
	<-done
	if _, err := os.Stat(stale); err == nil {
		t.Error("the interrupted download is still there")
	}
	if read(t, mine) != "the user's file" || read(t, earlier) != "an earlier, complete download" || read(t, exe) != "installed" {
		t.Error("other files were touched")
	}
	if n := gh.apiCalls.Load(); n != 0 {
		t.Errorf("%d requests during cleanup", n)
	}
}
