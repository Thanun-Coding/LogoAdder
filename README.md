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
- Choose export quality and output size presets.
- Export processed images as a ZIP on desktop.
- Save/share image batches on mobile through the Web Share API.
- Save directly to a selected folder on supported Android Chrome browsers.
- Convert HEIC/HEIF images through `heic2any`.
- Installable PWA with service worker caching.

## Tech Stack

- HTML, CSS, and vanilla JavaScript
- Browser canvas rendering
- PWA manifest and service worker
- Web Worker for HEIC conversion
- `localStorage` and `IndexedDB`
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
- `media-ui.js` - Image loading, HEIC handling, canvas rendering, drag/drop, previews, gallery, and Android folder helpers.
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
