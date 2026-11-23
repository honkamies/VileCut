# MemPalace Knowledge Profile: VileCut Project

This profile contains the verbatim knowledge, architecture, schemas, and configurations of the **VileCut** application. It is structured for ingestion into AI long-term memory systems (Wings/Rooms/Drawers).

---

## WING: VILECUT (Project Core)

### ROOM: Overview
*   **Name:** VileCut (also referred to as the Chaotic Motion Machine)
*   **Description:** A browser-based web application that parses static images into detail-balanced depth bands (layers) using luminosity and color histograms, and rendering them in an infinite exponential zoom camera tunnel to create seamless loop videos.
*   **Tech Stack:** 
    *   **Frontend:** Pure HTML5 canvas, Vanilla CSS (cybernetic cyan/purple neon theme, glassmorphism), ES6 Javascript modules. No bundler or heavy build tools.
    *   **Video Encoding:** Client-side WebCodecs API (`VideoEncoder`, `AudioEncoder`) + `mp4-muxer.js` for H.264 MP4 export with audio. MediaRecorder (VP9/VP8/H.264) WebM pipeline is used as a fallback.
    *   **Deployment:** Alpine Nginx container setup via Docker/Docker Compose (compatible with Portainer stack deployments).

---

## WING: ARCHITECTURE (Code Schema)

### ROOM: Directory Structure
```
VileCut/
├── index.html              # HTML layout, sidebar parameters panel, and bottom timeline
├── style.css               # Neomorphic cyan/purple glassmorphic stylesheet
├── README.md               # Project documentation and features
├── run_Windows.bat         # Windows local server launcher (starts Python/Node HTTP servers)
├── run_Mac_Linux.sh        # macOS/Linux local server launcher
├── Dockerfile              # Alpine-Nginx container definition for hosting
├── docker-compose.yml      # Portainer-ready compose stack definition
├── screenshot.png          # Main interface preview image
└── js/                     # ES6 Modules Directory
    ├── app.js              # Main entry module, collapsible sections, and event listeners
    ├── state.js            # Centralized application state object
    ├── ui.js               # DOM selector reference mapping
    ├── utils.js            # Math helpers, font loadings, and color converters
    ├── masking.js          # Histogram analyzer, quantile layer isolation, and edge fades
    ├── glitch.js           # Post-processing pixel sorting and RGB split manager
    ├── audio.js            # Web Audio timeline synchronization nodes
    ├── overlays.js         # Canvas layers drawer (Text & Graphic overlay blocks)
    ├── geometric_fx.js     # Micro-geometric spectral curtains, nodes, and contours
    ├── vhs_fx.js           # Vintage VHS & Analog Camcorder simulation engine
    ├── wizard.js           # Step-by-Step Creation Wizard ("Lähestymistapa") workflow manager
    ├── timeline.js         # Timeline track renderers and drag-to-resize mouse handlers
    ├── exporter.js         # WebCodecs H.264/AAC MP4 & MediaRecorder WebM encoders
    └── mp4-muxer.js        # Modular in-memory H.264/AAC MP4 multiplexer library
```

---

## WING: STATE_SCHEMA (js/state.js)
The central `state` object coordinates data binding:
*   `uploadedImages`: Array of `{ id, name, img, layers: [] }`
*   `activeImageIndex`: Track active loaded image.
*   `layers`: Active rendering stack of `{ canvas, index, initialZ, lastWrapCount, sourceImageId }`.
*   `maskType`: `'adaptive-luminosity'` (default), `'luminosity'`, `'color-range'`, `'random'`.
*   `layerEdgeFade`: Rectangular border soft fade percentage (`0` to `50%`, default `10%`).
*   `zoomSpeed` / `zoomDepth`: Controls speed and exponential zoom spacing.
*   `mirrorMode`: Radial symmetries (`'none'`, `'horizontal'`, `'vertical'`, `'quad'`, `'kaleidoscope'`).
*   `rgbSplit` / `pixelSort` / `depthModulation` / `glitchMonochrome`: Cybernetic Glitch parameters.
*   `texts` / `graphics` / `timelineZoom`: Array of overlay timeline elements, their parameters, and the active horizontal timeline zoom multiplier (`0.15x` to `15.0x`, default `1.0x`).
*   `audioTrack`: Sound track model of `{ fileName, buffer, timelineStart, sourceOffset, duration, volume, peaks }`.
*   `exportFormat`: `'mp4'` (default) or `'webm'`.

---

## WING: ENGINE_LOGIC (Functional Core)

### ROOM: Image Layer Isolation (js/masking.js)
1.  **Histogram Quantiles (`adaptive-luminosity`)**: Computes a luminosity histogram from the input image. Divides the pixel counts into $N$ equal-sized buckets (quantiles) where $N = \text{state.layerCount}$. This ensures each isolated layer contains an equal amount of structural detail.
2.  **Layer Edge Fade (Vignette)**: If `state.layerEdgeFade > 0`, applies a soft vignette to the bounds of the extracted layer. Uses a temporary mask canvas with `globalCompositeOperation = 'destination-in'` drawing radial-like linear gradients at the canvas outer bounds to prevent harsh clipping box lines.

### ROOM: Camera Tunnel Render Engine (js/renderer.js)
Draws the isolated layers in a loop based on time `t`.
*   **Depth Formula**: Each layer $i$ is assigned a depth $z_i(t) = \text{fract}(z_{\text{initial}, i} - t \cdot \text{zoomSpeed})$.
*   **Scale Factor**: $S(z_i) = \text{zoomDepth}^{(z_i - 0.5) \cdot 2.0}$
*   **Auto-Wrapping & Seamless Fades**: Prevents pop-in by smoothly fading layers to `opacity = 0` at the extreme front ($z \approx 1$) and back ($z \approx 0$) bounds using sinusoidal opacity scaling:
    $\text{opacity} = \sin(\pi \cdot z)$.

### ROOM: Cybernetic Glitch & Monochrome FX (js/glitch.js)
1.  **Stackable Glitch Styles**: Integrates multiple checkboxes to apply glitch effects in series:
    *   **RGB Split & Pixel Sorting**: Channel displacement and brightness-based pixel shifting.
    *   **Analog VCR Scanline Sag**: Time-based horizontal sinusoidal offsets on scanlines and random edge tearing.
    *   **Digital Block Tearing**: Localized block translation shifting blocks of pixels in x/y coordinates.
    *   **GPU Liquid Warp**: SVG-turbulence displacement distortion filter applied onto offscreen buffer redraws.
2.  **Random-Pool Triggering**: If `state.glitchStyleRandom` is enabled, glitch triggers randomly select exactly one of the checked styles to spike during a trigger pulse duration, while other active styles remain at their idle slider settings. If disabled, all active styles stack and spike simultaneously during triggers.
3.  **Monochrome Conversion**: If `state.glitchMonochrome` is active, loops through the post-processed canvas pixel buffer and performs a weighted grayscale conversion ($Y = 0.299R + 0.587G + 0.114B$), rendering all splits, sorting, and displacement motion in pure high-contrast black-and-white.

### ROOM: Vintage VHS & Analog Camcorder FX (js/vhs_fx.js)
A zero-allocation, 60 FPS analog video and magnetic tape simulation engine:
1.  **Vertical Jump & V-Hold Slip**: 60Hz micro-jitter (mechanical transport tolerances) and intermittent vertical frame rolls exposing the Vertical Blanking Interval (VBI) bar with sync pulses and head-switch fuzz.
2.  **Tracking Noise & RF Static**: Simulates misaligned helical read heads via bottom head-switching static bar and wandering RF noise bands with horizontal scanline tearing and salt-and-pepper snow.
3.  **Tape Crease / Wrinkle**: Emulates crinkled or folded magnetic tape passing the head drum. Features swept horizontal sinusoidal shear distortion and high-intensity RF loss luma halo flare.
4.  **Wobble & TBC Instability**: Recreates consumer VCR time base errors without TBC. Includes top-of-screen "flag waving" curvature, sinusoidal capstan ripple, and scanline micro-jitter.
5.  **1D Bandwidth Softness**: Recreates ~240-line horizontal luma roll-off while retaining vertical scanline sharpness via GPU-accelerated horizontal downsampling and bilinear reconstruction.
6.  **Chroma Bleed & Color Decays**: Emulates NTSC 629kHz color-under down-conversion and 1H delay line misregistration with horizontal red/blue channel displacement, NTSC 7.5 IRE lifted milky blacks, and vintage cathode phosphor tint.
7.  **CRT Scanlines**: Alternating scanline dimming (`y % 2 === 1`) simulating CRT phosphorus raster lines.
8.  **Retro On-Screen Display (OSD HUD)**: Monospace HUD with drop shadow supporting Camcorder (`REC ●`, battery, date, timecode), VCR Playback (`PLAY ▶`, `SP`, tape counter), Security CCTV (`CAM 04`, clock), and Custom text.
9.  **Curated Presets**: "Camcorder 1994", "Worn VHS 1988", "Damaged Rental Tape", "Subtle Analog Nostalgia", and "Security CCTV 1991".

### ROOM: Step-by-Step Creation Wizard (js/wizard.js)
A guided, user-friendly 7-step onboarding workflow ("lähestymistapa") that walks users through project setup sequentially before entering the multi-panel studio:
1.  **Step 1: Introduction, Capabilities & Client-Side Privacy**: Welcome hero introducing VileCut (Chaotic Motion Machine), what users can achieve (9:16 vertical TikTok/Reels, 16:9 cinema, VHS decays, audio-reactive visualizers), and 100% in-browser client-side execution (GPU/CPU WebCodecs, media files never leave the machine, zero cloud uploads).
2.  **Step 2: Welcome & Project Framing**: Aspect ratio selection cards (`9:16`, `16:9`, `1:1`, `4:5`, `21:9`) with visual card previews and duration presets (3s, 5s standard loop, 10s, 15s, 30s).
3.  **Step 3: Camera Tunnel Core Graphic**: Multi-image batch upload via drag-and-drop or file selector, with instant procedural "Cyber Sigil" celestial mandala generator for 1-click preview without local files. Renders live offscreen 60 FPS deterministic tunnel preview canvas with layer depth (3–16), zoom speed (0.1x–2.0x), and edge feather/fade (0–40%) controls. Dynamically adapts canvas aspect ratio to match user selection.
4.  **Step 4: Overlays, Logos & Canvas Placement**: Live camera tunnel renders in the background by default across the chosen aspect ratio canvas. Supports transparent PNG logos/stickers with interactive **click-and-drag manual positioning** on the canvas, corner drag handles, dashed bounding box, preset placement buttons, dedicated **Horizontal (X) and Vertical (Y) coordinate offset sliders** (-50% to +50%), scale slider (20%–150%), and blend modes (`normal`, `screen`, `multiply`, `overlay`, `color-dodge`). Mentions that unlimited additional graphic/video layers can be added in the main editor.
5.  **Step 5: Music & Soundtrack**: Audio upload (MP3, WAV, OGG, AAC) with live waveform analyzer canvas rendering peaks in real time, and auto-match project duration toggle. Optional step.
6.  **Step 6: Typography & Title Card**: Live camera tunnel renders in the background of the typography canvas matching the chosen aspect ratio. Features direct **Custom Font Upload** (`.ttf`, `.otf`, `.woff`, `.woff2`) via `FontFace` API with studio persistence, **Text / Lyrics File Import** (`.lrc`, `.txt`), **Font Size slider** (20px–80px), **Cyber Glow Radius slider** (0px–50px), cyberpunk neon glow style presets (`Neon Cyan`, `Hot Pink`, `Pure White`), placement (Top, Center, Bottom), and font family selection. Mentions that unlimited text and lyrics tracks can be added in the main editor.
7.  **Step 7: Review & Launch**: Dynamic summary overview of all configured elements and a prominent "Launch VileCut Studio & Start Playing" action button that commits all state, isolated layer slices, graphics, audio, and typography directly to the timeline, opens the canvas, and begins 60 FPS playback.
8.  **UX Integration**: Interactive stepper indicators (1 through 7) for immediate jumping between steps, main studio interactive canvas click-and-drag positioning, header launch button (`#btn-open-wizard`) with subtle pulsing glow, automatic launch on first visit or query parameter trigger (`?wizard=1` or `?mode=wizard`), with `sessionStorage` dismissal memory and `Skip Wizard (Open Studio)` option. Full keyboard accessibility (Escape to dismiss). Dynamic aspect-ratio synchronization across Step 3, Step 4, and Step 6 preview canvases.

### ROOM: Timeline Zooming & Scaling (js/timeline.js)
1.  **Dynamic Pixels Per Second**: Sets layout scaling factor `pixelsPerSecond = 30 * state.timelineZoom`. All timeline blocks, playhead, and tick offsets are drawn in percentages relative to the duration `dur` so they automatically stretch/shrink smoothly inside the container.
2.  **Dynamic Tick Intervals**: Ticks on the timeline ruler dynamically recalculate spacing depending on zoom (ranging from fine `0.1s` marks at high magnification to macro `10.0s` segments when zoomed out).
3.  **Interactive Control**:
    *   **Drag to Zoom**: Mouse movement tracks horizontal delta (`dx`) on mousedown, mapping it to a clamped zoom range of `0.15x` to `15.0x`.
    *   **Fit Screen**: Solves target pixels-per-second: `targetPps = (wrapper.clientWidth - 8) / dur`, setting the zoom scale so the loop duration perfectly spans the timeline body width with no scrolling necessary.

### ROOM: H.264/AAC MP4 Export (js/exporter.js)
Bypasses real-time captures using sequential frame-by-frame offline encoding:
1.  **Resolution Safe bounds**: Forces `resW` and `resH` to even numbers (essential for hardware-accelerated H.264 WebCodecs).
2.  **Soundtrack Offline Rendering**: Schedules the timeline `state.audioTrack` in an `OfflineAudioContext` for the exact video duration, generating a high-quality PCM resampled buffer.
3.  **Encoders**:
    *   `VideoEncoder`: Configured with `avc1.4d002a` (H.264 Main Profile Level 4.2). Enforces backpressure rate-limiting (`videoEncoder.encodeQueueSize > 4`) to prevent browser out-of-memory.
    *   `AudioEncoder`: Configured with `mp4a.40.2` (AAC-LC) encoding Float32 planar buffers in chunks of 1024 frames.
4.  **Muxer**: Instantiates `Muxer` from `mp4-muxer.js` to combine encoded audio and video chunks in memory (`ArrayBufferTarget`), compiling them directly to `.mp4` container bytes on completion.

---

## WING: RESET_SCHEMA (Phase 10 Header Actions)

### ROOM: Reload vs Reset
*   **App Reload (`#btn-reload-app`)**: Re-loads the browser window (`location.reload()`), flushing all cached media buffers, uploaded files, and state variables to start fresh.
*   **Reset Settings (`#btn-reset-settings-only`)**: Reverts all settings parameters (sliders, options, text/graphic overlays, and soundtracks) to defaults, but **keeps the uploaded images deck intact**. It automatically runs `ImageProcessor.reprocessAllImagesLayers()` to regenerate the active image layer stacks with the default mask settings so the user's session remains open.

---

## WING: DEPLOYMENT (Docker & Portainer stack)

### ROOM: Container Recipe
*   **Dockerfile**:
    ```dockerfile
    FROM nginx:alpine
    COPY . /usr/share/nginx/html
    EXPOSE 80
    ```
*   **docker-compose.yml**:
    ```yaml
    version: '3.8'
    services:
      vilecut-modular:
        build: .
        container_name: vilecut-modular
        ports:
          - "8080:80"
        restart: unless-stopped
    ```
*   **Portainer Stack deployment URL:** Can be loaded via Git Repository build option pointing to standard repository branch URLs.
