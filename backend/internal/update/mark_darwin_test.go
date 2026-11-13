package update

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestQuarantineAttribute(t *testing.T) {
	file := write(t, filepath.Join(t.TempDir(), "Untis_1.1.0_universal.dmg"), "image")
	if err := markDownloaded(file, ""); err != nil {
		t.Fatal(err)
	}
	out, err := exec.Command("/usr/bin/xattr", "-p", "com.apple.quarantine", file).Output()
	if err != nil || !strings.HasPrefix(string(out), "0081;") {
		t.Errorf("quarantine = %q, err = %v", out, err)
	}
}
