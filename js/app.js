import { state } from './state.js';
import { UI } from './ui.js';
import { getPseudoRandom, loadConfiguredFonts, getTimelineDuration } from './utils.js';
import { ImageProcessor, drawInspectorPreview, drawMaskGraph } from './masking.js';
import { GlitchManager } from './glitch.js';
import { stopAudioSource, syncAudioPlayback, getAudioContext, activeAudioGain, activeAudioSource } from './audio.js';
import { resizeMainCanvas, renderFrame, ctx } from './renderer.js';
import {
  updateTimelineTracks,
  updateTimelineRuler,
  updatePlayhead,
  selectText,
  selectAudio,
  selectVideo,
  selectGraphic,
  selectGlitchTrigger,
  initTimelineEvents
} from './timeline.js';
import { VideoExporter } from './exporter.js';

// Run on application load
document.addEventListener('DOMContentLoaded', () => {
  // --- COLLAPSIBLE PANEL SECTIONS ---
  document.querySelectorAll('.panel-section').forEach((section) => {
    const header = section.querySelector('.section-title-row') || section.querySelector('.section-title');
    if (!header) return;

    const trigger = section.querySelector('.section-title');
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('.inspector-bg-selectors') || e.target.closest('input') || e.target.closest('select')) {
          return;
        }
        section.classList.toggle('collapsed');
      });
    }

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'panel-section-content';

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

  // --- IMAGE HELPERS ---
  async function loadImage(file) {
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

  async function addImages(files) {
    UI.canvasLoading.classList.remove('hidden');
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const img = await loadImage(file);
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
      autoExpandPanelsOnUpload();
    } else {
      state.imageLoaded = false;
    }
    UI.canvasLoading.classList.add('hidden');
  }

  async function handleMultipleImageFiles(files) {
    await addImages(files);
    
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

  // --- ESTIMATE AND TIMELINE SYNCHRONIZATION ---
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

  function updateMp4WarningVisibility() {
    if (!UI.mp4Warning) return;
    const hasWebCodecs = typeof window.VideoEncoder !== 'undefined';
    if (state.exportFormat === 'mp4' && !hasWebCodecs) {
      UI.mp4Warning.style.display = 'flex';
    } else {
      UI.mp4Warning.style.display = 'none';
    }
  }

  function updateGlitchTriggerButtonState() {
    if (UI.btnAddGlitchTrigger) {
      UI.btnAddGlitchTrigger.disabled = !state.glitchEnabled;
    }
  }

  function autoExpandPanelsOnUpload() {
    if (UI.layerIsolationSection) {
      UI.layerIsolationSection.classList.remove('collapsed');
    }
    if (UI.extractedLayersSection) {
      UI.extractedLayersSection.classList.remove('collapsed');
    }
    if (UI.infiniteMotionSection) {
      UI.infiniteMotionSection.classList.remove('collapsed');
    }
  }

  function syncVideoPlayback() {
    if (!state.videoBlocks || state.videoBlocks.length === 0) return;
    const dur = getTimelineDuration();
    const playheadTime = state.time % dur;
    
    state.videoBlocks.forEach(block => {
      const video = block.element;
      if (!video) return;
      
      const isActive = (playheadTime >= block.startTime && playheadTime < block.endTime);
      
      if (isActive) {
        const targetTime = playheadTime - block.startTime;
        if (state.isPlaying && state.imageLoaded) {
          if (video.paused) {
            video.play().catch(e => console.log("Video auto-play blocked:", e));
          }
          const diff = Math.abs(video.currentTime - targetTime);
          if (diff > 0.15) {
            video.currentTime = targetTime;
          }
        } else {
          if (!video.paused) {
            video.pause();
          }
          if (Math.abs(video.currentTime - targetTime) > 0.05) {
            video.currentTime = targetTime;
          }
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
      }
    });
  }

  // --- ANIMATION LOOP ---
  function animationLoop(timestamp) {
    // If exporting, let the exporter handle render steps.
    // We keep scheduling the loop so it automatically resumes once isExporting changes to false.
    if (state.isExporting) {
      requestAnimationFrame(animationLoop);
      return;
    }

    if (!state.lastFrameTime) state.lastFrameTime = timestamp;
    const dt = (timestamp - state.lastFrameTime) / 1000;
    state.lastFrameTime = timestamp;

    if (dt > 0) {
      state.fps = Math.round(1 / dt);
      UI.fpsValue.innerText = state.fps;
    }

    if (state.isPlaying && state.imageLoaded) {
      const dur = getTimelineDuration();
      state.prevTime = state.time;
      state.time += dt;
      
      let wrapped = false;
      if (state.time >= dur) {
        state.time = state.time % dur;
        wrapped = true;
      }
      
      if (state.glitchEnabled) {
        GlitchManager.update(dt);
      }

      if (state.audioTrack) {
        if (wrapped) {
          syncAudioPlayback();
        } else {
          const start = state.audioTrack.timelineStart;
          const end = start + state.audioTrack.duration;
          const shouldBePlaying = (state.time >= start && state.time < end);
          if (shouldBePlaying && !activeAudioSource) {
            syncAudioPlayback();
          }
        }
      }
      
      renderFrame(state.time);
      updatePlayhead();
    }

    if (state.videoBlocks && state.videoBlocks.length > 0) {
      syncVideoPlayback();
    }

    requestAnimationFrame(animationLoop);
  }

  // --- DRAG AND DROP / FILE INPUTS ---
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
    updateGlitchTriggerButtonState();
  });

  if (UI.glitchMonochrome) {
    UI.glitchMonochrome.addEventListener('change', (e) => {
      state.glitchMonochrome = e.target.checked;
      renderFrame(state.time);
    });
  }

  const bindGlitchCheckbox = (elem, stateKey) => {
    if (elem) {
      elem.addEventListener('change', (e) => {
        state[stateKey] = e.target.checked;
        renderFrame(state.time);
      });
    }
  };
  bindGlitchCheckbox(UI.glitchStyleRgbSort, 'glitchStyleRgbSort');
  bindGlitchCheckbox(UI.glitchStyleVhs, 'glitchStyleVhs');
  bindGlitchCheckbox(UI.glitchStyleBlock, 'glitchStyleBlock');
  bindGlitchCheckbox(UI.glitchStyleLiquid, 'glitchStyleLiquid');
  bindGlitchCheckbox(UI.glitchStyleRandom, 'glitchStyleRandom');

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

  UI.layerEdgeFade.addEventListener('input', (e) => {
    state.layerEdgeFade = parseInt(e.target.value);
    UI.layerEdgeFadeVal.innerText = `${state.layerEdgeFade}%`;
  });
  UI.layerEdgeFade.addEventListener('change', () => {
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
      state.selectedInspectorLayer = index;
      drawInspectorPreview();

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
      state.prevTime = state.time;
      syncAudioPlayback();
    } else {
      UI.btnPlayPause.classList.remove('active');
      UI.playPauseIcon.setAttribute('data-lucide', 'play');
      stopAudioSource();
    }
    if (state.videoBlocks && state.videoBlocks.length > 0) {
      syncVideoPlayback();
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

    UI.layerEdgeFade.value = 10;
    state.layerEdgeFade = 10;
    UI.layerEdgeFadeVal.innerText = '10%';

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
    if (UI.exportFormat) {
      UI.exportFormat.value = 'mp4';
    }
    state.exportFormat = 'mp4';
    updateMp4WarningVisibility();
    state.timelineZoom = 1.0;
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

    if (UI.glitchMonochrome) {
      UI.glitchMonochrome.checked = false;
    }
    state.glitchMonochrome = false;

    if (UI.glitchStyleRgbSort) UI.glitchStyleRgbSort.checked = true;
    if (UI.glitchStyleVhs) UI.glitchStyleVhs.checked = false;
    if (UI.glitchStyleBlock) UI.glitchStyleBlock.checked = false;
    if (UI.glitchStyleLiquid) UI.glitchStyleLiquid.checked = false;
    if (UI.glitchStyleRandom) UI.glitchStyleRandom.checked = false;
    state.glitchStyleRgbSort = true;
    state.glitchStyleVhs = false;
    state.glitchStyleBlock = false;
    state.glitchStyleLiquid = false;
    state.glitchStyleRandom = false;
    state.activeSpikeStyle = null;

    UI.videoFadeInActive.checked = false;
    state.videoFadeInActive = false;
    UI.videoFadeInDurationGroup.style.display = 'none';
    UI.videoFadeInDuration.value = 0.5;
    state.videoFadeInDuration = 0.5;
    UI.videoFadeInDurationVal.innerText = '0.5s';

    UI.videoFadeOutActive.checked = false;
    state.videoFadeOutActive = false;
    UI.videoFadeOutDurationGroup.style.display = 'none';
    UI.videoFadeOutDuration.value = 0.5;
    state.videoFadeOutDuration = 0.5;
    UI.videoFadeOutDurationVal.innerText = '0.5s';

    state.selectedTextId = null;
    selectText(null);
    state.graphics = [];
    state.selectedGraphicId = null;
    selectGraphic(null);
    updateTimelineRuler();
    updateTimelineTracks();
    updatePlayhead();

    renderFrame(0);
    drawMaskGraph();
    updateGlitchTriggerButtonState();
  });

  if (UI.btnReloadApp) {
    UI.btnReloadApp.addEventListener('click', () => {
      location.reload();
    });
  }

  if (UI.btnResetSettingsOnly) {
    UI.btnResetSettingsOnly.addEventListener('click', () => {
      // 1. Time & playback state
      state.time = 0;
      stopAudioSource();
      state.cameraAngle = 0;
      state.isPlaying = true;
      UI.btnPlayPause.classList.add('active');
      UI.playPauseIcon.setAttribute('data-lucide', 'pause');
      state.lastFrameTime = performance.now();
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

      // 2. Masking parameters
      state.maskType = 'adaptive-luminosity';
      UI.maskType.value = 'adaptive-luminosity';
      UI.luminositySmoothnessGroup.style.display = 'flex';
      UI.colorRangeHueGroup.style.display = 'none';

      state.layerCount = 5;
      UI.layerCount.value = 5;
      UI.layerCountVal.innerText = '5';

      state.maskFeather = 0.3;
      UI.maskFeather.value = 0.3;
      UI.maskFeatherVal.innerText = '0.30';

      state.hueTolerance = 45;
      UI.hueTolerance.value = 45;
      UI.hueToleranceVal.innerText = '45°';

      state.layerEdgeFade = 10;
      UI.layerEdgeFade.value = 10;
      UI.layerEdgeFadeVal.innerText = '10%';

      state.randomBoundaries = [];

      // 3. Viewport/Motion Parameters
      state.aspectRatio = 'original';
      UI.aspectRatio.value = 'original';
      resizeMainCanvas();

      state.zoomSpeed = 0.05;
      UI.zoomSpeed.value = 0.05;
      UI.zoomSpeedVal.innerText = '0.05';

      state.zoomDepth = 4.0;
      UI.zoomDepth.value = 4.0;
      UI.zoomDepthVal.innerText = '4.0';

      state.cameraRotation = 0;
      UI.cameraRotation.value = 0;
      UI.cameraRotationVal.innerText = '0.0°/s';

      state.cameraDrift = 0.0;
      UI.cameraDrift.value = 0;
      UI.cameraDriftVal.innerText = '0.0';

      state.mirrorMode = 'none';
      UI.mirrorMode.value = 'none';
      UI.kaleidoscopeSlicesGroup.style.display = 'none';

      state.kaleidoscopeSlices = 8;
      UI.kSlices.value = 8;
      UI.kSlicesVal.innerText = '8';

      state.gridActive = false;
      UI.btnToggleGrid.classList.remove('active');
      UI.mainCanvas.parentElement.classList.remove('composition-grid');

      // 4. Glitch FX
      state.rgbSplit = 0;
      UI.rgbSplit.value = 0;
      UI.rgbSplitVal.innerText = '0 px';

      state.pixelSort = 0;
      UI.pixelSort.value = 0;
      UI.pixelSortVal.innerText = '0%';

      state.glitchFrequency = 5;
      UI.glitchFrequency.value = 5;
      UI.glitchFrequencyVal.innerText = '5%';

      state.glitchSeverity = 10;
      UI.glitchSeverity.value = 10;
      UI.glitchSeverityVal.innerText = '10px';

      state.depthModulation = 0;
      UI.depthModulation.value = 0;
      UI.depthModulationVal.innerText = '0%';

      state.glitchEnabled = false;
      UI.glitchEnabled.checked = false;

      state.glitchMonochrome = false;
      if (UI.glitchMonochrome) {
        UI.glitchMonochrome.checked = false;
      }

      state.glitchStyleRgbSort = true;
      if (UI.glitchStyleRgbSort) UI.glitchStyleRgbSort.checked = true;
      state.glitchStyleVhs = false;
      if (UI.glitchStyleVhs) UI.glitchStyleVhs.checked = false;
      state.glitchStyleBlock = false;
      if (UI.glitchStyleBlock) UI.glitchStyleBlock.checked = false;
      state.glitchStyleLiquid = false;
      if (UI.glitchStyleLiquid) UI.glitchStyleLiquid.checked = false;
      state.glitchStyleRandom = false;
      if (UI.glitchStyleRandom) UI.glitchStyleRandom.checked = false;
      state.activeSpikeStyle = null;

      // 5. Exporter Settings
      state.exportFormat = 'mp4';
      if (UI.exportFormat) {
        UI.exportFormat.value = 'mp4';
      }
      updateMp4WarningVisibility();
      state.timelineZoom = 1.0;

      state.exportFps = 30;
      UI.exportFps.value = '30';

      state.exportResolution = 'viewport';
      UI.exportResolution.value = 'viewport';

      state.exportMode = 'duration';
      UI.exportMode.value = 'duration';

      state.exportDuration = 5;
      UI.exportDuration.value = 5;
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

      state.exportLoops = 1;
      UI.exportLoops.value = 1;
      UI.exportLoopsVal.innerText = '1';

      UI.exportDurationGroup.style.display = 'flex';
      UI.exportLoopsGroup.style.display = 'none';

      state.videoFadeInActive = false;
      UI.videoFadeInActive.checked = false;
      UI.videoFadeInDurationGroup.style.display = 'none';
      state.videoFadeInDuration = 0.5;
      UI.videoFadeInDuration.value = 0.5;
      UI.videoFadeInDurationVal.innerText = '0.5s';

      state.videoFadeOutActive = false;
      UI.videoFadeOutActive.checked = false;
      UI.videoFadeOutDurationGroup.style.display = 'none';
      state.videoFadeOutDuration = 0.5;
      UI.videoFadeOutDuration.value = 0.5;
      UI.videoFadeOutDurationVal.innerText = '0.5s';

      // 6. Overlays (Texts, Graphics, Audio)
      state.texts = [];
      state.selectedTextId = null;
      selectText(null);

      state.graphics = [];
      state.selectedGraphicId = null;
      selectGraphic(null);

      state.glitchTriggers = [];
      state.selectedGlitchTriggerId = null;
      selectGlitchTrigger(null);

      state.audioTrack = null;
      selectAudio(false);

      if (state.videoBlocks && state.videoBlocks.length > 0) {
        state.videoBlocks.forEach(block => {
          if (block.element) {
            block.element.pause();
          }
          URL.revokeObjectURL(block.url);
        });
      }
      state.videoBlocks = [];
      state.selectedVideoId = null;
      selectVideo(null);
      if (UI.videoFileInput) {
        UI.videoFileInput.value = '';
      }

      // 7. Re-process layer stacks to apply default mask settings
      if (state.uploadedImages.length > 0) {
        ImageProcessor.reprocessAllImagesLayers();
        ImageProcessor.initializeRenderStack();
      }

      // 8. Update timelines and canvas
      updateExportEstimate();
      updateTimelineRuler();
      updateTimelineTracks();
      updatePlayhead();
      drawMaskGraph();
      renderFrame(0);

      // 9. Sync audio
      syncAudioPlayback();
      updateGlitchTriggerButtonState();
    });
  }

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

  if (UI.exportFormat) {
    UI.exportFormat.addEventListener('change', (e) => {
      state.exportFormat = e.target.value;
      updateMp4WarningVisibility();
    });
  }

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

  UI.videoFadeInActive.addEventListener('change', (e) => {
    state.videoFadeInActive = e.target.checked;
    if (state.videoFadeInActive) {
      UI.videoFadeInDurationGroup.style.display = 'flex';
    } else {
      UI.videoFadeInDurationGroup.style.display = 'none';
    }
    renderFrame(state.time);
  });

  UI.videoFadeInDuration.addEventListener('input', (e) => {
    state.videoFadeInDuration = parseFloat(e.target.value);
    UI.videoFadeInDurationVal.innerText = `${state.videoFadeInDuration.toFixed(1)}s`;
    renderFrame(state.time);
  });

  UI.videoFadeOutActive.addEventListener('change', (e) => {
    state.videoFadeOutActive = e.target.checked;
    if (state.videoFadeOutActive) {
      UI.videoFadeOutDurationGroup.style.display = 'flex';
    } else {
      UI.videoFadeOutDurationGroup.style.display = 'none';
    }
    renderFrame(state.time);
  });

  UI.videoFadeOutDuration.addEventListener('input', (e) => {
    state.videoFadeOutDuration = parseFloat(e.target.value);
    UI.videoFadeOutDurationVal.innerText = `${state.videoFadeOutDuration.toFixed(1)}s`;
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
  UI.btnAddTextNew.addEventListener('click', () => {
    if (state.texts.length >= 15) {
      alert("Maximum limit of 15 text overlay blocks reached.");
      return;
    }
    
    let maxTrackIdx = 0;
    const allIndices = [
      ...state.texts.map(t => t.trackIndex !== undefined ? t.trackIndex : 0),
      ...state.graphics.map(g => g.trackIndex !== undefined ? g.trackIndex : 0),
      ...state.videoBlocks.map(v => v.trackIndex !== undefined ? v.trackIndex : 0)
    ];
    if (allIndices.length > 0) {
      maxTrackIdx = Math.max(...allIndices);
    }
    const targetTrackIdx = maxTrackIdx + 1;

    
    const duration = getTimelineDuration();
    const newText = {
      id: 'txt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      text: 'NEW TEXT TRACK',
      font: 'Outfit',
      size: 40,
      color: '#00f2fe',
      x: 0.0,
      y: 0.0,
      angle: 0,
      idleWobble: 0.0,
      idleSkew: 0.0,
      glitchMode: 'none',
      glitchMono: false,
      glitchIntensity: 50,
      flickerIntensity: 0,
      transitionMode: 'fade-blur',
      transitionDuration: 0.4,
      startTime: 0,
      endTime: Math.min(duration, 3.0),
      trackIndex: targetTrackIdx
    };
    
    state.texts.push(newText);
    selectText(newText.id);
    updateTimelineTracks();
    renderFrame(state.time);
  });

  UI.btnAddTextSame.addEventListener('click', () => {
    if (!state.selectedTextId) {
      alert("Please select an existing text block on the timeline first to add a new block to the same track.");
      return;
    }
    const selectedTxt = state.texts.find(t => t.id === state.selectedTextId);
    if (!selectedTxt) return;
    
    if (state.texts.length >= 15) {
      alert("Maximum limit of 15 text overlay blocks reached.");
      return;
    }
    
    const duration = getTimelineDuration();
    let startTime = selectedTxt.endTime;
    if (startTime >= duration - 0.2) {
      startTime = 0.0;
    }
    const endTime = Math.min(duration, startTime + 3.0);
    
    const targetTrackIdx = selectedTxt.trackIndex !== undefined ? selectedTxt.trackIndex : 0;
    
    const newText = {
      id: 'txt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      text: 'NEXT TEXT',
      font: selectedTxt.font,
      size: selectedTxt.size,
      color: selectedTxt.color,
      x: selectedTxt.x,
      y: selectedTxt.y,
      angle: selectedTxt.angle,
      idleWobble: selectedTxt.idleWobble,
      idleSkew: selectedTxt.idleSkew,
      glitchMode: selectedTxt.glitchMode,
      glitchMono: selectedTxt.glitchMono,
      glitchIntensity: selectedTxt.glitchIntensity,
      flickerIntensity: selectedTxt.flickerIntensity !== undefined ? selectedTxt.flickerIntensity : 0,
      transitionMode: selectedTxt.transitionMode,
      transitionDuration: selectedTxt.transitionDuration,
      startTime: startTime,
      endTime: endTime,
      trackIndex: targetTrackIdx
    };
    
    state.texts.push(newText);
    selectText(newText.id);
    updateTimelineTracks();
    renderFrame(state.time);
  });

  UI.btnCopyText.addEventListener('click', () => {
    if (!state.selectedTextId) return;
    const selectedTxt = state.texts.find(t => t.id === state.selectedTextId);
    if (!selectedTxt) return;

    if (state.texts.length >= 15) {
      alert("Maximum limit of 15 text overlay blocks reached.");
      return;
    }

    const duration = getTimelineDuration();
    let startTime = selectedTxt.endTime;
    if (startTime >= duration - 0.2) {
      startTime = 0.0;
    }
    const blockDuration = selectedTxt.endTime - selectedTxt.startTime;
    const endTime = Math.min(duration, startTime + blockDuration);

    const clonedText = {
      ...selectedTxt,
      id: 'txt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      startTime: startTime,
      endTime: endTime
    };

    state.texts.push(clonedText);
    selectText(clonedText.id);
    updateTimelineTracks();
    renderFrame(state.time);
  });

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

  // Add Graphic Layer
  UI.btnAddGraphic.addEventListener('click', () => {
    if (state.graphics.length >= 5) {
      alert("Maximum limit of 5 graphic overlay tracks reached.");
      return;
    }
    UI.graphicFileInput.click();
  });

  UI.graphicFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    UI.canvasLoading.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const duration = getTimelineDuration();
        let maxTrackIdx = 0;
        const allIndices = [
          ...state.texts.map(t => t.trackIndex !== undefined ? t.trackIndex : 0),
          ...state.graphics.map(g => g.trackIndex !== undefined ? g.trackIndex : 0),
          ...state.videoBlocks.map(v => v.trackIndex !== undefined ? v.trackIndex : 0)
        ];
        if (allIndices.length > 0) {
          maxTrackIdx = Math.max(...allIndices);
        }
        const targetTrackIdx = maxTrackIdx + 1;

        const newGraphic = {
          id: 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          img: img,
          fileName: file.name,
          startTime: 0,
          endTime: duration,
          x: 0.0,
          y: 0.0,
          scale: 100,
          glitchFrequency: 10,
          glitchAmplitude: 20,
          flickerIntensity: 0,
          brightness: 100,
          contrast: 100,
          glowActive: false,
          glowRadius: 20,
          glowColor: '#ff007f',
          trackIndex: targetTrackIdx
        };

        state.graphics.push(newGraphic);
        selectGraphic(newGraphic.id);
        UI.canvasLoading.classList.add('hidden');
        renderFrame(state.time);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  UI.btnDeleteGraphic.addEventListener('click', () => {
    if (!state.selectedGraphicId) return;
    const index = state.graphics.findIndex(g => g.id === state.selectedGraphicId);
    if (index !== -1) {
      state.graphics.splice(index, 1);
      selectGraphic(null);
      updateTimelineTracks();
      renderFrame(state.time);
    }
  });

  // Graphic Settings bindings
  UI.graphicTimelineStart.addEventListener('input', (e) => {
    if (!state.selectedGraphicId) return;
    const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
    if (grp) {
      const val = parseFloat(e.target.value);
      grp.startTime = Math.min(grp.endTime - 0.2, val);
      UI.graphicTimelineStartVal.innerText = `${grp.startTime.toFixed(1)}s`;
      e.target.value = grp.startTime;
      updateTimelineTracks();
      renderFrame(state.time);
    }
  });

  UI.graphicTimelineEnd.addEventListener('input', (e) => {
    if (!state.selectedGraphicId) return;
    const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
    if (grp) {
      const val = parseFloat(e.target.value);
      const duration = getTimelineDuration();
      grp.endTime = Math.max(grp.startTime + 0.2, Math.min(duration, val));
      UI.graphicTimelineEndVal.innerText = `${grp.endTime.toFixed(1)}s`;
      e.target.value = grp.endTime;
      updateTimelineTracks();
      renderFrame(state.time);
    }
  });

  UI.graphicPosX.addEventListener('input', (e) => {
    if (!state.selectedGraphicId) return;
    const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
    if (grp) {
      grp.x = parseInt(e.target.value) / 100;
      UI.graphicPosXVal.innerText = `${e.target.value}%`;
      renderFrame(state.time);
    }
  });

  UI.graphicPosY.addEventListener('input', (e) => {
    if (!state.selectedGraphicId) return;
    const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
    if (grp) {
      grp.y = parseInt(e.target.value) / 100;
      UI.graphicPosYVal.innerText = `${e.target.value}%`;
      renderFrame(state.time);
    }
  });

  UI.graphicScale.addEventListener('input', (e) => {
    if (!state.selectedGraphicId) return;
    const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
    if (grp) {
      grp.scale = parseInt(e.target.value);
      UI.graphicScaleVal.innerText = `${grp.scale}%`;
      updateTimelineTracks();
      renderFrame(state.time);
    }
  });

  UI.graphicGlitchFrequency.addEventListener('input', (e) => {
    if (!state.selectedGraphicId) return;
    const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
    if (grp) {
      grp.glitchFrequency = parseInt(e.target.value);
      UI.graphicGlitchFrequencyVal.innerText = `${grp.glitchFrequency}%`;
      renderFrame(state.time);
    }
  });

  UI.graphicGlitchAmplitude.addEventListener('input', (e) => {
    if (!state.selectedGraphicId) return;
    const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
    if (grp) {
      grp.glitchAmplitude = parseInt(e.target.value);
      UI.graphicGlitchAmplitudeVal.innerText = `${grp.glitchAmplitude}%`;
      renderFrame(state.time);
    }
  });

  UI.graphicFlickerIntensity.addEventListener('input', (e) => {
    if (!state.selectedGraphicId) return;
    const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
    if (grp) {
      grp.flickerIntensity = parseInt(e.target.value);
      UI.graphicFlickerIntensityVal.innerText = `${grp.flickerIntensity}%`;
      renderFrame(state.time);
    }
  });

  if (UI.graphicBrightness) {
    UI.graphicBrightness.addEventListener('input', (e) => {
      if (!state.selectedGraphicId) return;
      const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
      if (grp) {
        grp.brightness = parseInt(e.target.value);
        if (UI.graphicBrightnessVal) {
          UI.graphicBrightnessVal.innerText = `${grp.brightness}%`;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.graphicContrast) {
    UI.graphicContrast.addEventListener('input', (e) => {
      if (!state.selectedGraphicId) return;
      const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
      if (grp) {
        grp.contrast = parseInt(e.target.value);
        if (UI.graphicContrastVal) {
          UI.graphicContrastVal.innerText = `${grp.contrast}%`;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.graphicGlowActive) {
    UI.graphicGlowActive.addEventListener('change', (e) => {
      if (!state.selectedGraphicId) return;
      const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
      if (grp) {
        grp.glowActive = e.target.checked;
        renderFrame(state.time);
      }
    });
  }

  if (UI.graphicGlowRadius) {
    UI.graphicGlowRadius.addEventListener('input', (e) => {
      if (!state.selectedGraphicId) return;
      const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
      if (grp) {
        grp.glowRadius = parseInt(e.target.value);
        if (UI.graphicGlowRadiusVal) {
          UI.graphicGlowRadiusVal.innerText = `${grp.glowRadius}px`;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.graphicGlowColor) {
    UI.graphicGlowColor.addEventListener('input', (e) => {
      if (!state.selectedGraphicId) return;
      const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
      if (grp) {
        grp.glowColor = e.target.value;
        renderFrame(state.time);
      }
    });
  }

  document.querySelectorAll('.graphic-glow-swatch-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!state.selectedGraphicId) return;
      const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
      if (grp) {
        const color = e.currentTarget.getAttribute('data-color');
        grp.glowColor = color;
        UI.graphicGlowColor.value = color;
        renderFrame(state.time);
      }
    });
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
    
    UI.canvasLoading.classList.remove('hidden');
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const ctxAudio = getAudioContext();
        const audioBuffer = await ctxAudio.decodeAudioData(event.target.result);
        
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
        if (maxPeak > 0) {
          for (let i = 0; i < peaks.length; i++) {
            peaks[i] /= maxPeak;
          }
        }
        
        state.audioTrack = {
          fileName: file.name,
          buffer: audioBuffer,
          timelineStart: 0.0,
          sourceOffset: 0.0,
          duration: audioBuffer.duration,
          volume: 0.8,
          fadeInDuration: 0.0,
          fadeOutDuration: 0.0,
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

  UI.audioVolume.addEventListener('change', () => {
    if (state.isPlaying) {
      syncAudioPlayback();
    }
  });

  UI.audioFadeIn.addEventListener('input', (e) => {
    if (!state.audioTrack) return;
    state.audioTrack.fadeInDuration = parseFloat(e.target.value);
    UI.audioFadeInVal.innerText = `${state.audioTrack.fadeInDuration.toFixed(1)}s`;
  });

  UI.audioFadeIn.addEventListener('change', () => {
    if (state.isPlaying) {
      syncAudioPlayback();
    }
  });

  UI.audioFadeOut.addEventListener('input', (e) => {
    if (!state.audioTrack) return;
    state.audioTrack.fadeOutDuration = parseFloat(e.target.value);
    UI.audioFadeOutVal.innerText = `${state.audioTrack.fadeOutDuration.toFixed(1)}s`;
  });

  UI.audioFadeOut.addEventListener('change', () => {
    if (state.isPlaying) {
      syncAudioPlayback();
    }
  });

  UI.btnDeleteAudio.addEventListener('click', () => {
    stopAudioSource();
    state.audioTrack = null;
    selectAudio(false);
    updateTimelineTracks();
  });

  // --- VIDEO TIMELINE EVENTS & BINDINGS ---
  if (UI.btnAddVideo) {
    UI.btnAddVideo.addEventListener('click', () => {
      UI.videoFileInput.click();
    });
  }

  if (UI.videoFileInput) {
    UI.videoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      UI.canvasLoading.classList.remove('hidden');

      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.loop = false;

      video.addEventListener('loadedmetadata', () => {
        const dur = getTimelineDuration();
        
        let startTime = 0;
        if (state.videoBlocks && state.videoBlocks.length > 0) {
          state.videoBlocks.forEach(b => {
            if (b.endTime > startTime) {
              startTime = b.endTime;
            }
          });
        }
        if (startTime >= dur - 0.2) {
          startTime = 0;
        }
        
        const newBlock = {
          id: 'vid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          fileName: file.name,
          file: file,
          url: url,
          element: video,
          duration: video.duration,
          startTime: startTime,
          endTime: Math.min(dur, startTime + video.duration),
          monochrome: false,
          mirrorMode: 'none',
          kaleidoscopeSlices: 8,
          brightness: 100,
          contrast: 100,
          trackIndex: 0
        };

        state.videoBlocks.push(newBlock);
        selectVideo(newBlock.id);
        UI.canvasLoading.classList.add('hidden');
        renderFrame(state.time);
      });

      video.addEventListener('error', (err) => {
        console.error("Video load error:", err);
        alert("Failed to load video file. Please check format compatibility.");
        UI.canvasLoading.classList.add('hidden');
      });
      e.target.value = '';
    });
  }

  if (UI.btnDeleteVideo) {
    UI.btnDeleteVideo.addEventListener('click', () => {
      if (!state.selectedVideoId) return;
      const index = state.videoBlocks.findIndex(v => v.id === state.selectedVideoId);
      if (index !== -1) {
        const block = state.videoBlocks[index];
        if (block.element) {
          block.element.pause();
        }
        
        // Revoke Object URL if no other block is using it
        const isUrlUsedElsewhere = state.videoBlocks.some((v, idx) => idx !== index && v.url === block.url);
        if (!isUrlUsedElsewhere) {
          URL.revokeObjectURL(block.url);
        }
        
        state.videoBlocks.splice(index, 1);
        selectVideo(null);
        renderFrame(state.time);
      }
    });
  }

  if (UI.btnDuplicateVideo) {
    UI.btnDuplicateVideo.addEventListener('click', () => {
      if (!state.selectedVideoId) return;
      const selectedBlock = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (!selectedBlock) return;
      
      const dur = getTimelineDuration();
      let startTime = selectedBlock.endTime;
      if (startTime >= dur - 0.2) startTime = 0.0;
      const blockDuration = selectedBlock.endTime - selectedBlock.startTime;
      const endTime = Math.min(dur, startTime + blockDuration);
      
      const clonedVideo = document.createElement('video');
      clonedVideo.src = selectedBlock.url;
      clonedVideo.muted = true;
      clonedVideo.playsInline = true;
      clonedVideo.loop = false;
      
      clonedVideo.addEventListener('loadedmetadata', () => {
        const newBlock = {
          ...selectedBlock,
          id: 'vid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          element: clonedVideo,
          startTime: startTime,
          endTime: endTime
        };
        state.videoBlocks.push(newBlock);
        selectVideo(newBlock.id);
        renderFrame(state.time);
      });
    });
  }

  if (UI.videoTimelineStart) {
    UI.videoTimelineStart.addEventListener('input', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        const val = parseFloat(e.target.value);
        const loopDur = getTimelineDuration();
        const blockLen = block.endTime - block.startTime;
        
        block.startTime = Math.min(loopDur - 0.2, val);
        block.endTime = Math.min(loopDur, block.startTime + blockLen);
        
        if (UI.videoTimelineStartVal) {
          UI.videoTimelineStartVal.innerText = `${block.startTime.toFixed(1)}s`;
        }
        e.target.value = block.startTime;
        
        updateTimelineTracks();
        renderFrame(state.time);
      }
    });
  }

  if (UI.videoMonochrome) {
    UI.videoMonochrome.addEventListener('change', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.monochrome = e.target.checked;
        renderFrame(state.time);
      }
    });
  }

  if (UI.videoMirrorMode) {
    UI.videoMirrorMode.addEventListener('change', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.mirrorMode = e.target.value;
        if (UI.videoKaleidoscopeSlicesGroup) {
          UI.videoKaleidoscopeSlicesGroup.style.display = (block.mirrorMode === 'kaleidoscope') ? 'flex' : 'none';
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.videoKSlices) {
    UI.videoKSlices.addEventListener('input', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.kaleidoscopeSlices = parseInt(e.target.value);
        if (UI.videoKSlicesVal) {
          UI.videoKSlicesVal.innerText = block.kaleidoscopeSlices;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.videoBrightness) {
    UI.videoBrightness.addEventListener('input', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.brightness = parseInt(e.target.value);
        if (UI.videoBrightnessVal) {
          UI.videoBrightnessVal.innerText = `${block.brightness}%`;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.videoContrast) {
    UI.videoContrast.addEventListener('input', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.contrast = parseInt(e.target.value);
        if (UI.videoContrastVal) {
          UI.videoContrastVal.innerText = `${block.contrast}%`;
        }
        renderFrame(state.time);
      }
    });
  }



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

  document.querySelectorAll('.palette-swatches .swatch-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!state.selectedTextId) return;
      const txt = state.texts.find(t => t.id === state.selectedTextId);
      if (txt) {
        const color = e.currentTarget.getAttribute('data-color');
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

  UI.textIdleWobble.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.idleWobble = parseFloat(e.target.value);
      UI.textIdleWobbleVal.innerText = `${txt.idleWobble.toFixed(1)}px`;
      renderFrame(state.time);
    }
  });

  UI.textIdleSkew.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.idleSkew = parseFloat(e.target.value) / 100;
      UI.textIdleSkewVal.innerText = `${Math.round(txt.idleSkew * 100)}%`;
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

  UI.textFlickerIntensity.addEventListener('input', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.flickerIntensity = parseInt(e.target.value);
      UI.textFlickerIntensityVal.innerText = `${txt.flickerIntensity}%`;
      renderFrame(state.time);
    }
  });

  UI.textGlitchMono.addEventListener('change', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      txt.glitchMono = e.target.checked;
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

  // Initial draw and helper triggers
  drawMaskGraph();
  if (UI.exportFormat) {
    state.exportFormat = UI.exportFormat.value;
  }
  updateMp4WarningVisibility();
  if (UI.glitchMonochrome) {
    state.glitchMonochrome = UI.glitchMonochrome.checked;
  }
  if (UI.glitchStyleRgbSort) state.glitchStyleRgbSort = UI.glitchStyleRgbSort.checked;
  if (UI.glitchStyleVhs) state.glitchStyleVhs = UI.glitchStyleVhs.checked;
  if (UI.glitchStyleBlock) state.glitchStyleBlock = UI.glitchStyleBlock.checked;
  if (UI.glitchStyleLiquid) state.glitchStyleLiquid = UI.glitchStyleLiquid.checked;
  if (UI.glitchStyleRandom) state.glitchStyleRandom = UI.glitchStyleRandom.checked;
  // Glitch Trigger bindings
  if (UI.btnAddGlitchTrigger) {
    UI.btnAddGlitchTrigger.addEventListener('click', () => {
      if (state.glitchTriggers.length >= 10) {
        alert("Maximum limit of 10 glitch trigger points reached.");
        return;
      }
      const newTrigger = {
        id: 'gt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        time: state.time,
        duration: 0.35,
        severity: 10
      };
      state.glitchTriggers.push(newTrigger);
      selectGlitchTrigger(newTrigger.id);
      updateTimelineTracks();
      renderFrame(state.time);
    });
  }

  if (UI.btnDeleteGlitchTrigger) {
    UI.btnDeleteGlitchTrigger.addEventListener('click', () => {
      if (!state.selectedGlitchTriggerId) return;
      const index = state.glitchTriggers.findIndex(t => t.id === state.selectedGlitchTriggerId);
      if (index !== -1) {
        state.glitchTriggers.splice(index, 1);
        selectGlitchTrigger(null);
        updateTimelineTracks();
        renderFrame(state.time);
      }
    });
  }

  if (UI.glitchTriggerTime) {
    UI.glitchTriggerTime.addEventListener('input', (e) => {
      if (!state.selectedGlitchTriggerId) return;
      const trigger = state.glitchTriggers.find(t => t.id === state.selectedGlitchTriggerId);
      if (trigger) {
        trigger.time = parseFloat(e.target.value);
        if (UI.glitchTriggerTimeVal) {
          UI.glitchTriggerTimeVal.innerText = `${trigger.time.toFixed(2)}s`;
        }
        updateTimelineTracks();
        renderFrame(state.time);
      }
    });
  }

  if (UI.glitchTriggerDuration) {
    UI.glitchTriggerDuration.addEventListener('input', (e) => {
      if (!state.selectedGlitchTriggerId) return;
      const trigger = state.glitchTriggers.find(t => t.id === state.selectedGlitchTriggerId);
      if (trigger) {
        trigger.duration = parseFloat(e.target.value);
        if (UI.glitchTriggerDurationVal) {
          UI.glitchTriggerDurationVal.innerText = `${trigger.duration.toFixed(2)}s`;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.glitchTriggerSeverity) {
    UI.glitchTriggerSeverity.addEventListener('input', (e) => {
      if (!state.selectedGlitchTriggerId) return;
      const trigger = state.glitchTriggers.find(t => t.id === state.selectedGlitchTriggerId);
      if (trigger) {
        trigger.severity = parseInt(e.target.value);
        if (UI.glitchTriggerSeverityVal) {
          UI.glitchTriggerSeverityVal.innerText = `${trigger.severity}px`;
        }
        renderFrame(state.time);
      }
    });
  }

  updateExportEstimate();
  updateTimelineRuler();
  updateTimelineTracks();
  updatePlayhead();
  initTimelineEvents();
  loadConfiguredFonts();
  updateGlitchTriggerButtonState();

  // Handle keyboard shortcuts (Spacebar for play/pause, Delete/Backspace for timeline item deletion)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }
      e.preventDefault();
      UI.btnPlayPause.click();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
      )) {
        return;
      }
      
      let deleted = false;
      if (state.selectedTextId && UI.btnDeleteText) {
        UI.btnDeleteText.click();
        deleted = true;
      } else if (state.selectedGraphicId && UI.btnDeleteGraphic) {
        UI.btnDeleteGraphic.click();
        deleted = true;
      } else if (state.selectedVideoId && UI.btnDeleteVideo) {
        UI.btnDeleteVideo.click();
        deleted = true;
      } else if (state.selectedGlitchTriggerId && UI.btnDeleteGlitchTrigger) {
        UI.btnDeleteGlitchTrigger.click();
        deleted = true;
      } else if (state.selectedAudio && UI.btnDeleteAudio) {
        UI.btnDeleteAudio.click();
        deleted = true;
      }
      
      if (deleted) {
        e.preventDefault();
      }
    }
  });

  // Handle browser window resize events
  window.addEventListener('resize', () => {
    resizeMainCanvas();
    renderFrame(state.time);
  });
});
