import { state } from './state.js';
import { UI } from './ui.js';
import { getTimelineDuration } from './utils.js';
import { stopAudioSource, getAudioContext, exportAudioNode, setExportAudioNode, syncExportAudio, syncAudioPlayback } from './audio.js';
import { GlitchManager } from './glitch.js';
import { renderFrame, resizeMainCanvas } from './renderer.js';

export class VideoExporter {
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



    // Initialize export audio routing
    if (state.audioTrack) {
      try {
        const ctx = getAudioContext();
        setExportAudioNode(ctx.createMediaStreamDestination());
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

    // Reset wrap counts for all layers to align with starting time 0.0, using null to force initial frame recalculation
    state.layers.forEach(layer => {
      layer.lastWrapCount = null;
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

      // Audio sync during export (calls isolated logic inside audio.js)
      lastExportLoopIndex = syncExportAudio(state.time, lastExportLoopIndex);

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
    setExportAudioNode(null);
    UI.exportOverlay.classList.add('hidden');
    
    UI.mainCanvas.width = origW;
    UI.mainCanvas.height = origH;
    
    resizeMainCanvas();
  }
}
