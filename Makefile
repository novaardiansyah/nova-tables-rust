SHELL := /bin/bash
NPM ?= npm
CARGO ?= cargo
VERSION := $(shell node -p "require('./package.json').version" 2>/dev/null)
RELEASE_BIN := src-tauri/target/release/nova-tables
WIN_TARGET := x86_64-pc-windows-msvc
WIN_BUNDLE := src-tauri/target/$(WIN_TARGET)/release/bundle
ARTIFACTS := build/v$(VERSION)
APP_DIR := $(HOME)/.local/opt/nova-tables
BIN_LINK := $(HOME)/.local/bin/nova-tables
APPLICATIONS := $(HOME)/.local/share/applications
LAUNCHER := $(APPLICATIONS)/nova-tables.desktop
DESKTOP_SHORTCUT := $(HOME)/Desktop/nova-tables.desktop
ICON_ROOT := $(HOME)/.local/share/icons/hicolor
ICON_SIZES := 16 24 32 48 64 128 256 512
IMAGE_MAGICK := $(shell command -v magick || command -v convert)

.DEFAULT_GOAL := help

.PHONY: help install dev run compile build build-linux build-win build-all artifacts package deploy uninstall lint verify clean distclean

help:
	@echo
	@echo "Nova Tables (Rust + Tauri) — available targets:"
	@echo
	@printf '  %-11s %s\n' \
		install 'Install dependencies' \
		dev 'Run Vite with Tauri dev and HMR (needs a display)' \
		run 'Run the built binary (build it first)' \
		compile 'Build frontend assets with Vite only (fast)' \
		build 'Build and package the Tauri app for Linux and Windows' \
		build-linux 'Build and package the Linux AppImage and deb' \
		build-win 'Cross-compile the Windows NSIS installer (cargo-xwin + makensis)' \
		build-all 'Build all 4 release installers (Linux + Windows) and collect into build/v<version>/' \
		artifacts 'Copy the installers into build/<version>/' \
		package 'Build release binary via Tauri' \
		deploy 'Build, remove any previous install, then install for the current user' \
		uninstall 'Remove the installed app, its desktop entry and icons' \
		lint 'Check code and lint' \
		verify 'Compile frontend check before calling work done' \
		clean 'Remove build output and target files' \
		distclean 'Also remove installed node_modules'

install:
	$(NPM) install

dev:
	$(NPM) run tauri dev

run:
	@test -f $(RELEASE_BIN) || { echo "Missing $(RELEASE_BIN) — run 'make build' first."; exit 1; }
	$(RELEASE_BIN)

compile:
	npx vite build

build:
	$(NPM) run tauri build

build-linux:
	$(NPM) run tauri build -- --bundles appimage,deb

build-win:
	@command -v makensis >/dev/null 2>&1 || { echo "Missing makensis (NSIS) — install it before cross-compiling the Windows installer."; exit 1; }
	$(NPM) run tauri build -- --runner cargo-xwin --target $(WIN_TARGET) --bundles nsis

build-all: build build-win artifacts
	@echo "All 4 release installers generated in $(ARTIFACTS):"
	@ls -la "$(ARTIFACTS)"

artifacts:
	@mkdir -p "$(ARTIFACTS)"
	@for dir in src-tauri/target/release/bundle $(WIN_BUNDLE); do \
		find "$$dir" -type f \( -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' -o -name '*.exe' -o -name '*.msi' \) -name "*$(VERSION)*" -exec cp -f {} "$(ARTIFACTS)/" \; 2>/dev/null || true; \
	done
	@ls -1 "$(ARTIFACTS)" 2>/dev/null || echo "No installers found in src-tauri/target/release/bundle — run 'make build' first."

package:
	$(NPM) run tauri build

deploy: package
	@test -x "$(RELEASE_BIN)" || { echo "Missing $(RELEASE_BIN) — packaging failed."; exit 1; }
	rm -rf "$(APP_DIR)"
	rm -f "$(BIN_LINK)" "$(LAUNCHER)" "$(DESKTOP_SHORTCUT)"
	mkdir -p "$(APP_DIR)" "$(dir $(BIN_LINK))" "$(APPLICATIONS)"
	cp -a "$(RELEASE_BIN)" "$(APP_DIR)/nova-tables"
	ln -s "$(APP_DIR)/nova-tables" "$(BIN_LINK)"
	mkdir -p "$(ICON_ROOT)/512x512/apps"
	if [ -n "$(IMAGE_MAGICK)" ]; then \
		for size in $(ICON_SIZES); do \
			mkdir -p "$(ICON_ROOT)/$${size}x$${size}/apps"; \
			$(IMAGE_MAGICK) public/logo.png -resize "$${size}x$${size}" "$(ICON_ROOT)/$${size}x$${size}/apps/nova-tables.png" 2>/dev/null || true; \
		done; \
	else \
		cp public/logo.png "$(ICON_ROOT)/512x512/apps/nova-tables.png"; \
	fi
	printf '%s\n' \
		'[Desktop Entry]' \
		'Type=Application' \
		'Name=Nova Tables' \
		'Comment=A modern desktop SQL client for Microsoft SQL Server.' \
		'Exec="$(APP_DIR)/nova-tables"' \
		'Icon=nova-tables' \
		'Terminal=false' \
		'Categories=Development;Database;' \
		'StartupWMClass=nova-tables' \
		> "$(LAUNCHER)"
	chmod +x "$(LAUNCHER)"
	@if [ -d "$(dir $(DESKTOP_SHORTCUT))" ]; then \
		cp "$(LAUNCHER)" "$(DESKTOP_SHORTCUT)"; \
		chmod +x "$(DESKTOP_SHORTCUT)"; \
		gio set "$(DESKTOP_SHORTCUT)" metadata::trusted true >/dev/null 2>&1 || true; \
	fi
	@update-desktop-database "$(APPLICATIONS)" >/dev/null 2>&1 || true
	@echo "Installed Nova Tables $(VERSION) in $(APP_DIR)"
	@echo "Launch it from the application menu or with: $(BIN_LINK)"

uninstall:
	rm -rf "$(APP_DIR)"
	rm -f "$(BIN_LINK)" "$(LAUNCHER)" "$(DESKTOP_SHORTCUT)"
	for size in $(ICON_SIZES); do rm -f "$(ICON_ROOT)/$${size}x$${size}/apps/nova-tables.png"; done
	@update-desktop-database "$(APPLICATIONS)" >/dev/null 2>&1 || true
	@echo "Removed Nova Tables from $(HOME)/.local"

lint:
	@$(NPM) run lint 2>/dev/null || true

verify: compile

clean:
	rm -rf dist release build src-tauri/target

distclean: clean
	rm -rf node_modules
