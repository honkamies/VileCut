# Videomaddness // Chaotic Motion Machine

A standalone browser-based web application designed to transform static images into infinite-diving, depth-sliced video loops. Perfect for generating hypnotic, symmetrical backgrounds and glitches for social media layouts.

---

## Features
- **Adaptive Luminosity Slicing**: Automatically splits images into distinct, detail-balanced depth bands using pixel-count histograms.
- **Layer Inspector Preview**: Live visual card with custom backgrounds (Checkerboard, Black, White, Magenta) to examine isolated mask details.
- **Infinite Diving Engine**: Exponential zoom camera tunnel ($S(z) = d^{(z - 0.5) \cdot 2.0}$) creating true depth perspective.
- **Aspect Ratio Selector**: Instantly crop and scale frames for social media ratios (**9:16 Portrait**, **1:1 Square**, **4:5 Feed**, **16:9 Landscape**, **21:9 Cinema**).
- **Cybernetic Glitch FX**: Post-process RGB channel splitting, horizontal pixel-sorting, and screen shaking (switched off by default).
- **Exporting Engine**: Frame-by-frame deterministic WebM exporter. Generates full quality mobile portrait videos ($1080 \times 1920$) or landscape formats.

---

## Local Usage
Since this is a client-side HTML5/JS application, there are no build steps required:
1. Double-click `index.html` to open the editor directly in your web browser.
2. Drag and drop your images or browse to select files.

---

## Docker Stack Deployment (Portainer.io)

This project is packaged with a lightweight `Dockerfile` and a `docker-compose.yml` stack definition, allowing it to be served via an Nginx container inside Portainer.

### Method 1: Deploy as a Portainer Stack (Recommended)
1. Push this folder to your personal **GitHub** repository.
2. Log into your **Portainer.io** panel.
3. Go to **Stacks** > **Add stack**.
4. Set a name (e.g., `videomaddness`).
5. Choose **Build method** > **Repository**.
6. Enter your GitHub Repository URL (e.g. `https://github.com/yourusername/videomaddness`).
7. Leave **Repository reference** as `refs/heads/main` (or your active branch).
8. Ensure **Compose path** is set to `docker-compose.yml`.
9. Click **Deploy the stack**. Portainer will pull the code, build the Nginx container, and launch the service.
10. Open `http://<your-server-ip>:8080` in your web browser to use the app!

### Method 2: Deploy Locally via CLI
If you want to run the Docker stack on your host computer:
```bash
# Build and run the stack in the background
docker-compose up -d --build
```
The application will be available at `http://localhost:8080`.

---

## Repository Contents
- `index.html` - Application layout and user controls.
- `style.css` - Neomorphic cyan/purple glassmorphic stylesheet.
- `app.js` - Slicing, rendering, and WebM capture logic.
- `Dockerfile` - Alpine-based Nginx container definition.
- `docker-compose.yml` - Portainer-compatible compose stack file.
- `.gitignore` - Standard gitignore configurations.
