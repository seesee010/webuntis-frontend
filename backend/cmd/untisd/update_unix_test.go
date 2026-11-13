//go:build unix

package main

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/seesee010/webuntis-frontend/backend/internal/update"
)

// TestWebEditionUpdatesItself runs the whole update for real: a released
// web edition 1.0.0 finds 1.1.0 on a (local, fake) release server,
// downloads the archive for its own target, replaces itself and restarts
// into the new version on the same address with the same token, so an
// open browser tab keeps working.
func TestWebEditionUpdatesItself(t *testing.T) {
	if testing.Short() {
		t.Skip("builds two binaries")
	}
	const target = "testos-testarch"
	dir := t.TempDir()
	build := func(out, version string) {
		t.Helper()
		ld := "-X main.version=" + version + " -X main.webTarget=" + target
		if msg, err := exec.Command("go", "build", "-ldflags", ld, "-o", out, ".").CombinedOutput(); err != nil {
			t.Fatalf("build %s: %v\n%s", version, err, msg)
		}
	}
	bin := filepath.Join(dir, "untisd")
	build(bin, "1.0.0")
	next := filepath.Join(t.TempDir(), "untisd")
	build(next, "1.1.0")
	newBinary, err := os.ReadFile(next)
	if err != nil {
		t.Fatal(err)
	}

	// The release: the archive for our target, one for another target
	// that must not be used, and the checksums.
	archive := webArchive(t, "untis-web-1.1.0-"+target+"/untisd", newBinary)
	files := map[string][]byte{
		"untis-web-1.1.0-" + target + ".tar.gz": archive,
		"untis-web-1.1.0-other-target.tar.gz":   webArchive(t, "untis-web-1.1.0-other-target/untisd", []byte("#!/bin/false\n")),
	}
	sums := ""
	for name, data := range files {
		sum := sha256.Sum256(data)
		sums += hex.EncodeToString(sum[:]) + "  " + name + "\n"
	}
	files[update.ChecksumFile] = []byte(sums)
	downloaded := map[string]int{}
	releases := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/"+update.Owner+"/"+update.Repo+"/releases/latest" {
			var assets []map[string]any
			for name, data := range files {
				assets = append(assets, map[string]any{"name": name, "size": len(data)})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"tag_name": "v1.1.0", "assets": assets})
			return
		}
		name := filepath.Base(r.URL.Path)
		data, ok := files[name]
		if !ok {
			http.NotFound(w, r)
			return
		}
		downloaded[name]++
		_, _ = w.Write(data)
	}))
	defer releases.Close()

	cmd := exec.Command(bin, "-web", "-no-browser", "-settings", filepath.Join(dir, "settings.json"))
	cmd.Env = append(os.Environ(), update.SourceEnv+"="+releases.URL)
	stdout, _ := cmd.StdoutPipe()
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	lines := bufio.NewReader(stdout)

	var hello struct {
		Port    int    `json:"port"`
		Token   string `json:"token"`
		Version string `json:"version"`
	}
	line, err := lines.ReadString('\n')
	if err != nil || json.Unmarshal([]byte(line), &hello) != nil || hello.Version != "1.0.0" {
		t.Fatalf("handshake %q: %v", line, err)
	}
	base := fmt.Sprintf("http://127.0.0.1:%d", hello.Port)
	call := func(method, path string, out any) int {
		t.Helper()
		req, _ := http.NewRequest(method, base+path, nil)
		req.Header.Set("Authorization", "Bearer "+hello.Token)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			return 0
		}
		defer res.Body.Close()
		if out != nil {
			_ = json.NewDecoder(res.Body).Decode(out)
		} else {
			_, _ = io.Copy(io.Discard, res.Body)
		}
		return res.StatusCode
	}

	var st update.Status
	if code := call("POST", "/api/update/check", &st); code != 200 || st.State != update.StateAvailable || st.Latest != "1.1.0" {
		t.Fatalf("check: %d %+v", code, st)
	}
	if st.Kind != update.KindWeb || st.Asset != "untis-web-1.1.0-"+target+".tar.gz" || st.Action != update.ActionReplace {
		t.Fatalf("the update is not the archive of this target: %+v", st)
	}
	// restarting before anything is installed is refused
	if code := call("POST", "/api/update/restart", nil); code != http.StatusConflict {
		t.Errorf("early restart: %d", code)
	}

	if code := call("POST", "/api/update/apply", nil); code != http.StatusAccepted {
		t.Fatalf("apply: %d", code)
	}
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		if call("GET", "/api/update", &st); st.State != update.StateDownloading {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if st.State != update.StateDone || st.Result == nil || st.Result.Restart != update.RestartServer {
		t.Fatalf("after the update: %+v (result %+v)", st, st.Result)
	}
	if now, _ := os.ReadFile(bin); !bytes.Equal(now, newBinary) {
		t.Fatal("the binary on disk is not the new version")
	}
	if downloaded["untis-web-1.1.0-other-target.tar.gz"] != 0 || downloaded["untis-web-1.1.0-"+target+".tar.gz"] != 1 {
		t.Errorf("downloads: %v", downloaded)
	}
	// still the old version until the restart
	var health struct {
		Version string `json:"version"`
	}
	if call("GET", "/api/health", &health); health.Version != "1.0.0" {
		t.Errorf("version before the restart: %q", health.Version)
	}

	if code := call("POST", "/api/update/restart", nil); code != http.StatusAccepted {
		t.Fatalf("restart: %d", code)
	}
	// The new version comes up on the same address: it prints its
	// handshake again, and the old token still works.
	var again struct {
		Port    int    `json:"port"`
		Token   string `json:"token"`
		Version string `json:"version"`
	}
	got := make(chan string, 1)
	go func() { l, _ := lines.ReadString('\n'); got <- l }()
	select {
	case line = <-got:
	case <-time.After(20 * time.Second):
		t.Fatal("the new version did not start")
	}
	if json.Unmarshal([]byte(line), &again) != nil || again.Version != "1.1.0" || again.Port != hello.Port || again.Token != hello.Token {
		t.Fatalf("second handshake %q, first was port %d", line, hello.Port)
	}
	deadline = time.Now().Add(10 * time.Second)
	for health.Version = ""; time.Now().Before(deadline) && health.Version != "1.1.0"; time.Sleep(20 * time.Millisecond) {
		call("GET", "/api/health", &health)
	}
	if health.Version != "1.1.0" {
		t.Fatalf("version after the restart: %q", health.Version)
	}
	var after update.Status
	if code := call("GET", "/api/update", &after); code != 200 || after.Current != "1.1.0" || after.State != update.StateIdle || after.Result != nil {
		t.Errorf("updater after the restart: %d %+v", code, after)
	}
	if code := call("GET", "/api/overview", nil); code != 200 {
		t.Errorf("data after the restart: %d", code)
	}
	// and it is up to date now: no button
	after = update.Status{}
	if code := call("POST", "/api/update/check", &after); code != 200 || after.State != update.StateIdle || after.Latest != "" {
		t.Errorf("check after the update: %+v", after)
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.Name() != "untisd" && e.Name() != "settings.json" {
			t.Errorf("left next to the binary: %s", e.Name())
		}
	}
}

func webArchive(t *testing.T, name string, binary []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	if err := tw.WriteHeader(&tar.Header{Name: name, Typeflag: tar.TypeReg, Mode: 0o755, Size: int64(len(binary))}); err != nil {
		t.Fatal(err)
	}
	_, _ = tw.Write(binary)
	_ = tw.Close()
	_ = gz.Close()
	return buf.Bytes()
}
