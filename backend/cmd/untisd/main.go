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
	"os/signal"
	"syscall"
	"time"

	"github.com/seesee010/webuntis-frontend/backend/internal/api"
	"github.com/seesee010/webuntis-frontend/backend/internal/events"
	"github.com/seesee010/webuntis-frontend/backend/internal/provider"
	"github.com/seesee010/webuntis-frontend/backend/internal/provider/cli"
	"github.com/seesee010/webuntis-frontend/backend/internal/provider/sample"
	"github.com/seesee010/webuntis-frontend/backend/internal/service"
	"github.com/seesee010/webuntis-frontend/backend/internal/settings"
)

var version = "dev"

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
	)
	flag.Parse()

	if *showVersion {
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

	svc := service.New(store, newProvider, events.NewBus(), log)
	handler := api.New(api.Config{Token: *token, Version: version, Origins: api.DefaultOrigins}, svc, store, log)

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

	go svc.Run(ctx)
	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()

	select {
	case <-ctx.Done():
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return srv.Shutdown(shutdown)
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
