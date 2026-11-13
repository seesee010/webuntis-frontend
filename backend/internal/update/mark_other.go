//go:build !windows && !darwin

package update

// markDownloaded does nothing here: only Windows and macOS label
// downloaded files, and only there are installers opened.
func markDownloaded(string, string) error { return nil }
