import { state } from './state.js';
import { UI } from './ui.js';
import { getTimelineDuration, getAdjustedZoomSpeed, getPseudoRandom, applyEdgeFade } from './utils.js';
import { GlitchManager } from './glitch.js';
import { GeometricFxManager } from './geometric_fx.js';
import { VhsFxManager } from './vhs_fx.js';
import { drawTextOverlays, drawGraphicOverlays, drawVideoOverlay } from './overlays.js';

export const offscreenCanvas = document.createElement('canvas');
export const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
export const videoBufferCanvas = document.createElement('canvas');
export const videoBufferCtx = videoBufferCanvas.getContext('2d');
export const videoMaskCanvas = document.createElement('canvas');
export const videoMaskCtx = videoMaskCanvas.getContext('2d');
export const kaleidoscopeMaskCanvas = document.createElement('canvas');
export const kaleidoscopeMaskCtx = kaleidoscopeMaskCanvas.getContext('2d');
export const ctx = UI.mainCanvas.getContext('2d');

let lastVideoBufferFilter = '';

export function resizeMainCanvas() {
  const container = UI.mainCanvas.parentElement;
  if (!container) return;

  // Calculate layout aspect ratio from state.aspectRatio or active image
  let ratio = 16 / 9;
  const arMode = state.aspectRatio || '16-9';
  if (arMode === '16-9') ratio = 16 / 9;
  else if (arMode === '9-16') ratio = 9 / 16;
  else if (arMode === '1-1') ratio = 1 / 1;
  else if (arMode === '4-5') ratio = 4 / 5;
  else if (arMode === '21-9') ratio = 21 / 9;
  else if (state.uploadedImages.length > 0 && state.activeImageIndex !== -1) {
    const activeImgObj = state.uploadedImages[state.activeImageIndex];
    if (activeImgObj && activeImgObj.img) {
      const nw = activeImgObj.img.naturalWidth || activeImgObj.img.width;
      const nh = activeImgObj.img.naturalHeight || activeImgObj.img.height;
      if (nw && nh) ratio = nw / nh;
    }
  }

  // Resize viewport container to preserve aspect ratio framing in CSS
  container.style.aspectRatio = ratio;

  const cw = container.clientWidth || 640;
  const ch = container.clientHeight || Math.round(cw / ratio);

  let canvasW = cw;
  let canvasH = cw / ratio;

  if (canvasH > ch) {
    canvasH = ch;
    canvasW = ch * ratio;
  }

  UI.mainCanvas.width = Math.max(2, Math.round(canvasW));
  UI.mainCanvas.height = Math.max(2, Math.round(canvasH));

  // Size offscreen canvas buffer to match the active ratio with 1024px bounds for real-time preview
  const maxDim = 1024;
  if (ratio >= 1.0) {
    offscreenCanvas.width = maxDim;
    offscreenCanvas.height = Math.max(2, Math.round(maxDim / ratio));
  } else {
    offscreenCanvas.height = maxDim;
    offscreenCanvas.width = Math.max(2, Math.round(maxDim * ratio));
  }
}

export function renderFrame(renderTime) {
  const hasTunnel = state.uploadedImages.length > 0 && state.layers.length > 0;
  const hasVideos = state.videoBlocks && state.videoBlocks.length > 0;
  const hasGraphics = state.graphics && state.graphics.length > 0;
  const hasTexts = state.texts && state.texts.length > 0;

  const canvasW = UI.mainCanvas.width;
  const canvasH = UI.mainCanvas.height;
  if (canvasW <= 0 || canvasH <= 0) return;

  if (!hasTunnel && !hasVideos && !hasGraphics && !hasTexts) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasW, canvasH);
    return;
  }

  // During high-res video export or PNG snapshot, match offscreen buffer to target output resolution
  if (state.isExporting || state.isHighResSnapshot) {
    const targetW = Math.min(1920, canvasW);
    const targetH = Math.min(1920, canvasH);
    if (offscreenCanvas.width !== targetW || offscreenCanvas.height !== targetH) {
      offscreenCanvas.width = targetW;
      offscreenCanvas.height = targetH;
    }
  }

  const bufferCanvas = offscreenCanvas;
  const bw = bufferCanvas.width;
  const bh = bufferCanvas.height;
  const resScale = bw / 1024;
  
  const dur = getTimelineDuration();
  const loopTime = ((renderTime % dur) + dur) % dur;

  const activeBlock = state.videoBlocks ? state.videoBlocks.find(b => (b.trackIndex || 0) === 0 && loopTime >= b.startTime && loopTime < b.endTime) : null;
  if (activeBlock && activeBlock.element) {
    if (videoBufferCanvas.width !== bw || videoBufferCanvas.height !== bh) {
      videoBufferCanvas.width = bw;
      videoBufferCanvas.height = bh;
      lastVideoBufferFilter = '';
    }
    const brightnessVal = activeBlock.brightness !== undefined ? activeBlock.brightness : 100;
    const contrastVal = activeBlock.contrast !== undefined ? activeBlock.contrast : 100;
    const monochromeStr = activeBlock.monochrome ? 'grayscale(100%)' : '';
    const newFilter = `brightness(${brightnessVal}%) contrast(${contrastVal}%) ${monochromeStr}`.trim() || 'none';
    if (lastVideoBufferFilter !== newFilter || videoBufferCtx.filter !== newFilter) {
      videoBufferCtx.filter = newFilter;
      lastVideoBufferFilter = newFilter;
    }
    videoBufferCtx.clearRect(0, 0, bw, bh);

    const video = activeBlock.element;
    const vw = video.videoWidth || video.width || bw;
    const vh = video.videoHeight || video.height || bh;
    const coverScale = Math.max(bw / vw, bh / vh);
    const scaleFactor = (activeBlock.scale !== undefined ? activeBlock.scale : 100) / 100;
    const drawW = vw * coverScale * scaleFactor;
    const drawH = vh * coverScale * scaleFactor;
    const drawX = (bw - drawW) / 2 + (activeBlock.x !== undefined ? activeBlock.x : 0.0) * bw;
    const drawY = (bh - drawH) / 2 + (activeBlock.y !== undefined ? activeBlock.y : 0.0) * bh;
    videoBufferCtx.drawImage(video, drawX, drawY, drawW, drawH);
    if (activeBlock.edgeFade > 0) {
      applyEdgeFade(videoBufferCtx, drawX, drawY, drawW, drawH, activeBlock.edgeFade);
    }

    const mode = activeBlock.mirrorMode || 'none';
    
    offscreenCtx.fillStyle = '#000000';
    offscreenCtx.fillRect(0, 0, bw, bh);

    let opacity = 1.0;
    const elapsed = loopTime - activeBlock.startTime;
    const remaining = activeBlock.endTime - loopTime;
    const fadeInDur = activeBlock.fadeInDuration || 0.0;
    const fadeOutDur = activeBlock.fadeOutDuration || 0.0;
    
    if (fadeInDur > 0 && elapsed < fadeInDur) {
      opacity = Math.max(0, Math.min(1, elapsed / fadeInDur));
    } else if (fadeOutDur > 0 && remaining < fadeOutDur) {
      opacity = Math.max(0, Math.min(1, remaining / fadeOutDur));
    }
    
    const prevAlpha = offscreenCtx.globalAlpha;
    offscreenCtx.globalAlpha = prevAlpha * opacity;

    if (mode === 'none') {
      offscreenCtx.drawImage(videoBufferCanvas, 0, 0);
    }
    else if (mode === 'horizontal') {
      offscreenCtx.drawImage(videoBufferCanvas, 0, 0, bw / 2, bh, 0, 0, bw / 2, bh);
      offscreenCtx.save();
      offscreenCtx.translate(bw, 0);
      offscreenCtx.scale(-1, 1);
      offscreenCtx.drawImage(videoBufferCanvas, 0, 0, bw / 2, bh, 0, 0, bw / 2, bh);
      offscreenCtx.restore();
    }
    else if (mode === 'vertical') {
      offscreenCtx.drawImage(videoBufferCanvas, 0, 0, bw, bh / 2, 0, 0, bw, bh / 2);
      offscreenCtx.save();
      offscreenCtx.translate(0, bh);
      offscreenCtx.scale(1, -1);
      offscreenCtx.drawImage(videoBufferCanvas, 0, 0, bw, bh / 2, 0, 0, bw, bh / 2);
      offscreenCtx.restore();
    }
    else if (mode === 'quad') {
      const qw = bw / 2;
      const qh = bh / 2;
      offscreenCtx.drawImage(videoBufferCanvas, 0, 0, bw / 2, bh / 2, 0, 0, qw, qh);
      
      offscreenCtx.save();
      offscreenCtx.translate(bw, 0);
      offscreenCtx.scale(-1, 1);
      offscreenCtx.drawImage(videoBufferCanvas, 0, 0, bw / 2, bh / 2, 0, 0, qw, qh);
      offscreenCtx.restore();

      offscreenCtx.save();
      offscreenCtx.translate(0, bh);
      offscreenCtx.scale(1, -1);
      offscreenCtx.drawImage(videoBufferCanvas, 0, 0, bw / 2, bh / 2, 0, 0, qw, qh);
      offscreenCtx.restore();

      offscreenCtx.save();
      offscreenCtx.translate(bw, bh);
      offscreenCtx.scale(-1, -1);
      offscreenCtx.drawImage(videoBufferCanvas, 0, 0, bw / 2, bh / 2, 0, 0, qw, qh);
      offscreenCtx.restore();
    }
    else if (mode === 'kaleidoscope') {
      const cx = bw / 2;
      const cy = bh / 2;
      const radius = Math.sqrt(cx * cx + cy * cy);
      const slices = activeBlock.kaleidoscopeSlices || 8;
      const angle = (Math.PI * 2) / slices;

      offscreenCtx.save();
      offscreenCtx.translate(cx, cy);

      if (videoMaskCanvas.width !== bw || videoMaskCanvas.height !== bh) {
        videoMaskCanvas.width = bw;
        videoMaskCanvas.height = bh;
      }
      videoMaskCtx.clearRect(0, 0, bw, bh);
      
      videoMaskCtx.save();
      videoMaskCtx.translate(cx, cy);
      videoMaskCtx.beginPath();
      videoMaskCtx.moveTo(0, 0);
      videoMaskCtx.arc(0, 0, radius, -angle / 2, angle / 2);
      videoMaskCtx.closePath();
      videoMaskCtx.clip();
      videoMaskCtx.drawImage(videoBufferCanvas, -cx, -cy, bw, bh);
      videoMaskCtx.restore();

      for (let s = 0; s < slices; s++) {
        offscreenCtx.save();
        offscreenCtx.rotate(s * angle);
        if (s % 2 === 1) {
          offscreenCtx.scale(1, -1);
        }
        offscreenCtx.drawImage(videoMaskCanvas, -cx, -cy);
        offscreenCtx.restore();
      }
      offscreenCtx.restore();
    }
    offscreenCtx.globalAlpha = prevAlpha;
  } else {
    offscreenCtx.fillStyle = '#000000';
    offscreenCtx.fillRect(0, 0, bw, bh);
  }

  // Draw Track 0 Graphic Overlays on offscreenCtx (behind zooming layers)
  drawGraphicOverlays(offscreenCtx, bw, bh, renderTime, 0);

  // Draw Track 0 Text Overlays on offscreenCtx (behind zooming layers)
  drawTextOverlays(offscreenCtx, bw, bh, renderTime, 0);

  if (hasTunnel) {
    const speed = getAdjustedZoomSpeed(dur);
    const omega = (2 * Math.PI) / dur;
    const depthModActive = state.glitchEnabled && state.depthModulation > 0;
    const depthModIntensity = depthModActive ? state.depthModulation / 100 : 0;

    // Hoist loop-invariant modulated zoom depth calculation outside layers.map()
    let currentZoomDepth = state.zoomDepth;
    if (depthModActive) {
      const wave1 = Math.sin(renderTime * omega) * 0.5;
      const wave2 = Math.cos(renderTime * omega * 2) * 0.25;
      const wave3 = Math.sin(renderTime * omega * 3) * 0.12;
      const noise = wave1 + wave2 + wave3;
      const depthOffset = noise * depthModIntensity * 3.0;
      currentZoomDepth = Math.max(1.2, state.zoomDepth + depthOffset);
    }
    if (state.glitchEnabled && state.glitchZoomBoostTimer > 0) {
      currentZoomDepth = Math.max(1.2, currentZoomDepth * (1.0 + state.glitchZoomBoostTimer * 1.5));
    }

    const layerDepths = state.layers.map(layer => {
      const zRawLinear = layer.initialZ + renderTime * speed;
      let wrapCount = Math.floor(zRawLinear);
      if (wrapCount !== layer.lastWrapCount) {
        layer.lastWrapCount = wrapCount;
        if (state.uploadedImages.length > 0) {
          const seed = layer.index * 17.3 + wrapCount * 29.7;
          const imgIdx = Math.floor(getPseudoRandom(seed) * state.uploadedImages.length);
          const randomImgObj = state.uploadedImages[imgIdx];
          layer.canvas = randomImgObj.layers[layer.index];
          layer.sourceImageId = randomImgObj.id;
        }
      }
      
      let z = zRawLinear % 1.0;
      if (z < 0) z += 1.0;

      // Apply layer-specific dynamic depth shift
      if (depthModActive) {
        const phase = layer.index * 1.5;
        const harmonic = (layer.index % 2) + 1;
        z += Math.sin(renderTime * omega * harmonic + phase) * depthModIntensity * 0.15;
        z = ((z % 1.0) + 1.0) % 1.0;
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
      offscreenCtx.translate(state.shakeX * resScale, state.shakeY * resScale);
      offscreenCtx.rotate(state.shakeRot);
    }

    if (state.cameraDrift > 0) {
      const driftX = Math.sin(renderTime * 1.5) * state.cameraDrift * 30 * resScale;
      const driftY = Math.cos(renderTime * 0.9) * state.cameraDrift * 20 * resScale;
      offscreenCtx.translate(driftX, driftY);
    }

    const cameraAngle = state.cameraRotationBase + (state.cameraRotation * renderTime) * (Math.PI / 180);

    layerDepths.forEach(({ layer, z, scale, opacity }) => {
      if (opacity <= 0 || !layer.canvas) return;

      offscreenCtx.save();
      offscreenCtx.translate(bw / 2, bh / 2);
      
      const twist = cameraAngle * (1.0 - z * 0.4);
      offscreenCtx.rotate(twist);

      const lw = layer.canvas.width;
      const lh = layer.canvas.height;
      const coverScale = Math.max(bw / lw, bh / lh);

      offscreenCtx.scale(scale * coverScale, scale * coverScale);
      offscreenCtx.globalAlpha = opacity;
      
      offscreenCtx.drawImage(layer.canvas, -lw / 2, -lh / 2);
      offscreenCtx.restore();
    });
    offscreenCtx.restore();
  }

  if (state.glitchEnabled) {
    GlitchManager.applyPostProcessGlitches(offscreenCtx, bw, bh);
  }

  if (state.geometricEnabled) {
    GeometricFxManager.apply(offscreenCtx, bw, bh);
  }

  if (state.vhsEnabled && state.vhsScope === 'tunnel') {
    VhsFxManager.apply(offscreenCtx, bw, bh, renderTime);
  }

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

    if (kaleidoscopeMaskCanvas.width !== canvasW || kaleidoscopeMaskCanvas.height !== canvasH) {
      kaleidoscopeMaskCanvas.width = canvasW;
      kaleidoscopeMaskCanvas.height = canvasH;
    }
    const mCtx = kaleidoscopeMaskCtx;
    mCtx.clearRect(0, 0, canvasW, canvasH);
    
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
      ctx.drawImage(kaleidoscopeMaskCanvas, -cx, -cy);
      ctx.restore();
    }
    ctx.restore();
  }

  // Draw Foreground Tracks (Track 1 and above) sequentially
  const trackIndices = [0];
  state.texts.forEach(t => trackIndices.push(t.trackIndex !== undefined ? t.trackIndex : 0));
  state.graphics.forEach(g => trackIndices.push(g.trackIndex !== undefined ? g.trackIndex : 0));
  if (state.videoBlocks) {
    state.videoBlocks.forEach(v => trackIndices.push(v.trackIndex !== undefined ? v.trackIndex : 0));
  }
  const maxTrackIdx = Math.max(...trackIndices);

  for (let trackIdx = 1; trackIdx <= maxTrackIdx; trackIdx++) {
    // 1. Draw video overlays on this track
    if (state.videoBlocks) {
      const trackVideos = state.videoBlocks.filter(v => (v.trackIndex !== undefined ? v.trackIndex : 0) === trackIdx);
      trackVideos.forEach(vid => {
        drawVideoOverlay(ctx, canvasW, canvasH, renderTime, vid);
      });
    }
    
    // 2. Draw graphic overlays on this track
    drawGraphicOverlays(ctx, canvasW, canvasH, renderTime, trackIdx);

    // 3. Draw text overlays on this track
    drawTextOverlays(ctx, canvasW, canvasH, renderTime, trackIdx);
  }

  // Vintage VHS & Analog Camcorder FX (Full Composite Pipeline)
  if (state.vhsEnabled && state.vhsScope !== 'tunnel') {
    VhsFxManager.apply(ctx, canvasW, canvasH, renderTime);
  }

  // Draw Global Fade In/Out Overlay
  let overlayAlpha = 0;
  
  let totalVideoLen = dur;
  if (state.isExporting) {
    if (state.exportMode === 'duration') {
      totalVideoLen = state.exportDuration;
    } else {
      const absSpeed = Math.abs(state.zoomSpeed);
      if (absSpeed > 0.0001) {
        totalVideoLen = state.exportLoops / absSpeed;
      }
    }
  }

  if (state.videoFadeInActive) {
    const fadeInDur = Math.min(state.videoFadeInDuration || 0.5, totalVideoLen / 2);
    if (renderTime < fadeInDur) {
      overlayAlpha = Math.max(overlayAlpha, 1.0 - (renderTime / fadeInDur));
    }
  }
  
  if (state.videoFadeOutActive) {
    const fadeOutDur = Math.min(state.videoFadeOutDuration || 0.5, totalVideoLen / 2);
    if (renderTime > totalVideoLen - fadeOutDur) {
      overlayAlpha = Math.max(overlayAlpha, (renderTime - (totalVideoLen - fadeOutDur)) / fadeOutDur);
    }
  }
  
  if (overlayAlpha > 0) {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = Math.max(0, Math.min(1, overlayAlpha));
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
  }
}
