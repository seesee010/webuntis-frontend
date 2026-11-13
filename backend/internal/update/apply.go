package update

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	tmpPattern = ".untis-update-*"
	// oldSuffix marks the replaced file. Windows cannot delete a running
	// program, only rename it, so the old one stays until the next start.
	oldSuffix = ".old"
	// maxBinary bounds one extracted program.
	maxBinary = 512 << 20
)

// placement is a finished temporary file and the path it belongs at.
type placement struct{ tmp, target string }

// place puts new files where the old ones are. Each old file is moved
// aside first and moved back if a later step fails, so the installation
// is either fully updated or left as it was.
func place(files []placement) (err error) {
	var moved, installed []placement
	defer func() {
		if err == nil {
			return
		}
		for _, f := range installed {
			_ = os.Remove(f.target)
		}
		for _, f := range moved {
			_ = os.Rename(f.target+oldSuffix, f.target)
		}
		for _, f := range files {
			_ = os.Remove(f.tmp)
		}
	}()
	for _, f := range files {
		_ = os.Remove(f.target + oldSuffix)
		if rerr := os.Rename(f.target, f.target+oldSuffix); rerr == nil {
			moved = append(moved, f)
		} else if !errors.Is(rerr, os.ErrNotExist) {
			return fmt.Errorf("cannot replace %s: %w", f.target, rerr)
		}
		if rerr := os.Rename(f.tmp, f.target); rerr != nil {
			return fmt.Errorf("cannot install %s: %w", f.target, rerr)
		}
		installed = append(installed, f)
	}
	for _, f := range moved {
		_ = os.Remove(f.target + oldSuffix) // fails on Windows while the old program runs
	}
	return nil
}

// RemoveLeftovers deletes what an earlier update could not: replaced
// files that were still running and temporary files of an interrupted
// download. It is called on start.
func RemoveLeftovers(in Install) {
	var targets []string
	switch in.Kind {
	case KindWeb:
		targets = []string{in.Exe}
	case KindPortable:
		targets = []string{in.Exe, filepath.Join(filepath.Dir(in.Exe), shellName(in.OS))}
	case KindAppImage:
		targets = []string{in.AppImage}
	}
	dirs := map[string]bool{}
	for _, t := range targets {
		_ = os.Remove(t + oldSuffix)
		dirs[filepath.Dir(t)] = true
	}
	for dir := range dirs {
		stale, _ := filepath.Glob(filepath.Join(dir, tmpPattern))
		for _, f := range stale {
			_ = os.Remove(f)
		}
	}
}

func shellName(goos string) string {
	if goos == "windows" {
		return "untis-desktop.exe"
	}
	return "untis-desktop"
}

func backendName(goos string) string {
	if goos == "windows" {
		return "untisd.exe"
	}
	return "untisd"
}

// newTemp creates a temporary file next to target, so the final rename
// stays on one file system and a missing write permission shows up before
// anything is downloaded.
func newTemp(dir string) (*os.File, error) {
	f, err := os.CreateTemp(dir, tmpPattern)
	if err != nil {
		return nil, fmt.Errorf("the update needs write access to %s: %w", dir, err)
	}
	return f, nil
}

// extract unpacks the programs named in wanted (archive base name ->
// target path) from a release archive into temporary files next to their
// targets. Everything else in the archive is ignored, and an archive that
// lacks one of them is rejected.
func extract(archive string, zipped bool, wanted map[string]string) (out []placement, err error) {
	defer func() {
		if err != nil {
			for _, p := range out {
				_ = os.Remove(p.tmp)
			}
			out = nil
		}
	}()
	found := map[string]bool{}
	save := func(name string, r io.Reader) error {
		target, ok := wanted[path.Base(name)]
		if !ok || found[path.Base(name)] {
			return nil
		}
		tmp, err := newTemp(filepath.Dir(target))
		if err != nil {
			return err
		}
		out = append(out, placement{tmp.Name(), target})
		n, err := io.Copy(tmp, io.LimitReader(r, maxBinary+1))
		if err == nil && n > maxBinary {
			err = fmt.Errorf("%s in the archive is larger than %d bytes", name, maxBinary)
		}
		if err == nil {
			err = tmp.Sync()
		}
		if cerr := tmp.Close(); err == nil {
			err = cerr
		}
		if err == nil {
			err = os.Chmod(tmp.Name(), 0o755)
		}
		found[path.Base(name)] = err == nil
		return err
	}

	if zipped {
		zr, err := zip.OpenReader(archive)
		if err != nil {
			return nil, err
		}
		defer zr.Close()
		for _, f := range zr.File {
			if !f.Mode().IsRegular() {
				continue
			}
			rc, err := f.Open()
			if err != nil {
				return out, err
			}
			err = save(strings.ReplaceAll(f.Name, `\`, "/"), rc)
			rc.Close()
			if err != nil {
				return out, err
			}
		}
	} else {
		f, err := os.Open(archive)
		if err != nil {
			return nil, err
		}
		defer f.Close()
		gz, err := gzip.NewReader(f)
		if err != nil {
			return nil, err
		}
		tr := tar.NewReader(gz)
		for {
			hdr, err := tr.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return out, err
			}
			if hdr.Typeflag != tar.TypeReg {
				continue
			}
			if err := save(hdr.Name, tr); err != nil {
				return out, err
			}
		}
	}
	for name := range wanted {
		if !found[name] {
			return out, fmt.Errorf("the archive does not contain %s", name)
		}
	}
	return out, nil
}

// DownloadsDir is where installers and packages are saved: the user's
// download folder, or a cache folder when there is none.
func DownloadsDir() (string, error) {
	isDir := func(p string) bool { st, err := os.Stat(p); return err == nil && st.IsDir() }
	home, homeErr := os.UserHomeDir()
	if runtime.GOOS != "windows" && runtime.GOOS != "darwin" {
		if tool, err := exec.LookPath("xdg-user-dir"); err == nil {
			if out, err := exec.Command(tool, "DOWNLOAD").Output(); err == nil {
				if dir := strings.TrimSpace(string(out)); dir != "" && filepath.Clean(dir) != filepath.Clean(home) && isDir(dir) {
					return dir, nil
				}
			}
		}
	}
	// xdg-user-dir answers $HOME when no download folder is configured;
	// files are not dropped into the home directory itself.
	if homeErr == nil {
		if dir := filepath.Join(home, "Downloads"); isDir(dir) {
			return dir, nil
		}
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(cache, "untis-gui", "updates")
	return dir, os.MkdirAll(dir, 0o700)
}

// installCommand is the command line that installs a downloaded package.
func installCommand(kind Kind, file string) string {
	quoted := "'" + strings.ReplaceAll(file, "'", `'\''`) + "'"
	switch kind {
	case KindDeb:
		return "sudo apt install " + quoted
	case KindRPM:
		return "sudo rpm -Uvh " + quoted
	}
	return ""
}
