import { state } from './state.js';

// Reusable scratch canvas to avoid garbage collection stutter
let geoCanvas = null;
let geoCtx = null;

function getGeoContext(w, h) {
  if (!geoCanvas) {
    geoCanvas = document.createElement('canvas');
    geoCtx = geoCanvas.getContext('2d');
  }
  if (geoCanvas.width !== w || geoCanvas.height !== h) {
    geoCanvas.width = w;
    geoCanvas.height = h;
  }
  return { canvas: geoCanvas, ctx: geoCtx };
}

export class GeometricFxManager {
  /**
   * Main entry point called by renderer.js on offscreenCtx
   */
  static apply(renderCtx, w, h) {
    if (!state.geometricEnabled) return;

    // 1. SPECTRAL EDGE CURTAIN (Extrusions, arbitrary angles, bidirectional, flicker)
    if (state.geoCurtainActive && state.geoCurtainOpacity > 0) {
      this.applySpectralCurtain(renderCtx, w, h);
    }

    // 2. TOPOGRAPHIC CONTOUR ISOLINES (Luminance elevation steps)
    if (state.geoContoursActive && state.geoContourOpacity > 0) {
      this.applyContours(renderCtx, w, h);
    }

    // 3. MICRO-HUD GEOMETRY NODES (Contour tangent brackets, crosshairs, diamonds)
    if (state.geoNodesActive) {
      this.applyGeometryNodes(renderCtx, w, h);
    }
  }

  /**
   * Enhanced Spectral Edge Curtain
   * Supports:
   * - Luminance Trigger Gating: All, Highlights (>50%), Super-Highlights (>75%), Shadows (<40%), Midtones, Custom Range
   * - Energy Dynamics: scales reach & intensity based on detected pixel brightness
   * - Color Styling: Source Colors, Neon Boost, Pure Laser White, Custom Tint
   * - Laser Anchor Beads: radiant micro-dots on detected pixel boundaries
   * - Directions: Down, Up, Right, Left, 0-360° Angle Degrees
   * - Bidirectional Extrusion & Analog Shimmer/Flicker
   */
  static applySpectralCurtain(renderCtx, w, h) {
    const directionMode = state.geoCurtainDirection || 'down';
    let angleDeg = 0;

    if (directionMode === 'down') {
      angleDeg = 0;
    } else if (directionMode === 'up') {
      angleDeg = 180;
    } else if (directionMode === 'right') {
      angleDeg = 90;
    } else if (directionMode === 'left') {
      angleDeg = 270;
    } else {
      angleDeg = state.geoCurtainAngle !== undefined ? state.geoCurtainAngle : 0;
    }

    const rad = angleDeg * (Math.PI / 180);
    const dx = Math.sin(rad);
    const dy = Math.cos(rad);

    const isBidirectional = !!state.geoCurtainBidirectional;
    const curtainLenRatio = Math.max(5, Math.min(250, state.geoCurtainLength || 50)) / 100;
    const density = Math.max(10, Math.min(100, state.geoCurtainDensity || 60)) / 100;
    const baseOpacity = Math.max(5, Math.min(100, state.geoCurtainOpacity || 75)) / 100;
    const threshold = Math.max(10, Math.min(90, state.geoCurtainThreshold || 35));
    const flickerAmt = (state.geoCurtainFlicker || 0) / 100;
    const blendMode = state.geoCurtainBlend || 'screen';

    // Luminance Trigger Gate
    const lumTrigger = state.geoCurtainLumTrigger || 'all';
    let floorLum = 0;
    let ceilLum = 255;
    if (lumTrigger === 'highlights') {
      floorLum = 120; // > 47%
      ceilLum = 255;
    } else if (lumTrigger === 'super-highlights') {
      floorLum = 180; // > 70%
      ceilLum = 255;
    } else if (lumTrigger === 'shadows') {
      floorLum = 0;
      ceilLum = 100; // < 40%
    } else if (lumTrigger === 'midtones') {
      floorLum = 60;
      ceilLum = 195;
    } else if (lumTrigger === 'custom') {
      const minPct = state.geoCurtainMinLum !== undefined ? state.geoCurtainMinLum : 0;
      const maxPct = state.geoCurtainMaxLum !== undefined ? state.geoCurtainMaxLum : 100;
      floorLum = Math.round((minPct / 100) * 255);
      ceilLum = Math.round((maxPct / 100) * 255);
    }

    // Appearance & Dynamics
    const colorMode = state.geoCurtainColorMode || 'neon';
    const tintColor = state.geoCurtainTintColor || '#00f2fe';
    const lumMod = (state.geoCurtainLumMod !== undefined ? state.geoCurtainLumMod : 40) / 100;
    const originDot = state.geoCurtainOriginDot !== undefined ? state.geoCurtainOriginDot : true;
    const multiEdge = !!state.geoCurtainMultiEdge;

    const { canvas: fxCanvas, ctx: fxCtx } = getGeoContext(w, h);
    fxCtx.clearRect(0, 0, w, h);

    const srcImgData = renderCtx.getImageData(0, 0, w, h);
    const srcData = srcImgData.data;

    // Step spacing based on density slider
    const step = Math.max(2, Math.round(9 * (1.12 - density)));
    const baseLength = Math.max(w, h) * curtainLenRatio;
    const beamWidth = Math.max(1.5, step * 0.95);

    fxCtx.save();
    fxCtx.lineWidth = beamWidth;
    fxCtx.lineCap = 'butt';

    const isVerticalDominant = Math.abs(dy) >= Math.abs(dx);
    let beamIndex = 0;

    if (isVerticalDominant) {
      // Scan column by column to detect dominant silhouette edge points
      for (let x = 2; x < w - 2; x += step) {
        beamIndex++;
        let maxGrad = 0;
        let peakY = -1;
        let peakIdx = -1;
        let peakLum = 128;
        const foundPeaks = [];

        for (let y = 6; y < h - 6; y += 3) {
          const idxTop = ((y - 3) * w + x) * 4;
          const idxBot = ((y + 3) * w + x) * 4;

          const lumTop = 0.299 * srcData[idxTop] + 0.587 * srcData[idxTop + 1] + 0.114 * srcData[idxTop + 2];
          const lumBot = 0.299 * srcData[idxBot] + 0.587 * srcData[idxBot + 1] + 0.114 * srcData[idxBot + 2];
          const grad = Math.abs(lumBot - lumTop);

          if (grad > threshold) {
            const maxSideLum = Math.max(lumTop, lumBot);
            const minSideLum = Math.min(lumTop, lumBot);
            const edgeLum = (lumTop + lumBot) * 0.5;

            // Check if boundary falls within target brightness gate
            const qualifies = (maxSideLum >= floorLum && minSideLum <= ceilLum);

            if (qualifies) {
              let sampleIdx = (y * w + x) * 4;
              let effectiveLum = edgeLum;

              if (floorLum > 60 && maxSideLum >= floorLum) {
                sampleIdx = lumBot > lumTop ? idxBot : idxTop;
                effectiveLum = maxSideLum;
              } else if (ceilLum < 200 && minSideLum <= ceilLum) {
                sampleIdx = lumBot < lumTop ? idxBot : idxTop;
                effectiveLum = minSideLum;
              }

              if (multiEdge) {
                const isDistant = foundPeaks.every(p => Math.abs(p.y - y) > 28);
                if (isDistant && foundPeaks.length < 2) {
                  foundPeaks.push({ y, idx: sampleIdx, lum: effectiveLum });
                }
              } else if (grad > maxGrad) {
                maxGrad = grad;
                peakY = y;
                peakIdx = sampleIdx;
                peakLum = effectiveLum;
              }
            }
          }
        }

        if (multiEdge && foundPeaks.length > 0) {
          for (const p of foundPeaks) {
            this.drawCurtainBeam(
              fxCtx, x, p.y, dx, dy, baseLength,
              srcData[p.idx], srcData[p.idx + 1], srcData[p.idx + 2],
              baseOpacity, isBidirectional, flickerAmt, beamIndex,
              p.lum, lumMod, colorMode, tintColor, originDot, beamWidth
            );
          }
        } else if (peakY > 0 && peakIdx >= 0) {
          this.drawCurtainBeam(
            fxCtx, x, peakY, dx, dy, baseLength,
            srcData[peakIdx], srcData[peakIdx + 1], srcData[peakIdx + 2],
            baseOpacity, isBidirectional, flickerAmt, beamIndex,
            peakLum, lumMod, colorMode, tintColor, originDot, beamWidth
          );
        }
      }
    } else {
      // Scan row by row when the angle is horizontally dominant (Right, Left, gentle slopes)
      for (let y = 2; y < h - 2; y += step) {
        beamIndex++;
        let maxGrad = 0;
        let peakX = -1;
        let peakIdx = -1;
        let peakLum = 128;
        const foundPeaks = [];

        const rowOffset = y * w;
        for (let x = 6; x < w - 6; x += 3) {
          const idxL = (rowOffset + (x - 3)) * 4;
          const idxR = (rowOffset + (x + 3)) * 4;

          const lumL = 0.299 * srcData[idxL] + 0.587 * srcData[idxL + 1] + 0.114 * srcData[idxL + 2];
          const lumR = 0.299 * srcData[idxR] + 0.587 * srcData[idxR + 1] + 0.114 * srcData[idxR + 2];
          const grad = Math.abs(lumR - lumL);

          if (grad > threshold) {
            const maxSideLum = Math.max(lumL, lumR);
            const minSideLum = Math.min(lumL, lumR);
            const edgeLum = (lumL + lumR) * 0.5;

            const qualifies = (maxSideLum >= floorLum && minSideLum <= ceilLum);

            if (qualifies) {
              let sampleIdx = (rowOffset + x) * 4;
              let effectiveLum = edgeLum;

              if (floorLum > 60 && maxSideLum >= floorLum) {
                sampleIdx = lumR > lumL ? idxR : idxL;
                effectiveLum = maxSideLum;
              } else if (ceilLum < 200 && minSideLum <= ceilLum) {
                sampleIdx = lumR < lumL ? idxR : idxL;
                effectiveLum = minSideLum;
              }

              if (multiEdge) {
                const isDistant = foundPeaks.every(p => Math.abs(p.x - x) > 28);
                if (isDistant && foundPeaks.length < 2) {
                  foundPeaks.push({ x, idx: sampleIdx, lum: effectiveLum });
                }
              } else if (grad > maxGrad) {
                maxGrad = grad;
                peakX = x;
                peakIdx = sampleIdx;
                peakLum = effectiveLum;
              }
            }
          }
        }

        if (multiEdge && foundPeaks.length > 0) {
          for (const p of foundPeaks) {
            this.drawCurtainBeam(
              fxCtx, p.x, y, dx, dy, baseLength,
              srcData[p.idx], srcData[p.idx + 1], srcData[p.idx + 2],
              baseOpacity, isBidirectional, flickerAmt, beamIndex,
              p.lum, lumMod, colorMode, tintColor, originDot, beamWidth
            );
          }
        } else if (peakX > 0 && peakIdx >= 0) {
          this.drawCurtainBeam(
            fxCtx, peakX, y, dx, dy, baseLength,
            srcData[peakIdx], srcData[peakIdx + 1], srcData[peakIdx + 2],
            baseOpacity, isBidirectional, flickerAmt, beamIndex,
            peakLum, lumMod, colorMode, tintColor, originDot, beamWidth
          );
        }
      }
    }

    fxCtx.restore();

    renderCtx.save();
    renderCtx.globalAlpha = 1.0;
    renderCtx.globalCompositeOperation = blendMode;
    renderCtx.drawImage(fxCanvas, 0, 0);
    renderCtx.restore();
  }

  /**
   * Helper to draw a single linear gradient curtain beam with optional bidirectional flow,
   * brightness dynamics, color styling, and laser anchor beads
   */
  static drawCurtainBeam(
    ctx, x0, y0, dx, dy, baseLength,
    r, g, b, baseOpacity, isBidirectional, flickerAmt, i,
    peakLum, lumMod, colorMode, tintColor, originDot, beamWidth
  ) {
    let beamLen = baseLength;
    let alpha = baseOpacity;

    // 1. Pixel Brightness Dynamics (Energy Modulation)
    if (lumMod > 0) {
      const normLum = Math.max(0.04, Math.min(1.0, (peakLum || 128) / 255));
      const energy = Math.pow(normLum, 1.3);
      beamLen *= (1.0 - lumMod * 0.75 + energy * lumMod * 1.5);
      alpha = Math.max(0.03, Math.min(1.0, alpha * (1.0 - lumMod * 0.45 + energy * lumMod * 0.8)));
    }

    // 2. Analog Electric Shimmer / Flicker
    if (flickerAmt > 0) {
      const t = state.time;
      const wave1 = Math.sin(t * 32.0 + i * 0.7);
      const wave2 = Math.cos(t * 54.0 + i * 1.3);
      const combined = (wave1 + wave2) * 0.5;

      if (flickerAmt > 0.25 && Math.sin(t * 40.0 + i * 3.1) > (1.75 - flickerAmt * 0.75)) {
        alpha *= 0.1;
      }

      beamLen *= Math.max(0.15, 1.0 + combined * flickerAmt * 0.7);
      alpha = Math.max(0.04, Math.min(1.0, alpha * (1.0 - flickerAmt * 0.35 + combined * flickerAmt * 0.5)));
    }

    // 3. Color Styling (Neon Boost / Laser White / Tint / Source)
    let cr = r, cg = g, cb = b;
    if (colorMode === 'neon') {
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const d = maxC - minC;
      if (d < 18) {
        cr = Math.min(255, r + 20);
        cg = Math.min(255, g + 60);
        cb = Math.min(255, b + 90);
      } else {
        const avg = (r + g + b) / 3;
        cr = Math.max(0, Math.min(255, Math.round(avg + (r - avg) * 1.8 + 25)));
        cg = Math.max(0, Math.min(255, Math.round(avg + (g - avg) * 1.8 + 25)));
        cb = Math.max(0, Math.min(255, Math.round(avg + (b - avg) * 1.8 + 25)));
      }
    } else if (colorMode === 'white') {
      cr = 255; cg = 255; cb = 255;
    } else if (colorMode === 'tint') {
      const tc = hexToRgb(tintColor || '#00f2fe');
      const lumRatio = Math.max(0.2, (r * 0.299 + g * 0.587 + b * 0.114) / 255);
      cr = Math.round(tc.r * (0.35 + 0.65 * lumRatio));
      cg = Math.round(tc.g * (0.35 + 0.65 * lumRatio));
      cb = Math.round(tc.b * (0.35 + 0.65 * lumRatio));
    }

    let xStart, yStart, xEnd, yEnd;
    let grad;

    if (isBidirectional) {
      xStart = x0 - dx * beamLen;
      yStart = y0 - dy * beamLen;
      xEnd = x0 + dx * beamLen;
      yEnd = y0 + dy * beamLen;

      grad = ctx.createLinearGradient(xStart, yStart, xEnd, yEnd);
      grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      grad.addColorStop(0.35, `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.5})`);
      grad.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, ${alpha})`);
      grad.addColorStop(0.65, `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.5})`);
      grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
    } else {
      xStart = x0;
      yStart = y0;
      xEnd = x0 + dx * beamLen;
      yEnd = y0 + dy * beamLen;

      grad = ctx.createLinearGradient(xStart, yStart, xEnd, yEnd);
      grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${alpha})`);
      grad.addColorStop(0.45, `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.45})`);
      grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
    }

    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xStart, yStart);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();

    // 4. Origin Anchor Bead (Laser Bead anchored on detected edge point)
    if (originDot) {
      const beadRadius = Math.max(1.8, beamWidth * 0.65);
      ctx.save();
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${Math.min(1.0, alpha * 1.35)})`;
      ctx.shadowColor = `rgba(${cr}, ${cg}, ${cb}, 0.85)`;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(x0, y0, beadRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Topographic Luminance Contours
   */
  static applyContours(renderCtx, w, h) {
    const levels = Math.max(4, Math.min(32, state.geoContourLevels || 12));
    const opacity = (state.geoContourOpacity || 70) / 100;
    const color = state.geoContourColor || '#39ff14';

    const { canvas: fxCanvas, ctx: fxCtx } = getGeoContext(w, h);
    fxCtx.clearRect(0, 0, w, h);

    const srcImgData = renderCtx.getImageData(0, 0, w, h);
    const srcData = srcImgData.data;

    const outImgData = fxCtx.createImageData(w, h);
    const outData = outImgData.data;

    const rgb = hexToRgb(color);
    const cr = rgb.r;
    const cg = rgb.g;
    const cb = rgb.b;

    const step = 255 / levels;
    const stride = 2;

    for (let y = 1; y < h - stride; y += stride) {
      const row = y * w;
      const nextRow = (y + stride) * w;

      for (let x = 1; x < w - stride; x += stride) {
        const idx = (row + x) * 4;
        const lum = 0.299 * srcData[idx] + 0.587 * srcData[idx + 1] + 0.114 * srcData[idx + 2];
        const lvl = Math.floor(lum / step);

        const rIdx = (row + x + stride) * 4;
        const lumR = 0.299 * srcData[rIdx] + 0.587 * srcData[rIdx + 1] + 0.114 * srcData[rIdx + 2];
        const lvlR = Math.floor(lumR / step);

        const bIdx = (nextRow + x) * 4;
        const lumB = 0.299 * srcData[bIdx] + 0.587 * srcData[bIdx + 1] + 0.114 * srcData[bIdx + 2];
        const lvlB = Math.floor(lumB / step);

        if (lvl !== lvlR || lvl !== lvlB) {
          outData[idx] = cr;
          outData[idx + 1] = cg;
          outData[idx + 2] = cb;
          outData[idx + 3] = 255;

          outData[idx + 4] = cr;
          outData[idx + 5] = cg;
          outData[idx + 6] = cb;
          outData[idx + 7] = 220;
        }
      }
    }

    fxCtx.putImageData(outImgData, 0, 0);

    renderCtx.save();
    renderCtx.globalAlpha = opacity;
    renderCtx.globalCompositeOperation = 'screen';
    renderCtx.drawImage(fxCanvas, 0, 0);
    renderCtx.restore();
  }

  /**
   * Micro-HUD Geometry Nodes
   */
  static applyGeometryNodes(renderCtx, w, h) {
    const density = (state.geoNodeDensity !== undefined ? state.geoNodeDensity : 35) / 100;
    const size = Math.max(3, Math.min(24, state.geoNodeSize || 8));
    const strokeWidth = Math.max(0.5, Math.min(3, state.geoNodeStroke || 1));
    const shape = state.geoNodeShape || 'bracket';
    const color = state.geoNodeColor || '#00f2fe';

    const srcImgData = renderCtx.getImageData(0, 0, w, h);
    const src = srcImgData.data;

    const step = Math.max(8, Math.round(28 * (1.15 - density)));
    const edgeThreshold = 55;

    renderCtx.save();
    renderCtx.strokeStyle = color;
    renderCtx.fillStyle = color;
    renderCtx.lineWidth = strokeWidth;

    const timeRot = (state.time * 0.4) % (Math.PI * 2);

    for (let y = step; y < h - step; y += step) {
      const row = y * w;
      for (let x = step; x < w - step; x += step) {
        const idxL = (row + (x - 2)) * 4;
        const idxR = (row + (x + 2)) * 4;
        const idxT = ((y - 2) * w + x) * 4;
        const idxB = ((y + 2) * w + x) * 4;

        const lumL = 0.299 * src[idxL] + 0.587 * src[idxL + 1] + 0.114 * src[idxL + 2];
        const lumR = 0.299 * src[idxR] + 0.587 * src[idxR + 1] + 0.114 * src[idxR + 2];
        const lumT = 0.299 * src[idxT] + 0.587 * src[idxT + 1] + 0.114 * src[idxT + 2];
        const lumB = 0.299 * src[idxB] + 0.587 * src[idxB + 1] + 0.114 * src[idxB + 2];

        const gx = lumR - lumL;
        const gy = lumB - lumT;
        const mag = Math.sqrt(gx * gx + gy * gy);

        if (mag > edgeThreshold) {
          const theta = Math.atan2(gy, gx) + Math.PI / 2;

          let currentShape = shape;
          if (shape === 'mixed') {
            const hsh = (x * 19 + y * 37) % 4;
            currentShape = hsh === 0 ? 'bracket' : (hsh === 1 ? 'cross' : (hsh === 2 ? 'diamond' : 'dot'));
          }

          this.drawSymbol(renderCtx, x, y, currentShape, size, theta, timeRot);
        }
      }
    }

    renderCtx.restore();
  }

  static drawSymbol(ctx, x, y, shape, size, theta, timeRot) {
    const s = size / 2;

    ctx.save();
    ctx.translate(x, y);

    if (shape === 'bracket') {
      ctx.rotate(theta);
      const arm = Math.max(2, s * 0.6);

      ctx.beginPath();
      ctx.moveTo(-s + arm, -s);
      ctx.lineTo(-s, -s);
      ctx.lineTo(-s, -s + arm);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(s - arm, s);
      ctx.lineTo(s, s);
      ctx.lineTo(s, s - arm);
      ctx.stroke();
    } else if (shape === 'cross') {
      ctx.rotate(timeRot * 0.5);
      const gap = Math.max(1, s * 0.25);

      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(-gap, 0);
      ctx.moveTo(gap, 0);
      ctx.lineTo(s, 0);
      ctx.moveTo(0, -s);
      ctx.lineTo(0, -gap);
      ctx.moveTo(0, gap);
      ctx.lineTo(0, s);
      ctx.stroke();
    } else if (shape === 'diamond') {
      ctx.rotate(theta);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.stroke();
    } else if (shape === 'dot') {
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, s * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function hexToRgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}
