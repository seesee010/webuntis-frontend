//go:build unix

package main

import (
	"os"
	"syscall"
)

// canReexec: on Unix the running process can be replaced by the updated
// program in place, keeping its PID, terminal and arguments.
const canReexec = true

// reexec replaces this process with exe, started with the same arguments
// and the extra environment. It only returns on failure.
func reexec(exe string, env []string) error {
	return syscall.Exec(exe, os.Args, append(os.Environ(), env...))
}
