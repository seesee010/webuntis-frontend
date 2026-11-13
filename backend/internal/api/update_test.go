package api

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/seesee010/webuntis-frontend/backend/internal/events"
	"github.com/seesee010/webuntis-frontend/backend/internal/provider"
	"github.com/seesee010/webuntis-frontend/backend/internal/provider/sample"
	"github.com/seesee010/webuntis-frontend/backend/internal/service"
	"github.com/seesee010/webuntis-frontend/backend/internal/settings"
	"github.com/seesee010/webuntis-frontend/backend/internal/update"
)

// updateServer is the API with an updater that looks at a fake release
// source offering the given tag. The installation is "unknown", so the
// button opens the release page.
func updateServer(t *testing.T, tag string, restart func() error) (*httptest.Server, *[]string) {
	t.Helper()
	releases := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"tag_name": %q, "assets": []}`, tag)
	}))
	t.Cleanup(releases.Close)
	var opened []string
	updater := update.New(update.Config{
		Version: "1.0.0",
		Install: update.Install{Kind: update.KindUnknown, OS: "linux", Arch: "amd64", Exe: "/x/untisd"},
		Source:  update.Source{API: releases.URL, Download: releases.URL},
		Open:    func(target string) error { opened = append(opened, target); return nil },
	})
	store, err := settings.Open(filepath.Join(t.TempDir(), "settings.json"))
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	svc := service.New(store, func(settings.Backend) provider.Provider { return sample.New() }, events.NewBus(), log)
	srv := httptest.NewServer(New(Config{Token: token, Version: "1.0.0", Origins: DefaultOrigins, Updater: updater, Restart: restart}, svc, store, log))
	t.Cleanup(srv.Close)
	return srv, &opened
}

func TestUpdateEndpoints(t *testing.T) {
	srv, opened := updateServer(t, "v1.1.0", nil)

	var st update.Status
	if res := do(t, srv, "GET", "/api/update", "", &st); res.StatusCode != 200 || st.State != update.StateIdle || st.Current != "1.0.0" || !st.Supported {
		t.Fatalf("status before a check: %d %+v", res.StatusCode, st)
	}
	// nothing known yet: the button has nothing to do
	if res := do(t, srv, "POST", "/api/update/apply", "", nil); res.StatusCode != http.StatusConflict {
		t.Errorf("apply without an update: %d", res.StatusCode)
	}
	if res := do(t, srv, "POST", "/api/update/page", "", nil); res.StatusCode != http.StatusConflict {
		t.Errorf("page without an update: %d", res.StatusCode)
	}

	if res := do(t, srv, "POST", "/api/update/check", "", &st); res.StatusCode != 200 || st.State != update.StateAvailable || st.Latest != "1.1.0" || st.Action != update.ActionPage {
		t.Fatalf("check: %d %+v", res.StatusCode, st)
	}
	if res := do(t, srv, "GET", "/api/update", "", &st); res.StatusCode != 200 || st.State != update.StateAvailable {
		t.Errorf("status after the check: %+v", st)
	}

	if res := do(t, srv, "POST", "/api/update/apply", "", &st); res.StatusCode != http.StatusAccepted || st.State != update.StateAvailable {
		t.Errorf("apply: %d %+v", res.StatusCode, st)
	}
	if res := do(t, srv, "POST", "/api/update/page", "", nil); res.StatusCode != 200 {
		t.Errorf("page: %d", res.StatusCode)
	}
	if len(*opened) != 2 || (*opened)[0] != (*opened)[1] || filepath.Base((*opened)[0]) != "v1.1.0" {
		t.Errorf("opened %v", *opened)
	}
}

func TestUpdateEndpointsNeedTheToken(t *testing.T) {
	srv, opened := updateServer(t, "v1.1.0", nil)
	for _, c := range [][2]string{{"GET", "/api/update"}, {"POST", "/api/update/check"}, {"POST", "/api/update/apply"}, {"POST", "/api/update/page"}, {"POST", "/api/update/restart"}} {
		req, _ := http.NewRequest(c[0], srv.URL+c[1], nil)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s %s without a token: %d", c[0], c[1], res.StatusCode)
		}
	}
	if len(*opened) != 0 {
		t.Errorf("opened %v", *opened)
	}
}

func TestCheckFailureIsNotAnHTTPError(t *testing.T) {
	srv, _ := updateServer(t, "not-a-version", nil)
	var st update.Status
	if res := do(t, srv, "POST", "/api/update/check", "", &st); res.StatusCode != 200 || st.State != update.StateIdle || st.CheckError == "" {
		t.Errorf("check: %d %+v", res.StatusCode, st)
	}
}

// Restarting is only for a web edition that has just replaced itself.
func TestRestartNeedsAnInstalledUpdate(t *testing.T) {
	restarted := 0
	srv, _ := updateServer(t, "v1.1.0", func() error { restarted++; return nil })
	do(t, srv, "POST", "/api/update/check", "", nil)
	if res := do(t, srv, "POST", "/api/update/restart", "", nil); res.StatusCode != http.StatusConflict || restarted != 0 {
		t.Errorf("restart with a pending update: %d, restarted %d times", res.StatusCode, restarted)
	}
}

func TestUpdateEndpointsWithoutAnUpdater(t *testing.T) {
	srv, _ := server(t)
	for _, c := range [][2]string{{"GET", "/api/update"}, {"POST", "/api/update/check"}, {"POST", "/api/update/apply"}, {"POST", "/api/update/page"}, {"POST", "/api/update/restart"}} {
		if res := do(t, srv, c[0], c[1], "", nil); res.StatusCode != http.StatusNotFound {
			t.Errorf("%s %s: %d", c[0], c[1], res.StatusCode)
		}
	}
}
