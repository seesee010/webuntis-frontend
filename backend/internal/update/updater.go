package update

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// State of the updater, as shown by the frontend.
type State string

const (
	StateIdle        State = "idle"        // no newer release known
	StateAvailable   State = "available"   // a newer release exists: show the button
	StateDownloading State = "downloading" // the user pressed the button
	StateDone        State = "done"        // installed or handed over, see Result
	StateFailed      State = "failed"      // the update did not work; the button stays
)

// How an installed update takes effect.
const (
	RestartApp    = "app"    // the desktop shell restarts itself
	RestartServer = "server" // untisd -web restarts itself
	RestartManual = "manual" // the user has to start the program again
)

// Result says what pressing the button did.
type Result struct {
	Action Action `json:"action"`
	// File is the downloaded installer or package (run, save).
	File string `json:"file,omitempty"`
	// Command installs the package (save).
	Command string `json:"command,omitempty"`
	// Restart is set when the new version is in place (replace).
	Restart string `json:"restart,omitempty"`
}

// Status is the updater's state for the frontend.
type Status struct {
	Current   string  `json:"current"`
	Supported bool    `json:"supported"` // false for development builds
	Enabled   bool    `json:"enabled"`   // automatic checks
	State     State   `json:"state"`
	Kind      Kind    `json:"kind"`
	Latest    string  `json:"latest,omitempty"`
	URL       string  `json:"url,omitempty"`    // release page of Latest
	Action    Action  `json:"action,omitempty"` // what the button will do
	Asset     string  `json:"asset,omitempty"`  // the file it will download
	Size      int64   `json:"size,omitempty"`
	Done      int64   `json:"done,omitempty"` // bytes downloaded so far
	Result    *Result `json:"result,omitempty"`
	Error     string  `json:"error,omitempty"` // why the update failed
	// CheckedAt and CheckError describe the last look at the releases. A
	// failed check is not an error for the user: no button, no banner.
	CheckedAt  *time.Time `json:"checkedAt"`
	CheckError string     `json:"checkError,omitempty"`
}

// Config of an Updater.
type Config struct {
	Version string // running version
	Install Install
	Source  Source
	HTTP    *http.Client
	// Enabled reports whether automatic checks are allowed right now.
	Enabled func() bool
	// Open opens a file or URL with the system's default program.
	Open func(target string) error
	// DownloadsDir is where installers and packages are saved.
	DownloadsDir func() (string, error)
	// CanRestart says whether the web edition can restart itself.
	CanRestart bool
	// Publish is called with every new status.
	Publish func(Status)
	Log     *slog.Logger
	Now     func() time.Time
	// FirstCheck is the delay before the first check, Interval the time
	// between checks.
	FirstCheck, Interval time.Duration
}

// Updater checks for releases and applies one on request.
type Updater struct {
	cfg     Config
	current Version
	ok      bool // current is a release version
	client  *client
	kick    chan struct{}

	checkMu sync.Mutex // one check at a time; guards client's cache

	mu          sync.Mutex
	st          Status
	rel         *Release
	lastPublish time.Time
}

// New creates an updater. It does nothing until Run, Check or Apply.
func New(cfg Config) *Updater {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.Log == nil {
		cfg.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if cfg.Enabled == nil {
		cfg.Enabled = func() bool { return true }
	}
	if cfg.DownloadsDir == nil {
		cfg.DownloadsDir = DownloadsDir
	}
	if cfg.Source == (Source{}) {
		cfg.Source = GitHub
	}
	if cfg.FirstCheck <= 0 {
		cfg.FirstCheck = 10 * time.Second
	}
	if cfg.Interval <= 0 {
		cfg.Interval = 24 * time.Hour
	}
	u := &Updater{cfg: cfg, kick: make(chan struct{}, 1), client: newClient(cfg.HTTP, cfg.Source, cfg.Version)}
	u.current, u.ok = ParseVersion(cfg.Version)
	u.st = Status{Current: cfg.Version, Supported: u.ok, State: StateIdle, Kind: cfg.Install.Kind}
	return u
}

// Status returns the current state.
func (u *Updater) Status() Status {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.status()
}

func (u *Updater) status() Status {
	st := u.st
	st.Enabled = u.cfg.Enabled()
	if st.Result != nil {
		r := *st.Result
		st.Result = &r
	}
	return st
}

// set changes the state under the lock and publishes it.
func (u *Updater) set(change func(*Status)) Status {
	u.mu.Lock()
	change(&u.st)
	st := u.status()
	u.lastPublish = u.cfg.Now()
	u.mu.Unlock()
	if u.cfg.Publish != nil {
		u.cfg.Publish(st)
	}
	return st
}

// Run checks shortly after start and then once per interval, as long as
// the setting allows it, until ctx ends.
func (u *Updater) Run(ctx context.Context) {
	if !u.ok {
		return
	}
	timer := time.NewTimer(u.cfg.FirstCheck)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-u.kick:
		case <-timer.C:
		}
		if u.cfg.Enabled() {
			u.Check(ctx)
		}
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timer.Reset(u.cfg.Interval)
	}
}

// SettingsChanged follows the "check for updates" setting: switching it
// on checks right away, switching it off forgets a pending update, so the
// button disappears.
func (u *Updater) SettingsChanged() {
	if u.cfg.Enabled() {
		u.mu.Lock()
		never := u.st.CheckedAt == nil
		u.mu.Unlock()
		if never {
			select {
			case u.kick <- struct{}{}:
			default:
			}
		}
		return
	}
	u.mu.Lock()
	pending := u.st.State == StateAvailable || u.st.State == StateFailed
	u.mu.Unlock()
	if pending {
		u.set(func(st *Status) {
			u.rel = nil
			*st = Status{Current: st.Current, Supported: st.Supported, State: StateIdle, Kind: st.Kind}
		})
	} else if u.cfg.Publish != nil {
		u.cfg.Publish(u.Status())
	}
}

// Check asks the release source now and returns the new status. It is
// what the periodic check and the "check now" button run.
func (u *Updater) Check(ctx context.Context) Status {
	if !u.ok {
		return u.Status()
	}
	u.checkMu.Lock()
	defer u.checkMu.Unlock()
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	rel, err := u.client.latest(ctx)
	now := u.cfg.Now()

	if err != nil && !errors.Is(err, errNoRelease) {
		u.cfg.Log.Debug("update check failed", "err", err)
		return u.set(func(st *Status) { st.CheckedAt, st.CheckError = &now, err.Error() })
	}
	return u.set(func(st *Status) {
		st.CheckedAt, st.CheckError = &now, ""
		if st.State == StateDownloading || st.State == StateDone {
			return // an update is under way; do not change it under the user
		}
		if rel == nil || !u.current.Less(rel.Version) {
			u.rel = nil
			*st = Status{Current: st.Current, Supported: true, State: StateIdle, Kind: st.Kind, CheckedAt: st.CheckedAt}
			return
		}
		if u.rel == nil || u.rel.Version != rel.Version {
			st.Error = "" // a newer release than the one that failed
			st.State = StateAvailable
		}
		u.rel = rel
		st.Latest, st.URL = rel.Version.String(), u.cfg.Source.PageURL(rel.Tag)
		st.Asset, st.Size, st.Action = "", 0, ActionPage
		if name := u.cfg.Install.Asset(rel.Version); name != "" {
			if size, ok := rel.Assets[name]; ok {
				st.Asset, st.Size, st.Action = name, size, u.cfg.Install.Action()
			}
		}
		if st.State == StateIdle {
			st.State = StateAvailable
		}
	})
}

// ErrNothingToDo is returned when no update is available.
var ErrNothingToDo = errors.New("no update is available")

// ErrBusy is returned while an update is being downloaded.
var ErrBusy = errors.New("an update is already in progress")

// OpenPage opens the release page of the available version.
func (u *Updater) OpenPage() error {
	u.mu.Lock()
	url := u.st.URL
	u.mu.Unlock()
	if url == "" {
		return ErrNothingToDo
	}
	if u.cfg.Open == nil {
		return errors.New("cannot open a browser here")
	}
	return u.cfg.Open(url)
}

// Apply is the update button. It returns once the update has started;
// progress and the outcome arrive through Publish and Status.
func (u *Updater) Apply(ctx context.Context) error {
	u.mu.Lock()
	rel, state, action, asset := u.rel, u.st.State, u.st.Action, u.st.Asset
	if rel == nil || state == StateIdle {
		u.mu.Unlock()
		return ErrNothingToDo
	}
	if state == StateDownloading {
		u.mu.Unlock()
		return ErrBusy
	}
	if action == ActionPage || asset == "" {
		u.mu.Unlock()
		return u.OpenPage()
	}
	u.st.State, u.st.Done, u.st.Error, u.st.Result = StateDownloading, 0, "", nil
	u.mu.Unlock()
	u.set(func(*Status) {})

	go func() {
		ctx, cancel := context.WithTimeout(ctx, 30*time.Minute)
		defer cancel()
		res, err := u.install(ctx, rel, asset, action)
		if err != nil {
			u.cfg.Log.Warn("update failed", "asset", asset, "err", err)
			u.set(func(st *Status) { st.State, st.Error, st.Done = StateFailed, err.Error(), 0 })
			return
		}
		u.cfg.Log.Info("update applied", "asset", asset, "action", action)
		u.set(func(st *Status) { st.State, st.Result, st.Done = StateDone, res, st.Size })
	}()
	return nil
}

// install downloads asset, verifies it and does what action says.
func (u *Updater) install(ctx context.Context, rel *Release, asset string, action Action) (*Result, error) {
	in := u.cfg.Install
	dir := filepath.Dir(in.Exe)
	switch {
	case in.Kind == KindAppImage:
		dir = filepath.Dir(in.AppImage)
	case action != ActionReplace:
		d, err := u.cfg.DownloadsDir()
		if err != nil {
			return nil, fmt.Errorf("no folder to download to: %w", err)
		}
		dir = d
	}

	tmp, err := newTemp(dir)
	if err != nil {
		return nil, err
	}
	keep := false
	defer func() {
		_ = tmp.Close()
		if !keep {
			_ = os.Remove(tmp.Name())
		}
	}()
	err = u.client.download(ctx, rel, asset, tmp, func(done int64) {
		u.mu.Lock()
		u.st.Done = done
		due := u.cfg.Now().Sub(u.lastPublish) >= 200*time.Millisecond
		u.mu.Unlock()
		if due {
			u.set(func(*Status) {})
		}
	})
	if err != nil {
		return nil, err
	}
	if err := tmp.Close(); err != nil {
		return nil, err
	}

	res := &Result{Action: action}
	switch action {
	case ActionReplace:
		var files []placement
		switch in.Kind {
		case KindAppImage:
			if err := os.Chmod(tmp.Name(), 0o755); err != nil {
				return nil, err
			}
			files, keep = []placement{{tmp.Name(), in.AppImage}}, true
		case KindWeb:
			files, err = extract(tmp.Name(), isZip(asset), map[string]string{backendName(in.OS): in.Exe})
		case KindPortable:
			files, err = extract(tmp.Name(), isZip(asset), map[string]string{
				backendName(in.OS): in.Exe,
				shellName(in.OS):   filepath.Join(dir, shellName(in.OS)),
			})
		default:
			err = fmt.Errorf("cannot replace a %s installation", in.Kind)
		}
		if err != nil {
			return nil, err
		}
		if err := place(files); err != nil {
			return nil, err
		}
		res.Restart = RestartApp
		if in.Kind == KindWeb {
			res.Restart = RestartManual
			if u.cfg.CanRestart {
				res.Restart = RestartServer
			}
		}
	case ActionRun, ActionSave:
		file := filepath.Join(dir, asset)
		if err := os.Rename(tmp.Name(), file); err != nil {
			return nil, err
		}
		keep = true
		res.File = file
		if action == ActionSave {
			res.Command = installCommand(in.Kind, file)
			break
		}
		if u.cfg.Open == nil {
			return nil, fmt.Errorf("saved %s, but cannot open it here", file)
		}
		if err := u.cfg.Open(file); err != nil {
			return nil, fmt.Errorf("saved %s, but could not open it: %w", file, err)
		}
	default:
		return nil, fmt.Errorf("unknown update action %q", action)
	}
	return res, nil
}

func isZip(asset string) bool { return filepath.Ext(asset) == ".zip" }
