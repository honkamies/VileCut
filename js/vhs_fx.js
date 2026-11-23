import { state } from './state.js';

// Precomputed noise table for high-performance deterministic noise without per-pixel Math.random()
const NOISE_SIZE = 16384;
const NOISE_MASK = NOISE_SIZE - 1;
let noiseTable = null;

function getNoiseTable() {
  if (!noiseTable) {
    noiseTable = new Float32Array(NOISE_SIZE);
    for (let i = 0; i < NOISE_SIZE; i++) {
      noiseTable[i] = Math.random() * 2.0 - 1.0;
    }
  }
  return noiseTable;
}

// Reusable scratch canvases and buffers to prevent garbage collection stutter
let scratchCanvas = null;
let scratchCtx = null;
let softnessCanvas = null;
let softnessCtx = null;
let scanlineRawCanvas = null;
let scanlineRawCtx = null;
let scanlineBlurCanvas = null;
let scanlineBlurCtx = null;
let lastScanlineKey = '';
let degradCanvas = null;
let degradCtx = null;
let degradImgData = null;
let dstImgData = null;
let lineOffsets = null;
let lineNoise = null;
let creaseLuma = null;

function getScratchContext(w, h) {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (scratchCanvas.width !== w || scratchCanvas.height !== h) {
    scratchCanvas.width = w;
    scratchCanvas.height = h;
  }
  return { canvas: scratchCanvas, ctx: scratchCtx };
}

function getSoftnessContext(w, h) {
  if (!softnessCanvas) {
    softnessCanvas = document.createElement('canvas');
    softnessCtx = softnessCanvas.getContext('2d');
  }
  if (softnessCanvas.width !== w || softnessCanvas.height !== h) {
    softnessCanvas.width = w;
    softnessCanvas.height = h;
  }
  return { canvas: softnessCanvas, ctx: softnessCtx };
}

function getDstImageData(ctx, w, h) {
  if (!dstImgData || dstImgData.width !== w || dstImgData.height !== h) {
    dstImgData = ctx.createImageData(w, h);
  }
  return dstImgData;
}

function getDegradContext(w, h) {
  if (!degradCanvas) {
    degradCanvas = document.createElement('canvas');
    degradCtx = degradCanvas.getContext('2d');
  }
  if (degradCanvas.width !== w || degradCanvas.height !== h) {
    degradCanvas.width = w;
    degradCanvas.height = h;
    degradImgData = degradCtx.createImageData(w, h);
  } else if (!degradImgData) {
    degradImgData = degradCtx.createImageData(w, h);
  }
  return { canvas: degradCanvas, ctx: degradCtx, imgData: degradImgData };
}

function ensureLineBuffers(h) {
  if (!lineOffsets || lineOffsets.length < h) {
    lineOffsets = new Int32Array(h);
    lineNoise = new Uint8Array(h);
    creaseLuma = new Float32Array(h);
  }
  return { lineOffsets, lineNoise, creaseLuma };
}

export const VHS_PRESETS = {
  camcorder: {
    vhsVerticalJump: 8,
    vhsTrackingNoise: 15,
    vhsTapeCrease: 10,
    vhsDegradationBlur: 40,
    vhsDegradationOpacity: 75,
    vhsWobble: 22,
    vhsGrain: 25,
    vhsSoftness: 30,
    vhsChromaBleed: 35,
    vhsColorDecay: 15,
    vhsScanlines: 20,
    vhsScanlineBlur: 50
  },
  worn: {
    vhsVerticalJump: 22,
    vhsTrackingNoise: 45,
    vhsTapeCrease: 35,
    vhsDegradationBlur: 45,
    vhsDegradationOpacity: 80,
    vhsWobble: 50,
    vhsGrain: 40,
    vhsSoftness: 55,
    vhsChromaBleed: 60,
    vhsColorDecay: 40,
    vhsScanlines: 35,
    vhsScanlineBlur: 60
  },
  damaged: {
    vhsVerticalJump: 55,
    vhsTrackingNoise: 75,
    vhsTapeCrease: 65,
    vhsDegradationBlur: 35,
    vhsDegradationOpacity: 90,
    vhsWobble: 80,
    vhsGrain: 60,
    vhsSoftness: 70,
    vhsChromaBleed: 85,
    vhsColorDecay: 65,
    vhsScanlines: 48,
    vhsScanlineBlur: 65
  },
  subtle: {
    vhsVerticalJump: 0,
    vhsTrackingNoise: 5,
    vhsTapeCrease: 0,
    vhsDegradationBlur: 55,
    vhsDegradationOpacity: 50,
    vhsWobble: 12,
    vhsGrain: 18,
    vhsSoftness: 20,
    vhsChromaBleed: 22,
    vhsColorDecay: 10,
    vhsScanlines: 12,
    vhsScanlineBlur: 55
  },
  cctv: {
    vhsVerticalJump: 18,
    vhsTrackingNoise: 35,
    vhsTapeCrease: 15,
    vhsDegradationBlur: 30,
    vhsDegradationOpacity: 75,
    vhsWobble: 25,
    vhsGrain: 50,
    vhsSoftness: 45,
    vhsChromaBleed: 10,
    vhsColorDecay: 70,
    vhsScanlines: 60,
    vhsScanlineBlur: 40
  }
};

export class VhsFxManager {
  /**
   * Main entry point called by renderer.js on the designated canvas context.
   * @param {CanvasRenderingContext2D} targetCtx - The rendering context (either composite ctx or offscreenCtx).
   * @param {number} w - Canvas pixel width.
   * @param {number} h - Canvas pixel height.
   * @param {number} renderTime - Current rendering timestamp in seconds.
   */
  static apply(targetCtx, w, h, renderTime) {
    if (!state.vhsEnabled || w <= 0 || h <= 0) return;

    const noise = getNoiseTable();
    const frameSeed = Math.floor((renderTime * 60) * 1009) & NOISE_MASK;

    const vJumpAmount = (state.vhsVerticalJump || 0) / 100;
    const trackingAmount = (state.vhsTrackingNoise || 0) / 100;
    const creaseAmount = (state.vhsTapeCrease || 0) / 100;
    const degradBlurAmount = (state.vhsDegradationBlur !== undefined ? state.vhsDegradationBlur : 40) / 100;
    const degradOpacityAmount = (state.vhsDegradationOpacity !== undefined ? state.vhsDegradationOpacity : 75) / 100;
    const wobbleAmount = (state.vhsWobble || 0) / 100;
    const grainAmount = (state.vhsGrain || 0) / 100;
    const softnessAmount = (state.vhsSoftness || 0) / 100;
    const bleedAmount = (state.vhsChromaBleed || 0) / 100;
    const decayAmount = (state.vhsColorDecay || 0) / 100;
    const scanlineAmount = (state.vhsScanlines || 0) / 100;
    const scanlineBlurAmount = (state.vhsScanlineBlur !== undefined ? state.vhsScanlineBlur : 50) / 100;

    // Downscale CPU pixel pass to max 640px on long edge (9x faster at 1080p, authentic analog VHS resolution)
    const maxProcDim = 640;
    const needsDownscale = (w > maxProcDim || h > maxProcDim);
    const procScale = needsDownscale ? (maxProcDim / Math.max(w, h)) : 1.0;
    const pw = needsDownscale ? Math.max(160, Math.round(w * procScale)) : w;
    const ph = needsDownscale ? Math.max(160, Math.round(h * procScale)) : h;

    // 1. VERTICAL JUMP & V-HOLD SLIP CALCULATION
    let vShift = 0;
    let isRolling = false;
    let rollBarCenterY = -999;
    let rollBarHalfHeight = 0;

    if (vJumpAmount > 0) {
      // 60Hz micro-jitter (mechanical tape transport tolerance)
      const microJitter = Math.sin(renderTime * 59.94) * (vJumpAmount * 2.8);

      // Periodic vertical roll / V-Hold lock failure
      const rollPeriod = Math.max(1.8, 6.0 - vJumpAmount * 4.2);
      const rollPhase = (renderTime % rollPeriod) / 0.55; // Roll animation duration ~0.55s

      let rollOffset = 0;
      if (rollPhase < 1.0 && vJumpAmount >= 0.15) {
        isRolling = true;
        // Smooth sine acceleration of rolling tape
        const rollProgress = 0.5 - 0.5 * Math.cos(rollPhase * Math.PI);
        rollOffset = rollProgress * ph;
        rollBarCenterY = Math.round(rollOffset % ph);
        rollBarHalfHeight = Math.max(6, Math.round(ph * 0.045));
      }

      vShift = Math.round(microJitter + rollOffset);
    }

    // 2. HORIZONTAL SCANLINE PRECOMPUTATION (Wobble, Crease, Tracking Noise)
    const { lineOffsets: offsets, lineNoise: noiseFlags, creaseLuma: lumaBoost } = ensureLineBuffers(ph);

    const redShift = Math.round(3.5 * bleedAmount);
    const blueShift = Math.round(2.0 * bleedAmount);

    const creaseCycle = (renderTime * 0.22) % 1.25 - 0.12;
    const creaseCenterY = creaseCycle * ph;
    const creaseHalfH = Math.max(5, ph * 0.038 * creaseAmount);

    const trackingBarCycle = (renderTime * 0.07) % 1.3 - 0.15;
    const trackBarY = trackingBarCycle * ph;
    const trackBarH = ph * (0.04 + 0.08 * trackingAmount);
    const bottomNoiseY = ph * (1.0 - 0.05 - 0.05 * trackingAmount);

    for (let y = 0; y < ph; y++) {
      let srcY = (y - vShift) % ph;
      if (srcY < 0) srcY += ph;

      // A. WOBBLE & TBC FLUTTER
      let offX = 0;
      if (wobbleAmount > 0) {
        // Flag-waving: top 25% raster curvature
        const topDist = Math.max(0, 1.0 - (srcY / (ph * 0.25)));
        const flagWave = Math.sin(renderTime * 4.5 + srcY * 0.018) * (topDist * topDist * 25.0 * wobbleAmount * procScale);
        
        // Capstan flutter undulating wave
        const flutter = (Math.sin(srcY * 0.05 + renderTime * 7.5) * 0.7 + Math.cos(srcY * 0.13 - renderTime * 11.0) * 0.3) * (5.5 * wobbleAmount * procScale);
        
        // Scanline micro-jitter
        const lineJitter = noise[(srcY * 17 + frameSeed) & NOISE_MASK] * (1.8 * wobbleAmount);
        offX = flagWave + flutter + lineJitter;
      }

      // B. TAPE CREASE (Sweeping warped fold & halo)
      let cLuma = 0;
      if (creaseAmount > 0) {
        const dyCrease = Math.abs(y - creaseCenterY);
        if (dyCrease < creaseHalfH) {
          const cFactor = Math.sin((1.0 - dyCrease / creaseHalfH) * Math.PI);
          offX += (Math.sin(y * 0.45) * 16.0 + 22.0) * cFactor * creaseAmount * procScale;
          cLuma = cFactor * creaseAmount * 140.0;
        }
      }
      lumaBoost[y] = cLuma;

      // C. TRACKING NOISE (Bottom head-switching + wandering RF bar)
      let isNoise = 0;
      if (trackingAmount > 0) {
        if (y > bottomNoiseY) {
          offX += (Math.sin(y * 0.85 + renderTime * 28.0) * 14.0 + noise[(y * 43 + frameSeed) & NOISE_MASK] * 32.0) * trackingAmount * procScale;
          isNoise = 1; // Bottom head-switching zone
        }

        const distToBar = Math.abs(y - trackBarY);
        if (trackingAmount > 0.12 && distToBar < trackBarH) {
          const barInt = 1.0 - distToBar / trackBarH;
          offX += noise[(y * 61 + frameSeed) & NOISE_MASK] * 45.0 * barInt * trackingAmount * procScale;
          isNoise = 2; // Wandering RF static bar
        }
      }

      offsets[y] = Math.round(offX);
      noiseFlags[y] = isNoise;
    }

    // 3. PIXEL DISPLACEMENT & PROCESSING PASS
    const { canvas: sCanvas, ctx: sCtx } = getScratchContext(pw, ph);
    let srcImgData;
    if (needsDownscale) {
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = 'low';
      sCtx.drawImage(targetCtx.canvas, 0, 0, pw, ph);
      srcImgData = sCtx.getImageData(0, 0, pw, ph);
    } else {
      srcImgData = targetCtx.getImageData(0, 0, pw, ph);
    }
    const src = srcImgData.data;

    const dstImg = getDstImageData(sCtx, pw, ph);
    const dst = dstImg.data;

    const wantDegradLayer = degradOpacityAmount > 0.005 && (isRolling || trackingAmount > 0 || creaseAmount > 0);
    let degradObj = null;
    let degradData = null;
    let hasDegradPixels = false;
    if (wantDegradLayer) {
      degradObj = getDegradContext(pw, ph);
      degradData = degradObj.imgData.data;
      degradData.fill(0);
    }

    const decayLiftR = Math.round(18 * decayAmount);
    const decayLiftG = Math.round(16 * decayAmount);
    const decayLiftB = Math.round(14 * decayAmount);
    const decayScaleR = 1.0 - 0.12 * decayAmount;
    const decayScaleG = 1.0 - 0.10 * decayAmount;
    const decayScaleB = 1.0 - 0.14 * decayAmount;

    const grainLumaMult = grainAmount * 28;
    const grainChromaMult = grainAmount * 15;

    const wMinusOne = pw - 1;

    for (let y = 0; y < ph; y++) {
      let srcY = (y - vShift) % ph;
      if (srcY < 0) srcY += ph;

      const dstRow = y * pw * 4;
      const srcRow = srcY * pw * 4;
      const offX = offsets[y];
      const isNoise = noiseFlags[y];
      const cLuma = lumaBoost[y];
      const yNoiseOffset = (y * 97 + frameSeed) & NOISE_MASK;

      // Vertical Blanking Interval (VBI) bar during frame slip -> paint to degradation overlay
      if (wantDegradLayer && isRolling && Math.abs(y - rollBarCenterY) < rollBarHalfHeight) {
        hasDegradPixels = true;
        const vbiNoise = (noise[(y * 23 + frameSeed) & NOISE_MASK] > 0.4);
        for (let x = 0; x < pw; x++) {
          const dstIdx = dstRow + (x << 2);
          const val = vbiNoise ? ((noise[(x * 19 + yNoiseOffset) & NOISE_MASK] * 128 + 128) | 0) : 12;
          degradData[dstIdx] = val;
          degradData[dstIdx + 1] = val;
          degradData[dstIdx + 2] = val;
          degradData[dstIdx + 3] = 255;
        }
      } else if (wantDegradLayer && isNoise && (noise[(yNoiseOffset + 13) & NOISE_MASK] > (isNoise === 1 ? 0.32 : 0.50))) {
        // Tracking RF static scanline burst -> paint to degradation overlay
        hasDegradPixels = true;
        for (let x = 0; x < pw; x++) {
          const dstIdx = dstRow + (x << 2);
          const staticVal = (noise[(x * 47 + yNoiseOffset) & NOISE_MASK] * 127 + 128) | 0;
          degradData[dstIdx] = staticVal;
          degradData[dstIdx + 1] = staticVal;
          degradData[dstIdx + 2] = staticVal;
          degradData[dstIdx + 3] = 255;
        }
      } else if (wantDegradLayer && cLuma > 1) {
        // Tape Crease bright halo -> paint to degradation overlay so blur & opacity apply cleanly
        hasDegradPixels = true;
        const haloAlpha = Math.min(255, Math.round(cLuma * 1.6));
        for (let x = 0; x < pw; x++) {
          const dstIdx = dstRow + (x << 2);
          degradData[dstIdx] = 255;
          degradData[dstIdx + 1] = 250;
          degradData[dstIdx + 2] = 240;
          degradData[dstIdx + 3] = haloAlpha;
        }
      }

      for (let x = 0; x < pw; x++) {
        let sx = x + offX;
        if (sx < 0) sx = 0; else if (sx > wMinusOne) sx = wMinusOne;

        let rx = sx - redShift;
        if (rx < 0) rx = 0; else if (rx > wMinusOne) rx = wMinusOne;

        let bx = sx + blueShift;
        if (bx < 0) bx = 0; else if (bx > wMinusOne) bx = wMinusOne;

        let r = src[srcRow + (rx << 2)];
        let g = src[srcRow + (sx << 2) + 1];
        let b = src[srcRow + (bx << 2) + 2];

        // Analog Magnetic Grain (Luma & Chroma noise)
        if (grainAmount > 0) {
          const nLuma = noise[(x + yNoiseOffset) & NOISE_MASK] * grainLumaMult;
          const nChroma = noise[((x >> 2) + ((y >> 1) * 43) + frameSeed) & NOISE_MASK] * grainChromaMult;
          r += nLuma + nChroma;
          g += nLuma;
          b += nLuma - nChroma;
        }

        // Color Decay (NTSC 7.5 IRE lifted blacks, contrast compression & vintage tint)
        if (decayAmount > 0) {
          r = r * decayScaleR + decayLiftR;
          g = g * decayScaleG + decayLiftG + 2 * decayAmount;
          b = b * decayScaleB + decayLiftB;
        }

        const dstIdx = dstRow + (x << 2);
        dst[dstIdx] = r;
        dst[dstIdx + 1] = g;
        dst[dstIdx + 2] = b;
        dst[dstIdx + 3] = 255;
      }
    }

    if (needsDownscale) {
      sCtx.putImageData(dstImg, 0, 0);
      targetCtx.save();
      targetCtx.imageSmoothingEnabled = true;
      targetCtx.imageSmoothingQuality = 'medium';
      targetCtx.drawImage(sCanvas, 0, 0, w, h);
      targetCtx.restore();
    } else {
      targetCtx.putImageData(dstImg, 0, 0);
    }

    // 4. BANDWIDTH SOFTNESS (Authentic 1D Horizontal Lowpass Filter via GPU Downsampling)
    if (softnessAmount > 0.05) {
      const reducedW = Math.max(160, Math.round(w * (1.0 - softnessAmount * 0.70)));
      const { canvas: softCanvas, ctx: softCtx } = getSoftnessContext(reducedW, h);

      softCtx.imageSmoothingEnabled = true;
      softCtx.imageSmoothingQuality = 'medium';
      softCtx.clearRect(0, 0, reducedW, h);
      softCtx.drawImage(targetCtx.canvas, 0, 0, reducedW, h);

      targetCtx.save();
      targetCtx.imageSmoothingEnabled = true;
      targetCtx.imageSmoothingQuality = 'medium';
      targetCtx.globalAlpha = Math.min(1.0, softnessAmount * 1.2);
      targetCtx.drawImage(softCanvas, 0, 0, w, h);
      targetCtx.restore();
    }

    // 4.5. TAPE DEGRADATION OVERLAY (Blurred & Opacity-Controlled RF Static, VBI Bar & Crease Flare)
    if (hasDegradPixels && degradObj) {
      degradObj.ctx.putImageData(degradObj.imgData, 0, 0);
      const degradBlurPx = degradBlurAmount * 5.5 * Math.max(1.0, h / 720);
      targetCtx.save();
      targetCtx.globalAlpha = Math.max(0, Math.min(1, degradOpacityAmount));
      targetCtx.filter = degradBlurPx > 0.05 ? `blur(${degradBlurPx.toFixed(2)}px)` : 'none';
      targetCtx.drawImage(degradObj.canvas, 0, 0, w, h);
      targetCtx.restore();
    }

    // 5. CRT SCANLINE RASTER WITH ANALOG PHOSPHOR BLUR
    if (scanlineAmount > 0.005) {
      this.renderScanlines(targetCtx, w, h, scanlineAmount, scanlineBlurAmount);
    }
  }

  /**
   * Renders soft, Gaussian-blurred CRT phosphor scanlines via a cached vertical strip.
   */
  static renderScanlines(ctx, w, h, amount, blurAmount) {
    const key = `${h}:${Math.round(amount * 100)}:${Math.round(blurAmount * 100)}`;
    if (key !== lastScanlineKey || !scanlineBlurCanvas) {
      const stripW = 4;
      if (!scanlineRawCanvas) {
        scanlineRawCanvas = document.createElement('canvas');
        scanlineRawCtx = scanlineRawCanvas.getContext('2d');
      }
      if (!scanlineBlurCanvas) {
        scanlineBlurCanvas = document.createElement('canvas');
        scanlineBlurCtx = scanlineBlurCanvas.getContext('2d');
      }
      if (scanlineRawCanvas.width !== stripW || scanlineRawCanvas.height !== h) {
        scanlineRawCanvas.width = stripW;
        scanlineRawCanvas.height = h;
      }
      if (scanlineBlurCanvas.width !== stripW || scanlineBlurCanvas.height !== h) {
        scanlineBlurCanvas.width = stripW;
        scanlineBlurCanvas.height = h;
      }

      // Natural CRT raster pitch scaled softly to canvas height
      const pitch = Math.max(3, Math.round(h / 220));
      const maxDim = amount * 0.38;

      scanlineRawCtx.fillStyle = '#ffffff';
      scanlineRawCtx.fillRect(0, 0, stripW, h);

      for (let y = 0; y < h; y++) {
        const phase = (y % pitch) / pitch;
        // Blend between crisp CRT line (blur=0) and smooth cosine phosphor wave (blur>0)
        const sharpMask = phase >= 0.5 ? 1.0 : 0.0;
        const smoothMask = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
        const mask = sharpMask * (1.0 - blurAmount) + smoothMask * blurAmount;
        const lum = Math.max(0, Math.min(255, Math.round((1.0 - mask * maxDim) * 255)));
        scanlineRawCtx.fillStyle = `rgb(${lum},${lum},${lum})`;
        scanlineRawCtx.fillRect(0, y, stripW, 1);
      }

      const blurPx = blurAmount * 3.2 * Math.max(1.0, h / 720);
      scanlineBlurCtx.save();
      scanlineBlurCtx.fillStyle = '#ffffff';
      scanlineBlurCtx.fillRect(0, 0, stripW, h);
      scanlineBlurCtx.filter = blurPx > 0.05 ? `blur(${blurPx.toFixed(2)}px)` : 'none';
      scanlineBlurCtx.drawImage(scanlineRawCanvas, 0, 0);
      scanlineBlurCtx.restore();

      lastScanlineKey = key;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(scanlineBlurCanvas, 0, 0, w, h);
    ctx.restore();
  }

  /**
   * Applies one of the curated presets to state.
   */
  static applyPreset(presetName) {
    const preset = VHS_PRESETS[presetName];
    if (!preset) return;

    state.vhsPreset = presetName;
    Object.keys(preset).forEach(key => {
      state[key] = preset[key];
    });
  }
}
