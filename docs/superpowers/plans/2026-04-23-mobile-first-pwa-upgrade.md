# Mobile-First PWA Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app installable and more app-like on mobile without changing the existing workflow or export logic.

**Architecture:** Add a minimal PWA shell around the current app: manifest, icons, service worker, service worker registration, and small standalone-mode polish. Keep all current UI flows and processing logic intact.

**Tech Stack:** Static HTML/CSS/JS, Web App Manifest, Service Worker, cached app shell assets

---

## File Map

- Modify: `index.html`
  - Add manifest and theme metadata.
  - Add service worker registration.
  - Add Apple install metadata.
- Modify: `style.css`
  - Add only lightweight standalone/mobile-safe polish if needed.
- Create: `manifest.webmanifest`
  - PWA metadata and icon references.
- Create: `sw.js`
  - App shell caching.
- Create: `icons/icon-192.png`
  - Mobile install icon.
- Create: `icons/icon-512.png`
  - Mobile install icon.
- Create: `icons/icon-maskable-512.png`
  - Optional maskable icon for Android.

## Tasks

### Task 1: Add icons and manifest
- Create square branded icons from the existing `LogoAdder.png` asset.
- Add `manifest.webmanifest` with `standalone` display, theme color, start URL `/LogoAdder/`, portrait orientation, and icon entries.
- Verify manifest paths match GitHub Pages hosting.

### Task 2: Add service worker
- Create `sw.js` with versioned cache name.
- Cache app shell assets: `index.html`, `style.css`, `script.js`, `LogoAdder.png`, `myicon.ico`, `manifest.webmanifest`, generated icons.
- Use a simple cache-first app-shell strategy and clear old caches on activate.

### Task 3: Wire PWA metadata into the app shell
- Update `index.html` to include manifest link, theme color, Apple mobile web app metadata, and touch icon links.
- Register the service worker after the existing scripts.
- Keep the current app logic unchanged.

### Task 4: Add mobile-first standalone polish
- Add minimal CSS only if needed for standalone mode and safe-area spacing.
- Do not change the workflow, desktop layout, or button order.

### Task 5: Verification
- Run syntax/whitespace checks.
- Confirm files are created and referenced correctly.
- Provide a manual test list for Android Chrome and iPhone home-screen install.
