# Permanent Custom Fonts in VileCut

You can permanently load custom fonts into your VileCut container by placing the font files in this folder and registering them in the configuration file.

## Setup Instructions

1. **Place Font Files**:
   Copy your font files (e.g., `.ttf`, `.otf`, `.woff`, `.woff2`) directly into this `fonts/` directory.
   - For example: `fonts/ShareTechMono-Regular.ttf` or `fonts/Orbitron.ttf`.

2. **Register in `fonts/fonts.json`**:
   Open `fonts/fonts.json` and add your font's display name and file URL.
   ```json
   [
     {
       "name": "Share Tech Mono",
       "url": "fonts/ShareTechMono-Regular.ttf"
     },
     {
       "name": "Orbitron",
       "url": "fonts/Orbitron.ttf"
     }
   ]
   ```

3. **Reload the App**:
   Refresh the page. The app will fetch the JSON config from your server, load the font files, and automatically inject them as selectable options inside the **Font Family** dropdown in the Text Settings sidebar panel!
