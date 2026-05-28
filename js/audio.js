import { state } from './state.js';
import { getTimelineDuration } from './utils.js';

export let audioCtx = null;
export let activeAudioSource = null;
export let activeAudioGain = null;
export let exportAudioNode = null;

export function setExportAudioNode(node) {
  exportAudioNode = node;
}

export function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

export function stopAudioSource() {
  if (activeAudioSource) {
    try {
      activeAudioSource.stop();
    } catch (err) {}
    activeAudioSource = null;
  }
  activeAudioGain = null;
}

export function syncAudioPlayback() {
  stopAudioSource();

  if (!state.isPlaying || !state.audioTrack || !state.imageLoaded || state.isExporting) {
    return;
  }

  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const dur = getTimelineDuration();
  const loopTime = ((state.time % dur) + dur) % dur;

  const track = state.audioTrack;
  const start = track.timelineStart;
  const end = start + track.duration;

  if (loopTime >= start && loopTime < end) {
    const relativeTime = loopTime - start;
    const filePlayStart = track.sourceOffset + relativeTime;

    if (filePlayStart >= 0 && filePlayStart < track.buffer.duration) {
      const blockTimeLeft = track.duration - relativeTime;
      const loopTimeLeft = dur - loopTime;
      const playDuration = Math.min(blockTimeLeft, loopTimeLeft);

      try {
        const source = ctx.createBufferSource();
        source.buffer = track.buffer;

        const gainNode = ctx.createGain();
        gainNode.gain.value = track.volume !== undefined ? track.volume : 0.8;

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(ctx.currentTime, filePlayStart, playDuration);
        activeAudioSource = source;
        activeAudioGain = gainNode;
      } catch (err) {
        console.error("Failed to start AudioBufferSourceNode:", err);
      }
    }
  }
}

export function syncExportAudio(renderTime, lastLoopIndex) {
  if (!state.audioTrack || !exportAudioNode) return lastLoopIndex;
  
  const track = state.audioTrack;
  const dur = getTimelineDuration();
  const loopTime = ((renderTime % dur) + dur) % dur;
  const currentLoopIndex = Math.floor(renderTime / dur);
  const wrapped = currentLoopIndex !== lastLoopIndex;

  const start = track.timelineStart;
  const end = start + track.duration;
  const shouldBePlaying = (loopTime >= start && loopTime < end);
  
  if (wrapped) {
    stopAudioSource();
  }
  
  if (shouldBePlaying && !activeAudioSource) {
    const ctx = getAudioContext();
    try {
      const relativeTime = loopTime - start;
      const filePlayStart = track.sourceOffset + relativeTime;
      if (filePlayStart >= 0 && filePlayStart < track.buffer.duration) {
        const playDuration = Math.min(track.duration - relativeTime, dur - loopTime);
        const source = ctx.createBufferSource();
        source.buffer = track.buffer;
        
        const gainNode = ctx.createGain();
        gainNode.gain.value = track.volume !== undefined ? track.volume : 0.8;
        
        source.connect(gainNode);
        gainNode.connect(exportAudioNode);
        
        source.start(ctx.currentTime, filePlayStart, playDuration);
        activeAudioSource = source;
        activeAudioGain = gainNode;
      }
    } catch (err) {
      console.error("Audio step trigger failed during export:", err);
    }
  } else if (!shouldBePlaying && activeAudioSource) {
    stopAudioSource();
  }

  return currentLoopIndex;
}
