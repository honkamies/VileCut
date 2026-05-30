# MemPalace Knowledge Profile: Videomaddness Project

This profile contains the verbatim knowledge, architecture, schemas, and configurations of the **Videomaddness** application. It is structured for ingestion into AI long-term memory systems (Wings/Rooms/Drawers).

---

## WING: VIDEOMADDNESS (Project Core)

### ROOM: Overview
*   **Name:** Videomaddness (also referred to as the Chaotic Motion Machine)
*   **Description:** A browser-based web application that parses static images into detail-balanced depth bands (layers) using luminosity and color histograms, and rendering them in an infinite exponential zoom camera tunnel to create seamless loop videos.
*   **Tech Stack:** 
    *   **Frontend:** Pure HTML5 canvas, Vanilla CSS (cybernetic cyan/purple neon theme, glassmorphism), ES6 Javascript modules. No bundler or heavy build tools.
    *   **Video Encoding:** Client-side WebCodecs API (`VideoEncoder`, `AudioEncoder`) + `mp4-muxer.js` for H.264 MP4 export with audio. MediaRecorder (VP9/VP8/H.264) WebM pipeline is used as a fallback.
    *   **Deployment:** Alpine Nginx container setup via Docker/Docker Compose (compatible with Portainer stack deployments).

---

## WING: ARCHITECTURE (Code Schema)

### ROOM: Directory Structure
```
Videomaddness/
├── index.html              # HTML layout, sidebar parameters panel, and bottom timeline
├── style.css               # Neomorphic cyan/purple glassmorphic stylesheet
├── README.md               # Project documentation and features
├── run.bat                 # Windows local server launcher (starts Python/Node HTTP servers)
├── run.sh                  # macOS/Linux local server launcher
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
*   `texts` / `graphics`: Array of overlay timeline elements with parameters (`startTime`, `endTime`, positions, glitches, transitions).
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
1.  **RGB Split**: Shifts the Red channel horizontally to the left by `shift` pixels and the Blue channel to the right, creating colored fringes.
2.  **Pixel Sorting**: Sorts pixels horizontally within random rows based on brightness thresholds.
3.  **Monochrome Conversion**: If `state.glitchMonochrome` is active, loops through the post-processed canvas pixel buffer and performs a weighted grayscale conversion ($Y = 0.299R + 0.587G + 0.114B$), rendering all splits, sorting, and displacement motion in pure high-contrast black-and-white.

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
      videomaddness-modular:
        build: .
        container_name: videomaddness-modular
        ports:
          - "8080:80"
        restart: unless-stopped
    ```
*   **Portainer Stack deployment URL:** Can be loaded via Git Repository build option pointing to standard repository branch URLs.
