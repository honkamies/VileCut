# VileCut // Danger Zone Engine (Experimental 10-Minute Extended Pipeline)

The **Danger Zone** is an isolated sidecar instance of VileCut configured specifically for high-duration exports (up to 10–15 minutes / 600–900 seconds) without risking stability or bloating memory in the standard production version.

## Key Differences from Standard VileCut

| Feature | Standard VileCut | Danger Zone (`/danger/`) |
| :--- | :--- | :--- |
| **Max Duration** | 60 seconds | **600 seconds (10 minutes)** with preset shortcuts (`30s`, `1m`, `3m`, `5m`, `10m`) |
| **MP4 Muxing Target** | `ArrayBufferTarget` (RAM buffer) | **`FileSystemWritableFileStreamTarget`** (Direct-to-Disk streaming for $\ge 45\text{s}$) with `ArrayBufferTarget` fallback |
| **RAM Footprint (10m)** | OOM Crash (~1.5–2GB buffer) | **$< 50\text{MB}$ RAM** via streamed disk writes |
| **Screen WakeLock** | None | **`navigator.wakeLock` active** during render to prevent sleep/lock |
| **GIF Export Guard** | Permitted up to 60s | **Locked out / Disabled for $> 30\text{s}$** to protect against 60GB+ browser RAM crashes |
| **Render Monitoring** | Frame count & % | Real-time **Encoding Speed (FPS)**, **Estimated Time Remaining (ETA)**, and **Target Stream Mode** |
| **Code Isolation** | Untouched in root directory | 100% self-contained in `/danger/` with its own assets & ES6 modules |

## How to Test

Run the test server from the repository root:
```bash
python3 -m http.server 8080
```

1. **Standard VileCut**: `http://<IP>:8080/vilecut.html` (Original files intact)
2. **Danger Zone Engine**: `http://<IP>:8080/danger/` (Extended engine with Direct-to-Disk & 10m support)
