package untisjson

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/seesee010/webuntis-frontend/backend/internal/domain"
)

func load(t *testing.T, name string) *domain.Snapshot {
	t.Helper()
	data, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	p, err := Parse(data)
	if err != nil {
		t.Fatalf("parse %s: %v", name, err)
	}
	return p.ToSnapshot("cli", time.Unix(0, 0))
}

func TestRESTTimetable(t *testing.T) {
	s := load(t, "rest_v1.json")

	if got := len(s.Lessons); got != 4 {
		t.Fatalf("lessons = %d, want 4", got)
	}
	first := s.Lessons[0]
	if first.Date != "2026-10-05" || first.Start != "07:50" || first.End != "08:40" {
		t.Errorf("lessons not sorted by time: %+v", first)
	}
	if first.Status != domain.StatusSubstitution {
		t.Errorf("status = %s, want substitution", first.Status)
	}
	if first.Teachers[0].Replaces != "TCH1" {
		t.Errorf("replaces = %q, want TCH1", first.Teachers[0].Replaces)
	}
	if s.Lessons[1].Status != domain.StatusCancelled {
		t.Errorf("status = %s, want cancelled", s.Lessons[1].Status)
	}
	if s.Lessons[2].Status != domain.StatusEvent || s.Lessons[2].Info != "Museum visit" {
		t.Errorf("event lesson wrong: %+v", s.Lessons[2])
	}
	if s.Lessons[3].Status != domain.StatusAdditional {
		t.Errorf("status = %s, want additional", s.Lessons[3].Status)
	}
	if s.Lessons[0].ID == "" || s.Lessons[0].ID == s.Lessons[1].ID {
		t.Errorf("lesson IDs must be set and distinct")
	}
}

func TestTimeGridSortedAndIndexed(t *testing.T) {
	s := load(t, "rest_v1.json")
	want := []domain.Period{{Index: 1, Start: "07:50", End: "08:40"}, {Index: 2, Start: "08:45", End: "09:35"}}
	if len(s.TimeGrid) != 2 || s.TimeGrid[0] != want[0] || s.TimeGrid[1] != want[1] {
		t.Errorf("time grid = %+v, want %+v", s.TimeGrid, want)
	}
}

func TestSectionsAndErrors(t *testing.T) {
	s := load(t, "rest_v1.json")

	if s.Meta.User != "Sample Student" || s.Meta.From != "2026-10-05" || s.Meta.Provider != "cli" {
		t.Errorf("meta = %+v", s.Meta)
	}
	if len(s.Exams) != 1 || s.Exams[0].ID != "7" || s.Exams[0].Start != "09:40" {
		t.Errorf("exams = %+v", s.Exams)
	}
	hw := s.Homework[0]
	if hw.DueDate != "2026-10-07" || len(hw.Attachments) != 2 ||
		hw.Attachments[0].Name != "sheet.pdf" || hw.Attachments[1].Name != "notes.txt" {
		t.Errorf("homework = %+v", hw)
	}
	if s.Errors["absences"] != "403 Forbidden" {
		t.Errorf("errors = %v", s.Errors)
	}
	if len(s.Absences) != 0 || s.Absences == nil {
		t.Errorf("absences must be an empty, non-nil slice")
	}
	if !s.Messages[0].HasAttachments || s.Messages[0].Read {
		t.Errorf("messages = %+v", s.Messages)
	}
	if s.Holidays[0].Name != "Autumn break" {
		t.Errorf("holidays = %+v", s.Holidays)
	}
}

func TestJSONRPCTimetableAndExamFallback(t *testing.T) {
	s := load(t, "jsonrpc.json")

	if len(s.Lessons) != 2 || s.Lessons[0].ID != "98" || s.Lessons[0].Status != domain.StatusCancelled {
		t.Fatalf("lessons = %+v", s.Lessons)
	}
	if s.Lessons[1].Status != domain.StatusExam {
		t.Errorf("status = %s, want exam", s.Lessons[1].Status)
	}
	e := s.Exams[0]
	if e.Date != "2026-10-05" || e.Start != "09:40" || e.End != "10:30" || e.ID == "" {
		t.Errorf("fallback exam = %+v", e)
	}
}

func TestNoNullsInJSON(t *testing.T) {
	s := (&Payload{}).ToSnapshot("cli", time.Unix(0, 0))
	b, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	for _, k := range []string{"lessons", "exams", "homework", "absences", "messages", "holidays", "timeGrid", "errors"} {
		if m[k] == nil {
			t.Errorf("%s is null", k)
		}
	}
}

func TestParseNow(t *testing.T) {
	n, err := ParseNow([]byte(`{"now": {"subject": "MATH", "teachers": "TCH1", "rooms": "R101",
		"start": "07:50", "end": "08:40", "status": "", "minutes_left": 12},
		"next": {"subject": "ENG", "start": "08:45", "end": "09:35", "status": "changed",
		"date": "2026-10-05", "starts_in": 17}}`))
	if err != nil {
		t.Fatal(err)
	}
	if n.Now.Subject != "MATH" || *n.Now.MinutesLeft != 12 || *n.Next.StartsIn != 17 {
		t.Errorf("now = %+v next = %+v", n.Now, n.Next)
	}
}
