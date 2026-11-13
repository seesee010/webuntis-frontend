//go:build !unix

package main

import "errors"

// canReexec: Windows (and Plan 9) cannot replace a running process, so
// the web edition asks the user to start it again after an update.
const canReexec = false

func reexec(string, []string) error {
	return errors.New("this platform cannot restart the program in place")
}
