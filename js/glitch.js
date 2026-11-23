import { state } from './state.js';
import { UI } from './ui.js';

let liquidTempCanvas = null;
let liquidTempCtx = null;

// Reusable scratch buffers: avoids allocating multi-megabyte pixel buffers or typed arrays on every rendered frame
let scratchBuf = null;
let sortKeys = null;
let vhsOffsets = null;
let blockShiftsX = null;
let blockShiftsY = null;

function ensureScratchBuffer(byteLength) {
  if (!scratchBuf || scratchBuf.length !== byteLength) {
    scratchBuf = new Uint8ClampedArray(byteLength);
  }
  return scratchBuf;
}

export class GlitchManager {
  static update(dt) {
    if (!state.glitchEnabled) {
      state.glitchActive = false;
      state.glitchZoomBoostTimer = 0;
      state.shakeX = 0;
      state.shakeY = 0;
      state.shakeRot = 0;
      return;
    }

    if (state.glitchZoomBoostTimer > 0) {
      state.glitchZoomBoostTimer = Math.max(0, state.glitchZoomBoostTimer - dt);
    }

    // Check playhead crossings for pinned timeline triggers
    if ((state.isPlaying || state.isExporting) && state.glitchTriggers.length > 0) {
      const prev = state.prevTime !== undefined ? state.prevTime : state.time;
      const curr = state.time;

      state.glitchTriggers.forEach(trigger => {
        let triggered = false;
        if (prev < curr) {
          if (prev <= trigger.time && curr > trigger.time) {
            triggered = true;
          }
        } else if (prev > curr) {
          // Wrapped around loop boundary
          if (trigger.time >= prev || trigger.time < curr) {
            triggered = true;
          }
        }
        if (triggered) {
          GlitchManager.triggerGlitch(trigger.duration, trigger.severity);
        }
      });
    }

    if (state.glitchActive) {
      state.glitchTimer -= dt;
      if (state.glitchTimer <= 0) {
        state.glitchActive = false;
        state.activeSpikeStyle = null;
        state.activeGlitchDuration = null;
        state.activeGlitchSeverity = null;
        state.shakeX = 0;
        state.shakeY = 0;
        state.shakeRot = 0;
      } else {
        const decayDuration = state.activeGlitchDuration !== undefined && state.activeGlitchDuration !== null 
          ? state.activeGlitchDuration 
          : 0.35;
        const decay = Math.max(0, Math.min(1.0, state.glitchTimer / decayDuration));
        const sev = state.activeGlitchSeverity !== undefined && state.activeGlitchSeverity !== null 
          ? state.activeGlitchSeverity 
          : state.glitchSeverity;
        state.shakeX = (Math.random() - 0.5) * sev * decay;
        state.shakeY = (Math.random() - 0.5) * sev * decay;
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

  static triggerGlitch(customDuration, customSeverity) {
    if (!state.glitchEnabled) {
      return;
    }
    state.glitchActive = true;
    state.activeGlitchDuration = customDuration !== undefined ? customDuration : (0.2 + Math.random() * 0.25);
    state.glitchTimer = state.activeGlitchDuration;
    state.activeGlitchSeverity = customSeverity !== undefined ? customSeverity : state.glitchSeverity;
    state.glitchZoomBoostTimer = Math.min(0.18, state.activeGlitchDuration * 0.65);

    if (state.glitchStyleRandom) {
      const pool = [];
      if (state.glitchStyleRgbSort) pool.push('rgb-pixel-sort');
      if (state.glitchStyleVhs) pool.push('vhs-sync-sag');
      if (state.glitchStyleBlock) pool.push('digital-block-tear');
      if (state.glitchStyleLiquid) pool.push('liquid-warp');
      if (state.glitchStyleFlicker) pool.push('flicker-strobe');

      if (pool.length > 0) {
        state.activeSpikeStyle = pool[Math.floor(Math.random() * pool.length)];
      } else {
        state.activeSpikeStyle = null;
      }
    } else {
      state.activeSpikeStyle = null;
    }

    if (!state.isExporting && UI.glitchFlash) {
      UI.glitchFlash.classList.add('active');
      setTimeout(() => UI.glitchFlash.classList.remove('active'), 50);
    }
  }

  static applyPostProcessGlitches(renderCtx, w, h) {
    if (!state.glitchEnabled) return;

    const resScale = w / 1024;
    const activeSeverity = state.activeGlitchSeverity !== undefined && state.activeGlitchSeverity !== null 
      ? state.activeGlitchSeverity 
      : state.glitchSeverity;

    // Helper to determine if a style is spiking
    const checkSpike = (styleName) => {
      if (!state.glitchActive) return false;
      if (!state.glitchStyleRandom) return true; // Spikes all active styles when not randomizing
      return state.activeSpikeStyle === styleName;
    };

    // Determine active parameters for all CPU pixel effects upfront
    const isRgbSpiking = state.glitchStyleRgbSort && checkSpike('rgb-pixel-sort');
    const rgbShift = state.glitchStyleRgbSort
      ? Math.round((state.rgbSplit + (isRgbSpiking ? activeSeverity * 0.5 : 0)) * resScale)
      : 0;
    const sortIntensity = state.glitchStyleRgbSort
      ? Math.min(100, state.pixelSort + (isRgbSpiking ? 40 : 0))
      : 0;

    const isVhsSpiking = state.glitchStyleVhs && checkSpike('vhs-sync-sag');
    const vhsAmplitude = state.glitchStyleVhs
      ? (state.rgbSplit * 1.5 + (isVhsSpiking ? activeSeverity * 0.8 : 0)) * resScale
      : 0;

    const isBlockSpiking = state.glitchStyleBlock && checkSpike('digital-block-tear');
    const blockSeverity = state.glitchStyleBlock
      ? state.rgbSplit + (isBlockSpiking ? activeSeverity : 0)
      : 0;

    const isFlickerSpiking = state.glitchStyleFlicker && checkSpike('flicker-strobe');

    const needsPixelPipeline = (
      rgbShift > 0 ||
      sortIntensity > 0 ||
      vhsAmplitude > 0 ||
      blockSeverity > 0 ||
      isFlickerSpiking
    );

    // Single-Pass CPU Pixel Pipeline: one getImageData read & one putImageData write
    if (needsPixelPipeline) {
      const imgData = renderCtx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const len = data.length;
      const rowBytes = w * 4;

      // 1A. RGB SPLIT
      if (rgbShift > 0) {
        const src = ensureScratchBuffer(len);
        src.set(data);
        for (let y = 0; y < h; y++) {
          const rowOffset = y * rowBytes;
          for (let x = 0; x < w; x++) {
            const pixelOffset = rowOffset + x * 4;
            const rx = Math.max(0, Math.min(w - 1, x - rgbShift));
            const bx = Math.max(0, Math.min(w - 1, x + rgbShift));
            data[pixelOffset] = src[rowOffset + rx * 4];
            data[pixelOffset + 2] = src[rowOffset + bx * 4 + 2];
          }
        }
      }

      // 1B. PIXEL SORT
      if (sortIntensity > 0) {
        const numRows = Math.round(h * (sortIntensity / 100) * 0.15);
        if (!sortKeys || sortKeys.length < w) sortKeys = new Float64Array(w);
        const px32 = new Uint32Array(data.buffer, data.byteOffset, len >> 2);

        for (let k = 0; k < numRows; k++) {
          const y = Math.floor(Math.random() * h);
          const rowStart = y * rowBytes;
          const rowPx = rowStart >> 2;

          let x = 0;
          while (x < w) {
            let start = x;
            while (start < w) {
              const idx = rowStart + start * 4;
              const brightness = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
              if (brightness > 120) break;
              start++;
            }
            if (start >= w) break;

            let end = start;
            while (end < w) {
              const idx = rowStart + end * 4;
              const brightness = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
              if (brightness <= 80) break;
              end++;
            }

            const spanLen = end - start;
            if (spanLen > 8) {
              for (let i = 0; i < spanLen; i++) {
                const idx = rowStart + (start + i) * 4;
                const br = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
                sortKeys[i] = br * 4294967296 + px32[rowPx + start + i];
              }
              const keys = sortKeys.subarray(0, spanLen);
              keys.sort();
              for (let i = 0; i < spanLen; i++) {
                const key = keys[spanLen - 1 - i];
                px32[rowPx + start + i] = key % 4294967296;
              }
            }
            x = end + 1;
          }
        }
      }

      // 2. ANALOG VCR SCANLINE SAG
      if (vhsAmplitude > 0) {
        const src = ensureScratchBuffer(len);
        src.set(data);
        const timePhase = state.time * 25.0;

        if (!vhsOffsets || vhsOffsets.length < h) {
          vhsOffsets = new Int32Array(h);
        }
        for (let y = 0; y < h; y++) {
          const sineShift = Math.sin((y / resScale) * 0.015 + timePhase) * vhsAmplitude;
          let tearShift = 0;
          if (y > h * 0.85 || y < h * 0.15) {
            const factor = y > h * 0.85 ? (y - h * 0.85) / (h * 0.15) : (h * 0.15 - y) / (h * 0.15);
            tearShift = (Math.random() - 0.5) * vhsAmplitude * 2.0 * factor;
          }
          vhsOffsets[y] = Math.round(sineShift + tearShift);
        }

        for (let y = 0; y < h; y++) {
          const rowOffset = y * rowBytes;
          const shiftX = vhsOffsets[y];
          if (shiftX === 0) continue;

          for (let x = 0; x < w; x++) {
            const pixelOffset = rowOffset + x * 4;
            const targetX = Math.max(0, Math.min(w - 1, x - shiftX));
            const srcOffset = rowOffset + targetX * 4;

            data[pixelOffset] = src[srcOffset];
            data[pixelOffset + 1] = src[srcOffset + 1];
            data[pixelOffset + 2] = src[srcOffset + 2];
            data[pixelOffset + 3] = src[srcOffset + 3];
          }
        }
      }

      // 3. DIGITAL BLOCK TEARING
      if (blockSeverity > 0) {
        const blockSize = Math.max(16, Math.round(32 * resScale));
        const cols = Math.ceil(w / blockSize);
        const rows = Math.ceil(h / blockSize);
        const gridLen = cols * rows;

        const tearProbability = 0.05 + (blockSeverity / 30) * 0.15;
        const maxShift = Math.round(blockSeverity * 2.5 * resScale);

        if (!blockShiftsX || blockShiftsX.length < gridLen) {
          blockShiftsX = new Int16Array(gridLen);
          blockShiftsY = new Int16Array(gridLen);
        } else {
          blockShiftsX.fill(0, 0, gridLen);
          blockShiftsY.fill(0, 0, gridLen);
        }

        let anyShifted = false;
        for (let i = 0; i < gridLen; i++) {
          if (Math.random() < tearProbability) {
            blockShiftsX[i] = Math.round((Math.random() - 0.5) * maxShift);
            blockShiftsY[i] = Math.round((Math.random() - 0.5) * maxShift * 0.5);
            if (blockShiftsX[i] !== 0 || blockShiftsY[i] !== 0) anyShifted = true;
          }
        }

        if (anyShifted) {
          const tempBuf = ensureScratchBuffer(len);
          tempBuf.set(data);

          for (let r = 0; r < rows; r++) {
            const startY = r * blockSize;
            const endY = Math.min(h, startY + blockSize);

            for (let c = 0; c < cols; c++) {
              const gridIdx = r * cols + c;
              const dx = blockShiftsX[gridIdx];
              const dy = blockShiftsY[gridIdx];

              if (dx !== 0 || dy !== 0) {
                const startX = c * blockSize;
                const endX = Math.min(w, startX + blockSize);
                for (let y = startY; y < endY; y++) {
                  const srcY = Math.max(0, Math.min(h - 1, y + dy));
                  const dstRow = y * w;
                  const srcRow = srcY * w;
                  for (let x = startX; x < endX; x++) {
                    const srcX = Math.max(0, Math.min(w - 1, x + dx));
                    const destIdx = (dstRow + x) * 4;
                    const srcIdx = (srcRow + srcX) * 4;

                    data[destIdx] = tempBuf[srcIdx];
                    data[destIdx + 1] = tempBuf[srcIdx + 1];
                    data[destIdx + 2] = tempBuf[srcIdx + 2];
                    data[destIdx + 3] = tempBuf[srcIdx + 3];
                  }
                }
              }
            }
          }
        }
      }

      // 5. FLICKER & STROBE
      if (isFlickerSpiking) {
        const rFactor = (Math.random() > 0.5) ? 2.5 + Math.random() * 2.0 : 0.1 + Math.random() * 0.4;
        const gFactor = state.glitchMonochrome ? rFactor : ((Math.random() > 0.5) ? 2.5 + Math.random() * 2.0 : 0.1 + Math.random() * 0.4);
        const bFactor = state.glitchMonochrome ? rFactor : ((Math.random() > 0.5) ? 2.5 + Math.random() * 2.0 : 0.1 + Math.random() * 0.4);
        const highlightsOnly = state.glitchFlickerHighlightsOnly;

        for (let i = 0; i < len; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          if (highlightsOnly) {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            if (lum > 150) {
              data[i] = Math.min(255, r * rFactor);
              data[i + 1] = Math.min(255, g * gFactor);
              data[i + 2] = Math.min(255, b * bFactor);
            }
          } else {
            data[i] = Math.min(255, r * rFactor);
            data[i + 1] = Math.min(255, g * gFactor);
            data[i + 2] = Math.min(255, b * bFactor);
          }
        }
      }

      renderCtx.putImageData(imgData, 0, 0);
    }

    // 4. GPU LIQUID WARP FILTER
    if (state.glitchStyleLiquid) {
      const isSpiking = checkSpike('liquid-warp');
      const scaleEl = document.getElementById('liquid-displace');
      const noiseEl = document.getElementById('liquid-noise');

      if (scaleEl && noiseEl) {
        let severity = (state.rgbSplit * 1.5 + (isSpiking ? activeSeverity * 3.5 : 0)) * resScale;
        scaleEl.setAttribute('scale', severity);
        if (isSpiking || (state.isPlaying && Math.random() < 0.25)) {
          noiseEl.setAttribute('seed', Math.floor(Math.random() * 1000));
        }

        if (severity > 0) {
          if (!liquidTempCanvas) {
            liquidTempCanvas = document.createElement('canvas');
            liquidTempCtx = liquidTempCanvas.getContext('2d');
          }
          if (liquidTempCanvas.width !== w || liquidTempCanvas.height !== h) {
            liquidTempCanvas.width = w;
            liquidTempCanvas.height = h;
          }
          liquidTempCtx.clearRect(0, 0, w, h);
          liquidTempCtx.drawImage(renderCtx.canvas, 0, 0);

          renderCtx.clearRect(0, 0, w, h);
          renderCtx.filter = 'url(#liquid-warp-filter)';
          renderCtx.drawImage(liquidTempCanvas, 0, 0);
          renderCtx.filter = 'none';
        }
      }
    }

    // 6. Monochrome Conversion (Applies to all styles)
    if (state.glitchMonochrome) {
      if (!liquidTempCanvas) {
        liquidTempCanvas = document.createElement('canvas');
        liquidTempCtx = liquidTempCanvas.getContext('2d');
      }
      if (liquidTempCanvas.width !== w || liquidTempCanvas.height !== h) {
        liquidTempCanvas.width = w;
        liquidTempCanvas.height = h;
      }
      liquidTempCtx.clearRect(0, 0, w, h);
      liquidTempCtx.drawImage(renderCtx.canvas, 0, 0);

      renderCtx.save();
      renderCtx.filter = 'grayscale(100%)';
      renderCtx.clearRect(0, 0, w, h);
      renderCtx.drawImage(liquidTempCanvas, 0, 0);
      renderCtx.restore();
    }
  }
}
