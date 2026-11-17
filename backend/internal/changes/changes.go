// Package changes compares two snapshots and lists what changed, the way
// `untis --changes` does: cancellations, substitutions, room changes,
// removed or added lessons, new or removed exams and new homework.
package changes

import (
	"sort"
	"strings"

	"github.com/seesee010/webuntis-frontend/backend/internal/domain"
)

// Kinds of changes.
const (
	Cancelled     = "cancelled"
	Substitution  = "substitution"
	RoomChange    = "room-change"
	Removed       = "removed"
	LessonAdded   = "lesson-added"
	LessonDropped = "lesson-dropped"
	ExamAdded     = "exam-added"
	ExamRemoved   = "exam-removed"
	HomeworkAdded = "homework-added"
	MessageNew    = "message-new"
)

// Change is one difference between two snapshots.
type Change struct {
	Kind    string `json:"kind"`
	Date    string `json:"date,omitempty"`
	Start   string `json:"start,omitempty"`
	Subject string `json:"subject,omitempty"`
	Detail  string `json:"detail,omitempty"`
	Ref     string `json:"ref,omitempty"` // ID of the lesson, exam, homework or message
}

// Diff lists the changes from old to cur. Lessons are only compared on
// days both windows cover, so moving the window is not a change.
func Diff(old, cur *domain.Snapshot) []Change {
	if old == nil || cur == nil {
		return nil
	}
	var out []Change
	out = append(out, diffLessons(old, cur)...)
	out = append(out, diffExams(old, cur)...)
	out = append(out, diffHomework(old, cur)...)
	out = append(out, diffMessages(old, cur)...)
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].Date+out[i].Start < out[j].Date+out[j].Start
	})
	return out
}

func lessonKey(l domain.Lesson) string {
	return l.Date + "|" + l.Start + "|" + shorts(l.Subjects) + "|" + l.Info
}

func diffLessons(old, cur *domain.Snapshot) []Change {
	from := max(old.Meta.From, cur.Meta.From)
	to := min(old.Meta.To, cur.Meta.To)
	inBoth := func(d string) bool { return d >= from && d <= to }

	// Parallel groups can share date, start, subject and info (two sport
	// groups at 08:00), so a key holds a list and each new lesson is paired
	// with one old lesson of its own key; see pairLessons.
	before := map[string][]domain.Lesson{}
	for _, l := range old.Lessons {
		if inBoth(l.Date) {
			k := lessonKey(l)
			before[k] = append(before[k], l)
		}
	}
	after := map[string][]domain.Lesson{}
	var keys []string
	for _, l := range cur.Lessons {
		if inBoth(l.Date) {
			k := lessonKey(l)
			if _, ok := after[k]; !ok {
				keys = append(keys, k)
			}
			after[k] = append(after[k], l)
		}
	}
	for k := range before {
		if _, ok := after[k]; !ok {
			keys = append(keys, k)
		}
	}

	var out []Change
	for _, k := range keys {
		prevs, curs := before[k], after[k]
		match := pairLessons(prevs, curs)
		used := make([]bool, len(prevs))
		for i, l := range curs {
			c := Change{Date: l.Date, Start: l.Start, Subject: subject(l), Ref: l.ID}
			if match[i] < 0 {
				c.Kind = LessonAdded
				out = append(out, c)
				continue
			}
			used[match[i]] = true
			prev := prevs[match[i]]
			switch {
			case l.Cancelled && !prev.Cancelled:
				c.Kind = Cancelled
			case l.Removed && !prev.Removed:
				c.Kind = Removed
			case shorts(l.Teachers) != shorts(prev.Teachers) && !l.Cancelled:
				c.Kind, c.Detail = Substitution, shorts(prev.Teachers)+" → "+shorts(l.Teachers)
			case shorts(l.Rooms) != shorts(prev.Rooms) && !l.Cancelled:
				c.Kind, c.Detail = RoomChange, shorts(prev.Rooms)+" → "+shorts(l.Rooms)
			default:
				continue
			}
			out = append(out, c)
		}
		for j, l := range prevs {
			if !used[j] {
				out = append(out, Change{Kind: LessonDropped, Date: l.Date, Start: l.Start, Subject: subject(l), Ref: l.ID})
			}
		}
	}
	return out
}

// pairLessons pairs each lesson of curs with at most one of prevs, all with
// the same lessonKey, and returns the index in prevs per lesson (-1: none).
// The same ID wins first. IDs are not enough on their own: for grid lessons
// the ID hashes the teachers too, so a substitution changes it. The rest are
// paired by what identifies a parallel group best: the classes, then the
// teachers, then the rooms; ties go by order, as before for a single lesson.
func pairLessons(prevs, curs []domain.Lesson) []int {
	match := make([]int, len(curs))
	used := make([]bool, len(prevs))
	for i := range match {
		match[i] = -1
	}
	for i, l := range curs {
		for j, p := range prevs {
			if !used[j] && l.ID != "" && l.ID == p.ID {
				match[i], used[j] = j, true
				break
			}
		}
	}
	score := func(a, b domain.Lesson) int {
		n := 0
		if shorts(a.Classes) == shorts(b.Classes) {
			n += 4
		}
		if shorts(a.Teachers) == shorts(b.Teachers) {
			n += 2
		}
		if shorts(a.Rooms) == shorts(b.Rooms) {
			n++
		}
		return n
	}
	for i, l := range curs {
		if match[i] >= 0 {
			continue
		}
		best, bestScore := -1, -1
		for j, p := range prevs {
			if s := score(l, p); !used[j] && s > bestScore {
				best, bestScore = j, s
			}
		}
		if best >= 0 {
			match[i], used[best] = best, true
		}
	}
	return match
}

func diffExams(old, cur *domain.Snapshot) []Change {
	key := func(e domain.Exam) string { return e.Date + "|" + shorts(e.Subjects) + "|" + e.Name }
	before := map[string]bool{}
	for _, e := range old.Exams {
		before[key(e)] = true
	}
	now := map[string]bool{}
	var out []Change
	for _, e := range cur.Exams {
		now[key(e)] = true
		if !before[key(e)] {
			out = append(out, Change{Kind: ExamAdded, Date: e.Date, Start: e.Start, Subject: shorts(e.Subjects), Detail: e.Name, Ref: e.ID})
		}
	}
	for _, e := range old.Exams {
		if !now[key(e)] && e.Date >= cur.Meta.From && e.Date <= cur.Meta.To {
			out = append(out, Change{Kind: ExamRemoved, Date: e.Date, Start: e.Start, Subject: shorts(e.Subjects), Detail: e.Name, Ref: e.ID})
		}
	}
	return out
}

func diffHomework(old, cur *domain.Snapshot) []Change {
	before := map[string]bool{}
	for _, h := range old.Homework {
		before[h.ID] = true
	}
	var out []Change
	for _, h := range cur.Homework {
		if !before[h.ID] {
			out = append(out, Change{Kind: HomeworkAdded, Date: h.DueDate, Subject: shorts(h.Subjects), Detail: h.Text, Ref: h.ID})
		}
	}
	return out
}

func diffMessages(old, cur *domain.Snapshot) []Change {
	before := map[string]bool{}
	for _, m := range old.Messages {
		before[m.ID] = true
	}
	var out []Change
	for _, m := range cur.Messages {
		if !before[m.ID] {
			out = append(out, Change{Kind: MessageNew, Detail: m.Subject, Ref: m.ID})
		}
	}
	return out
}

func subject(l domain.Lesson) string {
	if s := shorts(l.Subjects); s != "" {
		return s
	}
	return l.Info
}

func shorts(es []domain.Element) string {
	var parts []string
	for _, e := range es {
		if e.Status == "REMOVED" {
			continue
		}
		parts = append(parts, e.Short)
	}
	sort.Strings(parts)
	return strings.Join(parts, ",")
}
