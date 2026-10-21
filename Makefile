# Top-level tasks for the untis desktop GUI.
#   make dev       run backend (sample data) + frontend in the browser
#   make app       run the full Tauri desktop app
#   make test      run all tests
#   make build     build the backend sidecar and the desktop bundle

BACKEND   := backend
DESKTOP   := desktop
TRIPLE    := $(shell rustc -vV 2>/dev/null | sed -n 's/^host: //p')
SIDECAR   := $(DESKTOP)/src-tauri/binaries/untisd-$(TRIPLE)

.PHONY: all dev backend-dev app test lint build sidecar backend-test frontend-test shell-test clean

all: test

backend-test:
	cd $(BACKEND) && go vet ./... && go test ./...

frontend-test:
	cd $(DESKTOP) && pnpm typecheck && pnpm test

# The shell needs the sidecar binary and a dist/ folder to compile.
shell-test: sidecar
	mkdir -p $(DESKTOP)/dist
	cd $(DESKTOP)/src-tauri && cargo test --quiet

test: backend-test frontend-test shell-test

lint: backend-test
	cd $(DESKTOP) && pnpm typecheck

sidecar:
	mkdir -p $(dir $(SIDECAR))
	cd $(BACKEND) && go build -trimpath -ldflags "-s -w" -o ../$(SIDECAR) ./cmd/untisd

# Browser development: run backend-dev and dev in two terminals.
backend-dev:
	cd $(BACKEND) && go run ./cmd/untisd -dev

dev:
	cd $(DESKTOP) && pnpm dev

app: sidecar
	cd $(DESKTOP) && pnpm tauri dev

build: sidecar
	cd $(DESKTOP) && pnpm tauri build

clean:
	rm -rf $(DESKTOP)/dist $(DESKTOP)/src-tauri/binaries $(BACKEND)/bin
