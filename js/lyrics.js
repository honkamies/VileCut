import { state } from './state.js';
import { UI } from './ui.js';
import { getTimelineDuration, generateUUID } from './utils.js';
import { updateTimelineTracks, selectText, updateTimelineRuler, updatePlayhead } from './timeline.js';
import { renderFrame } from './renderer.js';

export class LyricsManager {
  static pendingLyrics = [];
  static pendingFileName = '';

  /**
   * Parses standard LRC format: [mm:ss.xx] Lyric text
   */
  static parseLRC(lrcText) {
    const lines = lrcText.split(/\r?\n/);
    const entries = [];
    const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      
      // Skip ID tags: [ar:Artist], [ti:Title], [al:Album], [length:03:45], etc.
      if (/^\[(ar|al|ti|by|length|offset|re|ve):/i.test(line)) continue;
      
      const timestamps = [];
      let match;
      while ((match = timeRegex.exec(line)) !== null) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const fracStr = match[3] || '0';
        const frac = fracStr.length === 2 ? parseInt(fracStr, 10) / 100 : parseInt(fracStr, 10) / 1000;
        timestamps.push(mins * 60 + secs + frac);
      }
      timeRegex.lastIndex = 0;
      
      if (timestamps.length === 0) continue;
      
      // Strip all timestamp tags from lyric text
      const cleanText = line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
      if (!cleanText) continue;
      
      for (const t of timestamps) {
        entries.push({ time: t, text: cleanText });
      }
    }
    
    // Sort chronologically
    entries.sort((a, b) => a.time - b.time);
    
    // Determine start and end times for each line
    const lyricBlocks = [];
    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      const next = entries[i + 1];
      const startTime = current.time;
      
      let endTime;
      if (next) {
        const gap = next.time - startTime;
        if (gap > 0.2) {
          // If pause is longer than 5s, clamp lyric block duration so it doesn't linger indefinitely
          endTime = gap > 5.0 ? startTime + 4.5 : next.time;
        } else {
          endTime = next.time;
        }
      } else {
        endTime = startTime + 4.0;
      }
      
      lyricBlocks.push({
        startTime: Math.round(startTime * 100) / 100,
        endTime: Math.round(endTime * 100) / 100,
        text: current.text
      });
    }
    
    return lyricBlocks;
  }

  /**
   * Parses standard SRT subtitle format:
   * 1
   * 00:01:20,000 --> 00:01:23,500
   * Lyric line text
   */
  static parseSRT(srtText) {
    const blocks = srtText.trim().replace(/\r\n/g, '\n').split(/\n\n+/);
    const lyricBlocks = [];
    
    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length < 2) continue;
      
      const timeLineIdx = lines.findIndex(l => l.includes('-->'));
      if (timeLineIdx === -1) continue;
      
      const timeParts = lines[timeLineIdx].split('-->');
      if (timeParts.length !== 2) continue;
      
      const parseTime = (tStr) => {
        const parts = tStr.trim().split(':');
        if (parts.length < 3) return 0;
        const hours = parseFloat(parts[0]);
        const mins = parseFloat(parts[1]);
        const secParts = parts[2].replace(',', '.');
        const secs = parseFloat(secParts);
        return hours * 3600 + mins * 60 + secs;
      };
      
      const startTime = parseTime(timeParts[0]);
      const endTime = parseTime(timeParts[1]);
      const textLines = lines.slice(timeLineIdx + 1)
        .map(l => l.replace(/<[^>]*>/g, '').trim())
        .filter(Boolean);
      const text = textLines.join('\n');
      
      if (text && endTime > startTime) {
        lyricBlocks.push({
          startTime: Math.round(startTime * 100) / 100,
          endTime: Math.round(endTime * 100) / 100,
          text
        });
      }
    }
    
    return lyricBlocks;
  }

  /**
   * Parses un-timed plain TXT lyrics, evenly distributing them or assigning 3.5s per line
   */
  static parseTXT(txt, totalDuration = 60, lineDuration = 3.5) {
    const rawLines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const lyricBlocks = [];
    let currentTime = 0;
    
    for (const text of rawLines) {
      const startTime = currentTime;
      const endTime = startTime + lineDuration;
      lyricBlocks.push({
        startTime: Math.round(startTime * 100) / 100,
        endTime: Math.round(endTime * 100) / 100,
        text
      });
      currentTime = endTime;
    }
    return lyricBlocks;
  }

  /**
   * Auto-detect format and parse
   */
  static parseFile(fileName, content) {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.lrc') || /\[\d{1,2}:\d{2}/.test(content)) {
      return { format: 'LRC', blocks: LyricsManager.parseLRC(content) };
    } else if (lowerName.endsWith('.srt') || /-->/.test(content)) {
      return { format: 'SRT', blocks: LyricsManager.parseSRT(content) };
    } else {
      const dur = getTimelineDuration();
      return { format: 'TXT', blocks: LyricsManager.parseTXT(content, dur) };
    }
  }

  /**
   * Generates text overlay objects and mounts them to the timeline
   */
  static generateLayers(lyricBlocks, options = {}) {
    if (!lyricBlocks || lyricBlocks.length === 0) return 0;
    
    const {
      clearExisting = true,
      font = 'Outfit',
      size = 38,
      color = '#00f2fe',
      position = 'lower-third',
      transitionMode = 'fade-blur',
      glitchMode = 'none',
      autoExpandTimeline = true,
      allCaps = false
    } = options;

    if (clearExisting) {
      state.texts = [];
      state.selectedTextId = null;
    }

    // Determine target track index
    let maxTrackIdx = 0;
    const allIndices = [
      ...state.texts.map(t => t.trackIndex !== undefined ? t.trackIndex : 0),
      ...state.graphics.map(g => g.trackIndex !== undefined ? g.trackIndex : 0),
      ...state.videoBlocks.map(v => v.trackIndex !== undefined ? v.trackIndex : 0)
    ];
    if (allIndices.length > 0) {
      maxTrackIdx = Math.max(...allIndices);
    }
    const targetTrackIdx = maxTrackIdx + 1;

    // Resolve Y position
    let posY = 0.35; // lower-third default
    if (position === 'bottom') posY = 0.42;
    else if (position === 'center') posY = 0.0;
    else if (position === 'top') posY = -0.35;

    let maxEndTime = 0;
    const newTexts = [];

    for (let i = 0; i < lyricBlocks.length; i++) {
      const block = lyricBlocks[i];
      if (block.endTime > maxEndTime) {
        maxEndTime = block.endTime;
      }

      const rawText = block.text || '';
      const finalText = allCaps ? rawText.toUpperCase() : rawText;

      newTexts.push({
        id: 'txt_' + generateUUID(),
        text: finalText,
        font: font,
        size: size,
        color: color,
        x: 0.0,
        y: posY,
        angle: 0,
        idleWobble: 0.0,
        idleSkew: 0.0,
        glitchMode: glitchMode,
        glitchMono: false,
        glitchIntensity: glitchMode !== 'none' ? 45 : 0,
        flickerIntensity: glitchMode === 'flicker' ? 50 : 0,
        transitionMode: transitionMode,
        transitionDuration: 0.3,
        startTime: block.startTime,
        endTime: block.endTime,
        trackIndex: targetTrackIdx
      });
    }

    // Auto-expand timeline duration to cover lyrics if requested
    if (autoExpandTimeline && maxEndTime > 0) {
      const neededDuration = Math.min(600, Math.ceil(maxEndTime + 2));
      if (neededDuration > state.exportDuration) {
        state.exportDuration = neededDuration;
        const m = Math.floor(neededDuration / 60);
        const s = Math.round(neededDuration % 60);
        const tc = `${m}:${s.toString().padStart(2, '0')}`;
        const label = m > 0 ? `${m}m ${s}s (${neededDuration}s)` : `${neededDuration}s`;
        if (UI.exportDuration) UI.exportDuration.value = neededDuration;
        if (UI.exportDurationVal) UI.exportDurationVal.innerText = label;
        if (UI.exportDurationInput) UI.exportDurationInput.value = tc;
        if (UI.timelineDurationSlider) UI.timelineDurationSlider.value = neededDuration;
        if (UI.timelineDurationVal) UI.timelineDurationVal.innerText = `(${neededDuration}s)`;
        if (UI.timelineDurationInput) UI.timelineDurationInput.value = tc;
      }
    }


    state.texts = [...state.texts, ...newTexts];

    if (newTexts.length > 0) {
      selectText(newTexts[0].id);
    }

    updateTimelineRuler();
    updateTimelineTracks();
    updatePlayhead();
    renderFrame(state.time);

    return newTexts.length;
  }
}
