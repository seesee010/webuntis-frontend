package events

import "testing"

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
