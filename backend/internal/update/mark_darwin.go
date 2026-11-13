package update

import (
	"fmt"
	"os/exec"
	"time"
)

// markDownloaded sets the quarantine attribute browsers set on downloads,
// so Gatekeeper checks the app from the disk image as it would after a
// manual download.
func markDownloaded(file, _ string) error {
	value := fmt.Sprintf("0081;%08x;Untis;", time.Now().Unix())
	return exec.Command("/usr/bin/xattr", "-w", "com.apple.quarantine", value, file).Run()
}
