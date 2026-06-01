# Changelog

All notable changes to the Videomaddness application will be documented in this file.

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
