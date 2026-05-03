# HEIC Browser Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free, client-side HEIC/HEIF support so the website can load and process HEIC images through the existing preview and export pipeline.

**Architecture:** Keep HEIC support isolated to the image-loading layer. Add a browser-side conversion library include, detect HEIC/HEIF files by MIME and extension, attempt normal loading, and fall back to client-side conversion before handing a decoded image to the existing render/export code.

**Tech Stack:** Vanilla JavaScript, Canvas API, existing frontend pipeline, browser object URLs, client-side `heic2any` conversion library

---

## File Map

- Modify: `index.html`
  - Add the free client-side HEIC conversion library include.
  - Expand file input accept filters if needed.
- Modify: `script.js`
  - Add HEIC detection helpers.
  - Add conversion helpers and integrate them into the image loading path.
  - Keep existing iOS, Android Chrome folder save, desktop ZIP, and mobile share flows unchanged after image decode.
- Verify: `docs/superpowers/specs/2026-04-23-heic-browser-support-design.md`
  - Use as the feature source of truth.

### Task 1: Add HEIC library and file acceptance

**Files:**
- Modify: `index.html`
- Verify: `docs/superpowers/specs/2026-04-23-heic-browser-support-design.md`

- [ ] **Step 1: Add the `heic2any` browser script include**

Insert this script tag in `index.html` before `script.js` loads:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js"></script>
```

Place it after the existing JSZip include so it is available before app initialization.

- [ ] **Step 2: Expand image file acceptance on both file inputs**

Update the `accept` attributes in `index.html` to include HEIC/HEIF extensions:

```html
<input type="file" id="bgInput" multiple accept="image/*,.heic,.heif" />
<input type="file" id="logoInput" accept="image/*,.heic,.heif" />
```

- [ ] **Step 3: Verify HTML changes**

Run: `git diff --check -- index.html`
Expected: no patch formatting errors

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add heic browser library"
```

### Task 2: Add HEIC detection and conversion helpers

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Add a HEIC file detection helper**

Add this helper near the image-loading helpers:

```js
function isHeicFile(file) {
    const fileName = (file && file.name ? file.name : "").toLowerCase();
    const fileType = (file && file.type ? file.type : "").toLowerCase();

    return (
        fileType === "image/heic" ||
        fileType === "image/heif" ||
        fileName.endsWith(".heic") ||
        fileName.endsWith(".heif")
    );
}
```

- [ ] **Step 2: Add a helper that loads an image from a blob or file via object URL**

Add this helper near `loadImage()`:

```js
function loadImageFromBlob(blob, sourceName = "image") {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`Image load failed: ${sourceName}`));
        };

        img.src = url;
    });
}
```

- [ ] **Step 3: Add a HEIC conversion helper**

Add this helper after `loadImageFromBlob()`:

```js
async function convertHeicToJpegBlob(file) {
    const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.9
    });

    if (Array.isArray(converted)) {
        return converted[0];
    }

    return converted;
}
```

- [ ] **Step 4: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add script.js
git commit -m "feat: add heic detection helpers"
```

### Task 3: Integrate HEIC fallback into the image loader

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Refactor `loadImage(file)` to use the new blob loader**

Replace the current `loadImage(file)` implementation with:

```js
async function loadImage(file) {
    try {
        return await loadImageFromBlob(file, file.name);
    } catch (error) {
        if (!isHeicFile(file)) {
            throw error;
        }

        const convertedBlob = await convertHeicToJpegBlob(file);
        return loadImageFromBlob(convertedBlob, file.name);
    }
}
```

This keeps normal images on the current object-URL path and only converts HEIC when native loading fails.

- [ ] **Step 2: Keep the rest of the pipeline unchanged**

Do not change `processImageToBlob()`, `render()`, ZIP export, mobile share, or Android Chrome folder save logic. They should continue receiving a decoded `Image` object from `loadImage()`.

- [ ] **Step 3: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 4: Run whitespace verification**

Run: `git diff --check -- script.js index.html`
Expected: only the existing CRLF warning, no patch formatting errors

- [ ] **Step 5: Commit**

```bash
git add script.js index.html
git commit -m "feat: support heic image loading"
```

### Task 4: Tighten drag/drop acceptance and failure messaging

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Expand drag/drop filtering to accept HEIC/HEIF by extension if MIME is missing**

Add this helper near the drag/drop code:

```js
function isSupportedImageFile(file) {
    return Boolean(
        (file.type && file.type.startsWith('image/')) ||
        isHeicFile(file)
    );
}
```

- [ ] **Step 2: Use the helper in the drop handler**

Replace the drop filter with:

```js
const files = Array.from(e.dataTransfer.files).filter(isSupportedImageFile);
```

- [ ] **Step 3: Keep errors clear for failed HEIC conversion**

In `convertHeicToJpegBlob(file)`, wrap the call in a try/catch and rethrow a clearer message:

```js
async function convertHeicToJpegBlob(file) {
    try {
        const converted = await heic2any({
            blob: file,
            toType: "image/jpeg",
            quality: 0.9
        });

        if (Array.isArray(converted)) {
            return converted[0];
        }

        return converted;
    } catch (error) {
        throw new Error(`HEIC conversion failed: ${file.name}`);
    }
}
```

- [ ] **Step 4: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add script.js
git commit -m "feat: improve heic upload handling"
```

### Task 5: End-to-end verification

**Files:**
- Verify: `index.html`
- Verify: `script.js`
- Verify: `docs/superpowers/specs/2026-04-23-heic-browser-support-design.md`

- [ ] **Step 1: Run final syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 2: Run final whitespace verification**

Run: `git diff --check -- index.html script.js`
Expected: only the existing CRLF warning, no patch formatting errors

- [ ] **Step 3: Review branch state**

Run: `git status --short --branch`
Expected: only intended changes or a clean tree if all task commits are done

- [ ] **Step 4: Manual verification checklist**

Verify these manually:

```text
Desktop Chrome
- JPG/PNG still load normally
- HEIC file loads and previews
- export still works

iPhone / iOS
- regular photos still work
- HEIC-origin files selected from picker load when available

Android Chrome
- regular photos still work
- HEIC file loads if selected
- Android folder save still works after HEIC decode

Mixed batch
- JPG + PNG + HEIC can process together
- errors for corrupted HEIC do not break the rest of the app
```

- [ ] **Step 5: Final commit if verification required any touch-ups**

```bash
git add index.html script.js
git commit -m "chore: finalize heic browser support"
```
