package api

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/seesee010/webuntis-frontend/backend/internal/domain"
	"github.com/seesee010/webuntis-frontend/backend/internal/events"
	"github.com/seesee010/webuntis-frontend/backend/internal/provider"
	"github.com/seesee010/webuntis-frontend/backend/internal/provider/sample"
	"github.com/seesee010/webuntis-frontend/backend/internal/service"
	"github.com/seesee010/webuntis-frontend/backend/internal/settings"
)

const token = "test-token"

func server(t *testing.T) (*httptest.Server, *service.Service) {
	t.Helper()
	store, err := settings.Open(filepath.Join(t.TempDir(), "settings.json"))
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	svc := service.New(store, func(settings.Backend) provider.Provider { return sample.New() }, events.NewBus(), log)
	srv := httptest.NewServer(New(Config{Token: token, Version: "test", Origins: DefaultOrigins}, svc, store, log))
	t.Cleanup(srv.Close)
	return srv, svc
}

func do(t *testing.T, srv *httptest.Server, method, path, body string, out any) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if out != nil {
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
	}
	return res
}

func TestAuth(t *testing.T) {
	srv, _ := server(t)
	res, _ := http.Get(srv.URL + "/api/settings")
	if res.StatusCode != http.StatusUnauthorized {
		t.Errorf("no token: %d", res.StatusCode)
	}
	res, _ = http.Get(srv.URL + "/api/settings?token=" + token)
	if res.StatusCode != http.StatusOK {
		t.Errorf("query token: %d", res.StatusCode)
	}
	res, _ = http.Get(srv.URL + "/api/health")
	if res.StatusCode != http.StatusOK {
		t.Errorf("health must be public: %d", res.StatusCode)
	}
}

func TestCORS(t *testing.T) {
	srv, _ := server(t)
	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/api/snapshot", nil)
	req.Header.Set("Origin", "http://localhost:1420")
	res, _ := http.DefaultClient.Do(req)
	if res.Header.Get("Access-Control-Allow-Origin") != "http://localhost:1420" || res.StatusCode != http.StatusNoContent {
		t.Errorf("preflight: %d %v", res.StatusCode, res.Header)
	}
	req.Header.Set("Origin", "https://evil.example")
	res, _ = http.DefaultClient.Do(req)
	if res.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Error("foreign origin allowed")
	}
}

func TestSnapshot(t *testing.T) {
	srv, _ := server(t)
	var snap domain.Snapshot
	res := do(t, srv, "GET", "/api/snapshot?from=2026-10-05&to=2026-10-09", "", &snap)
	if res.StatusCode != http.StatusOK || snap.Meta.Provider != "sample" || len(snap.Lessons) == 0 {
		t.Errorf("snapshot: %d %+v", res.StatusCode, snap.Meta)
	}
	var e map[string]map[string]string
	res = do(t, srv, "GET", "/api/snapshot?from=2026-10-09&to=2026-10-05", "", &e)
	if res.StatusCode != http.StatusBadRequest || e["error"]["kind"] != "bad-request" {
		t.Errorf("bad window: %d %v", res.StatusCode, e)
	}
}

func TestWho(t *testing.T) {
	srv, _ := server(t)
	var got []domain.Lookup
	if res := do(t, srv, "GET", "/api/who?code=MATH", "", &got); res.StatusCode != 200 || len(got) != 1 {
		t.Errorf("who: %d %v", res.StatusCode, got)
	}
	if res := do(t, srv, "GET", "/api/who?code=NOPE", "", nil); res.StatusCode != http.StatusNotFound {
		t.Errorf("who miss: %d", res.StatusCode)
	}
}

func TestSettingsRoundTrip(t *testing.T) {
	srv, _ := server(t)
	var doc map[string]any
	do(t, srv, "PATCH", "/api/settings", `{"ui": {"theme": "dark"}}`, &doc)
	do(t, srv, "PATCH", "/api/settings", `{"ui": {"accent": "#ff0000"}}`, &doc)
	ui := doc["ui"].(map[string]any)
	if ui["theme"] != "dark" || ui["accent"] != "#ff0000" {
		t.Errorf("after patch: %v", doc)
	}
	var reset map[string]any
	do(t, srv, "DELETE", "/api/settings", "", &reset)
	if _, ok := reset["ui"]; ok {
		t.Errorf("after reset: %v", reset)
	}
	if res := do(t, srv, "PUT", "/api/settings", `[1,2]`, nil); res.StatusCode != http.StatusBadRequest {
		t.Errorf("array body accepted: %d", res.StatusCode)
	}
}

func TestEventsStream(t *testing.T) {
	srv, svc := server(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+"/api/events?token="+token, nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	r := bufio.NewReader(res.Body)
	if line, _ := r.ReadString('\n'); !strings.HasPrefix(line, ": connected") {
		t.Fatalf("first line %q", line)
	}
	go func() { _, _, _ = svc.Refresh(context.Background(), true) }()
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			t.Fatal(err)
		}
		if line == "event: snapshot\n" {
			return
		}
	}
}
