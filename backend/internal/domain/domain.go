// Package domain holds the normalised data model the GUI works with.
//
// The untis CLI emits two different timetable shapes (REST v1 grid and
// JSON-RPC lessons) and wraps every section in its own envelope. The
// frontend should not care about any of that, so providers convert the
// CLI output into the flat types below.
package domain

import "time"

// LessonStatus is the single most important state of a lesson, used for
// colouring. The individual flags on Lesson carry the full picture.
type LessonStatus string

const (
	StatusRegular      LessonStatus = "regular"
	StatusCancelled    LessonStatus = "cancelled"
	StatusRemoved      LessonStatus = "removed"
	StatusExam         LessonStatus = "exam"
	StatusEvent        LessonStatus = "event"
	StatusSubstitution LessonStatus = "substitution"
	StatusAdditional   LessonStatus = "additional"
	StatusNoTeacher    LessonStatus = "no-teacher"
)

// Element is a subject, teacher, room or class reference.
type Element struct {
	Short string `json:"short"`
	Long  string `json:"long,omitempty"`
	// Status is set for non-regular elements, e.g. "REMOVED" or "CHANGED".
	Status string `json:"status,omitempty"`
	// Replaces is the short name of the element this one substitutes.
	Replaces     string `json:"replaces,omitempty"`
	ReplacesLong string `json:"replacesLong,omitempty"`
}

// Lesson is one entry of the timetable.
type Lesson struct {
	ID     string       `json:"id"`
	Date   string       `json:"date"`  // YYYY-MM-DD
	Start  string       `json:"start"` // HH:MM
	End    string       `json:"end"`   // HH:MM
	Status LessonStatus `json:"status"`

	Cancelled    bool `json:"cancelled"`
	Removed      bool `json:"removed"`
	Exam         bool `json:"exam"`
	Event        bool `json:"event"`
	Substitution bool `json:"substitution"`
	NoTeacher    bool `json:"noTeacher"`

	Subjects []Element `json:"subjects"`
	Teachers []Element `json:"teachers"`
	Rooms    []Element `json:"rooms"`
	Classes  []Element `json:"classes"`

	Text             string `json:"text,omitempty"`
	Info             string `json:"info,omitempty"`
	SubstitutionText string `json:"substitutionText,omitempty"`
	Notes            string `json:"notes,omitempty"`
}

// Period is one slot of the school's time grid.
type Period struct {
	Index int    `json:"index"`
	Start string `json:"start"`
	End   string `json:"end"`
}

// Exam is a test or exam.
type Exam struct {
	ID       string    `json:"id"`
	Date     string    `json:"date"`
	Start    string    `json:"start,omitempty"`
	End      string    `json:"end,omitempty"`
	Name     string    `json:"name,omitempty"`
	Type     string    `json:"type,omitempty"`
	Text     string    `json:"text,omitempty"`
	Grade    string    `json:"grade,omitempty"`
	Subjects []Element `json:"subjects"`
	Teachers []Element `json:"teachers"`
	Rooms    []Element `json:"rooms"`
}

// Attachment of a homework item.
type Attachment struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name"`
	URL  string `json:"url,omitempty"`
}

// Homework is one homework assignment.
type Homework struct {
	ID          string       `json:"id"`
	Date        string       `json:"date"`
	DueDate     string       `json:"dueDate"`
	Text        string       `json:"text"`
	Remark      string       `json:"remark,omitempty"`
	Completed   bool         `json:"completed"`
	Subjects    []Element    `json:"subjects"`
	Teachers    []Element    `json:"teachers"`
	Attachments []Attachment `json:"attachments"`
}

// Absence is a recorded absence of the student.
type Absence struct {
	ID           string `json:"id"`
	StartDate    string `json:"startDate"`
	EndDate      string `json:"endDate"`
	StartTime    string `json:"startTime,omitempty"`
	EndTime      string `json:"endTime,omitempty"`
	Reason       string `json:"reason,omitempty"`
	Text         string `json:"text,omitempty"`
	Excused      bool   `json:"excused"`
	ExcuseStatus string `json:"excuseStatus,omitempty"`
	ExcuseText   string `json:"excuseText,omitempty"`
}

// Message is an inbox message.
type Message struct {
	ID             string `json:"id"`
	Subject        string `json:"subject"`
	Preview        string `json:"preview,omitempty"`
	From           string `json:"from,omitempty"`
	Date           string `json:"date,omitempty"`
	Read           bool   `json:"read"`
	HasAttachments bool   `json:"hasAttachments"`
}

// Holiday is a school holiday or break.
type Holiday struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Start string `json:"start"` // YYYY-MM-DD, inclusive
	End   string `json:"end"`   // YYYY-MM-DD, inclusive
}

// Meta describes where a snapshot came from.
type Meta struct {
	Provider    string    `json:"provider"`
	School      string    `json:"school,omitempty"`
	Server      string    `json:"server,omitempty"`
	User        string    `json:"user,omitempty"`
	From        string    `json:"from"`
	To          string    `json:"to"`
	Note        string    `json:"note,omitempty"`
	OwnClasses  []string  `json:"ownClasses"`
	FetchedAt   time.Time `json:"fetchedAt"`
	TimetableBy string    `json:"timetableSource,omitempty"`
}

// Snapshot is everything the GUI knows for one date window.
type Snapshot struct {
	Meta     Meta       `json:"meta"`
	TimeGrid []Period   `json:"timeGrid"`
	Lessons  []Lesson   `json:"lessons"`
	Exams    []Exam     `json:"exams"`
	Homework []Homework `json:"homework"`
	Absences []Absence  `json:"absences"`
	Messages []Message  `json:"messages"`
	Holidays []Holiday  `json:"holidays"`
	// Errors maps a section name ("exams", "messages", ...) to the error
	// the CLI reported for it. The other sections are still usable.
	Errors map[string]string `json:"errors"`
}

// Lookup is one match of a "who is CODE" query.
type Lookup struct {
	Code string `json:"code"`
	Kind string `json:"kind"` // subject, teacher, room, class
	Name string `json:"name"`
}

// Ensure returns s with all nil slices and maps replaced by empty ones,
// so the frontend never has to deal with JSON null.
func (s *Snapshot) Ensure() *Snapshot {
	if s.TimeGrid == nil {
		s.TimeGrid = []Period{}
	}
	if s.Lessons == nil {
		s.Lessons = []Lesson{}
	}
	if s.Exams == nil {
		s.Exams = []Exam{}
	}
	if s.Homework == nil {
		s.Homework = []Homework{}
	}
	if s.Absences == nil {
		s.Absences = []Absence{}
	}
	if s.Messages == nil {
		s.Messages = []Message{}
	}
	if s.Holidays == nil {
		s.Holidays = []Holiday{}
	}
	if s.Errors == nil {
		s.Errors = map[string]string{}
	}
	if s.Meta.OwnClasses == nil {
		s.Meta.OwnClasses = []string{}
	}
	for i := range s.Lessons {
		l := &s.Lessons[i]
		l.Subjects = orEmpty(l.Subjects)
		l.Teachers = orEmpty(l.Teachers)
		l.Rooms = orEmpty(l.Rooms)
		l.Classes = orEmpty(l.Classes)
	}
	return s
}

func orEmpty(e []Element) []Element {
	if e == nil {
		return []Element{}
	}
	return e
}

// DeriveStatus picks the dominant status from a lesson's flags.
func (l *Lesson) DeriveStatus(additional bool) {
	switch {
	case l.Cancelled:
		l.Status = StatusCancelled
	case l.Removed:
		l.Status = StatusRemoved
	case l.Exam:
		l.Status = StatusExam
	case l.Event:
		l.Status = StatusEvent
	case l.NoTeacher:
		l.Status = StatusNoTeacher
	case l.Substitution:
		l.Status = StatusSubstitution
	case additional:
		l.Status = StatusAdditional
	default:
		l.Status = StatusRegular
	}
}
