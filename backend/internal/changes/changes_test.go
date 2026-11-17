package changes

import (
	"testing"

	"github.com/seesee010/webuntis-frontend/backend/internal/domain"
)

func lesson(date, start, subj, teacher, room string) domain.Lesson {
	return domain.Lesson{
		ID: date + start + subj, Date: date, Start: start,
		Subjects: []domain.Element{{Short: subj}},
		Teachers: []domain.Element{{Short: teacher}},
		Rooms:    []domain.Element{{Short: room}},
	}
}

func snap(from, to string, ls ...domain.Lesson) *domain.Snapshot {
	return &domain.Snapshot{Meta: domain.Meta{From: from, To: to}, Lessons: ls}
}

func kinds(cs []Change) map[string]Change {
	m := map[string]Change{}
	for _, c := range cs {
		m[c.Kind] = c
	}
	return m
}

func TestLessonChanges(t *testing.T) {
	old := snap("2026-10-05", "2026-10-09",
		lesson("2026-10-05", "08:00", "MATH", "AMB", "R101"),
		lesson("2026-10-05", "09:00", "ENG", "BRO", "R101"),
		lesson("2026-10-06", "08:00", "GER", "CAS", "R101"),
		lesson("2026-10-06", "09:00", "HIST", "DUN", "R101"),
		lesson("2026-10-07", "08:00", "ART", "HOL", "ARTS"),
	)
	cancelled := lesson("2026-10-05", "08:00", "MATH", "AMB", "R101")
	cancelled.Cancelled = true
	cur := snap("2026-10-05", "2026-10-09",
		cancelled,
		lesson("2026-10-05", "09:00", "ENG", "IVE", "R101"),
		lesson("2026-10-06", "08:00", "GER", "CAS", "AULA"),
		lesson("2026-10-07", "08:00", "ART", "HOL", "ARTS"),
		lesson("2026-10-08", "14:00", "CS", "GRE", "CS2"),
	)
	got := kinds(Diff(old, cur))
	if len(got) != 5 {
		t.Fatalf("changes = %+v", Diff(old, cur))
	}
	if got[Substitution].Detail != "BRO → IVE" {
		t.Errorf("substitution = %+v", got[Substitution])
	}
	if got[RoomChange].Detail != "R101 → AULA" {
		t.Errorf("room change = %+v", got[RoomChange])
	}
	if got[Cancelled].Subject != "MATH" || got[LessonDropped].Subject != "HIST" || got[LessonAdded].Subject != "CS" {
		t.Errorf("changes = %+v", got)
	}
}

func TestOnlyOverlappingDaysCompare(t *testing.T) {
	old := snap("2026-10-05", "2026-10-06", lesson("2026-10-05", "08:00", "MATH", "AMB", "R101"))
	cur := snap("2026-10-06", "2026-10-07", lesson("2026-10-07", "08:00", "ENG", "BRO", "R101"))
	if cs := Diff(old, cur); len(cs) != 0 {
		t.Errorf("moving the window reported changes: %+v", cs)
	}
}

func TestExamsHomeworkMessages(t *testing.T) {
	old := &domain.Snapshot{Meta: domain.Meta{From: "2026-10-01", To: "2026-10-31"},
		Exams:    []domain.Exam{{ID: "1", Date: "2026-10-09", Name: "Test", Subjects: []domain.Element{{Short: "MATH"}}}},
		Homework: []domain.Homework{{ID: "h1"}},
		Messages: []domain.Message{{ID: "m1"}},
	}
	cur := &domain.Snapshot{Meta: old.Meta,
		Exams:    []domain.Exam{{ID: "2", Date: "2026-10-12", Name: "Quiz", Subjects: []domain.Element{{Short: "ENG"}}}},
		Homework: []domain.Homework{{ID: "h1"}, {ID: "h2", Text: "Read"}},
		Messages: []domain.Message{{ID: "m1"}, {ID: "m2", Subject: "Hi"}},
	}
	got := kinds(Diff(old, cur))
	for _, k := range []string{ExamAdded, ExamRemoved, HomeworkAdded, MessageNew} {
		if _, ok := got[k]; !ok {
			t.Errorf("missing %s in %+v", k, got)
		}
	}
	if Diff(nil, cur) != nil {
		t.Error("diff against nothing must be empty")
	}
}

// Two parallel groups share date, start and subject. Only group B changes;
// group A must not be reported, and B's change must name B's teacher.
func TestParallelLessonsWithTheSameSubject(t *testing.T) {
	group := func(class, teacher, room string) domain.Lesson {
		l := lesson("2026-10-05", "08:00", "PE", teacher, room)
		l.Classes = []domain.Element{{Short: class}}
		// like a grid lesson: the ID hashes the teachers, so a substitution changes it
		l.ID = "PE-" + class + "-" + teacher
		return l
	}
	old := snap("2026-10-05", "2026-10-09", group("1A", "AMB", "GYM1"), group("1B", "BRO", "GYM2"))

	cancelledB := group("1B", "BRO", "GYM2")
	cancelledB.Cancelled = true
	cases := []struct {
		name string
		cur  []domain.Lesson
		want []Change
	}{
		{"B cancelled", []domain.Lesson{group("1A", "AMB", "GYM1"), cancelledB},
			[]Change{{Kind: Cancelled, Ref: "PE-1B-BRO"}}},
		{"B cancelled, listed first", []domain.Lesson{cancelledB, group("1A", "AMB", "GYM1")},
			[]Change{{Kind: Cancelled, Ref: "PE-1B-BRO"}}},
		{"B substituted", []domain.Lesson{group("1A", "AMB", "GYM1"), group("1B", "IVE", "GYM2")},
			[]Change{{Kind: Substitution, Detail: "BRO → IVE", Ref: "PE-1B-IVE"}}},
		{"B room change", []domain.Lesson{group("1A", "AMB", "GYM1"), group("1B", "BRO", "AULA")},
			[]Change{{Kind: RoomChange, Detail: "GYM2 → AULA", Ref: "PE-1B-BRO"}}},
		{"B dropped", []domain.Lesson{group("1A", "AMB", "GYM1")},
			[]Change{{Kind: LessonDropped, Ref: "PE-1B-BRO"}}},
		{"group C added", []domain.Lesson{group("1A", "AMB", "GYM1"), group("1B", "BRO", "GYM2"), group("1C", "CAS", "GYM3")},
			[]Change{{Kind: LessonAdded, Ref: "PE-1C-CAS"}}},
		{"unchanged", []domain.Lesson{group("1B", "BRO", "GYM2"), group("1A", "AMB", "GYM1")}, nil},
	}
	for _, c := range cases {
		got := Diff(old, snap("2026-10-05", "2026-10-09", c.cur...))
		if len(got) != len(c.want) {
			t.Errorf("%s: changes = %+v, want %+v", c.name, got, c.want)
			continue
		}
		for i, w := range c.want {
			if got[i].Kind != w.Kind || got[i].Detail != w.Detail || got[i].Ref != w.Ref {
				t.Errorf("%s: change = %+v, want %+v", c.name, got[i], w)
			}
		}
	}
}
