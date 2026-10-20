package cli

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
)

// Result is the outcome of one CLI invocation.
type Result struct {
	Stdout   []byte
	Stderr   []byte
	ExitCode int
}

// Runner executes a program. It exists so tests never spawn the real
// untis binary (which would talk to a real WebUntis account).
type Runner interface {
	// Run returns a Result for every process that ran, whatever its exit
	// code; err is only set when the process could not run at all.
	Run(ctx context.Context, name string, args []string) (Result, error)
}

// ExecRunner runs programs with os/exec.
type ExecRunner struct {
	// Env is appended to the current environment.
	Env []string
}

func (r ExecRunner) Run(ctx context.Context, name string, args []string) (Result, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = append(os.Environ(), r.Env...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr

	err := cmd.Run()
	res := Result{Stdout: stdout.Bytes(), Stderr: stderr.Bytes()}
	var exitErr *exec.ExitError
	switch {
	case err == nil:
		return res, nil
	case ctx.Err() != nil:
		return res, ctx.Err()
	case errors.As(err, &exitErr):
		res.ExitCode = exitErr.ExitCode()
		return res, nil
	default:
		return res, err
	}
}
