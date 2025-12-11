# Project Overview

This repo contains two tools:

1. **Similarity matcher (`find_similar.py`)**
   - Uses search images in `search/` to find near-matches across images and videos in `assets/`.
   - Saves matches (with timecodes for video frames) into `results/`.
   - Run via `make run` (installs deps via `make install` if needed).

2. **Frame capture UI (`index.html`)**
   - A browser UI (no backend) to open the video, jump to timestamps, draw a crop box, and save crops/full frames for new training images.
   - When hosted on GitHub Pages (HTTPS, same origin), CORS/taint issues are avoided and saves work normally.
   - Locally on `file://`, use the file input to load `assets/wesjerryspringer.mov` for best results.

## Hosting (GitHub Pages)
- `CNAME` points to `time.wes.lol`.
- Deploy the repo root on GitHub Pages (root or /docs). With the root layout:
  - App: `https://time.wes.lol/` (uses `index.html` in repo root).
  - Assets: `assets/`, Results: `results/`, Search images: `search/`.

## Usage
- Capture tool: open the hosted `index.html`, load `assets/wesjerryspringer.mov`, click matching thumbnails (from `results/`) to jump to that timecode, capture a crop, and move the downloaded PNG into `search/` to improve training data.
- Matcher: `make run` to regenerate matches into `results/` after adding new training images.

## Notes
- Keep `assets/`, `results/`, and `search/` in the repo root so the hosted UI can read them directly.
- If you see canvas export errors locally, load the video via the file input; on Pages (HTTPS), this should not be needed.

