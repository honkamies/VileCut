import { state } from './state.js';
import { UI } from './ui.js';

export function getPseudoRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s, l: l };
}

export async function loadConfiguredFonts() {
  try {
    const response = await fetch('fonts/fonts.json');
    if (!response.ok) return;
    
    const fontList = await response.json();
    if (!Array.isArray(fontList)) return;

    for (const font of fontList) {
      if (font.name && font.url) {
        try {
          const fontFace = new FontFace(font.name, `url(${font.url})`);
          const loadedFace = await fontFace.load();
          document.fonts.add(loadedFace);

          // Add option to select menu
          const option = document.createElement('option');
          option.value = font.name;
          option.innerText = font.name + " (Custom)";
          UI.textFont.appendChild(option);
          
          console.log("Successfully loaded custom font from config: " + font.name);
        } catch (err) {
          console.error("Failed to load font from config: " + font.name, err);
        }
      }
    }
  } catch (err) {
    console.log("No custom fonts configuration found in fonts/fonts.json");
  }
}

export function getTimelineDuration() {
  if (state.exportMode === 'duration') {
    return state.exportDuration;
  } else {
    const absSpeed = Math.abs(state.zoomSpeed);
    if (absSpeed > 0.0001) {
      return state.exportLoops / absSpeed;
    }
    return 5.0; // fallback
  }
}

export function getAdjustedZoomSpeed(dur) {
  const rawSpeed = state.zoomSpeed;
  if (Math.abs(rawSpeed) < 0.0001) return 0;
  const rawCycles = dur * Math.abs(rawSpeed);
  const cycles = Math.max(1, Math.round(rawCycles));
  const direction = rawSpeed >= 0 ? 1 : -1;
  return direction * (cycles / dur);
}

export function applyEdgeFade(ctx, x, y, w, h, fadePercent) {
  if (fadePercent <= 0) return;
  
  const fadeX = w * (fadePercent / 100);
  const fadeY = h * (fadePercent / 100);
  
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = ctx.canvas.width;
  maskCanvas.height = ctx.canvas.height;
  const mCtx = maskCanvas.getContext('2d');
  
  mCtx.fillStyle = '#ffffff';
  mCtx.fillRect(x + fadeX, y + fadeY, w - 2 * fadeX, h - 2 * fadeY);
  
  if (fadeY > 0) {
    const gradTop = mCtx.createLinearGradient(0, y, 0, y + fadeY);
    gradTop.addColorStop(0, 'rgba(255,255,255,0)');
    gradTop.addColorStop(1, 'rgba(255,255,255,1)');
    mCtx.fillStyle = gradTop;
    mCtx.fillRect(x, y, w, fadeY);
    
    const gradBottom = mCtx.createLinearGradient(0, y + h, 0, y + h - fadeY);
    gradBottom.addColorStop(0, 'rgba(255,255,255,0)');
    gradBottom.addColorStop(1, 'rgba(255,255,255,1)');
    mCtx.fillStyle = gradBottom;
    mCtx.fillRect(x, y + h - fadeY, w, fadeY);
  }
  
  if (fadeX > 0) {
    const gradLeft = mCtx.createLinearGradient(x, 0, x + fadeX, 0);
    gradLeft.addColorStop(0, 'rgba(255,255,255,0)');
    gradLeft.addColorStop(1, 'rgba(255,255,255,1)');
    mCtx.fillStyle = gradLeft;
    mCtx.fillRect(x, y, fadeX, h);
    
    const gradRight = mCtx.createLinearGradient(x + w, 0, x + w - fadeX, 0);
    gradRight.addColorStop(0, 'rgba(255,255,255,0)');
    gradRight.addColorStop(1, 'rgba(255,255,255,1)');
    mCtx.fillStyle = gradRight;
    mCtx.fillRect(x + w - fadeX, y, fadeX, h);
  }
  
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
}
