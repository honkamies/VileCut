import { state } from './state.js';
import { UI } from './ui.js';

export class GlitchManager {
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
