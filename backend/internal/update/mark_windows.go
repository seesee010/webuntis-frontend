package update

import "os"

// markDownloaded gives the file the "Mark of the Web" browsers set on
// downloads (zone 3, internet), so Windows runs its SmartScreen and
// attachment checks when the installer is opened.
func markDownloaded(file, from string) error {
	return os.WriteFile(file+":Zone.Identifier", []byte("[ZoneTransfer]\r\nZoneId=3\r\nHostUrl="+from+"\r\n"), 0o644)
}
