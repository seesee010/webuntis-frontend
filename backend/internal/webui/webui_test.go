package webui

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

var site = fstest.MapFS{
	"index.html":        {Data: []byte("<html><head><title>x</title></head><body></body></html>")},
	"assets/app-1a2.js": {Data: []byte("console.log(1)")},
}

func get(t *testing.T, h http.Handler, method, path string) *http.Response {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec.Result()
}

func body(res *http.Response) string {
	b, _ := io.ReadAll(res.Body)
	return string(b)
}

func TestIndexGetsTheToken(t *testing.T) {
	h := Handler(site, `tok"<x>`)
	for _, p := range []string{"/", "/index.html"} {
		res := get(t, h, "GET", p)
		b := body(res)
		if !strings.Contains(b, `<meta name="untis-token" content="tok&#34;&lt;x&gt;"></head>`) {
			t.Errorf("%s: token not injected (escaped) before </head>: %s", p, b)
		}
		if res.Header.Get("Cache-Control") != "no-store" || res.Header.Get("X-Frame-Options") != "DENY" {
			t.Errorf("%s: headers %v", p, res.Header)
		}
	}
}

func TestAssetsAndMisses(t *testing.T) {
	h := Handler(site, "t")
	res := get(t, h, "GET", "/assets/app-1a2.js")
	if res.StatusCode != 200 || body(res) != "console.log(1)" || !strings.Contains(res.Header.Get("Cache-Control"), "immutable") {
		t.Errorf("asset: %d %v", res.StatusCode, res.Header)
	}
	if res := get(t, h, "GET", "/nope"); res.StatusCode != 404 {
		t.Errorf("unknown path: %d", res.StatusCode)
	}
	if res := get(t, h, "GET", "/../../etc/passwd"); res.StatusCode != 404 {
		t.Errorf("traversal: %d", res.StatusCode)
	}
	if res := get(t, h, "POST", "/"); res.StatusCode != 405 {
		t.Errorf("POST: %d", res.StatusCode)
	}
}

func TestPlaceholderWithoutFrontend(t *testing.T) {
	empty := fstest.MapFS{".keep": {}}
	if Available(empty) {
		t.Error("empty fs reported as available")
	}
	if b := body(get(t, Handler(empty, "t"), "GET", "/")); !strings.Contains(b, "make web") {
		t.Errorf("placeholder: %s", b)
	}
	if !Available(site) {
		t.Error("site not available")
	}
	_ = Files() // the embedded tree is always valid, even without a build
}
