package update

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMarkOfTheWeb(t *testing.T) {
	file := write(t, filepath.Join(t.TempDir(), "Untis_1.1.0_x64-setup.exe"), "installer")
	if err := markDownloaded(file, "https://github.com/o/r/releases/download/v1.1.0/x.exe"); err != nil {
		t.Fatal(err)
	}
	zone, err := os.ReadFile(file + ":Zone.Identifier")
	if err != nil || !strings.Contains(string(zone), "ZoneId=3") {
		t.Errorf("zone = %q, err = %v", zone, err)
	}
	if read(t, file) != "installer" {
		t.Error("the file itself was changed")
	}
}
