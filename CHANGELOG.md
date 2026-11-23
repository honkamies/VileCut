# Changelog

All notable changes to the VileCut application will be documented in this file.

## [1.20.1] - 2026-11-23

### Changed
- **Wizard Launch Button Text**: Renamed Step 7 button to **"Let's start editing!"** with clapperboard icon to reflect entering the studio paused for editing.

### Fixed & Optimized
- **Canvas Readback Performance**: Added `{ willReadFrequently: true }` to `mainCanvas`, `masking.js` `tempCtx`, and `wizard.js` preview slicing context to prevent GPU→CPU readback stalls during Glitch, Geometric, VHS, and GIF export passes.
- **GIF Export Seek Guard**: Added early-exit seek check and 400ms timeout guard to GIF export video seeking (matching MP4/WebM export).
- **Dead DOM Reference Cleanup**: Removed unused `#btn-wizard-skip-all` references from `wizard.js` and `ui.js`.

## [1.20.0] - 2026-11-23

### Added
- **Step-by-Step New Project Wizard**: Guided 7-step creation workflow (Introduction, Aspect Ratio & Duration, Multi-Image Camera Tunnel with real-time preview, Graphic Overlays with canvas drag placement, Audio import, Typography, and Review & Launch).
- **Viewport Backdrop Brightness Slider**: Minimalist sun brightness control in the viewport toolbar to shift the surrounding studio matte from black to grey (with transparent `.canvas-container` and crisp `#main-canvas` border) for clear framing on dark videos without affecting exports.
- **VHS Scanline Blur & Tape Degradation Blur/Opacity**: Added Gaussian-blurred CRT phosphor scanlines (`#vhs-scanline-blur`, default `50%`) and dedicated Tape Degradation Blur (`40%`) + Opacity (`75%`) controls for RF static bursts, V-Hold bars, and tape crease flare.
- **True NLE Video Trimming (`sourceOffset`)**: Trimming the start or end handle of a video clip on the timeline now cleanly cuts/hides the trimmed portion across live playback, scrubbing, Undo/Redo, and all export pipelines.

### Changed
- **Removed Old Welcome Modal & Retro OSD Display**: Entering the editor from the wizard now goes straight into the studio paused (`IDLE`) with no legacy welcome popup, and the Retro OSD HUD has been removed from VHS FX.
- **Unified Infinite Zoom Speed**: Aligned wizard and editor Diving Speed sliders (`-0.5` to `0.5`, continuous speed with zero loop-quantization lock and smooth phase accumulation).
- **Full Audio Track Import from Wizard**: Preserves full `audioBuffer.duration`, fade controls, and song duration badges so wizard-imported audio can be freely dragged and repositioned on the timeline.

### Fixed
- **App Initialization & HistoryManager**: Fixed syntax error in `app.js` and added `canUndo()`, `canRedo()`, and `onChange` notifications to `HistoryManager` in `state.js`.
- **Video Scale**: Wired `#video-scale` slider and applied `scale` across Track 0 background and Track 1+ foreground video rendering.
- **Save & Load Project (`.vilecut.json`)**: Fixed double-JSON-stringification bug, embedded tunnel deck images & graphic overlays as Data URLs, added backward-compatible unwrapping for previously saved files, and added media manifest notices for large external audio/video files.
- **Timeline Duration Slider Stability**: Aligned Basic mode max duration to `60s` and kept slider `.min` stable to eliminate jumpy thumb movement.
- **Smooth Video Exports & 9× Faster VHS FX**: Eliminated per-frame `seeked` stalls in real-time `MediaRecorder` export, added explicit CFR frame `duration` to WebCodecs `VideoFrame`s, and downscaled the internal VHS CPU pixel pass to max `640px` on the long edge.

## [1.19.1] - 2026-11-20

### Fixed
- **Resolved Studio Initialization Freeze & Dead Canvas on Arrival**:
  - Fixed root cause where skipping the wizard via "Skip to Full studio view" left `state.imageLoaded = false`, `state.uploadedImages = []`, and the engine stopped, causing the editor to appear completely stuck and frozen with a blank canvas.
  - Implemented `launchDefaultStudio()` in `WizardManager`: Clicking "Skip to Full studio view" or closing the wizard now instantly boots the studio with the default Cyber Sigil sample, pre-configured graphic overlay, and "VILECUT // STUDIO" typography title, with active 60 FPS playback running immediately.
  - Initialized `resizeMainCanvas()` and `engine.start()` in `initApp()`, ensuring the background playback loop runs from application load.
  - Removed restrictive `if (state.uploadedImages.length === 0 || state.layers.length === 0) return;` block in `renderer.js`: `renderFrame()` now gracefully renders standalone video blocks, graphic overlays, text layers, and VHS effects even when no tunnel image is present.
  - Updated `resizeMainCanvas()` to properly size the container and offscreen buffers based on `state.aspectRatio` without requiring an uploaded image.
  - Synchronized `updateImagesDeckUI()` invocation upon wizard launch so deck thumbnails and layer controls immediately unhide and reflect active images.
- **Fixed Video Background & Video Block Playback**:
  - Removed `&& state.imageLoaded` requirement in `syncVideoPlayback()` and `engine.subscribe`: Video playback now starts and syncs smoothly with the playhead clock whether a tunnel image is loaded or not.
  - Relaxed drift tolerance threshold to `0.25s` to eliminate micro-jitter seeking in HTML5 video elements during playback.
  - Automatically call `updateTimelineTracks()`, `resizeMainCanvas()`, and `renderFrame()` upon loading a video via the timeline video file input.
- **Enhanced Main Studio Canvas Click-and-Drag for Overlays**:
  - Removed `!state.imageLoaded` check on `mainCanvas` `mousedown` and `touchstart` event listeners.
  - Added a generous hit-testing margin (`hitMargin = Math.max(24, Math.round(cw * 0.04))`) in `findOverlayAtCoords` for graphics, text, and videos, making canvas elements easy to grab.
  - Enabled active-overlay and single-overlay fallback: Clicking anywhere on the canvas when a graphic or text is selected directly drags that overlay, matching the intuitive behavior of the wizard preview.
  - Ensured `renderFrame(state.time)` is called continuously on every mousemove and touchmove during dragging for 60 FPS zero-lag pointer tracking.
  - Synchronized coordinate sliders (`UI.graphicPosX`, `UI.graphicPosY`, etc.) and percentage labels in real time during canvas dragging.

## [1.19.0] - 2026-11-20

### Security & Infrastructure
- **Upgraded NGINX Base Image to `nginx/1.31.9` (`nginx:alpine`)**:
  - Fully remediated the critical November 18, 2026 "nginx2root" vulnerability collection:
    - **CVE-2026-123007**: HTTP/2 flow control integer overflow/underflow (CVSS 9.2).
    - **CVE-2026-123633**: HTTP/2 upstream proxying use-after-free (CVSS 9.2).
    - **CVE-2026-121810**: HTTP/3 QUIC upstream proxying use-after-free.
    - **CVE-2026-123634**: DNS resolver and request-mirror use-after-free.
    - **CVE-2026-113425**: Mail proxy memory corruption.
  - Upgraded base image from `nginx:1.27-alpine` (`1.27.5`) to official mainline `nginx:alpine` (`1.31.9`).
  - Added `absolute_redirect off;` and regex rewrite in `nginx.conf` (`location ~* ^(/.+?)\.+$ { return 301 $1; }`) to automatically redirect accidental trailing periods (e.g. from copy-pasting URLs ending with sentence periods: `/vilecut.html.` -> `/vilecut.html`), preserving client port `:8090`.
  - Configured `index vilecut.html index.html;` so accessing root `/` directly loads the modular VileCut studio.

### Added
- **Expanded 7-Step Project Creation Wizard ("Lähestymistapa" Workflow - `js/wizard.js`)**:
  - A guided, highly intuitive 7-step onboarding and project setup workflow that welcomes users and walks them through project construction sequentially before opening the complex multi-panel studio:
    - **Step 1: Introduction, Capabilities & Client-Side Privacy**:
      - Educational welcome hero introducing VileCut as the Chaotic Motion Machine / underground visual loop laboratory.
      - **What Is VileCut?**: Highlighting 2D raster luminosity slicing into recursive infinite-zoom camera tunnels and live glitch synthesis.
      - **What You Can Achieve**: Showcasing social-media vertical visuals (TikTok, Reels, Shorts), cinematic stage visuals (16:9, 21:9), album art loops, cybernetic title cards, and analog VHS tape decays.
      - **Security & Total Privacy (100% In-Browser)**: Clearly informing users that VileCut runs entirely client-side using WebCodecs and Canvas 2D on their own GPU/CPU—media files, music, and exports never leave their machine or touch an external server.
      - Navigation options: "Start Project: Choose Framing ->" or "Skip to Full studio view" (top redundant skip removed for cleaner UI).
    - **Step 2: Welcome & Project Framing**: Aspect ratio selection cards (`9:16 Vertical` for TikTok/Reels/Shorts, `16:9 Landscape` for YouTube/Cinema, `1:1 Square` for Instagram Feed/Album Art, `4:5 Portrait`, `21:9 Ultrawide`) with visual aspect previews, and duration presets (3s, 5s standard loop, 10s, 15s, 30s).
    - **Step 3: Camera Tunnel Core Graphic**: Multi-image batch selection enabled (`<input multiple>`) matching the main application's Source Images Deck capabilities. Users can select multiple images via browser file dialog or multi-file drag-and-drop. Features instant procedural "Cyber Sigil" celestial mandala generator (enabling immediate 1-click preview without local files), real-time offscreen 60 FPS deterministic tunnel loop preview canvas with live controls for layer depth (3–16 depth bands), zoom speed (0.1x–2.0x), and edge feather/fade (0–40%). Automatically adapts dimensions to match the selected aspect ratio and commits the full deck to studio timeline.
    - **Step 4: Overlays, Logos & Canvas Placement**: Live camera tunnel renders in the background by default across the chosen aspect ratio canvas. Supports transparent PNG logos, stickers, or badges with real-time interactive **click-and-drag manual positioning** on the canvas, corner drag handles, dashed bounding box, preset placement buttons (Top Header, Direct Center, Bottom Footer, Bottom-Right Bug), dedicated **Horizontal (X) and Vertical (Y) coordinate offset sliders** (-50% to +50%), scale slider (20%–150%), and blend modes (`normal`, `screen`, `multiply`, `overlay`, `color-dodge`). Includes in-app notification that unlimited additional graphic and video layers can be added in the main studio timeline.
    - **Step 5: Music & Soundtrack**: Audio upload (MP3, WAV, OGG, AAC) with live waveform analyzer canvas rendering peaks in real time, and auto-match project duration toggle to adapt timeline length to audio length. Optional step.
    - **Step 6: Typography & Title Card**: Live camera tunnel renders in the background of the typography canvas matching the chosen aspect ratio. Features direct **Custom Font Upload** (`.ttf`, `.otf`, `.woff`, `.woff2`) via `FontFace` API with studio persistence, **Text / Lyrics File Import** (`.lrc`, `.txt`), **Font Size slider** (20px–80px), **Cyber Glow Radius slider** (0px–50px), cyberpunk neon glow style presets (`Neon Cyan`, `Hot Pink`, `Pure White`), placement (Top, Center, Bottom), and font family selection. Includes in-app callout that unlimited text and lyrics tracks can be added in the main studio timeline.
    - **Step 7: Review & Launch**: Dynamic summary overview of all configured elements (aspect ratio, duration, tunnel layers/speed, exact overlay coordinates/scale, audio, text font/size) and a prominent "Launch VileCut Studio & Start Playing" action button that commits all state, isolated layer slices, graphics, audio, and typography directly to the timeline, opens the canvas, and begins 60 FPS playback.
  - **Dynamic Aspect Ratio Synchronization**: Preview canvases across Step 3, Step 4, and Step 6 dynamically rescale their internal buffer and CSS aspect-ratio according to the user's selected platform format (`9:16`, `16:9`, `1:1`, `4:5`, `21:9`).
  - **Interactive Stepper Navigation**: Clickable stepper indicators (1 through 7) for immediate jumping between steps.
  - **Studio Canvas Interaction**: Main studio preview canvas (`UI.mainCanvas`) interactive click-and-drag positioning for graphics, text, and videos with grab/grabbing cursor and hit-testing.
  - Quick-access button in top navigation bar (`#btn-open-wizard`) with subtle pulsing glow.
  - Automatic launch on first visit or query parameter trigger (`?wizard=1` or `?mode=wizard`), with `sessionStorage` dismissal memory and `Skip Wizard (Open Studio)` option.
  - Full keyboard accessibility (Escape to dismiss, back/next navigation).
  - Mirroring and re-export in `danger/js/wizard.js` for Danger Zone integration.


## [1.18.0] - 2026-11-18

### Added
- **Vintage VHS & Analog Camcorder FX Simulation Engine (`js/vhs_fx.js`)**:
  - High-performance, zero-allocation 60 FPS analog tape and video camera simulation pipeline integrated seamlessly into real-time canvas preview and offline WebCodecs MP4/WebM/GIF exports.
  - **Vertical Jump & V-Hold Slip**: 60Hz micro-jitter simulating mechanical tape guide tolerances and intermittent vertical frame rolls exposing the Vertical Blanking Interval (VBI) bar with sync pulses and head-switch fuzz.
  - **Tracking Noise & RF Static**: Bottom head-switching static bar and wandering RF static bands with horizontal scanline tearing and salt-and-pepper noise.
  - **Tape Crease / Wrinkle**: Swept horizontal warped bend distortion with localized shear and high-intensity RF loss luma halo flare.
  - **Wobble & TBC Instability**: Capstan motor sinusoidal flutter, scanline micro-jitter, and top-of-screen "flag waving" curvature.
  - **1D Bandwidth Softness**: Authentic ~240-line horizontal luma roll-off while maintaining sharp vertical scanlines via GPU-accelerated horizontal downsampling and bilinear reconstruction.
  - **Chroma Bleed & Color Decays**: NTSC 629kHz color-under down-conversion with horizontal red/blue channel displacement, NTSC 7.5 IRE lifted milky blacks, and vintage cathode phosphor tint.
  - **CRT Scanlines**: Alternating scanline dimming (`y % 2 === 1`) simulating CRT phosphorus raster lines.
  - **Retro On-Screen Display (OSD HUD)**: Monospace HUD with drop shadow supporting Camcorder (`REC ●` with pulsing red dot, battery indicator, date, timecode), VCR Playback (`PLAY ▶`, `SP`, tape counter), Security CCTV (`CAM 04`, clock), and custom text.
  - **Curated Presets**: Quick 1-click presets: *Camcorder 1994 (Handheld Nostalgia)*, *Worn VHS 1988 (Rental Cassette)*, *Damaged Rental Tape (Heavy Static & Crease)*, *Subtle Analog (Warmth & Fine Grain)*, and *Security CCTV 1991 (Scanlines & HUD)*.
  - **Scope Control**: Switchable processing scope between *Full Composite* (entire video + text/graphic overlays) and *Tunnel Buffer* (processes tunnel before symmetry mirroring).
  - Full Undo/Redo (`HistoryManager`) and project state serialization support.

## [1.17.3] - 2026-10-13

### Added
- **Danger Zone MP4/WebM Export Quality & Bitrate Controls**:
  - Adjustable video bitrate slider ranging from 6 Mbps to 50 Mbps with responsive fidelity badging (`Standard`, `High Quality`, `Ultra Crisp`, `Master Studio`).
  - Quick-preset buttons for 1-click selection: `12M Standard`, `24M Ultra Rec` (Recommended default, 4x increase over legacy 6 Mbps default), and `36M Master`.
  - Context-aware UI visibility: slider automatically hidden when exporting palette-quantized animated GIFs.
  - Live `BITRATE` metric display added to the rendering HUD overlay alongside Render Speed, ETA, and Stream Target.
- **H.264 High Profile & Variable Bitrate (VBR) Encoding**:
  - Automatic feature detection for H.264 High Profile Level 4.2 (`avc1.64002a`) with 8x8 DCT transforms via WebCodecs `VideoEncoder.isConfigSupported()`, drastically cutting down compression macroblocking and ringing artifacts on high-frequency glitch/zoom textures.
  - Configured `bitrateMode: 'variable'` and `latencyMode: 'quality'` for dynamic bandwidth allocation during motion bursts.
  - Upgraded AAC and Opus audio encoding from 128 kbps to 192 kbps for studio-grade audio clarity.
  - Dynamic bitrate applied across both WebCodecs WebM and real-time MediaRecorder fallback export pipelines.

## [1.17.2] - 2026-10-11

### Fixed
- **Timeline Duration Squeeze Protection**:
  - Prevented project duration from shrinking smaller than the latest placed timeline item (`texts`, `graphics`, `videoBlocks`, `glitchTriggers`), completely eliminating accidental destructive truncation and squeezing.
  - Dynamically calculates `getMinimumRequiredTimelineDuration()` based on the maximum block end time.
  - Constrains duration adjustments across sliders, timecode input boxes, and preset fit handlers to never fall below the minimum required duration.
  - Synchronizes slider `min` boundaries dynamically so timeline blocks cannot be crushed even during rapid drag gestures.

## [1.17.0] - 2026-10-11

### Added
- **Danger Zone // Extended 10-Minute Video Pipeline (`/danger/`)**:
  - High-duration rendering engine configured for extended exports up to 10–15 minutes (600–900 seconds) without risking browser memory exhaustion.
  - Direct entrance button in header ("Dangerzone longvideo") linking to the dedicated hazard engine.
  - **Direct-to-Disk MP4 Streaming**: Leverages the Chromium File System Access API (`FileSystemWritableFileStreamTarget`) for renders $\ge 45\text{s}$, streaming encoded H.264/AAC packets chunk-by-chunk to disk while maintaining $< 50\text{MB}$ RAM footprint.
  - **Memory Safeguards**: GIF exports locked out for durations $> 30\text{s}$ to prevent 60GB+ browser tab crashes.
  - **Screen WakeLock Integration**: Automatically requests `navigator.wakeLock` during active renders to prevent OS/display sleep.
  - **Live Encoding Telemetry**: Real-time render metrics displaying processing speed (FPS), accurate ETA countdown, and stream target mode (Direct Disk vs RAM Buffer).

### Fixed
- **Danger Zone Module SyntaxError**: Removed duplicate declaration of `const dur` in `danger/js/renderer.js` that caused module compilation failure on page load, rendering buttons unresponsive and icon placeholders blank.
- **Resilient App Initialization**: Added readyState checking in `danger/js/app.js` and immediate Lucide icon hydration in `danger/index.html` to ensure icons and listeners bind reliably.

## [1.16.0] - 2026-10-04

### Added
- **Spectral Edge Curtain (Micro-Geometric FX)**:
  - Real-time luminance edge detection with 0–360° directional beam projection and bidirectional beam extension.
  - Granular edge threshold and beam length controls, neon boost multiplier, laser anchor beads, and energy dynamics.
  - Luminosity detection gating: trigger beams specifically on highlights, shadows, or custom floor/ceiling luminance ranges.
  - Strobe & flicker frequency modulation for chaotic rave and analog visualizer aesthetics.
- **Client-Side Animated GIF Exporting (`.gif`)**:
  - Zero-dependency client-side animated GIF rendering via embedded modern `gifenc` module.
  - Automatic Netscape 2.0 loop extension headers (`repeat: 0`) for infinite looping.
  - Per-frame dynamic 256-color palette quantization (`rgb565`) for vibrant neon and glitch preservation without color banding.
  - Frame delay normalization protecting against browser timing clamping.
  - GIF-optimized presets: 15 & 24 FPS framerates, 540p, 480p, and 480x480 square aspect ratios.
  - Live progress feedback with frame counts, percentage, and cancellation support.
- **Step-by-Step Frame Movement**:
  - Precision frame-by-frame navigation controls (Backward and Forward) on both the canvas viewport toolbar and timeline navigation bar.
  - Standard NLE keyboard shortcuts: `,` (comma) and `.` (period), or `Left Arrow` and `Right Arrow`.
  - Deterministic time stepping with playhead updates, timecode tracking, glitch state progression, and video layer sync.
- **Instant 1-Click PNG Snapshot**:
  - High-resolution single-frame PNG capture accessible via canvas overlay, timeline action bar, and export wizard.
  - Visual camera shutter screen flash feedback and deterministic full-resolution rendering.

### Fixed
- **Insecure Context UUID Generation**: Replaced `crypto.randomUUID()` with an RFC4122-compliant fallback generator (`generateUUID`) to prevent crashes on non-HTTPS local container and IP setups.
- **UI Overflow**: Resolved control element overlap and border clipping on multi-edge ribbons, bidirectional switches, and beam adjustment sliders.

## [1.15.0] - 2026-10-03

### Fixed
- **Docker image served a 404**: the Dockerfile did not copy `vilecut.html`, `robots.txt` or `sitemap.xml`, so the landing-page redirect led nowhere.

### Performance
- **Glitch effects**: reuse scratch `ImageData` / block-tear buffers instead of allocating every frame; pixel sort now uses a packed numeric sort instead of per-pixel objects and a comparator.
- **Self-hosted fonts**: Outfit and JetBrains Mono are served from `fonts/` (no Google Fonts requests); CSP tightened accordingly.
- **nginx**: gzip, long-lived caching for static assets and basic security headers.

### Chore
- Added `.gitattributes` for consistent line endings.

## [1.14.0] - 2026-07-06

### Rebranded
- **Rebranded from Videomaddness to VileCut**: Renamed all titles, headers, logos, container services, export file prefixes, script logs, and documentation to VileCut.

### Fixed
- **Timeline Video Block Selection**: Upgraded the timeline selection handler to target specific video block IDs (`vid_...`) instead of resolving to a generic boolean flag.
- **XSS Prevention in Timeline Labels**: Refactored block label creation on the timeline to use structured DOM elements (`createTimelineLabel`) instead of unsafe `innerHTML` string interpolations.
- **Camera Rotation Jumping**: Resolved rotational jump issues by accumulating time-based camera rotation with `cameraRotationBase`.
- **Mask Graph Hue Calculation**: Fixed the mask graph renderer to correctly scale using `state.hueTolerance` rather than `B`.

### Refactored
- **Code Cleanups**: Removed unused canvas variables (`textCanvas`/`textCtx`) from the overlays manager.

## [1.13.0] - 2026-07-01

### Fixed
- **Timeline Track Swapping**: Implemented row-level track swapping that works symmetrically regardless of block time overlap.
- **Rendering Visibility Bug**: Fixed overlay drawing visibility by computing the maximum active track dynamically on every frame.
- **Layer ordering bounds**: Restricted Text and Graphic overlays from dropping below Track 1 to prevent them from sliding behind the background image tunnel layer.

### Added
- **Image Tunnel Loop Reference Track**: Introduced a read-only visual timeline track indicating exactly where the background image loops repeat.
- **Full Duration Preset**: Configured newly added Text and Graphic overlays to span the entire duration of the timeline by default.

## [1.12.0] - 2026-06-27

### Security
- **Content-Security-Policy (CSP)**: Added strict CSP meta tag in `index.html`.
- **XSS Mitigation**: Replaced `innerHTML` interpolations with safe DOM nodes or escaped text in `app.js` and `timeline.js` to mitigate cross-site scripting vulnerabilities.

### Optimized
- **Rendering Performance**: Cached filter strings in `renderer.js` and `overlays.js` to avoid redundant and expensive canvas context allocations on every frame.

### Refactored
- **Reactive State Architecture**: Transformed the monolithic mutable state (`state.js`) into a Proxy-based reactive `Store`, automatically notifying subsystems on state changes.
- **Decoupled Engine**: Extracted the core `requestAnimationFrame` render loop from `app.js` into an isolated, event-driven `Engine` (`engine.js`).

## [1.11.0] - 2026-06-13

### Added
- **Flicker & Strobe Glitch Effect**: Added a new glitch style that causes erratic brightness flashing (strobing) when triggered.
- **Highlights Only Flicker**: Added an option to the Flicker effect to exclusively isolate and strobe the brightest pixels (luminance > 150), leaving shadows stable.

### Optimized
- **Rendering & Masking Performance**: Refactored the core renderer and masking engines to eliminate frame-by-frame canvas allocations, reuse cached globals, and implement O(1) single-pass pixel loops. This substantially reduces memory usage and garbage collection stutter.

## [1.10.0] - 2026-06-11

### Added
- **Video Clip Fade In and Fade Out Controls**: Added individual **Fade In** and **Fade Out** duration controls (ranging from 0.0s to 5.0s) inside the Video Settings sidebar panel for active video blocks.
- **Opacity Envelope Modulation**: Smoothly fades background video blocks from/to black and foreground overlay video blocks from/to transparency (revealing underlying layers) at loop boundaries.
- **Exporter & Symmetries Compatibility**: Integrated transitions smoothly into the video processing pipeline, preserving fades across mirror/kaleidoscope modes and ensuring identical, stutter-free fade rendering in MP4/WebM exports.
- **Concurrent Video Seeking**: Enhanced the exporter seek routine to process multiple overlapping active video tracks in parallel, preventing stutters on overlaid tracks.

## [1.9.0] - 2026-06-11

### Added
- **Video Edge Fade / Border Feathering**: Added an **Edge Fade (Feather)** control slider (ranging from 0% to 50%) in the Video Settings section.
- **Feathered Canvas Masks**: Dynamically applies a transparent soft roll-off gradient along video block borders, avoiding harsh bounding box edges when scaled down or panned inside the canvas workspace.

## [1.8.0] - 2026-06-11

### Added
- **Background Video Positioning (Pan Controls)**: Added **X Position (Pan)** and **Y Position (Pan)** slider controls inside the Video Settings sidebar panel (ranging from -100% to +100%).
- **Framing & Aspect Ratio Adjustments**: Allows panning widescreen background videos horizontally and vertically, making it easy to frame focus areas when cropping to high/narrow templates (like Instagram Story 9:16 ratio) or wide formats.
- **Unified Video Effects Integration**: Panned positions apply seamlessly across video mirroring, kaleidoscope symmetries, and color/brightness filters during both live rendering loops and offline high-definition video exports.

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
