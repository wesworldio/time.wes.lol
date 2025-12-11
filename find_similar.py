#!/usr/bin/env python3
"""
Cross-platform image and video similarity matcher.
Searches for images similar to training data in data/search folder.
"""

import os
import sys
import json
import cv2
import numpy as np
from pathlib import Path
from typing import List, Tuple, Optional
import re


def sanitize_filename(filename: str) -> str:
    """Convert string to safe filename."""
    filename = re.sub(r'[^\w\s-]', '', filename)
    filename = re.sub(r'[-\s]+', '-', filename)
    return filename[:200]


def extract_features(image: np.ndarray) -> Tuple[cv2.ORB, np.ndarray]:
    """Extract ORB features from image."""
    orb = cv2.ORB_create(nfeatures=2000)
    keypoints, descriptors = orb.detectAndCompute(image, None)
    return keypoints, descriptors


def check_green_color_similarity(img1: np.ndarray, img2: np.ndarray, threshold: float = 0.1) -> bool:
    """Check if both images have similar green color presence."""
    hsv1 = cv2.cvtColor(img1, cv2.COLOR_BGR2HSV)
    hsv2 = cv2.cvtColor(img2, cv2.COLOR_BGR2HSV)
    
    lower_green = np.array([35, 40, 40])
    upper_green = np.array([85, 255, 255])
    
    mask1 = cv2.inRange(hsv1, lower_green, upper_green)
    mask2 = cv2.inRange(hsv2, lower_green, upper_green)
    
    green_ratio1 = np.sum(mask1 > 0) / (img1.shape[0] * img1.shape[1])
    green_ratio2 = np.sum(mask2 > 0) / (img2.shape[0] * img2.shape[1])
    
    if green_ratio1 < threshold and green_ratio2 < threshold:
        return False
    
    if green_ratio1 >= threshold and green_ratio2 >= threshold:
        ratio_diff = abs(green_ratio1 - green_ratio2) / max(green_ratio1, green_ratio2, 0.001)
        return ratio_diff < 0.7
    
    return True


def match_features(desc1: np.ndarray, desc2: np.ndarray, ratio_threshold: float = 0.75) -> float:
    """Match features between two descriptors using FLANN matcher."""
    if desc1 is None or desc2 is None:
        return 0.0
    
    if len(desc1) < 2 or len(desc2) < 2:
        return 0.0
    
    FLANN_INDEX_LSH = 6
    index_params = dict(algorithm=FLANN_INDEX_LSH, table_number=6, key_size=12, multi_probe_level=1)
    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)
    
    try:
        matches = flann.knnMatch(desc1, desc2, k=2)
        good_matches = []
        for match_pair in matches:
            if len(match_pair) == 2:
                m, n = match_pair
                if m.distance < ratio_threshold * n.distance:
                    good_matches.append(m)
        
        if len(matches) == 0:
            return 0.0
        
        match_score = len(good_matches) / len(matches)
        return match_score
    except:
        return 0.0


def load_search_images(search_dir: Path) -> List[Tuple[np.ndarray, str, np.ndarray]]:
    """Load all images from search directory and extract features."""
    search_images = []
    image_extensions = {'.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp'}
    
    for img_path in search_dir.iterdir():
        if img_path.suffix.lower() in image_extensions:
            img = cv2.imread(str(img_path))
            if img is not None:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                keypoints, descriptors = extract_features(gray)
                search_images.append((img, img_path.name, descriptors))
                print(f"Loaded search image: {img_path.name}")
    
    return search_images


def _parse_timecode(timecode: str) -> Optional[float]:
    match = re.match(r"(\d+)m(\d+)s(\d+)ms", timecode)
    if not match:
        return None
    minutes, seconds, millis = match.groups()
    return int(minutes) * 60 + int(seconds) + int(millis) / 1000.0


def _parse_frame_metadata(filename: str) -> Optional[dict]:
    """Extract frameNumber/timecode/seconds from a result filename."""
    match = re.search(r"frame_(\d+)_t(\d+m\d+s\d+ms)", filename)
    if not match:
        return None
    frame_number = int(match.group(1))
    timecode = match.group(2)
    seconds = _parse_timecode(timecode)
    return {
        "filename": filename,
        "frameNumber": frame_number,
        "timecode": timecode,
        "seconds": seconds,
    }


def append_to_manifest(manifest_path: Path, filename: str) -> None:
    """Append a single result entry to manifest.json for live progress updates."""
    meta = _parse_frame_metadata(filename)
    if not meta:
        return  # skip non-frame files

    manifest = {"generatedAt": "live", "files": []}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            pass  # fall back to fresh manifest

    files = manifest.get("files") or []
    # avoid duplicates
    if any((isinstance(entry, dict) and entry.get("filename") == filename) or entry == filename for entry in files):
        return

    files.append(meta)
    manifest["files"] = files
    manifest["count"] = len(files)
    manifest["generatedAt"] = "live"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def process_image(asset_path: Path, search_images: List[Tuple[np.ndarray, str, np.ndarray]], 
                  results_dir: Path, threshold: float = 0.15, manifest_path: Optional[Path] = None) -> List[str]:
    """Process a single image asset and find matches."""
    saved_files = []
    img = cv2.imread(str(asset_path))
    if img is None:
        return saved_files
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    keypoints, descriptors = extract_features(gray)
    
    if descriptors is None:
        return saved_files
    
    for search_img, search_name, search_desc in search_images:
        if search_desc is None:
            continue
        
        match_score = match_features(search_desc, descriptors)
        
        if match_score >= threshold:
            if check_green_color_similarity(search_img, img):
                base_name = asset_path.stem
                search_base = Path(search_name).stem
                safe_name = sanitize_filename(f"{base_name}_match_{search_base}_{match_score:.3f}")
                output_path = results_dir / f"{safe_name}{asset_path.suffix}"
                
                cv2.imwrite(str(output_path), img)
                saved_files.append(str(output_path))
                if manifest_path:
                    append_to_manifest(manifest_path, output_path.name)
                print(f"Match found: {asset_path.name} matches {search_name} (score: {match_score:.3f})")
    
    return saved_files


def process_video(asset_path: Path, search_images: List[Tuple[np.ndarray, str, np.ndarray]], 
                  results_dir: Path, threshold: float = 0.12, frame_interval: int = 3, manifest_path: Optional[Path] = None) -> List[str]:
    """Process a video asset and find matching frames with timestamps."""
    saved_files = []
    cap = cv2.VideoCapture(str(asset_path))
    
    if not cap.isOpened():
        print(f"Error opening video: {asset_path}")
        return saved_files
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps if fps > 0 else 0
    
    print(f"Processing video: {asset_path.name} ({frame_count} frames, {fps:.2f} fps, {duration:.2f}s)")
    
    frame_number = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_number % frame_interval == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            keypoints, descriptors = extract_features(gray)
            
            if descriptors is not None:
                timestamp = frame_number / fps if fps > 0 else 0
                time_str = f"{int(timestamp // 60):02d}m{int(timestamp % 60):02d}s{int((timestamp % 1) * 100):02d}ms"
                
                for search_img, search_name, search_desc in search_images:
                    if search_desc is None:
                        continue
                    
                    match_score = match_features(search_desc, descriptors)
                    
                    if match_score >= threshold:
                        color_match = check_green_color_similarity(search_img, frame)
                        if color_match or match_score >= 0.25:
                            base_name = asset_path.stem
                            search_base = Path(search_name).stem
                            safe_name = sanitize_filename(
                                f"{base_name}_frame_{frame_number}_t{time_str}_match_{search_base}_{match_score:.3f}"
                            )
                            output_path = results_dir / f"{safe_name}.png"
                            
                            cv2.imwrite(str(output_path), frame)
                            saved_files.append(str(output_path))
                            if manifest_path:
                                append_to_manifest(manifest_path, output_path.name)
                            print(f"Match found: Frame {frame_number} ({time_str}) matches {search_name} (score: {match_score:.3f})")
        
        frame_number += 1
    
    cap.release()
    return saved_files


def load_config(script_dir: Path) -> Optional[dict]:
    """Load config.json to pick dataset-aware paths."""
    config_path = script_dir / "config.json"
    if not config_path.exists():
        return None
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as err:
        print(f"Warning: Could not parse config.json ({err}). Falling back to defaults.")
    except OSError as err:
        print(f"Warning: Could not read config.json ({err}). Falling back to defaults.")
    return None


def pick_dataset(config: Optional[dict]) -> Optional[dict]:
    """Select the default dataset (by id or first entry)."""
    if not config or not isinstance(config, dict):
        return None
    datasets = config.get("datasets") or []
    if not datasets:
        return None
    default_id = config.get("defaultId")
    if default_id:
        for dataset in datasets:
            if dataset.get("id") == default_id:
                return dataset
    return datasets[0]


def main():
    """Main function to process assets and find matches."""
    script_dir = Path(__file__).parent
    config = load_config(script_dir)
    dataset = pick_dataset(config) or {}
    dataset_id = dataset.get("id", "default")
    search_dir = script_dir / Path(dataset.get("searchDir", "data/search"))
    assets_dir = script_dir / "assets"
    results_dir = script_dir / Path(dataset.get("resultsDir", "data/results"))
    manifest_path = results_dir / "manifest.json"
    
    if not search_dir.exists():
        print(f"Error: Search directory not found: {search_dir}")
        sys.exit(1)
    
    if not assets_dir.exists():
        print(f"Error: Assets directory not found: {assets_dir}")
        sys.exit(1)
    
    results_dir.mkdir(exist_ok=True)
    
    print("Loading search images...")
    search_images = load_search_images(search_dir)
    
    if not search_images:
        print("Error: No search images found")
        sys.exit(1)
    
    print(f"\nProcessing dataset '{dataset_id}'")
    print(f"Processing assets from: {assets_dir}")
    
    image_extensions = {'.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp'}
    video_extensions = {'.mov', '.mp4', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.m4v'}
    
    total_matches = 0
    
    for asset_path in sorted(assets_dir.iterdir()):
        if asset_path.is_file():
            ext = asset_path.suffix.lower()
            
            if ext in image_extensions:
                print(f"\nProcessing image: {asset_path.name}")
                matches = process_image(asset_path, search_images, results_dir, manifest_path=manifest_path)
                total_matches += len(matches)
            
            elif ext in video_extensions:
                print(f"\nProcessing video: {asset_path.name}")
                matches = process_video(asset_path, search_images, results_dir, manifest_path=manifest_path)
                total_matches += len(matches)
    
    print(f"\n{'='*60}")
    print(f"Processing complete! Found {total_matches} matches.")
    print(f"Results saved to: {results_dir}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

