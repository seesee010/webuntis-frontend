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
)

// Event is one message on the bus.
type Event struct {
	Type string    `json:"type"`
	At   time.Time `json:"at"`
	Data any       `json:"data,omitempty"`
}

// Bus fans events out to all subscribers. Slow subscribers lose events
// instead of blocking the publisher.
type Bus struct {
	mu   sync.Mutex
	next int
	subs map[int]chan Event
}

// NewBus creates an empty bus.
func NewBus() *Bus { return &Bus{subs: map[int]chan Event{}} }

// Subscribe returns a channel of events and a function that ends the
// subscription and closes the channel.
func (b *Bus) Subscribe(buffer int) (<-chan Event, func()) {
	ch := make(chan Event, buffer)
	b.mu.Lock()
	id := b.next
	b.next++
	b.subs[id] = ch
	b.mu.Unlock()

	var once sync.Once
	return ch, func() {
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
	for _, ch := range b.subs {
		select {
		case ch <- ev:
		default: // subscriber is not keeping up; drop
		}
	}
}
