package settings

import (
	"encoding/json"
	"time"
)

// Backend is the part of the settings the backend itself acts on. It is
// stored under the "backend" key; missing values fall back to defaults.
type Backend struct {
	// Provider is "sample" or "cli".
	Provider string `json:"provider"`
	// RefreshMinutes is how often data is refetched in the background;
	// 0 disables automatic refreshes.
	RefreshMinutes int `json:"refreshMinutes"`
	// DaysBack / DaysAhead span the overview window used for the
	// dashboard, exams, homework and absences (relative to today).
	DaysBack  int `json:"daysBack"`
	DaysAhead int `json:"daysAhead"`
	// DetectChanges diffs consecutive snapshots and emits change events.
	DetectChanges bool `json:"detectChanges"`

	Sample SampleOptions `json:"sample"`
	CLI    CLIOptions    `json:"cli"`
}

// SampleOptions configure the sample provider.
type SampleOptions struct {
	LatencyMs int `json:"latencyMs"`
}

// CLIOptions configure the untis CLI provider.
type CLIOptions struct {
	Binary     string   `json:"binary"`
	ConfigPath string   `json:"configPath"`
	EnvPath    string   `json:"envPath"`
	Transport  string   `json:"transport"`
	MaxAge     string   `json:"maxAge"`
	Offline    bool     `json:"offline"`
	ExtraArgs  []string `json:"extraArgs"`
	TimeoutSec int      `json:"timeoutSec"`
}

// DefaultBackend returns the defaults used for every missing value.
func DefaultBackend() Backend {
	return Backend{
		Provider:       "sample",
		RefreshMinutes: 10,
		DaysBack:       30,
		DaysAhead:      60,
		DetectChanges:  true,
		CLI: CLIOptions{
			Binary:     "untis",
			Transport:  "auto",
			MaxAge:     "5m",
			ExtraArgs:  []string{},
			TimeoutSec: 120,
		},
	}
}

// Timeout returns the CLI timeout as a duration.
func (o CLIOptions) Timeout() time.Duration { return time.Duration(o.TimeoutSec) * time.Second }

// Backend returns the backend settings merged over the defaults.
func (s *Store) Backend() Backend {
	return BackendFrom(s.Get())
}

// BackendFrom extracts the backend settings of a document.
func BackendFrom(doc Document) Backend {
	b := DefaultBackend()
	if raw, ok := doc["backend"]; ok {
		// Decoding over the defaults keeps every field that is missing.
		if data, err := json.Marshal(raw); err == nil {
			_ = json.Unmarshal(data, &b)
		}
	}
	if b.Provider != "cli" {
		b.Provider = "sample"
	}
	if b.RefreshMinutes < 0 {
		b.RefreshMinutes = 0
	}
	if b.DaysBack < 0 {
		b.DaysBack = 0
	}
	if b.DaysAhead < 1 {
		b.DaysAhead = 1
	}
	if b.CLI.Binary == "" {
		b.CLI.Binary = "untis"
	}
	if b.CLI.TimeoutSec <= 0 {
		b.CLI.TimeoutSec = 120
	}
	if b.CLI.ExtraArgs == nil {
		b.CLI.ExtraArgs = []string{}
	}
	return b
}
