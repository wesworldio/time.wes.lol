(() => {
  const videoPlayer = document.getElementById("video-player");
  const videoInput = document.getElementById("video-input");
  const playPauseBtn = document.getElementById("play-pause-btn");
  const playIcon = document.getElementById("play-icon");
  const rewindBtn = document.getElementById("rewind-btn");
  const forwardBtn = document.getElementById("forward-btn");
  const seekBar = document.getElementById("seek-bar");
  const currentTimeDisplay = document.getElementById("current-time");
  const durationDisplay = document.getElementById("duration");
  const timestampDisplay = document.getElementById("timestamp-display");
  const captureBtn = document.getElementById("capture-btn");
  const saveCropBtn = document.getElementById("save-crop-btn");
  const saveFullBtn = document.getElementById("save-full-btn");
  const videoInfo = document.getElementById("video-info");
  const frameCanvas = document.getElementById("frame-canvas");
  const overlayCanvas = document.getElementById("overlay-canvas");
  const frameCtx = frameCanvas.getContext("2d");
  const overlayCtx = overlayCanvas.getContext("2d");
  const resultsSection = document.getElementById("results-section");
  const resultsGrid = document.getElementById("results-grid");
  const refreshResultsBtn = document.getElementById("refresh-results-btn");
  const refreshSearchBtn = document.getElementById("refresh-search-btn");
  const searchSection = document.getElementById("search-section");
  const searchGrid = document.getElementById("search-grid");

  let videoURL = null;
  let videoLoaded = false;
  let selection = null;
  let updateInterval = null;
  let resultsInterval = null;
  const basePath = window.location.pathname.includes("/frame-capture/") ? ".." : ".";
  const assetsPath = `${basePath}/assets/`;
  const resultsPath = `${basePath}/results/`;
  const resultsManifest = `${resultsPath}manifest.json`;
  const searchPath = `${basePath}/search/`;
  const searchManifest = `${searchPath}manifest.json`;

  function updateStep(stepNum) {
    document.querySelectorAll(".step").forEach((step, idx) => {
      if (idx + 1 <= stepNum) {
        step.classList.add("active");
      } else {
        step.classList.remove("active");
      }
    });
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatTimecode(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 1000);
    return `${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s${String(ms).padStart(3, "0")}ms`;
  }

  function parseTimecode(timecodeStr) {
    const match = timecodeStr.match(/(\d+)m(\d+)s(\d+)ms/);
    if (!match) return 0;
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const milliseconds = parseInt(match[3], 10);
    return minutes * 60 + seconds + milliseconds / 1000;
  }

  function updateTimeDisplay() {
    if (!videoLoaded) return;
    const current = videoPlayer.currentTime;
    const duration = videoPlayer.duration;
    
    currentTimeDisplay.textContent = formatTime(current);
    durationDisplay.textContent = formatTime(duration);
    timestampDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    
    if (duration > 0) {
      seekBar.value = (current / duration) * 100;
    }
  }

  function setCanvasSize(w, h) {
    frameCanvas.width = w;
    frameCanvas.height = h;
    overlayCanvas.width = w;
    overlayCanvas.height = h;
  }

  function clearOverlay() {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    selection = null;
  }

  function drawFrame() {
    const w = videoPlayer.videoWidth;
    const h = videoPlayer.videoHeight;
    if (!w || !h) return;
    setCanvasSize(w, h);
    frameCtx.drawImage(videoPlayer, 0, 0, w, h);
    clearOverlay();
    updateStep(3);
  }

  function loadVideoFromFile(file) {
    if (videoURL) {
      URL.revokeObjectURL(videoURL);
      videoURL = null;
    }
    videoPlayer.crossOrigin = "anonymous";
    videoURL = URL.createObjectURL(file);
    videoPlayer.src = videoURL;
    videoPlayer.load();
    updateStep(1);
  }

  function loadVideoFromPath(path) {
    if (videoURL) {
      URL.revokeObjectURL(videoURL);
      videoURL = null;
    }
    videoPlayer.crossOrigin = "anonymous";
    videoPlayer.src = path;
    videoPlayer.load();
    updateStep(1);
  }

  videoPlayer.addEventListener("loadedmetadata", () => {
    videoLoaded = true;
    seekBar.max = 100;
    videoInfo.textContent = `Duration: ${formatTime(videoPlayer.duration)}, Resolution: ${videoPlayer.videoWidth}x${videoPlayer.videoHeight}`;
    updateTimeDisplay();
    updateStep(2);
    loadResults();
    
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateTimeDisplay, 100);
  });

  videoPlayer.addEventListener("seeked", () => {
    drawFrame();
    updateTimeDisplay();
  });

  videoPlayer.addEventListener("timeupdate", () => {
    updateTimeDisplay();
  });

  videoPlayer.addEventListener("play", () => {
    playIcon.textContent = "⏸";
    playPauseBtn.title = "Pause";
  });

  videoPlayer.addEventListener("pause", () => {
    playIcon.textContent = "▶";
    playPauseBtn.title = "Play";
  });

  videoPlayer.addEventListener("error", () => {
    videoInfo.textContent = "Error loading video. Please use the file input to select from assets folder.";
    videoLoaded = false;
  });

  playPauseBtn.addEventListener("click", () => {
    if (!videoLoaded) return;
    if (videoPlayer.paused) {
      videoPlayer.play();
    } else {
      videoPlayer.pause();
    }
  });

  rewindBtn.addEventListener("click", () => {
    if (!videoLoaded) return;
    videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 5);
  });

  forwardBtn.addEventListener("click", () => {
    if (!videoLoaded) return;
    videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 5);
  });

  seekBar.addEventListener("input", (e) => {
    if (!videoLoaded) return;
    const percent = parseFloat(e.target.value);
    videoPlayer.currentTime = (percent / 100) * videoPlayer.duration;
  });

  captureBtn.addEventListener("click", () => {
    if (!videoLoaded) return;
    videoPlayer.pause();
    drawFrame();
  });

  function getSelectionRect(start, end) {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(start.x - end.x);
    const h = Math.abs(start.y - end.y);
    return { x, y, w, h };
  }

  function enableSelection() {
    let isDragging = false;
    let start = null;

    overlayCanvas.addEventListener("mousedown", (e) => {
      if (!videoLoaded) return;
      isDragging = true;
      const rect = overlayCanvas.getBoundingClientRect();
      start = {
        x: (e.clientX - rect.left) * (overlayCanvas.width / rect.width),
        y: (e.clientY - rect.top) * (overlayCanvas.height / rect.height)
      };
    });

    overlayCanvas.addEventListener("mousemove", (e) => {
      if (!isDragging || !start) return;
      const rect = overlayCanvas.getBoundingClientRect();
      const current = {
        x: (e.clientX - rect.left) * (overlayCanvas.width / rect.width),
        y: (e.clientY - rect.top) * (overlayCanvas.height / rect.height)
      };
      selection = getSelectionRect(start, current);
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      overlayCtx.strokeStyle = "#10b981";
      overlayCtx.lineWidth = 3;
      overlayCtx.setLineDash([5, 5]);
      overlayCtx.strokeRect(selection.x, selection.y, selection.w, selection.h);
      overlayCtx.setLineDash([]);
      
      overlayCtx.fillStyle = "rgba(16, 185, 129, 0.1)";
      overlayCtx.fillRect(selection.x, selection.y, selection.w, selection.h);
    });

    overlayCanvas.addEventListener("mouseup", () => {
      isDragging = false;
      if (selection && selection.w > 2 && selection.h > 2) {
        updateStep(4);
      }
    });

    overlayCanvas.addEventListener("mouseleave", () => {
      isDragging = false;
    });
  }

  function saveCanvasRegion(rect, filename) {
    if (!rect || rect.w < 2 || rect.h < 2) return;
    try {
      const off = document.createElement("canvas");
      off.width = rect.w;
      off.height = rect.h;
      const offCtx = off.getContext("2d");
      
      offCtx.drawImage(frameCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      
      off.toBlob((blob) => {
        if (!blob) {
          throw new Error("Failed to create blob - canvas may be tainted");
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        
        setTimeout(() => {
          alert(`✅ Saved: ${filename}\n\nMove this file to the search/ folder for training.`);
        }, 100);
      }, "image/png", 1.0);
    } catch (error) {
      console.error("Error saving canvas:", error);
      const errorMsg = error.message || "Canvas export blocked by browser security";
      alert(`⚠️ Error saving image: ${errorMsg}\n\nSolution: Use the "Load custom file" button to select the video file directly from your computer. This avoids CORS restrictions.`);
    }
  }

  function saveCrop() {
    if (!videoLoaded) return;
    if (!selection || selection.w < 2 || selection.h < 2) {
      alert("⚠️ Please draw a selection box first by dragging on the captured frame.");
      return;
    }
    const tc = formatTimecode(videoPlayer.currentTime);
    const timestamp = Math.floor(videoPlayer.currentTime);
    const name = `training_striped_shirt_t${tc}_${timestamp}s.png`;
    saveCanvasRegion(selection, name);
  }

  function saveFull() {
    if (!videoLoaded) return;
    const tc = formatTimecode(videoPlayer.currentTime);
    const timestamp = Math.floor(videoPlayer.currentTime);
    const rect = { x: 0, y: 0, w: frameCanvas.width, h: frameCanvas.height };
    saveCanvasRegion(rect, `training_full_frame_t${tc}_${timestamp}s.png`);
  }

  function parseResultFilename(entry) {
    const filename = typeof entry === "string" ? entry : entry?.filename;
    if (!filename) return null;

    const match = filename.match(/frame_(\d+)_t(\d+m\d+s\d+ms)/);
    if (!match) return null;

    const parsed = {
      frameNumber: parseInt(match[1], 10),
      timecode: match[2],
      seconds: parseTimecode(match[2]),
      filename
    };

    // If the manifest already provides structured data, prefer it over our parsed values.
    if (entry && typeof entry === "object") {
      return {
        frameNumber: entry.frameNumber ?? parsed.frameNumber,
        timecode: entry.timecode ?? parsed.timecode,
        seconds: entry.seconds ?? parsed.seconds,
        filename: entry.filename ?? parsed.filename
      };
    }

    return parsed;
  }

  function seekToTime(seconds) {
    if (!videoLoaded) {
      alert("Please load the video first!");
      return;
    }
    videoPlayer.currentTime = Math.max(0, Math.min(seconds, videoPlayer.duration));
    videoPlayer.pause();
    drawFrame();
  }

  async function loadResults() {
    resultsGrid.innerHTML = '<div class="loading-results">Loading matches...</div>';

    try {
      const resp = await fetch(`${resultsManifest}?cb=${Date.now()}`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const manifest = await resp.json();
      const results = (manifest.files || []).map(parseResultFilename).filter((r) => r !== null);
      results.sort((a, b) => a.seconds - b.seconds);

      if (results.length === 0) {
        resultsGrid.innerHTML = '<div class="no-results">No matching frames found in results folder.</div>';
        return;
      }

      resultsGrid.innerHTML = '';
      results.forEach((result) => {
        const card = document.createElement("div");
        card.className = "result-card";
        card.innerHTML = `
          <div class="result-thumbnail">
            <img src="${resultsPath}${result.filename}" alt="Frame ${result.frameNumber}" loading="lazy" />
          </div>
          <div class="result-info">
            <div class="result-timecode">${result.timecode}</div>
            <div class="result-time">${formatTime(result.seconds)}</div>
            <div class="result-frame">Frame ${result.frameNumber}</div>
          </div>
        `;
        card.addEventListener("click", () => {
          seekToTime(result.seconds);
          card.classList.add("selected");
          setTimeout(() => card.classList.remove("selected"), 1000);
        });
        resultsGrid.appendChild(card);
      });

      resultsSection.style.display = "block";
    } catch (err) {
      console.error("Failed to load manifest", err);
      resultsGrid.innerHTML = '<div class="no-results">Could not load results manifest. Ensure results/manifest.json is present.</div>';
    }
  }

  async function loadSearch() {
    searchGrid.innerHTML = '<div class="loading-results">Loading training images...</div>';

    try {
      const resp = await fetch(`${searchManifest}?cb=${Date.now()}`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const manifest = await resp.json();
      const files = manifest.files || [];

      if (!files.length) {
        searchGrid.innerHTML = '<div class="no-results">No training images found in search/.</div>';
        return;
      }

      searchGrid.innerHTML = '';
      files.forEach((entry) => {
        const filename = typeof entry === "string" ? entry : entry?.filename;
        if (!filename) return;
        const card = document.createElement("div");
        card.className = "result-card";
        card.innerHTML = `
          <div class="result-thumbnail">
            <img src="${searchPath}${filename}" alt="${filename}" loading="lazy" />
          </div>
          <div class="result-info">
            <div class="result-timecode">${filename}</div>
          </div>
        `;
        searchGrid.appendChild(card);
      });

      searchSection.style.display = "block";
    } catch (err) {
      console.error("Failed to load search manifest", err);
      searchGrid.innerHTML = '<div class="no-results">Could not load search manifest. Ensure search/manifest.json is present.</div>';
    }
  }

  function init() {
    enableSelection();
    loadResults();
    loadSearch();

    videoInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        loadVideoFromFile(file);
      }
    });

    refreshResultsBtn.addEventListener("click", loadResults);
    refreshSearchBtn.addEventListener("click", loadSearch);
    saveCropBtn.addEventListener("click", saveCrop);
    saveFullBtn.addEventListener("click", saveFull);

    // Auto-refresh results every 30 seconds
    if (resultsInterval) clearInterval(resultsInterval);
    resultsInterval = setInterval(loadResults, 30000);
  }

  init();
})();
