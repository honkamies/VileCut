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
