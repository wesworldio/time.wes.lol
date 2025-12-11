#!/usr/bin/env node
/**
 * Build a manifest of training images in data/search/ for the UI.
 * Writes to ../data/search/.../manifest.json
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const configPath = path.join(rootDir, "config.json");
const exts = new Set([".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tiff", ".tif"]);

function loadDatasets() {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.datasets) && parsed.datasets.length) {
      return parsed.datasets;
    }
  } catch (err) {
    console.warn("No config.json found or could not parse it. Using default search directory.", err.message);
  }

  return [{ id: "default", searchDir: "data/search" }];
}

function buildManifestForDataset(dataset) {
  const searchDir = path.join(rootDir, dataset.searchDir || "search");
  const manifestPath = path.join(searchDir, "manifest.json");

  if (!fs.existsSync(searchDir)) {
    console.warn(`Search directory not found for dataset "${dataset.id}": ${searchDir}`);
    return;
  }

  const files = fs
    .readdirSync(searchDir)
    .filter((f) => exts.has(path.extname(f).toLowerCase()))
    .sort();

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: files.length,
    files: files.map((filename) => ({ filename })),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote search manifest with ${files.length} entries to ${manifestPath}`);
}

function buildManifest() {
  const datasets = loadDatasets();
  datasets.forEach(buildManifestForDataset);
}

buildManifest();

