package update

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

// ChecksumFile is the release file listing the SHA-256 of every other one.
const ChecksumFile = "SHA256SUMS"

// maxAsset is the largest file the updater downloads; the biggest release
// file today is well below it.
const maxAsset = 1 << 30

// parseChecksums reads `sha256sum` output: "<hex>  <name>" per line, with
// an optional "*" (binary mode) in front of the name.
func parseChecksums(data []byte) map[string]string {
	sums := map[string]string{}
	sc := bufio.NewScanner(bytes.NewReader(data))
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) != 2 || len(fields[0]) != sha256.Size*2 {
			continue
		}
		if _, err := hex.DecodeString(fields[0]); err != nil {
			continue
		}
		sums[strings.TrimPrefix(fields[1], "*")] = strings.ToLower(fields[0])
	}
	return sums
}

// checksum fetches the expected SHA-256 of one file of a release.
func (c *client) checksum(ctx context.Context, rel *Release, name string) (string, error) {
	if _, ok := rel.Assets[ChecksumFile]; !ok {
		return "", fmt.Errorf("release %s has no %s, so the download cannot be verified", rel.Tag, ChecksumFile)
	}
	res, err := c.get(ctx, c.src.AssetURL(rel.Tag, ChecksumFile), nil)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("downloading %s: %s", ChecksumFile, res.Status)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return "", err
	}
	sum, ok := parseChecksums(data)[name]
	if !ok {
		return "", fmt.Errorf("%s of release %s does not list %s", ChecksumFile, rel.Tag, name)
	}
	return sum, nil
}

// download stores one file of a release in dst and verifies its size and
// checksum. On any error dst must be discarded by the caller.
func (c *client) download(ctx context.Context, rel *Release, name string, dst *os.File, progress func(done int64)) error {
	size, ok := rel.Assets[name]
	if !ok {
		return fmt.Errorf("release %s has no file %s", rel.Tag, name)
	}
	if size <= 0 || size > maxAsset {
		return fmt.Errorf("%s has an implausible size of %d bytes", name, size)
	}
	want, err := c.checksum(ctx, rel, name)
	if err != nil {
		return err
	}

	res, err := c.get(ctx, c.src.AssetURL(rel.Tag, name), map[string]string{"Accept": "application/octet-stream"})
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("downloading %s: %s", name, res.Status)
	}

	hash := sha256.New()
	var done int64
	buf := make([]byte, 256<<10)
	// One byte more than announced is read, so an oversized answer is
	// noticed instead of silently cut off.
	body := io.LimitReader(res.Body, size+1)
	for {
		n, rerr := body.Read(buf)
		if n > 0 {
			if _, err := dst.Write(buf[:n]); err != nil {
				return err
			}
			hash.Write(buf[:n])
			done += int64(n)
			if progress != nil {
				progress(done)
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return fmt.Errorf("downloading %s: %w", name, rerr)
		}
	}
	if done != size {
		return fmt.Errorf("%s is %d bytes, the release lists %d", name, done, size)
	}
	if got := hex.EncodeToString(hash.Sum(nil)); got != want {
		return fmt.Errorf("%s does not match its checksum (got %s, want %s); nothing was installed", name, got, want)
	}
	return dst.Sync()
}
