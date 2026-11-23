import { state } from './state.js';
import { UI } from './ui.js';
import { getTimelineDuration } from './utils.js';
import { stopAudioSource, getAudioContext, exportAudioNode, setExportAudioNode, syncExportAudio, syncAudioPlayback } from './audio.js';
import { GlitchManager } from './glitch.js';
import { renderFrame, resizeMainCanvas } from './renderer.js';
import { Muxer, ArrayBufferTarget, FileSystemWritableFileStreamTarget } from './mp4-muxer.js';
import * as WebmMuxer from './webm-muxer.js';
import { GIFEncoder, quantize, applyPalette } from './gifenc.js';

export class VideoExporter {
  /**
   * Renders and encodes the soundtrack in 30-second OfflineAudioContext windows
   * so 10-minute (600s) exports only use ~11MB of audio buffer memory instead of ~230MB.
   */
  static async encodeAudioTrackChunked(muxer, sampleRate, codec, duration, frameSize, label = 'Audio') {
    const audioEncoder = new AudioEncoder({
      output: (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
      error: (e) => {
        console.error(`AudioEncoder (${label}) error during export:`, e);
        throw new Error(`${label} audio encoder error: ` + e.message);
      }
    });

    audioEncoder.configure({
      codec: codec,
      numberOfChannels: 2,
      sampleRate: sampleRate,
      bitrate: 192000
    });

    const dur = getTimelineDuration();
    const track = state.audioTrack;
    const totalSamples = Math.ceil(duration * sampleRate);
    const windowDurationSec = 30; // 30s chunks keep memory footprint tiny
    let globalSampleOffset = 0;

    for (let windowStart = 0; windowStart < duration; windowStart += windowDurationSec) {
      if (state.exportCancel) break;

      const windowEnd = Math.min(duration, windowStart + windowDurationSec);
      const windowDur = windowEnd - windowStart;
      const windowFrames = Math.max(1, Math.ceil(windowDur * sampleRate));

      const offlineCtx = new OfflineAudioContext(2, windowFrames, sampleRate);

      for (let loopStartTime = 0; loopStartTime < duration; loopStartTime += dur) {
        const loopPlayStart = loopStartTime + Math.max(track.timelineStart, 0.0);
        const loopPlayEnd = loopStartTime + Math.min(track.timelineStart + track.duration, dur);

        const actualStart = loopPlayStart;
        const actualEnd = Math.min(loopPlayEnd, duration);

        // Check overlap with [windowStart, windowEnd]
        const segStart = Math.max(actualStart, windowStart);
        const segEnd = Math.min(actualEnd, windowEnd);

        if (segStart < segEnd) {
          const relativeOffset = Math.max(track.timelineStart, 0.0) - track.timelineStart;
          const intoClip = segStart - actualStart;
          const filePlayStart = track.sourceOffset + relativeOffset + intoClip;
          const playDuration = segEnd - segStart;
          const ctxStart = segStart - windowStart;

          if (filePlayStart >= 0 && filePlayStart < track.buffer.duration) {
            const source = offlineCtx.createBufferSource();
            source.buffer = track.buffer;

            const gainNode = offlineCtx.createGain();
            const targetVol = track.volume !== undefined ? track.volume : 0.8;
            const fadeInDur = track.fadeInDuration || 0;
            const fadeOutDur = track.fadeOutDuration || 0;

            const fadeInEnd = loopPlayStart + fadeInDur;
            const fadeOutStart = Math.max(fadeInEnd, loopPlayEnd - fadeOutDur);
            const actualFadeOutDur = loopPlayEnd - fadeOutStart;

            // Helper to compute envelope gain at any global timestamp t
            const getGainAt = (t) => {
              let g = targetVol;
              if (fadeInDur > 0 && t < fadeInEnd) {
                g = targetVol * Math.max(0, Math.min(1, (t - loopPlayStart) / fadeInDur));
              }
              if (actualFadeOutDur > 0 && t > fadeOutStart) {
                g = Math.min(g, targetVol * Math.max(0, Math.min(1, (loopPlayEnd - t) / actualFadeOutDur)));
              }
              return g;
            };

            gainNode.gain.setValueAtTime(getGainAt(segStart), ctxStart);

            if (fadeInDur > 0 && segStart < fadeInEnd && fadeInEnd <= segEnd) {
              gainNode.gain.linearRampToValueAtTime(getGainAt(fadeInEnd), fadeInEnd - windowStart);
            }
            if (actualFadeOutDur > 0 && segStart < fadeOutStart && fadeOutStart < segEnd) {
              gainNode.gain.setValueAtTime(getGainAt(fadeOutStart), fadeOutStart - windowStart);
            }
            gainNode.gain.linearRampToValueAtTime(getGainAt(segEnd), ctxStart + playDuration);

            source.connect(gainNode);
            gainNode.connect(offlineCtx.destination);
            source.start(ctxStart, filePlayStart, playDuration);
          }
        }
      }

      const renderedBuffer = await offlineCtx.startRendering();
      const leftChannel = renderedBuffer.getChannelData(0);
      const rightChannel = renderedBuffer.getChannelData(1);
      const chunkSamples = renderedBuffer.length;
      let sampleIndex = 0;

      while (sampleIndex < chunkSamples) {
        if (state.exportCancel) break;
        const framesToEncode = Math.min(frameSize, chunkSamples - sampleIndex);
        const audioBuffer = new Float32Array(2 * framesToEncode);
        audioBuffer.set(leftChannel.subarray(sampleIndex, sampleIndex + framesToEncode), 0);
        audioBuffer.set(rightChannel.subarray(sampleIndex, sampleIndex + framesToEncode), framesToEncode);

        const timestamp = Math.round(((globalSampleOffset + sampleIndex) / sampleRate) * 1000000);
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: sampleRate,
          numberOfFrames: framesToEncode,
          numberOfChannels: 2,
          timestamp: timestamp,
          data: audioBuffer
        });

        audioEncoder.encode(audioData);
        audioData.close();
        sampleIndex += framesToEncode;

        if (sampleIndex % (frameSize * 50) === 0) {
          const audioPct = Math.min(100, Math.round(((globalSampleOffset + sampleIndex) / totalSamples) * 100));
          UI.exportProgressBar.style.width = `${audioPct}%`;
          UI.exportFrameCount.innerText = `Processing ${label}: ${audioPct}%`;
          UI.exportPercent.innerText = `${audioPct}%`;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      globalSampleOffset += chunkSamples;
    }

    if (!state.exportCancel) {
      await audioEncoder.flush();
    }
    return audioEncoder;
  }

  static async export() {
    if (state.uploadedImages.length === 0 || state.layers.length === 0 || state.isExporting) return;

    const defaultDur = state.isDangerZone ? 30 : 10;
    let duration = defaultDur;
    if (state.exportMode === 'duration') {
      duration = state.exportDuration;
    } else {
      const absSpeed = Math.abs(state.zoomSpeed);
      if (absSpeed > 0.0001) {
        duration = state.exportLoops / absSpeed;
      } else {
        duration = defaultDur;
      }
    }

    if (state.exportFormat === 'gif' && duration > 30) {
      alert("⚠️ DANGER ZONE GUARD: GIF export is restricted to <= 30s to prevent browser Out-Of-Memory crashes (600s GIF would require ~65GB RAM!). Please choose MP4 Video for extended renders.");
      return;
    }

    state.isExporting = true;
    state.exportCancel = false;
    UI.exportOverlay.classList.remove('hidden');

    const titleEl = UI.exportOverlay.querySelector('h3');
    if (titleEl) {
      if (state.exportFormat === 'gif') {
        titleEl.innerText = 'Rendering Animated GIF';
        if (UI.exportBitrateMetric) UI.exportBitrateMetric.innerText = 'N/A';
      } else if (state.exportFormat === 'webm') {
        titleEl.innerText = 'Rendering WebM Video Sequence (VP9/Opus)';
        if (UI.exportBitrateMetric) UI.exportBitrateMetric.innerText = `${state.exportBitrateMbps || 24} Mbps`;
      } else {
        titleEl.innerText = 'Rendering High-Speed Video (MP4/H.264)';
        if (UI.exportBitrateMetric) UI.exportBitrateMetric.innerText = `${state.exportBitrateMbps || 24} Mbps`;
      }
    }

    const originalW = UI.mainCanvas.width;
    const originalH = UI.mainCanvas.height;

    const fps = state.exportFps;

    let resW = 1920, resH = 1080;
    const mode = UI.exportResolution.value;
    const activeImg = state.uploadedImages[state.activeImageIndex >= 0 ? state.activeImageIndex : 0].img;

    // Determine the export aspect ratio
    let ratio = activeImg.naturalWidth / activeImg.naturalHeight;
    if (mode === 'viewport') {
      const arMode = state.aspectRatio;
      if (arMode === '16-9') ratio = 16 / 9;
      else if (arMode === '9-16') ratio = 9 / 16;
      else if (arMode === '1-1') ratio = 1 / 1;
      else if (arMode === '4-5') ratio = 4 / 5;
      else if (arMode === '21-9') ratio = 21 / 9;
    }

    if (mode === '720') {
      resW = 1280; resH = 720;
    } else if (mode === '1080') {
      resW = 1920; resH = 1080;
    } else if (mode === '1080s') {
      resW = 1080; resH = 1080;
    } else if (mode === '540') {
      resW = 960; resH = 540;
    } else if (mode === '480') {
      resW = 854; resH = 480;
    } else if (mode === '480s') {
      resW = 480; resH = 480;
    } else {
      let maxDim = 1080;
      if (state.exportFormat === 'gif') {
        maxDim = 720; // Safe upper bound for GIF memory
      }
      if (ratio >= 1.0) {
        resH = maxDim;
        resW = Math.round(resH * ratio);
      } else {
        resW = maxDim;
        resH = Math.round(resW / ratio);
      }
    }

    // Crucial for H.264 / VP9 encoders: width/height must be even numbers
    resW = Math.round(resW / 2) * 2;
    resH = Math.round(resH / 2) * 2;

    UI.mainCanvas.width = resW;
    UI.mainCanvas.height = resH;

    // Check export format: GIF, MP4 (WebCodecs), or WebM
    if (state.exportFormat === 'gif') {
      try {
        await VideoExporter.exportGIF(duration, fps, resW, resH, originalW, originalH);
      } catch (err) {
        console.error("GIF export failed:", err);
        alert("GIF export failed: " + err.message);
        VideoExporter.endExport(originalW, originalH);
      }
      return;
    }

    const hasWebCodecs = typeof window.VideoEncoder !== 'undefined';
    const isMP4 = state.exportFormat === 'mp4';
    const isWebM = state.exportFormat === 'webm';

    if (isMP4 && hasWebCodecs) {
      try {
        await VideoExporter.exportMP4(duration, fps, resW, resH, originalW, originalH);
      } catch (err) {
        console.error("MP4 WebCodecs export failed, falling back to WebM:", err);
        alert("MP4 export failed: " + err.message + ". Falling back to WebM.");
        UI.mainCanvas.width = resW;
        UI.mainCanvas.height = resH;
        await VideoExporter.exportWebM(duration, fps, resW, resH, originalW, originalH);
      }
    } else if (isWebM && hasWebCodecs) {
      try {
        await VideoExporter.exportWebM(duration, fps, resW, resH, originalW, originalH);
      } catch (err) {
        console.error("High-speed WebM WebCodecs export failed, falling back to real-time recorder:", err);
        alert("WebM high-speed export failed: " + err.message + ". Falling back to real-time recorder.");
        UI.mainCanvas.width = resW;
        UI.mainCanvas.height = resH;
        VideoExporter.exportWebMRealtime(duration, fps, resW, resH, originalW, originalH);
      }
    } else {
      VideoExporter.exportWebMRealtime(duration, fps, resW, resH, originalW, originalH);
    }
  }

  static async exportMP4(duration, fps, resW, resH, originalW, originalH) {
    const totalFrames = Math.ceil(duration * fps);
    const hasAudio = !!state.audioTrack;

    let wakeLock = null;
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (wlErr) {
        console.warn("Screen WakeLock could not be acquired:", wlErr);
      }
    }

    let writableStream = null;
    let target = null;
    let isDirectDisk = false;

    if (typeof window.showSaveFilePicker === 'function' && duration >= 45) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: `vilecut_${Math.round(duration)}s_${Date.now()}.mp4`,
          types: [{
            description: 'MP4 Video Sequence',
            accept: { 'video/mp4': ['.mp4'] }
          }]
        });
        writableStream = await fileHandle.createWritable();
        target = new FileSystemWritableFileStreamTarget(writableStream);
        isDirectDisk = true;
      } catch (pickerErr) {
        if (pickerErr.name === 'AbortError') {
          if (wakeLock) {
            try { await wakeLock.release(); } catch (e) {}
          }
          VideoExporter.endExport(originalW, originalH);
          return;
        }
        console.warn("Direct-to-Disk FilePicker unavailable or failed, falling back to in-memory ArrayBufferTarget:", pickerErr);
      }
    }

    if (!target) {
      target = new ArrayBufferTarget();
      isDirectDisk = false;
    }

    if (UI.exportStreamMode) {
      UI.exportStreamMode.innerText = isDirectDisk ? 'Direct Disk' : 'RAM Buffer';
      UI.exportStreamMode.className = `metric-val ${isDirectDisk ? 'text-green' : 'text-yellow'}`;
    }

    const bitrateMbps = state.exportBitrateMbps || 24;
    const targetBitrateBps = bitrateMbps * 1000000;
    if (UI.exportBitrateMetric) {
      UI.exportBitrateMetric.innerText = `${bitrateMbps} Mbps`;
    }

    const muxer = new Muxer({
      target: target,
      video: {
        codec: 'avc',
        width: resW,
        height: resH
      },
      audio: hasAudio ? {
        codec: 'aac',
        numberOfChannels: 2,
        sampleRate: 44100
      } : undefined,
      fastStart: isDirectDisk ? false : 'in-memory'
    });

    let videoEncoder = null;
    let audioEncoder = null;

    let selectedCodec = 'avc1.64002a'; // High Profile Level 4.2
    if (typeof VideoEncoder.isConfigSupported === 'function') {
      try {
        const supportHigh = await VideoEncoder.isConfigSupported({
          codec: 'avc1.64002a',
          width: resW,
          height: resH,
          bitrate: targetBitrateBps,
          framerate: fps
        });
        if (!supportHigh || !supportHigh.supported) {
          selectedCodec = 'avc1.4d002a';
        }
      } catch (e) {
        selectedCodec = 'avc1.4d002a';
      }
    }

    try {
      videoEncoder = new VideoEncoder({
        output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
        error: (e) => {
          console.error("VideoEncoder error during export:", e);
          throw new Error("Video encoder error: " + e.message);
        }
      });
      videoEncoder.configure({
        codec: selectedCodec,
        width: resW,
        height: resH,
        bitrate: targetBitrateBps,
        bitrateMode: 'variable',
        framerate: fps,
        latencyMode: 'quality'
      });
    } catch (e) {
      console.warn(`VideoEncoder failed with ${selectedCodec}, trying avc1.4d002a fallback:`, e);
      try {
        videoEncoder.configure({
          codec: 'avc1.4d002a',
          width: resW,
          height: resH,
          bitrate: targetBitrateBps,
          bitrateMode: 'variable',
          framerate: fps,
          latencyMode: 'quality'
        });
      } catch (fallbackErr) {
        console.error("VideoEncoder configuration failed:", fallbackErr);
        throw new Error("Could not configure VideoEncoder. H.264 profile may not be supported by this browser.");
      }
    }

    const tempPlaying = state.isPlaying;
    state.isPlaying = false;
    stopAudioSource();
    if (state.videoBlocks && state.videoBlocks.length > 0) {
      state.videoBlocks.forEach(b => {
        if (b.element) b.element.pause();
      });
    }

    state.layers.forEach(layer => {
      layer.lastWrapCount = null;
    });

    if (hasAudio) {
      UI.exportFrameCount.innerText = `Preparing audio...`;
      UI.exportProgressBar.style.width = `0%`;
      UI.exportPercent.innerText = `0%`;

      try {
        audioEncoder = await VideoExporter.encodeAudioTrackChunked(
          muxer,
          44100,
          'mp4a.40.2',
          duration,
          1024,
          'Audio'
        );
      } catch (audioErr) {
        console.error("Audio encoding failed:", audioErr);
        throw new Error("Audio encoding failed: " + audioErr.message);
      }
    }

    if (state.exportCancel) {
      if (videoEncoder) videoEncoder.close();
      if (audioEncoder) audioEncoder.close();
      state.isPlaying = tempPlaying;
      if (state.isPlaying) syncAudioPlayback();
      VideoExporter.endExport(originalW, originalH);
      return;
    }

    const renderStartTime = performance.now();
    let lastMetricUpdate = 0;

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (state.exportCancel) break;

        state.prevTime = state.time;
        state.time = i / fps;

        const dur = getTimelineDuration();
        const loopTime = ((state.time % dur) + dur) % dur;
        const activeBlocks = state.videoBlocks ? state.videoBlocks.filter(b => loopTime >= b.startTime && loopTime < b.endTime) : [];
        if (activeBlocks.length > 0) {
          await Promise.all(activeBlocks.map(block => {
            if (!block.element) return Promise.resolve();
            const video = block.element;
            const maxT = Math.max(0, (block.duration || video.duration || 0) - 0.01);
            const relativeTime = Math.max(0, Math.min(maxT, (block.sourceOffset || 0) + (loopTime - block.startTime)));
            if (Math.abs(video.currentTime - relativeTime) < 0.004 && video.readyState >= 2) {
              return Promise.resolve();
            }
            return new Promise(resolve => {
              let resolved = false;
              let timeoutId = null;
              const onSeeked = () => {
                if (resolved) return;
                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                video.removeEventListener('seeked', onSeeked);
                resolve();
              };
              video.addEventListener('seeked', onSeeked);
              video.currentTime = relativeTime;
              timeoutId = setTimeout(onSeeked, 400);
            });
          }));
        }

        if (state.glitchEnabled) {
          GlitchManager.update(1 / fps);
        }

        renderFrame(state.time);

        const timestamp = Math.round((i / fps) * 1000000);
        const frameDurationUs = Math.round(1000000 / fps);
        const frame = new VideoFrame(UI.mainCanvas, { timestamp, duration: frameDurationUs });

        videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
        frame.close();

        const now = performance.now();
        if (now - lastMetricUpdate > 250 || i === totalFrames - 1) {
          lastMetricUpdate = now;
          const elapsedSec = (now - renderStartTime) / 1000;
          const currentSpeedFps = (i + 1) / Math.max(0.1, elapsedSec);
          const remainingFrames = totalFrames - (i + 1);
          const remainingSec = Math.max(0, remainingFrames / Math.max(1, currentSpeedFps));

          const remMin = Math.floor(remainingSec / 60);
          const remSec = Math.floor(remainingSec % 60);
          const etaText = remMin > 0 ? `${remMin}m ${remSec < 10 ? '0' : ''}${remSec}s` : `${remSec}s`;

          if (UI.exportSpeed) UI.exportSpeed.innerText = `${Math.round(currentSpeedFps)} fps`;
          if (UI.exportEta) UI.exportEta.innerText = i === totalFrames - 1 ? 'Finishing...' : etaText;

          const pct = Math.round(((i + 1) / totalFrames) * 100);
          UI.exportProgressBar.style.width = `${pct}%`;
          UI.exportFrameCount.innerText = `Rendering: Frame ${(i + 1).toLocaleString()} / ${totalFrames.toLocaleString()}`;
          UI.exportPercent.innerText = `${pct}%`;
        }

        await new Promise(resolve => setTimeout(resolve, 0));

        while (videoEncoder.encodeQueueSize > 4) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      if (state.exportCancel) {
        if (writableStream) {
          try { await writableStream.abort(); } catch (e) {}
        }
        if (videoEncoder) videoEncoder.close();
        if (audioEncoder) audioEncoder.close();
        state.isPlaying = tempPlaying;
        if (state.isPlaying) syncAudioPlayback();
        VideoExporter.endExport(originalW, originalH);
        return;
      }

      await videoEncoder.flush();

      muxer.finalize();

      if (isDirectDisk && writableStream) {
        await writableStream.close();
        UI.exportProgressBar.style.width = `100%`;
        UI.exportPercent.innerText = `100%`;
        UI.exportFrameCount.innerText = `Export Complete! Saved directly to chosen file.`;
        if (UI.exportEta) UI.exportEta.innerText = `Done`;
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        const { buffer } = muxer.target;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `vilecut_${Math.round(duration)}s_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
      }
    } catch (videoErr) {
      console.error("Video encoding failed:", videoErr);
      if (writableStream) {
        try { await writableStream.abort(); } catch (e) {}
      }
      throw videoErr;
    } finally {
      if (wakeLock) {
        try { await wakeLock.release(); } catch (e) {}
        wakeLock = null;
      }
      if (videoEncoder) videoEncoder.close();
      if (audioEncoder) audioEncoder.close();

      state.isPlaying = tempPlaying;
      if (state.isPlaying) {
        syncAudioPlayback();
      }
      VideoExporter.endExport(originalW, originalH);
    }
  }

  static async exportGIF(duration, fps, resW, resH, originalW, originalH) {
    const totalFrames = Math.ceil(duration * fps);
    const delayMs = Math.max(20, Math.round(1000 / fps));

    const tempPlaying = state.isPlaying;
    state.isPlaying = false;
    stopAudioSource();
    if (state.videoBlocks && state.videoBlocks.length > 0) {
      state.videoBlocks.forEach(b => {
        if (b.element) b.element.pause();
      });
    }

    state.layers.forEach(layer => {
      layer.lastWrapCount = null;
    });

    const gif = GIFEncoder();

    UI.exportProgressBar.style.width = `0%`;
    UI.exportFrameCount.innerText = `Preparing GIF: Frame 0 / ${totalFrames}`;
    UI.exportPercent.innerText = `0%`;

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (state.exportCancel) break;

        state.prevTime = state.time;
        state.time = i / fps;

        const dur = getTimelineDuration();
        const loopTime = ((state.time % dur) + dur) % dur;
        const activeBlocks = state.videoBlocks ? state.videoBlocks.filter(b => loopTime >= b.startTime && loopTime < b.endTime) : [];
        if (activeBlocks.length > 0) {
          await Promise.all(activeBlocks.map(block => {
            if (!block.element) return Promise.resolve();
            const video = block.element;
            const relativeTime = Math.min(block.duration || Infinity, (block.sourceOffset || 0) + (loopTime - block.startTime));
            return new Promise(resolve => {
              let resolved = false;
              let timeoutId = null;
              const onSeeked = () => {
                if (resolved) return;
                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                video.removeEventListener('seeked', onSeeked);
                resolve();
              };
              video.addEventListener('seeked', onSeeked);
              video.currentTime = relativeTime;
              timeoutId = setTimeout(onSeeked, 3000);
            });
          }));
        }

        if (state.glitchEnabled) {
          GlitchManager.update(1 / fps);
        }

        renderFrame(state.time);

        const frameCtx = UI.mainCanvas.getContext('2d');
        const imgData = frameCtx.getImageData(0, 0, resW, resH);
        const rgba = imgData.data;

        const palette = quantize(rgba, 256, { format: 'rgb565' });
        const index = applyPalette(rgba, palette, 'rgb565');

        gif.writeFrame(index, resW, resH, {
          palette,
          delay: delayMs,
          repeat: i === 0 ? 0 : undefined
        });

        const pct = Math.round(((i + 1) / totalFrames) * 100);
        UI.exportProgressBar.style.width = `${pct}%`;
        UI.exportFrameCount.innerText = `Rendering GIF: Frame ${i + 1} / ${totalFrames}`;
        UI.exportPercent.innerText = `${pct}%`;

        await new Promise(resolve => setTimeout(resolve, 0));
      }

      if (state.exportCancel) {
        state.isPlaying = tempPlaying;
        if (state.isPlaying) syncAudioPlayback();
        VideoExporter.endExport(originalW, originalH);
        return;
      }

      UI.exportFrameCount.innerText = `Finalizing GIF file...`;
      UI.exportProgressBar.style.width = `100%`;
      UI.exportPercent.innerText = `100%`;
      await new Promise(resolve => setTimeout(resolve, 30));

      gif.finish();
      const bytes = gif.bytes();
      const blob = new Blob([bytes], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `vilecut_${Date.now()}.gif`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 500);

    } catch (gifErr) {
      console.error("GIF encoding failed:", gifErr);
      throw gifErr;
    } finally {
      state.isPlaying = tempPlaying;
      if (state.isPlaying) {
        syncAudioPlayback();
      }
      VideoExporter.endExport(originalW, originalH);
    }
  }

  static async exportWebM(duration, fps, resW, resH, originalW, originalH) {
    const totalFrames = Math.ceil(duration * fps);
    const hasAudio = !!state.audioTrack;

    let wakeLock = null;
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (wlErr) {
        console.warn("Screen WakeLock could not be acquired:", wlErr);
      }
    }

    let writableStream = null;
    let target = null;
    let isDirectDisk = false;

    if (typeof window.showSaveFilePicker === 'function' && duration >= 45) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: `vilecut_${Math.round(duration)}s_${Date.now()}.webm`,
          types: [{
            description: 'WebM Video Sequence',
            accept: { 'video/webm': ['.webm'] }
          }]
        });
        writableStream = await fileHandle.createWritable();
        target = new WebmMuxer.FileSystemWritableFileStreamTarget(writableStream);
        isDirectDisk = true;
      } catch (pickerErr) {
        if (pickerErr.name === 'AbortError') {
          if (wakeLock) {
            try { await wakeLock.release(); } catch (e) {}
          }
          VideoExporter.endExport(originalW, originalH);
          return;
        }
        console.warn("Direct-to-Disk FilePicker unavailable or failed, falling back to in-memory ArrayBufferTarget:", pickerErr);
      }
    }

    if (!target) {
      target = new WebmMuxer.ArrayBufferTarget();
      isDirectDisk = false;
    }

    if (UI.exportStreamMode) {
      UI.exportStreamMode.innerText = isDirectDisk ? 'Direct Disk' : 'RAM Buffer';
      UI.exportStreamMode.className = `metric-val ${isDirectDisk ? 'text-green' : 'text-yellow'}`;
    }

    const bitrateMbps = state.exportBitrateMbps || 24;
    const targetBitrateBps = bitrateMbps * 1000000;
    if (UI.exportBitrateMetric) {
      UI.exportBitrateMetric.innerText = `${bitrateMbps} Mbps`;
    }

    let videoCodecString = 'vp09.00.10.08';
    let muxerCodecString = 'V_VP9';

    if (typeof VideoEncoder.isConfigSupported === 'function') {
      try {
        const vp9Support = await VideoEncoder.isConfigSupported({
          codec: 'vp09.00.10.08',
          width: resW,
          height: resH,
          bitrate: targetBitrateBps,
          framerate: fps
        });
        if (!vp9Support || !vp9Support.supported) {
          videoCodecString = 'vp8';
          muxerCodecString = 'V_VP8';
        }
      } catch (e) {
        videoCodecString = 'vp8';
        muxerCodecString = 'V_VP8';
      }
    }

    const muxer = new WebmMuxer.Muxer({
      target: target,
      video: {
        codec: muxerCodecString,
        width: resW,
        height: resH,
        frameRate: fps
      },
      audio: hasAudio ? {
        codec: 'A_OPUS',
        numberOfChannels: 2,
        sampleRate: 48000
      } : undefined
    });

    let videoEncoder = null;
    let audioEncoder = null;

    try {
      videoEncoder = new VideoEncoder({
        output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
        error: (e) => {
          console.error("VideoEncoder (WebM) error during export:", e);
          throw new Error("WebM video encoder error: " + e.message);
        }
      });
      videoEncoder.configure({
        codec: videoCodecString,
        width: resW,
        height: resH,
        bitrate: targetBitrateBps,
        bitrateMode: 'variable',
        framerate: fps,
        latencyMode: 'quality'
      });
    } catch (e) {
      if (videoCodecString !== 'vp8') {
        videoCodecString = 'vp8';
        muxerCodecString = 'V_VP8';
        videoEncoder.configure({
          codec: 'vp8',
          width: resW,
          height: resH,
          bitrate: targetBitrateBps,
          bitrateMode: 'variable',
          framerate: fps,
          latencyMode: 'quality'
        });
      } else {
        throw new Error("Could not configure VideoEncoder for WebM: " + e.message);
      }
    }

    const tempPlaying = state.isPlaying;
    state.isPlaying = false;
    stopAudioSource();
    if (state.videoBlocks && state.videoBlocks.length > 0) {
      state.videoBlocks.forEach(b => {
        if (b.element) b.element.pause();
      });
    }

    state.layers.forEach(layer => {
      layer.lastWrapCount = null;
    });

    if (hasAudio) {
      UI.exportFrameCount.innerText = `Preparing audio (Opus)...`;
      UI.exportProgressBar.style.width = `0%`;
      UI.exportPercent.innerText = `0%`;

      try {
        audioEncoder = await VideoExporter.encodeAudioTrackChunked(
          muxer,
          48000,
          'opus',
          duration,
          960,
          'Audio (Opus)'
        );
      } catch (audioErr) {
        console.error("Audio encoding failed:", audioErr);
        throw new Error("Audio encoding failed: " + audioErr.message);
      }
    }

    if (state.exportCancel) {
      if (videoEncoder) videoEncoder.close();
      if (audioEncoder) audioEncoder.close();
      state.isPlaying = tempPlaying;
      if (state.isPlaying) syncAudioPlayback();
      VideoExporter.endExport(originalW, originalH);
      return;
    }

    const renderStartTime = performance.now();
    let lastMetricUpdate = 0;

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (state.exportCancel) break;

        state.prevTime = state.time;
        state.time = i / fps;

        const dur = getTimelineDuration();
        const loopTime = ((state.time % dur) + dur) % dur;
        const activeBlocks = state.videoBlocks ? state.videoBlocks.filter(b => loopTime >= b.startTime && loopTime < b.endTime) : [];
        if (activeBlocks.length > 0) {
          await Promise.all(activeBlocks.map(block => {
            if (!block.element) return Promise.resolve();
            const video = block.element;
            const maxT = Math.max(0, (block.duration || video.duration || 0) - 0.01);
            const relativeTime = Math.max(0, Math.min(maxT, (block.sourceOffset || 0) + (loopTime - block.startTime)));
            if (Math.abs(video.currentTime - relativeTime) < 0.004 && video.readyState >= 2) {
              return Promise.resolve();
            }
            return new Promise(resolve => {
              let resolved = false;
              let timeoutId = null;
              const onSeeked = () => {
                if (resolved) return;
                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                video.removeEventListener('seeked', onSeeked);
                resolve();
              };
              video.addEventListener('seeked', onSeeked);
              video.currentTime = relativeTime;
              timeoutId = setTimeout(onSeeked, 400);
            });
          }));
        }

        if (state.glitchEnabled) {
          GlitchManager.update(1 / fps);
        }

        renderFrame(state.time);

        const timestamp = Math.round((i / fps) * 1000000);
        const frameDurationUs = Math.round(1000000 / fps);
        const frame = new VideoFrame(UI.mainCanvas, { timestamp, duration: frameDurationUs });

        videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
        frame.close();

        const now = performance.now();
        if (now - lastMetricUpdate > 250 || i === totalFrames - 1) {
          lastMetricUpdate = now;
          const elapsedSec = (now - renderStartTime) / 1000;
          const currentSpeedFps = (i + 1) / Math.max(0.1, elapsedSec);
          const remainingFrames = totalFrames - (i + 1);
          const remainingSec = Math.max(0, remainingFrames / Math.max(1, currentSpeedFps));

          const remMin = Math.floor(remainingSec / 60);
          const remSec = Math.floor(remainingSec % 60);
          const etaText = remMin > 0 ? `${remMin}m ${remSec < 10 ? '0' : ''}${remSec}s` : `${remSec}s`;

          if (UI.exportSpeed) UI.exportSpeed.innerText = `${Math.round(currentSpeedFps)} fps`;
          if (UI.exportEta) UI.exportEta.innerText = i === totalFrames - 1 ? 'Finishing...' : etaText;

          const pct = Math.round(((i + 1) / totalFrames) * 100);
          UI.exportProgressBar.style.width = `${pct}%`;
          UI.exportFrameCount.innerText = `Rendering WebM: Frame ${(i + 1).toLocaleString()} / ${totalFrames.toLocaleString()}`;
          UI.exportPercent.innerText = `${pct}%`;
        }

        await new Promise(resolve => setTimeout(resolve, 0));

        while (videoEncoder.encodeQueueSize > 4) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      if (state.exportCancel) {
        if (writableStream) {
          try { await writableStream.abort(); } catch (e) {}
        }
        if (videoEncoder) videoEncoder.close();
        if (audioEncoder) audioEncoder.close();
        state.isPlaying = tempPlaying;
        if (state.isPlaying) syncAudioPlayback();
        VideoExporter.endExport(originalW, originalH);
        return;
      }

      await videoEncoder.flush();

      muxer.finalize();

      if (isDirectDisk && writableStream) {
        await writableStream.close();
        UI.exportProgressBar.style.width = `100%`;
        UI.exportPercent.innerText = `100%`;
        UI.exportFrameCount.innerText = `Export Complete! Saved directly to chosen WebM file.`;
        if (UI.exportEta) UI.exportEta.innerText = `Done`;
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        const { buffer } = muxer.target;
        const blob = new Blob([buffer], { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `vilecut_${Math.round(duration)}s_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
      }
    } catch (videoErr) {
      console.error("WebM encoding failed:", videoErr);
      if (writableStream) {
        try { await writableStream.abort(); } catch (e) {}
      }
      throw videoErr;
    } finally {
      if (wakeLock) {
        try { await wakeLock.release(); } catch (e) {}
        wakeLock = null;
      }
      if (videoEncoder) videoEncoder.close();
      if (audioEncoder) audioEncoder.close();

      state.isPlaying = tempPlaying;
      if (state.isPlaying) {
        syncAudioPlayback();
      }
      VideoExporter.endExport(originalW, originalH);
    }
  }

  static async exportWebMRealtime(duration, fps, resW, resH, originalW, originalH) {
    let wakeLock = null;
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (wlErr) {
        console.warn("Screen WakeLock could not be acquired:", wlErr);
      }
    }

    if (state.audioTrack) {
      try {
        const ctx = getAudioContext();
        setExportAudioNode(ctx.createMediaStreamDestination());
      } catch (err) {
        console.error("Failed to create AudioDestinationNode:", err);
      }
    }

    let canvasStream = UI.mainCanvas.captureStream(fps);
    let combinedStream = canvasStream;

    if (state.audioTrack && exportAudioNode) {
      const videoTrack = canvasStream.getVideoTracks()[0];
      const audioTrack = exportAudioNode.stream.getAudioTracks()[0];
      if (videoTrack && audioTrack) {
        combinedStream = new MediaStream([videoTrack, audioTrack]);
      }
    }

    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=h264';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }

    const bitrateMbps = state.exportBitrateMbps || 24;
    const targetBitrateBps = bitrateMbps * 1000000;
    if (UI.exportBitrateMetric) {
      UI.exportBitrateMetric.innerText = `${bitrateMbps} Mbps`;
    }

    state.exportChunks = [];
    try {
      state.exportRecorder = new MediaRecorder(combinedStream, {
        mimeType: mimeType,
        videoBitsPerSecond: targetBitrateBps
      });
    } catch (err) {
      if (wakeLock) {
        try { await wakeLock.release(); } catch (e) {}
      }
      console.error("Failed to initialize MediaRecorder: ", err);
      alert("MediaRecorder is not supported in this browser. Try Chrome/Firefox.");
      VideoExporter.endExport(originalW, originalH);
      return;
    }

    const tempPlaying = state.isPlaying;
    state.isPlaying = false;
    stopAudioSource();
    if (state.videoBlocks && state.videoBlocks.length > 0) {
      state.videoBlocks.forEach(b => {
        if (b.element) b.element.pause();
      });
    }

    state.layers.forEach(layer => {
      layer.lastWrapCount = null;
    });

    state.exportRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        state.exportChunks.push(e.data);
      }
    };

    state.exportRecorder.onstop = async () => {
      if (wakeLock) {
        try { await wakeLock.release(); } catch (e) {}
      }
      state.isPlaying = tempPlaying;
      if (state.isPlaying) {
        syncAudioPlayback();
      }

      if (state.exportCancel) {
        VideoExporter.endExport(originalW, originalH);
        return;
      }

      const blob = new Blob(state.exportChunks, { type: mimeType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `vilecut_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);

      VideoExporter.endExport(originalW, originalH);
    };

    state.exportRecorder.start(1000);

    const exportStartTime = performance.now();
    let lastFrameWallTime = exportStartTime;
    let lastExportLoopIndex = 0;

    function renderStep() {
      if (state.exportCancel) {
        if (state.videoBlocks) state.videoBlocks.forEach(b => { if (b.element) b.element.pause(); });
        state.exportRecorder.stop();
        return;
      }

      const now = performance.now();
      const elapsed = (now - exportStartTime) / 1000;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameWallTime) / 1000));
      lastFrameWallTime = now;

      if (elapsed >= duration) {
        if (state.videoBlocks) state.videoBlocks.forEach(b => { if (b.element) b.element.pause(); });
        state.exportRecorder.stop();
        return;
      }

      state.prevTime = state.time;
      state.time = elapsed;

      const dur = getTimelineDuration();
      const loopTime = ((state.time % dur) + dur) % dur;

      // Play video clips smoothly in real time (never block real-time MediaRecorder with per-frame seeked awaits!)
      if (state.videoBlocks && state.videoBlocks.length > 0) {
        state.videoBlocks.forEach(block => {
          const video = block.element;
          if (!video) return;
          const isActive = (loopTime >= block.startTime && loopTime < block.endTime);
          if (isActive) {
            const maxT = Math.max(0, (block.duration || video.duration || 0) - 0.01);
            const targetTime = Math.max(0, Math.min(maxT, (block.sourceOffset || 0) + (loopTime - block.startTime)));
            if (video.paused) {
              if (Math.abs(video.currentTime - targetTime) > 0.1) {
                video.currentTime = targetTime;
              }
              video.play().catch(() => {});
            } else if (Math.abs(video.currentTime - targetTime) > 0.3) {
              video.currentTime = targetTime;
            }
          } else if (!video.paused) {
            video.pause();
          }
        });
      }

      lastExportLoopIndex = syncExportAudio(state.time, lastExportLoopIndex);

      if (state.glitchEnabled) {
        GlitchManager.update(dt);
      }

      renderFrame(state.time);

      const pct = Math.round((elapsed / duration) * 100);
      UI.exportProgressBar.style.width = `${pct}%`;
      UI.exportFrameCount.innerText = `Recording: ${elapsed.toFixed(1)}s / ${duration.toFixed(1)}s`;
      UI.exportPercent.innerText = `${pct}%`;

      requestAnimationFrame(renderStep);
    }

    requestAnimationFrame(renderStep);
  }

  static endExport(origW, origH) {
    state.isExporting = false;
    setExportAudioNode(null);
    UI.exportOverlay.classList.add('hidden');

    UI.mainCanvas.width = origW;
    UI.mainCanvas.height = origH;

    resizeMainCanvas();
  }

  static exportCurrentFramePNG() {
    if (state.uploadedImages.length === 0 || state.layers.length === 0) {
      alert("Please upload an image first.");
      return;
    }

    if (state.isPlaying) {
      state.isPlaying = false;
      if (UI.btnPlayPause) UI.btnPlayPause.classList.remove('active');
      if (UI.playPauseIcon) UI.playPauseIcon.setAttribute('data-lucide', 'play');
      stopAudioSource();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Trigger visual camera shutter flash
    const flashEl = document.getElementById('glitch-flash');
    if (flashEl) {
      flashEl.classList.add('active');
      setTimeout(() => flashEl.classList.remove('active'), 120);
    }

    const originalW = UI.mainCanvas.width;
    const originalH = UI.mainCanvas.height;

    const mode = UI.exportResolution ? UI.exportResolution.value : 'viewport';
    const activeImg = state.uploadedImages[state.activeImageIndex >= 0 ? state.activeImageIndex : 0]?.img;

    let resW = originalW;
    let resH = originalH;

    if (activeImg) {
      let ratio = activeImg.naturalWidth / activeImg.naturalHeight;
      if (mode === 'viewport') {
        const arMode = state.aspectRatio;
        if (arMode === '16-9') ratio = 16 / 9;
        else if (arMode === '9-16') ratio = 9 / 16;
        else if (arMode === '1-1') ratio = 1 / 1;
        else if (arMode === '4-5') ratio = 4 / 5;
        else if (arMode === '21-9') ratio = 21 / 9;
      }

      if (mode === '720') {
        resW = 1280; resH = 720;
      } else if (mode === '1080') {
        resW = 1920; resH = 1080;
      } else if (mode === '1080s') {
        resW = 1080; resH = 1080;
      } else if (mode === '540') {
        resW = 960; resH = 540;
      } else if (mode === '480') {
        resW = 854; resH = 480;
      } else if (mode === '480s') {
        resW = 480; resH = 480;
      } else if (mode === 'original') {
        resW = activeImg.naturalWidth;
        resH = activeImg.naturalHeight;
      } else {
        if (ratio >= 1.0) {
          resH = 1080;
          resW = Math.round(resH * ratio);
        } else {
          resW = 1080;
          resH = Math.round(resW / ratio);
        }
      }
    }

    resW = Math.round(resW / 2) * 2;
    resH = Math.round(resH / 2) * 2;

    // Render at high-resolution export dimensions with full offscreen resolution
    UI.mainCanvas.width = resW;
    UI.mainCanvas.height = resH;
    state.isHighResSnapshot = true;
    renderFrame(state.time);
    state.isHighResSnapshot = false;

    UI.mainCanvas.toBlob((blob) => {
      UI.mainCanvas.width = originalW;
      UI.mainCanvas.height = originalH;
      resizeMainCanvas();
      renderFrame(state.time);

      if (!blob) {
        console.error("Failed to generate PNG snapshot blob");
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const timecodeStr = state.time.toFixed(2).replace('.', '_');
      a.download = `vilecut_frame_${timecodeStr}s_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 500);
    }, 'image/png');
  }
}
