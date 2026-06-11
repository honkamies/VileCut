# Changelog

All notable changes to the Videomaddness application will be documented in this file.

## [1.7.0] - 2026-06-11

### Added
- **Text Layer Multiline Support (Multiple Rows)**: Replaced single-line overlay text input with a multiline `<textarea>` inside the Text Settings inspector. Text layers now natively parse and render multiple rows separated by newlines (`\n`).
- **Centered Multiline Text Layout**: Implemented vertical offset calculations (line height spacing of `1.2x`) to keep multiline text blocks centered at the layer's origin coordinates.
- **Transition Adapters for Multiline Text**: Upgraded text transition effects (`slide-glitch`, `glitch-reveal`, and `character-scatter`) to handle multiline blocks organically. Character scatter splits and scatters characters in 2D space relative to their correct line offsets, and slide/reveal clips the entire height of the block.
- **Text Layer Flicker Effect**: Added a **Flicker Intensity** slider (0% to 100%) inside the Text Settings panel. Dynamically fluctuates the text layer's opacity at 20Hz based on a pseudo-random noise sequence bound to the loop time and a block-specific seed, ensuring deterministic flicker loops during exports.

## [1.6.0] - 2026-06-10

### Added
- **Audio Track Fade In and Fade Out Controls**: Added Fade In and Fade Out duration controls for the active audio track (0.0s to 5.0s, in 0.1s increments) inside the Audio Settings panel.
- **Linear Volume Gain Ramping**: Implemented smooth Web Audio API volume gain ramping (using `.setValueAtTime` and `.linearRampToValueAtTime`) for real-time playback loops, playhead seeking, WebM recording, and OfflineAudioContext MP4 renders.
- **Overlap Protection**: Integrated automatic boundary protection that clamps and adjusts the fade durations if the combined duration of the fade-in and fade-out zones exceeds the actual playback length of the audio block.
- **Timeline Keystroke Deletion**: Added keyboard shortcuts (`Delete` and `Backspace`) to instantly delete the selected timeline element (text layers, graphic overlays, video blocks, glitch triggers, or soundtracks) from the editor, automatically bypassing when typing in text fields or sliders.

## [1.5.2] - 2026-06-05

### Fixed
- **Robust Video Seek Waiting**: Increased the offline rendering seek safety timeout from 500ms to 3000ms and implemented `clearTimeout` cleanups in the event listeners. High-bitrate or long-keyframe-interval background videos undergo heavy CPU load during exports, occasionally requiring more than 500ms to seek. If the safety timeout fires prematurely, the exporter renders stale frames, producing laggy playback in the finalized exports. Raising this safety margin to 3 seconds gives slower seeks ample time to complete, eliminating export lag completely without slowing down normal fast seeks.

## [1.5.1] - 2026-06-05

### Fixed
- **Video Settings UI Desynchronization**: Resolved a bug where selecting or duplicating a video timeline block failed to update the sidebar's monochrome, mirror symmetry, kaleidoscope slices, brightness, and contrast settings, causing parameters to show out-of-sync values from previously active blocks.
- **Background Video Export Stutter/Lag**: Increased the offline rendering seek safety timeout from 100ms to 500ms. High-bitrate color background videos undergoing CPU-heavy encoding seeks often exceeded 100ms, causing the exporter to capture stale frames prematurely and leading to stuttering/lagging playback in the finalized MP4/WebM files.

## [1.5.0] - 2026-06-04

### Added
- **Graphic Overlay Glow FX**: Implemented high-performance outer glow styling for timeline graphic overlays using HTML5 Canvas shadow parameters (`shadowColor` and `shadowBlur`).
- **Glow Parameter Configuration**: Added interactive toggle switch, strength/radius slider (0px to 100px), native color picker, and quick-click neon swatch buttons inside the Graphic Settings panel.

### Fixed
- **Foreground Overlay Track Normalization**: Resolved a layout bug where the track compressor collapsed all track rows down to Track 0 when there was no background video block present. This forced the lowest foreground overlay onto Track 0, causing it to slip behind the zooming image layers. Normalization now collapses foreground tracks independently starting at Track 1, preserving Track 0 exclusively for background items.

## [1.4.1] - 2026-06-04

### Fixed
- **Independent Overlay Randomness Seeds**: Replaced the previous index-based character seed logic with a unique 16-bit polynomial hash generator derived from each block's unique `id`. Each text overlay layer and graphic overlay layer now animates (jitter, wobble, skew, block glitch offsets, and color splits) completely asynchronously and independently from other layers, while preserving deterministic perfect loops.

## [1.4.0] - 2026-06-04

### Added
- **Unified Track Reordering**: Every visual element (background videos, graphic overlays, and text overlays) is now integrated into a single unified timeline track system. Dragging any visual block vertically reorders it dynamically, with empty tracks automatically compressed and normalized on drag end.
- **Layer Drawing Z-Index Hierarchy**: Track indices dynamically determine the canvas rendering order. Elements on Track 0 render in the background behind the isolated depth zoom layers, while elements on Track 1+ render as foreground overlays on top of the depth stack in ascending order.
- **Foreground Video Overlays**: Added support for drawing video background blocks as full-screen foreground overlays when dragged onto Track 1 or higher.
- **Visual Indicator Icons**: Updated the timeline toolbar buttons for adding text, replacing plain plus signs with custom inline SVG icons showing a letter "T" and a small plus symbol (and an outer box layout for "New Track") to match the visual language of other tools.

## [1.3.0] - 2026-06-01

### Added
- **Timeline-Locked Glitch Triggers (⚡)**: Added timeline-locked trigger markers that execute cybernetic glitch spikes (with customized duration and severity overrides) at exact times on the timeline.
- **UX Button Dimming**: Dimmed and disabled the timeline "Add Glitch Trigger (⚡)" button unless the sidebar's general "Cybernetic Glitch FX" toggle is switched on, preventing setup confusion.
- **Dynamic Trigger Evaluation**: Real-time playback and video export pipelines evaluate sub-frame changes between steps, ensuring glitch triggers execute reliably at the exact timeline crossing.

## [1.2.0] - 2026-06-01

### Added
- **Background Video Track**: Support for uploading and rendering a full-length background video (MP4, WebM) behind all isolated layer depth stacks and overlays.
- **Playback Synchronization**: Real-time sync of the video background playback state and current time with the active timeline loop duration, correcting temporal drift dynamically.
- **Frame-Perfect Video Export**: Exporter seeking mechanism that pauses the video background and awaits the browser's `seeked` event using a Promise (with fallback safety timeout) to ensure zero frame drift or stuttering in exported H.264 MP4 and WebM videos.

## [1.1.0] - 2026-05-31

### Added
- **Timeline Vertical Drag-and-Drop Reordering**: Timeline blocks (texts and graphics) can now be dragged vertically to change track rows and drawing layers in real-time.
- **Timeline Zoom & Fit Controls**: Click-and-drag timeline zoom button (`0.15x` to `15.0x`) and "Fit Screen" button (double-click zoom shortcut) to scale the horizontal density of tracks, dynamic ruler ticks, and playhead.
- **Viewport Controls Auto-Fade**: Playback and overlay control toolbar fades away when the mouse is outside the video area and comes back instantly on hover.
- **App & Settings Resets**: Header buttons to reload the app completely or partially reset masking, glitch, motion, and overlay controls while safely preserving the uploaded images.
- **Stackable Glitch Styles**: Cybernetic Glitch FX now supports selecting multiple styles simultaneously (RGB Split, VHS Scanline Sag, Digital Block Tear, and Liquid Warp) with stacking.
- **Random-Pool Glitch Trigger**: Option to randomly select exactly one checked style to trigger on pulse spikes.
- **Monochrome Glitch FX**: Checkbox to force post-process RGB splits, sorting, and displacement into high-contrast grayscale.

### Changed
- **Default Graphic Duration**: Newly added graphic overlays now automatically span the full length of the loop timeline (0s to duration) rather than a static 3-second block.
- **Textless Timeline Controls**: Cleaned up the timeline toolbar by replacing button labels with descriptive hover tooltips.
- **Layer Edge Vignette**: Optimized composting performance for edge vignette blend bounds.
- **Glitch Text Motion**: Replaced smooth text wobble/skew with a discrete 24Hz stop-motion "Idle Jitter" and periodic "Glitch Twitch" rotations.

### Fixed
- **Audio Distortions**: Resolved duplicate buffer plays that caused buzzing during timeline loop boundaries.
- **Slow Video Export**: Relocated heavy post-process calculations to offscreen bounds and enabled GPU acceleration on the main preview context, boosting render speeds.
- **Graphic Size Mismatch**: Fixed sizing offset issues on graphics after video exports.
