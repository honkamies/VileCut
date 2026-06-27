import { state } from './state.js';
import { getTimelineDuration, getPseudoRandom, applyEdgeFade } from './utils.js';

const overlayVideoCanvas = document.createElement('canvas');
const overlayVideoCtx = overlayVideoCanvas.getContext('2d');
const overlayVideoMaskCanvas = document.createElement('canvas');
const overlayVideoMaskCtx = overlayVideoMaskCanvas.getContext('2d');
const textCanvas = document.createElement('canvas');
const textCtx = textCanvas.getContext('2d');

let lastOverlayVideoFilter = '';


function getTransitionProgress(textObj, loopTime) {
  const duration = textObj.endTime - textObj.startTime;
  if (duration <= 0) return 0;
  
  const transDuration = Math.min(textObj.transitionDuration !== undefined ? textObj.transitionDuration : 0.4, duration / 2);
  if (transDuration <= 0) return 1.0;
  
  if (loopTime < textObj.startTime || loopTime > textObj.endTime) return 0;
  
  // Intro phase
  if (loopTime < textObj.startTime + transDuration) {
    return (loopTime - textObj.startTime) / transDuration;
  }
  // Outro phase
  if (loopTime > textObj.endTime - transDuration) {
    return (textObj.endTime - loopTime) / transDuration;
  }
  
  return 1.0;
}

function getMaxLineWidth(ctx, textVal) {
  const lines = textVal.split('\n');
  let maxWidth = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxWidth) maxWidth = w;
  }
  return maxWidth || 100;
}

function renderGlitchTextLine(renderCtx, lineText, textObj, time, overrideGlitchMode, overrideGlitchIntensity, drawSize, xOffset, yOffset) {
  const intensity = overrideGlitchIntensity !== undefined ? overrideGlitchIntensity : (textObj.glitchIntensity / 100);
  const mode = overrideGlitchMode !== undefined ? overrideGlitchMode : textObj.glitchMode;
  const isMono = !!textObj.glitchMono;
  
  if (mode === 'none') {
    renderCtx.fillStyle = textObj.color;
    renderCtx.fillText(lineText, xOffset, yOffset);
  } 
  else if (mode === 'rgb-split') {
    const shift = drawSize * intensity * 0.12 * (0.5 + 0.5 * Math.sin(time * 30));
    
    renderCtx.fillStyle = isMono ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 0, 80, 0.85)';
    renderCtx.fillText(lineText, xOffset - shift, yOffset);
    
    renderCtx.fillStyle = isMono ? 'rgba(80, 80, 80, 0.75)' : 'rgba(0, 242, 254, 0.85)';
    renderCtx.fillText(lineText, xOffset + shift, yOffset);
    
    renderCtx.fillStyle = textObj.color;
    renderCtx.fillText(lineText, xOffset, yOffset);
  } 
  else if (mode === 'scramble') {
    const scrambleChance = intensity * 0.35;
    const glyphs = '10#$@%&X[]{}<>_\\/█▓▒░';
    let scrambledText = '';
    
    for (let i = 0; i < lineText.length; i++) {
      if (lineText[i] !== ' ' && Math.random() < scrambleChance) {
        scrambledText += glyphs[Math.floor(Math.random() * glyphs.length)];
      } else {
        scrambledText += lineText[i];
      }
    }
    
    renderCtx.fillStyle = textObj.color;
    renderCtx.fillText(scrambledText, xOffset, yOffset);
  } 
  else if (mode === 'flicker') {
    let opacity = 1.0;
    if (Math.random() < intensity * 0.25) {
      opacity = Math.random() > 0.5 ? 0.0 : 0.2 + Math.random() * 0.4;
    }
    
    const prevAlpha = renderCtx.globalAlpha;
    renderCtx.globalAlpha = prevAlpha * opacity;
    renderCtx.fillStyle = textObj.color;
    
    const shiftX = (Math.random() - 0.5) * drawSize * intensity * 0.08;
    const shiftY = (Math.random() - 0.5) * drawSize * intensity * 0.08;
    
    renderCtx.fillText(lineText, xOffset + shiftX, yOffset + shiftY);
    renderCtx.globalAlpha = prevAlpha;
  }
  else if (mode === 'chaos') {
    let opacity = 1.0;
    if (Math.random() < intensity * 0.3) {
      opacity = Math.random() > 0.5 ? 0.1 : 0.3 + Math.random() * 0.4;
    }
    const prevAlpha = renderCtx.globalAlpha;
    renderCtx.globalAlpha = prevAlpha * opacity;
    
    const scrambleChance = intensity * 0.4;
    const glyphs = '10#$@%&X[]{}<>_\\/█▓▒░';
    let scrambledText = '';
    for (let i = 0; i < lineText.length; i++) {
      if (lineText[i] !== ' ' && Math.random() < scrambleChance) {
        scrambledText += glyphs[Math.floor(Math.random() * glyphs.length)];
      } else {
        scrambledText += lineText[i];
      }
    }
    
    const shift = drawSize * intensity * 0.15 * (Math.random() - 0.5);
    const shiftY = drawSize * intensity * 0.05 * (Math.random() - 0.5);
    const isMono = !!textObj.glitchMono;
    
    renderCtx.fillStyle = isMono ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 0, 80, 0.8)';
    renderCtx.fillText(scrambledText, xOffset - shift + (Math.random() - 0.5)*2, yOffset + shiftY);
    
    renderCtx.fillStyle = isMono ? 'rgba(80, 80, 80, 0.75)' : 'rgba(0, 242, 254, 0.8)';
    renderCtx.fillText(scrambledText, xOffset + shift + (Math.random() - 0.5)*2, yOffset - shiftY);
    
    renderCtx.fillStyle = textObj.color;
    renderCtx.fillText(scrambledText, xOffset, yOffset);
    renderCtx.globalAlpha = prevAlpha;
  }
}

function renderGlitchText(renderCtx, textVal, textObj, time, overrideGlitchMode, overrideGlitchIntensity, drawSize) {
  const lines = textVal.split('\n');
  const lineCount = lines.length;
  const lineHeight = drawSize * 1.2;
  const totalHeight = lineHeight * (lineCount - 1);
  
  for (let i = 0; i < lineCount; i++) {
    const yOffset = -totalHeight / 2 + i * lineHeight;
    renderGlitchTextLine(renderCtx, lines[i], textObj, time, overrideGlitchMode, overrideGlitchIntensity, drawSize, 0, yOffset);
  }
}


export function drawTextOverlays(renderCtx, w, h, time, trackIdx) {
  if (state.texts.length === 0) return;
  
  const dur = getTimelineDuration();
  const loopTime = ((time % dur) + dur) % dur;
  
  const filteredTexts = trackIdx !== undefined 
    ? state.texts.filter(t => (t.trackIndex !== undefined ? t.trackIndex : 0) === trackIdx)
    : [...state.texts].sort((a, b) => (a.trackIndex !== undefined ? a.trackIndex : 0) - (b.trackIndex !== undefined ? b.trackIndex : 0));
  
  filteredTexts.forEach((textObj) => {

    if (loopTime < textObj.startTime || loopTime > textObj.endTime) return;
    
    const f = getTransitionProgress(textObj, loopTime);
    if (f <= 0) return;
    
    renderCtx.save();
    
    const scaleMultiplier = w / 1024;
    
    // Generate a unique 16-bit hash seed from the text block's ID
    let seed = 0;
    for (let i = 0; i < textObj.id.length; i++) {
      seed = (seed * 31 + textObj.id.charCodeAt(i)) & 0xffff;
    }
    
    // 1. Idle Jitter: Rapid CRT style coordinate displacement offsets
    const jitterMax = textObj.idleWobble !== undefined ? textObj.idleWobble : 5.0;
    let jitterX = 0;
    let jitterY = 0;
    if (jitterMax > 0) {
      const jitterFrame = Math.floor(time * 24); // 24 discrete steps per second for a stop-motion look
      jitterX = (getPseudoRandom(seed + jitterFrame * 13) - 0.5) * jitterMax * 2;
      jitterY = (getPseudoRandom(seed + jitterFrame * 17 + 9) - 0.5) * jitterMax * 2;
    }
    
    const cx = w / 2;
    const cy = h / 2;
    const dx = cx + textObj.x * w + jitterX * scaleMultiplier;
    const dy = cy + textObj.y * h + jitterY * scaleMultiplier;
    
    renderCtx.translate(dx, dy);
    renderCtx.rotate(textObj.angle * Math.PI / 180);
    
    // 2. Glitch Twitch: Occasional sudden rotation, scale, and skew disruptions
    const twitchPct = textObj.idleSkew !== undefined ? textObj.idleSkew : 0.10; // Stored as fraction (0.0 - 1.0)
    let twitchRot = 0;
    let twitchSkewX = 0;
    let twitchSkewY = 0;
    let twitchScaleX = 1.0;
    let twitchScaleY = 1.0;
    
    if (twitchPct > 0) {
      const twitchFrame = Math.floor(time * 12); // 12 checks per second
      if (getPseudoRandom(seed + twitchFrame * 31) < twitchPct) {
        // Sharp pseudo-random disturbance values when a twitch triggers
        twitchRot = (getPseudoRandom(seed + twitchFrame * 43) - 0.5) * 0.25; // up to ~7 degrees rotation jump
        twitchSkewX = (getPseudoRandom(seed + twitchFrame * 53) - 0.5) * 0.15;
        twitchSkewY = (getPseudoRandom(seed + twitchFrame * 67) - 0.5) * 0.15;
        twitchScaleX = 1.0 + (getPseudoRandom(seed + twitchFrame * 79) - 0.5) * 0.4; // up to 20% squish/stretch
        twitchScaleY = 1.0 + (getPseudoRandom(seed + twitchFrame * 89) - 0.5) * 0.4;
      }
    }
    
    renderCtx.rotate(twitchRot);
    renderCtx.transform(twitchScaleX, twitchSkewY, twitchSkewX, twitchScaleY, 0, 0);
    
    const drawSize = textObj.size * scaleMultiplier;
    
    renderCtx.font = `${drawSize}px "${textObj.font}"`;
    renderCtx.textAlign = 'center';
    renderCtx.textBaseline = 'middle';
    
    const textVal = textObj.text || '';
    const mode = textObj.transitionMode || 'fade-blur';
    
    let flickerAlpha = 1.0;
    if (textObj.flickerIntensity > 0) {
      const flickerSpeed = 20.0;
      const noiseVal = getPseudoRandom(Math.floor(loopTime * flickerSpeed) + seed + 909.09);
      flickerAlpha = 1.0 - (noiseVal * (textObj.flickerIntensity / 100));
    }
    
    const oldAlpha = renderCtx.globalAlpha;
    renderCtx.globalAlpha = oldAlpha * f * flickerAlpha;
    
    let activeGlitchMode = textObj.glitchMode;
    let activeGlitchIntensity = textObj.glitchIntensity / 100;
    
    if (f < 0.95) {
      const transPct = 1 - f;
      if (mode === 'slide-glitch' || mode === 'glitch-reveal') {
        activeGlitchMode = 'chaos';
        activeGlitchIntensity = Math.max(activeGlitchIntensity, transPct * 0.95);
      } else if (mode === 'character-scatter') {
        activeGlitchMode = 'rgb-split';
        activeGlitchIntensity = Math.max(activeGlitchIntensity, transPct * 0.85);
      } else if (mode === 'fade-blur') {
        activeGlitchMode = 'flicker';
        activeGlitchIntensity = Math.max(activeGlitchIntensity, transPct * 0.6);
      } else if (mode === 'scale-zoom') {
        activeGlitchMode = 'rgb-split';
        activeGlitchIntensity = Math.max(activeGlitchIntensity, transPct * 0.7);
      } else if (mode === 'fade') {
        activeGlitchMode = 'rgb-split';
        activeGlitchIntensity = Math.max(activeGlitchIntensity, transPct * 0.4);
      }
    }
    
    if ('filter' in renderCtx) {
      if (mode === 'fade-blur' && 1 - f > 0.01) {
        renderCtx.filter = 'blur(' + ((1 - f) * 25).toFixed(1) + 'px)';
      } else if (mode === 'scale-zoom' && 1 - f > 0.01) {
        renderCtx.filter = 'blur(' + ((1 - f) * 12).toFixed(1) + 'px)';
      } else if (mode === 'slide-glitch' && 1 - f > 0.01) {
        renderCtx.filter = 'blur(' + ((1 - f) * 8).toFixed(1) + 'px)';
      } else if (mode === 'glitch-reveal' && 1 - f > 0.01) {
        renderCtx.filter = 'blur(' + ((1 - f) * 10).toFixed(1) + 'px)';
      } else {
        renderCtx.filter = 'none';
      }
    }
    
    if (mode === 'scale-zoom') {
      const transDuration = Math.min(textObj.transitionDuration !== undefined ? textObj.transitionDuration : 0.4, (textObj.endTime - textObj.startTime) / 2);
      const isIntro = (loopTime < textObj.startTime + transDuration);
      
      let scaleVal;
      if (isIntro) {
        scaleVal = 0.1 + 0.9 * Math.pow(f, 3);
      } else {
        scaleVal = 1.0 + 1.5 * Math.pow(1 - f, 2);
      }
      renderCtx.scale(scaleVal, scaleVal);
      
      const wobbleAngle = (1 - f) * 20 * (Math.PI / 180) * (seed % 2 === 0 ? 1 : -1);
      renderCtx.rotate(wobbleAngle);
    }
    
    if (mode === 'fade-blur') {
      const stretchX = 1.0 + (1 - f) * 0.25;
      const stretchY = 1.0 - (1 - f) * 0.05;
      renderCtx.scale(stretchX, stretchY);
    }
    
    if (mode === 'slide-glitch') {
      const transDuration = Math.min(textObj.transitionDuration !== undefined ? textObj.transitionDuration : 0.4, (textObj.endTime - textObj.startTime) / 2);
      const isIntro = (loopTime < textObj.startTime + transDuration);
      const slideDirection = isIntro ? -1 : 1;
      const sliceProgress = 1 - f;
      
      const lines = textVal.split('\n');
      const lineCount = lines.length;
      const lineHeight = drawSize * 1.2;
      const textWidth = getMaxLineWidth(renderCtx, textVal);
      const textHeight = lineHeight * lineCount;
      const yStart = -textHeight * 0.7;
      const yEnd = textHeight * 0.7;
      const totalH = yEnd - yStart;
      
      for (let i = 0; i < 5; i++) {
        const y1 = yStart + (totalH * i) / 5;
        const y2 = yStart + (totalH * (i + 1)) / 5;
        const H_slice = y2 - y1;
        
        renderCtx.save();
        renderCtx.beginPath();
        renderCtx.rect(-textWidth * 2, y1, textWidth * 4, H_slice);
        renderCtx.clip();
        
        const baseSlideX = slideDirection * Math.pow(sliceProgress, 1.2) * (w * 0.65);
        const sliceSeed = seed + i * 23;
        const sliceNoiseX = (getPseudoRandom(sliceSeed + time * 20) - 0.5) * 120 * sliceProgress;
        const sliceNoiseY = (getPseudoRandom(sliceSeed + time * 25 + 7) - 0.5) * 20 * sliceProgress;
        
        let extraShift = 0;
        if (sliceProgress > 0.05 && getPseudoRandom(sliceSeed + time * 37) < sliceProgress * 0.45) {
          extraShift = (getPseudoRandom(sliceSeed + time * 47) - 0.5) * 180 * sliceProgress;
        }
        
        renderCtx.translate(baseSlideX + sliceNoiseX + extraShift, sliceNoiseY);
        renderGlitchText(renderCtx, textVal, textObj, time, activeGlitchMode, activeGlitchIntensity, drawSize);
        renderCtx.restore();
      }
      
      if (sliceProgress > 0.05) {
        const numBlocks = Math.floor(sliceProgress * 5);
        for (let b = 0; b < numBlocks; b++) {
          const bSeed = seed + b * 41 + time * 15;
          if (getPseudoRandom(bSeed) < 0.4) {
            const blockW = textWidth * (0.15 + getPseudoRandom(bSeed + 1) * 0.45);
            const blockH = textHeight * (0.08 + getPseudoRandom(bSeed + 2) * 0.22);
            const baseSlideX = slideDirection * Math.pow(sliceProgress, 1.2) * (w * 0.65);
            const blockX = (getPseudoRandom(bSeed + 3) - 0.5) * textWidth * 1.5 + baseSlideX;
            const blockY = (getPseudoRandom(bSeed + 4) - 0.5) * textHeight * 1.0;
            
            const colors = textObj.glitchMono ? 
              ['rgba(255, 255, 255, 0.85)', 'rgba(120, 120, 120, 0.75)', 'rgba(0, 0, 0, 0.8)'] : 
              ['rgba(0, 242, 254, 0.75)', 'rgba(255, 0, 127, 0.75)', 'rgba(255, 255, 255, 0.9)'];
            renderCtx.fillStyle = colors[Math.floor(getPseudoRandom(bSeed + 5) * colors.length)];
            renderCtx.fillRect(blockX, blockY, blockW, blockH);
          }
        }
      }
    } else if (mode === 'glitch-reveal') {
      const sliceProgress = 1 - f;
      
      const lines = textVal.split('\n');
      const lineCount = lines.length;
      const lineHeight = drawSize * 1.2;
      const textWidth = getMaxLineWidth(renderCtx, textVal);
      const textHeight = lineHeight * lineCount;
      const yStart = -textHeight * 0.7;
      const yEnd = textHeight * 0.7;
      const totalH = yEnd - yStart;
      
      for (let i = 0; i < 5; i++) {
        const y1 = yStart + (totalH * i) / 5;
        const y2 = yStart + (totalH * (i + 1)) / 5;
        const H_slice = y2 - y1;
        
        renderCtx.save();
        renderCtx.beginPath();
        renderCtx.rect(-textWidth * 2, y1, textWidth * 4, H_slice);
        renderCtx.clip();
        
        const sliceSeed = seed + i * 31;
        const sliceNoiseX = (getPseudoRandom(sliceSeed + time * 30) - 0.5) * 45 * sliceProgress;
        const sliceNoiseY = (getPseudoRandom(sliceSeed + time * 35 + 3) - 0.5) * 8 * sliceProgress;
        
        let extraShift = 0;
        if (sliceProgress > 0.05 && getPseudoRandom(sliceSeed + time * 43) < sliceProgress * 0.5) {
          extraShift = (getPseudoRandom(sliceSeed + time * 53) - 0.5) * 75 * sliceProgress;
        }
        
        renderCtx.translate(sliceNoiseX + extraShift, sliceNoiseY);
        renderGlitchText(renderCtx, textVal, textObj, time, activeGlitchMode, activeGlitchIntensity, drawSize);
        renderCtx.restore();
      }
      
      if (sliceProgress > 0.05) {
        const numBlocks = Math.floor(sliceProgress * 6);
        for (let b = 0; b < numBlocks; b++) {
          const bSeed = seed + b * 53 + time * 18;
          if (getPseudoRandom(bSeed) < 0.45) {
            const blockW = textWidth * (0.1 + getPseudoRandom(bSeed + 1) * 0.5);
            const blockH = textHeight * (0.05 + getPseudoRandom(bSeed + 2) * 0.25);
            const blockX = (getPseudoRandom(bSeed + 3) - 0.5) * textWidth * 1.6;
            const blockY = (getPseudoRandom(bSeed + 4) - 0.5) * textHeight * 1.0;
            
            const colors = textObj.glitchMono ? 
              ['rgba(255, 255, 255, 0.9)', 'rgba(120, 120, 120, 0.8)', 'rgba(0, 0, 0, 0.85)'] : 
              ['rgba(0, 242, 254, 0.8)', 'rgba(255, 0, 127, 0.8)', 'rgba(255, 255, 255, 0.95)'];
            renderCtx.fillStyle = colors[Math.floor(getPseudoRandom(bSeed + 5) * colors.length)];
            renderCtx.fillRect(blockX, blockY, blockW, blockH);
          }
        }
      }
    } else if (mode === 'character-scatter') {
      const transDuration = Math.min(textObj.transitionDuration !== undefined ? textObj.transitionDuration : 0.4, (textObj.endTime - textObj.startTime) / 2);
      const isIntro = (loopTime < textObj.startTime + transDuration);
      
      const lines = textVal.split('\n');
      const lineCount = lines.length;
      const lineHeight = drawSize * 1.2;
      const totalHeight = lineHeight * (lineCount - 1);
      
      let globalCharIdx = 0;
      const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
      
      lines.forEach((line, lineIdx) => {
        const chars = line.split('');
        const charWidths = chars.map(c => renderCtx.measureText(c).width);
        const totalLineWidth = charWidths.reduce((sum, w) => sum + w, 0);
        
        const startX = -totalLineWidth / 2;
        const lineY = -totalHeight / 2 + lineIdx * lineHeight;
        let currentX = startX;
        
        chars.forEach((c, idx) => {
          const charW = charWidths[idx];
          const charCenterX = currentX + charW / 2;
          
          renderCtx.save();
          
          const staggerStrength = 0.5;
          const charWindow = 1.0 - staggerStrength;
          const orderIdx = isIntro ? globalCharIdx : (totalChars - 1 - globalCharIdx);
          const startRatio = (orderIdx / Math.max(1, totalChars - 1)) * staggerStrength;
          
          let fChar = 1.0;
          if (f <= startRatio) fChar = 0.0;
          else if (f >= startRatio + charWindow) fChar = 1.0;
          else fChar = (f - startRatio) / charWindow;
          
          const scatterProgress = 1 - fChar;
          
          const seedX = seed + globalCharIdx * 17.1 + 1.3;
          const seedY = seed + globalCharIdx * 29.3 + 4.7;
          const seedR = seed + globalCharIdx * 41.5 + 8.1;
          
          const randX = getPseudoRandom(seedX) * 2 - 1;
          const randY = getPseudoRandom(seedY) * 2 - 1;
          const randR = getPseudoRandom(seedR) * 2 - 1;
          
          const scatterDist = Math.pow(scatterProgress, 1.8) * 350;
          const charDx = randX * scatterDist;
          const charDy = randY * scatterDist;
          const charAngle = randR * Math.PI * 1.5 * scatterProgress;
          const charScale = 0.0 + 1.0 * fChar;
          
          renderCtx.translate(charCenterX + charDx, lineY + charDy);
          renderCtx.rotate(charAngle);
          renderCtx.scale(charScale, charScale);
          
          let charGlitchMode = textObj.glitchMode;
          let charGlitchIntensity = textObj.glitchIntensity / 100;
          if (scatterProgress > 0.05) {
            charGlitchMode = 'rgb-split';
            charGlitchIntensity = Math.max(charGlitchIntensity, scatterProgress * 0.9);
          }
          
          renderGlitchTextLine(renderCtx, c, textObj, time, charGlitchMode, charGlitchIntensity, drawSize, 0, 0);
          
          renderCtx.restore();
          currentX += charW;
          globalCharIdx++;
        });
      });
    } else {
      renderGlitchText(renderCtx, textVal, textObj, time, activeGlitchMode, activeGlitchIntensity, drawSize);
    }
    
    if ('filter' in renderCtx) {
      renderCtx.filter = 'none';
    }
    renderCtx.globalAlpha = oldAlpha;
    renderCtx.restore();
  });
}

export function drawGraphicOverlays(renderCtx, w, h, time, trackIdx) {
  if (state.graphics.length === 0) return;
  
  const filteredGraphics = trackIdx !== undefined
    ? state.graphics.filter(g => (g.trackIndex !== undefined ? g.trackIndex : 0) === trackIdx)
    : state.graphics;
  
  filteredGraphics.forEach(grp => {
    const dur = getTimelineDuration();
    const loopTime = ((time % dur) + dur) % dur;
    if (loopTime >= grp.startTime && loopTime <= grp.endTime) {
      if (!grp.img) return;

      renderCtx.save();
      
      // Generate a unique 16-bit hash seed from the graphic block's ID
      let grpSeed = 0;
      for (let i = 0; i < grp.id.length; i++) {
        grpSeed = (grpSeed * 31 + grp.id.charCodeAt(i)) & 0xffff;
      }
      
      const cx = w / 2;
      const cy = h / 2;
      let dx = cx + grp.x * w;
      let dy = cy + grp.y * h;
      
      const frameIdx = Math.floor(loopTime * 30);
      const randGlitch = getPseudoRandom(frameIdx + grpSeed + 201.55);
      const shouldGlitch = randGlitch < (grp.glitchFrequency / 100);
      
      // Scale proportionally relative to canvas width (base width = 1024)
      const scaleMultiplier = w / 1024;
      
      if (shouldGlitch) {
        const maxDisplace = (grp.glitchAmplitude / 100) * 80 * scaleMultiplier;
        dx += (getPseudoRandom(frameIdx + grpSeed + 301.11) - 0.5) * 2 * maxDisplace;
        dy += (getPseudoRandom(frameIdx + grpSeed + 401.22) - 0.5) * 2 * maxDisplace;
      }
      
      let alpha = 1.0;
      if (grp.flickerIntensity > 0) {
        const flickerSpeed = 20.0;
        const noiseVal = getPseudoRandom(Math.floor(loopTime * flickerSpeed) + grpSeed + 707.07);
        alpha = 1.0 - (noiseVal * (grp.flickerIntensity / 100));
      }
      
      renderCtx.globalAlpha = alpha;
      
      const iw = grp.img.width;
      const ih = grp.img.height;
      const scaleFactor = grp.scale !== undefined ? grp.scale / 100 : 1.0;
      const finalW = iw * scaleFactor * scaleMultiplier;
      const finalH = ih * scaleFactor * scaleMultiplier;
      
      renderCtx.translate(dx, dy);
      
      if (grp.glowActive && grp.glowRadius > 0) {
        renderCtx.shadowColor = grp.glowColor || '#ff007f';
        renderCtx.shadowBlur = grp.glowRadius * scaleMultiplier;
        renderCtx.shadowOffsetX = 0;
        renderCtx.shadowOffsetY = 0;
      }
      
      if ('filter' in renderCtx) {
        const brightnessVal = grp.brightness !== undefined ? grp.brightness : 100;
        const contrastVal = grp.contrast !== undefined ? grp.contrast : 100;
        renderCtx.filter = `brightness(${brightnessVal}%) contrast(${contrastVal}%)`;
      }
      
      if (shouldGlitch && grp.glitchAmplitude > 0) {

        const splitAmt = (grp.glitchAmplitude / 100) * 25 * scaleMultiplier;
        
        renderCtx.save();
        renderCtx.globalAlpha = alpha * 0.5;
        renderCtx.drawImage(grp.img, -finalW / 2 - splitAmt, -finalH / 2, finalW, finalH);
        renderCtx.restore();
        
        renderCtx.save();
        renderCtx.globalAlpha = alpha * 0.5;
        renderCtx.drawImage(grp.img, -finalW / 2 + splitAmt, -finalH / 2, finalW, finalH);
        renderCtx.restore();
      }
      
      renderCtx.drawImage(grp.img, -finalW / 2, -finalH / 2, finalW, finalH);
      
      if (shouldGlitch && grp.glitchAmplitude > 0) {
        const blockCount = Math.floor(1 + (grp.glitchAmplitude / 100) * 5);
        for (let b = 0; b < blockCount; b++) {
          const bw = (getPseudoRandom(frameIdx + grpSeed + b * 2) * 0.3 + 0.05) * finalW;
          const bh = (getPseudoRandom(frameIdx + grpSeed + b * 3) * 0.15 + 0.03) * finalH;
          const bx = (getPseudoRandom(frameIdx + grpSeed + b * 4) - 0.5) * finalW;
          const by = (getPseudoRandom(frameIdx + grpSeed + b * 5) - 0.5) * finalH;
          
          const isWhite = getPseudoRandom(frameIdx + grpSeed + b * 6) < 0.7;
          renderCtx.fillStyle = isWhite ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)';
          renderCtx.fillRect(bx, by, bw, bh);
        }
      }
      
      if ('filter' in renderCtx) {
        renderCtx.filter = 'none';
      }
      renderCtx.restore();
    }
  });
}

export function drawVideoOverlay(renderCtx, w, h, time, vid) {
  if (!vid.element) return;

  const dur = getTimelineDuration();
  const loopTime = ((time % dur) + dur) % dur;
  
  if (loopTime < vid.startTime || loopTime > vid.endTime) return;

  // Resize local buffer canvas to match current render context width/height
  if (overlayVideoCanvas.width !== w || overlayVideoCanvas.height !== h) {
    overlayVideoCanvas.width = w;
    overlayVideoCanvas.height = h;
  }

  // Draw filtered video frame onto local buffer canvas
  const brightnessVal = vid.brightness !== undefined ? vid.brightness : 100;
  const contrastVal = vid.contrast !== undefined ? vid.contrast : 100;
  const monochromeStr = vid.monochrome ? 'grayscale(100%)' : '';
  const newFilter = `brightness(${brightnessVal}%) contrast(${contrastVal}%) ${monochromeStr}`.trim() || 'none';
  if (lastOverlayVideoFilter !== newFilter) {
    overlayVideoCtx.filter = newFilter;
    lastOverlayVideoFilter = newFilter;
  }
  overlayVideoCtx.clearRect(0, 0, w, h);

  const video = vid.element;
  const vw = video.videoWidth || video.width || w;
  const vh = video.videoHeight || video.height || h;
  const coverScale = Math.max(w / vw, h / vh);
  const drawW = vw * coverScale;
  const drawH = vh * coverScale;
  const drawX = (w - drawW) / 2 + (vid.x !== undefined ? vid.x : 0.0) * w;
  const drawY = (h - drawH) / 2 + (vid.y !== undefined ? vid.y : 0.0) * h;
  overlayVideoCtx.drawImage(video, drawX, drawY, drawW, drawH);
  if (vid.edgeFade > 0) {
    applyEdgeFade(overlayVideoCtx, drawX, drawY, drawW, drawH, vid.edgeFade);
  }

  // Apply mirroring/kaleidoscope to overlayVideoCanvas drawing on renderCtx
  const mode = vid.mirrorMode || 'none';
  renderCtx.save();

  let opacity = 1.0;
  const elapsed = loopTime - vid.startTime;
  const remaining = vid.endTime - loopTime;
  const fadeInDur = vid.fadeInDuration || 0.0;
  const fadeOutDur = vid.fadeOutDuration || 0.0;
  
  if (fadeInDur > 0 && elapsed < fadeInDur) {
    opacity = Math.max(0, Math.min(1, elapsed / fadeInDur));
  } else if (fadeOutDur > 0 && remaining < fadeOutDur) {
    opacity = Math.max(0, Math.min(1, remaining / fadeOutDur));
  }
  
  const prevAlpha = renderCtx.globalAlpha;
  renderCtx.globalAlpha = prevAlpha * opacity;

  if (mode === 'none') {
    renderCtx.drawImage(overlayVideoCanvas, 0, 0);
  }
  else if (mode === 'horizontal') {
    renderCtx.drawImage(overlayVideoCanvas, 0, 0, w / 2, h, 0, 0, w / 2, h);
    renderCtx.save();
    renderCtx.translate(w, 0);
    renderCtx.scale(-1, 1);
    renderCtx.drawImage(overlayVideoCanvas, 0, 0, w / 2, h, 0, 0, w / 2, h);
    renderCtx.restore();
  }
  else if (mode === 'vertical') {
    renderCtx.drawImage(overlayVideoCanvas, 0, 0, w, h / 2, 0, 0, w, h / 2);
    renderCtx.save();
    renderCtx.translate(0, h);
    renderCtx.scale(1, -1);
    renderCtx.drawImage(overlayVideoCanvas, 0, 0, w, h / 2, 0, 0, w, h / 2);
    renderCtx.restore();
  }
  else if (mode === 'quad') {
    const qw = w / 2;
    const qh = h / 2;
    renderCtx.drawImage(overlayVideoCanvas, 0, 0, w / 2, h / 2, 0, 0, qw, qh);
    
    renderCtx.save();
    renderCtx.translate(w, 0);
    renderCtx.scale(-1, 1);
    renderCtx.drawImage(overlayVideoCanvas, 0, 0, w / 2, h / 2, 0, 0, qw, qh);
    renderCtx.restore();

    renderCtx.save();
    renderCtx.translate(0, h);
    renderCtx.scale(1, -1);
    renderCtx.drawImage(overlayVideoCanvas, 0, 0, w / 2, h / 2, 0, 0, qw, qh);
    renderCtx.restore();

    renderCtx.save();
    renderCtx.translate(w, h);
    renderCtx.scale(-1, -1);
    renderCtx.drawImage(overlayVideoCanvas, 0, 0, w / 2, h / 2, 0, 0, qw, qh);
    renderCtx.restore();
  }
  else if (mode === 'kaleidoscope') {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.sqrt(cx * cx + cy * cy);
    const slices = vid.kaleidoscopeSlices || 8;
    const angle = (Math.PI * 2) / slices;

    renderCtx.translate(cx, cy);

    if (overlayVideoMaskCanvas.width !== w || overlayVideoMaskCanvas.height !== h) {
      overlayVideoMaskCanvas.width = w;
      overlayVideoMaskCanvas.height = h;
    }
    overlayVideoMaskCtx.clearRect(0, 0, w, h);
    
    overlayVideoMaskCtx.save();
    overlayVideoMaskCtx.translate(cx, cy);
    overlayVideoMaskCtx.beginPath();
    overlayVideoMaskCtx.moveTo(0, 0);
    overlayVideoMaskCtx.arc(0, 0, radius, -angle / 2, angle / 2);
    overlayVideoMaskCtx.closePath();
    overlayVideoMaskCtx.clip();
    overlayVideoMaskCtx.drawImage(overlayVideoCanvas, -cx, -cy, w, h);
    overlayVideoMaskCtx.restore();

    for (let s = 0; s < slices; s++) {
      renderCtx.save();
      renderCtx.rotate(s * angle);
      if (s % 2 === 1) {
        renderCtx.scale(1, -1);
      }
      renderCtx.drawImage(overlayVideoMaskCanvas, -cx, -cy);
      renderCtx.restore();
    }
  }

  renderCtx.restore();
}
