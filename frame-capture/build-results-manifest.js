#!/usr/bin/env node
/**
 * Build a manifest of matching result frames for the client UI.
 * Writes to ../results/manifest.json
 */

const fs = require("fs");
const path = require("path");

const resultsDir = path.join(__dirname, "..", "results");
const manifestPath = path.join(resultsDir, "manifest.json");

function parseTimecode(str) {
  const match = str.match(/(\d+)m(\d+)s(\d+)ms/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const milliseconds = parseInt(match[3], 10);
  return minutes * 60 + seconds + milliseconds / 1000;
}

function buildManifest() {
  if (!fs.existsSync(resultsDir)) {
    throw new Error(`Results directory not found: ${resultsDir}`);
  }

  const files = fs
    .readdirSync(resultsDir)
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

buildManifest();

