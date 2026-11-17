// Package events is a small in-process publish/subscribe bus. The API
// forwards it to the frontend as server-sent events.
package events

import (
	"sync"
	"time"
)

// Event types published by the backend.
const (
	TypeSnapshot = "snapshot" // new overview data is available
	TypeChanges  = "changes"  // the timetable changed since the last refresh
	TypeError    = "error"    // a background refresh failed
	TypeSettings = "settings" // the settings document changed
	TypeProvider = "provider" // the data source was switched
	TypeUpdate   = "update"   // the updater has news: a release, progress, a result
)

// Event is one message on the bus.
type Event struct {
	// ID is set on events a client must not miss (changes) and is sent as
	// the server-sent event id, so a client can ask for what it missed.
	ID   int64     `json:"-"`
	Type string    `json:"type"`
	At   time.Time `json:"at"`
	Data any       `json:"data,omitempty"`
}

// ReplayLimit is how many change events the bus keeps for clients that
// were not connected when they were published.
const ReplayLimit = 50

// Bus fans events out to all subscribers. Slow subscribers lose events
// instead of blocking the publisher. Change events are also kept, so a
// client that connects later can catch up (SubscribeSince).
type Bus struct {
	mu   sync.Mutex
	next int
	subs map[int]chan Event
	// lastID is the id of the last change event. It starts at the process
	// start time, so ids keep growing across restarts and a client's id
	// from before a restart still compares correctly.
	lastID int64
	recent []Event // the last ReplayLimit change events, oldest first
}

// NewBus creates an empty bus.
func NewBus() *Bus {
	return &Bus{subs: map[int]chan Event{}, lastID: time.Now().UnixMilli() * 1000}
}

// Subscribe returns a channel of events and a function that ends the
// subscription and closes the channel.
func (b *Bus) Subscribe(buffer int) (<-chan Event, func()) {
	_, ch, cancel := b.SubscribeSince(0, buffer)
	return ch, cancel
}

// SubscribeSince is Subscribe for a client that has seen the change event
// with id since: it also returns the change events published after it,
// which the client missed while it was not connected. since 0 means the
// client has seen none and gets no history. The replay and the
// subscription are taken under one lock, so no event is lost or doubled
// between them.
func (b *Bus) SubscribeSince(since int64, buffer int) ([]Event, <-chan Event, func()) {
	ch := make(chan Event, buffer)
	b.mu.Lock()
	var missed []Event
	if since > 0 {
		for _, ev := range b.recent {
			if ev.ID > since {
				missed = append(missed, ev)
			}
		}
	}
	id := b.next
	b.next++
	b.subs[id] = ch
	b.mu.Unlock()

	var once sync.Once
	return missed, ch, func() {
		once.Do(func() {
			b.mu.Lock()
			delete(b.subs, id)
			b.mu.Unlock()
			close(ch)
		})
	}
}

// Publish sends an event to every subscriber.
func (b *Bus) Publish(typ string, data any) {
	ev := Event{Type: typ, At: time.Now(), Data: data}
	b.mu.Lock()
	defer b.mu.Unlock()
	if typ == TypeChanges {
		b.lastID++
		ev.ID = b.lastID
		b.recent = append(b.recent, ev)
		if len(b.recent) > ReplayLimit {
			b.recent = append([]Event(nil), b.recent[len(b.recent)-ReplayLimit:]...)
		}
	}
	for _, ch := range b.subs {
		select {
		case ch <- ev:
		default: // subscriber is not keeping up; drop
		}
	}
}
