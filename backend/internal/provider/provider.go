// Package provider defines where timetable data comes from.
//
// A Provider turns a date window into a domain.Snapshot. The CLI provider
// drives the installed untis binary; the sample provider fabricates a
// believable, fully fictional school week for demos and development.
package provider

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/seesee010/webuntis-frontend/backend/internal/domain"
)

// Query selects the date window of a snapshot. Dates are inclusive and
// only their calendar day matters.
type Query struct {
	From time.Time
	To   time.Time
	// Fresh asks the provider to bypass any cache it may have.
	Fresh bool
}

// Days returns the number of calendar days in the window.
func (q Query) Days() int {
	return int(q.To.Sub(q.From).Hours()/24) + 1
}

// Provider is a source of timetable data.
type Provider interface {
	// Name identifies the provider, e.g. "sample" or "cli".
	Name() string
	// Snapshot returns all data for the window.
	Snapshot(ctx context.Context, q Query) (*domain.Snapshot, error)
	// Who explains a short code (subject, teacher, room or class).
	Who(ctx context.Context, code string) ([]domain.Lookup, error)
}

// Kind classifies provider errors so the GUI can react to them, e.g. by
// pointing to the setup instead of showing a stack trace.
type Kind string

const (
	KindConfig      Kind = "config"      // missing config, CLI not installed
	KindLogin       Kind = "login"       // credentials rejected
	KindUnreachable Kind = "unreachable" // network / WebUntis error
	KindNotFound    Kind = "not-found"   // lookup without match
	KindNoSchool    Kind = "no-school"   // no lessons that day
	KindCancelled   Kind = "cancelled"   // context cancelled / timeout
	KindInternal    Kind = "internal"    // anything else
)

// Error is a classified provider error.
type Error struct {
	Kind Kind
	Msg  string
	Err  error
}

func (e *Error) Error() string {
	if e.Err != nil && e.Msg == "" {
		return e.Err.Error()
	}
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Msg, e.Err)
	}
	return e.Msg
}

func (e *Error) Unwrap() error { return e.Err }

// Errorf creates a classified error.
func Errorf(kind Kind, format string, args ...any) error {
	return &Error{Kind: kind, Msg: fmt.Sprintf(format, args...)}
}

// KindOf returns the kind of err, KindInternal for unclassified errors.
func KindOf(err error) Kind {
	var pe *Error
	if errors.As(err, &pe) {
		return pe.Kind
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return KindCancelled
	}
	return KindInternal
}
