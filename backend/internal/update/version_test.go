package update

import "testing"

func TestParseVersion(t *testing.T) {
	for in, want := range map[string]string{
		"1.0.0": "1.0.0", "v1.2.3": "1.2.3", "0.10.7": "0.10.7", "v10.20.30": "10.20.30",
	} {
		if v, ok := ParseVersion(in); !ok || v.String() != want {
			t.Errorf("ParseVersion(%q) = %v %v, want %s", in, v, ok, want)
		}
	}
	// development builds, pre-releases and anything that could end up in
	// a path or URL in an unexpected way
	for _, in := range []string{"", "dev", "1.0", "1.0.0.0", "1.0.0-rc1", "v1.0.0+build", "01.0.0", "1.0.x", "V1.0.0", " 1.0.0", "1.0.0/..", "-1.0.0", "1.0.9999999"} {
		if v, ok := ParseVersion(in); ok {
			t.Errorf("ParseVersion(%q) accepted as %v", in, v)
		}
	}
}

func TestVersionOrder(t *testing.T) {
	// numeric, not alphabetic: 1.10.0 is newer than 1.9.0
	ordered := []string{"0.9.9", "1.0.0", "1.0.1", "1.0.10", "1.1.0", "1.9.0", "1.10.0", "2.0.0", "10.0.0"}
	for i, a := range ordered {
		for j, b := range ordered {
			va, _ := ParseVersion(a)
			vb, _ := ParseVersion(b)
			if got := va.Less(vb); got != (i < j) {
				t.Errorf("%s < %s = %v", a, b, got)
			}
		}
	}
}
