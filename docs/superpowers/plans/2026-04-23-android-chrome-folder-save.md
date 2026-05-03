# Android Chrome Folder Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Android Chrome-specific folder-save export path that writes processed JPEG files into a user-chosen folder while keeping iOS Web Share and desktop ZIP export unchanged.

**Architecture:** Extend the existing export controller with one narrow Android Chrome branch guarded by platform and File System Access capability checks. Reuse the current batch-processing pipeline and progress UI, but route Android Chrome output through directory/file handles instead of Web Share or ZIP creation.

**Tech Stack:** Vanilla JavaScript, Canvas API, File System Access API (`showDirectoryPicker`, `FileSystemDirectoryHandle`, `createWritable`), existing JSZip fallback path, HTML/CSS frontend

---

## File Map

- Modify: `script.js`
  - Add Android Chrome detection helpers.
  - Add File System Access capability helpers.
  - Add Android directory-handle state and folder-save export controller.
  - Keep existing iOS Web Share, desktop ZIP, and Android fallback behavior intact.
- Modify: `style.css`
  - Add any minimal Android-only helper styles only if the existing button/progress layout needs a small tweak.
- Verify: `docs/superpowers/specs/2026-04-23-android-chrome-folder-save-design.md`
  - Use as the behavior source of truth while implementing.

### Task 1: Add Android Chrome capability helpers and state

**Files:**
- Modify: `script.js`
- Verify: `docs/superpowers/specs/2026-04-23-android-chrome-folder-save-design.md`

- [ ] **Step 1: Add Android Chrome runtime state near the existing export state**

Add one new in-memory handle and keep it scoped with the other export globals:

```js
let androidSaveDirectoryHandle = null;
```

Place it with the other top-level state values near `mobileShareState` and `renderedPreviewCount`.

- [ ] **Step 2: Add a narrow Android Chrome detector**

Add this helper near the existing platform helpers in `script.js`:

```js
function isAndroidChrome() {
    const userAgent = navigator.userAgent || "";
    const isAndroid = /Android/i.test(userAgent);
    const isChromium = /Chrome\//i.test(userAgent) || /CriOS/i.test(userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);

    return isAndroid && isChromium && !isIOS;
}
```

- [ ] **Step 3: Add File System Access capability detection**

Add this helper next to `isAndroidChrome()`:

```js
function canUseAndroidFolderSave() {
    return Boolean(
        isAndroidChrome() &&
        window.showDirectoryPicker &&
        window.FileSystemFileHandle &&
        window.FileSystemDirectoryHandle
    );
}
```

- [ ] **Step 4: Add a helper to reset Android folder-save session state when needed**

Add this helper near the other reset helpers:

```js
function resetAndroidFolderSaveState() {
    androidSaveDirectoryHandle = null;
}
```

Do not call it everywhere yet. This task only introduces the helper.

- [ ] **Step 5: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 6: Commit**

```bash
git add script.js
git commit -m "feat: add android chrome save capability checks"
```

### Task 2: Add directory picker and file-writing helpers

**Files:**
- Modify: `script.js`
- Verify: `docs/superpowers/specs/2026-04-23-android-chrome-folder-save-design.md`

- [ ] **Step 1: Add a directory picker helper that prefers Pictures**

Add this helper near the file/export helpers:

```js
async function requestAndroidSaveDirectory() {
    const directoryHandle = await window.showDirectoryPicker({
        id: "logoadder-android-save",
        mode: "readwrite",
        startIn: "pictures"
    });

    androidSaveDirectoryHandle = directoryHandle;
    return directoryHandle;
}
```

- [ ] **Step 2: Add a helper that returns the active writable directory handle**

Add this helper after `requestAndroidSaveDirectory()`:

```js
async function getAndroidSaveDirectory() {
    if (androidSaveDirectoryHandle) {
        return androidSaveDirectoryHandle;
    }

    return requestAndroidSaveDirectory();
}
```

- [ ] **Step 3: Add a file-writing helper for processed JPEG blobs**

Add this helper near the download/save helpers:

```js
async function writeBlobToDirectory(directoryHandle, fileName, blob) {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    await writable.write(blob);
    await writable.close();
}
```

- [ ] **Step 4: Add a message helper for Android save completion**

Add a small helper that updates progress text consistently:

```js
function showAndroidSaveComplete(count) {
    ui.progressText.innerText = `រួចរាល់! បានរក្សាទុក ${count} រូប`;
}
```

- [ ] **Step 5: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 6: Commit**

```bash
git add script.js
git commit -m "feat: add android directory save helpers"
```

### Task 3: Route Android Chrome export into folder-save flow

**Files:**
- Modify: `script.js`
- Verify: `docs/superpowers/specs/2026-04-23-android-chrome-folder-save-design.md`

- [ ] **Step 1: Add an Android Chrome export controller**

Add this function near `startMobileShareFlow()` and `startZipExport()`:

```js
async function startAndroidChromeFolderExport(btn) {
    const offCanvas = document.createElement('canvas');

    try {
        const directoryHandle = await getAndroidSaveDirectory();

        for (let i = 0; i < bgFiles.length; i++) {
            const { outputBlob, previewBlob } = await processImageToBlob(bgFiles[i], offCanvas);
            const fileName = `LogoAdder_${i + 1}.jpg`;

            addResultPreview(previewBlob);
            await writeBlobToDirectory(directoryHandle, fileName, outputBlob);
            updateExportProgress(i + 1, bgFiles.length);
            await yieldToBrowser();
        }

        resetCanvas(offCanvas);
        setPrimaryButtonState(false, "ចាប់ផ្តើមជាថ្មី!");
        zipContainer.style.display = "none";
        showAndroidSaveComplete(bgFiles.length);
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        resetCanvas(offCanvas);

        if (error.name === "AbortError") {
            setPrimaryButtonState(false, "ចាប់ផ្ដើមដំណើរការ");
            ui.progressText.innerText = "បានបោះបង់ការជ្រើសថត";
            return;
        }

        resetAndroidFolderSaveState();
        await startZipExport(btn, { chunked: true });
    }
}
```

- [ ] **Step 2: Route the main export button through Android Chrome first**

Update the main export handler branch order in `script.js` so it becomes:

```js
ui.downloadBtn.onclick = async () => {
    if (bgFiles.length === 0 || !logoImg) return alert("សូមជ្រើសរើសរូបភាព និង Logo!");

    const btn = ui.downloadBtn;
    setPrimaryButtonState(true, "កំពុងរៀបចំ...");
    resetExportState();

    if (canUseAndroidFolderSave()) {
        await startAndroidChromeFolderExport(btn);
        return;
    }

    if (isMobileDevice() && navigator.share && navigator.canShare) {
        await startMobileShareFlow(btn);
        return;
    }

    await startZipExport(btn, { chunked: false });
};
```

This preserves iOS and desktop behavior while letting Android Chrome take the new path.

- [ ] **Step 3: Add Android fallback progress text before routing to ZIP fallback**

In the non-abort error branch of `startAndroidChromeFolderExport()`, add one line before fallback:

```js
ui.progressText.innerText = "កំពុងប្តូរទៅការទាញយកជំនួស...";
```

This makes the Android fallback visible instead of feeling like a silent mode switch.

- [ ] **Step 4: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 5: Run whitespace verification**

Run: `git diff --check -- script.js`
Expected: only the existing CRLF warning, no patch formatting errors

- [ ] **Step 6: Commit**

```bash
git add script.js
git commit -m "feat: add android chrome folder export"
```

### Task 4: Tighten Android UX messaging and fallback behavior

**Files:**
- Modify: `script.js`
- Modify: `style.css` (only if needed)

- [ ] **Step 1: Add a one-time Android folder prompt message before the picker opens**

In `startAndroidChromeFolderExport()`, before `getAndroidSaveDirectory()`, add:

```js
ui.progressText.innerText = "សូមជ្រើសថតក្នុង Pictures ដើម្បីរក្សាទុករូប";
```

- [ ] **Step 2: Make cancel restore a clean idle state**

In the `AbortError` branch, ensure the completion/download controls are hidden and the button state is reset:

```js
zipContainer.style.display = "none";
setPrimaryButtonState(false, "ចាប់ផ្ដើមដំណើរការ");
ui.progressCount.innerText = `0 / ${bgFiles.length}`;
ui.progressFill.style.width = "0%";
```

- [ ] **Step 3: Ensure ZIP fallback still exposes downloads properly on Android failure**

Verify the fallback call remains:

```js
await startZipExport(btn, { chunked: true });
```

Do not change this to desktop single-ZIP behavior.

- [ ] **Step 4: Add CSS only if button text wraps badly**

If the existing controls clip Android-specific text, add a minimal style tweak in `style.css`:

```css
.primary-btn,
.secondary-btn,
.show-more-btn {
  white-space: normal;
  line-height: 1.25;
}
```

Only add this if actual rendering requires it.

- [ ] **Step 5: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 6: Run whitespace verification**

Run: `git diff --check -- script.js style.css`
Expected: only the existing CRLF warning, no patch formatting errors

- [ ] **Step 7: Commit**

```bash
git add script.js style.css
git commit -m "feat: improve android folder save ux"
```

### Task 5: End-to-end verification

**Files:**
- Verify: `script.js`
- Verify: `style.css`
- Verify: `docs/superpowers/specs/2026-04-23-android-chrome-folder-save-design.md`

- [ ] **Step 1: Run final static verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 2: Run final whitespace verification**

Run: `git diff --check -- script.js style.css`
Expected: only the existing CRLF warning, no patch formatting errors

- [ ] **Step 3: Review branch state**

Run: `git status --short --branch`
Expected: only intended changes for `script.js` and optionally `style.css`, or a clean tree if all task commits are done

- [ ] **Step 4: Manual browser verification checklist**

Verify these manually:

```text
iOS Safari / iPhone
- 10-photo Web Share still opens native save/share flow
- no folder picker appears

Desktop Chrome
- export still produces one ZIP
- ZIP button still works

Android Chrome
- export asks for a target folder
- picker starts from or near Pictures when supported
- selected folder receives LogoAdder_1.jpg, LogoAdder_2.jpg, etc.
- progress updates through the batch
- cancellation restores the UI cleanly
- write failure falls back to chunked ZIP download path
```

- [ ] **Step 5: Final commit if verification required any touch-ups**

```bash
git add script.js style.css
git commit -m "chore: finalize android chrome folder save"
```
