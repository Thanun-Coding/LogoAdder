# Safe Script Split, Presets, and Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the large frontend script into focused files, add export quality and output-size presets with the current defaults preserved, and add a lightweight first-run guidance layer without changing the existing Android, iPhone, or desktop workflows.

**Architecture:** Keep the current plain-script runtime model and move existing functions into smaller files grouped by responsibility. Add preset state and guidance state through the existing config/localStorage model so the feature layer sits on top of the current workflows instead of redesigning them.

**Tech Stack:** Static HTML, plain JavaScript, CSS, service worker, Web Worker, JSZip, heic2any

---

### File map

**Create:**
- `app-state.js`
- `summary-ui.js`
- `image-io.js`
- `preview-ui.js`
- `android-save.js`
- `export-flows.js`
- `app.js`

**Modify:**
- `index.html`
- `style.css`
- `sw.js`

### Task 1: Extract shared state and app bootstrap

**Files:**
- Create: `app-state.js`
- Create: `app.js`
- Modify: `index.html`

- [ ] Move DOM references, constants, state variables, config persistence, and app-wide state helpers from `script.js` into `app-state.js`.
- [ ] Keep stable global names for shared state so the rest of the files can use the same runtime model.
- [ ] Move startup wiring and event-handler registration into `app.js`.
- [ ] Update `index.html` to load the new files in deterministic order and stop loading `script.js`.

### Task 2: Extract summary and progress UI helpers

**Files:**
- Create: `summary-ui.js`
- Modify: `index.html`
- Modify: `style.css`

- [ ] Move export summary state and helpers from `script.js` into `summary-ui.js`.
- [ ] Preserve the compact Android in-progress summary and the richer completion summary behavior.
- [ ] Keep the current summary card markup and only extend styling where needed for new preset/guidance UI.

### Task 3: Extract image loading and batch-conversion utilities

**Files:**
- Create: `image-io.js`
- Modify: `sw.js`

- [ ] Move image loading, HEIC conversion, worker-backed batch conversion, canvas/blob helpers, and output-size helpers into `image-io.js`.
- [ ] Keep the preview path on the existing `loadImage()` behavior and keep batch HEIC conversion on the worker-backed path.
- [ ] Preserve the current default export quality and safe pixel cap behavior before preset wiring.

### Task 4: Extract preview and gallery behavior

**Files:**
- Create: `preview-ui.js`

- [ ] Move preview rendering, preview fallback, gallery preview pagination, and navigation helpers into `preview-ui.js`.
- [ ] Keep the hardened `loadCurrentImg()` behavior from the local short-term resilience pass.
- [ ] Preserve all current preview and “Show More” behaviors.

### Task 5: Extract Android save helpers and export flows

**Files:**
- Create: `android-save.js`
- Create: `export-flows.js`

- [ ] Move IndexedDB folder-handle persistence, Android directory permission helpers, and collision-safe directory writing into `android-save.js`.
- [ ] Move Android folder-save export, iPhone share flow, and desktop ZIP export into `export-flows.js`.
- [ ] Keep the existing progress, naming, skip-and-continue, and summary behaviors intact.

### Task 6: Add preset controls and persistence

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app-state.js`
- Modify: `image-io.js`
- Modify: `export-flows.js`
- Modify: `preview-ui.js`

- [ ] Add quality preset UI with `High`, `Balanced`, and `Small File`.
- [ ] Add size preset UI with `Original`, `Large`, `Medium`, and `Small`.
- [ ] Set defaults to `High` and `Original`.
- [ ] Persist preset choices using the existing config storage.
- [ ] Apply preset values consistently across Android, iPhone, ZIP, and preview rendering paths where output dimensions are involved.

### Task 7: Add first-run guidance layer

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app-state.js`
- Modify: `app.js`

- [ ] Add a compact inline first-run guidance panel near the action area.
- [ ] Make guidance content platform-aware for Android Chrome and iPhone.
- [ ] Keep desktop guidance minimal.
- [ ] Add dismiss persistence via `localStorage` with a versioned key.

### Task 8: Clean up, verify, and retain safety constraints

**Files:**
- Delete or retain: `script.js` depending on whether any bootstrap wrappers remain necessary
- Modify: any touched files as needed

- [ ] Remove dead references to the old monolithic script implementation.
- [ ] Run syntax verification on all created/modified JavaScript files.
- [ ] Run diff sanity checks.
- [ ] Manually verify the key workflows still match the spec:
  - Android folder-save flow
  - Android remembered folder flow
  - iPhone share flow
  - desktop ZIP flow
  - HEIC-heavy batch path
  - preview navigation
  - preset persistence
  - first-run guidance dismissal
