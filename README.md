# LogoAdder

LogoAdder is a static browser/PWA app for adding a selected logo to one or more images and exporting processed JPEG files. It runs fully in the browser with no backend service.

Live site:

```text
https://thanun-coding.github.io/LogoAdder/
```

## Features

- Add a logo to single or multiple images.
- Preview logo placement on a canvas.
- Adjust logo position, margins, size, and opacity.
- Adjust each photo with brightness, contrast, highlights, shadows, saturation, and temperature controls.
- Use `Auto Current` to auto-adjust the current photo or `Auto All` to auto-adjust each selected photo individually.
- Rotate photos with a 90-degree rotate button or fine-angle slider.
- Automatically smart-crop fine rotations to reduce empty corners.
- Crop photos with draggable crop handles.
- Navigate the preview with on-screen controls or keyboard shortcuts.
- Choose export quality and output size presets.
- Export processed images as a ZIP on desktop.
- Save/share image batches on mobile through the Web Share API.
- Save directly to a selected folder on supported Android Chrome browsers.
- Convert HEIC/HEIF images through a worker-backed HEIC flow.
- Installable PWA with service worker caching.

## Keyboard Shortcuts

- `A` or `Arrow Left` - previous preview photo.
- `D` or `Arrow Right` - next preview photo.

## Tech Stack

- HTML, CSS, and vanilla JavaScript
- Browser canvas rendering
- PWA manifest and service worker
- Web Worker for HEIC conversion
- `localStorage` and `IndexedDB`
- File System Access API for supported Android Chrome folder saving
- Web Share API for mobile share/save flow
- JSZip from `vendor/jszip.min.js`
- heic2any from `vendor/heic2any.min.js`

## Run Locally

No install step is required.

Start a local static server from the project root:

```powershell
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## Build And Test

There is no build pipeline and no automated test command configured.

Syntax-check JavaScript files with:

```powershell
node --check app-state.js
node --check media-ui.js
node --check export-flows.js
node --check app.js
node --check sw.js
node --check heic-worker.js
```

## Project Structure

- `index.html` - Main app markup, controls, script loading, and service worker registration.
- `style.css` - Layout, responsive styling, controls, preview, progress, and gallery styles.
- `app-state.js` - Shared DOM references, constants, state, config persistence, and summary helpers.
- `media-ui.js` - Image loading, HEIC handling, canvas rendering, photo adjustments, rotate/crop tools, drag/drop, previews, gallery, and Android folder helpers.
- `export-flows.js` - Android folder export, mobile share export, and desktop ZIP export.
- `app.js` - Startup wiring and UI event handlers.
- `sw.js` - Service worker cache and update behavior.
- `heic-worker.js` - Worker-side HEIC to JPEG conversion.
- `manifest.webmanifest` - PWA metadata.
- `vendor/` - Third-party browser libraries.
- `icons/` - PWA icons.
- `docs/superpowers/` - Existing implementation plans and specs.

## Deployment

The app can be hosted directly on GitHub Pages from the repository root.

GitHub Pages settings:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/root`

## Development Notes

- Active scripts are plain global scripts. Script order matters:
  `app-state.js`, `media-ui.js`, `export-flows.js`, then `app.js`.
- If cached app-shell files change, update `CACHE_NAME` in `sw.js`.
- Keep `vendor/` files treated as third-party assets.
- Preserve UTF-8 encoding because user-facing text includes Khmer.
- Photo adjustments are per-photo session state and are not saved into persisted config.
- Desktop ZIP export, mobile share export, and Android folder-save should be manually checked after changes to rendering or export behavior.
- Service worker cache is currently `logoadder-shell-v15`.
