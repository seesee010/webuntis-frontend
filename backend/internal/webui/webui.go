// Package webui serves the frontend from untisd itself: the "web
// edition", which runs wherever Go runs (including the BSDs, which the
// Tauri desktop shell does not support).
//
// The frontend is embedded at build time: `make web` copies
// desktop/dist into dist/ before compiling. Without it a short page
// explains how to build the frontend.
package webui

import (
	"bytes"
	"embed"
	"html"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var embedded embed.FS

// Files returns the embedded frontend (rooted at dist/).
func Files() fs.FS {
	sub, err := fs.Sub(embedded, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}

// Available reports whether a built frontend is embedded.
func Available(files fs.FS) bool {
	_, err := fs.Stat(files, "index.html")
	return err == nil
}

const placeholder = `<!doctype html><html><head><meta charset="utf-8"><title>Untis</title></head>
<body style="font-family:system-ui;max-width:40em;margin:4em auto;line-height:1.5">
<h1>The web interface is not included in this build</h1>
<p>Build it with <code>make web</code>, which embeds the frontend into <code>untisd</code>.</p>
</body></html>`

// Handler serves the frontend. The API token is placed into index.html
// as <meta name="untis-token">; the page is same-origin with the API,
// and other origins cannot read it (no CORS headers, Host check).
func Handler(files fs.FS, token string) http.Handler {
	fileServer := http.FileServer(http.FS(files))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" || name == "index.html" {
			serveIndex(w, files, token)
			return
		}
		if _, err := fs.Stat(files, name); err != nil {
			// The app uses a hash router, so any unknown path is a 404.
			http.NotFound(w, r)
			return
		}
		if strings.HasPrefix(name, "assets/") {
			// Vite puts content hashes into asset names.
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		fileServer.ServeHTTP(w, r)
	})
}

func serveIndex(w http.ResponseWriter, files fs.FS, token string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Frame-Options", "DENY")
	page, err := fs.ReadFile(files, "index.html")
	if err != nil {
		_, _ = w.Write([]byte(placeholder))
		return
	}
	meta := []byte(`<meta name="untis-token" content="` + html.EscapeString(token) + `">`)
	if i := bytes.Index(page, []byte("</head>")); i >= 0 {
		page = append(page[:i:i], append(meta, page[i:]...)...)
	} else {
		page = append(meta, page...)
	}
	_, _ = w.Write(page)
}
