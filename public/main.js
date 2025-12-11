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
  const resultsCount = document.getElementById("results-count");
  const searchCount = document.getElementById("search-count");
  const subtitle = document.querySelector(".subtitle");
  const fileHint = document.querySelector(".file-hint");
  const videoContainer = document.querySelector(".video-container");
  const root = document.documentElement;

  let videoURL = null;
  let videoLoaded = false;
  let selection = null;
  let updateInterval = null;
  let resultsInterval = null;
  const isNestedInPublic = window.location.pathname.includes("/public/");
  const basePath = isNestedInPublic ? ".." : ".";
  const configPath = `${basePath}/config.json`;
  let appConfig = null;
  let currentDataset = null;
  let requestedDatasetId = null;
  const DEFAULT_FRAME_DURATION = 1 / 30; // fallback to 30fps when frame rate is unknown
  let paths = {
    resultsPath: null,
    resultsManifest: null,
    searchPath: null,
    searchManifest: null,
  };
  let videoErrorHandler = null;
  const LAST_TIME_KEY = "frameCapture:lastTimeSeconds";
  let resultsEntries = [];
  let searchEntries = [];
  let activeResultIdx = null;
  let activeSearchIdx = null;
  let initialStartSeconds = null;
  let initialStartApplied = false;
  let initialScrollPending = false;

  const FIXED_MAX_WIDTH = 1200;

  function setFixedVideoHeight() {
    if (!videoContainer) return;
    const usableWidth = Math.min(FIXED_MAX_WIDTH, window.innerWidth - 24);
    const height = usableWidth * 9 / 16;
    root.style.setProperty("--fixed-video-height", `${height}px`);
  }

  function enableFixedVideo() {
    if (!videoContainer) return;
    videoContainer.classList.add("fixed-video");
    document.body.classList.add("has-fixed-video");
    setFixedVideoHeight();
    window.addEventListener("resize", setFixedVideoHeight);
  }

  function togglePlayPause() {
    if (!videoLoaded) return;
    if (videoPlayer.paused) {
      videoPlayer.play().catch(() => {});
    } else {
      videoPlayer.pause();
    }
  }

  function getFrameDuration() {
    try {
      const quality = videoPlayer.getVideoPlaybackQuality?.();
      if (quality?.totalVideoFrames && videoPlayer.duration) {
        const estimate = videoPlayer.duration / quality.totalVideoFrames;
        if (Number.isFinite(estimate) && estimate > 0) {
          return Math.max(estimate, 1 / 60);
        }
      }
    } catch (err) {
      // Ignore and fall back
    }
    return DEFAULT_FRAME_DURATION;
  }

  function stepFrame(delta = 1) {
    if (!videoLoaded) return;
    const frameDuration = getFrameDuration();
    const nextTime = Math.max(
      0,
      Math.min(videoPlayer.duration || Number.MAX_VALUE, videoPlayer.currentTime + delta * frameDuration)
    );
    videoPlayer.currentTime = nextTime;
    videoPlayer.pause();
    drawFrame();
    updateActiveResultHighlight(nextTime);
    persistFrameState();
  }

  function handleKeyboardShortcuts(event) {
    if (!videoLoaded) return;
    const key = event.key;

    if (key === " " || key === "Spacebar") {
      event.preventDefault();
      event.stopPropagation();
      togglePlayPause();
      return;
    }

    if (key === "Enter") {
      event.preventDefault();
      togglePlayPause();
      return;
    }

    if (key === "ArrowLeft") {
      event.preventDefault();
      stepFrame(-1);
      return;
    }

    if (key === "ArrowRight") {
      event.preventDefault();
      stepFrame(1);
    }
  }

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

  function formatTitleTime(seconds) {
    if (!Number.isFinite(seconds)) return "--:--.---";
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const m = Math.floor(totalMs / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }

  function updateDocumentTitle(seconds) {
    const label = currentDataset?.label || currentDataset?.id || "Time";
    const timeStr = formatTitleTime(seconds);
    document.title = `WW Time - ${label}: ${timeStr}`;
  }

  function formatTimecode(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 1000);
    return `${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s${String(ms).padStart(3, "0")}ms`;
  }

  async function loadConfig() {
    try {
      const resp = await fetch(`${configPath}?cb=${Date.now()}`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.warn("Could not load config.json; falling back to default paths.", err);
      return null;
    }
  }

  function pickInitialDataset(config) {
    if (config?.datasets?.length) {
      return config.datasets.find((d) => d.id === config.defaultId) || config.datasets[0];
    }
    return null;
  }

  function getDatasetById(config, id) {
    if (!id || !config?.datasets?.length) return null;
    return config.datasets.find((d) => d.id === id) || null;
  }

  function setDatasetPaths(dataset) {
    const resultsDir = dataset?.resultsDir ? `${dataset.resultsDir}` : "data/results";
    const searchDir = dataset?.searchDir ? `${dataset.searchDir}` : "data/search";

    paths = {
      resultsPath: `${basePath}/${resultsDir}/`,
      resultsManifest: `${basePath}/${resultsDir}/manifest.json`,
      searchPath: `${basePath}/${searchDir}/`,
      searchManifest: `${basePath}/${searchDir}/manifest.json`,
    };
  }

  function updateDatasetUi(dataset) {
    if (subtitle && (dataset?.label || dataset?.id)) {
      subtitle.innerHTML = `Capture training data for <strong>${dataset.label || dataset.id}</strong>`;
    }
    if (fileHint) {
      const fallbackPath = dataset?.video?.fallback;
      fileHint.innerHTML = fallbackPath
        ? `<strong>⚠️ Important:</strong> Navigate to <code>${fallbackPath}</code> if the remote video is unavailable.`
        : `<strong>⚠️ Important:</strong> Use the file picker to load a local video if the remote source fails.`;
    }
  }

  function loadDatasetVideo(dataset) {
    if (!dataset?.video) return;

    if (videoErrorHandler) {
      videoPlayer.removeEventListener("error", videoErrorHandler);
    }

    const remote = dataset.video.remote;
    const fallback = dataset.video.fallback ? `${basePath}/${dataset.video.fallback}` : null;
    let triedFallback = false;

    videoErrorHandler = () => {
      if (!triedFallback && fallback) {
        triedFallback = true;
        videoInfo.textContent = "Remote video unavailable, falling back to local asset.";
        loadVideoFromPath(fallback);
        return;
      }
      videoInfo.textContent = "Error loading video. Please use the file input to select from assets folder.";
      videoLoaded = false;
    };

    videoPlayer.addEventListener("error", videoErrorHandler);

    if (remote) {
      loadVideoFromPath(remote);
    } else if (fallback) {
      loadVideoFromPath(fallback);
    }
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

    updateDocumentTitle(current);
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

  function drawFrame(options = {}) {
    const { preserveOverlay = false } = options;
    const w = videoPlayer.videoWidth;
    const h = videoPlayer.videoHeight;
    if (!w || !h) return;
    setCanvasSize(w, h);
    frameCtx.drawImage(videoPlayer, 0, 0, w, h);
    if (!preserveOverlay) {
      clearOverlay();
    }
    updateStep(3);
  }

  function loadVideoFromFile(file) {
    if (videoErrorHandler) {
      videoPlayer.removeEventListener("error", videoErrorHandler);
      videoErrorHandler = null;
    }

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
    updateHighlight(resultsEntries, resultsGrid, resultsIdxRef, videoPlayer.currentTime);
    updateHighlight(searchEntries, searchGrid, searchIdxRef, videoPlayer.currentTime);
    
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateTimeDisplay, 100);
    applyInitialStartTime();
  });

  videoPlayer.addEventListener("seeked", () => {
    drawFrame();
    updateTimeDisplay();
    updateHighlight(resultsEntries, resultsGrid, resultsIdxRef, videoPlayer.currentTime);
    updateHighlight(searchEntries, searchGrid, searchIdxRef, videoPlayer.currentTime);
  });

  videoPlayer.addEventListener("timeupdate", () => {
    updateTimeDisplay();
    updateHighlight(resultsEntries, resultsGrid, resultsIdxRef, videoPlayer.currentTime);
    updateHighlight(searchEntries, searchGrid, searchIdxRef, videoPlayer.currentTime);
  });

  let frameSyncId = null;

  function startFrameSync() {
    if (frameSyncId) return;
    const sync = () => {
      if (!videoLoaded || videoPlayer.paused || videoPlayer.ended) {
        frameSyncId = null;
        return;
      }
      drawFrame({ preserveOverlay: true });
      frameSyncId = requestAnimationFrame(sync);
    };
    frameSyncId = requestAnimationFrame(sync);
  }

  function stopFrameSync() {
    if (frameSyncId) {
      cancelAnimationFrame(frameSyncId);
      frameSyncId = null;
    }
  }

  function getCurrentFrameNumber() {
    const frameDuration = getFrameDuration();
    if (!Number.isFinite(frameDuration) || frameDuration <= 0) return null;
    const frameNumber = Math.round(videoPlayer.currentTime / frameDuration);
    return Number.isFinite(frameNumber) ? frameNumber : null;
  }

  function setCount(el, value) {
    if (!el) return;
    el.textContent = value;
  }

  function formatTimeParam(seconds) {
    if (!Number.isFinite(seconds)) return null;
    return seconds.toFixed(3);
  }

  function clearActiveHighlight(grid, idxRefSetter) {
    const currentIdx = idxRefSetter("get");
    if (currentIdx == null) return;
    const prevEl = grid?.querySelector(`[data-idx="${currentIdx}"]`);
    if (prevEl) prevEl.classList.remove("timeline-highlight");
    idxRefSetter(null);
  }

  function makeIdxRefSetter(storeKey) {
    return (next) => {
      if (next === "get") {
        return storeKey === "results" ? activeResultIdx : activeSearchIdx;
      }
      if (storeKey === "results") {
        activeResultIdx = next;
      } else {
        activeSearchIdx = next;
      }
      return next;
    };
  }

  const resultsIdxRef = makeIdxRefSetter("results");
  const searchIdxRef = makeIdxRefSetter("search");

  function pickHighlightIdx(entries, currentTime, lookAhead = 1.2, lookBack = 0.6) {
    if (!Number.isFinite(currentTime) || !entries.length) return null;
    let lastWithinBack = null;
    for (let i = 0; i < entries.length; i++) {
      const sec = entries[i].seconds;
      if (!Number.isFinite(sec)) continue;
      const diff = sec - currentTime;
      if (diff >= -lookBack && diff <= lookAhead) {
        // first entry in window (ordered list) is our pick to keep strict time order
        return i;
      }
      if (diff < -lookBack) {
        lastWithinBack = i; // keep closest just-behind if nothing ahead in window
      }
      if (diff > lookAhead) break;
    }
    return lastWithinBack;
  }

  function scrollIntoViewIfNeeded(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    } catch (_) {
      // swallow to avoid breaking highlight flow
    }
  }

  function isFullyInViewport(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    return rect.top >= 0 && rect.left >= 0 && rect.bottom <= vh && rect.right <= vw;
  }

  function ensureElementVisible(el) {
    if (!el) return;
    if (!isFullyInViewport(el)) {
      scrollIntoViewIfNeeded(el);
    }
    // Re-check shortly after images settle to account for lazy-load reflow.
    setTimeout(() => {
      if (!isFullyInViewport(el)) {
        scrollIntoViewIfNeeded(el);
      }
    }, 200);
  }

  function ensureHighlightVisible(grid) {
    if (!grid) return;
    const el = grid.querySelector(".timeline-highlight");
    ensureElementVisible(el);
  }

  function updateHighlight(entries, grid, idxRefSetter, currentTime, options = {}) {
    // Default to scrolling when we move the highlight so the matching card stays visible.
    const { scrollIntoView = true } = options;
    let didHighlight = false;

    if (!grid || !entries.length || !Number.isFinite(currentTime)) {
      clearActiveHighlight(grid, idxRefSetter);
      return didHighlight;
    }

    const nextIdx = pickHighlightIdx(entries, currentTime);
    const currentIdx = idxRefSetter("get");
    if (nextIdx === currentIdx) return didHighlight;

    clearActiveHighlight(grid, idxRefSetter);
    if (nextIdx == null) return didHighlight;

    const el = grid.querySelector(`[data-idx="${nextIdx}"]`);
    if (el) {
      didHighlight = true;
      el.classList.add("timeline-highlight");
      idxRefSetter(nextIdx);
      if (scrollIntoView) {
        ensureElementVisible(el);
      }
    }

    return didHighlight;
  }

  function maybeScrollInitialHighlight() {
    if (!initialScrollPending || !videoLoaded) return;
    const current = videoPlayer?.currentTime;
    if (!Number.isFinite(current)) return;

    const resultsScrolled = updateHighlight(
      resultsEntries,
      resultsGrid,
      resultsIdxRef,
      current,
      { scrollIntoView: true }
    );
    const searchScrolled = updateHighlight(
      searchEntries,
      searchGrid,
      searchIdxRef,
      current,
      { scrollIntoView: true }
    );

    if (resultsScrolled || searchScrolled) {
      ensureHighlightVisible(resultsGrid);
      ensureHighlightVisible(searchGrid);
      initialScrollPending = false;
    }
  }

  function updateTimeParam(seconds) {
    const paramValue = formatTimeParam(seconds);
    if (paramValue == null) return;
    try {
      const url = new URL(window.location.href);
      const dsId = currentDataset?.id || requestedDatasetId || appConfig?.defaultId;

      // Preserve all other params but force id first, then t.
      const others = [];
      url.searchParams.forEach((value, key) => {
        if (key === "id" || key === "t" || key === "f") return;
        others.push([key, value]);
      });

      const params = new URLSearchParams();
      if (dsId) {
        params.set("id", dsId);
      }
      params.set("t", paramValue);
      others.forEach(([k, v]) => params.append(k, v));

      url.search = params.toString();
      window.history.replaceState({}, "", url.toString());
    } catch (err) {
      console.warn("Unable to update URL with time param", err);
    }
  }

  function readInitialStartTime() {
    try {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("t");
      if (t == null) return null;
      const seconds = parseFloat(t);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds;
      }
    } catch (err) {
      console.warn("Unable to read time param", err);
    }
    return null;
  }

  function readInitialDatasetId() {
    try {
      const url = new URL(window.location.href);
      const id = url.searchParams.get("id");
      if (id) return id;
    } catch (err) {
      console.warn("Unable to read id param", err);
    }
    return null;
  }

  function applyInitialStartTime() {
    if (initialStartApplied || !videoLoaded) return;
    if (initialStartSeconds == null) return;
    const target = Math.max(0, Math.min(initialStartSeconds, videoPlayer.duration || initialStartSeconds));
    seekToTime(target, { autoPlay: false, scrollToHighlights: true });
    videoPlayer.pause();
    drawFrame();
    initialStartApplied = true;
    initialScrollPending = initialStartSeconds != null;
  }

  function persistFrameState() {
    if (!videoLoaded) return;
    const timeSeconds = Number(videoPlayer.currentTime);
    if (!Number.isFinite(timeSeconds)) return;
    const roundedSeconds = Math.max(0, timeSeconds);

    try {
      localStorage.setItem(LAST_TIME_KEY, String(roundedSeconds));
    } catch (err) {
      console.warn("Unable to persist time to localStorage", err);
    }

    updateTimeParam(roundedSeconds);
  }

  videoPlayer.addEventListener("play", () => {
    playIcon.textContent = "⏸";
    playPauseBtn.title = "Pause";
    startFrameSync();
    updateHighlight(resultsEntries, resultsGrid, resultsIdxRef, videoPlayer.currentTime);
    updateHighlight(searchEntries, searchGrid, searchIdxRef, videoPlayer.currentTime);
  });

  videoPlayer.addEventListener("pause", () => {
    playIcon.textContent = "▶";
    playPauseBtn.title = "Play";
    stopFrameSync();
    drawFrame({ preserveOverlay: true });
    persistFrameState();
  });

  videoPlayer.addEventListener("error", () => {
    if (videoErrorHandler) return;
    videoInfo.textContent = "Error loading video. Please use the file input to select from assets folder.";
    videoLoaded = false;
  });

  playPauseBtn.addEventListener("click", () => {
    togglePlayPause();
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

    const getPoint = (clientX, clientY, rect) => ({
      x: (clientX - rect.left) * (overlayCanvas.width / rect.width),
      y: (clientY - rect.top) * (overlayCanvas.height / rect.height)
    });

    const beginDrag = (clientX, clientY) => {
      if (!videoLoaded) return;
      isDragging = true;
      const rect = overlayCanvas.getBoundingClientRect();
      start = getPoint(clientX, clientY, rect);
    };

    const moveDrag = (clientX, clientY) => {
      if (!isDragging || !start) return;
      const rect = overlayCanvas.getBoundingClientRect();
      const current = getPoint(clientX, clientY, rect);
      selection = getSelectionRect(start, current);
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      overlayCtx.strokeStyle = "#10b981";
      overlayCtx.lineWidth = 3;
      overlayCtx.setLineDash([5, 5]);
      overlayCtx.strokeRect(selection.x, selection.y, selection.w, selection.h);
      overlayCtx.setLineDash([]);
      
      overlayCtx.fillStyle = "rgba(16, 185, 129, 0.1)";
      overlayCtx.fillRect(selection.x, selection.y, selection.w, selection.h);
    };

    const endDrag = () => {
      isDragging = false;
      if (selection && selection.w > 2 && selection.h > 2) {
        updateStep(4);
      }
    };

    overlayCanvas.addEventListener("mousedown", (e) => {
      beginDrag(e.clientX, e.clientY);
    });

    overlayCanvas.addEventListener("mousemove", (e) => {
      moveDrag(e.clientX, e.clientY);
    });

    overlayCanvas.addEventListener("mouseup", () => {
      endDrag();
    });

    overlayCanvas.addEventListener("mouseleave", () => {
      isDragging = false;
    });

    overlayCanvas.addEventListener("touchstart", (e) => {
      const touch = e.touches?.[0];
      if (!touch) return;
      e.preventDefault();
      beginDrag(touch.clientX, touch.clientY);
    }, { passive: false });

    overlayCanvas.addEventListener("touchmove", (e) => {
      const touch = e.touches?.[0];
      if (!touch) return;
      e.preventDefault();
      moveDrag(touch.clientX, touch.clientY);
    }, { passive: false });

    overlayCanvas.addEventListener("touchend", () => {
      endDrag();
    });
  }

  async function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob - canvas may be tainted by cross-origin video"));
              return;
            }
            resolve(blob);
          },
          "image/png",
          1.0
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  async function saveCanvasRegion(rect, filename) {
    if (!rect || rect.w < 2 || rect.h < 2) return;
    try {
      // Ensure we freeze the current frame before saving
      videoPlayer.pause();
      drawFrame({ preserveOverlay: true });

      const off = document.createElement("canvas");
      off.width = rect.w;
      off.height = rect.h;
      const offCtx = off.getContext("2d");
      
      offCtx.drawImage(frameCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      
      const blob = await canvasToBlob(off);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      
      setTimeout(() => {
        const searchFolder = paths.searchPath ? paths.searchPath : "data/search/";
        alert(`✅ Saved: ${filename}\n\nMove this file to the ${searchFolder} folder for training.`);
      }, 100);
    } catch (error) {
      console.error("Error saving canvas:", error);
      const errorMsg = error.message || "Canvas export blocked by browser security";
      alert(`⚠️ Error saving image: ${errorMsg}\n\nTip: If you're using the remote video, switch to the local file (assets/wesjerryspringer.mov or the file picker) so the canvas isn't tainted by CORS.`);
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

  function parseSearchFilename(entry) {
    const filename = typeof entry === "string" ? entry : entry?.filename;
    if (!filename) return null;

    const timecodeMatch = filename.match(/_t(\d+m\d+s\d+ms)/);
    const secondsMatch = filename.match(/_(\d+)s(?:\.[^.]+)?$/);

    const parsed = {
      filename,
      timecode: timecodeMatch ? timecodeMatch[1] : null,
      seconds: secondsMatch ? parseInt(secondsMatch[1], 10) : null,
    };

    if (!parsed.seconds && parsed.timecode) {
      parsed.seconds = parseTimecode(parsed.timecode);
    }

    if (entry && typeof entry === "object") {
      return {
        filename,
        timecode: entry.timecode ?? parsed.timecode,
        seconds: entry.seconds ?? parsed.seconds
      };
    }

    return parsed;
  }

  function seekToTime(seconds, options = {}) {
    const { autoPlay = false, scrollToHighlights = false } = options;
    if (!videoLoaded) {
      alert("Please load the video first!");
      return;
    }
    const target = Math.max(0, Math.min(seconds, videoPlayer.duration));
    updateTimeParam(target);
    videoPlayer.currentTime = target;
    updateHighlight(resultsEntries, resultsGrid, resultsIdxRef, target, { scrollIntoView: scrollToHighlights });
    updateHighlight(searchEntries, searchGrid, searchIdxRef, target, { scrollIntoView: scrollToHighlights });
    if (autoPlay) {
      videoPlayer.play().catch(() => {});
    } else {
      videoPlayer.pause();
      drawFrame();
    }
  }

  async function loadResults() {
    resultsGrid.innerHTML = '<div class="loading-results">Loading matches...</div>';

    if (!paths.resultsManifest) {
      resultsGrid.innerHTML = '<div class="no-results">No dataset configured for results.</div>';
      setCount(resultsCount, 0);
      resultsEntries = [];
      clearActiveResultHighlight();
      return;
    }

    try {
      const resp = await fetch(`${paths.resultsManifest}?cb=${Date.now()}`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const manifest = await resp.json();
      const results = (manifest.files || []).map(parseResultFilename).filter((r) => r !== null);
      results.sort((a, b) => a.seconds - b.seconds);
      resultsEntries = results;
      const totalCount = manifest.count ?? results.length;
      setCount(resultsCount, totalCount);

      if (results.length === 0) {
        resultsGrid.innerHTML = '<div class="no-results">No matching frames found in results folder.</div>';
        clearActiveResultHighlight();
        return;
      }

      resultsGrid.innerHTML = '';
      results.forEach((result, idx) => {
        const card = document.createElement("div");
        card.className = "result-card";
        const timeParam = formatTimeParam(result.seconds);
        card.dataset.idx = idx;
        card.innerHTML = `
          <div class="result-thumbnail">
            <img src="${paths.resultsPath}${result.filename}" alt="Frame ${result.frameNumber}" loading="lazy" />
          </div>
          <div class="result-info">
            <div class="result-timecode">${result.timecode}</div>
            <div class="result-time">${formatTime(result.seconds)}</div>
            <div class="result-frame">Frame ${result.frameNumber}</div>
            ${timeParam ? `<div class="result-param">t=${timeParam}</div>` : ""}
          </div>
        `;
        card.addEventListener("click", () => {
          seekToTime(result.seconds, { autoPlay: true });
          card.classList.add("selected");
          setTimeout(() => card.classList.remove("selected"), 1000);
        });
        resultsGrid.appendChild(card);
      });

      resultsSection.style.display = "block";
      updateHighlight(resultsEntries, resultsGrid, resultsIdxRef, videoPlayer?.currentTime);
      maybeScrollInitialHighlight();
    } catch (err) {
      console.error("Failed to load manifest", err);
      setCount(resultsCount, 0);
      resultsEntries = [];
      clearActiveResultHighlight();
      resultsGrid.innerHTML = `<div class="no-results">Could not load results manifest. Ensure ${paths.resultsManifest || "data/results/manifest.json"} is present.</div>`;
    }
  }

  async function loadSearch() {
    searchGrid.innerHTML = '<div class="loading-results">Loading training images...</div>';

    if (!paths.searchManifest) {
      searchGrid.innerHTML = '<div class="no-results">No dataset configured for search images.</div>';
      setCount(searchCount, 0);
      searchEntries = [];
      return;
    }

    try {
      const resp = await fetch(`${paths.searchManifest}?cb=${Date.now()}`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const manifest = await resp.json();
      const files = (manifest.files || []).map(parseSearchFilename).filter((f) => f !== null);
      const totalCount = manifest.count ?? files.length;
      setCount(searchCount, totalCount);
      searchEntries = files;

      if (!files.length) {
        searchGrid.innerHTML = '<div class="no-results">No training images found in data/search/.</div>';
        return;
      }

      files.sort((a, b) => {
        if (a.seconds != null && b.seconds != null) {
          return a.seconds - b.seconds;
        }
        if (a.seconds != null) return -1;
        if (b.seconds != null) return 1;
        return a.filename.localeCompare(b.filename);
      });

      searchGrid.innerHTML = '';
      files.forEach((entry, idx) => {
        const filename = entry.filename;
        if (!filename) return;
        const hasTime = Number.isFinite(entry.seconds);
        const timeParam = hasTime ? formatTimeParam(entry.seconds) : null;
        const card = document.createElement("div");
        card.className = "result-card";
        card.dataset.idx = idx;
        card.innerHTML = `
          <div class="result-thumbnail">
            <img src="${paths.searchPath}${filename}" alt="${filename}" loading="lazy" />
          </div>
          <div class="result-info">
            <div class="result-timecode">${entry.timecode ? `t${entry.timecode}` : filename}</div>
            ${hasTime ? `<div class="result-time">${formatTime(entry.seconds)}</div>` : ""}
            ${hasTime ? `<div class="result-frame">${filename}</div>` : ""}
            ${timeParam ? `<div class="result-param">t=${timeParam}</div>` : ""}
          </div>
        `;
        if (hasTime) {
          card.title = "Click to seek to this timecode";
          card.addEventListener("click", () => {
            seekToTime(entry.seconds, { autoPlay: true });
            card.classList.add("selected");
            setTimeout(() => card.classList.remove("selected"), 1000);
          });
        } else {
          card.title = "No timecode detected in filename";
        }
        searchGrid.appendChild(card);
      });

      searchSection.style.display = "block";
      updateHighlight(searchEntries, searchGrid, searchIdxRef, videoPlayer?.currentTime);
      maybeScrollInitialHighlight();
    } catch (err) {
      console.error("Failed to load search manifest", err);
      setCount(searchCount, 0);
      searchEntries = [];
      searchGrid.innerHTML = `<div class="no-results">Could not load search manifest. Ensure ${paths.searchManifest || "data/search/manifest.json"} is present.</div>`;
    }
  }

  async function init() {
    enableFixedVideo();
    enableSelection();
    initialStartSeconds = readInitialStartTime();
    initialScrollPending = initialStartSeconds != null;
    requestedDatasetId = readInitialDatasetId();

    appConfig = await loadConfig();
    const initialDataset =
      getDatasetById(appConfig, requestedDatasetId) ||
      pickInitialDataset(appConfig);

    if (initialDataset) {
      currentDataset = initialDataset;
      setDatasetPaths(initialDataset);
      updateDatasetUi(initialDataset);
      loadDatasetVideo(initialDataset);
      // Ensure URL has the dataset id even if it was missing.
      updateTimeParam(initialStartSeconds ?? 0);
    } else {
      setDatasetPaths(null);
    }

    loadResults();
    loadSearch();

    if (videoInput) {
      videoInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) {
          loadVideoFromFile(file);
        }
      });
    }

    if (refreshResultsBtn) refreshResultsBtn.addEventListener("click", loadResults);
    if (refreshSearchBtn) refreshSearchBtn.addEventListener("click", loadSearch);
    if (saveCropBtn) saveCropBtn.addEventListener("click", saveCrop);
    if (saveFullBtn) saveFullBtn.addEventListener("click", saveFull);
    document.addEventListener("keydown", handleKeyboardShortcuts, true);

    // Auto-refresh results every 30 seconds
    if (resultsInterval) clearInterval(resultsInterval);
    resultsInterval = setInterval(loadResults, 30000);
  }

  init();
})();
