package update

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
)

// The repository whose releases the app is updated from.
const (
	Owner = "seesee010"
	Repo  = "webuntis-frontend"
)

// SourceEnv replaces GitHub by another server, for testing the updater
// against a local fake. The server must speak https unless it is on the
// loopback interface.
const SourceEnv = "UNTISD_UPDATE_URL"

// Source is where releases come from.
type Source struct {
	API      string // base of the releases API
	Download string // base of the release pages and files
}

// GitHub is the real source.
var GitHub = Source{API: "https://api.github.com", Download: "https://github.com"}

// SourceFrom returns GitHub, or the server named by SourceEnv.
func SourceFrom(getenv func(string) string) (Source, error) {
	raw := strings.TrimRight(getenv(SourceEnv), "/")
	if raw == "" {
		return GitHub, nil
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return GitHub, fmt.Errorf("%s is not a URL: %q", SourceEnv, raw)
	}
	if !safeURL(u) {
		return GitHub, fmt.Errorf("%s must be https, or http on the loopback interface: %q", SourceEnv, raw)
	}
	return Source{API: raw, Download: raw}, nil
}

// safeURL allows https everywhere and plain http only to this machine.
func safeURL(u *url.URL) bool {
	switch u.Scheme {
	case "https":
		return true
	case "http":
		host := u.Hostname()
		if host == "localhost" {
			return true
		}
		ip := net.ParseIP(host)
		return ip != nil && ip.IsLoopback()
	}
	return false
}

func (s Source) latestURL() string {
	return s.API + "/repos/" + Owner + "/" + Repo + "/releases/latest"
}

// PageURL is the release page of a tag.
func (s Source) PageURL(tag string) string {
	return s.Download + "/" + Owner + "/" + Repo + "/releases/tag/" + url.PathEscape(tag)
}

// AssetURL is the download address of one file of a release. It is built
// from the tag and the file name instead of being read from the API
// answer, so a download can only ever come from this repository.
func (s Source) AssetURL(tag, name string) string {
	return s.Download + "/" + Owner + "/" + Repo + "/releases/download/" + url.PathEscape(tag) + "/" + url.PathEscape(name)
}

// Release is a published release.
type Release struct {
	Version Version
	Tag     string
	Assets  map[string]int64 // file name -> size in bytes
}

// client talks to the release source.
type client struct {
	http *http.Client
	src  Source
	ua   string

	// The last answer, reused when the server says nothing changed. A
	// conditional request does not count against GitHub's rate limit.
	etag   string
	cached *Release
}

func newClient(base *http.Client, src Source, version string) *client {
	if base == nil {
		base = &http.Client{}
	}
	c := *base
	// Downloads are redirected to a storage host. Follow that, but never
	// onto an unencrypted connection.
	c.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return errors.New("too many redirects")
		}
		if !safeURL(req.URL) {
			return fmt.Errorf("refusing redirect to %s", req.URL.Redacted())
		}
		return nil
	}
	return &client{http: &c, src: src, ua: "untis-gui/" + version + " (+https://github.com/" + Owner + "/" + Repo + ")"}
}

func (c *client) get(ctx context.Context, rawURL string, header map[string]string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.ua)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	return c.http.Do(req)
}

// errNoRelease means the repository has no published release (yet).
var errNoRelease = errors.New("no published release")

// latest returns the newest published release. Drafts and pre-releases
// are not "latest" for GitHub and are skipped here as well.
func (c *client) latest(ctx context.Context) (*Release, error) {
	header := map[string]string{"Accept": "application/vnd.github+json"}
	if c.etag != "" && c.cached != nil {
		header["If-None-Match"] = c.etag
	}
	res, err := c.get(ctx, c.src.latestURL(), header)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case http.StatusOK:
	case http.StatusNotModified:
		if c.cached != nil {
			return c.cached, nil
		}
		return nil, errors.New("release source answered 304 without a cached release")
	case http.StatusNotFound:
		return nil, errNoRelease
	default:
		return nil, fmt.Errorf("release source answered %s", res.Status)
	}

	var body struct {
		TagName    string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
		Assets     []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(&body); err != nil {
		return nil, fmt.Errorf("unexpected answer of the release source: %w", err)
	}
	if body.Draft || body.Prerelease {
		return nil, errNoRelease
	}
	v, ok := ParseVersion(body.TagName)
	if !ok {
		return nil, fmt.Errorf("release tag %q is not a version", body.TagName)
	}
	rel := &Release{Version: v, Tag: body.TagName, Assets: map[string]int64{}}
	for _, a := range body.Assets {
		rel.Assets[a.Name] = a.Size
	}
	c.etag, c.cached = res.Header.Get("ETag"), rel
	return rel, nil
}
