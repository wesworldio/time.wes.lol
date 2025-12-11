.ONESHELL:
.PHONY: help install run clean venv frame-capture serve results-manifest search-manifest

VENV = venv
PYTHON = $(VENV)/bin/python3

help:
	@echo "Available commands:"
	@echo "  make install  - Install Python dependencies"
	@echo "  make run      - Clean results, run matcher, regenerate manifests"
	@echo "  make clean    - Clean results folder"
	@echo "  make frame-capture - Show path to the frame capture tool"
	@echo "  make serve    - Serve the UI at http://localhost:8000/"
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

run: install clean
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
	@echo "Serving at http://localhost:8000/ (Ctrl+C to stop)..."
	@python3 -m http.server 8000

results-manifest:
	@node frame-capture/build-results-manifest.js

search-manifest:
	@node frame-capture/build-search-manifest.js

