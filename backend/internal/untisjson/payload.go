// Package untisjson describes the JSON the untis CLI prints with
// `untis --json -` and converts it into the domain model.
//
// The wire types are deliberately lenient: unknown fields are ignored and
// IDs may be numbers or strings, so new CLI versions keep working.
package untisjson

import (
	"bytes"
	"encoding/json"
)

// ID accepts a JSON number, string or null.
type ID string

func (id *ID) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if len(b) == 0 || string(b) == "null" {
		*id = ""
		return nil
	}
	if b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		*id = ID(s)
		return nil
	}
	var n json.Number
	if err := json.Unmarshal(b, &n); err != nil {
		return err
	}
	*id = ID(n.String())
	return nil
}

// Payload is the top level of `untis --json -`.
type Payload struct {
	Meta      Meta                   `json:"meta"`
	Timetable *TimetableSection      `json:"timetable"`
	Exams     *ExamSection           `json:"exams"`
	Homework  *ItemSection[Homework] `json:"homework"`
	Absences  *AbsenceSection        `json:"absences"`
	Messages  *ItemSection[Message]  `json:"messages"`
	Holidays  *ItemSection[Holiday]  `json:"holidays"`
}

type Meta struct {
	School      string `json:"school"`
	Server      string `json:"server"`
	User        string `json:"user"`
	GeneratedAt string `json:"generated_at"`
	Window      struct {
		Start string `json:"start"`
		End   string `json:"end"`
		Note  string `json:"note"`
	} `json:"window"`
}

// section is embedded in every section: a failed section only carries
// an error message.
type section struct {
	Error  string `json:"error"`
	Source string `json:"source"`
	Start  string `json:"start"`
	End    string `json:"end"`
}

type Element struct {
	Short        string `json:"short"`
	Long         string `json:"long"`
	Status       string `json:"status"`
	Replaces     string `json:"replaces"`
	ReplacesLong string `json:"replaces_long"`
}

type TimeUnit struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type TimetableSection struct {
	section
	OwnClasses []string    `json:"own_classes"`
	TimeGrid   []TimeUnit  `json:"time_grid"`
	Days       []GridDay   `json:"days"`    // REST v1
	Lessons    []RPCLesson `json:"lessons"` // JSON-RPC fallback
}

type GridDay struct {
	Date    string      `json:"date"`
	Status  string      `json:"status"`
	Entries []GridEntry `json:"entries"`
}

// GridEntry is a REST v1 timetable entry; Start/End are "YYYY-MM-DDTHH:MM".
type GridEntry struct {
	Start            string    `json:"start"`
	End              string    `json:"end"`
	Status           string    `json:"status"`
	IsCancelled      bool      `json:"is_cancelled"`
	IsExam           bool      `json:"is_exam"`
	IsSubstitution   bool      `json:"is_substitution"`
	IsEvent          bool      `json:"is_event"`
	IsRemoved        bool      `json:"is_removed"`
	NoTeacher        bool      `json:"no_teacher"`
	Type             string    `json:"type"`
	LessonText       string    `json:"lesson_text"`
	SubstitutionText string    `json:"substitution_text"`
	Info             string    `json:"info"`
	Notes            string    `json:"notes"`
	Subjects         []Element `json:"subjects"`
	Teachers         []Element `json:"teachers"`
	Classes          []Element `json:"classes"`
	Rooms            []Element `json:"rooms"`
}

// RPCLesson is a JSON-RPC getTimetable element.
type RPCLesson struct {
	ID               ID        `json:"id"`
	Date             string    `json:"date"`
	StartTime        string    `json:"start_time"`
	EndTime          string    `json:"end_time"`
	Type             string    `json:"type"`
	Code             string    `json:"code"`
	IsExam           bool      `json:"is_exam"`
	IsSubstitution   bool      `json:"is_substitution"`
	IsCancelled      bool      `json:"is_cancelled"`
	Subjects         []Element `json:"subjects"`
	Teachers         []Element `json:"teachers"`
	Classes          []Element `json:"classes"`
	Rooms            []Element `json:"rooms"`
	Info             string    `json:"info"`
	Text             string    `json:"text"`
	SubstitutionText string    `json:"substitution_text"`
}

type ExamSection struct {
	section
	Exams []Exam `json:"exams"`
}

type Exam struct {
	ID        ID        `json:"id"`
	Date      string    `json:"date"`
	StartTime string    `json:"start_time"`
	EndTime   string    `json:"end_time"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Text      string    `json:"text"`
	Grade     string    `json:"grade"`
	Subjects  []Element `json:"subjects"`
	Teachers  []Element `json:"teachers"`
	Rooms     []Element `json:"rooms"`
	// The timetable fallback reuses grid entries as exams.
	Start string `json:"start"`
	End   string `json:"end"`
}

type ItemSection[T any] struct {
	section
	Items []T `json:"items"`
}

type AbsenceSection struct {
	section
	Items    []Absence  `json:"items"`
	TimeGrid []TimeUnit `json:"time_grid"`
}

type Homework struct {
	ID          ID                `json:"id"`
	Date        string            `json:"date"`
	DueDate     string            `json:"due_date"`
	Text        string            `json:"text"`
	Remark      string            `json:"remark"`
	Completed   bool              `json:"completed"`
	Subjects    []Element         `json:"subjects"`
	Teachers    []Element         `json:"teachers"`
	Attachments []json.RawMessage `json:"attachments"`
}

type Absence struct {
	ID           ID     `json:"id"`
	StartDate    string `json:"start_date"`
	EndDate      string `json:"end_date"`
	StartTime    string `json:"start_time"`
	EndTime      string `json:"end_time"`
	Reason       string `json:"reason"`
	Text         string `json:"text"`
	IsExcused    bool   `json:"is_excused"`
	ExcuseStatus string `json:"excuse_status"`
	ExcuseText   string `json:"excuse_text"`
}

type Message struct {
	ID             ID     `json:"id"`
	Subject        string `json:"subject"`
	Preview        string `json:"preview"`
	From           string `json:"from"`
	Date           string `json:"date"`
	Read           bool   `json:"read"`
	HasAttachments bool   `json:"has_attachments"`
}

type Holiday struct {
	ID    ID     `json:"id"`
	Name  string `json:"name"`
	Start string `json:"start"`
	End   string `json:"end"`
}

// Parse decodes the CLI output.
func Parse(data []byte) (*Payload, error) {
	var p Payload
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}
