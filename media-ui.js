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

async function loadImageBitmapFromBlob(blob, sourceName = "image") {
    if (!window.createImageBitmap) {
        throw new Error(`Image load failed: ${sourceName}`);
    }

    try {
        return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch (orientationError) {
        try {
            return await createImageBitmap(blob);
        } catch (bitmapError) {
            throw new Error(`Image load failed: ${sourceName}`);
        }
    }
}

async function decodeBatchImageBlob(blob, sourceName) {
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await loadImageFromBlob(blob, sourceName);
        } catch (imageError) {
            lastError = imageError;
        }

        try {
            return await loadImageBitmapFromBlob(blob, sourceName);
        } catch (bitmapError) {
            lastError = bitmapError;
        }

        if (attempt === 0) {
            await yieldToBrowser(120);
        }
    }

    throw lastError || new Error(`Image load failed: ${sourceName}`);
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

function preconvertDesktopHeicFiles(files, startIndex, endIndex) {
    if (isMobileDevice() || !window.Worker) {
        return;
    }

    let scheduledCount = 0;

    for (
        let i = startIndex;
        i < endIndex && scheduledCount < DESKTOP_HEIC_PRECONVERT_AHEAD;
        i++
    ) {
        const file = files[i];

        if (!isHeicFile(file)) {
            continue;
        }

        scheduledCount += 1;
        convertHeicToJpegBlobWithCache(file).catch(() => {
            // The export loop awaits the cached conversion and reports failures in order.
        });
    }
}

async function loadBatchImage(file) {
    try {
        return await decodeBatchImageBlob(file, file.name);
    } catch (imageError) {
        if (!isHeicFile(file)) {
            throw imageError;
        }

        const convertedBlob = await convertHeicToJpegBlobWithCache(file);
        return decodeBatchImageBlob(convertedBlob, file.name);
    }
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

function getSizeWithinPixelLimit(width, height, maxOutputPixels) {
    const pixels = width * height;
    if (pixels <= maxOutputPixels) return { width, height };

    const scale = Math.sqrt(maxOutputPixels / pixels);
    return {
        width: Math.round(width * scale),
        height: Math.round(height * scale)
    };
}

function getOutputSize(width, height) {
    return getSizeWithinPixelLimit(width, height, getCurrentMaxOutputPixels());
}

function getRenderSourceScale(sourceImage, editedSize, targetSize, maxWorkingPixels) {
    const targetScale = Math.min(
        1,
        targetSize.width / editedSize.width,
        targetSize.height / editedSize.height
    );
    const sourcePixels = sourceImage.width * sourceImage.height;
    const workingScale = sourcePixels > maxWorkingPixels
        ? Math.sqrt(maxWorkingPixels / sourcePixels)
        : 1;

    return Math.min(targetScale, workingScale);
}

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getPhotoEditState(index = currentIdx) {
    if (!photoEditStates[index]) {
        photoEditStates[index] = {
            adjustments: { ...fallbackPhotoAdjustments },
            cropRect: null,
            draftRotation: null,
            flipHorizontal: false,
            flipVertical: false,
            rotation: 0
        };
    }

    return photoEditStates[index];
}

function getRotationDegrees(editState, options = {}) {
    const rotationValue = options.useDraft !== false && editState && typeof editState.draftRotation === "number"
        ? editState.draftRotation
        : editState && typeof editState.rotation === "number"
            ? editState.rotation
            : 0;

    return rotationValue;
}

function normalizeDegrees(value) {
    const normalized = ((value % 360) + 360) % 360;
    return normalized > 180 ? normalized - 360 : normalized;
}

function getCombinedAdjustments(sourceImage) {
    return { ...getPhotoEditState().adjustments };
}

function getPhotoAdjustmentsForRender(editState) {
    return { ...DEFAULT_ADJUSTMENTS, ...(editState && editState.adjustments ? editState.adjustments : fallbackPhotoAdjustments) };
}

function getHistogramPercentile(histogram, totalPixels, percentile) {
    const target = Math.max(1, Math.round(totalPixels * percentile));
    let count = 0;

    for (let i = 0; i < histogram.length; i++) {
        count += histogram[i];

        if (count >= target) {
            return i;
        }
    }

    return histogram.length - 1;
}

function getAutoAdjustments(sourceImage) {
    if (autoAdjustmentCache.has(sourceImage)) {
        return autoAdjustmentCache.get(sourceImage);
    }

    const sampleCanvas = document.createElement('canvas');
    const sampleSize = 96;
    const scale = Math.min(sampleSize / sourceImage.width, sampleSize / sourceImage.height, 1);
    const sampleWidth = Math.max(1, Math.round(sourceImage.width * scale));
    const sampleHeight = Math.max(1, Math.round(sourceImage.height * scale));
    const sampleCtx = sampleCanvas.getContext('2d');

    sampleCanvas.width = sampleWidth;
    sampleCanvas.height = sampleHeight;
    sampleCtx.drawImage(sourceImage, 0, 0, sampleWidth, sampleHeight);

    const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const histogram = new Array(256).fill(0);
    const totalPixels = imageData.length / 4;
    let totalLuma = 0;
    let darkPixels = 0;
    let brightPixels = 0;
    let saturationTotal = 0;
    let neutralWarmthTotal = 0;
    let neutralPixelCount = 0;

    for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const luma = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
        const lumaIndex = clampNumber(Math.round(luma), 0, 255);
        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);
        const saturation = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;

        histogram[lumaIndex] += 1;
        totalLuma += luma;
        saturationTotal += saturation;

        if (luma < 64) {
            darkPixels += 1;
        }

        if (luma > 210) {
            brightPixels += 1;
        }

        if (luma > 48 && luma < 235 && saturation < 0.32) {
            neutralWarmthTotal += (r - b) / 255;
            neutralPixelCount += 1;
        }
    }

    resetCanvas(sampleCanvas);

    const avgLuma = totalLuma / totalPixels;
    const luma02 = getHistogramPercentile(histogram, totalPixels, 0.02);
    const luma10 = getHistogramPercentile(histogram, totalPixels, 0.10);
    const luma90 = getHistogramPercentile(histogram, totalPixels, 0.90);
    const luma98 = getHistogramPercentile(histogram, totalPixels, 0.98);
    const dynamicRange = luma98 - luma02;
    const darkRatio = darkPixels / totalPixels;
    const brightRatio = brightPixels / totalPixels;
    const avgSaturation = saturationTotal / totalPixels;
    const neutralWarmth = neutralPixelCount > Math.max(12, totalPixels * 0.03)
        ? neutralWarmthTotal / neutralPixelCount
        : 0;
    const auto = {
        brightness: clampNumber(Math.round((134 - avgLuma) / 6.5), -18, 18),
        contrast: clampNumber(dynamicRange < 145 ? Math.round((145 - dynamicRange) / 6) : dynamicRange > 220 ? -5 : 0, -8, 18),
        highlights: clampNumber(
            brightRatio > 0.16 || luma98 > 242
                ? -14
                : luma90 < 178
                    ? 5
                    : 0,
            -18,
            10
        ),
        shadows: clampNumber(
            darkRatio > 0.18 || luma02 < 18
                ? 14
                : luma10 < 52
                    ? 9
                    : avgLuma < 112
                        ? 6
                        : 2,
            0,
            18
        ),
        saturation: clampNumber(avgSaturation < 0.18 ? 12 : avgSaturation < 0.32 ? 8 : avgSaturation > 0.62 ? -4 : 4, -8, 14),
        temperature: clampNumber(Math.round(-neutralWarmth * 34), -10, 10)
    };

    autoAdjustmentCache.set(sourceImage, auto);
    return auto;
}

function shouldApplyPixelAdjustments(adjustments) {
    return Boolean(
        adjustments.highlights ||
        adjustments.shadows ||
        adjustments.temperature
    );
}

function applyPixelAdjustments(targetCanvas, adjustments) {
    if (!shouldApplyPixelAdjustments(adjustments)) {
        return;
    }

    const targetCtx = targetCanvas.getContext('2d', { willReadFrequently: true });
    const imageData = targetCtx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    const pixels = imageData.data;
    const highlights = (adjustments.highlights || 0) / 50;
    const shadows = (adjustments.shadows || 0) / 50;
    const temperature = adjustments.temperature || 0;

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const luma = ((r * 0.2126) + (g * 0.7152) + (b * 0.0722)) / 255;
        const highlightWeight = Math.max(0, (luma - 0.55) / 0.45);
        const shadowWeight = Math.max(0, (0.55 - luma) / 0.55);
        const highlightDelta = highlights * highlightWeight * 38;
        const shadowDelta = shadows * shadowWeight * 42;
        const tempDelta = temperature * 1.2;

        pixels[i] = clampNumber(r + highlightDelta + shadowDelta + tempDelta, 0, 255);
        pixels[i + 1] = clampNumber(g + highlightDelta + shadowDelta, 0, 255);
        pixels[i + 2] = clampNumber(b + highlightDelta + shadowDelta - tempDelta, 0, 255);
    }

    targetCtx.putImageData(imageData, 0, 0);
}

function getSmartRotationCropRect(sourceWidth, sourceHeight, rotationDegrees, baseWidth, baseHeight) {
    const normalizedDegrees = normalizeDegrees(rotationDegrees);
    const residualDegrees = Math.abs(normalizedDegrees) % 90;
    const safeDegrees = residualDegrees > 45 ? 90 - residualDegrees : residualDegrees;

    if (safeDegrees < 0.1) {
        return null;
    }

    const radians = safeDegrees * Math.PI / 180;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);
    const widthIsLonger = sourceWidth >= sourceHeight;
    const longSide = widthIsLonger ? sourceWidth : sourceHeight;
    const shortSide = widthIsLonger ? sourceHeight : sourceWidth;
    let cropWidth;
    let cropHeight;

    if (shortSide <= 2 * sin * cos * longSide || Math.abs(sin - cos) < 0.000001) {
        const halfShortSide = shortSide / 2;

        if (widthIsLonger) {
            cropWidth = halfShortSide / sin;
            cropHeight = halfShortSide / cos;
        } else {
            cropWidth = halfShortSide / cos;
            cropHeight = halfShortSide / sin;
        }
    } else {
        const cosDoubleAngle = (cos * cos) - (sin * sin);
        cropWidth = ((sourceWidth * cos) - (sourceHeight * sin)) / cosDoubleAngle;
        cropHeight = ((sourceHeight * cos) - (sourceWidth * sin)) / cosDoubleAngle;
    }

    const width = clampNumber((cropWidth * 0.995) / baseWidth, CROP_MIN_SIZE, 1);
    const height = clampNumber((cropHeight * 0.995) / baseHeight, CROP_MIN_SIZE, 1);

    return {
        x: (1 - width) / 2,
        y: (1 - height) / 2,
        width,
        height
    };
}

function cropCanvasByRect(sourceCanvas, cropRect) {
    const croppedCanvas = document.createElement('canvas');
    const cropX = Math.round(cropRect.x * sourceCanvas.width);
    const cropY = Math.round(cropRect.y * sourceCanvas.height);
    const cropWidth = Math.max(1, Math.round(cropRect.width * sourceCanvas.width));
    const cropHeight = Math.max(1, Math.round(cropRect.height * sourceCanvas.height));

    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;
    croppedCanvas
        .getContext('2d')
        .drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    resetCanvas(sourceCanvas);

    return croppedCanvas;
}

function getSourceFrameSize(sourceImage, editState, options = {}) {
    const rotationDegrees = getRotationDegrees(editState, options);
    const rotationRadians = Math.abs(rotationDegrees * Math.PI / 180);
    const sin = Math.abs(Math.sin(rotationRadians));
    const cos = Math.abs(Math.cos(rotationRadians));
    const width = Math.max(1, Math.round(sourceImage.width * cos + sourceImage.height * sin));
    const height = Math.max(1, Math.round(sourceImage.width * sin + sourceImage.height * cos));
    const smartCropRect = options.disableSmartRotationCrop
        ? null
        : getSmartRotationCropRect(sourceImage.width, sourceImage.height, rotationDegrees, width, height);
    const cropRect = !options.ignoreCrop && editState && editState.cropRect ? editState.cropRect : null;
    const smartWidth = smartCropRect ? Math.max(1, Math.round(width * smartCropRect.width)) : width;
    const smartHeight = smartCropRect ? Math.max(1, Math.round(height * smartCropRect.height)) : height;

    if (!cropRect) {
        return { width: smartWidth, height: smartHeight };
    }

    return {
        width: Math.max(1, Math.round(smartWidth * cropRect.width)),
        height: Math.max(1, Math.round(smartHeight * cropRect.height))
    };
}

function buildEditedPhotoCanvas(sourceImage, editState, options = {}) {
    const rotationDegrees = getRotationDegrees(editState, options);
    const rotationRadians = rotationDegrees * Math.PI / 180;
    const absRadians = Math.abs(rotationRadians);
    const sin = Math.abs(Math.sin(absRadians));
    const cos = Math.abs(Math.cos(absRadians));
    const sourceScale = clampNumber(Number(options.sourceScale) || 1, 0.01, 1);
    const sourceWidth = Math.max(1, Math.round(sourceImage.width * sourceScale));
    const sourceHeight = Math.max(1, Math.round(sourceImage.height * sourceScale));
    const baseWidth = Math.max(1, Math.round(sourceWidth * cos + sourceHeight * sin));
    const baseHeight = Math.max(1, Math.round(sourceWidth * sin + sourceHeight * cos));
    let baseCanvas = document.createElement('canvas');
    const baseCtx = baseCanvas.getContext('2d');
    const adjustments = getPhotoAdjustmentsForRender(editState);
    const cropRect = !options.ignoreCrop && editState && editState.cropRect ? editState.cropRect : null;

    baseCanvas.width = baseWidth;
    baseCanvas.height = baseHeight;
    baseCtx.imageSmoothingEnabled = true;
    baseCtx.imageSmoothingQuality = 'high';
    baseCtx.filter = [
        `brightness(${100 + (adjustments.brightness || 0)}%)`,
        `contrast(${100 + (adjustments.contrast || 0)}%)`,
        `saturate(${100 + (adjustments.saturation || 0)}%)`
    ].join(" ");
    baseCtx.translate(baseWidth / 2, baseHeight / 2);
    baseCtx.rotate(rotationRadians);
    baseCtx.scale(editState.flipHorizontal ? -1 : 1, editState.flipVertical ? -1 : 1);
    baseCtx.drawImage(sourceImage, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
    baseCtx.setTransform(1, 0, 0, 1, 0, 0);
    baseCtx.filter = "none";
    applyPixelAdjustments(baseCanvas, adjustments);

    const smartCropRect = options.disableSmartRotationCrop
        ? null
        : getSmartRotationCropRect(sourceWidth, sourceHeight, rotationDegrees, baseWidth, baseHeight);

    if (smartCropRect) {
        baseCanvas = cropCanvasByRect(baseCanvas, smartCropRect);
    }

    if (!cropRect) {
        return baseCanvas;
    }

    return cropCanvasByRect(baseCanvas, cropRect);
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

    try {
        const fileIndex = bgFiles.indexOf(file);
        const editState = getPhotoEditState(fileIndex >= 0 ? fileIndex : currentIdx);
        const editedSize = getSourceFrameSize(img, editState);
        const outputSize = getOutputSize(editedSize.width, editedSize.height);
        const sourceScale = getRenderSourceScale(
            img,
            editedSize,
            outputSize,
            isMobileDevice() ? MOBILE_EXPORT_WORKING_PIXELS : DESKTOP_EXPORT_WORKING_PIXELS
        );

        render(offCanvas, img, logoImg, outputSize.width, outputSize.height, {
            editState,
            sourceScale
        });

        const outputBlob = await canvasToJpegBlob(offCanvas, getCurrentExportQuality());
        const previewBlob = await canvasToThumbnailBlob(offCanvas);

        return { outputBlob, previewBlob };
    } finally {
        resetCanvas(offCanvas);

        if (img && typeof img.close === "function") {
            img.close();
        }
    }
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
        photoEditStates.length = 0;
        cropModeActive = false;
        cropPointerState = null;
        handleFileSelection();
    }
});

bgInput.onchange = (e) => {
    bgFiles = Array.from(e.target.files);
    photoEditStates.length = 0;
    cropModeActive = false;
    cropPointerState = null;
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
function render(targetCanvas, bg, logo, outputWidth = null, outputHeight = null, options = {}) {
    const tCtx = targetCanvas.getContext('2d');
    const editState = options.editState || getPhotoEditState();
    const editedPhotoCanvas = buildEditedPhotoCanvas(bg, editState, options);
    const finalWidth = outputWidth || editedPhotoCanvas.width;
    const finalHeight = outputHeight || editedPhotoCanvas.height;

    targetCanvas.width = finalWidth;
    targetCanvas.height = finalHeight;
    tCtx.imageSmoothingEnabled = true;
    tCtx.imageSmoothingQuality = 'high';
    tCtx.clearRect(0, 0, finalWidth, finalHeight);
    tCtx.drawImage(editedPhotoCanvas, 0, 0, finalWidth, finalHeight);
    resetCanvas(editedPhotoCanvas);

    if (!logo) {
        return;
    }

    const smartM = Math.min(finalWidth, finalHeight) * 0.005;
    const mX = (parseInt(ui.marginX.value) || 0) + smartM;
    const mY = (parseInt(ui.marginY.value) || 0) + smartM;
    const sizePct = ui.sizeSlider.value / 100;
    const opacityPct = ui.logoOpacity.value / 100;
    const pos = hiddenPosInput.value;

    const sizeBase = Math.sqrt(finalWidth * finalHeight);
    const requestedLogoWidth = sizeBase * sizePct * 0.94;
    const maxLogoWidth = logo.naturalWidth || logo.width;
    const lW = Math.min(requestedLogoWidth, maxLogoWidth);
    const lH = (logo.height / logo.width) * lW;

    let x = mX, y = mY;

    if (pos === "top-right") x = finalWidth - lW - mX;
    else if (pos === "bottom-left") y = finalHeight - lH - mY;
    else if (pos === "bottom-right") {
        x = finalWidth - lW - mX;
        y = finalHeight - lH - mY;
    } else if (pos === "center") {
        x = (finalWidth - lW) / 2;
        y = (finalHeight - lH) / 2;
    }

    tCtx.save();
    tCtx.globalAlpha = opacityPct;
    tCtx.drawImage(logo, x, y, lW, lH);
    tCtx.restore();
}

function draw() {
    if (!currentPreviewImg) {
        return;
    }

    const editState = getPhotoEditState();
    const editedSize = getSourceFrameSize(currentPreviewImg, editState, { ignoreCrop: cropModeActive });
    const previewSize = getSizeWithinPixelLimit(
        editedSize.width,
        editedSize.height,
        isMobileDevice() ? 1200000 : 2000000
    );
    const sourceScale = getRenderSourceScale(
        currentPreviewImg,
        editedSize,
        previewSize,
        isMobileDevice() ? 1200000 : 2000000
    );
    const hideLogoForEditMode = cropModeActive || activePhotoEditTab === "rotate";
    render(
        canvas,
        currentPreviewImg,
        hideLogoForEditMode ? null : logoImg,
        previewSize.width,
        previewSize.height,
        {
            editState,
            ignoreCrop: cropModeActive,
            sourceScale
        }
    );
    updateCropOverlay();
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

function syncPhotoEditControls() {
    const currentAdjustments = getPhotoEditState().adjustments;
    const sliderMap = {
        brightness: [ui.brightnessSlider, ui.brightnessValue],
        contrast: [ui.contrastSlider, ui.contrastValue],
        highlights: [ui.highlightsSlider, ui.highlightsValue],
        shadows: [ui.shadowsSlider, ui.shadowsValue],
        saturation: [ui.saturationSlider, ui.saturationValue],
        temperature: [ui.temperatureSlider, ui.temperatureValue]
    };

    Object.entries(sliderMap).forEach(([key, pair]) => {
        const [slider, valueEl] = pair;
        if (slider) {
            slider.value = currentAdjustments[key] || 0;
        }
        if (valueEl) {
            valueEl.innerText = String(currentAdjustments[key] || 0);
        }
    });

    syncCurrentPhotoEditControls();
}

function syncCurrentPhotoEditControls() {
    const editState = getPhotoEditState();
    const angle = getRotationDegrees(editState);

    if (ui.fineRotateSlider) {
        ui.fineRotateSlider.value = angle || 0;
    }
    if (ui.rotationValue) {
        ui.rotationValue.innerText = `${angle}°`;
    }
    if (ui.applyCropBtn) {
        ui.applyCropBtn.disabled = !cropModeActive;
    }
    if (ui.startCropBtn) {
        ui.startCropBtn.classList.toggle("active", cropModeActive);
        ui.startCropBtn.innerText = "Crop";
    }
    if (ui.cropStatus) {
        ui.cropStatus.innerText = cropModeActive
            ? "Drag handles or move the crop box"
            : editState.cropRect
                ? "Crop applied"
                : "Drag handles to crop";
    }

    updateCropOverlay();
}

function setPhotoEditTab(tabName) {
    activePhotoEditTab = tabName;
    if (cropModeActive) {
        exitCropMode(false);
    }

    const isAdjust = tabName === "adjust";
    if (ui.adjustTabBtn) {
        ui.adjustTabBtn.classList.toggle("active", isAdjust);
        ui.adjustTabBtn.setAttribute("aria-selected", String(isAdjust));
    }
    if (ui.rotateCropTabBtn) {
        ui.rotateCropTabBtn.classList.toggle("active", !isAdjust);
        ui.rotateCropTabBtn.setAttribute("aria-selected", String(!isAdjust));
    }
    if (ui.adjustPanel) {
        ui.adjustPanel.classList.toggle("active", isAdjust);
        ui.adjustPanel.hidden = !isAdjust;
    }
    if (ui.rotateCropPanel) {
        ui.rotateCropPanel.classList.toggle("active", !isAdjust);
        ui.rotateCropPanel.hidden = isAdjust;
    }
}

function setAdjustmentValue(key, value) {
    const editState = getPhotoEditState();
    editState.adjustments[key] = clampNumber(Number(value) || 0, -50, 50);
    syncPhotoEditControls();
    scheduleDraw();
}

function resetAdjustments() {
    getPhotoEditState().adjustments = { ...DEFAULT_ADJUSTMENTS };
    syncPhotoEditControls();
    scheduleDraw();
}

function applyAutoAdjustToImage(index, sourceImage) {
    const editState = getPhotoEditState(index);
    if (!sourceImage) {
        return;
    }

    editState.adjustments = { ...DEFAULT_ADJUSTMENTS, ...getAutoAdjustments(sourceImage) };
}

function applyAutoToCurrentPhoto() {
    applyAutoAdjustToImage(currentIdx, currentPreviewImg);
    syncPhotoEditControls();
    scheduleDraw();
}

async function applyAutoToAllPhotos() {
    if (bgFiles.length === 0) {
        return;
    }

    const previousProgressText = ui.cropStatus ? ui.cropStatus.innerText : "";

    for (let i = 0; i < bgFiles.length; i++) {
        try {
            const img = i === currentIdx && currentPreviewImg ? currentPreviewImg : await loadImage(bgFiles[i]);
            applyAutoAdjustToImage(i, img);
            if (ui.cropStatus) {
                ui.cropStatus.innerText = `Auto ${i + 1}/${bgFiles.length}`;
            }
            await yieldToBrowser();
        } catch (error) {
            getPhotoEditState(i).adjustments = { ...DEFAULT_ADJUSTMENTS };
        }
    }

    if (ui.cropStatus) {
        ui.cropStatus.innerText = previousProgressText || "Auto applied";
    }
    syncPhotoEditControls();
    scheduleDraw();
}

function rotateCurrentPhoto(degrees) {
    const editState = getPhotoEditState();
    const currentRotation = getRotationDegrees(editState);
    editState.rotation = normalizeDegrees(currentRotation + degrees);
    editState.draftRotation = null;
    syncCurrentPhotoEditControls();
    scheduleDraw();
}

function resetCurrentRotation() {
    const editState = getPhotoEditState();
    editState.rotation = 0;
    editState.draftRotation = null;
    syncCurrentPhotoEditControls();
    scheduleDraw();
}

function setFineRotation(value) {
    const editState = getPhotoEditState();
    editState.rotation = normalizeDegrees(Number(value) || 0);
    editState.draftRotation = null;
    syncCurrentPhotoEditControls();
    scheduleDraw();
}

function toggleFlip(axis) {
    const editState = getPhotoEditState();
    if (axis === "horizontal") {
        editState.flipHorizontal = !editState.flipHorizontal;
    } else {
        editState.flipVertical = !editState.flipVertical;
    }
    syncCurrentPhotoEditControls();
    scheduleDraw();
}

function getDefaultCropRect() {
    return {
        x: 0,
        y: 0,
        width: 1,
        height: 1
    };
}

function startCropMode() {
    if (!currentPreviewImg) {
        return;
    }

    if (cropModeActive) {
        exitCropMode(false);
        return;
    }

    const editState = getPhotoEditState();
    if (!editState.cropRect) {
        editState.cropRect = getDefaultCropRect();
    }

    cropModeActive = true;
    if (ui.cropOverlay) {
        ui.cropOverlay.setAttribute("aria-hidden", "false");
    }
    syncCurrentPhotoEditControls();
    draw();
}

function exitCropMode(shouldRedraw = true) {
    cropModeActive = false;
    cropPointerState = null;
    if (ui.cropOverlay) {
        ui.cropOverlay.setAttribute("aria-hidden", "true");
    }
    syncCurrentPhotoEditControls();
    if (shouldRedraw) {
        draw();
    }
}

function applyCurrentCrop() {
    exitCropMode(true);
}

function resetCurrentCrop() {
    const editState = getPhotoEditState();
    editState.cropRect = null;
    cropModeActive = false;
    if (ui.cropOverlay) {
        ui.cropOverlay.setAttribute("aria-hidden", "true");
    }
    syncCurrentPhotoEditControls();
    draw();
}

function updateCropOverlay() {
    if (!ui.cropOverlay || !ui.cropBox) {
        return;
    }

    const editState = getPhotoEditState();
    const cropRect = cropModeActive && editState.cropRect ? editState.cropRect : null;
    ui.cropOverlay.classList.toggle("active", Boolean(cropRect));
    ui.cropOverlay.style.display = cropRect ? "block" : "none";

    if (!cropRect) {
        return;
    }

    const wrapperRect = ui.cropOverlay.parentElement.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    ui.cropOverlay.style.left = `${canvasRect.left - wrapperRect.left}px`;
    ui.cropOverlay.style.top = `${canvasRect.top - wrapperRect.top}px`;
    ui.cropOverlay.style.width = `${canvasRect.width}px`;
    ui.cropOverlay.style.height = `${canvasRect.height}px`;
    ui.cropBox.style.left = `${cropRect.x * 100}%`;
    ui.cropBox.style.top = `${cropRect.y * 100}%`;
    ui.cropBox.style.width = `${cropRect.width * 100}%`;
    ui.cropBox.style.height = `${cropRect.height * 100}%`;
}

function getCropPointerPosition(event) {
    const rect = ui.cropOverlay.getBoundingClientRect();
    return {
        x: clampNumber((event.clientX - rect.left) / rect.width, 0, 1),
        y: clampNumber((event.clientY - rect.top) / rect.height, 0, 1)
    };
}

function normalizeCropRect(rect) {
    const x = clampNumber(rect.x, 0, 1 - CROP_MIN_SIZE);
    const y = clampNumber(rect.y, 0, 1 - CROP_MIN_SIZE);
    const width = clampNumber(rect.width, CROP_MIN_SIZE, 1 - x);
    const height = clampNumber(rect.height, CROP_MIN_SIZE, 1 - y);

    return { x, y, width, height };
}

function getCropActionFromEvent(event) {
    const actionTarget = event.target.closest("[data-crop-action]");
    if (actionTarget) {
        return actionTarget.getAttribute("data-crop-action");
    }

    if (event.target === ui.cropBox) {
        return "move";
    }

    return "";
}

function updateCropRectByAction(startRect, startPoint, currentPoint, action) {
    const dx = currentPoint.x - startPoint.x;
    const dy = currentPoint.y - startPoint.y;
    let nextRect = { ...startRect };

    if (action === "move") {
        nextRect.x = clampNumber(startRect.x + dx, 0, 1 - startRect.width);
        nextRect.y = clampNumber(startRect.y + dy, 0, 1 - startRect.height);
        return nextRect;
    }

    if (action.includes("w")) {
        const right = startRect.x + startRect.width;
        nextRect.x = clampNumber(startRect.x + dx, 0, right - CROP_MIN_SIZE);
        nextRect.width = right - nextRect.x;
    }

    if (action.includes("e")) {
        nextRect.width = clampNumber(startRect.width + dx, CROP_MIN_SIZE, 1 - startRect.x);
    }

    if (action.includes("n")) {
        const bottom = startRect.y + startRect.height;
        nextRect.y = clampNumber(startRect.y + dy, 0, bottom - CROP_MIN_SIZE);
        nextRect.height = bottom - nextRect.y;
    }

    if (action.includes("s")) {
        nextRect.height = clampNumber(startRect.height + dy, CROP_MIN_SIZE, 1 - startRect.y);
    }

    return normalizeCropRect(nextRect);
}

function handleCropPointerDown(event) {
    if (!cropModeActive || !ui.cropOverlay) {
        return;
    }

    const action = getCropActionFromEvent(event);
    if (!action) {
        return;
    }

    event.preventDefault();
    ui.cropOverlay.setPointerCapture(event.pointerId);
    const startPoint = getCropPointerPosition(event);
    const startRect = { ...getPhotoEditState().cropRect };
    cropPointerState = { action, pointerId: event.pointerId, startPoint, startRect };
}

function handleCropPointerMove(event) {
    if (!cropPointerState || cropPointerState.pointerId !== event.pointerId) {
        return;
    }

    event.preventDefault();
    getPhotoEditState().cropRect = updateCropRectByAction(
        cropPointerState.startRect,
        cropPointerState.startPoint,
        getCropPointerPosition(event),
        cropPointerState.action
    );
    updateCropOverlay();
}

function handleCropPointerUp(event) {
    if (!cropPointerState || cropPointerState.pointerId !== event.pointerId) {
        return;
    }

    event.preventDefault();
    cropPointerState = null;
    syncCurrentPhotoEditControls();
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

if (ui.adjustTabBtn) {
    ui.adjustTabBtn.addEventListener('click', () => setPhotoEditTab("adjust"));
}

if (ui.rotateCropTabBtn) {
    ui.rotateCropTabBtn.addEventListener('click', () => setPhotoEditTab("rotate"));
}

[
    ["brightness", ui.brightnessSlider],
    ["contrast", ui.contrastSlider],
    ["highlights", ui.highlightsSlider],
    ["shadows", ui.shadowsSlider],
    ["saturation", ui.saturationSlider],
    ["temperature", ui.temperatureSlider]
].forEach(([key, slider]) => {
    if (!slider) {
        return;
    }

    slider.addEventListener('input', (event) => setAdjustmentValue(key, event.target.value));
});

if (ui.autoCurrentBtn) {
    ui.autoCurrentBtn.addEventListener('click', applyAutoToCurrentPhoto);
}

if (ui.autoAllBtn) {
    ui.autoAllBtn.addEventListener('click', applyAutoToAllPhotos);
}

if (ui.resetAdjustBtn) {
    ui.resetAdjustBtn.addEventListener('click', resetAdjustments);
}

if (ui.rotateLeftBtn) {
    ui.rotateLeftBtn.addEventListener('click', () => rotateCurrentPhoto(-90));
}

if (ui.rotateRightBtn) {
    ui.rotateRightBtn.addEventListener('click', () => rotateCurrentPhoto(90));
}

if (ui.flipHorizontalBtn) {
    ui.flipHorizontalBtn.addEventListener('click', () => toggleFlip("horizontal"));
}

if (ui.flipVerticalBtn) {
    ui.flipVerticalBtn.addEventListener('click', () => toggleFlip("vertical"));
}

if (ui.resetRotateBtn) {
    ui.resetRotateBtn.addEventListener('click', resetCurrentRotation);
}

if (ui.fineRotateSlider) {
    ui.fineRotateSlider.addEventListener('input', (event) => setFineRotation(event.target.value));
}

if (ui.startCropBtn) {
    ui.startCropBtn.addEventListener('click', startCropMode);
}

if (ui.applyCropBtn) {
    ui.applyCropBtn.addEventListener('click', applyCurrentCrop);
}

if (ui.resetCropBtn) {
    ui.resetCropBtn.addEventListener('click', resetCurrentCrop);
}

if (ui.cropOverlay) {
    ui.cropOverlay.addEventListener('pointerdown', handleCropPointerDown);
    ui.cropOverlay.addEventListener('pointermove', handleCropPointerMove);
    ui.cropOverlay.addEventListener('pointerup', handleCropPointerUp);
    ui.cropOverlay.addEventListener('pointercancel', handleCropPointerUp);
}

window.addEventListener('resize', updateCropOverlay);
syncPhotoEditControls();

// ==========================================
// SECTOR 6: BATCH EXPORT & NAVIGATION
// ==========================================
async function loadCurrentImg() {
    cropModeActive = false;
    cropPointerState = null;
    const editState = getPhotoEditState();
    editState.draftRotation = null;
    if (ui.cropOverlay) {
        ui.cropOverlay.setAttribute("aria-hidden", "true");
    }
    syncCurrentPhotoEditControls();

    if (bgFiles.length > 0) {
        if (ui.navControls) ui.navControls.classList.remove('hidden-nav');
    }
    ui.navStatus.innerText = `${currentIdx + 1} / ${bgFiles.length}`;

    try {
        currentPreviewImg = await loadImage(bgFiles[currentIdx]);
        clearPreviewFallback();
        syncPhotoEditControls();
        draw();
    } catch (error) {
        setPreviewFallback("មិនអាចបង្ហាញ Preview រូបនេះបាន");
    }
}

function showNextPreview() {
    if (currentIdx < bgFiles.length - 1) {
        currentIdx++;
        loadCurrentImg();
    }
}

function showPreviousPreview() {
    if (currentIdx > 0) {
        currentIdx--;
        loadCurrentImg();
    }
}

document.getElementById('nextZone').onclick = showNextPreview;

document.getElementById('prevZone').onclick = showPreviousPreview;

function handleNavZoneKeydown(event, action) {
    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }

    event.preventDefault();
    action();
}

document.getElementById('nextZone').addEventListener('keydown', (event) => {
    handleNavZoneKeydown(event, showNextPreview);
});

document.getElementById('prevZone').addEventListener('keydown', (event) => {
    handleNavZoneKeydown(event, showPreviousPreview);
});

function isTextEntryTarget(element) {
    if (!element) {
        return false;
    }

    const tagName = element.tagName ? element.tagName.toLowerCase() : "";
    const inputType = element.type ? element.type.toLowerCase() : "";
    const textInputTypes = new Set([
        "email",
        "number",
        "password",
        "search",
        "tel",
        "text",
        "url"
    ]);

    return (
        element.isContentEditable ||
        tagName === "textarea" ||
        tagName === "select" ||
        (tagName === "input" && textInputTypes.has(inputType))
    );
}

document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
    }

    const key = event.key.toLowerCase();
    const isHorizontalArrow = key === "arrowright" || key === "arrowleft";

    if (isTextEntryTarget(document.activeElement) || (isHorizontalArrow && document.activeElement && document.activeElement.tagName === "INPUT")) {
        return;
    }

    if (key === "arrowright" || key === "d") {
        event.preventDefault();
        showNextPreview();
    } else if (key === "arrowleft" || key === "a") {
        event.preventDefault();
        showPreviousPreview();
    }
}, true);
