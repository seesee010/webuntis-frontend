package api

import (
	"net"
	"net/http"
	"strings"
)

// LoopbackHostOnly rejects requests whose Host header is not a loopback
// name. The server only listens on loopback, but a web page could still
// reach it through DNS rebinding (evil.example resolving to 127.0.0.1);
// such requests carry the attacker's host name and are refused here.
func LoopbackHostOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !loopbackHost(r.Host) {
			writeError(w, http.StatusMisdirectedRequest, "bad-host", "only loopback host names are accepted")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func loopbackHost(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
