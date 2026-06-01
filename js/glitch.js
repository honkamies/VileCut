import { state } from './state.js';
import { UI } from './ui.js';
import { getTimelineDuration } from './utils.js';

export class GlitchManager {
  static update(dt) {
    if (!state.glitchEnabled) {
      state.glitchActive = false;
      state.shakeX = 0;
      state.shakeY = 0;
      state.shakeRot = 0;
      return;
    }

    // Check playhead crossings for pinned timeline triggers
    if (((state.isPlaying && state.imageLoaded) || state.isExporting) && state.glitchTriggers.length > 0) {
      const prev = state.prevTime !== undefined ? state.prevTime : state.time;
      const curr = state.time;
      const dur = getTimelineDuration();

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
          console.log(`[GlitchTrigger] Playhead crossed trigger at ${trigger.time.toFixed(2)}s (prev: ${prev.toFixed(2)}s, curr: ${curr.toFixed(2)}s)`);
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
      console.log("[GlitchTrigger] Glitch is disabled in settings. Ignoring trigger.");
      return;
    }
    console.log(`[GlitchTrigger] Triggering glitch: duration=${customDuration}, severity=${customSeverity}`);
    state.glitchActive = true;
    state.activeGlitchDuration = customDuration !== undefined ? customDuration : (0.2 + Math.random() * 0.25);
    state.glitchTimer = state.activeGlitchDuration;
    state.activeGlitchSeverity = customSeverity !== undefined ? customSeverity : state.glitchSeverity;

    if (state.glitchStyleRandom) {
      const pool = [];
      if (state.glitchStyleRgbSort) pool.push('rgb-pixel-sort');
      if (state.glitchStyleVhs) pool.push('vhs-sync-sag');
      if (state.glitchStyleBlock) pool.push('digital-block-tear');
      if (state.glitchStyleLiquid) pool.push('liquid-warp');

      if (pool.length > 0) {
        state.activeSpikeStyle = pool[Math.floor(Math.random() * pool.length)];
      } else {
        state.activeSpikeStyle = null;
      }
    } else {
      state.activeSpikeStyle = null;
    }
    
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

    const activeSeverity = state.activeGlitchSeverity !== undefined && state.activeGlitchSeverity !== null 
      ? state.activeGlitchSeverity 
      : state.glitchSeverity;

    // Helper to determine if a style is spiking
    const checkSpike = (styleName) => {
      if (!state.glitchActive) return false;
      if (!state.glitchStyleRandom) return true; // Spikes all active styles when not randomizing
      return state.activeSpikeStyle === styleName;
    };

    // 1. RGB SPLIT & PIXEL SORT
    if (state.glitchStyleRgbSort) {
      const isSpiking = checkSpike('rgb-pixel-sort');
      let shift = state.rgbSplit;
      if (isSpiking) {
        shift += Math.round(activeSeverity * 0.5);
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

      let sortIntensity = state.pixelSort;
      if (isSpiking) {
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

    // 2. ANALOG VCR SCANLINE SAG
    if (state.glitchStyleVhs) {
      const isSpiking = checkSpike('vhs-sync-sag');
      let amplitude = state.rgbSplit * 1.5;
      if (isSpiking) {
        amplitude += activeSeverity * 0.8;
      }

      if (amplitude > 0) {
        const imgData = renderCtx.getImageData(0, 0, w, h);
        const src = imgData.data;
        const outData = renderCtx.createImageData(w, h);
        const dst = outData.data;
        const rowBytes = w * 4;
        const timePhase = state.time * 25.0; 
        
        const offsets = new Int32Array(h);
        for (let y = 0; y < h; y++) {
          const sineShift = Math.sin(y * 0.015 + timePhase) * amplitude;
          let tearShift = 0;
          if (y > h * 0.85 || y < h * 0.15) {
            const factor = y > h * 0.85 ? (y - h * 0.85) / (h * 0.15) : (h * 0.15 - y) / (h * 0.15);
            tearShift = (Math.random() - 0.5) * amplitude * 2.0 * factor;
          }
          offsets[y] = Math.round(sineShift + tearShift);
        }

        for (let y = 0; y < h; y++) {
          const rowOffset = y * rowBytes;
          const shiftX = offsets[y];

          for (let x = 0; x < w; x++) {
            const pixelOffset = rowOffset + x * 4;
            const targetX = Math.max(0, Math.min(w - 1, x - shiftX));
            const srcOffset = rowOffset + targetX * 4;

            dst[pixelOffset] = src[srcOffset];
            dst[pixelOffset + 1] = src[srcOffset + 1];
            dst[pixelOffset + 2] = src[srcOffset + 2];
            dst[pixelOffset + 3] = src[srcOffset + 3];
          }
        }
        renderCtx.putImageData(outData, 0, 0);
      }
    }

    // 3. DIGITAL BLOCK TEARING
    if (state.glitchStyleBlock) {
      const isSpiking = checkSpike('digital-block-tear');
      let severity = state.rgbSplit;
      if (isSpiking) {
        severity += activeSeverity;
      }

      if (severity > 0) {
        const imgData = renderCtx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const blockSize = 32;
        const cols = Math.ceil(w / blockSize);
        const rows = Math.ceil(h / blockSize);

        const tearProbability = 0.05 + (severity / 30) * 0.15;
        const maxShift = Math.round(severity * 2.5);

        const blockShiftsX = new Int16Array(cols * rows);
        const blockShiftsY = new Int16Array(cols * rows);
        
        for (let i = 0; i < cols * rows; i++) {
          if (Math.random() < tearProbability) {
            blockShiftsX[i] = Math.round((Math.random() - 0.5) * maxShift);
            blockShiftsY[i] = Math.round((Math.random() - 0.5) * maxShift * 0.5);
          }
        }

        const tempBuf = new Uint8ClampedArray(data);

        for (let r = 0; r < rows; r++) {
          const startY = r * blockSize;
          const endY = Math.min(h, startY + blockSize);

          for (let c = 0; c < cols; c++) {
            const startX = c * blockSize;
            const endX = Math.min(w, startX + blockSize);

            const gridIdx = r * cols + c;
            const dx = blockShiftsX[gridIdx];
            const dy = blockShiftsY[gridIdx];

            if (dx !== 0 || dy !== 0) {
              for (let y = startY; y < endY; y++) {
                const srcY = Math.max(0, Math.min(h - 1, y + dy));
                for (let x = startX; x < endX; x++) {
                  const srcX = Math.max(0, Math.min(w - 1, x + dx));
                  
                  const destIdx = (y * w + x) * 4;
                  const srcIdx = (srcY * w + srcX) * 4;

                  data[destIdx] = tempBuf[srcIdx];
                  data[destIdx + 1] = tempBuf[srcIdx + 1];
                  data[destIdx + 2] = tempBuf[srcIdx + 2];
                  data[destIdx + 3] = tempBuf[srcIdx + 3];
                }
              }
            }
          }
        }
        renderCtx.putImageData(imgData, 0, 0);
      }
    }

    // 4. GPU LIQUID WARP FILTER
    if (state.glitchStyleLiquid) {
      const isSpiking = checkSpike('liquid-warp');
      const scaleEl = document.getElementById('liquid-displace');
      const noiseEl = document.getElementById('liquid-noise');

      if (scaleEl && noiseEl) {
        let severity = state.rgbSplit * 1.5;
        if (isSpiking) {
          severity += activeSeverity * 3.5;
        }

        scaleEl.setAttribute('scale', severity);
        if (isSpiking || (state.isPlaying && Math.random() < 0.25)) {
          noiseEl.setAttribute('seed', Math.floor(Math.random() * 1000));
        }

        if (severity > 0) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = w;
          tempCanvas.height = h;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(renderCtx.canvas, 0, 0);

          renderCtx.clearRect(0, 0, w, h);
          renderCtx.filter = 'url(#liquid-warp-filter)';
          renderCtx.drawImage(tempCanvas, 0, 0);
          renderCtx.filter = 'none';
        }
      }
    }

    // 5. Monochrome Conversion (Applies to all styles)
    if (state.glitchMonochrome) {
      const imgData = renderCtx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const len = data.length;
      for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const v = 0.299 * r + 0.587 * g + 0.114 * b;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
      renderCtx.putImageData(imgData, 0, 0);
    }
  }
}
