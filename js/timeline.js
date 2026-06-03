import { state } from './state.js';
import { UI } from './ui.js';
import { getTimelineDuration } from './utils.js';
import { stopAudioSource, syncAudioPlayback, activeAudioGain } from './audio.js';
import { renderFrame } from './renderer.js';

let dragMode = null; // 'seek', 'move', 'resize-left', 'resize-right'
let dragTextId = null;
let dragStartMouseX = 0;
let dragStartMouseY = 0;
let lastDragTrackY = 0;
let dragStartBlockStart = 0;
let dragStartBlockEnd = 0;
let dragStartSourceOffset = 0;

let isZoomDragging = false;
let zoomDragStartX = 0;
let zoomDragStartZoom = 1.0;


function clampTextIntervals() {
  const dur = getTimelineDuration();
  state.texts.forEach(txt => {
    if (txt.startTime >= dur) {
      const blockLen = txt.endTime - txt.startTime;
      txt.startTime = Math.max(0, dur - blockLen);
      txt.endTime = dur;
    } else if (txt.endTime > dur) {
      txt.endTime = dur;
    }
    
    if (txt.endTime - txt.startTime < 0.2) {
      txt.endTime = Math.min(dur, txt.startTime + 0.2);
      txt.startTime = Math.max(0, txt.endTime - 0.2);
    }
  });
}

function clampGraphicIntervals() {
  const dur = getTimelineDuration();
  state.graphics.forEach(grp => {
    if (grp.startTime >= dur) {
      const blockLen = grp.endTime - grp.startTime;
      grp.startTime = Math.max(0, dur - blockLen);
      grp.endTime = dur;
    } else if (grp.endTime > dur) {
      grp.endTime = dur;
    }
    
    if (grp.endTime - grp.startTime < 0.2) {
      grp.endTime = Math.min(dur, grp.startTime + 0.2);
      grp.startTime = Math.max(0, grp.endTime - 0.2);
    }
  });
}

function clampVideoIntervals() {
  const dur = getTimelineDuration();
  if (!state.videoBlocks) return;
  state.videoBlocks.forEach(vid => {
    if (vid.startTime >= dur) {
      const blockLen = Math.min(vid.duration, vid.endTime - vid.startTime);
      vid.startTime = Math.max(0, dur - blockLen);
      vid.endTime = dur;
    } else if (vid.endTime > dur) {
      vid.endTime = dur;
    }
    
    // Prevent video block from being longer than the source file duration
    if (vid.endTime - vid.startTime > vid.duration) {
      vid.endTime = vid.startTime + vid.duration;
    }
    
    if (vid.endTime - vid.startTime < 0.2) {
      vid.endTime = Math.min(dur, vid.startTime + 0.2);
      vid.startTime = Math.max(0, vid.endTime - 0.2);
    }
  });
}

export function normalizeTextTracks() {
  const uniqueIndices = [...new Set(state.texts.map(t => t.trackIndex !== undefined ? t.trackIndex : 0))].sort((a, b) => a - b);
  state.texts.forEach(t => {
    const oldIdx = t.trackIndex !== undefined ? t.trackIndex : 0;
    t.trackIndex = uniqueIndices.indexOf(oldIdx);
  });
  state.texts.sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0));
}

export function updateTimelineTracks() {
  if (!UI.timelineTracks) return;
  clampTextIntervals();
  clampGraphicIntervals();
  clampVideoIntervals();
  UI.timelineTracks.innerHTML = '';
  
  if (state.texts.length === 0 && !state.audioTrack && state.graphics.length === 0 && (!state.videoBlocks || state.videoBlocks.length === 0) && state.glitchTriggers.length === 0) {
    UI.timelineTracks.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem; text-align: center; padding-top: 15px; font-family: var(--font-display);">No overlays or soundtrack. Add Text, Graphic, Audio, Video, or Glitch Trigger to start.</div>';
    return;
  }
  
  const dur = getTimelineDuration();

  // 1. Render Video Track (if active)
  if (state.videoBlocks && state.videoBlocks.length > 0) {
    const row = document.createElement('div');
    row.className = 'timeline-track-row video-track-row';
    row.dataset.id = 'video_track';
    row.dataset.type = 'video';
    
    state.videoBlocks.forEach((vidObj) => {
      const block = document.createElement('div');
      block.className = 'timeline-block video-block' + (vidObj.id === state.selectedVideoId ? ' selected' : '');
      block.dataset.id = vidObj.id;
      
      const startPct = (vidObj.startTime / dur) * 100;
      const widthPct = ((vidObj.endTime - vidObj.startTime) / dur) * 100;
      
      block.style.left = `${startPct}%`;
      block.style.width = `${widthPct}%`;
      
      const cleanLabel = document.createElement('span');
      cleanLabel.style.pointerEvents = 'none';
      
      const truncName = vidObj.fileName && vidObj.fileName.length > 18
        ? vidObj.fileName.substring(0, 15) + '...'
        : vidObj.fileName || 'Video';
      cleanLabel.innerText = `🎥 ${truncName}`;
      block.appendChild(cleanLabel);
      
      row.appendChild(block);
    });
    
    UI.timelineTracks.appendChild(row);
  }

  // 1.5. Render Audio Track (if active)
  if (state.audioTrack) {
    const track = state.audioTrack;
    const row = document.createElement('div');
    row.className = 'timeline-track-row audio-track-row';
    row.dataset.id = 'audio';
    row.dataset.type = 'audio';
    
    const block = document.createElement('div');
    block.className = 'timeline-block audio-block' + (state.selectedAudio ? ' selected' : '');
    block.dataset.id = 'audio';
    
    const startPct = (track.timelineStart / dur) * 100;
    const widthPct = (track.duration / dur) * 100;
    
    block.style.left = `${startPct}%`;
    block.style.width = `${widthPct}%`;
    
    const cleanLabel = document.createElement('span');
    cleanLabel.style.pointerEvents = 'none';
    cleanLabel.innerText = `🎵 ${track.fileName}`;
    block.appendChild(cleanLabel);
    
    if (track.peaks) {
      const canvas = document.createElement('canvas');
      canvas.className = 'audio-waveform-canvas';
      canvas.width = 1000;
      canvas.height = 40;
      const wCtx = canvas.getContext('2d');
      wCtx.clearRect(0, 0, canvas.width, canvas.height);
      
      const grad = wCtx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, 'rgba(0, 242, 254, 0.55)');
      grad.addColorStop(0.5, 'rgba(155, 81, 224, 0.4)');
      grad.addColorStop(1, 'rgba(0, 242, 254, 0.55)');
      
      wCtx.fillStyle = grad;
      
      const barWidth = 2;
      const gap = 1;
      const totalBars = Math.floor(canvas.width / (barWidth + gap));
      const peakStep = track.peaks.length / totalBars;
      
      for (let i = 0; i < totalBars; i++) {
        const peakIdx = Math.floor(i * peakStep);
        const peak = track.peaks[peakIdx] || 0;
        const barHeight = peak * canvas.height * 0.85;
        const x = i * (barWidth + gap);
        const y = (canvas.height - barHeight) / 2;
        wCtx.fillRect(x, y, barWidth, Math.max(1.5, barHeight));
      }
      block.appendChild(canvas);
    }
    
    row.appendChild(block);
    UI.timelineTracks.appendChild(row);
  }
  
  // 2. Render Text Tracks grouped by trackIndex
  const uniqueTrackIndices = [...new Set(state.texts.map(t => t.trackIndex !== undefined ? t.trackIndex : 0))];
  uniqueTrackIndices.sort((a, b) => a - b);

  uniqueTrackIndices.forEach((trackIdx) => {
    const row = document.createElement('div');
    row.className = 'timeline-track-row';
    row.dataset.id = `text_track_${trackIdx}`;
    row.dataset.type = 'text';
    row.dataset.trackIndex = trackIdx;
    
    const trackTexts = state.texts.filter(t => (t.trackIndex !== undefined ? t.trackIndex : 0) === trackIdx);
    
    trackTexts.forEach((txtObj) => {
      const block = document.createElement('div');
      block.className = 'timeline-block' + (txtObj.id === state.selectedTextId ? ' selected' : '');
      block.dataset.id = txtObj.id;
      
      const startPct = (txtObj.startTime / dur) * 100;
      const widthPct = ((txtObj.endTime - txtObj.startTime) / dur) * 100;
      
      block.style.left = `${startPct}%`;
      block.style.width = `${widthPct}%`;
      
      const cleanLabel = document.createElement('span');
      cleanLabel.style.pointerEvents = 'none';
      cleanLabel.innerText = txtObj.text || '[Empty Text]';
      block.appendChild(cleanLabel);
      
      const leftHandle = document.createElement('div');
      leftHandle.className = 'timeline-block-handle left';
      leftHandle.dataset.handle = 'left';
      leftHandle.dataset.id = txtObj.id;
      
      const rightHandle = document.createElement('div');
      rightHandle.className = 'timeline-block-handle right';
      rightHandle.dataset.handle = 'right';
      rightHandle.dataset.id = txtObj.id;
      
      block.appendChild(leftHandle);
      block.appendChild(rightHandle);
      row.appendChild(block);
    });
    
    UI.timelineTracks.appendChild(row);
  });

  // 3. Render Graphic Tracks
  state.graphics.forEach((grpObj) => {
    const row = document.createElement('div');
    row.className = 'timeline-track-row';
    row.dataset.id = grpObj.id;
    row.dataset.type = 'graphic';
    
    const block = document.createElement('div');
    block.className = 'timeline-block graphic-block' + (grpObj.id === state.selectedGraphicId ? ' selected' : '');
    block.dataset.id = grpObj.id;
    
    const startPct = (grpObj.startTime / dur) * 100;
    const widthPct = ((grpObj.endTime - grpObj.startTime) / dur) * 100;
    
    block.style.left = `${startPct}%`;
    block.style.width = `${widthPct}%`;
    
    const cleanLabel = document.createElement('span');
    cleanLabel.style.pointerEvents = 'none';
    
    const truncName = grpObj.fileName && grpObj.fileName.length > 15 
      ? grpObj.fileName.substring(0, 12) + '...'
      : grpObj.fileName || 'Graphic';
    cleanLabel.innerText = `🖼️ ${truncName} (${grpObj.scale}%)`;
    block.appendChild(cleanLabel);
    
    const leftHandle = document.createElement('div');
    leftHandle.className = 'timeline-block-handle left';
    leftHandle.dataset.handle = 'left';
    leftHandle.dataset.id = grpObj.id;
    
    const rightHandle = document.createElement('div');
    rightHandle.className = 'timeline-block-handle right';
    rightHandle.dataset.handle = 'right';
    rightHandle.dataset.id = grpObj.id;
    
    block.appendChild(leftHandle);
    block.appendChild(rightHandle);
    row.appendChild(block);
    UI.timelineTracks.appendChild(row);
  });

  // 4. Render Glitch Trigger Track (if any triggers exist)
  if (state.glitchTriggers && state.glitchTriggers.length > 0) {
    const row = document.createElement('div');
    row.className = 'timeline-track-row glitch-trigger-track-row';
    row.dataset.id = 'glitch-triggers';
    row.dataset.type = 'glitch-trigger';
    
    state.glitchTriggers.forEach((trigger) => {
      const block = document.createElement('div');
      block.className = 'timeline-block glitch-trigger-block' + (trigger.id === state.selectedGlitchTriggerId ? ' selected' : '');
      block.dataset.id = trigger.id;
      
      block.style.position = 'absolute';
      block.style.left = `${(trigger.time / dur) * 100}%`;
      block.style.width = '18px';
      block.style.height = '100%';
      block.style.transform = 'translateX(-50%)';
      block.style.cursor = 'ew-resize';
      block.style.display = 'flex';
      block.style.alignItems = 'center';
      block.style.justifyContent = 'center';
      block.style.background = trigger.id === state.selectedGlitchTriggerId ? 'var(--pink)' : 'rgba(255, 0, 127, 0.4)';
      block.style.border = '1px solid var(--pink)';
      block.style.boxShadow = trigger.id === state.selectedGlitchTriggerId ? '0 0 10px var(--pink)' : '0 0 4px rgba(255, 0, 127, 0.3)';
      block.style.borderRadius = '3px';
      
      const icon = document.createElement('span');
      icon.style.pointerEvents = 'none';
      icon.style.fontSize = '0.7rem';
      icon.style.color = '#ffffff';
      icon.innerText = '⚡';
      block.appendChild(icon);
      
      row.appendChild(block);
    });
    
    UI.timelineTracks.appendChild(row);
  }
}

export function updateTimelineRuler() {
  if (!UI.timelineRuler) return;
  const dur = getTimelineDuration();
  
  if (UI.timelineDurationSlider && UI.timelineDurationVal) {
    UI.timelineDurationSlider.value = Math.round(dur);
    UI.timelineDurationVal.innerText = `${dur.toFixed(1)}s`;
  }
  
  const pixelsPerSecond = 30 * state.timelineZoom;
  const wrapper = UI.timelinePlayhead?.closest('.timeline-body-wrapper');
  const minWidth = wrapper ? wrapper.clientWidth : 700;
  const widthPx = Math.max(minWidth, Math.round(dur * pixelsPerSecond));
  UI.timelineTracksContainer.style.width = `${widthPx}px`;

  UI.timelineRuler.innerHTML = '';
  
  let interval = 1.0;
  const spacingAt1Sec = pixelsPerSecond;
  if (spacingAt1Sec < 15) {
    interval = 10.0;
  } else if (spacingAt1Sec < 35) {
    interval = 5.0;
  } else if (spacingAt1Sec < 75) {
    interval = 2.0;
  } else if (spacingAt1Sec < 150) {
    interval = 1.0;
  } else if (spacingAt1Sec < 350) {
    interval = 0.5;
  } else {
    interval = 0.1;
  }
  
  for (let t = 0; t <= dur; t += interval) {
    const percent = (t / dur) * 100;
    const tick = document.createElement('div');
    // For 0.1s intervals, major ticks are at whole seconds
    const isMajor = interval < 1.0 ? (Math.abs(t - Math.round(t)) < 0.01) : (t % 1 === 0);
    tick.className = 'ruler-tick' + (isMajor ? ' major' : '');
    tick.style.left = `${percent}%`;
    tick.innerText = `${t.toFixed(1)}s`;
    UI.timelineRuler.appendChild(tick);
  }
}

export function updatePlayhead() {
  if (!UI.timelinePlayhead) return;
  const dur = getTimelineDuration();
  const t = Math.max(0, Math.min(dur, state.time));
  const percent = (t / dur) * 100;
  UI.timelinePlayhead.style.left = `${percent}%`;
  UI.timelineTimecode.innerText = `${t.toFixed(1)}s / ${dur.toFixed(1)}s`;
  
  if (state.isPlaying && dragMode !== 'seek') {
    const containerWidth = UI.timelineTracksContainer.clientWidth;
    const scrollWrapper = UI.timelinePlayhead.closest('.timeline-body-wrapper');
    if (scrollWrapper) {
      const playheadX = (percent / 100) * containerWidth;
      const visibleWidth = scrollWrapper.clientWidth;
      const scrollLeft = scrollWrapper.scrollLeft;
      
      if (playheadX < scrollLeft || playheadX > scrollLeft + visibleWidth) {
        scrollWrapper.scrollLeft = Math.max(0, playheadX - visibleWidth / 2);
      }
    }
  }
}

export function selectText(id) {
  state.selectedTextId = id;
  state.selectedAudio = false;
  state.selectedGraphicId = null;
  state.selectedVideoId = null;
  state.selectedGlitchTriggerId = null;
  UI.audioSettingsSection.style.display = 'none';
  UI.graphicSettingsSection.style.display = 'none';
  UI.videoSettingsSection.style.display = 'none';
  if (UI.glitchTriggerSettingsSection) UI.glitchTriggerSettingsSection.style.display = 'none';

  if (id === null) {
    UI.textSettingsSection.style.display = 'none';
  } else {
    const txt = state.texts.find(t => t.id === id);
    if (txt) {
      UI.textSettingsSection.style.display = 'flex';
      UI.textSettingsSection.classList.remove('collapsed');
      UI.textContent.value = txt.text;
      UI.textFont.value = txt.font;
      UI.textSize.value = txt.size;
      UI.textSizeVal.innerText = `${txt.size}px`;
      UI.textColor.value = txt.color;
      UI.textPosX.value = txt.x;
      UI.textPosXVal.innerText = `${Math.round(txt.x * 100)}%`;
      UI.textPosY.value = txt.y;
      UI.textPosYVal.innerText = `${Math.round(txt.y * 100)}%`;
      UI.textAngle.value = txt.angle;
      UI.textAngleVal.innerText = `${txt.angle}°`;
      UI.textIdleWobble.value = txt.idleWobble !== undefined ? txt.idleWobble : 5.0;
      UI.textIdleWobbleVal.innerText = `${(txt.idleWobble !== undefined ? txt.idleWobble : 5.0).toFixed(1)}px`;
      UI.textIdleSkew.value = Math.round((txt.idleSkew !== undefined ? txt.idleSkew : 0.10) * 100);
      UI.textIdleSkewVal.innerText = `${Math.round((txt.idleSkew !== undefined ? txt.idleSkew : 0.10) * 100)}%`;
      UI.textGlitchMode.value = txt.glitchMode;
      UI.textGlitchIntensity.value = txt.glitchIntensity;
      UI.textGlitchIntensityVal.innerText = `${txt.glitchIntensity}%`;
      UI.textGlitchMono.checked = !!txt.glitchMono;
      UI.textTransition.value = txt.transitionMode || 'fade-blur';
      UI.textTransitionDuration.value = txt.transitionDuration !== undefined ? txt.transitionDuration : 0.4;
      UI.textTransitionDurationVal.innerText = `${(txt.transitionDuration !== undefined ? txt.transitionDuration : 0.4).toFixed(1)}s`;
    }
  }
  updateTimelineTracks();
}

export function selectAudio(isSelected) {
  state.selectedAudio = isSelected;
  if (isSelected) {
    state.selectedTextId = null;
    state.selectedGraphicId = null;
    state.selectedVideoId = null;
    state.selectedGlitchTriggerId = null;
    UI.textSettingsSection.style.display = 'none';
    UI.graphicSettingsSection.style.display = 'none';
    UI.videoSettingsSection.style.display = 'none';
    if (UI.glitchTriggerSettingsSection) UI.glitchTriggerSettingsSection.style.display = 'none';
  }
  
  if (!isSelected || !state.audioTrack) {
    UI.audioSettingsSection.style.display = 'none';
  } else {
    const track = state.audioTrack;
    UI.audioSettingsSection.style.display = 'flex';
    UI.audioSettingsSection.classList.remove('collapsed');
    UI.audioFileName.innerText = track.fileName;
    UI.audioFileDuration.innerText = `Length: ${track.buffer.duration.toFixed(1)}s`;
    
    const dur = getTimelineDuration();
    UI.audioTimelineStart.min = -track.duration;
    UI.audioTimelineStart.max = dur;
    
    UI.audioTimelineStart.value = track.timelineStart;
    UI.audioTimelineStartVal.innerText = `${track.timelineStart.toFixed(1)}s`;
    
    UI.audioVolume.value = Math.round(track.volume * 100);
    UI.audioVolumeVal.innerText = `${Math.round(track.volume * 100)}%`;
  }
  updateTimelineTracks();
}

export function selectVideo(id) {
  state.selectedVideoId = id;
  state.selectedTextId = null;
  state.selectedGraphicId = null;
  state.selectedAudio = false;
  state.selectedGlitchTriggerId = null;
  UI.textSettingsSection.style.display = 'none';
  UI.graphicSettingsSection.style.display = 'none';
  UI.audioSettingsSection.style.display = 'none';
  if (UI.glitchTriggerSettingsSection) UI.glitchTriggerSettingsSection.style.display = 'none';

  if (id === null) {
    UI.videoSettingsSection.style.display = 'none';
  } else {
    const block = state.videoBlocks.find(v => v.id === id);
    if (block) {
      UI.videoSettingsSection.style.display = 'flex';
      UI.videoSettingsSection.classList.remove('collapsed');
      UI.videoFileName.innerText = block.fileName;
      if (UI.videoFileDuration) {
        UI.videoFileDuration.innerText = `Length: ${block.duration.toFixed(1)}s`;
      }
      if (UI.videoTimelineStart) {
        const dur = getTimelineDuration();
        UI.videoTimelineStart.max = dur;
        UI.videoTimelineStart.value = block.startTime;
        if (UI.videoTimelineStartVal) {
          UI.videoTimelineStartVal.innerText = `${block.startTime.toFixed(1)}s`;
        }
      }
    }
  }
  updateTimelineTracks();
}

export function selectGlitchTrigger(triggerId) {
  state.selectedTextId = null;
  state.selectedAudio = false;
  state.selectedVideoId = null;
  state.selectedGraphicId = null;
  state.selectedGlitchTriggerId = triggerId;

  // Clear selections on other blocks in UI
  document.querySelectorAll('.timeline-block').forEach(b => b.classList.remove('selected'));
  if (triggerId) {
    const activeBlock = document.querySelector(`.timeline-block[data-id="${triggerId}"]`);
    if (activeBlock) activeBlock.classList.add('selected');
  }

  // Update sidebar panel visibility
  UI.textSettingsSection.style.display = 'none';
  UI.audioSettingsSection.style.display = 'none';
  UI.videoSettingsSection.style.display = 'none';
  UI.graphicSettingsSection.style.display = 'none';

  if (!triggerId || !state.glitchTriggers) {
    if (UI.glitchTriggerSettingsSection) UI.glitchTriggerSettingsSection.style.display = 'none';
  } else {
    const trigger = state.glitchTriggers.find(t => t.id === triggerId);
    if (trigger && UI.glitchTriggerSettingsSection) {
      UI.glitchTriggerSettingsSection.style.display = 'flex';
      UI.glitchTriggerSettingsSection.classList.remove('collapsed');
      
      if (UI.glitchTriggerTime) {
        UI.glitchTriggerTime.value = trigger.time;
        UI.glitchTriggerTime.max = getTimelineDuration();
        if (UI.glitchTriggerTimeVal) UI.glitchTriggerTimeVal.innerText = `${trigger.time.toFixed(2)}s`;
      }
      if (UI.glitchTriggerDuration) {
        UI.glitchTriggerDuration.value = trigger.duration;
        if (UI.glitchTriggerDurationVal) UI.glitchTriggerDurationVal.innerText = `${trigger.duration.toFixed(2)}s`;
      }
      if (UI.glitchTriggerSeverity) {
        UI.glitchTriggerSeverity.value = trigger.severity;
        if (UI.glitchTriggerSeverityVal) UI.glitchTriggerSeverityVal.innerText = `${trigger.severity}px`;
      }
    }
  }
  updateTimelineTracks();
}

export function selectGraphic(id) {
  state.selectedGraphicId = id;
  state.selectedTextId = null;
  state.selectedAudio = false;
  state.selectedVideoId = null;
  state.selectedGlitchTriggerId = null;
  UI.textSettingsSection.style.display = 'none';
  UI.audioSettingsSection.style.display = 'none';
  UI.videoSettingsSection.style.display = 'none';
  if (UI.glitchTriggerSettingsSection) UI.glitchTriggerSettingsSection.style.display = 'none';

  if (id === null) {
    UI.graphicSettingsSection.style.display = 'none';
  } else {
    const grp = state.graphics.find(g => g.id === id);
    if (grp) {
      UI.graphicSettingsSection.style.display = 'flex';
      UI.graphicSettingsSection.classList.remove('collapsed');
      
      UI.graphicFileName.innerText = grp.fileName || 'Loaded Graphic';
      UI.graphicTimelineStart.value = grp.startTime;
      UI.graphicTimelineStartVal.innerText = `${grp.startTime.toFixed(1)}s`;
      UI.graphicTimelineEnd.value = grp.endTime;
      UI.graphicTimelineEndVal.innerText = `${grp.endTime.toFixed(1)}s`;
      
      UI.graphicPosX.value = Math.round(grp.x * 100);
      UI.graphicPosXVal.innerText = `${Math.round(grp.x * 100)}%`;
      UI.graphicPosY.value = Math.round(grp.y * 100);
      UI.graphicPosYVal.innerText = `${Math.round(grp.y * 100)}%`;
      
      UI.graphicScale.value = grp.scale !== undefined ? grp.scale : 100;
      UI.graphicScaleVal.innerText = `${grp.scale !== undefined ? grp.scale : 100}%`;
      
      UI.graphicGlitchFrequency.value = grp.glitchFrequency !== undefined ? grp.glitchFrequency : 10;
      UI.graphicGlitchFrequencyVal.innerText = `${grp.glitchFrequency !== undefined ? grp.glitchFrequency : 10}%`;
      
      UI.graphicGlitchAmplitude.value = grp.glitchAmplitude !== undefined ? grp.glitchAmplitude : 20;
      UI.graphicGlitchAmplitudeVal.innerText = `${grp.glitchAmplitude !== undefined ? grp.glitchAmplitude : 20}%`;
      
      UI.graphicFlickerIntensity.value = grp.flickerIntensity !== undefined ? grp.flickerIntensity : 0;
      UI.graphicFlickerIntensityVal.innerText = `${grp.flickerIntensity !== undefined ? grp.flickerIntensity : 0}%`;
    }
  }
  updateTimelineTracks();
}

export function initTimelineEvents() {
  UI.timelineTracksContainer.addEventListener('mousedown', (e) => {
    const rect = UI.timelineTracksContainer.getBoundingClientRect();
    const duration = getTimelineDuration();
    
    const handle = e.target.closest('.timeline-block-handle');
    const block = e.target.closest('.timeline-block');
    const ruler = e.target.closest('.timeline-ruler');
    
    if (handle) {
      e.stopPropagation();
      const txtId = handle.dataset.id;
      dragMode = handle.dataset.handle === 'left' ? 'resize-left' : 'resize-right';
      dragTextId = txtId;
      if (txtId === 'audio') {
        selectAudio(true);
      } else if (txtId === 'video') {
        selectVideo(true);
      } else if (txtId.startsWith('grp_')) {
        selectGraphic(txtId);
      } else {
        selectText(txtId);
      }
    } else if (block) {
      e.stopPropagation();
      const txtId = block.dataset.id;
      dragMode = 'move';
      dragTextId = txtId;
      if (txtId === 'audio') {
        selectAudio(true);
      } else if (txtId.startsWith('vid_')) {
        selectVideo(txtId);
      } else if (txtId.startsWith('grp_')) {
        selectGraphic(txtId);
      } else if (txtId.startsWith('gt_')) {
        selectGlitchTrigger(txtId);
      } else {
        selectText(txtId);
      }
    } else if (ruler || e.target.classList.contains('timeline-tracks') || e.target.classList.contains('timeline-track-row') || e.target === UI.timelineTracksContainer) {
      dragMode = 'seek';
      const mouseX = e.clientX - rect.left;
      const pct = mouseX / rect.width;
      state.time = Math.max(0, Math.min(duration, pct * duration));
      state.prevTime = state.time;
      updatePlayhead();
      renderFrame(state.time);
      syncAudioPlayback();
    }
    
    if (dragMode && dragTextId) {
      dragStartMouseY = e.clientY;
      lastDragTrackY = e.clientY;
      if (dragTextId === 'audio') {
        const track = state.audioTrack;
        if (track) {
          dragStartMouseX = e.clientX;
          dragStartBlockStart = track.timelineStart;
          dragStartBlockEnd = track.timelineStart + track.duration;
          dragStartSourceOffset = track.sourceOffset;
        }
      } else if (dragTextId.startsWith('vid_')) {
        const vid = state.videoBlocks.find(v => v.id === dragTextId);
        if (vid) {
          dragStartMouseX = e.clientX;
          dragStartBlockStart = vid.startTime;
          dragStartBlockEnd = vid.endTime;
        }
      } else if (dragTextId.startsWith('grp_')) {
        const grp = state.graphics.find(g => g.id === dragTextId);
        if (grp) {
          dragStartMouseX = e.clientX;
          dragStartBlockStart = grp.startTime;
          dragStartBlockEnd = grp.endTime;
        }
      } else if (dragTextId.startsWith('gt_')) {
        const trigger = state.glitchTriggers.find(t => t.id === dragTextId);
        if (trigger) {
          dragStartMouseX = e.clientX;
          dragStartBlockStart = trigger.time;
        }
      } else {
        const txt = state.texts.find(t => t.id === dragTextId);
        if (txt) {
          dragStartMouseX = e.clientX;
          dragStartBlockStart = txt.startTime;
          dragStartBlockEnd = txt.endTime;
        }
      }
    }
  });


  window.addEventListener('mousemove', (e) => {
    if (isZoomDragging) {
      const dx = e.clientX - zoomDragStartX;
      state.timelineZoom = Math.max(0.15, Math.min(15.0, zoomDragStartZoom + dx * 0.015));
      updateTimelineRuler();
      updateTimelineTracks();
      updatePlayhead();
      return;
    }
    if (!dragMode) return;
    
    const rect = UI.timelineTracksContainer.getBoundingClientRect();
    const duration = getTimelineDuration();
    
    if (dragMode === 'seek') {
      const mouseX = e.clientX - rect.left;
      const pct = mouseX / rect.width;
      state.time = Math.max(0, Math.min(duration, pct * duration));
      state.prevTime = state.time;
      updatePlayhead();
      renderFrame(state.time);
      syncAudioPlayback();
    } else {
      const dxSec = ((e.clientX - dragStartMouseX) / rect.width) * duration;
      
      if (dragTextId === 'audio') {
        const track = state.audioTrack;
        if (track) {
          if (dragMode === 'move') {
            const newStart = dragStartBlockStart + dxSec;
            const minStart = -track.duration + 0.2;
            const maxStart = duration - 0.2;
            track.timelineStart = Math.max(minStart, Math.min(maxStart, newStart));
          }
          
          if (state.selectedAudio) {
            UI.audioTimelineStart.min = -track.duration;
            UI.audioTimelineStart.max = duration;
            UI.audioTimelineStart.value = track.timelineStart;
            UI.audioTimelineStartVal.innerText = `${track.timelineStart.toFixed(1)}s`;
          }
          
          if (state.isPlaying) {
            syncAudioPlayback();
          }
          updateTimelineTracks();
        }
      } else if (dragTextId.startsWith('vid_')) {
        const vid = state.videoBlocks.find(v => v.id === dragTextId);
        if (vid) {
          if (dragMode === 'move') {
            let newStart = dragStartBlockStart + dxSec;
            const blockLen = dragStartBlockEnd - dragStartBlockStart;
            let newEnd = newStart + blockLen;
            
            if (newStart < 0) {
              newStart = 0;
              newEnd = blockLen;
            }
            if (newEnd > duration) {
              newEnd = duration;
              newStart = duration - blockLen;
            }
            
            vid.startTime = newStart;
            vid.endTime = newEnd;
          }
          
          if (state.selectedVideoId === vid.id) {
            UI.videoTimelineStart.value = vid.startTime;
            UI.videoTimelineStartVal.innerText = `${vid.startTime.toFixed(1)}s`;
          }
          
          updateTimelineTracks();
          renderFrame(state.time);
        }
      } else if (dragTextId.startsWith('grp_')) {
        const grp = state.graphics.find(g => g.id === dragTextId);
        if (grp) {
          if (dragMode === 'move') {
            let newStart = dragStartBlockStart + dxSec;
            let newEnd = dragStartBlockEnd + dxSec;
            const blockLen = dragStartBlockEnd - dragStartBlockStart;
            
            if (newStart < 0) {
              newStart = 0;
              newEnd = blockLen;
            }
            if (newEnd > duration) {
              newEnd = duration;
              newStart = duration - blockLen;
            }
            
            grp.startTime = newStart;
            grp.endTime = newEnd;

            // Vertical drag layer re-ordering
            const dy = e.clientY - lastDragTrackY;
            if (Math.abs(dy) > 24) {
              const idx = state.graphics.findIndex(g => g.id === dragTextId);
              if (dy > 0 && idx < state.graphics.length - 1) {
                const temp = state.graphics[idx];
                state.graphics[idx] = state.graphics[idx + 1];
                state.graphics[idx + 1] = temp;
                lastDragTrackY = e.clientY;
              } else if (dy < 0 && idx > 0) {
                const temp = state.graphics[idx];
                state.graphics[idx] = state.graphics[idx - 1];
                state.graphics[idx - 1] = temp;
                lastDragTrackY = e.clientY;
              }
            }
          } else if (dragMode === 'resize-left') {
            let newStart = dragStartBlockStart + dxSec;
            newStart = Math.max(0, Math.min(grp.endTime - 0.2, newStart));
            grp.startTime = newStart;
          } else if (dragMode === 'resize-right') {
            let newEnd = dragStartBlockEnd + dxSec;
            newEnd = Math.min(duration, Math.max(grp.startTime + 0.2, newEnd));
            grp.endTime = newEnd;
          }
          
          if (state.selectedGraphicId === grp.id) {
            UI.graphicTimelineStart.value = grp.startTime;
            UI.graphicTimelineStartVal.innerText = `${grp.startTime.toFixed(1)}s`;
            UI.graphicTimelineEnd.value = grp.endTime;
            UI.graphicTimelineEndVal.innerText = `${grp.endTime.toFixed(1)}s`;
          }
          
          updateTimelineTracks();
          renderFrame(state.time);
        }
      } else if (dragTextId.startsWith('gt_')) {
        const trigger = state.glitchTriggers.find(t => t.id === dragTextId);
        if (trigger) {
          if (dragMode === 'move') {
            const newTime = dragStartBlockStart + dxSec;
            trigger.time = Math.max(0, Math.min(duration, newTime));
          }
          if (state.selectedGlitchTriggerId === trigger.id) {
            UI.glitchTriggerTime.value = trigger.time;
            UI.glitchTriggerTimeVal.innerText = `${trigger.time.toFixed(2)}s`;
          }
          updateTimelineTracks();
          renderFrame(state.time);
        }
      } else {
        const txt = state.texts.find(t => t.id === dragTextId);
        if (txt) {
          if (dragMode === 'move') {
            let newStart = dragStartBlockStart + dxSec;
            let newEnd = dragStartBlockEnd + dxSec;
            const blockLen = dragStartBlockEnd - dragStartBlockStart;
            
            if (newStart < 0) {
              newStart = 0;
              newEnd = blockLen;
            }
            if (newEnd > duration) {
              newEnd = duration;
              newStart = duration - blockLen;
            }
            
            txt.startTime = newStart;
            txt.endTime = newEnd;

            // Vertical drag track re-ordering
            const dy = e.clientY - lastDragTrackY;
            if (Math.abs(dy) > 24) {
              const currentTrackIdx = txt.trackIndex !== undefined ? txt.trackIndex : 0;
              if (dy > 0) {
                txt.trackIndex = currentTrackIdx + 1;
                lastDragTrackY = e.clientY;
              } else if (dy < 0 && currentTrackIdx > 0) {
                txt.trackIndex = currentTrackIdx - 1;
                lastDragTrackY = e.clientY;
              }
            }
          } else if (dragMode === 'resize-left') {
            let newStart = dragStartBlockStart + dxSec;
            newStart = Math.max(0, Math.min(txt.endTime - 0.2, newStart));
            txt.startTime = newStart;
          } else if (dragMode === 'resize-right') {
            let newEnd = dragStartBlockEnd + dxSec;
            newEnd = Math.min(duration, Math.max(txt.startTime + 0.2, newEnd));
            txt.endTime = newEnd;
          }
          
          updateTimelineTracks();
          renderFrame(state.time);
        }
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isZoomDragging) {
      isZoomDragging = false;
      document.body.style.cursor = '';
    }
    if (dragMode === 'move') {
      normalizeTextTracks();
      updateTimelineTracks();
      renderFrame(state.time);
    }
    dragMode = null;
    dragTextId = null;
  });

  if (UI.btnTimelineZoom) {
    UI.btnTimelineZoom.addEventListener('mousedown', (e) => {
      isZoomDragging = true;
      zoomDragStartX = e.clientX;
      zoomDragStartZoom = state.timelineZoom;
      e.preventDefault();
      document.body.style.cursor = 'ew-resize';
    });
    
    UI.btnTimelineZoom.addEventListener('dblclick', () => {
      if (UI.btnTimelineFit) UI.btnTimelineFit.click();
    });
  }

  if (UI.btnTimelineFit) {
    UI.btnTimelineFit.addEventListener('click', () => {
      const wrapper = UI.timelinePlayhead?.closest('.timeline-body-wrapper');
      if (wrapper) {
        const dur = getTimelineDuration();
        const wrapperWidth = wrapper.clientWidth - 8;
        const targetPps = Math.max(10, wrapperWidth / dur);
        state.timelineZoom = targetPps / 30;
        updateTimelineRuler();
        updateTimelineTracks();
        updatePlayhead();
      }
    });
  }
}
