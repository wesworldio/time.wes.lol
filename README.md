# Image and Video Similarity Matcher

A cross-platform tool that finds similar images and video frames by comparing assets against training images in the search folder.

## How It Works

1. **Training Data Loading**: The script loads all images from the `search/` folder and extracts visual features using ORB (Oriented FAST and Rotated BRIEF) feature detection.

2. **Feature Extraction**: For each search image, the script extracts keypoints and descriptors that represent distinctive visual patterns.

3. **Asset Processing**:
   - **Images**: Each image in the `assets/` folder is compared against all search images using feature matching.
   - **Videos**: Videos are processed frame-by-frame (every 30 frames by default). Each frame is compared against search images, and matching frames are saved with their timestamp.

4. **Matching Algorithm**: Uses FLANN (Fast Library for Approximate Nearest Neighbors) matcher with a ratio test to find good matches. A match score is calculated based on the ratio of good matches to total matches.

5. **Results**: Matches are saved to the `results/` folder with filenames that include:
   - Original asset name
   - Match score
   - For video frames: frame number and timestamp
   - Search image name that matched

## Requirements

- Python 3.7 or higher
- OpenCV (opencv-python)
- NumPy

## Installation

Install dependencies:

```bash
make install
```

Or manually:

```bash
pip install -r requirements.txt
```

## Usage

Run the similarity matcher:

```bash
make run
```

Or directly:

```bash
python3 find_similar.py
```

## Project Structure

```
.
├── search/          # Training images (what to search for)
├── assets/          # Images and videos to search through
├── results/         # Output folder for matches
├── find_similar.py  # Main script
├── requirements.txt # Python dependencies
├── Makefile         # Build commands
└── README.md        # This file
```

## How Matching Works

The script uses computer vision feature matching:

1. **ORB Feature Detection**: Extracts distinctive keypoints and descriptors from images
2. **FLANN Matching**: Efficiently matches features between search images and assets
3. **Ratio Test**: Filters matches using Lowe's ratio test to reduce false positives
4. **Match Score**: Calculates similarity as the ratio of good matches to total matches

A match is considered valid when the match score is above 0.3 (30% similarity threshold).

## Output Files

Results are saved with sanitized filenames that include:
- Original asset name
- Match information
- Timestamp (for video frames)
- Match score

Example: `wesjerryspringer_frame_120_t00m04s00ms_match_G73QFLrXkAIomDF_0.456.png`

## Cross-Platform Support

The script works on:
- Linux
- macOS
- Windows

Python and the required libraries handle platform differences automatically.

## Customization

You can modify the script to adjust:
- **Match threshold**: Change the `threshold` parameter (default: 0.3) in `process_image()` and `process_video()` functions
- **Frame interval**: Change `frame_interval` (default: 30) in `process_video()` to process more or fewer frames
- **Feature count**: Adjust `nfeatures` in `extract_features()` to extract more or fewer features

## Troubleshooting

- **No matches found**: Try lowering the threshold or ensure search images are similar to assets
- **Slow processing**: Increase `frame_interval` for videos or reduce `nfeatures` for faster processing
- **Missing dependencies**: Run `make install` to ensure all packages are installed

## Hosting the frame capture tool (GitHub Pages)

You can host `frame-capture/index.html` on GitHub Pages and point `time.wes.lol` to it.

Steps:
1. Add your repo to GitHub (if not already).
2. Keep `index.html` in the repo root, and keep `assets/`, `results/`, and `search/` in the root.
3. Create/keep the `CNAME` file with `time.wes.lol` in the repo root (already added).
4. In GitHub: Settings → Pages → Source: deploy from `main` branch, `/ (root)`.
5. Wait for the site to build; it will be available at `https://time.wes.lol/`.
6. Point your DNS `CNAME` for `time.wes.lol` to `wesworldio.github.io`.
7. Verify at `https://time.wes.lol/`.

Notes:
- When hosted on GitHub Pages (HTTPS, same-origin), CORS/tainted canvas issues go away and the video and PNG loads work without using the file input.
- Ensure `assets/wesjerryspringer.mov` and `results/*.png` are committed so the page can access them.

### Results manifest for dynamic grid
- The UI reads `results/manifest.json` to show matching frames.
- Generate it after new matches: `make results-manifest`
- Manifest is written to `results/manifest.json` (committed so Pages can serve it).

## Frame Capture Tool (file://)

A lightweight, offline HTML tool to grab frame crops for new training images.

Location: `frame-capture/index.html`

How to use:
- Open the file locally in your browser: `file:///.../frame-capture/index.html`
- Load a video file.
- Enter a timestamp (seconds) and click “Go to time”, then “Capture current frame”.
- Drag on the canvas to draw a crop box; click “Save crop” (or “Save full frame”).
- Move the downloaded PNGs into the `search/` folder to train with them.

Notes:
- This runs fully offline; it does not need a server.
- Browsers may block direct writes to disk from `file://`. The tool downloads the PNG; just move it into `search/`.

