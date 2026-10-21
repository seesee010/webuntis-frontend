package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/seesee010/webuntis-frontend/backend/internal/settings"
)

func TestLoopbackOnly(t *testing.T) {
	for addr, ok := range map[string]bool{
		"127.0.0.1:0": true, "localhost:8080": true, "[::1]:0": true,
		"0.0.0.0:0": false, ":8080": false, "192.168.1.5:80": false, "nonsense": false,
	} {
		if err := loopbackOnly(addr); (err == nil) != ok {
			t.Errorf("loopbackOnly(%q) = %v, want ok=%v", addr, err, ok)
		}
	}
}

func TestNewProviderFollowsSettings(t *testing.T) {
	b := settings.DefaultBackend()
	if p := newProvider(b); p.Name() != "sample" {
		t.Errorf("default provider = %s", p.Name())
	}
	b.Provider = "cli"
	if p := newProvider(b); p.Name() != "cli" {
		t.Errorf("cli provider = %s", p.Name())
	}
}

func TestRandomToken(t *testing.T) {
	a, b := randomToken(), randomToken()
	if len(a) != 48 || a == b {
		t.Errorf("tokens %q %q", a, b)
	}
}

// TestProcess builds untisd, starts it like the desktop shell does and
// talks to it over HTTP. It uses a scratch settings file and sample data.
func TestProcess(t *testing.T) {
	if testing.Short() {
		t.Skip("builds a binary")
	}
	dir := t.TempDir()
	bin := filepath.Join(dir, "untisd")
	if out, err := exec.Command("go", "build", "-o", bin, ".").CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	cmd := exec.Command(bin, "-watch-stdin", "-settings", filepath.Join(dir, "settings.json"))
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}

	var hello struct {
		Port  int    `json:"port"`
		Token string `json:"token"`
	}
	line, err := bufio.NewReader(stdout).ReadString('\n')
	if err != nil || json.Unmarshal([]byte(line), &hello) != nil || hello.Port == 0 || hello.Token == "" {
		t.Fatalf("handshake %q: %v", line, err)
	}

	req, _ := http.NewRequest("GET", fmt.Sprintf("http://127.0.0.1:%d/api/overview", hello.Port), nil)
	req.Header.Set("Authorization", "Bearer "+hello.Token)
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("overview: %v %v", res, err)
	}
	res.Body.Close()

	// Closing stdin (the shell going away) must stop the process.
	stdin.Close()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		cmd.Process.Kill()
		t.Fatal("untisd did not exit after stdin closed")
	}
}

func TestBrowserCommand(t *testing.T) {
	for goos, want := range map[string]string{"windows": "rundll32", "darwin": "open", "linux": "xdg-open", "freebsd": "xdg-open", "openbsd": "xdg-open"} {
		if name, args := browserCommand(goos, "http://x/"); name != want || args[len(args)-1] != "http://x/" {
			t.Errorf("%s: %s %v", goos, name, args)
		}
	}
}

// TestWebEdition starts untisd -web and fetches the page and the API with
// the token from the page, like the browser does.
func TestWebEdition(t *testing.T) {
	if testing.Short() {
		t.Skip("builds a binary")
	}
	dir := t.TempDir()
	bin := filepath.Join(dir, "untisd")
	if out, err := exec.Command("go", "build", "-o", bin, ".").CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	cmd := exec.Command(bin, "-web", "-no-browser", "-watch-stdin", "-settings", filepath.Join(dir, "settings.json"))
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { stdin.Close(); _ = cmd.Wait() }()

	var hello struct {
		Port  int    `json:"port"`
		Token string `json:"token"`
	}
	line, _ := bufio.NewReader(stdout).ReadString('\n')
	if err := json.Unmarshal([]byte(line), &hello); err != nil {
		t.Fatalf("handshake %q: %v", line, err)
	}
	base := fmt.Sprintf("http://127.0.0.1:%d", hello.Port)

	res, err := http.Get(base + "/")
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("page: %v %v", res, err)
	}
	page, _ := io.ReadAll(res.Body)
	res.Body.Close()
	// Without a built frontend the placeholder is served; with one the token is embedded.
	if !strings.Contains(string(page), hello.Token) && !strings.Contains(string(page), "make web") {
		t.Errorf("page has neither token nor placeholder: %s", page)
	}

	req, _ := http.NewRequest("GET", base+"/api/status", nil)
	req.Header.Set("Authorization", "Bearer "+hello.Token)
	if res, err := http.DefaultClient.Do(req); err != nil || res.StatusCode != 200 {
		t.Errorf("api: %v %v", res, err)
	}

	req, _ = http.NewRequest("GET", base+"/", nil)
	req.Host = "evil.example"
	if res, err := http.DefaultClient.Do(req); err != nil || res.StatusCode != http.StatusMisdirectedRequest {
		t.Errorf("rebinding host accepted: %v %v", res, err)
	}
}
