package events

import (
	"testing"
	"time"
)

func TestPublishSubscribe(t *testing.T) {
	b := NewBus()
	a, cancelA := b.Subscribe(1)
	c, cancelC := b.Subscribe(1)
	defer cancelC()

	b.Publish(TypeSnapshot, 1)
	if ev := <-a; ev.Type != TypeSnapshot || ev.Data != 1 {
		t.Errorf("a got %+v", ev)
	}
	if ev := <-c; ev.Type != TypeSnapshot {
		t.Errorf("c got %+v", ev)
	}

	cancelA()
	cancelA() // idempotent
	if _, ok := <-a; ok {
		t.Error("channel not closed after cancel")
	}

	// A full subscriber must not block the publisher.
	b.Publish(TypeError, nil)
	b.Publish(TypeError, nil)
}

// ids returns the ids of evs and checks they are change events.
func ids(t *testing.T, evs []Event) []int64 {
	t.Helper()
	out := []int64{}
	for _, ev := range evs {
		if ev.Type != TypeChanges || ev.ID == 0 {
			t.Errorf("replayed %+v", ev)
		}
		out = append(out, ev.ID)
	}
	return out
}

func TestChangesAreKeptForClientsThatWereAway(t *testing.T) {
	b := NewBus()
	b.Publish(TypeChanges, "first") // nobody is connected
	b.Publish(TypeSnapshot, nil)    // state, not history: never replayed
	b.Publish(TypeChanges, "second")
	b.Publish(TypeChanges, "third")

	none, _, cancel := b.SubscribeSince(0, 1)
	cancel()
	if len(none) != 0 {
		t.Errorf("a client that has seen nothing got %d old events", len(none))
	}

	all, _, cancel := b.SubscribeSince(1, 1)
	cancel()
	got := ids(t, all)
	if len(got) != 3 || got[0] >= got[1] || got[1] >= got[2] || all[0].Data != "first" || all[2].Data != "third" {
		t.Fatalf("replay = %+v", all)
	}

	later, _, cancel := b.SubscribeSince(got[0], 1)
	cancel()
	if len(later) != 2 || later[0].Data != "second" {
		t.Errorf("since the first: %+v", later)
	}
	if rest, _, cancel := b.SubscribeSince(got[2], 1); len(rest) != 0 {
		t.Errorf("since the last: %+v", rest)
	} else {
		cancel()
	}
}

func TestReplayKeepsOnlyTheLastEvents(t *testing.T) {
	b := NewBus()
	for i := range ReplayLimit + 10 {
		b.Publish(TypeChanges, i)
	}
	all, _, cancel := b.SubscribeSince(1, 1)
	cancel()
	if len(all) != ReplayLimit || all[0].Data != 10 {
		t.Errorf("kept %d events, first %v", len(all), all[0].Data)
	}
}

// A client's id from before a restart must still find what the new
// process published.
func TestIDsKeepGrowingAcrossRestarts(t *testing.T) {
	before := NewBus()
	before.Publish(TypeChanges, "old")
	old, _, cancel := before.SubscribeSince(1, 1)
	cancel()

	time.Sleep(2 * time.Millisecond)
	after := NewBus() // the backend was restarted
	after.Publish(TypeChanges, "new")
	missed, _, cancel := after.SubscribeSince(old[0].ID, 1)
	cancel()
	if len(missed) != 1 || missed[0].Data != "new" {
		t.Errorf("after a restart: %+v", missed)
	}
}

// Replay and subscription are taken together: an event published while a
// client connects arrives exactly once, either replayed or live.
func TestNoGapBetweenReplayAndSubscription(t *testing.T) {
	b := NewBus()
	b.Publish(TypeChanges, -1)
	first, _, cancel := b.SubscribeSince(1, 1)
	cancel()

	const n = ReplayLimit - 5
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := range n {
			b.Publish(TypeChanges, i)
		}
	}()
	missed, ch, cancel := b.SubscribeSince(first[0].ID, n)
	defer cancel()
	<-done

	seen := map[any]int{}
	for _, ev := range missed {
		seen[ev.Data]++
	}
	for len(ch) > 0 {
		seen[(<-ch).Data]++
	}
	for i := range n {
		if seen[i] != 1 {
			t.Errorf("event %d arrived %d times", i, seen[i])
		}
	}
}
