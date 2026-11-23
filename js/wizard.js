import { state, HistoryManager } from './state.js';
import { UI } from './ui.js';
import { ImageProcessor } from './masking.js';
import { getTimelineDuration, generateUUID, formatTimecode } from './utils.js';
import { resizeMainCanvas, renderFrame } from './renderer.js';
import { engine } from './engine.js';
import { updateTimelineTracks, updateTimelineRuler, updatePlayhead, selectText, selectGraphic, selectAudio } from './timeline.js';
import { getAudioContext, syncAudioPlayback } from './audio.js';

export class WizardManager {
  static currentStep = 1;
  static totalSteps = 7;
  static wizardState = {
    aspectRatio: '9-16',
    duration: 5,
    tunnelFile: null,
    tunnelImg: null,
    tunnelImages: [],
    layerCount: 8,
    maskType: 'adaptive-luminosity',
    layerEdgeFade: 10,
    zoomSpeed: 0.05,
    zoomDepth: 4.0,
    overlayFile: null,
    overlayImg: null,
    overlayPlacement: 'center', // 'top', 'center', 'bottom', 'bottom-right', 'custom'
    overlayX: 0.0, // normalized [-0.5, 0.5]
    overlayY: 0.0, // normalized [-0.5, 0.5]
    overlayScale: 70,
    overlayBlend: 'normal',
    audioFile: null,
    audioBuffer: null,
    audioPeaks: null,
    audioFileName: '',
    matchAudioDuration: false,
    textString: '',
    textPlacement: 'bottom', // 'top', 'center', 'bottom'
    textY: 0.35, // normalized [-0.5, 0.5]
    textSize: 42,
    textGlow: 20,
    textStyle: 'neon-cyan', // 'neon-cyan', 'hot-pink', 'pure-white'
    textFont: 'Outfit'
  };

  static previewCanvas = null;
  static previewCtx = null;
  static overlayCanvas = null;
  static overlayCtx = null;
  static textCanvas = null;
  static textCtx = null;

  static previewLayers = [];
  static previewAnimId = null;
  static previewTime = 0;
  static previewPhase = 0;

  static isDraggingOverlay = false;
  static dragStartX = 0;
  static dragStartY = 0;
  static initialOverlayX = 0;
  static initialOverlayY = 0;

  static init() {
    this.previewCanvas = document.getElementById('wizard-tunnel-preview-canvas');
    if (this.previewCanvas) {
      this.previewCtx = this.previewCanvas.getContext('2d');
    }

    this.overlayCanvas = document.getElementById('wizard-overlay-preview-canvas');
    if (this.overlayCanvas) {
      this.overlayCtx = this.overlayCanvas.getContext('2d');
    }

    this.textCanvas = document.getElementById('wizard-text-preview-canvas');
    if (this.textCanvas) {
      this.textCtx = this.textCanvas.getContext('2d');
    }

    this.applyAspectRatioToCanvases();
    this.bindEvents();
    this.setupOverlayCanvasInteractions();

    // Pre-generate default Cyber Sigil sample so preview and studio launch are instantaneous
    this.loadDefaultSampleGraphic();

    // Check if wizard should be automatically displayed on initial visit
    const hasSeenWizard = sessionStorage.getItem('vilecut_wizard_dismissed');
    const urlParams = new URLSearchParams(window.location.search);
    const forceClassic = urlParams.get('mode') === 'classic';
    const forceWizard = urlParams.get('mode') === 'wizard' || urlParams.get('wizard') === '1';

    if (!forceClassic && (forceWizard || (!hasSeenWizard && state.uploadedImages.length === 0))) {
      setTimeout(() => this.open(), 300);
    }
  }

  static applyAspectRatioToCanvases() {
    const ratio = this.wizardState.aspectRatio || '9-16';
    let w = 360;
    let h = 360;

    if (ratio === '9-16') {
      w = 270;
      h = 480;
    } else if (ratio === '16-9') {
      w = 480;
      h = 270;
    } else if (ratio === '1-1') {
      w = 360;
      h = 360;
    } else if (ratio === '4-5') {
      w = 320;
      h = 400;
    } else if (ratio === '21-9') {
      w = 490;
      h = 210;
    }

    const ratioLabel = ratio.replace('-', ':');
    const cssRatio = ratio.replace('-', ' / ');

    const canvasConfigs = [
      { id: 'wizard-tunnel-preview-canvas', badgeId: 'wizard-tunnel-aspect-badge', prefix: '60 FPS Loop • ' },
      { id: 'wizard-overlay-preview-canvas', badgeId: 'wizard-overlay-aspect-badge', prefix: 'Tunnel Background • ' },
      { id: 'wizard-text-preview-canvas', badgeId: 'wizard-text-aspect-badge', prefix: 'Tunnel Background • ' }
    ];

    canvasConfigs.forEach(cfg => {
      const cvs = document.getElementById(cfg.id);
      if (cvs) {
        cvs.width = w;
        cvs.height = h;
        cvs.style.aspectRatio = cssRatio;
      }
      const badge = document.getElementById(cfg.badgeId);
      if (badge) {
        badge.innerText = `${cfg.prefix}Aspect Ratio: ${ratioLabel}`;
      }
    });
  }

  static open() {
    const overlay = document.getElementById('project-wizard-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    this.goToStep(1);
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  static close(rememberDismissal = true) {
    const overlay = document.getElementById('project-wizard-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    this.stopPreviewLoop();
    if (rememberDismissal) {
      sessionStorage.setItem('vilecut_wizard_dismissed', 'true');
    }
  }

  static goToStep(stepNum) {
    if (stepNum < 1) stepNum = 1;
    if (stepNum > this.totalSteps) stepNum = this.totalSteps;
    this.currentStep = stepNum;

    // Update step view visibility
    for (let i = 1; i <= this.totalSteps; i++) {
      const stepView = document.getElementById(`wizard-step-${i}`);
      if (stepView) {
        stepView.classList.toggle('active', i === stepNum);
      }
      const indicator = document.getElementById(`wizard-indicator-${i}`);
      if (indicator) {
        indicator.classList.toggle('active', i === stepNum);
        indicator.classList.toggle('completed', i < stepNum);
      }
    }

    // Step-specific activations
    if (stepNum === 3 || stepNum === 4 || stepNum === 6) {
      this.applyAspectRatioToCanvases();
      if (!this.wizardState.tunnelImg && this.previewLayers.length === 0) {
        this.loadDefaultSampleGraphic();
      }
      this.startPreviewLoop();
    } else {
      this.stopPreviewLoop();
    }

    if (stepNum === 7) {
      this.populateSummary();
    }

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  static bindEvents() {
    // Header Launch Button
    const btnOpen = document.getElementById('btn-open-wizard');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => this.open());
    }

    // Close Buttons
    const btnCloseX = document.getElementById('btn-wizard-close-x');
    if (btnCloseX) {
      btnCloseX.addEventListener('click', () => this.close());
    }
    const btnIntroSkip = document.getElementById('btn-wizard-intro-skip-studio');
    if (btnIntroSkip) {
      btnIntroSkip.addEventListener('click', () => this.launchDefaultStudio());
    }

    // Interactive Stepper Indicator navigation
    for (let i = 1; i <= this.totalSteps; i++) {
      const ind = document.getElementById(`wizard-indicator-${i}`);
      if (ind) {
        ind.style.cursor = 'pointer';
        ind.addEventListener('click', () => {
          this.goToStep(i);
        });
      }
    }

    // Navigation Buttons
    document.querySelectorAll('.btn-wizard-next').forEach(btn => {
      btn.addEventListener('click', () => {
        this.goToStep(this.currentStep + 1);
      });
    });

    document.querySelectorAll('.btn-wizard-prev').forEach(btn => {
      btn.addEventListener('click', () => {
        this.goToStep(this.currentStep - 1);
      });
    });

    // Step 1: Aspect Ratio Selection Cards
    document.querySelectorAll('.wizard-ratio-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.wizard-ratio-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const ratio = card.getAttribute('data-ratio');
        this.wizardState.aspectRatio = ratio;
        this.applyAspectRatioToCanvases();
      });
    });

    // Step 1: Duration Presets
    document.querySelectorAll('.wizard-dur-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.wizard-dur-pill').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
        const dur = parseInt(pill.getAttribute('data-dur'));
        this.wizardState.duration = dur;
      });
    });

    // Step 2: Image Upload (Multiple Support)
    const tunnelUpload = document.getElementById('wizard-tunnel-file-input');
    const tunnelDrop = document.getElementById('wizard-tunnel-drop-zone');
    if (tunnelUpload) {
      tunnelUpload.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleTunnelFiles(e.target.files);
        }
      });
    }
    if (tunnelDrop) {
      tunnelDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        tunnelDrop.classList.add('dragover');
      });
      tunnelDrop.addEventListener('dragleave', () => {
        tunnelDrop.classList.remove('dragover');
      });
      tunnelDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        tunnelDrop.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleTunnelFiles(e.dataTransfer.files);
        }
      });
    }

    // Step 2: Sample Graphic Button
    const btnSample = document.getElementById('btn-wizard-load-sample');
    if (btnSample) {
      btnSample.addEventListener('click', () => {
        this.loadSampleCyberSigil();
      });
    }

    // Step 2: Tunnel Sliders
    const sliderLayers = document.getElementById('wizard-slider-layers');
    const valLayers = document.getElementById('wizard-val-layers');
    if (sliderLayers) {
      sliderLayers.addEventListener('input', (e) => {
        this.wizardState.layerCount = parseInt(e.target.value);
        if (valLayers) valLayers.innerText = this.wizardState.layerCount;
        this.reprocessPreviewLayers();
      });
    }

    const sliderSpeed = document.getElementById('wizard-slider-speed');
    const valSpeed = document.getElementById('wizard-val-speed');
    if (sliderSpeed) {
      sliderSpeed.addEventListener('input', (e) => {
        this.wizardState.zoomSpeed = parseFloat(e.target.value);
        if (valSpeed) valSpeed.innerText = this.wizardState.zoomSpeed.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') || '0';
      });
    }

    const sliderFade = document.getElementById('wizard-slider-fade');
    const valFade = document.getElementById('wizard-val-fade');
    if (sliderFade) {
      sliderFade.addEventListener('input', (e) => {
        this.wizardState.layerEdgeFade = parseInt(e.target.value);
        if (valFade) valFade.innerText = `${this.wizardState.layerEdgeFade}%`;
        this.reprocessPreviewLayers();
      });
    }

    // Step 3: Overlay Upload
    const overlayUpload = document.getElementById('wizard-overlay-file-input');
    const overlayDrop = document.getElementById('wizard-overlay-drop-zone');
    if (overlayUpload) {
      overlayUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleOverlayFile(file);
      });
    }
    if (overlayDrop) {
      overlayDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        overlayDrop.classList.add('dragover');
      });
      overlayDrop.addEventListener('dragleave', () => {
        overlayDrop.classList.remove('dragover');
      });
      overlayDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        overlayDrop.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          this.handleOverlayFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Step 3: Placement Grid Preset Buttons
    document.querySelectorAll('.wizard-placement-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wizard-placement-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const placement = btn.getAttribute('data-placement');
        this.wizardState.overlayPlacement = placement;

        let posX = 0.0;
        let posY = 0.0;
        if (placement === 'top') { posX = 0.0; posY = -0.32; }
        else if (placement === 'bottom') { posX = 0.0; posY = 0.32; }
        else if (placement === 'bottom-right') { posX = 0.35; posY = 0.35; }
        else { posX = 0.0; posY = 0.0; } // center

        this.wizardState.overlayX = posX;
        this.wizardState.overlayY = posY;

        // Sync Sliders
        const posXSlider = document.getElementById('wizard-overlay-pos-x');
        const posXVal = document.getElementById('wizard-overlay-pos-x-val');
        const posYSlider = document.getElementById('wizard-overlay-pos-y');
        const posYVal = document.getElementById('wizard-overlay-pos-y-val');

        const pctX = Math.round(posX * 100);
        const pctY = Math.round(posY * 100);
        if (posXSlider) posXSlider.value = pctX;
        if (posXVal) posXVal.innerText = `${pctX > 0 ? '+' : ''}${pctX}%`;
        if (posYSlider) posYSlider.value = pctY;
        if (posYVal) posYVal.innerText = `${pctY > 0 ? '+' : ''}${pctY}%`;
      });
    });

    // Step 3: Manual Coordinate Sliders
    const posXSlider = document.getElementById('wizard-overlay-pos-x');
    const posXVal = document.getElementById('wizard-overlay-pos-x-val');
    if (posXSlider) {
      posXSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        this.wizardState.overlayX = val / 100;
        if (posXVal) posXVal.innerText = `${val > 0 ? '+' : ''}${val}%`;
        document.querySelectorAll('.wizard-placement-btn').forEach(b => b.classList.remove('selected'));
      });
    }

    const posYSlider = document.getElementById('wizard-overlay-pos-y');
    const posYVal = document.getElementById('wizard-overlay-pos-y-val');
    if (posYSlider) {
      posYSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        this.wizardState.overlayY = val / 100;
        if (posYVal) posYVal.innerText = `${val > 0 ? '+' : ''}${val}%`;
        document.querySelectorAll('.wizard-placement-btn').forEach(b => b.classList.remove('selected'));
      });
    }

    // Step 3: Scale & Blend Mode
    const overlayScaleSlider = document.getElementById('wizard-overlay-scale');
    const overlayScaleVal = document.getElementById('wizard-overlay-scale-val');
    if (overlayScaleSlider) {
      overlayScaleSlider.addEventListener('input', (e) => {
        this.wizardState.overlayScale = parseInt(e.target.value);
        if (overlayScaleVal) overlayScaleVal.innerText = `${this.wizardState.overlayScale}%`;
      });
    }

    const overlayBlendSelect = document.getElementById('wizard-overlay-blend');
    if (overlayBlendSelect) {
      overlayBlendSelect.addEventListener('change', (e) => {
        this.wizardState.overlayBlend = e.target.value;
      });
    }

    // Step 4: Audio Upload
    const audioUpload = document.getElementById('wizard-audio-file-input');
    const audioDrop = document.getElementById('wizard-audio-drop-zone');
    if (audioUpload) {
      audioUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleAudioFile(file);
      });
    }
    if (audioDrop) {
      audioDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        audioDrop.classList.add('dragover');
      });
      audioDrop.addEventListener('dragleave', () => {
        audioDrop.classList.remove('dragover');
      });
      audioDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        audioDrop.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          this.handleAudioFile(e.dataTransfer.files[0]);
        }
      });
    }

    const chkMatchAudio = document.getElementById('wizard-match-audio-dur');
    if (chkMatchAudio) {
      chkMatchAudio.addEventListener('change', (e) => {
        this.wizardState.matchAudioDuration = e.target.checked;
      });
    }

    // Step 5: Typography Text Input
    const textInput = document.getElementById('wizard-text-input');
    if (textInput) {
      textInput.addEventListener('input', (e) => {
        this.wizardState.textString = e.target.value;
      });
    }

    // Step 5: Custom Font File Upload
    const fontFileInput = document.getElementById('wizard-font-file-input');
    const fontBadge = document.getElementById('wizard-font-upload-badge');
    if (fontFileInput) {
      fontFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const rawName = file.name.replace(/\.[^/.]+$/, '').trim();
          const fontName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_');
          const arrayBuffer = await file.arrayBuffer();
          const fontFace = new FontFace(fontName, arrayBuffer);
          const loadedFace = await fontFace.load();
          document.fonts.add(loadedFace);

          // Add to wizard dropdown
          const fontSelect = document.getElementById('wizard-font-select');
          if (fontSelect) {
            const opt = document.createElement('option');
            opt.value = fontName;
            opt.innerText = `${fontName} (Uploaded)`;
            opt.selected = true;
            fontSelect.appendChild(opt);
          }

          // Also populate main studio font dropdowns so it persists
          if (UI.textFont) {
            const optStudio = document.createElement('option');
            optStudio.value = fontName;
            optStudio.innerText = `${fontName} (Uploaded)`;
            UI.textFont.appendChild(optStudio);
          }
          if (UI.lyricsFont) {
            const optLyrics = document.createElement('option');
            optLyrics.value = fontName;
            optLyrics.innerText = `${fontName} (Uploaded)`;
            UI.lyricsFont.appendChild(optLyrics);
          }

          this.wizardState.textFont = fontName;
          if (fontBadge) {
            fontBadge.innerText = `Font Active: ${file.name}`;
            fontBadge.classList.remove('hidden');
          }
        } catch (err) {
          console.error('Failed to load custom font in wizard:', err);
          alert(`Could not load font file: ${err.message}`);
        }
      });
    }

    // Step 5: Text / Lyrics File Import
    const textFileInput = document.getElementById('wizard-text-file-input');
    if (textFileInput) {
      textFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const content = evt.target.result;
          // Strip LRC timestamps if present
          const cleanText = content.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
          const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
          const selectedText = lines.slice(0, 3).join('\n');
          if (selectedText) {
            this.wizardState.textString = selectedText;
            if (textInput) textInput.value = selectedText;
          }
        };
        reader.readAsText(file);
      });
    }

    // Step 5: Font Size & Glow Radius Sliders
    const textSizeSlider = document.getElementById('wizard-text-size-slider');
    const textSizeVal = document.getElementById('wizard-text-size-val');
    if (textSizeSlider) {
      textSizeSlider.addEventListener('input', (e) => {
        this.wizardState.textSize = parseInt(e.target.value);
        if (textSizeVal) textSizeVal.innerText = `${this.wizardState.textSize}px`;
      });
    }

    const textGlowSlider = document.getElementById('wizard-text-glow-slider');
    const textGlowVal = document.getElementById('wizard-text-glow-val');
    if (textGlowSlider) {
      textGlowSlider.addEventListener('input', (e) => {
        this.wizardState.textGlow = parseInt(e.target.value);
        if (textGlowVal) textGlowVal.innerText = `${this.wizardState.textGlow}px`;
      });
    }

    // Step 5: Style Pills
    document.querySelectorAll('.wizard-text-style-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.wizard-text-style-pill').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
        this.wizardState.textStyle = pill.getAttribute('data-style');
      });
    });

    // Step 5: Placement Buttons
    document.querySelectorAll('.wizard-text-placement-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wizard-text-placement-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const placement = btn.getAttribute('data-placement');
        this.wizardState.textPlacement = placement;
        if (placement === 'top') this.wizardState.textY = -0.35;
        else if (placement === 'center') this.wizardState.textY = 0.0;
        else this.wizardState.textY = 0.35; // bottom
      });
    });

    const fontSelect = document.getElementById('wizard-font-select');
    if (fontSelect) {
      fontSelect.addEventListener('change', (e) => {
        this.wizardState.textFont = e.target.value;
      });
    }

    // Step 6: Final Launch Button
    const btnLaunch = document.getElementById('btn-wizard-launch-studio');
    if (btnLaunch) {
      btnLaunch.addEventListener('click', () => {
        this.commitAndLaunchStudio();
      });
    }
  }

  // --- INTERACTIVE DRAG-TO-POSITION FOR OVERLAY CANVAS ---
  static setupOverlayCanvasInteractions() {
    const cvs = document.getElementById('wizard-overlay-preview-canvas');
    if (!cvs) return;

    const getClientPos = (e) => {
      if (e.touches && e.touches.length > 0) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
      }
      return { clientX: e.clientX, clientY: e.clientY };
    };

    const onStart = (e) => {
      const pos = getClientPos(e);
      this.isDraggingOverlay = true;
      cvs.style.cursor = 'grabbing';
      this.dragStartX = pos.clientX;
      this.dragStartY = pos.clientY;
      this.initialOverlayX = this.wizardState.overlayX;
      this.initialOverlayY = this.wizardState.overlayY;
      if (e.cancelable) e.preventDefault();
    };

    const onMove = (e) => {
      if (!this.isDraggingOverlay) return;
      const pos = getClientPos(e);
      const rect = cvs.getBoundingClientRect();
      const deltaX = (pos.clientX - this.dragStartX) / rect.width;
      const deltaY = (pos.clientY - this.dragStartY) / rect.height;

      this.wizardState.overlayX = Math.max(-0.48, Math.min(0.48, this.initialOverlayX + deltaX));
      this.wizardState.overlayY = Math.max(-0.48, Math.min(0.48, this.initialOverlayY + deltaY));

      // Sync X / Y sliders and percentage badges
      const posXSlider = document.getElementById('wizard-overlay-pos-x');
      const posXVal = document.getElementById('wizard-overlay-pos-x-val');
      const posYSlider = document.getElementById('wizard-overlay-pos-y');
      const posYVal = document.getElementById('wizard-overlay-pos-y-val');

      const pctX = Math.round(this.wizardState.overlayX * 100);
      const pctY = Math.round(this.wizardState.overlayY * 100);

      if (posXSlider) posXSlider.value = pctX;
      if (posXVal) posXVal.innerText = `${pctX > 0 ? '+' : ''}${pctX}%`;
      if (posYSlider) posYSlider.value = pctY;
      if (posYVal) posYVal.innerText = `${pctY > 0 ? '+' : ''}${pctY}%`;

      document.querySelectorAll('.wizard-placement-btn').forEach(b => b.classList.remove('selected'));
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (this.isDraggingOverlay) {
        this.isDraggingOverlay = false;
        cvs.style.cursor = 'grab';
      }
    };

    cvs.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    cvs.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  // --- TUNNEL IMAGE HANDLING (SUPPORTS MULTIPLE FILES) ---
  static async handleTunnelFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const loadedImages = [];

    const loadSingleImage = (file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => resolve({ id: generateUUID(), name: file.name, file, img });
          img.onerror = () => resolve(null);
          img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    };

    for (const file of files) {
      const res = await loadSingleImage(file);
      if (res) loadedImages.push(res);
    }

    if (loadedImages.length === 0) return;

    this.wizardState.tunnelImages = loadedImages;
    this.wizardState.tunnelFile = loadedImages[0].file;
    this.wizardState.tunnelImg = loadedImages[0].img;

    this.reprocessPreviewLayers();
  }

  static handleTunnelFile(file) {
    if (file) this.handleTunnelFiles([file]);
  }

  static loadDefaultSampleGraphic() {
    this.loadSampleCyberSigil();
  }

  static loadSampleCyberSigil() {
    const sCanvas = document.createElement('canvas');
    sCanvas.width = 720;
    sCanvas.height = 720;
    const sCtx = sCanvas.getContext('2d');
    const cx = 360;
    const cy = 360;

    // 1. Deep Cosmic Nebula Gradient Background
    const bgGrad = sCtx.createRadialGradient(cx, cy, 20, cx, cy, 380);
    bgGrad.addColorStop(0, '#1d052d');
    bgGrad.addColorStop(0.35, '#0c0218');
    bgGrad.addColorStop(0.7, '#040b17');
    bgGrad.addColorStop(1, '#020308');
    sCtx.fillStyle = bgGrad;
    sCtx.fillRect(0, 0, 720, 720);

    // 2. Diffuse Ambient Glow Blooms
    const glow1 = sCtx.createRadialGradient(cx, cy, 10, cx, cy, 260);
    glow1.addColorStop(0, 'rgba(0, 242, 254, 0.38)');
    glow1.addColorStop(0.5, 'rgba(155, 81, 224, 0.22)');
    glow1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = glow1;
    sCtx.fillRect(0, 0, 720, 720);

    const glow2 = sCtx.createRadialGradient(cx, cy, 5, cx, cy, 130);
    glow2.addColorStop(0, 'rgba(255, 0, 127, 0.55)');
    glow2.addColorStop(0.6, 'rgba(255, 190, 11, 0.25)');
    glow2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = glow2;
    sCtx.fillRect(0, 0, 720, 720);

    // 3. Intricate Celestial Rings & Astrological Notches
    sCtx.save();
    sCtx.beginPath();
    sCtx.arc(cx, cy, 330, 0, Math.PI * 2);
    sCtx.strokeStyle = 'rgba(0, 242, 254, 0.45)';
    sCtx.lineWidth = 2.5;
    sCtx.stroke();

    sCtx.beginPath();
    sCtx.arc(cx, cy, 320, 0, Math.PI * 2);
    sCtx.strokeStyle = 'rgba(255, 0, 127, 0.65)';
    sCtx.lineWidth = 1.5;
    sCtx.setLineDash([6, 10]);
    sCtx.stroke();
    sCtx.setLineDash([]);

    // 48 Celestial Cardinal & Radial Ticks
    for (let i = 0; i < 48; i++) {
      const angle = (i * Math.PI) / 24;
      const isMajor = i % 6 === 0;
      const isMedium = i % 3 === 0;
      const rInner = isMajor ? 298 : (isMedium ? 308 : 315);
      const rOuter = 328;
      sCtx.beginPath();
      sCtx.moveTo(cx + Math.cos(angle) * rInner, cy + Math.sin(angle) * rInner);
      sCtx.lineTo(cx + Math.cos(angle) * rOuter, cy + Math.sin(angle) * rOuter);
      sCtx.strokeStyle = isMajor ? '#00f2fe' : (isMedium ? '#ff007f' : 'rgba(255, 255, 255, 0.35)');
      sCtx.lineWidth = isMajor ? 3 : (isMedium ? 1.5 : 1);
      sCtx.stroke();
    }

    // 4. Sacred Geometry - 8-Pointed Radiant Starburst Blades (High 3D Depth)
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const perp = angle + Math.PI / 2;
      const len = 310;
      const baseW = 16;

      const pTip = { x: cx + Math.cos(angle) * len, y: cy + Math.sin(angle) * len };
      const pBase1 = { x: cx + Math.cos(perp) * baseW + Math.cos(angle) * 70, y: cy + Math.sin(perp) * baseW + Math.sin(angle) * 70 };
      const pBase2 = { x: cx - Math.cos(perp) * baseW + Math.cos(angle) * 70, y: cy - Math.sin(perp) * baseW + Math.sin(angle) * 70 };

      // Shaded Highlight Face
      sCtx.beginPath();
      sCtx.moveTo(cx, cy);
      sCtx.lineTo(pBase1.x, pBase1.y);
      sCtx.lineTo(pTip.x, pTip.y);
      sCtx.closePath();
      const bladeGrad1 = sCtx.createLinearGradient(cx, cy, pTip.x, pTip.y);
      bladeGrad1.addColorStop(0, '#ff007f');
      bladeGrad1.addColorStop(0.5, '#9b51e0');
      bladeGrad1.addColorStop(1, '#00f2fe');
      sCtx.fillStyle = bladeGrad1;
      sCtx.fill();

      // Shaded Shadow Face
      sCtx.beginPath();
      sCtx.moveTo(cx, cy);
      sCtx.lineTo(pBase2.x, pBase2.y);
      sCtx.lineTo(pTip.x, pTip.y);
      sCtx.closePath();
      const bladeGrad2 = sCtx.createLinearGradient(cx, cy, pTip.x, pTip.y);
      bladeGrad2.addColorStop(0, '#430268');
      bladeGrad2.addColorStop(0.5, '#0c1b33');
      bladeGrad2.addColorStop(1, '#005b66');
      sCtx.fillStyle = bladeGrad2;
      sCtx.fill();
    }

    // 5. Interlocking Geometric Octagram Rings
    for (let pass = 0; pass < 2; pass++) {
      const offset = pass * (Math.PI / 4);
      sCtx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const ang = (i * Math.PI) / 2 + offset;
        const px = cx + Math.cos(ang) * 230;
        const py = cy + Math.sin(ang) * 230;
        if (i === 0) sCtx.moveTo(px, py);
        else sCtx.lineTo(px, py);
      }
      sCtx.strokeStyle = pass === 0 ? 'rgba(0, 242, 254, 0.85)' : 'rgba(255, 0, 127, 0.85)';
      sCtx.lineWidth = 2.5;
      sCtx.shadowColor = pass === 0 ? '#00f2fe' : '#ff007f';
      sCtx.shadowBlur = 12;
      sCtx.stroke();
    }
    sCtx.shadowBlur = 0;

    // 6. Cybernetic Hex Circuit Traces with Terminal Nodes
    for (let i = 0; i < 12; i++) {
      const ang = (i * Math.PI) / 6;
      const r1 = 160;
      const r2 = 210;
      const r3 = 260;
      const p1 = { x: cx + Math.cos(ang) * r1, y: cy + Math.sin(ang) * r1 };
      const p2 = { x: cx + Math.cos(ang + 0.12) * r2, y: cy + Math.sin(ang + 0.12) * r2 };
      const p3 = { x: cx + Math.cos(ang + 0.12) * r3, y: cy + Math.sin(ang + 0.12) * r3 };

      sCtx.beginPath();
      sCtx.moveTo(p1.x, p1.y);
      sCtx.lineTo(p2.x, p2.y);
      sCtx.lineTo(p3.x, p3.y);
      sCtx.strokeStyle = 'rgba(0, 242, 254, 0.65)';
      sCtx.lineWidth = 2;
      sCtx.stroke();

      // Glowing Gold Node
      sCtx.beginPath();
      sCtx.arc(p3.x, p3.y, 4.5, 0, Math.PI * 2);
      sCtx.fillStyle = '#ffe600';
      sCtx.shadowColor = '#ffe600';
      sCtx.shadowBlur = 8;
      sCtx.fill();
      sCtx.shadowBlur = 0;
    }

    // 7. Middle Intricate Mandala Ring (Gothic Rose Portal)
    for (let r = 110; r <= 150; r += 20) {
      sCtx.beginPath();
      sCtx.arc(cx, cy, r, 0, Math.PI * 2);
      sCtx.strokeStyle = r === 150 ? '#ff007f' : '#00f2fe';
      sCtx.lineWidth = 2;
      sCtx.stroke();
    }

    // 12 Curved Petals inside the ring
    for (let i = 0; i < 12; i++) {
      const ang1 = (i * Math.PI) / 6;
      const ang2 = ((i + 1) * Math.PI) / 6;
      const cpR = 175;
      const cpAng = (ang1 + ang2) / 2;

      sCtx.beginPath();
      sCtx.moveTo(cx + Math.cos(ang1) * 110, cy + Math.sin(ang1) * 110);
      sCtx.quadraticCurveTo(
        cx + Math.cos(cpAng) * cpR, cy + Math.sin(cpAng) * cpR,
        cx + Math.cos(ang2) * 110, cy + Math.sin(ang2) * 110
      );
      sCtx.strokeStyle = '#ffe600';
      sCtx.lineWidth = 2;
      sCtx.shadowColor = '#ffe600';
      sCtx.shadowBlur = 6;
      sCtx.stroke();
      sCtx.shadowBlur = 0;
    }

    // 8. Central Radiant Occult Aperture / Mystical Eye Core
    sCtx.beginPath();
    sCtx.moveTo(cx - 85, cy);
    sCtx.quadraticCurveTo(cx, cy - 65, cx + 85, cy);
    sCtx.quadraticCurveTo(cx, cy + 65, cx - 85, cy);
    sCtx.fillStyle = '#06020c';
    sCtx.fill();
    sCtx.strokeStyle = '#00f2fe';
    sCtx.lineWidth = 3.5;
    sCtx.shadowColor = '#00f2fe';
    sCtx.shadowBlur = 16;
    sCtx.stroke();
    sCtx.shadowBlur = 0;

    // Glowing Iris
    const irisGrad = sCtx.createRadialGradient(cx, cy, 5, cx, cy, 45);
    irisGrad.addColorStop(0, '#ffffff');
    irisGrad.addColorStop(0.2, '#ffe600');
    irisGrad.addColorStop(0.55, '#ff007f');
    irisGrad.addColorStop(0.85, '#9b51e0');
    irisGrad.addColorStop(1, '#00f2fe');

    sCtx.beginPath();
    sCtx.arc(cx, cy, 45, 0, Math.PI * 2);
    sCtx.fillStyle = irisGrad;
    sCtx.fill();

    // Piercing Cybernetic Pupil
    sCtx.beginPath();
    sCtx.ellipse(cx, cy, 7, 36, 0, 0, Math.PI * 2);
    sCtx.fillStyle = '#000000';
    sCtx.fill();

    // Hot Center White Energy Core
    sCtx.beginPath();
    sCtx.arc(cx, cy, 6, 0, Math.PI * 2);
    sCtx.fillStyle = '#ffffff';
    sCtx.shadowColor = '#ffffff';
    sCtx.shadowBlur = 20;
    sCtx.fill();
    sCtx.shadowBlur = 0;

    // Cross Flare Spikes radiating from center
    sCtx.beginPath();
    sCtx.moveTo(cx - 100, cy);
    sCtx.lineTo(cx + 100, cy);
    sCtx.moveTo(cx, cy - 80);
    sCtx.lineTo(cx, cy + 80);
    sCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    sCtx.lineWidth = 1.5;
    sCtx.stroke();

    sCtx.restore();

    const sampleImg = new Image();
    sampleImg.onload = () => {
      this.wizardState.tunnelImages = [{
        id: generateUUID(),
        name: 'Cyber_Sigil_Sample.png',
        file: null,
        img: sampleImg
      }];
      this.wizardState.tunnelFile = null;
      this.wizardState.tunnelImg = sampleImg;
      this.reprocessPreviewLayers();
    };
    sampleImg.src = sCanvas.toDataURL();
  }

  static reprocessPreviewLayers() {
    if (!this.wizardState.tunnelImg) return;
    const img = this.wizardState.tunnelImg;
    const N = this.wizardState.layerCount;
    const w = 480;
    const h = Math.round((480 / img.naturalWidth) * img.naturalHeight);

    const tempC = document.createElement('canvas');
    tempC.width = w;
    tempC.height = h;
    const tCtx = tempC.getContext('2d', { willReadFrequently: true });
    tCtx.drawImage(img, 0, 0, w, h);
    const imgData = tCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Luminosity Histogram Quantiles
    const histogram = new Uint32Array(256);
    const totalPixels = w * h;
    for (let i = 0; i < totalPixels; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      histogram[lum]++;
    }

    const cdf = new Float32Array(256);
    let accum = 0;
    for (let i = 0; i < 256; i++) {
      accum += histogram[i];
      cdf[i] = accum / totalPixels;
    }

    const cuts = new Uint8Array(N + 1);
    cuts[0] = 0;
    cuts[N] = 255;
    for (let l = 1; l < N; l++) {
      const targetFrac = l / N;
      let cutVal = 0;
      for (let i = 0; i < 256; i++) {
        if (cdf[i] >= targetFrac) {
          cutVal = i;
          break;
        }
      }
      cuts[l] = cutVal;
    }

    const fadeBand = Math.round((this.wizardState.layerEdgeFade / 100) * 30);
    this.previewLayers = [];

    for (let l = 0; l < N; l++) {
      const minLum = cuts[l];
      const maxLum = cuts[l + 1];
      const lCanvas = document.createElement('canvas');
      lCanvas.width = w;
      lCanvas.height = h;
      const lCtx = lCanvas.getContext('2d');
      const lImgData = lCtx.createImageData(w, h);
      const lData = lImgData.data;

      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

        if (a > 10 && lum >= minLum && lum <= maxLum) {
          let alphaWeight = 1.0;
          if (fadeBand > 0) {
            const distFromEdge = Math.min(lum - minLum, maxLum - lum);
            if (distFromEdge < fadeBand) {
              alphaWeight = distFromEdge / fadeBand;
            }
          }
          lData[idx] = r;
          lData[idx + 1] = g;
          lData[idx + 2] = b;
          lData[idx + 3] = Math.round(a * alphaWeight);
        } else {
          lData[idx + 3] = 0;
        }
      }
      lCtx.putImageData(lImgData, 0, 0);
      this.previewLayers.push({
        canvas: lCanvas,
        initialZ: l / N
      });
    }
  }

  static startPreviewLoop() {
    if (this.previewAnimId) return;
    let lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      this.previewTime += dt;
      const rawSpeed = this.wizardState.zoomSpeed;
      const speed = Math.abs(rawSpeed) < 0.0001 ? 0 : rawSpeed;
      this.previewPhase += dt * speed;
      this.renderMiniTunnel();
      this.previewAnimId = requestAnimationFrame(loop);
    };
    this.previewAnimId = requestAnimationFrame(loop);
  }

  static stopPreviewLoop() {
    if (this.previewAnimId) {
      cancelAnimationFrame(this.previewAnimId);
      this.previewAnimId = null;
    }
  }

  static getCompositeOperation(blend) {
    switch (blend) {
      case 'screen': return 'screen';
      case 'multiply': return 'multiply';
      case 'overlay': return 'overlay';
      case 'color-dodge': return 'color-dodge';
      default: return 'source-over';
    }
  }

  // --- RENDER CAMERA TUNNEL ON ANY CANVAS (matches main editor renderer.js math) ---
  static renderTunnelToCanvas(cvs, ctx) {
    if (!cvs || !ctx) return;
    const cw = cvs.width;
    const ch = cvs.height;

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, cw, ch);

    if (this.previewLayers.length === 0) return;

    const phase = this.previewPhase;
    const depth = this.wizardState.zoomDepth || 4.0;

    const layerDepths = this.previewLayers.map((layer) => {
      let z = (layer.initialZ + phase) % 1.0;
      if (z < 0) z += 1.0;

      const scale = Math.pow(depth, (z - 0.5) * 2.0);

      let opacity = 1.0;
      if (z < 0.15) {
        opacity = z / 0.15;
      } else if (z > 0.8) {
        opacity = (1.0 - z) / 0.2;
      }
      opacity = Math.max(0.0, Math.min(1.0, opacity));

      return { layer, scale, opacity };
    });

    layerDepths.sort((a, b) => a.scale - b.scale);

    layerDepths.forEach(({ layer, scale, opacity }) => {
      if (opacity <= 0.01) return;
      const lw = layer.canvas.width;
      const lh = layer.canvas.height;
      const coverScale = Math.max(cw / lw, ch / lh);

      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.scale(scale * coverScale, scale * coverScale);
      ctx.globalAlpha = opacity;
      ctx.drawImage(layer.canvas, -lw / 2, -lh / 2);
      ctx.restore();
    });
  }

  static renderMiniTunnel() {
    if (this.currentStep === 3) {
      const cvs = document.getElementById('wizard-tunnel-preview-canvas');
      if (cvs) this.renderTunnelToCanvas(cvs, cvs.getContext('2d'));
    } else if (this.currentStep === 4) {
      this.renderStep3OverlayPreview();
    } else if (this.currentStep === 6) {
      this.renderStep5TypographyPreview();
    }
  }

  // --- STEP 3: OVERLAYS PREVIEW (TUNNEL + GRAPHIC + DRAG HANDLES) ---
  static handleOverlayFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.wizardState.overlayFile = file;
        this.wizardState.overlayImg = img;
        const nameBadge = document.getElementById('wizard-overlay-file-name');
        if (nameBadge) {
          nameBadge.innerText = file.name;
          nameBadge.classList.remove('hidden');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  static renderStep3OverlayPreview() {
    const cvs = document.getElementById('wizard-overlay-preview-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');

    // 1. Draw live animated camera tunnel in the background
    this.renderTunnelToCanvas(cvs, ctx);

    const cw = cvs.width;
    const ch = cvs.height;

    // 2. Draw overlay graphic on top if loaded
    if (this.wizardState.overlayImg) {
      const img = this.wizardState.overlayImg;
      const posX = this.wizardState.overlayX;
      const posY = this.wizardState.overlayY;
      const scaleFactor = this.wizardState.overlayScale / 100;
      const scaleMultiplier = cw / 600;

      const finalW = img.width * scaleFactor * scaleMultiplier;
      const finalH = img.height * scaleFactor * scaleMultiplier;
      const drawX = (cw / 2) + (posX * cw) - (finalW / 2);
      const drawY = (ch / 2) + (posY * ch) - (finalH / 2);

      ctx.save();
      ctx.globalCompositeOperation = this.getCompositeOperation(this.wizardState.overlayBlend);
      ctx.drawImage(img, drawX, drawY, finalW, finalH);
      ctx.restore();

      // Bounding box & interactive drag handles
      ctx.save();
      ctx.strokeStyle = this.isDraggingOverlay ? '#00f2fe' : 'rgba(0, 242, 254, 0.45)';
      ctx.lineWidth = this.isDraggingOverlay ? 2 : 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(drawX, drawY, finalW, finalH);

      const handleSize = 6;
      ctx.fillStyle = '#00f2fe';
      ctx.fillRect(drawX - handleSize / 2, drawY - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(drawX + finalW - handleSize / 2, drawY - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(drawX - handleSize / 2, drawY + finalH - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(drawX + finalW - handleSize / 2, drawY + finalH - handleSize / 2, handleSize, handleSize);
      ctx.restore();
    }
  }

  // --- STEP 4: AUDIO STEP LOGIC ---
  static handleAudioFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const ctxAudio = getAudioContext();
        const audioBuffer = await ctxAudio.decodeAudioData(e.target.result);
        this.wizardState.audioFile = file;
        this.wizardState.audioBuffer = audioBuffer;
        this.wizardState.audioFileName = file.name;

        const channelData = audioBuffer.getChannelData(0);
        const numPeaks = 400;
        const step = Math.ceil(channelData.length / numPeaks);
        const peaks = [];
        let maxPeak = 0;
        for (let i = 0; i < numPeaks; i++) {
          let maxVal = 0;
          for (let j = 0; j < step; j++) {
            const idx = i * step + j;
            if (idx < channelData.length) {
              const absVal = Math.abs(channelData[idx]);
              if (absVal > maxVal) maxVal = absVal;
            }
          }
          peaks.push(maxVal);
          if (maxVal > maxPeak) maxPeak = maxVal;
        }
        if (maxPeak > 0) {
          for (let i = 0; i < peaks.length; i++) {
            peaks[i] /= maxPeak;
          }
        }
        this.wizardState.audioPeaks = peaks;

        const infoBadge = document.getElementById('wizard-audio-info-badge');
        if (infoBadge) {
          infoBadge.innerHTML = `<strong>${file.name}</strong> • ${audioBuffer.duration.toFixed(1)}s`;
          infoBadge.classList.remove('hidden');
        }

        this.renderWaveform(peaks);
      } catch (err) {
        console.error('Audio decode failed in wizard', err);
        alert('Could not decode audio file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  static renderWaveform(peaks) {
    const canvas = document.getElementById('wizard-waveform-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    const barW = w / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const barH = peaks[i] * h * 0.9;
      ctx.fillStyle = '#00f2fe';
      ctx.fillRect(i * barW, (h - barH) / 2, Math.max(1, barW - 1), barH);
    }
  }

  // --- STEP 5: TYPOGRAPHY PREVIEW (TUNNEL + TEXT) ---
  static renderStep5TypographyPreview() {
    const cvs = document.getElementById('wizard-text-preview-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');

    // 1. Draw live camera tunnel in background
    this.renderTunnelToCanvas(cvs, ctx);

    const cw = cvs.width;
    const ch = cvs.height;

    // 2. Draw styled text overlay
    const textStr = this.wizardState.textString.trim() || 'CYBER HORIZON // OUT NOW';
    const isPlaceholder = !this.wizardState.textString.trim();

    let color = '#00f2fe';
    if (this.wizardState.textStyle === 'hot-pink') color = '#ff007f';
    else if (this.wizardState.textStyle === 'pure-white') color = '#ffffff';

    const posY = this.wizardState.textY !== undefined ? this.wizardState.textY : 0.35;
    const drawX = cw / 2;
    const drawY = (ch / 2) + (posY * ch);
    const drawSize = Math.max(14, Math.round((this.wizardState.textSize || 42) * (cw / 500)));
    const fontFam = this.wizardState.textFont || 'Outfit';

    ctx.save();
    ctx.font = `bold ${drawSize}px "${fontFam}", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const glowRadius = (this.wizardState.textGlow !== undefined ? this.wizardState.textGlow : 20) * (cw / 500);
    if (glowRadius > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glowRadius;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    if (isPlaceholder) {
      ctx.globalAlpha = 0.45;
    }

    ctx.fillStyle = color;
    const lines = textStr.split('\n');
    const lineHeight = drawSize * 1.25;
    const totalH = lineHeight * (lines.length - 1);

    lines.forEach((line, idx) => {
      const lineY = drawY - (totalH / 2) + (idx * lineHeight);
      ctx.fillText(line, drawX, lineY);
    });

    ctx.restore();
  }

  // --- STEP 6: SUMMARY & LAUNCH ---
  static populateSummary() {
    const elRatio = document.getElementById('summary-ratio');
    const elTunnel = document.getElementById('summary-tunnel');
    const elOverlay = document.getElementById('summary-overlay');
    const elAudio = document.getElementById('summary-audio');
    const elText = document.getElementById('summary-text');

    if (elRatio) {
      elRatio.innerText = `${this.wizardState.aspectRatio.replace('-', ':')} • ${this.wizardState.duration}s Project Duration`;
    }
    if (elTunnel) {
      const count = this.wizardState.tunnelImages && this.wizardState.tunnelImages.length > 0
        ? this.wizardState.tunnelImages.length
        : (this.wizardState.tunnelImg ? 1 : 0);
      elTunnel.innerText = count > 0
        ? `${count} Image${count > 1 ? 's' : ''} in Deck • ${this.wizardState.layerCount} Depth Layers • ${this.wizardState.zoomSpeed.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') || '0'} Speed`
        : 'Default Cyber Sigil Generated';
    }
    if (elOverlay) {
      const pctX = Math.round(this.wizardState.overlayX * 100);
      const pctY = Math.round(this.wizardState.overlayY * 100);
      elOverlay.innerText = this.wizardState.overlayImg
        ? `Graphic Loaded • Pos: (${pctX > 0 ? '+' : ''}${pctX}%, ${pctY > 0 ? '+' : ''}${pctY}%) • Scale: ${this.wizardState.overlayScale}%`
        : 'None (Clean Camera Tunnel)';
    }
    if (elAudio) {
      elAudio.innerText = this.wizardState.audioBuffer
        ? `${this.wizardState.audioFileName} (${this.wizardState.audioBuffer.duration.toFixed(1)}s)`
        : 'None (Silent Visualizer)';
    }
    if (elText) {
      elText.innerText = this.wizardState.textString.trim()
        ? `"${this.wizardState.textString}" • ${this.wizardState.textFont} • ${this.wizardState.textSize || 42}px`
        : 'None';
    }
  }

  static launchDefaultStudio() {
    // If no tunnel image loaded yet, generate default sample
    if ((!this.wizardState.tunnelImages || this.wizardState.tunnelImages.length === 0) && !this.wizardState.tunnelImg) {
      this.loadSampleCyberSigil();
    }

    // Set default overlay graphic on track 1 if none uploaded
    if (!this.wizardState.overlayImg && this.wizardState.tunnelImg) {
      this.wizardState.overlayImg = this.wizardState.tunnelImg;
      this.wizardState.overlayScale = 60;
      this.wizardState.overlayX = 0.0;
      this.wizardState.overlayY = 0.0;
    }

    // Set default title text on track 2 if none configured
    if (!this.wizardState.textString.trim()) {
      this.wizardState.textString = 'VILECUT // STUDIO';
      this.wizardState.textFont = 'Outfit';
      this.wizardState.textSize = 38;
      this.wizardState.textStyle = 'neon-cyan';
      this.wizardState.textY = 0.38;
    }

    this.commitAndLaunchStudio();
  }

  static commitAndLaunchStudio() {
    HistoryManager.pushState('New Project via Wizard');

    // 1. Commit Aspect Ratio & Duration
    state.aspectRatio = this.wizardState.aspectRatio;
    if (UI.aspectRatio) UI.aspectRatio.value = this.wizardState.aspectRatio;

    const maxDur = state.isDangerZone ? 600 : 60;
    let targetDuration = this.wizardState.duration;
    if (this.wizardState.matchAudioDuration && this.wizardState.audioBuffer) {
      targetDuration = Math.ceil(this.wizardState.audioBuffer.duration);
    }
    targetDuration = Math.min(maxDur, Math.max(state.isDangerZone ? 5 : 1, Math.round(targetDuration)));
    state.exportMode = 'duration';
    state.exportDuration = targetDuration;
    if (UI.exportDuration) UI.exportDuration.value = targetDuration;
    if (UI.exportDurationVal) UI.exportDurationVal.innerText = `${targetDuration}s`;
    if (UI.timelineDurationSlider) UI.timelineDurationSlider.value = targetDuration;
    if (UI.timelineDurationVal) UI.timelineDurationVal.innerText = `${targetDuration}s`;

    // 2. Commit Tunnel Slicing Settings
    state.layerCount = this.wizardState.layerCount;
    if (UI.layerCount) UI.layerCount.value = this.wizardState.layerCount;
    if (UI.layerCountVal) UI.layerCountVal.innerText = `${this.wizardState.layerCount}`;

    state.layerEdgeFade = this.wizardState.layerEdgeFade;
    if (UI.layerEdgeFade) UI.layerEdgeFade.value = this.wizardState.layerEdgeFade;
    if (UI.layerEdgeFadeVal) UI.layerEdgeFadeVal.innerText = `${this.wizardState.layerEdgeFade}%`;

    state.zoomSpeed = this.wizardState.zoomSpeed;
    state.zoomDepth = this.wizardState.zoomDepth || 4.0;
    if (UI.zoomSpeed) UI.zoomSpeed.value = this.wizardState.zoomSpeed;
    if (UI.zoomSpeedVal) UI.zoomSpeedVal.innerText = this.wizardState.zoomSpeed.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') || '0';
    if (UI.zoomDepth) UI.zoomDepth.value = state.zoomDepth;
    if (UI.zoomDepthVal) UI.zoomDepthVal.innerText = `${state.zoomDepth.toFixed(1)}x`;

    // 3. Commit Tunnel Images Deck
    if ((!this.wizardState.tunnelImages || this.wizardState.tunnelImages.length === 0) && !this.wizardState.tunnelImg) {
      this.loadSampleCyberSigil();
    }

    if (this.wizardState.tunnelImages && this.wizardState.tunnelImages.length > 0) {
      state.uploadedImages = this.wizardState.tunnelImages.map(item => ({
        id: item.id || generateUUID(),
        name: item.name,
        img: item.img,
        layers: []
      }));
      state.activeImageIndex = 0;
      state.imageLoaded = true;

      ImageProcessor.reprocessAllImagesLayers();
      ImageProcessor.initializeRenderStack();
    } else if (this.wizardState.tunnelImg) {
      state.uploadedImages = [{
        id: generateUUID(),
        name: this.wizardState.tunnelFile ? this.wizardState.tunnelFile.name : 'Cyber_Sigil_Sample.png',
        img: this.wizardState.tunnelImg,
        layers: []
      }];
      state.activeImageIndex = 0;
      state.imageLoaded = true;

      ImageProcessor.reprocessAllImagesLayers();
      ImageProcessor.initializeRenderStack();
    }

    // Sync Deck UI in Studio
    if (typeof window.updateImagesDeckUI === 'function') {
      window.updateImagesDeckUI();
    }

    // 4. Commit Overlay Graphic with exact position
    if (this.wizardState.overlayImg) {
      const newGraphic = {
        id: 'grp_' + generateUUID(),
        img: this.wizardState.overlayImg,
        fileName: this.wizardState.overlayFile ? this.wizardState.overlayFile.name : 'Overlay_Graphic.png',
        startTime: 0,
        endTime: targetDuration,
        x: this.wizardState.overlayX !== undefined ? this.wizardState.overlayX : 0.0,
        y: this.wizardState.overlayY !== undefined ? this.wizardState.overlayY : 0.0,
        scale: this.wizardState.overlayScale,
        glitchFrequency: 10,
        glitchAmplitude: 20,
        flickerIntensity: 0,
        brightness: 100,
        contrast: 100,
        glowActive: false,
        glowRadius: 20,
        glowColor: '#ff007f',
        trackIndex: 1
      };
      state.graphics = [newGraphic];
      selectGraphic(newGraphic.id);
    }

    // 5. Commit Audio Track (preserve full audioBuffer.duration so user can freely drag/reposition on timeline)
    if (this.wizardState.audioBuffer) {
      state.audioTrack = {
        fileName: this.wizardState.audioFileName,
        buffer: this.wizardState.audioBuffer,
        timelineStart: 0.0,
        sourceOffset: 0.0,
        duration: this.wizardState.audioBuffer.duration,
        volume: 0.8,
        fadeInDuration: 0.0,
        fadeOutDuration: 0.0,
        peaks: this.wizardState.audioPeaks
      };
      const songTc = formatTimecode(this.wizardState.audioBuffer.duration);
      if (UI.songDurBadge) UI.songDurBadge.innerText = songTc;
      if (UI.exportSongDurBadge) UI.exportSongDurBadge.innerText = songTc;
      if (UI.btnMatchSongDuration) UI.btnMatchSongDuration.style.display = 'inline-flex';
      if (UI.btnExportMatchSong) UI.btnExportMatchSong.style.display = 'inline-flex';
      if (UI.audioFileName) UI.audioFileName.innerText = this.wizardState.audioFileName;
      if (UI.audioFileDuration) UI.audioFileDuration.innerText = `Length: ${this.wizardState.audioBuffer.duration.toFixed(1)}s`;
    }

    // 6. Commit Text Layer with exact size and glow
    if (this.wizardState.textString.trim()) {
      let color = '#00f2fe';
      if (this.wizardState.textStyle === 'hot-pink') color = '#ff007f';
      else if (this.wizardState.textStyle === 'pure-white') color = '#ffffff';

      const posY = this.wizardState.textY !== undefined ? this.wizardState.textY : 0.35;

      const newText = {
        id: 'txt_' + generateUUID(),
        text: this.wizardState.textString.trim(),
        fontFamily: this.wizardState.textFont || 'Outfit',
        fontSize: this.wizardState.textSize || 42,
        color: color,
        align: 'center',
        x: 0.0,
        y: posY,
        glowActive: (this.wizardState.textGlow !== undefined ? this.wizardState.textGlow : 20) > 0,
        glowRadius: this.wizardState.textGlow !== undefined ? this.wizardState.textGlow : 20,
        glowColor: color,
        animation: 'none',
        glitchActive: false,
        glitchFrequency: 20,
        glitchIntensity: 50,
        flickerIntensity: 0,
        transitionMode: 'fade-blur',
        transitionDuration: 0.4,
        startTime: 0,
        endTime: targetDuration,
        trackIndex: 2
      };
      state.texts = [newText];
      selectText(newText.id);
    }

    // 7. Refresh Viewport & Start Paused (so user can inspect/edit before playing)
    state.isPlaying = false;
    state.time = 0;
    state.prevTime = 0;
    if (UI.btnPlayPause) UI.btnPlayPause.classList.remove('active');
    if (UI.playPauseIcon) UI.playPauseIcon.setAttribute('data-lucide', 'play');
    if (UI.fpsValue) UI.fpsValue.innerText = 'IDLE';

    resizeMainCanvas();
    if (typeof window.setProjectDuration === 'function') {
      window.setProjectDuration(targetDuration);
    } else {
      updateTimelineRuler();
      updateTimelineTracks();
      updatePlayhead();
    }
    renderFrame(state.time);
    engine.start();

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    // 8. Close Wizard
    this.close(true);

    // Auto-expand layer isolation & extracted layers panels for convenience
    if (UI.layerIsolationSection) UI.layerIsolationSection.classList.remove('collapsed');
    if (UI.extractedLayersSection) UI.extractedLayersSection.classList.remove('collapsed');
  }
}
