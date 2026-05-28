import { state } from './state.js';
import { UI } from './ui.js';
import { rgbToHsl, getPseudoRandom } from './utils.js';
import { resizeMainCanvas } from './renderer.js';

export function ensureRandomBoundaries() {
  const N = state.layerCount;
  if (!state.randomBoundaries || state.randomBoundaries.length !== N + 1) {
    const points = [];
    for (let k = 0; k < N - 1; k++) {
      points.push(Math.random() * 255);
    }
    points.sort((a, b) => a - b);
    state.randomBoundaries = [0, ...points, 255];
  }
}

export class ImageProcessor {
  static processImageLayers(imgObj) {
    const img = imgObj.img;
    const maxDim = 1024;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    // Create a temporary canvas to get source image pixel data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0, w, h);
    const srcImgData = tempCtx.getImageData(0, 0, w, h);
    const srcPixels = srcImgData.data;

    imgObj.layers = [];
    const N = state.layerCount;

    // Pre-calculate random boundaries for random mode if needed
    if (state.maskType === 'random') {
      ensureRandomBoundaries();
    }

    // Calculate adaptive quantiles if mode is adaptive-luminosity
    if (state.maskType === 'adaptive-luminosity') {
      const hist = new Int32Array(256);
      for (let p = 0; p < srcPixels.length; p += 4) {
        const r = srcPixels[p];
        const g = srcPixels[p + 1];
        const b = srcPixels[p + 2];
        const a = srcPixels[p + 3];
        if (a > 10) {
          const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          hist[lum]++;
        }
      }
      
      const cdf = new Int32Array(256);
      let cumulative = 0;
      for (let i = 0; i < 256; i++) {
        cumulative += hist[i];
        cdf[i] = cumulative;
      }
      const totalPixels = cumulative;

      const boundaries = new Float32Array(N + 1);
      boundaries[0] = 0;
      boundaries[N] = 255;
      
      for (let i = 1; i < N; i++) {
        const targetPercent = i / N;
        const targetPixelCount = totalPixels * targetPercent;
        
        let val = 0;
        while (val < 256 && cdf[val] < targetPixelCount) {
          val++;
        }
        boundaries[i] = val;
      }
      imgObj.adaptiveBoundaries = boundaries;
    }

    for (let i = 0; i < N; i++) {
      const layerCanvas = document.createElement('canvas');
      layerCanvas.width = w;
      layerCanvas.height = h;
      const layerCtx = layerCanvas.getContext('2d');
      const layerImgData = layerCtx.createImageData(w, h);
      const destPixels = layerImgData.data;

      if (state.maskType === 'luminosity') {
        const B = 255 / N;
        const Si = B * i;
        const Ei = B * (i + 1);
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
            if (i === 0) {
              weight = 1.0; // keep blacks in first layer
            } else if (lum >= Si - f) {
              let wVal = (lum - (Si - f)) / (2 * f);
              weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal; // Hermite interpolation
            }
          } else if (lum > Ei - f) {
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
            if (i === 0) {
              weight = 1.0; // keep blacks in first layer
            } else if (lum >= Si - f) {
              let wVal = (lum - (Si - f)) / (2 * f);
              weight = 3 * wVal * wVal - 2 * wVal * wVal * wVal;
            }
          } else if (lum > Ei - f) {
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
            weight = i === Math.floor(N / 2) ? 0.4 : 0.0;
          } else {
            let dH = Math.abs(pixelHue - Ci);
            if (dH > 180) dH = 360 - dH;

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
      else if (state.maskType === 'random' && state.randomBoundaries && state.randomBoundaries.length === N + 1) {
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

      // Apply Layer Edge Fade (Vignette) if enabled
      if (state.layerEdgeFade > 0) {
        const fadeX = w * (state.layerEdgeFade / 100);
        const fadeY = h * (state.layerEdgeFade / 100);

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = w;
        maskCanvas.height = h;
        const mCtx = maskCanvas.getContext('2d');

        // Draw solid white center rectangle (the area that remains 100% opaque)
        mCtx.fillStyle = '#ffffff';
        mCtx.fillRect(fadeX, fadeY, w - 2 * fadeX, h - 2 * fadeY);

        if (fadeY > 0) {
          // Top edge gradient (transparent at y=0, white at y=fadeY)
          const gradTop = mCtx.createLinearGradient(0, 0, 0, fadeY);
          gradTop.addColorStop(0, 'rgba(255,255,255,0)');
          gradTop.addColorStop(1, 'rgba(255,255,255,1)');
          mCtx.fillStyle = gradTop;
          mCtx.fillRect(0, 0, w, fadeY);

          // Bottom edge gradient (transparent at y=h, white at y=h-fadeY)
          const gradBottom = mCtx.createLinearGradient(0, h, 0, h - fadeY);
          gradBottom.addColorStop(0, 'rgba(255,255,255,0)');
          gradBottom.addColorStop(1, 'rgba(255,255,255,1)');
          mCtx.fillStyle = gradBottom;
          mCtx.fillRect(0, h - fadeY, w, fadeY);
        }

        if (fadeX > 0) {
          // Left edge gradient (transparent at x=0, white at x=fadeX)
          const gradLeft = mCtx.createLinearGradient(0, 0, fadeX, 0);
          gradLeft.addColorStop(0, 'rgba(255,255,255,0)');
          gradLeft.addColorStop(1, 'rgba(255,255,255,1)');
          mCtx.fillStyle = gradLeft;
          mCtx.fillRect(0, 0, fadeX, h);

          // Right edge gradient (transparent at x=w, white at x=w-fadeX)
          const gradRight = mCtx.createLinearGradient(w, 0, w - fadeX, 0);
          gradRight.addColorStop(0, 'rgba(255,255,255,0)');
          gradRight.addColorStop(1, 'rgba(255,255,255,1)');
          mCtx.fillStyle = gradRight;
          mCtx.fillRect(w - fadeX, 0, fadeX, h);
        }

        layerCtx.save();
        layerCtx.globalCompositeOperation = 'destination-in';
        layerCtx.drawImage(maskCanvas, 0, 0);
        layerCtx.restore();
      }

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
      // Select deterministic image for this layer initially based on index and wrapCount = 0
      const seed = i * 17.3;
      const imgIdx = Math.floor(getPseudoRandom(seed) * state.uploadedImages.length);
      const randomImgObj = state.uploadedImages[imgIdx];
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

export function drawInspectorPreview() {
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

  if (state.selectedInspectorLayer >= activeImgObj.layers.length) {
    state.selectedInspectorLayer = activeImgObj.layers.length - 1;
  }
  if (state.selectedInspectorLayer < 0) {
    state.selectedInspectorLayer = 0;
  }

  const idx = state.selectedInspectorLayer;
  const layerCanvas = activeImgObj.layers[idx];
  if (!layerCanvas) return;

  UI.inspectorLayerName.innerText = `Layer L${idx + 1}`;
  
  const previewCanvas = UI.inspectorPreviewCanvas;
  previewCanvas.width = layerCanvas.width;
  previewCanvas.height = layerCanvas.height;
  
  const pCtx = previewCanvas.getContext('2d');
  pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  pCtx.drawImage(layerCanvas, 0, 0);

  const container = previewCanvas.parentElement;
  container.className = 'inspector-preview-container bg-' + state.inspectorBgMode;

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

export function drawMaskGraph() {
  const canvas = document.getElementById('mask-graph-canvas');
  if (!canvas) return;
  const gCtx = canvas.getContext('2d');
  const gw = canvas.width;
  const gh = canvas.height;
  
  gCtx.fillStyle = '#050914';
  gCtx.fillRect(0, 0, gw, gh);

  gCtx.strokeStyle = 'rgba(0, 242, 254, 0.06)';
  gCtx.lineWidth = 1;
  for (let x = 0.25; x < 1; x += 0.25) {
    gCtx.beginPath();
    gCtx.moveTo(x * gw, 0);
    gCtx.lineTo(x * gw, gh);
    gCtx.stroke();
  }

  const N = state.layerCount;
  if (state.maskType === 'random') {
    ensureRandomBoundaries();
  }
  if (state.uploadedImages.length === 0) {
    gCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    gCtx.font = '9px JetBrains Mono';
    gCtx.textAlign = 'center';
    gCtx.fillText('UPLOAD IMAGE(S) TO VIEW MASKS', gw / 2, gh / 2 + 3);
    return;
  }

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
      else if (state.maskType === 'random' && state.randomBoundaries && state.randomBoundaries.length === N + 1) {
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
