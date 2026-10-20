// Command untisd is the local backend of the untis desktop GUI.
//
// It drives the untis CLI (or a built-in sample data provider) and
// serves the results to the frontend over a loopback-only HTTP API.
package main

import (
	"flag"
	"fmt"
	"os"
)

var version = "dev"

func main() {
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println("untisd", version)
		return
	}
	fmt.Fprintln(os.Stderr, "untisd: nothing to do yet")
}
