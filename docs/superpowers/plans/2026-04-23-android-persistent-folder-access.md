# Android Persistent Folder Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the Android Chrome save folder across sessions so the website can reuse the same folder and only reprompt for permission when Chrome requires it.

**Architecture:** Add a small IndexedDB-backed persistence layer for `FileSystemDirectoryHandle` storage and wire it into the existing Android Chrome folder-save branch. The export controller should first try the stored handle, then request permission if needed, and only fall back to the folder picker when restore fails.

**Tech Stack:** Vanilla JavaScript, IndexedDB, File System Access API, existing Android Chrome folder-save export path

---

## File Map

- Modify: `script.js`
  - Add IndexedDB helpers for directory-handle persistence.
  - Add permission-query helpers for restored directory handles.
  - Update the Android Chrome folder-save branch to reuse stored handles.
- Verify: `docs/superpowers/specs/2026-04-23-android-persistent-folder-access-design.md`
  - Use as the behavior source of truth.

### Task 1: Add IndexedDB helpers for directory handle persistence

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Add persistence constants near the other top-level constants**

Add these constants near the existing export constants:

```js
const DIRECTORY_DB_NAME = "logoAdderDirectoryAccess";
const DIRECTORY_STORE_NAME = "handles";
const DIRECTORY_HANDLE_KEY = "androidSaveDirectory";
```

- [ ] **Step 2: Add an IndexedDB opener helper**

Add this helper near the storage/config helpers:

```js
function openDirectoryHandleDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DIRECTORY_DB_NAME, 1);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
                db.createObjectStore(DIRECTORY_STORE_NAME);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
}
```

- [ ] **Step 3: Add save/load/delete helpers for the directory handle**

Add these helpers near `openDirectoryHandleDb()`:

```js
async function savePersistedDirectoryHandle(handle) {
    const db = await openDirectoryHandleDb();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(DIRECTORY_STORE_NAME, "readwrite");
        transaction.objectStore(DIRECTORY_STORE_NAME).put(handle, DIRECTORY_HANDLE_KEY);
        transaction.oncomplete = () => {
            db.close();
            resolve();
        };
        transaction.onerror = () => {
            db.close();
            reject(transaction.error || new Error("Directory handle save failed"));
        };
    });
}

async function loadPersistedDirectoryHandle() {
    const db = await openDirectoryHandleDb();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(DIRECTORY_STORE_NAME, "readonly");
        const request = transaction.objectStore(DIRECTORY_STORE_NAME).get(DIRECTORY_HANDLE_KEY);

        request.onsuccess = () => {
            db.close();
            resolve(request.result || null);
        };
        request.onerror = () => {
            db.close();
            reject(request.error || new Error("Directory handle load failed"));
        };
    });
}

async function clearPersistedDirectoryHandle() {
    const db = await openDirectoryHandleDb();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(DIRECTORY_STORE_NAME, "readwrite");
        transaction.objectStore(DIRECTORY_STORE_NAME).delete(DIRECTORY_HANDLE_KEY);
        transaction.oncomplete = () => {
            db.close();
            resolve();
        };
        transaction.onerror = () => {
            db.close();
            reject(transaction.error || new Error("Directory handle delete failed"));
        };
    });
}
```

- [ ] **Step 4: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

### Task 2: Add permission helpers for restored handles

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Add a helper to query directory permission**

Add this helper near the Android folder-save helpers:

```js
async function queryDirectoryPermission(directoryHandle) {
    if (!directoryHandle || !directoryHandle.queryPermission) {
        return "prompt";
    }

    return directoryHandle.queryPermission({ mode: "readwrite" });
}
```

- [ ] **Step 2: Add a helper to request directory permission**

Add this helper after `queryDirectoryPermission()`:

```js
async function requestDirectoryPermission(directoryHandle) {
    if (!directoryHandle || !directoryHandle.requestPermission) {
        return "denied";
    }

    return directoryHandle.requestPermission({ mode: "readwrite" });
}
```

- [ ] **Step 3: Add a helper to restore the persisted handle into memory**

Add this helper after the permission helpers:

```js
async function restorePersistedAndroidDirectoryHandle() {
    if (androidSaveDirectoryHandle) {
        return androidSaveDirectoryHandle;
    }

    try {
        const handle = await loadPersistedDirectoryHandle();
        if (!handle) {
            return null;
        }

        androidSaveDirectoryHandle = handle;
        return handle;
    } catch (error) {
        return null;
    }
}
```

- [ ] **Step 4: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

### Task 3: Update folder selection and reset logic to persist handles

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Persist the handle after successful folder selection**

Update `requestAndroidSaveDirectory()` so after setting `androidSaveDirectoryHandle`, it also saves the handle:

```js
androidSaveDirectoryHandle = directoryHandle;
await savePersistedDirectoryHandle(directoryHandle);
return directoryHandle;
```

- [ ] **Step 2: Update `resetAndroidFolderSaveState()` to clear both memory and persisted state when explicitly invalidated**

Change it to:

```js
async function resetAndroidFolderSaveState() {
    androidSaveDirectoryHandle = null;

    try {
        await clearPersistedDirectoryHandle();
    } catch (error) {
        // Ignore persistence cleanup failures and continue.
    }
}
```

- [ ] **Step 3: Update callers to await the async reset helper where needed**

Any place that currently calls `resetAndroidFolderSaveState()` because the handle is invalid should become:

```js
await resetAndroidFolderSaveState();
```

- [ ] **Step 4: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

### Task 4: Reuse restored handles before opening the picker

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Update `getAndroidSaveDirectory()` to try persisted handles first**

Replace its logic with:

```js
async function getAndroidSaveDirectory() {
    const restoredHandle = await restorePersistedAndroidDirectoryHandle();

    if (restoredHandle) {
        return restoredHandle;
    }

    return requestAndroidSaveDirectory();
}
```

- [ ] **Step 2: Update `startAndroidChromeFolderExport()` to query and request permission on the restored handle before picker fallback**

Right after obtaining `directoryHandle`, add permission handling:

```js
        let permissionState = await queryDirectoryPermission(directoryHandle);

        if (permissionState !== "granted") {
            ui.progressText.innerText = "Chrome ត្រូវការការអនុញ្ញាតសម្រាប់ថតដែលបានរក្សាទុក";
            permissionState = await requestDirectoryPermission(directoryHandle);
        }

        if (permissionState !== "granted") {
            throw new Error("Stored directory permission denied");
        }
```

- [ ] **Step 3: Change the error path so invalid persisted handles fall back to a new picker cleanly**

In the non-`AbortError` branch of `startAndroidChromeFolderExport()`, do this in order:

```js
        await resetAndroidFolderSaveState();
        ui.progressText.innerText = "សូមជ្រើសថតថ្មីដើម្បីរក្សាទុករូប";
```

Then try once to request a fresh folder by calling `requestAndroidSaveDirectory()` and continuing the Android save path before falling all the way back to ZIP.

The simplest acceptable structure is:
- first failure on restored handle -> clear saved handle -> request a new folder -> retry Android folder export once
- only then fallback to ZIP if the fresh folder path also fails

- [ ] **Step 4: Run syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 5: Run whitespace verification**

Run: `git diff --check -- script.js`
Expected: only the existing CRLF warning, no patch formatting errors

### Task 5: Final verification

**Files:**
- Verify: `script.js`
- Verify: `docs/superpowers/specs/2026-04-23-android-persistent-folder-access-design.md`

- [ ] **Step 1: Run final syntax verification**

Run: `node --check script.js`
Expected: exit code `0`

- [ ] **Step 2: Run final whitespace verification**

Run: `git diff --check -- script.js`
Expected: only the existing CRLF warning, no patch formatting errors

- [ ] **Step 3: Review branch state**

Run: `git status --short --branch`
Expected: only intended `script.js` changes or a clean tree if committed

- [ ] **Step 4: Manual verification checklist**

Verify these manually on Android Chrome:

```text
First run
- choose folder once
- export succeeds

Refresh same session
- export reuses the same folder
- no folder browsing required

Reopen site later
- stored folder is restored when possible
- if Chrome requires permission again, only permission confirmation appears
- if stored handle is invalid, picker appears and a new folder can be chosen

iOS / desktop
- unaffected by the new persistence logic
```
