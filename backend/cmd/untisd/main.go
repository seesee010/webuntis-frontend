// Command untisd is the local backend of the untis desktop GUI.
//
// It drives the untis CLI (or a built-in sample data provider) and
// serves the results to the frontend over a loopback-only HTTP API.
//
// On start it prints one JSON line to stdout,
//
//	{"port": 41234, "token": "…", "version": "…"}
//
// which the desktop shell reads to connect the frontend.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/seesee010/webuntis-frontend/backend/internal/api"
	"github.com/seesee010/webuntis-frontend/backend/internal/events"
	"github.com/seesee010/webuntis-frontend/backend/internal/provider"
	"github.com/seesee010/webuntis-frontend/backend/internal/provider/cli"
	"github.com/seesee010/webuntis-frontend/backend/internal/provider/sample"
	"github.com/seesee010/webuntis-frontend/backend/internal/service"
	"github.com/seesee010/webuntis-frontend/backend/internal/settings"
	"github.com/seesee010/webuntis-frontend/backend/internal/update"
	"github.com/seesee010/webuntis-frontend/backend/internal/webui"
)

var version = "dev"

// webTarget is the "GOOS-ARCH" suffix of the web edition archive this
// binary was released in, e.g. "linux-armv7". scripts/release.sh stamps
// it; the updater uses it to fetch the same archive of a newer release.
// It is empty for the desktop sidecar and for builds from source.
var webTarget = ""

// A web edition that restarts itself after an update hands its address
// and token to the new process through these, so the open browser tab
// keeps working. The environment is used because, unlike the command
// line, other users of the machine cannot read it.
const (
	resumeAddrEnv  = "UNTISD_RESUME_ADDR"
	resumeTokenEnv = "UNTISD_RESUME_TOKEN"
)

// Fixed address and token of -dev mode, which the Vite dev server uses
// when the frontend runs in a plain browser without the Tauri shell.
const (
	devAddr  = "127.0.0.1:47800"
	devToken = "dev"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "untisd:", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		addr         = flag.String("addr", "127.0.0.1:0", "listen address (loopback only)")
		token        = flag.String("token", "", "API token (random if empty)")
		settingsPath = flag.String("settings", "", "settings file (default: user config dir)")
		dev          = flag.Bool("dev", false, "development mode: fixed address "+devAddr+" and token \""+devToken+"\"")
		watchStdin   = flag.Bool("watch-stdin", false, "exit when stdin is closed (used by the desktop shell)")
		verbose      = flag.Bool("v", false, "debug logging")
		showVersion  = flag.Bool("version", false, "print the version and exit")
		web          = flag.Bool("web", false, "web edition: also serve the user interface and open it in the browser")
		noBrowser    = flag.Bool("no-browser", false, "with -web: do not open the browser")
	)
	flag.Parse()

	if *showVersion {
		if webTarget != "" {
			fmt.Printf("untisd %s (web %s)\n", version, webTarget)
			return nil
		}
		fmt.Println("untisd", version)
		return nil
	}

	level := slog.LevelInfo
	if *verbose {
		level = slog.LevelDebug
	}
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))

	if *dev {
		*addr, *token = devAddr, devToken
	}
	if a, t := os.Getenv(resumeAddrEnv), os.Getenv(resumeTokenEnv); a != "" && t != "" {
		*addr, *token, *noBrowser = a, t, true
	}
	_ = os.Unsetenv(resumeAddrEnv)
	_ = os.Unsetenv(resumeTokenEnv)
	if *token == "" {
		*token = randomToken()
	}
	if err := loopbackOnly(*addr); err != nil {
		return err
	}

	path := *settingsPath
	if path == "" {
		p, err := settings.DefaultPath()
		if err != nil {
			return err
		}
		path = p
	}
	store, err := settings.Open(path)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if *watchStdin {
		ctx = exitWithStdin(ctx)
	}

	bus := events.NewBus()
	svc := service.New(store, newProvider, bus, log)

	install := update.Detect(update.OSEnv(*web, webTarget))
	update.RemoveLeftovers(install)
	source, err := update.SourceFrom(os.Getenv)
	if err != nil {
		log.Warn("ignoring the update source override", "err", err)
	}
	updater := update.New(update.Config{
		Version: version, Install: install, Source: source,
		Enabled:    func() bool { return settings.UpdateCheck(store.Get()) },
		Open:       openBrowser,
		CanRestart: *web && canReexec,
		Publish:    func(st update.Status) { bus.Publish(events.TypeUpdate, st) },
		Log:        log,
	})
	store.Subscribe(func(settings.Document) { updater.SettingsChanged() })

	restart := make(chan struct{}, 1)
	apiCfg := api.Config{Token: *token, Version: version, Origins: api.DefaultOrigins, Updater: updater}
	if *web && canReexec {
		apiCfg.Restart = func() error {
			select {
			case restart <- struct{}{}:
			default:
			}
			return nil
		}
	}
	handler := api.New(apiCfg, svc, store, log)
	if *web {
		handler = withUI(handler, *token)
	}
	handler = api.LoopbackHostOnly(handler)

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		return err
	}
	srv := &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second}

	hello, _ := json.Marshal(map[string]any{
		"port": ln.Addr().(*net.TCPAddr).Port, "token": *token, "version": version,
	})
	fmt.Println(string(hello))
	log.Info("listening", "addr", ln.Addr().String(), "settings", path, "provider", svc.Status().Provider)
	if *web {
		url := fmt.Sprintf("http://127.0.0.1:%d/", ln.Addr().(*net.TCPAddr).Port)
		fmt.Fprintln(os.Stderr, "untisd: web interface at", url)
		if !*noBrowser {
			if err := openBrowser(url); err != nil {
				log.Warn("could not open the browser", "err", err)
			}
		}
	}

	go svc.Run(ctx)
	go updater.Run(ctx)
	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()

	restarting := false
	select {
	case <-ctx.Done():
	case <-restart:
		restarting = true
		// Let the answer to the restart request reach the browser.
		time.Sleep(200 * time.Millisecond)
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	}
	stop() // ends the refresh loop and any running CLI call
	shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	err = srv.Shutdown(shutdown)
	if !restarting {
		return err
	}
	// The event stream never ends on its own, so Shutdown times out;
	// close what is left and start the new version on the same address.
	_ = srv.Close()
	log.Info("restarting into the updated version", "exe", install.Exe)
	return reexec(install.Exe, []string{resumeAddrEnv + "=" + ln.Addr().String(), resumeTokenEnv + "=" + *token})
}

// withUI serves the API under /api/ and the embedded frontend elsewhere.
func withUI(apiHandler http.Handler, token string) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/api/", apiHandler)
	mux.Handle("/", webui.Handler(webui.Files(), token))
	return mux
}

// browserCommand returns the program that opens a URL on this OS.
func browserCommand(goos, url string) (string, []string) {
	switch goos {
	case "windows":
		return "rundll32", []string{"url.dll,FileProtocolHandler", url}
	case "darwin":
		return "open", []string{url}
	default: // Linux and the BSDs
		return "xdg-open", []string{url}
	}
}

func openBrowser(url string) error {
	name, args := browserCommand(runtime.GOOS, url)
	return exec.Command(name, args...).Start()
}

// newProvider builds the provider selected in the settings.
func newProvider(b settings.Backend) provider.Provider {
	if b.Provider == "cli" {
		return cli.New(cli.Config{
			Binary:     b.CLI.Binary,
			ConfigPath: b.CLI.ConfigPath,
			EnvPath:    b.CLI.EnvPath,
			Transport:  b.CLI.Transport,
			MaxAge:     b.CLI.MaxAge,
			Offline:    b.CLI.Offline,
			ExtraArgs:  b.CLI.ExtraArgs,
			Timeout:    b.CLI.Timeout(),
		}, nil)
	}
	return sample.New(sample.WithLatency(time.Duration(b.Sample.LatencyMs) * time.Millisecond))
}

func randomToken() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

// loopbackOnly refuses to expose the user's timetable to the network.
func loopbackOnly(addr string) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return err
	}
	if host == "localhost" {
		return nil
	}
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("refusing to listen on %s: only loopback addresses are allowed", addr)
	}
	return nil
}

// exitWithStdin cancels the context when stdin reaches EOF, i.e. when
// the desktop shell that started us is gone.
func exitWithStdin(parent context.Context) context.Context {
	ctx, cancel := context.WithCancel(parent)
	go func() {
		_, _ = io.Copy(io.Discard, os.Stdin)
		cancel()
	}()
	return ctx
}
