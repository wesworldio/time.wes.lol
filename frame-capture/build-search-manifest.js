#!/usr/bin/env node
/**
 * Build a manifest of training images in search/ for the UI.
 * Writes to ../search/manifest.json
 */

const fs = require("fs");
const path = require("path");

const searchDir = path.join(__dirname, "..", "search");
const manifestPath = path.join(searchDir, "manifest.json");
const exts = new Set([".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tiff", ".tif"]);

function buildManifest() {
  if (!fs.existsSync(searchDir)) {
    throw new Error(`Search directory not found: ${searchDir}`);
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

buildManifest();

