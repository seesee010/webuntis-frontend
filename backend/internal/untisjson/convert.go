package untisjson

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/seesee010/webuntis-frontend/backend/internal/domain"
)

// ToSnapshot converts a CLI payload into the domain model.
func (p *Payload) ToSnapshot(provider string, fetchedAt time.Time) *domain.Snapshot {
	s := &domain.Snapshot{
		Meta: domain.Meta{
			Provider:  provider,
			School:    p.Meta.School,
			Server:    p.Meta.Server,
			User:      p.Meta.User,
			From:      p.Meta.Window.Start,
			To:        p.Meta.Window.End,
			Note:      p.Meta.Window.Note,
			FetchedAt: fetchedAt,
		},
		Errors: map[string]string{},
	}

	if tt := p.Timetable; tt != nil {
		if tt.Error != "" {
			s.Errors["timetable"] = tt.Error
		}
		s.Meta.OwnClasses = tt.OwnClasses
		s.Meta.TimetableBy = tt.Source
		s.TimeGrid = periods(tt.TimeGrid)
		for _, d := range tt.Days {
			for _, e := range d.Entries {
				s.Lessons = append(s.Lessons, gridLesson(d.Date, e))
			}
		}
		for _, l := range tt.Lessons {
			s.Lessons = append(s.Lessons, rpcLesson(l))
		}
		sortLessons(s.Lessons)
	}

	if ex := p.Exams; ex != nil {
		if ex.Error != "" {
			s.Errors["exams"] = ex.Error
		}
		for _, e := range ex.Exams {
			s.Exams = append(s.Exams, exam(e))
		}
		sort.SliceStable(s.Exams, func(i, j int) bool {
			return s.Exams[i].Date+s.Exams[i].Start < s.Exams[j].Date+s.Exams[j].Start
		})
	}

	if hw := p.Homework; hw != nil {
		if hw.Error != "" {
			s.Errors["homework"] = hw.Error
		}
		for _, h := range hw.Items {
			s.Homework = append(s.Homework, homework(h))
		}
	}

	if ab := p.Absences; ab != nil {
		if ab.Error != "" {
			s.Errors["absences"] = ab.Error
		}
		if len(s.TimeGrid) == 0 {
			s.TimeGrid = periods(ab.TimeGrid)
		}
		for _, a := range ab.Items {
			s.Absences = append(s.Absences, domain.Absence{
				ID: string(a.ID), StartDate: a.StartDate, EndDate: a.EndDate,
				StartTime: a.StartTime, EndTime: a.EndTime, Reason: a.Reason,
				Text: a.Text, Excused: a.IsExcused, ExcuseStatus: a.ExcuseStatus,
				ExcuseText: a.ExcuseText,
			})
		}
	}

	if ms := p.Messages; ms != nil {
		if ms.Error != "" {
			s.Errors["messages"] = ms.Error
		}
		for _, m := range ms.Items {
			s.Messages = append(s.Messages, domain.Message{
				ID: string(m.ID), Subject: m.Subject, Preview: m.Preview,
				From: m.From, Date: m.Date, Read: m.Read, HasAttachments: m.HasAttachments,
			})
		}
	}

	if hs := p.Holidays; hs != nil {
		if hs.Error != "" {
			s.Errors["holidays"] = hs.Error
		}
		for _, h := range hs.Items {
			s.Holidays = append(s.Holidays, domain.Holiday{
				ID: string(h.ID), Name: h.Name, Start: h.Start, End: h.End,
			})
		}
	}

	return s.Ensure()
}

func periods(units []TimeUnit) []domain.Period {
	out := make([]domain.Period, 0, len(units))
	for _, u := range units {
		if u.Start == "" || u.End == "" {
			continue
		}
		out = append(out, domain.Period{Start: u.Start, End: u.End})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Start < out[j].Start })
	for i := range out {
		out[i].Index = i + 1
	}
	return out
}

// splitStamp turns "2026-10-05T07:50" into ("2026-10-05", "07:50").
func splitStamp(stamp, fallbackDate string) (string, string) {
	date, clock, ok := strings.Cut(stamp, "T")
	if !ok {
		return fallbackDate, hhmm(stamp)
	}
	return date, hhmm(clock)
}

func hhmm(s string) string {
	if len(s) >= 5 {
		return s[:5]
	}
	return s
}

func gridLesson(dayDate string, e GridEntry) domain.Lesson {
	date, start := splitStamp(e.Start, dayDate)
	_, end := splitStamp(e.End, dayDate)
	l := domain.Lesson{
		Date: date, Start: start, End: end,
		Cancelled: e.IsCancelled, Removed: e.IsRemoved, Exam: e.IsExam,
		Event: e.IsEvent, Substitution: e.IsSubstitution, NoTeacher: e.NoTeacher,
		Subjects: elements(e.Subjects), Teachers: elements(e.Teachers),
		Rooms: elements(e.Rooms), Classes: elements(e.Classes),
		Text: e.LessonText, Info: e.Info, SubstitutionText: e.SubstitutionText,
		Notes: e.Notes,
	}
	l.DeriveStatus(e.Status == "ADDITIONAL")
	l.ID = lessonID(&l)
	return l
}

func rpcLesson(r RPCLesson) domain.Lesson {
	l := domain.Lesson{
		ID: string(r.ID), Date: r.Date, Start: hhmm(r.StartTime), End: hhmm(r.EndTime),
		Cancelled: r.IsCancelled, Exam: r.IsExam, Substitution: r.IsSubstitution,
		Subjects: elements(r.Subjects), Teachers: elements(r.Teachers),
		Rooms: elements(r.Rooms), Classes: elements(r.Classes),
		Text: r.Text, Info: r.Info, SubstitutionText: r.SubstitutionText,
	}
	l.DeriveStatus(false)
	if l.ID == "" {
		l.ID = lessonID(&l)
	}
	return l
}

func exam(e Exam) domain.Exam {
	date, start, end := e.Date, hhmm(e.StartTime), hhmm(e.EndTime)
	if date == "" && e.Start != "" { // timetable fallback
		date, start = splitStamp(e.Start, "")
		_, end = splitStamp(e.End, date)
	}
	out := domain.Exam{
		ID: string(e.ID), Date: date, Start: start, End: end, Name: e.Name,
		Type: e.Type, Text: e.Text, Grade: e.Grade,
		Subjects: elements(e.Subjects), Teachers: elements(e.Teachers), Rooms: elements(e.Rooms),
	}
	if out.ID == "" {
		out.ID = hashID("exam", out.Date, out.Start, firstShort(out.Subjects))
	}
	return out
}

func homework(h Homework) domain.Homework {
	out := domain.Homework{
		ID: string(h.ID), Date: h.Date, DueDate: h.DueDate, Text: h.Text,
		Remark: h.Remark, Completed: h.Completed,
		Subjects: elements(h.Subjects), Teachers: elements(h.Teachers),
		Attachments: []domain.Attachment{},
	}
	for _, raw := range h.Attachments {
		out.Attachments = append(out.Attachments, attachment(raw))
	}
	if out.ID == "" {
		out.ID = hashID("hw", out.Date, out.DueDate, out.Text)
	}
	return out
}

// attachment reads the few fields WebUntis is known to use; the shape
// is not documented, so everything is optional.
func attachment(raw json.RawMessage) domain.Attachment {
	var a struct {
		ID   ID     `json:"id"`
		Name string `json:"name"`
		URL  string `json:"url"`
	}
	if err := json.Unmarshal(raw, &a); err != nil {
		var name string
		_ = json.Unmarshal(raw, &name)
		return domain.Attachment{Name: name}
	}
	return domain.Attachment{ID: string(a.ID), Name: a.Name, URL: a.URL}
}

func elements(in []Element) []domain.Element {
	out := make([]domain.Element, 0, len(in))
	for _, e := range in {
		if e.Short == "" && e.Long == "" {
			continue
		}
		out = append(out, domain.Element{
			Short: e.Short, Long: e.Long, Status: e.Status,
			Replaces: e.Replaces, ReplacesLong: e.ReplacesLong,
		})
	}
	return out
}

func firstShort(e []domain.Element) string {
	if len(e) == 0 {
		return ""
	}
	return e[0].Short
}

func lessonID(l *domain.Lesson) string {
	parts := []string{l.Date, l.Start, l.End}
	for _, group := range [][]domain.Element{l.Subjects, l.Classes, l.Teachers} {
		for _, e := range group {
			parts = append(parts, e.Short)
		}
	}
	return hashID(parts...)
}

func hashID(parts ...string) string {
	sum := sha1.Sum([]byte(strings.Join(parts, "\x1f")))
	return hex.EncodeToString(sum[:6])
}

func sortLessons(ls []domain.Lesson) {
	sort.SliceStable(ls, func(i, j int) bool {
		a, b := ls[i], ls[j]
		if a.Date != b.Date {
			return a.Date < b.Date
		}
		if a.Start != b.Start {
			return a.Start < b.Start
		}
		return firstShort(a.Subjects) < firstShort(b.Subjects)
	})
}
