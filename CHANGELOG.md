# Changelog

All notable changes to the Videomaddness application will be documented in this file.

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
