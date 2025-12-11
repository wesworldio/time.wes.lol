#!/usr/bin/env node
/**
 * Build a manifest of matching result frames for the client UI.
 * Writes to ../data/results/.../manifest.json
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const configPath = path.join(rootDir, "config.json");

function loadDatasets() {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.datasets) && parsed.datasets.length) {
      return parsed.datasets;
    }
  } catch (err) {
    console.warn("No config.json found or could not parse it. Using default results directory.", err.message);
  }

  return [{ id: "default", resultsDir: "data/results" }];
}

function parseTimecode(str) {
  const match = str.match(/(\d+)m(\d+)s(\d+)ms/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const milliseconds = parseInt(match[3], 10);
  return minutes * 60 + seconds + milliseconds / 1000;
}

function buildManifestForDataset(dataset) {
  const dir = path.join(rootDir, dataset.resultsDir || "results");
  const manifestPath = path.join(dir, "manifest.json");

  if (!fs.existsSync(dir)) {
    console.warn(`Results directory not found for dataset "${dataset.id}": ${dir}`);
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort();

  const entries = [];

  for (const filename of files) {
    const frameMatch = filename.match(/frame_(\d+)_t(\d+m\d+s\d+ms)/);
    if (!frameMatch) continue;

    const frameNumber = parseInt(frameMatch[1], 10);
    const timecode = frameMatch[2];
    const seconds = parseTimecode(timecode);
    if (seconds === null) continue;

    entries.push({
      filename,
      frameNumber,
      timecode,
      seconds,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: entries.length,
    files: entries,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote manifest with ${entries.length} entries to ${manifestPath}`);
}

function buildManifest() {
  const datasets = loadDatasets();
  datasets.forEach(buildManifestForDataset);
}

buildManifest();

