/* ==========================================================================
   VIDEOMADDNESS - Core Application Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // --- COLLAPSIBLE PANEL SECTIONS ---
  document.querySelectorAll('.panel-section').forEach((section) => {
    // The header is either the .section-title-row (if it exists) or h2.section-title direct child
    const header = section.querySelector('.section-title-row') || section.querySelector('.section-title');
    if (!header) return;

    // The trigger is specifically the .section-title text block
    const trigger = section.querySelector('.section-title');
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        // Prevent collapsing if user is clicking inside background selector buttons or other controls in header
        if (e.target.closest('button') || e.target.closest('.inspector-bg-selectors') || e.target.closest('input') || e.target.closest('select')) {
          return;
        }
        section.classList.toggle('collapsed');
      });
    }

    // Create wrapper for all content below the header
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'panel-section-content';

    // Move all siblings of the header into the wrapper
    const children = Array.from(section.children);
    children.forEach((child) => {
      if (child !== header) {
        contentWrapper.appendChild(child);
      }
    });

    section.appendChild(contentWrapper);
  });

  // Initialize Lucide Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // --- APPLICATION STATE ---
  const state = {
    // Media & Image Elements
    uploadedImages: [], // Array of { id, name, img, layers: [] }
    activeImageIndex: -1,
    imageLoaded: false,
    layers: [], // Stack of active rendering layers: { canvas, index, initialZ, lastWrapCount, sourceImageId }
    
    // Core Layer Settings
    maskType: 'adaptive-luminosity',
    layerCount: 5,
    maskFeather: 0.3,
    hueTolerance: 45, // in degrees
    randomBoundaries: [], // boundary points for random mode
    aspectRatio: 'original',
    
    // Toggle FX Switches
    glitchEnabled: false,

    // Layer Inspector settings
    selectedInspectorLayer: 0,
    inspectorBgMode: 'checkerboard',

    // Text Overlays
    texts: [],
    selectedTextId: null,

    // Audio Track
    audioTrack: null,
    selectedAudio: false,

    // Motion parameters
    isPlaying: true,
    time: 0,
    lastFrameTime: 0,
    fps: 0,
    zoomSpeed: 0.05,
    zoomDepth: 4.0,
    cameraRotation: 0, // deg/sec
    cameraDrift: 0.0,  // drift multiplier
    cameraAngle: 0,    // accumulated angle
    gridActive: false,

    // Symmetries
    mirrorMode: 'none',
    kaleidoscopeSlices: 8,

    // Glitches
    rgbSplit: 0,
    pixelSort: 0,
    glitchFrequency: 5, // % probability
    glitchSeverity: 10,  // px displacement
    depthModulation: 0,
    glitchActive: false,
    glitchTimer: 0,
    shakeX: 0,
    shakeY: 0,
    shakeRot: 0,

    // Exporter
    isExporting: false,
    exportRecorder: null,
    exportChunks: [],
    exportFrame: 0,
    exportTotalFrames: 0,
    exportFps: 30,
    exportDuration: 5,
    exportLoops: 1,
    exportMode: 'duration',
    videoFadeActive: false,
    videoFadeDuration: 0.5,
    exportResolution: '1080',
    exportCancel: false
  };

  // --- HTML ELEMENT REFERENCES ---
  const UI = {
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    imagesDeck: document.getElementById('images-deck'),
    deckCountVal: document.getElementById('deck-count-val'),
    deckList: document.getElementById('deck-list'),
    btnClearDeck: document.getElementById('btn-clear-deck'),

    maskType: document.getElementById('mask-type'),
    layerCount: document.getElementById('layer-count'),
    layerCountVal: document.getElementById('layer-count-val'),
    maskFeather: document.getElementById('mask-feather'),
    maskFeatherVal: document.getElementById('mask-feather-val'),
    luminositySmoothnessGroup: document.getElementById('luminosity-smoothness-group'),
    hueTolerance: document.getElementById('hue-tolerance'),
    hueToleranceVal: document.getElementById('hue-tolerance-val'),
    colorRangeHueGroup: document.getElementById('color-range-hue-group'),
    btnRegenerateLayers: document.getElementById('btn-regenerate-layers'),
    btnRandomLayersOrder: document.getElementById('btn-random-layers-order'),
    layersList: document.getElementById('layers-list'),

    // Inspector UI elements
    layerInspectorSection: document.getElementById('layer-inspector-section'),
    inspectorPreviewCanvas: document.getElementById('inspector-preview-canvas'),
    inspectorLayerName: document.getElementById('inspector-layer-name'),
    inspectorLayerStat: document.getElementById('inspector-layer-stat'),
    inspectorBgSelectors: document.querySelectorAll('.inspector-bg-selectors .bg-btn'),

    mainCanvas: document.getElementById('main-canvas'),
    canvasLoading: document.getElementById('canvas-loading'),
    glitchFlash: document.getElementById('glitch-flash'),
    fpsValue: document.getElementById('fps-value'),
    themeSelect: document.getElementById('theme-select'),

    btnPlayPause: document.getElementById('btn-play-pause'),
    playPauseIcon: document.getElementById('play-pause-icon'),
    btnStep: document.getElementById('btn-step'),
    btnManualGlitch: document.getElementById('btn-manual-glitch'),
    btnToggleGrid: document.getElementById('btn-toggle-grid'),
    btnResetView: document.getElementById('btn-reset-view'),
    btnFullscreen: document.getElementById('btn-fullscreen'),

    // Toggles
    glitchEnabled: document.getElementById('glitch-enabled'),
    aspectRatio: document.getElementById('aspect-ratio'),

    zoomSpeed: document.getElementById('zoom-speed'),
    zoomSpeedVal: document.getElementById('zoom-speed-val'),
    zoomDepth: document.getElementById('zoom-depth'),
    zoomDepthVal: document.getElementById('zoom-depth-val'),
    cameraRotation: document.getElementById('camera-rotation'),
    cameraRotationVal: document.getElementById('camera-rotation-val'),
    cameraDrift: document.getElementById('camera-drift'),
    cameraDriftVal: document.getElementById('camera-drift-val'),

    mirrorMode: document.getElementById('mirror-mode'),
    kSlices: document.getElementById('k-slices'),
    kSlicesVal: document.getElementById('k-slices-val'),
    kaleidoscopeSlicesGroup: document.getElementById('kaleidoscope-slices-group'),

    rgbSplit: document.getElementById('rgb-split'),
    rgbSplitVal: document.getElementById('rgb-split-val'),
    pixelSort: document.getElementById('pixel-sort'),
    pixelSortVal: document.getElementById('pixel-sort-val'),
    glitchFrequency: document.getElementById('glitch-frequency'),
    glitchFrequencyVal: document.getElementById('glitch-frequency-val'),
    glitchSeverity: document.getElementById('glitch-severity'),
    glitchSeverityVal: document.getElementById('glitch-severity-val'),
    depthModulation: document.getElementById('depth-modulation'),
    depthModulationVal: document.getElementById('depth-modulation-val'),

    exportMode: document.getElementById('export-mode'),
    exportDuration: document.getElementById('export-duration'),
    exportDurationVal: document.getElementById('export-duration-val'),
    exportDurationGroup: document.getElementById('export-duration-group'),
    exportLoops: document.getElementById('export-loops'),
    exportLoopsVal: document.getElementById('export-loops-val'),
    exportLoopsGroup: document.getElementById('export-loops-group'),
    exportEstimateText: document.getElementById('export-estimate-text'),
    exportFps: document.getElementById('export-fps'),
    exportResolution: document.getElementById('export-resolution'),
    btnExportVideo: document.getElementById('btn-export-video'),
    exportOverlay: document.getElementById('export-overlay'),
    exportProgressBar: document.getElementById('export-progress-bar'),
    exportFrameCount: document.getElementById('export-frame-count'),
    exportPercent: document.getElementById('export-percent'),
    btnCancelExport: document.getElementById('btn-cancel-export'),
    videoFadeActive: document.getElementById('video-fade-active'),
    videoFadeDivider: document.getElementById('video-fade-divider'),
    videoFadeDurationGroup: document.getElementById('video-fade-duration-group'),
    videoFadeDuration: document.getElementById('video-fade-duration'),
    videoFadeDurationVal: document.getElementById('video-fade-duration-val'),

    // Text Settings Section References
    textSettingsSection: document.getElementById('text-settings-section'),
    textContent: document.getElementById('text-content'),
    textFont: document.getElementById('text-font'),
    btnLoadFont: document.getElementById('btn-load-font'),
    fontFileInput: document.getElementById('font-file-input'),
    textSize: document.getElementById('text-size'),
    textSizeVal: document.getElementById('text-size-val'),
    textColor: document.getElementById('text-color'),
    textPosX: document.getElementById('text-pos-x'),
    textPosXVal: document.getElementById('text-pos-x-val'),
    textPosY: document.getElementById('text-pos-y'),
    textPosYVal: document.getElementById('text-pos-y-val'),
    textAngle: document.getElementById('text-angle'),
    textAngleVal: document.getElementById('text-angle-val'),
    textGlitchMode: document.getElementById('text-glitch-mode'),
    textGlitchIntensity: document.getElementById('text-glitch-intensity'),
    textGlitchIntensityVal: document.getElementById('text-glitch-intensity-val'),
    textTransition: document.getElementById('text-transition'),
    textTransitionDuration: document.getElementById('text-transition-duration'),
    textTransitionDurationVal: document.getElementById('text-transition-duration-val'),
    btnDeleteText: document.getElementById('btn-delete-text'),

    // Audio Settings Section References
    audioSettingsSection: document.getElementById('audio-settings-section'),
    audioFileName: document.getElementById('audio-file-name'),
    audioFileDuration: document.getElementById('audio-file-duration'),
    audioTimelineStart: document.getElementById('audio-timeline-start'),
    audioTimelineStartVal: document.getElementById('audio-timeline-start-val'),
    audioVolume: document.getElementById('audio-volume'),
    audioVolumeVal: document.getElementById('audio-volume-val'),
    btnDeleteAudio: document.getElementById('btn-delete-audio'),
    
    // Timeline Panel References
    btnAddText: document.getElementById('btn-add-text'),
    btnAddAudio: document.getElementById('btn-add-audio'),
    audioFileInput: document.getElementById('audio-file-input'),
    timelineTimecode: document.getElementById('timeline-timecode'),
    btnTimelineStart: document.getElementById('btn-timeline-start'),
    btnTimelineEnd: document.getElementById('btn-timeline-end'),
    timelineDurationControl: document.getElementById('timeline-duration-control'),
    timelineDurationSlider: document.getElementById('timeline-duration-slider'),
    timelineDurationVal: document.getElementById('timeline-duration-val'),
    timelineRuler: document.getElementById('timeline-ruler'),
    timelineTracks: document.getElementById('timeline-tracks'),
    timelinePlayhead: document.getElementById('timeline-playhead'),
    timelineTracksContainer: document.getElementById('timeline-tracks-container'),
    btnResetRotation: document.getElementById('btn-reset-rotation')
  };

  // Setup offscreen helper canvas for processing
  const offscreenCanvas = document.createElement('canvas');
  const offscreenCtx = offscreenCanvas.getContext('2d');
  
  // Rendering main context
  const ctx = UI.mainCanvas.getContext('2d', { willReadFrequently: true });

  // --- IMAGE PROCESSOR (LAYERING AND MASKING) ---
  class ImageProcessor {
    static async loadImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Failed to load image structure."));
          img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsDataURL(file);
      });
    }

    static async addImages(files) {
      UI.canvasLoading.classList.remove('hidden');
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const img = await ImageProcessor.loadImage(file);
          const imgObj = {
            id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
            name: file.name,
            img: img,
            layers: []
          };
          state.uploadedImages.push(imgObj);
        } catch (err) {
          console.error("Error loading image: " + file.name, err);
          alert("Error loading " + file.name + ": " + err.message);
        }
      }
      
      if (state.uploadedImages.length > 0) {
        state.imageLoaded = true;
        if (state.activeImageIndex === -1) {
          state.activeImageIndex = 0;
        }
        
        ImageProcessor.reprocessAllImagesLayers();
        ImageProcessor.initializeRenderStack();
        updateImagesDeckUI();
      } else {
        state.imageLoaded = false;
      }
      UI.canvasLoading.classList.add('hidden');
    }

    static processImageLayers(imgObj) {
      const maxDim = 1024;
      let w = imgObj.img.naturalWidth;
      let h = imgObj.img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(imgObj.img, 0, 0, w, h);
      const imgData = tempCtx.getImageData(0, 0, w, h);
      const srcPixels = imgData.data;

      imgObj.layers = [];
      const N = state.layerCount;

      // Pre-calculate random boundaries for random mode if needed
      if (state.maskType === 'random' && (!state.randomBoundaries || state.randomBoundaries.length !== N + 1)) {
        const points = [];
        for (let k = 0; k < N - 1; k++) {
          points.push(Math.random() * 255);
        }
        points.sort((a, b) => a - b);
        state.randomBoundaries = [0, ...points, 255];
      }

      // Pre-calculate adaptive boundaries for adaptive-luminosity mode if needed
      let adaptiveBoundaries = [];
      if (state.maskType === 'adaptive-luminosity') {
        const hist = new Array(256).fill(0);
        let totalSamples = 0;
        for (let p = 0; p < srcPixels.length; p += 4) {
          const r = srcPixels[p];
          const g = srcPixels[p + 1];
          const b = srcPixels[p + 2];
          const a = srcPixels[p + 3];
          if (a > 10) { // count non-transparent pixels
            const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            hist[lum]++;
            totalSamples++;
          }
        }

        adaptiveBoundaries = new Array(N + 1);
        adaptiveBoundaries[0] = 0;
        adaptiveBoundaries[N] = 255;
        
        let accum = 0;
        let targetIdx = 1;
        for (let val = 0; val < 256; val++) {
          accum += hist[val];
          const targetAccum = (totalSamples * targetIdx) / N;
          if (accum >= targetAccum && targetIdx < N) {
            adaptiveBoundaries[targetIdx] = val;
            targetIdx++;
          }
        }
        // Fill gaps if any
        for (let k = 1; k < N; k++) {
          if (adaptiveBoundaries[k] === undefined) {
            adaptiveBoundaries[k] = Math.round((255 * k) / N);
          }
        }
        imgObj.adaptiveBoundaries = adaptiveBoundaries;
      }

      for (let i = 0; i < N; i++) {
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = w;
        layerCanvas.height = h;
        const layerCtx = layerCanvas.getContext('2d');
        const layerImgData = layerCtx.createImageData(w, h);
        const destPixels = layerImgData.data;

        if (state.maskType === 'luminosity') {
          // Band Slicing Math
          const B = 255 / N;
          const Si = B * i;
          const Ei = B * (i + 1);
          // Feather region width
          const f = Math.max(0.1, B * state.maskFeather);

          for (let p = 0; p < srcPixels.length; p += 4) {
            const r = srcPixels[p];
            const g = srcPixels[p + 1];
            const b = srcPixels[p + 2];
            const a = srcPixels[p + 3];

            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            
            let weight = 0;
            if (lum >= Si + f && lum <= Ei - f) {
              weight = 1.0;
            } else if (lum < Si + f) {
              // Left Roll-off
              if (i === 0) {
                weight = 1.0; // keep blacks in first layer
              } else if (lum >= Si - f) {
                let wVal = (lum - (Si - f)) / (2 * f);
                weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal; // smoothstep
              }
            } else if (lum > Ei - f) {
              // Right Roll-off
              if (i === N - 1) {
                weight = 1.0; // keep highlights in last layer
              } else if (lum <= Ei + f) {
                let wVal = 1.0 - (lum - (Ei - f)) / (2 * f);
                weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
              }
            }

            if (weight > 0.02) {
              destPixels[p] = r;
              destPixels[p + 1] = g;
              destPixels[p + 2] = b;
              destPixels[p + 3] = a * weight;
            } else {
              destPixels[p + 3] = 0;
            }
          }
        } 
        else if (state.maskType === 'adaptive-luminosity' && imgObj.adaptiveBoundaries) {
          // Adaptive Slicing Math (using pre-calculated quantiles)
          const Si = imgObj.adaptiveBoundaries[i];
          const Ei = imgObj.adaptiveBoundaries[i + 1];
          const Wi = Ei - Si;
          const f = Math.max(0.1, Wi * state.maskFeather);

          for (let p = 0; p < srcPixels.length; p += 4) {
            const r = srcPixels[p];
            const g = srcPixels[p + 1];
            const b = srcPixels[p + 2];
            const a = srcPixels[p + 3];

            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            
            let weight = 0;
            if (lum >= Si + f && lum <= Ei - f) {
              weight = 1.0;
            } else if (lum < Si + f) {
              // Left Roll-off
              if (i === 0) {
                weight = 1.0; // keep blacks in first layer
              } else if (lum >= Si - f) {
                let wVal = (lum - (Si - f)) / (2 * f);
                weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
              }
            } else if (lum > Ei - f) {
              // Right Roll-off
              if (i === N - 1) {
                weight = 1.0; // keep highlights in last layer
              } else if (lum <= Ei + f) {
                let wVal = 1.0 - (lum - (Ei - f)) / (2 * f);
                weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
              }
            }

            if (weight > 0.02) {
              destPixels[p] = r;
              destPixels[p + 1] = g;
              destPixels[p + 2] = b;
              destPixels[p + 3] = a * weight;
            } else {
              destPixels[p + 3] = 0;
            }
          }
        }
        else if (state.maskType === 'color-range') {
          // Circular Hue Slicing Math
          const B = 360 / N;
          const Ci = B * (i + 0.5);
          const halfB = B / 2;
          const f = Math.max(0.1, halfB * state.maskFeather);

          for (let p = 0; p < srcPixels.length; p += 4) {
            const r = srcPixels[p];
            const g = srcPixels[p + 1];
            const b = srcPixels[p + 2];
            const a = srcPixels[p + 3];

            const { h: pixelHue, s: sat } = rgbToHsl(r, g, b);
            
            let weight = 0;
            if (sat < 0.12) {
              // Distribute grayscale elements to midtones (Layer 2) to maintain structure
              weight = i === Math.floor(N / 2) ? 0.4 : 0.0;
            } else {
              let dH = Math.abs(pixelHue - Ci);
              if (dH > 180) dH = 360 - dH; // circular wrap

              if (dH <= halfB - f) {
                weight = 1.0;
              } else if (dH < halfB + f) {
                let wVal = 1.0 - (dH - (halfB - f)) / (2 * f);
                weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
              }
            }

            if (weight > 0.02) {
              destPixels[p] = r;
              destPixels[p + 1] = g;
              destPixels[p + 2] = b;
              destPixels[p + 3] = a * weight;
            } else {
              destPixels[p + 3] = 0;
            }
          }
        }
        else if (state.maskType === 'random' && state.randomBoundaries) {
          // Random Width Slicing Math
          const Si = state.randomBoundaries[i];
          const Ei = state.randomBoundaries[i + 1];
          const Wi = Ei - Si;
          const f = Math.max(0.1, Wi * state.maskFeather);
          
          for (let p = 0; p < srcPixels.length; p += 4) {
            const r = srcPixels[p];
            const g = srcPixels[p + 1];
            const b = srcPixels[p + 2];
            const a = srcPixels[p + 3];

            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            
            let weight = 0;
            if (lum >= Si + f && lum <= Ei - f) {
              weight = 1.0;
            } else if (lum < Si + f) {
              if (i === 0) {
                weight = 1.0;
              } else if (lum >= Si - f) {
                let wVal = (lum - (Si - f)) / (2 * f);
                weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
              }
            } else if (lum > Ei - f) {
              if (i === N - 1) {
                weight = 1.0;
              } else if (lum <= Ei + f) {
                let wVal = 1.0 - (lum - (Ei - f)) / (2 * f);
                weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
              }
            }

            if (weight > 0.02) {
              destPixels[p] = r;
              destPixels[p + 1] = g;
              destPixels[p + 2] = b;
              destPixels[p + 3] = a * weight;
            } else {
              destPixels[p + 3] = 0;
            }
          }
        }

        layerCtx.putImageData(layerImgData, 0, 0);
        imgObj.layers.push(layerCanvas);
      }
    }

    static reprocessAllImagesLayers() {
      state.uploadedImages.forEach(imgObj => {
        ImageProcessor.processImageLayers(imgObj);
      });
      drawMaskGraph();
      drawInspectorPreview();
    }

    static initializeRenderStack() {
      if (state.uploadedImages.length === 0) return;
      
      const N = state.layerCount;
      state.layers = [];
      
      for (let i = 0; i < N; i++) {
        // Select random image for this layer initially
        const randomImgObj = state.uploadedImages[Math.floor(Math.random() * state.uploadedImages.length)];
        state.layers.push({
          canvas: randomImgObj.layers[i],
          index: i,
          initialZ: i / N,
          lastWrapCount: 0,
          sourceImageId: randomImgObj.id
        });
      }
      
      ImageProcessor.renderActiveImageLayersPreview();
      state.selectedInspectorLayer = 0; // Reset selected inspector layer
      drawInspectorPreview();
      resizeMainCanvas();
    }

    static renderActiveImageLayersPreview() {
      UI.layersList.innerHTML = '';
      if (state.activeImageIndex === -1 || state.uploadedImages.length === 0) {
        UI.layersList.innerHTML = '<div class="empty-state">No image loaded</div>';
        return;
      }

      const activeImgObj = state.uploadedImages[state.activeImageIndex];
      if (!activeImgObj || !activeImgObj.layers) return;

      activeImgObj.layers.forEach((layerCanvas, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'layer-thumbnail' + (idx === state.selectedInspectorLayer ? ' active' : '');
        thumb.dataset.index = idx;
        
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = 64;
        previewCanvas.height = 64;
        const pCtx = previewCanvas.getContext('2d');
        pCtx.drawImage(layerCanvas, 0, 0, 64, 64);
        
        const label = document.createElement('span');
        label.className = 'layer-label';
        label.innerText = `L${idx+1}`;

        thumb.appendChild(previewCanvas);
        thumb.appendChild(label);
        UI.layersList.appendChild(thumb);
      });
    }
  }

  // Live drawing for selected layer inspection
  function drawInspectorPreview() {
    if (state.uploadedImages.length === 0 || state.activeImageIndex === -1) {
      UI.layerInspectorSection.style.display = 'none';
      return;
    }

    const activeImgObj = state.uploadedImages[state.activeImageIndex];
    if (!activeImgObj || !activeImgObj.layers || activeImgObj.layers.length === 0) {
      UI.layerInspectorSection.style.display = 'none';
      return;
    }

    UI.layerInspectorSection.style.display = 'flex';
    UI.layerInspectorSection.classList.remove('collapsed');

    // Clamp selected layer index
    if (state.selectedInspectorLayer >= activeImgObj.layers.length) {
      state.selectedInspectorLayer = activeImgObj.layers.length - 1;
    }
    if (state.selectedInspectorLayer < 0) {
      state.selectedInspectorLayer = 0;
    }

    const idx = state.selectedInspectorLayer;
    const layerCanvas = activeImgObj.layers[idx];
    if (!layerCanvas) return;

    // Update label
    UI.inspectorLayerName.innerText = `Layer L${idx + 1}`;
    
    // Update preview canvas size and draw
    const previewCanvas = UI.inspectorPreviewCanvas;
    previewCanvas.width = layerCanvas.width;
    previewCanvas.height = layerCanvas.height;
    
    const pCtx = previewCanvas.getContext('2d');
    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    pCtx.drawImage(layerCanvas, 0, 0);

    // Apply class for background mode
    const container = previewCanvas.parentElement;
    container.className = 'inspector-preview-container bg-' + state.inspectorBgMode;

    // Calculate pixel percentage
    const lCtx = layerCanvas.getContext('2d');
    const imgData = lCtx.getImageData(0, 0, layerCanvas.width, layerCanvas.height);
    const pixels = imgData.data;
    let nonTransparent = 0;
    for (let p = 3; p < pixels.length; p += 4) {
      if (pixels[p] > 10) {
        nonTransparent++;
      }
    }
    const totalPixels = layerCanvas.width * layerCanvas.height;
    const percent = ((nonTransparent / totalPixels) * 100).toFixed(1);
    
    // Detailed stat readout depending on mask type
    let rangeText = '';
    if (state.maskType === 'adaptive-luminosity' && activeImgObj.adaptiveBoundaries) {
      const low = Math.round(activeImgObj.adaptiveBoundaries[idx]);
      const high = Math.round(activeImgObj.adaptiveBoundaries[idx + 1]);
      rangeText = ` (Br. Range: ${low}-${high})`;
    } else if (state.maskType === 'luminosity') {
      const B = 255 / state.layerCount;
      rangeText = ` (Br. Range: ${Math.round(B * idx)}-${Math.round(B * (idx + 1))})`;
    }
    UI.inspectorLayerStat.innerText = `Details: ${percent}% of pixels${rangeText}`;
  }

  // Live drawing for mathematical threshold masks
  function drawMaskGraph() {
    const canvas = document.getElementById('mask-graph-canvas');
    if (!canvas) return;
    const gCtx = canvas.getContext('2d');
    const gw = canvas.width;
    const gh = canvas.height;
    
    // Clear graph
    gCtx.fillStyle = '#050914';
    gCtx.fillRect(0, 0, gw, gh);

    // Draw background grid lines
    gCtx.strokeStyle = 'rgba(0, 242, 254, 0.06)';
    gCtx.lineWidth = 1;
    for (let x = 0.25; x < 1; x += 0.25) {
      gCtx.beginPath();
      gCtx.moveTo(x * gw, 0);
      gCtx.lineTo(x * gw, gh);
      gCtx.stroke();
    }

    const N = state.layerCount;
    if (state.uploadedImages.length === 0) {
      gCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      gCtx.font = '9px JetBrains Mono';
      gCtx.textAlign = 'center';
      gCtx.fillText('UPLOAD IMAGE(S) TO VIEW MASKS', gw / 2, gh / 2 + 3);
      return;
    }

    // Determine graph labels
    const lblLeft = document.getElementById('graph-label-left');
    const lblRight = document.getElementById('graph-label-right');
    const activeImgObj = state.uploadedImages[state.activeImageIndex >= 0 ? state.activeImageIndex : 0];

    if (state.maskType === 'luminosity' || state.maskType === 'adaptive-luminosity') {
      lblLeft.innerText = 'Shadows (0)';
      lblRight.innerText = 'Highlights (255)';
    } else if (state.maskType === 'color-range') {
      lblLeft.innerText = 'Reds (0°)';
      lblRight.innerText = 'Violets (360°)';
    } else {
      lblLeft.innerText = 'Min (0)';
      lblRight.innerText = 'Max (255)';
    }

    // Plot curves
    for (let i = 0; i < N; i++) {
      gCtx.beginPath();
      const hue = (360 * i) / N;
      gCtx.strokeStyle = `hsla(${hue}, 85%, 60%, 0.85)`;
      gCtx.fillStyle = `hsla(${hue}, 85%, 60%, 0.10)`;
      gCtx.lineWidth = 1.5;
      
      gCtx.moveTo(0, gh);
      
      for (let x = 0; x <= gw; x++) {
        let weight = 0;
        
        if (state.maskType === 'luminosity') {
          const val = (x / gw) * 255;
          const B = 255 / N;
          const Si = B * i;
          const Ei = B * (i + 1);
          const f = Math.max(0.1, B * state.maskFeather);
          
          if (val >= Si + f && val <= Ei - f) {
            weight = 1.0;
          } else if (val < Si + f) {
            if (i === 0) {
              weight = 1.0;
            } else if (val >= Si - f) {
              let wVal = (val - (Si - f)) / (2 * f);
              weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
            }
          } else if (val > Ei - f) {
            if (i === N - 1) {
              weight = 1.0;
            } else if (val <= Ei + f) {
              let wVal = 1.0 - (val - (Ei - f)) / (2 * f);
              weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
            }
          }
        } 
        else if (state.maskType === 'adaptive-luminosity' && activeImgObj && activeImgObj.adaptiveBoundaries) {
          const val = (x / gw) * 255;
          const Si = activeImgObj.adaptiveBoundaries[i];
          const Ei = activeImgObj.adaptiveBoundaries[i + 1];
          const Wi = Ei - Si;
          const f = Math.max(0.1, Wi * state.maskFeather);
          
          if (val >= Si + f && val <= Ei - f) {
            weight = 1.0;
          } else if (val < Si + f) {
            if (i === 0) {
              weight = 1.0;
            } else if (val >= Si - f) {
              let wVal = (val - (Si - f)) / (2 * f);
              weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
            }
          } else if (val > Ei - f) {
            if (i === N - 1) {
              weight = 1.0;
            } else if (val <= Ei + f) {
              let wVal = 1.0 - (val - (Ei - f)) / (2 * f);
              weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
            }
          }
        }
        else if (state.maskType === 'color-range') {
          const val = (x / gw) * 360;
          const B = 360 / N;
          const Ci = B * (i + 0.5);
          let dH = Math.abs(val - Ci);
          if (dH > 180) dH = 360 - dH;
          
          const halfB = B / 2;
          const f = Math.max(0.1, halfB * state.maskFeather);
          
          if (dH <= halfB - f) {
            weight = 1.0;
          } else if (dH < halfB + f) {
            let wVal = 1.0 - (dH - (halfB - f)) / (2 * f);
            weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
          }
        }
        else if (state.maskType === 'random' && state.randomBoundaries) {
          const val = (x / gw) * 255;
          const Si = state.randomBoundaries[i];
          const Ei = state.randomBoundaries[i + 1];
          const Wi = Ei - Si;
          const f = Math.max(0.1, Wi * state.maskFeather);

          if (val >= Si + f && val <= Ei - f) {
            weight = 1.0;
          } else if (val < Si + f) {
            if (i === 0) {
              weight = 1.0;
            } else if (val >= Si - f) {
              let wVal = (val - (Si - f)) / (2 * f);
              weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
            }
          } else if (val > Ei - f) {
            if (i === N - 1) {
              weight = 1.0;
            } else if (val <= Ei + f) {
              let wVal = 1.0 - (val - (Ei - f)) / (2 * f);
              weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
            }
          }
        }
        
        const gy = gh - weight * (gh - 12) - 4;
        gCtx.lineTo(x, gy);
      }
      
      gCtx.lineTo(gw, gh);
      gCtx.closePath();
      gCtx.fill();
      gCtx.stroke();
    }
  }

  // Utility: RGB to HSL conversion
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h * 360, s: s, l: l };
  }



  // --- GLITCH MANAGER ---
  class GlitchManager {
    static update(dt) {
      if (!state.glitchEnabled) {
        state.glitchActive = false;
        state.shakeX = 0;
        state.shakeY = 0;
        state.shakeRot = 0;
        return;
      }

      if (state.glitchActive) {
        state.glitchTimer -= dt;
        if (state.glitchTimer <= 0) {
          state.glitchActive = false;
          state.shakeX = 0;
          state.shakeY = 0;
          state.shakeRot = 0;
        } else {
          const decay = state.glitchTimer / 0.35;
          state.shakeX = (Math.random() - 0.5) * state.glitchSeverity * decay;
          state.shakeY = (Math.random() - 0.5) * state.glitchSeverity * decay;
          state.shakeRot = (Math.random() - 0.5) * 0.05 * decay;
        }
      } else {
        if (state.isPlaying || state.isExporting) {
          const fpsFactor = 60 * dt;
          const triggerChance = (state.glitchFrequency / 100) * 0.015 * fpsFactor;
          if (Math.random() < triggerChance) {
            GlitchManager.triggerGlitch();
          }
        }
      }
    }

    static triggerGlitch() {
      if (!state.glitchEnabled) return;
      state.glitchActive = true;
      state.glitchTimer = 0.2 + Math.random() * 0.25;
      
      UI.glitchFlash.classList.add('active');
      setTimeout(() => UI.glitchFlash.classList.remove('active'), 50);

      const originalSpeed = state.zoomSpeed;
      state.zoomSpeed *= 3.0;
      setTimeout(() => {
        state.zoomSpeed = originalSpeed;
      }, 150);
    }

    static applyPostProcessGlitches(renderCtx, w, h) {
      if (!state.glitchEnabled) return;

      // 1. RGB Split
      let shift = state.rgbSplit;
      if (state.glitchActive) {
        shift += Math.round(state.glitchSeverity * 0.5);
      }

      if (shift > 0) {
        const imgData = renderCtx.getImageData(0, 0, w, h);
        const src = imgData.data;
        const outData = renderCtx.createImageData(w, h);
        const dst = outData.data;
        const len = src.length;

        for (let i = 0; i < len; i += 4) {
          dst[i + 1] = src[i + 1];
          dst[i + 3] = src[i + 3];
        }

        const rowBytes = w * 4;
        for (let y = 0; y < h; y++) {
          const rowOffset = y * rowBytes;
          for (let x = 0; x < w; x++) {
            const pixelOffset = rowOffset + x * 4;

            const rx = Math.max(0, Math.min(w - 1, x - shift));
            dst[pixelOffset] = src[rowOffset + rx * 4];

            const bx = Math.max(0, Math.min(w - 1, x + shift));
            dst[pixelOffset + 2] = src[rowOffset + bx * 4];
          }
        }
        renderCtx.putImageData(outData, 0, 0);
      }

      // 2. Pixel Sorting
      let sortIntensity = state.pixelSort;
      if (state.glitchActive) {
        sortIntensity = Math.min(100, sortIntensity + 40);
      }

      if (sortIntensity > 0) {
        const imgData = renderCtx.getImageData(0, 0, w, h);
        const data = imgData.data;
        
        const numRows = Math.round(h * (sortIntensity / 100) * 0.15);
        
        for (let k = 0; k < numRows; k++) {
          const y = Math.floor(Math.random() * h);
          const rowStart = y * w * 4;
          
          let x = 0;
          while (x < w) {
            let start = x;
            while (start < w) {
              const idx = rowStart + start * 4;
              const brightness = 0.299*data[idx] + 0.587*data[idx+1] + 0.114*data[idx+2];
              if (brightness > 120) break;
              start++;
            }
            if (start >= w) break;

            let end = start;
            while (end < w) {
              const idx = rowStart + end * 4;
              const brightness = 0.299*data[idx] + 0.587*data[idx+1] + 0.114*data[idx+2];
              if (brightness <= 80) break;
              end++;
            }
            
            const spanLen = end - start;
            if (spanLen > 8) {
              const pixels = [];
              for (let i = start; i < end; i++) {
                const idx = rowStart + i * 4;
                pixels.push({
                  r: data[idx],
                  g: data[idx+1],
                  b: data[idx+2],
                  a: data[idx+3],
                  br: 0.299*data[idx] + 0.587*data[idx+1] + 0.114*data[idx+2]
                });
              }

              pixels.sort((a, b) => b.br - a.br);

              for (let i = 0; i < spanLen; i++) {
                const idx = rowStart + (start + i) * 4;
                data[idx] = pixels[i].r;
                data[idx+1] = pixels[i].g;
                data[idx+2] = pixels[i].b;
                data[idx+3] = pixels[i].a;
              }
            }
            x = end + 1;
          }
        }
        renderCtx.putImageData(imgData, 0, 0);
      }
    }
  }

  // --- RENDERING ROUTINES ---
  
  function resizeMainCanvas() {
    if (state.uploadedImages.length === 0 || state.activeImageIndex === -1) return;
    const activeImgObj = state.uploadedImages[state.activeImageIndex];
    const activeImg = activeImgObj.img;

    const container = UI.mainCanvas.parentElement;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const imgW = activeImg.naturalWidth;
    const imgH = activeImg.naturalHeight;
    
    // Calculate layout aspect ratio
    let ratio = imgW / imgH;
    const arMode = state.aspectRatio;
    if (arMode === '16-9') ratio = 16 / 9;
    else if (arMode === '9-16') ratio = 9 / 16;
    else if (arMode === '1-1') ratio = 1 / 1;
    else if (arMode === '4-5') ratio = 4 / 5;
    else if (arMode === '21-9') ratio = 21 / 9;

    let canvasW = cw;
    let canvasH = cw / ratio;

    if (canvasH > ch) {
      canvasH = ch;
      canvasW = ch * ratio;
    }

    UI.mainCanvas.width = canvasW;
    UI.mainCanvas.height = canvasH;

    // Resize viewport container to preserve aspect ratio framing in CSS
    container.style.aspectRatio = ratio;

    // Size offscreen canvas buffer to match the active ratio with 1024px bounds
    const maxDim = 1024;
    if (ratio >= 1.0) {
      offscreenCanvas.width = maxDim;
      offscreenCanvas.height = Math.round(maxDim / ratio);
    } else {
      offscreenCanvas.height = maxDim;
      offscreenCanvas.width = Math.round(maxDim * ratio);
    }
  }

  function renderFrame(renderTime) {
    if (state.uploadedImages.length === 0 || state.layers.length === 0) return;

    const canvasW = UI.mainCanvas.width;
    const canvasH = UI.mainCanvas.height;

    const bufferCanvas = offscreenCanvas;
    const bw = bufferCanvas.width;
    const bh = bufferCanvas.height;
    
    offscreenCtx.fillStyle = '#000000';
    offscreenCtx.fillRect(0, 0, bw, bh);

    const dur = getTimelineDuration();
    const speed = getAdjustedZoomSpeed(dur);

    const layerDepths = state.layers.map(layer => {
      const zRawLinear = layer.initialZ + renderTime * speed;
      let wrapCount = Math.floor(zRawLinear);
      if (wrapCount !== layer.lastWrapCount) {
        layer.lastWrapCount = wrapCount;
        if (state.uploadedImages.length > 0) {
          const randomImgObj = state.uploadedImages[Math.floor(Math.random() * state.uploadedImages.length)];
          layer.canvas = randomImgObj.layers[layer.index];
          layer.sourceImageId = randomImgObj.id;
        }
      }
      
      let z = zRawLinear % 1.0;
      if (z < 0) z += 1.0;

      // Apply layer-specific dynamic depth shift
      if (state.glitchEnabled && state.depthModulation > 0) {
        const intensity = state.depthModulation / 100;
        const omega = (2 * Math.PI) / dur;
        const phase = layer.index * 1.5;
        const harmonic = (layer.index % 2) + 1; // 1st or 2nd harmonic of the loop
        
        z += Math.sin(renderTime * omega * harmonic + phase) * intensity * 0.15;
        z = ((z % 1.0) + 1.0) % 1.0;
      }
      
      // Calculate modulated zoom depth if glitch is enabled and modulation is set
      let currentZoomDepth = state.zoomDepth;
      if (state.glitchEnabled && state.depthModulation > 0) {
        const t = renderTime;
        const intensity = state.depthModulation / 100;
        const omega = (2 * Math.PI) / dur;
        
        // Loop-aligned frequencies for smooth, perfect looping transitions
        const wave1 = Math.sin(t * omega) * 0.5;       // Fundamental (entire loop duration)
        const wave2 = Math.cos(t * omega * 2) * 0.25;  // 2nd harmonic
        const wave3 = Math.sin(t * omega * 3) * 0.12;  // 3rd harmonic (gentle fast jitter)
        const noise = wave1 + wave2 + wave3;
        
        // Capped at a minimum of 1.2 to prevent mathematical inversion/division errors
        const depthOffset = noise * intensity * 3.0;
        currentZoomDepth = Math.max(1.2, state.zoomDepth + depthOffset);
      }

      // Calculate exponential scaling such that z = 0.5 corresponds to scale = 1.0
      const scale = Math.pow(currentZoomDepth, (z - 0.5) * 2.0);
      
      let opacity = 1.0;
      if (z < 0.15) {
        opacity = z / 0.15;
      } else if (z > 0.8) {
        opacity = (1.0 - z) / 0.2;
      }
      opacity = Math.max(0.0, Math.min(1.0, opacity));

      return { layer, z, scale, opacity };
    });

    layerDepths.sort((a, b) => a.scale - b.scale);

    offscreenCtx.save();
    
    if (state.glitchEnabled && state.glitchActive) {
      offscreenCtx.translate(state.shakeX, state.shakeY);
      offscreenCtx.rotate(state.shakeRot);
    }

    if (state.cameraDrift > 0) {
      const driftX = Math.sin(renderTime * 1.5) * state.cameraDrift * 30;
      const driftY = Math.cos(renderTime * 0.9) * state.cameraDrift * 20;
      offscreenCtx.translate(driftX, driftY);
    }

    state.cameraAngle += (state.cameraRotation * (1/60)) * (Math.PI / 180);

    layerDepths.forEach(({ layer, z, scale, opacity }) => {
      if (opacity <= 0 || !layer.canvas) return;

      offscreenCtx.save();
      offscreenCtx.translate(bw / 2, bh / 2);
      
      const twist = state.cameraAngle * (1.0 - z * 0.4);
      offscreenCtx.rotate(twist);

      // Apply crop scaling (cover) to match the layer aspect ratio to viewport buffer aspect ratio
      const lw = layer.canvas.width;
      const lh = layer.canvas.height;
      const coverScale = Math.max(bw / lw, bh / lh);

      offscreenCtx.scale(scale * coverScale, scale * coverScale);
      offscreenCtx.globalAlpha = opacity;
      
      offscreenCtx.drawImage(layer.canvas, -lw / 2, -lh / 2);
      offscreenCtx.restore();
    });
    offscreenCtx.restore();

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const mode = state.mirrorMode;
    if (mode === 'none') {
      ctx.drawImage(bufferCanvas, 0, 0, canvasW, canvasH);
    }
    else if (mode === 'horizontal') {
      ctx.drawImage(bufferCanvas, 0, 0, bw / 2, bh, 0, 0, canvasW / 2, canvasH);
      ctx.save();
      ctx.translate(canvasW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(bufferCanvas, 0, 0, bw / 2, bh, 0, 0, canvasW / 2, canvasH);
      ctx.restore();
    }
    else if (mode === 'vertical') {
      ctx.drawImage(bufferCanvas, 0, 0, bw, bh / 2, 0, 0, canvasW, canvasH / 2);
      ctx.save();
      ctx.translate(0, canvasH);
      ctx.scale(1, -1);
      ctx.drawImage(bufferCanvas, 0, 0, bw, bh / 2, 0, 0, canvasW, canvasH / 2);
      ctx.restore();
    }
    else if (mode === 'quad') {
      const qw = canvasW / 2;
      const qh = canvasH / 2;

      ctx.drawImage(bufferCanvas, 0, 0, bw / 2, bh / 2, 0, 0, qw, qh);
      
      ctx.save();
      ctx.translate(canvasW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(bufferCanvas, 0, 0, bw / 2, bh / 2, 0, 0, qw, qh);
      ctx.restore();

      ctx.save();
      ctx.translate(0, canvasH);
      ctx.scale(1, -1);
      ctx.drawImage(bufferCanvas, 0, 0, bw / 2, bh / 2, 0, 0, qw, qh);
      ctx.restore();

      ctx.save();
      ctx.translate(canvasW, canvasH);
      ctx.scale(-1, -1);
      ctx.drawImage(bufferCanvas, 0, 0, bw / 2, bh / 2, 0, 0, qw, qh);
      ctx.restore();
    }
    else if (mode === 'kaleidoscope') {
      const cx = canvasW / 2;
      const cy = canvasH / 2;
      const radius = Math.sqrt(cx * cx + cy * cy);
      const slices = state.kaleidoscopeSlices;
      const angle = (Math.PI * 2) / slices;

      ctx.save();
      ctx.translate(cx, cy);

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvasW;
      maskCanvas.height = canvasH;
      const mCtx = maskCanvas.getContext('2d');
      
      mCtx.save();
      mCtx.translate(cx, cy);
      mCtx.beginPath();
      mCtx.moveTo(0, 0);
      mCtx.arc(0, 0, radius, -angle / 2, angle / 2);
      mCtx.closePath();
      mCtx.clip();
      mCtx.drawImage(bufferCanvas, -cx, -cy, canvasW, canvasH);
      mCtx.restore();

      for (let s = 0; s < slices; s++) {
        ctx.save();
        ctx.rotate(s * angle);
        if (s % 2 === 1) {
          ctx.scale(1, -1);
        }
        ctx.drawImage(maskCanvas, -cx, -cy);
        ctx.restore();
      }
      ctx.restore();
    }

    if (state.glitchEnabled) {
      GlitchManager.applyPostProcessGlitches(ctx, canvasW, canvasH);
    }

    // Draw Text Overlays over the final output
    drawTextOverlays(ctx, canvasW, canvasH, renderTime);

    // Draw Global Fade In/Out Overlay
    if (state.videoFadeActive) {
      const dur = getTimelineDuration();
      const fadeDur = Math.min(state.videoFadeDuration || 0.5, dur / 2);
      
      let overlayAlpha = 0;
      if (renderTime < fadeDur) {
        overlayAlpha = 1.0 - (renderTime / fadeDur);
      } else if (renderTime > dur - fadeDur) {
        overlayAlpha = (renderTime - (dur - fadeDur)) / fadeDur;
      }
      
      if (overlayAlpha > 0) {
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = Math.max(0, Math.min(1, overlayAlpha));
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();
      }
    }
  }

  // --- AUDIO SYNCHRONIZATION SYSTEM ---
  let audioCtx = null;
  let activeAudioSource = null;
  let activeAudioGain = null;
  let exportAudioNode = null; // Special destination route for WebM recording

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function stopAudioSource() {
    if (activeAudioSource) {
      try {
        activeAudioSource.stop();
      } catch (err) {}
      activeAudioSource = null;
    }
    activeAudioGain = null;
  }

  function syncAudioPlayback() {
    stopAudioSource();

    if (!state.isPlaying || !state.audioTrack || !state.imageLoaded || state.isExporting) {
      return;
    }

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const dur = getTimelineDuration();
    const loopTime = ((state.time % dur) + dur) % dur;

    const track = state.audioTrack;
    const start = track.timelineStart;
    const end = start + track.duration;

    if (loopTime >= start && loopTime < end) {
      const relativeTime = loopTime - start;
      const filePlayStart = track.sourceOffset + relativeTime;

      if (filePlayStart >= 0 && filePlayStart < track.buffer.duration) {
        const blockTimeLeft = track.duration - relativeTime;
        const loopTimeLeft = dur - loopTime;
        const playDuration = Math.min(blockTimeLeft, loopTimeLeft);

        try {
          const source = ctx.createBufferSource();
          source.buffer = track.buffer;

          const gainNode = ctx.createGain();
          gainNode.gain.value = track.volume !== undefined ? track.volume : 0.8;

          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          source.start(ctx.currentTime, filePlayStart, playDuration);
          activeAudioSource = source;
          activeAudioGain = gainNode;
        } catch (err) {
          console.error("Failed to start AudioBufferSourceNode:", err);
        }
      }
    }
  }

  // --- TIMELINE MANAGEMENT & TEXT OVERLAYS ENGINE ---

  function getTimelineDuration() {
    if (state.exportMode === 'duration') {
      return state.exportDuration;
    } else {
      const absSpeed = Math.abs(state.zoomSpeed);
      if (absSpeed > 0.0001) {
        return state.exportLoops / absSpeed;
      }
      return 5.0; // fallback
    }
  }

  function getAdjustedZoomSpeed(dur) {
    const rawSpeed = state.zoomSpeed;
    if (Math.abs(rawSpeed) < 0.0001) return 0;
    const rawCycles = dur * Math.abs(rawSpeed);
    const cycles = Math.max(1, Math.round(rawCycles));
    const direction = rawSpeed >= 0 ? 1 : -1;
    return direction * (cycles / dur);
  }

  function clampTextIntervals() {
    const dur = getTimelineDuration();
    state.texts.forEach(txt => {
      if (txt.startTime >= dur) {
        const blockLen = txt.endTime - txt.startTime;
        txt.startTime = Math.max(0, dur - blockLen);
        txt.endTime = dur;
      } else if (txt.endTime > dur) {
        txt.endTime = dur;
      }
      
      if (txt.endTime - txt.startTime < 0.2) {
        txt.endTime = Math.min(dur, txt.startTime + 0.2);
        txt.startTime = Math.max(0, txt.endTime - 0.2);
      }
    });
  }

  function updateTimelineRuler() {
    if (!UI.timelineRuler) return;
    const dur = getTimelineDuration();
    
    // Synchronize timeline duration control values
    if (UI.timelineDurationSlider && UI.timelineDurationVal) {
      UI.timelineDurationSlider.value = Math.round(dur);
      UI.timelineDurationVal.innerText = `${dur.toFixed(1)}s`;
    }
    
    // Set container width dynamically to allow scrollbar when long
    const pixelsPerSecond = 30; // 30px per second
    const widthPx = Math.max(700, Math.round(dur * pixelsPerSecond));
    UI.timelineTracksContainer.style.width = `${widthPx}px`;

    UI.timelineRuler.innerHTML = '';
    
    let interval = 0.5;
    if (dur > 30) interval = 5.0;
    else if (dur > 15) interval = 2.0;
    else if (dur > 5) interval = 1.0;
    
    for (let t = 0; t <= dur; t += interval) {
      const percent = (t / dur) * 100;
      const tick = document.createElement('div');
      tick.className = 'ruler-tick' + (t % 1 === 0 ? ' major' : '');
      tick.style.left = `${percent}%`;
      tick.innerText = `${t.toFixed(1)}s`;
      UI.timelineRuler.appendChild(tick);
    }
  }

  function updateTimelineTracks() {
    if (!UI.timelineTracks) return;
    clampTextIntervals();
    UI.timelineTracks.innerHTML = '';
    
    if (state.texts.length === 0 && !state.audioTrack) {
      UI.timelineTracks.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem; text-align: center; padding-top: 15px; font-family: var(--font-display);">No text overlays or soundtrack. Click "Add Text" or "Add Audio" to start.</div>';
      return;
    }
    
    const dur = getTimelineDuration();

    // 1. Render Audio Track (if active)
    if (state.audioTrack) {
      const track = state.audioTrack;
      const row = document.createElement('div');
      row.className = 'timeline-track-row audio-track-row';
      row.dataset.id = 'audio';
      row.dataset.type = 'audio';
      
      const block = document.createElement('div');
      block.className = 'timeline-block audio-block' + (state.selectedAudio ? ' selected' : '');
      block.dataset.id = 'audio';
      
      const startPct = (track.timelineStart / dur) * 100;
      const widthPct = (track.duration / dur) * 100;
      
      block.style.left = `${startPct}%`;
      block.style.width = `${widthPct}%`;
      
      // Put file info label
      const cleanLabel = document.createElement('span');
      cleanLabel.style.pointerEvents = 'none';
      cleanLabel.innerText = `🎵 ${track.fileName}`;
      block.appendChild(cleanLabel);
      
      // Render Waveform Canvas
      if (track.peaks) {
        const canvas = document.createElement('canvas');
        canvas.className = 'audio-waveform-canvas';
        canvas.width = 1000;
        canvas.height = 40;
        const wCtx = canvas.getContext('2d');
        wCtx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Gradient fill matching cyberpunk cyan/purple vibe
        const grad = wCtx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, 'rgba(0, 242, 254, 0.55)');
        grad.addColorStop(0.5, 'rgba(155, 81, 224, 0.4)');
        grad.addColorStop(1, 'rgba(0, 242, 254, 0.55)');
        
        wCtx.fillStyle = grad;
        
        const barWidth = 2;
        const gap = 1;
        const totalBars = Math.floor(canvas.width / (barWidth + gap));
        const peakStep = track.peaks.length / totalBars;
        
        for (let i = 0; i < totalBars; i++) {
          const peakIdx = Math.floor(i * peakStep);
          const peak = track.peaks[peakIdx] || 0;
          const barHeight = peak * canvas.height * 0.85;
          const x = i * (barWidth + gap);
          const y = (canvas.height - barHeight) / 2;
          wCtx.fillRect(x, y, barWidth, Math.max(1.5, barHeight));
        }
        block.appendChild(canvas);
      }
      
      row.appendChild(block);
      UI.timelineTracks.appendChild(row);
    }
    
    // 2. Render Text Tracks
    state.texts.forEach((txtObj) => {
      const row = document.createElement('div');
      row.className = 'timeline-track-row';
      row.dataset.id = txtObj.id;
      row.dataset.type = 'text';
      
      const block = document.createElement('div');
      block.className = 'timeline-block' + (txtObj.id === state.selectedTextId ? ' selected' : '');
      block.dataset.id = txtObj.id;
      
      const startPct = (txtObj.startTime / dur) * 100;
      const widthPct = ((txtObj.endTime - txtObj.startTime) / dur) * 100;
      
      block.style.left = `${startPct}%`;
      block.style.width = `${widthPct}%`;
      
      const cleanLabel = document.createElement('span');
      cleanLabel.style.pointerEvents = 'none';
      cleanLabel.innerText = txtObj.text || '[Empty Text]';
      block.appendChild(cleanLabel);
      
      const leftHandle = document.createElement('div');
      leftHandle.className = 'timeline-block-handle left';
      leftHandle.dataset.handle = 'left';
      leftHandle.dataset.id = txtObj.id;
      
      const rightHandle = document.createElement('div');
      rightHandle.className = 'timeline-block-handle right';
      rightHandle.dataset.handle = 'right';
      rightHandle.dataset.id = txtObj.id;
      
      block.appendChild(leftHandle);
      block.appendChild(rightHandle);
      row.appendChild(block);
      UI.timelineTracks.appendChild(row);
    });
  }

  function updatePlayhead() {
    if (!UI.timelinePlayhead) return;
    const dur = getTimelineDuration();
    const t = Math.max(0, Math.min(dur, state.time));
    const percent = (t / dur) * 100;
    UI.timelinePlayhead.style.left = `${percent}%`;
    UI.timelineTimecode.innerText = `${t.toFixed(1)}s / ${dur.toFixed(1)}s`;
    
    // Auto-scroll timeline to keep playhead visible
    if (state.isPlaying && typeof dragMode !== 'undefined' && dragMode !== 'seek') {
      const containerWidth = UI.timelineTracksContainer.clientWidth;
      const scrollWrapper = UI.timelinePlayhead.closest('.timeline-body-wrapper');
      if (scrollWrapper) {
        const playheadX = (percent / 100) * containerWidth;
        const visibleWidth = scrollWrapper.clientWidth;
        const scrollLeft = scrollWrapper.scrollLeft;
        
        // If playhead is outside the visible viewport window, shift scroll focus
        if (playheadX < scrollLeft || playheadX > scrollLeft + visibleWidth) {
          scrollWrapper.scrollLeft = Math.max(0, playheadX - visibleWidth / 2);
        }
      }
    }
  }

  function selectText(id) {
    state.selectedTextId = id;
    state.selectedAudio = false;
    UI.audioSettingsSection.style.display = 'none';

    if (id === null) {
      UI.textSettingsSection.style.display = 'none';
    } else {
      const txt = state.texts.find(t => t.id === id);
      if (txt) {
        UI.textSettingsSection.style.display = 'flex';
        UI.textSettingsSection.classList.remove('collapsed');
        UI.textContent.value = txt.text;
        UI.textFont.value = txt.font;
        UI.textSize.value = txt.size;
        UI.textSizeVal.innerText = `${txt.size}px`;
        UI.textColor.value = txt.color;
        UI.textPosX.value = txt.x;
        UI.textPosXVal.innerText = `${Math.round(txt.x * 100)}%`;
        UI.textPosY.value = txt.y;
        UI.textPosYVal.innerText = `${Math.round(txt.y * 100)}%`;
        UI.textAngle.value = txt.angle;
        UI.textAngleVal.innerText = `${txt.angle}°`;
        UI.textGlitchMode.value = txt.glitchMode;
        UI.textGlitchIntensity.value = txt.glitchIntensity;
        UI.textGlitchIntensityVal.innerText = `${txt.glitchIntensity}%`;
        UI.textTransition.value = txt.transitionMode || 'fade-blur';
        UI.textTransitionDuration.value = txt.transitionDuration !== undefined ? txt.transitionDuration : 0.4;
        UI.textTransitionDurationVal.innerText = `${(txt.transitionDuration !== undefined ? txt.transitionDuration : 0.4).toFixed(1)}s`;
      }
    }
    updateTimelineTracks();
  }

  function selectAudio(isSelected) {
    state.selectedAudio = isSelected;
    if (isSelected) {
      state.selectedTextId = null;
      UI.textSettingsSection.style.display = 'none';
    }
    
    if (!isSelected || !state.audioTrack) {
      UI.audioSettingsSection.style.display = 'none';
    } else {
      const track = state.audioTrack;
      UI.audioSettingsSection.style.display = 'flex';
      UI.audioSettingsSection.classList.remove('collapsed');
      UI.audioFileName.innerText = track.fileName;
      UI.audioFileDuration.innerText = `Length: ${track.buffer.duration.toFixed(1)}s`;
      
      const dur = getTimelineDuration();
      UI.audioTimelineStart.min = -track.duration;
      UI.audioTimelineStart.max = dur;
      
      UI.audioTimelineStart.value = track.timelineStart;
      UI.audioTimelineStartVal.innerText = `${track.timelineStart.toFixed(1)}s`;
      
      UI.audioVolume.value = Math.round(track.volume * 100);
      UI.audioVolumeVal.innerText = `${Math.round(track.volume * 100)}%`;
    }
    updateTimelineTracks();
  }

  function getPseudoRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function getTransitionProgress(textObj, loopTime) {
    const duration = textObj.endTime - textObj.startTime;
    if (duration <= 0) return 0;
    
    const transDuration = Math.min(textObj.transitionDuration !== undefined ? textObj.transitionDuration : 0.4, duration / 2);
    if (transDuration <= 0) return 1.0;
    
    if (loopTime < textObj.startTime || loopTime > textObj.endTime) return 0;
    
    // Intro phase
    if (loopTime < textObj.startTime + transDuration) {
      return (loopTime - textObj.startTime) / transDuration;
    }
    // Outro phase
    if (loopTime > textObj.endTime - transDuration) {
      return (textObj.endTime - loopTime) / transDuration;
    }
    
    return 1.0;
  }

  function renderGlitchText(renderCtx, textVal, textObj, time, overrideGlitchMode, overrideGlitchIntensity) {
    const intensity = overrideGlitchIntensity !== undefined ? overrideGlitchIntensity : (textObj.glitchIntensity / 100);
    const mode = overrideGlitchMode !== undefined ? overrideGlitchMode : textObj.glitchMode;
    
    if (mode === 'none') {
      renderCtx.fillStyle = textObj.color;
      renderCtx.fillText(textVal, 0, 0);
    } 
    else if (mode === 'rgb-split') {
      const shift = textObj.size * intensity * 0.12 * (0.5 + 0.5 * Math.sin(time * 30));
      
      renderCtx.fillStyle = 'rgba(255, 0, 80, 0.85)';
      renderCtx.fillText(textVal, -shift, 0);
      
      renderCtx.fillStyle = 'rgba(0, 242, 254, 0.85)';
      renderCtx.fillText(textVal, shift, 0);
      
      renderCtx.fillStyle = textObj.color;
      renderCtx.fillText(textVal, 0, 0);
    } 
    else if (mode === 'scramble') {
      const scrambleChance = intensity * 0.35;
      const glyphs = '10#$@%&X[]{}<>_\\/█▓▒░';
      let scrambledText = '';
      
      for (let i = 0; i < textVal.length; i++) {
        if (textVal[i] !== ' ' && Math.random() < scrambleChance) {
          scrambledText += glyphs[Math.floor(Math.random() * glyphs.length)];
        } else {
          scrambledText += textVal[i];
        }
      }
      
      renderCtx.fillStyle = textObj.color;
      renderCtx.fillText(scrambledText, 0, 0);
    } 
    else if (mode === 'flicker') {
      let opacity = 1.0;
      if (Math.random() < intensity * 0.25) {
        opacity = Math.random() > 0.5 ? 0.0 : 0.2 + Math.random() * 0.4;
      }
      
      const prevAlpha = renderCtx.globalAlpha;
      renderCtx.globalAlpha = prevAlpha * opacity;
      renderCtx.fillStyle = textObj.color;
      
      const shiftX = (Math.random() - 0.5) * textObj.size * intensity * 0.08;
      const shiftY = (Math.random() - 0.5) * textObj.size * intensity * 0.08;
      
      renderCtx.fillText(textVal, shiftX, shiftY);
      renderCtx.globalAlpha = prevAlpha;
    }
    else if (mode === 'chaos') {
      let opacity = 1.0;
      if (Math.random() < intensity * 0.3) {
        opacity = Math.random() > 0.5 ? 0.1 : 0.3 + Math.random() * 0.4;
      }
      const prevAlpha = renderCtx.globalAlpha;
      renderCtx.globalAlpha = prevAlpha * opacity;
      
      const scrambleChance = intensity * 0.4;
      const glyphs = '10#$@%&X[]{}<>_\\/█▓▒░';
      let scrambledText = '';
      for (let i = 0; i < textVal.length; i++) {
        if (textVal[i] !== ' ' && Math.random() < scrambleChance) {
          scrambledText += glyphs[Math.floor(Math.random() * glyphs.length)];
        } else {
          scrambledText += textVal[i];
        }
      }
      
      const shift = textObj.size * intensity * 0.15 * (Math.random() - 0.5);
      const shiftY = textObj.size * intensity * 0.05 * (Math.random() - 0.5);
      
      renderCtx.fillStyle = 'rgba(255, 0, 80, 0.8)';
      renderCtx.fillText(scrambledText, -shift + (Math.random() - 0.5)*2, shiftY);
      
      renderCtx.fillStyle = 'rgba(0, 242, 254, 0.8)';
      renderCtx.fillText(scrambledText, shift + (Math.random() - 0.5)*2, -shiftY);
      
      renderCtx.fillStyle = textObj.color;
      renderCtx.fillText(scrambledText, 0, 0);
      renderCtx.globalAlpha = prevAlpha;
    }
  }

  function drawTextOverlays(renderCtx, w, h, time) {
    if (state.texts.length === 0) return;
    
    const dur = getTimelineDuration();
    const loopTime = ((time % dur) + dur) % dur;
    
    state.texts.forEach((textObj) => {
      if (loopTime < textObj.startTime || loopTime > textObj.endTime) return;
      
      const f = getTransitionProgress(textObj, loopTime);
      if (f <= 0) return;
      
      renderCtx.save();
      
      const cx = w / 2;
      const cy = h / 2;
      const dx = cx + textObj.x * w;
      const dy = cy + textObj.y * h;
      
      renderCtx.translate(dx, dy);
      renderCtx.rotate(textObj.angle * Math.PI / 180);
      
      // Subtle continuous idle random-like drift (rotation wobble + skew)
      const seed = textObj.id.charCodeAt(5) || 12;
      const idleRot = (Math.sin(time * 1.8 + seed) * 1.0 + Math.cos(time * 3.4 - seed) * 0.5) * (Math.PI / 180);
      const idleSkewX = Math.sin(time * 1.4 - seed) * 0.02 + Math.cos(time * 3.1 + seed) * 0.008;
      const idleSkewY = Math.cos(time * 1.9 + seed) * 0.015 + Math.sin(time * 2.8 - seed) * 0.006;
      
      renderCtx.rotate(idleRot);
      renderCtx.transform(1, idleSkewY, idleSkewX, 1, 0, 0);
      
      renderCtx.font = `${textObj.size}px "${textObj.font}"`;
      renderCtx.textAlign = 'center';
      renderCtx.textBaseline = 'middle';
      
      const textVal = textObj.text || '';
      const mode = textObj.transitionMode || 'fade-blur';
      
      const oldAlpha = renderCtx.globalAlpha;
      renderCtx.globalAlpha = oldAlpha * f;
      
      // Determine dynamic glitch style and intensity overrides during the transition phase (f < 1.0)
      let activeGlitchMode = textObj.glitchMode;
      let activeGlitchIntensity = textObj.glitchIntensity / 100;
      
      if (f < 0.95) {
        const transPct = 1 - f;
        if (mode === 'slide-glitch' || mode === 'glitch-reveal') {
          activeGlitchMode = 'chaos';
          activeGlitchIntensity = Math.max(activeGlitchIntensity, transPct * 0.95);
        } else if (mode === 'character-scatter') {
          activeGlitchMode = 'rgb-split';
          activeGlitchIntensity = Math.max(activeGlitchIntensity, transPct * 0.85);
        } else if (mode === 'fade-blur') {
          activeGlitchMode = 'flicker';
          activeGlitchIntensity = Math.max(activeGlitchIntensity, transPct * 0.6);
        } else if (mode === 'scale-zoom') {
          activeGlitchMode = 'rgb-split';
          activeGlitchIntensity = Math.max(activeGlitchIntensity, transPct * 0.7);
        } else if (mode === 'fade') {
          activeGlitchMode = 'rgb-split';
          activeGlitchIntensity = Math.max(activeGlitchIntensity, transPct * 0.4);
        }
      }
      
      if ('filter' in renderCtx) {
        if (mode === 'fade-blur' && 1 - f > 0.01) {
          renderCtx.filter = 'blur(' + ((1 - f) * 25).toFixed(1) + 'px)';
        } else if (mode === 'scale-zoom' && 1 - f > 0.01) {
          renderCtx.filter = 'blur(' + ((1 - f) * 12).toFixed(1) + 'px)';
        } else if (mode === 'slide-glitch' && 1 - f > 0.01) {
          renderCtx.filter = 'blur(' + ((1 - f) * 8).toFixed(1) + 'px)';
        } else if (mode === 'glitch-reveal' && 1 - f > 0.01) {
          renderCtx.filter = 'blur(' + ((1 - f) * 10).toFixed(1) + 'px)';
        } else {
          renderCtx.filter = 'none';
        }
      }
      
      if (mode === 'scale-zoom') {
        const transDuration = Math.min(textObj.transitionDuration !== undefined ? textObj.transitionDuration : 0.4, (textObj.endTime - textObj.startTime) / 2);
        const isIntro = (loopTime < textObj.startTime + transDuration);
        
        let scaleVal;
        if (isIntro) {
          scaleVal = 0.1 + 0.9 * Math.pow(f, 3);
        } else {
          scaleVal = 1.0 + 1.5 * Math.pow(1 - f, 2);
        }
        renderCtx.scale(scaleVal, scaleVal);
        
        const wobbleAngle = (1 - f) * 20 * (Math.PI / 180) * (textObj.id.charCodeAt(5) % 2 === 0 ? 1 : -1);
        renderCtx.rotate(wobbleAngle);
      }
      
      if (mode === 'fade-blur') {
        const stretchX = 1.0 + (1 - f) * 0.25;
        const stretchY = 1.0 - (1 - f) * 0.05;
        renderCtx.scale(stretchX, stretchY);
      }
      
      if (mode === 'slide-glitch') {
        const transDuration = Math.min(textObj.transitionDuration !== undefined ? textObj.transitionDuration : 0.4, (textObj.endTime - textObj.startTime) / 2);
        const isIntro = (loopTime < textObj.startTime + transDuration);
        const slideDirection = isIntro ? -1 : 1;
        const sliceProgress = 1 - f;
        
        const textWidth = renderCtx.measureText(textVal).width || 100;
        const textHeight = textObj.size;
        const yStart = -textHeight * 1.2;
        const yEnd = textHeight * 1.2;
        const totalH = yEnd - yStart;
        
        for (let i = 0; i < 5; i++) {
          const y1 = yStart + (totalH * i) / 5;
          const y2 = yStart + (totalH * (i + 1)) / 5;
          const H_slice = y2 - y1;
          
          renderCtx.save();
          renderCtx.beginPath();
          renderCtx.rect(-textWidth * 2, y1, textWidth * 4, H_slice);
          renderCtx.clip();
          
          const baseSlideX = slideDirection * Math.pow(sliceProgress, 1.2) * (w * 0.65);
          const seed = textObj.id.charCodeAt(0) + i * 23;
          const sliceNoiseX = (getPseudoRandom(seed + time * 20) - 0.5) * 120 * sliceProgress;
          const sliceNoiseY = (getPseudoRandom(seed + time * 25 + 7) - 0.5) * 20 * sliceProgress;
          
          let extraShift = 0;
          if (sliceProgress > 0.05 && getPseudoRandom(seed + time * 37) < sliceProgress * 0.45) {
            extraShift = (getPseudoRandom(seed + time * 47) - 0.5) * 180 * sliceProgress;
          }
          
          renderCtx.translate(baseSlideX + sliceNoiseX + extraShift, sliceNoiseY);
          renderGlitchText(renderCtx, textVal, textObj, time, activeGlitchMode, activeGlitchIntensity);
          renderCtx.restore();
        }
        
        if (sliceProgress > 0.05) {
          const numBlocks = Math.floor(sliceProgress * 5);
          for (let b = 0; b < numBlocks; b++) {
            const bSeed = textObj.id.charCodeAt(1) + b * 41 + time * 15;
            if (getPseudoRandom(bSeed) < 0.4) {
              const blockW = textWidth * (0.15 + getPseudoRandom(bSeed + 1) * 0.45);
              const blockH = textHeight * (0.08 + getPseudoRandom(bSeed + 2) * 0.22);
              const baseSlideX = slideDirection * Math.pow(sliceProgress, 1.2) * (w * 0.65);
              const blockX = (getPseudoRandom(bSeed + 3) - 0.5) * textWidth * 1.5 + baseSlideX;
              const blockY = (getPseudoRandom(bSeed + 4) - 0.5) * textHeight * 1.3;
              
              const colors = ['rgba(0, 242, 254, 0.75)', 'rgba(255, 0, 127, 0.75)', 'rgba(255, 255, 255, 0.9)'];
              renderCtx.fillStyle = colors[Math.floor(getPseudoRandom(bSeed + 5) * colors.length)];
              renderCtx.fillRect(blockX, blockY, blockW, blockH);
            }
          }
        }
      } else if (mode === 'glitch-reveal') {
        const sliceProgress = 1 - f;
        
        const textWidth = renderCtx.measureText(textVal).width || 100;
        const textHeight = textObj.size;
        const yStart = -textHeight * 1.2;
        const yEnd = textHeight * 1.2;
        const totalH = yEnd - yStart;
        
        for (let i = 0; i < 5; i++) {
          const y1 = yStart + (totalH * i) / 5;
          const y2 = yStart + (totalH * (i + 1)) / 5;
          const H_slice = y2 - y1;
          
          renderCtx.save();
          renderCtx.beginPath();
          renderCtx.rect(-textWidth * 2, y1, textWidth * 4, H_slice);
          renderCtx.clip();
          
          const seed = textObj.id.charCodeAt(0) + i * 31;
          const sliceNoiseX = (getPseudoRandom(seed + time * 30) - 0.5) * 45 * sliceProgress;
          const sliceNoiseY = (getPseudoRandom(seed + time * 35 + 3) - 0.5) * 8 * sliceProgress;
          
          let extraShift = 0;
          if (sliceProgress > 0.05 && getPseudoRandom(seed + time * 43) < sliceProgress * 0.5) {
            extraShift = (getPseudoRandom(seed + time * 53) - 0.5) * 75 * sliceProgress;
          }
          
          renderCtx.translate(sliceNoiseX + extraShift, sliceNoiseY);
          renderGlitchText(renderCtx, textVal, textObj, time, activeGlitchMode, activeGlitchIntensity);
          renderCtx.restore();
        }
        
        if (sliceProgress > 0.05) {
          const numBlocks = Math.floor(sliceProgress * 6);
          for (let b = 0; b < numBlocks; b++) {
            const bSeed = textObj.id.charCodeAt(1) + b * 53 + time * 18;
            if (getPseudoRandom(bSeed) < 0.45) {
              const blockW = textWidth * (0.1 + getPseudoRandom(bSeed + 1) * 0.5);
              const blockH = textHeight * (0.05 + getPseudoRandom(bSeed + 2) * 0.25);
              const blockX = (getPseudoRandom(bSeed + 3) - 0.5) * textWidth * 1.6;
              const blockY = (getPseudoRandom(bSeed + 4) - 0.5) * textHeight * 1.4;
              
              const colors = ['rgba(0, 242, 254, 0.8)', 'rgba(255, 0, 127, 0.8)', 'rgba(255, 255, 255, 0.95)'];
              renderCtx.fillStyle = colors[Math.floor(getPseudoRandom(bSeed + 5) * colors.length)];
              renderCtx.fillRect(blockX, blockY, blockW, blockH);
            }
          }
        }
      } else if (mode === 'character-scatter') {
        const transDuration = Math.min(textObj.transitionDuration !== undefined ? textObj.transitionDuration : 0.4, (textObj.endTime - textObj.startTime) / 2);
        const isIntro = (loopTime < textObj.startTime + transDuration);
        
        const chars = textVal.split('');
        const charWidths = chars.map(c => renderCtx.measureText(c).width);
        const totalWidth = charWidths.reduce((sum, w) => sum + w, 0);
        
        let startX = -totalWidth / 2;
        let currentX = startX;
        
        chars.forEach((c, idx) => {
          const charW = charWidths[idx];
          const charCenterX = currentX + charW / 2;
          
          renderCtx.save();
          
          const staggerStrength = 0.5;
          const charWindow = 1.0 - staggerStrength;
          const orderIdx = isIntro ? idx : (chars.length - 1 - idx);
          const startRatio = (orderIdx / Math.max(1, chars.length - 1)) * staggerStrength;
          
          let fChar = 1.0;
          if (f <= startRatio) fChar = 0.0;
          else if (f >= startRatio + charWindow) fChar = 1.0;
          else fChar = (f - startRatio) / charWindow;
          
          const scatterProgress = 1 - fChar;
          
          const seedX = idx * 17.1 + 1.3;
          const seedY = idx * 29.3 + 4.7;
          const seedR = idx * 41.5 + 8.1;
          
          const randX = getPseudoRandom(seedX) * 2 - 1;
          const randY = getPseudoRandom(seedY) * 2 - 1;
          const randR = getPseudoRandom(seedR) * 2 - 1;
          
          const scatterDist = Math.pow(scatterProgress, 1.8) * 350;
          const charDx = randX * scatterDist;
          const charDy = randY * scatterDist;
          const charAngle = randR * Math.PI * 1.5 * scatterProgress;
          const charScale = 0.0 + 1.0 * fChar;
          
          renderCtx.translate(charCenterX + charDx, charDy);
          renderCtx.rotate(charAngle);
          renderCtx.scale(charScale, charScale);
          
          let charGlitchMode = textObj.glitchMode;
          let charGlitchIntensity = textObj.glitchIntensity / 100;
          if (scatterProgress > 0.05) {
            charGlitchMode = 'rgb-split';
            charGlitchIntensity = Math.max(charGlitchIntensity, scatterProgress * 0.9);
          }
          
          renderGlitchText(renderCtx, c, textObj, time, charGlitchMode, charGlitchIntensity);
          
          renderCtx.restore();
          currentX += charW;
        });
      } else {
        renderGlitchText(renderCtx, textVal, textObj, time, activeGlitchMode, activeGlitchIntensity);
      }
      
      if ('filter' in renderCtx) {
        renderCtx.filter = 'none';
      }
      renderCtx.globalAlpha = oldAlpha;
      renderCtx.restore();
    });
  }

  // --- DETECT LIVE FRAMES LOOP ---
  function animationLoop(timestamp) {
    if (state.isExporting) return;

    if (!state.lastFrameTime) state.lastFrameTime = timestamp;
    const dt = (timestamp - state.lastFrameTime) / 1000;
    state.lastFrameTime = timestamp;

    if (dt > 0) {
      state.fps = Math.round(1 / dt);
      UI.fpsValue.innerText = state.fps;
    }

    if (state.isPlaying && state.imageLoaded) {
      const dur = getTimelineDuration();
      state.time += dt;
      
      let wrapped = false;
      if (state.time >= dur) {
        state.time = state.time % dur;
        wrapped = true;
      }
      
      if (state.glitchEnabled) {
        GlitchManager.update(dt);
      }

      // Audio playback range check and loop wrap restart
      if (state.audioTrack) {
        if (wrapped) {
          syncAudioPlayback();
        } else {
          const start = state.audioTrack.timelineStart;
          const end = start + state.audioTrack.duration;
          const shouldBePlaying = (state.time >= start && state.time < end);
          if (shouldBePlaying && !activeAudioSource) {
            syncAudioPlayback();
          } else if (!shouldBePlaying && activeAudioSource) {
            stopAudioSource();
          }
        }
      }
      
      renderFrame(state.time);
      updatePlayhead();
    }

    requestAnimationFrame(animationLoop);
  }

  // --- DETERMINISTIC VIDEO EXPORT ---
  // --- REAL-TIME VIDEO & AUDIO EXPORT ---
  class VideoExporter {
    static async export() {
      if (state.uploadedImages.length === 0 || state.layers.length === 0 || state.isExporting) return;
      
      state.isExporting = true;
      state.exportCancel = false;
      UI.exportOverlay.classList.remove('hidden');

      const originalW = UI.mainCanvas.width;
      const originalH = UI.mainCanvas.height;
      
      // Calculate export duration and loops depending on exportMode
      let duration = 5;
      if (state.exportMode === 'duration') {
        duration = state.exportDuration;
      } else {
        const absSpeed = Math.abs(state.zoomSpeed);
        if (absSpeed > 0.0001) {
          duration = state.exportLoops / absSpeed;
        } else {
          duration = 5; // fallback
        }
      }

      const fps = state.exportFps;

      let resW = 1920, resH = 1080;
      const mode = UI.exportResolution.value;
      const activeImg = state.uploadedImages[state.activeImageIndex >= 0 ? state.activeImageIndex : 0].img;
      
      // Determine the export aspect ratio
      let ratio = activeImg.naturalWidth / activeImg.naturalHeight;
      if (mode === 'viewport') {
        const arMode = state.aspectRatio;
        if (arMode === '16-9') ratio = 16 / 9;
        else if (arMode === '9-16') ratio = 9 / 16;
        else if (arMode === '1-1') ratio = 1 / 1;
        else if (arMode === '4-5') ratio = 4 / 5;
        else if (arMode === '21-9') ratio = 21 / 9;
      }

      if (mode === '720') {
        resW = 1280; resH = 720;
      } else if (mode === '1080') {
        resW = 1920; resH = 1080;
      } else if (mode === '1080s') {
        resW = 1080; resH = 1080;
      } else {
        // mode is 'original' or 'viewport'
        if (ratio >= 1.0) {
          resH = 1080;
          resW = Math.round(resH * ratio);
        } else {
          resW = 1080;
          resH = Math.round(resW / ratio);
        }
      }

      UI.mainCanvas.width = resW;
      UI.mainCanvas.height = resH;

      // Adjust offscreen canvas dimensions to match the exporting frame aspect ratio
      offscreenCanvas.width = resW;
      offscreenCanvas.height = resH;

      // Initialize export audio routing
      if (state.audioTrack) {
        try {
          const ctx = getAudioContext();
          exportAudioNode = ctx.createMediaStreamDestination();
        } catch (err) {
          console.error("Failed to create AudioDestinationNode:", err);
        }
      }

      let canvasStream = UI.mainCanvas.captureStream(fps);
      let combinedStream = canvasStream;

      if (state.audioTrack && exportAudioNode) {
        const videoTrack = canvasStream.getVideoTracks()[0];
        const audioTrack = exportAudioNode.stream.getAudioTracks()[0];
        if (videoTrack && audioTrack) {
          combinedStream = new MediaStream([videoTrack, audioTrack]);
        }
      }
      
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=h264';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      state.exportChunks = [];
      try {
        state.exportRecorder = new MediaRecorder(combinedStream, {
          mimeType: mimeType,
          videoBitsPerSecond: 6000000
        });
      } catch (err) {
        console.error("Failed to initialize MediaRecorder: ", err);
        alert("MediaRecorder is not supported in this browser. Try Chrome/Firefox.");
        VideoExporter.endExport(originalW, originalH);
        return;
      }

      const tempPlaying = state.isPlaying;
      state.isPlaying = false;
      stopAudioSource();

      // Reset wrap counts for all layers to align with starting time 0.0
      state.layers.forEach(layer => {
        layer.lastWrapCount = 0;
      });

      state.exportRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          state.exportChunks.push(e.data);
        }
      };

      state.exportRecorder.onstop = () => {
        state.isPlaying = tempPlaying;
        if (state.isPlaying) {
          syncAudioPlayback();
        }

        if (state.exportCancel) {
          VideoExporter.endExport(originalW, originalH);
          return;
        }

        const blob = new Blob(state.exportChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `videomaddness_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);

        VideoExporter.endExport(originalW, originalH);
      };

      state.exportRecorder.start();
      
      const exportStartTime = performance.now();
      const track = state.audioTrack;
      let lastExportLoopIndex = 0;

      async function renderStep() {
        if (state.exportCancel) {
          state.exportRecorder.stop();
          return;
        }

        const elapsed = (performance.now() - exportStartTime) / 1000;

        if (elapsed >= duration) {
          state.exportRecorder.stop();
          return;
        }

        state.time = elapsed;

        // Audio sync during export
        if (track && exportAudioNode) {
          const dur = getTimelineDuration();
          const loopTime = ((state.time % dur) + dur) % dur;
          const currentLoopIndex = Math.floor(state.time / dur);
          const wrapped = currentLoopIndex !== lastExportLoopIndex;
          lastExportLoopIndex = currentLoopIndex;

          const start = track.timelineStart;
          const end = start + track.duration;
          const shouldBePlaying = (loopTime >= start && loopTime < end);
          
          if (wrapped) {
            stopAudioSource();
          }
          
          if (shouldBePlaying && !activeAudioSource) {
            const ctx = getAudioContext();
            try {
              const relativeTime = loopTime - start;
              const filePlayStart = track.sourceOffset + relativeTime;
              if (filePlayStart >= 0 && filePlayStart < track.buffer.duration) {
                const playDuration = Math.min(track.duration - relativeTime, dur - loopTime);
                const source = ctx.createBufferSource();
                source.buffer = track.buffer;
                
                const gainNode = ctx.createGain();
                gainNode.gain.value = track.volume !== undefined ? track.volume : 0.8;
                
                source.connect(gainNode);
                gainNode.connect(exportAudioNode);
                
                source.start(ctx.currentTime, filePlayStart, playDuration);
                activeAudioSource = source;
                activeAudioGain = gainNode;
              }
            } catch (err) {
              console.error("Audio step trigger failed during export:", err);
            }
          } else if (!shouldBePlaying && activeAudioSource) {
            stopAudioSource();
          }
        }

        if (state.glitchEnabled) {
          GlitchManager.update(1 / 60);
        }
        
        renderFrame(state.time);

        const pct = Math.round((elapsed / duration) * 100);
        UI.exportProgressBar.style.width = `${pct}%`;
        UI.exportFrameCount.innerText = `Recording: ${elapsed.toFixed(1)}s / ${duration.toFixed(1)}s`;
        UI.exportPercent.innerText = `${pct}%`;

        requestAnimationFrame(renderStep);
      }

      requestAnimationFrame(renderStep);
    }

    static endExport(origW, origH) {
      state.isExporting = false;
      exportAudioNode = null;
      stopAudioSource();
      UI.exportOverlay.classList.add('hidden');
      
      UI.mainCanvas.width = origW;
      UI.mainCanvas.height = origH;

      resizeMainCanvas();
      
      state.lastFrameTime = performance.now();
      requestAnimationFrame(animationLoop);
    }
  }

  // Live drawing for estimated video export file length
  function updateExportEstimate() {
    if (!UI.exportEstimateText) return;
    if (state.exportMode === 'duration') {
      const duration = state.exportDuration;
      const absSpeed = Math.abs(state.zoomSpeed);
      const loops = absSpeed > 0.0001 ? duration * absSpeed : 0;
      UI.exportEstimateText.innerText = `Est. Video Length: ${duration}s (${loops.toFixed(2)} cycles)`;
    } else {
      const loops = state.exportLoops;
      const absSpeed = Math.abs(state.zoomSpeed);
      if (absSpeed < 0.001) {
        UI.exportEstimateText.innerText = `Est. Video Length: Infinite (Zoom Speed is 0)`;
      } else {
        const duration = loops / absSpeed;
        UI.exportEstimateText.innerText = `Est. Video Length: ${duration.toFixed(1)}s (${loops} cycles)`;
      }
    }
  }

  // --- UI INTERACTION & SLIDER BINDINGS ---

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  }, false);
  window.addEventListener('drop', (e) => {
    e.preventDefault();
  }, false);

  UI.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    UI.dropZone.classList.add('dragover');
  });

  UI.dropZone.addEventListener('dragleave', () => {
    UI.dropZone.classList.remove('dragover');
  });

  UI.dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    UI.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleMultipleImageFiles(e.dataTransfer.files);
    }
  });

  UI.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleMultipleImageFiles(e.target.files);
    }
  });

  async function handleMultipleImageFiles(files) {
    await ImageProcessor.addImages(files);
    
    if (state.uploadedImages.length > 0) {
      state.lastFrameTime = performance.now();
      requestAnimationFrame(animationLoop);
    }
  }

  function updateImagesDeckUI() {
    if (state.uploadedImages.length === 0) {
      UI.imagesDeck.classList.add('hidden');
      state.activeImageIndex = -1;
      ImageProcessor.renderActiveImageLayersPreview();
      return;
    }

    UI.imagesDeck.classList.remove('hidden');
    UI.deckCountVal.innerText = state.uploadedImages.length;
    UI.deckList.innerHTML = '';

    state.uploadedImages.forEach((imgObj, idx) => {
      const item = document.createElement('div');
      item.className = 'deck-item' + (idx === state.activeImageIndex ? ' active' : '');
      item.dataset.index = idx;

      const thumb = document.createElement('img');
      thumb.className = 'deck-item-thumb';
      thumb.src = imgObj.img.src;

      const info = document.createElement('div');
      info.className = 'deck-item-info';

      const name = document.createElement('span');
      name.className = 'deck-item-name';
      name.innerText = imgObj.name;

      const dims = document.createElement('span');
      dims.className = 'deck-item-dims';
      dims.innerText = `${imgObj.img.naturalWidth} x ${imgObj.img.naturalHeight}px`;

      info.appendChild(name);
      info.appendChild(dims);

      const btnRemove = document.createElement('button');
      btnRemove.className = 'btn-remove-deck-item';
      btnRemove.title = 'Remove this image';
      btnRemove.innerHTML = '<i data-lucide="x"></i>';

      btnRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeImageFromDeck(idx);
      });

      item.appendChild(thumb);
      item.appendChild(info);
      item.appendChild(btnRemove);

      item.addEventListener('click', () => {
        state.activeImageIndex = idx;
        updateImagesDeckUI();
        ImageProcessor.renderActiveImageLayersPreview();
      });

      UI.deckList.appendChild(item);
    });

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  function removeImageFromDeck(index) {
    const removedId = state.uploadedImages[index].id;
    state.uploadedImages.splice(index, 1);
    
    if (state.uploadedImages.length === 0) {
      state.activeImageIndex = -1;
      state.imageLoaded = false;
      state.layers = [];
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, UI.mainCanvas.width, UI.mainCanvas.height);
    } else {
      if (state.activeImageIndex >= state.uploadedImages.length) {
        state.activeImageIndex = state.uploadedImages.length - 1;
      }
      
      state.layers.forEach(layer => {
        if (layer.sourceImageId === removedId) {
          const randomImgObj = state.uploadedImages[Math.floor(Math.random() * state.uploadedImages.length)];
          layer.canvas = randomImgObj.layers[layer.index];
          layer.sourceImageId = randomImgObj.id;
        }
      });
    }
    
    updateImagesDeckUI();
    ImageProcessor.renderActiveImageLayersPreview();
  }

  UI.btnClearDeck.addEventListener('click', () => {
    state.uploadedImages = [];
    state.activeImageIndex = -1;
    state.imageLoaded = false;
    state.layers = [];
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, UI.mainCanvas.width, UI.mainCanvas.height);
    updateImagesDeckUI();
    ImageProcessor.renderActiveImageLayersPreview();
  });

  // Toggle Switches Bindings
  UI.glitchEnabled.addEventListener('change', (e) => {
    state.glitchEnabled = e.target.checked;
  });

  // Inspector Background Switcher Bindings
  UI.inspectorBgSelectors.forEach(btn => {
    btn.addEventListener('click', (e) => {
      UI.inspectorBgSelectors.forEach(b => b.classList.remove('active'));
      const mode = e.target.getAttribute('data-bg');
      state.inspectorBgMode = mode;
      e.target.classList.add('active');
      drawInspectorPreview();
    });
  });

  // Layer Parameter Updates
  UI.maskType.addEventListener('change', (e) => {
    state.maskType = e.target.value;
    if (state.maskType === 'luminosity' || state.maskType === 'adaptive-luminosity') {
      UI.luminositySmoothnessGroup.style.display = 'flex';
      UI.colorRangeHueGroup.style.display = 'none';
    } else if (state.maskType === 'color-range') {
      UI.luminositySmoothnessGroup.style.display = 'none';
      UI.colorRangeHueGroup.style.display = 'flex';
    } else {
      UI.luminositySmoothnessGroup.style.display = 'none';
      UI.colorRangeHueGroup.style.display = 'none';
    }
    ImageProcessor.reprocessAllImagesLayers();
    ImageProcessor.initializeRenderStack();
  });

  UI.layerCount.addEventListener('input', (e) => {
    state.layerCount = parseInt(e.target.value);
    UI.layerCountVal.innerText = state.layerCount;
  });
  UI.layerCount.addEventListener('change', () => {
    ImageProcessor.reprocessAllImagesLayers();
    ImageProcessor.initializeRenderStack();
  });

  UI.maskFeather.addEventListener('input', (e) => {
    state.maskFeather = parseFloat(e.target.value);
    UI.maskFeatherVal.innerText = state.maskFeather;
  });
  UI.maskFeather.addEventListener('change', () => {
    ImageProcessor.reprocessAllImagesLayers();
    ImageProcessor.initializeRenderStack();
  });

  UI.hueTolerance.addEventListener('input', (e) => {
    state.hueTolerance = parseInt(e.target.value);
    UI.hueToleranceVal.innerText = `${state.hueTolerance}°`;
  });
  UI.hueTolerance.addEventListener('change', () => {
    ImageProcessor.reprocessAllImagesLayers();
    ImageProcessor.initializeRenderStack();
  });

  UI.btnRegenerateLayers.addEventListener('click', () => {
    if (state.maskType === 'random') {
      state.randomBoundaries = [];
    }
    ImageProcessor.reprocessAllImagesLayers();
    ImageProcessor.initializeRenderStack();
  });

  UI.btnRandomLayersOrder.addEventListener('click', () => {
    if (state.layers.length > 0) {
      state.layers.forEach((l) => {
        l.initialZ = Math.random();
      });
      renderFrame(state.time);
    }
  });

  UI.layersList.addEventListener('click', (e) => {
    const thumb = e.target.closest('.layer-thumbnail');
    if (thumb) {
      document.querySelectorAll('.layer-thumbnail').forEach((t) => t.classList.remove('active'));
      thumb.classList.add('active');

      const index = parseInt(thumb.dataset.index);
      state.selectedInspectorLayer = index; // Set active inspector layer
      drawInspectorPreview(); // Refresh inspector preview

      const layer = state.layers[index];
      if (layer) {
        ctx.fillStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.fillRect(0, 0, UI.mainCanvas.width, UI.mainCanvas.height);
        setTimeout(() => renderFrame(state.time), 120);
      }
    }
  });

  // Viewport Controls
  UI.btnPlayPause.addEventListener('click', () => {
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying) {
      UI.btnPlayPause.classList.add('active');
      UI.playPauseIcon.setAttribute('data-lucide', 'pause');
      state.lastFrameTime = performance.now();
      syncAudioPlayback();
    } else {
      UI.btnPlayPause.classList.remove('active');
      UI.playPauseIcon.setAttribute('data-lucide', 'play');
      stopAudioSource();
    }
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  });

  UI.btnStep.addEventListener('click', () => {
    if (!state.isPlaying) {
      state.time += 0.033;
      if (state.glitchEnabled) {
        GlitchManager.update(0.033);
      }
      renderFrame(state.time);
    }
  });

  UI.btnManualGlitch.addEventListener('click', () => {
    GlitchManager.triggerGlitch();
  });

  UI.btnToggleGrid.addEventListener('click', () => {
    state.gridActive = !state.gridActive;
    UI.btnToggleGrid.classList.toggle('active', state.gridActive);
    UI.mainCanvas.parentElement.classList.toggle('composition-grid', state.gridActive);
  });

  UI.btnResetView.addEventListener('click', () => {
    state.time = 0;
    stopAudioSource();
    if (state.isPlaying) {
      syncAudioPlayback();
    }
    state.cameraAngle = 0;
    
    UI.aspectRatio.value = 'original';
    state.aspectRatio = 'original';

    UI.zoomSpeed.value = 0.05;
    state.zoomSpeed = 0.05;
    UI.zoomSpeedVal.innerText = '0.05';
    
    UI.zoomDepth.value = 4.0;
    state.zoomDepth = 4.0;
    UI.zoomDepthVal.innerText = '4.0';

    UI.cameraRotation.value = 0;
    state.cameraRotation = 0;
    UI.cameraRotationVal.innerText = '0.0°/s';

    UI.cameraDrift.value = 0;
    state.cameraDrift = 0;
    UI.cameraDriftVal.innerText = '0.0';

    // Reset Exporter
    UI.exportMode.value = 'duration';
    state.exportMode = 'duration';
    UI.exportDuration.value = 5;
    state.exportDuration = 5;
    UI.exportDurationVal.innerText = '5s';
    if (UI.timelineDurationSlider) {
      UI.timelineDurationSlider.value = 5;
    }
    if (UI.timelineDurationVal) {
      UI.timelineDurationVal.innerText = '5s';
    }
    if (UI.timelineDurationControl) {
      UI.timelineDurationControl.classList.remove('disabled');
    }
    UI.exportLoops.value = 1;
    state.exportLoops = 1;
    UI.exportLoopsVal.innerText = '1';
    UI.exportDurationGroup.style.display = 'flex';
    UI.exportLoopsGroup.style.display = 'none';
    updateExportEstimate();

    UI.mirrorMode.value = 'none';
    state.mirrorMode = 'none';
    UI.kaleidoscopeSlicesGroup.style.display = 'none';

    UI.rgbSplit.value = 0;
    state.rgbSplit = 0;
    UI.rgbSplitVal.innerText = '0 px';

    UI.pixelSort.value = 0;
    state.pixelSort = 0;
    UI.pixelSortVal.innerText = '0%';

    UI.depthModulation.value = 0;
    state.depthModulation = 0;
    UI.depthModulationVal.innerText = '0%';

    UI.glitchEnabled.checked = false;
    state.glitchEnabled = false;

    UI.videoFadeActive.checked = false;
    state.videoFadeActive = false;
    UI.videoFadeDivider.style.display = 'none';
    UI.videoFadeDurationGroup.style.display = 'none';
    UI.videoFadeDuration.value = 0.5;
    state.videoFadeDuration = 0.5;
    UI.videoFadeDurationVal.innerText = '0.5s';

    state.selectedTextId = null;
    selectText(null);
    updateTimelineRuler();
    updateTimelineTracks();
    updatePlayhead();

    renderFrame(0);
    drawMaskGraph();
  });

  UI.btnFullscreen.addEventListener('click', () => {
    const container = UI.mainCanvas.parentElement;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => {
        setTimeout(resizeMainCanvas, 100);
      }).catch((err) => {
        alert(`Error enabling fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    setTimeout(() => {
      resizeMainCanvas();
      renderFrame(state.time);
    }, 150);
  });

  // Sidebar Parameters Bindings
  UI.aspectRatio.addEventListener('change', (e) => {
    state.aspectRatio = e.target.value;
    resizeMainCanvas();
    renderFrame(state.time);
  });

  UI.zoomSpeed.addEventListener('input', (e) => {
    state.zoomSpeed = parseFloat(e.target.value);
    UI.zoomSpeedVal.innerText = state.zoomSpeed;
    updateExportEstimate();
    updateTimelineRuler();
    updateTimelineTracks();
    updatePlayhead();
  });

  UI.zoomDepth.addEventListener('input', (e) => {
    state.zoomDepth = parseFloat(e.target.value);
    UI.zoomDepthVal.innerText = state.zoomDepth;
  });

  UI.cameraRotation.addEventListener('input', (e) => {
    state.cameraRotation = parseInt(e.target.value);
    UI.cameraRotationVal.innerText = `${state.cameraRotation.toFixed(1)}°/s`;
  });

  UI.btnResetRotation.addEventListener('click', () => {
    state.cameraRotation = 0;
    state.cameraAngle = 0;
    UI.cameraRotation.value = 0;
    UI.cameraRotationVal.innerText = '0.0°/s';
    renderFrame(state.time);
  });

  UI.cameraDrift.addEventListener('input', (e) => {
    state.cameraDrift = parseFloat(e.target.value);
    UI.cameraDriftVal.innerText = state.cameraDrift.toFixed(1);
  });

  UI.mirrorMode.addEventListener('change', (e) => {
    state.mirrorMode = e.target.value;
    if (state.mirrorMode === 'kaleidoscope') {
      UI.kaleidoscopeSlicesGroup.style.display = 'flex';
    } else {
      UI.kaleidoscopeSlicesGroup.style.display = 'none';
    }
    renderFrame(state.time);
  });

  UI.kSlices.addEventListener('input', (e) => {
    state.kaleidoscopeSlices = parseInt(e.target.value);
    UI.kSlicesVal.innerText = state.kaleidoscopeSlices;
    renderFrame(state.time);
  });

  UI.rgbSplit.addEventListener('input', (e) => {
    state.rgbSplit = parseInt(e.target.value);
    UI.rgbSplitVal.innerText = `${state.rgbSplit} px`;
    renderFrame(state.time);
  });

  UI.pixelSort.addEventListener('input', (e) => {
    state.pixelSort = parseInt(e.target.value);
    UI.pixelSortVal.innerText = `${state.pixelSort}%`;
    renderFrame(state.time);
  });

  UI.glitchFrequency.addEventListener('input', (e) => {
    state.glitchFrequency = parseInt(e.target.value);
    UI.glitchFrequencyVal.innerText = `${state.glitchFrequency}%`;
  });

  UI.glitchSeverity.addEventListener('input', (e) => {
    state.glitchSeverity = parseInt(e.target.value);
    UI.glitchSeverityVal.innerText = `${state.glitchSeverity}px`;
  });

  UI.depthModulation.addEventListener('input', (e) => {
    state.depthModulation = parseInt(e.target.value);
    UI.depthModulationVal.innerText = `${state.depthModulation}%`;
    renderFrame(state.time);
  });



  // Exporter Parameters Bindings
  UI.exportMode.addEventListener('change', (e) => {
    state.exportMode = e.target.value;
    if (state.exportMode === 'duration') {
      UI.exportDurationGroup.style.display = 'flex';
      UI.exportLoopsGroup.style.display = 'none';
      if (UI.timelineDurationControl) {
        UI.timelineDurationControl.classList.remove('disabled');
      }
    } else {
      UI.exportDurationGroup.style.display = 'none';
      UI.exportLoopsGroup.style.display = 'flex';
      if (UI.timelineDurationControl) {
        UI.timelineDurationControl.classList.add('disabled');
      }
    }
    updateExportEstimate();
    updateTimelineRuler();
    updateTimelineTracks();
    updatePlayhead();
  });

  UI.exportDuration.addEventListener('input', (e) => {
    state.exportDuration = parseInt(e.target.value);
    UI.exportDurationVal.innerText = `${state.exportDuration}s`;
    if (UI.timelineDurationSlider) {
      UI.timelineDurationSlider.value = state.exportDuration;
    }
    if (UI.timelineDurationVal) {
      UI.timelineDurationVal.innerText = `${state.exportDuration}s`;
    }
    updateExportEstimate();
    updateTimelineRuler();
    updateTimelineTracks();
    updatePlayhead();
    if (state.selectedAudio) {
      selectAudio(true);
    }
  });

  UI.timelineDurationSlider.addEventListener('input', (e) => {
    state.exportDuration = parseInt(e.target.value);
    UI.exportDuration.value = state.exportDuration;
    UI.exportDurationVal.innerText = `${state.exportDuration}s`;
    UI.timelineDurationVal.innerText = `${state.exportDuration}s`;
    updateExportEstimate();
    updateTimelineRuler();
    updateTimelineTracks();
    updatePlayhead();
    if (state.selectedAudio) {
      selectAudio(true);
    }
  });

  UI.exportLoops.addEventListener('input', (e) => {
    state.exportLoops = parseInt(e.target.value);
    UI.exportLoopsVal.innerText = state.exportLoops;
    updateExportEstimate();
    updateTimelineRuler();
    updateTimelineTracks();
    updatePlayhead();
  });

  // Theme Select dropdown listener
  UI.themeSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    document.body.classList.remove('light-theme', 'theme-crimson', 'theme-matrix', 'theme-frozen');
    if (val === 'high-contrast') {
      document.body.classList.add('light-theme');
    } else if (val === 'crimson') {
      document.body.classList.add('theme-crimson');
    } else if (val === 'matrix') {
      document.body.classList.add('theme-matrix');
    } else if (val === 'frozen') {
      document.body.classList.add('theme-frozen');
    }
  });

  UI.videoFadeActive.addEventListener('change', (e) => {
    state.videoFadeActive = e.target.checked;
    if (state.videoFadeActive) {
      UI.videoFadeDivider.style.display = 'block';
      UI.videoFadeDurationGroup.style.display = 'flex';
    } else {
      UI.videoFadeDivider.style.display = 'none';
      UI.videoFadeDurationGroup.style.display = 'none';
    }
    renderFrame(state.time);
  });

  UI.videoFadeDuration.addEventListener('input', (e) => {
    state.videoFadeDuration = parseFloat(e.target.value);
    UI.videoFadeDurationVal.innerText = `${state.videoFadeDuration.toFixed(1)}s`;
    renderFrame(state.time);
  });

  // Video Export Click Bindings
  UI.btnExportVideo.addEventListener('click', () => {
    state.exportFps = parseInt(UI.exportFps.value);
    VideoExporter.export();
  });

  UI.btnCancelExport.addEventListener('click', () => {
    state.exportCancel = true;
  });

  // --- TEXT OVERLAYS & TIMELINE EVENTS BINDINGS ---

  // Add Text Layer
  UI.btnAddText.addEventListener('click', () => {
    if (state.texts.length >= 5) {
      alert("Maximum limit of 5 text overlay tracks reached.");
      return;
    }
    
    const duration = getTimelineDuration();
    const newText = {
      id: 'txt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      text: 'TEXT OVERLAY',
      font: 'Outfit',
      size: 40,
      color: '#00f2fe',
      x: 0.0,
      y: 0.0,
      angle: 0,
      glitchMode: 'rgb-split',
      glitchIntensity: 50,
      transitionMode: 'fade-blur',
      transitionDuration: 0.4,
      startTime: 0,
      endTime: Math.min(duration, 3.0)
    };
    
    state.texts.push(newText);
    selectText(newText.id);
    updateTimelineTracks();
    renderFrame(state.time);
  });

  // Delete Text Layer
  UI.btnDeleteText.addEventListener('click', () => {
    if (!state.selectedTextId) return;
    const index = state.texts.findIndex(t => t.id === state.selectedTextId);
    if (index !== -1) {
      state.texts.splice(index, 1);
      selectText(null);
      updateTimelineTracks();
      renderFrame(state.time);
    }
  });

  // Timeline Navigation Jump Bindings
  UI.btnTimelineStart.addEventListener('click', () => {
    state.time = 0.0;
    updatePlayhead();
    renderFrame(state.time);
    syncAudioPlayback();
  });

  UI.btnTimelineEnd.addEventListener('click', () => {
    const dur = getTimelineDuration();
    state.time = dur;
    updatePlayhead();
    renderFrame(state.time);
    syncAudioPlayback();
  });

  // --- AUDIO TIMELINE EVENTS & BINDINGS ---

  UI.btnAddAudio.addEventListener('click', () => {
    UI.audioFileInput.click();
  });

  UI.audioFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Show loading indicator
    UI.canvasLoading.classList.remove('hidden');
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const ctx = getAudioContext();
        // Decode the MP3/WAV array buffer to PCM audio data
        const audioBuffer = await ctx.decodeAudioData(event.target.result);
        
        // Extract peaks for timeline waveform visualization
        const channelData = audioBuffer.getChannelData(0);
        const numPeaks = 1000;
        const step = Math.ceil(channelData.length / numPeaks);
        const peaks = [];
        let maxPeak = 0;
        for (let i = 0; i < numPeaks; i++) {
          let maxVal = 0;
          for (let j = 0; j < step; j++) {
            const idx = i * step + j;
            if (idx >= channelData.length) break;
            const val = Math.abs(channelData[idx]);
            if (val > maxVal) maxVal = val;
          }
          peaks.push(maxVal);
          if (maxVal > maxPeak) maxPeak = maxVal;
        }
        // Normalize peaks to 0.0 - 1.0 range
        if (maxPeak > 0) {
          for (let i = 0; i < peaks.length; i++) {
            peaks[i] /= maxPeak;
          }
        }
        
        const dur = getTimelineDuration();
        state.audioTrack = {
          fileName: file.name,
          buffer: audioBuffer,
          timelineStart: 0.0,
          sourceOffset: 0.0,
          duration: audioBuffer.duration,
          volume: 0.8,
          peaks: peaks
        };
        
        selectAudio(true);
        if (state.isPlaying) {
          syncAudioPlayback();
        }
      } catch (err) {
        console.error("Error decoding audio data:", err);
        alert("Could not decode audio file. Please try a standard MP3 or WAV file.");
      } finally {
        UI.canvasLoading.classList.add('hidden');
      }
    };
    reader.readAsArrayBuffer(file);
  });

  UI.audioTimelineStart.addEventListener('input', (e) => {
    if (!state.audioTrack) return;
    state.audioTrack.timelineStart = parseFloat(e.target.value);
    UI.audioTimelineStartVal.innerText = `${state.audioTrack.timelineStart.toFixed(1)}s`;
    updateTimelineTracks();
    if (state.isPlaying) {
      syncAudioPlayback();
    }
  });



  UI.audioVolume.addEventListener('input', (e) => {
    if (!state.audioTrack) return;
    const vol = parseInt(e.target.value) / 100;
    state.audioTrack.volume = vol;
    UI.audioVolumeVal.innerText = `${e.target.value}%`;
    if (activeAudioGain) {
      activeAudioGain.gain.value = vol;
    }
  });

  UI.btnDeleteAudio.addEventListener('click', () => {
    stopAudioSource();
    state.audioTrack = null;
    selectAudio(false);
    updateTimelineTracks();
  });

  // Text Inputs updates
  UI.textContent.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.text = e.target.value;
      updateTimelineTracks();
      renderFrame(state.time);
    }
  });

  UI.textFont.addEventListener('change', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.font = e.target.value;
      renderFrame(state.time);
    }
  });

  UI.textSize.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.size = parseInt(e.target.value);
      UI.textSizeVal.innerText = `${txt.size}px`;
      renderFrame(state.time);
    }
  });

  UI.textColor.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.color = e.target.value;
      renderFrame(state.time);
    }
  });

  // Palette swatch clicks
  document.querySelectorAll('.palette-swatches .swatch-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!state.selectedTextId) return;
      const txt = state.texts.find(t => t.id === state.selectedTextId);
      if (txt) {
        const color = e.target.getAttribute('data-color');
        txt.color = color;
        UI.textColor.value = color;
        renderFrame(state.time);
      }
    });
  });

  UI.textPosX.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.x = parseFloat(e.target.value);
      UI.textPosXVal.innerText = `${Math.round(txt.x * 100)}%`;
      renderFrame(state.time);
    }
  });

  UI.textPosY.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.y = parseFloat(e.target.value);
      UI.textPosYVal.innerText = `${Math.round(txt.y * 100)}%`;
      renderFrame(state.time);
    }
  });

  UI.textAngle.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.angle = parseInt(e.target.value);
      UI.textAngleVal.innerText = `${txt.angle}°`;
      renderFrame(state.time);
    }
  });

  UI.textGlitchMode.addEventListener('change', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.glitchMode = e.target.value;
      renderFrame(state.time);
    }
  });

  UI.textGlitchIntensity.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.glitchIntensity = parseInt(e.target.value);
      UI.textGlitchIntensityVal.innerText = `${txt.glitchIntensity}%`;
      renderFrame(state.time);
    }
  });

  UI.textTransition.addEventListener('change', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.transitionMode = e.target.value;
      renderFrame(state.time);
    }
  });

  UI.textTransitionDuration.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.transitionDuration = parseFloat(e.target.value);
      UI.textTransitionDurationVal.innerText = `${txt.transitionDuration.toFixed(1)}s`;
      renderFrame(state.time);
    }
  });

  // Custom Font uploading logic
  UI.btnLoadFont.addEventListener('click', (e) => {
    e.preventDefault();
    UI.fontFileInput.click();
  });

  UI.fontFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fontName = file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
    const reader = new FileReader();
    reader.onload = function(evt) {
      const arrayBuffer = evt.target.result;
      const fontFace = new FontFace(fontName, arrayBuffer);
      fontFace.load().then((loadedFace) => {
        document.fonts.add(loadedFace);
        
        // Add option to select menu
        const option = document.createElement('option');
        option.value = fontName;
        option.innerText = fontName + " (Custom)";
        UI.textFont.appendChild(option);
        UI.textFont.value = fontName;
        
        if (state.selectedTextId) {
          const txt = state.texts.find(t => t.id === state.selectedTextId);
          if (txt) {
            txt.font = fontName;
            renderFrame(state.time);
          }
        }
        alert(`Loaded custom font: ${fontName}`);
      }).catch(err => {
        alert("Failed to load font: " + err.message);
      });
    };
    reader.readAsArrayBuffer(file);
  });

  // Timeline Mouse Event Handling (Seek, Move, Resize)
  let dragMode = null; // 'seek', 'move', 'resize-left', 'resize-right'
  let dragTextId = null;
  let dragStartMouseX = 0;
  let dragStartBlockStart = 0;
  let dragStartBlockEnd = 0;
  let dragStartSourceOffset = 0;

  UI.timelineTracksContainer.addEventListener('mousedown', (e) => {
    const rect = UI.timelineTracksContainer.getBoundingClientRect();
    const duration = getTimelineDuration();
    
    // Check if clicked handle or block
    const handle = e.target.closest('.timeline-block-handle');
    const block = e.target.closest('.timeline-block');
    const ruler = e.target.closest('.timeline-ruler');
    
    if (handle) {
      e.stopPropagation();
      const txtId = handle.dataset.id;
      dragMode = handle.dataset.handle === 'left' ? 'resize-left' : 'resize-right';
      dragTextId = txtId;
      if (txtId === 'audio') {
        selectAudio(true);
      } else {
        selectText(txtId);
      }
    } else if (block) {
      e.stopPropagation();
      const txtId = block.dataset.id;
      dragMode = 'move';
      dragTextId = txtId;
      if (txtId === 'audio') {
        selectAudio(true);
      } else {
        selectText(txtId);
      }
    } else if (ruler || e.target.classList.contains('timeline-tracks') || e.target.classList.contains('timeline-track-row') || e.target === UI.timelineTracksContainer) {
      dragMode = 'seek';
      const mouseX = e.clientX - rect.left;
      const pct = mouseX / rect.width;
      state.time = Math.max(0, Math.min(duration, pct * duration));
      updatePlayhead();
      renderFrame(state.time);
      syncAudioPlayback();
    }
    
    if (dragMode && dragTextId) {
      if (dragTextId === 'audio') {
        const track = state.audioTrack;
        if (track) {
          dragStartMouseX = e.clientX;
          dragStartBlockStart = track.timelineStart;
          dragStartBlockEnd = track.timelineStart + track.duration;
          dragStartSourceOffset = track.sourceOffset;
        }
      } else {
        const txt = state.texts.find(t => t.id === dragTextId);
        if (txt) {
          dragStartMouseX = e.clientX;
          dragStartBlockStart = txt.startTime;
          dragStartBlockEnd = txt.endTime;
        }
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragMode) return;
    
    const rect = UI.timelineTracksContainer.getBoundingClientRect();
    const duration = getTimelineDuration();
    
    if (dragMode === 'seek') {
      const mouseX = e.clientX - rect.left;
      const pct = mouseX / rect.width;
      state.time = Math.max(0, Math.min(duration, pct * duration));
      updatePlayhead();
      renderFrame(state.time);
      syncAudioPlayback();
    } else {
      const dxSec = ((e.clientX - dragStartMouseX) / rect.width) * duration;
      
      if (dragTextId === 'audio') {
        const track = state.audioTrack;
        if (track) {
          if (dragMode === 'move') {
            const newStart = dragStartBlockStart + dxSec;
            // Let it drag beyond timeline start and end, clamp slightly so it's not totally lost
            const minStart = -track.duration + 0.2;
            const maxStart = duration - 0.2;
            track.timelineStart = Math.max(minStart, Math.min(maxStart, newStart));
          }
          
          // Update inputs in panel
          if (state.selectedAudio) {
            UI.audioTimelineStart.min = -track.duration;
            UI.audioTimelineStart.max = duration;
            UI.audioTimelineStart.value = track.timelineStart;
            UI.audioTimelineStartVal.innerText = `${track.timelineStart.toFixed(1)}s`;
          }
          
          if (state.isPlaying) {
            syncAudioPlayback();
          }
          updateTimelineTracks();
        }
      } else {
        const txt = state.texts.find(t => t.id === dragTextId);
        if (txt) {
          if (dragMode === 'move') {
            let newStart = dragStartBlockStart + dxSec;
            let newEnd = dragStartBlockEnd + dxSec;
            const blockLen = dragStartBlockEnd - dragStartBlockStart;
            
            if (newStart < 0) {
              newStart = 0;
              newEnd = blockLen;
            }
            if (newEnd > duration) {
              newEnd = duration;
              newStart = duration - blockLen;
            }
            
            txt.startTime = newStart;
            txt.endTime = newEnd;
          } else if (dragMode === 'resize-left') {
            let newStart = dragStartBlockStart + dxSec;
            newStart = Math.max(0, Math.min(txt.endTime - 0.2, newStart));
            txt.startTime = newStart;
          } else if (dragMode === 'resize-right') {
            let newEnd = dragStartBlockEnd + dxSec;
            newEnd = Math.min(duration, Math.max(txt.startTime + 0.2, newEnd));
            txt.endTime = newEnd;
          }
          
          updateTimelineTracks();
          renderFrame(state.time);
        }
      }
    }
  });

  window.addEventListener('mouseup', () => {
    dragMode = null;
    dragTextId = null;
  });

  // Draw initial graph, estimate readouts, and timeline elements
  drawMaskGraph();
  updateExportEstimate();
  updateTimelineRuler();
  updateTimelineTracks();
  updatePlayhead();

  // --- LOAD PERMANENT FONTS FROM CONFIG ---
  async function loadConfiguredFonts() {
    try {
      const response = await fetch('fonts/fonts.json');
      if (!response.ok) return;
      
      const fontList = await response.json();
      if (!Array.isArray(fontList)) return;

      for (const font of fontList) {
        if (font.name && font.url) {
          try {
            const fontFace = new FontFace(font.name, `url(${font.url})`);
            const loadedFace = await fontFace.load();
            document.fonts.add(loadedFace);

            // Add option to select menu
            const option = document.createElement('option');
            option.value = font.name;
            option.innerText = font.name + " (Custom)";
            UI.textFont.appendChild(option);
            
            console.log("Successfully loaded custom font from config: " + font.name);
          } catch (err) {
            console.error("Failed to load font from config: " + font.name, err);
          }
        }
      }
    } catch (err) {
      console.log("No custom fonts configuration found in fonts/fonts.json");
    }
  }

  // Pre-load custom fonts from config folder
  loadConfiguredFonts();

  // Handle keyboard shortcuts (Spacebar for play/pause)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      const activeEl = document.activeElement;
      // If typing inside an input field, do not trigger play/pause
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }
      e.preventDefault();
      UI.btnPlayPause.click();
    }
  });

  // Handle browser window resize events
  window.addEventListener('resize', () => {
    resizeMainCanvas();
    renderFrame(state.time);
  });
});
