# AGENTS.md

## Project Overview

LogoAdder is a static browser/PWA app for adding a selected logo to one or more images and exporting processed JPEGs. The app runs entirely in the browser. There is no backend service in this repository.

## Tech Stack

- HTML, CSS, and vanilla JavaScript
- Browser canvas for image rendering
- PWA manifest and service worker
- Web Worker for HEIC conversion
- `localStorage` for app config and persisted logo
- `IndexedDB` for persisted Android folder handles
- File System Access API for Android Chrome folder saving
- Web Share API for mobile share/save flow
- JSZip from `vendor/jszip.min.js`
- heic2any from `vendor/heic2any.min.js`
- Google Analytics in `index.html`

## Folder Structure

- `index.html` - Main app markup, controls, script loading, and service worker registration.
- `style.css` - App styling, layout, responsive behavior, and UI states.
- `app-state.js` - Shared DOM references, constants, global state, config persistence, and summary helpers.
- `media-ui.js` - Image loading, HEIC handling, canvas rendering, drag/drop, previews, gallery, and Android folder helpers.
- `export-flows.js` - Android folder export, mobile share export, and desktop ZIP export.
- `app.js` - Startup wiring and event handlers.
- `sw.js` - Service worker cache and update behavior.
- `heic-worker.js` - Worker-side HEIC to JPEG conversion.
- `manifest.webmanifest` - PWA metadata and icons.
- `vendor/` - Third-party browser libraries.
- `icons/` - PWA icons.
- `docs/superpowers/` - Existing implementation plans/specs.
- `script.js` - Legacy/unloaded monolithic script. Check before changing.

## Commands

Install:

```powershell
# None. No package file exists.
```

Run locally:

```powershell
python -m http.server 8000
```

Build:

```powershell
# None. No build pipeline exists.
```

Test:

```powershell
# Unknown. No automated test command is configured.
```

Syntax check:

```powershell
node --check app-state.js
node --check media-ui.js
node --check export-flows.js
node --check app.js
node --check sw.js
node --check heic-worker.js
```

Lint:

```powershell
# Unknown. No lint command is configured.
```

## Coding Conventions

- Plain global scripts, not ES modules.
- Script order matters: `app-state.js`, then `media-ui.js`, then `export-flows.js`, then `app.js`.
- Function and variable names use `camelCase`.
- Constants use `UPPER_SNAKE_CASE`.
- DOM references are grouped in the shared `ui` object.
- User-facing text is mostly Khmer with some English labels.
- Preserve UTF-8 encoding when editing text.
- Large section comments use the existing `SECTOR` style.

## Important Files

- Update `index.html` when adding/removing active scripts or UI elements.
- Update `sw.js` cache entries and cache name when app shell files change.
- Update `manifest.webmanifest` only for PWA metadata/icon changes.
- Treat files in `vendor/` as third-party assets.
- Do not assume `script.js` is active; `index.html` currently loads the split files instead.

## Rules For Making Changes

- Read the active files before editing: `index.html`, `app-state.js`, `media-ui.js`, `export-flows.js`, `app.js`, `style.css`, `sw.js`, and `manifest.webmanifest`.
- Keep changes small and scoped to the requested behavior.
- Preserve desktop ZIP export, mobile share export, and Android Chrome folder-save behavior unless explicitly asked to change them.
- Preserve HEIC/HEIF support.
- Preserve persisted config and logo behavior unless explicitly asked to change storage keys.
- If a cached app-shell file changes, update `CACHE_NAME` in `sw.js`.
- Check browser API compatibility before changing File System Access API, Web Share API, service worker, or worker behavior.

## Things Codex Should Avoid

- Do not add a framework, bundler, package manager, or dependency without explicit approval.
- Do not edit `vendor/` libraries unless explicitly requested.
- Do not remove or bypass the service worker without explicit approval.
- Do not reorder active script tags unless the dependency order has been checked.
- Do not rely on `script.js` without confirming whether it should be restored or removed.
- Do not rewrite Khmer strings through tools that may corrupt encoding.
- Do not make broad refactors while fixing a narrow issue.

## How To Verify Work

Run syntax checks on changed JavaScript files:

```powershell
node --check app-state.js
node --check media-ui.js
node --check export-flows.js
node --check app.js
node --check sw.js
node --check heic-worker.js
```

Manual verification to perform when relevant:

- Select background images.
- Select and persist a logo.
- Change position, margins, size, opacity, quality preset, and output size preset.
- Navigate previews.
- Export as desktop ZIP.
- Test mobile share/save flow.
- Test Android Chrome folder-save flow.
- Test HEIC/HEIF input.
- Check service worker/PWA behavior after cache changes.

