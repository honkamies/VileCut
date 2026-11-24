import { state, getDefaultState, HistoryManager, SERIALIZABLE_SETTINGS_KEYS } from './state.js';
import { UI } from './ui.js';
import { getPseudoRandom, loadConfiguredFonts, getTimelineDuration, generateUUID, formatDurationLabel, formatTimecode, parseDurationInput, getMinimumRequiredTimelineDuration } from './utils.js';

import { ImageProcessor, drawInspectorPreview, drawMaskGraph } from './masking.js';
import { GlitchManager } from './glitch.js';
import { stopAudioSource, syncAudioPlayback, getAudioContext, activeAudioGain, activeAudioSource } from './audio.js';
import { resizeMainCanvas, renderFrame, ctx } from './renderer.js';
import { engine } from './engine.js';
import {
  updateTimelineTracks,
  updateTimelineRuler,
  updatePlayhead,
  selectText,
  selectAudio,
  selectVideo,
  selectGraphic,
  selectGlitchTrigger,
  initTimelineEvents,
  normalizeTracks,
  swapTracks
} from './timeline.js';
import { VideoExporter } from './exporter.js';
import { LyricsManager } from './lyrics.js';
import { VhsFxManager, VHS_PRESETS } from './vhs_fx.js';
import { WizardManager } from './wizard.js';

// Run on application load
function initApp() {
  // Initialize Step-by-Step Creation Wizard
  WizardManager.init();
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
          id: generateUUID(),
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
      updateTimelineTracks();
      autoExpandPanelsOnUpload();
    } else {
      state.imageLoaded = false;
    }
    UI.canvasLoading.classList.add('hidden');
  }

  async function handleMultipleImageFiles(files) {
    await addImages(files);

    if (state.uploadedImages.length > 0) {
      engine.start();
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
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'x');
      btnRemove.appendChild(icon);

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
  window.updateImagesDeckUI = updateImagesDeckUI;

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
    const isGif = state.exportFormat === 'gif';
    const fps = parseInt(UI.exportFps ? UI.exportFps.value : (state.exportFps || 30)) || 30;
    const defaultDur = state.isDangerZone ? 30 : 10;

    let duration = defaultDur;
    let cycles = 0;
    if (state.exportMode === 'duration') {
      duration = state.exportDuration;
      const absSpeed = Math.abs(state.zoomSpeed);
      cycles = absSpeed > 0.0001 ? duration * absSpeed : 0;
    } else {
      const loops = state.exportLoops;
      const absSpeed = Math.abs(state.zoomSpeed);
      if (absSpeed < 0.001) {
        UI.exportEstimateText.innerText = isGif ? `Est. GIF Length: Infinite (Zoom Speed is 0)` : `Est. Video Length: Infinite (Zoom Speed is 0)`;
        return;
      }
      duration = loops / absSpeed;
      cycles = loops;
    }

    const totalFrames = Math.ceil(duration * fps);
    const mins = Math.floor(duration / 60);
    const secs = Math.round(duration % 60);
    const timeStr = mins > 0 ? `${mins}m ${secs > 0 ? secs + 's' : ''}` : `${duration.toFixed(1)}s`;
    const streamNotice = duration >= 45 ? ' • Direct-to-Disk Stream Active' : '';

    if (isGif) {
      UI.exportEstimateText.innerText = `Est. GIF: ${duration.toFixed(1)}s (${totalFrames.toLocaleString()} frames @ ${fps}fps, ${cycles.toFixed(2)} cycles)`;
    } else {
      UI.exportEstimateText.innerText = `Est. Video: ${timeStr} (${totalFrames.toLocaleString()} frames @ ${fps}fps, ${cycles.toFixed(2)} cycles)${streamNotice}`;
    }
  }

  function updateMp4WarningVisibility() {
    updateExportFormatVisibility();
  }

  function updateExportFormatVisibility() {
    const isGif = state.exportFormat === 'gif';
    if (UI.gifTip) {
      UI.gifTip.style.display = isGif ? 'flex' : 'none';
    }
    if (UI.exportBitrateGroup) {
      UI.exportBitrateGroup.style.display = isGif ? 'none' : 'flex';
    }
    if (UI.mp4Warning) {
      const hasWebCodecs = typeof window.VideoEncoder !== 'undefined';
      if (state.exportFormat === 'mp4' && !hasWebCodecs) {
        UI.mp4Warning.style.display = 'flex';
      } else {
        UI.mp4Warning.style.display = 'none';
      }
    }
    if (UI.btnExportVideo) {
      UI.btnExportVideo.innerHTML = isGif ? '<i data-lucide="download"></i> Begin GIF Export' : '<i data-lucide="download"></i> Begin Video Export';
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }
  }

  function updateBitrateDisplay(mbps) {
    if (!UI.exportBitrateVal) return;
    let label = 'Ultra Crisp (Recommended)';
    let color = state.isDangerZone ? 'var(--danger-primary)' : 'var(--cyan)';
    if (mbps <= 8) {
      label = 'Standard (Smaller File)';
      color = '#94a3b8';
    } else if (mbps <= 16) {
      label = 'High Quality';
      color = 'var(--cyan)';
    } else if (mbps <= 28) {
      label = 'Ultra Crisp (Zero Artifacts)';
      color = state.isDangerZone ? 'var(--danger-primary)' : 'var(--cyan)';
    } else {
      label = 'Master Studio (Pristine)';
      color = '#39ff14';
    }
    UI.exportBitrateVal.innerText = `${mbps} Mbps (${label})`;
    UI.exportBitrateVal.style.color = color;

    if (UI.btnBitratePresets) {
      UI.btnBitratePresets.forEach(btn => {
        const bVal = parseInt(btn.dataset.bitrate, 10);
        if (bVal === mbps) {
          btn.style.background = 'rgba(255,230,0,0.15)';
          btn.style.borderColor = 'var(--danger-primary)';
          btn.style.color = 'var(--danger-primary)';
          btn.style.fontWeight = '700';
        } else {
          btn.style.background = 'rgba(255,255,255,0.06)';
          btn.style.borderColor = 'rgba(255,255,255,0.15)';
          btn.style.color = '#94a3b8';
          btn.style.fontWeight = '400';
        }
      });
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

  function checkGifLockout() {
    const isTooLong = state.exportDuration > 30;
    if (!UI.exportFormat) return;
    const gifOpt = UI.exportFormat.querySelector('option[value="gif"]');
    if (gifOpt) {
      if (isTooLong) {
        gifOpt.disabled = true;
        gifOpt.innerText = 'Animated GIF (Disabled: >30s causes Out Of Memory)';
        if (state.exportFormat === 'gif') {
          state.exportFormat = 'mp4';
          UI.exportFormat.value = 'mp4';
          if (UI.gifTip) UI.gifTip.style.display = 'none';
        }
      } else {
        gifOpt.disabled = false;
        gifOpt.innerText = 'Animated GIF (Seamless Loop .gif)';
      }
    }
  }

  function setProjectDuration(dur) {
    const maxDur = state.isDangerZone ? 600 : 60;
    const minRequired = getMinimumRequiredTimelineDuration();
    state.exportDuration = Math.min(maxDur, Math.max(minRequired, Math.round(dur)));
    const label = state.isDangerZone ? formatDurationLabel(state.exportDuration) : `${state.exportDuration}s`;
    const tc = formatTimecode(state.exportDuration);

    if (UI.exportDuration) {
      UI.exportDuration.max = maxDur;
      UI.exportDuration.value = state.exportDuration;
    }
    if (UI.exportDurationVal) UI.exportDurationVal.innerText = label;
    if (UI.exportDurationInput && document.activeElement !== UI.exportDurationInput) {
      UI.exportDurationInput.value = tc;
    }

    if (UI.timelineDurationSlider) {
      UI.timelineDurationSlider.max = maxDur;
      UI.timelineDurationSlider.title = minRequired > (state.isDangerZone ? 5 : 1)
        ? `Timeline duration (${minRequired}s - ${maxDur}s). Minimum locked by timeline elements.`
        : `Drag to adjust duration (${state.isDangerZone ? '5s - 10m' : '1s - 60s'})`;
      UI.timelineDurationSlider.value = state.exportDuration;
    }
    if (UI.timelineDurationVal) {
      UI.timelineDurationVal.innerText = state.isDangerZone ? `(${state.exportDuration}s)` : `${state.exportDuration}s`;
    }
    if (UI.timelineDurationInput && document.activeElement !== UI.timelineDurationInput) {
      UI.timelineDurationInput.value = tc;
    }

    checkGifLockout();
    updateExportEstimate();
    updateTimelineRuler();
    updateTimelineTracks();
    updatePlayhead();
    if (state.selectedAudio) {
      selectAudio(true);
    }
  }
  window.setProjectDuration = setProjectDuration;

  // --- UNIFIED UI SYNC & RESET HELPERS ---
  function syncUIFromState({ reprocessLayers = false } = {}) {
    if (UI.maskType) {
      UI.maskType.value = state.maskType;
      if (UI.luminositySmoothnessGroup && UI.colorRangeHueGroup) {
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
      }
    }
    if (UI.layerCount) UI.layerCount.value = state.layerCount;
    if (UI.layerCountVal) UI.layerCountVal.innerText = `${state.layerCount}`;
    if (UI.maskFeather) UI.maskFeather.value = state.maskFeather;
    if (UI.maskFeatherVal) UI.maskFeatherVal.innerText = `${state.maskFeather}`;
    if (UI.hueTolerance) UI.hueTolerance.value = state.hueTolerance;
    if (UI.hueToleranceVal) UI.hueToleranceVal.innerText = `${state.hueTolerance}°`;
    if (UI.layerEdgeFade) UI.layerEdgeFade.value = state.layerEdgeFade;
    if (UI.layerEdgeFadeVal) UI.layerEdgeFadeVal.innerText = `${state.layerEdgeFade}%`;

    if (UI.aspectRatio) UI.aspectRatio.value = state.aspectRatio;
    resizeMainCanvas();

    if (UI.zoomSpeed) UI.zoomSpeed.value = state.zoomSpeed;
    if (UI.zoomSpeedVal) UI.zoomSpeedVal.innerText = `${state.zoomSpeed}`;
    if (UI.zoomDepth) UI.zoomDepth.value = state.zoomDepth;
    if (UI.zoomDepthVal) UI.zoomDepthVal.innerText = `${state.zoomDepth}`;
    if (UI.cameraRotation) UI.cameraRotation.value = state.cameraRotation;
    if (UI.cameraRotationVal) UI.cameraRotationVal.innerText = `${Number(state.cameraRotation).toFixed(1)}°/s`;
    if (UI.cameraDrift) UI.cameraDrift.value = state.cameraDrift;
    if (UI.cameraDriftVal) UI.cameraDriftVal.innerText = `${Number(state.cameraDrift).toFixed(1)}`;

    if (UI.mirrorMode) UI.mirrorMode.value = state.mirrorMode;
    if (UI.kaleidoscopeSlicesGroup) {
      UI.kaleidoscopeSlicesGroup.style.display = state.mirrorMode === 'kaleidoscope' ? 'flex' : 'none';
    }
    if (UI.kSlices) UI.kSlices.value = state.kaleidoscopeSlices;
    if (UI.kSlicesVal) UI.kSlicesVal.innerText = `${state.kaleidoscopeSlices}`;

    if (UI.btnToggleGrid) UI.btnToggleGrid.classList.toggle('active', !!state.gridActive);
    if (UI.mainCanvas && UI.mainCanvas.parentElement) {
      UI.mainCanvas.parentElement.classList.toggle('composition-grid', !!state.gridActive);
    }

    if (UI.glitchEnabled) UI.glitchEnabled.checked = !!state.glitchEnabled;
    if (UI.rgbSplit) UI.rgbSplit.value = state.rgbSplit;
    if (UI.rgbSplitVal) UI.rgbSplitVal.innerText = `${state.rgbSplit} px`;
    if (UI.pixelSort) UI.pixelSort.value = state.pixelSort;
    if (UI.pixelSortVal) UI.pixelSortVal.innerText = `${state.pixelSort}%`;
    if (UI.glitchFrequency) UI.glitchFrequency.value = state.glitchFrequency;
    if (UI.glitchFrequencyVal) UI.glitchFrequencyVal.innerText = `${state.glitchFrequency}%`;
    if (UI.glitchSeverity) UI.glitchSeverity.value = state.glitchSeverity;
    if (UI.glitchSeverityVal) UI.glitchSeverityVal.innerText = `${state.glitchSeverity}px`;
    if (UI.depthModulation) UI.depthModulation.value = state.depthModulation;
    if (UI.depthModulationVal) UI.depthModulationVal.innerText = `${state.depthModulation}%`;
    if (UI.glitchMonochrome) UI.glitchMonochrome.checked = !!state.glitchMonochrome;
    if (UI.glitchStyleRgbSort) UI.glitchStyleRgbSort.checked = !!state.glitchStyleRgbSort;
    if (UI.glitchStyleVhs) UI.glitchStyleVhs.checked = !!state.glitchStyleVhs;
    if (UI.glitchStyleBlock) UI.glitchStyleBlock.checked = !!state.glitchStyleBlock;
    if (UI.glitchStyleLiquid) UI.glitchStyleLiquid.checked = !!state.glitchStyleLiquid;
    if (UI.glitchStyleRandom) UI.glitchStyleRandom.checked = !!state.glitchStyleRandom;
    if (UI.glitchStyleFlicker) UI.glitchStyleFlicker.checked = !!state.glitchStyleFlicker;
    if (UI.glitchFlickerHighlights) UI.glitchFlickerHighlights.checked = !!state.glitchFlickerHighlightsOnly;

    // Geometric FX
    if (UI.geometricEnabled) UI.geometricEnabled.checked = !!state.geometricEnabled;
    if (UI.geoCurtainActive) UI.geoCurtainActive.checked = !!state.geoCurtainActive;
    const curtainControls = document.getElementById('geo-curtain-controls');
    if (curtainControls) curtainControls.style.display = state.geoCurtainActive ? 'block' : 'none';
    if (UI.geoCurtainDirection) UI.geoCurtainDirection.value = state.geoCurtainDirection;
    if (UI.geoCurtainAngleGroup) UI.geoCurtainAngleGroup.style.display = state.geoCurtainDirection === 'custom' ? 'block' : 'none';
    if (UI.geoCurtainAngle) UI.geoCurtainAngle.value = state.geoCurtainAngle;
    if (UI.geoCurtainAngleVal) UI.geoCurtainAngleVal.innerText = `${state.geoCurtainAngle}°`;
    if (UI.geoCurtainBidirectional) UI.geoCurtainBidirectional.checked = !!state.geoCurtainBidirectional;
    if (UI.geoCurtainMultiEdge) UI.geoCurtainMultiEdge.checked = !!state.geoCurtainMultiEdge;
    if (UI.geoCurtainLumTrigger) UI.geoCurtainLumTrigger.value = state.geoCurtainLumTrigger;
    if (UI.geoCurtainLumGateGroup) UI.geoCurtainLumGateGroup.style.display = state.geoCurtainLumTrigger === 'custom' ? 'block' : 'none';
    if (UI.geoCurtainMinLum) UI.geoCurtainMinLum.value = state.geoCurtainMinLum;
    if (UI.geoCurtainMinLumVal) UI.geoCurtainMinLumVal.innerText = `${state.geoCurtainMinLum}%`;
    if (UI.geoCurtainMaxLum) UI.geoCurtainMaxLum.value = state.geoCurtainMaxLum;
    if (UI.geoCurtainMaxLumVal) UI.geoCurtainMaxLumVal.innerText = `${state.geoCurtainMaxLum}%`;
    if (UI.geoCurtainColorMode) UI.geoCurtainColorMode.value = state.geoCurtainColorMode;
    if (UI.geoCurtainTintGroup) UI.geoCurtainTintGroup.style.display = state.geoCurtainColorMode === 'tint' ? 'block' : 'none';
    if (UI.geoCurtainTintColor) UI.geoCurtainTintColor.value = state.geoCurtainTintColor;
    if (UI.geoCurtainLumMod) UI.geoCurtainLumMod.value = state.geoCurtainLumMod;
    if (UI.geoCurtainLumModVal) UI.geoCurtainLumModVal.innerText = `${state.geoCurtainLumMod}%`;
    if (UI.geoCurtainOriginDot) UI.geoCurtainOriginDot.checked = !!state.geoCurtainOriginDot;
    if (UI.geoCurtainLength) UI.geoCurtainLength.value = state.geoCurtainLength;
    if (UI.geoCurtainLengthVal) UI.geoCurtainLengthVal.innerText = `${state.geoCurtainLength}%`;
    if (UI.geoCurtainDensity) UI.geoCurtainDensity.value = state.geoCurtainDensity;
    if (UI.geoCurtainDensityVal) UI.geoCurtainDensityVal.innerText = `${state.geoCurtainDensity}%`;
    if (UI.geoCurtainThreshold) UI.geoCurtainThreshold.value = state.geoCurtainThreshold;
    if (UI.geoCurtainThresholdVal) UI.geoCurtainThresholdVal.innerText = `${state.geoCurtainThreshold}`;
    if (UI.geoCurtainFlicker) UI.geoCurtainFlicker.value = state.geoCurtainFlicker;
    if (UI.geoCurtainFlickerVal) UI.geoCurtainFlickerVal.innerText = `${state.geoCurtainFlicker}%`;
    if (UI.geoCurtainOpacity) UI.geoCurtainOpacity.value = state.geoCurtainOpacity;
    if (UI.geoCurtainOpacityVal) UI.geoCurtainOpacityVal.innerText = `${state.geoCurtainOpacity}%`;
    if (UI.geoCurtainBlend) UI.geoCurtainBlend.value = state.geoCurtainBlend;

    if (UI.geoNodesActive) UI.geoNodesActive.checked = !!state.geoNodesActive;
    const nodesControls = document.getElementById('geo-nodes-controls');
    if (nodesControls) nodesControls.style.display = state.geoNodesActive ? 'block' : 'none';
    if (UI.geoNodeShape) UI.geoNodeShape.value = state.geoNodeShape;
    if (UI.geoNodeDensity) UI.geoNodeDensity.value = state.geoNodeDensity;
    if (UI.geoNodeDensityVal) UI.geoNodeDensityVal.innerText = `${state.geoNodeDensity}%`;
    if (UI.geoNodeSize) UI.geoNodeSize.value = state.geoNodeSize;
    if (UI.geoNodeSizeVal) UI.geoNodeSizeVal.innerText = `${state.geoNodeSize}px`;
    if (UI.geoNodeColor) UI.geoNodeColor.value = state.geoNodeColor;

    if (UI.geoContoursActive) UI.geoContoursActive.checked = !!state.geoContoursActive;
    const contourControls = document.getElementById('geo-contours-controls');
    if (contourControls) contourControls.style.display = state.geoContoursActive ? 'block' : 'none';
    if (UI.geoContourLevels) UI.geoContourLevels.value = state.geoContourLevels;
    if (UI.geoContourLevelsVal) UI.geoContourLevelsVal.innerText = `${state.geoContourLevels}`;
    if (UI.geoContourOpacity) UI.geoContourOpacity.value = state.geoContourOpacity;
    if (UI.geoContourOpacityVal) UI.geoContourOpacityVal.innerText = `${state.geoContourOpacity}%`;
    if (UI.geoContourColor) UI.geoContourColor.value = state.geoContourColor;

    // Vintage VHS & Analog Camcorder FX
    if (UI.vhsEnabled) UI.vhsEnabled.checked = !!state.vhsEnabled;
    const vhsControls = document.getElementById('vhs-controls-container');
    if (vhsControls) vhsControls.style.opacity = state.vhsEnabled ? '1.0' : '0.6';
    if (UI.vhsPreset) UI.vhsPreset.value = state.vhsPreset || 'camcorder';
    if (UI.vhsScope) UI.vhsScope.value = state.vhsScope || 'composite';
    if (UI.vhsTapeCrease) UI.vhsTapeCrease.value = state.vhsTapeCrease;
    if (UI.vhsTapeCreaseVal) UI.vhsTapeCreaseVal.innerText = `${state.vhsTapeCrease}%`;
    if (UI.vhsTrackingNoise) UI.vhsTrackingNoise.value = state.vhsTrackingNoise;
    if (UI.vhsTrackingNoiseVal) UI.vhsTrackingNoiseVal.innerText = `${state.vhsTrackingNoise}%`;
    if (UI.vhsVerticalJump) UI.vhsVerticalJump.value = state.vhsVerticalJump;
    if (UI.vhsVerticalJumpVal) UI.vhsVerticalJumpVal.innerText = `${state.vhsVerticalJump}%`;
    if (UI.vhsDegradationBlur) UI.vhsDegradationBlur.value = state.vhsDegradationBlur !== undefined ? state.vhsDegradationBlur : 40;
    if (UI.vhsDegradationBlurVal) UI.vhsDegradationBlurVal.innerText = `${state.vhsDegradationBlur !== undefined ? state.vhsDegradationBlur : 40}%`;
    if (UI.vhsDegradationOpacity) UI.vhsDegradationOpacity.value = state.vhsDegradationOpacity !== undefined ? state.vhsDegradationOpacity : 75;
    if (UI.vhsDegradationOpacityVal) UI.vhsDegradationOpacityVal.innerText = `${state.vhsDegradationOpacity !== undefined ? state.vhsDegradationOpacity : 75}%`;
    if (UI.vhsWobble) UI.vhsWobble.value = state.vhsWobble;
    if (UI.vhsWobbleVal) UI.vhsWobbleVal.innerText = `${state.vhsWobble}%`;
    if (UI.vhsSoftness) UI.vhsSoftness.value = state.vhsSoftness;
    if (UI.vhsSoftnessVal) UI.vhsSoftnessVal.innerText = `${state.vhsSoftness}%`;
    if (UI.vhsScanlines) UI.vhsScanlines.value = state.vhsScanlines;
    if (UI.vhsScanlinesVal) UI.vhsScanlinesVal.innerText = `${state.vhsScanlines}%`;
    if (UI.vhsScanlineBlur) UI.vhsScanlineBlur.value = state.vhsScanlineBlur !== undefined ? state.vhsScanlineBlur : 50;
    if (UI.vhsScanlineBlurVal) UI.vhsScanlineBlurVal.innerText = `${state.vhsScanlineBlur !== undefined ? state.vhsScanlineBlur : 50}%`;
    if (UI.vhsChromaBleed) UI.vhsChromaBleed.value = state.vhsChromaBleed;
    if (UI.vhsChromaBleedVal) UI.vhsChromaBleedVal.innerText = `${state.vhsChromaBleed}%`;
    if (UI.vhsGrain) UI.vhsGrain.value = state.vhsGrain;
    if (UI.vhsGrainVal) UI.vhsGrainVal.innerText = `${state.vhsGrain}%`;
    if (UI.vhsColorDecay) UI.vhsColorDecay.value = state.vhsColorDecay;
    if (UI.vhsColorDecayVal) UI.vhsColorDecayVal.innerText = `${state.vhsColorDecay}%`;

    // Export & Timeline
    if (UI.exportFormat) UI.exportFormat.value = state.exportFormat;
    if (UI.exportFps) UI.exportFps.value = `${state.exportFps}`;
    if (UI.exportResolution) UI.exportResolution.value = state.exportResolution;
    if (UI.exportBitrate) UI.exportBitrate.value = state.exportBitrateMbps || 24;
    updateBitrateDisplay(state.exportBitrateMbps || 24);
    if (UI.exportMode) UI.exportMode.value = state.exportMode;
    if (UI.exportDurationGroup) UI.exportDurationGroup.style.display = state.exportMode === 'duration' ? 'flex' : 'none';
    if (UI.exportLoopsGroup) UI.exportLoopsGroup.style.display = state.exportMode === 'duration' ? 'none' : 'flex';
    if (UI.timelineDurationControl) {
      UI.timelineDurationControl.classList.toggle('disabled', state.exportMode !== 'duration');
    }
    if (UI.exportLoops) UI.exportLoops.value = state.exportLoops;
    if (UI.exportLoopsVal) UI.exportLoopsVal.innerText = `${state.exportLoops}`;

    if (UI.videoFadeInActive) UI.videoFadeInActive.checked = !!state.videoFadeInActive;
    if (UI.videoFadeInDurationGroup) UI.videoFadeInDurationGroup.style.display = state.videoFadeInActive ? 'flex' : 'none';
    if (UI.videoFadeInDuration) UI.videoFadeInDuration.value = state.videoFadeInDuration;
    if (UI.videoFadeInDurationVal) UI.videoFadeInDurationVal.innerText = `${Number(state.videoFadeInDuration).toFixed(1)}s`;

    if (UI.videoFadeOutActive) UI.videoFadeOutActive.checked = !!state.videoFadeOutActive;
    if (UI.videoFadeOutDurationGroup) UI.videoFadeOutDurationGroup.style.display = state.videoFadeOutActive ? 'flex' : 'none';
    if (UI.videoFadeOutDuration) UI.videoFadeOutDuration.value = state.videoFadeOutDuration;
    if (UI.videoFadeOutDurationVal) UI.videoFadeOutDurationVal.innerText = `${Number(state.videoFadeOutDuration).toFixed(1)}s`;

    setProjectDuration(state.exportDuration);
    updateMp4WarningVisibility();
    updateGlitchTriggerButtonState();

    if (reprocessLayers && state.uploadedImages.length > 0) {
      ImageProcessor.reprocessAllImagesLayers();
      ImageProcessor.initializeRenderStack();
    }

    selectText(state.selectedTextId);
    selectGraphic(state.selectedGraphicId);
    selectGlitchTrigger(state.selectedGlitchTriggerId);
    updateTimelineRuler();
    updateTimelineTracks();
    updatePlayhead();
    drawMaskGraph();
    renderFrame(state.time);
  }

  function resetSettingsToDefaults({ keepOverlays = false } = {}) {
    HistoryManager.pushState(keepOverlays ? 'Reset View' : 'Reset All Settings');
    const defaults = getDefaultState(state.isDangerZone);

    state.time = 0;
    stopAudioSource();
    state.cameraAngle = 0;
    state.cameraRotationBase = 0;
    state.activeSpikeStyle = null;
    state.glitchZoomBoostTimer = 0;

    SERIALIZABLE_SETTINGS_KEYS.forEach((key) => {
      state[key] = defaults[key];
    });
    state.randomBoundaries = [];

    if (!keepOverlays) {
      state.texts = [];
      state.selectedTextId = null;
      state.graphics = [];
      state.selectedGraphicId = null;
      state.glitchTriggers = [];
      state.selectedGlitchTriggerId = null;
      state.audioTrack = null;
      selectAudio(false);

      if (state.videoBlocks && state.videoBlocks.length > 0) {
        state.videoBlocks.forEach(block => {
          if (block.element) block.element.pause();
          URL.revokeObjectURL(block.url);
        });
      }
      state.videoBlocks = [];
      state.selectedVideoId = null;
      selectVideo(null);
      if (UI.videoFileInput) UI.videoFileInput.value = '';
    }

    syncUIFromState({ reprocessLayers: !keepOverlays });
    if (state.isPlaying) {
      syncAudioPlayback();
    }
  }

  // --- UNDO / REDO & PROJECT SAVE / LOAD BINDINGS ---
  const updateUndoRedoButtons = ({ canUndo, canRedo }) => {
    if (UI.btnUndo) UI.btnUndo.disabled = !canUndo;
    if (UI.btnRedo) UI.btnRedo.disabled = !canRedo;
  };
  HistoryManager.onChange = updateUndoRedoButtons;
  updateUndoRedoButtons({ canUndo: HistoryManager.canUndo(), canRedo: HistoryManager.canRedo() });

  const performUndo = () => {
    const prevMask = `${state.maskType}:${state.layerCount}:${state.maskFeather}:${state.hueTolerance}:${state.layerEdgeFade}`;
    if (HistoryManager.undo()) {
      const nextMask = `${state.maskType}:${state.layerCount}:${state.maskFeather}:${state.hueTolerance}:${state.layerEdgeFade}`;
      syncUIFromState({ reprocessLayers: prevMask !== nextMask });
    }
  };

  const performRedo = () => {
    const prevMask = `${state.maskType}:${state.layerCount}:${state.maskFeather}:${state.hueTolerance}:${state.layerEdgeFade}`;
    if (HistoryManager.redo()) {
      const nextMask = `${state.maskType}:${state.layerCount}:${state.maskFeather}:${state.hueTolerance}:${state.layerEdgeFade}`;
      syncUIFromState({ reprocessLayers: prevMask !== nextMask });
    }
  };

  if (UI.btnUndo) UI.btnUndo.addEventListener('click', performUndo);
  if (UI.btnRedo) UI.btnRedo.addEventListener('click', performRedo);

  if (UI.btnSaveProject) {
    UI.btnSaveProject.addEventListener('click', () => {
      const projectData = HistoryManager.serializeProject();
      const jsonStr = typeof projectData === 'string' ? projectData : JSON.stringify(projectData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `vilecut_project_${Date.now()}.vilecut.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    });
  }

  if (UI.btnLoadProject && UI.projectFileInput) {
    UI.btnLoadProject.addEventListener('click', () => {
      UI.projectFileInput.click();
    });

    UI.projectFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          let data = JSON.parse(evt.target.result);
          // Backward compatibility: unwrap previously double-stringified project files
          if (typeof data === 'string') {
            data = JSON.parse(data);
          }
          if (!data || !data.settings) {
            throw new Error('Invalid .vilecut.json project file.');
          }
          HistoryManager.pushState('Load Project');

          Object.keys(data.settings).forEach((key) => {
            if (SERIALIZABLE_SETTINGS_KEYS.includes(key)) {
              state[key] = data.settings[key];
            }
          });
          state.texts = Array.isArray(data.texts) ? data.texts.map(t => ({ ...t })) : [];
          state.glitchTriggers = Array.isArray(data.glitchTriggers) ? data.glitchTriggers.map(gt => ({ ...gt })) : [];

          if (Array.isArray(data.uploadedImages)) {
            const loadedDeck = [];
            for (const item of data.uploadedImages) {
              if (!item.dataUrl) continue;
              const img = await new Promise((resolve) => {
                const im = new Image();
                im.onload = () => resolve(im);
                im.onerror = () => resolve(null);
                im.src = item.dataUrl;
              });
              if (img) {
                loadedDeck.push({
                  id: item.id || generateUUID(),
                  name: item.name || 'Image.png',
                  img,
                  layers: []
                });
              }
            }
            state.uploadedImages = loadedDeck;
            state.imageLoaded = loadedDeck.length > 0;
            state.activeImageIndex = loadedDeck.length > 0
              ? Math.min(loadedDeck.length - 1, Math.max(0, data.activeImageIndex || 0))
              : -1;
            if (loadedDeck.length > 0) {
              ImageProcessor.reprocessAllImagesLayers();
              ImageProcessor.initializeRenderStack();
            }
            updateImagesDeckUI();
          }

          if (Array.isArray(data.graphics)) {
            const loadedGraphics = [];
            for (const g of data.graphics) {
              const copy = { ...g };
              if (g.dataUrl) {
                const img = await new Promise((resolve) => {
                  const im = new Image();
                  im.onload = () => resolve(im);
                  im.onerror = () => resolve(null);
                  im.src = g.dataUrl;
                });
                copy.img = img;
                delete copy.dataUrl;
              }
              if (copy.img) loadedGraphics.push(copy);
            }
            state.graphics = loadedGraphics;
          }

          state.selectedTextId = null;
          state.selectedGraphicId = null;
          state.selectedGlitchTriggerId = null;
          resizeMainCanvas();
          if (state.exportDuration) {
            setProjectDuration(state.exportDuration);
          }
          syncUIFromState({ reprocessLayers: true });
          updateTimelineTracks();
          renderFrame(state.time);

          const missingMedia = [];
          if (data.mediaManifest?.audio?.fileName) {
            missingMedia.push(`Audio: ${data.mediaManifest.audio.fileName}`);
          }
          if (Array.isArray(data.mediaManifest?.videos) && data.mediaManifest.videos.length > 0) {
            data.mediaManifest.videos.forEach(v => {
              if (v.fileName) missingMedia.push(`Video: ${v.fileName}`);
            });
          }
          if (missingMedia.length > 0) {
            alert(
              'Project settings, images, graphics, and text layers restored!\n\n' +
              'Because browsers cannot automatically read large local audio/video files from disk, please re-import:\n• ' +
              missingMedia.join('\n• ')
            );
          }
        } catch (err) {
          console.error('Failed to load project file:', err);
          alert('Failed to load project file: ' + err.message);
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    });
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
        const targetTime = Math.min(block.duration || Infinity, (block.sourceOffset || 0) + (playheadTime - block.startTime));
        if (state.isPlaying) {
          if (video.paused) {
            video.play().catch(e => console.log("Video auto-play blocked:", e));
          }
          const diff = Math.abs(video.currentTime - targetTime);
          if (diff > 0.25) {
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
  window.syncVideoPlayback = syncVideoPlayback;

  // --- ANIMATION LOOP DECOUPLED VIA ENGINE ---
  let lastFpsDomUpdate = 0;
  engine.subscribe((dt, timestamp) => {
    if (dt > 0) {
      state.fps = Math.round(1 / dt);
      if (timestamp - lastFpsDomUpdate > 250) {
        lastFpsDomUpdate = timestamp;
        if (UI.fpsValue) {
          UI.fpsValue.innerText = state.isPlaying ? state.fps : 'IDLE';
        }
      }
    }

    if (state.isPlaying || state.glitchActive) {
      const dur = getTimelineDuration();
      if (state.isPlaying) {
        state.prevTime = state.time;
        state.time += dt;

        let wrapped = false;
        if (state.time >= dur) {
          state.time = state.time % dur;
          wrapped = true;
          state.cameraRotationBase += state.cameraRotation * dur * (Math.PI / 180);
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
      }

      if (state.glitchEnabled || state.glitchActive) {
        GlitchManager.update(dt);
      }

      renderFrame(state.time);
      if (state.isPlaying) {
        updatePlayhead();
      }
    }

    if (state.videoBlocks && state.videoBlocks.length > 0) {
      syncVideoPlayback();
    }
  });

  // --- DIRECT VIEWPORT CANVAS DRAG-TO-MOVE FOR SELECTED OVERLAYS ---
  if (UI.mainCanvas) {
    let isCanvasDragging = false;
    let dragTarget = null;
    let dragTargetType = null;
    let dragStartMouseX = 0;
    let dragStartMouseY = 0;
    let dragStartObjX = 0;
    let dragStartObjY = 0;

    const getActiveDraggableOverlay = () => {
      if (state.selectedTextId) {
        const txt = state.texts.find(t => t.id === state.selectedTextId);
        if (txt) return { obj: txt, type: 'text' };
      }
      if (state.selectedGraphicId) {
        const grp = state.graphics.find(g => g.id === state.selectedGraphicId);
        if (grp) return { obj: grp, type: 'graphic' };
      }
      if (state.selectedVideoId && state.videoBlocks) {
        const vid = state.videoBlocks.find(v => v.id === state.selectedVideoId);
        if (vid) return { obj: vid, type: 'video' };
      }
      return null;
    };

    const findOverlayAtCoords = (clientX, clientY) => {
      const rect = UI.mainCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const cw = UI.mainCanvas.width;
      const ch = UI.mainCanvas.height;

      const clickX = ((clientX - rect.left) / rect.width) * cw;
      const clickY = ((clientY - rect.top) / rect.height) * ch;
      const dur = getTimelineDuration();
      const loopTime = ((state.time % dur) + dur) % dur;

      // 1. Check Graphic Overlays (top-most first)
      const hitMargin = Math.max(24, Math.round(cw * 0.04));
      if (state.graphics && state.graphics.length > 0) {
        for (let i = state.graphics.length - 1; i >= 0; i--) {
          const grp = state.graphics[i];
          if (loopTime < grp.startTime || loopTime > grp.endTime) continue;
          if (!grp.img) continue;
          const cx = cw / 2 + (grp.x || 0) * cw;
          const cy = ch / 2 + (grp.y || 0) * ch;
          const scaleFactor = grp.scale !== undefined ? grp.scale / 100 : 1.0;
          const scaleMultiplier = cw / 1024;
          const finalW = Math.max(36, grp.img.width * scaleFactor * scaleMultiplier);
          const finalH = Math.max(36, grp.img.height * scaleFactor * scaleMultiplier);

          if (clickX >= cx - finalW / 2 - hitMargin && clickX <= cx + finalW / 2 + hitMargin &&
              clickY >= cy - finalH / 2 - hitMargin && clickY <= cy + finalH / 2 + hitMargin) {
            return { obj: grp, type: 'graphic' };
          }
        }
      }

      // 2. Check Text Overlays
      if (state.texts && state.texts.length > 0) {
        for (let i = state.texts.length - 1; i >= 0; i--) {
          const txt = state.texts[i];
          if (loopTime < txt.startTime || loopTime > txt.endTime) continue;
          const cx = cw / 2 + (txt.x || 0) * cw;
          const cy = ch / 2 + (txt.y || 0) * ch;
          const scaleMultiplier = cw / 1024;
          const drawSize = (txt.fontSize || 42) * scaleMultiplier;
          const approxW = Math.max(60, (txt.text || '').length * drawSize * 0.6);
          const approxH = Math.max(30, drawSize * 1.5);

          if (clickX >= cx - approxW / 2 - hitMargin && clickX <= cx + approxW / 2 + hitMargin &&
              clickY >= cy - approxH / 2 - hitMargin && clickY <= cy + approxH / 2 + hitMargin) {
            return { obj: txt, type: 'text' };
          }
        }
      }

      // 3. Check Video Overlays
      if (state.videoBlocks && state.videoBlocks.length > 0) {
        for (let i = state.videoBlocks.length - 1; i >= 0; i--) {
          const vid = state.videoBlocks[i];
          if (loopTime < vid.startTime || loopTime > vid.endTime) continue;
          const cx = cw / 2 + (vid.x || 0) * cw;
          const cy = ch / 2 + (vid.y || 0) * ch;
          const finalW = Math.max(40, (vid.width || 300) * (cw / 1024));
          const finalH = Math.max(40, (vid.height || 200) * (cw / 1024));
          if (clickX >= cx - finalW / 2 - hitMargin && clickX <= cx + finalW / 2 + hitMargin &&
              clickY >= cy - finalH / 2 - hitMargin && clickY <= cy + finalH / 2 + hitMargin) {
            return { obj: vid, type: 'video' };
          }
        }
      }

      return null;
    };

    UI.mainCanvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      let active = getActiveDraggableOverlay();
      const hit = findOverlayAtCoords(e.clientX, e.clientY);
      if (hit) {
        if (hit.type === 'graphic') selectGraphic(hit.obj.id);
        else if (hit.type === 'text') selectText(hit.obj.id);
        else if (hit.type === 'video') selectVideo(hit.obj.id);
        active = hit;
      }
      if (!active) {
        if (state.graphics && state.graphics.length === 1) {
          selectGraphic(state.graphics[0].id);
          active = { obj: state.graphics[0], type: 'graphic' };
        } else if (state.texts && state.texts.length === 1) {
          selectText(state.texts[0].id);
          active = { obj: state.texts[0], type: 'text' };
        } else if (state.videoBlocks && state.videoBlocks.length === 1) {
          selectVideo(state.videoBlocks[0].id);
          active = { obj: state.videoBlocks[0], type: 'video' };
        }
      }
      if (!active) return;

      HistoryManager.pushState('Move Overlay on Canvas');
      isCanvasDragging = true;
      dragTarget = active.obj;
      dragTargetType = active.type;
      dragStartMouseX = e.clientX;
      dragStartMouseY = e.clientY;
      dragStartObjX = dragTarget.x || 0;
      dragStartObjY = dragTarget.y || 0;
      UI.mainCanvas.style.cursor = 'grabbing';
      e.preventDefault();
    });

    UI.mainCanvas.addEventListener('mousemove', (e) => {
      if (isCanvasDragging) return;
      const hit = findOverlayAtCoords(e.clientX, e.clientY);
      if (hit || getActiveDraggableOverlay()) {
        UI.mainCanvas.style.cursor = 'grab';
      } else {
        UI.mainCanvas.style.cursor = '';
      }
    });

    // Touch Support for Direct Canvas Dragging
    UI.mainCanvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      let active = getActiveDraggableOverlay();
      const hit = findOverlayAtCoords(touch.clientX, touch.clientY);
      if (hit) {
        if (hit.type === 'graphic') selectGraphic(hit.obj.id);
        else if (hit.type === 'text') selectText(hit.obj.id);
        else if (hit.type === 'video') selectVideo(hit.obj.id);
        active = hit;
      }
      if (!active) {
        if (state.graphics && state.graphics.length === 1) {
          selectGraphic(state.graphics[0].id);
          active = { obj: state.graphics[0], type: 'graphic' };
        } else if (state.texts && state.texts.length === 1) {
          selectText(state.texts[0].id);
          active = { obj: state.texts[0], type: 'text' };
        } else if (state.videoBlocks && state.videoBlocks.length === 1) {
          selectVideo(state.videoBlocks[0].id);
          active = { obj: state.videoBlocks[0], type: 'video' };
        }
      }
      if (!active) return;

      HistoryManager.pushState('Move Overlay on Canvas');
      isCanvasDragging = true;
      dragTarget = active.obj;
      dragTargetType = active.type;
      dragStartMouseX = touch.clientX;
      dragStartMouseY = touch.clientY;
      dragStartObjX = dragTarget.x || 0;
      dragStartObjY = dragTarget.y || 0;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!isCanvasDragging || !dragTarget || e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = UI.mainCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dx = (touch.clientX - dragStartMouseX) / rect.width;
      const dy = (touch.clientY - dragStartMouseY) / rect.height;

      const clampedX = Math.max(-0.5, Math.min(0.5, dragStartObjX + dx));
      const clampedY = Math.max(-0.5, Math.min(0.5, dragStartObjY + dy));

      dragTarget.x = Math.round(clampedX * 100) / 100;
      dragTarget.y = Math.round(clampedY * 100) / 100;

      if (dragTargetType === 'text') {
        if (UI.textPosX) UI.textPosX.value = dragTarget.x;
        if (UI.textPosXVal) UI.textPosXVal.innerText = `${Math.round(dragTarget.x * 100)}%`;
        if (UI.textPosY) UI.textPosY.value = dragTarget.y;
        if (UI.textPosYVal) UI.textPosYVal.innerText = `${Math.round(dragTarget.y * 100)}%`;
      } else if (dragTargetType === 'graphic') {
        const pctX = Math.round(dragTarget.x * 100);
        const pctY = Math.round(dragTarget.y * 100);
        if (UI.graphicPosX) UI.graphicPosX.value = pctX;
        if (UI.graphicPosXVal) UI.graphicPosXVal.innerText = `${pctX}%`;
        if (UI.graphicPosY) UI.graphicPosY.value = pctY;
        if (UI.graphicPosYVal) UI.graphicPosYVal.innerText = `${pctY}%`;
      } else if (dragTargetType === 'video') {
        if (UI.videoPosX) UI.videoPosX.value = dragTarget.x;
        if (UI.videoPosXVal) UI.videoPosXVal.innerText = `${Math.round(dragTarget.x * 100)}%`;
        if (UI.videoPosY) UI.videoPosY.value = dragTarget.y;
        if (UI.videoPosYVal) UI.videoPosYVal.innerText = `${Math.round(dragTarget.y * 100)}%`;
      }

      renderFrame(state.time);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', () => {
      if (isCanvasDragging) {
        isCanvasDragging = false;
        dragTarget = null;
        dragTargetType = null;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isCanvasDragging || !dragTarget) return;
      const rect = UI.mainCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dx = (e.clientX - dragStartMouseX) / rect.width;
      const dy = (e.clientY - dragStartMouseY) / rect.height;

      const clampedX = Math.max(-0.5, Math.min(0.5, dragStartObjX + dx));
      const clampedY = Math.max(-0.5, Math.min(0.5, dragStartObjY + dy));

      dragTarget.x = Math.round(clampedX * 100) / 100;
      dragTarget.y = Math.round(clampedY * 100) / 100;

      if (dragTargetType === 'text') {
        if (UI.textPosX) UI.textPosX.value = dragTarget.x;
        if (UI.textPosXVal) UI.textPosXVal.innerText = `${Math.round(dragTarget.x * 100)}%`;
        if (UI.textPosY) UI.textPosY.value = dragTarget.y;
        if (UI.textPosYVal) UI.textPosYVal.innerText = `${Math.round(dragTarget.y * 100)}%`;
      } else if (dragTargetType === 'graphic') {
        const pctX = Math.round(dragTarget.x * 100);
        const pctY = Math.round(dragTarget.y * 100);
        if (UI.graphicPosX) UI.graphicPosX.value = pctX;
        if (UI.graphicPosXVal) UI.graphicPosXVal.innerText = `${pctX}%`;
        if (UI.graphicPosY) UI.graphicPosY.value = pctY;
        if (UI.graphicPosYVal) UI.graphicPosYVal.innerText = `${pctY}%`;
      } else if (dragTargetType === 'video') {
        if (UI.videoPosX) UI.videoPosX.value = dragTarget.x;
        if (UI.videoPosXVal) UI.videoPosXVal.innerText = `${Math.round(dragTarget.x * 100)}%`;
        if (UI.videoPosY) UI.videoPosY.value = dragTarget.y;
        if (UI.videoPosYVal) UI.videoPosYVal.innerText = `${Math.round(dragTarget.y * 100)}%`;
      }

      renderFrame(state.time);
    });

    window.addEventListener('mouseup', () => {
      if (isCanvasDragging) {
        isCanvasDragging = false;
        dragTarget = null;
        dragTargetType = null;
        UI.mainCanvas.style.cursor = '';
      }
    });
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
    updateTimelineTracks();
    ImageProcessor.renderActiveImageLayersPreview();
  });

  // Toggle Switches Bindings
  UI.glitchEnabled.addEventListener('change', (e) => {
    HistoryManager.pushState('Toggle Glitch');
    state.glitchEnabled = e.target.checked;
    updateGlitchTriggerButtonState();
  });

  if (UI.glitchMonochrome) {
    UI.glitchMonochrome.addEventListener('change', (e) => {
      HistoryManager.pushState('Toggle Monochrome Glitch');
      state.glitchMonochrome = e.target.checked;
      renderFrame(state.time);
    });
  }

  const bindGlitchCheckbox = (elem, stateKey) => {
    if (elem) {
      elem.addEventListener('change', (e) => {
        HistoryManager.pushState(`Toggle ${stateKey}`);
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
  bindGlitchCheckbox(UI.glitchStyleFlicker, 'glitchStyleFlicker');
  bindGlitchCheckbox(UI.glitchFlickerHighlights, 'glitchFlickerHighlightsOnly');

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
    HistoryManager.pushState('Change Mask Type');
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
      if (UI.fpsValue) UI.fpsValue.innerText = 'IDLE';
      stopAudioSource();
    }
    if (state.videoBlocks && state.videoBlocks.length > 0) {
      syncVideoPlayback();
    }
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  });

  function stepFrame(direction = 1) {
    if (state.uploadedImages.length === 0 || state.layers.length === 0) return;

    if (state.isPlaying) {
      state.isPlaying = false;
      UI.btnPlayPause.classList.remove('active');
      UI.playPauseIcon.setAttribute('data-lucide', 'play');
      if (UI.fpsValue) UI.fpsValue.innerText = 'IDLE';
      stopAudioSource();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    const fps = state.exportFps || 30;
    const stepDelta = 1 / fps;
    const dur = getTimelineDuration();

    state.prevTime = state.time;
    state.time += direction * stepDelta;

    if (state.time >= dur) {
      state.time = state.time % dur;
    } else if (state.time < 0) {
      state.time = (state.time % dur + dur) % dur;
    }

    if (state.glitchEnabled) {
      GlitchManager.update(stepDelta);
    }

    updatePlayhead();
    renderFrame(state.time);
    if (state.videoBlocks && state.videoBlocks.length > 0) {
      syncVideoPlayback();
    }
  }

  if (UI.btnStep) {
    UI.btnStep.addEventListener('click', () => stepFrame(1));
  }
  if (UI.btnStepBack) {
    UI.btnStepBack.addEventListener('click', () => stepFrame(-1));
  }
  if (UI.btnTimelineStepForward) {
    UI.btnTimelineStepForward.addEventListener('click', () => stepFrame(1));
  }
  if (UI.btnTimelineStepBack) {
    UI.btnTimelineStepBack.addEventListener('click', () => stepFrame(-1));
  }
  if (UI.btnSnapshotPng) {
    UI.btnSnapshotPng.addEventListener('click', () => VideoExporter.exportCurrentFramePNG());
  }
  if (UI.btnTimelineSnapshotPng) {
    UI.btnTimelineSnapshotPng.addEventListener('click', () => VideoExporter.exportCurrentFramePNG());
  }
  if (UI.btnExportFramePng) {
    UI.btnExportFramePng.addEventListener('click', () => VideoExporter.exportCurrentFramePNG());
  }

  UI.btnManualGlitch.addEventListener('click', () => {
    GlitchManager.triggerGlitch();
  });

  UI.btnToggleGrid.addEventListener('click', () => {
    state.gridActive = !state.gridActive;
    UI.btnToggleGrid.classList.toggle('active', state.gridActive);
    UI.mainCanvas.parentElement.classList.toggle('composition-grid', state.gridActive);
  });

  // Viewport Canvas Backdrop Brightness (Black -> Grey for dark video visibility; does not affect export)
  const viewportBgSlider = document.getElementById('viewport-bg-brightness');
  const viewportAreaEl = document.querySelector('.viewport-area');
  const applyViewportBgBrightness = (pct) => {
    const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
    const v = Math.round((clamped / 100) * 200);
    if (viewportAreaEl) {
      viewportAreaEl.style.background = `rgb(${v}, ${v}, ${v})`;
    }
    if (UI.mainCanvas) {
      UI.mainCanvas.style.borderColor = clamped > 55
        ? 'rgba(0, 0, 0, 0.45)'
        : 'rgba(255, 255, 255, 0.28)';
    }
  };
  if (viewportBgSlider) {
    const savedBg = localStorage.getItem('vilecut_viewport_bg');
    const initialBg = savedBg !== null ? parseInt(savedBg, 10) : 18;
    viewportBgSlider.value = initialBg;
    applyViewportBgBrightness(initialBg);
    viewportBgSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      applyViewportBgBrightness(val);
      localStorage.setItem('vilecut_viewport_bg', String(val));
    });
  }

  UI.btnResetView.addEventListener('click', () => {
    resetSettingsToDefaults({ keepOverlays: true });
  });

  if (UI.btnInfoModal) {
    UI.btnInfoModal.addEventListener('click', () => {
      UI.infoOverlay.classList.remove('hidden');
    });
  }

  if (UI.btnCloseInfo) {
    UI.btnCloseInfo.addEventListener('click', () => {
      UI.infoOverlay.classList.add('hidden');
    });
  }

  if (UI.infoOverlay) {
    UI.infoOverlay.addEventListener('click', (e) => {
      if (e.target === UI.infoOverlay) {
        UI.infoOverlay.classList.add('hidden');
      }
    });
  }
  if (UI.btnReloadApp) {
    UI.btnReloadApp.addEventListener('click', () => {
      location.reload();
    });
  }

  if (UI.btnResetSettingsOnly) {
    UI.btnResetSettingsOnly.addEventListener('click', () => {
      resetSettingsToDefaults({ keepOverlays: false });
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
    HistoryManager.pushState('Change Aspect Ratio');
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
    const oldSpeed = state.cameraRotation;
    const newSpeed = parseInt(e.target.value);
    state.cameraRotationBase += (oldSpeed - newSpeed) * state.time * (Math.PI / 180);
    state.cameraRotation = newSpeed;
    UI.cameraRotationVal.innerText = `${state.cameraRotation.toFixed(1)}°/s`;
  });

  UI.btnResetRotation.addEventListener('click', () => {
    state.cameraRotation = 0;
    state.cameraRotationBase = 0;
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
    HistoryManager.pushState('Change Mirror Mode');
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

  // --- Micro-Geometric & Pixel FX Bindings ---
  if (UI.geometricEnabled) {
    UI.geometricEnabled.addEventListener('change', (e) => {
      HistoryManager.pushState('Toggle Geometric FX');
      state.geometricEnabled = e.target.checked;
      renderFrame(state.time);
    });
  }

  const geoCurtainControls = document.getElementById('geo-curtain-controls');
  if (UI.geoCurtainActive) {
    UI.geoCurtainActive.addEventListener('change', (e) => {
      HistoryManager.pushState('Toggle Edge Curtain');
      state.geoCurtainActive = e.target.checked;
      if (geoCurtainControls) geoCurtainControls.style.display = e.target.checked ? 'block' : 'none';
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainDirection) {
    UI.geoCurtainDirection.addEventListener('change', (e) => {
      state.geoCurtainDirection = e.target.value;
      if (UI.geoCurtainAngleGroup) {
        UI.geoCurtainAngleGroup.style.display = (e.target.value === 'custom') ? 'block' : 'none';
      }
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainAngle) {
    UI.geoCurtainAngle.addEventListener('input', (e) => {
      state.geoCurtainAngle = parseInt(e.target.value);
      if (UI.geoCurtainAngleVal) UI.geoCurtainAngleVal.innerText = `${state.geoCurtainAngle}°`;
      if (UI.geoCurtainDirection && UI.geoCurtainDirection.value !== 'custom') {
        UI.geoCurtainDirection.value = 'custom';
        state.geoCurtainDirection = 'custom';
      }
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainBidirectional) {
    UI.geoCurtainBidirectional.addEventListener('change', (e) => {
      state.geoCurtainBidirectional = e.target.checked;
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainMultiEdge) {
    UI.geoCurtainMultiEdge.addEventListener('change', (e) => {
      state.geoCurtainMultiEdge = e.target.checked;
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainLumTrigger) {
    UI.geoCurtainLumTrigger.addEventListener('change', (e) => {
      state.geoCurtainLumTrigger = e.target.value;
      if (UI.geoCurtainLumGateGroup) {
        UI.geoCurtainLumGateGroup.style.display = (e.target.value === 'custom') ? 'block' : 'none';
      }
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainMinLum) {
    UI.geoCurtainMinLum.addEventListener('input', (e) => {
      state.geoCurtainMinLum = parseInt(e.target.value);
      if (UI.geoCurtainMinLumVal) UI.geoCurtainMinLumVal.innerText = `${state.geoCurtainMinLum}%`;
      if (UI.geoCurtainLumTrigger && UI.geoCurtainLumTrigger.value !== 'custom') {
        UI.geoCurtainLumTrigger.value = 'custom';
        state.geoCurtainLumTrigger = 'custom';
        if (UI.geoCurtainLumGateGroup) UI.geoCurtainLumGateGroup.style.display = 'block';
      }
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainMaxLum) {
    UI.geoCurtainMaxLum.addEventListener('input', (e) => {
      state.geoCurtainMaxLum = parseInt(e.target.value);
      if (UI.geoCurtainMaxLumVal) UI.geoCurtainMaxLumVal.innerText = `${state.geoCurtainMaxLum}%`;
      if (UI.geoCurtainLumTrigger && UI.geoCurtainLumTrigger.value !== 'custom') {
        UI.geoCurtainLumTrigger.value = 'custom';
        state.geoCurtainLumTrigger = 'custom';
        if (UI.geoCurtainLumGateGroup) UI.geoCurtainLumGateGroup.style.display = 'block';
      }
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainColorMode) {
    UI.geoCurtainColorMode.addEventListener('change', (e) => {
      state.geoCurtainColorMode = e.target.value;
      if (UI.geoCurtainTintGroup) {
        UI.geoCurtainTintGroup.style.display = (e.target.value === 'tint') ? 'block' : 'none';
      }
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainTintColor) {
    UI.geoCurtainTintColor.addEventListener('input', (e) => {
      state.geoCurtainTintColor = e.target.value;
      renderFrame(state.time);
    });
  }
  document.querySelectorAll('.geo-curtain-swatch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.currentTarget.getAttribute('data-color');
      state.geoCurtainTintColor = color;
      if (UI.geoCurtainTintColor) UI.geoCurtainTintColor.value = color;
      renderFrame(state.time);
    });
  });
  if (UI.geoCurtainLumMod) {
    UI.geoCurtainLumMod.addEventListener('input', (e) => {
      state.geoCurtainLumMod = parseInt(e.target.value);
      if (UI.geoCurtainLumModVal) UI.geoCurtainLumModVal.innerText = `${state.geoCurtainLumMod}%`;
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainOriginDot) {
    UI.geoCurtainOriginDot.addEventListener('change', (e) => {
      state.geoCurtainOriginDot = e.target.checked;
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainLength) {
    UI.geoCurtainLength.addEventListener('input', (e) => {
      state.geoCurtainLength = parseInt(e.target.value);
      if (UI.geoCurtainLengthVal) UI.geoCurtainLengthVal.innerText = `${state.geoCurtainLength}%`;
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainDensity) {
    UI.geoCurtainDensity.addEventListener('input', (e) => {
      state.geoCurtainDensity = parseInt(e.target.value);
      if (UI.geoCurtainDensityVal) UI.geoCurtainDensityVal.innerText = `${state.geoCurtainDensity}%`;
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainThreshold) {
    UI.geoCurtainThreshold.addEventListener('input', (e) => {
      state.geoCurtainThreshold = parseInt(e.target.value);
      if (UI.geoCurtainThresholdVal) UI.geoCurtainThresholdVal.innerText = `${state.geoCurtainThreshold}`;
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainFlicker) {
    UI.geoCurtainFlicker.addEventListener('input', (e) => {
      state.geoCurtainFlicker = parseInt(e.target.value);
      if (UI.geoCurtainFlickerVal) UI.geoCurtainFlickerVal.innerText = `${state.geoCurtainFlicker}%`;
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainOpacity) {
    UI.geoCurtainOpacity.addEventListener('input', (e) => {
      state.geoCurtainOpacity = parseInt(e.target.value);
      if (UI.geoCurtainOpacityVal) UI.geoCurtainOpacityVal.innerText = `${state.geoCurtainOpacity}%`;
      renderFrame(state.time);
    });
  }
  if (UI.geoCurtainBlend) {
    UI.geoCurtainBlend.addEventListener('change', (e) => {
      state.geoCurtainBlend = e.target.value;
      renderFrame(state.time);
    });
  }

  // Module B: Micro-HUD Geometry Nodes
  const geoNodesControls = document.getElementById('geo-nodes-controls');
  if (UI.geoNodesActive) {
    UI.geoNodesActive.addEventListener('change', (e) => {
      HistoryManager.pushState('Toggle Geometry Nodes');
      state.geoNodesActive = e.target.checked;
      if (geoNodesControls) geoNodesControls.style.display = e.target.checked ? 'block' : 'none';
      renderFrame(state.time);
    });
  }
  if (UI.geoNodeShape) {
    UI.geoNodeShape.addEventListener('change', (e) => {
      state.geoNodeShape = e.target.value;
      renderFrame(state.time);
    });
  }
  if (UI.geoNodeDensity) {
    UI.geoNodeDensity.addEventListener('input', (e) => {
      state.geoNodeDensity = parseInt(e.target.value);
      if (UI.geoNodeDensityVal) UI.geoNodeDensityVal.innerText = `${state.geoNodeDensity}%`;
      renderFrame(state.time);
    });
  }
  if (UI.geoNodeSize) {
    UI.geoNodeSize.addEventListener('input', (e) => {
      state.geoNodeSize = parseInt(e.target.value);
      if (UI.geoNodeSizeVal) UI.geoNodeSizeVal.innerText = `${state.geoNodeSize}px`;
      renderFrame(state.time);
    });
  }
  if (UI.geoNodeColor) {
    UI.geoNodeColor.addEventListener('input', (e) => {
      state.geoNodeColor = e.target.value;
      renderFrame(state.time);
    });
  }
  document.querySelectorAll('.geo-node-swatch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.currentTarget.getAttribute('data-color');
      state.geoNodeColor = color;
      if (UI.geoNodeColor) UI.geoNodeColor.value = color;
      renderFrame(state.time);
    });
  });

  // Module C: Topographic Contours
  const geoContoursControls = document.getElementById('geo-contours-controls');
  if (UI.geoContoursActive) {
    UI.geoContoursActive.addEventListener('change', (e) => {
      HistoryManager.pushState('Toggle Contours');
      state.geoContoursActive = e.target.checked;
      if (geoContoursControls) geoContoursControls.style.display = e.target.checked ? 'block' : 'none';
      renderFrame(state.time);
    });
  }
  if (UI.geoContourLevels) {
    UI.geoContourLevels.addEventListener('input', (e) => {
      state.geoContourLevels = parseInt(e.target.value);
      if (UI.geoContourLevelsVal) UI.geoContourLevelsVal.innerText = `${state.geoContourLevels}`;
      renderFrame(state.time);
    });
  }
  if (UI.geoContourOpacity) {
    UI.geoContourOpacity.addEventListener('input', (e) => {
      state.geoContourOpacity = parseInt(e.target.value);
      if (UI.geoContourOpacityVal) UI.geoContourOpacityVal.innerText = `${state.geoContourOpacity}%`;
      renderFrame(state.time);
    });
  }
  if (UI.geoContourColor) {
    UI.geoContourColor.addEventListener('input', (e) => {
      state.geoContourColor = e.target.value;
      renderFrame(state.time);
    });
  }
  document.querySelectorAll('.geo-contour-swatch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.currentTarget.getAttribute('data-color');
      state.geoContourColor = color;
      if (UI.geoContourColor) UI.geoContourColor.value = color;
      renderFrame(state.time);
    });
  });

  // Vintage VHS & Analog Camcorder FX Bindings
  if (UI.vhsEnabled) {
    UI.vhsEnabled.addEventListener('change', (e) => {
      HistoryManager.pushState('Toggle VHS FX');
      state.vhsEnabled = e.target.checked;
      const vhsControls = document.getElementById('vhs-controls-container');
      if (vhsControls) vhsControls.style.opacity = state.vhsEnabled ? '1.0' : '0.6';
      renderFrame(state.time);
    });
  }

  if (UI.vhsPreset) {
    UI.vhsPreset.addEventListener('change', (e) => {
      HistoryManager.pushState('Change VHS Preset');
      VhsFxManager.applyPreset(e.target.value);
      syncUIFromState();
      renderFrame(state.time);
    });
  }

  if (UI.vhsScope) {
    UI.vhsScope.addEventListener('change', (e) => {
      state.vhsScope = e.target.value;
      renderFrame(state.time);
    });
  }

  const vhsSliders = [
    { el: UI.vhsTapeCrease, val: UI.vhsTapeCreaseVal, prop: 'vhsTapeCrease' },
    { el: UI.vhsTrackingNoise, val: UI.vhsTrackingNoiseVal, prop: 'vhsTrackingNoise' },
    { el: UI.vhsVerticalJump, val: UI.vhsVerticalJumpVal, prop: 'vhsVerticalJump' },
    { el: UI.vhsDegradationBlur, val: UI.vhsDegradationBlurVal, prop: 'vhsDegradationBlur' },
    { el: UI.vhsDegradationOpacity, val: UI.vhsDegradationOpacityVal, prop: 'vhsDegradationOpacity' },
    { el: UI.vhsWobble, val: UI.vhsWobbleVal, prop: 'vhsWobble' },
    { el: UI.vhsSoftness, val: UI.vhsSoftnessVal, prop: 'vhsSoftness' },
    { el: UI.vhsScanlines, val: UI.vhsScanlinesVal, prop: 'vhsScanlines' },
    { el: UI.vhsScanlineBlur, val: UI.vhsScanlineBlurVal, prop: 'vhsScanlineBlur' },
    { el: UI.vhsChromaBleed, val: UI.vhsChromaBleedVal, prop: 'vhsChromaBleed' },
    { el: UI.vhsGrain, val: UI.vhsGrainVal, prop: 'vhsGrain' },
    { el: UI.vhsColorDecay, val: UI.vhsColorDecayVal, prop: 'vhsColorDecay' }
  ];

  vhsSliders.forEach(({ el, val, prop }) => {
    if (el) {
      el.addEventListener('input', (e) => {
        const num = parseInt(e.target.value);
        state[prop] = num;
        if (val) val.innerText = `${num}%`;
        state.vhsPreset = 'custom';
        if (UI.vhsPreset) UI.vhsPreset.value = 'custom';
        renderFrame(state.time);
      });
    }
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
    setProjectDuration(parseInt(e.target.value));
  });

  UI.timelineDurationSlider.addEventListener('input', (e) => {
    setProjectDuration(parseInt(e.target.value));
  });

  if (UI.timelineDurationInput) {
    const applyTimelineInput = () => {
      const parsed = parseDurationInput(UI.timelineDurationInput.value);
      if (parsed) {
        setProjectDuration(parsed);
      }
      UI.timelineDurationInput.value = formatTimecode(state.exportDuration);
    };
    UI.timelineDurationInput.addEventListener('change', applyTimelineInput);
    UI.timelineDurationInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyTimelineInput();
        UI.timelineDurationInput.blur();
      }
    });
  }

  if (UI.exportDurationInput) {
    const applyExportInput = () => {
      const parsed = parseDurationInput(UI.exportDurationInput.value);
      if (parsed) {
        setProjectDuration(parsed);
      }
      UI.exportDurationInput.value = formatTimecode(state.exportDuration);
    };
    UI.exportDurationInput.addEventListener('change', applyExportInput);
    UI.exportDurationInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyExportInput();
        UI.exportDurationInput.blur();
      }
    });
  }

  const matchSongDuration = () => {
    if (state.audioTrack && state.audioTrack.duration) {
      setProjectDuration(state.audioTrack.duration);
    }
  };

  if (UI.btnMatchSongDuration) {
    UI.btnMatchSongDuration.addEventListener('click', matchSongDuration);
  }
  if (UI.btnExportMatchSong) {
    UI.btnExportMatchSong.addEventListener('click', matchSongDuration);
  }
  if (UI.btnSyncTimelineToAudio) {
    UI.btnSyncTimelineToAudio.addEventListener('click', matchSongDuration);
  }

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
      if (state.exportFormat === 'gif') {
        if (UI.exportFps && UI.exportFps.value === '60') {
          UI.exportFps.value = '24';
          state.exportFps = 24;
        }
        if (UI.exportResolution && UI.exportResolution.value === '1080') {
          UI.exportResolution.value = '720';
        }
      }
      updateExportFormatVisibility();
      updateExportEstimate();
    });
  }

  if (UI.exportFps) {
    UI.exportFps.addEventListener('change', (e) => {
      state.exportFps = parseInt(e.target.value) || 30;
      updateExportEstimate();
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

  // Video Export Bitrate & Quality Bindings
  if (UI.exportBitrate) {
    UI.exportBitrate.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.exportBitrateMbps = val;
      updateBitrateDisplay(val);
    });
  }

  if (UI.btnBitratePresets) {
    UI.btnBitratePresets.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.bitrate, 10);
        if (UI.exportBitrate) UI.exportBitrate.value = val;
        state.exportBitrateMbps = val;
        updateBitrateDisplay(val);
      });
    });
  }

  // Video Export Click Bindings
  UI.btnExportVideo.addEventListener('click', () => {
    state.exportFps = parseInt(UI.exportFps.value);
    VideoExporter.export();
  });

  UI.btnCancelExport.addEventListener('click', () => {
    state.exportCancel = true;
  });

  // --- TEXT OVERLAYS & TIMELINE EVENTS BINDINGS ---
  const maxTextBlocks = state.isDangerZone ? 300 : 50;

  UI.btnAddTextNew.addEventListener('click', () => {
    if (state.texts.length >= maxTextBlocks) {
      alert(`Maximum limit of ${maxTextBlocks} text overlay blocks reached.`);
      return;
    }

    HistoryManager.pushState('Add Text Track');

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
      id: 'txt_' + generateUUID(),
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
      endTime: duration,
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

    if (state.texts.length >= maxTextBlocks) {
      alert(`Maximum limit of ${maxTextBlocks} text overlay blocks reached.`);
      return;
    }

    HistoryManager.pushState('Add Text to Track');

    const duration = getTimelineDuration();
    let startTime = state.time;
    if (startTime >= duration - 0.2) {
      startTime = Math.max(0, duration - 3.0);
    }
    const endTime = Math.min(duration, startTime + 3.0);

    const targetTrackIdx = selectedTxt.trackIndex !== undefined ? selectedTxt.trackIndex : 0;

    const newText = {
      id: 'txt_' + generateUUID(),
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

    if (state.texts.length >= maxTextBlocks) {
      alert(`Maximum limit of ${maxTextBlocks} text overlay blocks reached.`);
      return;
    }

    HistoryManager.pushState('Duplicate Text');

    const duration = getTimelineDuration();
    let startTime = selectedTxt.endTime;
    if (startTime >= duration - 0.2) {
      startTime = 0.0;
    }
    const blockDuration = selectedTxt.endTime - selectedTxt.startTime;
    const endTime = Math.min(duration, startTime + blockDuration);

    const clonedText = {
      ...selectedTxt,
      id: 'txt_' + generateUUID(),
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
      HistoryManager.pushState('Delete Text');
      state.texts.splice(index, 1);
      selectText(null);
      updateTimelineTracks();
      renderFrame(state.time);
    }
  });

  // --- LYRIC VIDEO GENERATOR BINDINGS ---
  const DEMO_METAL_LRC = `[ti:Cybernetic Storm]
[ar:Danger Zone Syndicate]
[al:VileCut 10-Minute Engine]
[00:03.00]Systems online, circuits alive
[00:06.50]Diving through the glitch in forty-five
[00:10.00]Neon pulses tearing through the wire
[00:14.20]A digital tempest of crimson and fire
[00:18.50]Static screams across the frequency
[00:22.80]Fractured frames in hyper-velocity
[00:27.00]No safety limits, danger unleashed
[00:31.50]Ten minutes of render into the beast
[00:36.00]Bass drop shuddering the screen
[00:40.50]The darkest cut that you've ever seen`;

  const renderLyricsPreviewList = (blocks) => {
    if (!UI.lyricsPreviewList || !blocks) return;
    UI.lyricsPreviewList.innerHTML = '';
    const previewCount = Math.min(8, blocks.length);
    for (let i = 0; i < previewCount; i++) {
      const b = blocks[i];
      const formatTime = (s) => {
        const mins = Math.floor(s / 60);
        const secs = (s % 60).toFixed(1).padStart(4, '0');
        return `${mins}:${secs}`;
      };
      const item = document.createElement('div');
      item.className = 'lyrics-preview-entry';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'lyrics-preview-time';
      timeSpan.textContent = `[${formatTime(b.startTime)} → ${formatTime(b.endTime)}]`;

      const textSpan = document.createElement('span');
      textSpan.className = 'lyrics-preview-text';
      textSpan.textContent = b.text;

      item.appendChild(timeSpan);
      item.appendChild(textSpan);
      UI.lyricsPreviewList.appendChild(item);
    }

    if (blocks.length > previewCount) {
      const more = document.createElement('div');
      more.className = 'lyrics-preview-entry';
      more.style.color = '#94a3b8';
      more.style.fontStyle = 'italic';
      more.textContent = `... and ${blocks.length - previewCount} more lines`;
      UI.lyricsPreviewList.appendChild(more);
    }
  };

  const loadLyricsContent = (fileName, content) => {
    try {
      const result = LyricsManager.parseFile(fileName, content);
      if (!result.blocks || result.blocks.length === 0) {
        alert('No valid lyrics or timestamps could be parsed from this file.');
        return;
      }

      if (UI.lyricsUppercase && UI.lyricsUppercase.checked) {
        result.blocks.forEach(b => { if (b.text) b.text = b.text.toUpperCase(); });
      }

      LyricsManager.pendingLyrics = result.blocks;
      LyricsManager.pendingFileName = fileName;

      if (UI.lyricsSummaryText) {
        UI.lyricsSummaryText.innerText = `Detected ${result.format} format: ${result.blocks.length} lines parsed from "${fileName}".`;
      }

      renderLyricsPreviewList(result.blocks);

      if (UI.lyricsStylePreviewSample && result.blocks.length > 0) {
        UI.lyricsStylePreviewSample.innerText = result.blocks[0].text;
      }
      updateLyricsStylePreview();

      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
      console.error('Error parsing lyrics file:', err);
      alert('Failed to parse lyrics file: ' + err.message);
    }
  };

  const updateLyricsStylePreview = () => {
    if (!UI.lyricsStylePreviewSample) return;
    const font = UI.lyricsFont ? UI.lyricsFont.value : 'Outfit';
    const size = UI.lyricsSize ? parseFloat(UI.lyricsSize.value) : 38;
    const color = UI.lyricsColor ? UI.lyricsColor.value : '#00f2fe';
    const glitch = UI.lyricsGlitch ? UI.lyricsGlitch.value : 'none';
    const transition = UI.lyricsTransition ? UI.lyricsTransition.value : 'fade-blur';
    const position = UI.lyricsPosition ? UI.lyricsPosition.value : 'lower-third';

    UI.lyricsStylePreviewSample.style.fontFamily = `"${font}", sans-serif`;

    const previewPx = Math.max(16, Math.min(46, Math.round(size * 0.82)));
    UI.lyricsStylePreviewSample.style.fontSize = `${previewPx}px`;
    UI.lyricsStylePreviewSample.style.color = color;

    const isCaps = UI.lyricsUppercase ? UI.lyricsUppercase.checked : false;
    UI.lyricsStylePreviewSample.style.textTransform = isCaps ? 'uppercase' : 'none';

    if (glitch === 'rgb-split') {
      UI.lyricsStylePreviewSample.style.textShadow = `-3px 0 #ff0055, 3px 0 #00f2fe, 0 0 14px ${color}88, 0 2px 4px #000`;
      UI.lyricsStylePreviewSample.style.letterSpacing = '0.04em';
    } else if (glitch === 'flicker') {
      UI.lyricsStylePreviewSample.style.textShadow = `0 0 22px ${color}, 0 0 8px ${color}, 0 2px 4px #000`;
      UI.lyricsStylePreviewSample.style.letterSpacing = '0.02em';
    } else if (glitch === 'scramble') {
      UI.lyricsStylePreviewSample.style.textShadow = `0 0 10px ${color}aa, 2px 2px 0 #ff0055`;
      UI.lyricsStylePreviewSample.style.letterSpacing = '0.07em';
    } else if (glitch === 'chaos') {
      UI.lyricsStylePreviewSample.style.textShadow = `2px -2px 0 #ffe600, -2px 2px 0 #00f2fe, 0 0 12px ${color}`;
      UI.lyricsStylePreviewSample.style.letterSpacing = '0.05em';
    } else {
      UI.lyricsStylePreviewSample.style.textShadow = `0 0 12px ${color}66, 0 2px 4px rgba(0,0,0,0.9)`;
      UI.lyricsStylePreviewSample.style.letterSpacing = 'normal';
    }

    if (UI.lyricsPreviewFontLabel) {
      UI.lyricsPreviewFontLabel.innerText = `${font} • ${size}px`;
    }
    if (UI.lyricsStylePreviewSub) {
      const posLabel = position === 'lower-third' ? 'Lower Third (+35%)' : position === 'bottom' ? 'Bottom (+42%)' : position === 'center' ? 'Center (0%)' : 'Top (-35%)';
      const transOption = UI.lyricsTransition?.selectedOptions?.[0]?.text || transition;
      const glitchOption = UI.lyricsGlitch?.selectedOptions?.[0]?.text || glitch;
      UI.lyricsStylePreviewSub.innerText = `Position: ${posLabel} • Transition: ${transOption} • FX: ${glitchOption}`;
    }
  };

  const syncAvailableFontsToLyrics = () => {
    if (!UI.textFont || !UI.lyricsFont) return;
    const lyricsValues = new Set(Array.from(UI.lyricsFont.options).map(o => o.value));
    Array.from(UI.textFont.options).forEach(opt => {
      if (!lyricsValues.has(opt.value)) {
        const newOpt = document.createElement('option');
        newOpt.value = opt.value;
        newOpt.innerText = opt.innerText;
        newOpt.style.fontFamily = `"${opt.value}", sans-serif`;
        UI.lyricsFont.appendChild(newOpt);
      }
    });
  };

  if (UI.btnImportLyrics) {
    UI.btnImportLyrics.addEventListener('click', () => {
      if (UI.lyricsModalOverlay) {
        syncAvailableFontsToLyrics();
        updateLyricsStylePreview();
        UI.lyricsModalOverlay.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }

  if (UI.btnUploadLyricsFont && UI.lyricsFontFileInput) {
    UI.btnUploadLyricsFont.addEventListener('click', () => {
      UI.lyricsFontFileInput.click();
    });
  }

  if (UI.lyricsFontFileInput) {
    UI.lyricsFontFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const rawName = file.name.replace(/\.[^/.]+$/, '').trim();
      const fontName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_');

      try {
        const arrayBuffer = await file.arrayBuffer();
        const fontFace = new FontFace(fontName, arrayBuffer);
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);

        let exists = false;
        for (let i = 0; i < UI.lyricsFont.options.length; i++) {
          if (UI.lyricsFont.options[i].value === fontName) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          const opt = document.createElement('option');
          opt.value = fontName;
          opt.innerText = `${fontName} (Uploaded)`;
          opt.style.fontFamily = `"${fontName}", sans-serif`;
          UI.lyricsFont.appendChild(opt);
        }
        UI.lyricsFont.value = fontName;

        if (UI.textFont) {
          let textOptExists = false;
          for (let i = 0; i < UI.textFont.options.length; i++) {
            if (UI.textFont.options[i].value === fontName) {
              textOptExists = true;
              break;
            }
          }
          if (!textOptExists) {
            const mainOpt = document.createElement('option');
            mainOpt.value = fontName;
            mainOpt.innerText = `${fontName} (Uploaded)`;
            mainOpt.style.fontFamily = `"${fontName}", sans-serif`;
            UI.textFont.appendChild(mainOpt);
          }
        }

        if (UI.lyricsFontUploadedBadge && UI.lyricsFontUploadedName) {
          UI.lyricsFontUploadedBadge.style.display = 'inline-flex';
          UI.lyricsFontUploadedName.innerText = `Custom font loaded: ${fontName}`;
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        updateLyricsStylePreview();
      } catch (err) {
        console.error('Failed to load custom font:', err);
        alert('Failed to load custom font: ' + err.message);
      } finally {
        e.target.value = '';
      }
    });
  }

  if (UI.lyricsFont) UI.lyricsFont.addEventListener('change', updateLyricsStylePreview);
  if (UI.lyricsColor) UI.lyricsColor.addEventListener('input', updateLyricsStylePreview);
  if (UI.lyricsPosition) UI.lyricsPosition.addEventListener('change', updateLyricsStylePreview);
  if (UI.lyricsTransition) UI.lyricsTransition.addEventListener('change', updateLyricsStylePreview);
  if (UI.lyricsGlitch) UI.lyricsGlitch.addEventListener('change', updateLyricsStylePreview);

  if (UI.btnLyricsToCaps) {
    UI.btnLyricsToCaps.addEventListener('click', () => {
      if (LyricsManager.pendingLyrics && LyricsManager.pendingLyrics.length > 0) {
        LyricsManager.pendingLyrics.forEach(b => {
          if (b.text) b.text = b.text.toUpperCase();
        });
        renderLyricsPreviewList(LyricsManager.pendingLyrics);
        if (UI.lyricsStylePreviewSample) {
          UI.lyricsStylePreviewSample.innerText = (LyricsManager.pendingLyrics[0]?.text || '').toUpperCase();
        }
      } else if (UI.lyricsStylePreviewSample) {
        UI.lyricsStylePreviewSample.innerText = UI.lyricsStylePreviewSample.innerText.toUpperCase();
      }
      if (UI.lyricsUppercase) {
        UI.lyricsUppercase.checked = true;
      }
      updateLyricsStylePreview();
    });
  }

  if (UI.lyricsUppercase) {
    UI.lyricsUppercase.addEventListener('change', () => {
      if (UI.lyricsUppercase.checked && LyricsManager.pendingLyrics) {
        LyricsManager.pendingLyrics.forEach(b => { if (b.text) b.text = b.text.toUpperCase(); });
        renderLyricsPreviewList(LyricsManager.pendingLyrics);
        if (UI.lyricsStylePreviewSample && LyricsManager.pendingLyrics.length > 0) {
          UI.lyricsStylePreviewSample.innerText = LyricsManager.pendingLyrics[0].text;
        }
      }
      updateLyricsStylePreview();
    });
  }

  if (UI.btnBrowseLyrics && UI.lyricsFileInput) {
    UI.btnBrowseLyrics.addEventListener('click', () => {
      UI.lyricsFileInput.click();
    });
  }

  if (UI.btnLoadDemoLrc) {
    UI.btnLoadDemoLrc.addEventListener('click', () => {
      loadLyricsContent('demo_metal_storm.lrc', DEMO_METAL_LRC);
    });
  }

  if (UI.lyricsDropArea) {
    UI.lyricsDropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      UI.lyricsDropArea.style.borderColor = 'var(--cyan)';
      UI.lyricsDropArea.style.background = 'rgba(0, 242, 254, 0.08)';
    });
    UI.lyricsDropArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      UI.lyricsDropArea.style.borderColor = 'rgba(255, 230, 0, 0.35)';
      UI.lyricsDropArea.style.background = 'rgba(255, 230, 0, 0.03)';
    });
    UI.lyricsDropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      UI.lyricsDropArea.style.borderColor = 'rgba(255, 230, 0, 0.35)';
      UI.lyricsDropArea.style.background = 'rgba(255, 230, 0, 0.03)';
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          loadLyricsContent(file.name, event.target.result);
        };
        reader.readAsText(file);
      }
    });
  }

  if (UI.lyricsFileInput) {
    UI.lyricsFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        loadLyricsContent(file.name, event.target.result);
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  if (UI.lyricsSize && UI.lyricsSizeVal) {
    UI.lyricsSize.addEventListener('input', () => {
      UI.lyricsSizeVal.innerText = `${UI.lyricsSize.value}px`;
      updateLyricsStylePreview();
    });
  }

  const closeLyricsModal = () => {
    if (UI.lyricsModalOverlay) {
      UI.lyricsModalOverlay.classList.add('hidden');
    }
  };

  if (UI.btnCloseLyricsX) UI.btnCloseLyricsX.addEventListener('click', closeLyricsModal);
  if (UI.btnCancelLyrics) UI.btnCancelLyrics.addEventListener('click', closeLyricsModal);
  if (UI.lyricsModalOverlay) {
    UI.lyricsModalOverlay.addEventListener('click', (e) => {
      if (e.target === UI.lyricsModalOverlay) {
        closeLyricsModal();
      }
    });
  }

  if (UI.btnApplyLyricsClear) {
    UI.btnApplyLyricsClear.addEventListener('click', () => {
      if (!LyricsManager.pendingLyrics || LyricsManager.pendingLyrics.length === 0) return;
      HistoryManager.pushState('Generate Lyrics (Replace)');
      const options = {
        clearExisting: true,
        font: UI.lyricsFont ? UI.lyricsFont.value : 'Outfit',
        size: UI.lyricsSize ? parseFloat(UI.lyricsSize.value) : 38,
        color: UI.lyricsColor ? UI.lyricsColor.value : '#00f2fe',
        position: UI.lyricsPosition ? UI.lyricsPosition.value : 'lower-third',
        transitionMode: UI.lyricsTransition ? UI.lyricsTransition.value : 'fade-blur',
        glitchMode: UI.lyricsGlitch ? UI.lyricsGlitch.value : 'none',
        autoExpandTimeline: UI.lyricsAutoExpand ? UI.lyricsAutoExpand.checked : true,
        allCaps: UI.lyricsUppercase ? UI.lyricsUppercase.checked : false
      };
      LyricsManager.generateLayers(LyricsManager.pendingLyrics, options);
      closeLyricsModal();
    });
  }

  if (UI.btnApplyLyricsAppend) {
    UI.btnApplyLyricsAppend.addEventListener('click', () => {
      if (!LyricsManager.pendingLyrics || LyricsManager.pendingLyrics.length === 0) return;
      HistoryManager.pushState('Generate Lyrics (Append)');
      const options = {
        clearExisting: false,
        font: UI.lyricsFont ? UI.lyricsFont.value : 'Outfit',
        size: UI.lyricsSize ? parseFloat(UI.lyricsSize.value) : 38,
        color: UI.lyricsColor ? UI.lyricsColor.value : '#00f2fe',
        position: UI.lyricsPosition ? UI.lyricsPosition.value : 'lower-third',
        transitionMode: UI.lyricsTransition ? UI.lyricsTransition.value : 'fade-blur',
        glitchMode: UI.lyricsGlitch ? UI.lyricsGlitch.value : 'none',
        autoExpandTimeline: UI.lyricsAutoExpand ? UI.lyricsAutoExpand.checked : true,
        allCaps: UI.lyricsUppercase ? UI.lyricsUppercase.checked : false
      };
      LyricsManager.generateLayers(LyricsManager.pendingLyrics, options);
      closeLyricsModal();
    });
  }

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
        HistoryManager.pushState('Add Graphic Overlay');
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
          id: 'grp_' + generateUUID(),
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
      HistoryManager.pushState('Delete Graphic');
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

        if (state.isDangerZone) {
          const songDur = Math.min(600, Math.max(5, Math.ceil(audioBuffer.duration)));
          setProjectDuration(songDur);
        }

        const songTc = formatTimecode(audioBuffer.duration);
        if (UI.songDurBadge) UI.songDurBadge.innerText = songTc;
        if (UI.exportSongDurBadge) UI.exportSongDurBadge.innerText = songTc;
        if (UI.btnMatchSongDuration) UI.btnMatchSongDuration.style.display = 'inline-flex';
        if (UI.btnExportMatchSong) UI.btnExportMatchSong.style.display = 'inline-flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();

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
    if (UI.btnMatchSongDuration) UI.btnMatchSongDuration.style.display = 'none';
    if (UI.btnExportMatchSong) UI.btnExportMatchSong.style.display = 'none';
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

        let startTime = state.time;
        if (startTime >= dur - 0.2) {
          startTime = Math.max(0, dur - video.duration);
        }

        const newBlock = {
          id: 'vid_' + generateUUID(),
          fileName: file.name,
          file: file,
          url: url,
          element: video,
          duration: video.duration,
          sourceOffset: 0.0,
          startTime: startTime,
          endTime: Math.min(dur, startTime + video.duration),
          monochrome: false,
          mirrorMode: 'none',
          kaleidoscopeSlices: 8,
          brightness: 100,
          contrast: 100,
          scale: 100,
          x: 0.0,
          y: 0.0,
          edgeFade: 0,
          fadeInDuration: 0.0,
          fadeOutDuration: 0.0,
          trackIndex: 0
        };

        state.videoBlocks.push(newBlock);
        selectVideo(newBlock.id);
        UI.canvasLoading.classList.add('hidden');
        resizeMainCanvas();
        updateTimelineTracks();
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
      let startTime = state.time;
      const blockDuration = selectedBlock.endTime - selectedBlock.startTime;
      if (startTime >= dur - 0.2) startTime = Math.max(0, dur - blockDuration);
      const endTime = Math.min(dur, startTime + blockDuration);

      const clonedVideo = document.createElement('video');
      clonedVideo.src = selectedBlock.url;
      clonedVideo.muted = true;
      clonedVideo.playsInline = true;
      clonedVideo.loop = false;

      clonedVideo.addEventListener('loadedmetadata', () => {
        const newBlock = {
          ...selectedBlock,
          id: 'vid_' + generateUUID(),
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

  // Layer Move Up / Down Event Listeners with track swapping
  if (UI.btnVideoMoveUp) {
    UI.btnVideoMoveUp.addEventListener('click', () => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        const oldTrack = block.trackIndex !== undefined ? block.trackIndex : 0;
        const newTrack = oldTrack + 1;
        if (oldTrack === 0) {
          block.trackIndex = 1;
        } else {
          swapTracks(oldTrack, newTrack);
        }
        normalizeTracks();
        updateTimelineTracks();
        renderFrame(state.time);
      }
    });
  }

  if (UI.btnVideoMoveDown) {
    UI.btnVideoMoveDown.addEventListener('click', () => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        const oldTrack = block.trackIndex !== undefined ? block.trackIndex : 0;
        if (oldTrack > 0) {
          const newTrack = oldTrack - 1;
          if (newTrack === 0) {
            block.trackIndex = 0;
          } else {
            swapTracks(oldTrack, newTrack);
          }
          normalizeTracks();
          updateTimelineTracks();
          renderFrame(state.time);
        }
      }
    });
  }

  if (UI.btnTextMoveUp) {
    UI.btnTextMoveUp.addEventListener('click', () => {
      if (!state.selectedTextId) return;
      const block = state.texts.find(t => t.id === state.selectedTextId);
      if (block) {
        const oldTrack = block.trackIndex !== undefined ? block.trackIndex : 0;
        const newTrack = oldTrack + 1;
        const siblings = [
          ...state.texts.filter(t => (t.trackIndex !== undefined ? t.trackIndex : 0) === oldTrack),
          ...state.graphics.filter(g => (g.trackIndex !== undefined ? g.trackIndex : 0) === oldTrack),
          ...(state.videoBlocks ? state.videoBlocks.filter(v => (v.trackIndex !== undefined ? v.trackIndex : 0) === oldTrack) : [])
        ];
        if (siblings.length > 1) {
          block.trackIndex = newTrack;
        } else {
          swapTracks(oldTrack, newTrack);
        }
        normalizeTracks();
        updateTimelineTracks();
        renderFrame(state.time);
      }
    });
  }

  if (UI.btnTextMoveDown) {
    UI.btnTextMoveDown.addEventListener('click', () => {
      if (!state.selectedTextId) return;
      const block = state.texts.find(t => t.id === state.selectedTextId);
      if (block) {
        const oldTrack = block.trackIndex !== undefined ? block.trackIndex : 0;
        if (oldTrack > 1) {
          const newTrack = oldTrack - 1;
          const siblings = [
            ...state.texts.filter(t => (t.trackIndex !== undefined ? t.trackIndex : 0) === oldTrack),
            ...state.graphics.filter(g => (g.trackIndex !== undefined ? g.trackIndex : 0) === oldTrack),
            ...(state.videoBlocks ? state.videoBlocks.filter(v => (v.trackIndex !== undefined ? v.trackIndex : 0) === oldTrack) : [])
          ];
          if (siblings.length > 1) {
            block.trackIndex = newTrack;
          } else {
            swapTracks(oldTrack, newTrack);
          }
          normalizeTracks();
          updateTimelineTracks();
          renderFrame(state.time);
        }
      }
    });
  }

  if (UI.btnGraphicMoveUp) {
    UI.btnGraphicMoveUp.addEventListener('click', () => {
      if (!state.selectedGraphicId) return;
      const block = state.graphics.find(g => g.id === state.selectedGraphicId);
      if (block) {
        const oldTrack = block.trackIndex !== undefined ? block.trackIndex : 0;
        const newTrack = oldTrack + 1;
        const siblings = [
          ...state.texts.filter(t => (t.trackIndex !== undefined ? t.trackIndex : 0) === oldTrack),
          ...state.graphics.filter(g => (g.trackIndex !== undefined ? g.trackIndex : 0) === oldTrack),
          ...(state.videoBlocks ? state.videoBlocks.filter(v => (v.trackIndex !== undefined ? v.trackIndex : 0) === oldTrack) : [])
        ];
        if (siblings.length > 1) {
          block.trackIndex = newTrack;
        } else {
          swapTracks(oldTrack, newTrack);
        }
        normalizeTracks();
        updateTimelineTracks();
        renderFrame(state.time);
      }
    });
  }

  if (UI.btnGraphicMoveDown) {
    UI.btnGraphicMoveDown.addEventListener('click', () => {
      if (!state.selectedGraphicId) return;
      const block = state.graphics.find(g => g.id === state.selectedGraphicId);
      if (block) {
        const oldTrack = block.trackIndex !== undefined ? block.trackIndex : 0;
        if (oldTrack > 1) {
          const newTrack = oldTrack - 1;
          const siblings = [
            ...state.texts.filter(t => (t.trackIndex !== undefined ? t.trackIndex : 0) === oldTrack),
            ...state.graphics.filter(g => (g.trackIndex !== undefined ? g.trackIndex : 0) === oldTrack),
            ...(state.videoBlocks ? state.videoBlocks.filter(v => (v.trackIndex !== undefined ? v.trackIndex : 0) === oldTrack) : [])
          ];
          if (siblings.length > 1) {
            block.trackIndex = newTrack;
          } else {
            swapTracks(oldTrack, newTrack);
          }
          normalizeTracks();
          updateTimelineTracks();
          renderFrame(state.time);
        }
      }
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

  if (UI.videoPosX) {
    UI.videoPosX.addEventListener('input', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.x = parseFloat(e.target.value);
        if (UI.videoPosXVal) {
          UI.videoPosXVal.innerText = `${Math.round(block.x * 100)}%`;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.videoPosY) {
    UI.videoPosY.addEventListener('input', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.y = parseFloat(e.target.value);
        if (UI.videoPosYVal) {
          UI.videoPosYVal.innerText = `${Math.round(block.y * 100)}%`;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.videoScale) {
    UI.videoScale.addEventListener('input', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.scale = parseInt(e.target.value);
        if (UI.videoScaleVal) {
          UI.videoScaleVal.innerText = `${block.scale}%`;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.videoEdgeFade) {
    UI.videoEdgeFade.addEventListener('input', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.edgeFade = parseInt(e.target.value);
        if (UI.videoEdgeFadeVal) {
          UI.videoEdgeFadeVal.innerText = `${block.edgeFade}%`;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.videoFadeIn) {
    UI.videoFadeIn.addEventListener('input', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.fadeInDuration = parseFloat(e.target.value);
        if (UI.videoFadeInVal) {
          UI.videoFadeInVal.innerText = `${block.fadeInDuration.toFixed(1)}s`;
        }
        renderFrame(state.time);
      }
    });
  }

  if (UI.videoFadeOut) {
    UI.videoFadeOut.addEventListener('input', (e) => {
      if (!state.selectedVideoId) return;
      const block = state.videoBlocks.find(v => v.id === state.selectedVideoId);
      if (block) {
        block.fadeOutDuration = parseFloat(e.target.value);
        if (UI.videoFadeOutVal) {
          UI.videoFadeOutVal.innerText = `${block.fadeOutDuration.toFixed(1)}s`;
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

  if (UI.btnTextToCaps) {
    UI.btnTextToCaps.addEventListener('click', () => {
      if (!state.selectedTextId) return;
      const txt = state.texts.find(t => t.id === state.selectedTextId);
      if (txt) {
        HistoryManager.pushState('Text to Uppercase');
        txt.text = (txt.text || '').toUpperCase();
        UI.textContent.value = txt.text;
        updateTimelineTracks();
        renderFrame(state.time);
      }
    });
  }

  if (UI.btnAllTextsToCaps) {
    UI.btnAllTextsToCaps.addEventListener('click', () => {
      if (state.texts.length === 0) return;
      HistoryManager.pushState('All Texts to Uppercase');
      state.texts.forEach(t => {
        if (t.text) t.text = t.text.toUpperCase();
      });
      state.texts = [...state.texts];
      if (state.selectedTextId) {
        const cur = state.texts.find(t => t.id === state.selectedTextId);
        if (cur) UI.textContent.value = cur.text;
      }
      updateTimelineTracks();
      renderFrame(state.time);
    });
  }

  UI.textFont.addEventListener('change', (e) => {
    if (!state.selectedTextId) return;
    const txt = state.texts.find(t => t.id === state.selectedTextId);
    if (txt) {
      HistoryManager.pushState('Change Text Font');
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
  updateBitrateDisplay(state.exportBitrateMbps || 24);
  if (UI.glitchMonochrome) {
    state.glitchMonochrome = UI.glitchMonochrome.checked;
  }
  if (UI.glitchStyleRgbSort) state.glitchStyleRgbSort = UI.glitchStyleRgbSort.checked;
  if (UI.glitchStyleVhs) state.glitchStyleVhs = UI.glitchStyleVhs.checked;
  if (UI.glitchStyleBlock) state.glitchStyleBlock = UI.glitchStyleBlock.checked;
  if (UI.glitchStyleLiquid) state.glitchStyleLiquid = UI.glitchStyleLiquid.checked;
  if (UI.glitchStyleRandom) state.glitchStyleRandom = UI.glitchStyleRandom.checked;
  if (UI.glitchStyleFlicker) state.glitchStyleFlicker = UI.glitchStyleFlicker.checked;
  if (UI.glitchFlickerHighlights) state.glitchFlickerHighlightsOnly = UI.glitchFlickerHighlights.checked;

  // Glitch Trigger bindings
  if (UI.btnAddGlitchTrigger) {
    UI.btnAddGlitchTrigger.addEventListener('click', () => {
      if (state.glitchTriggers.length >= 10) {
        alert("Maximum limit of 10 glitch trigger points reached.");
        return;
      }
      HistoryManager.pushState('Add Glitch Trigger');
      const newTrigger = {
        id: 'gt_' + generateUUID(),
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
        HistoryManager.pushState('Delete Glitch Trigger');
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

  // Handle keyboard shortcuts (Undo/Redo, Spacebar for play/pause, Delete/Backspace for timeline item deletion)
  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isEditableField = activeEl && (
      activeEl.tagName === 'TEXTAREA' ||
      (activeEl.tagName === 'INPUT' && (
        activeEl.type === 'text' ||
        activeEl.type === 'search' ||
        activeEl.type === 'url' ||
        activeEl.type === 'email' ||
        activeEl.type === 'password' ||
        activeEl.type === 'number' ||
        !activeEl.type
      )) ||
      (activeEl.isContentEditable && activeEl.id !== 'lyrics-style-preview-sample')
    );

    // Undo / Redo hotkeys (Ctrl+Z / Cmd+Z, Ctrl+Y / Ctrl+Shift+Z)
    if ((e.ctrlKey || e.metaKey) && !isEditableField) {
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          performRedo();
        } else {
          performUndo();
        }
        return;
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        performRedo();
        return;
      }
    }

    if (e.code === 'Space') {
      if (isEditableField && !e.ctrlKey && !e.altKey && !e.metaKey) {
        return;
      }
      e.preventDefault();
      if (UI.btnPlayPause) {
        UI.btnPlayPause.click();
      }
    } else if (e.key === ',' || (e.code === 'ArrowLeft' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey)) {
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }
      e.preventDefault();
      stepFrame(-1);
    } else if (e.key === '.' || (e.code === 'ArrowRight' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey)) {
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }
      e.preventDefault();
      stepFrame(1);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
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
    } else if (e.key === 'Escape') {
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        activeEl.blur();
      }
    }
  });

  // Initialize canvas layout and launch background engine loop
  resizeMainCanvas();
  renderFrame(state.time);
  engine.start();

  // Handle browser window resize events
  window.addEventListener('resize', () => {
    resizeMainCanvas();
    renderFrame(state.time);
  });

  // Smoothly dismiss minimal boot splash now that wizard/editor is painted underneath
  const bootSplash = document.getElementById('app-boot-splash');
  if (bootSplash) {
    requestAnimationFrame(() => {
      bootSplash.classList.add('fade-out');
      setTimeout(() => bootSplash.remove(), 260);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
