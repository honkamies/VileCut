import { state } from './state.js';
import { UI } from './ui.js';
import { getTimelineDuration } from './utils.js';
import { stopAudioSource, getAudioContext, exportAudioNode, setExportAudioNode, syncExportAudio, syncAudioPlayback } from './audio.js';
import { GlitchManager } from './glitch.js';
import { renderFrame, resizeMainCanvas } from './renderer.js';
import { Muxer, ArrayBufferTarget } from './mp4-muxer.js';

export class VideoExporter {
  static async export() {
    if (state.uploadedImages.length === 0 || state.layers.length === 0 || state.isExporting) return;
    
    state.isExporting = true;
    state.exportCancel = false;
    UI.exportOverlay.classList.remove('hidden');

    const originalW = UI.mainCanvas.width;
    const originalH = UI.mainCanvas.height;
    
    // Calculate export duration and loops depending on exportMode
    let duration = 5;
    if (state.exportMode === 'duration') {
      duration = state.exportDuration;
    } else {
      const absSpeed = Math.abs(state.zoomSpeed);
      if (absSpeed > 0.0001) {
        duration = state.exportLoops / absSpeed;
      } else {
        duration = 5; // fallback
      }
    }

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
    } else {
      // mode is 'original' or 'viewport'
      if (ratio >= 1.0) {
        resH = 1080;
        resW = Math.round(resH * ratio);
      } else {
        resW = 1080;
        resH = Math.round(resW / ratio);
      }
    }

    // Crucial for H.264 WebCodecs encoders: width/height must be even numbers
    resW = Math.round(resW / 2) * 2;
    resH = Math.round(resH / 2) * 2;

    UI.mainCanvas.width = resW;
    UI.mainCanvas.height = resH;

    // Check if we should use the new MP4 WebCodecs exporter or WebM fallback
    const hasWebCodecs = typeof window.VideoEncoder !== 'undefined';
    const useWebCodecsMP4 = state.exportFormat === 'mp4' && hasWebCodecs;

    if (useWebCodecsMP4) {
      try {
        await VideoExporter.exportMP4(duration, fps, resW, resH, originalW, originalH);
      } catch (err) {
        console.error("MP4 WebCodecs export failed, falling back to WebM:", err);
        alert("MP4 export failed: " + err.message + ". Falling back to WebM.");
        // Restore canvas size and run WebM export
        UI.mainCanvas.width = resW;
        UI.mainCanvas.height = resH;
        VideoExporter.exportWebM(duration, fps, resW, resH, originalW, originalH);
      }
    } else {
      VideoExporter.exportWebM(duration, fps, resW, resH, originalW, originalH);
    }
  }

  static async exportMP4(duration, fps, resW, resH, originalW, originalH) {
    const totalFrames = Math.ceil(duration * fps);
    const hasAudio = !!state.audioTrack;

    // 1. Initialize Muxer
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
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
      fastStart: 'in-memory'
    });

    // 2. Setup Encoders
    let videoEncoder = null;
    let audioEncoder = null;

    try {
      videoEncoder = new VideoEncoder({
        output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
        error: (e) => {
          console.error("VideoEncoder error during export:", e);
          throw new Error("Video encoder error: " + e.message);
        }
      });
      videoEncoder.configure({
        codec: 'avc1.4d002a', // H.264 Main Profile, Level 4.2
        width: resW,
        height: resH,
        bitrate: 6000000,
        framerate: fps,
        latencyMode: 'quality'
      });
    } catch (e) {
      console.error("VideoEncoder configuration failed:", e);
      throw new Error("Could not configure VideoEncoder. H.264 profile avc1.4d002a may not be supported by this browser.");
    }

    const tempPlaying = state.isPlaying;
    state.isPlaying = false;
    stopAudioSource();

    // Reset wrap counts for all layers to align with starting time 0.0
    state.layers.forEach(layer => {
      layer.lastWrapCount = null;
    });

    // 3. Audio Encoding (if soundtrack is present)
    if (hasAudio) {
      const sampleRate = 44100;
      const totalAudioFrames = Math.ceil(duration * sampleRate);
      
      UI.exportFrameCount.innerText = `Preparing audio...`;
      UI.exportProgressBar.style.width = `0%`;
      UI.exportPercent.innerText = `0%`;

      try {
        const offlineCtx = new OfflineAudioContext(2, totalAudioFrames, sampleRate);
        const dur = getTimelineDuration();
        const track = state.audioTrack;

        // Schedule soundtrack instances
        for (let loopStartTime = 0; loopStartTime < duration; loopStartTime += dur) {
          const playStart = loopStartTime + track.timelineStart;
          const playEnd = playStart + track.duration;
          const loopEnd = loopStartTime + dur;
          
          const actualStart = Math.max(playStart, 0);
          const actualEnd = Math.min(playEnd, loopEnd, duration);
          
          if (actualStart < actualEnd) {
            const relativeOffset = actualStart - playStart;
            const filePlayStart = track.sourceOffset + relativeOffset;
            const playDuration = actualEnd - actualStart;
            
            if (filePlayStart >= 0 && filePlayStart < track.buffer.duration) {
              const source = offlineCtx.createBufferSource();
              source.buffer = track.buffer;
              
              const gainNode = offlineCtx.createGain();
              gainNode.gain.value = track.volume !== undefined ? track.volume : 0.8;
              
              source.connect(gainNode);
              gainNode.connect(offlineCtx.destination);
              
              source.start(actualStart, filePlayStart, playDuration);
            }
          }
        }

        const renderedBuffer = await offlineCtx.startRendering();

        // Configure audio encoder
        audioEncoder = new AudioEncoder({
          output: (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
          error: (e) => {
            console.error("AudioEncoder error during export:", e);
            throw new Error("Audio encoder error: " + e.message);
          }
        });
        audioEncoder.configure({
          codec: 'mp4a.40.2', // AAC-LC
          numberOfChannels: 2,
          sampleRate: sampleRate,
          bitrate: 128000
        });

        // Encode audio in chunks of 1024 frames
        const leftChannel = renderedBuffer.getChannelData(0);
        const rightChannel = renderedBuffer.getChannelData(1);
        const totalSamples = renderedBuffer.length;
        const frameSize = 1024;
        let sampleIndex = 0;

        while (sampleIndex < totalSamples) {
          if (state.exportCancel) break;
          const framesToEncode = Math.min(frameSize, totalSamples - sampleIndex);
          const audioBuffer = new Float32Array(2 * framesToEncode);
          audioBuffer.set(leftChannel.subarray(sampleIndex, sampleIndex + framesToEncode), 0);
          audioBuffer.set(rightChannel.subarray(sampleIndex, sampleIndex + framesToEncode), framesToEncode);
          
          const timestamp = Math.round((sampleIndex / sampleRate) * 1000000);
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
            const audioPct = Math.min(100, Math.round((sampleIndex / totalSamples) * 100));
            UI.exportProgressBar.style.width = `${audioPct}%`;
            UI.exportFrameCount.innerText = `Processing Audio: ${audioPct}%`;
            UI.exportPercent.innerText = `${audioPct}%`;
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
        }
        await audioEncoder.flush();
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

    // 4. Video Encoding Loop
    try {
      for (let i = 0; i < totalFrames; i++) {
        if (state.exportCancel) break;

        state.time = i / fps;
        
        if (state.glitchEnabled) {
          GlitchManager.update(1 / fps);
        }
        
        renderFrame(state.time);

        const timestamp = Math.round((i / fps) * 1000000);
        const frame = new VideoFrame(UI.mainCanvas, { timestamp });
        
        videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
        frame.close();

        // UI progress update
        const pct = Math.round((i / totalFrames) * 100);
        UI.exportProgressBar.style.width = `${pct}%`;
        UI.exportFrameCount.innerText = `Rendering Video: Frame ${i + 1} / ${totalFrames}`;
        UI.exportPercent.innerText = `${pct}%`;

        // Yield to allow browser UI updates
        await new Promise(resolve => requestAnimationFrame(resolve));

        // Enforce backpressure queue limit to prevent OOM
        while (videoEncoder.encodeQueueSize > 4) {
          await new Promise(resolve => setTimeout(resolve, 10));
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

      await videoEncoder.flush();

      // 5. Finalize and Download
      muxer.finalize();

      const { buffer } = muxer.target;
      const blob = new Blob([buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `videomaddness_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (videoErr) {
      console.error("Video encoding failed:", videoErr);
      throw videoErr;
    } finally {
      if (videoEncoder) videoEncoder.close();
      if (audioEncoder) audioEncoder.close();
      
      state.isPlaying = tempPlaying;
      if (state.isPlaying) {
        syncAudioPlayback();
      }
      VideoExporter.endExport(originalW, originalH);
    }
  }

  static exportWebM(duration, fps, resW, resH, originalW, originalH) {
    // Initialize export audio routing
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

    state.exportChunks = [];
    try {
      state.exportRecorder = new MediaRecorder(combinedStream, {
        mimeType: mimeType,
        videoBitsPerSecond: 6000000
      });
    } catch (err) {
      console.error("Failed to initialize MediaRecorder: ", err);
      alert("MediaRecorder is not supported in this browser. Try Chrome/Firefox.");
      VideoExporter.endExport(originalW, originalH);
      return;
    }

    const tempPlaying = state.isPlaying;
    state.isPlaying = false;
    stopAudioSource();

    // Reset wrap counts for all layers to align with starting time 0.0, using null to force initial frame recalculation
    state.layers.forEach(layer => {
      layer.lastWrapCount = null;
    });

    state.exportRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        state.exportChunks.push(e.data);
      }
    };

    state.exportRecorder.onstop = () => {
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
      a.download = `videomaddness_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);

      VideoExporter.endExport(originalW, originalH);
    };

    state.exportRecorder.start();
    
    const exportStartTime = performance.now();
    let lastExportLoopIndex = 0;

    async function renderStep() {
      if (state.exportCancel) {
        state.exportRecorder.stop();
        return;
      }

      const elapsed = (performance.now() - exportStartTime) / 1000;

      if (elapsed >= duration) {
        state.exportRecorder.stop();
        return;
      }

      state.time = elapsed;

      // Audio sync during export (calls isolated logic inside audio.js)
      lastExportLoopIndex = syncExportAudio(state.time, lastExportLoopIndex);

      if (state.glitchEnabled) {
        GlitchManager.update(1 / 60);
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
}

