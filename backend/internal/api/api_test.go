package api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
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

// readEvents reads the stream until want events (not comments) arrived.
func readEvents(t *testing.T, r *bufio.Reader, want int) []string {
	t.Helper()
	var out []string
	var cur strings.Builder
	for len(out) < want {
		line, err := r.ReadString('\n')
		if err != nil {
			t.Fatalf("after %d events: %v", len(out), err)
		}
		switch {
		case line == "\n" && cur.Len() > 0:
			out = append(out, cur.String())
			cur.Reset()
		case strings.HasPrefix(line, ":") || line == "\n":
		default:
			cur.WriteString(line)
		}
	}
	return out
}

func openEvents(t *testing.T, srv *httptest.Server, query string, lastID int64) *bufio.Reader {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+"/api/events?token="+token+query, nil)
	if lastID != 0 {
		req.Header.Set("Last-Event-ID", fmt.Sprint(lastID))
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return bufio.NewReader(res.Body)
}

// Changes found while no window was open reach the next one that connects
// with the id it saw last.
func TestEventsReplayMissedChanges(t *testing.T) {
	srv, svc := server(t)
	bus := svc.Bus()
	bus.Publish(events.TypeChanges, []string{"seen"})
	seen, _, cancel := bus.SubscribeSince(1, 1)
	cancel()
	bus.Publish(events.TypeChanges, []string{"missed"}) // no client connected

	// EventSource reconnecting: Last-Event-ID
	got := readEvents(t, openEvents(t, srv, "", seen[0].ID), 1)
	if !strings.Contains(got[0], fmt.Sprintf("id: %d\n", seen[0].ID+1)) || !strings.Contains(got[0], "event: changes\n") || !strings.Contains(got[0], `"missed"`) {
		t.Errorf("Last-Event-ID replay = %q", got)
	}

	// a new page that remembered the id: ?since=, and Last-Event-ID wins over it
	if got := readEvents(t, openEvents(t, srv, fmt.Sprintf("&since=%d", seen[0].ID-1), 0), 2); !strings.Contains(got[0], `"seen"`) || !strings.Contains(got[1], `"missed"`) {
		t.Errorf("since replay = %q", got)
	}
	if got := readEvents(t, openEvents(t, srv, "&since=1", seen[0].ID), 1); !strings.Contains(got[0], `"missed"`) {
		t.Errorf("Last-Event-ID must win over since: %q", got)
	}

	// without an id nothing old is replayed; live events still come, with their id
	r := openEvents(t, srv, "&since=garbage", 0)
	time.Sleep(50 * time.Millisecond) // let the handler subscribe
	bus.Publish(events.TypeChanges, []string{"live"})
	if got := readEvents(t, r, 1); !strings.Contains(got[0], `"live"`) || !strings.Contains(got[0], "id: ") {
		t.Errorf("first event without an id = %q", got)
	}
}
