// Package update finds newer releases of the app and installs them when
// the user asks for it.
//
// Nothing here runs on its own beyond the check: the backend asks GitHub
// for the latest release (at most once a day, and only when the setting
// allows it), and the frontend shows an update button when that release
// is newer than the running version. Downloading and installing only
// happen after the user pressed that button.
//
// Which file is downloaded depends on how the app was installed (see
// Install): the same release carries an AppImage, packages, installers,
// portable archives and the web edition for many platforms, and only the
// one that matches the running installation is ever used. Every download
// is checked against the release's SHA256SUMS before it is touched.
package update

import (
	"fmt"
	"regexp"
	"strconv"
)

// Version is a release version: major, minor, patch.
type Version [3]int

var versionRE = regexp.MustCompile(`^v?(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$`)

// ParseVersion accepts "1.2.3" and "v1.2.3". Anything else, including
// pre-releases such as "1.2.3-rc1" and development builds ("dev"), is not
// a release version.
func ParseVersion(s string) (Version, bool) {
	m := versionRE.FindStringSubmatch(s)
	if m == nil {
		return Version{}, false
	}
	var v Version
	for i := range v {
		v[i], _ = strconv.Atoi(m[i+1])
	}
	return v, true
}

// Less reports whether v is older than o.
func (v Version) Less(o Version) bool {
	for i := range v {
		if v[i] != o[i] {
			return v[i] < o[i]
		}
	}
	return false
}

func (v Version) String() string { return fmt.Sprintf("%d.%d.%d", v[0], v[1], v[2]) }
