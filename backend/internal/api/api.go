// Package api serves the backend to the frontend over loopback HTTP.
//
// Every request needs the per-process token (Authorization: Bearer, or
// ?token= for EventSource which cannot set headers), so other local
// programs and web pages cannot read the user's timetable.
package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/seesee010/webuntis-frontend/backend/internal/provider"
	"github.com/seesee010/webuntis-frontend/backend/internal/service"
	"github.com/seesee010/webuntis-frontend/backend/internal/settings"
)

// Config of the API server.
type Config struct {
	Token   string
	Version string
	// Origins allowed for CORS (the Tauri webview and the Vite dev server).
	Origins []string
}

// DefaultOrigins are the origins the desktop shell and dev server use.
var DefaultOrigins = []string{
	"tauri://localhost",
	"http://tauri.localhost",
	"https://tauri.localhost",
	"http://localhost:1420",
	"http://127.0.0.1:1420",
}

// Server holds the handlers.
type Server struct {
	cfg   Config
	svc   *service.Service
	store *settings.Store
	log   *slog.Logger
}

// New creates the API handler.
func New(cfg Config, svc *service.Service, store *settings.Store, log *slog.Logger) http.Handler {
	s := &Server{cfg: cfg, svc: svc, store: store, log: log}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("GET /api/status", s.status)
	mux.HandleFunc("GET /api/snapshot", s.snapshot)
	mux.HandleFunc("GET /api/overview", s.overview)
	mux.HandleFunc("POST /api/refresh", s.refresh)
	mux.HandleFunc("GET /api/who", s.who)
	mux.HandleFunc("GET /api/settings", s.getSettings)
	mux.HandleFunc("PUT /api/settings", s.putSettings)
	mux.HandleFunc("PATCH /api/settings", s.patchSettings)
	mux.HandleFunc("DELETE /api/settings", s.resetSettings)
	mux.HandleFunc("GET /api/events", s.events)
	return s.recover(s.cors(s.auth(mux)))
}

// --- middleware -------------------------------------------------------------

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" && s.originAllowed(origin) {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) originAllowed(origin string) bool {
	for _, o := range s.cfg.Origins {
		if o == origin {
			return true
		}
	}
	return false
}

func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/health" {
			next.ServeHTTP(w, r)
			return
		}
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token == "" {
			token = r.URL.Query().Get("token")
		}
		if subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.Token)) != 1 {
			writeError(w, http.StatusUnauthorized, "unauthorized", "missing or wrong token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				s.log.Error("panic in handler", "path", r.URL.Path, "panic", v)
				writeError(w, http.StatusInternalServerError, "internal", "internal error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// --- handlers ---------------------------------------------------------------

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.cfg.Version})
}

func (s *Server) status(w http.ResponseWriter, r *http.Request) {
	st := s.svc.Status()
	resp := map[string]any{"version": s.cfg.Version, "settingsPath": s.store.Path(), "service": st}
	// Report the CLI version when the CLI is in use, so the settings page
	// can show whether it is installed at all.
	if v, ok := s.svc.Provider().(interface {
		Version(context.Context) (string, error)
	}); ok {
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		if ver, err := v.Version(ctx); err == nil {
			resp["cliVersion"] = ver
		} else {
			resp["cliError"] = service.NewErrorInfo(err)
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) snapshot(w http.ResponseWriter, r *http.Request) {
	q, err := parseWindow(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad-request", err.Error())
		return
	}
	snap, err := s.svc.Snapshot(r.Context(), q)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (s *Server) overview(w http.ResponseWriter, r *http.Request) {
	snap, err := s.svc.Overview(r.Context(), r.URL.Query().Get("fresh") == "1")
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (s *Server) refresh(w http.ResponseWriter, r *http.Request) {
	snap, diff, err := s.svc.Refresh(r.Context(), true)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"snapshot": snap, "changes": orEmpty(diff)})
}

func (s *Server) who(w http.ResponseWriter, r *http.Request) {
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		writeError(w, http.StatusBadRequest, "bad-request", "code is required")
		return
	}
	res, err := s.svc.Who(r.Context(), code)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, orEmpty(res))
}

func (s *Server) getSettings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.store.Get())
}

func (s *Server) putSettings(w http.ResponseWriter, r *http.Request) {
	s.writeSettings(w, r, s.store.Replace)
}

func (s *Server) patchSettings(w http.ResponseWriter, r *http.Request) {
	s.writeSettings(w, r, s.store.Patch)
}

func (s *Server) writeSettings(w http.ResponseWriter, r *http.Request, apply func(settings.Document) error) {
	var doc settings.Document
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20)).Decode(&doc); err != nil {
		writeError(w, http.StatusBadRequest, "bad-request", "body must be a JSON object: "+err.Error())
		return
	}
	if err := apply(doc); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s.store.Get())
}

func (s *Server) resetSettings(w http.ResponseWriter, _ *http.Request) {
	if err := s.store.Reset(); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s.store.Get())
}

// events streams the bus as server-sent events.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal", "streaming unsupported")
		return
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()

	ch, cancel := s.svc.Bus().Subscribe(32)
	defer cancel()
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		case ev, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(ev)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, data)
			flusher.Flush()
		}
	}
}

// --- helpers ----------------------------------------------------------------

func parseWindow(r *http.Request) (provider.Query, error) {
	v := r.URL.Query()
	from, err := time.ParseInLocation("2006-01-02", v.Get("from"), time.Local)
	if err != nil {
		return provider.Query{}, errors.New("from must be YYYY-MM-DD")
	}
	to := from
	if v.Get("to") != "" {
		if to, err = time.ParseInLocation("2006-01-02", v.Get("to"), time.Local); err != nil {
			return provider.Query{}, errors.New("to must be YYYY-MM-DD")
		}
	}
	if to.Before(from) {
		return provider.Query{}, errors.New("to is before from")
	}
	if to.Sub(from) > 400*24*time.Hour {
		return provider.Query{}, errors.New("window is longer than 400 days")
	}
	return provider.Query{From: from, To: to, Fresh: v.Get("fresh") == "1"}, nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, kind, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"kind": kind, "message": msg}})
}

// writeProviderError maps provider error kinds onto HTTP statuses; the
// kind itself is in the body so the GUI can react precisely.
func writeProviderError(w http.ResponseWriter, err error) {
	kind := provider.KindOf(err)
	status := http.StatusBadGateway
	switch kind {
	case provider.KindNotFound:
		status = http.StatusNotFound
	case provider.KindConfig:
		status = http.StatusFailedDependency
	case provider.KindLogin:
		status = http.StatusForbidden
	case provider.KindCancelled:
		status = http.StatusGatewayTimeout
	case provider.KindInternal:
		status = http.StatusInternalServerError
	}
	writeError(w, status, string(kind), err.Error())
}

func orEmpty[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}
