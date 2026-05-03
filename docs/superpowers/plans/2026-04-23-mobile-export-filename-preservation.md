# Mobile Export Filename Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve original source name stems for iOS and Android mobile exports while keeping `.jpg` output extensions and preventing Android file overwrites with ` (1)`, ` (2)` suffixes.

**Architecture:** Extend the existing `script.js` export path with focused filename helpers instead of changing rendering or platform routing. Mobile share and Android folder-save will both derive output names from the selected source files, while Android adds a collision-safe directory write helper.

**Tech Stack:** Plain JavaScript, File System Access API, Web Share API

---

### Task 1: Add mobile export filename helpers

**Files:**
- Modify: `script.js`
- Test: manual verification on iOS and Android mobile flows

- [ ] **Step 1: Write the failing mental test case**

```js
// Input file names
["IMG_1034.HEIC", "holiday.photo.png", "plainjpg.jpg"]

// Expected output names
["IMG_1034.jpg", "holiday.photo.jpg", "plainjpg.jpg"]
```

- [ ] **Step 2: Verify current behavior is wrong**

Run:

```powershell
rg -n "LogoAdder_\\$\\{|LogoAdder_" script.js
```

Expected: mobile export code still uses generated names like `LogoAdder_1.jpg`.

- [ ] **Step 3: Add focused filename helpers**

Add helpers near the existing export helpers in `script.js`:

```js
function getSourceFileStem(file) {
    const sourceName = file && file.name ? file.name : "image";
    const lastDotIndex = sourceName.lastIndexOf(".");

    if (lastDotIndex <= 0) {
        return sourceName;
    }

    return sourceName.slice(0, lastDotIndex);
}

function sanitizeOutputFileStem(stem) {
    return stem
        .replace(/[<>:\"/\\\\|?*]/g, "_")
        .replace(/\s+/g, " ")
        .trim() || "image";
}

function getMobileOutputFileName(file) {
    const safeStem = sanitizeOutputFileStem(getSourceFileStem(file));
    return `${safeStem}.jpg`;
}
```

- [ ] **Step 4: Apply the helper to iOS/mobile share naming**

Update the mobile share export path in `script.js`:

```js
const outputName = getMobileOutputFileName(bgFiles[i]);
const shareFile = new File([outputBlob], outputName, { type: "image/jpeg" });
```

- [ ] **Step 5: Run syntax verification**

Run:

```powershell
node --check script.js
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add script.js
git commit -m "Preserve source names for mobile exports"
```

### Task 2: Make Android folder saves collision-safe

**Files:**
- Modify: `script.js`
- Test: manual verification on Android Chrome folder-save flow

- [ ] **Step 1: Write the failing mental test case**

```js
// Existing directory contains:
["IMG_1034.jpg"]

// New export request:
"IMG_1034.jpg"

// Expected saved name:
"IMG_1034 (1).jpg"
```

- [ ] **Step 2: Verify current behavior can overwrite**

Inspect the current directory write helper in `script.js`:

```js
async function writeBlobToDirectory(directoryHandle, fileName, blob) {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
}
```

Expected: helper always opens the requested name directly and can replace an existing file.

- [ ] **Step 3: Add collision-safe naming helpers**

Add helpers in `script.js`:

```js
function splitOutputFileName(fileName) {
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex <= 0) {
        return { stem: fileName, extension: "" };
    }

    return {
        stem: fileName.slice(0, lastDotIndex),
        extension: fileName.slice(lastDotIndex)
    };
}

function buildNumberedFileName(fileName, index) {
    const { stem, extension } = splitOutputFileName(fileName);
    return index === 0 ? fileName : `${stem} (${index})${extension}`;
}

async function resolveAvailableDirectoryFileName(directoryHandle, fileName) {
    for (let index = 0; index < 10000; index++) {
        const candidateName = buildNumberedFileName(fileName, index);

        try {
            await directoryHandle.getFileHandle(candidateName, { create: false });
        } catch (error) {
            if (error.name === "NotFoundError") {
                return candidateName;
            }

            throw error;
        }
    }

    throw new Error("Could not resolve a unique file name");
}
```

- [ ] **Step 4: Update the Android write path to avoid overwrites**

Change the directory write helper in `script.js`:

```js
async function writeBlobToDirectory(directoryHandle, fileName, blob) {
    const availableFileName = await resolveAvailableDirectoryFileName(directoryHandle, fileName);
    const fileHandle = await directoryHandle.getFileHandle(availableFileName, { create: true });
    const writable = await fileHandle.createWritable();

    await writable.write(blob);
    await writable.close();

    return availableFileName;
}
```

Then update Android export naming:

```js
const fileName = getMobileOutputFileName(bgFiles[i]);
await writeBlobToDirectory(directoryHandle, fileName, outputBlob);
```

- [ ] **Step 5: Run verification**

Run:

```powershell
node --check script.js
git diff --check -- script.js
```

Expected:
- `node --check` has no output
- `git diff --check` reports no code issues aside from existing CRLF warnings if present

- [ ] **Step 6: Commit**

```bash
git add script.js
git commit -m "Avoid Android export filename overwrites"
```

### Task 3: Final verification across mobile flows

**Files:**
- Modify: none
- Test: manual verification on real devices

- [ ] **Step 1: Run local static verification**

Run:

```powershell
node --check script.js
git diff --check -- script.js
git status --short --branch
```

Expected:
- syntax passes
- diff check passes aside from known line-ending warnings
- only intended files are modified

- [ ] **Step 2: Manual iOS verification checklist**

Validate on iPhone:

```text
1. Select images with mixed source types, including HEIC if available
2. Start export
3. Save/share a batch
4. Confirm shared files are named like IMG_1034.jpg instead of LogoAdder_1.jpg
```

- [ ] **Step 3: Manual Android verification checklist**

Validate on Android Chrome:

```text
1. Save one image named IMG_1034.jpg into the chosen folder
2. Export the same source again into the same folder
3. Confirm the second file becomes IMG_1034 (1).jpg
4. Repeat once more and confirm IMG_1034 (2).jpg
```

- [ ] **Step 4: Commit final integrated change**

```bash
git add script.js
git commit -m "Preserve source names in mobile exports"
```
