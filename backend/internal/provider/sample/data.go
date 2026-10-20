package sample

import "github.com/seesee010/webuntis-frontend/backend/internal/domain"

// Everything in this file is fictional. Names were made up for the demo
// and do not refer to any real school, student or teacher.

const (
	schoolName  = "Demo High School"
	serverName  = "demo"
	studentName = "Sample Student"
	ownClass    = "3B"
)

var timeGrid = []domain.Period{
	{Index: 1, Start: "08:00", End: "08:50"},
	{Index: 2, Start: "08:55", End: "09:45"},
	{Index: 3, Start: "10:00", End: "10:50"},
	{Index: 4, Start: "10:55", End: "11:45"},
	{Index: 5, Start: "11:50", End: "12:40"},
	{Index: 6, Start: "12:45", End: "13:35"},
	{Index: 7, Start: "14:00", End: "14:50"},
	{Index: 8, Start: "14:55", End: "15:45"},
}

var subjects = map[string]string{
	"MATH": "Mathematics",
	"ENG":  "English",
	"GER":  "German",
	"PHY":  "Physics",
	"CHEM": "Chemistry",
	"BIO":  "Biology",
	"HIST": "History",
	"GEO":  "Geography",
	"ART":  "Art",
	"MUS":  "Music",
	"PE":   "Physical Education",
	"CS":   "Computer Science",
	"ETH":  "Ethics",
}

var teachers = map[string]string{
	"AMB": "Ms. Ambrose",
	"BRO": "Mr. Brook",
	"CAS": "Ms. Castell",
	"DUN": "Mr. Dunmore",
	"EVE": "Ms. Everly",
	"FAI": "Mr. Fairbanks",
	"GRE": "Ms. Greaves",
	"HOL": "Mr. Holloway",
	"IVE": "Ms. Iverson",
}

var rooms = map[string]string{
	"R101": "Classroom 101",
	"R102": "Classroom 102",
	"R204": "Classroom 204",
	"LAB1": "Science lab 1",
	"LAB2": "Science lab 2",
	"CS2":  "Computer room 2",
	"GYM":  "Gymnasium",
	"ARTS": "Art studio",
	"MUSR": "Music room",
	"AULA": "Assembly hall",
}

var classes = map[string]string{
	"3A": "Class 3A",
	"3B": "Class 3B",
	"3C": "Class 3C",
}

// slot is one lesson of the regular week. Period is 1-based, Length is
// the number of consecutive periods (2 = double lesson).
type slot struct {
	Period  int
	Length  int
	Subject string
	Teacher string
	Room    string
	// Group marks a lesson held in parallel with another one (the class
	// is split), e.g. "group 1".
	Group string
}

// week is the regular timetable, Monday to Friday.
var week = [5][]slot{
	{ // Monday
		{1, 2, "MATH", "AMB", "R101", ""},
		{3, 1, "ENG", "BRO", "R101", ""},
		{4, 1, "GER", "CAS", "R101", ""},
		{5, 1, "HIST", "DUN", "R204", ""},
		{6, 1, "BIO", "EVE", "LAB2", ""},
	},
	{ // Tuesday
		{1, 1, "PHY", "FAI", "LAB1", ""},
		{2, 1, "CHEM", "EVE", "LAB1", ""},
		{3, 1, "GEO", "DUN", "R101", ""},
		{4, 2, "CS", "GRE", "CS2", "group 1"},
		{4, 2, "ART", "HOL", "ARTS", "group 2"},
		{7, 2, "PE", "IVE", "GYM", ""},
	},
	{ // Wednesday
		{1, 1, "ENG", "BRO", "R101", ""},
		{2, 1, "MATH", "AMB", "R101", ""},
		{3, 1, "GER", "CAS", "R101", ""},
		{4, 1, "ETH", "HOL", "R204", ""},
		{5, 2, "MUS", "IVE", "MUSR", ""},
	},
	{ // Thursday
		{1, 1, "GER", "CAS", "R101", ""},
		{2, 1, "HIST", "DUN", "R101", ""},
		{3, 1, "MATH", "AMB", "R101", ""},
		{4, 1, "BIO", "EVE", "LAB2", ""},
		{5, 1, "ENG", "BRO", "R101", ""},
		{6, 1, "PHY", "FAI", "LAB1", ""},
	},
	{ // Friday
		{1, 2, "CS", "GRE", "CS2", ""},
		{3, 1, "MATH", "AMB", "R101", ""},
		{4, 1, "CHEM", "EVE", "LAB1", ""},
		{5, 1, "GEO", "DUN", "R204", ""},
	},
}

// plannedExam is placed relative to the Monday of the current week.
type plannedExam struct {
	WeekOffset int
	Weekday    int // 0 = Monday
	Slot       int // index into week[Weekday]
	Name       string
	Type       string
	Grade      string
}

var examPlan = []plannedExam{
	{-2, 3, 0, "Grammar test", "Test", "1"},
	{-1, 0, 4, "Cell biology quiz", "Quiz", "2"},
	{0, 3, 2, "Algebra unit test", "Test", ""},
	{1, 1, 0, "Mechanics test", "Test", ""},
	{1, 3, 4, "Vocabulary quiz", "Quiz", ""},
	{2, 0, 3, "Essay exam", "Exam", ""},
	{2, 4, 0, "Programming project", "Project", ""},
}

// plannedHomework is placed relative to today.
type plannedHomework struct {
	GivenOffset int
	DueOffset   int
	Subject     string
	Teacher     string
	Text        string
	Remark      string
	Completed   bool
	Attachments []string
}

var homeworkPlan = []plannedHomework{
	{-3, 1, "MATH", "AMB", "Exercises 4 to 9 on page 52.", "Show all intermediate steps.", false, nil},
	{-1, 3, "ENG", "BRO", "Write a 300-word essay about your favourite book.", "", false, nil},
	{-6, -1, "PHY", "FAI", "Finish the lab report on the pendulum experiment.", "", false, []string{"lab-report-template.pdf"}},
	{-8, -2, "GER", "CAS", "Read chapter 3 and summarise it in five sentences.", "", true, nil},
	{0, 7, "HIST", "DUN", "Prepare a five-minute presentation on an invention of your choice.", "Slides are optional.", false, []string{"presentation-guide.pdf", "rubric.pdf"}},
	{-2, 5, "CS", "GRE", "Implement and compare two sorting algorithms.", "", false, []string{"starter-code.zip"}},
	{-10, -4, "BIO", "EVE", "Label the parts of the cell on the worksheet.", "", true, []string{"cell-worksheet.pdf"}},
}

// plannedAbsence is placed relative to today.
type plannedAbsence struct {
	DayOffset  int
	Days       int
	StartTime  string
	EndTime    string
	Reason     string
	Text       string
	Excused    bool
	Status     string
	ExcuseText string
}

var absencePlan = []plannedAbsence{
	{-23, 2, "08:00", "15:45", "Illness", "Flu", true, "excused", "Note from parents"},
	{-12, 1, "10:00", "11:45", "Appointment", "Doctor's appointment", true, "excused", "Confirmation attached"},
	{-4, 1, "08:00", "08:50", "Late", "Missed the bus", false, "open", ""},
}

type plannedMessage struct {
	DayOffset   int
	Subject     string
	Preview     string
	From        string
	Read        bool
	Attachments bool
}

var messagePlan = []plannedMessage{
	{0, "Room change on Thursday", "Due to maintenance, chemistry moves to lab 1 this week.", "Office", false, false},
	{-2, "Parent-teacher evening", "Booking for the parent-teacher evening is now open.", "Office", false, true},
	{-6, "Sports day", "Please bring sports clothes and water.", "Mr. Fairbanks", true, false},
	{-15, "Welcome back", "We wish everyone a good start into the new term.", "Principal", true, false},
}
