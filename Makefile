.ONESHELL:
.PHONY: help install run clean venv frame-capture serve serve-bg results-manifest search-manifest

VENV = venv
PYTHON = $(VENV)/bin/python3
SERVER_PORT ?= 8000
SERVER_PID = .serve.pid

help:
	@echo "Available commands:"
	@echo "  make install  - Install Python dependencies"
	@echo "  make run      - Clean results, run matcher, regenerate manifests"
	@echo "  make clean    - Clean results folder"
	@echo "  make frame-capture - Show path to the frame capture tool"
	@echo "  make serve    - Serve the UI at http://localhost:8000/"
	@echo "  make serve-bg - Start the UI server in background"
	@echo "  make results-manifest - Generate results/manifest.json for the UI"
	@echo "  make search-manifest - Generate search/manifest.json for the UI"

venv:
	@if [ ! -d "$(VENV)" ]; then \
		echo "Creating virtual environment..."; \
		python3 -m venv $(VENV); \
	fi

install: venv
	@echo "Installing dependencies..."
	@$(PYTHON) -m pip install --upgrade pip
	@$(PYTHON) -m pip install -r requirements.txt

run: install serve-bg clean
	@echo "Running similarity matcher..."
	@$(PYTHON) find_similar.py
	@echo "Regenerating results manifest..."
	@node frame-capture/build-results-manifest.js
	@echo "Regenerating search manifest..."
	@node frame-capture/build-search-manifest.js

clean:
	@echo "Cleaning results folder..."
	@rm -rf results
	@mkdir -p results

frame-capture:
	@echo "Open this file in your browser:"
	@echo "file://$(PWD)/frame-capture/index.html"

serve:
	@echo "Refreshing manifests..."
	@node frame-capture/build-results-manifest.js
	@node frame-capture/build-search-manifest.js
	@echo "Serving at http://localhost:$(SERVER_PORT)/ (Ctrl+C to stop)..."
	@python3 -m http.server $(SERVER_PORT)

serve-bg:
	@echo "Ensuring server is running at http://localhost:$(SERVER_PORT)/ ..."
	@if [ -f "$(SERVER_PID)" ] && ps -p $$(cat $(SERVER_PID)) > /dev/null 2>&1; then \
		echo "Server already running (pid $$(cat $(SERVER_PID)))."; \
	else \
		echo "Starting server in background..."; \
		nohup python3 -m http.server $(SERVER_PORT) > /tmp/time-serve.log 2>&1 & echo $$! > $(SERVER_PID); \
		echo "Started server pid $$(cat $(SERVER_PID)) (log: /tmp/time-serve.log)"; \
	fi
	@echo "Refreshing manifests..."
	@node frame-capture/build-results-manifest.js
	@node frame-capture/build-search-manifest.js

results-manifest:
	@node frame-capture/build-results-manifest.js

search-manifest:
	@node frame-capture/build-search-manifest.js

