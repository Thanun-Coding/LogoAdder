// SECTOR 3: IMAGE HANDLING & DRAG-DROP
// ==========================================
function rejectPendingHeicBatchWorkerRequests(error) {
    pendingHeicBatchWorkerRequests.forEach(({ reject }) => reject(error));
    pendingHeicBatchWorkerRequests.clear();
}

function getHeicWorkerPoolSize() {
    if (isMobileDevice()) {
        return 1;
    }

    return (navigator.hardwareConcurrency || 2) >= 4 ? 2 : 1;
}

function resetHeicWorkerPool(error) {
    heicBatchWorkers.forEach((worker) => {
        try {
            worker.terminate();
        } catch (terminateError) {
            // Ignore worker cleanup failures.
        }
    });

    heicBatchWorkers = [];
    heicBatchWorkerIndex = 0;
    rejectPendingHeicBatchWorkerRequests(error);
}

function createHeicBatchWorker() {
    const worker = new Worker("./heic-worker.js");

    worker.onmessage = (event) => {
        const { id, ok, blob, error } = event.data || {};
        const pendingRequest = pendingHeicBatchWorkerRequests.get(id);

        if (!pendingRequest) {
            return;
        }

        pendingHeicBatchWorkerRequests.delete(id);

        if (ok) {
            pendingRequest.resolve(blob);
            return;
        }

        pendingRequest.reject(new Error(error || "HEIC worker conversion failed"));
    };

    worker.onerror = () => {
        resetHeicWorkerPool(new Error("HEIC worker failed"));
    };

    return worker;
}

function getHeicBatchWorker() {
    if (!window.Worker) {
        return null;
    }

    const poolSize = getHeicWorkerPoolSize();

    while (heicBatchWorkers.length < poolSize) {
        heicBatchWorkers.push(createHeicBatchWorker());
    }

    if (heicBatchWorkers.length === 0) {
        return null;
    }

    const worker = heicBatchWorkers[heicBatchWorkerIndex % heicBatchWorkers.length];
    heicBatchWorkerIndex = (heicBatchWorkerIndex + 1) % heicBatchWorkers.length;
    return worker;
}

const optionalScriptLoads = {};

function loadOptionalScript(src, globalName) {
    if (window[globalName]) {
        return Promise.resolve(window[globalName]);
    }

    if (optionalScriptLoads[src]) {
        return optionalScriptLoads[src];
    }

    optionalScriptLoads[src] = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            if (window[globalName]) {
                resolve(window[globalName]);
                return;
            }

            delete optionalScriptLoads[src];
            reject(new Error(`Optional script loaded without ${globalName}: ${src}`));
        };
        script.onerror = () => {
            delete optionalScriptLoads[src];
            reject(new Error(`Optional script failed to load: ${src}`));
        };
        document.head.appendChild(script);
    });

    return optionalScriptLoads[src];
}

function ensureHeic2AnyLoaded() {
    return loadOptionalScript("./vendor/heic2any.min.js", "heic2any");
}

function ensureJSZipLoaded() {
    return loadOptionalScript("./vendor/jszip.min.js", "JSZip");
}

function loadImage(file) {
    return loadImageFromBlob(file, file.name).catch(async (error) => {
        if (!isHeicFile(file)) {
            throw error;
        }

        const convertedBlob = await convertHeicToJpegBlobWithCache(file);
        return loadImageFromBlob(convertedBlob, file.name);
    });
}

function isHeicFile(file) {
    const fileName = file && file.name ? file.name.toLowerCase() : "";
    const fileType = file && file.type ? file.type.toLowerCase() : "";

    return (
        fileType === "image/heic" ||
        fileType === "image/heif" ||
        fileName.endsWith(".heic") ||
        fileName.endsWith(".heif")
    );
}

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

async function convertHeicToJpegBlob(file) {
    try {
        await ensureHeic2AnyLoaded();
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

async function convertHeicToJpegBlobInWorkerUncached(file) {
    const worker = getHeicBatchWorker();

    if (!worker) {
        return convertHeicToJpegBlob(file);
    }

    return new Promise((resolve, reject) => {
        const requestId = ++heicBatchWorkerRequestId;
        pendingHeicBatchWorkerRequests.set(requestId, { resolve, reject });
        worker.postMessage({ id: requestId, file });
    }).catch(async (error) => {
        if (error && error.message === "HEIC worker failed") {
            return convertHeicToJpegBlob(file);
        }

        throw error;
    });
}

function convertHeicToJpegBlobWithCache(file) {
    if (!heicConversionCache.has(file)) {
        const conversionPromise = convertHeicToJpegBlobInWorkerUncached(file).catch((error) => {
            heicConversionCache.delete(file);
            throw error;
        });

        heicConversionCache.set(file, conversionPromise);
    }

    return heicConversionCache.get(file);
}

function loadBatchImage(file) {
    return loadImageFromBlob(file, file.name).catch(async (error) => {
        if (!isHeicFile(file)) {
            throw error;
        }

        const convertedBlob = await convertHeicToJpegBlobWithCache(file);
        return loadImageFromBlob(convertedBlob, file.name);
    });
}

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

function isSupportedImageFile(file) {
    return Boolean(
        (file.type && file.type.startsWith('image/')) ||
        isHeicFile(file)
    );
}

function getOutputSize(width, height) {
    const maxOutputPixels = getCurrentMaxOutputPixels();
    const pixels = width * height;
    if (pixels <= maxOutputPixels) return { width, height };

    const scale = Math.sqrt(maxOutputPixels / pixels);
    return {
        width: Math.round(width * scale),
        height: Math.round(height * scale)
    };
}

function canvasToJpegBlob(targetCanvas, quality = 0.85) {
    return new Promise((resolve, reject) => {
        targetCanvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas export failed"));
        }, "image/jpeg", quality);
    });
}

async function canvasToThumbnailBlob(sourceCanvas) {
    const maxThumbWidth = 360;
    const scale = Math.min(1, maxThumbWidth / sourceCanvas.width);
    const thumbCanvas = document.createElement('canvas');

    thumbCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    thumbCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
    thumbCanvas
        .getContext('2d')
        .drawImage(sourceCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

    const blob = await canvasToJpegBlob(thumbCanvas, 0.7);
    resetCanvas(thumbCanvas);

    return blob;
}

function yieldToBrowser(delayMs = 0) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function cleanupObjectUrls(urls) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.length = 0;
}

function resetCanvas(targetCanvas) {
    const targetCtx = targetCanvas.getContext('2d');
    targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    targetCanvas.width = 0;
    targetCanvas.height = 0;
}

function downloadBlobUrl(url, fileName) {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function scheduleUrlRevoke(url) {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

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
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/\s+/g, " ")
        .trim() || "image";
}

function getMobileOutputFileName(file) {
    const safeStem = sanitizeOutputFileStem(getSourceFileStem(file));
    return `${safeStem}.jpg`;
}

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

function normalizeDirectoryName(fileName) {
    return fileName.toLowerCase();
}

async function collectExistingDirectoryFileNames(directoryHandle) {
    const existingNames = new Set();

    for await (const [entryName, entryHandle] of directoryHandle.entries()) {
        if (entryHandle.kind === "file") {
            existingNames.add(normalizeDirectoryName(entryName));
        }
    }

    return existingNames;
}

function reserveAvailableDirectoryFileName(existingNames, fileName) {
    for (let index = 0; index < 10000; index++) {
        const candidateName = buildNumberedFileName(fileName, index);
        const normalizedCandidateName = normalizeDirectoryName(candidateName);

        if (!existingNames.has(normalizedCandidateName)) {
            existingNames.add(normalizedCandidateName);
            return candidateName;
        }
    }

    throw new Error("Could not resolve a unique file name");
}

function isAndroidChrome() {
    const userAgent = navigator.userAgent || "";
    const isAndroid = /Android/i.test(userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    const isChrome = /Chrome\//i.test(userAgent) && !/EdgA|OPR|SamsungBrowser/i.test(userAgent);

    return isAndroid && isChrome && !isIOS;
}

function isMobileDevice() {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768;
}

function canUseAndroidFolderSave() {
    return Boolean(
        isAndroidChrome() &&
        window.showDirectoryPicker &&
        window.FileSystemFileHandle &&
        window.FileSystemDirectoryHandle
    );
}

function setAndroidFolderButtonVisibility() {
    if (!ui.changeSaveFolderBtn) {
        return;
    }

    ui.changeSaveFolderBtn.style.display = canUseAndroidFolderSave() ? "block" : "none";
}

async function queryDirectoryPermission(directoryHandle) {
    if (!directoryHandle || !directoryHandle.queryPermission) {
        return "prompt";
    }

    return directoryHandle.queryPermission({ mode: "readwrite" });
}

async function requestDirectoryPermission(directoryHandle) {
    if (!directoryHandle || !directoryHandle.requestPermission) {
        return "denied";
    }

    return directoryHandle.requestPermission({ mode: "readwrite" });
}

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

function canShareFiles(files) {
    try {
        return Boolean(
            navigator.share &&
            navigator.canShare &&
            navigator.canShare({ files })
        );
    } catch (error) {
        return false;
    }
}

function addResultPreview(blob) {
    const previewUrl = URL.createObjectURL(blob);
    resultPreviewUrls.push(previewUrl);

    renderResultPreviewPage();
}

function ensureShowMoreButton() {
    let showMoreBtn = document.getElementById('showMoreResultsBtn');

    if (!showMoreBtn) {
        showMoreBtn = document.createElement('button');
        showMoreBtn.type = 'button';
        showMoreBtn.id = 'showMoreResultsBtn';
        showMoreBtn.className = 'show-more-btn';
        showMoreBtn.onclick = () => renderResultPreviewPage(true);
        resultsGallery.insertAdjacentElement('afterend', showMoreBtn);
    }

    return showMoreBtn;
}

function renderResultPreviewPage(showMore = false) {
    if (showMore) {
        renderedPreviewCount = Math.min(
            renderedPreviewCount + RESULT_PREVIEW_PAGE_SIZE,
            resultPreviewUrls.length
        );
    } else {
        renderedPreviewCount = Math.min(
            Math.max(renderedPreviewCount, Math.min(RESULT_PREVIEW_PAGE_SIZE, resultPreviewUrls.length)),
            resultPreviewUrls.length
        );
    }

    while (resultsGallery.children.length < renderedPreviewCount) {
        const previewUrl = resultPreviewUrls[resultsGallery.children.length];
        const resultImg = new Image();

        resultImg.src = previewUrl;
        resultImg.className = "result-img";
        resultImg.draggable = false;
        resultsGallery.appendChild(resultImg);
    }

    updateShowMoreButton();
}

function updateShowMoreButton() {
    const showMoreBtn = ensureShowMoreButton();
    const remainingCount = resultPreviewUrls.length - renderedPreviewCount;

    showMoreBtn.style.display = remainingCount > 0 ? "block" : "none";
    showMoreBtn.innerText = remainingCount > 0
        ? `Show More (${Math.min(RESULT_PREVIEW_PAGE_SIZE, remainingCount)})`
        : "";
}

async function processImageToBlob(file, offCanvas) {
    const img = await loadBatchImage(file);
    const outputSize = getOutputSize(img.width, img.height);

    render(offCanvas, img, logoImg, outputSize.width, outputSize.height);

    const outputBlob = await canvasToJpegBlob(offCanvas, getCurrentExportQuality());
    const previewBlob = await canvasToThumbnailBlob(offCanvas);
    resetCanvas(offCanvas);

    return { outputBlob, previewBlob };
}

function updateExportProgress(processedCount, totalCount, progressMessage = null) {
    const percent = Math.round((processedCount / totalCount) * 100);

    ui.progressFill.style.width = percent + "%";
    ui.progressText.innerText = progressMessage || `កំពុងរៀបចំ... (${percent}%)`;
    ui.progressCount.innerText = `${processedCount} / ${totalCount}`;
}

function setPrimaryButtonState(disabled, text) {
    ui.downloadBtn.disabled = disabled;
    ui.downloadBtn.innerText = text;
}

function showProcessingError(error) {
    setProcessingState(false);
    resetExportSummary();
    setPrimaryButtonState(false, "ចាប់ផ្ដើមដំណើរការ");
    ui.progressText.innerText = "មានបញ្ហាក្នុងការរៀបចំរូបភាព";
    showUserError("ការរៀបចំរូបភាពបរាជ័យ។");
}

function showProcessingCancelled() {
    setProcessingState(false);
    resetExportSummary();
    setPrimaryButtonState(false, "ចាប់ផ្ដើមដំណើរការ");
    zipContainer.style.display = "none";
    cleanupObjectUrls(currentZipDownloads.map((item) => item.url));
    currentZipDownloads = [];
    mobileShareState = null;
    ui.progressText.innerText = "បានបោះបង់";
    showUserSuccess("បានបោះបង់ដំណើរការ។");
}

async function resetAndroidFolderSaveState() {
    androidSaveDirectoryHandle = null;

    try {
        await clearPersistedDirectoryHandle();
    } catch (error) {
        // Ignore persistence cleanup failures and continue.
    }
}

async function chooseAndroidSaveDirectory() {
    const directoryHandle = await requestAndroidSaveDirectory();
    ui.progressText.innerText = "បានប្តូរFolderរក្សាទុករួចរាល់";
    return directoryHandle;
}

function resetExportState() {
    resultsSection.style.display = 'block';
    resultsGallery.innerHTML = "";
    cleanupObjectUrls(currentZipDownloads.map((item) => item.url));
    cleanupObjectUrls(resultPreviewUrls);
    currentZipDownloads = [];
    mobileShareState = null;
    renderedPreviewCount = 0;
    zipContainer.style.display = "none";
    ui.finalZipBtn.disabled = false;
    updateShowMoreButton();
    ui.exportProgressContainer.style.display = 'block';
    resetExportSummary();
}

async function requestAndroidSaveDirectory() {
    const directoryHandle = await window.showDirectoryPicker({
        id: "logoadder-android-save",
        mode: "readwrite",
        startIn: "pictures"
    });

    androidSaveDirectoryHandle = directoryHandle;
    await savePersistedDirectoryHandle(directoryHandle);
    return directoryHandle;
}

async function getAndroidSaveDirectory() {
    const restoredHandle = await restorePersistedAndroidDirectoryHandle();

    if (restoredHandle) {
        return restoredHandle;
    }

    return requestAndroidSaveDirectory();
}

async function handleChangeSaveFolderClick() {
    if (!canUseAndroidFolderSave()) {
        return;
    }

    try {
        ui.changeSaveFolderBtn.disabled = true;
        ui.progressText.innerText = "សូមជ្រើសFolderថ្មីដើម្បីរក្សាទុករូប";
        await chooseAndroidSaveDirectory();
    } catch (error) {
        if (error.name === "AbortError") {
            ui.progressText.innerText = "បានបោះបង់ការជ្រើសFolder";
            return;
        }

        ui.progressText.innerText = "មិនអាចប្តូរFolderរក្សាទុកបាន";
        showUserError("មិនអាចប្តូរFolderរក្សាទុកបាន។");
    } finally {
        ui.changeSaveFolderBtn.disabled = false;
    }
}

async function writeBlobToDirectory(directoryHandle, fileName, blob, existingNames = null) {
    const reservedNames = existingNames || await collectExistingDirectoryFileNames(directoryHandle);
    const availableFileName = reserveAvailableDirectoryFileName(reservedNames, fileName);
    const fileHandle = await directoryHandle.getFileHandle(availableFileName, { create: true });
    const writable = await fileHandle.createWritable();

    await writable.write(blob);
    await writable.close();

    return availableFileName;
}

function showAndroidSaveComplete(count) {
    ui.progressText.innerText = `រួចរាល់! បានរក្សាទុក ${count} រូប`;
}

// Global Drag and Drop Listeners
window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dropOverlay) dropOverlay.style.display = 'flex';
});

window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null && dropOverlay) {
        dropOverlay.style.display = 'none';
    }
});

window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (dropOverlay) dropOverlay.style.display = 'none';

    const files = Array.from(e.dataTransfer.files).filter(isSupportedImageFile);
    if (files.length > 0) {
        bgFiles = files;
        handleFileSelection();
    }
});

bgInput.onchange = (e) => {
    bgFiles = Array.from(e.target.files);
    handleFileSelection();
};

function handleFileSelection() {
    ui.fileCount.innerText = `${bgFiles.length} រូបភាពដែលបានជ្រើសរើស`;
    currentIdx = 0;
    if (bgFiles.length > 0) {
        loadCurrentImg();
    } else {
        setPreviewFallback(DEFAULT_PLACEHOLDER_TEXT);
        if (ui.navControls) {
            ui.navControls.classList.add('hidden-nav');
        }
    }
}

// ==========================================
// SECTOR 4: CORE RENDERING ENGINE
// ==========================================
function render(targetCanvas, bg, logo, outputWidth = bg.width, outputHeight = bg.height) {
    const tCtx = targetCanvas.getContext('2d');
    targetCanvas.width = outputWidth;
    targetCanvas.height = outputHeight;
    tCtx.imageSmoothingEnabled = true;
    tCtx.imageSmoothingQuality = 'high';
    tCtx.drawImage(bg, 0, 0, outputWidth, outputHeight);

    if (logo) {
        const smartM = Math.min(outputWidth, outputHeight) * 0.005;
        const mX = (parseInt(ui.marginX.value) || 0) + smartM;
        const mY = (parseInt(ui.marginY.value) || 0) + smartM;
        const sizePct = ui.sizeSlider.value / 100;
        const opacityPct = ui.logoOpacity.value / 100;
        const pos = hiddenPosInput.value;
        
        const sizeBase = Math.sqrt(outputWidth * outputHeight);
        const requestedLogoWidth = sizeBase * sizePct * 0.94;
        const maxLogoWidth = logo.naturalWidth || logo.width;
        const lW = Math.min(requestedLogoWidth, maxLogoWidth);
        const lH = (logo.height / logo.width) * lW;

        let x = mX, y = mY;

        if (pos === "top-right") x = outputWidth - lW - mX;
        else if (pos === "bottom-left") y = outputHeight - lH - mY;
        else if (pos === "bottom-right") {
            x = outputWidth - lW - mX;
            y = outputHeight - lH - mY;
        } else if (pos === "center") {
            x = (outputWidth - lW) / 2;
            y = (outputHeight - lH) / 2;
        }

        tCtx.save();
        tCtx.globalAlpha = opacityPct;
        tCtx.drawImage(logo, x, y, lW, lH);
        tCtx.restore();
    }
}

function draw() {
    if (currentPreviewImg) render(canvas, currentPreviewImg, logoImg);
}

// ==========================================
// SECTOR 5: UI CONTROLLERS
// ==========================================
let pendingConfigSaveTimer = null;
let pendingDrawFrame = null;

function scheduleConfigSave() {
    clearTimeout(pendingConfigSaveTimer);
    pendingConfigSaveTimer = setTimeout(() => {
        pendingConfigSaveTimer = null;
        saveConfig();
    }, 200);
}

function flushConfigSave() {
    if (pendingConfigSaveTimer) {
        clearTimeout(pendingConfigSaveTimer);
        pendingConfigSaveTimer = null;
    }

    saveConfig();
}

function scheduleDraw() {
    if (pendingDrawFrame) {
        return;
    }

    pendingDrawFrame = requestAnimationFrame(() => {
        pendingDrawFrame = null;
        draw();
    });
}

function scheduleConfigAndDraw() {
    scheduleConfigSave();
    scheduleDraw();
}

function updatePositionUI(val) {
    hiddenPosInput.value = val;
    posButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-value') === val));
}

posButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        updatePositionUI(btn.getAttribute('data-value'));
        saveConfig();
        draw();
    });
});

ui.sizeSlider.oninput = (e) => {
    ui.sizeVal.innerText = e.target.value + "%";
    scheduleConfigAndDraw();
};

ui.logoOpacity.oninput = (e) => {
    ui.opacityVal.innerText = e.target.value + "%";
    scheduleConfigAndDraw();
};

ui.sizeSlider.addEventListener('change', flushConfigSave);
ui.logoOpacity.addEventListener('change', flushConfigSave);

document.querySelectorAll('.fancy-input').forEach(el => {
    el.addEventListener('input', scheduleConfigAndDraw);
    el.addEventListener('change', flushConfigSave);
});

// ==========================================
// SECTOR 6: BATCH EXPORT & NAVIGATION
// ==========================================
async function loadCurrentImg() {
    if (bgFiles.length > 0) {
        if (ui.navControls) ui.navControls.classList.remove('hidden-nav');
    }
    ui.navStatus.innerText = `${currentIdx + 1} / ${bgFiles.length}`;

    try {
        currentPreviewImg = await loadImage(bgFiles[currentIdx]);
        clearPreviewFallback();
        draw();
    } catch (error) {
        setPreviewFallback("មិនអាចបង្ហាញ Preview រូបនេះបាន");
    }
}

document.getElementById('nextZone').onclick = () => {
    if (currentIdx < bgFiles.length - 1) { currentIdx++; loadCurrentImg(); }
};

document.getElementById('prevZone').onclick = () => {
    if (currentIdx > 0) { currentIdx--; loadCurrentImg(); }
};

function handleNavZoneKeydown(event, action) {
    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }

    event.preventDefault();
    action();
}

document.getElementById('nextZone').addEventListener('keydown', (event) => {
    handleNavZoneKeydown(event, () => {
        if (currentIdx < bgFiles.length - 1) { currentIdx++; loadCurrentImg(); }
    });
});

document.getElementById('prevZone').addEventListener('keydown', (event) => {
    handleNavZoneKeydown(event, () => {
        if (currentIdx > 0) { currentIdx--; loadCurrentImg(); }
    });
});
