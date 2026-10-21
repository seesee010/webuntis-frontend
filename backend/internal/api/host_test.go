package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLoopbackHostOnly(t *testing.T) {
	h := LoopbackHostOnly(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }))
	for host, want := range map[string]int{
		"127.0.0.1:4000": 204, "localhost:4000": 204, "LOCALHOST": 204, "[::1]:4000": 204, "127.0.0.2": 204,
		"evil.example:4000": 421, "192.168.1.2:4000": 421, "": 421,
	} {
		req := httptest.NewRequest("GET", "/api/health", nil)
		req.Host = host
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Errorf("Host %q: %d, want %d", host, rec.Code, want)
		}
	}
}
