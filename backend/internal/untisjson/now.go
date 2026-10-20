package untisjson

import "encoding/json"

// NowSlot is one slot of `untis --now --format json`. Parallel lessons
// are joined with "/" by the CLI.
type NowSlot struct {
	Subject     string `json:"subject"`
	Teachers    string `json:"teachers"`
	Rooms       string `json:"rooms"`
	Start       string `json:"start"`
	End         string `json:"end"`
	Status      string `json:"status"`
	Date        string `json:"date,omitempty"`
	MinutesLeft *int   `json:"minutes_left,omitempty"`
	StartsIn    *int   `json:"starts_in,omitempty"`
}

// Now is the answer of `untis --now --format json`.
type Now struct {
	Now  *NowSlot `json:"now"`
	Next *NowSlot `json:"next"`
}

// ParseNow decodes the output of `untis --now --format json`.
func ParseNow(data []byte) (*Now, error) {
	var n Now
	if err := json.Unmarshal(data, &n); err != nil {
		return nil, err
	}
	return &n, nil
}
